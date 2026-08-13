-- Script de Ajuste de Permissões para o Banco 'vmail' no MariaDB / MySQL
-- Execute no terminal do servidor Linux como root:
-- sudo mysql < /opt/mailadmin/scripts/grant_vmail_permissions.sql

-- Option 1: Conceder permissões de escrita para o usuário 'vmail' (se estiver usando DB_USER=vmail)
GRANT SELECT, INSERT, UPDATE, DELETE ON `vmail`.* TO 'vmail'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `vmail`.* TO 'vmail'@'127.0.0.1';

-- Option 2: Garantir permissões para o usuário 'vmailadmin' (recomendado)
GRANT ALL PRIVILEGES ON `vmail`.* TO 'vmailadmin'@'localhost';
GRANT ALL PRIVILEGES ON `vmail`.* TO 'vmailadmin'@'127.0.0.1';

FLUSH PRIVILEGES;
