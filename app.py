#!/usr/bin/env python3
"""
MailAdmin Suite v1.1.0 - Painel Integrado de Administração de Servidores de E-mail
Substituto Completo do iRedAdmin em Python Flask + MariaDB vmail
"""

from flask import Flask, render_template, jsonify, request, send_from_directory, Response
from flask_login import LoginManager
from sqlalchemy import text, func
import os
import sys
import traceback

from config import Config
from logger_setup import logger, LOG_FILE
from models import (
    db, AdminUser, Domain, Mailbox, Alias, MailRule, MailLogHistory,
    SystemAuditLog, CronJob, SpamCustomRule, AntispamRule, AntispamSetting,
    AntispamImpersonationProfile, AntispamAnalysis, AntispamAnalysisRule, AntispamAudit
)
from blueprints.auth_bp import auth_bp
from blueprints.vmail_bp import vmail_bp
from blueprints.troubleshooting_bp import troubleshooting_bp
from blueprints.services_bp import services_bp
from blueprints.servers_bp import servers_bp
from blueprints.automation_bp import automation_bp, sync_system_crontab
from blueprints.antispam_bp import antispam_bp
from blueprints.dashboard_bp import dashboard_bp


def auto_heal_database_schema():
    """
    Executa migrações automáticas e auto-recuperação de colunas ausentes no banco MariaDB/MySQL.
    Previne erros 1054 'Unknown column' ou tabelas ausentes ao atualizar o painel.
    """
    migration_statements = [
        # Atualizações em vmail_admins
        "ALTER TABLE vmail_admins ADD COLUMN IF NOT EXISTS otp_secret VARCHAR(32) NULL;",
        "ALTER TABLE vmail_admins ADD COLUMN IF NOT EXISTS otp_enabled TINYINT(1) DEFAULT 0;",
        "ALTER TABLE vmail_admins ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'admin';",

        # Atualizações em mail_rules
        "ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS normalized_target VARCHAR(255) NULL;",
        "ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS canonical_pattern VARCHAR(255) NULL;",
        "ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS pattern_type VARCHAR(50) DEFAULT 'DOMAIN';",
        "ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS scope VARCHAR(50) DEFAULT 'DOMAIN_AND_SUBDOMAINS';",
        "ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS score FLOAT DEFAULT 100.0;",
        "ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS reason VARCHAR(255) DEFAULT 'Regra ativa de segurança';",
        "ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS origin VARCHAR(50) DEFAULT 'manual';",
        "ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS active TINYINT(1) DEFAULT 1;",
        "ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL;",

        # Atualizações em system_audit_logs
        "ALTER TABLE system_audit_logs ADD COLUMN IF NOT EXISTS severity_level VARCHAR(20) DEFAULT 'normal';",
        "ALTER TABLE system_audit_logs ADD COLUMN IF NOT EXISTS details_json TEXT NULL;",

        # Permissões do usuário vmailadmin
        "GRANT ALL PRIVILEGES ON vmail.* TO 'vmail'@'localhost';",
        "GRANT ALL PRIVILEGES ON vmail.* TO 'vmailadmin'@'localhost';",
        "GRANT ALL PRIVILEGES ON vmail.* TO 'vmail'@'127.0.0.1';",
        "GRANT ALL PRIVILEGES ON vmail.* TO 'vmailadmin'@'127.0.0.1';"
    ]

    for stmt in migration_statements:
        try:
            db.session.execute(text(stmt))
            db.session.commit()
        except Exception:
            try:
                db.session.rollback()
            except Exception:
                pass


def create_app():
    app = Flask(__name__)
    app.url_map.strict_slashes = False
    app.config.from_object(Config)

    # Inicialização do Banco de Dados SQLAlchemy
    db.init_app(app)

    # Configuração do Flask-Login
    login_manager = LoginManager()
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.session_protection = 'basic'

    @login_manager.user_loader
    def load_user(user_id):
        try:
            return AdminUser.query.get(int(user_id))
        except Exception as e:
            print(f"[AUTH ERROR] Erro ao carregar usuário {user_id}: {e}", file=sys.stderr)
            return None

    @login_manager.request_loader
    def load_user_from_request(req):
        # 1. Permite autenticação via header X-Admin-User enviado pela SPA
        admin_header = req.headers.get('X-Admin-User')
        if admin_header:
            try:
                user = AdminUser.query.filter(func.lower(AdminUser.username) == str(admin_header).strip().lower()).first()
                if user:
                    return user
            except Exception:
                pass
        return None

    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify({'success': False, 'message': 'Acesso negado. Por favor, faça login.', 'authenticated': False}), 401

    @app.route('/favicon.ico')
    def favicon():
        return Response('', status=204, mimetype='image/x-icon')

    @app.errorhandler(404)
    def not_found_error(e):
        if request.path.startswith('/api/'):
            return jsonify({'success': False, 'error': 'Not Found', 'message': 'Endpoint não encontrado.'}), 404
        return jsonify({'error': 'Not Found', 'path': request.path}), 404

    # Handlers Globais de Erro para Diagnóstico Imediato no Servidor
    @app.errorhandler(500)
    def internal_server_error(e):
        print("=" * 60, file=sys.stderr)
        print("  [MAILADMIN FATAL 500 ERROR] DETALHES DO ERRO:", file=sys.stderr)
        print("=" * 60, file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        print("=" * 60, file=sys.stderr)
        
        # Se for requisição de API, responde em JSON
        if request.path.startswith('/api/'):
            return jsonify({
                'success': False,
                'error': 'Internal Server Error',
                'message': str(e),
                'hint': 'Verifique as tabelas do banco de dados executando scripts/migrate_database.sql ou verifique o log com journalctl -u mailadmin -e'
            }), 500
            
        # Se for a página inicial, tenta renderizar com segurança
        try:
            template_path = os.path.join(app.root_path, 'templates', 'index.html')
            if os.path.exists(template_path):
                with open(template_path, 'r', encoding='utf-8', errors='replace') as f:
                    return Response(f.read(), mimetype='text/html; charset=utf-8')
            return send_from_directory(os.path.join(app.root_path, 'templates'), 'index.html', mimetype='text/html')
        except Exception:
            return f"""
            <!DOCTYPE html>
            <html>
            <head><title>MailAdmin - Erro 500</title><meta charset="utf-8"></head>
            <body style="font-family: sans-serif; padding: 40px; background: #f8fafc; color: #1e293b;">
                <div style="max-width: 700px; margin: auto; background: white; padding: 30px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <h2 style="color: #dc2626; margin-top: 0;">Erro 500 - Diagnóstico do MailAdmin</h2>
                    <p>Ocorreu uma falha interna na inicialização ou conexão do servidor:</p>
                    <pre style="background: #f1f5f9; padding: 15px; border-radius: 8px; font-size: 13px; overflow-x: auto;">{traceback.format_exc()}</pre>
                    <p style="font-size: 14px; color: #64748b;">Dica: Execute a migração do banco com: <code>mysql -u vmailadmin -p vmail &lt; scripts/migrate_database.sql</code></p>
                </div>
            </body>
            </html>
            """, 500

    @app.errorhandler(Exception)
    def handle_unhandled_exception(e):
        print(f"[UNHANDLED EXCEPTION on {request.path}]: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        if request.path.startswith('/api/'):
            return jsonify({'success': False, 'error': str(e)}), 500
        return internal_server_error(e)

    # Registro de Blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(vmail_bp)
    app.register_blueprint(troubleshooting_bp)
    app.register_blueprint(services_bp)
    app.register_blueprint(servers_bp)
    app.register_blueprint(automation_bp)
    app.register_blueprint(antispam_bp)
    app.register_blueprint(dashboard_bp)

    @app.before_request
    def log_incoming_request():
        client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        # Não loga polling repetitivo para não poluir
        if request.path not in ['/api/services/status', '/api/troubleshooting/logs/stream']:
            logger.info(f"[HTTP IN] {client_ip} -> {request.method} {request.path}")

    @app.after_request
    def log_outgoing_response(response):
        client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        if request.path not in ['/api/services/status', '/api/troubleshooting/logs/stream']:
            logger.info(f"[HTTP OUT] {request.method} {request.path} -> Status {response.status_code}")
        return response

    @app.route('/api/system/logs', methods=['GET'])
    def get_system_debug_logs():
        """Retorna as últimas 200 linhas do arquivo de log central mailadmin.log."""
        lines = []
        try:
            if os.path.exists(LOG_FILE):
                with open(LOG_FILE, 'r', encoding='utf-8', errors='replace') as f:
                    all_lines = f.readlines()
                    lines = all_lines[-200:] # Últimas 200 linhas
        except Exception as e:
            lines = [f"Erro ao ler arquivo de log ({LOG_FILE}): {e}"]
        return jsonify({
            'success': True,
            'log_file': LOG_FILE,
            'lines': lines
        })

    @app.route('/')
    @app.route('/index.html')
    def index():
        template_path = os.path.join(app.root_path, 'templates', 'index.html')
        if os.path.exists(template_path):
            with open(template_path, 'r', encoding='utf-8', errors='replace') as f:
                return Response(f.read(), mimetype='text/html; charset=utf-8')
        return send_from_directory(os.path.join(app.root_path, 'templates'), 'index.html', mimetype='text/html')

    @app.route('/api/rules/add', methods=['POST'])
    def root_api_rules_add():
        from blueprints.troubleshooting_bp import add_mail_rule
        return add_mail_rule()

    # Criação inicial de tabelas e auto-recuperação de esquema
    with app.app_context():
        try:
            db.create_all()
            auto_heal_database_schema()

            if not AdminUser.query.filter_by(username='admin').first():
                default_admin = AdminUser(username='admin')
                default_admin.set_password('senha_segura_123')
                db.session.add(default_admin)
                db.session.commit()
                print("-> Usuário admin inicial criado (Usuário: admin / Senha: senha_segura_123)")

            # Seed inicial de tarefas de automação padrão se vazio
            if CronJob.query.count() == 0:
                preset_jobs = [
                    CronJob(
                        name="Ingestão de Logs de E-mail para MariaDB (Log-to-DB)",
                        schedule_preset="1h",
                        cron_expression="0 * * * *",
                        command="python3 " + os.path.join(os.path.dirname(os.path.abspath(__file__)), "scripts", "mail_log_ingestor.py"),
                        enabled=True
                    ),
                    CronJob(
                        name="Backup Automatizado das Tabelas vmail",
                        schedule_preset="daily",
                        cron_expression="0 2 * * *",
                        command="mysqldump -u vmailadmin -p'senha_vmail_123' vmail > /var/backups/vmail_backup.sql",
                        enabled=True
                    ),
                    CronJob(
                        name="Expurgar Logs de Antispam Antigos (>30 Dias)",
                        schedule_preset="daily",
                        cron_expression="0 3 * * *",
                        command="find /var/log/amavis -name '*.gz' -mtime +30 -delete 2>/dev/null || true",
                        enabled=True
                    )
                ]
                for cj in preset_jobs:
                    db.session.add(cj)
                db.session.commit()
                sync_system_crontab()
                print("-> Tarefas agendadas padrão semeadas no banco de dados.")

        except Exception as e:
            print(f"-> Aviso na criação inicial de tabelas: {e}", file=sys.stderr)
            try:
                db.session.rollback()
            except Exception:
                pass

    return app

if __name__ == '__main__':
    app = create_app()
    print("===============================================================")
    print("  Iniciando MailAdmin Suite na porta 5000 (Acesso Interno VPN) ")
    print("===============================================================")
    app.run(host='0.0.0.0', port=5000, debug=False)
