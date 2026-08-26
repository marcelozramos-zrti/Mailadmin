#!/usr/bin/env python3
"""
MailAdmin Diagnostic Tool
Executa diagnósticos diretos no banco de dados e na camada de autenticação do MailAdmin.
Uso: python3 scripts/diagnose_auth.py
"""
import os
import sys

# Adiciona o diretório raiz ao PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app
from models import db, AdminUser, Mailbox, verify_password_hash
from sqlalchemy import text

def run_diagnostics():
    print("=" * 65)
    print("       DIAGNÓSTICO DA BASE DE DADOS E AUTENTICAÇÃO MAILADMIN    ")
    print("=" * 65)
    
    app = create_app()
    with app.app_context():
        # 1. Testar conexão com o banco de dados
        print("\n[1/4] Testando conexão com MariaDB/MySQL...")
        try:
            res = db.session.execute(text("SELECT DATABASE(), USER(), VERSION()")).fetchone()
            print(f"  ✓ Conexão OK! Banco: {res[0]} | Usuário: {res[1]} | Versão: {res[2]}")
        except Exception as e:
            print(f"  ❌ ERRO CRÍTICO ao conectar ao banco de dados: {e}")
            print("  Verifique as credenciais no arquivo config.py ou .env")
            return

        # 2. Verificar Administradores na tabela vmail_admins
        print("\n[2/4] Verificando administradores na tabela 'vmail_admins'...")
        try:
            admins = AdminUser.query.all()
            if admins:
                print(f"  ✓ {len(admins)} administrador(es) encontrado(s):")
                for a in admins:
                    hash_preview = (a.password_hash[:20] + "...") if a.password_hash else "SEM HASH"
                    print(f"    - ID: {a.id} | Usuário: '{a.username}' | Perfil: '{a.role}' | MFA: {'Ativo' if a.otp_enabled else 'Inativo'} | Hash: {hash_preview}")
            else:
                print("  ⚠️ Nenhum administrador encontrado em 'vmail_admins'!")
                print("  Para criar o admin padrão execute: python3 scripts/reset_admin_password.py admin")
        except Exception as e:
            print(f"  ❌ Erro ao consultar vmail_admins: {e}")

        # 3. Verificar Contas de E-mail na tabela mailbox
        print("\n[3/4] Verificando contas na tabela 'mailbox' (Dovecot/Postfix)...")
        try:
            mailboxes = Mailbox.query.limit(5).all()
            total_mb = Mailbox.query.count()
            print(f"  ✓ Total de contas de e-mail cadastradas: {total_mb}")
            for m in mailboxes:
                h_prev = (m.password[:20] + "...") if m.password else "SEM SENHA"
                print(f"    - E-mail: '{m.username}' | Domínio: '{m.domain}' | Ativo: {m.active} | Hash: {h_prev}")
        except Exception as e:
            print(f"  ❌ Erro ao consultar tabela mailbox: {e}")

        # 4. Teste interativo opcional de senha
        print("\n[4/4] Teste de validação de credencial:")
        test_user = input("  Digite o nome de usuário a testar (ou ENTER para 'admin'): ").strip() or "admin"
        test_pass = input(f"  Digite a senha para '{test_user}': ").strip()
        
        if test_pass:
            admin_obj = AdminUser.query.filter_by(username=test_user).first()
            if admin_obj:
                valid = admin_obj.check_password(test_pass)
                if valid:
                    print(f"  🎉 SUCESSO: A senha informada é VÁLIDA para o administrador '{test_user}'!")
                else:
                    print(f"  ❌ FALHA: A senha NÃO confere com o hash salvo no banco para '{test_user}'.")
                    print(f"  Para redefinir execute: python3 scripts/reset_admin_password.py {test_user}")
            else:
                # Tenta na mailbox
                mbox_obj = Mailbox.query.filter_by(username=test_user).first()
                if mbox_obj:
                    valid = mbox_obj.check_password(test_pass)
                    if valid:
                        print(f"  🎉 SUCESSO: A senha confere com a conta de e-mail '{test_user}' na tabela mailbox!")
                    else:
                        print(f"  ❌ FALHA: Senha incorreta para o e-mail '{test_user}'.")
                else:
                    print(f"  ❌ Usuário '{test_user}' não encontrado nem em vmail_admins nem em mailbox.")
        else:
            print("  (Teste de senha ignorado)")

    print("\n" + "=" * 65)
    print(" Diagnóstico concluído.")
    print("=" * 65)

if __name__ == '__main__':
    run_diagnostics()
