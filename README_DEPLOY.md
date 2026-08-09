# Guia de Implantação: MailAdmin Suite v2.0 (Substituto iRedAdmin)

Este repositório contém a suíte completa de administração em **Python Flask**, **Bootstrap 5** e **SQLAlchemy** conectando-se ao **MariaDB (schema `vmail`)** para gerenciamento do **Postfix, Amavis, SpamAssassin e ClamAV**.

---

## 📋 Pré-requisitos no Servidor Linux (Debian 11/12 ou Ubuntu 22.04/24.04)

1. Servidor com Postfix, Amavisd-new, SpamAssassin, ClamAV e MariaDB instalados.
2. Python 3.10+ e `pip`.
3. Acesso root para criar o usuário e serviço systemd.

---

## 🚀 Passo a Passo de Instalação

### 1. Criar Usuário do Sistema e Diretório
```bash
sudo useradd -r -s /bin/false suporte
sudo mkdir -p /opt/mailadmin
sudo chown -R suporte:suporte /opt/mailadmin
```

### 2. Copiar o Código Fonte e Criar Virtualenv Python
```bash
cd /opt/mailadmin
sudo tar -xvf mailadmin_suite.tar.gz .
sudo python3 -m venv venv
sudo /opt/mailadmin/venv/bin/pip install -r requirements.txt
```

### 3. Configurar Permissões Sudoers (`sudoers_mailadmin`)
Para permitir que a aplicação Python gerencie os serviços Linux sem senha:

```bash
sudo cp /opt/mailadmin/sudoers_mailadmin /etc/sudoers.d/mailadmin
sudo chmod 0440 /etc/sudoers.d/mailadmin
```

### 4. Configurar Conexão do MariaDB / MySQL (`vmail`)
Defina as variáveis de ambiente em `/opt/mailadmin/.env` ou no arquivo `config.py`:

```env
DB_USER=vmailadmin
DB_PASS=SuaSenhaSeguraMariaDB
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=vmail
SECRET_KEY=ChaveSecretaSuperSegura2026
```

### 5. Instalar e Ativar o Serviço Systemd (`mailadmin.service`)

```bash
sudo cp /opt/mailadmin/mailadmin.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable mailadmin
sudo systemctl start mailadmin
```

---

## 🔍 Verificação da Aplicação

Verifique se o serviço está ativo rodando na porta 5000:
```bash
sudo systemctl status mailadmin
curl -I http://127.0.0.1:5000
```

---

## 🛡️ Autenticação e MFA (Google Authenticator)
- **Usuário Padrão Inicial:** `admin`
- **Senha Padrão Inicial:** `senha_segura_123`
- Ao realizar o primeiro login, abra a opção **Configurar MFA** no menu superior para vincular o Google Authenticator via QR Code TOTP.

---

## 📊 Módulos Disponíveis
1. **Dashboard:** Visão geral e reinício rápido de `postfix`, `amavis`, `clamav-daemon` e `spamassassin`.
2. **Domínios & Mailboxes (vmail):** CRUD completo com hash de senha nativo Dovecot (`SSHA512` / `BCRYPT`) e limite de cota em MB.
3. **Aliases:** Redirecionamento de e-mails virtuais.
4. **Troubleshooting:**
   - **Rastreio de E-mail:** Leitura estruturada de `/var/log/mail.log`.
   - **Gestão de Fila Postfix:** Leitura de `postqueue -p`, deleção com `postsuper -d` e liberação com `postqueue -f`.
   - **Validador DNS:** Checagem de registros `MX`, `SPF` (`v=spf1`), `DKIM` e `DMARC` via `dnspython`.
5. **Regras SpamAssassin:** Edição ao vivo do `/etc/spamassassin/local.cf` com validação de sintaxe (`spamassassin --lint`).
