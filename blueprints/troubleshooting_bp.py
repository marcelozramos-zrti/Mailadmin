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
    """Explorador de logs com Power Query (from:, to:, prot:, status: + busca livre), suporte a intervalo de datas/horas e agrupamento por bloco."""
    try:
        if request.method == 'POST':
            data = request.get_json(silent=True) or request.form or {}
        else:
            data = request.args or {}

        # 1. Extração e Fatiamento da Power Query por ';'
        power_query = (data.get('power_query') or data.get('query') or data.get('pq') or data.get('search_term') or data.get('termo_busca') or '').strip()

        # Fatiamento: divide por ';' e limpa espaços
        raw_conditions = [c.strip() for c in power_query.split(';') if c.strip()]

        # Se não houver power_query, aceitar filtros legados de formulário
        if not raw_conditions:
            mb = (data.get('mailbox') or data.get('caixa_postal') or '').strip()
            if mb: raw_conditions.append(f"from:{mb}")
            st = (data.get('search_term') or data.get('termo_busca') or '').strip()
            if st: raw_conditions.append(st)
            ds = (data.get('delivery_status') or data.get('status_entrega') or '').strip()
            if ds: raw_conditions.append(f"status:{ds}")
            srv = (data.get('service') or data.get('servico') or '').strip()
            if srv: raw_conditions.append(f"prot:{srv}")

        parsed_conditions = []
        for cond in raw_conditions:
            cond_clean = cond.strip()
            if not cond_clean:
                continue
            # Se o bloco inteiro estiver entre aspas duplas, preserva espaços internos e trata como busca exata
            if cond_clean.startswith('"') and cond_clean.endswith('"') and len(cond_clean) >= 2:
                val = cond_clean[1:-1].lower()
                parsed_conditions.append({
                    'key': 'free',
                    'op': 'contains',
                    'val': val
                })
            elif '!=' in cond_clean:
                k, v = cond_clean.split('!=', 1)
                v_s = v.strip()
                val = v_s[1:-1].lower() if (v_s.startswith('"') and v_s.endswith('"') and len(v_s) >= 2) else v_s.lower()
                parsed_conditions.append({
                    'key': k.strip().lower(),
                    'op': '!=',
                    'val': val
                })
            elif ':' in cond_clean:
                k, v = cond_clean.split(':', 1)
                v_s = v.strip()
                val = v_s[1:-1].lower() if (v_s.startswith('"') and v_s.endswith('"') and len(v_s) >= 2) else v_s.lower()
                parsed_conditions.append({
                    'key': k.strip().lower(),
                    'op': ':',
                    'val': val
                })
            elif '=' in cond_clean:
                k, v = cond_clean.split('=', 1)
                v_s = v.strip()
                val = v_s[1:-1].lower() if (v_s.startswith('"') and v_s.endswith('"') and len(v_s) >= 2) else v_s.lower()
                parsed_conditions.append({
                    'key': k.strip().lower(),
                    'op': ':',
                    'val': val
                })
            else:
                parsed_conditions.append({
                    'key': 'free',
                    'op': 'contains',
                    'val': cond_clean.lower()
                })

        # 2. Configurações Temporais e Limite
        start_date_param = (data.get('start_date') or data.get('data_inicio') or data.get('date') or data.get('data_busca') or data.get('period') or '').strip().lower()
        end_date_param = (data.get('end_date') or data.get('data_fim') or start_date_param or '').strip().lower()
        start_time = (data.get('start_time') or data.get('hora_inicial') or '00:00').strip()
        end_time = (data.get('end_time') or data.get('hora_final') or '23:59').strip()
        quick_lens = (data.get('quick_lens') or data.get('event_lens') or data.get('lente') or '').strip().lower()

        try:
            limit = int(data.get('limit') or data.get('limite') or 500)
        except (ValueError, TypeError):
            limit = 500

        if limit <= 0:
            limit = 500

        today_obj = datetime.date.today()

        def parse_date(d_str):
            if d_str in ['yesterday', 'ontem']:
                return today_obj - datetime.timedelta(days=1)
            elif d_str in ['today', 'hoje', '']:
                return today_obj
            try:
                return datetime.datetime.strptime(d_str, '%Y-%m-%d').date()
            except Exception:
                return today_obj

        start_dt = parse_date(start_date_param)
        end_dt = parse_date(end_date_param)
        if end_dt < start_dt:
            end_dt = start_dt

        curr_dt = start_dt
        date_list = []
        while curr_dt <= end_dt and len(date_list) < 31:
            date_list.append(curr_dt.strftime('%Y-%m-%d'))
            curr_dt += datetime.timedelta(days=1)

        date_pattern = "|".join([re.sub(r'[^0-9-]', '', d) for d in date_list])
        formatted_start_br = start_dt.strftime('%d/%m/%Y')
        formatted_end_br = end_dt.strftime('%d/%m/%Y')
        period_label = f"Período: {formatted_start_br}" if start_dt == end_dt else f"Período: {formatted_start_br} a {formatted_end_br}"

        log_lines = []

        # Subprocess zcat / grep
        comando = f"sudo bash -c 'zcat -f /var/log/mail.log* 2>/dev/null | grep -E \"{date_pattern}\"'"
        resultado = subprocess.run(comando, shell=True, capture_output=True, text=True)
        if resultado.stdout:
            log_lines = [line.strip() for line in resultado.stdout.splitlines() if line.strip()]

        # Fallback para journalctl se mail.log estiver indisponível
        if not log_lines:
            try:
                res_j = run_cmd(['sudo', 'journalctl', '-u', 'postfix', '-u', 'amavis', '-n', '2000', '--no-pager'])
                if res_j['stdout']:
                    all_lines = [line.strip() for line in res_j['stdout'].splitlines() if line.strip()]
                    log_lines = [l for l in all_lines if any(d in l for d in date_list)] or all_lines
            except Exception:
                pass

        if not log_lines:
            msg = f"Nenhum registro de log encontrado para o período informado ({period_label})."
            return jsonify({
                'success': True,
                'period': start_dt.strftime('%Y-%m-%d'),
                'period_label': period_label,
                'power_query': power_query,
                'limit': limit,
                'total_matches': 0,
                'lines': [],
                'events': [{'raw': msg, 'type': 'INFO'}],
                'raw_text': msg
            })

        # 3. Corte de Tempo: Filtrar linhas dentro do intervalo de horário selecionado [start_time, end_time]
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

        # 4. Agrupamento em blocos por Queue ID, Amavis Task (PID-Task) ou PID
        def extract_group_key(line):
            # 1. Identificador de tarefa do Amavis: (PID-Task), ex: (2162785-19)
            amavis_task_m = re.search(r'amavis\[\d+\]:\s*\(([\d]+-[\d]+)\)', line, re.IGNORECASE)
            if not amavis_task_m:
                amavis_task_m = re.search(r'\(([\d]+-[\d]+)\)', line)
            if amavis_task_m:
                return f"amavis:{amavis_task_m.group(1)}"

            # 2. Identificador de mail_id do Amavis
            mail_id_m = re.search(r'mail_id:\s*([0-9A-Za-z_\-]+)', line, re.IGNORECASE)
            if mail_id_m:
                return f"mail_id:{mail_id_m.group(1)}"

            # 3. Queue ID do Postfix (ex: 4YtZ8b3K: ou (4YtZ8b3K))
            qid_m = re.search(r'\b([0-9A-Za-z]{8,16}):', line)
            if not qid_m:
                qid_m = re.search(r'\(([0-9A-Za-z]{8,16})\)', line)
            if qid_m:
                qid = qid_m.group(1)
                if not qid.isdigit():
                    return f"qid:{qid}"

            # 4. PID genérico (ex: postfix/smtpd[14201]:)
            # NOTA: NUNCA agrupa amavis apenas pelo PID do worker para não agrupar o histórico inteiro do processo!
            pid_m = re.search(r'\b([a-zA-Z0-9_\-/]+\[\d+\]):', line)
            if pid_m:
                proc = pid_m.group(1)
                if 'amavis' in proc.lower():
                    return None
                return f"pid:{proc}"

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

        # 5. Validação dos blocos contra Power Query e Lentes Rápidas
        matching_blocks = []
        filtered_lines = []
        smtp_attack_keywords = ["improper command pipelining", "non-smtp command", "unknown[", "warning: hostname", "lost connection after", "too many errors", "connect from unknown", "anvil"]
        auth_failure_keywords = ["authentication failed", "auth failed", "sasl", "password mismatch", "unknown user", "relay access denied", "554 5.7.1", "reject: rcp", "login failed"]

        def check_block(blk):
            blk_lines = blk['lines']
            blk_text = "\n".join(blk_lines).lower()

            if quick_lens == 'smtp_attacks':
                if not any(kw in blk_text for kw in smtp_attack_keywords):
                    return False
            elif quick_lens == 'auth_failures':
                if not any(kw in blk_text for kw in auth_failure_keywords):
                    return False
            elif quick_lens:
                terms = [t.strip() for t in quick_lens.split('|') if t.strip()]
                if terms and not any(t in blk_text for t in terms):
                    return False

            if not parsed_conditions:
                return True

            sender_cache = [None]
            recipient_cache = [None]

            def get_sender():
                if sender_cache[0] is None:
                    snd = ""
                    for line in blk_lines:
                        m1 = re.search(r'ESMTP\s*<([^>]+)>\s*->', line, re.IGNORECASE)
                        if m1: snd = m1.group(1).strip().lower(); break
                        m2 = re.search(r'from=<([^>]+)>', line, re.IGNORECASE)
                        if m2: snd = m2.group(1).strip().lower(); break
                        m3 = re.search(r'From:\s*<([^>]+)>', line, re.IGNORECASE)
                        if m3: snd = m3.group(1).strip().lower(); break
                        m4 = re.search(r'from=\s*<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9._%+-]+)>?', line, re.IGNORECASE)
                        if m4: snd = m4.group(1).strip().lower(); break
                    sender_cache[0] = snd
                return sender_cache[0]

            def get_recipient():
                if recipient_cache[0] is None:
                    rcp = ""
                    for line in blk_lines:
                        m1 = re.search(r'->\s*<([^>]+)>', line, re.IGNORECASE)
                        if m1: rcp = m1.group(1).strip().lower(); break
                        m2 = re.search(r'to=<([^>]+)>', line, re.IGNORECASE)
                        if m2: rcp = m2.group(1).strip().lower(); break
                        m3 = re.search(r'To:\s*<([^>]+)>', line, re.IGNORECASE)
                        if m3: rcp = m3.group(1).strip().lower(); break
                        m4 = re.search(r'to=\s*<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9._%+-]+)>?', line, re.IGNORECASE)
                        if m4: rcp = m4.group(1).strip().lower(); break
                    recipient_cache[0] = rcp
                return recipient_cache[0]

            for c in parsed_conditions:
                key = c['key']
                op = c['op']
                val = c['val']

                if not val:
                    continue

                if key in ['from', 'remetente', 'sender', 'caixa_postal', 'mailbox']:
                    snd = get_sender()
                    has_val = (val in snd) or (val in blk_text and ('from=' in blk_text or 'from:' in blk_text or 'esmtp' in blk_text))
                    if op == '!=' and has_val:
                        return False
                    if op in [':', '='] and not has_val:
                        return False

                elif key in ['to', 'destinatario', 'recipient']:
                    rcp = get_recipient()
                    has_val = (val in rcp) or (val in blk_text and ('to=' in blk_text or 'to:' in blk_text or '->' in blk_text))
                    if op == '!=' and has_val:
                        return False
                    if op in [':', '='] and not has_val:
                        return False

                elif key in ['status', 'delivery_status', 'status_entrega', 'veredito', 'verdict']:
                    has_val = (val in blk_text)
                    if op == '!=' and has_val:
                        return False
                    if op in [':', '='] and not has_val:
                        return False

                elif key in ['prot', 'service', 'servico', 'protocol']:
                    has_val = (val in blk_text)
                    if op == '!=' and has_val:
                        return False
                    if op in [':', '='] and not has_val:
                        return False

                else:
                    has_val = (val in blk_text)
                    if op == '!=' and has_val:
                        return False
                    if op in [':', '=', 'contains'] and not has_val:
                        return False

            return True

        for blk in blocks:
            if check_block(blk):
                matching_blocks.append(blk)
                filtered_lines.extend(blk['lines'])

        # Extração Estruturada de Transações para a Tabela SOAR
        transacoes = []
        for blk in matching_blocks:
            lines = blk['lines']
            blk_full = "\n".join(lines)

            # 1. Queue ID / Key
            key_val = blk.get('key') or ''
            if key_val.startswith('qid:'):
                qid = key_val[4:]
            elif key_val.startswith('amavis:'):
                qid = key_val[7:]
            elif key_val.startswith('mail_id:'):
                qid = key_val[8:]
            elif key_val.startswith('pid:'):
                qid = key_val[4:]
            else:
                qm = re.search(r'\b([0-9A-Za-z]{8,16}):', blk_full)
                qid = qm.group(1) if qm else "NOQUEUE"

            # 2. Encontrar a linha exata do Veredito / Entrega / Processamento
            verdict_keywords = [
                'passed clean', 'passed spam', 'passed', 'status=sent', 'bounced',
                'reject:', 'chkrootkit', 'auth failed', 'alert', 'warning', 'hits:'
            ]
            target_line = None
            for line in lines:
                l_low = line.lower()
                if any(kw in l_low for kw in verdict_keywords):
                    target_line = line
                    break

            if not target_line:
                target_line = lines[-1] if lines else blk_full

            # 3. Data / Hora (linha-alvo ou primeira linha)
            ts_m = re.search(r'([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2}|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}|\d{2}:\d{2}:\d{2})', target_line)
            if not ts_m and lines:
                ts_m = re.search(r'([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2}|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}|\d{2}:\d{2}:\d{2})', lines[0])
            data_hora = ts_m.group(1) if ts_m else "N/A"

            # 4. Extração do Remetente (prioriza target_line, depois busca no bloco)
            def extract_sender(text):
                # ESMTP <sender> -> ou from=<sender> ou From: <sender>
                m1 = re.search(r'ESMTP\s*<([^>]+)>\s*->', text, re.IGNORECASE)
                if m1: return m1.group(1).strip()
                m2 = re.search(r'from=<([^>]+)>', text, re.IGNORECASE)
                if m2: return m2.group(1).strip()
                m3 = re.search(r'From:\s*<([^>]+)>', text, re.IGNORECASE)
                if m3: return m3.group(1).strip()
                m4 = re.search(r'from=\s*<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9._%+-]+)>?', text, re.IGNORECASE)
                if m4: return m4.group(1).strip()
                return None

            remetente = extract_sender(target_line)
            if not remetente:
                for line in lines:
                    remetente = extract_sender(line)
                    if remetente: break

            if not remetente or remetente.lower() in ['none', 'null', '<>']:
                if 'from=<>' in blk_full.lower() or '<>' in (target_line or ''):
                    remetente = "<> (Bounce)"
                else:
                    remetente = "N/A"

            # 5. Extração do Destinatário (prioriza target_line, depois busca no bloco)
            def extract_recipient(text):
                # -> <recipient> ou to=<recipient> ou To: <recipient>
                m1 = re.search(r'->\s*<([^>]+)>', text, re.IGNORECASE)
                if m1: return m1.group(1).strip()
                m2 = re.search(r'to=<([^>]+)>', text, re.IGNORECASE)
                if m2: return m2.group(1).strip()
                m3 = re.search(r'To:\s*<([^>]+)>', text, re.IGNORECASE)
                if m3: return m3.group(1).strip()
                m4 = re.search(r'to=\s*<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9._%+-]+)>?', text, re.IGNORECASE)
                if m4: return m4.group(1).strip()
                return None

            destinatario = extract_recipient(target_line)
            if not destinatario:
                for line in lines:
                    destinatario = extract_recipient(line)
                    if destinatario: break
            if not destinatario or destinatario.lower() in ['none', 'null']:
                destinatario = "N/A"

            # 6. Extração do Score (Hits: ... ou score=...)
            def extract_score(text):
                m1 = re.search(r'Hits:\s*([-\d\.]+)', text, re.IGNORECASE)
                if m1: return m1.group(1)
                m2 = re.search(r'score=([-\d\.]+)', text, re.IGNORECASE)
                if m2: return m2.group(1)
                m3 = re.search(r'(?:hits|score)\s*[:=]\s*([-\d\.]+)', text, re.IGNORECASE)
                if m3: return m3.group(1)
                return None

            score = extract_score(target_line)
            if not score:
                for line in lines:
                    score = extract_score(line)
                    if score: break
            if not score:
                score = "-"

            # 7. Veredito
            t_low = (target_line + "\n" + blk_full).lower()
            if 'passed spam' in t_low or 'spam' in t_low or 'bounced' in t_low:
                veredito = "SPAM"
            elif 'alert' in t_low or 'warning' in t_low or 'chkrootkit' in t_low or 'auth failed' in t_low or 'reject' in t_low:
                veredito = "ALERTA"
            elif 'passed clean' in t_low or 'clean' in t_low or 'sent' in t_low or 'status=sent' in t_low:
                veredito = "CLEAN"
            else:
                veredito = "CLEAN"

            transacoes.append({
                'queue_id': qid,
                'data_hora': data_hora,
                'remetente': remetente,
                'destinatario': destinatario,
                'score': score,
                'veredito': veredito
            })

        total_matches = len(filtered_lines)
        if total_matches > limit:
            result_lines = filtered_lines[-limit:]
        else:
            result_lines = filtered_lines

        if not result_lines:
            msg = "Nenhum registro de log encontrado para os critérios informados na Power Query."
            return jsonify({
                'success': True,
                'period': start_dt.strftime('%Y-%m-%d'),
                'period_label': period_label,
                'power_query': power_query,
                'limit': limit,
                'total_matches': 0,
                'lines': [],
                'events': [{'raw': msg, 'type': 'INFO'}],
                'raw_text': msg,
                'texto_bruto': msg,
                'transacoes': [],
                'transactions': []
            })

        return jsonify({
            'success': True,
            'period': start_dt.strftime('%Y-%m-%d'),
            'period_label': period_label,
            'power_query': power_query,
            'limit': limit,
            'total_matches': total_matches,
            'lines': result_lines,
            'events': [{'raw': line, 'type': 'LOG'} for line in result_lines],
            'raw_text': "\n".join(result_lines),
            'texto_bruto': "\n".join(result_lines),
            'transacoes': transacoes,
            'transactions': transacoes
        })

    except Exception as e:
        logger.error(f"Erro em email-tracking: {e}")
        return jsonify({
            'success': False,
            'error': f"[Erro Interno do Python]: {str(e)}",
            'raw_text': f"[Erro Interno do Python]: {str(e)}"
        }), 500


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


# ==========================================
# 4. MOTOR SOAR - GRAVAÇÃO DE REGRAS NO MARIADB
# ==========================================

def ensure_mail_rules_table():
    try:
        from sqlalchemy import text
        from models import db
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS mail_rules (
                id INT AUTO_INCREMENT PRIMARY KEY,
                target VARCHAR(255) NOT NULL,
                action_type ENUM('block', 'spam', 'whitelist') NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        db.session.commit()
    except Exception as e:
        try:
            from models import db
            db.session.rollback()
        except Exception:
            pass

@troubleshooting_bp.route('/rules/add', methods=['POST'])
@troubleshooting_bp.route('/api/rules/add', methods=['POST'])
def add_mail_rule():
    ensure_mail_rules_table()
    data = request.get_json(silent=True) or request.form or {}
    target = (data.get('target') or '').strip()
    action_type = (data.get('action_type') or '').strip().lower()

    if not target:
        return jsonify({'status': 'error', 'message': 'O campo target (e-mail/IP) é obrigatório.'}), 400

    if action_type not in ['block', 'spam', 'whitelist']:
        return jsonify({'status': 'error', 'message': 'Ação inválida. Escolha entre: block, spam ou whitelist.'}), 400

    try:
        from models import db, MailRule
        new_rule = MailRule(target=target, action_type=action_type)
        db.session.add(new_rule)
        db.session.commit()
        return jsonify({
            'status': 'success',
            'message': 'Regra aplicada com sucesso!',
            'rule': new_rule.to_dict() if hasattr(new_rule, 'to_dict') else {'target': target, 'action_type': action_type}
        })
    except Exception as e:
        try:
            from models import db
            db.session.rollback()
        except Exception:
            pass
        return jsonify({'status': 'error', 'message': f'Erro ao gravar regra no banco de dados: {str(e)}'}), 500

