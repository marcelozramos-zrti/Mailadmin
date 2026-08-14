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

