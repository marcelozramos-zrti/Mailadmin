# Guia de Implantação: Painel de Administração de Servidor de E-mail

Este painel web foi desenvolvido para permitir o gerenciamento simplificado do Postfix, Amavis e SpamAssassin em servidores Debian e Ubuntu Linux.

## 1. Pré-requisitos no Servidor Debian/Ubuntu

No servidor de e-mail, certifique-se de que o Python 3 e o pip estão instalados:

```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv spamassassin
```

## 2. Instalação da Aplicação

1. Crie o diretório da aplicação e defina o usuário `suporte`:
```bash
sudo useradd -m -s /bin/bash suporte
sudo mkdir -p /opt/mailadmin
sudo chown -R suporte:suporte /opt/mailadmin
```

2. Copie os arquivos do projeto para `/opt/mailadmin`:
```text
/opt/mailadmin/
├── app.py
├── templates/
│   └── index.html
```

3. Crie e ative um ambiente virtual Python:
```bash
cd /opt/mailadmin
sudo -u suporte python3 -m venv venv
sudo -u suporte /opt/mailadmin/venv/bin/pip install flask
```

## 3. Configuração das Permissões do Sudoers (`/etc/sudoers.d/mailadmin`)

Para permitir que o usuário `suporte` execute comandos de checagem, reinicialização e leitura de logs sem solicitar senha:

1. Crie o arquivo `/etc/sudoers.d/mailadmin`:
```bash
sudo nano /etc/sudoers.d/mailadmin
```

2. Cole o conteúdo abaixo:
```sudoers
suporte ALL=(ALL) NOPASSWD: /bin/systemctl is-active postfix
suporte ALL=(ALL) NOPASSWD: /bin/systemctl is-active amavis
suporte ALL=(ALL) NOPASSWD: /bin/systemctl is-active clamav-daemon
suporte ALL=(ALL) NOPASSWD: /bin/systemctl restart postfix
suporte ALL=(ALL) NOPASSWD: /bin/systemctl restart amavis
suporte ALL=(ALL) NOPASSWD: /bin/systemctl restart clamav-daemon
suporte ALL=(ALL) NOPASSWD: /bin/systemctl restart spamassassin
suporte ALL=(ALL) NOPASSWD: /bin/cp /tmp/local.cf.tmp /etc/spamassassin/local.cf
suporte ALL=(ALL) NOPASSWD: /usr/bin/tail -n * /var/log/mail.log
suporte ALL=(ALL) NOPASSWD: /bin/journalctl -u postfix -u amavis *
```

3. Defina as permissões corretas no arquivo (OBRIGATÓRIO):
```bash
sudo chmod 440 /etc/sudoers.d/mailadmin
```

## 4. Configuração do Serviço Systemd

Para que a aplicação rode em segundo plano e inicie com o sistema na porta 5000:

1. Crie o arquivo `/etc/systemd/system/mailadmin.service`:
```bash
sudo nano /etc/systemd/system/mailadmin.service
```

2. Conteúdo do serviço:
```ini
[Unit]
Description=Painel Web MailServer Admin
After=network.target postfix.service amavis.service

[Service]
Type=simple
User=suporte
Group=suporte
WorkingDirectory=/opt/mailadmin
Environment="ADMIN_USER=admin"
Environment="ADMIN_PASS=sua_senha_segura_aqui"
ExecStart=/opt/mailadmin/venv/bin/python3 /opt/mailadmin/app.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

3. Inicie e ative o serviço:
```bash
sudo systemctl daemon-reload
sudo systemctl enable mailadmin
sudo systemctl start mailadmin
```

4. Verifique o status:
```bash
sudo systemctl status mailadmin
```

Acesse via navegador no IP da sua VPN: `http://192.168.x.x:5000`
Login padrão: `admin` / `sua_senha_segura_aqui`
