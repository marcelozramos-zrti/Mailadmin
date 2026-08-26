#!/usr/bin/env python3
"""
MailAdmin Suite - Script de Diagnóstico e Correção Automática
Corrige encoding do index.html, testa conexão com banco e valida a inicialização.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def fix_all():
    print("================================================================")
    print("   MailAdmin Suite - Correção e Validação do Ambiente           ")
    print("================================================================")
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    template_path = os.path.join(base_dir, 'templates', 'index.html')
    
    # 1. Normalizar index.html para UTF-8 limpo
    if os.path.exists(template_path):
        print("[1/3] Normalizando codificação do arquivo index.html...")
        try:
            with open(template_path, 'rb') as f:
                raw_bytes = f.read()
            
            # Decodifica com substituição segura de bytes inválidos e regrava em UTF-8 puro
            clean_text = raw_bytes.decode('utf-8', errors='replace')
            
            with open(template_path, 'w', encoding='utf-8') as f:
                f.write(clean_text)
            
            print(f"  ✓ index.html normalizado com sucesso ({len(clean_text)} caracteres).")
        except Exception as e:
            print(f"  [AVISO] Falha ao regravar index.html: {e}")
    else:
        print(f"  [ERRO] Arquivo {template_path} não encontrado!")

    # 2. Testar import e conexão com banco de dados
    print("[2/3] Testando configuração do banco de dados (MariaDB/MySQL)...")
    try:
        from app import create_app
        from models import db
        from sqlalchemy import text
        
        app = create_app()
        with app.app_context():
            result = db.session.execute(text("SELECT 1")).scalar()
            print(f"  ✓ Conexão com banco de dados bem-sucedida! (SELECT 1 => {result})")
            
            # Testa contagem de tabelas
            domains_count = db.session.execute(text("SELECT count(*) FROM domain")).scalar()
            mailboxes_count = db.session.execute(text("SELECT count(*) FROM mailbox")).scalar()
            print(f"  ✓ Banco vmail acessível: {domains_count} domínio(s), {mailboxes_count} conta(s) de e-mail.")
    except Exception as e:
        print(f"  [ERRO NA CONEXÃO]: {e}")
        print("  Dica: Verifique se a senha em config.py está correta.")
        sys.exit(1)

    # 3. Finalização
    print("[3/3] Validação concluída com sucesso!")
    print("================================================================")
    print("Agora reinicie o serviço com: sudo systemctl restart mailadmin")
    print("================================================================")

if __name__ == '__main__':
    fix_all()
