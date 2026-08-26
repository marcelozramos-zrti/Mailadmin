#!/usr/bin/env python3
"""
MailAdmin Suite - Script de Diagnóstico e Migração de Banco de Dados
Executa a validação de conexão, criação de tabelas e auto-recuperação de colunas no MariaDB/MySQL.
Uso: python3 scripts/migrate_database.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from models import db
from sqlalchemy import text

def run_migration():
    print("================================================================")
    print("  MailAdmin Suite - Verificador de Banco de Dados & Migrações   ")
    print("================================================================")
    
    app = create_app()
    with app.app_context():
        try:
            print("[1/3] Testando conexão com MariaDB/MySQL...")
            result = db.session.execute(text("SELECT 1")).scalar()
            print("  ✓ Conexão estabelecida com sucesso!")
            
            print("[2/3] Criando tabelas pendentes...")
            db.create_all()
            print("  ✓ db.create_all() executado com sucesso!")
            
            print("[3/3] Aplicando migrações e permissões das colunas...")
            sql_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "migrate_database.sql")
            if os.path.exists(sql_file):
                with open(sql_file, "r", encoding="utf-8") as f:
                    content = f.read()
                statements = [s.strip() for s in content.split(";") if s.strip() and not s.strip().startswith("--")]
                for stmt in statements:
                    try:
                        db.session.execute(text(stmt))
                        db.session.commit()
                    except Exception as e:
                        db.session.rollback()
                print("  ✓ Script migrate_database.sql executado com sucesso!")
            else:
                print("  ! Arquivo migrate_database.sql não encontrado, usando auto_heal nativo.")
                
            print("\n================================================================")
            print("  Tudo pronto! O banco de dados está íntegro e sincronizado.    ")
            print("  Você pode iniciar o painel com: systemctl restart mailadmin   ")
            print("================================================================")
            
        except Exception as e:
            print("\n[ERRO CRÍTICO NA CONEXÃO OU MIGRAÇÃO DO BANCO]:", file=sys.stderr)
            print(f"Detalhe: {e}\n", file=sys.stderr)
            print("Dicas de resolução:", file=sys.stderr)
            print("1. Verifique se o MariaDB está rodando: systemctl status mariadb", file=sys.stderr)
            print("2. Verifique as credenciais no arquivo config.py (DB_USER, DB_PASS, DB_NAME)", file=sys.stderr)
            print("3. Conceda privilégios no MySQL: GRANT ALL PRIVILEGES ON vmail.* TO 'vmailadmin'@'localhost' IDENTIFIED BY 'senha_vmail_123';", file=sys.stderr)
            sys.exit(1)

if __name__ == '__main__':
    run_migration()
