from flask import Blueprint, request, jsonify
from flask_login import login_required
import subprocess
import os

services_bp = Blueprint('services', __name__, url_prefix='/api/services')

LOCAL_CF_PATH = os.environ.get('LOCAL_CF_PATH', '/etc/spamassassin/local.cf')
MAIL_LOG_PATH = os.environ.get('MAIL_LOG_PATH', '/var/log/mail.log')

def run_cmd(cmd_list):
    try:
        result = subprocess.run(
            cmd_list,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=15
        )
        return {
            'returncode': result.returncode,
            'stdout': result.stdout.strip(),
            'stderr': result.stderr.strip()
        }
    except Exception as e:
        return {'returncode': -1, 'stdout': '', 'stderr': str(e)}

@services_bp.route('/status', methods=['GET'])
@login_required
def get_status():
    svcs = ['postfix', 'amavis', 'clamav-daemon', 'spamassassin']
    result_data = {}

    for svc in svcs:
        res = run_cmd(['sudo', 'systemctl', 'is-active', svc])
        state = res['stdout'] if res['returncode'] == 0 else (res['stdout'] or 'inactive')
        result_data[svc] = {
            'active': state == 'active',
            'state': state
        }

    return jsonify({'success': True, 'services': result_data})

@services_bp.route('/restart', methods=['POST'])
@login_required
def restart_service():
    data = request.get_json() or {}
    service = data.get('service')
    allowed = ['postfix', 'amavis', 'clamav-daemon', 'spamassassin']

    if service not in allowed:
        return jsonify({'success': False, 'message': 'Serviço não permitido.'}), 400

    res = run_cmd(['sudo', 'systemctl', 'restart', service])
    if res['returncode'] == 0:
        return jsonify({'success': True, 'message': f'Serviço {service} reiniciado com sucesso!'})
    else:
        return jsonify({'success': False, 'message': f'Erro ao reiniciar: {res["stderr"] or res["stdout"]}'}), 500

@services_bp.route('/spamassassin/rules', methods=['GET'])
@login_required
def get_rules():
    try:
        if not os.path.exists(LOCAL_CF_PATH):
            return jsonify({'success': False, 'message': f'Arquivo {LOCAL_CF_PATH} não encontrado.'}), 404
        with open(LOCAL_CF_PATH, 'r', encoding='utf-8') as f:
            content = f.read()
        return jsonify({'success': True, 'content': content})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@services_bp.route('/spamassassin/rules', methods=['POST'])
@login_required
def save_rules():
    data = request.get_json() or {}
    content = data.get('content', '')

    try:
        tmp_file = '/tmp/local.cf.tmp'
        with open(tmp_file, 'w', encoding='utf-8') as f:
            f.write(content)

        cp_res = run_cmd(['sudo', 'cp', tmp_file, LOCAL_CF_PATH])
        if cp_res['returncode'] != 0:
            return jsonify({'success': False, 'message': f'Erro de cópia sudo: {cp_res["stderr"]}'}), 500

        if os.path.exists(tmp_file):
            os.remove(tmp_file)

        restart_res = run_cmd(['sudo', 'systemctl', 'restart', 'amavis'])
        return jsonify({
            'success': True,
            'message': 'Regras salvas no local.cf e Amavis reiniciado com sucesso!'
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@services_bp.route('/spamassassin/lint', methods=['POST'])
@login_required
def lint_rules():
    data = request.get_json() or {}
    content = data.get('content')

    if content:
        tmp_file = '/tmp/test_spamassassin.cf'
        try:
            with open(tmp_file, 'w', encoding='utf-8') as f:
                f.write(content)
            res = run_cmd(['spamassassin', '--lint', '-C', tmp_file])
            if os.path.exists(tmp_file):
                os.remove(tmp_file)
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)}), 500
    else:
        res = run_cmd(['spamassassin', '--lint'])

    if res['returncode'] == 0:
        return jsonify({'success': True, 'message': 'Sintaxe OK! O arquivo de regras não contém erros.'})
    else:
        return jsonify({'success': False, 'message': res['stderr'] or res['stdout']})

@services_bp.route('/logs', methods=['GET'])
@login_required
def get_logs():
    lines_count = request.args.get('lines', default=100, type=int)
    if os.path.exists(MAIL_LOG_PATH):
        res = run_cmd(['sudo', 'tail', '-n', str(lines_count), MAIL_LOG_PATH])
        if res['returncode'] == 0:
            return jsonify({'success': True, 'logs': res['stdout'].split('\n')})

    journal_res = run_cmd(['sudo', 'journalctl', '-u', 'postfix', '-u', 'amavis', '-n', str(lines_count), '--no-pager'])
    if journal_res['returncode'] == 0:
        return jsonify({'success': True, 'logs': journal_res['stdout'].split('\n')})

    return jsonify({'success': False, 'logs': ['Logs inacessíveis.']}), 500
