#!/usr/bin/env python3
"""
MailAdmin Suite - Testador Automatizado do Motor de Inteligência Antispam ZRTI
Verificação do Caso de Teste PROCON (Regressão Crítica) e Decomposição de Score.

Uso:
  python3 scripts/test_policy_engine.py
"""

import sys
import os
import json

# Inclui diretório raiz
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from policy_engine import simulate_policy_evaluation, DEFAULT_POLICY_RULES


def run_procon_test():
    print("=" * 75)
    print("🧪 ZRTI MailAdmin - Bateria de Testes Automatizados do Motor Antispam")
    print("📋 Cenário: Phishing PROCON com Domínio Hexadecimal & Subdomínio de Remetente")
    print("=" * 75)

    # Payload exato do caso de regressão PROCON
    payload = {
        "from": "juliapereira@2f1ab419.apriori.net.br",
        "subject": "PROCON: Notificação Urgente — Pendência Consumidor",
        "reply_to": "notificacao@2f1ab419.apriori.net.br",
        "body": "Prezado cliente, informamos que consta uma pendência urgente do PROCON referente ao seu CPF/CNPJ. Ação necessária imediata para evitar processo administrativo. Acesse: https://2f1ab419.apriori.net.br/procon/notificacao",
        "client_ip": "185.220.101.5",
        "helo": "mail.2f1ab419.apriori.net.br",
        "ptr": "mail.2f1ab419.apriori.net.br",
        "spf_status": "pass",
        "dkim_status": "pass",
        "dmarc_status": "pass",
        "headers": {
            "X-Spam-Check-By": "VALIDITY_CERTIFIED, VALIDITY_SAFE",
            "Message-ID": "<20260909120000.2f1ab419@apriori.net.br>"
        }
    }

    print(f"\n📧 Remetente: {payload['from']}")
    print(f"📌 Assunto:   {payload['subject']}")
    print(f"🔗 Reply-To:  {payload['reply_to']}")
    print(f"🔒 SPF/DKIM:  {payload['spf_status'].upper()} / {payload['dkim_status'].upper()} (Conformidade técnica)")
    print(f"🌐 Reputação: VALIDITY_CERTIFIED, VALIDITY_SAFE presentes no cabeçalho")
    print("-" * 75)

    result = simulate_policy_evaluation(payload)

    score_breakdown = result.get("score_breakdown", {})
    headers = result.get("headers", {})
    audit_records = result.get("audit_records", []) or result.get("audit", {}).get("records", [])
    rules_triggered = result.get("triggered_rules", []) or result.get("rules_triggered", [])

    print("\n📊 DECOMPOSIÇÃO DE SCORES ZRTI:")
    print(f"   1. Score SpamAssassin Base:   {score_breakdown.get('sa_base_score', 0.0):+.1f} pts")
    print(f"   2. Score de Autenticação:     {score_breakdown.get('auth_score', 0.0):+.1f} pts  (SPF/DKIM/DMARC)")
    print(f"   3. Score de Reputação Externa:{score_breakdown.get('reputation_score', 0.0):+.1f} pts  (VALIDITY_CERTIFIED/SAFE zerados)")
    print(f"   4. Inteligência Local ZRTI:   {score_breakdown.get('local_intelligence_score', 0.0):+.1f} pts  (Heurística / Subdomínios)")
    print(f"   -----------------------------------------------------")
    print(f"   🎯 SCORE FINAL TOTAL:         {result.get('final_score', 0.0):+.1f} pts  (Threshold = 5.0)")
    print(f"   🛑 DECISÃO ZRTI:              {result.get('decision')}  ({result.get('classification')})")

    print("\n🧠 REGRAS ACIONADAS NO MOTOR:")
    for r in rules_triggered:
        code = r.get('rule_code') or r.get('rule_id') or r.get('name')
        pts = r.get('score_applied', 0)
        desc = r.get('evidence') or r.get('matched_value') or ''
        print(f"   • [{code}] Score: {pts:+.1f} pts | Evidência: \"{desc}\"")

    print("\n🏷️ CABEÇALHOS X-ZRTI INJETADOS:")
    for k, v in headers.items():
        print(f"   {k}: {v}")

    print(f"\n📝 REGISTROS DE AUDITORIA ({len(audit_records)} eventos gerados):")
    for rec in audit_records:
        print(f"   [{rec.get('timestamp')}] {rec.get('rule_id')} -> {rec.get('matched_value')} (Score: {rec.get('score_applied'):+.1f})")

    # Asserções de Validação de Regressão
    print("\n" + "=" * 75)
    print("🔍 VERIFICAÇÃO DE ASSERTIVIDADE (Critérios Críticos de Aceite):")
    
    # 1. Reputação externa não concede bônus negativo
    assert score_breakdown.get("reputation_score", 0.0) >= 0.0, "FALHA: Reputação externa concedeu score negativo!"
    print("   ✅ [1/5] Reputação externa (VALIDITY_CERTIFIED/SAFE) não imunizou a mensagem.")

    # 2. Autenticação válida não concede imunidade
    assert score_breakdown.get("auth_score", 0.0) >= 0.0, "FALHA: SPF/DKIM concederam imunidade!"
    print("   ✅ [2/5] Autenticação técnica (SPF/DKIM/DMARC) não concedeu imunidade indevida.")

    # 3. Inteligência Local detectou anomalias
    assert score_breakdown.get("local_intelligence_score", 0.0) >= 10.0, "FALHA: Inteligência local não pontuou adequadamente!"
    print(f"   ✅ [3/5] Inteligência Local ZRTI pontuou com firmeza (+{score_breakdown.get('local_intelligence_score', 0.0)} pts).")

    # 4. Decisão é de Rejeição / Bloqueio
    assert result.get("final_score", 0.0) >= 15.0, "FALHA: Score final menor que 15.0 para phishing grave!"
    assert result.get("decision") == "REJECT", f"FALHA: Decisão esperada REJECT, obtido {result.get('decision')}"
    print(f"   ✅ [4/5] Decisão final: REJECT com Score {result.get('final_score', 0.0)} >= 15.0.")

    # 5. Cabeçalhos obrigatórios presentes
    mandatory_headers = ["X-ZRTI-Spam-Score", "X-ZRTI-Spam-Decision", "X-ZRTI-Spam-Rules", "X-ZRTI-Engine-Version", "X-ZRTI-Rule-Version"]
    for mh in mandatory_headers:
        assert mh in headers, f"FALHA: Cabeçalho obrigatório {mh} não gerado!"
    print(f"   ✅ [5/5] Todos os 5 cabeçalhos mandatados X-ZRTI-* gerados com sucesso.")

    print("\n🎉 TODOS OS TESTES PASSARAM COM 100% DE CONFORMIDADE!")
    print("=" * 75)


if __name__ == "__main__":
    run_procon_test()
