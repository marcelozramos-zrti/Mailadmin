#!/usr/bin/env python3
"""
MailAdmin Suite v1.1.0 - Mail Log Ingestor (Log-to-DB)
Lê incrementalmente o arquivo /var/log/mail.log e salva registros na tabela MariaDB mail_logs_history.
"""

import os
import sys
import re
import datetime
import pymysql

# Adiciona o diretório raiz ao path para reutilizar configurações se necessário
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

OFFSET_FILE = "/tmp/mail_log_offset.txt"
DEFAULT_LOG_PATH = os.environ.get("MAIL_LOG_PATH", "/var/log/mail.log")

def get_db_connection():
    db_user = os.environ.get('DB_USER', 'vmailadmin')
    db_pass = os.environ.get('DB_PASS', 'senha_vmail_123')
    db_host = os.environ.get('DB_HOST', '127.0.0.1')
    db_port = int(os.environ.get('DB_PORT', '3306'))
    db_name = os.environ.get('DB_NAME', 'vmail')

    return pymysql.connect(
        host=db_host,
        user=db_user,
        password=db_pass,
        database=db_name,
        port=db_port,
        charset='utf8mb4',
        autocommit=True,
        cursorclass=pymysql.cursors.DictCursor
    )

def ensure_table_exists(conn):
    """Cria a tabela mail_logs_history no MariaDB caso ela ainda não exista."""
    create_sql = """
    CREATE TABLE IF NOT EXISTS mail_logs_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        timestamp DATETIME NOT NULL,
        queue_id VARCHAR(50) NULL,
        sender VARCHAR(255) NULL,
        recipient VARCHAR(255) NULL,
        client_ip VARCHAR(45) NULL,
        status VARCHAR(50) NULL,
        message TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_mlh_timestamp (timestamp),
        INDEX idx_mlh_queue_id (queue_id),
        INDEX idx_mlh_sender (sender),
        INDEX idx_mlh_recipient (recipient),
        INDEX idx_mlh_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """
    with conn.cursor() as cursor:
        cursor.execute(create_sql)

def parse_syslog_timestamp(line):
    """
    Extrai e converte timestamp do formato syslog (ex: 'Aug 11 15:30:10') ou ISO para datetime.
    """
    now = datetime.datetime.now()
    # Tenta padrão ISO
    iso_m = re.match(r'^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})', line)
    if iso_m:
        try:
            return datetime.datetime.strptime(iso_m.group(1).replace('T', ' '), '%Y-%m-%d %H:%M:%S')
        except Exception:
            pass

    # Tenta padrão Syslog clássico (Aug 11 15:30:10)
    syslog_m = re.match(r'^([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2})', line)
    if syslog_m:
        try:
            ts_str = f"{syslog_m.group(1)} {now.year}"
            return datetime.datetime.strptime(ts_str, '%b %d %H:%M:%S %Y')
        except Exception:
            pass

    return now

def classify_status(line):
    line_lower = line.lower()
    if 'status=sent' in line_lower or '250 2.0.0 ok' in line_lower or '250 ok' in line_lower:
        return 'Sent'
    elif 'status=bounced' in line_lower or 'bounced' in line_lower or 'undeliverable' in line_lower:
        return 'Bounced'
    elif 'status=deferred' in line_lower:
        return 'Deferred'
    elif 'spam' in line_lower or 'score=' in line_lower or 'passed spam' in line_lower or 'blocked spam' in line_lower:
        return 'Spam'
    elif 'reject:' in line_lower or 'status=rejected' in line_lower or '554 5.7.1' in line_lower or 'access denied' in line_lower or 'blocked' in line_lower:
        return 'Rejected'
    elif 'sasl authentication failed' in line_lower or 'password mismatch' in line_lower:
        return 'AuthFail'
    return 'Info'

def extract_log_fields(line):
    timestamp = parse_syslog_timestamp(line)

    # Queue ID
    qid_m = re.search(r'\b([0-9A-Fa-f]{8,16}):', line)
    queue_id = qid_m.group(1) if qid_m else None

    # Sender (from=<...>)
    sender_m = re.search(r'from=<([^>]+)>', line, re.IGNORECASE)
    sender = sender_m.group(1) if sender_m else None

    # Recipient (to=<...>)
    rcpt_m = re.search(r'to=<([^>]+)>', line, re.IGNORECASE)
    recipient = rcpt_m.group(1) if rcpt_m else None

    # Client IP (client=... ou unknown[1.2.3.4] ou [1.2.3.4])
    ip_m = re.search(r'\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]', line)
    client_ip = ip_m.group(1) if ip_m else None

    status = classify_status(line)
    message = line[:1000] # Limita tamanho da mensagem preservando detalhes

    return {
        'timestamp': timestamp,
        'queue_id': queue_id,
        'sender': sender,
        'recipient': recipient,
        'client_ip': client_ip,
        'status': status,
        'message': message
    }

def run_ingestion(log_path=DEFAULT_LOG_PATH, truncate_on_success=True):
    if not os.path.exists(log_path):
        print(f"Arquivo de log {log_path} não encontrado no sistema.")
        return 0

    lines_processed = 0
    records_inserted = 0

    try:
        conn = get_db_connection()
        ensure_table_exists(conn)

        with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
            all_lines = f.readlines()

        if not all_lines:
            print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] O arquivo {log_path} já está vazio. Nenhum novo registro para importar.")
            conn.close()
            return 0

        with conn.cursor() as cursor:
            for line in all_lines:
                line_clean = line.strip()
                if not line_clean:
                    continue
                lines_processed += 1

                data = extract_log_fields(line_clean)
                
                sql = """
                INSERT INTO mail_logs_history (timestamp, queue_id, sender, recipient, client_ip, status, message, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                """
                cursor.execute(sql, (
                    data['timestamp'].strftime('%Y-%m-%d %H:%M:%S'),
                    data['queue_id'],
                    data['sender'],
                    data['recipient'],
                    data['client_ip'],
                    data['status'],
                    data['message']
                ))
                records_inserted += 1

        # Limpar / esvaziar o arquivo de log original após ingestão bem-sucedida no MariaDB
        if truncate_on_success:
            try:
                with open(log_path, 'w') as f:
                    f.truncate(0)
                if os.path.exists(OFFSET_FILE):
                    with open(OFFSET_FILE, 'w') as f:
                        f.write('0')
            except Exception as tr_err:
                print(f"Aviso ao esvaziar arquivo {log_path}: {tr_err}")

        conn.close()
        print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Ingestão concluída com sucesso: {lines_processed} linhas processadas, {records_inserted} registros gravados no MariaDB. Arquivo {log_path} esvaziado.")
        return records_inserted

    except Exception as e:
        err_msg = f"Erro na ingestão de logs: {e}"
        print(err_msg, file=sys.stderr)
        print(err_msg)
        sys.exit(1)

if __name__ == '__main__':
    run_ingestion()
