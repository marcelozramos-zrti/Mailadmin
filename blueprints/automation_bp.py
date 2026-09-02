from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
import subprocess
import datetime
import os
import sys

from models import db, CronJob
from blueprints.audit_helper import log_audit_action

automation_bp = Blueprint('automation', __name__, url_prefix='/api/automation')

PRESET_MAP = {
    '1h': '0 * * * *',
    '3h': '0 */3 * * *',
    '6h': '0 */6 * * *',
    'daily': '0 2 * * *'
}

def sync_system_crontab():
    """
    Sincroniza os agendamentos cadastrados na tabela cron_jobs com o crontab do sistema Debian Linux.
    """
    try:
        jobs = CronJob.query.filter_by(enabled=True).all()
        cron_lines = ["# MailAdmin Suite Automated Crontab Sync"]
        for j in jobs:
            cron_lines.append(f"{j.cron_expression} {j.command} # MAILADMIN_JOB_{j.id}")

        crontab_content = "\n".join(cron_lines) + "\n"

        # Tenta aplicar via subprocess crontab
        process = subprocess.Popen(['crontab', '-'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = process.communicate(input=crontab_content)
        return process.returncode == 0
    except Exception as e:
        print(f"Aviso na sincronização do crontab do sistema: {e}")
        return False

SCRIPTS_DIR = "/opt/mailadmin/scripts"

def save_inline_script(script_filename, script_content):
    """
    Salva ou atualiza um script físico em /opt/mailadmin/scripts/<filename> com permissão de execução (+x).
    Retorna o caminho absoluto do script salvo.
    """
    if not script_filename:
        script_filename = f"script_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.sh"
    
    # Sanitiza o nome do arquivo para prevenir path traversal
    safe_filename = os.path.basename(script_filename.strip())
    if not safe_filename.endswith(('.sh', '.py', '.bash', '.pl')):
        safe_filename += '.sh'

    try:
        os.makedirs(SCRIPTS_DIR, exist_ok=True)
        file_path = os.path.join(SCRIPTS_DIR, safe_filename)
    except Exception:
        # Fallback se permissão for restrita no ambiente
        fallback_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts")
        os.makedirs(fallback_dir, exist_ok=True)
        file_path = os.path.join(fallback_dir, safe_filename)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(script_content.strip() + '\n')

    # Atribui permissão de execução (+x / 0o755)
    try:
        os.chmod(file_path, 0o755)
    except Exception as e:
        print(f"Aviso ao definir chmod +x no script {file_path}: {e}")

    return file_path

@automation_bp.route('/jobs', methods=['GET'])
@login_required
def list_jobs():
    """Lista todas as automações e tarefas agendadas."""
    try:
        jobs = CronJob.query.order_by(CronJob.id.asc()).all()
        return jsonify({
            'status': 'success',
            'success': True,
            'jobs': [j.to_dict() for j in jobs]
        })
    except Exception as e:
        print(f"Aviso ao carregar automações: {e}")
        return jsonify({
            'status': 'success',
            'success': True,
            'jobs': []
        })

@automation_bp.route('/jobs', methods=['POST'])
@login_required
def create_job():
    """Cria um novo agendamento visual de crontab."""
    data = request.get_json(silent=True) or request.form or {}
    name = (data.get('name') or '').strip()
    preset = (data.get('schedule_preset') or 'custom').strip()
    cron_expr = (data.get('cron_expression') or data.get('schedule') or '').strip()
    command = (data.get('command') or '').strip()
    script_content = (data.get('script_content') or '').strip()
    script_filename = (data.get('script_filename') or '').strip()

    # Se fornecido script inline, grava no arquivo físico
    if script_content:
        saved_script_path = save_inline_script(script_filename, script_content)
        if not command:
            if saved_script_path.endswith('.py'):
                command = f"python3 {saved_script_path}"
            else:
                command = saved_script_path

    if not name or not command:
        return jsonify({'status': 'error', 'success': False, 'message': 'Nome e Comando/Script da automação são obrigatórios.'}), 400

    if preset in PRESET_MAP:
        cron_expr = PRESET_MAP[preset]
    elif not cron_expr:
        cron_expr = '0 * * * *'

    try:
        new_job = CronJob(
            name=name,
            schedule_preset=preset,
            cron_expression=cron_expr,
            command=command,
            enabled=True
        )
        db.session.add(new_job)
        db.session.commit()

        sync_system_crontab()
        log_audit_action('CRONJOB_CREATE', target=name, details={'preset': preset, 'cron': cron_expr, 'command': command})

        return jsonify({
            'status': 'success',
            'success': True,
            'message': f'Automação "{name}" criada com sucesso!',
            'job': new_job.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'success': False, 'message': f'Erro ao criar automação: {str(e)}'}), 500

@automation_bp.route('/jobs/<int:job_id>', methods=['PUT', 'POST'])
@automation_bp.route('/jobs/<int:job_id>/edit', methods=['POST'])
@login_required
def edit_job(job_id):
    """Edita uma automação existente."""
    job = CronJob.query.get(job_id)
    if not job:
        return jsonify({'status': 'error', 'success': False, 'message': 'Automação não encontrada.'}), 404

    data = request.get_json(silent=True) or request.form or {}
    name = (data.get('name') or job.name).strip()
    preset = (data.get('schedule_preset') or job.schedule_preset).strip()
    cron_expr = (data.get('cron_expression') or data.get('schedule') or job.cron_expression).strip()
    command = (data.get('command') or job.command).strip()
    script_content = (data.get('script_content') or '').strip()
    script_filename = (data.get('script_filename') or '').strip()

    if script_content:
        saved_script_path = save_inline_script(script_filename, script_content)
        if not command or command == job.command:
            if saved_script_path.endswith('.py'):
                command = f"python3 {saved_script_path}"
            else:
                command = saved_script_path

    if preset in PRESET_MAP:
        cron_expr = PRESET_MAP[preset]

    try:
        job.name = name
        job.schedule_preset = preset
        job.cron_expression = cron_expr
        job.command = command
        db.session.commit()

        sync_system_crontab()
        log_audit_action('CRONJOB_EDIT', target=name, details={'job_id': job_id, 'preset': preset, 'cron': cron_expr})

        return jsonify({
            'status': 'success',
            'success': True,
            'message': f'Automação "{name}" atualizada com sucesso!',
            'job': job.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'success': False, 'message': f'Erro ao atualizar automação: {str(e)}'}), 500

@automation_bp.route('/jobs/<int:job_id>/toggle', methods=['POST', 'PUT'])
@login_required
def toggle_job(job_id):
    """Alterna status (enable/disable) de uma automação."""
    job = CronJob.query.get(job_id)
    if not job:
        return jsonify({'success': False, 'message': 'Automação não encontrada.'}), 404

    data = request.get_json(silent=True) or {}
    if 'enabled' in data:
        job.enabled = bool(data['enabled'])
    else:
        job.enabled = not job.enabled

    try:
        db.session.commit()
        sync_system_crontab()

        status_str = "Habilitada" if job.enabled else "Desabilitada"
        log_audit_action('CRONJOB_TOGGLE', target=job.name, details={'job_id': job_id, 'enabled': job.enabled})

        return jsonify({
            'success': True,
            'message': f'Automação "{job.name}" {status_str} com sucesso!',
            'enabled': job.enabled
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erro ao alterar status da automação: {str(e)}'}), 500

@automation_bp.route('/jobs/<int:job_id>', methods=['DELETE'])
@automation_bp.route('/jobs/<int:job_id>/delete', methods=['POST'])
@login_required
def delete_job(job_id):
    """Exclui uma automação."""
    job = CronJob.query.get(job_id)
    if not job:
        return jsonify({'success': False, 'message': 'Automação não encontrada.'}), 404

    try:
        name = job.name
        db.session.delete(job)
        db.session.commit()

        sync_system_crontab()
        log_audit_action('CRONJOB_DELETE', target=name, details={'job_id': job_id})

        return jsonify({
            'success': True,
            'message': f'Automação "{name}" excluída com sucesso!'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erro ao excluir automação: {str(e)}'}), 500

@automation_bp.route('/run-now/<int:job_id>', methods=['POST'])
@login_required
def run_now(job_id):
    """Executa a automação imediatamente via subprocess e retorna o resultado em tempo real."""
    job = CronJob.query.get(job_id)
    if not job:
        return jsonify({'success': False, 'message': 'Automação não encontrada.'}), 404

    try:
        start_time = datetime.datetime.utcnow()
        # Se o comando for o script mail_log_ingestor.py, executa diretamente com o python3 do sistema
        cmd = job.command
        
        result = subprocess.run(
            cmd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=60
        )

        stdout = result.stdout.strip()
        stderr = result.stderr.strip()
        output = stdout or stderr or f"Comando executado com código de retorno {result.returncode} (Sem output textual)."

        job.last_run = start_time
        job.last_output = output
        db.session.commit()

        log_audit_action('CRONJOB_RUN_NOW', target=job.name, details={'job_id': job_id, 'returncode': result.returncode, 'output': output[:200]})

        return jsonify({
            'success': result.returncode == 0,
            'returncode': result.returncode,
            'output': output,
            'last_run': job.last_run.strftime('%Y-%m-%d %H:%M:%S'),
            'message': f'Execução disparada para "{job.name}".'
        })
    except subprocess.TimeoutExpired:
        job.last_run = datetime.datetime.utcnow()
        job.last_output = "Erro: Tempo limite de execução atingido (60 segundos)."
        db.session.commit()
        return jsonify({'success': False, 'message': 'Timeout na execução do comando (60s).'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': f'Erro ao executar automação: {str(e)}'}), 500


# ==============================================================================
# SCRIPT RUNNER STUDIO API (Execução & Gerenciamento de Scripts do Servidor)
# ==============================================================================

BUILTIN_SCRIPTS_CATALOG = [
    {
        "id": "fix_permissions_and_amavis",
        "filename": "fix_permissions_and_amavis.py",
        "title": "Correção de Permissões, Sudoers & Restauração do Amavis",
        "category": "Segurança & Permissões",
        "description": "Restaura permissões seguras (0644) exigidas pelo Amavis, elimina o erro [Errno 13], configura /etc/sudoers.d/mailadmin com NOPASSWD e valida status de inicialização.",
        "icon": "bi-shield-lock-fill",
        "color": "primary",
        "default_args": "",
        "suggested_args": ["--user suporte", "--user www-data", "--user mailadmin"],
        "requires_sudo": True,
        "type": "python"
    },
    {
        "id": "fix_server",
        "filename": "fix_server.py",
        "title": "Correção & Inicialização dos Daemons do Servidor MTA",
        "category": "Serviços & Daemons",
        "description": "Verifica a integridade e inicializa os daemons Postfix, Amavis, ClamAV e SpamAssassin, corrigindo portas e sockets travados.",
        "icon": "bi-wrench-adjustable-circle-fill",
        "color": "success",
        "default_args": "",
        "suggested_args": [],
        "requires_sudo": True,
        "type": "python"
    },
    {
        "id": "diagnose_auth",
        "filename": "diagnose_auth.py",
        "title": "Diagnóstico de Autenticação SASL / Dovecot / Postfix",
        "category": "Diagnóstico & Redes",
        "description": "Testa a autenticação de contas de e-mail, portas 25/587/465, integridade do socket SASL e tabelas do MariaDB vmail.",
        "icon": "bi-person-badge-fill",
        "color": "info",
        "default_args": "",
        "suggested_args": [],
        "requires_sudo": False,
        "type": "python"
    },
    {
        "id": "migrate_database",
        "filename": "migrate_database.py",
        "title": "Migração & Criação de Estrutura no MariaDB (vmail)",
        "category": "Banco de Dados",
        "description": "Cria e valida a estrutura de tabelas no banco de dados vmail (domain, mailbox, alias, cron_jobs, system_audit_logs, spam_visual_rules).",
        "icon": "bi-database-fill-gear",
        "color": "warning",
        "default_args": "",
        "suggested_args": [],
        "requires_sudo": False,
        "type": "python"
    },
    {
        "id": "mail_log_ingestor",
        "filename": "mail_log_ingestor.py",
        "title": "Ingestão & Processamento de Logs do MTA para Telemetria",
        "category": "Logs & Telemetria",
        "description": "Processa o log do Postfix e popula a tabela mail_logs_history para exibição em tempo real de tráfego, entregas e rejeições.",
        "icon": "bi-activity",
        "color": "purple",
        "default_args": "",
        "suggested_args": [],
        "requires_sudo": False,
        "type": "python"
    },
    {
        "id": "reset_admin_password",
        "filename": "reset_admin_password.py",
        "title": "Redefinição de Senha e Credenciais do Administrador",
        "category": "Acesso & Segurança",
        "description": "Redefine a senha de acesso mestre do painel MailAdmin e reseta o status de 2FA/MFA para o usuário admin padrão.",
        "icon": "bi-key-fill",
        "color": "danger",
        "default_args": "",
        "suggested_args": [],
        "requires_sudo": False,
        "type": "python"
    },
    {
        "id": "show_logs",
        "filename": "show_logs.py",
        "title": "Inspeção e Diagnóstico de Logs do Sistema MTA",
        "category": "Logs & Telemetria",
        "description": "Exibe e analisa as últimas ocorrências registradas em /var/log/mail.log e no journalctl com destaque para erros e avisos.",
        "icon": "bi-file-text-fill",
        "color": "secondary",
        "default_args": "",
        "suggested_args": [],
        "requires_sudo": False,
        "type": "python"
    }
]


def get_scripts_directory() -> str:
    """Retorna o diretório principal de scripts do projeto."""
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    scripts_dir = os.path.join(root_dir, "scripts")
    if not os.path.exists(scripts_dir):
        os.makedirs(scripts_dir, exist_ok=True)
    return scripts_dir


@automation_bp.route('/scripts', methods=['GET'])
@login_required
def list_scripts():
    """Retorna o catálogo completo de scripts disponíveis no sistema."""
    scripts_dir = get_scripts_directory()
    existing_files = set(os.listdir(scripts_dir)) if os.path.exists(scripts_dir) else set()

    result = []
    seen_filenames = set()

    # 1. Catálogo pré-configurado
    for item in BUILTIN_SCRIPTS_CATALOG:
        fname = item['filename']
        seen_filenames.add(fname)
        fpath = os.path.join(scripts_dir, fname)
        file_exists = os.path.isfile(fpath)
        size_bytes = os.path.getsize(fpath) if file_exists else 0
        last_modified = datetime.datetime.fromtimestamp(os.path.getmtime(fpath)).strftime('%Y-%m-%d %H:%M:%S') if file_exists else None

        item_copy = dict(item)
        item_copy['exists'] = file_exists
        item_copy['path'] = fpath
        item_copy['size_bytes'] = size_bytes
        item_copy['last_modified'] = last_modified
        item_copy['is_builtin'] = True
        result.append(item_copy)

    # 2. Scripts adicionais criados no diretório scripts/ ou /opt/mailadmin/scripts
    for fname in existing_files:
        if fname not in seen_filenames and fname.endswith(('.py', '.sh', '.bash', '.pl')):
            fpath = os.path.join(scripts_dir, fname)
            size_bytes = os.path.getsize(fpath) if os.path.isfile(fpath) else 0
            last_modified = datetime.datetime.fromtimestamp(os.path.getmtime(fpath)).strftime('%Y-%m-%d %H:%M:%S')
            is_py = fname.endswith('.py')

            result.append({
                "id": os.path.splitext(fname)[0],
                "filename": fname,
                "title": f"Script Personalizado: {fname}",
                "category": "Scripts Personalizados",
                "description": f"Script salvo no servidor ({'Python 3' if is_py else 'Shell/Bash'}).",
                "icon": "bi-file-earmark-code-fill",
                "color": "secondary",
                "default_args": "",
                "suggested_args": [],
                "requires_sudo": False,
                "type": "python" if is_py else "shell",
                "exists": True,
                "path": fpath,
                "size_bytes": size_bytes,
                "last_modified": last_modified,
                "is_builtin": False
            })

    return jsonify({
        'status': 'success',
        'success': True,
        'scripts': result
    })


@automation_bp.route('/scripts/<path:filename>/content', methods=['GET'])
@login_required
def get_script_content(filename):
    """Obtém o código-fonte de um script para leitura e edição."""
    safe_name = os.path.basename(filename.strip())
    scripts_dir = get_scripts_directory()
    fpath = os.path.join(scripts_dir, safe_name)

    if not os.path.isfile(fpath):
        return jsonify({'status': 'error', 'success': False, 'message': f'Arquivo "{safe_name}" não encontrado.'}), 404

    try:
        with open(fpath, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()

        return jsonify({
            'status': 'success',
            'success': True,
            'filename': safe_name,
            'path': fpath,
            'content': content
        })
    except Exception as e:
        return jsonify({'status': 'error', 'success': False, 'message': f'Erro ao ler arquivo: {str(e)}'}), 500


@automation_bp.route('/scripts/save', methods=['POST'])
@login_required
def save_custom_script():
    """Salva ou atualiza um script personalizado no diretório de scripts."""
    data = request.get_json(silent=True) or request.form or {}
    filename = (data.get('filename') or '').strip()
    content = data.get('content', '')

    if not filename:
        return jsonify({'status': 'error', 'success': False, 'message': 'Nome do arquivo é obrigatório.'}), 400

    safe_name = os.path.basename(filename)
    if not safe_name.endswith(('.py', '.sh', '.bash', '.pl')):
        safe_name += '.py'

    scripts_dir = get_scripts_directory()
    fpath = os.path.join(scripts_dir, safe_name)

    try:
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(content)

        try:
            os.chmod(fpath, 0o755)
        except Exception:
            pass

        log_audit_action('SCRIPT_SAVE', target=safe_name, details={'filename': safe_name, 'size': len(content)})

        return jsonify({
            'status': 'success',
            'success': True,
            'message': f'Script "{safe_name}" salvo com sucesso!',
            'filename': safe_name,
            'path': fpath
        })
    except Exception as e:
        return jsonify({'status': 'error', 'success': False, 'message': f'Erro ao salvar script: {str(e)}'}), 500


@automation_bp.route('/scripts/run', methods=['POST'])
@login_required
def execute_script():
    """Executa um script do servidor com captura em tempo real de saída e código de retorno."""
    data = request.get_json(silent=True) or request.form or {}
    filename = (data.get('filename') or '').strip()
    args_str = (data.get('args') or '').strip()
    use_sudo = bool(data.get('use_sudo', False))
    custom_command = (data.get('custom_command') or '').strip()

    scripts_dir = get_scripts_directory()
    start_time = datetime.datetime.now()

    # 1. Determina o comando final a ser executado
    if custom_command:
        # Comando livre fornecido
        final_cmd = custom_command
        target_name = "custom_command"
    elif filename:
        safe_name = os.path.basename(filename)
        script_path = os.path.join(scripts_dir, safe_name)

        if not os.path.isfile(script_path):
            return jsonify({
                'status': 'error',
                'success': False,
                'message': f'Script "{safe_name}" não encontrado no diretório de scripts ({script_path}).'
            }), 404

        target_name = safe_name
        if safe_name.endswith('.py'):
            exec_bin = sys.executable or 'python3'
            final_cmd = f"{exec_bin} {script_path}"
        else:
            final_cmd = f"bash {script_path}"

        if args_str:
            final_cmd += f" {args_str}"
    else:
        return jsonify({'status': 'error', 'success': False, 'message': 'Nenhum script ou comando informado para execução.'}), 400

    if use_sudo and not final_cmd.strip().startswith('sudo'):
        final_cmd = f"sudo -n {final_cmd}"

    try:
        t0 = datetime.datetime.now()
        process = subprocess.run(
            final_cmd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=120,
            cwd=os.path.dirname(scripts_dir)
        )
        t1 = datetime.datetime.now()
        duration_ms = int((t1 - t0).total_seconds() * 1000)

        stdout = process.stdout or ""
        stderr = process.stderr or ""
        output = stdout
        if stderr:
            if output:
                output += "\n--- STDERR ---\n" + stderr
            else:
                output = stderr

        if not output.strip():
            output = f"Processo finalizado com código {process.returncode} (Sem saída textual no stdout/stderr)."

        is_success = (process.returncode == 0)

        log_audit_action(
            'SCRIPT_EXECUTE',
            target=target_name,
            details={
                'command': final_cmd,
                'returncode': process.returncode,
                'duration_ms': duration_ms,
                'success': is_success,
                'output_preview': output[:300]
            }
        )

        return jsonify({
            'status': 'success' if is_success else 'warning',
            'success': is_success,
            'returncode': process.returncode,
            'command': final_cmd,
            'stdout': stdout,
            'stderr': stderr,
            'output': output,
            'duration_ms': duration_ms,
            'executed_at': t0.strftime('%Y-%m-%d %H:%M:%S'),
            'message': f'Execução concluída com código {process.returncode} ({duration_ms}ms).'
        })

    except subprocess.TimeoutExpired:
        log_audit_action('SCRIPT_EXECUTE_TIMEOUT', target=target_name, details={'command': final_cmd})
        return jsonify({
            'status': 'error',
            'success': False,
            'returncode': -1,
            'command': final_cmd,
            'output': 'Erro: Tempo limite de execução excedido (120 segundos).',
            'message': 'Tempo limite de execução excedido (120s).'
        }), 504

    except Exception as e:
        return jsonify({
            'status': 'error',
            'success': False,
            'message': f'Falha interna ao executar script: {str(e)}'
        }), 500

