-- ==============================================================================
-- MailAdmin Suite v1.1.0 - Inicialização Completa do Banco de Dados MariaDB (vmail)
-- Execute no terminal do servidor Linux como root:
-- sudo mysql < /opt/mailadmin/scripts/init_database.sql
-- ==============================================================================

USE `vmail`;

-- 1. Garantir existência e privilégios dos usuários
CREATE USER IF NOT EXISTS 'vmail'@'localhost';
CREATE USER IF NOT EXISTS 'vmail'@'127.0.0.1';
CREATE USER IF NOT EXISTS 'vmailadmin'@'localhost';
CREATE USER IF NOT EXISTS 'vmailadmin'@'127.0.0.1';

GRANT ALL PRIVILEGES ON `vmail`.* TO 'vmailadmin'@'localhost';
GRANT ALL PRIVILEGES ON `vmail`.* TO 'vmailadmin'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON `vmail`.* TO 'vmail'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `vmail`.* TO 'vmail'@'127.0.0.1';

-- 2. Tabela de Administradores do Painel (vmail_admins)
CREATE TABLE IF NOT EXISTS `vmail_admins` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(80) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `otp_secret` VARCHAR(32) NULL,
    `otp_enabled` TINYINT(1) DEFAULT 0,
    `role` VARCHAR(50) DEFAULT 'admin',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Tabela de Domínios Virtuais Postfix/Dovecot (domain)
CREATE TABLE IF NOT EXISTS `domain` (
    `domain` VARCHAR(255) PRIMARY KEY,
    `description` VARCHAR(255) DEFAULT '',
    `aliases` INT DEFAULT 0,
    `mailboxes` INT DEFAULT 0,
    `maxquota` BIGINT DEFAULT 0,
    `transport` VARCHAR(255) DEFAULT 'virtual',
    `active` TINYINT(1) DEFAULT 1,
    `created` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Tabela de Caixas Postais Virtuais (mailbox)
CREATE TABLE IF NOT EXISTS `mailbox` (
    `username` VARCHAR(255) PRIMARY KEY,
    `password` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) DEFAULT '',
    `maildir` VARCHAR(255) NOT NULL,
    `quota` BIGINT DEFAULT 1024,
    `domain` VARCHAR(255) NOT NULL,
    `active` TINYINT(1) DEFAULT 1,
    `created` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_mb_domain` (`domain`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Tabela de Aliases de E-mail (alias)
CREATE TABLE IF NOT EXISTS `alias` (
    `address` VARCHAR(255) PRIMARY KEY,
    `goto` TEXT NULL,
    `domain` VARCHAR(255) NOT NULL,
    `active` TINYINT(1) DEFAULT 1,
    `created` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_al_domain` (`domain`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Tabela de Quota Utilizada (used_quota)
CREATE TABLE IF NOT EXISTS `used_quota` (
    `username` VARCHAR(255) PRIMARY KEY,
    `bytes` BIGINT DEFAULT 0,
    `messages` BIGINT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Tabela de Regras SOAR / Antispam (mail_rules)
CREATE TABLE IF NOT EXISTS `mail_rules` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `target` VARCHAR(255) NOT NULL,
    `action_type` VARCHAR(50) NOT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_mr_target` (`target`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Tabela de Histórico de Logs de E-mail (mail_logs_history)
CREATE TABLE IF NOT EXISTS `mail_logs_history` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `timestamp` DATETIME NOT NULL,
    `queue_id` VARCHAR(50) NULL,
    `sender` VARCHAR(255) NULL,
    `recipient` VARCHAR(255) NULL,
    `client_ip` VARCHAR(45) NULL,
    `status` VARCHAR(50) NULL,
    `message` TEXT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_mlh_timestamp` (`timestamp`),
    INDEX `idx_mlh_queue_id` (`queue_id`),
    INDEX `idx_mlh_sender` (`sender`),
    INDEX `idx_mlh_recipient` (`recipient`),
    INDEX `idx_mlh_status` (`status`),
    INDEX `idx_mlh_client_ip` (`client_ip`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. Tabela de Trilha de Auditoria do Sistema (system_audit_logs)
CREATE TABLE IF NOT EXISTS `system_audit_logs` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `admin_user` VARCHAR(80) NOT NULL DEFAULT 'System',
    `action` VARCHAR(100) NOT NULL,
    `target` VARCHAR(255) NULL,
    `ip_address` VARCHAR(45) NULL,
    `severity_level` VARCHAR(20) DEFAULT 'normal',
    `details_json` TEXT NULL,
    INDEX `idx_sal_timestamp` (`timestamp`),
    INDEX `idx_sal_admin_user` (`admin_user`),
    INDEX `idx_sal_action` (`action`),
    INDEX `idx_sal_severity` (`severity_level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. Tabela de Incidentes de Segurança SOAR (security_incidents)
CREATE TABLE IF NOT EXISTS `security_incidents` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `title` VARCHAR(255) NOT NULL,
    `severity_code` VARCHAR(50) NOT NULL DEFAULT 'suspicious',
    `level` INT DEFAULT 1,
    `status` VARCHAR(50) DEFAULT 'Pendente',
    `summary` TEXT NULL,
    `raw_logs` TEXT NULL,
    `action_taken` TEXT NULL,
    `affected_target` VARCHAR(255) NULL,
    `resolved_by` VARCHAR(80) NULL,
    `resolved_at` DATETIME NULL,
    INDEX `idx_si_timestamp` (`timestamp`),
    INDEX `idx_si_status` (`status`),
    INDEX `idx_si_severity` (`severity_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. Tabela de Automações e Agendamentos (cron_jobs)
CREATE TABLE IF NOT EXISTS `cron_jobs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `schedule_preset` VARCHAR(50) DEFAULT 'custom',
    `cron_expression` VARCHAR(100) NOT NULL,
    `command` TEXT NOT NULL,
    `enabled` TINYINT(1) DEFAULT 1,
    `last_run` DATETIME NULL,
    `last_output` TEXT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

FLUSH PRIVILEGES;
