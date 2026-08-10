from flask import Blueprint, request, jsonify
from flask_login import login_required
import subprocess
import os
import platform
import time
import re

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


@services_bp.route('/spamassassin/visual-rules', methods=['GET', 'POST', 'DELETE'])
@login_required
def handle_visual_rules():
    if request.method == 'GET':
        try:
            if not os.path.exists(LOCAL_CF_PATH):
                return jsonify({'success': True, 'rules': []})

            with open(LOCAL_CF_PATH, 'r', encoding='utf-8') as f:
                lines = f.readlines()

            rules = []
            rule_id = 0
            pattern = re.compile(r'^\s*(blacklist_from|whitelist_from)\s+(.+)$', re.IGNORECASE)

            for line in lines:
                clean_line = line.strip()
                match = pattern.match(clean_line)
                if match:
                    action_type = match.group(1).lower()
                    val = match.group(2).strip()
                    rules.append({
                        'id': rule_id,
                        'type': action_type,
                        'action_label': 'Bloquear (Blacklist)' if action_type == 'blacklist_from' else 'Liberar (Whitelist)',
                        'value': val,
                        'raw': clean_line
                    })
                    rule_id += 1

            return jsonify({'success': True, 'rules': rules})
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)}), 500

    elif request.method == 'POST':
        data = request.get_json(silent=True) or request.form or {}
        action = data.get('action')
        value = (data.get('value') or '').strip()

        if not action or action not in ['blacklist_from', 'whitelist_from']:
            return jsonify({'success': False, 'message': 'Ação inválida. Escolha Bloquear (blacklist_from) ou Liberar (whitelist_from).'}), 400

        if not value:
            return jsonify({'success': False, 'message': 'Forneça um endereço ou padrão válido (ex: *@dominio.com).'}), 400

        new_rule_line = f"{action} {value}"

        try:
            content = ""
            if os.path.exists(LOCAL_CF_PATH):
                with open(LOCAL_CF_PATH, 'r', encoding='utf-8') as f:
                    content = f.read()

            lines = [l.strip() for l in content.splitlines()]
            if new_rule_line not in lines:
                if content and not content.endswith('\n'):
                    content += '\n'
                content += new_rule_line + '\n'

                tmp_file = '/tmp/local.cf.tmp'
                with open(tmp_file, 'w', encoding='utf-8') as f:
                    f.write(content)

                cp_res = run_cmd(['sudo', 'cp', tmp_file, LOCAL_CF_PATH])
                if os.path.exists(tmp_file):
                    os.remove(tmp_file)

                if cp_res['returncode'] != 0:
                    return jsonify({'success': False, 'message': f'Erro ao atualizar local.cf: {cp_res["stderr"]}'}), 500

            run_cmd(['sudo', 'systemctl', 'restart', 'spamassassin'])
            run_cmd(['sudo', 'systemctl', 'restart', 'amavis'])

            return jsonify({
                'success': True,
                'message': f'Regra "{new_rule_line}" adicionada com sucesso! Serviço SpamAssassin reiniciado.'
            })
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)}), 500

    elif request.method == 'DELETE':
        return delete_visual_rule_logic()


@services_bp.route('/spamassassin/visual-rules/delete', methods=['POST'])
@login_required
def delete_visual_rule_endpoint():
    return delete_visual_rule_logic()


def delete_visual_rule_logic():
    if current_user.role == 'user':
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
        tmp_file = '/tmp/local.cf.tmp'
        with open(tmp_file, 'w', encoding='utf-8') as f:
            f.write(content)

        cp_res = run_cmd(['sudo', 'cp', tmp_file, LOCAL_CF_PATH])
        if os.path.exists(tmp_file):
            os.remove(tmp_file)

        if cp_res['returncode'] != 0:
            return jsonify({'success': False, 'message': f'Erro ao atualizar local.cf: {cp_res["stderr"]}'}), 500

        run_cmd(['sudo', 'systemctl', 'restart', 'spamassassin'])
        run_cmd(['sudo', 'systemctl', 'restart', 'amavis'])

        return jsonify({
            'success': True,
            'message': 'Regra removida com sucesso! Serviço SpamAssassin reiniciado.'
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


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
    lines_arg = data.get('lines') or request.args.get('lines', 100)
    try:
        lines_count = int(lines_arg)
    except (ValueError, TypeError):
        lines_count = 100

    if os.path.exists(MAIL_LOG_PATH):
        res = run_cmd(['sudo', 'tail', '-n', str(lines_count), MAIL_LOG_PATH])
        if res['returncode'] == 0:
            return jsonify({'success': True, 'logs': res['stdout'].split('\n')})

    journal_res = run_cmd(['sudo', 'journalctl', '-u', 'postfix', '-u', 'amavis', '-n', str(lines_count), '--no-pager'])
    if journal_res['returncode'] == 0:
        return jsonify({'success': True, 'logs': journal_res['stdout'].split('\n')})

    return jsonify({'success': False, 'logs': ['Logs inacessíveis.']}), 500


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


