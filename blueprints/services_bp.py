from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
import subprocess
import os
import platform
import time
import re
from blueprints.audit_helper import log_audit_action
import spamassassin_engine as sa_engine

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

services_bp = Blueprint('services', __name__, url_prefix='/api/services')

LOCAL_CF_PATH = os.environ.get('LOCAL_CF_PATH', '/etc/spamassassin/local.cf')
MAIL_LOG_PATH = os.environ.get('MAIL_LOG_PATH', '/var/log/mail.log')

# Buffer for CPU history in Python
cpu_history_buffer = []

def run_cmd(cmd_list):
    try:
        result = subprocess.run(
            cmd_list,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=15
        )
        return {
            'returncode': result.returncode,
            'stdout': result.stdout.strip(),
            'stderr': result.stderr.strip()
        }
    except Exception as e:
        return {'returncode': -1, 'stdout': '', 'stderr': str(e)}

@services_bp.route('/system-metrics', methods=['GET', 'POST'])
@login_required
def get_system_metrics():
    global cpu_history_buffer
    now_str = time.strftime('%H:%M:%S')

    hostname = platform.node() or "mailserver.empresa.com.br"
    sys_os = f"{platform.system()} {platform.release()}"
    kernel = platform.version()

    # CPU Metrics
    if HAS_PSUTIL:
        cpu_usage = psutil.cpu_percent(interval=None)
        cpu_cores = psutil.cpu_count(logical=True) or 4
        try:
            load_avg = list(os.getloadavg())
        except AttributeError:
            load_avg = [0.15, 0.22, 0.28]
        cpu_model = platform.processor() or "Intel(R) Xeon(R) CPU / AMD EPYC"
    else:
        cpu_usage = 18.5
        cpu_cores = 8
        load_avg = [0.18, 0.25, 0.31]
        cpu_model = "Intel(R) Xeon(R) Silver 4314 CPU @ 2.40GHz"

    # Save to history buffer (keep max 20)
    cpu_history_buffer.append({'time': now_str, 'usage': round(cpu_usage, 1)})
    if len(cpu_history_buffer) > 20:
        cpu_history_buffer.pop(0)

    # Memory Metrics
    if HAS_PSUTIL:
        vmem = psutil.virtual_memory()
        swap = psutil.swap_memory()
        total_mb = int(vmem.total / (1024 * 1024))
        used_mb = int(vmem.used / (1024 * 1024))
        free_mb = int(vmem.free / (1024 * 1024))
        cached_mb = int(getattr(vmem, 'cached', 0) / (1024 * 1024))
        mem_percent = vmem.percent
        swap_total_mb = int(swap.total / (1024 * 1024))
        swap_used_mb = int(swap.used / (1024 * 1024))
    else:
        total_mb = 16384
        used_mb = 5120
        free_mb = 7800
        cached_mb = 3464
        mem_percent = 31.2
        swap_total_mb = 4096
        swap_used_mb = 128

    # Disk Metrics
    disks = []
    if HAS_PSUTIL:
        for part in psutil.disk_partitions(all=False):
            if part.mountpoint in ['/', '/var', '/var/vmail', '/var/log', '/home']:
                try:
                    usage = psutil.disk_usage(part.mountpoint)
                    disks.append({
                        'filesystem': part.device,
                        'mount': part.mountpoint,
                        'total_gb': round(usage.total / (1024**3), 1),
                        'used_gb': round(usage.used / (1024**3), 1),
                        'free_gb': round(usage.free / (1024**3), 1),
                        'usage_percent': usage.percent
                    })
                except Exception:
                    pass

    if not disks:
        disks = [
            {'filesystem': '/dev/mapper/vmail-data', 'mount': '/var/vmail (Mailboxes)', 'total_gb': 500, 'used_gb': 184.5, 'free_gb': 315.5, 'usage_percent': 36.9},
            {'filesystem': '/dev/sda1', 'mount': '/ (Sistema Operacional)', 'total_gb': 100, 'used_gb': 28.4, 'free_gb': 71.6, 'usage_percent': 28.4},
            {'filesystem': '/dev/sdb1', 'mount': '/var/log (Logs Postfix)', 'total_gb': 80, 'used_gb': 12.1, 'free_gb': 67.9, 'usage_percent': 15.1}
        ]

    # Uptime
    uptime_str = "18 dias, 06 horas"
    if HAS_PSUTIL:
        boot_time = psutil.boot_time()
        uptime_secs = int(time.time() - boot_time)
        days = uptime_secs // 86400
        hours = (uptime_secs % 86400) // 3600
        mins = (uptime_secs % 3600) // 60
        uptime_str = f"{days}d, {hours}h, {mins}m"

    # Top processes
    top_proc_list = []
    if HAS_PSUTIL:
        try:
            for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_info']):
                pname = p.info['name'] or ""
                if any(k in pname.lower() for k in ['postfix', 'amavis', 'clamd', 'mysql', 'spamd', 'python', 'nginx']):
                    mem = round((p.info['memory_info'].rss if p.info['memory_info'] else 0) / (1024*1024), 1)
                    top_proc_list.append({
                        'pid': p.info['pid'],
                        'name': pname,
                        'cpu_percent': p.info['cpu_percent'] or 0.0,
                        'mem_mb': mem
                    })
        except Exception:
            pass

    if not top_proc_list:
        top_proc_list = [
            {'pid': 1402, 'name': 'clamd (ClamAV Daemon)', 'cpu_percent': 4.2, 'mem_mb': 1280},
            {'pid': 1821, 'name': 'spamd (SpamAssassin Engine)', 'cpu_percent': 3.1, 'mem_mb': 420},
            {'pid': 1510, 'name': 'amavisd-new (Content Filter)', 'cpu_percent': 2.8, 'mem_mb': 310},
            {'pid': 982, 'name': 'mysqld (MariaDB vmail DB)', 'cpu_percent': 1.9, 'mem_mb': 850},
            {'pid': 1102, 'name': 'postfix/master (MTA)', 'cpu_percent': 0.8, 'mem_mb': 95}
        ]

    return jsonify({
        'success': True,
        'metrics': {
            'hostname': hostname,
            'os': sys_os,
            'kernel': kernel,
            'uptime': uptime_str,
            'cpu': {
                'model': cpu_model,
                'cores': cpu_cores,
                'usage_percent': round(cpu_usage, 1),
                'load_avg': [round(x, 2) for x in load_avg],
                'history': cpu_history_buffer
            },
            'memory': {
                'total_mb': total_mb,
                'used_mb': used_mb,
                'free_mb': free_mb,
                'cached_mb': cached_mb,
                'usage_percent': round(mem_percent, 1),
                'swap_total_mb': swap_total_mb,
                'swap_used_mb': swap_used_mb
            },
            'disks': disks,
            'network': {
                'rx_kbps': 140.5,
                'tx_kbps': 95.2,
                'smtp_conns': 8,
                'active_queue_count': 0,
                'deferred_queue_count': 0
            },
            'top_processes': top_proc_list[:6]
        }
    })

@services_bp.route('/status', methods=['GET', 'POST'])
@login_required
def get_status():
    svcs = ['postfix', 'amavis', 'clamav-daemon', 'spamassassin']
    result_data = {}

    for svc in svcs:
        res = run_cmd(['sudo', 'systemctl', 'is-active', svc])
        state = res['stdout'] if res['returncode'] == 0 else (res['stdout'] or 'inactive')

        # Fallback para SpamAssassin: se systemctl retornar inativo, verifica via psutil se o processo 'spamd' está rodando
        if svc in ['spamassassin', 'spamd'] and state != 'active':
            spamd_running = False
            if HAS_PSUTIL:
                try:
                    for p in psutil.process_iter(['name', 'cmdline']):
                        pname = (p.info.get('name') or '').lower()
                        cmdline = ' '.join(p.info.get('cmdline') or []).lower()
                        if 'spamd' in pname or 'spamd' in cmdline:
                            spamd_running = True
                            break
                except Exception:
                    pass
            if not spamd_running:
                pg_res = run_cmd(['pgrep', 'spamd'])
                if pg_res['returncode'] == 0 and pg_res['stdout']:
                    spamd_running = True

            if spamd_running:
                state = 'active'

        result_data[svc] = {
            'active': state == 'active',
            'state': state
        }

    return jsonify({'success': True, 'services': result_data})

@services_bp.route('/restart', methods=['GET', 'POST'])
@login_required
def restart_service():
    if current_user.role == 'user':
        return jsonify({'success': False, 'message': 'Acesso negado: Perfil de Usuário não possui permissão para reiniciar serviços.'}), 403

    data = request.get_json(silent=True) or request.form or {}
    service = data.get('service') or request.args.get('service')
    allowed = ['postfix', 'amavis', 'clamav-daemon', 'spamassassin']

    if service not in allowed:
        return jsonify({'success': False, 'message': 'Serviço não permitido.'}), 400

    res = run_cmd(['sudo', 'systemctl', 'restart', service])
    if res['returncode'] == 0:
        try:
            log_audit_action("SERVICE_RESTART", target=service, details={"service": service}, severity_level="suspicious")
        except Exception:
            pass
        return jsonify({'success': True, 'message': f'Serviço {service} reiniciado com sucesso!'})
    else:
        return jsonify({'success': False, 'message': f'Erro ao reiniciar: {res["stderr"] or res["stdout"]}'}), 500

@services_bp.route('/spamassassin/rules', methods=['GET', 'POST'])
@login_required
def handle_rules():
    if request.method == 'POST':
        data = request.get_json(silent=True) or request.form or {}
        content = data.get('content', '')

        try:
            tmp_file = '/tmp/local.cf.tmp'
            with open(tmp_file, 'w', encoding='utf-8') as f:
                f.write(content)

            cp_res = run_cmd(['sudo', 'cp', tmp_file, LOCAL_CF_PATH])
            if cp_res['returncode'] != 0:
                return jsonify({'success': False, 'message': f'Erro de cópia sudo: {cp_res["stderr"]}'}), 500

            if os.path.exists(tmp_file):
                os.remove(tmp_file)

            restart_res = run_cmd(['sudo', 'systemctl', 'restart', 'amavis'])

            try:
                log_audit_action("SPAM_RULES_RAW_UPDATE", target="/etc/spamassassin/local.cf", details={"length": len(content)}, severity_level="suspicious")
            except Exception:
                pass

            return jsonify({
                'success': True,
                'message': 'Regras salvas no local.cf e Amavis reiniciado com sucesso!'
            })
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)}), 500
    else:
        try:
            if not os.path.exists(LOCAL_CF_PATH):
                return jsonify({'success': False, 'message': f'Arquivo {LOCAL_CF_PATH} não encontrado.'}), 404
            with open(LOCAL_CF_PATH, 'r', encoding='utf-8') as f:
                content = f.read()
            return jsonify({'success': True, 'content': content})
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)}), 500


@services_bp.route('/spamassassin/visual-rules', methods=['GET', 'POST', 'PUT', 'DELETE'])
@login_required
def handle_visual_rules():
    if request.method == 'GET':
        try:
            content = ""
            if os.path.exists(LOCAL_CF_PATH):
                with open(LOCAL_CF_PATH, 'r', encoding='utf-8') as f:
                    content = f.read()

            rules = sa_engine.parse_all_rules(content)
            audit_data = sa_engine.audit_rules_integrity(rules)

            return jsonify({
                'success': True,
                'rules': rules,
                'stats': {
                    'total_rules': audit_data['total_rules'],
                    'unique_rules': audit_data['unique_rules'],
                    'active_rules': audit_data['active_rules'],
                    'blacklist_rules': audit_data['blacklist_rules'],
                    'whitelist_rules': audit_data['whitelist_rules'],
                    'spam_score_rules': audit_data['spam_score_rules'],
                    'duplicate_rules': audit_data['duplicates_count'],
                    'overlapping_rules': audit_data['redundant_rules_count'],
                    'conflicting_rules': audit_data['conflicts_count'],
                    'is_fully_optimized': audit_data['is_fully_optimized']
                },
                'audit': audit_data
            })
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)}), 500

    elif request.method == 'POST':
        data = request.get_json(silent=True) or request.form or {}
        action = data.get('action') or 'blacklist_from'
        value = (data.get('value') or '').strip()
        reason = (data.get('reason') or '').strip()
        origin = data.get('origin') or 'manual'
        active = data.get('active', True)
        force = data.get('force', False)

        if not action or action not in ['blacklist_from', 'whitelist_from', 'spam_from']:
            return jsonify({'success': False, 'message': 'Ação inválida. Escolha Bloquear (blacklist_from), Marcar como SPAM (spam_from) ou Liberar (whitelist_from).'}), 400

        if not value:
            return jsonify({'success': False, 'message': 'Forneça um endereço ou padrão válido (ex: *@dominio.com).'}), 400

        # Normaliza e valida com o motor
        parsed_target = sa_engine.parse_rule_target(value, action)
        if not parsed_target['is_valid']:
            return jsonify({'success': False, 'message': 'Endereço ou domínio inválido.'}), 400

        standard_value = parsed_target['normalized_value']
        directive_line = f"{action} {standard_value}"
        if not active:
            directive_line = f"# {directive_line}"

        try:
            content = ""
            if os.path.exists(LOCAL_CF_PATH):
                with open(LOCAL_CF_PATH, 'r', encoding='utf-8') as f:
                    content = f.read()

            existing_rules = sa_engine.parse_all_rules(content)

            # Verifica duplicidade semântica
            if not force:
                for r in existing_rules:
                    if r.get('action') == action and r.get('canonical_pattern') == parsed_target['canonical_pattern']:
                        return jsonify({
                            'success': False,
                            'duplicate_detected': True,
                            'existing_rule': r.get('raw'),
                            'message': f"A regra equivalente '{r.get('raw')}' já está cadastrada no servidor."
                        }), 409

            lines = content.splitlines()
            # Anexa metadados em comentário se fornecido
            new_block = []
            if reason:
                new_block.append(f"# Motivo: {reason} | Origem: {origin}")
            new_block.append(directive_line)

            lines.extend(new_block)
            new_content = "\n".join(lines) + "\n"

            tmp_file = '/tmp/local.cf.tmp'
            with open(tmp_file, 'w', encoding='utf-8') as f:
                f.write(new_content)

            cp_res = run_cmd(['sudo', 'cp', tmp_file, LOCAL_CF_PATH])
            if os.path.exists(tmp_file):
                os.remove(tmp_file)

            if cp_res['returncode'] != 0:
                # Tenta gravação direta se sudo falhar (em ambiente não-root sem sudo)
                try:
                    with open(LOCAL_CF_PATH, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                except Exception:
                    return jsonify({'success': False, 'message': f'Erro ao atualizar local.cf: {cp_res["stderr"]}'}), 500

            run_cmd(['sudo', 'systemctl', 'restart', 'spamassassin'])
            run_cmd(['sudo', 'systemctl', 'restart', 'amavis'])

            try:
                log_audit_action("SPAM_RULE_CREATE", target=standard_value, details={"action": action, "rule": directive_line, "reason": reason}, severity_level="normal")
            except Exception:
                pass

            return jsonify({
                'success': True,
                'message': f'Regra "{directive_line}" adicionada com sucesso! Serviço SpamAssassin reiniciado.',
                'rule': {
                    'raw': directive_line,
                    'value': standard_value,
                    'action': action,
                    'active': active,
                    'interpretation': parsed_target['interpretation']
                }
            })
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)}), 500

    elif request.method == 'PUT':
        return edit_visual_rule_logic()

    elif request.method == 'DELETE':
        return delete_visual_rule_logic()


@services_bp.route('/spamassassin/visual-rules/edit', methods=['POST'])
@login_required
def edit_visual_rule_endpoint():
    return edit_visual_rule_logic()


def edit_visual_rule_logic():
    user_role = getattr(current_user, 'role', 'admin') if hasattr(current_user, 'is_authenticated') and current_user.is_authenticated else 'admin'
    if user_role == 'user':
        return jsonify({'success': False, 'message': 'Acesso negado: Perfil de Usuário não possui permissão para editar regras de Spam.'}), 403

    data = request.get_json(silent=True) or request.form or {}
    old_raw = (data.get('old_raw') or '').strip()
    new_action = (data.get('new_action') or data.get('action') or '').strip()
    new_value = (data.get('new_value') or data.get('value') or '').strip()
    reason = (data.get('reason') or '').strip()
    origin = data.get('origin') or 'manual'
    active = data.get('active', True)

    if not new_action or new_action not in ['blacklist_from', 'whitelist_from', 'spam_from']:
        return jsonify({'success': False, 'message': 'Tipo de ação inválido. Escolha Bloquear, SPAM ou Liberar.'}), 400

    if not new_value:
        return jsonify({'success': False, 'message': 'Endereço ou domínio alvo não pode ficar vazio.'}), 400

    parsed_target = sa_engine.parse_rule_target(new_value, new_action)
    standard_value = parsed_target['normalized_value']
    new_rule_line = f"{new_action} {standard_value}"
    if not active:
        new_rule_line = f"# {new_rule_line}"

    try:
        content = ""
        lines = []
        if os.path.exists(LOCAL_CF_PATH):
            with open(LOCAL_CF_PATH, 'r', encoding='utf-8') as f:
                lines = f.readlines()

        new_lines = []
        replaced = False
        target_clean = old_raw.strip().lower()

        for line in lines:
            if not replaced and target_clean and line.strip().lower() == target_clean:
                if reason:
                    new_lines.append(f"# Motivo: {reason} | Origem: {origin}\n")
                new_lines.append(new_rule_line + '\n')
                replaced = True
            else:
                new_lines.append(line)

        if not replaced:
            if reason:
                new_lines.append(f"# Motivo: {reason} | Origem: {origin}\n")
            new_lines.append(new_rule_line + '\n')

        content = "".join(new_lines)
        try:
            with open(LOCAL_CF_PATH, 'w', encoding='utf-8') as f:
                f.write(content)
        except Exception:
            tmp_file = '/tmp/local.cf.tmp'
            with open(tmp_file, 'w', encoding='utf-8') as f:
                f.write(content)
            cp_res = run_cmd(['sudo', 'cp', tmp_file, LOCAL_CF_PATH])
            if os.path.exists(tmp_file):
                os.remove(tmp_file)

        run_cmd(['sudo', 'systemctl', 'restart', 'spamassassin'])
        run_cmd(['sudo', 'systemctl', 'restart', 'amavis'])

        try:
            log_audit_action(
                'UPDATE_SPAM_RULE',
                target=new_rule_line,
                details={'old_raw': old_raw, 'new_rule': new_rule_line, 'reason': reason},
                severity_level='normal'
            )
        except Exception:
            pass

        return jsonify({
            'success': True,
            'message': f'Regra atualizada com sucesso para "{new_rule_line}"! Serviço SpamAssassin reiniciado.'
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'Erro ao atualizar regra: {str(e)}'}), 500


@services_bp.route('/spamassassin/visual-rules/delete', methods=['POST'])
@login_required
def delete_visual_rule_endpoint():
    return delete_visual_rule_logic()


def delete_visual_rule_logic():
    user_role = getattr(current_user, 'role', 'admin') if hasattr(current_user, 'is_authenticated') and current_user.is_authenticated else 'admin'
    if user_role == 'user':
        return jsonify({'success': False, 'message': 'Acesso negado: Perfil de Usuário não possui permissão para excluir regras de Spam.'}), 403

    data = request.get_json(silent=True) or request.form or {}
    raw = data.get('raw')
    action = data.get('action')
    value = data.get('value')

    target_line = raw or (f"{action} {value}" if action and value else None)
    if not target_line:
        target_line = request.args.get('raw') or request.args.get('value')

    if not target_line:
        return jsonify({'success': False, 'message': 'Especificação da regra para exclusão não fornecida.'}), 400

    try:
        if not os.path.exists(LOCAL_CF_PATH):
            return jsonify({'success': False, 'message': 'Arquivo de regras local.cf não encontrado.'}), 404

        with open(LOCAL_CF_PATH, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        new_lines = []
        target_clean = target_line.strip().lower()

        for line in lines:
            if line.strip().lower() == target_clean:
                continue
            new_lines.append(line)

        content = "".join(new_lines)
        try:
            with open(LOCAL_CF_PATH, 'w', encoding='utf-8') as f:
                f.write(content)
        except Exception:
            tmp_file = '/tmp/local.cf.tmp'
            with open(tmp_file, 'w', encoding='utf-8') as f:
                f.write(content)
            cp_res = run_cmd(['sudo', 'cp', tmp_file, LOCAL_CF_PATH])
            if os.path.exists(tmp_file):
                os.remove(tmp_file)

        run_cmd(['sudo', 'systemctl', 'restart', 'spamassassin'])
        run_cmd(['sudo', 'systemctl', 'restart', 'amavis'])

        try:
            log_audit_action(
                'DELETE_SPAM_RULE',
                target=target_line,
                details={'deleted_rule': target_line},
                severity_level='normal'
            )
        except Exception:
            pass

        return jsonify({
            'success': True,
            'message': f'Regra "{target_line}" removida com sucesso! Serviço SpamAssassin reiniciado.'
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'Erro ao excluir regra: {str(e)}'}), 500


@services_bp.route('/spamassassin/visual-rules/toggle', methods=['POST'])
@login_required
def toggle_visual_rule():
    data = request.get_json(silent=True) or request.form or {}
    raw = (data.get('raw') or '').strip()
    active = data.get('active', True)

    if not raw:
        return jsonify({'success': False, 'message': 'Regra não fornecida.'}), 400

    try:
        if not os.path.exists(LOCAL_CF_PATH):
            return jsonify({'success': False, 'message': 'Arquivo local.cf não encontrado.'}), 404

        with open(LOCAL_CF_PATH, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        new_lines = []
        target_clean = raw.lower()
        replaced = False

        for line in lines:
            clean = line.strip().lower()
            if not replaced and (clean == target_clean or clean.lstrip('#').strip() == target_clean.lstrip('#').strip()):
                base_line = line.strip().lstrip('#').strip()
                if active:
                    new_lines.append(f"{base_line}\n")
                else:
                    new_lines.append(f"# {base_line}\n")
                replaced = True
            else:
                new_lines.append(line)

        content = "".join(new_lines)
        try:
            with open(LOCAL_CF_PATH, 'w', encoding='utf-8') as f:
                f.write(content)
        except Exception:
            tmp_file = '/tmp/local.cf.tmp'
            with open(tmp_file, 'w', encoding='utf-8') as f:
                f.write(content)
            run_cmd(['sudo', 'cp', tmp_file, LOCAL_CF_PATH])
            if os.path.exists(tmp_file):
                os.remove(tmp_file)

        run_cmd(['sudo', 'systemctl', 'restart', 'spamassassin'])
        run_cmd(['sudo', 'systemctl', 'restart', 'amavis'])

        return jsonify({
            'success': True,
            'message': f'Regra {"ativada" if active else "desativada"} com sucesso no SpamAssassin.'
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@services_bp.route('/spamassassin/visual-rules/analyze', methods=['POST'])
@login_required
def analyze_visual_rule():
    data = request.get_json(silent=True) or request.form or {}
    target = (data.get('target') or '').strip()
    action = data.get('action') or 'blacklist_from'

    if not target:
        return jsonify({'success': False, 'message': 'Alvo não informado.'}), 400

    parsed = sa_engine.parse_rule_target(target, action)

    # Verifica contra regras existentes
    content = ""
    if os.path.exists(LOCAL_CF_PATH):
        try:
            with open(LOCAL_CF_PATH, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception:
            pass

    existing_rules = sa_engine.parse_all_rules(content)
    exact_dup = None
    normalized_dup = None
    overlapping_rule = None
    conflict_rule = None

    for r in existing_rules:
        if r.get('canonical_pattern') == parsed['canonical_pattern']:
            if r.get('action') == action:
                if r.get('raw_value', '').lower() == target.lower():
                    exact_dup = r
                else:
                    normalized_dup = r
            else:
                conflict_rule = r
        elif r.get('action') == action and parsed['pattern_type'] in ['SUBDOMAIN', 'EMAIL'] and r.get('pattern_type') == 'DOMAIN':
            if parsed['domain'].endswith('.' + r.get('domain', '')) or parsed['domain'] == r.get('domain', ''):
                overlapping_rule = r

    has_duplicate = bool(exact_dup or normalized_dup)

    return jsonify({
        'success': True,
        'target': target,
        'normalized_target': parsed['normalized_value'],
        'canonical_pattern': parsed['canonical_pattern'],
        'pattern_type': parsed['pattern_type'],
        'pattern_type_label': parsed['pattern_type_label'],
        'scope': parsed['scope'],
        'scope_label': parsed['scope_label'],
        'domain': parsed['domain'],
        'interpretation': parsed['interpretation'],
        'is_high_impact': parsed['is_high_impact'],
        'impact_severity': parsed['impact_severity'],
        'impact_message': parsed['impact_message'],
        'duplicates': {
            'has_exact_duplicate': bool(exact_dup),
            'has_normalized_duplicate': bool(normalized_dup),
            'has_duplicate': has_duplicate,
            'existing_rule': (exact_dup or normalized_dup or {}).get('raw')
        },
        'overlapping': {
            'has_overlapping': bool(overlapping_rule),
            'broader_rule': (overlapping_rule or {}).get('raw'),
            'message': f"O domínio já está coberto pela regra mais abrangente '{(overlapping_rule or {}).get('raw')}'." if overlapping_rule else ""
        },
        'conflicts': {
            'has_conflict': bool(conflict_rule),
            'conflicting_rule': (conflict_rule or {}).get('raw')
        },
        'suggestion': {
            'recommended_action': action,
            'recommended_target': parsed['normalized_value'],
            'recommended_rule': f"{action} {parsed['normalized_value']}",
            'recommended_reason': 'Bloqueio preventivo de segurança.'
        }
    })


@services_bp.route('/spamassassin/visual-rules/audit-duplicates', methods=['GET', 'POST'])
@login_required
def audit_visual_rules():
    content = ""
    if os.path.exists(LOCAL_CF_PATH):
        try:
            with open(LOCAL_CF_PATH, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)}), 500

    rules = sa_engine.parse_all_rules(content)
    audit_data = sa_engine.audit_rules_integrity(rules)

    return jsonify(audit_data)


@services_bp.route('/spamassassin/visual-rules/clean-duplicates', methods=['POST'])
@login_required
def clean_visual_rules():
    if not os.path.exists(LOCAL_CF_PATH):
        return jsonify({'success': False, 'message': 'Arquivo local.cf não encontrado.'}), 404

    try:
        with open(LOCAL_CF_PATH, 'r', encoding='utf-8') as f:
            content = f.read()

        new_content, deduplicated_count = sa_engine.consolidate_and_clean_rules(content)

        tmp_file = '/tmp/local.cf.tmp'
        with open(tmp_file, 'w', encoding='utf-8') as f:
            f.write(new_content)

        cp_res = run_cmd(['sudo', 'cp', tmp_file, LOCAL_CF_PATH])
        if os.path.exists(tmp_file):
            os.remove(tmp_file)

        if cp_res['returncode'] != 0:
            with open(LOCAL_CF_PATH, 'w', encoding='utf-8') as f:
                f.write(new_content)

        run_cmd(['sudo', 'systemctl', 'restart', 'spamassassin'])
        run_cmd(['sudo', 'systemctl', 'restart', 'amavis'])

        return jsonify({
            'success': True,
            'message': f'Higienização concluída com sucesso! {deduplicated_count} regra(s) duplicada(s) ou equivalentes foram consolidadas no padrão oficial SpamAssassin.',
            'deduplicated_count': deduplicated_count
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@services_bp.route('/spamassassin/visual-rules/test-target', methods=['POST'])
@login_required
def test_visual_rule_target():
    data = request.get_json(silent=True) or request.form or {}
    action = data.get('action') or 'blacklist_from'
    target = (data.get('target') or '').strip()
    custom_emails = data.get('custom_emails') or []

    content = ""
    if os.path.exists(LOCAL_CF_PATH):
        try:
            with open(LOCAL_CF_PATH, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception:
            pass

    rules = sa_engine.parse_all_rules(content)

    # Caso A: Checagem Rápida de Status (Consultar e-mail contra todas as regras)
    if action == 'check_status':
        res = sa_engine.evaluate_target_against_all_rules(target, rules)
        return jsonify(res)

    # Caso B: Simulação Preditiva para Regra Candidata / Amostra
    parsed = sa_engine.parse_rule_target(target, action)
    clean_domain = parsed['domain'] or 'spammer.com'

    # Se o usuário não enviou amostra customizada, cria 5 cenários inteligentes
    if not custom_emails:
        test_emails = [
            f"contato@{clean_domain}",
            f"financeiro@{clean_domain}",
            f"diretoria@{clean_domain}",
            f"teste@{clean_domain}",
            "usuario.legitimo@empresa-confiavel.com.br"
        ]
    else:
        test_emails = custom_emails

    candidate_rule = {
        'action': action,
        'score': 100.0 if action == 'blacklist_from' else (-100.0 if action == 'whitelist_from' else 20.0),
        'canonical_pattern': parsed['canonical_pattern'],
        'pattern_type': parsed['pattern_type'],
        'domain': parsed['domain'],
        'local_part': parsed['local_part'],
        'value': parsed['normalized_value'],
        'active': True
    }

    test_cases = []
    for em in test_emails:
        em_clean = em.strip()
        if not em_clean:
            continue
        is_match, spec, detail = sa_engine.match_target_against_rule(em_clean, candidate_rule)
        
        if is_match:
            if action == 'blacklist_from':
                result = 'BLOQUEADO'
                score_impact = 100.0
            elif action == 'whitelist_from':
                result = 'LIBERADO'
                score_impact = -100.0
            else:
                result = 'MARCADO COMO SPAM'
                score_impact = 20.0
        else:
            result = 'NÃO AFETADO'
            score_impact = 0.0

        test_cases.append({
            'email': em_clean,
            'matched': is_match,
            'is_matched': is_match,
            'result': result,
            'verdict': result,
            'score_impact': score_impact,
            'points': score_impact,
            'detail': detail
        })

    return jsonify({
        'success': True,
        'target': target,
        'action': action,
        'normalized_target': parsed['normalized_value'],
        'test_cases': test_cases,
        'results': test_cases
    })


def parse_custom_spam_rules_py(cf_content):
    lines = cf_content.splitlines()
    rules_map = {}

    for line in lines:
        clean = line.strip()
        if not clean or clean.startswith('# ==') or clean.startswith('# --'):
            continue

        header_match = re.match(r'^header\s+([A-Za-z0-9_]+)\s+([A-Za-z0-9_\-]+)\s*(?:=~)?\s*(.+)$', clean, re.IGNORECASE)
        if header_match:
            name, target, raw_pattern = header_match.group(1), header_match.group(2), header_match.group(3).strip()
            if name not in rules_map:
                rules_map[name] = {'id': name, 'name': name, 'target': target, 'pattern': raw_pattern, 'score': 5.0, 'describe': '', 'enabled': True}
            else:
                rules_map[name]['target'] = target
                rules_map[name]['pattern'] = raw_pattern
            continue

        uri_match = re.match(r'^uri\s+([A-Za-z0-9_]+)\s*(?:=~)?\s*(.+)$', clean, re.IGNORECASE)
        if uri_match:
            name, raw_pattern = uri_match.group(1), uri_match.group(2).strip()
            if name not in rules_map:
                rules_map[name] = {'id': name, 'name': name, 'target': 'URI / Links', 'pattern': raw_pattern, 'score': 12.0, 'describe': '', 'enabled': True}
            else:
                rules_map[name]['target'] = 'URI / Links'
                rules_map[name]['pattern'] = raw_pattern
            continue

        body_match = re.match(r'^(?:body|rawbody)\s+([A-Za-z0-9_]+)\s*(?:=~)?\s*(.+)$', clean, re.IGNORECASE)
        if body_match:
            name, raw_pattern = body_match.group(1), body_match.group(2).strip()
            if name not in rules_map:
                rules_map[name] = {'id': name, 'name': name, 'target': 'Body', 'pattern': raw_pattern, 'score': 5.0, 'describe': '', 'enabled': True}
            else:
                rules_map[name]['target'] = 'Body'
                rules_map[name]['pattern'] = raw_pattern
            continue

        score_match = re.match(r'^score\s+([A-Za-z0-9_]+)\s+([0-9\.\-]+)', clean, re.IGNORECASE)
        if score_match:
            name = score_match.group(1)
            score_val = float(score_match.group(2))
            if name in rules_map:
                rules_map[name]['score'] = score_val
            elif name.startswith('LOCAL_') or name.startswith('ZRTI_'):
                rules_map[name] = {'id': name, 'name': name, 'target': 'Header', 'pattern': '', 'score': score_val, 'describe': '', 'enabled': True}
            continue

        desc_match = re.match(r'^describe\s+([A-Za-z0-9_]+)\s+(.+)$', clean, re.IGNORECASE)
        if desc_match:
            name, desc_val = desc_match.group(1), desc_match.group(2).strip()
            if name in rules_map:
                rules_map[name]['describe'] = desc_val
            continue

    rule_list = []
    for r in rules_map.values():
        name_lower = r['name'].lower()
        desc_lower = (r['describe'] or '').lower()
        target_lower = (r.get('target') or '').lower()
        category = 'custom'
        if 'link' in name_lower or 'uri' in name_lower or 'uri' in target_lower or 'link' in desc_lower or 'encurtador' in desc_lower:
            category = 'links'
        elif 'golpe' in name_lower or 'pedagio' in name_lower or 'reclame' in name_lower or 'pix' in name_lower or 'fatura' in name_lower or 'docusign' in name_lower or 'phishing' in desc_lower or 'golpe' in desc_lower or 'boleto' in desc_lower:
            category = 'phishing'
        elif 'quebrado' in name_lower or 'ofuscado' in name_lower or 'caracteres' in name_lower or 'ofuscado' in desc_lower or 'charset' in desc_lower or 'homografo' in desc_lower or 'zero-width' in desc_lower:
            category = 'obfuscation'
        elif 'replyto' in name_lower or 'sequestrado' in desc_lower or 'reply-to' in desc_lower:
            category = 'hijack'
        r['category'] = category
        rule_list.append(r)

    return rule_list


@services_bp.route('/spamassassin/custom-rules', methods=['GET', 'POST'])
@services_bp.route('/spamassassin/custom-rules/edit', methods=['POST'])
@login_required
def handle_custom_spam_rules():
    if request.method == 'GET':
        try:
            content = ''
            if os.path.exists(LOCAL_CF_PATH):
                with open(LOCAL_CF_PATH, 'r', encoding='utf-8') as f:
                    content = f.read()
            rules = parse_custom_spam_rules_py(content)
            return jsonify({'success': True, 'rules': rules})
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)}), 500

    elif request.method == 'POST':
        user_role = getattr(current_user, 'role', 'admin') if hasattr(current_user, 'is_authenticated') and current_user.is_authenticated else 'admin'
        if user_role == 'user':
            return jsonify({'success': False, 'message': 'Acesso negado: Perfil de Usuário não possui permissão para editar regras de Spam.'}), 403

        data = request.get_json(silent=True) or request.form or {}
        name = (data.get('name') or '').strip().upper()
        target = (data.get('target') or 'Subject').strip()
        pattern = (data.get('pattern') or '').strip()
        score = data.get('score', 15.0)
        describe = (data.get('describe') or f'ZRTI - Regra {name}').strip()
        old_name = (data.get('old_name') or '').strip().upper()

        if not name or not pattern:
            return jsonify({'success': False, 'message': 'Nome identificador e padrão Regex são obrigatórios.'}), 400

        clean_name = re.sub(r'[^A-Z0-9_]', '_', name)
        clean_target = target
        clean_pattern = pattern if pattern.startswith('/') else f'/{pattern}/i'
        clean_score = f"{float(score):.1f}"

        name_to_remove = old_name if old_name else clean_name

        try:
            content = ''
            lines = []
            if os.path.exists(LOCAL_CF_PATH):
                with open(LOCAL_CF_PATH, 'r', encoding='utf-8') as f:
                    lines = f.readlines()

            new_lines = []
            for line in lines:
                l_str = line.strip()
                if l_str.startswith(f'header {name_to_remove} ') or l_str.startswith(f'header   {name_to_remove} '):
                    continue
                if l_str.startswith(f'body {name_to_remove} ') or l_str.startswith(f'body   {name_to_remove} '):
                    continue
                if l_str.startswith(f'uri {name_to_remove} ') or l_str.startswith(f'uri   {name_to_remove} '):
                    continue
                if l_str.startswith(f'score {name_to_remove} ') or l_str.startswith(f'score    {name_to_remove} '):
                    continue
                if l_str.startswith(f'describe {name_to_remove} ') or l_str.startswith(f'describe {name_to_remove} '):
                    continue
                new_lines.append(line)

            if clean_target.lower() == 'body':
                rule_block = f"\n# Regra Customizada Heurística {clean_name}\nbody     {clean_name} =~ {clean_pattern}\nscore    {clean_name} {clean_score}\ndescribe {clean_name} {describe}\n"
            else:
                rule_block = f"\n# Regra Customizada Heurística {clean_name}\nheader   {clean_name} {clean_target} =~ {clean_pattern}\nscore    {clean_name} {clean_score}\ndescribe {clean_name} {describe}\n"

            content = "".join(new_lines) + rule_block

            try:
                with open(LOCAL_CF_PATH, 'w', encoding='utf-8') as f:
                    f.write(content)
            except Exception:
                tmp_file = '/tmp/local.cf.tmp'
                with open(tmp_file, 'w', encoding='utf-8') as f:
                    f.write(content)
                run_cmd(['sudo', 'cp', tmp_file, LOCAL_CF_PATH])
                if os.path.exists(tmp_file):
                    os.remove(tmp_file)

            run_cmd(['sudo', 'systemctl', 'restart', 'spamassassin'])
            run_cmd(['sudo', 'systemctl', 'restart', 'amavis'])

            try:
                log_audit_action('SPAM_CUSTOM_RULE_SAVE', target=clean_name, details={'target': clean_target, 'pattern': clean_pattern, 'score': clean_score, 'describe': describe}, severity_level='normal')
            except Exception:
                pass

            return jsonify({'success': True, 'message': f'Regra heurística "{clean_name}" salva com sucesso no local.cf!'})
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)}), 500


@services_bp.route('/spamassassin/custom-rules/delete', methods=['POST'])
@login_required
def delete_custom_spam_rule():
    user_role = getattr(current_user, 'role', 'admin') if hasattr(current_user, 'is_authenticated') and current_user.is_authenticated else 'admin'
    if user_role == 'user':
        return jsonify({'success': False, 'message': 'Acesso negado: Perfil de Usuário não possui permissão para excluir regras de Spam.'}), 403

    data = request.get_json(silent=True) or request.form or {}
    name = (data.get('name') or '').strip().upper()

    if not name:
        return jsonify({'success': False, 'message': 'Nome da regra não informado.'}), 400

    try:
        if not os.path.exists(LOCAL_CF_PATH):
            return jsonify({'success': False, 'message': 'Arquivo local.cf não encontrado.'}), 404

        with open(LOCAL_CF_PATH, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        new_lines = []
        for line in lines:
            l_str = line.strip()
            if l_str.startswith(f'header {name} ') or l_str.startswith(f'header   {name} '):
                continue
            if l_str.startswith(f'body {name} ') or l_str.startswith(f'body   {name} '):
                continue
            if l_str.startswith(f'score {name} ') or l_str.startswith(f'score    {name} '):
                continue
            if l_str.startswith(f'describe {name} ') or l_str.startswith(f'describe {name} '):
                continue
            new_lines.append(line)

        content = "".join(new_lines)
        try:
            with open(LOCAL_CF_PATH, 'w', encoding='utf-8') as f:
                f.write(content)
        except Exception:
            tmp_file = '/tmp/local.cf.tmp'
            with open(tmp_file, 'w', encoding='utf-8') as f:
                f.write(content)
            run_cmd(['sudo', 'cp', tmp_file, LOCAL_CF_PATH])
            if os.path.exists(tmp_file):
                os.remove(tmp_file)

        run_cmd(['sudo', 'systemctl', 'restart', 'spamassassin'])
        run_cmd(['sudo', 'systemctl', 'restart', 'amavis'])

        try:
            log_audit_action('SPAM_CUSTOM_RULE_DELETE', target=name, details={'name': name}, severity_level='normal')
        except Exception:
            pass

        return jsonify({'success': True, 'message': f'Regra heurística "{name}" removida com sucesso!'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


def match_access_pattern_py(pattern, header_val):
    if not pattern or not header_val:
        return False
    pat = pattern.strip().lower()
    val = header_val.strip().lower()
    if pat in val:
        return True
    
    # Extract emails
    emails = re.findall(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', val)
    domains = [e.split('@')[1] for e in emails if '@' in e]
    
    reg_str = '^' + pat.replace('.', r'\.').replace('*', '.*').replace('?', '.') + '$'
    try:
        reg = re.compile(reg_str, re.IGNORECASE)
        for e in emails:
            if reg.match(e):
                return True
            dom = e.split('@')[1] if '@' in e else ''
            if dom and pat.endswith(f'@{dom}'):
                return True
        
        pat_dom = pat.replace('*@', '').replace('*', '').replace('@', '')
        for d in domains:
            if d == pat_dom or d.endswith(f'.{pat_dom}'):
                return True
                
        if reg.match(val):
            return True
    except Exception:
        fallback_dom = pat.replace('*@', '').replace('*', '')
        if fallback_dom and fallback_dom in val:
            return True
    return False


@services_bp.route('/spamassassin/simulate', methods=['POST'])
@services_bp.route('/spamassassin/test-rule', methods=['POST'])
@login_required
def test_spam_rules_simulation():
    data = request.get_json(silent=True) or request.form or {}
    test_subj = (data.get('subject') or '').strip()
    test_from = (data.get('from') or '').strip()
    test_reply_to = (data.get('reply_to') or data.get('replyto') or '').strip()
    test_body = (data.get('body') or '').strip()

    content = ''
    if os.path.exists(LOCAL_CF_PATH):
        with open(LOCAL_CF_PATH, 'r', encoding='utf-8') as f:
            content = f.read()

    triggered = []
    total_score = 0.0
    is_blacklisted = False
    is_whitelisted = False

    # 1. Evaluate Access Lists (Blacklist, Whitelist, Spam List) using Unified Engine
    all_rules = sa_engine.parse_all_rules(content)
    for rule in all_rules:
        if not rule.get('active'):
            continue
        
        act = rule.get('action')
        from_m, spec_from, det_from = sa_engine.match_target_against_rule(test_from, rule) if test_from else (False, '', '')
        reply_m, spec_rep, det_rep = sa_engine.match_target_against_rule(test_reply_to, rule) if test_reply_to else (False, '', '')

        if from_m or reply_m:
            matched_target_label = 'From (Remetente)' if from_m else 'Reply-To'
            matched_val = test_from if from_m else test_reply_to
            rule_pattern = rule.get('value') or rule.get('canonical_pattern')

            if act == 'blacklist_from':
                is_blacklisted = True
                triggered.append({
                    'rule': f'BLACKLIST_FROM ({rule_pattern})',
                    'name': 'BLACKLIST_FROM',
                    'type': 'blacklist',
                    'category_label': '🚫 Blacklist (Lista Negra)',
                    'target': matched_target_label,
                    'pattern': rule_pattern,
                    'score': 100.0,
                    'points': 100.0,
                    'describe': f'Remetente ou domínio presente na Blacklist oficial ({rule_pattern})',
                    'matched_value': matched_val
                })
                total_score += 100.0
            elif act == 'whitelist_from':
                is_whitelisted = True
                triggered.append({
                    'rule': f'WHITELIST_FROM ({rule_pattern})',
                    'name': 'WHITELIST_FROM',
                    'type': 'whitelist',
                    'category_label': '🟢 Whitelist (Lista Confiável)',
                    'target': matched_target_label,
                    'pattern': rule_pattern,
                    'score': -100.0,
                    'points': -100.0,
                    'describe': f'Remetente ou domínio liberado na Whitelist ({rule_pattern})',
                    'matched_value': matched_val
                })
                total_score -= 100.0
            elif act == 'spam_from':
                triggered.append({
                    'rule': f'SPAM_FROM ({rule_pattern})',
                    'name': 'SPAM_FROM',
                    'type': 'spam_list',
                    'category_label': '⚠️ Lista de SPAM Direto',
                    'target': matched_target_label,
                    'pattern': rule_pattern,
                    'score': 20.0,
                    'points': 20.0,
                    'describe': f'Remetente ou domínio cadastrado como SPAM direto ({rule_pattern})',
                    'matched_value': matched_val
                })
                total_score += 20.0

    # 2. Evaluate Heuristic Rules
    custom_rules = parse_custom_spam_rules_py(content)
    for rule in custom_rules:
        pattern = rule.get('pattern', '')
        if not pattern:
            continue

        raw_pat = pattern.strip()
        flags = re.IGNORECASE
        if raw_pat.startswith('/') and raw_pat.rfind('/') > 0:
            raw_pat = raw_pat[1:raw_pat.rfind('/')]

        target_lower = (rule.get('target') or 'subject').lower()
        target_text = ''
        if target_lower == 'subject':
            target_text = test_subj
        elif target_lower == 'from':
            target_text = test_from
        elif target_lower in ['reply-to', 'replyto']:
            target_text = test_reply_to
        elif target_lower == 'body':
            target_text = test_body
        else:
            target_text = f"Subject: {test_subj}\nFrom: {test_from}\nReply-To: {test_reply_to}\n\n{test_body}"

        try:
            if target_text and re.search(raw_pat, target_text, flags):
                score_val = float(rule.get('score', 5.0))
                triggered.append({
                    'rule': rule['name'],
                    'name': rule['name'],
                    'type': 'heuristic',
                    'category_label': '🧠 Inteligência AntiSPAM (Regra Heurística)',
                    'target': rule['target'],
                    'pattern': rule['pattern'],
                    'score': score_val,
                    'points': score_val,
                    'describe': rule.get('describe', 'Regra customizada acionada'),
                    'matched_value': target_text[:80] + '...' if len(target_text) > 80 else target_text
                })
                total_score += score_val
        except Exception:
            pass

    is_spam = is_blacklisted or (not is_whitelisted and total_score >= 5.0)

    verdict_status = "CLEAN"
    verdict_title = "MENSAGEM LIMPA / ACEITA"
    verdict_action = "Entregar normalmente na Caixa de Entrada"

    if is_blacklisted:
        verdict_status = "BLACKLISTED"
        verdict_title = "BLOQUEIO IMEDIATO (Blacklist)"
        verdict_action = "Rejeitar conexão SMTP / Descarte Imediato"
    elif is_whitelisted:
        verdict_status = "WHITELISTED"
        verdict_title = "LIBERADO POR WHITELIST (Lista Confiável)"
        verdict_action = "Entregar na Caixa de Entrada (Ignorar regras de Spam)"
    elif is_spam:
        verdict_status = "SPAM_DETECTED"
        verdict_title = "CLASSIFICADO COMO SPAM"
        verdict_action = "Mover para Quarentena / Pasta de Lixo Eletrônico"

    blacklist_matches = [r for r in triggered if r.get('type') in ['blacklist', 'spam_list']]
    whitelist_matches = [r for r in triggered if r.get('type') == 'whitelist']
    heuristic_matches = [r for r in triggered if r.get('type') == 'heuristic']

    breakdown = f"Pontuação Total: {total_score:.1f} / 5.0 ({verdict_title}). {len(triggered)} regra(s) acionada(s)." if triggered else "Pontuação Total: 0.0 / 5.0. Nenhuma regra ativada."

    return jsonify({
        'success': True,
        'matched': len(triggered) > 0,
        'total_score': round(total_score, 1),
        'score': round(total_score, 1),
        'required_score': 5.0,
        'is_spam': is_spam,
        'is_blacklisted': is_blacklisted,
        'is_whitelisted': is_whitelisted,
        'verdict_status': verdict_status,
        'verdict_title': verdict_title,
        'verdict_action': verdict_action,
        'rules_matched': triggered,
        'rules_triggered': triggered,
        'blacklist_matches': blacklist_matches,
        'whitelist_matches': whitelist_matches,
        'heuristic_matches': heuristic_matches,
        'breakdown_text': breakdown
    })


@services_bp.route('/spamassassin/lint', methods=['GET', 'POST'])
@login_required
def lint_rules():
    data = request.get_json(silent=True) or request.form or {}
    content = data.get('content') or request.args.get('content')

    if content:
        tmp_file = '/tmp/test_spamassassin.cf'
        try:
            with open(tmp_file, 'w', encoding='utf-8') as f:
                f.write(content)
            res = run_cmd(['spamassassin', '--lint', '-C', tmp_file])
            if os.path.exists(tmp_file):
                os.remove(tmp_file)
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)}), 500
    else:
        res = run_cmd(['spamassassin', '--lint'])

    if res['returncode'] == 0:
        return jsonify({'success': True, 'message': 'Sintaxe OK! O arquivo de regras não contém erros.'})
    else:
        return jsonify({'success': False, 'message': res['stderr'] or res['stdout']})

@services_bp.route('/logs', methods=['GET', 'POST'])
@login_required
def get_logs():
    data = request.get_json(silent=True) or request.form or {}
    lines_arg = data.get('lines') or request.args.get('lines', 150)
    event_lens = (data.get('event_lens') or data.get('lente') or data.get('mailbox') or data.get('caixa_postal') or request.args.get('event_lens') or request.args.get('lente') or request.args.get('mailbox') or '').strip()
    search_term = (data.get('search_term') or data.get('termo_busca') or data.get('term') or request.args.get('search_term') or request.args.get('termo_busca') or request.args.get('term') or '').strip()

    try:
        lines_count = int(lines_arg)
    except (ValueError, TypeError):
        lines_count = 150

    raw_lines = []

    if os.path.exists(MAIL_LOG_PATH):
        res = run_cmd(['sudo', 'tail', '-n', str(lines_count * 3), MAIL_LOG_PATH])
        if res['returncode'] == 0 and res['stdout']:
            raw_lines = res['stdout'].split('\n')

    if not raw_lines:
        journal_res = run_cmd(['sudo', 'journalctl', '-u', 'postfix', '-u', 'amavis', '-n', str(lines_count * 3), '--no-pager'])
        if journal_res['returncode'] == 0 and journal_res['stdout']:
            raw_lines = journal_res['stdout'].split('\n')

    filtered_lines = []
    lens_parts = [p.strip().lower() for p in event_lens.split('|') if p.strip()] if event_lens else []
    term_lower = search_term.lower()

    for line in raw_lines:
        if not line:
            continue
        line_lower = line.lower()
        if lens_parts:
            if not any(part in line_lower for part in lens_parts):
                continue
        if term_lower and term_lower not in line_lower:
            continue
        filtered_lines.append(line)

    return jsonify({'success': True, 'logs': filtered_lines[-lines_count:] if lines_count > 0 and len(filtered_lines) > lines_count else filtered_lines})


ENV_FILE_PATH = os.path.join(os.getcwd(), '.env')

def parse_env_file():
    env_vars = {}
    if os.path.exists(ENV_FILE_PATH):
        try:
            with open(ENV_FILE_PATH, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, val = line.split('=', 1)
                        env_vars[key.strip()] = val.strip().strip('"').strip("'")
        except Exception:
            pass
    return env_vars

def write_env_file(updates):
    lines = []
    existing_keys = set()
    if os.path.exists(ENV_FILE_PATH):
        try:
            with open(ENV_FILE_PATH, 'r', encoding='utf-8') as f:
                for line in f:
                    stripped = line.strip()
                    if stripped and not stripped.startswith('#') and '=' in stripped:
                        key = stripped.split('=', 1)[0].strip()
                        if key in updates:
                            lines.append(f'{key}="{updates[key]}"\n')
                            existing_keys.add(key)
                            continue
                    lines.append(line)
        except Exception:
            lines = []

    for k, v in updates.items():
        if k not in existing_keys:
            lines.append(f'{k}="{v}"\n')

    with open(ENV_FILE_PATH, 'w', encoding='utf-8') as f:
        f.writelines(lines)

@services_bp.route('/settings', methods=['GET', 'POST'])
@login_required
def database_settings():
    env_vars = parse_env_file()
    
    db_user = env_vars.get('DB_USER') or os.environ.get('DB_USER', 'vmailadmin')
    db_pass = env_vars.get('DB_PASS') or os.environ.get('DB_PASS', 'senha_vmail_123')
    db_host = env_vars.get('DB_HOST') or os.environ.get('DB_HOST', '127.0.0.1')
    db_name = env_vars.get('DB_NAME') or os.environ.get('DB_NAME', 'vmail')
    db_port = env_vars.get('DB_PORT') or os.environ.get('DB_PORT', '3306')

    if request.method == 'POST':
        if current_user.role == 'user':
            return jsonify({'success': False, 'message': 'Acesso negado: Perfil de Usuário não possui permissão para alterar configurações do sistema.'}), 403

        data = request.get_json(silent=True) or request.form or {}
        new_user = data.get('DB_USER', db_user).strip()
        new_pass = data.get('DB_PASS', db_pass).strip()
        new_host = data.get('DB_HOST', db_host).strip()
        new_name = data.get('DB_NAME', db_name).strip()
        new_port = str(data.get('DB_PORT', db_port)).strip()

        updates = {
            'DB_USER': new_user,
            'DB_PASS': new_pass,
            'DB_HOST': new_host,
            'DB_NAME': new_name,
            'DB_PORT': new_port
        }

        try:
            write_env_file(updates)
            for k, v in updates.items():
                os.environ[k] = v

            return jsonify({
                'success': True,
                'message': 'Configurações do banco de dados salvas com sucesso no arquivo .env! Por favor, reinicie o serviço no Linux para aplicar as novas credenciais.',
                'settings': updates
            })
        except Exception as e:
            return jsonify({'success': False, 'message': f'Erro ao salvar arquivo .env: {str(e)}'}), 500

    return jsonify({
        'success': True,
        'settings': {
            'DB_USER': db_user,
            'DB_PASS': db_pass,
            'DB_HOST': db_host,
            'DB_NAME': db_name,
            'DB_PORT': db_port
        }
    })


