"""
Módulo Unificado de Análise, Normalização, Auditoria e Diagnóstico de Regras SpamAssassin.
Compatível com Python Flask (produção Linux) e TypeScript (Node.js/Bun).
"""
import re
import os
import subprocess
from typing import Dict, List, Any, Optional, Tuple

LOCAL_CF_PATH = "/etc/spamassassin/local.cf"
DANGEROUS_PATTERNS = {"*", "*@*", "*@*.*", "*.*", "@*", "@*.*"}
DANGEROUS_TLDS = {
    "com", "net", "org", "br", "gov.br", "edu.br", "com.br", "io", "info",
    "me", "xyz", "online", "site", "top", "club", "co", "us", "uk", "de", "ru", "cn", "boats"
}


def is_high_impact_pattern(pattern: str) -> Dict[str, Any]:
    """Verifica se o padrão digitado possui alto impacto ou escopo perigosamente abrangente."""
    p = pattern.strip().lower().replace("'", "").replace('"', "")
    if p in DANGEROUS_PATTERNS:
        return {
            "is_high_impact": True,
            "severity": "CRITICAL",
            "message": "⚠️ REGRA DE IMPACTO CRÍTICO: Este padrão afeta absolutamente 100% de todos os e-mails recebidos do mundo. É fortemente desaconselhado salvá-lo."
        }

    for tld in DANGEROUS_TLDS:
        if p in [f"*.{tld}", f"*@*.{tld}", f"@*.{tld}", f"*@*.*.{tld}", f".{tld}"]:
            return {
                "is_high_impact": True,
                "severity": "HIGH",
                "message": f"⚠️ REGRA DE ALTO IMPACTO: O padrão de terminação '.{tld}' abrange milhões de domínios. Certifique-se de que realmente deseja aplicar esta regra em nível de TLD."
            }

    return {"is_high_impact": False, "severity": "NONE", "message": ""}


def parse_rule_target(raw_target: str, action: str = "blacklist_from") -> Dict[str, Any]:
    """
    Analisa um alvo bruto (e-mail, domínio, subdomínio ou wildcard) e extrai representação canônica,
    tipo, escopo e interpretação técnica em português.
    """
    target = raw_target.strip()
    clean = target.lower().replace("'", "").replace('"', "")

    # Determina o tipo de padrão
    is_wildcard = False
    pattern_type = "DOMAIN"
    pattern_type_label = "Domínio Completo"
    scope = "DOMAIN_AND_SUBDOMAINS"
    scope_label = "Domínio e Subdomínios"
    domain = ""
    local_part = "*"
    canonical_pattern = ""
    normalized_value = ""

    # Caso 1: Wildcard avançado como *.boats ou *@*.boats ou *@*.*.boats
    if ("*" in clean and not clean.startswith("*@")) or clean.startswith("*@*") or clean.startswith("@*"):
        is_wildcard = True
        pattern_type = "WILDCARD"
        pattern_type_label = "Padrão Wildcard / TLD"
        scope = "WILDCARD_PATTERN"
        scope_label = "Padrão Curinga Multi-nível"
        
        # Extrai a base do wildcard
        clean_wild = re.sub(r'^\*?@?', '', clean)
        clean_wild = re.sub(r'^\*', '', clean_wild)
        clean_wild = clean_wild.lstrip('.')
        
        domain = clean_wild
        local_part = "*"
        
        if clean.startswith("*@*.*.") or clean.startswith("*.*."):
            canonical_pattern = f"WILDCARD:*.*.{domain}"
            normalized_value = f"*@*.*.{domain}"
        else:
            canonical_pattern = f"WILDCARD:*.{domain}"
            normalized_value = f"*@*.{domain}"

    # Caso 2: E-mail específico (ex: contato@suanotaemdia16.roxa.org)
    elif "@" in clean and not clean.startswith("@") and not clean.startswith("*@"):
        parts = clean.split("@", 1)
        local_part = parts[0]
        domain = parts[1]
        pattern_type = "EMAIL"
        pattern_type_label = "E-mail Específico"
        scope = "EXACT_EMAIL"
        scope_label = "E-mail Exato"
        canonical_pattern = f"EMAIL:{local_part}@{domain}"
        normalized_value = f"{local_part}@{domain}"

    # Caso 3: Domínio ou Subdomínio (ex: *@suanotaemdia16.roxa.org, @sensoebs.com, residuos3.com)
    else:
        dom = clean
        if dom.startswith("*@"):
            dom = dom[2:]
        elif dom.startswith("@"):
            dom = dom[1:]
        elif dom.startswith("*."):
            dom = dom[2:]
        
        dom = dom.strip().lstrip(".")
        domain = dom
        local_part = "*"
        
        # Se possuir 2 ou mais pontos e não for TLD comum de 2 níveis como .com.br, classifica como subdomínio
        is_subdomain = False
        parts = dom.split(".")
        if len(parts) >= 3 and not (len(parts) == 3 and parts[-2] in ["com", "org", "net", "gov", "edu", "ind"] and parts[-1] in ["br", "uk", "au", "nz"]):
            is_subdomain = True
            pattern_type = "SUBDOMAIN"
            pattern_type_label = "Subdomínio"
            scope = "SUBDOMAIN_ONLY"
            scope_label = "Somente este Subdomínio"
            canonical_pattern = f"SUBDOMAIN:{domain}"
        else:
            pattern_type = "DOMAIN"
            pattern_type_label = "Domínio Completo"
            scope = "DOMAIN_AND_SUBDOMAINS"
            scope_label = "Domínio e Subdomínios"
            canonical_pattern = f"DOMAIN:{domain}"

        normalized_value = f"*@{domain}"

    # Gera interpretação em linguagem clara
    action_verb = "Bloqueia e descarta" if action == "blacklist_from" else ("Isenta de checagens e libera" if action == "whitelist_from" else "Aplica +20 pontos de pontuação de SPAM em")
    
    if pattern_type == "EMAIL":
        interpretation = f"{action_verb} exclusivamente mensagens enviadas pelo e-mail exato <strong>{local_part}@{domain}</strong>."
    elif pattern_type == "SUBDOMAIN":
        interpretation = f"{action_verb} mensagens enviadas por qualquer caixa postal do subdomínio <strong>{domain}</strong>."
    elif pattern_type == "WILDCARD":
        interpretation = f"{action_verb} mensagens de remetentes sob o padrão curinga <strong>{normalized_value}</strong>."
    else:
        interpretation = f"{action_verb} mensagens de qualquer endereço sob o domínio <strong>@{domain}</strong> e seus subdomínios."

    impact = is_high_impact_pattern(clean)

    return {
        "original_target": raw_target,
        "clean_target": clean,
        "normalized_value": normalized_value,
        "canonical_pattern": canonical_pattern,
        "pattern_type": pattern_type,
        "pattern_type_label": pattern_type_label,
        "scope": scope,
        "scope_label": scope_label,
        "domain": domain,
        "local_part": local_part,
        "interpretation": interpretation,
        "is_high_impact": impact["is_high_impact"],
        "impact_severity": impact["severity"],
        "impact_message": impact["message"],
        "is_valid": bool(domain)
    }


def parse_single_line(line_str: str, index: int = 0) -> Optional[Dict[str, Any]]:
    """Analisa uma linha individual de local.cf e retorna sua estrutura detalhada."""
    raw = line_str.strip()
    if not raw:
        return None

    is_active = not raw.startswith("#")
    clean_line = raw.lstrip("#").strip()

    # Identifica tipo de diretiva
    directive = None
    action_type = "blacklist_from"
    action_label = "Bloquear (Blacklist)"
    score = 100.0

    if clean_line.startswith("blacklist_from"):
        directive = "blacklist_from"
        action_type = "blacklist_from"
        action_label = "Bloquear (Blacklist)"
        score = 100.0
    elif clean_line.startswith("whitelist_from"):
        directive = "whitelist_from"
        action_type = "whitelist_from"
        action_label = "Liberar (Whitelist)"
        score = -100.0
    elif clean_line.startswith("spam_from") or clean_line.startswith("score"):
        directive = "spam_from"
        action_type = "spam_from"
        action_label = "SPAM (+20 pts)"
        score = 20.0
    else:
        return None  # Não é regra visual de acesso/pontuação

    # Extrai o valor do alvo
    parts = clean_line.split(None, 1)
    if len(parts) < 2:
        return None

    raw_val = parts[1].strip()
    parsed_target = parse_rule_target(raw_val, action_type)

    return {
        "id": index + 1,
        "active": is_active,
        "type": action_type,
        "action": action_type,
        "action_label": action_label,
        "score": score,
        "value": parsed_target["normalized_value"] if parsed_target["normalized_value"] else raw_val,
        "raw_value": raw_val,
        "raw": raw,
        "clean_line": clean_line,
        "canonical_pattern": parsed_target["canonical_pattern"],
        "pattern_type": parsed_target["pattern_type"],
        "pattern_type_label": parsed_target["pattern_type_label"],
        "scope": parsed_target["scope"],
        "scope_label": parsed_target["scope_label"],
        "domain": parsed_target["domain"],
        "local_part": parsed_target["local_part"],
        "interpretation": parsed_target["interpretation"],
        "is_high_impact": parsed_target["is_high_impact"],
        "impact_severity": parsed_target["impact_severity"],
        "impact_message": parsed_target["impact_message"],
        "reason": "Regra ativa de segurança" if is_active else "Regra desativada",
        "origin": "manual"
    }


def parse_all_rules(cf_content: str) -> List[Dict[str, Any]]:
    """Lê todas as regras visuais de acesso do arquivo local.cf."""
    rules = []
    lines = cf_content.splitlines()
    for idx, line in enumerate(lines):
        parsed = parse_single_line(line, idx)
        if parsed:
            rules.append(parsed)
    return rules


def match_target_against_rule(test_target: str, rule: Dict[str, Any]) -> Tuple[bool, int, str]:
    """
    Testa se um endereço ou domínio de teste coincide com a regra especificada.
    Retorna: (is_match, specificity_score, diagnostic_detail)
    """
    target = test_target.strip().lower()
    if not target:
        return False, 0, ""

    # Extrai parte local e domínio do teste
    if "@" in target:
        test_local, test_domain = target.split("@", 1)
    else:
        test_local = ""
        test_domain = target

    rule_domain = (rule.get("domain") or "").lower()
    rule_local = (rule.get("local_part") or "*").lower()
    pattern_type = rule.get("pattern_type") or "DOMAIN"
    canonical = rule.get("canonical_pattern") or ""

    # 1. Regra de E-MAIL ESPECÍFICO (ex: contato@suanotaemdia16.roxa.org)
    if pattern_type == "EMAIL":
        if test_local and test_domain == rule_domain and test_local == rule_local:
            return True, 1000, f"Coincidência exata de e-mail com {rule_local}@{rule_domain}"
        return False, 0, ""

    # 2. Regra de SUBDOMÍNIO (ex: *@suanotaemdia16.roxa.org)
    if pattern_type == "SUBDOMAIN":
        if test_domain == rule_domain or test_domain.endswith("." + rule_domain):
            return True, 500, f"Coincidência com o subdomínio {rule_domain}"
        return False, 0, ""

    # 3. Regra de DOMÍNIO (ex: *@residuos3.com ou *@sensoebs.com)
    if pattern_type == "DOMAIN":
        if test_domain == rule_domain or test_domain.endswith("." + rule_domain):
            return True, 250, f"Coincidência com o domínio principal @{rule_domain} (e subdomínios)"
        return False, 0, ""

    # 4. Regra de WILDCARD (ex: *@*.boats ou *.boats)
    if pattern_type == "WILDCARD":
        # Se a regra for *.boats ou *@*.boats
        if canonical == f"WILDCARD:*.{rule_domain}":
            if test_domain.endswith("." + rule_domain) and test_domain != rule_domain:
                return True, 100, f"Coincidência com padrão curinga de TLD/Domínio *.({rule_domain})"
        elif canonical == f"WILDCARD:*.*.{rule_domain}":
            if test_domain.endswith("." + rule_domain) and test_domain.count(".") >= 2:
                return True, 120, f"Coincidência com padrão curinga multi-nível *.*.({rule_domain})"
        else:
            # Padrão genérico de regex simples
            clean_p = rule.get("value", "").replace("*", ".*").replace("@", "\\@")
            try:
                if re.search(clean_p, target, re.IGNORECASE):
                    return True, 100, f"Coincidência com padrão wildcard {rule.get('value')}"
            except Exception:
                pass
        return False, 0, ""

    return False, 0, ""


def evaluate_target_against_all_rules(test_target: str, rules: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Avalia um e-mail ou domínio contra todo o conjunto de regras ativas,
    aplicando estritamente a hierarquia de especificidade e precedência de Whitelist sobre Blacklist.
    """
    target = test_target.strip()
    if not target:
        return {
            "success": False,
            "message": "Nenhum e-mail ou domínio fornecido para teste.",
            "verdict": "NÃO LISTADO (COMPORTAMENTO PADRÃO / NEUTRO)",
            "score_impact": 0.0,
            "is_blacklisted": False,
            "is_whitelisted": False,
            "is_spam": False
        }

    active_rules = [r for r in rules if r.get("active", True)]
    matched_rules = []

    for rule in active_rules:
        is_match, specificity, detail = match_target_against_rule(target, rule)
        if is_match:
            matched_rules.append({
                "rule": rule,
                "specificity": specificity,
                "detail": detail,
                "action": rule.get("action", "blacklist_from"),
                "score": rule.get("score", 100.0)
            })

    if not matched_rules:
        diag = f"O endereço '{target}' não coincide com nenhuma regra ativa de Blacklist, Whitelist ou SPAM Score no local.cf. Ele segue a triagem padrão de reputação heurística."
        test_case_obj = {
            "email": target,
            "matched": False,
            "is_matched": False,
            "result": "NÃO LISTADO (COMPORTAMENTO PADRÃO / NEUTRO)",
            "verdict": "NÃO LISTADO (COMPORTAMENTO PADRÃO / NEUTRO)",
            "score_impact": 0.0,
            "points": 0.0,
            "matched_rule": None,
            "detail": diag
        }
        return {
            "success": True,
            "target": target,
            "verdict": "NÃO LISTADO (COMPORTAMENTO PADRÃO / NEUTRO)",
            "verdict_label": "Não Listado",
            "verdict_badge": "bg-secondary-subtle text-secondary border",
            "status": "neutral",
            "score_impact": 0.0,
            "points": 0.0,
            "score_display": "0 pts (Neutro)",
            "is_blacklisted": False,
            "is_blocked": False,
            "is_whitelisted": False,
            "is_spam": False,
            "matched_rule": None,
            "matched_rule_str": None,
            "matched_rules_count": 0,
            "diagnostic_message": diag,
            "test_cases": [test_case_obj],
            "results": [test_case_obj]
        }

    # Ordena matches: Maior especificidade primeiro. Em caso de empate, Whitelist prevalece (-100 pts)
    def sort_key(item):
        spec = item["specificity"]
        act_weight = 2 if item["action"] == "whitelist_from" else (1 if item["action"] == "blacklist_from" else 0)
        return (spec, act_weight)

    matched_rules.sort(key=sort_key, reverse=True)
    winning_match = matched_rules[0]
    win_rule = winning_match["rule"]
    win_action = winning_match["action"]

    win_rule_raw = win_rule.get("raw") or f"{win_rule.get('action')} {win_rule.get('value')}"

    if win_action == "blacklist_from":
        verdict = "BLOQUEADO NA BLACKLIST"
        verdict_label = "Bloqueado"
        verdict_badge = "bg-danger text-white shadow-xs"
        status = "blacklisted"
        score_impact = 100.0
        score_display = "+100 pts"
        is_blacklisted = True
        is_whitelisted = False
        is_spam = False
    elif win_action == "whitelist_from":
        verdict = "LIBERADO NA WHITE LIST"
        verdict_label = "Liberado"
        verdict_badge = "bg-success text-white shadow-xs"
        status = "whitelisted"
        score_impact = -100.0
        score_display = "-100 pts"
        is_blacklisted = False
        is_whitelisted = True
        is_spam = False
    else:
        verdict = "MARCADO COMO SPAM"
        verdict_label = "SPAM (+20)"
        verdict_badge = "bg-warning text-dark shadow-xs"
        status = "spam"
        score_impact = 20.0
        score_display = "+20 pts"
        is_blacklisted = False
        is_whitelisted = False
        is_spam = True

    diag_msg = f"O endereço coincide com a regra ativa '{win_rule_raw}'. Motivo: {winning_match['detail']}."

    test_case_obj = {
        "email": target,
        "matched": True,
        "is_matched": True,
        "result": verdict,
        "verdict": verdict,
        "score_impact": score_impact,
        "points": score_impact,
        "matched_rule": win_rule_raw,
        "detail": diag_msg
    }

    return {
        "success": True,
        "target": target,
        "verdict": verdict,
        "verdict_label": verdict_label,
        "verdict_badge": verdict_badge,
        "status": status,
        "score_impact": score_impact,
        "points": score_impact,
        "score_display": score_display,
        "is_blacklisted": is_blacklisted,
        "is_blocked": is_blacklisted,
        "is_whitelisted": is_whitelisted,
        "is_spam": is_spam,
        "matched_rule": win_rule,
        "matched_rule_str": win_rule_raw,
        "matched_rules_count": len(matched_rules),
        "precedence_rank": f"Especificidade {winning_match['specificity']} pts ({win_rule.get('pattern_type_label')})",
        "diagnostic_message": diag_msg,
        "test_cases": [test_case_obj],
        "results": [test_case_obj]
    }


def audit_rules_integrity(rules: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Executa auditoria completa de integridade:
    - Duplicatas exatas
    - Duplicatas normalizadas / equivalentes
    - Sobreposições e redundâncias semânticas
    - Conflitos diretos (Whitelist x Blacklist)
    - Contadores exatos
    """
    total_rules = len(rules)
    active_rules = len([r for r in rules if r.get("active", True)])
    blacklist_rules = len([r for r in rules if r.get("active", True) and r.get("action") == "blacklist_from"])
    whitelist_rules = len([r for r in rules if r.get("active", True) and r.get("action") == "whitelist_from"])
    spam_score_rules = len([r for r in rules if r.get("active", True) and r.get("action") == "spam_from"])

    duplicate_groups = []
    redundant_rules = []
    conflicts = []

    # Agrupa por (canonical_pattern, action)
    canonical_map: Dict[str, List[Dict[str, Any]]] = {}
    for r in rules:
        key = f"{r.get('action')}:{r.get('canonical_pattern')}"
        if key not in canonical_map:
            canonical_map[key] = []
        canonical_map[key].append(r)

    for key, group in canonical_map.items():
        if len(group) > 1:
            first = group[0]
            duplicate_groups.append({
                "canonical_pattern": first.get("canonical_pattern"),
                "normalized_target": first.get("value"),
                "action": first.get("action"),
                "action_label": first.get("action_label"),
                "count": len(group),
                "rules": [g.get("raw") or f"{g.get('action')} {g.get('value')}" for g in group],
                "recommended_rule": f"{first.get('action')} {first.get('value')}",
                "description": f"Existem {len(group)} regras equivalentes para o mesmo padrão canônico ({first.get('canonical_pattern')})."
            })

    # Detecta sobreposições (ex: *@spam.com cobre *@sub.spam.com ou *.boats cobre *@*.*.boats)
    for r1 in rules:
        if r1.get("pattern_type") == "DOMAIN":
            dom1 = r1.get("domain", "")
            for r2 in rules:
                if r1 == r2 or r1.get("action") != r2.get("action"):
                    continue
                dom2 = r2.get("domain", "")
                if r2.get("pattern_type") in ["SUBDOMAIN", "DOMAIN"] and dom2.endswith("." + dom1) and dom2 != dom1:
                    redundant_rules.append({
                        "broader_rule": r1.get("raw"),
                        "redundant_rule": r2.get("raw"),
                        "action": r1.get("action"),
                        "reason": f"A regra mais abrangente '{r1.get('raw')}' já cobre o subdomínio '{r2.get('raw')}'."
                    })
                elif r2.get("pattern_type") == "EMAIL" and dom2 == dom1:
                    redundant_rules.append({
                        "broader_rule": r1.get("raw"),
                        "redundant_rule": r2.get("raw"),
                        "action": r1.get("action"),
                        "reason": f"A regra de domínio '{r1.get('raw')}' já bloqueia/libera todo o domínio de '{r2.get('raw')}'."
                    })

    # Detecta conflitos (Whitelist x Blacklist sobre o mesmo padrão)
    domain_actions: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
    for r in rules:
        canon = r.get("canonical_pattern", "")
        act = r.get("action", "")
        if canon not in domain_actions:
            domain_actions[canon] = {"blacklist_from": [], "whitelist_from": []}
        if act in domain_actions[canon]:
            domain_actions[canon][act].append(r)

    for canon, acts in domain_actions.items():
        if acts["blacklist_from"] and acts["whitelist_from"]:
            conflicts.append({
                "canonical_pattern": canon,
                "target": canon,
                "blacklist_rule": acts["blacklist_from"][0].get("raw"),
                "whitelist_rule": acts["whitelist_from"][0].get("raw"),
                "rules": [r.get("raw") for r in acts["blacklist_from"] + acts["whitelist_from"]],
                "description": f"O padrão {canon} está cadastrado simultaneamente na Blacklist e na Whitelist."
            })

    unique_rules = total_rules - sum(len(g["rules"]) - 1 for g in duplicate_groups)
    duplicates_count = sum(len(g["rules"]) - 1 for g in duplicate_groups)
    redundant_count = len(redundant_rules)
    conflicts_count = len(conflicts)

    is_fully_optimized = (duplicates_count == 0 and redundant_count == 0 and conflicts_count == 0)

    return {
        "success": True,
        "is_fully_optimized": is_fully_optimized,
        "total_rules": total_rules,
        "unique_rules": max(0, unique_rules),
        "active_rules": active_rules,
        "blacklist_rules": blacklist_rules,
        "whitelist_rules": whitelist_rules,
        "spam_score_rules": spam_score_rules,
        "duplicates_count": duplicates_count,
        "duplicate_groups": duplicate_groups,
        "duplicates": duplicate_groups,
        "redundant_rules_count": redundant_count,
        "redundant_rules": redundant_rules,
        "conflicts_count": conflicts_count,
        "conflicts": conflicts,
        "status_badge": "100% Otimizado" if is_fully_optimized else f"{duplicates_count + conflicts_count + redundant_count} Ajustes Pendentes",
        "status_badge_class": "bg-success-subtle text-success border border-success-subtle" if is_fully_optimized else "bg-warning-subtle text-dark border border-warning-subtle",
        "audit_description": "Nenhuma regra duplicada ou em conflito detectada." if is_fully_optimized else f"{duplicates_count} duplicatas/equivalências, {redundant_count} sobreposições e {conflicts_count} conflitos detectados."
    }


def consolidate_and_clean_rules(cf_content: str) -> Tuple[str, int]:
    """
    Higieniza o conteúdo de local.cf:
    - Normaliza regras para padrão canônico (*@dominio.com)
    - Remove duplicatas exatas e normalizadas
    - Mantém seções não relacionadas intactas
    - Retorna novo conteúdo e quantidade de regras deduplicadas
    """
    lines = cf_content.splitlines()
    seen_keys = set()
    cleaned_lines = []
    deduplicated_count = 0

    for line in lines:
        raw = line.strip()
        if not raw or raw.startswith("#"):
            cleaned_lines.append(line)
            continue

        parsed = parse_single_line(raw)
        if not parsed:
            cleaned_lines.append(line)
            continue

        key = f"{parsed['action']}:{parsed['canonical_pattern']}"
        if key in seen_keys:
            deduplicated_count += 1
            continue

        seen_keys.add(key)
        # Salva linha formatada no padrão universal
        formatted_rule = f"{parsed['action']} {parsed['value']}"
        cleaned_lines.append(formatted_rule)

    new_content = "\n".join(cleaned_lines)
    if not new_content.endswith("\n"):
        new_content += "\n"

    return new_content, deduplicated_count
