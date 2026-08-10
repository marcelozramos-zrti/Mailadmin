from flask import Blueprint, request, jsonify
from flask_login import login_required
import subprocess
import os
import re
import glob
import datetime
import dns.resolver

troubleshooting_bp = Blueprint('troubleshooting', __name__, url_prefix='/api/troubleshooting')

MAIL_LOG_PATH = os.environ.get('MAIL_LOG_PATH', '/var/log/mail.log')

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


# ==========================================
# 1. EXPLORADOR FLEXÍVEL DE LOGS DE E-MAIL
# ==========================================

@troubleshooting_bp.route('/email-tracking', methods=['GET', 'POST'])
@login_required
def track_email():
    """Explorador de logs flexível baseado em data (YYYY-MM-DD), intervalo de horas, caixa postal, termo de busca, agrupamento por Queue ID / PID e limite de linhas."""
    try:
        if request.method == 'POST':
            data = request.get_json(silent=True) or request.form or {}
        else:
            data = request.args or {}

        # 3. Validação de Variáveis e Valores Default
        date_param = (data.get('date') or data.get('data_busca') or data.get('period') or data.get('periodo') or '').strip().lower()
        start_time = (data.get('start_time') or data.get('hora_inicial') or '00:00').strip()
        end_time = (data.get('end_time') or data.get('hora_final') or '23:59').strip()
        quick_lens = (data.get('quick_lens') or data.get('event_lens') or data.get('lente') or data.get('lente_rapida') or '').strip().lower()
        mailbox = (data.get('mailbox') or data.get('caixa_postal') or data.get('sender') or data.get('recipient') or data.get('email') or '').strip().lower()
        search_term = (data.get('search_term') or data.get('termo_busca') or data.get('term') or data.get('subject') or '').strip().lower()
        delivery_status = (data.get('delivery_status') or data.get('status_entrega') or data.get('status') or '').strip().lower()
        service = (data.get('service') or data.get('servico') or data.get('service_filter') or '').strip().lower()

        try:
            limit = int(data.get('limit') or data.get('limite') or 500)
        except (ValueError, TypeError):
            limit = 500

        if limit <= 0:
            limit = 500

        today_obj = datetime.date.today()
        today_iso = today_obj.strftime('%Y-%m-%d')
        yesterday_iso = (today_obj - datetime.timedelta(days=1)).strftime('%Y-%m-%d')

        if date_param in ['yesterday', 'ontem', 'mail.log.1']:
            data_buscada = yesterday_iso
        elif date_param in ['today', 'hoje', 'mail.log', '']:
            data_buscada = today_iso
        else:
            try:
                parsed_dt = datetime.datetime.strptime(date_param, '%Y-%m-%d').date()
                data_buscada = parsed_dt.strftime('%Y-%m-%d')
            except ValueError:
                data_buscada = today_iso

        period = data_buscada
        data_buscada_safe = re.sub(r'[^0-9a-zA-Z-]', '', data_buscada)

        # Parse date for syslog prefix format (ex: "Aug 10" or "Aug  8")
        try:
            dt_obj = datetime.datetime.strptime(data_buscada, '%Y-%m-%d').date()
            syslog_date_pattern = f"{dt_obj.strftime('%b')} {dt_obj.day:2d}"
            formatted_date_br = dt_obj.strftime('%d/%m/%Y')
        except Exception:
            syslog_date_pattern = ""
            formatted_date_br = data_buscada

        period_label = f"Data: {formatted_date_br}"

        log_lines = []

        # 2. Correção do Subprocess (Anti-Crash) com zcat -f
        comando = f"sudo bash -c 'zcat -f /var/log/mail.log* 2>/dev/null | grep \"{data_buscada_safe}\"'"
        resultado = subprocess.run(comando, shell=True, capture_output=True, text=True)
        if resultado.stdout:
            log_lines = [line.strip() for line in resultado.stdout.splitlines() if line.strip()]

        # Se não encontrou pelo formato ISO, tenta busca pelo padrão de data syslog
        if not log_lines and syslog_date_pattern:
            cmd_syslog = f"sudo bash -c 'zcat -f /var/log/mail.log* 2>/dev/null | grep \"{syslog_date_pattern}\"'"
            res_sys = subprocess.run(cmd_syslog, shell=True, capture_output=True, text=True)
            if res_sys.stdout:
                log_lines = [line.strip() for line in res_sys.stdout.splitlines() if line.strip()]

        # Fallback para journalctl se mail.log estiver ausente
        if not log_lines:
            try:
                res_j = run_cmd(['sudo', 'journalctl', '-u', 'postfix', '-u', 'amavis', '-n', '2000', '--no-pager'])
                if res_j['stdout']:
                    all_lines = [line.strip() for line in res_j['stdout'].splitlines() if line.strip()]
                    matching = [l for l in all_lines if data_buscada_safe in l or (syslog_date_pattern and syslog_date_pattern in l)]
                    log_lines = matching if matching else all_lines
            except Exception:
                pass

        if not log_lines:
            msg = f"Nenhum registro de log encontrado para a data {formatted_date_br}."
            return jsonify({
                'success': True,
                'period': period,
                'period_label': period_label,
                'mailbox': mailbox,
                'search_term': search_term,
                'delivery_status': delivery_status,
                'service': service,
                'limit': limit,
                'total_matches': 0,
                'lines': [],
                'events': [{'raw': msg, 'type': 'INFO'}],
                'raw_text': msg
            })

        # 1. Corte de Tempo: Filtrar linhas dentro do intervalo de horário selecionado [start_time, end_time]
        time_filtered_lines = []
        for line in log_lines:
            tm_match = re.search(r'(?:[T\s])?(\d{2}:\d{2})(?::\d{2})?', line)
            if tm_match:
                line_time = tm_match.group(1)
                if start_time and line_time < start_time:
                    continue
                if end_time and line_time > end_time:
                    continue
            time_filtered_lines.append(line)

        # 2. Agrupamento em blocos por Queue ID (ex: 4YtZ8b3K:) ou PID (ex: smtpd[14201]:)
        def extract_group_key(line):
            qid_m = re.search(r'\b([0-9A-Za-z]{8,16}):', line)
            if not qid_m:
                qid_m = re.search(r'\(([0-9A-Za-z]{8,16})\)', line)
            if qid_m:
                qid = qid_m.group(1)
                if not qid.isdigit():
                    return f"qid:{qid}"

            pid_m = re.search(r'\b([a-zA-Z0-9_\-/]+\[\d+\]):', line)
            if pid_m:
                return f"pid:{pid_m.group(1)}"

            return None

        blocks = []
        key_to_block_idx = {}

        for line in time_filtered_lines:
            key = extract_group_key(line)
            if key:
                if key in key_to_block_idx:
                    idx = key_to_block_idx[key]
                    blocks[idx]['lines'].append(line)
                else:
                    new_idx = len(blocks)
                    key_to_block_idx[key] = new_idx
                    blocks.append({'key': key, 'lines': [line]})
            else:
                blocks.append({'key': None, 'lines': [line]})

        # 3. Lente de Ataques & Aplicação de Filtros Cruzados no Bloco
        filtered_lines = []
        smtp_attack_keywords = ["improper command pipelining", "non-smtp command", "unknown[", "warning: hostname", "lost connection after", "too many errors", "connect from unknown", "anvil"]
        auth_failure_keywords = ["authentication failed", "auth failed", "sasl", "password mismatch", "unknown user", "relay access denied", "554 5.7.1", "reject: rcp", "login failed"]

        for blk in blocks:
            blk_text = "\n".join(blk['lines']).lower()

            if quick_lens == 'smtp_attacks':
                if not any(kw in blk_text for kw in smtp_attack_keywords):
                    continue
            elif quick_lens == 'auth_failures':
                if not any(kw in blk_text for kw in auth_failure_keywords):
                    continue
            elif quick_lens:
                terms = [t.strip() for t in quick_lens.split('|') if t.strip()]
                if terms and not any(t in blk_text for t in terms):
                    continue

            if mailbox and mailbox not in blk_text:
                continue
            if search_term and search_term not in blk_text:
                continue
            if delivery_status and delivery_status not in blk_text:
                continue
            if service and service not in blk_text:
                continue

            filtered_lines.extend(blk['lines'])

        total_matches = len(filtered_lines)
        if total_matches > limit:
            result_lines = filtered_lines[-limit:]
        else:
            result_lines = filtered_lines

        if not result_lines:
            msg = "Nenhum registro de log encontrado para os filtros informados."
            return jsonify({
                'success': True,
                'period': period,
                'period_label': period_label,
                'mailbox': mailbox,
                'search_term': search_term,
                'delivery_status': delivery_status,
                'service': service,
                'limit': limit,
                'total_matches': 0,
                'lines': [],
                'events': [{'raw': msg, 'type': 'INFO'}],
                'raw_text': msg
            })

        raw_text = "\n".join(result_lines)
        events = [{'raw': l, 'type': 'INFO'} for l in result_lines]

        return jsonify({
            'success': True,
            'period': period,
            'period_label': period_label,
            'mailbox': mailbox,
            'search_term': search_term,
            'delivery_status': delivery_status,
            'service': service,
            'limit': limit,
            'total_matches': total_matches,
            'lines': result_lines,
            'events': events,
            'raw_text': raw_text
        })

    except Exception as e:
        return f"[Erro Interno do Python]: {str(e)}", 500


# ==========================================
# 2. GESTÃO DE FILA POSTFIX (POSTQUEUE / POSTSUPER)
# ==========================================

@troubleshooting_bp.route('/queue', methods=['GET', 'POST'])
@login_required
def get_queue():
    """Executa 'postqueue -p' e parseia o resultado em JSON estruturado."""
    try:
        res = run_cmd(['sudo', 'postqueue', '-p'])
        output = res['stdout']

        if 'Mail queue is empty' in output or not output:
            return jsonify({
                'success': True,
                'queue_empty': True,
                'total_messages': 0,
                'messages': []
            })

        # Regex para parsear blocos de postqueue -p
        # Ex: 4YtZ8b3K*     3412 Tue Aug  9 10:20:00  sender@domain.com
        #                   (Connection refused)
        #                                         recipient@other.com
        
        messages = []
        current_msg = None

        lines = output.split('\n')
        for line in lines:
            # ID de Fila costuma iniciar na coluna 0 com char alfa-numérico
            queue_match = re.match(r'^([0-9A-Fa-f]+)\*?\s+(\d+)\s+(.+?)\s+([^\s]+@[^\s]+)', line)
            if queue_match:
                if current_msg:
                    messages.append(current_msg)
                current_msg = {
                    'queue_id': queue_match.group(1),
                    'size': int(queue_match.group(2)),
                    'date': queue_match.group(3),
                    'sender': queue_match.group(4),
                    'recipients': [],
                    'reason': ''
                }
            elif current_msg:
                line_trimmed = line.strip()
                if line_trimmed.startswith('(') and line_trimmed.endswith(')'):
                    current_msg['reason'] = line_trimmed[1:-1]
                elif '@' in line_trimmed:
                    current_msg['recipients'].append(line_trimmed)

        if current_msg:
            messages.append(current_msg)

        return jsonify({
            'success': True,
            'queue_empty': False,
            'total_messages': len(messages),
            'messages': messages
        })

    except Exception as e:
        return jsonify({'success': False, 'message': f'Erro ao obter fila Postfix: {str(e)}'}), 500

@troubleshooting_bp.route('/queue/delete', methods=['GET', 'POST', 'DELETE'])
@login_required
def delete_queue_message():
    """Deleta uma mensagem específica da fila usando 'postsuper -d <queue_id>'."""
    data = request.get_json() or {}
    queue_id = data.get('queue_id')

    if not queue_id:
        return jsonify({'success': False, 'message': 'Queue ID é obrigatório.'}), 400

    try:
        res = run_cmd(['sudo', 'postsuper', '-d', queue_id])
        if res['returncode'] == 0:
            return jsonify({'success': True, 'message': f'Mensagem {queue_id} deletada da fila com sucesso!'})
        else:
            return jsonify({'success': False, 'message': f'Erro ao deletar: {res["stderr"] or res["stdout"]}'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': f'Exceção ao executar postsuper: {str(e)}'}), 500

@troubleshooting_bp.route('/queue/flush', methods=['GET', 'POST'])
@login_required
def flush_queue():
    """Força o envio das mensagens retidas na fila executando 'postqueue -f'."""
    try:
        res = run_cmd(['sudo', 'postqueue', '-f'])
        if res['returncode'] == 0:
            return jsonify({'success': True, 'message': 'Comando de liberação/flush enviado com sucesso para a fila Postfix!'})
        else:
            return jsonify({'success': False, 'message': f'Erro ao dar flush na fila: {res["stderr"] or res["stdout"]}'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': f'Exceção ao dar flush: {str(e)}'}), 500


# ==========================================
# 3. VALIDAÇÃO DE REGISTROS DNS (DNSPYTHON)
# ==========================================

@troubleshooting_bp.route('/dns-check', methods=['GET', 'POST'])
@login_required
def check_domain_dns():
    """Valida registros MX, SPF (TXT), DKIM e DMARC usando a biblioteca dnspython."""
    if request.method == 'POST':
        data = request.get_json(silent=True) or request.form or {}
        domain = data.get('domain', '').strip().lower()
        dkim_selector = data.get('selector', 'dkim').strip().lower()
    else:
        domain = request.args.get('domain', '').strip().lower()
        dkim_selector = request.args.get('selector', 'dkim').strip().lower()

    if not domain:
        return jsonify({'success': False, 'message': 'O domínio é obrigatório para validação DNS.'}), 400

    resolver = dns.resolver.Resolver()
    resolver.timeout = 5.0
    resolver.lifetime = 5.0

    dns_report = {
        'domain': domain,
        'mx': {'status': 'FALHA', 'records': [], 'details': ''},
        'spf': {'status': 'FALHA', 'record': '', 'details': ''},
        'dkim': {'status': 'FALHA', 'record': '', 'details': '', 'selector': dkim_selector},
        'dmarc': {'status': 'FALHA', 'record': '', 'details': ''}
    }

    # 1. Consulta MX
    try:
        mx_answers = resolver.resolve(domain, 'MX')
        mx_records = [f"{r.preference} {r.exchange}" for r in mx_answers]
        dns_report['mx'] = {
            'status': 'OK' if len(mx_records) > 0 else 'FALHA',
            'records': mx_records,
            'details': f'{len(mx_records)} servidor(es) MX encontrado(s).'
        }
    except Exception as e:
        dns_report['mx']['details'] = f'Nenhum registro MX encontrado: {str(e)}'

    # 2. Consulta SPF (TXT)
    try:
        txt_answers = resolver.resolve(domain, 'TXT')
        spf_found = ''
        for txt_rec in txt_answers:
            txt_str = str(txt_rec).strip('"')
            if 'v=spf1' in txt_str:
                spf_found = txt_str
                break

        if spf_found:
            dns_report['spf'] = {
                'status': 'OK',
                'record': spf_found,
                'details': 'Registro SPF v=spf1 válido encontrado.'
            }
        else:
            dns_report['spf']['details'] = 'Nenhum registro TXT contendo v=spf1 foi localizado.'
    except Exception as e:
        dns_report['spf']['details'] = f'Erro na consulta TXT/SPF: {str(e)}'

    # 3. Consulta DKIM (Ex: dkim._domainkey.domain.com)
    dkim_fqdn = f"{dkim_selector}._domainkey.{domain}"
    try:
        dkim_answers = resolver.resolve(dkim_fqdn, 'TXT')
        dkim_found = str(dkim_answers[0]).strip('"')
        dns_report['dkim'] = {
            'status': 'OK' if 'v=DKIM1' in dkim_found or 'p=' in dkim_found else 'ALERTA',
            'record': dkim_found,
            'details': f'Registro Chave Pública DKIM localizado em {dkim_fqdn}',
            'selector': dkim_selector
        }
    except Exception as e:
        dns_report['dkim']['details'] = f'Não localizado em {dkim_fqdn}: {str(e)}'

    # 4. Consulta DMARC (_dmarc.domain.com)
    dmarc_fqdn = f"_dmarc.{domain}"
    try:
        dmarc_answers = resolver.resolve(dmarc_fqdn, 'TXT')
        dmarc_found = str(dmarc_answers[0]).strip('"')
        dns_report['dmarc'] = {
            'status': 'OK' if 'v=DMARC1' in dmarc_found else 'FALHA',
            'record': dmarc_found,
            'details': f'Política DMARC configurada em {dmarc_fqdn}'
        }
    except Exception as e:
        dns_report['dmarc']['details'] = f'Registro DMARC não encontrado em {dmarc_fqdn}: {str(e)}'

    return jsonify({'success': True, 'dns_report': dns_report})
