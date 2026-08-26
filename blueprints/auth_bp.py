from flask import Blueprint, request, jsonify, session
from flask_login import login_user, logout_user, login_required, current_user
from sqlalchemy import func, or_
import pyotp
import qrcode
import io
import sys
import base64
from models import db, AdminUser, Mailbox, SystemAuditLog
from blueprints.audit_helper import log_audit_action

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

@auth_bp.route('/login', methods=['GET', 'POST', 'OPTIONS'])
def login():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    data = request.get_json(silent=True) or request.form or {}
    username = data.get('username') or request.args.get('username')
    password = data.get('password') or request.args.get('password')
    token = data.get('token') or request.args.get('token') # Código TOTP de 6 dígitos

    if not username or not password:
        return jsonify({'success': False, 'message': 'Usuário e senha são obrigatórios.'}), 400

    u_clean = str(username).strip()
    pwd_clean = str(password)

    try:
        # 1. Busca por usuário administrador em vmail_admins (case-insensitive)
        admin = AdminUser.query.filter(func.lower(AdminUser.username) == u_clean.lower()).first()
        
        # Se não encontrou e o usuário digitou e-mail completo, tenta pelo prefixo
        if not admin and '@' in u_clean:
            prefix = u_clean.split('@')[0].lower()
            admin = AdminUser.query.filter(func.lower(AdminUser.username) == prefix).first()

        authenticated = False

        if admin and admin.check_password(pwd_clean):
            authenticated = True
        else:
            # 2. Se não autenticou como vmail_admins, verifica na tabela mailbox (contas de e-mail do sistema)
            try:
                mbox = Mailbox.query.filter(func.lower(Mailbox.username) == u_clean.lower()).first()
                if mbox and mbox.check_password(pwd_clean):
                    # Conta de e-mail válida: sincroniza/cria como AdminUser
                    if not admin:
                        admin = AdminUser.query.filter(func.lower(AdminUser.username) == mbox.username.lower()).first()
                    if not admin:
                        admin = AdminUser(
                            username=mbox.username,
                            password_hash=mbox.password,
                            role='admin'
                        )
                        db.session.add(admin)
                        db.session.commit()
                    else:
                        admin.password_hash = mbox.password
                        db.session.commit()
                    authenticated = True
            except Exception as err:
                print(f"[AUTH LOGIN] Verificação de mailbox falhou: {err}", file=sys.stderr)

        if not authenticated or not admin:
            print(f"[AUTH FAILED] Tentativa de login falhou para usuário: '{u_clean}' do IP: {request.remote_addr}", file=sys.stderr)
            return jsonify({'success': False, 'message': 'Usuário ou senha inválidos.'}), 401

        # Se o usuário tiver 2FA (MFA) ativado, valida o token TOTP de 6 dígitos
        if getattr(admin, 'otp_enabled', False):
            if not token:
                return jsonify({
                    'success': False,
                    'mfa_required': True,
                    'message': 'Código Autenticador TOTP de 6 dígitos é necessário.'
                }), 200

            totp = pyotp.TOTP(admin.otp_secret)
            if not totp.verify(str(token).strip(), valid_window=1):
                return jsonify({'success': False, 'message': 'Código TOTP incorreto ou expirado.'}), 401

        # Login direto com sucesso
        login_user(admin, remember=True)
        session['user_id'] = admin.id
        session.pop('temp_mfa_user_id', None)

        try:
            log_audit_action(
                user=admin.username,
                action="LOGIN_SUCCESS",
                target=f"Admin ID: {admin.id}",
                status="SUCCESS",
                ip=request.remote_addr,
                details=f"Login efetuado no painel (MFA: {'Ativo' if admin.otp_enabled else 'Inativo'})"
            )
        except Exception:
            pass

        return jsonify({
            'success': True,
            'message': 'Login realizado com sucesso!',
            'user': {
                'id': admin.id,
                'username': admin.username,
                'role': admin.role or 'admin',
                'mfa_enabled': bool(getattr(admin, 'otp_enabled', False))
            }
        })
    except Exception as db_err:
        print(f"[AUTH ERROR] Falha no banco de dados durante login: {db_err}", file=sys.stderr)
        return jsonify({
            'success': False,
            'message': f'Erro no banco de dados: {str(db_err)}'
        }), 500

@auth_bp.route('/logout', methods=['GET', 'POST'])
@login_required
def logout():
    logout_user()
    session.clear()
    return jsonify({'success': True, 'message': 'Sessão encerrada com sucesso.'})

@auth_bp.route('/mfa/setup', methods=['GET', 'POST'])
def mfa_setup():
    """Gera chave TOTP e imagem QR Code base64 para configuração no Google Authenticator."""
    user = current_user if current_user.is_authenticated else None
    temp_user_id = session.get('temp_mfa_user_id') or request.args.get('temp_user_id')
    if not user and temp_user_id:
        user = AdminUser.query.get(temp_user_id)

    if not user:
        return jsonify({'success': False, 'message': 'Sessão ou usuário não encontrado.'}), 401

    if not user.otp_secret:
        user.otp_secret = pyotp.random_base32()
        db.session.commit()

    totp = pyotp.TOTP(user.otp_secret)
    provision_url = totp.provisioning_uri(
        name=user.username,
        issuer_name="MailAdmin Suite"
    )

    img = qrcode.make(provision_url)
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    qr_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')

    return jsonify({
        'success': True,
        'otp_secret': user.otp_secret,
        'qr_code_base64': f"data:image/png;base64,{qr_base64}",
        'provision_url': provision_url
    })

@auth_bp.route('/mfa/enable', methods=['GET', 'POST'])
def mfa_enable():
    """Valida o primeiro código TOTP de 6 dígitos, habilita o MFA e efetua o login no primeiro acesso."""
    data = request.get_json(silent=True) or request.form or {}
    token = data.get('token') or request.args.get('token')
    temp_user_id = data.get('temp_user_id') or session.get('temp_mfa_user_id') or request.args.get('temp_user_id')

    user = current_user if current_user.is_authenticated else None
    if not user and temp_user_id:
        user = AdminUser.query.get(temp_user_id)

    if not user or not user.otp_secret:
        return jsonify({'success': False, 'message': 'Sessão expirada ou usuário não configurado.'}), 400

    if not token:
        return jsonify({'success': False, 'message': 'Código TOTP de 6 dígitos é obrigatório.'}), 400

    totp = pyotp.TOTP(user.otp_secret)
    if totp.verify(token, valid_window=1):
        user.otp_enabled = True
        db.session.commit()

        # Efetua o login oficial do usuário no sistema
        login_user(user)
        session['user_id'] = user.id
        session.pop('temp_mfa_user_id', None)

        return jsonify({
            'success': True,
            'message': 'MFA ativado com sucesso! Seja bem-vindo ao painel.',
            'user': {
                'id': user.id,
                'username': user.username,
                'role': user.role or 'admin',
                'mfa_enabled': True
            }
        })
    else:
        return jsonify({'success': False, 'message': 'Código inválido. Verifique o aplicativo e o horário do celular.'}), 400

@auth_bp.route('/me', methods=['GET', 'POST'])
def get_current_user_info():
    if current_user.is_authenticated:
        return jsonify({
            'authenticated': True,
            'username': current_user.username,
            'role': current_user.role or 'admin',
            'mfa_enabled': current_user.otp_enabled
        })
    return jsonify({'authenticated': False})

# =========================================================
# GESTÃO DE ADMINISTRADORES DO PAINEL (vmail_admins)
# =========================================================

@auth_bp.route('/admins', methods=['GET'])
@login_required
def list_admins():
    """Listagem de administradores do painel cadastrados na tabela vmail_admins."""
    try:
        admins = AdminUser.query.order_by(AdminUser.id.asc()).all()
        return jsonify({
            'success': True,
            'admins': [a.to_dict() for a in admins]
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'Erro ao listar administradores: {str(e)}'}), 500

@auth_bp.route('/admins', methods=['POST'])
@login_required
def create_admin():
    """Criação de novo administrador. OBRIGATÓRIO uso de set_password(). Protegido por RBAC."""
    if current_user.role != 'admin':
        return jsonify({'success': False, 'message': 'Acesso negado: Apenas administradores com perfil "admin" podem criar contas.'}), 403

    data = request.get_json(silent=True) or request.form or {}
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()
    role = (data.get('role') or 'admin').strip().lower()

    if role not in ['admin', 'user']:
        role = 'admin'

    if not username or not password:
        return jsonify({'success': False, 'message': 'Nome de usuário e senha são obrigatórios.'}), 400

    if len(password) < 6:
        return jsonify({'success': False, 'message': 'A senha deve conter no mínimo 6 caracteres.'}), 400

    existing = AdminUser.query.filter_by(username=username).first()
    if existing:
        return jsonify({'success': False, 'message': f'O usuário "{username}" já está cadastrado.'}), 400

    try:
        new_admin = AdminUser(username=username, role=role)
        # SEGURANÇA CRÍTICA: Gera hash seguro via sha512_crypt no model AdminUser
        new_admin.set_password(password)
        db.session.add(new_admin)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Usuário "{username}" ({role}) criado com sucesso!',
            'admin': new_admin.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erro ao criar administrador: {str(e)}'}), 500

@auth_bp.route('/admins/<int:admin_id>/password', methods=['PUT', 'POST'])
@login_required
def change_admin_password(admin_id):
    """Alteração de senha de um administrador. OBRIGATÓRIO uso de set_password(). Protegido por RBAC."""
    if current_user.role != 'admin':
        return jsonify({'success': False, 'message': 'Acesso negado: Apenas administradores com perfil "admin" podem alterar senhas.'}), 403

    data = request.get_json(silent=True) or request.form or {}
    password = (data.get('password') or '').strip()

    if not password:
        return jsonify({'success': False, 'message': 'A nova senha é obrigatória.'}), 400

    if len(password) < 6:
        return jsonify({'success': False, 'message': 'A senha deve conter no mínimo 6 caracteres.'}), 400

    admin = AdminUser.query.get(admin_id)
    if not admin:
        return jsonify({'success': False, 'message': 'Administrador não encontrado.'}), 404

    try:
        # SEGURANÇA CRÍTICA: Atualiza hash seguro via set_password()
        admin.set_password(password)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Senha do administrador "{admin.username}" alterada com sucesso!'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erro ao alterar senha: {str(e)}'}), 500

@auth_bp.route('/admins/<int:admin_id>', methods=['DELETE', 'POST'])
@auth_bp.route('/admins/<int:admin_id>/delete', methods=['POST'])
@login_required
def delete_admin(admin_id):
    """Exclusão de administrador com Trava de Segurança contra exclusão do único usuário. Protegido por RBAC."""
    if current_user.role != 'admin':
        return jsonify({'success': False, 'message': 'Acesso negado: Perfil de Usuário não possui permissão para excluir administradores.'}), 403

    admin = AdminUser.query.get(admin_id)
    if not admin:
        return jsonify({'success': False, 'message': 'Administrador não encontrado.'}), 404

    # TRAVA DE SEGURANÇA: Impedir a exclusão do único usuário restante
    total_admins = AdminUser.query.count()
    if total_admins <= 1:
        return jsonify({
            'success': False,
            'message': 'Trava de Segurança: Não é possível excluir o único administrador restante no painel.'
        }), 400

    try:
        username = admin.username
        db.session.delete(admin)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Administrador "{username}" excluído com sucesso!'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erro ao excluir administrador: {str(e)}'}), 500


@auth_bp.route('/admins/<int:admin_id>/toggle-mfa', methods=['POST', 'PUT'])
@login_required
def toggle_admin_mfa(admin_id):
    """Ativa ou desativa o MFA granularmente por usuário."""
    if current_user.role != 'admin':
        return jsonify({'success': False, 'message': 'Acesso negado: Apenas administradores podem alterar configurações de MFA.'}), 403

    admin = AdminUser.query.get(admin_id)
    if not admin:
        return jsonify({'success': False, 'message': 'Usuário não encontrado.'}), 404

    data = request.get_json(silent=True) or {}
    enable = data.get('enable')
    if enable is None:
        admin.otp_enabled = not admin.otp_enabled
    else:
        admin.otp_enabled = bool(enable)

    if admin.otp_enabled and not admin.otp_secret:
        admin.otp_secret = pyotp.random_base32()

    db.session.commit()
    status_str = "ativado" if admin.otp_enabled else "desativado"
    log_audit_action('MFA_TOGGLE', target=admin.username, details={'admin_id': admin_id, 'enabled': admin.otp_enabled})
    return jsonify({
        'success': True,
        'message': f'MFA {status_str} com sucesso para o usuário "{admin.username}"!',
        'otp_enabled': admin.otp_enabled
    })


@auth_bp.route('/audit-logs', methods=['GET'])
@login_required
def list_audit_logs():
    """Consulta histórico de logs de auditoria do sistema (system_audit_logs)."""
    try:
        limit = int(request.args.get('limit', 200))
        logs = SystemAuditLog.query.order_by(SystemAuditLog.id.desc()).limit(limit).all()
        return jsonify({
            'success': True,
            'count': len(logs),
            'audit_logs': [l.to_dict() for l in logs]
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'Erro ao consultar logs de auditoria: {str(e)}'}), 500



