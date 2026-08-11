#!/usr/bin/env python3
"""
MailAdmin Suite - Painel Integrado de Administração de Servidores de E-mail
Substituto Completo do iRedAdmin em Python Flask + MariaDB vmail
"""

from flask import Flask, render_template, jsonify
from flask_login import LoginManager
import os

from config import Config
from models import db, AdminUser, Domain, Mailbox, Alias, MailRule
from blueprints.auth_bp import auth_bp
from blueprints.vmail_bp import vmail_bp
from blueprints.troubleshooting_bp import troubleshooting_bp
from blueprints.services_bp import services_bp

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

    @app.route('/')
    def index():
        return render_template('index.html')

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
        except Exception as e:
            print(f"-> Aviso na criação inicial de tabelas: {e}")

    return app

if __name__ == '__main__':
    app = create_app()
    print("===============================================================")
    print("  Iniciando MailAdmin Suite na porta 5000 (Acesso Interno VPN) ")
    print("===============================================================")
    app.run(host='0.0.0.0', port=5000, debug=False)
