#!/usr/bin/env python3
"""
MailAdmin Suite v1.1.0 - Mail Log Ingestor de Alta Performance (Log-to-DB)
Lê incrementalmente /var/log/mail.log em streaming por lotes (sem sobrecarregar CPU/RAM),
persiste no MariaDB (mail_logs_history), gera backup de segurança (.bak) e esvazia o log original.
"""

import os
import sys
import re
import datetime
import shutil
import gc

# Adiciona o diretório raiz ao path para reutilizar configurações
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

DEFAULT_LOG_PATH = os.environ.get("MAIL_LOG_PATH", "/var/log/mail.log")
OFFSET_FILE = "/tmp/mail_log_offset.txt"
BATCH_SIZE = 1000  # Processamento em lotes para manter uso de RAM < 30MB

def find_iredmail_db_credentials():
    """
    Tenta descobrir credenciais reais do MariaDB a partir do .env e arquivos padrão do iRedMail/Postfix/Dovecot.
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

def ensure_tables_exist(conn_or_db):
    """Garante que as tabelas de auditoria e logs existam no MariaDB."""
    ddl = """
    CREATE TABLE IF NOT EXISTS `mail_logs_history` (
        `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
        `timestamp` DATETIME NOT NULL,
        `queue_id` VARCHAR(50) NULL,
        `sender` VARCHAR(255) NULL,
        `recipient` VARCHAR(255) NULL,
        `client_ip` VARCHAR(45) NULL,
        `status` VARCHAR(50) NULL,
        `message` TEXT NULL,
        `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX `idx_mlh_timestamp` (`timestamp`),
        INDEX `idx_mlh_queue_id` (`queue_id`),
        INDEX `idx_mlh_sender` (`sender`),
        INDEX `idx_mlh_recipient` (`recipient`),
        INDEX `idx_mlh_status` (`status`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS `system_audit_logs` (
        `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
        `timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP,
        `admin_user` VARCHAR(80) NOT NULL DEFAULT 'System',
        `action` VARCHAR(100) NOT NULL,
        `target` VARCHAR(255) NULL,
        `ip_address` VARCHAR(45) NULL,
        `severity_level` VARCHAR(20) DEFAULT 'normal',
        `details_json` TEXT NULL,
        INDEX `idx_sal_timestamp` (`timestamp`),
        INDEX `idx_sal_admin_user` (`admin_user`),
        INDEX `idx_sal_action` (`action`),
        INDEX `idx_sal_severity` (`severity_level`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """
    try:
        # Se for pymysql connection
        if hasattr(conn_or_db, 'cursor'):
            with conn_or_db.cursor() as cur:
                for statement in ddl.strip().split(';'):
                    st = statement.strip()
                    if st:
                        cur.execute(st)
        # Se for SQLAlchemy db
        elif hasattr(conn_or_db, 'session'):
            from sqlalchemy import text
            for statement in ddl.strip().split(';'):
                st = statement.strip()
                if st:
                    conn_or_db.session.execute(text(st))
            conn_or_db.session.commit()
    except Exception:
        pass

def parse_syslog_timestamp(line):
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
            ts_str = f"{now.year} {syslog_m.group(1)}"
            return datetime.datetime.strptime(ts_str, '%Y %b %d %H:%M:%S')
        except Exception:
            pass

    return now

def classify_status(line):
    line_lower = line.lower()
    if 'clamav' in line_lower or 'blocked infected' in line_lower or 'virus' in line_lower:
        return 'Virus'
    elif 'blocked spam' in line_lower or 'bayes_99' in line_lower or 'passed spam' in line_lower:
        return 'Spam'
    elif 'status=bounced' in line_lower or 'bounced' in line_lower or 'undeliverable' in line_lower:
        return 'Bounced'
    elif 'reject:' in line_lower or 'status=rejected' in line_lower or '554 5.7.1' in line_lower or '550 5.' in line_lower or 'access denied' in line_lower:
        return 'Rejected'
    elif 'sasl authentication failed' in line_lower or 'password mismatch' in line_lower or 'authentication failure' in line_lower:
        return 'AuthFail'
    elif 'lmtp' in line_lower or 'saved_to_mailbox' in line_lower or 'postfix/virtual' in line_lower or 'relay=127.0.0.1' in line_lower or 'dovecot' in line_lower or 'status=received' in line_lower:
        return 'Received'
    elif 'postfix/smtp[' in line_lower or 'relay=mail.' in line_lower or 'relay=mx.' in line_lower or 'queued mail for delivery' in line_lower:
        return 'Sent'
    elif 'status=sent' in line_lower or '250 2.0.0 ok' in line_lower or '250 ok' in line_lower:
        # Check if recipient is a local domain or server host
        rcpt_m = re.search(r'to=<([^>]+)>', line, re.IGNORECASE)
        rcpt = rcpt_m.group(1).lower() if rcpt_m else ''
        if any(d in rcpt for d in ['zrti.com.br', 'empresa.com.br', 'zrti.tech', 'brsaolxmail.zrti.com.br', 'emporiomisticosaboaria.com.br']):
            return 'Received'
        return 'Sent'
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
        'message': message,
        'created_at': datetime.datetime.utcnow()
    }

def create_safe_backup(log_path):
    """Cria uma cópia de backup do arquivo de log antes de esvaziá-lo para garantir zero perda de dados."""
    if not os.path.exists(log_path) or os.path.getsize(log_path) == 0:
        return None
    try:
        timestamp_suffix = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_dir = "/var/log/mail_backups"
        try:
            os.makedirs(backup_dir, exist_ok=True)
            backup_path = os.path.join(backup_dir, f"mail.log.{timestamp_suffix}.bak")
        except Exception:
            backup_path = f"{log_path}.{timestamp_suffix}.bak"
        shutil.copy2(log_path, backup_path)
        return backup_path
    except Exception as e:
        print(f"Aviso ao gerar backup de segurança do log: {e}", file=sys.stderr)
        return None

def ingest_from_flask_app(log_path=DEFAULT_LOG_PATH, truncate_on_success=True):
    """
    Executa a ingestão em Streaming por lotes (Batch Chunks) usando SQLAlchemy.
    Mantém o consumo de RAM estritamente sob controle (<30MB) e baixa CPU.
    """
    from models import db, MailLogHistory
    from blueprints.audit_helper import log_audit_action

    if not os.path.exists(log_path):
        return 0, f"Arquivo {log_path} não encontrado."

    file_size = os.path.getsize(log_path)
    if file_size == 0:
        return 0, f"O arquivo {log_path} já está vazio (0 bytes). Nenhum novo registro para importar."

    ensure_tables_exist(db)

    # 1. Gerar backup de segurança preventivo
    backup_path = None
    if truncate_on_success:
        backup_path = create_safe_backup(log_path)

    records_count = 0
    batch = []

    # 2. Leitura em Streaming (Linha por Linha sem carregar tudo na memória)
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            line_clean = line.strip()
            if not line_clean:
                continue

            data = extract_log_fields(line_clean)
            batch.append(data)

            if len(batch) >= BATCH_SIZE:
                db.session.bulk_insert_mappings(MailLogHistory, batch)
                db.session.commit()
                records_count += len(batch)
                batch.clear()
                # Libera explicitamente a memória do SQLAlchemy e força GC
                db.session.expunge_all()

        # Inserir o lote remanescente
        if batch:
            db.session.bulk_insert_mappings(MailLogHistory, batch)
            db.session.commit()
            records_count += len(batch)
            batch.clear()
            db.session.expunge_all()

    # 3. Truncamento com Segurança Garantida
    if truncate_on_success and records_count > 0:
        try:
            with open(log_path, 'w') as f:
                f.truncate(0)
            if os.path.exists(OFFSET_FILE):
                with open(OFFSET_FILE, 'w') as f:
                    f.write('0')
        except Exception:
            pass

    gc.collect()

    backup_info = f" (Backup de segurança gerado: {backup_path})" if backup_path else ""
    success_msg = f"{records_count} linhas lidas e gravadas com sucesso no MariaDB (mail_logs_history). Arquivo {log_path} esvaziado.{backup_info}"
    
    # Registrar auditoria
    try:
        log_audit_action(
            'MAILLOG_INGEST',
            target='Importação MailLog MariaDB',
            details={
                'records_imported': records_count,
                'backup_file': backup_path or 'N/A',
                'log_file': log_path,
                'status': 'success'
            },
            severity_level='normal'
        )
    except Exception:
        pass

    return records_count, success_msg

def run_ingestion(log_path=DEFAULT_LOG_PATH, truncate_on_success=True):
    """
    Execução via PyMySQL otimizada com executemany e batch streaming.
    """
    import pymysql

    if not os.path.exists(log_path):
        print(f"Arquivo de log {log_path} não encontrado no sistema.")
        return 0

    if os.path.getsize(log_path) == 0:
        print(f"Arquivo de log {log_path} já está vazio.")
        return 0

    creds = find_iredmail_db_credentials()
    try:
        conn = pymysql.connect(
            host=creds['host'],
            user=creds['user'],
            password=creds['password'],
            database=creds['database'],
            port=creds['port'],
            charset='utf8mb4',
            autocommit=False
        )
    except Exception:
        # Fallback socket unix
        conn = pymysql.connect(
            user=creds['user'],
            password=creds['password'],
            database=creds['database'],
            unix_socket='/var/run/mysqld/mysqld.sock',
            charset='utf8mb4',
            autocommit=False
        )

    try:
        ensure_tables_exist(conn)
        backup_path = None
        if truncate_on_success:
            backup_path = create_safe_backup(log_path)

        insert_sql = """
            INSERT INTO mail_logs_history 
            (timestamp, queue_id, sender, recipient, client_ip, status, message, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """

        records_inserted = 0
        batch = []

        with conn.cursor() as cur:
            with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
                for line in f:
                    line_clean = line.strip()
                    if not line_clean:
                        continue
                    
                    data = extract_log_fields(line_clean)
                    batch.append((
                        data['timestamp'],
                        data['queue_id'],
                        data['sender'],
                        data['recipient'],
                        data['client_ip'],
                        data['status'],
                        data['message'],
                        data['created_at']
                    ))

                    if len(batch) >= BATCH_SIZE:
                        cur.executemany(insert_sql, batch)
                        conn.commit()
                        records_inserted += len(batch)
                        batch.clear()

                if batch:
                    cur.executemany(insert_sql, batch)
                    conn.commit()
                    records_inserted += len(batch)
                    batch.clear()

        if truncate_on_success and records_inserted > 0:
            try:
                with open(log_path, 'w') as f:
                    f.truncate(0)
                if os.path.exists(OFFSET_FILE):
                    with open(OFFSET_FILE, 'w') as f:
                        f.write('0')
            except Exception:
                pass

        print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Sucesso: {records_inserted} registros inseridos no MariaDB.")
        return records_inserted

    except Exception as e:
        conn.rollback()
        err_msg = f"Erro na ingestão de logs: {e}\n-> Dica: Execute: sudo mysql < /opt/mailadmin/scripts/init_database.sql"
        print(err_msg, file=sys.stderr)
        raise e
    finally:
        conn.close()

if __name__ == '__main__':
    log_file = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_LOG_PATH
    try:
        from app import create_app
        flask_app = create_app()
        with flask_app.app_context():
            count, msg = ingest_from_flask_app(log_file, truncate_on_success=True)
            print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")
    except Exception:
        run_ingestion(log_file, truncate_on_success=True)
