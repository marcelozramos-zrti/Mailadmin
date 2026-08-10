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
# 1. TRACKING DE E-MAIL (JORNADA NO MAIL.LOG)
# ==========================================

@troubleshooting_bp.route('/email-tracking', methods=['GET', 'POST'])
@login_required
def track_email():
    if request.method == 'POST':
        data = request.get_json(silent=True) or request.form or {}
        sender = (data.get('sender') or '').strip()
        recipient = (data.get('recipient') or '').strip()
        subject = (data.get('subject') or '').strip()
        email_query = (data.get('email') or '').strip()
    else:
        sender = (request.args.get('sender') or '').strip()
        recipient = (request.args.get('recipient') or '').strip()
        subject = (request.args.get('subject') or '').strip()
        email_query = (request.args.get('email') or '').strip()

    # Fallback de compatibilidade
    if not sender and not recipient and not subject and email_query:
        sender = email_query

    if not sender and not recipient and not subject:
        return jsonify({'success': False, 'message': 'Informe o remetente (De), destinatário (Para) ou assunto para rastrear.'}), 400

    try:
        # 1. Comando Anti-Logrotate (lê o log de ontem e o de hoje concatenados)
        log_lines = []
        try:
            cmd = "sudo cat /var/log/mail.log.1 /var/log/mail.log 2>/dev/null"
            resultado = subprocess.run(cmd, shell=True, capture_output=True, text=True, errors='ignore', timeout=25)
            if resultado.stdout:
                log_lines = [line.strip() for line in resultado.stdout.split('\n') if line.strip()]
        except Exception as read_err:
            log_lines = []

        # Fallback para journalctl se mail.log estiver vazio
        if not log_lines:
            res = run_cmd(['sudo', 'journalctl', '-u', 'postfix', '-u', 'amavis', '-u', 'dovecot', '-n', '4000', '--no-pager'])
            if res['stdout']:
                log_lines = [line.strip() for line in res['stdout'].splitlines() if line.strip()]

        if not log_lines:
            return jsonify({
                'success': True,
                'sender': sender,
                'recipient': recipient,
                'subject': subject,
                'found_queue_ids': [],
                'total_matches': 0,
                'events': [{'raw': 'Nenhuma jornada encontrada para estes parâmetros.', 'type': 'INFO'}],
                'raw_text': 'Nenhuma jornada encontrada para estes parâmetros.'
            })

        # 2. Estrutura de Dados (bloco_por_qid e msgid_por_qid)
        bloco_por_qid = {}
        msgid_por_qid = {}

        qid_regex = re.compile(r'\s([a-zA-Z0-9]{10,15}):\s')
        msgid_regex = re.compile(r'message-id=<([^>]+)>', re.IGNORECASE)

        for line in log_lines:
            # Exclui linhas de ruído do dovecot (imap-login / pop3-login)
            if 'imap-login' in line or 'pop3-login' in line:
                continue

            match = qid_regex.search(' ' + line + ' ')
            if match:
                qid = match.group(1)
                if qid:
                    if qid not in bloco_por_qid:
                        bloco_por_qid[qid] = []
                    bloco_por_qid[qid].append(line)

                    m_msg = msgid_regex.search(line)
                    if m_msg:
                        msgid_por_qid[qid] = m_msg.group(1).lower().strip()

        sender_lower = sender.lower() if sender else ""
        recipient_lower = recipient.lower() if recipient else ""
        subject_lower = subject.lower() if subject else ""

        # 3. O Motor de Busca - Filtro inicial por remetente/destinatário
        qids_iniciais = set()

        for qid, linhas in bloco_por_qid.items():
            bloco_lower = "\n".join(linhas).lower()

            match_sender = True
            if sender_lower:
                match_sender = (f"from=<{sender_lower}" in bloco_lower or 
                                f"<{sender_lower}>" in bloco_lower or 
                                f"from={sender_lower}" in bloco_lower)

            match_recipient = True
            if recipient_lower:
                match_recipient = (f"to=<{recipient_lower}" in bloco_lower or 
                                   f"<{recipient_lower}>" in bloco_lower or 
                                   f"to={recipient_lower}" in bloco_lower)

            if match_sender and match_recipient:
                qids_iniciais.add(qid)

        # A Ponte do Amavis (Integração de QIDs pelo mesmo Message-ID)
        qids_alvo = set(qids_iniciais)
        target_msg_ids = set()

        for qid in qids_iniciais:
            if qid in msgid_por_qid:
                target_msg_ids.add(msgid_por_qid[qid])

        if target_msg_ids:
            for qid, msgid in msgid_por_qid.items():
                if msgid in target_msg_ids:
                    qids_alvo.add(qid)

            for qid, linhas in bloco_por_qid.items():
                bloco_lower = "\n".join(linhas).lower()
                for mid in target_msg_ids:
                    if mid in bloco_lower:
                        qids_alvo.add(qid)
                        break

        # 4. Filtro de Assunto
        final_qids_alvo = set()
        for qid in qids_alvo:
            linhas = bloco_por_qid.get(qid, [])
            bloco_lower = "\n".join(linhas).lower()

            if subject_lower:
                has_sub = subject_lower in bloco_lower
                if not has_sub:
                    qid_msgid = msgid_por_qid.get(qid)
                    if qid_msgid:
                        for partner_qid in qids_alvo:
                            if msgid_por_qid.get(partner_qid) == qid_msgid:
                                partner_bloco = "\n".join(bloco_por_qid.get(partner_qid, [])).lower()
                                if subject_lower in partner_bloco:
                                    has_sub = True
                                    break
                if not has_sub:
                    continue

            final_qids_alvo.add(qid)

        if not final_qids_alvo:
            return jsonify({
                'success': True,
                'sender': sender,
                'recipient': recipient,
                'subject': subject,
                'found_queue_ids': [],
                'total_matches': 0,
                'events': [{'raw': 'Nenhuma jornada encontrada para estes parâmetros.', 'type': 'INFO'}],
                'raw_text': 'Nenhuma jornada encontrada para estes parâmetros.'
            })

        ordered_approved_qids = [q for q in bloco_por_qid.keys() if q in final_qids_alvo]

        # 5. Renderização final
        journey_events = []
        raw_text_parts = []

        for qid in ordered_approved_qids:
            linhas = bloco_por_qid[qid]
            raw_text_parts.append(f"=== [ Queue ID: {qid} ] ===")
            journey_events.append({'raw': f"=== [ Queue ID: {qid} ] ===", 'type': 'HEADER'})

            for line in linhas:
                raw_text_parts.append(line)
                event_type = 'INFO'
                if 'Passed' in line or 'status=sent' in line:
                    event_type = 'DELIVERED'
                elif 'Blocked' in line or 'REJECT' in line or 'D_DISCARD' in line or 'status=bounced' in line or 'status=deferred' in line:
                    event_type = 'BLOCKED'
                elif 'amavis' in line:
                    event_type = 'AMAVIS_SCAN'
                journey_events.append({'raw': line, 'type': event_type})

            raw_text_parts.append("")

        raw_text_output = "\n".join(raw_text_parts)

        return jsonify({
            'success': True,
            'sender': sender,
            'recipient': recipient,
            'subject': subject,
            'found_queue_ids': ordered_approved_qids,
            'total_matches': len(journey_events),
            'events': journey_events[-300:],
            'raw_text': raw_text_output
        })

    except Exception as e:
        return jsonify({'success': False, 'message': f'Erro ao rastrear e-mail: {str(e)}'}), 500


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
