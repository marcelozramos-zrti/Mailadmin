#!/usr/bin/env python3
"""
MailAdmin Suite v1.1.0 - Painel Integrado de Administração de Servidores de E-mail
Substituto Completo do iRedAdmin em Python Flask + MariaDB vmail
"""

from flask import Flask, render_template, jsonify
from flask_login import LoginManager
import os

from config import Config
from models import db, AdminUser, Domain, Mailbox, Alias, MailRule, MailLogHistory, SystemAuditLog, CronJob
from blueprints.auth_bp import auth_bp
from blueprints.vmail_bp import vmail_bp
from blueprints.troubleshooting_bp import troubleshooting_bp
from blueprints.services_bp import services_bp
from blueprints.automation_bp import automation_bp, sync_system_crontab

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

    @login_manager.user_loader
    def load_user(user_id):
        return AdminUser.query.get(int(user_id))

    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify({'success': False, 'message': 'Acesso negado. Por favor, faça login.', 'authenticated': False}), 401

    # Registro de Blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(vmail_bp)
    app.register_blueprint(troubleshooting_bp)
    app.register_blueprint(services_bp)
    app.register_blueprint(automation_bp)

    @app.route('/')
    def index():
        return render_template('index.html')

    @app.route('/api/rules/add', methods=['POST'])
    def root_api_rules_add():
        from blueprints.troubleshooting_bp import add_mail_rule
        return add_mail_rule()

    # Criação inicial de tabelas e usuário admin padrão se não existirem
    with app.app_context():
        try:
            db.create_all()
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
            print(f"-> Aviso na criação inicial de tabelas: {e}")

    return app

if __name__ == '__main__':
    app = create_app()
    print("===============================================================")
    print("  Iniciando MailAdmin Suite na porta 5000 (Acesso Interno VPN) ")
    print("===============================================================")
    app.run(host='0.0.0.0', port=5000, debug=False)
