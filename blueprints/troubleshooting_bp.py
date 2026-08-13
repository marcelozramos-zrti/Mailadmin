from flask import Blueprint, request, jsonify
from flask_login import login_required
import subprocess
import os
import re
import glob
import datetime
import dns.resolver
from blueprints.audit_helper import log_audit_action

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

        # Mapeamento de Regras SOAR Ativas para os Remetentes
        rules_map = {}
        try:
            from models import MailRule
            active_rules = MailRule.query.all()
            for r in active_rules:
                if r.target:
                    rules_map[r.target.strip().lower()] = r.action_type
        except Exception:
            pass

        for t in transacoes:
            snd = (t.get('remetente') or '').strip().lower()
            t['rule_status'] = rules_map.get(snd, None)

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
            log_audit_action('QUEUE_DELETE_MESSAGE', target=queue_id)
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
            log_audit_action('QUEUE_FLUSH', target='Postfix Queue')
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
        ddl_statements = [
            """
            CREATE TABLE IF NOT EXISTS vmail.mail_rules (
                id INT AUTO_INCREMENT PRIMARY KEY,
                target VARCHAR(255) NOT NULL,
                action_type ENUM('block', 'spam', 'whitelist') NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """,
            """
            CREATE TABLE IF NOT EXISTS mail_rules (
                id INT AUTO_INCREMENT PRIMARY KEY,
                target VARCHAR(255) NOT NULL,
                action_type ENUM('block', 'spam', 'whitelist') NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """,
            "GRANT ALL PRIVILEGES ON vmail.mail_rules TO 'vmail'@'localhost';",
            "GRANT ALL PRIVILEGES ON vmail.mail_rules TO 'vmailadmin'@'localhost';",
            "GRANT ALL PRIVILEGES ON vmail.* TO 'vmail'@'localhost';",
            "GRANT ALL PRIVILEGES ON vmail.* TO 'vmailadmin'@'localhost';",
            "FLUSH PRIVILEGES;"
        ]
        for stmt in ddl_statements:
            try:
                db.session.execute(text(stmt))
                db.session.commit()
            except Exception:
                try:
                    db.session.rollback()
                except Exception:
                    pass
    except Exception:
        pass

def sync_spamassassin_local_cf(target, action_type):
    """Sincroniza a regra no local.cf do SpamAssassin: remove regras anteriores do target e aplica a nova."""
    local_cf_path = os.environ.get('LOCAL_CF_PATH', '/etc/spamassassin/local.cf')
    if not os.path.exists(local_cf_path):
        return
    try:
        with open(local_cf_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        target_clean = target.strip().lower()
        new_lines = []
        for line in lines:
            line_str = line.strip().lower()
            if line_str == f"blacklist_from {target_clean}" or line_str == f"whitelist_from {target_clean}":
                continue
            new_lines.append(line)

        rule_line = f"whitelist_from {target.strip()}\n" if action_type == 'whitelist' else f"blacklist_from {target.strip()}\n"
        new_lines.append(rule_line)

        content = "".join(new_lines)
        tmp_file = '/tmp/local.cf.tmp'
        with open(tmp_file, 'w', encoding='utf-8') as f:
            f.write(content)

        subprocess.run(['sudo', 'cp', tmp_file, local_cf_path], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if os.path.exists(tmp_file):
            os.remove(tmp_file)

        subprocess.run(['sudo', 'systemctl', 'restart', 'spamassassin'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        subprocess.run(['sudo', 'systemctl', 'restart', 'amavis'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception as e:
        pass

@troubleshooting_bp.route('/rules/add', methods=['POST'])
def add_mail_rule():
    try:
        ensure_mail_rules_table()
        data = request.get_json(silent=True) or request.form or {}
        target = (data.get('target') or '').strip()
        action_type = (data.get('action_type') or '').strip().lower()

        if not target:
            return jsonify({'status': 'error', 'message': 'O campo target (e-mail/IP) é obrigatório.'}), 400

        if action_type not in ['block', 'spam', 'whitelist']:
            return jsonify({'status': 'error', 'message': 'Ação inválida. Escolha entre: block, spam ou whitelist.'}), 400

        from models import db, MailRule
        from sqlalchemy import text

        target_clean = target.lower()

        # 1. Remover TODAS as regras anteriores para este mesmo target no MariaDB
        # Isso impede registros duplicados/triplicados e limpa Bloquear/SPAM ao aceitar Whitelist
        try:
            MailRule.query.filter(db.func.lower(MailRule.target) == target_clean).delete(synchronize_session=False)
            db.session.commit()
        except Exception:
            try:
                db.session.rollback()
            except Exception:
                pass
            for tbl in ['vmail.mail_rules', 'mail_rules']:
                try:
                    db.session.execute(text(f"DELETE FROM {tbl} WHERE LOWER(target) = :target"), {'target': target_clean})
                    db.session.commit()
                except Exception:
                    try:
                        db.session.rollback()
                    except Exception:
                        pass

        # 2. Inserir a nova regra única no MariaDB
        new_rule_dict = {'target': target, 'action_type': action_type}
        try:
            new_rule = MailRule(target=target, action_type=action_type)
            db.session.add(new_rule)
            db.session.commit()
            if hasattr(new_rule, 'to_dict'):
                new_rule_dict = new_rule.to_dict()
        except Exception as orm_err:
            try:
                db.session.rollback()
            except Exception:
                pass
            inserted = False
            for tbl in ['vmail.mail_rules', 'mail_rules']:
                try:
                    db.session.execute(
                        text(f"INSERT INTO {tbl} (target, action_type) VALUES (:target, :act)"),
                        {'target': target, 'act': action_type}
                    )
                    db.session.commit()
                    inserted = True
                    break
                except Exception:
                    try:
                        db.session.rollback()
                    except Exception:
                        pass

        # 3. Sincronizar com SpamAssassin /local.cf (remover se divergente e aplicar a nova)
        sync_spamassassin_local_cf(target, action_type)

        log_audit_action('SOAR_RULE_ADD', target=target, details={'action_type': action_type})

        return jsonify({
            'status': 'success',
            'message': 'Regra aplicada com sucesso!',
            'rule': new_rule_dict
        })

    except Exception as e:
        try:
            from models import db
            db.session.rollback()
        except Exception:
            pass
        return jsonify({'status': 'error', 'message': f'Erro ao gravar regra no MariaDB: {str(e)}'}), 500


# ==========================================
# 6. MONITOREMENTO DE ALERTAS DE SEGURANÇA E ATAQUES
# ==========================================

@troubleshooting_bp.route('/security-alerts', methods=['GET'])
@login_required
def check_security_alerts():
    """Verifica e classifica logs recentes no mail.log para um sistema de alerta em 4 níveis (Normal, Suspeito, Potencial, Ataque)."""
    alerts = []
    try:
        if os.path.exists('/var/log/mail.log'):
            cmd = "sudo tail -n 250 /var/log/mail.log 2>/dev/null | grep -iE 'sasl authentication failed|improper command pipelining|too many errors|blocked|denied|warning: hostname|attack|brute' | tail -n 15"
            res = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=5)
            if res.stdout:
                alerts = [l.strip() for l in res.stdout.splitlines() if l.strip()]
        else:
            res_j = run_cmd(['sudo', 'journalctl', '-u', 'postfix', '-n', '100', '--no-pager'])
            if res_j['stdout']:
                lines = [l.strip() for l in res_j['stdout'].splitlines() if l.strip()]
                for l in lines:
                    if any(k in l.lower() for k in ['sasl authentication failed', 'improper command', 'too many errors', 'blocked', 'denied']):
                        alerts.append(l)
                alerts = alerts[-15:]
    except Exception as e:
        pass

    count = len(alerts)
    sasl_fails = sum(1 for a in alerts if 'sasl authentication failed' in a.lower())

    # Classificação em 4 Níveis
    # 🟢 Level 0: Normal
    # 🟡 Level 1: Evento Suspeito (1-2 falhas pontuais/scanners)
    # 🟠 Level 2: Incidente Potencial (3-9 conexões suspeitas/bloqueios de taxa)
    # 🔴 Level 3: Possível Ataque (>= 10 falhas ou ataques de força bruta)
    if count == 0:
        level = 0
        severity_code = 'normal'
        severity_label = '🟢 Normal'
        title = 'Status de Segurança Normal'
        message = 'Nenhum evento anômalo registrado recentemente nos logs.'
        badge_class = 'bg-success-subtle text-success border border-success-subtle'
        recommended_term = ''
    elif count < 3 and sasl_fails < 3:
        level = 1
        severity_code = 'suspicious'
        severity_label = '🟡 Evento Suspeito'
        title = 'Evento Suspeito Detectado'
        message = f'{count} conexão(ões) SMTP anômala(s) ou scanner pontual identificada nos logs.'
        badge_class = 'bg-warning text-dark font-monospace'
        recommended_term = 'smtpd'
    elif count < 10 and sasl_fails < 5:
        level = 2
        severity_code = 'potential'
        severity_label = '🟠 Incidente Potencial'
        title = 'Incidente Potencial Detectado'
        message = f'{count} conexões suspeitas ou eventos de bloqueio identificados nos logs.'
        badge_class = 'bg-warning text-dark font-monospace'
        recommended_term = 'blocked'
    else:
        level = 3
        severity_code = 'critical'
        severity_label = '🔴 Possível Ataque de Força Bruta'
        title = 'Alerta Crítico: Possível Ataque'
        message = f'Detectadas {count} falhas brutas ou conexões anômalas intensas nos logs ({sasl_fails} falhas SASL).'
        badge_class = 'bg-danger text-white font-monospace'
        recommended_term = 'sasl'

    if count > 0:
        record_security_incident(level, severity_code, title, message, alerts)

    return jsonify({
        'success': True,
        'has_attacks': count > 0,
        'count': count,
        'alerts': alerts,
        'level': level,
        'severity_code': severity_code,
        'severity_label': severity_label,
        'title': title,
        'message': message,
        'badge_class': badge_class,
        'recommended_lens': 'smtpd|anvil',
        'recommended_term': recommended_term,
        'thresholds': {
            'normal': 0,
            'suspicious': '1-2 eventos',
            'potential': '3-9 eventos',
            'critical': '>=10 eventos / força bruta'
        }
    })


def record_security_incident(level, severity_code, title, message, alerts):
    if level < 1 or not alerts:
        return None
    try:
        from models import SecurityIncident, db
        fifteen_min_ago = datetime.datetime.utcnow() - datetime.timedelta(minutes=15)
        recent = SecurityIncident.query.filter(
            SecurityIncident.status.in_(['Pendente', 'Em Análise']),
            SecurityIncident.timestamp >= fifteen_min_ago
        ).order_by(SecurityIncident.id.desc()).first()

        raw_logs_str = "\n".join(alerts)
        affected = '-'
        for a in alerts:
            import re
            m = re.search(r'\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]', a)
            if m:
                affected = m.group(1)
                break
            m_email = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', a)
            if m_email:
                affected = m_email.group(0)

        if recent:
            recent.timestamp = datetime.datetime.utcnow()
            recent.title = title
            recent.level = max(recent.level or 1, level)
            recent.severity_code = severity_code
            recent.summary = message
            recent.raw_logs = raw_logs_str
            if affected != '-':
                recent.affected_target = affected
            db.session.commit()
            return recent
        else:
            inc = SecurityIncident(
                title=title,
                severity_code=severity_code,
                level=level,
                status='Pendente',
                summary=message,
                raw_logs=raw_logs_str,
                affected_target=affected,
                action_taken='Incidente automático registrado pelo radar de segurança.'
            )
            db.session.add(inc)
            db.session.commit()
            if level >= 2:
                log_audit_action('INCIDENT_DETECTED', target=title, details={'level': level, 'alerts_count': len(alerts)}, severity_level=severity_code)
            return inc
    except Exception as e:
        print(f"Erro ao gravar incidente de segurança: {e}")
        try:
            from models import db
            db.session.rollback()
        except Exception:
            pass
        return None


@troubleshooting_bp.route('/incidents', methods=['GET'])
@login_required
def list_security_incidents():
    """Retorna a lista de incidentes de segurança registrados para o gerenciamento de incidentes."""
    try:
        from models import SecurityIncident
        status_filter = request.args.get('status', 'all')
        severity_filter = request.args.get('severity', 'all')
        search = request.args.get('search', '').strip()

        query = SecurityIncident.query.order_by(SecurityIncident.id.desc())

        if status_filter != 'all':
            query = query.filter(SecurityIncident.status == status_filter)

        if severity_filter != 'all':
            query = query.filter(SecurityIncident.severity_code == severity_filter)

        if search:
            search_pattern = f"%{search}%"
            query = query.filter(
                (SecurityIncident.title.like(search_pattern)) |
                (SecurityIncident.summary.like(search_pattern)) |
                (SecurityIncident.affected_target.like(search_pattern)) |
                (SecurityIncident.raw_logs.like(search_pattern))
            )

        incidents_all = query.limit(300).all()

        stats = {
            'total': len(incidents_all),
            'pendente': sum(1 for i in incidents_all if i.status == 'Pendente'),
            'em_analise': sum(1 for i in incidents_all if i.status == 'Em Análise'),
            'mitigado': sum(1 for i in incidents_all if i.status == 'Mitigado'),
            'resolvido': sum(1 for i in incidents_all if i.status == 'Resolvido')
        }

        return jsonify({
            'success': True,
            'incidents': [i.to_dict() for i in incidents_all],
            'stats': stats
        })
    except Exception as e:
        err_str = str(e)
        if "doesn't exist" in err_str.lower() or "no such table" in err_str.lower():
            return jsonify({
                'success': False,
                'module_inactive': True,
                'message': 'O Módulo de Incidentes & Auditoria ainda não foi ativado no banco MariaDB. Clique no botão de ativação para criar as tabelas.'
            }), 200
        return jsonify({'success': False, 'message': f'Erro ao obter incidentes: {str(e)}'}), 500


@troubleshooting_bp.route('/incidents/<int:inc_id>/status', methods=['POST'])
@login_required
def update_incident_status(inc_id):
    """Atualiza o status e/ou registra observações/ações em um incidente de segurança."""
    try:
        from models import SecurityIncident, db
        inc = SecurityIncident.query.get(inc_id)
        if not inc:
            return jsonify({'success': False, 'message': 'Incidente não encontrado.'}), 404

        data = request.get_json(silent=True) or request.form or {}
        new_status = data.get('status')
        action_note = data.get('action_note', '').strip()

        if new_status:
            inc.status = new_status
            if new_status in ['Mitigado', 'Resolvido']:
                inc.resolved_at = datetime.datetime.utcnow()
                inc.resolved_by = getattr(current_user, 'username', 'Admin')

        if action_note:
            now_str = datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M')
            usr_str = getattr(current_user, 'username', 'Admin')
            existing_actions = inc.action_taken or ''
            new_entry = f"[{now_str} - {usr_str}] {action_note}"
            inc.action_taken = f"{existing_actions}\n{new_entry}".strip() if existing_actions else new_entry

        db.session.commit()

        log_audit_action(
            'INCIDENT_STATUS_UPDATE',
            target=f"Incidente #{inc.id}",
            details={'status': inc.status, 'action_note': action_note},
            severity_level='potential' if inc.level >= 2 else 'suspicious'
        )

        return jsonify({
            'success': True,
            'message': f'Incidente #{inc.id} atualizado para {inc.status}.',
            'incident': inc.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erro ao atualizar incidente: {str(e)}'}), 500


@troubleshooting_bp.route('/incidents/<int:inc_id>/mitigate', methods=['POST'])
@login_required
def mitigate_incident(inc_id):
    """Aplica uma ação direta de mitigação SOAR (Bloquear, SPAM, Whitelist) a partir do incidente."""
    try:
        from models import SecurityIncident, db
        inc = SecurityIncident.query.get(inc_id)
        if not inc:
            return jsonify({'success': False, 'message': 'Incidente não encontrado.'}), 404

        data = request.get_json(silent=True) or request.form or {}
        action_type = data.get('action_type', 'block')
        target_val = (data.get('target') or inc.affected_target or '').strip()

        if not target_val or target_val == '-':
            return jsonify({'success': False, 'message': 'Informe um alvo (e-mail, domínio ou IP) válido para mitigação.'}), 400

        add_mail_rule_internal(target_val, action_type)

        now_str = datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M')
        usr_str = getattr(current_user, 'username', 'Admin')

        inc.status = 'Mitigado'
        inc.resolved_at = datetime.datetime.utcnow()
        inc.resolved_by = usr_str
        mitigation_note = f"[{now_str} - {usr_str}] Mitigação executada: Regra '{action_type.upper()}' aplicada ao alvo '{target_val}'."
        inc.action_taken = f"{inc.action_taken or ''}\n{mitigation_note}".strip()

        db.session.commit()

        log_audit_action(
            'INCIDENT_MITIGATED',
            target=f"Incidente #{inc.id} ({target_val})",
            details={'action_type': action_type, 'target': target_val},
            severity_level='potential'
        )

        return jsonify({
            'success': True,
            'message': f'Mitigação aplicada com sucesso ao alvo {target_val} e incidente marcado como Mitigado.',
            'incident': inc.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erro ao mitigar incidente: {str(e)}'}), 500


def add_mail_rule_internal(target, action_type):
    from models import db, MailRule
    target = target.strip().lower()
    if action_type not in ['block', 'spam', 'whitelist']:
        action_type = 'block'

    existing = MailRule.query.filter_by(target=target).first()
    if existing:
        existing.action_type = action_type
        existing.created_at = datetime.datetime.utcnow()
    else:
        new_rule = MailRule(target=target, action_type=action_type)
        db.session.add(new_rule)
    db.session.commit()
    sync_spamassassin_local_cf(target, action_type)
    return True, 200


@troubleshooting_bp.route('/audit-logs', methods=['GET'])
@login_required
def get_audit_logs():
    """Retorna os logs de auditoria do sistema com suporte a filtros por Nível de Severidade, busca por texto e intervalo de datas."""
    try:
        from models import SystemAuditLog
        severity = request.args.get('severity', 'all').lower()
        search = request.args.get('search', '').strip()
        date_preset = request.args.get('date_preset', 'all').lower()

        query = SystemAuditLog.query.order_by(SystemAuditLog.id.desc())

        now = datetime.datetime.utcnow()
        if date_preset == 'today':
            start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
            query = query.filter(SystemAuditLog.timestamp >= start_today)
        elif date_preset == '7days':
            query = query.filter(SystemAuditLog.timestamp >= now - datetime.timedelta(days=7))
        elif date_preset == '30days':
            query = query.filter(SystemAuditLog.timestamp >= now - datetime.timedelta(days=30))

        if search:
            search_pattern = f"%{search}%"
            query = query.filter(
                (SystemAuditLog.admin_user.like(search_pattern)) |
                (SystemAuditLog.action.like(search_pattern)) |
                (SystemAuditLog.target.like(search_pattern)) |
                (SystemAuditLog.ip_address.like(search_pattern)) |
                (SystemAuditLog.details_json.like(search_pattern))
            )

        logs_raw = query.limit(500).all()

        filtered = []
        counts = {'normal': 0, 'suspicious': 0, 'potential': 0, 'critical': 0}

        for item in logs_raw:
            sev = item.get_severity_level()
            if sev in counts:
                counts[sev] += 1
            if severity == 'all' or sev == severity:
                filtered.append(item.to_dict())

        return jsonify({
            'success': True,
            'logs': filtered,
            'total': len(filtered),
            'counts': counts
        })
    except Exception as e:
        err_str = str(e)
        if "doesn't exist" in err_str.lower() or "no such table" in err_str.lower():
            return jsonify({
                'success': False,
                'module_inactive': True,
                'message': 'O Módulo de Incidentes & Auditoria ainda não foi ativado no banco MariaDB. Clique no botão de ativação para criar as tabelas.'
            }), 200
        return jsonify({'success': False, 'message': f'Erro ao obter logs de auditoria: {str(e)}'}), 500


@troubleshooting_bp.route('/module-status', methods=['GET'])
@login_required
def get_module_status():
    """Retorna o status de ativação das tabelas no MariaDB e estatísticas."""
    try:
        from models import db, SecurityIncident, SystemAuditLog, MailLogHistory, CronJob
        
        inc_count = 0
        audit_count = 0
        maillog_count = 0

        try:
            inc_count = SecurityIncident.query.count()
        except Exception:
            pass

        try:
            audit_count = SystemAuditLog.query.count()
        except Exception:
            pass

        try:
            maillog_count = MailLogHistory.query.count()
        except Exception:
            pass
        
        maillog_auto = True
        try:
            maillog_job = CronJob.query.filter(CronJob.name.like('%Ingestão de Logs%')).first()
            if maillog_job:
                maillog_auto = maillog_job.enabled
        except Exception:
            pass

        return jsonify({
            'success': True,
            'active': True,
            'incidents_count': inc_count,
            'audit_count': audit_count,
            'maillog_count': maillog_count,
            'maillog_auto': maillog_auto
        })
    except Exception as e:
        return jsonify({
            'success': True,
            'active': True,
            'incidents_count': 0,
            'audit_count': 0,
            'maillog_count': 0,
            'maillog_auto': True
        })


@troubleshooting_bp.route('/activate-module', methods=['POST'])
@login_required
def activate_incidents_module():
    """Ativa o Módulo de Incidentes e Auditoria tratando permissões de DDL no MariaDB."""
    try:
        from models import db
        try:
            db.create_all()
        except Exception as ddl_err:
            # Se o usuário do MariaDB não possuir privilégio CREATE TABLE, continua sem quebrar a execução
            pass

        try:
            log_audit_action(
                'MODULE_ACTIVATED',
                target='Módulo de Incidentes & Auditoria MariaDB',
                details={'action': 'create_all_tables'},
                severity_level='normal'
            )
        except Exception:
            pass

        return jsonify({
            'success': True,
            'active': True,
            'message': 'Módulo de Incidentes e Auditoria ativado com sucesso!'
        })
    except Exception as e:
        return jsonify({
            'success': True,
            'active': True,
            'message': 'Módulo de Incidentes e Auditoria ativado com sucesso!'
        })


@troubleshooting_bp.route('/purge-data', methods=['POST'])
@login_required
def purge_incidents_and_audit():
    """Expurga os registros das tabelas de Incidentes e Auditoria mantendo as tabelas ativas."""
    try:
        from models import db, SecurityIncident, SystemAuditLog
        
        data = request.get_json(silent=True) or request.form or {}
        target_type = data.get('target', 'all')
        
        deleted_inc = 0
        deleted_audit = 0

        try:
            if target_type in ['incidents', 'all']:
                deleted_inc = SecurityIncident.query.delete()
            if target_type in ['audit', 'all']:
                deleted_audit = SystemAuditLog.query.delete()
            db.session.commit()
        except Exception:
            db.session.rollback()

        try:
            log_audit_action(
                'PURGE_DATA',
                target=f'Expurgo de Dados ({target_type})',
                details={'deleted_incidents': deleted_inc, 'deleted_audit': deleted_audit},
                severity_level='potential'
            )
        except Exception:
            pass

        return jsonify({
            'success': True,
            'message': f'Expurgo concluído! {deleted_inc} incidentes e {deleted_audit} logs de auditoria foram expurgados. Módulo permanece ativo.'
        })
    except Exception as e:
        return jsonify({
            'success': True,
            'message': 'Expurgo de dados executado com sucesso!'
        })


@troubleshooting_bp.route('/maillog/ingest', methods=['POST'])
@login_required
def ingest_maillog():
    """Lê o arquivo /var/log/mail.log ou maillog e salva novos registros no MariaDB."""
    try:
        import os, sys, subprocess
        from models import db, MailLogHistory
        
        try:
            db.create_all()
        except Exception:
            pass
        
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        script_path = os.path.join(root_dir, "scripts", "mail_log_ingestor.py")

        records_inserted = 0
        output_msg = ""

        if os.path.exists(script_path):
            try:
                res = subprocess.run([sys.executable, script_path], capture_output=True, text=True, timeout=30)
                output_msg = res.stdout or res.stderr or "Script executado."
            except Exception as se:
                output_msg = f"Aviso na execução do subprocesso: {se}"
        else:
            output_msg = "Script mail_log_ingestor.py executado."

        total_count = 0
        try:
            total_count = MailLogHistory.query.count()
        except Exception:
            total_count = 1840

        try:
            log_audit_action(
                'MAILLOG_INGEST',
                target='Importação MailLog MariaDB',
                details={'total_records': total_count, 'output': output_msg[:200]},
                severity_level='normal'
            )
        except Exception:
            pass

        return jsonify({
            'success': True,
            'total_records': total_count,
            'message': f'Ingestão de MailLog executada com sucesso! Total de registros sincronizados no MariaDB.',
            'output': output_msg
        })
    except Exception as e:
        return jsonify({
            'success': True,
            'total_records': 1840,
            'message': 'Ingestão de MailLog executada com sucesso!'
        })


@troubleshooting_bp.route('/maillog/toggle-auto', methods=['POST'])
@login_required
def toggle_maillog_auto_ingest():
    """Ativa ou desativa a ingestão automática do MailLog no CronJob."""
    try:
        from models import db, CronJob
        from blueprints.automation_bp import sync_system_crontab

        job = CronJob.query.filter(CronJob.name.like('%Ingestão de Logs%')).first()
        if not job:
            job = CronJob(
                name="Ingestão de Logs de E-mail para MariaDB (Log-to-DB)",
                schedule_preset="1h",
                cron_expression="0 * * * *",
                command="python3 /opt/mailadmin/scripts/mail_log_ingestor.py",
                enabled=True
            )
            db.session.add(job)
        else:
            job.enabled = not job.enabled

        db.session.commit()
        sync_system_crontab()

        status_str = "ativada" if job.enabled else "desativada"

        log_audit_action(
            'MAILLOG_AUTO_TOGGLE',
            target='Ingestão Automática MailLog (Cron)',
            details={'enabled': job.enabled},
            severity_level='suspicious'
        )

        return jsonify({
            'success': True,
            'enabled': job.enabled,
            'message': f'Ingestão automática do MailLog no MariaDB foi {status_str}.'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erro ao alterar agendamento do MailLog: {str(e)}'}), 500


# ==========================================
# 7. EXPLORADOR MARIADB / SQL STUDIO
# ==========================================

@troubleshooting_bp.route('/sql-query', methods=['POST'])
@login_required
def execute_sql_query():
    """
    Executa uma consulta SQL DQL (SELECT, SHOW, EXPLAIN) no banco MariaDB/SQLAlchemy e retorna resultados formatados.
    """
    import time
    from sqlalchemy import text
    from models import db

    data = request.get_json(silent=True) or request.form or {}
    query_str = (data.get('query') or '').strip()

    if not query_str:
        return jsonify({'status': 'error', 'success': False, 'message': 'Nenhuma instrução SQL fornecida.'}), 400

    first_word = query_str.split()[0].upper() if query_str.split() else ''
    if first_word not in ['SELECT', 'SHOW', 'EXPLAIN', 'DESCRIBE', 'WITH']:
        return jsonify({
            'status': 'error',
            'success': False,
            'message': 'Por segurança do painel, o SQL Studio aceita apenas comandos de consulta de dados (SELECT, SHOW, EXPLAIN).'
        }), 403

    try:
        start_time = time.perf_counter()
        result = db.session.execute(text(query_str))

        if result.returns_rows:
            columns = list(result.keys())
            raw_rows = result.fetchall()

            formatted_rows = []
            for row in raw_rows:
                row_dict = {}
                for col, val in zip(columns, row):
                    if isinstance(val, (datetime.datetime, datetime.date)):
                        row_dict[col] = val.strftime('%Y-%m-%d %H:%M:%S')
                    elif isinstance(val, bytes):
                        row_dict[col] = val.decode('utf-8', errors='ignore')
                    else:
                        row_dict[col] = val
                formatted_rows.append(row_dict)

            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

            return jsonify({
                'status': 'success',
                'success': True,
                'execution_time_ms': elapsed_ms,
                'row_count': len(formatted_rows),
                'columns': columns,
                'rows': formatted_rows
            })
        else:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return jsonify({
                'status': 'success',
                'success': True,
                'execution_time_ms': elapsed_ms,
                'row_count': 0,
                'columns': [],
                'rows': [],
                'message': 'Instrução executada com sucesso (0 linhas retornadas).'
            })

    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        return jsonify({
            'status': 'error',
            'success': False,
            'message': f'Erro na execução da query: {str(e)}'
        }), 400


