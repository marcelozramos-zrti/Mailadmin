-- =============================================================================
-- MailAdmin Suite v1.1.0 - Script de Migração e Criação de Estrutura SQL
-- Compatível com MariaDB / MySQL (Banco vmail do iRedMail / Postfix)
-- =============================================================================

USE vmail;

-- 1. Tabela de Administradores do Painel
CREATE TABLE IF NOT EXISTS vmail_admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    otp_secret VARCHAR(32) NULL,
    otp_enabled TINYINT(1) DEFAULT 0,
    role VARCHAR(50) DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Atualização de colunas caso a tabela vmail_admins já exista
ALTER TABLE vmail_admins ADD COLUMN IF NOT EXISTS otp_secret VARCHAR(32) NULL;
ALTER TABLE vmail_admins ADD COLUMN IF NOT EXISTS otp_enabled TINYINT(1) DEFAULT 0;
ALTER TABLE vmail_admins ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'admin';

-- 2. Tabela de Regras de E-mail / Blacklist / Whitelist
CREATE TABLE IF NOT EXISTS mail_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    target VARCHAR(255) NOT NULL,
    normalized_target VARCHAR(255) NULL,
    canonical_pattern VARCHAR(255) NULL,
    action_type VARCHAR(50) NOT NULL DEFAULT 'blacklist_from',
    pattern_type VARCHAR(50) DEFAULT 'DOMAIN',
    scope VARCHAR(50) DEFAULT 'DOMAIN_AND_SUBDOMAINS',
    score FLOAT DEFAULT 100.0,
    reason VARCHAR(255) DEFAULT 'Regra ativa de segurança',
    origin VARCHAR(50) DEFAULT 'manual',
    active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_mail_rules_target (target),
    INDEX idx_mail_rules_norm (normalized_target)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Atualização de colunas caso mail_rules já exista com formato antigo
ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS normalized_target VARCHAR(255) NULL;
ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS canonical_pattern VARCHAR(255) NULL;
ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS pattern_type VARCHAR(50) DEFAULT 'DOMAIN';
ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS scope VARCHAR(50) DEFAULT 'DOMAIN_AND_SUBDOMAINS';
ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS score FLOAT DEFAULT 100.0;
ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS reason VARCHAR(255) DEFAULT 'Regra ativa de segurança';
ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS origin VARCHAR(50) DEFAULT 'manual';
ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS active TINYINT(1) DEFAULT 1;
ALTER TABLE mail_rules ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL;

-- 3. Tabela de Histórico de Logs de E-mail (mail_logs_history)
CREATE TABLE IF NOT EXISTS mail_logs_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    queue_id VARCHAR(50) NULL,
    sender VARCHAR(255) NULL,
    recipient VARCHAR(255) NULL,
    client_ip VARCHAR(45) NULL,
    status VARCHAR(50) NULL,
    message TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_mlh_ts (timestamp),
    INDEX idx_mlh_sender (sender),
    INDEX idx_mlh_recipient (recipient),
    INDEX idx_mlh_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Tabela de Auditoria do Sistema (system_audit_logs)
CREATE TABLE IF NOT EXISTS system_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    admin_user VARCHAR(80) NOT NULL DEFAULT 'System',
    action VARCHAR(100) NOT NULL,
    target VARCHAR(255) NULL,
    ip_address VARCHAR(45) NULL,
    severity_level VARCHAR(20) DEFAULT 'normal',
    details_json TEXT NULL,
    INDEX idx_sal_ts (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE system_audit_logs ADD COLUMN IF NOT EXISTS severity_level VARCHAR(20) DEFAULT 'normal';
ALTER TABLE system_audit_logs ADD COLUMN IF NOT EXISTS details_json TEXT NULL;

-- 5. Tabela de Incidentes de Segurança (security_incidents)
CREATE TABLE IF NOT EXISTS security_incidents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    title VARCHAR(255) NOT NULL,
    severity_code VARCHAR(50) NOT NULL DEFAULT 'suspicious',
    level INT DEFAULT 1,
    status VARCHAR(50) DEFAULT 'Pendente',
    summary TEXT NULL,
    raw_logs TEXT NULL,
    action_taken TEXT NULL,
    affected_target VARCHAR(255) NULL,
    resolved_by VARCHAR(80) NULL,
    resolved_at DATETIME NULL,
    INDEX idx_sec_ts (timestamp),
    INDEX idx_sec_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Tabela de Cron Jobs de Automação (cron_jobs)
CREATE TABLE IF NOT EXISTS cron_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    schedule_preset VARCHAR(50) DEFAULT 'custom',
    cron_expression VARCHAR(100) NOT NULL,
    command TEXT NOT NULL,
    enabled TINYINT(1) DEFAULT 1,
    last_run DATETIME NULL,
    last_output TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Tabela de Regras Customizadas de Spam (spam_custom_rules)
CREATE TABLE IF NOT EXISTS spam_custom_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    target VARCHAR(50) DEFAULT 'Subject',
    match_mode VARCHAR(30) DEFAULT 'regex',
    pattern TEXT NOT NULL,
    score FLOAT DEFAULT 15.0,
    describe_text VARCHAR(255) DEFAULT '',
    category VARCHAR(50) DEFAULT 'custom',
    action_type VARCHAR(50) DEFAULT 'quarantine',
    enabled TINYINT(1) DEFAULT 1,
    hits_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Tabela de Regras do AntiSpam Policy Engine (antispam_rules)
CREATE TABLE IF NOT EXISTS antispam_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(80) NOT NULL UNIQUE,
    nome VARCHAR(150) NOT NULL,
    categoria VARCHAR(50) NOT NULL DEFAULT 'authentication',
    descricao TEXT NULL,
    score FLOAT NOT NULL DEFAULT 0.0,
    ativo TINYINT(1) DEFAULT 1,
    severidade VARCHAR(30) DEFAULT 'MEDIUM',
    origem VARCHAR(50) DEFAULT 'system',
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ar_code (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. Tabela de Configurações Operacionais do AntiSpam (antispam_settings)
CREATE TABLE IF NOT EXISTS antispam_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    `key` VARCHAR(100) NOT NULL UNIQUE,
    `value` VARCHAR(255) NOT NULL,
    label VARCHAR(150) NULL,
    category VARCHAR(50) DEFAULT 'threshold',
    description TEXT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(100) DEFAULT 'system'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. Tabela de Catálogo Anti-Impersonation (antispam_impersonation_profiles)
CREATE TABLE IF NOT EXISTS antispam_impersonation_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    brand_name VARCHAR(100) NOT NULL,
    official_domains TEXT NOT NULL,
    dmarc_enforced TINYINT(1) DEFAULT 1,
    active TINYINT(1) DEFAULT 1,
    severity VARCHAR(30) DEFAULT 'CRITICAL',
    category VARCHAR(50) DEFAULT 'finance',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. Tabela de Histórico de Análises e Diagnósticos (antispam_analysis)
CREATE TABLE IF NOT EXISTS antispam_analysis (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id VARCHAR(255) NULL,
    queue_id VARCHAR(100) NULL,
    sender_from VARCHAR(255) NULL,
    envelope_from VARCHAR(255) NULL,
    envelope_to VARCHAR(255) NULL,
    client_ip VARCHAR(80) NULL,
    ptr VARCHAR(255) NULL,
    helo VARCHAR(255) NULL,
    spf_status VARCHAR(30) DEFAULT 'NONE',
    dkim_status VARCHAR(30) DEFAULT 'NONE',
    dmarc_status VARCHAR(30) DEFAULT 'NONE',
    sa_score FLOAT DEFAULT 0.0,
    intelligence_score FLOAT DEFAULT 0.0,
    final_score FLOAT DEFAULT 0.0,
    classification VARCHAR(50) DEFAULT 'CLEAN',
    confidence_level VARCHAR(30) DEFAULT 'HIGH',
    triggered_rules TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_aa_mid (message_id),
    INDEX idx_aa_sender (sender_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. Tabela de Regras Disparadas em Análises (antispam_analysis_rules)
CREATE TABLE IF NOT EXISTS antispam_analysis_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    analysis_id INT NOT NULL,
    rule_code VARCHAR(80) NOT NULL,
    rule_name VARCHAR(150) NULL,
    score_applied FLOAT NOT NULL,
    evidence TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_aar_analysis FOREIGN KEY (analysis_id) REFERENCES antispam_analysis (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. Tabela de Auditoria Imutável do AntiSpam Policy Engine (antispam_audit)
CREATE TABLE IF NOT EXISTS antispam_audit (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario VARCHAR(100) NOT NULL,
    acao VARCHAR(80) NOT NULL,
    alvo VARCHAR(150) NOT NULL,
    valor_anterior TEXT NULL,
    valor_novo TEXT NULL,
    motivo VARCHAR(255) NULL,
    ip_origem VARCHAR(80) DEFAULT '127.0.0.1',
    data_hora DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Permissões de Usuário do Banco
GRANT ALL PRIVILEGES ON vmail.* TO 'vmail'@'localhost';
GRANT ALL PRIVILEGES ON vmail.* TO 'vmailadmin'@'localhost';
GRANT ALL PRIVILEGES ON vmail.* TO 'vmail'@'127.0.0.1';
GRANT ALL PRIVILEGES ON vmail.* TO 'vmailadmin'@'127.0.0.1';
FLUSH PRIVILEGES;
