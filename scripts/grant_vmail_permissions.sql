-- Script de Ajuste de Permissões e Inicialização de Tabelas para o Banco 'vmail' no MariaDB / MySQL
-- Execute no terminal do servidor Linux como root:
-- sudo mysql < /opt/mailadmin/scripts/grant_vmail_permissions.sql

USE `vmail`;

-- 1. Garantir existência dos usuários sem alterar senhas existentes
CREATE USER IF NOT EXISTS 'vmail'@'localhost';
CREATE USER IF NOT EXISTS 'vmail'@'127.0.0.1';
CREATE USER IF NOT EXISTS 'vmailadmin'@'localhost';
CREATE USER IF NOT EXISTS 'vmailadmin'@'127.0.0.1';

-- 2. Conceder permissões completas para o usuário 'vmailadmin'
GRANT ALL PRIVILEGES ON `vmail`.* TO 'vmailadmin'@'localhost';
GRANT ALL PRIVILEGES ON `vmail`.* TO 'vmailadmin'@'127.0.0.1';

-- 3. Conceder permissões para o usuário 'vmail' (Postfix / Dovecot)
GRANT SELECT, INSERT, UPDATE, DELETE ON `vmail`.* TO 'vmail'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `vmail`.* TO 'vmail'@'127.0.0.1';

-- 4. Garantir a criação de todas as tabelas essenciais do sistema
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
    INDEX `idx_mlh_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS `mail_rules` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `target` VARCHAR(255) NOT NULL,
    `action_type` VARCHAR(50) NOT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_mr_target` (`target`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS `vmail_admins` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(80) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `otp_secret` VARCHAR(32) NULL,
    `otp_enabled` TINYINT(1) DEFAULT 0,
    `role` VARCHAR(50) DEFAULT 'admin',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

FLUSH PRIVILEGES;

