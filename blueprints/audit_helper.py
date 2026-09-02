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
    Tenta leitura direta e, caso ocorra PermissionError ou restrição de diretório, tenta via sudo -n cat.
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

    # Fallback via sudo -n cat (não-interativo)
    try:
        res = subprocess.run(['sudo', '-n', 'cat', file_path], capture_output=True, text=True, timeout=5)
        if res.returncode == 0:
            return res.stdout
    except Exception:
        pass

    return default


def safe_write_system_file(file_path: str, content: str, create_backup: bool = True) -> dict:
    """
    Grava com segurança o conteúdo em arquivos protegidos do sistema (/etc/spamassassin/local.cf, /etc/amavis/..., etc).
    Utiliza múltiplos mecanismos resilientes (gravação direta, sudo -n cp, sudo -n tee, sudo -n dd),
    cria diretórios pais automaticamente e fornece diagnóstico claro em caso de restrição de sudoers.
    """
    import os, subprocess, tempfile, uuid, datetime, getpass

    if not file_path:
        return {"success": False, "error": "Caminho do arquivo não fornecido."}

    # Garante que o diretório pai exista
    dir_name = os.path.dirname(file_path)
    if dir_name:
        try:
            os.makedirs(dir_name, exist_ok=True)
        except Exception:
            try:
                subprocess.run(['sudo', '-n', 'mkdir', '-p', dir_name], capture_output=True, timeout=5)
            except Exception:
                pass

    # 1. Cria backup carimbado se o arquivo de destino já existir
    if create_backup:
        try:
            file_exists = False
            if os.path.exists(file_path):
                file_exists = True
            else:
                t_res = subprocess.run(['sudo', '-n', 'test', '-f', file_path], capture_output=True)
                file_exists = (t_res.returncode == 0)

            if file_exists:
                ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
                bak_path = f"{file_path}.bak_{ts}"
                try:
                    subprocess.run(['sudo', '-n', 'cp', '-p', file_path, bak_path], capture_output=True, timeout=5)
                except Exception:
                    pass
        except Exception as bak_err:
            print(f"[safe_write_system_file] Alerta de backup para {file_path}: {bak_err}")

    # 2. Estratégia 1: Tenta gravação direta em Python (se o processo tiver permissão direta)
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        try:
            os.chmod(file_path, 0o644)
        except Exception:
            pass
        return {"success": True}
    except (PermissionError, IOError):
        pass
    except Exception as e:
        pass

    # 3. Estratégia 2: Escreve no arquivo temporário para transferência com sudo -n
    tmp_path = os.path.join(tempfile.gettempdir(), f"zrti_sysfile_{uuid.uuid4().hex}.tmp")
    try:
        with open(tmp_path, 'w', encoding='utf-8') as f:
            f.write(content)
    except Exception as tmp_err:
        return {"success": False, "error": f"Erro ao gerar arquivo temporário: {str(tmp_err)}"}

    success = False
    last_err = ""

    # Estratégia A: sudo -n cp
    try:
        cp_res = subprocess.run(['sudo', '-n', 'cp', tmp_path, file_path], capture_output=True, text=True, timeout=10)
        if cp_res.returncode == 0:
            success = True
        else:
            last_err = cp_res.stderr.strip()
    except Exception as e:
        last_err = str(e)

    # Estratégia B: sudo -n tee
    if not success:
        try:
            tee_res = subprocess.run(
                ['sudo', '-n', 'tee', file_path],
                input=content,
                text=True,
                capture_output=True,
                timeout=10
            )
            if tee_res.returncode == 0:
                success = True
            else:
                last_err = tee_res.stderr.strip()
        except Exception as e:
            last_err = str(e)

    # Estratégia C: sudo -n dd
    if not success:
        try:
            dd_res = subprocess.run(
                ['sudo', '-n', 'dd', f'of={file_path}'],
                input=content.encode('utf-8'),
                capture_output=True,
                timeout=10
            )
            if dd_res.returncode == 0:
                success = True
            else:
                last_err = dd_res.stderr.strip()
        except Exception as e:
            last_err = str(e)

    # Ajusta permissões para leitura dos serviços do sistema (0644 seguro exigido pelo Amavis)
    if success:
        try:
            subprocess.run(['sudo', '-n', 'chmod', '644', file_path], capture_output=True, timeout=5)
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
        current_user = getpass.getuser()
        err_detail = f"Permissão negada para o usuário '{current_user}' ao gravar em '{file_path}'. "
        err_detail += f"Para corrigir com segurança sem violar o Amavis, configure sudoers NOPASSWD para '{current_user}' ou execute: 'sudo setfacl -m u:{current_user}:rw {file_path}'. (Aviso: Nunca use chmod 666, pois o Amavis bloqueia inicialização com arquivos world-writable)."
        if last_err:
            err_detail += f" (Detalhes do sistema: {last_err})"
        return {"success": False, "error": err_detail}



