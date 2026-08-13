-- Script de Ajuste de Permissões para o Banco 'vmail' no MariaDB / MySQL
-- Execute no terminal do servidor Linux como root:
-- sudo mysql < /opt/mailadmin/scripts/grant_vmail_permissions.sql

-- 1. Garantir existência dos usuários sem alterar senhas existentes
CREATE USER IF NOT EXISTS 'vmail'@'localhost';
CREATE USER IF NOT EXISTS 'vmail'@'127.0.0.1';
CREATE USER IF NOT EXISTS 'vmailadmin'@'localhost';
CREATE USER IF NOT EXISTS 'vmailadmin'@'127.0.0.1';

-- 2. Conceder permissões para o usuário 'vmail'
GRANT SELECT, INSERT, UPDATE, DELETE ON `vmail`.* TO 'vmail'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `vmail`.* TO 'vmail'@'127.0.0.1';

-- 3. Conceder permissões para o usuário 'vmailadmin'
GRANT ALL PRIVILEGES ON `vmail`.* TO 'vmailadmin'@'localhost';
GRANT ALL PRIVILEGES ON `vmail`.* TO 'vmailadmin'@'127.0.0.1';

FLUSH PRIVILEGES;

