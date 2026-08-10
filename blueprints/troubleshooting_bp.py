from flask import Blueprint, request, jsonify
from flask_login import login_required
import subprocess
import os
import re
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
    """Explorador de logs flexível baseado em período, caixa postal, termo de busca e limite de linhas."""
    if request.method == 'POST':
        data = request.get_json(silent=True) or request.form or {}
    else:
        data = request.args or {}

    # Leitura dos parâmetros com múltiplos aliases para compatibilidade
    period = (data.get('period') or data.get('periodo') or 'today').strip().lower()
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

    # 1. Seleção do Arquivo de Log com base no Período
    if period in ['yesterday', 'ontem', 'mail.log.1']:
        log_file = '/var/log/mail.log.1'
        period_label = 'Ontem (mail.log.1)'
    else:
        log_file = '/var/log/mail.log'
        period_label = 'Hoje (mail.log)'

    log_lines = []

    # Leitura do log usando subprocess com sudo cat
    try:
        cmd_res = subprocess.run(
            ['sudo', 'cat', log_file],
            capture_output=True, text=True, errors='ignore', timeout=20
        )
        if cmd_res.stdout:
            log_lines = [line.strip() for line in cmd_res.stdout.splitlines() if line.strip()]
    except Exception:
        log_lines = []

    # Fallback para journalctl se mail.log estiver vazio / ausente
    if not log_lines:
        try:
            res = run_cmd(['sudo', 'journalctl', '-u', 'postfix', '-u', 'amavis', '-n', '2000', '--no-pager'])
            if res['stdout']:
                log_lines = [line.strip() for line in res['stdout'].splitlines() if line.strip()]
        except Exception:
            pass

    if not log_lines:
        msg = f"Nenhum registro de log encontrado em {log_file}."
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

    # 2. Lógica de Filtragem no Python
    filtered_lines = []

    for line in log_lines:
        line_lower = line.lower()

        # Filtro de Caixa Postal (De ou Para)
        if mailbox and mailbox not in line_lower:
            continue

        # Filtro de Termo de Busca Livre (Assunto, IP, Porta, Status, Erro)
        if search_term and search_term not in line_lower:
            continue

        # Filtro de Status da Entrega (sent, bounced, deferred)
        if delivery_status and delivery_status not in line_lower:
            continue

        # Filtro de Serviço (postfix, amavis, dovecot)
        if service and service not in line_lower:
            continue

        filtered_lines.append(line)

    # 3. Limite de Linhas (pegando as mais recentes = do final do array)
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
