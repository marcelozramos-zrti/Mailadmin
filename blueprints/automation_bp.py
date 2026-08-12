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
