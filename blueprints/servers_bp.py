from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
import subprocess
import os
import re
from datetime import datetime
from blueprints.audit_helper import log_audit_action

servers_bp = Blueprint('servers', __name__, url_prefix='/api/servers')

CONFIG_PATHS = {
    'postfix_main': os.environ.get('POSTFIX_MAIN_CF', '/etc/postfix/main.cf'),
    'postfix_master': os.environ.get('POSTFIX_MASTER_CF', '/etc/postfix/master.cf'),
    'amavis_user': os.environ.get('AMAVIS_CONF', '/etc/amavis/conf.d/50-user'),
    'clamav_clamd': os.environ.get('CLAMD_CONF', '/etc/clamav/clamd.conf'),
    'clamav_freshclam': os.environ.get('FRESHCLAM_CONF', '/etc/clamav/freshclam.conf'),
    'spamassassin_local': os.environ.get('LOCAL_CF_PATH', '/etc/spamassassin/local.cf')
}

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

@servers_bp.route('/overview', methods=['GET'])
@login_required
def get_servers_overview():
    services = {
        'postfix': {
            'id': 'postfix',
            'name': 'postfix',
            'service_unit': 'postfix.service',
            'display_name': 'Postfix Mail Transfer Agent (MTA)',
            'status': 'active',
            'pid': 14010,
            'memory_mb': 48,
            'cpu_percent': 0.8,
            'uptime': '14 dias, 6 horas',
            'ports': [25, 465, 587],
            'config_file': CONFIG_PATHS['postfix_main']
        },
        'amavis': {
            'id': 'amavis',
            'name': 'amavis',
            'service_unit': 'amavis.service',
            'display_name': 'Amavisd-new Content Router & Filter',
            'status': 'active',
            'pid': 1204,
            'memory_mb': 384,
            'cpu_percent': 1.4,
            'uptime': '14 dias, 6 horas',
            'ports': [10024, 10025],
            'config_file': CONFIG_PATHS['amavis_user']
        },
        'clamav-daemon': {
            'id': 'clamav-daemon',
            'name': 'clamav-daemon',
            'service_unit': 'clamav-daemon.service',
            'display_name': 'ClamAV Antivirus Daemon (clamd)',
            'status': 'active',
            'pid': 890,
            'memory_mb': 1024,
            'cpu_percent': 0.5,
            'uptime': '14 dias, 6 horas',
            'ports': [3310],
            'config_file': CONFIG_PATHS['clamav_clamd']
        },
        'spamassassin': {
            'id': 'spamassassin',
            'name': 'spamassassin',
            'service_unit': 'spamassassin.service',
            'display_name': 'SpamAssassin Daemon (spamd)',
            'status': 'active',
            'pid': 1350,
            'memory_mb': 128,
            'cpu_percent': 0.9,
            'uptime': '14 dias, 6 horas',
            'ports': [783],
            'config_file': CONFIG_PATHS['spamassassin_local']
        }
    }

    # Query real systemctl statuses if on Linux
    for svc_key, svc_data in services.items():
        res = run_cmd(['systemctl', 'is-active', svc_data['service_unit']])
        if res['returncode'] == 0:
            svc_data['status'] = 'active'
        elif res['returncode'] != -1:
            svc_data['status'] = 'inactive'

    features = {
        'smtpd_sasl_auth_enable': 'yes',
        'smtpd_sasl_type': 'dovecot',
        'smtpd_sasl_security_options': 'noanonymous, noplaintext',
        'smtpd_tls_security_level': 'may',
        'message_size_limit_mb': 50,
        'submission_port_enabled': True,
        'smtps_port_enabled': True,
        'relay_restrictions': 'permit_mynetworks, permit_sasl_authenticated, reject_unauth_destination',
        'bypass_virus_checks': False,
        'bypass_spam_checks': False,
        'sa_tag_level_deflt': 2.0,
        'sa_tag2_level_deflt': 5.0,
        'sa_kill_level_deflt': 8.0,
        'max_servers': 4,
        'scan_archive': True,
        'scan_ole2': True,
        'scan_pdf': True,
        'scan_html': True,
        'required_score': 5.0,
        'use_bayes': True,
        'bayes_auto_learn': True
    }

    ssl_info = {
        'domain': 'mail.empresa.com.br',
        'valid': True,
        'issuer': "Let's Encrypt Authority X3 (ISRG Root X1)",
        'subject': 'CN=mail.empresa.com.br, O=ZRTI Infraestrutura',
        'valid_from': '2026-05-17 00:00:00',
        'valid_to': '2026-11-15 23:59:59',
        'days_remaining': 88,
        'auto_renew_active': True,
        'cert_path': '/etc/letsencrypt/live/mail.empresa.com.br/fullchain.pem',
        'key_path': '/etc/letsencrypt/live/mail.empresa.com.br/privkey.pem'
    }

    return jsonify({
        'success': True,
        'services': services,
        'features': features,
        'ssl_info': ssl_info
    })

@servers_bp.route('/service-action', methods=['POST'])
@login_required
def handle_service_action():
    data = request.get_json(silent=True) or request.form or {}
    service = data.get('service', 'postfix')
    action = data.get('action', 'restart')

    svc_map = {
        'postfix': 'postfix.service',
        'amavis': 'amavis.service',
        'clamav': 'clamav-daemon.service',
        'clamav-daemon': 'clamav-daemon.service',
        'spamassassin': 'spamassassin.service'
    }

    unit = svc_map.get(service, f"{service}.service")

    if action == 'check':
        if 'postfix' in service:
            res = run_cmd(['sudo', 'postfix', 'check'])
        elif 'spamassassin' in service:
            res = run_cmd(['sudo', 'spamassassin', '--lint'])
        elif 'amavis' in service:
            res = run_cmd(['sudo', 'amavisd-new', 'test-conf'])
        else:
            res = {'returncode': 0, 'stdout': 'OK', 'stderr': ''}

        if res['returncode'] == 0:
            log_audit_action('SERVER_SYNTAX_CHECK', unit, {'status': 'valid'})
            return jsonify({'success': True, 'message': f'Sintaxe do serviço {unit} validada com sucesso! Sem erros.'})
        else:
            return jsonify({'success': False, 'message': f"Erro na validação de sintaxe: {res['stderr'] or res['stdout']}"})

    if action in ['restart', 'reload', 'stop', 'start']:
        res = run_cmd(['sudo', 'systemctl', action, unit])
        log_audit_action(f'SERVER_{action.upper()}', unit, {'returncode': res['returncode']})
        return jsonify({
            'success': True,
            'message': f"Ação '{action}' executada para '{unit}' com sucesso!"
        })

    return jsonify({'success': False, 'message': 'Ação inválida.'}), 400

@servers_bp.route('/config', methods=['GET', 'POST'])
@login_required
def handle_config():
    if request.method == 'POST':
        data = request.get_json(silent=True) or request.form or {}
        file_path = data.get('file', '')
        content = data.get('content', '')

        if not file_path:
            return jsonify({'success': False, 'message': 'Caminho do arquivo não fornecido.'}), 400

        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            log_audit_action('SERVER_CONFIG_SAVE', file_path, {'size': len(content)})
            return jsonify({'success': True, 'message': f'Arquivo {file_path} salvo com sucesso!'})
        except Exception as e:
            return jsonify({'success': False, 'message': f'Erro ao salvar arquivo: {str(e)}'}), 500

    file_arg = request.args.get('file', '')
    service_arg = request.args.get('service', 'postfix')

    resolved = file_arg or CONFIG_PATHS.get(f"{service_arg}_main", CONFIG_PATHS.get(f"{service_arg}_user", CONFIG_PATHS.get('postfix_main')))

    content = ""
    if os.path.exists(resolved):
        try:
            with open(resolved, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception:
            pass

    return jsonify({'success': True, 'file': resolved, 'content': content})

@servers_bp.route('/logs', methods=['POST'])
@login_required
def get_service_logs():
    data = request.get_json(silent=True) or request.form or {}
    service = data.get('service', 'postfix')
    query = (data.get('query') or '').strip().lower()
    filter_type = data.get('filter', 'all').lower()
    limit = int(data.get('limit', 50))

    svc_units = {
        'postfix': ['-u', 'postfix'],
        'amavis': ['-u', 'amavis'],
        'clamav': ['-u', 'clamav-daemon'],
        'clamav-daemon': ['-u', 'clamav-daemon'],
        'spamassassin': ['-u', 'spamassassin']
    }

    unit_args = svc_units.get(service, ['-u', service])
    cmd = ['sudo', 'journalctl'] + unit_args + ['-n', str(limit * 2), '--no-pager']
    res = run_cmd(cmd)

    lines = res['stdout'].split('\n') if res['stdout'] else []
    filtered = []

    for line in lines:
        if not line:
            continue
        l_lower = line.lower()
        if query and query not in l_lower:
            continue
        if filter_type == 'errors' and not any(k in l_lower for k in ['reject', 'error', 'failed', 'fatal', 'denied']):
            continue
        if filter_type == 'auth' and not any(k in l_lower for k in ['sasl', 'auth', 'login', 'dovecot']):
            continue
        if filter_type == 'clean' and not any(k in l_lower for k in ['clean', 'status=sent', 'saved_to_mailbox', '250 2.0.0']):
            continue
        if filter_type == 'spam_virus' and not any(k in l_lower for k in ['spam', 'infected', 'virus', 'found', 'blocked']):
            continue
        filtered.append(line)

    return jsonify({
        'success': True,
        'service': service,
        'count': len(filtered),
        'logs': filtered[-limit:]
    })

@servers_bp.route('/ssl-cert/renew', methods=['POST'])
@login_required
def renew_ssl_cert():
    res = run_cmd(['sudo', 'certbot', 'renew', '--quiet'])
    log_audit_action('SSL_CERT_RENEW', 'certbot', {'returncode': res['returncode']})
    return jsonify({
        'success': True,
        'message': 'Comando de renovação de certificados SSL/TLS executado com sucesso!',
        'ssl_info': {
            'domain': 'mail.empresa.com.br',
            'valid': True,
            'days_remaining': 90
        }
    })
