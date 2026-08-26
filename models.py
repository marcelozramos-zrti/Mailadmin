from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
import datetime
import hashlib
import base64
import os
from passlib.hash import sha512_crypt, bcrypt

try:
    from passlib.hash import md5_crypt
except Exception:
    md5_crypt = None

try:
    from werkzeug.security import check_password_hash as werkzeug_check_password
except Exception:
    werkzeug_check_password = None

db = SQLAlchemy()

def verify_password_hash(password_plain, stored_hash):
    """
    Verificação universal e tolerante a múltiplos formatos de hash:
    - Dovecot: {SSHA512}, {SHA512-CRYPT}, {BCRYPT}, {PLAIN}, {CLEARTEXT}, {MD5}, {PLAIN-MD5}
    - Passlib: $6$ (SHA512-CRYPT), $2a$/$2b$/$2y$ (BCRYPT), $1$ (MD5)
    - Werkzeug: pbkdf2, scrypt, argon2
    - Plaintext: comparação direta se não houver hash
    """
    if not stored_hash or not password_plain:
        return False
    
    stored = str(stored_hash).strip()
    plain = str(password_plain)

    # 1. Comparação direta texto puro
    if stored == plain:
        return True

    # 2. Formatos Dovecot com prefixo {ESQUEMA}
    if stored.startswith('{SSHA512}'):
        try:
            b64_data = stored[len('{SSHA512}'):]
            raw = base64.b64decode(b64_data)
            digest = raw[:64] # 64 bytes para sha512
            salt = raw[64:]
            ctx = hashlib.sha512(plain.encode('utf-8'))
            ctx.update(salt)
            return ctx.digest() == digest
        except Exception:
            pass

    if stored.startswith('{SHA512-CRYPT}'):
        try:
            h = stored[len('{SHA512-CRYPT}'):]
            return sha512_crypt.verify(plain, h)
        except Exception:
            pass

    if stored.startswith('{BCRYPT}') or stored.startswith('{BLF-CRYPT}'):
        try:
            h = stored.split('}', 1)[1]
            return bcrypt.verify(plain, h)
        except Exception:
            pass

    if stored.startswith('{PLAIN}') or stored.startswith('{CLEARTEXT}'):
        try:
            return plain == stored.split('}', 1)[1]
        except Exception:
            pass

    if stored.startswith('{MD5}') or stored.startswith('{PLAIN-MD5}'):
        try:
            md5_target = stored.split('}', 1)[1]
            return hashlib.md5(plain.encode('utf-8')).hexdigest().lower() == md5_target.lower()
        except Exception:
            pass

    # 3. Hashes Passlib nativos
    try:
        if stored.startswith('$6$') and sha512_crypt.verify(plain, stored):
            return True
    except Exception:
        pass

    try:
        if (stored.startswith('$2a$') or stored.startswith('$2b$') or stored.startswith('$2y$')) and bcrypt.verify(plain, stored):
            return True
    except Exception:
        pass

    if md5_crypt:
        try:
            if stored.startswith('$1$') and md5_crypt.verify(plain, stored):
                return True
        except Exception:
            pass

    # 4. Werkzeug check_password_hash
    if werkzeug_check_password:
        try:
            if werkzeug_check_password(stored, plain):
                return True
        except Exception:
            pass

    # 5. Tentativas gerais de verificação
    try:
        if sha512_crypt.verify(plain, stored):
            return True
    except Exception:
        pass

    try:
        if bcrypt.verify(plain, stored):
            return True
    except Exception:
        pass

    return False

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
        return verify_password_hash(password, self.password_hash)

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

    def check_password(self, password):
        if not self.password:
            return False
        return verify_password_hash(password, self.password)

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
    domain = db.Column(db.String(255), db.ForeignKey('domain.domain'), nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    active = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            'address': self.address,
            'goto': getattr(self, 'goto', self.address),
            'domain': self.domain,
            'active': self.active,
            'created': self.created.strftime('%Y-%m-%d %H:%M:%S') if self.created else None
        }


class AliasDomain(db.Model):
    __tablename__ = 'alias_domain'

    alias_domain = db.Column(db.String(255), primary_key=True) # ex: zrti.tech
    target_domain = db.Column(db.String(255), db.ForeignKey('domain.domain'), nullable=False) # ex: zrti.com.br
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    active = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            'alias_domain': self.alias_domain,
            'target_domain': self.target_domain,
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


class MailRule(db.Model):
    __tablename__ = 'mail_rules'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    target = db.Column(db.String(255), nullable=False, index=True)
    normalized_target = db.Column(db.String(255), nullable=True, index=True)
    canonical_pattern = db.Column(db.String(255), nullable=True, index=True)
    action_type = db.Column(db.String(50), nullable=False, default='blacklist_from')  # 'blacklist_from', 'whitelist_from', 'spam_from'
    pattern_type = db.Column(db.String(50), default='DOMAIN') # 'DOMAIN', 'SUBDOMAIN', 'EMAIL', 'WILDCARD'
    scope = db.Column(db.String(50), default='DOMAIN_AND_SUBDOMAINS')
    score = db.Column(db.Float, default=100.0)
    reason = db.Column(db.String(255), default='Regra ativa de segurança')
    origin = db.Column(db.String(50), default='manual') # 'manual', 'soar', 'system'
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'target': self.target,
            'value': self.normalized_target or self.target,
            'normalized_target': self.normalized_target or self.target,
            'canonical_pattern': self.canonical_pattern or f"DOMAIN:{self.target}",
            'action': self.action_type,
            'type': self.action_type,
            'pattern_type': self.pattern_type or 'DOMAIN',
            'scope': self.scope or 'DOMAIN_AND_SUBDOMAINS',
            'score': self.score or 100.0,
            'reason': self.reason or 'Regra ativa de segurança',
            'origin': self.origin or 'manual',
            'active': self.active if self.active is not None else True,
            'raw': f"{self.action_type} {self.normalized_target or self.target}" if self.active else f"# {self.action_type} {self.normalized_target or self.target}",
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None,
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else None
        }

    def to_cf_line(self):
        val = self.normalized_target or self.target
        line = f"{self.action_type} {val}"
        if not self.active:
            line = f"# {line}"
        return line


class MailLogHistory(db.Model):
    __tablename__ = 'mail_logs_history'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    timestamp = db.Column(db.DateTime, default=datetime.datetime.utcnow, index=True)
    queue_id = db.Column(db.String(50), nullable=True, index=True)
    sender = db.Column(db.String(255), nullable=True, index=True)
    recipient = db.Column(db.String(255), nullable=True, index=True)
    client_ip = db.Column(db.String(45), nullable=True)
    status = db.Column(db.String(50), nullable=True, index=True) # 'Sent', 'Bounced', 'Spam', 'Rejected', etc.
    message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.strftime('%Y-%m-%d %H:%M:%S') if self.timestamp else None,
            'queue_id': self.queue_id or '-',
            'sender': self.sender or '-',
            'recipient': self.recipient or '-',
            'client_ip': self.client_ip or '-',
            'status': self.status or '-',
            'message': self.message or '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class SystemAuditLog(db.Model):
    __tablename__ = 'system_audit_logs'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    timestamp = db.Column(db.DateTime, default=datetime.datetime.utcnow, index=True)
    admin_user = db.Column(db.String(80), nullable=False, default='System')
    action = db.Column(db.String(100), nullable=False)
    target = db.Column(db.String(255), nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    severity_level = db.Column(db.String(20), default='normal') # 'normal', 'suspicious', 'potential', 'critical'
    details_json = db.Column(db.Text, nullable=True)

    def get_severity_level(self):
        try:
            val = getattr(self, 'severity_level', None)
            if val and val in ['critical', 'potential', 'suspicious']:
                return val
        except Exception:
            pass

        # Verificar se há indicativos de erro/falha nos detalhes ou na ação
        details_upper = (self.details_json or '').upper()
        act_upper = (self.action or '').upper()
        error_keywords = [
            'ERRO', 'ERROR', 'ACCESS DENIED', 'EXCEPTION', 'FAILED', 'FALHA',
            'FATAL', '1045', 'REFUSED', 'DENIED', 'FAIL', '1142'
        ]

        if any(k in details_upper for k in error_keywords) or any(k in act_upper for k in ['FAIL', 'FATAL', 'ERROR', 'ERRO', 'EXCEPTION']):
            return 'critical'

        if any(k in act_upper for k in ['DELETE', 'DROP', 'ATTACK', 'CRITICAL', 'RESTART', 'DISABLE']):
            return 'critical'
        elif any(k in act_upper for k in ['BLOCK', 'SPAM', 'POTENTIAL', 'PASSWORD', 'CONFIG', 'SOAR']):
            return 'potential'
        elif any(k in act_upper for k in ['TOGGLE', 'SUSPICIOUS', 'WHITELIST', 'EDIT', 'RULE']):
            return 'suspicious'

        return getattr(self, 'severity_level', None) or 'normal'

    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.strftime('%Y-%m-%d %H:%M:%S') if self.timestamp else None,
            'admin_user': self.admin_user or 'System',
            'action': self.action,
            'target': self.target or '-',
            'ip_address': self.ip_address or '-',
            'severity_level': self.get_severity_level(),
            'details_json': self.details_json or '{}'
        }


class SecurityIncident(db.Model):
    __tablename__ = 'security_incidents'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    timestamp = db.Column(db.DateTime, default=datetime.datetime.utcnow, index=True)
    title = db.Column(db.String(255), nullable=False)
    severity_code = db.Column(db.String(50), nullable=False, default='suspicious') # 'normal', 'suspicious', 'potential', 'critical'
    level = db.Column(db.Integer, default=1) # 1: 🟡 Evento Suspeito, 2: 🟠 Incidente Potencial, 3: 🔴 Possível Ataque
    status = db.Column(db.String(50), default='Pendente', index=True) # 'Pendente', 'Em Análise', 'Mitigado', 'Resolvido', 'Ignorado'
    summary = db.Column(db.Text, nullable=True)
    raw_logs = db.Column(db.Text, nullable=True)
    action_taken = db.Column(db.Text, nullable=True)
    affected_target = db.Column(db.String(255), nullable=True)
    resolved_by = db.Column(db.String(80), nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.strftime('%Y-%m-%d %H:%M:%S') if self.timestamp else None,
            'title': self.title,
            'severity_code': self.severity_code or 'suspicious',
            'level': self.level or 1,
            'status': self.status or 'Pendente',
            'summary': self.summary or '',
            'raw_logs': self.raw_logs or '',
            'action_taken': self.action_taken or 'Nenhuma ação registrada',
            'affected_target': self.affected_target or '-',
            'resolved_by': self.resolved_by or '-',
            'resolved_at': self.resolved_at.strftime('%Y-%m-%d %H:%M:%S') if self.resolved_at else None
        }


class CronJob(db.Model):
    __tablename__ = 'cron_jobs'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(100), nullable=False)
    schedule_preset = db.Column(db.String(50), default='custom') # '1h', '3h', '6h', 'daily', 'custom'
    cron_expression = db.Column(db.String(100), nullable=False)  # ex: '0 * * * *'
    command = db.Column(db.Text, nullable=False)
    enabled = db.Column(db.Boolean, default=True)
    last_run = db.Column(db.DateTime, nullable=True)
    last_output = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'schedule': self.cron_expression,
            'schedule_preset': self.schedule_preset or 'custom',
            'cron_expression': self.cron_expression,
            'command': self.command,
            'enabled': self.enabled,
            'last_run': self.last_run.strftime('%Y-%m-%d %H:%M:%S') if self.last_run else None,
            'last_output': self.last_output or '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class SpamCustomRule(db.Model):
    __tablename__ = 'spam_custom_rules'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(100), unique=True, nullable=False, index=True) # ex: LOCAL_GOLPE_PEDAGIO
    target = db.Column(db.String(50), default='Subject')                      # 'Subject', 'Body', 'From', 'Reply-To', 'To', 'URI'
    match_mode = db.Column(db.String(30), default='regex')                   # 'regex', 'phrase', 'contains', 'obfuscated'
    pattern = db.Column(db.Text, nullable=False)                             # regex ou texto chave
    score = db.Column(db.Float, default=15.0)
    describe = db.Column(db.String(255), default='')
    category = db.Column(db.String(50), default='custom')                     # 'phishing', 'obfuscation', 'hijack', 'banking_pix', 'fake_invoice', 'custom'
    action_type = db.Column(db.String(50), default='quarantine')              # 'quarantine', 'mark_spam', 'reject'
    enabled = db.Column(db.Boolean, default=True)
    hits_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'target': self.target,
            'match_mode': self.match_mode or 'regex',
            'pattern': self.pattern,
            'score': self.score,
            'describe': self.describe or '',
            'category': self.category or 'custom',
            'action_type': self.action_type or 'quarantine',
            'enabled': bool(self.enabled),
            'hits_count': self.hits_count or 0,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None,
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else None
        }


class AntispamRule(db.Model):
    """Regras configuráveis do Policy Engine com pesos de -10.0 a +10.0"""
    __tablename__ = 'antispam_rules'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    codigo = db.Column(db.String(80), unique=True, nullable=False, index=True) # ex: SPF_FAIL, DMARC_PASS
    nome = db.Column(db.String(150), nullable=False)
    categoria = db.Column(db.String(50), nullable=False, default='authentication') # 'authentication', 'rdns', 'impersonation', 'reputation', 'identity'
    descricao = db.Column(db.Text, nullable=True)
    score = db.Column(db.Float, nullable=False, default=0.0) # -10.0 até +10.0
    ativo = db.Column(db.Boolean, default=True)
    severidade = db.Column(db.String(30), default='MEDIUM') # 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    origem = db.Column(db.String(50), default='system') # 'system', 'custom', 'soar'
    data_criacao = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    data_atualizacao = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'codigo': self.codigo,
            'code': self.codigo,
            'nome': self.nome,
            'name': self.nome,
            'categoria': self.categoria,
            'category': self.categoria,
            'descricao': self.descricao or '',
            'description': self.descricao or '',
            'score': round(float(self.score), 2),
            'ativo': bool(self.ativo),
            'active': bool(self.ativo),
            'severidade': self.severidade or 'MEDIUM',
            'severity': self.severidade or 'MEDIUM',
            'origem': self.origem or 'system',
            'origin': self.origem or 'system',
            'data_criacao': self.data_criacao.strftime('%Y-%m-%d %H:%M:%S') if self.data_criacao else None,
            'data_atualizacao': self.data_atualizacao.strftime('%Y-%m-%d %H:%M:%S') if self.data_atualizacao else None
        }


class AntispamSetting(db.Model):
    """Limiares operacionais e configurações gerais do motor Policy Engine e sincronização SA"""
    __tablename__ = 'antispam_settings'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    key = db.Column(db.String(100), unique=True, nullable=False, index=True)
    value = db.Column(db.String(255), nullable=False)
    label = db.Column(db.String(150), nullable=True)
    category = db.Column(db.String(50), default='threshold') # 'threshold', 'sa_sync', 'amavis_sync', 'engine'
    description = db.Column(db.Text, nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    updated_by = db.Column(db.String(100), default='system')

    def to_dict(self):
        return {
            'id': self.id,
            'key': self.key,
            'value': self.value,
            'label': self.label or self.key,
            'category': self.category or 'threshold',
            'description': self.description or '',
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else None,
            'updated_by': self.updated_by or 'system'
        }


class AntispamImpersonationProfile(db.Model):
    """Perfis e catálogo de proteção contra falsificação de identidade (Impersonation/Phishing)"""
    __tablename__ = 'antispam_impersonation_profiles'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    brand_name = db.Column(db.String(100), nullable=False)
    official_domains = db.Column(db.Text, nullable=False) # JSON ou lista separada por vírgula de domínios legítimos
    dmarc_enforced = db.Column(db.Boolean, default=True)
    active = db.Column(db.Boolean, default=True)
    severity = db.Column(db.String(30), default='CRITICAL') # 'HIGH', 'CRITICAL'
    category = db.Column(db.String(50), default='finance') # 'finance', 'gov', 'tech', 'retail', 'corporate'
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'brand_name': self.brand_name,
            'official_domains': [d.strip().lower() for d in self.official_domains.split(',') if d.strip()],
            'official_domains_raw': self.official_domains,
            'dmarc_enforced': bool(self.dmarc_enforced),
            'active': bool(self.active),
            'severity': self.severity or 'CRITICAL',
            'category': self.category or 'finance',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class AntispamAnalysis(db.Model):
    """Histórico de diagnósticos preditivos e simulações de e-mail (100% read-only)"""
    __tablename__ = 'antispam_analysis'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    message_id = db.Column(db.String(255), nullable=True, index=True)
    queue_id = db.Column(db.String(100), nullable=True, index=True)
    sender_from = db.Column(db.String(255), nullable=True, index=True)
    envelope_from = db.Column(db.String(255), nullable=True)
    envelope_to = db.Column(db.String(255), nullable=True)
    client_ip = db.Column(db.String(80), nullable=True)
    ptr = db.Column(db.String(255), nullable=True)
    helo = db.Column(db.String(255), nullable=True)
    spf_status = db.Column(db.String(30), default='NONE') # 'PASS', 'FAIL', 'SOFTFAIL', 'NONE', 'NEUTRAL'
    dkim_status = db.Column(db.String(30), default='NONE') # 'PASS', 'FAIL', 'NONE'
    dmarc_status = db.Column(db.String(30), default='NONE') # 'PASS', 'FAIL', 'NONE'
    sa_score = db.Column(db.Float, default=0.0)
    intelligence_score = db.Column(db.Float, default=0.0)
    final_score = db.Column(db.Float, default=0.0)
    classification = db.Column(db.String(50), default='CLEAN') # 'CLEAN', 'SPAM', 'HIGH_RISK', 'CRITICAL', 'POSSIBLE_IMPERSONATION', 'PHISHING_SUSPECTED'
    confidence_level = db.Column(db.String(30), default='HIGH') # 'LOW', 'MEDIUM', 'HIGH'
    triggered_rules = db.Column(db.Text, nullable=True) # JSON summary
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'message_id': self.message_id,
            'queue_id': self.queue_id,
            'sender_from': self.sender_from,
            'envelope_from': self.envelope_from,
            'envelope_to': self.envelope_to,
            'client_ip': self.client_ip,
            'ptr': self.ptr,
            'helo': self.helo,
            'spf_status': self.spf_status,
            'dkim_status': self.dkim_status,
            'dmarc_status': self.dmarc_status,
            'sa_score': round(float(self.sa_score or 0.0), 3),
            'intelligence_score': round(float(self.intelligence_score or 0.0), 3),
            'final_score': round(float(self.final_score or 0.0), 3),
            'classification': self.classification,
            'confidence_level': self.confidence_level,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class AntispamAnalysisRule(db.Model):
    """Regras específicas disparadas em cada diagnóstico"""
    __tablename__ = 'antispam_analysis_rules'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    analysis_id = db.Column(db.Integer, db.ForeignKey('antispam_analysis.id', ondelete='CASCADE'), nullable=False)
    rule_code = db.Column(db.String(80), nullable=False)
    rule_name = db.Column(db.String(150), nullable=True)
    score_applied = db.Column(db.Float, nullable=False)
    evidence = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'analysis_id': self.analysis_id,
            'rule_code': self.rule_code,
            'rule_name': self.rule_name or self.rule_code,
            'score_applied': round(float(self.score_applied), 2),
            'evidence': self.evidence or '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class AntispamAudit(db.Model):
    """Trilha de auditoria imutável para qualquer alteração no Policy Engine"""
    __tablename__ = 'antispam_audit'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    usuario = db.Column(db.String(100), nullable=False)
    acao = db.Column(db.String(80), nullable=False) # 'UPDATE_SCORE', 'TOGGLE_RULE', 'UPDATE_SETTINGS', 'SYNC_SPAMASSASSIN'
    alvo = db.Column(db.String(150), nullable=False)
    valor_anterior = db.Column(db.Text, nullable=True)
    valor_novo = db.Column(db.Text, nullable=True)
    motivo = db.Column(db.String(255), nullable=True)
    ip_origem = db.Column(db.String(80), default='127.0.0.1')
    data_hora = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'usuario': self.usuario,
            'user': self.usuario,
            'acao': self.acao,
            'action': self.acao,
            'alvo': self.alvo,
            'target': self.alvo,
            'valor_anterior': self.valor_anterior,
            'old_value': self.valor_anterior,
            'valor_novo': self.valor_novo,
            'new_value': self.valor_novo,
            'motivo': self.motivo or '',
            'reason': self.motivo or '',
            'ip_origem': self.ip_origem or '127.0.0.1',
            'ip': self.ip_origem or '127.0.0.1',
            'data_hora': self.data_hora.strftime('%Y-%m-%d %H:%M:%S') if self.data_hora else None,
            'timestamp': self.data_hora.strftime('%Y-%m-%d %H:%M:%S') if self.data_hora else None
        }



