from flask import Blueprint, request, jsonify
from flask_login import login_required
from sqlalchemy import func
from models import db, Domain, Mailbox, Alias, UsedQuota

vmail_bp = Blueprint('vmail', __name__, url_prefix='/api/vmail')

# ==========================================
# 1. MÓDULO DE DOMÍNIOS
# ==========================================

@vmail_bp.route('/domains', methods=['GET', 'POST'])
@login_required
def handle_domains():
    if request.method == 'POST':
        data = request.get_json(silent=True) or request.form or {}
        domain_name = data.get('domain', '').strip().lower()
        description = data.get('description', '')
        maxquota = data.get('maxquota', 10240) # Default 10GB em MB

        if not domain_name:
            return jsonify({'success': False, 'message': 'O nome do domínio é obrigatório.'}), 400

        try:
            existing = Domain.query.filter_by(domain=domain_name).first()
            if existing:
                return jsonify({'success': False, 'message': 'Domínio já cadastrado no servidor.'}), 400

            new_domain = Domain(
                domain=domain_name,
                description=description,
                maxquota=maxquota,
                active=True
            )
            db.session.add(new_domain)
            db.session.commit()
            return jsonify({'success': True, 'message': f'Domínio {domain_name} criado com sucesso!', 'domain': new_domain.to_dict()})
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'message': f'Exceção ao criar domínio: {str(e)}'}), 500
    else:
        try:
            # Subquery / agrupamento com COUNT() na tabela mailbox por dominio
            mailbox_counts = dict(
                db.session.query(Mailbox.domain, func.count(Mailbox.username))
                .group_by(Mailbox.domain)
                .all()
            )

            domains = Domain.query.all()
            domain_list = []
            for d in domains:
                d_dict = d.to_dict()
                # Atualiza com a contagem real de contas criadas
                d_dict['mailboxes'] = mailbox_counts.get(d.domain, 0)
                domain_list.append(d_dict)

            return jsonify({'success': True, 'domains': domain_list})
        except Exception as e:
            return jsonify({'success': False, 'message': f'Erro ao consultar domínios: {str(e)}'}), 500


@vmail_bp.route('/domains/<domain_name>/toggle', methods=['GET', 'POST'])
@login_required
def toggle_domain(domain_name):
    try:
        domain = Domain.query.filter_by(domain=domain_name).first()
        if not domain:
            return jsonify({'success': False, 'message': 'Domínio não encontrado.'}), 404

        domain.active = not domain.active
        db.session.commit()
        status_str = "ativado" if domain.active else "desativado"
        return jsonify({'success': True, 'message': f'Domínio {domain_name} {status_str} com sucesso!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erro ao alterar status: {str(e)}'}), 500

@vmail_bp.route('/domains/<domain_name>', methods=['GET', 'POST', 'DELETE'])
@login_required
def delete_domain(domain_name):
    try:
        domain = Domain.query.filter_by(domain=domain_name).first()
        if not domain:
            return jsonify({'success': False, 'message': 'Domínio não encontrado.'}), 404

        # Remove mailboxes e aliases associados
        Mailbox.query.filter_by(domain=domain_name).delete()
        Alias.query.filter_by(domain=domain_name).delete()

        db.session.delete(domain)
        db.session.commit()
        return jsonify({'success': True, 'message': f'Domínio {domain_name} e seus usuários foram removidos!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erro ao remover domínio: {str(e)}'}), 500


# ==========================================
# 2. MÓDULO DE MAILBOXES (CAIXAS DE SOMBRA)
# ==========================================

@vmail_bp.route('/mailboxes', methods=['GET', 'POST'])
@login_required
def handle_mailboxes():
    if request.method == 'POST':
        data = request.get_json(silent=True) or request.form or {}
        local_part = data.get('username', '').strip().lower() # ex: joao
        domain_name = data.get('domain', '').strip().lower() # ex: empresa.com.br
        name = data.get('name', '')
        password_plain = data.get('password', '')
        quota_mb = int(data.get('quota', 1024)) # 1GB
        hash_scheme = data.get('scheme', 'SSHA512') # SSHA512 ou SHA512-CRYPT

        if '@' in local_part:
            full_email = local_part
            domain_name = full_email.split('@')[1]
        else:
            if not domain_name:
                return jsonify({'success': False, 'message': 'Domínio é obrigatório.'}), 400
            full_email = f"{local_part}@{domain_name}"

        if not password_plain:
            return jsonify({'success': False, 'message': 'Senha é obrigatória.'}), 400

        try:
            domain_obj = Domain.query.filter_by(domain=domain_name).first()
            if not domain_obj:
                return jsonify({'success': False, 'message': f'Domínio {domain_name} não existe no banco.'}), 400

            existing = Mailbox.query.filter_by(username=full_email).first()
            if existing:
                return jsonify({'success': False, 'message': 'Esta caixa postal já existe.'}), 400

            dovecot_hash = Mailbox.generate_dovecot_password(password_plain, scheme=hash_scheme)
            maildir_path = f"{domain_name}/{local_part.split('@')[0]}/"

            new_mailbox = Mailbox(
                username=full_email,
                password=dovecot_hash,
                name=name,
                maildir=maildir_path,
                quota=quota_mb,
                domain=domain_name,
                active=True
            )

            domain_obj.mailboxes += 1
            db.session.add(new_mailbox)
            db.session.commit()

            return jsonify({
                'success': True,
                'message': f'Caixa de e-mail {full_email} criada com sucesso!',
                'mailbox': new_mailbox.to_dict()
            })
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'message': f'Erro ao criar caixa postal: {str(e)}'}), 500
    else:
        domain_filter = request.args.get('domain')
        try:
            query = Mailbox.query
            if domain_filter:
                query = query.filter_by(domain=domain_filter)
            boxes = query.all()

            # Tenta buscar o consumo em bytes da tabela 'used_quota'
            used_quota_map = {}
            try:
                quotas = UsedQuota.query.all()
                used_quota_map = {q.username: q.bytes for q in quotas}
            except Exception:
                db.session.rollback()
                used_quota_map = {}

            mailbox_list = []
            for b in boxes:
                b_dict = b.to_dict()
                b_dict['bytes_used'] = used_quota_map.get(b.username, 0)
                mailbox_list.append(b_dict)

            return jsonify({'success': True, 'mailboxes': mailbox_list})
        except Exception as e:
            return jsonify({'success': False, 'message': f'Erro ao listar caixas: {str(e)}'}), 500

@vmail_bp.route('/mailboxes/<path:email>/quota', methods=['GET', 'POST', 'PUT'])
@login_required
def update_mailbox_quota(email):
    data = request.get_json(silent=True) or request.form or {}
    new_quota = data.get('quota') or request.args.get('quota')

    try:
        mb = Mailbox.query.filter_by(username=email).first()
        if not mb:
            return jsonify({'success': False, 'message': 'Caixa não encontrada.'}), 404

        if new_quota is not None:
            mb.quota = int(new_quota)
            db.session.commit()
            return jsonify({'success': True, 'message': f'Cota da caixa {email} alterada para {mb.quota} MB!'})
        return jsonify({'success': True, 'quota': mb.quota})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erro ao alterar cota: {str(e)}'}), 500

@vmail_bp.route('/mailboxes/<path:email>', methods=['GET', 'POST', 'DELETE'])
@login_required
def delete_mailbox(email):
    try:
        mb = Mailbox.query.filter_by(username=email).first()
        if not mb:
            return jsonify({'success': False, 'message': 'Caixa não encontrada.'}), 404

        domain_obj = Domain.query.filter_by(domain=mb.domain).first()
        if domain_obj and domain_obj.mailboxes > 0:
            domain_obj.mailboxes -= 1

        db.session.delete(mb)
        db.session.commit()
        return jsonify({'success': True, 'message': f'Caixa postal {email} removida do banco vmail!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erro ao deletar caixa: {str(e)}'}), 500


# ==========================================
# 3. MÓDULO DE ALIASES (REDIRECIONAMENTOS)
# ==========================================

@vmail_bp.route('/aliases', methods=['GET', 'POST'])
@login_required
def handle_aliases():
    if request.method == 'POST':
        data = request.get_json(silent=True) or request.form or {}
        address = data.get('address', '').strip().lower()
        goto = data.get('goto', '').strip().lower()

        if not address or not goto:
            return jsonify({'success': False, 'message': 'Endereço do alias e destino são obrigatórios.'}), 400

        domain_name = address.split('@')[-1]

        try:
            existing = Alias.query.filter_by(address=address).first()
            if existing:
                return jsonify({'success': False, 'message': 'Este alias já está registrado.'}), 400

            new_alias = Alias(
                address=address,
                goto=goto,
                domain=domain_name,
                active=True
            )
            db.session.add(new_alias)
            db.session.commit()
            return jsonify({'success': True, 'message': f'Alias {address} -> {goto} criado com sucesso!'})
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'message': f'Erro ao criar alias: {str(e)}'}), 500
    else:
        try:
            aliases = Alias.query.all()
            return jsonify({'success': True, 'aliases': [a.to_dict() for a in aliases]})
        except Exception as e:
            return jsonify({'success': False, 'message': f'Erro ao consultar aliases: {str(e)}'}), 500

@vmail_bp.route('/aliases/<path:address>', methods=['GET', 'POST', 'DELETE'])
@login_required
def delete_alias(address):
    try:
        al = Alias.query.filter_by(address=address).first()
        if not al:
            return jsonify({'success': False, 'message': 'Alias não encontrado.'}), 404

        db.session.delete(al)
        db.session.commit()
        return jsonify({'success': True, 'message': f'Alias {address} removido!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Erro ao excluir alias: {str(e)}'}), 500
