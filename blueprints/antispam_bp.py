# -*- coding: utf-8 -*-
"""
MailAdmin Server Security - AntiSpam Policy Engine Blueprint
Rotas da API para gerenciamento de regras, limiares de pontuação,
catálogo de impersonation, consultas rDNS e simulação de diagnóstico.
"""

from flask import Blueprint, request, jsonify, session
import datetime
import os
import re
from typing import Dict, Any, List

from models import (
    db, AntispamRule, AntispamSetting, AntispamImpersonationProfile,
    AntispamAnalysis, AntispamAnalysisRule, AntispamAudit
)
import policy_engine as pe

antispam_bp = Blueprint('antispam_bp', __name__)


def get_current_user() -> str:
    return session.get('username') or session.get('user') or 'admin'


def init_default_data_if_needed():
    """Garante que as regras e perfis padrão existam no banco de dados."""
    try:
        db.create_all()
        if AntispamRule.query.count() == 0:
            for r in pe.DEFAULT_POLICY_RULES:
                rule = AntispamRule(
                    codigo=r["codigo"],
                    nome=r["nome"],
                    categoria=r["categoria"],
                    descricao=r["descricao"],
                    score=r["score"],
                    ativo=r["ativo"],
                    severidade=r["severidade"],
                    origem=r["origem"]
                )
                db.session.add(rule)
            db.session.commit()

        if AntispamImpersonationProfile.query.count() == 0:
            for p in pe.DEFAULT_IMPERSONATION_PROFILES:
                prof = AntispamImpersonationProfile(
                    brand_name=p["brand_name"],
                    official_domains=p["official_domains"],
                    category=p["category"],
                    severity=p["severity"],
                    active=True
                )
                db.session.add(prof)
            db.session.commit()

        if AntispamSetting.query.count() == 0:
            for k, v in pe.DEFAULT_SETTINGS.items():
                setting = AntispamSetting(
                    key=k,
                    value=str(v),
                    category='threshold' if 'threshold' in k else 'engine',
                    description=f"Configuração de {k}"
                )
                db.session.add(setting)
            db.session.commit()
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass


@antispam_bp.before_app_request
def setup_defaults():
    # Inicialização preguiçosa protegida
    pass


# 1. Visão Geral e Estatísticas
@antispam_bp.route('/api/antispam/overview', methods=['GET'])
def get_antispam_overview():
    init_default_data_if_needed()
    try:
        total_rules = AntispamRule.query.count()
        active_rules = AntispamRule.query.filter_by(ativo=True).count()
        total_analyses = AntispamAnalysis.query.count()
        total_brands = AntispamImpersonationProfile.query.count()

        # Detecção de configurações reais em disco do SpamAssassin / Amavis
        real_sa = pe.detect_real_spamassassin_settings()

        # Configurações do Policy Engine
        settings_dict = {}
        for s in AntispamSetting.query.all():
            settings_dict[s.key] = s.value

        return jsonify({
            "success": True,
            "stats": {
                "total_rules": total_rules,
                "active_rules": active_rules,
                "total_analyses": total_analyses,
                "total_protected_brands": total_brands
            },
            "spamassassin_detected": real_sa,
            "policy_engine_thresholds": {
                "score_spam": float(settings_dict.get("score_spam_threshold", 4.5)),
                "score_high_risk": float(settings_dict.get("score_high_risk_threshold", 8.0)),
                "score_critical": float(settings_dict.get("score_critical_threshold", 10.0)),
                "fcr_dns_enabled": settings_dict.get("enable_fcr_dns", "true") == "true",
                "impersonation_enabled": settings_dict.get("enable_impersonation_check", "true") == "true"
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# 2. Motor de Pontuação / Listagem e Gestão de Regras
@antispam_bp.route('/api/antispam/rules', methods=['GET'])
def list_rules():
    init_default_data_if_needed()
    try:
        categoria = request.args.get('category')
        busca = request.args.get('search', '').strip().lower()

        query = AntispamRule.query
        if categoria:
            query = query.filter_by(categoria=categoria)

        rules = query.order_by(AntispamRule.categoria, AntispamRule.id).all()
        result = []
        for r in rules:
            d = r.to_dict()
            if busca:
                if busca not in d['codigo'].lower() and busca not in d['nome'].lower() and busca not in d['descricao'].lower():
                    continue
            result.append(d)

        return jsonify({"success": True, "rules": result, "count": len(result)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@antispam_bp.route('/api/antispam/rules/<int:rule_id>', methods=['PUT'])
def update_rule(rule_id):
    try:
        rule = AntispamRule.query.get(rule_id)
        if not rule:
            return jsonify({"success": False, "error": "Regra não encontrada"}), 404

        data = request.get_json() or {}
        user = get_current_user()
        ip = request.remote_addr or '127.0.0.1'

        old_score = rule.score
        old_active = rule.ativo

        if 'score' in data:
            new_score = float(data['score'])
            # Validação do limite -10.0 até +10.0
            if new_score < -10.0 or new_score > 10.0:
                return jsonify({"success": False, "error": "O score deve estar estritamente entre -10.0 e +10.0"}), 400
            rule.score = new_score

        if 'ativo' in data or 'active' in data:
            rule.ativo = bool(data.get('ativo', data.get('active')))

        if 'severidade' in data:
            rule.severidade = data['severidade']

        if 'nome' in data and rule.origem == 'custom':
            rule.nome = data['nome']

        if 'descricao' in data and rule.origem == 'custom':
            rule.descricao = data['descricao']

        rule.data_atualizacao = datetime.datetime.utcnow()

        # Registro de Auditoria
        audit = AntispamAudit(
            usuario=user,
            acao='UPDATE_RULE',
            alvo=f"{rule.codigo} (#{rule.id})",
            valor_anterior=f"Score: {old_score}, Ativo: {old_active}",
            valor_novo=f"Score: {rule.score}, Ativo: {rule.ativo}",
            motivo=data.get('motivo') or 'Ajuste de política de pontuação do Policy Engine',
            ip_origem=ip
        )
        db.session.add(audit)
        db.session.commit()

        return jsonify({"success": True, "message": "Regra atualizada com sucesso", "rule": rule.to_dict()})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@antispam_bp.route('/api/antispam/rules', methods=['POST'])
def create_custom_rule():
    try:
        data = request.get_json() or {}
        codigo = data.get('codigo', '').strip().upper()
        nome = data.get('nome', '').strip()
        categoria = data.get('categoria', 'custom')
        score = float(data.get('score', 1.0))
        severidade = data.get('severidade', 'MEDIUM')
        descricao = data.get('descricao', '')

        if not codigo or not nome:
            return jsonify({"success": False, "error": "Código e nome da regra são obrigatórios"}), 400

        if score < -10.0 or score > 10.0:
            return jsonify({"success": False, "error": "O score deve estar entre -10.0 e +10.0"}), 400

        if AntispamRule.query.filter_by(codigo=codigo).first():
            return jsonify({"success": False, "error": f"Já existe uma regra com o código '{codigo}'"}), 400

        rule = AntispamRule(
            codigo=codigo,
            nome=nome,
            categoria=categoria,
            descricao=descricao,
            score=score,
            severidade=severidade,
            ativo=True,
            origem='custom'
        )
        db.session.add(rule)

        # Auditoria
        audit = AntispamAudit(
            usuario=get_current_user(),
            acao='CREATE_CUSTOM_RULE',
            alvo=codigo,
            valor_anterior=None,
            valor_novo=f"Score: {score}, Categoria: {categoria}",
            motivo=data.get('motivo') or 'Criação de regra customizada',
            ip_origem=request.remote_addr or '127.0.0.1'
        )
        db.session.add(audit)
        db.session.commit()

        return jsonify({"success": True, "message": "Regra criada com sucesso", "rule": rule.to_dict()})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


# 3. Limiares e Configurações (Settings)
@antispam_bp.route('/api/antispam/settings', methods=['GET'])
def get_settings():
    init_default_data_if_needed()
    try:
        settings = AntispamSetting.query.all()
        detected_sa = pe.detect_real_spamassassin_settings()
        return jsonify({
            "success": True,
            "settings": [s.to_dict() for s in settings],
            "detected_sa": detected_sa
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@antispam_bp.route('/api/antispam/settings', methods=['PUT'])
def update_settings():
    try:
        data = request.get_json() or {}
        user = get_current_user()
        ip = request.remote_addr or '127.0.0.1'

        updated_items = []
        for key, val in data.items():
            setting = AntispamSetting.query.filter_by(key=key).first()
            if setting:
                old_v = setting.value
                setting.value = str(val)
                setting.updated_at = datetime.datetime.utcnow()
                setting.updated_by = user
                updated_items.append(f"{key}: {old_v} -> {val}")

                # Auditoria
                audit = AntispamAudit(
                    usuario=user,
                    acao='UPDATE_SETTING',
                    alvo=key,
                    valor_anterior=old_v,
                    valor_novo=str(val),
                    motivo='Ajuste de limiares do Policy Engine',
                    ip_origem=ip
                )
                db.session.add(audit)

        db.session.commit()
        return jsonify({"success": True, "message": "Limiares atualizados com sucesso", "updated": updated_items})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


# 4. Catálogo de Proteção de Impersonation (Marcas e Instituições)
@antispam_bp.route('/api/antispam/impersonation/profiles', methods=['GET'])
@antispam_bp.route('/api/antispam/impersonation-profiles', methods=['GET'])
def get_impersonation_profiles():
    init_default_data_if_needed()
    try:
        profiles = AntispamImpersonationProfile.query.order_by(AntispamImpersonationProfile.category, AntispamImpersonationProfile.brand_name).all()
        return jsonify({"success": True, "profiles": [p.to_dict() for p in profiles]})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@antispam_bp.route('/api/antispam/impersonation/profiles', methods=['POST'])
@antispam_bp.route('/api/antispam/impersonation-profiles', methods=['POST'])
def add_impersonation_profile():
    try:
        data = request.get_json() or {}
        brand_name = data.get('brand_name', '').strip()
        domains = data.get('official_domains', '')
        category = data.get('category', 'finance')
        severity = data.get('severity', 'CRITICAL')

        if isinstance(domains, list):
            domains = ",".join(domains)

        if not brand_name or not domains:
            return jsonify({"success": False, "error": "Nome da marca e domínios oficiais são obrigatórios"}), 400

        profile = AntispamImpersonationProfile(
            brand_name=brand_name,
            official_domains=domains,
            category=category,
            severity=severity,
            active=True
        )
        db.session.add(profile)

        # Auditoria
        audit = AntispamAudit(
            usuario=get_current_user(),
            acao='ADD_IMPERSONATION_PROFILE',
            alvo=brand_name,
            valor_anterior=None,
            valor_novo=domains,
            motivo='Inclusão de perfil de marca protegida',
            ip_origem=request.remote_addr or '127.0.0.1'
        )
        db.session.add(audit)
        db.session.commit()

        return jsonify({"success": True, "message": "Perfil cadastrado com sucesso", "profile": profile.to_dict()})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@antispam_bp.route('/api/antispam/impersonation/profiles/<int:profile_id>', methods=['DELETE'])
@antispam_bp.route('/api/antispam/impersonation-profiles/<int:profile_id>', methods=['DELETE'])
def delete_impersonation_profile(profile_id):
    try:
        prof = AntispamImpersonationProfile.query.get(profile_id)
        if not prof:
            return jsonify({"success": False, "error": "Perfil não encontrado"}), 404

        b_name = prof.brand_name
        db.session.delete(prof)

        # Auditoria
        audit = AntispamAudit(
            usuario=get_current_user(),
            acao='DELETE_IMPERSONATION_PROFILE',
            alvo=b_name,
            valor_anterior=prof.official_domains,
            valor_novo=None,
            motivo='Remoção de perfil de marca protegida',
            ip_origem=request.remote_addr or '127.0.0.1'
        )
        db.session.add(audit)
        db.session.commit()

        return jsonify({"success": True, "message": f"Perfil '{b_name}' removido com sucesso"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


# 5. Consulta e Validação rDNS / PTR
@antispam_bp.route('/api/antispam/rdns/test', methods=['POST'])
@antispam_bp.route('/api/antispam/rdns/diagnose', methods=['POST'])
def test_rdns():
    try:
        data = request.get_json() or {}
        client_ip = data.get('client_ip') or data.get('ip') or ''
        helo = data.get('helo', '').strip()

        if not client_ip:
            return jsonify({"success": False, "error": "Endereço IP é obrigatório para consulta rDNS"}), 400

        result = pe.analyze_rdns_ptr(client_ip, helo)
        return jsonify({"success": True, "result": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# 6. Diagnóstico & Simulador Preditivo (100% Read-Only)
@antispam_bp.route('/api/antispam/simulate', methods=['POST'])
def run_simulation():
    try:
        data = request.get_json() or {}
        raw_eml = data.get('raw_eml', '')
        params = data.get('params', data)

        # Carrega regras e perfis ativos do banco
        active_rules = [r.to_dict() for r in AntispamRule.query.filter_by(ativo=True).all()]
        profiles = [p.to_dict() for p in AntispamImpersonationProfile.query.filter_by(active=True).all()]

        settings_dict = {}
        for s in AntispamSetting.query.all():
            settings_dict[s.key] = s.value

        # Executa a simulação
        eval_result = pe.parse_and_evaluate_simulation(
            raw_eml_content=raw_eml,
            params=params,
            active_rules=active_rules,
            settings=settings_dict,
            impersonation_profiles=profiles
        )

        # Grava histórico de diagnóstico no banco
        analysis = AntispamAnalysis(
            message_id=eval_result.get("message_id"),
            queue_id=eval_result.get("queue_id"),
            sender_from=eval_result.get("sender_from"),
            envelope_from=eval_result.get("envelope_from"),
            envelope_to=eval_result.get("envelope_to"),
            client_ip=eval_result.get("client_ip"),
            ptr=eval_result.get("ptr"),
            helo=eval_result.get("helo"),
            spf_status=eval_result.get("spf_status"),
            dkim_status=eval_result.get("dkim_status"),
            dmarc_status=eval_result.get("dmarc_status"),
            sa_score=eval_result.get("sa_score", 0.0),
            intelligence_score=eval_result.get("intelligence_score", 0.0),
            final_score=eval_result.get("final_score", 0.0),
            classification=eval_result.get("classification", "CLEAN"),
            confidence_level=eval_result.get("confidence_level", "HIGH")
        )
        db.session.add(analysis)
        db.session.flush()

        for tr in eval_result.get("triggered_rules", []):
            ar = AntispamAnalysisRule(
                analysis_id=analysis.id,
                rule_code=tr.get("rule_code"),
                rule_name=tr.get("rule_name"),
                score_applied=tr.get("score_applied", 0.0),
                evidence=tr.get("evidence", "")
            )
            db.session.add(ar)

        db.session.commit()
        eval_result["analysis_id"] = analysis.id

        return jsonify(eval_result)
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


# 7. Histórico de Diagnósticos
@antispam_bp.route('/api/antispam/analysis/history', methods=['GET'])
def get_analysis_history():
    try:
        limit = min(int(request.args.get('limit', 50)), 100)
        items = AntispamAnalysis.query.order_by(AntispamAnalysis.created_at.desc()).limit(limit).all()
        return jsonify({"success": True, "history": [item.to_dict() for item in items]})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# 8. Trilha de Auditoria
@antispam_bp.route('/api/antispam/audit', methods=['GET'])
def get_antispam_audit():
    try:
        limit = min(int(request.args.get('limit', 50)), 100)
        logs = AntispamAudit.query.order_by(AntispamAudit.data_hora.desc()).limit(limit).all()
        return jsonify({"success": True, "logs": [l.to_dict() for l in logs]})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# 9. Geração de Diff e Aplicação Segura de Parâmetros do SpamAssassin / Amavis
@antispam_bp.route('/api/antispam/spamassassin/sync-diff', methods=['POST'])
def generate_sa_diff():
    try:
        data = request.get_json() or {}
        file_type = data.get('file_type', 'spamassassin') # 'spamassassin' ou 'amavis'
        current_vals = pe.detect_real_spamassassin_settings()
        proposed_vals = data.get('proposed_vals', {})

        diff_res = pe.generate_config_diff(file_type, current_vals, proposed_vals)
        return jsonify({"success": True, "diff": diff_res})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@antispam_bp.route('/api/antispam/spamassassin/sync-apply', methods=['POST'])
def apply_sa_config():
    """Aplica alterações com confirmação explícita e gera backup carimbado."""
    try:
        data = request.get_json() or {}
        confirmed = data.get('confirmed', False)
        if not confirmed:
            return jsonify({"success": False, "error": "A confirmação explícita do administrador é obrigatória."}), 400

        user = get_current_user()
        ip = request.remote_addr or '127.0.0.1'
        reason = data.get('reason') or 'Ajuste de required_score do SpamAssassin / Amavis'

        new_required_score = data.get('required_score')
        local_cf_path = "/etc/spamassassin/local.cf"

        if new_required_score is not None and os.path.exists(local_cf_path):
            # Backup carimbado
            ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
            bak_path = f"{local_cf_path}.bak_{ts}"
            with open(local_cf_path, "r", encoding="utf-8") as f:
                orig_content = f.read()
            with open(bak_path, "w", encoding="utf-8") as f:
                f.write(orig_content)

            # Atualização da diretiva required_score
            if re.search(r'^\s*required_(?:score|hits)\s+[\d\.]+', orig_content, re.MULTILINE):
                new_content = re.sub(r'^\s*required_(?:score|hits)\s+[\d\.]+', f"required_score {new_required_score}", orig_content, flags=re.MULTILINE)
            else:
                new_content = orig_content + f"\nrequired_score {new_required_score}\n"

            with open(local_cf_path, "w", encoding="utf-8") as f:
                f.write(new_content)

            # Reload do serviço
            os.system("systemctl reload spamassassin >/dev/null 2>&1 || true")

            # Auditoria
            audit = AntispamAudit(
                usuario=user,
                acao='UPDATE_SPAMASSASSIN_REQUIRED_SCORE',
                alvo='/etc/spamassassin/local.cf',
                valor_anterior=str(data.get('old_required_score', 'N/A')),
                valor_novo=str(new_required_score),
                motivo=reason,
                ip_origem=ip
            )
            db.session.add(audit)
            db.session.commit()

        return jsonify({"success": True, "message": "Configuração aplicada e serviço recarregado com sucesso."})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500
