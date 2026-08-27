# -*- coding: utf-8 -*-
"""
Módulo Central de Logs do MailAdmin Suite
Gerencia logs em arquivo (/opt/mailadmin/mailadmin.log) e no console/systemd (journalctl).
"""
import os
import sys
import logging
from logging.handlers import RotatingFileHandler

# Define o caminho do arquivo de log
LOG_DIR = "/opt/mailadmin"
if not os.path.exists(LOG_DIR) or not os.access(LOG_DIR, os.W_OK):
    LOG_DIR = os.path.dirname(os.path.abspath(__file__))

LOG_FILE = os.path.join(LOG_DIR, "mailadmin.log")

def setup_logger(name="mailadmin"):
    """Configura e retorna a instância de logger global para a aplicação."""
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)

    # Evita adicionar handlers repetidos se já configurado
    if logger.handlers:
        return logger

    # Formato detalhado: Data/Hora [NÍVEL] [MÓDULO] Mensagem
    log_format = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    # 1. Handler para Console / stdout (capturado pelo systemd / journalctl)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(log_format)
    logger.addHandler(console_handler)

    # 2. Handler para Arquivo Rotativo (10 MB por arquivo, até 5 backups)
    try:
        file_handler = RotatingFileHandler(
            LOG_FILE,
            maxBytes=10 * 1024 * 1024, # 10 MB
            backupCount=5,
            encoding="utf-8"
        )
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(log_format)
        logger.addHandler(file_handler)
    except Exception as e:
        print(f"[LOGGER INIT WARNING] Não foi possível criar log em {LOG_FILE}: {e}", file=sys.stderr)

    return logger

# Instância padrão
logger = setup_logger("mailadmin")

def log_auth_attempt(username, ip, status, details=""):
    """Registra uma tentativa de autenticação no sistema com destaque."""
    tag = "✓ SUCESSO" if status == "SUCCESS" else "❌ FALHA"
    logger.info(f"[AUTH {tag}] Usuário: '{username}' | IP: {ip} | {details}")
