#!/usr/bin/env python3
"""
Painel de Administração Web para Servidor de E-mail (Postfix, Amavis, SpamAssassin)
Ambiente: Debian / Ubuntu Linux
Backend: Python 3 + Flask + Basic Auth
"""

import os
import subprocess
import functools
from flask import Flask, render_template, request, jsonify, Response

app = Flask(__name__)

# Configurações de Autenticação Básica (Altere antes de colocar em produção)
BASIC_AUTH_USERNAME = os.environ.get("ADMIN_USER", "admin")
BASIC_AUTH_PASSWORD = os.environ.get("ADMIN_PASS", "senha_segura_123")

# Caminhos dos arquivos no Linux
LOCAL_CF_PATH = os.environ.get("LOCAL_CF_PATH", "/etc/spamassassin/local.cf")
MAIL_LOG_PATH = os.environ.get("MAIL_LOG_PATH", "/var/log/mail.log")

# Decorador para Autenticação Básica (HTTP Basic Auth)
def check_auth(username, password):
    return username == BASIC_AUTH_USERNAME and password == BASIC_AUTH_PASSWORD

def authenticate():
    return Response(
        "Acesso não autorizado. Por favor forneça credenciais válidas.\n",
        401,
        {"WWW-Authenticate": 'Basic realm="Painel de Administracao do Mail Server"'}
    )

def requires_auth(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        return f(*args, **kwargs)
    return decorated

def run_cmd(cmd_list):
    """Executa comando no shell com tratamento de exceções."""
    try:
        result = subprocess.run(
            cmd_list,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=15
        )
        return {
            "returncode": result.returncode,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip()
        }
    except Exception as e:
        return {
            "returncode": -1,
            "stdout": "",
            "stderr": f"Erro ao executar comando: {str(e)}"
        }

@app.route("/")
@requires_auth
def index():
    return render_template("index.html")

@app.route("/api/status", methods=["GET"])
@requires_auth
def get_services_status():
    """Verifica status do Postfix, Amavis e ClamAV via systemctl is-active."""
    services = ["postfix", "amavis", "clamav-daemon"]
    status_data = {}

    for service in services:
        res = run_cmd(["sudo", "systemctl", "is-active", service])
        state = res["stdout"] if res["returncode"] == 0 else (res["stdout"] or "inactive/error")
        status_data[service] = {
            "active": state == "active",
            "state": state
        }

    return jsonify(status_data)

@app.route("/api/service/restart", methods=["POST"])
@requires_auth
def restart_service():
    """Reinicia o serviço especificado (postfix, amavis, etc)."""
    data = request.get_json() or {}
    service = data.get("service")

    allowed_services = ["postfix", "amavis", "clamav-daemon", "spamassassin"]
    if service not in allowed_services:
        return jsonify({"success": False, "message": "Serviço inválido ou não permitido."}), 400

    res = run_cmd(["sudo", "systemctl", "restart", service])
    if res["returncode"] == 0:
        return jsonify({"success": True, "message": f"Serviço '{service}' reiniciado com sucesso!"})
    else:
        return jsonify({
            "success": False,
            "message": f"Falha ao reiniciar '{service}': {res['stderr'] or res['stdout']}"
        }), 500

@app.route("/api/spamassassin/rules", methods=["GET"])
@requires_auth
def get_spam_rules():
    """Lê o conteúdo do arquivo /etc/spamassassin/local.cf."""
    try:
        if not os.path.exists(LOCAL_CF_PATH):
            return jsonify({
                "success": False,
                "content": "",
                "message": f"Arquivo {LOCAL_CF_PATH} não foi encontrado no sistema."
            }), 404

        with open(LOCAL_CF_PATH, "r", encoding="utf-8") as f:
            content = f.read()

        return jsonify({"success": True, "content": content})
    except PermissionError:
        return jsonify({"success": False, "message": f"Permissão negada ao ler {LOCAL_CF_PATH}"}), 403
    except Exception as e:
        return jsonify({"success": False, "message": f"Erro ao ler arquivo: {str(e)}"}), 500

@app.route("/api/spamassassin/rules", methods=["POST"])
@requires_auth
def save_spam_rules():
    """Salva o conteúdo em /etc/spamassassin/local.cf e reinicia o Amavis."""
    data = request.get_json() or {}
    content = data.get("content", "")

    try:
        # Escreve via arquivo temporário com sudo ou gravação direta
        temp_file = "/tmp/local.cf.tmp"
        with open(temp_file, "w", encoding="utf-8") as f:
            f.write(content)

        # Copia usando sudo para garantir permissões de escrita em /etc/spamassassin/
        cp_res = run_cmd(["sudo", "cp", temp_file, LOCAL_CF_PATH])
        if cp_res["returncode"] != 0:
            return jsonify({
                "success": False,
                "message": f"Erro de permissão ao salvar em {LOCAL_CF_PATH}: {cp_res['stderr']}"
            }), 500

        # Remove temp
        if os.path.exists(temp_file):
            os.remove(temp_file)

        # Reinicia Amavis automaticamente conforme requisito
        restart_res = run_cmd(["sudo", "systemctl", "restart", "amavis"])
        if restart_res["returncode"] == 0:
            return jsonify({
                "success": True,
                "message": "Regras salvas com sucesso no /etc/spamassassin/local.cf e Amavis reiniciado!"
            })
        else:
            return jsonify({
                "success": True, # Salvo, porém aviso sobre restart
                "message": f"Regras salvas, porém erro ao reiniciar o Amavis: {restart_res['stderr']}"
            })

    except Exception as e:
        return jsonify({"success": False, "message": f"Exceção ao salvar arquivo: {str(e)}"}), 500

@app.route("/api/spamassassin/lint", methods=["POST"])
@requires_auth
def test_spam_syntax():
    """Executa 'spamassassin --lint' para testar a sintaxe das regras."""
    # Pode receber conteúdo para testar antes de salvar, gravando em arquivo temporário
    data = request.get_json() or {}
    content = data.get("content")

    if content:
        # Grava em arquivo temporário e testa com -C
        temp_file = "/tmp/test_spamassassin.cf"
        try:
            with open(temp_file, "w", encoding="utf-8") as f:
                f.write(content)
            res = run_cmd(["spamassassin", "--lint", "-C", temp_file])
            if os.path.exists(temp_file):
                os.remove(temp_file)
        except Exception as e:
            return jsonify({"success": False, "message": f"Erro na preparação do teste: {str(e)}"}), 500
    else:
        # Testa arquivo atual do sistema
        res = run_cmd(["spamassassin", "--lint"])

    if res["returncode"] == 0:
        return jsonify({
            "success": True,
            "message": "Sintaxe OK! O arquivo de regras do SpamAssassin não contém erros."
        })
    else:
        err_msg = res["stderr"] or res["stdout"] or "Erro de sintaxe detectado pelo SpamAssassin."
        return jsonify({
            "success": False,
            "message": f"Erro de Sintaxe:\n{err_msg}"
        })

@app.route("/api/logs", methods=["GET"])
@requires_auth
def get_logs():
    """Lê as últimas 100 linhas do arquivo de log do servidor de e-mail."""
    lines_count = request.args.get("lines", default=100, type=int)

    # Tenta ler /var/log/mail.log via tail com sudo se necessário, ou journalctl
    if os.path.exists(MAIL_LOG_PATH):
        res = run_cmd(["sudo", "tail", "-n", str(lines_count), MAIL_LOG_PATH])
        if res["returncode"] == 0:
            lines = res["stdout"].split("\n")
            return jsonify({"success": True, "logs": lines, "source": MAIL_LOG_PATH})

    # Fallback para journalctl se mail.log não existir (ex: rsyslog não ativado)
    journal_res = run_cmd(["sudo", "journalctl", "-u", "postfix", "-u", "amavis", "-n", str(lines_count), "--no-pager"])
    if journal_res["returncode"] == 0:
        lines = journal_res["stdout"].split("\n")
        return jsonify({"success": True, "logs": lines, "source": "journalctl"})

    return jsonify({
        "success": False,
        "logs": ["Não foi possível acessar /var/log/mail.log nem journalctl. Verifique as permissões de sudoers."],
        "source": "error"
    }), 500

if __name__ == "__main__":
    print("Iniciando Painel de Administração Mail Server na porta 5000...")
    app.run(host="0.0.0.0", port=5000, debug=False)
