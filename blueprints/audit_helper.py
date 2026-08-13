from flask import request
from flask_login import current_user
import json
import datetime
from models import db, SystemAuditLog

def log_audit_action(action_type, target=None, details=None, severity_level=None):
    """
    Helper para registrar ações administrativas no Audit Trail (system_audit_logs).
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
        if isinstance(details, (dict, list)):
            details_str = json.dumps(details, ensure_ascii=False)
        elif details is not None:
            details_str = str(details)

        kwargs = {
            'timestamp': datetime.datetime.utcnow(),
            'admin_user': user,
            'action': str(action_type),
            'target': str(target) if target is not None else None,
            'ip_address': ip_addr,
            'details_json': details_str
        }
        if severity_level:
            kwargs['severity_level'] = severity_level

        audit_entry = SystemAuditLog(**kwargs)
        db.session.add(audit_entry)
        db.session.commit()
    except Exception as e:
        print(f"Erro ao registrar log de auditoria: {e}")
        try:
            db.session.rollback()
        except Exception:
            pass
