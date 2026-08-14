from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from sqlalchemy import func, text
import datetime
from models import db, Domain, Mailbox, Alias, AliasDomain, UsedQuota
from blueprints.audit_helper import log_audit_action

vmail_bp = Blueprint('vmail', __name__, url_prefix='/api/vmail')

def format_vmail_db_error(e, default_action="executar ação"):
    err_str = str(e)
    if "1142" in err_str or "command denied" in err_str.lower() or "denied to user" in err_str.lower():
        try:
            from config import Config
            db_user = getattr(Config, 'DB_USER', 'vmail')
        except Exception:
            db_user = 'vmail'
        return (
            f"Erro de permissão no MariaDB/MySQL (1142): O usuário '{db_user}' não possui privilégios de escrita (INSERT/UPDATE/DELETE) na base 'vmail'. "
            f"Para resolver:\n"
            f"1) No arquivo .env, altere DB_USER=vmailadmin (usuário administrativo do iRedMail/Postfix);\n"
            f"2) Ou conceda acesso de escrita executando no MariaDB:\n"
            f"   GRANT SELECT, INSERT, UPDATE, DELETE ON vmail.* TO '{db_user}'@'localhost'; FLUSH PRIVILEGES;"
        )
    return f"Erro ao {default_action}: {err_str}"

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

            try:
                log_audit_action("DOMAIN_CREATE", domain_name, {"description": description, "maxquota": maxquota}, "normal")
            except Exception:
                pass

            return jsonify({'success': True, 'message': f'Domínio {domain_name} criado com sucesso!', 'domain': new_domain.to_dict()})
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'message': format_vmail_db_error(e, 'criar domínio')}), 500
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

        try:
            log_audit_action(
                "DOMAIN_TOGGLE",
                domain_name,
                {"active": domain.active, "status": status_str},
                "suspicious" if not domain.active else "normal"
            )
        except Exception:
            pass

        return jsonify({'success': True, 'message': f'Domínio {domain_name} {status_str} com sucesso!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': format_vmail_db_error(e, 'alterar status do domínio')}), 500

@vmail_bp.route('/domains/<domain_name>', methods=['GET', 'POST', 'DELETE'])
@login_required
def delete_domain(domain_name):
    if current_user.role == 'user':
        return jsonify({'success': False, 'message': 'Acesso negado: Perfil de Usuário não possui permissão de exclusão de domínios.'}), 403

    try:
        domain = Domain.query.filter_by(domain=domain_name).first()
        if not domain:
            return jsonify({'success': False, 'message': 'Domínio não encontrado.'}), 404

        # Remove mailboxes e aliases associados
        Mailbox.query.filter_by(domain=domain_name).delete()
        db_delete_aliases_by_domain(domain_name)

        db.session.delete(domain)
        db.session.commit()

        try:
            log_audit_action("DOMAIN_DELETE", domain_name, {}, "critical")
        except Exception:
            pass

        return jsonify({'success': True, 'message': f'Domínio {domain_name} e seus usuários foram removidos!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': format_vmail_db_error(e, 'remover domínio')}), 500


# ==========================================
# 1.1 MÓDULO DE ALIASES DE DOMÍNIO (DOMAIN ALIASES)
# Ex: zrti.tech -> zrti.com.br (recebem e enviam)
# ==========================================

@vmail_bp.route('/alias-domains', methods=['GET', 'POST'])
@vmail_bp.route('/domain-aliases', methods=['GET', 'POST'])
@login_required
def handle_domain_aliases():
    if request.method == 'POST':
        data = request.get_json(silent=True) or request.form or {}
        alias_domain = data.get('alias_domain', '').strip().lower()
        target_domain = data.get('target_domain', '').strip().lower()

        if not alias_domain or not target_domain:
            return jsonify({'success': False, 'message': 'Domínio alias e domínio de destino são obrigatórios.'}), 400

        if alias_domain == target_domain:
            return jsonify({'success': False, 'message': 'O domínio de alias não pode ser idêntico ao de destino.'}), 400

        try:
            # Verifica se o target_domain existe em domain
            target = Domain.query.filter_by(domain=target_domain).first()
            if not target:
                return jsonify({'success': False, 'message': f'O domínio de destino {target_domain} não existe nos domínios virtuais cadastrados.'}), 400

            # Verifica se alias_domain já existe em domain ou alias_domain
            exist_dom = Domain.query.filter_by(domain=alias_domain).first()
            if exist_dom:
                return jsonify({'success': False, 'message': f'O domínio {alias_domain} já está cadastrado como domínio virtual principal.'}), 400

            exist_ad = AliasDomain.query.filter_by(alias_domain=alias_domain).first()
            if exist_ad:
                return jsonify({'success': False, 'message': f'O alias de domínio {alias_domain} já existe.'}), 400

            new_ad = AliasDomain(
                alias_domain=alias_domain,
                target_domain=target_domain,
                active=True
            )
            db.session.add(new_ad)
            db.session.commit()

            try:
                log_audit_action("DOMAIN_ALIAS_CREATE", alias_domain, {"target_domain": target_domain}, "normal")
            except Exception:
                pass

            return jsonify({
                'success': True,
                'message': f'Alias de domínio {alias_domain} -> {target_domain} criado com sucesso!',
                'alias_domain': new_ad.to_dict()
            })
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'message': format_vmail_db_error(e, 'criar alias de domínio')}), 500
    else:
        try:
            aliases = AliasDomain.query.all()
            return jsonify({'success': True, 'alias_domains': [a.to_dict() for a in aliases], 'data': [a.to_dict() for a in aliases]})
        except Exception as e:
            return jsonify({'success': False, 'message': f'Erro ao consultar aliases de domínio: {str(e)}', 'alias_domains': []}), 200


@vmail_bp.route('/alias-domains/<alias_domain>/toggle', methods=['GET', 'POST'])
@vmail_bp.route('/domain-aliases/<alias_domain>/toggle', methods=['GET', 'POST'])
@login_required
def toggle_domain_alias(alias_domain):
    try:
        ad = AliasDomain.query.filter_by(alias_domain=alias_domain.strip().lower()).first()
        if not ad:
            return jsonify({'success': False, 'message': 'Alias de domínio não encontrado.'}), 404

        ad.active = not ad.active
        db.session.commit()
        status_str = "ativado" if ad.active else "desativado"

        try:
            log_audit_action("DOMAIN_ALIAS_TOGGLE", alias_domain, {"active": ad.active}, "normal")
        except Exception:
            pass

        return jsonify({'success': True, 'message': f'Alias de domínio {alias_domain} {status_str}!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': format_vmail_db_error(e, 'alterar status do alias de domínio')}), 500


@vmail_bp.route('/alias-domains/<alias_domain>', methods=['GET', 'POST', 'DELETE'])
@vmail_bp.route('/domain-aliases/<alias_domain>', methods=['GET', 'POST', 'DELETE'])
@login_required
def delete_domain_alias(alias_domain):
    if current_user.role == 'user':
        return jsonify({'success': False, 'message': 'Acesso negado: Perfil de Usuário não possui permissão de exclusão.'}), 403

    try:
        ad = AliasDomain.query.filter_by(alias_domain=alias_domain.strip().lower()).first()
        if not ad:
            return jsonify({'success': False, 'message': 'Alias de domínio não encontrado.'}), 404

        db.session.delete(ad)
        db.session.commit()

        try:
            log_audit_action("DOMAIN_ALIAS_DELETE", alias_domain, {}, "normal")
        except Exception:
            pass

        return jsonify({'success': True, 'message': f'Alias de domínio {alias_domain} removido com sucesso!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': format_vmail_db_error(e, 'excluir alias de domínio')}), 500


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
                # Auto-cria o domínio caso não exista
                domain_obj = Domain(
                    domain=domain_name,
                    description='Domínio Criado Automaticamente',
                    maxquota=10240,
                    transport='virtual',
                    active=True
                )
                db.session.add(domain_obj)
                db.session.flush()

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

            db.session.add(new_mailbox)

            # Garante entrada correspondente em 'alias' ou 'forwardings' para o Postfix/iRedMail
            db_create_self_alias(full_email, domain_name)

            db.session.commit()

            try:
                log_audit_action("MAILBOX_CREATE", full_email, {"quota": quota_mb, "domain": domain_name, "scheme": hash_scheme}, "normal")
            except Exception:
                pass

            return jsonify({
                'success': True,
                'message': f'Caixa de e-mail {full_email} criada com sucesso!',
                'mailbox': new_mailbox.to_dict()
            })
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'message': format_vmail_db_error(e, 'criar caixa postal')}), 500
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

            try:
                log_audit_action("MAILBOX_QUOTA_UPDATE", email, {"quota": mb.quota}, "normal")
            except Exception:
                pass

            return jsonify({'success': True, 'message': f'Cota da caixa {email} alterada para {mb.quota} MB!'})
        return jsonify({'success': True, 'quota': mb.quota})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': format_vmail_db_error(e, 'alterar cota')}), 500

@vmail_bp.route('/mailboxes/<path:email>/password', methods=['GET', 'POST', 'PUT'])
@vmail_bp.route('/mailboxes/<path:email>/reset-password', methods=['GET', 'POST', 'PUT'])
@login_required
def reset_mailbox_password(email):
    if request.method == 'GET':
        return jsonify({'success': True, 'email': email})

    data = request.get_json(silent=True) or request.form or {}
    new_password = data.get('password', '').strip()
    scheme = data.get('scheme', 'SSHA512')

    if not new_password:
        return jsonify({'success': False, 'message': 'A nova senha é obrigatória.'}), 400

    try:
        mb = Mailbox.query.filter_by(username=email).first()
        if not mb:
            return jsonify({'success': False, 'message': 'Caixa postal não encontrada.'}), 404

        dovecot_hash = Mailbox.generate_dovecot_password(new_password, scheme=scheme)
        mb.password = dovecot_hash
        db.session.commit()

        try:
            log_audit_action("MAILBOX_PASSWORD_RESET", email, {"scheme": scheme}, "suspicious")
        except Exception:
            pass

        return jsonify({
            'success': True,
            'message': f'Senha da caixa postal {email} redefinida com sucesso!'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': format_vmail_db_error(e, 'redefinir senha da caixa')}), 500

@vmail_bp.route('/mailboxes/<path:email>', methods=['GET', 'POST', 'DELETE'])
@login_required
def delete_mailbox(email):
    if current_user.role == 'user':
        return jsonify({'success': False, 'message': 'Acesso negado: Perfil de Usuário não possui permissão de exclusão de caixas postais.'}), 403

    try:
        mb = Mailbox.query.filter_by(username=email).first()
        if not mb:
            return jsonify({'success': False, 'message': 'Caixa não encontrada.'}), 404

        db.session.delete(mb)
        db.session.commit()

        try:
            log_audit_action("MAILBOX_DELETE", email, {}, "potential")
        except Exception:
            pass

        return jsonify({'success': True, 'message': f'Caixa postal {email} removida do banco vmail!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': format_vmail_db_error(e, 'deletar caixa postal')}), 500


# ==========================================
# 3. MÓDULO DE ALIASES / REDIRECIONAMENTOS
# ==========================================

def inspect_vmail_alias_storage():
    """
    Inspeciona o banco de dados para determinar o esquema de armazenamento de aliases/redirecionamentos.
    Detecta automaticamente:
    1. Tabela 'alias' com coluna 'goto' (PostfixAdmin / Postfix simples)
    2. Tabela 'alias' com coluna 'forwarding'
    3. Tabela 'forwardings' (padrao iRedMail 0.9.7+)
    """
    try:
        res = db.session.execute(text("SHOW COLUMNS FROM alias")).fetchall()
        cols = [r[0].lower() for r in res]
        if 'goto' in cols:
            return {'mode': 'alias_goto', 'cols': cols}
        if 'forwarding' in cols:
            return {'mode': 'alias_forwarding', 'cols': cols}
    except Exception:
        pass

    try:
        res = db.session.execute(text("SHOW COLUMNS FROM forwardings")).fetchall()
        cols = [r[0].lower() for r in res]
        if 'forwarding' in cols:
            return {'mode': 'forwardings', 'cols': cols}
    except Exception:
        pass

    return {'mode': 'alias_goto', 'cols': ['address', 'goto', 'domain', 'created', 'active']}


def db_list_aliases():
    schema = inspect_vmail_alias_storage()
    mode = schema['mode']

    if mode == 'alias_goto':
        sql = "SELECT address, `goto`, domain, active, created FROM alias"
        rows = db.session.execute(text(sql)).fetchall()
        res = []
        for r in rows:
            created_str = str(r[4]) if len(r) > 4 and r[4] else None
            res.append({
                'address': r[0],
                'goto': r[1],
                'domain': r[2],
                'active': bool(r[3]),
                'created': created_str
            })
        return res

    elif mode == 'alias_forwarding':
        sql = "SELECT address, forwarding AS `goto`, domain, active FROM alias"
        rows = db.session.execute(text(sql)).fetchall()
        res = []
        for r in rows:
            res.append({
                'address': r[0],
                'goto': r[1],
                'domain': r[2],
                'active': bool(r[3]),
                'created': None
            })
        return res

    elif mode == 'forwardings':
        cols = schema['cols']
        where_clause = ""
        if 'is_alias' in cols:
            where_clause = "WHERE is_alias = 1 OR address != forwarding"
        else:
            where_clause = "WHERE address != forwarding"

        sql = f"""
            SELECT address, GROUP_CONCAT(forwarding SEPARATOR ', ') AS `goto`, domain, MIN(active) AS active
            FROM forwardings
            {where_clause}
            GROUP BY address, domain
        """
        rows = db.session.execute(text(sql)).fetchall()
        res = []
        for r in rows:
            res.append({
                'address': r[0],
                'goto': r[1] or '',
                'domain': r[2] or (r[0].split('@')[-1] if '@' in r[0] else ''),
                'active': bool(r[3]),
                'created': None
            })
        return res

    return []


def db_save_alias(address, goto):
    address = address.strip().lower()
    goto = goto.strip().lower()
    domain_name = address.split('@')[-1]

    try:
        domain_obj = Domain.query.filter_by(domain=domain_name).first()
        if not domain_obj:
            domain_obj = Domain(
                domain=domain_name,
                description='Domínio Criado Automaticamente',
                maxquota=10240,
                transport='virtual',
                active=True
            )
            db.session.add(domain_obj)
            db.session.flush()
    except Exception:
        pass

    schema = inspect_vmail_alias_storage()
    mode = schema['mode']
    cols = schema['cols']

    if mode == 'alias_goto':
        check_sql = "SELECT address FROM alias WHERE LOWER(address) = :addr"
        existing = db.session.execute(text(check_sql), {'addr': address}).fetchone()
        if existing:
            upd = "UPDATE alias SET `goto` = :goto, active = 1 WHERE LOWER(address) = :addr"
            db.session.execute(text(upd), {'goto': goto, 'addr': address})
            msg = f"Alias {address} atualizado para redirecionar para {goto}!"
        else:
            ins = "INSERT INTO alias (address, `goto`, domain, active) VALUES (:addr, :goto, :dom, 1)"
            db.session.execute(text(ins), {'addr': address, 'goto': goto, 'dom': domain_name})
            msg = f"Alias {address} -> {goto} cadastrado com sucesso!"
        db.session.commit()
        return msg, {'address': address, 'goto': goto, 'domain': domain_name, 'active': True}

    elif mode == 'alias_forwarding':
        check_sql = "SELECT address FROM alias WHERE LOWER(address) = :addr"
        existing = db.session.execute(text(check_sql), {'addr': address}).fetchone()
        if existing:
            upd = "UPDATE alias SET forwarding = :goto, active = 1 WHERE LOWER(address) = :addr"
            db.session.execute(text(upd), {'goto': goto, 'addr': address})
            msg = f"Alias {address} atualizado para redirecionar para {goto}!"
        else:
            ins = "INSERT INTO alias (address, forwarding, domain, active) VALUES (:addr, :goto, :dom, 1)"
            db.session.execute(text(ins), {'addr': address, 'goto': goto, 'dom': domain_name})
            msg = f"Alias {address} -> {goto} cadastrado com sucesso!"
        db.session.commit()
        return msg, {'address': address, 'goto': goto, 'domain': domain_name, 'active': True}

    elif mode == 'forwardings':
        del_sql = "DELETE FROM forwardings WHERE LOWER(address) = :addr"
        if 'is_alias' in cols:
            del_sql += " AND (is_alias = 1 OR address != forwarding)"
        db.session.execute(text(del_sql), {'addr': address})

        destinations = [d.strip() for d in goto.split(',') if d.strip()]
        for dest in destinations:
            dest_domain = dest.split('@')[-1] if '@' in dest else domain_name

            ins_cols = ['address', 'forwarding', 'domain']
            ins_vals = [':addr', ':dest', ':dom']
            params = {'addr': address, 'dest': dest, 'dom': domain_name}

            if 'dest_domain' in cols:
                ins_cols.append('dest_domain')
                ins_vals.append(':dest_dom')
                params['dest_dom'] = dest_domain
            if 'is_alias' in cols:
                ins_cols.append('is_alias')
                ins_vals.append('1')
            if 'is_forwarding' in cols:
                ins_cols.append('is_forwarding')
                ins_vals.append('0')
            if 'active' in cols:
                ins_cols.append('active')
                ins_vals.append('1')

            sql = f"INSERT INTO forwardings ({', '.join(ins_cols)}) VALUES ({', '.join(ins_vals)})"
            db.session.execute(text(sql), params)

        db.session.commit()
        return f"Alias {address} -> {goto} cadastrado com sucesso!", {'address': address, 'goto': goto, 'domain': domain_name, 'active': True}

    db.session.commit()
    return f"Alias {address} salvo com sucesso!", {'address': address, 'goto': goto, 'domain': domain_name, 'active': True}


def db_delete_alias(address):
    clean_addr = address.strip().lower()

    try:
        db.session.execute(text("DELETE FROM alias WHERE LOWER(address) = :addr"), {'addr': clean_addr})
    except Exception:
        pass

    try:
        db.session.execute(text("DELETE FROM forwardings WHERE LOWER(address) = :addr AND (is_alias = 1 OR address != forwarding)"), {'addr': clean_addr})
    except Exception:
        pass

    db.session.commit()


def db_delete_aliases_by_domain(domain_name):
    dom = domain_name.strip().lower()
    try:
        db.session.execute(text("DELETE FROM alias WHERE LOWER(domain) = :dom"), {'dom': dom})
    except Exception:
        pass
    try:
        db.session.execute(text("DELETE FROM forwardings WHERE LOWER(domain) = :dom"), {'dom': dom})
    except Exception:
        pass
    db.session.commit()


def db_create_self_alias(full_email, domain_name):
    schema = inspect_vmail_alias_storage()
    mode = schema['mode']
    cols = schema['cols']

    try:
        if mode == 'forwardings':
            chk = db.session.execute(text("SELECT address FROM forwardings WHERE LOWER(address) = :addr AND LOWER(forwarding) = :addr"), {'addr': full_email}).fetchone()
            if not chk:
                params = {'addr': full_email, 'dom': domain_name}
                ins_cols = ['address', 'forwarding', 'domain']
                ins_vals = [':addr', ':addr', ':dom']

                if 'dest_domain' in cols:
                    ins_cols.append('dest_domain')
                    ins_vals.append(':dom')
                if 'is_forwarding' in cols:
                    ins_cols.append('is_forwarding')
                    ins_vals.append('1')
                if 'is_alias' in cols:
                    ins_cols.append('is_alias')
                    ins_vals.append('0')
                if 'active' in cols:
                    ins_cols.append('active')
                    ins_vals.append('1')

                sql = f"INSERT INTO forwardings ({', '.join(ins_cols)}) VALUES ({', '.join(ins_vals)})"
                db.session.execute(text(sql), params)
                db.session.commit()
        elif mode in ('alias_goto', 'alias_forwarding'):
            target_col = 'goto' if mode == 'alias_goto' else 'forwarding'
            chk = db.session.execute(text("SELECT address FROM alias WHERE LOWER(address) = :addr"), {'addr': full_email}).fetchone()
            if not chk:
                sql = f"INSERT INTO alias (address, `{target_col}`, domain, active) VALUES (:addr, :addr, :dom, 1)"
                db.session.execute(text(sql), {'addr': full_email, 'dom': domain_name})
                db.session.commit()
    except Exception:
        pass


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
            msg, alias_dict = db_save_alias(address, goto)

            try:
                log_audit_action("ALIAS_CREATE", address, {"goto": goto, "domain": domain_name}, "normal")
            except Exception:
                pass

            return jsonify({'success': True, 'message': msg, 'alias': alias_dict})
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'message': format_vmail_db_error(e, 'criar/atualizar alias')}), 500
    else:
        try:
            alias_list = db_list_aliases()
            return jsonify({'success': True, 'aliases': alias_list, 'data': alias_list})
        except Exception as e:
            return jsonify({"status": "error", "message": f"Erro ao ler aliases: {str(e)}", "data": []}), 200

@vmail_bp.route('/aliases/<path:address>', methods=['GET', 'POST', 'DELETE'])
@login_required
def delete_alias(address):
    if current_user.role == 'user':
        return jsonify({'success': False, 'message': 'Acesso negado: Perfil de Usuário não possui permissão de exclusão de aliases.'}), 403

    clean_addr = address.strip().lower()

    try:
        db_delete_alias(clean_addr)

        try:
            log_audit_action("ALIAS_DELETE", clean_addr, {}, "normal")
        except Exception:
            pass

        return jsonify({'success': True, 'message': f'Alias {clean_addr} removido!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': format_vmail_db_error(e, 'excluir alias')}), 500

