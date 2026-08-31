# -*- coding: utf-8 -*-
"""
MailAdmin Server Security - AntiSpam Policy Engine
Módulo complementar ao SpamAssassin para inteligência de autenticação (SPF, DKIM, DMARC),
rDNS/PTR, HELO, reputação de IP, detecção de Impersonation e cálculo de Score Combinado.
"""

import os
import re
import socket
import datetime
import email
from email import policy
from email.parser import BytesParser, Parser
from typing import Dict, Any, List, Optional, Tuple

# Catálogo padrão de regras de inteligência com pesos e severidades
DEFAULT_POLICY_RULES = [
    # Autenticação SPF
    {
        "codigo": "SPF_PASS",
        "nome": "SPF Válido e Autorizado (Pass)",
        "categoria": "authentication",
        "descricao": "O IP do remetente está explicitamente autorizado no registro SPF do domínio remetente.",
        "score": -2.0,
        "severidade": "LOW",
        "ativo": True,
        "origem": "system"
    },
    {
        "codigo": "SPF_NONE",
        "nome": "SPF Ausente / Não Configurado",
        "categoria": "authentication",
        "descricao": "O domínio remetente não possui registro TXT com política SPF definida no DNS.",
        "score": 1.0,
        "severidade": "LOW",
        "ativo": True,
        "origem": "system"
    },
    {
        "codigo": "SPF_SOFTFAIL",
        "nome": "SPF SoftFail (~all)",
        "categoria": "authentication",
        "descricao": "O IP do remetente não está na lista autorizada, porém a política SPF do domínio define transição suave (~all).",
        "score": 2.0,
        "severidade": "MEDIUM",
        "ativo": True,
        "origem": "system"
    },
    {
        "codigo": "SPF_FAIL",
        "nome": "SPF Falha Estrita (-all)",
        "categoria": "authentication",
        "descricao": "O IP do remetente falhou categoricamente no teste SPF e a política do domínio é restritiva (-all).",
        "score": 4.0,
        "severidade": "HIGH",
        "ativo": True,
        "origem": "system"
    },

    # Autenticação DKIM
    {
        "codigo": "DKIM_PASS",
        "nome": "Assinatura Criptográfica DKIM Válida (Pass)",
        "categoria": "authentication",
        "descricao": "Mensagem possui assinatura DKIM íntegra correspondente à chave pública publicada no DNS.",
        "score": -2.0,
        "severidade": "LOW",
        "ativo": True,
        "origem": "system"
    },
    {
        "codigo": "DKIM_NONE",
        "nome": "Assinatura DKIM Ausente",
        "categoria": "authentication",
        "descricao": "A mensagem não possui cabeçalho DKIM-Signature assinado pelo remetente.",
        "score": 1.0,
        "severidade": "LOW",
        "ativo": True,
        "origem": "system"
    },
    {
        "codigo": "DKIM_FAIL",
        "nome": "Assinatura DKIM Inválida / Corrompida (Fail)",
        "categoria": "authentication",
        "descricao": "A assinatura criptográfica DKIM falhou na validação de integridade ou a chave do seletor é inválida.",
        "score": 3.0,
        "severidade": "HIGH",
        "ativo": True,
        "origem": "system"
    },

    # Alinhamento DMARC
    {
        "codigo": "DMARC_PASS",
        "nome": "Conformidade DMARC Válida (Pass)",
        "categoria": "authentication",
        "descricao": "Mensagem atende aos requisitos de alinhamento de domínio DMARC com SPF ou DKIM aprovados.",
        "score": -2.0,
        "severidade": "LOW",
        "ativo": True,
        "origem": "system"
    },
    {
        "codigo": "DMARC_NONE",
        "nome": "DMARC Ausente / Política p=none",
        "categoria": "authentication",
        "descricao": "Domínio remetente não publica política DMARC no _dmarc ou possui política neutra sem imposição (p=none).",
        "score": 2.0,
        "severidade": "MEDIUM",
        "ativo": True,
        "origem": "system"
    },
    {
        "codigo": "DMARC_FAIL",
        "nome": "Violação DMARC (Fail)",
        "categoria": "authentication",
        "descricao": "Mensagem violou o alinhamento DMARC e falhou em ambos os mecanismos de autenticação (SPF e DKIM).",
        "score": 4.0,
        "severidade": "CRITICAL",
        "ativo": True,
        "origem": "system"
    },

    # rDNS / PTR / FCrDNS / HELO
    {
        "codigo": "PTR_MISSING",
        "nome": "rDNS / Registro PTR Inexistente",
        "categoria": "rdns",
        "descricao": "O IP do servidor de envio não possui ponteiro reverso (PTR) configurado no DNS da autoridade de rede.",
        "score": 2.0,
        "severidade": "MEDIUM",
        "ativo": True,
        "origem": "system"
    },
    {
        "codigo": "PTR_FORWARD_FAIL",
        "nome": "Falha no FCrDNS (Forward-Confirmed rDNS)",
        "categoria": "rdns",
        "descricao": "O nome apontado pelo PTR não resolve de volta para o IP de origem (Inconsistência de resolução reversa).",
        "score": 2.0,
        "severidade": "MEDIUM",
        "ativo": True,
        "origem": "system"
    },
    {
        "codigo": "HELO_PTR_MISMATCH",
        "nome": "Inconsistência entre HELO/EHLO e PTR",
        "categoria": "rdns",
        "descricao": "O hostname declarado no comando SMTP HELO/EHLO diverge do nome do host configurado no PTR reverso.",
        "score": 1.0,
        "severidade": "LOW",
        "ativo": True,
        "origem": "system"
    },
    {
        "codigo": "HELO_NO_RESOLVE",
        "nome": "HELO/EHLO Não Resolvível no DNS",
        "categoria": "rdns",
        "descricao": "O hostname informado no HELO/EHLO não possui registro A ou AAAA válido na internet.",
        "score": 3.0,
        "severidade": "HIGH",
        "ativo": True,
        "origem": "system"
    },
    {
        "codigo": "PTR_DYNAMIC",
        "nome": "PTR com Padrão de Banda Larga / IP Dinâmico",
        "categoria": "rdns",
        "descricao": "O hostname reverso contém padrões típicos de conexões residenciais (ex: dsl, dialup, pool, dynamic, rev-ip).",
        "score": 2.0,
        "severidade": "MEDIUM",
        "ativo": True,
        "origem": "system"
    },
    {
        "codigo": "IP_DYNAMIC",
        "nome": "Origem em Faixa Residencial / Dinâmica de Alto Risco",
        "categoria": "rdns",
        "descricao": "Conexão direta originada em bloco de IP não empresarial / residencial frequentemente abusado por botnets.",
        "score": 4.0,
        "severidade": "HIGH",
        "ativo": True,
        "origem": "system"
    },

    # Identidade e Impersonation (Spoofing / Phishing)
    {
        "codigo": "HEADER_FROM_MISMATCH",
        "nome": "Divergência entre Header From e Envelope From",
        "categoria": "identity",
        "descricao": "O endereço exibido no campo 'De:' (Header From) é de um domínio diferente do envelope SMTP (Return-Path).",
        "score": 2.0,
        "severidade": "MEDIUM",
        "ativo": True,
        "origem": "system"
    },
    {
        "codigo": "IMP_FROM_DMARC_FAIL",
        "nome": "Falha DMARC com Identidade Forjada (Impersonation)",
        "categoria": "impersonation",
        "descricao": "Tentativa de envio utilizando cabeçalho From forjado sem autenticação válida em domínio protegido.",
        "score": 3.0,
        "severidade": "HIGH",
        "ativo": True,
        "origem": "system"
    },
    {
        "codigo": "MARCA_CONHECIDA_DMARC_FAIL",
        "nome": "Impersonation Crítico de Marca / Instituição Financeira",
        "categoria": "impersonation",
        "descricao": "Uso não autorizado de marca protegida (Bancos, Governo, Serviços de Pagamento) com falha em DMARC/SPF.",
        "score": 5.0,
        "severidade": "CRITICAL",
        "ativo": True,
        "origem": "system"
    }
]

# Catálogo padrão de marcas e domínios protegidos
DEFAULT_IMPERSONATION_PROFILES = [
    {
        "brand_name": "Caixa Econômica Federal",
        "official_domains": "caixa.gov.br,cef.gov.br",
        "category": "finance",
        "severity": "CRITICAL"
    },
    {
        "brand_name": "Banco do Brasil",
        "official_domains": "bb.com.br,bancodobrasil.com.br",
        "category": "finance",
        "severity": "CRITICAL"
    },
    {
        "brand_name": "Itaú Unibanco",
        "official_domains": "itau.com.br,itau-unibanco.com.br",
        "category": "finance",
        "severity": "CRITICAL"
    },
    {
        "brand_name": "Banco Bradesco",
        "official_domains": "bradesco.com.br,bancobradesco.com.br",
        "category": "finance",
        "severity": "CRITICAL"
    },
    {
        "brand_name": "Nubank",
        "official_domains": "nubank.com.br,nu.com.br",
        "category": "finance",
        "severity": "CRITICAL"
    },
    {
        "brand_name": "Receita Federal / Gov.br",
        "official_domains": "gov.br,receita.fazenda.gov.br",
        "category": "gov",
        "severity": "CRITICAL"
    },
    {
        "brand_name": "Correios",
        "official_domains": "correios.com.br",
        "category": "gov",
        "severity": "HIGH"
    },
    {
        "brand_name": "Serasa Experian",
        "official_domains": "serasa.com.br,serasaexperian.com.br",
        "category": "finance",
        "severity": "HIGH"
    },
    {
        "brand_name": "Mercado Livre",
        "official_domains": "mercadolivre.com.br,mercadolibre.com",
        "category": "retail",
        "severity": "HIGH"
    },
    {
        "brand_name": "Microsoft / Office 365",
        "official_domains": "microsoft.com,office.com,outlook.com,live.com",
        "category": "tech",
        "severity": "HIGH"
    },
    {
        "brand_name": "Google Workspace / Gmail",
        "official_domains": "google.com,gmail.com",
        "category": "tech",
        "severity": "HIGH"
    },
    {
        "brand_name": "Apple / iCloud",
        "official_domains": "apple.com,icloud.com",
        "category": "tech",
        "severity": "HIGH"
    },
    {
        "brand_name": "Netflix",
        "official_domains": "netflix.com",
        "category": "retail",
        "severity": "HIGH"
    }
]

# Configurações padrão e limiares
DEFAULT_SETTINGS = {
    "score_spam_threshold": "4.5",       # Score a partir do qual é classificado como SPAM
    "score_high_risk_threshold": "8.0",   # Score a partir do qual é Alto Risco
    "score_critical_threshold": "10.0",   # Score a partir do qual é Crítico
    "enable_fcr_dns": "true",             # Validação Forward-Confirmed rDNS
    "enable_impersonation_check": "true", # Checagem de marcas e domínios protegidos
    "enable_helo_validation": "true",     # Validação de conformidade HELO/EHLO
    "auto_sync_localcf": "false"          # Sincronização automática para local.cf (exige confirmação)
}

DYNAMIC_IP_PATTERNS = [
    r'dynamic', r'dialup', r'dial-in', r'dsl', r'adsl', r'dhcp', r'pool', r'broadband',
    r'cable', r'user', r'res\.', r'residential', r'client', r'home', r'node', r'ppp',
    r'\d+-\d+-\d+-\d+', r'\d+\.\d+\.\d+\.\d+'
]


def detect_real_spamassassin_settings() -> Dict[str, Any]:
    """
    Detecta a configuração real em disco dos arquivos do SpamAssassin e Amavis.
    Não altera nada automaticamente.
    """
    local_cf_path = "/etc/spamassassin/local.cf"
    amavis_conf_paths = [
        "/etc/amavis/conf.d/20-debian_defaults",
        "/etc/amavis/conf.d/50-user",
        "/etc/amavisd/amavisd.conf"
    ]

    detected = {
        "required_score": 4.5,
        "required_score_source": "default",
        "sa_tag_level_deflt": 2.0,
        "sa_tag2_level_deflt": 4.5,
        "sa_kill_level_deflt": 6.9,
        "sa_spam_subject_tag": "***SPAM*** ",
        "amavis_source": "default",
        "files_found": []
    }

    # 1. Leitura de /etc/spamassassin/local.cf
    if os.path.exists(local_cf_path):
        detected["files_found"].append(local_cf_path)
        try:
            with open(local_cf_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                # Procura 'required_score X.X' ou 'required_hits X.X'
                m = re.search(r'^\s*required_(?:score|hits)\s+([\d\.]+)', content, re.MULTILINE | re.IGNORECASE)
                if m:
                    detected["required_score"] = float(m.group(1))
                    detected["required_score_source"] = local_cf_path
        except Exception:
            pass

    # 2. Leitura dos arquivos do Amavis
    for apath in amavis_conf_paths:
        if os.path.exists(apath):
            detected["files_found"].append(apath)
            try:
                with open(apath, "r", encoding="utf-8", errors="ignore") as f:
                    acontent = f.read()
                    tag_m = re.search(r'\$sa_tag_level_deflt\s*=\s*([\d\.\-]+);', acontent)
                    tag2_m = re.search(r'\$sa_tag2_level_deflt\s*=\s*([\d\.]+);', acontent)
                    kill_m = re.search(r'\$sa_kill_level_deflt\s*=\s*([\d\.]+);', acontent)
                    subj_m = re.search(r'\$sa_spam_subject_tag\s*=\s*[\'\"](.*?)[\'\"];', acontent)

                    if tag_m:
                        detected["sa_tag_level_deflt"] = float(tag_m.group(1))
                    if tag2_m:
                        detected["sa_tag2_level_deflt"] = float(tag2_m.group(1))
                        detected["amavis_source"] = apath
                    if kill_m:
                        detected["sa_kill_level_deflt"] = float(kill_m.group(1))
                    if subj_m:
                        detected["sa_spam_subject_tag"] = subj_m.group(1)
            except Exception:
                pass

    return detected


def generate_config_diff(file_type: str, current_vals: Dict[str, Any], proposed_vals: Dict[str, Any]) -> Dict[str, Any]:
    """Gera visualização de diferenças e cálculo de impacto antes de qualquer modificação em arquivos do sistema."""
    diff_items = []
    impact_descriptions = []

    if file_type == "spamassassin":
        old_rs = float(current_vals.get("required_score", 4.5))
        new_rs = float(proposed_vals.get("required_score", old_rs))
        if old_rs != new_rs:
            diff_items.append({
                "param": "required_score",
                "old_val": f"{old_rs}",
                "new_val": f"{new_rs}",
                "file": "/etc/spamassassin/local.cf"
            })
            if new_rs < old_rs:
                impact_descriptions.append(f"A redução do required_score de {old_rs} para {new_rs} tornará a filtragem mais rigorosa. Mensagens com menor pontuação de SPAM serão marcadas como suspeitas.")
            else:
                impact_descriptions.append(f"O aumento do required_score de {old_rs} para {new_rs} tornará a filtragem mais tolerante.")

    elif file_type == "amavis":
        for k in ["sa_tag_level_deflt", "sa_tag2_level_deflt", "sa_kill_level_deflt"]:
            old_v = float(current_vals.get(k, 0))
            new_v = float(proposed_vals.get(k, old_v))
            if old_v != new_v:
                diff_items.append({
                    "param": f"${k}",
                    "old_val": f"{old_v}",
                    "new_val": f"{new_v}",
                    "file": "/etc/amavis/conf.d/50-user"
                })
                impact_descriptions.append(f"Alteração de ${k} de {old_v} para {new_v} reconfigura os gatilhos de cabeçalho, marcação no assunto e quarentena do Amavis.")

    return {
        "has_changes": len(diff_items) > 0,
        "diff_items": diff_items,
        "impact_descriptions": impact_descriptions,
        "requires_restart": True,
        "services_affected": ["spamassassin", "amavis"] if file_type == "amavis" else ["spamassassin"]
    }


def analyze_rdns_ptr(client_ip: str, helo_hostname: str = "") -> Dict[str, Any]:
    """
    Executa análise avançada de rDNS / PTR / FCrDNS / HELO.
    Retorna status de conformidade, FCrDNS e evidências.
    """
    if not client_ip:
        return {
            "has_ptr": False,
            "ptr_hostname": "",
            "fcrdns_valid": False,
            "helo_matches_ptr": False,
            "is_dynamic": False,
            "details": "Nenhum IP de conexão informado."
        }

    ptr_hostname = ""
    has_ptr = False
    fcrdns_valid = False
    helo_matches = False
    is_dynamic = False

    try:
        # 1. Reverse DNS Lookup (PTR)
        host, _, _ = socket.gethostbyaddr(client_ip)
        ptr_hostname = host.lower()
        has_ptr = True
    except Exception:
        has_ptr = False
        ptr_hostname = ""

    # 2. Forward DNS Lookup do PTR (FCrDNS)
    if has_ptr and ptr_hostname:
        try:
            forward_ips = socket.gethostbyname_ex(ptr_hostname)[2]
            if client_ip in forward_ips:
                fcrdns_valid = True
        except Exception:
            fcrdns_valid = False

    # 3. HELO vs PTR Match
    if helo_hostname and ptr_hostname:
        clean_helo = helo_hostname.strip().lower()
        if clean_helo == ptr_hostname or clean_helo.endswith(f".{ptr_hostname}") or ptr_hostname.endswith(f".{clean_helo}"):
            helo_matches = True

    # 4. Detecção de padrão dinâmico / residencial
    test_str = (ptr_hostname + " " + client_ip).lower()
    for pat in DYNAMIC_IP_PATTERNS:
        if re.search(pat, test_str):
            is_dynamic = True
            break

    return {
        "client_ip": client_ip,
        "has_ptr": has_ptr,
        "ptr_hostname": ptr_hostname,
        "fcrdns_valid": fcrdns_valid,
        "helo_matches_ptr": helo_matches,
        "is_dynamic": is_dynamic,
        "details": f"PTR: {ptr_hostname or 'Nenhum'}. FCrDNS: {'Válido' if fcrdns_valid else 'Falha'}. Dinâmico: {'Sim' if is_dynamic else 'Não'}."
    }


def check_impersonation(from_header: str, envelope_from: str, spf_status: str, dkim_status: str, dmarc_status: str, profiles: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Avalia risco de Impersonation (Spoofing de marcas e domínios conhecidos).
    """
    from_header = (from_header or "").lower()
    envelope_from = (envelope_from or "").lower()
    spf_status = (spf_status or "NONE").upper()
    dkim_status = (dkim_status or "NONE").upper()
    dmarc_status = (dmarc_status or "NONE").upper()

    matched_brand = None
    target_domain = ""

    # Extrai domínio do From
    if "@" in from_header:
        target_domain = from_header.split("@")[-1].replace(">", "").strip()

    if not target_domain:
        return {
            "is_impersonation": False,
            "brand_name": "",
            "confidence": "LOW",
            "reason": ""
        }

    for prof in profiles:
        official_domains = prof.get("official_domains", [])
        if isinstance(official_domains, str):
            official_domains = [d.strip().lower() for d in official_domains.split(",") if d.strip()]

        for dom in official_domains:
            if target_domain == dom or target_domain.endswith(f".{dom}"):
                matched_brand = prof
                break
        if matched_brand:
            break

    if not matched_brand:
        return {
            "is_impersonation": False,
            "brand_name": "",
            "confidence": "LOW",
            "reason": "Domínio remetente não listado no catálogo de proteção de marcas."
        }

    # Se a marca foi detectada e DMARC falhou ou SPF/DKIM falharam
    auth_failed = (dmarc_status in ["FAIL", "NONE"]) and (spf_status in ["FAIL", "SOFTFAIL", "NONE"] or dkim_status in ["FAIL", "NONE"])
    
    if auth_failed:
        confidence = "HIGH" if (dmarc_status == "FAIL" or spf_status == "FAIL") else "MEDIUM"
        return {
            "is_impersonation": True,
            "brand_name": matched_brand.get("brand_name", "Marca Conhecida"),
            "target_domain": target_domain,
            "confidence": confidence,
            "reason": f"Tentativa de impersonation de '{matched_brand.get('brand_name')}' (@{target_domain}). Falha na autenticação (DMARC: {dmarc_status}, SPF: {spf_status}, DKIM: {dkim_status})."
        }

    return {
        "is_impersonation": False,
        "brand_name": matched_brand.get("brand_name", ""),
        "target_domain": target_domain,
        "confidence": "HIGH",
        "reason": f"Remetente legítimo autenticado para a marca '{matched_brand.get('brand_name')}'."
    }


def parse_and_evaluate_simulation(
    raw_eml_content: str = "",
    params: Dict[str, Any] = None,
    active_rules: List[Dict[str, Any]] = None,
    settings: Dict[str, Any] = None,
    impersonation_profiles: List[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Motor central de Simulação e Diagnóstico (100% Read-Only).
    Nunca altera nem rejeita mensagens no sistema.
    Calcula: SpamAssassin Score + MailAdmin Intelligence Score = Final Score.
    """
    if params is None:
        params = {}
    if active_rules is None:
        active_rules = DEFAULT_POLICY_RULES
    if settings is None:
        settings = DEFAULT_SETTINGS
    if impersonation_profiles is None:
        impersonation_profiles = DEFAULT_IMPERSONATION_PROFILES

    # Thresholds
    spam_threshold = float(settings.get("score_spam_threshold", 4.5))
    high_risk_threshold = float(settings.get("score_high_risk_threshold", 8.0))
    critical_threshold = float(settings.get("score_critical_threshold", 10.0))

    # Variáveis extraídas
    sender_from = params.get("sender_from") or params.get("from") or ""
    envelope_from = params.get("envelope_from") or params.get("return_path") or sender_from
    envelope_to = params.get("envelope_to") or params.get("to") or ""
    client_ip = params.get("client_ip") or params.get("ip") or "127.0.0.1"
    helo = params.get("helo") or ""
    message_id = params.get("message_id") or ""
    queue_id = params.get("queue_id") or ""
    sa_score = float(params.get("sa_score") or params.get("spamassassin_score") or 0.0)
    spf_status = (params.get("spf_status") or "NONE").upper()
    dkim_status = (params.get("dkim_status") or "NONE").upper()
    dmarc_status = (params.get("dmarc_status") or "NONE").upper()

    # Se foi fornecido arquivo EML, faz o parsing dos headers
    if raw_eml_content:
        try:
            msg = Parser(policy=policy.default).parsestr(raw_eml_content)
            sender_from = msg.get("From", sender_from)
            envelope_to = msg.get("To", envelope_to)
            message_id = msg.get("Message-ID", message_id)
            return_path = msg.get("Return-Path", "")
            if return_path:
                envelope_from = return_path.replace("<", "").replace(">", "").strip()

            # Extração de cabeçalhos de autenticação
            auth_results = msg.get("Authentication-Results", "")
            if auth_results:
                if "spf=pass" in auth_results.lower():
                    spf_status = "PASS"
                elif "spf=fail" in auth_results.lower():
                    spf_status = "FAIL"
                elif "spf=softfail" in auth_results.lower():
                    spf_status = "SOFTFAIL"

                if "dkim=pass" in auth_results.lower():
                    dkim_status = "PASS"
                elif "dkim=fail" in auth_results.lower():
                    dkim_status = "FAIL"

                if "dmarc=pass" in auth_results.lower():
                    dmarc_status = "PASS"
                elif "dmarc=fail" in auth_results.lower():
                    dmarc_status = "FAIL"

            # Extração de SpamAssassin Score de cabeçalhos
            sa_header = msg.get("X-Spam-Status", "") or msg.get("X-Spam-Score", "")
            if sa_header:
                m_score = re.search(r'score=([\d\.\-]+)', sa_header, re.IGNORECASE)
                if m_score:
                    sa_score = float(m_score.group(1))
                else:
                    m_num = re.search(r'^([\d\.\-]+)', sa_header.strip())
                    if m_num:
                        sa_score = float(m_num.group(1))

            # Extração de Received IP
            received_headers = msg.get_all("Received", [])
            if received_headers:
                first_recv = received_headers[-1]
                ip_match = re.search(r'\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]', first_recv)
                if ip_match:
                    client_ip = ip_match.group(1)
                helo_match = re.search(r'from\s+([^\s\(\)]+)', first_recv)
                if helo_match:
                    helo = helo_match.group(1)
        except Exception:
            pass

    # Análise de rDNS / PTR
    rdns_res = analyze_rdns_ptr(client_ip, helo)
    ptr = rdns_res.get("ptr_hostname", "")

    # Checagem de Impersonation
    imp_res = check_impersonation(sender_from, envelope_from, spf_status, dkim_status, dmarc_status, impersonation_profiles)

    # Avaliação das Regras do Policy Engine
    rule_map = {r["codigo"]: r for r in active_rules if r.get("ativo", True)}
    triggered_rules = []
    intelligence_score = 0.0

    def trigger(rule_code: str, evidence_text: str):
        nonlocal intelligence_score
        if rule_code in rule_map:
            rule_obj = rule_map[rule_code]
            r_score = float(rule_obj.get("score", 0.0))
            intelligence_score += r_score
            triggered_rules.append({
                "rule_id": rule_obj.get("id"),
                "rule_code": rule_code,
                "rule_name": rule_obj.get("nome", rule_code),
                "category": rule_obj.get("categoria", "general"),
                "score_applied": r_score,
                "severity": rule_obj.get("severidade", "MEDIUM"),
                "evidence": evidence_text
            })

    # 1. Avalia SPF
    if spf_status == "PASS":
        trigger("SPF_PASS", f"SPF autorizado com sucesso para o IP {client_ip}.")
    elif spf_status == "SOFTFAIL":
        trigger("SPF_SOFTFAIL", f"SPF retornou SoftFail (~all) para o IP {client_ip}.")
    elif spf_status == "FAIL":
        trigger("SPF_FAIL", f"SPF falhou categoricamente (-all) para o IP {client_ip}.")
    elif spf_status in ["NONE", "NEUTRAL"]:
        trigger("SPF_NONE", f"Registro SPF ausente ou neutro para o domínio remetente.")

    # 2. Avalia DKIM
    if dkim_status == "PASS":
        trigger("DKIM_PASS", "Assinatura criptográfica DKIM íntegra e validada.")
    elif dkim_status == "FAIL":
        trigger("DKIM_FAIL", "Assinatura DKIM inválida ou corrompida na transmissão.")
    elif dkim_status == "NONE":
        trigger("DKIM_NONE", "Mensagem enviada sem cabeçalho assinado por chave DKIM.")

    # 3. Avalia DMARC
    if dmarc_status == "PASS":
        trigger("DMARC_PASS", "Em total conformidade com a política DMARC do domínio.")
    elif dmarc_status == "FAIL":
        trigger("DMARC_FAIL", "Falha de conformidade e alinhamento de política DMARC.")
    elif dmarc_status == "NONE":
        trigger("DMARC_NONE", "Domínio não publica registro DMARC ou opera em modo p=none.")

    # 4. Avalia rDNS / PTR / HELO
    if not rdns_res["has_ptr"]:
        trigger("PTR_MISSING", f"IP de envio {client_ip} não possui registro PTR (reverso) no DNS.")
    elif not rdns_res["fcrdns_valid"]:
        trigger("PTR_FORWARD_FAIL", f"O PTR '{ptr}' não resolve de volta para o IP {client_ip} (Inconsistência FCrDNS).")

    if helo and ptr and not rdns_res["helo_matches_ptr"]:
        trigger("HELO_PTR_MISMATCH", f"HELO declarado '{helo}' diverge do PTR reverso '{ptr}'.")

    if rdns_res["is_dynamic"]:
        trigger("PTR_DYNAMIC", f"Nome reverso '{ptr}' apresenta padrão de IP residencial/dinâmico.")

    # 5. Avalia Divergência de Identidade (From vs Envelope From)
    if sender_from and envelope_from:
        s_domain = sender_from.split("@")[-1].replace(">", "").strip().lower()
        e_domain = envelope_from.split("@")[-1].replace(">", "").strip().lower()
        if s_domain and e_domain and s_domain != e_domain:
            trigger("HEADER_FROM_MISMATCH", f"Cabeçalho 'De:' (@{s_domain}) difere do Envelope Return-Path (@{e_domain}).")

    # 6. Avalia Impersonation
    if imp_res["is_impersonation"]:
        if imp_res.get("target_domain"):
            trigger("MARCA_CONHECIDA_DMARC_FAIL", imp_res["reason"])
        else:
            trigger("IMP_FROM_DMARC_FAIL", imp_res["reason"])

    # Pontuação Final Consolidada
    intelligence_score = round(intelligence_score, 3)
    final_score = round(sa_score + intelligence_score, 3)

    # Classificação
    if imp_res["is_impersonation"]:
        classification = "POSSIBLE_IMPERSONATION"
        confidence_level = imp_res.get("confidence", "HIGH")
    elif final_score >= critical_threshold:
        classification = "CRITICAL"
        confidence_level = "HIGH"
    elif final_score >= high_risk_threshold:
        classification = "HIGH_RISK"
        confidence_level = "HIGH"
    elif final_score >= spam_threshold:
        classification = "SPAM"
        confidence_level = "MEDIUM"
    else:
        classification = "CLEAN"
        confidence_level = "HIGH"

    return {
        "success": True,
        "message_id": message_id,
        "queue_id": queue_id,
        "sender_from": sender_from,
        "envelope_from": envelope_from,
        "envelope_to": envelope_to,
        "client_ip": client_ip,
        "ptr": ptr,
        "helo": helo,
        "spf_status": spf_status,
        "dkim_status": dkim_status,
        "dmarc_status": dmarc_status,
        "sa_score": sa_score,
        "intelligence_score": intelligence_score,
        "final_score": final_score,
        "thresholds": {
            "spam": spam_threshold,
            "high_risk": high_risk_threshold,
            "critical": critical_threshold
        },
        "classification": classification,
        "confidence_level": confidence_level,
        "impersonation": imp_res,
        "rdns_analysis": rdns_res,
        "triggered_rules": triggered_rules,
        "triggered_rules_count": len(triggered_rules),
        "explanation": f"SpamAssassin ({sa_score:+.3f}) + Intelligence ({intelligence_score:+.3f}) = Score Final {final_score:+.3f}. Classificação: {classification}."
    }
