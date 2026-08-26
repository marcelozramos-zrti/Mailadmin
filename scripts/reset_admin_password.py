#!/usr/bin/env python3
"""
MailAdmin Suite - Reset de Senha do Administrador
Permite redefinir a senha do usuário 'admin' (ou criar se não existir)
diretamente via linha de comando no servidor.

Uso:
  /opt/mailadmin/venv/bin/python3 scripts/reset_admin_password.py [NOVA_SENHA] [NOME_USUARIO]
  Exemplo:
  /opt/mailadmin/venv/bin/python3 scripts/reset_admin_password.py NovaSenhaForte123! admin
"""

import sys
import os
import getpass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from models import db, AdminUser
from sqlalchemy import text

def reset_password():
    print("================================================================")
    print("   MailAdmin Suite - Redefinição de Senha de Administrador      ")
    print("================================================================")

    # Argumentos de linha de comando ou prompt interativo
    new_password = None
    target_username = "admin"

    if len(sys.argv) >= 2:
        new_password = sys.argv[1]
    if len(sys.argv) >= 3:
        target_username = sys.argv[2]

    if not new_password:
        print(f"Definindo nova senha para o usuário: '{target_username}'")
        new_password = getpass.getpass("Digite a nova senha desejada: ")
        confirm_password = getpass.getpass("Confirme a nova senha: ")
        if new_password != confirm_password:
            print("\n[ERRO] As senhas não conferem! Operação cancelada.")
            sys.exit(1)

    if not new_password or len(new_password) < 4:
        print("\n[ERRO] A senha precisa ter pelo menos 4 caracteres.")
        sys.exit(1)

    app = create_app()
    with app.app_context():
        try:
            db.create_all()
            user = AdminUser.query.filter_by(username=target_username).first()

            if user:
                user.set_password(new_password)
                # Reseta 2FA caso esteja bloqueado
                if hasattr(user, 'otp_enabled'):
                    user.otp_enabled = False
                db.session.commit()
                print(f"\n✓ SUCESSO: A senha do usuário '{target_username}' foi atualizada!")
            else:
                new_user = AdminUser(username=target_username)
                new_user.set_password(new_password)
                if hasattr(new_user, 'role'):
                    new_user.role = 'admin'
                if hasattr(new_user, 'otp_enabled'):
                    new_user.otp_enabled = False
                db.session.add(new_user)
                db.session.commit()
                print(f"\n✓ SUCESSO: Usuário administrador '{target_username}' criado com a nova senha!")

            print(f"✓ Autenticação de dois fatores (2FA) desativada para recuperação.")
            print(f"\nVocê já pode acessar o painel com:")
            print(f"  Usuário: {target_username}")
            print(f"  Senha:   {new_password}")
            print("================================================================")

        except Exception as e:
            print(f"\n[ERRO] Falha ao atualizar senha no banco de dados: {e}", file=sys.stderr)
            sys.exit(1)

if __name__ == '__main__':
    reset_password()
