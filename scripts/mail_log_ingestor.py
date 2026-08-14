#!/usr/bin/env python3
"""
MailAdmin Suite v1.1.0 - Mail Log Ingestor (Log-to-DB)
Lê incrementalmente o arquivo /var/log/mail.log, salva registros no MariaDB (tabela mail_logs_history) e esvazia o log original.
"""

import os
import sys
import re
import datetime

# Adiciona o diretório raiz ao path para reutilizar configurações
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

DEFAULT_LOG_PATH = os.environ.get("MAIL_LOG_PATH", "/var/log/mail.log")
OFFSET_FILE = "/tmp/mail_log_offset.txt"

def find_iredmail_db_credentials():
    """
    Tenta descobrir credenciais reais do MariaDB a partir de arquivos padrão do iRedMail/Postfix/Dovecot.
    """
    config_files = [
        os.path.join(ROOT_DIR, '.env'),
        '/etc/postfix/mysql-virtual_mailbox_domains.cf',
        '/etc/postfix/mysql_virtual_alias_maps.cf',
        '/etc/postfix/mysql_virtual_mailbox_maps.cf',
        '/etc/dovecot/dovecot-sql.conf.ext',
        '/root/.my.cnf',
        '/etc/mysql/debian.cnf'
    ]

    creds = {
        'user': os.environ.get('DB_USER', 'vmailadmin'),
        'password': os.environ.get('DB_PASS', ''),
        'host': os.environ.get('DB_HOST', '127.0.0.1'),
        'port': int(os.environ.get('DB_PORT', '3306')),
        'database': os.environ.get('DB_NAME', 'vmail')
    }

    # Carregar do .env se existir
    env_file = os.path.join(ROOT_DIR, '.env')
    if os.path.exists(env_file):
        try:
            with open(env_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if '=' in line and not line.startswith('#'):
                        k, v = line.split('=', 1)
                        k, v = k.strip(), v.strip().strip('"').strip("'")
                        if k == 'DB_USER': creds['user'] = v
                        elif k == 'DB_PASS': creds['password'] = v
                        elif k == 'DB_HOST': creds['host'] = v
                        elif k == 'DB_PORT': creds['port'] = int(v)
                        elif k == 'DB_NAME': creds['database'] = v
        except Exception:
            pass

    # Se ainda não tiver senha definida, tenta ler dos arquivos de config do iRedMail
    if not creds['password']:
        for cfg_path in config_files:
            if os.path.exists(cfg_path):
                try:
                    with open(cfg_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                        user_m = re.search(r'^\s*(?:user|hosts|user\s*=)\s*=?\s*([^\s;]+)', content, re.MULTILINE | re.IGNORECASE)
                        pass_m = re.search(r'^\s*(?:password|db_pass|password\s*=)\s*=?\s*([^\s;]+)', content, re.MULTILINE | re.IGNORECASE)
                        db_m = re.search(r'^\s*(?:dbname|database|db_name)\s*=?\s*([^\s;]+)', content, re.MULTILINE | re.IGNORECASE)

                        if pass_m:
                            creds['password'] = pass_m.group(1).strip()
                        if user_m and not os.environ.get('DB_USER'):
                            creds['user'] = user_m.group(1).strip()
                        if db_m and not os.environ.get('DB_NAME'):
                            creds['database'] = db_m.group(1).strip()

                        if creds['password']:
                            break
                except Exception:
                    continue

    if not creds['password']:
        creds['password'] = 'senha_vmail_123'

    return creds

def get_db_connection():
    import pymysql
    creds = find_iredmail_db_credentials()
    try:
        return pymysql.connect(
            host=creds['host'],
            user=creds['user'],
            password=creds['password'],
            database=creds['database'],
            port=creds['port'],
            charset='utf8mb4',
            autocommit=True,
            cursorclass=pymysql.cursors.DictCursor
        )
    except Exception as e:
        # Tenta conectar via unix_socket local como fallback
        try:
            return pymysql.connect(
                user=creds['user'],
                password=creds['password'],
                database=creds['database'],
                unix_socket='/var/run/mysqld/mysqld.sock',
                charset='utf8mb4',
                autocommit=True,
                cursorclass=pymysql.cursors.DictCursor
            )
        except Exception:
            raise e

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
    iso_m = re.match(r'^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})', line)
    if iso_m:
        try:
            return datetime.datetime.strptime(iso_m.group(1).replace('T', ' '), '%Y-%m-%d %H:%M:%S')
        except Exception:
            pass

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
    if 'status=sent' in line_lower or '250 2.0.0 ok' in line_lower or '250 ok' in line_lower or 'saved to inbox' in line_lower:
        return 'Sent'
    elif 'status=bounced' in line_lower or 'bounced' in line_lower or 'undeliverable' in line_lower:
        return 'Bounced'
    elif 'status=deferred' in line_lower:
        return 'Deferred'
    elif 'spam' in line_lower or 'score=' in line_lower or 'passed spam' in line_lower or 'blocked spam' in line_lower:
        return 'Spam'
    elif 'reject:' in line_lower or 'status=rejected' in line_lower or '554 5.7.1' in line_lower or 'access denied' in line_lower or 'blocked' in line_lower:
        return 'Rejected'
    elif 'sasl authentication failed' in line_lower or 'password mismatch' in line_lower or 'authentication failure' in line_lower:
        return 'AuthFail'
    return 'Info'

def extract_log_fields(line):
    timestamp = parse_syslog_timestamp(line)

    qid_m = re.search(r'\b([0-9A-Fa-f]{8,16}):', line)
    queue_id = qid_m.group(1) if qid_m else None

    sender_m = re.search(r'from=<([^>]+)>', line, re.IGNORECASE)
    sender = sender_m.group(1) if sender_m else None

    rcpt_m = re.search(r'to=<([^>]+)>', line, re.IGNORECASE)
    recipient = rcpt_m.group(1) if rcpt_m else None

    ip_m = re.search(r'\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]', line)
    client_ip = ip_m.group(1) if ip_m else None

    status = classify_status(line)
    message = line[:1000]

    return {
        'timestamp': timestamp,
        'queue_id': queue_id,
        'sender': sender,
        'recipient': recipient,
        'client_ip': client_ip,
        'status': status,
        'message': message
    }

def ingest_from_flask_app(log_path=DEFAULT_LOG_PATH, truncate_on_success=True):
    """
    Executa a ingestão utilizando os modelos SQLAlchemy da aplicação Flask ativa.
    """
    from models import db, MailLogHistory
    
    if not os.path.exists(log_path):
        return 0, f"Arquivo {log_path} não encontrado."

    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        all_lines = f.readlines()

    if not all_lines:
        return 0, f"O arquivo {log_path} já está vazio. Nenhum novo registro para importar."

    records_count = 0
    for line in all_lines:
        line_clean = line.strip()
        if not line_clean:
            continue
        data = extract_log_fields(line_clean)
        entry = MailLogHistory(
            timestamp=data['timestamp'],
            queue_id=data['queue_id'],
            sender=data['sender'],
            recipient=data['recipient'],
            client_ip=data['client_ip'],
            status=data['status'],
            message=data['message']
        )
        db.session.add(entry)
        records_count += 1

    db.session.commit()

    if truncate_on_success:
        try:
            with open(log_path, 'w') as f:
                f.truncate(0)
            if os.path.exists(OFFSET_FILE):
                with open(OFFSET_FILE, 'w') as f:
                    f.write('0')
        except Exception as tr_err:
            pass

    return records_count, f"{records_count} registros gravados com sucesso no banco de dados e arquivo {log_path} esvaziado."

def run_ingestion(log_path=DEFAULT_LOG_PATH, truncate_on_success=True):
    # 1. Tenta rodar via contexto do Flask se disponível
    try:
        from app import create_app
        flask_app = create_app()
        with flask_app.app_context():
            count, msg = ingest_from_flask_app(log_path, truncate_on_success)
            print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")
            return count
    except Exception as flask_err:
        pass

    # 2. Standalone PyMySQL ingestão
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
        err_msg = f"Erro na ingestão de logs: {e}\n-> Dica: Verifique a senha em /opt/mailadmin/.env (DB_PASS=...) ou aplique as permissões com: sudo mysql < /opt/mailadmin/scripts/grant_vmail_permissions.sql"
        print(err_msg, file=sys.stderr)
        print(err_msg)
        sys.exit(1)

if __name__ == '__main__':
    run_ingestion()
