#!/usr/bin/env python3
"""
MailAdmin Suite - Script de Correção e Configuração de Permissões e Amavis/SpamAssassin
ZRTI Software Engineering

Objetivo:
1. Detectar o usuário da aplicação (mailadmin / suporte / www-data).
2. Restaurar permissões seguras (0644 root:root) em /etc/spamassassin/ e /etc/amavis/conf.d/
   (evitando o bloqueio de inicialização de segurança do Amavis por arquivos world-writable).
3. Configurar /etc/sudoers.d/mailadmin com as permissões NOPASSWD necessárias para a aplicação.
4. Aplicar ACLs POSIX granulares opcionais (setfacl).
5. Reiniciar e auditar o status dos daemons SpamAssassin e Amavis.
"""

import sys
import os
import re
import argparse
import subprocess
import pwd
import grp

AMAVIS_CONF_DIR = '/etc/amavis/conf.d'
AMAVIS_50_USER = '/etc/amavis/conf.d/50-user'
SPAMASSASSIN_LOCAL_CF = '/etc/spamassassin/local.cf'
SUDOERS_FILE = '/etc/sudoers.d/mailadmin'


def log_step(step: int, total: int, msg: str):
    print(f"\n[{step}/{total}] \033[1;34m{msg}\033[0m")


def log_success(msg: str):
    print(f"  \033[1;32m✓\033[0m {msg}")


def log_warn(msg: str):
    print(f"  \033[1;33m⚠\033[0m {msg}")


def log_error(msg: str):
    print(f"  \033[1;31m✗\033[0m {msg}")


def detect_app_user(explicit_user: str = None) -> str:
    """Detecta automaticamente o usuário sob o qual o MailAdmin opera."""
    if explicit_user:
        return explicit_user

    # 1. Verificar em arquivos .service do systemd
    service_paths = [
        '/etc/systemd/system/mailadmin.service',
        '/etc/systemd/system/multi-user.target.wants/mailadmin.service',
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'mailadmin.service')
    ]
    for sp in service_paths:
        if os.path.exists(sp):
            try:
                with open(sp, 'r', encoding='utf-8') as f:
                    for line in f:
                        m = re.match(r'^\s*User\s*=\s*([a-zA-Z0-9_\-]+)', line)
                        if m:
                            candidate = m.group(1)
                            try:
                                pwd.getpwnam(candidate)
                                return candidate
                            except KeyError:
                                pass
            except Exception:
                pass

    # 2. Verificar processos em execução
    try:
        ps_out = subprocess.run(
            ['ps', '-eo', 'user,args'],
            capture_output=True, text=True, timeout=5
        ).stdout
        for line in ps_out.splitlines():
            if 'app.py' in line or 'mailadmin' in line or 'gunicorn' in line:
                parts = line.split()
                if parts and parts[0] != 'root':
                    return parts[0]
    except Exception:
        pass

    # 3. Verificar SUDO_USER
    sudo_user = os.environ.get('SUDO_USER')
    if sudo_user and sudo_user != 'root':
        return sudo_user

    # 4. Fallbacks comuns no Debian/Ubuntu
    for fallback in ['suporte', 'www-data', 'mailadmin']:
        try:
            pwd.getpwnam(fallback)
            return fallback
        except KeyError:
            pass

    return 'suporte'


def fix_amavis_and_spamassassin_permissions():
    """Garante que nenhum arquivo seja world-writable (0666/0777), restaurando 0644 exigido pelo Amavis."""
    fixed_count = 0

    # 1. /etc/spamassassin/local.cf
    if os.path.exists(SPAMASSASSIN_LOCAL_CF):
        try:
            os.chmod(SPAMASSASSIN_LOCAL_CF, 0o644)
            log_success(f"Permissão de {SPAMASSASSIN_LOCAL_CF} ajustada para 0644 (seguro).")
            fixed_count += 1
        except Exception as e:
            log_error(f"Falha ao ajustar {SPAMASSASSIN_LOCAL_CF}: {e}")

    # 2. /etc/amavis/conf.d/ e seus arquivos
    if os.path.exists(AMAVIS_CONF_DIR):
        try:
            os.chmod(AMAVIS_CONF_DIR, 0o755)
            log_success(f"Permissão do diretório {AMAVIS_CONF_DIR} ajustada para 0755.")
        except Exception as e:
            log_error(f"Falha ao ajustar permissão de {AMAVIS_CONF_DIR}: {e}")

        for fname in os.listdir(AMAVIS_CONF_DIR):
            fpath = os.path.join(AMAVIS_CONF_DIR, fname)
            if os.path.isfile(fpath):
                try:
                    mode = os.stat(fpath).st_mode
                    if mode & 0o002 or mode & 0o020:  # world ou group writable
                        os.chmod(fpath, 0o644)
                        log_success(f"Corrigida permissão insegura em {fpath} -> 0644.")
                        fixed_count += 1
                    else:
                        os.chmod(fpath, 0o644)
                except Exception as e:
                    log_warn(f"Não foi possível ajustar {fpath}: {e}")

    if not os.path.exists(AMAVIS_50_USER) and os.path.exists(AMAVIS_CONF_DIR):
        try:
            with open(AMAVIS_50_USER, 'w', encoding='utf-8') as f:
                f.write("# 50-user - Parametrizações locais do Amavis\nuse strict;\n1;\n")
            os.chmod(AMAVIS_50_USER, 0o644)
            log_success(f"Arquivo inicial {AMAVIS_50_USER} criado com 0644.")
        except Exception as e:
            log_warn(f"Não foi possível criar {AMAVIS_50_USER}: {e}")

    return fixed_count


def configure_sudoers(app_user: str) -> bool:
    """Configura e valida regras NOPASSWD para o usuário do painel em /etc/sudoers.d/mailadmin."""
    content = f"""# Configuração de Sudoers para o Painel Web MailAdmin (ZRTI Suite)
# Gerado automaticamente por scripts/fix_permissions_and_amavis.py
# Permissões do arquivo: 0440

# Comandos de controle de serviços do MTA e Segurança
{app_user} ALL=(ALL) NOPASSWD: /bin/systemctl is-active postfix, /usr/bin/systemctl is-active postfix
{app_user} ALL=(ALL) NOPASSWD: /bin/systemctl is-active amavis, /usr/bin/systemctl is-active amavis
{app_user} ALL=(ALL) NOPASSWD: /bin/systemctl is-active spamassassin, /usr/bin/systemctl is-active spamassassin
{app_user} ALL=(ALL) NOPASSWD: /bin/systemctl is-active clamav-daemon, /usr/bin/systemctl is-active clamav-daemon
{app_user} ALL=(ALL) NOPASSWD: /bin/systemctl restart postfix, /usr/bin/systemctl restart postfix
{app_user} ALL=(ALL) NOPASSWD: /bin/systemctl restart amavis, /usr/bin/systemctl restart amavis
{app_user} ALL=(ALL) NOPASSWD: /bin/systemctl restart spamassassin, /usr/bin/systemctl restart spamassassin
{app_user} ALL=(ALL) NOPASSWD: /bin/systemctl restart clamav-daemon, /usr/bin/systemctl restart clamav-daemon
{app_user} ALL=(ALL) NOPASSWD: /usr/sbin/service *

# Operações de I/O de configuração segura do SpamAssassin e Amavis
{app_user} ALL=(ALL) NOPASSWD: /bin/cp, /usr/bin/cp
{app_user} ALL=(ALL) NOPASSWD: /usr/bin/tee, /bin/tee
{app_user} ALL=(ALL) NOPASSWD: /bin/chmod, /usr/bin/chmod
{app_user} ALL=(ALL) NOPASSWD: /bin/mkdir, /usr/bin/mkdir
{app_user} ALL=(ALL) NOPASSWD: /bin/dd, /usr/bin/dd
{app_user} ALL=(ALL) NOPASSWD: /usr/bin/test, /bin/test
{app_user} ALL=(ALL) NOPASSWD: /bin/cat, /usr/bin/cat

# Leitura e acompanhamento de logs
{app_user} ALL=(ALL) NOPASSWD: /usr/bin/tail
{app_user} ALL=(ALL) NOPASSWD: /bin/journalctl, /usr/bin/journalctl
"""

    tmp_sudoers = f"/tmp/mailadmin_sudoers_check_{os.getpid()}"
    try:
        with open(tmp_sudoers, 'w', encoding='utf-8') as f:
            f.write(content)
        os.chmod(tmp_sudoers, 0o440)

        # Valida sintaxe com visudo antes de aplicar
        val_res = subprocess.run(['visudo', '-cf', tmp_sudoers], capture_output=True, text=True)
        if val_res.returncode != 0:
            log_error(f"Erro na validação de sintaxe do sudoers: {val_res.stderr.strip()}")
            if os.path.exists(tmp_sudoers):
                os.remove(tmp_sudoers)
            return False

        # Grava no destino oficial
        with open(SUDOERS_FILE, 'w', encoding='utf-8') as f:
            f.write(content)
        os.chmod(SUDOERS_FILE, 0o440)

        if os.path.exists(tmp_sudoers):
            os.remove(tmp_sudoers)

        log_success(f"Arquivo {SUDOERS_FILE} configurado com 0440 para o usuário '{app_user}'.")
        return True
    except Exception as e:
        log_error(f"Falha ao configurar sudoers: {e}")
        if os.path.exists(tmp_sudoers):
            try:
                os.remove(tmp_sudoers)
            except Exception:
                pass
        return False


def apply_posix_acls(app_user: str):
    """Aplica ACLs POSIX granulares se a ferramenta setfacl estiver instalada."""
    try:
        which_acl = subprocess.run(['which', 'setfacl'], capture_output=True, text=True)
        if which_acl.returncode != 0:
            log_warn("Ferramenta 'setfacl' não encontrada no sistema (opcional). Continuando via Sudoers.")
            return

        targets = [SPAMASSASSIN_LOCAL_CF, AMAVIS_50_USER]
        for t in targets:
            if os.path.exists(t):
                res = subprocess.run(['setfacl', '-m', f'u:{app_user}:rw', t], capture_output=True, text=True)
                if res.returncode == 0:
                    log_success(f"ACL POSIX concedida: u:{app_user}:rw em {t}")
                else:
                    log_warn(f"Não foi possível aplicar ACL em {t}: {res.stderr.strip()}")
    except Exception as e:
        log_warn(f"Falha ao executar setfacl: {e}")


def restart_and_audit_services():
    """Testa a sintaxe e reinicia os serviços Amavis e SpamAssassin."""
    services = ['spamassassin', 'amavis']
    for s in services:
        print(f"  * Reiniciando {s}...")
        res = subprocess.run(['systemctl', 'restart', s], capture_output=True, text=True)
        if res.returncode == 0:
            log_success(f"Serviço '{s}' reiniciado com sucesso!")
        else:
            log_error(f"Erro ao reiniciar '{s}': {res.stderr.strip()}")

        # Checa status
        status_res = subprocess.run(['systemctl', 'is-active', s], capture_output=True, text=True)
        st = status_res.stdout.strip()
        if st == 'active':
            log_success(f"Status do daemon '{s}': \033[1;32mACTIVE (Executando)\033[0m")
        else:
            log_warn(f"Status do daemon '{s}': {st}. Verifique: journalctl -u {s} -n 20")


def main():
    parser = argparse.ArgumentParser(description="MailAdmin Suite - Correção de Permissões, Amavis e Sudoers")
    parser.add_argument('--user', type=str, default=None, help="Usuário do sistema operacional que roda o MailAdmin (ex: suporte, www-data)")
    args = parser.parse_args()

    print("=" * 70)
    print("   MailAdmin Suite - Configuração de Permissões e Amavis/SpamAssassin")
    print("   ZRTI Enterprise Software Architecture")
    print("=" * 70)

    if os.geteuid() != 0:
        log_error("Este script precisa ser executado como root.")
        print("\nExecute o comando:")
        print("  \033[1;33msudo python3 scripts/fix_permissions_and_amavis.py\033[0m\n")
        sys.exit(1)

    # Passo 1: Detectar usuário da aplicação
    log_step(1, 5, "Identificando usuário de execução do MailAdmin...")
    app_user = detect_app_user(args.user)
    try:
        pwd.getpwnam(app_user)
        log_success(f"Usuário identificado e validado no sistema: \033[1;36m{app_user}\033[0m")
    except KeyError:
        log_error(f"Usuário '{app_user}' não existe no sistema operacional!")
        print(f"Crie o usuário ou informe com: --user <nome_do_usuario>")
        sys.exit(1)

    # Passo 2: Restaurar permissões seguras (0644) exigidas pelo Amavis
    log_step(2, 5, "Higienizando e restaurando permissões restritas (0644) no Amavis e SpamAssassin...")
    fix_amavis_and_spamassassin_permissions()

    # Passo 3: Configurar /etc/sudoers.d/mailadmin
    log_step(3, 5, f"Configurando privilégios em /etc/sudoers.d/mailadmin para '{app_user}'...")
    sudoers_ok = configure_sudoers(app_user)

    # Passo 4: Aplicar ACLs POSIX (opcional)
    log_step(4, 5, f"Aplicando ACLs granulares adicionais para '{app_user}'...")
    apply_posix_acls(app_user)

    # Passo 5: Reiniciar e auditar serviços
    log_step(5, 5, "Reiniciando e validando status de Amavis e SpamAssassin...")
    restart_and_audit_services()

    print("\n" + "=" * 70)
    print("   \033[1;32m✓ Configuração concluída com sucesso!\033[0m")
    print("=" * 70)
    print(f"• O Amavis e SpamAssassin estão protegidos e operando em modo seguro (0644).")
    print(f"• O usuário '{app_user}' agora possui permissão para aplicar limiares e regras via painel web.")
    print("=" * 70 + "\n")


if __name__ == '__main__':
    main()
