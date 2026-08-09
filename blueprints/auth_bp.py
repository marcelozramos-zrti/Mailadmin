from flask import Blueprint, request, jsonify, session
from flask_login import login_user, logout_user, login_required, current_user
import pyotp
import qrcode
import io
import base64
from models import db, AdminUser

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    data = request.get_json(silent=True) or request.form or {}
    username = data.get('username') or request.args.get('username')
    password = data.get('password') or request.args.get('password')
    token = data.get('token') or request.args.get('token') # Código TOTP de 6 dígitos

    if not username or not password:
        return jsonify({'success': False, 'message': 'Usuário e senha são obrigatórios.'}), 400

    admin = AdminUser.query.filter_by(username=username).first()
    if not admin or not admin.check_password(password):
        return jsonify({'success': False, 'message': 'Usuário ou senha inválidos.'}), 401

    # Verifica MFA se ativado
    if admin.otp_enabled:
        if not token:
            return jsonify({
                'success': False,
                'mfa_required': True,
                'message': 'Código Autenticador TOTP de 6 dígitos é necessário.'
            }), 200

        totp = pyotp.TOTP(admin.otp_secret)
        if not totp.verify(token, valid_window=1):
            return jsonify({'success': False, 'message': 'Código TOTP incorreto ou expirado.'}), 401

    login_user(admin)
    session['user_id'] = admin.id

    return jsonify({
        'success': True,
        'message': 'Login realizado com sucesso!',
        'user': {'id': admin.id, 'username': admin.username, 'mfa_enabled': admin.otp_enabled}
    })

@auth_bp.route('/logout', methods=['GET', 'POST'])
@login_required
def logout():
    logout_user()
    session.clear()
    return jsonify({'success': True, 'message': 'Sessão encerrada com sucesso.'})

@auth_bp.route('/mfa/setup', methods=['GET', 'POST'])
@login_required
def mfa_setup():
    """Gera chave TOTP e imagem QR Code base64 para configuração no Google Authenticator."""
    if not current_user.otp_secret:
        current_user.otp_secret = pyotp.random_base32()
        db.session.commit()

    totp = pyotp.TOTP(current_user.otp_secret)
    provision_url = totp.provisioning_uri(
        name=current_user.username,
        issuer_name="MailAdmin Suite"
    )

    # Gera imagem do QR Code
    img = qrcode.make(provision_url)
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    qr_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')

    return jsonify({
        'success': True,
        'otp_secret': current_user.otp_secret,
        'qr_code_base64': f"data:image/png;base64,{qr_base64}",
        'provision_url': provision_url
    })

@auth_bp.route('/mfa/enable', methods=['GET', 'POST'])
@login_required
def mfa_enable():
    """Valida o primeiro código TOTP de 6 dígitos e habilita o MFA para a conta admin."""
    data = request.get_json(silent=True) or request.form or {}
    token = data.get('token') or request.args.get('token')

    if not token or not current_user.otp_secret:
        return jsonify({'success': False, 'message': 'Código TOTP de 6 dígitos é obrigatório.'}), 400

    totp = pyotp.TOTP(current_user.otp_secret)
    if totp.verify(token, valid_window=1):
        current_user.otp_enabled = True
        db.session.commit()
        return jsonify({'success': True, 'message': 'MFA ativado com sucesso!'})
    else:
        return jsonify({'success': False, 'message': 'Código inválido. Verifique o horário do celular.'}), 400

@auth_bp.route('/me', methods=['GET', 'POST'])
def get_current_user_info():
    if current_user.is_authenticated:
        return jsonify({
            'authenticated': True,
            'username': current_user.username,
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
    """Criação de novo administrador. OBRIGATÓRIO uso de set_password()."""
    data = request.get_json(silent=True) or request.form or {}
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()

    if not username or not password:
        return jsonify({'success': False, 'message': 'Nome de usuário e senha são obrigatórios.'}), 400

    if len(password) < 6:
        return jsonify({'success': False, 'message': 'A senha deve conter no mínimo 6 caracteres.'}), 400

    existing = AdminUser.query.filter_by(username=username).first()
    if existing:
        return jsonify({'success': False, 'message': f'O administrador "{username}" já está cadastrado.'}), 400

    try:
        new_admin = AdminUser(username=username)
        # SEGURANÇA CRÍTICA: Gera hash seguro via sha512_crypt no model AdminUser
        new_admin.set_password(password)
        db.session.add(new_admin)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Administrador "{username}" criado com sucesso!',
            'admin': new_admin.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erro ao criar administrador: {str(e)}'}), 500

@auth_bp.route('/admins/<int:admin_id>/password', methods=['PUT', 'POST'])
@login_required
def change_admin_password(admin_id):
    """Alteração de senha de um administrador. OBRIGATÓRIO uso de set_password()."""
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
    """Exclusão de administrador com Trava de Segurança contra exclusão do único usuário."""
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

