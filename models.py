from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
import datetime
import hashlib
import base64
import os
from passlib.hash import sha512_crypt, bcrypt

db = SQLAlchemy()

class AdminUser(UserMixin, db.Model):
    __tablename__ = 'vmail_admins'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    otp_secret = db.Column(db.String(32), nullable=True) # Segredo TOTP (pyotp)
    otp_enabled = db.Column(db.Boolean, default=False)
    role = db.Column(db.String(50), default='admin') # 'admin' (Acesso total) ou 'user' (Sem exclusão/configurações)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def set_password(self, password):
        self.password_hash = sha512_crypt.hash(password)

    def check_password(self, password):
        if not self.password_hash:
            return False
        return sha512_crypt.verify(password, self.password_hash)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'role': self.role or 'admin',
            'otp_enabled': self.otp_enabled,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class Domain(db.Model):
    __tablename__ = 'domain'

    domain = db.Column(db.String(255), primary_key=True)
    description = db.Column(db.String(255), default='')
    aliases = db.Column(db.Integer, default=0)
    mailboxes = db.Column(db.Integer, default=0)
    maxquota = db.Column(db.BigInteger, default=0) # MB
    transport = db.Column(db.String(255), default='virtual')
    active = db.Column(db.Boolean, default=True)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'domain': self.domain,
            'description': self.description,
            'aliases': self.aliases,
            'mailboxes': self.mailboxes,
            'maxquota': self.maxquota,
            'transport': self.transport,
            'active': self.active,
            'created': self.created.strftime('%Y-%m-%d %H:%M:%S') if self.created else None
        }


class Mailbox(db.Model):
    __tablename__ = 'mailbox'

    username = db.Column(db.String(255), primary_key=True) # e-mail completo ex: user@domain.com
    password = db.Column(db.String(255), nullable=False)   # Hash Dovecot (SSHA512 / SHA512-CRYPT / BCRYPT)
    name = db.Column(db.String(255), default='')
    maildir = db.Column(db.String(255), nullable=False)
    quota = db.Column(db.BigInteger, default=1024) # Quota em MB (ex: 1024 MB = 1GB)
    domain = db.Column(db.String(255), db.ForeignKey('domain.domain'), nullable=False)
    active = db.Column(db.Boolean, default=True)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'username': self.username,
            'name': self.name,
            'maildir': self.maildir,
            'quota': self.quota,
            'domain': self.domain,
            'active': self.active,
            'created': self.created.strftime('%Y-%m-%d %H:%M:%S') if self.created else None
        }

    @staticmethod
    def generate_dovecot_password(password_plain, scheme='SSHA512'):
        """
        Gera hash de senha no formato nativo do Dovecot (Ex: {SSHA512} ou {SHA512-CRYPT} ou {BCRYPT}).
        """
        if scheme == 'SHA512-CRYPT':
            hashed = sha512_crypt.hash(password_plain)
            return f"{{SHA512-CRYPT}}{hashed}"
        elif scheme == 'BCRYPT':
            hashed = bcrypt.hash(password_plain)
            return f"{{BCRYPT}}{hashed}"
        else: # SSHA512 padrão Dovecot
            salt = os.urandom(16)
            ctx = hashlib.sha512(password_plain.encode('utf-8'))
            ctx.update(salt)
            digest = ctx.digest()
            encoded = base64.b64encode(digest + salt).decode('utf-8')
            return f"{{SSHA512}}{encoded}"


class Alias(db.Model):
    __tablename__ = 'alias'

    address = db.Column(db.String(255), primary_key=True) # e-mail virtual ex: vendas@domain.com
    goto = db.Column(db.Text, nullable=False)             # destino ex: joao@domain.com, maria@domain.com
    domain = db.Column(db.String(255), db.ForeignKey('domain.domain'), nullable=False)
    active = db.Column(db.Boolean, default=True)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'address': self.address,
            'goto': self.goto,
            'domain': self.domain,
            'active': self.active,
            'created': self.created.strftime('%Y-%m-%d %H:%M:%S') if self.created else None
        }


class UsedQuota(db.Model):
    __tablename__ = 'used_quota'

    username = db.Column(db.String(255), primary_key=True) # E-mail da caixa postal
    bytes = db.Column(db.BigInteger, default=0)            # Espaço consumido em bytes
    messages = db.Column(db.BigInteger, default=0)         # Total de mensagens salvas

    def to_dict(self):
        return {
            'username': self.username,
            'bytes': self.bytes,
            'messages': self.messages
        }

