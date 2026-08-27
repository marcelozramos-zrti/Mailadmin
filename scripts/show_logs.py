#!/usr/bin/env python3
"""
MailAdmin Realtime Log Viewer
Exibe e acompanha (tail -f) os logs do MailAdmin Suite em tempo real.
Uso:
  /opt/mailadmin/venv/bin/python3 scripts/show_logs.py
  ou
  python3 scripts/show_logs.py
"""
import os
import sys
import time

LOG_DIR = "/opt/mailadmin"
if not os.path.exists(LOG_DIR):
    LOG_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LOG_FILE = os.path.join(LOG_DIR, "mailadmin.log")

def main():
    print("=" * 70)
    print("        MAILADMIN SUITE - VISUALIZADOR DE LOGS EM TEMPO REAL        ")
    print(f" Arquivo monitorado: {LOG_FILE}")
    print(" Pressione Ctrl+C para sair a qualquer momento.")
    print("=" * 70 + "\n")

    if not os.path.exists(LOG_FILE):
        print(f"⚠️ Arquivo {LOG_FILE} ainda não foi criado. Aguardando gravações...")

    # Exibe as últimas 30 linhas existentes
    try:
        if os.path.exists(LOG_FILE):
            with open(LOG_FILE, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
                for line in lines[-30:]:
                    print(line, end='')
    except Exception as e:
        print(f"Erro ao ler histórico de log: {e}")

    # Modo Acompanhamento Contínuo (tail -f)
    try:
        with open(LOG_FILE, 'r', encoding='utf-8', errors='replace') as f:
            f.seek(0, os.SEEK_END)
            while True:
                line = f.readline()
                if line:
                    print(line, end='', flush=True)
                else:
                    time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n\nMonitoramento de logs finalizado.")
    except Exception as e:
        print(f"\nErro no monitoramento: {e}")

if __name__ == '__main__':
    main()
