from flask import request
from flask_login import current_user
import json
import datetime
from models import db, SystemAuditLog

def log_audit_action(action_type, target=None, details=None, severity_level='normal'):
    """
    Helper para registrar ações administrativas no Audit Trail (system_audit_logs)
    com suporte a persistência no MariaDB e sincronização com fallback em memória.
    """
    try:
        user = 'System'
        if current_user and hasattr(current_user, 'is_authenticated') and current_user.is_authenticated:
            user = getattr(current_user, 'username', 'Admin')

        ip_addr = '127.0.0.1'
        if request:
            try:
                ip_addr = request.headers.get('X-Forwarded-For', request.remote_addr or '127.0.0.1').split(',')[0].strip()
            except Exception:
                ip_addr = request.remote_addr or '127.0.0.1'

        details_str = '{}'
        details_obj = {}
        if isinstance(details, (dict, list)):
            details_obj = details
            details_str = json.dumps(details, ensure_ascii=False)
        elif details is not None:
            details_str = str(details)
            details_obj = {'info': details_str}

        now_dt = datetime.datetime.utcnow()

        # Auto-detectar severidade crítica se detalhes ou ação contiverem erro/falha
        final_severity = severity_level or 'normal'
        combined_text = f"{action_type} {target or ''} {details_str}".upper()
        error_keywords = [
            'ERRO', 'ERROR', 'ACCESS DENIED', 'EXCEPTION', 'FAILED', 'FALHA',
            'FATAL', '1045', 'REFUSED', 'DENIED', 'FAIL', '1142'
        ]
        if final_severity == 'normal' and any(k in combined_text for k in error_keywords):
            final_severity = 'critical'

        # 1. Tenta persistir no MariaDB via SQLAlchemy
        try:
            audit_entry = SystemAuditLog(
                timestamp=now_dt,
                admin_user=user,
                action=str(action_type),
                target=str(target) if target is not None else None,
                ip_address=ip_addr,
                details_json=details_str,
                severity_level=final_severity
            )
            db.session.add(audit_entry)
            db.session.commit()
        except Exception as db_err:
            try:
                db.session.rollback()
            except Exception:
                pass
            # Se a tabela não existir, tenta criar e retentar
            try:
                db.create_all()
                audit_entry = SystemAuditLog(
                    timestamp=now_dt,
                    admin_user=user,
                    action=str(action_type),
                    target=str(target) if target is not None else None,
                    ip_address=ip_addr,
                    details_json=details_str,
                    severity_level=final_severity
                )
                db.session.add(audit_entry)
                db.session.commit()
            except Exception:
                try:
                    db.session.rollback()
                except Exception:
                    pass

        # 2. Sincroniza com o buffer em memória MEMORY_AUDIT_LOGS para contingência/fallback
        try:
            import blueprints.troubleshooting_bp as t_bp
            if hasattr(t_bp, 'MEMORY_AUDIT_LOGS'):
                new_mem_entry = {
                    'id': len(t_bp.MEMORY_AUDIT_LOGS) + 1,
                    'timestamp': now_dt.strftime('%Y-%m-%d %H:%M:%S'),
                    'admin_user': user,
                    'action': str(action_type),
                    'target': str(target) if target is not None else '',
                    'ip_address': ip_addr,
                    'details_json': details_str,
                    'details': details_obj,
                    'severity_level': final_severity
                }
                t_bp.MEMORY_AUDIT_LOGS.insert(0, new_mem_entry)
        except Exception:
            pass

    except Exception as e:
        print(f"Erro ao registrar log de auditoria: {e}")


def safe_read_system_file(file_path: str, default: str = "") -> str:
    """
    Lê o conteúdo de um arquivo de configuração do sistema (/etc/...) de forma segura.
    Tenta leitura direta e, caso ocorra PermissionError ou restrição de diretório, tenta via sudo cat.
    """
    import os, subprocess
    if not file_path:
        return default

    # Tenta leitura direta primeiro
    try:
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read()
    except (PermissionError, IOError):
        pass
    except Exception:
        pass

    # Fallback via sudo cat
    try:
        res = subprocess.run(['sudo', 'cat', file_path], capture_output=True, text=True, timeout=5)
        if res.returncode == 0:
            return res.stdout
    except Exception:
        pass

    return default


def safe_write_system_file(file_path: str, content: str, create_backup: bool = True) -> dict:
    """
    Grava com segurança o conteúdo em arquivos protegidos do sistema (/etc/spamassassin/local.cf, /etc/amavis/..., etc).
    Utiliza múltiplos mecanismos resilientes (sudo cp, sudo tee, sudo dd, gravação direta),
    cria diretórios pais automaticamente e garante consistência sem falhas de permissão [Errno 13].
    """
    import os, subprocess, tempfile, uuid, datetime

    if not file_path:
        return {"success": False, "error": "Caminho do arquivo não fornecido."}

    # Garante que o diretório pai exista
    dir_name = os.path.dirname(file_path)
    if dir_name:
        try:
            os.makedirs(dir_name, exist_ok=True)
        except Exception:
            try:
                subprocess.run(['sudo', 'mkdir', '-p', dir_name], capture_output=True, timeout=5)
            except Exception:
                pass

    # 1. Cria backup carimbado se o arquivo de destino já existir
    if create_backup:
        try:
            file_exists = False
            if os.path.exists(file_path):
                file_exists = True
            else:
                t_res = subprocess.run(['sudo', 'test', '-f', file_path], capture_output=True)
                file_exists = (t_res.returncode == 0)

            if file_exists:
                ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
                bak_path = f"{file_path}.bak_{ts}"
                try:
                    subprocess.run(['sudo', 'cp', '-p', file_path, bak_path], capture_output=True, timeout=5)
                except Exception:
                    pass
        except Exception as bak_err:
            print(f"[safe_write_system_file] Alerta de backup para {file_path}: {bak_err}")

    # 2. Escreve o novo conteúdo no arquivo temporário
    tmp_path = os.path.join(tempfile.gettempdir(), f"zrti_sysfile_{uuid.uuid4().hex}.tmp")
    try:
        with open(tmp_path, 'w', encoding='utf-8') as f:
            f.write(content)
    except Exception as tmp_err:
        # Tenta fallback de gravação direta se /tmp falhar
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return {"success": True}
        except Exception:
            return {"success": False, "error": f"Erro ao gerar arquivo temporário: {str(tmp_err)}"}

    # 3. Transfere para o caminho final com múltiplas estratégias de privilégio
    success = False
    last_err = ""

    # Estratégia A: sudo cp
    try:
        cp_res = subprocess.run(['sudo', 'cp', tmp_path, file_path], capture_output=True, text=True, timeout=10)
        if cp_res.returncode == 0:
            success = True
        else:
            last_err = cp_res.stderr.strip()
    except Exception as e:
        last_err = str(e)

    # Estratégia B: sudo tee
    if not success:
        try:
            tee_res = subprocess.run(
                ['sudo', 'tee', file_path],
                input=content,
                text=True,
                capture_output=True,
                timeout=10
            )
            if tee_res.returncode == 0:
                success = True
        except Exception as e:
            last_err = str(e)

    # Estratégia C: sudo sh -c cat
    if not success:
        try:
            sh_res = subprocess.run(
                ['sudo', 'sh', '-c', f'cat > "{file_path}"'],
                input=content,
                text=True,
                capture_output=True,
                timeout=10
            )
            if sh_res.returncode == 0:
                success = True
        except Exception as e:
            last_err = str(e)

    # Estratégia D: Gravação direta em Python (se o processo tiver permissão direta)
    if not success:
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            success = True
        except Exception as direct_err:
            last_err = str(direct_err)

    # Ajusta permissões para leitura dos serviços do sistema
    if success:
        try:
            subprocess.run(['sudo', 'chmod', '644', file_path], capture_output=True, timeout=5)
        except Exception:
            pass

    # Limpa arquivo temporário
    if os.path.exists(tmp_path):
        try:
            os.remove(tmp_path)
        except Exception:
            pass

    if success:
        return {"success": True}
    else:
        return {"success": False, "error": f"Não foi possível gravar no arquivo {file_path}: {last_err}"}


