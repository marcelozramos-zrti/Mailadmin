import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'chave_secreta_super_segura_mailadmin_2026')
    
    # Conexão MariaDB/MySQL com o banco 'vmail' do iRedMail / Postfix
    DB_USER = os.environ.get('DB_USER', 'vmailadmin')
    DB_PASS = os.environ.get('DB_PASS', '8is1UW6bpCZAeVCZHJpiAx6QjJ0lQJp2')
    DB_HOST = os.environ.get('DB_HOST', '127.0.0.1')
    DB_PORT = os.environ.get('DB_PORT', '3306')
    DB_NAME = os.environ.get('DB_NAME', 'vmail')

    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'DATABASE_URL',
        f'mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4'
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Configuração de Logs e Sistema
    LOCAL_CF_PATH = os.environ.get('LOCAL_CF_PATH', '/etc/spamassassin/local.cf')
    MAIL_LOG_PATH = os.environ.get('MAIL_LOG_PATH', '/var/log/mail.log')

    # Nome da Aplicação / Emissor MFA
    MFA_ISSUER_NAME = 'MailAdmin Suite'
