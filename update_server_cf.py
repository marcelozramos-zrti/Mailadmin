import re

with open('server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace virtualLocalCf block
cf_start = content.find('let virtualLocalCf = `')
if cf_start != -1:
    cf_end = content.find('`;', cf_start)
    if cf_end != -1:
        new_cf = """let virtualLocalCf = `# /etc/spamassassin/local.cf
# Configurações de Filtro de Spam do Servidor de E-mail
# Gerenciado via MailAdmin Suite Web v1.1.0

required_score 5.0
rewrite_header Subject ***SPAM (_SCORE_)***
use_bayes 1
bayes_auto_learn 1
bayes_auto_learn_threshold_nonspam 0.1
bayes_auto_learn_threshold_spam 12.0
skip_rbl_checks 0
use_razor2 1
use_pyzor 1

score BAYES_99 4.5
score BAYES_80 3.0
score HELO_DYNAMIC_IPADDR 2.5
score SPF_FAIL 3.0
score DKIM_SIGNED -0.5

# Listas de Acesso Padrão (White List & Blacklist)
whitelist_from *@empresa.com.br
whitelist_from *@parceiro.com.br
whitelist_from *@zrti.com.br
blacklist_from *@spammerdomain.net
blacklist_from contato@sugardns.net
blacklist_from *@suanotaemdia16.roxa.org
blacklist_from *@sensoebs.com
blacklist_from @sensoebs.com
blacklist_from *@residuos3.com
blacklist_from @residuos3.com
blacklist_from *@neocomunicar1.com
blacklist_from *@uraprods.com

# ==========================================================
# INTELIGÊNCIA SPAM ZRTI: GOLPES, PHISHING E FRAUDES
# ==========================================================
# 1. Pega palavras no Assunto (Subject) ignorando acentos
header   LOCAL_GOLPE_PEDAGIO Subject =~ /ped.gios?|vi.ria|rodovi.rio|pend.ncia/i
score    LOCAL_GOLPE_PEDAGIO 15.0
describe LOCAL_GOLPE_PEDAGIO ZRTI - Phishing de Notificacao de Pedagio / Rodovia

# 2. Pega nomes falsos no Remetente (From) ignorando acentos
header   LOCAL_GOLPE_REMETENTE From =~ /Regulariza..o|Pend.ncias|Cobran.a|ReclameAqui/i
score    LOCAL_GOLPE_REMETENTE 15.0
describe LOCAL_GOLPE_REMETENTE ZRTI - Phishing Remetente Falso Reclame Aqui / Cobranca

# 3. Pega o dominio de Reply-To hackeado / sequestrado
header   LOCAL_GOLPE_REPLYTO Reply-To =~ /vidracariarubi\\.com\\.br/i
score    LOCAL_GOLPE_REPLYTO 15.0
describe LOCAL_GOLPE_REPLYTO ZRTI - Bloqueio de Dominio Sequestrado em Reply-To

# 4. Phishing de Comprovantes PIX e Boletos Fraudulentos
header   LOCAL_GOLPE_PIX_FATURA Subject =~ /comprovante.*pix|fatura.*vencida|boleto.*atualizado|duplicata.*vencendo/i
score    LOCAL_GOLPE_PIX_FATURA 12.0
describe LOCAL_GOLPE_PIX_FATURA ZRTI - Phishing de Boleto Falso e Comprovante PIX

# 5. Phishing de Falsa Notificacao de Assinatura DocuSign
header   LOCAL_GOLPE_DOCUSIGN Subject =~ /docusign.*assine|documento.*pendente.*assinatura|contrato.*aguardando/i
score    LOCAL_GOLPE_DOCUSIGN 15.0
describe LOCAL_GOLPE_DOCUSIGN ZRTI - Phishing de Falsa Assinatura DocuSign / Contrato

# ==========================================================
# INTELIGÊNCIA SPAM ZRTI: LINKS NO E-MAIL E ENCURTADORES
# ==========================================================
# 6. Links Encurtados e Redirecionadores Suspeitos no Corpo
uri      LOCAL_LINK_SUSPEITO /(bit\\.ly|tinyurl|is\\.gd|cutt\\.ly|t\\.co|wa\\.me|goo\\.gl)\\/[a-zA-Z0-9]+/i
score    LOCAL_LINK_SUSPEITO 12.0
describe LOCAL_LINK_SUSPEITO ZRTI - Link Encurtador ou Redirecionamento Suspeito no Corpo

# 7. Links com Endereco IP Direto no E-mail
uri      LOCAL_LINK_IP_DIRETO /https?:\\/\\/\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}/i
score    LOCAL_LINK_IP_DIRETO 14.0
describe LOCAL_LINK_IP_DIRETO ZRTI - Link com Endereco IP Direto no E-mail

# ==========================================================
# INTELIGÊNCIA SPAM ZRTI: OFUSCAÇÃO E CARACTERES ESTRANHOS
# ==========================================================
# 8. Multiplas interrogacoes no Assunto (Falha de charset)
header   LOCAL_ASSUNTO_QUEBRADO Subject =~ /\\?{2,}/
score    LOCAL_ASSUNTO_QUEBRADO 5.0
describe LOCAL_ASSUNTO_QUEBRADO ZRTI - Assunto com erro de codificacao (??)

# 9. Remetente com Caracteres Ofuscados (ex: S.e.r.v.i.c.o)
header   LOCAL_REMETENTE_OFUSCADO From =~ /[a-z][._\\-*&%][a-z][._\\-*&%][a-z]/i
score    LOCAL_REMETENTE_OFUSCADO 5.0
describe LOCAL_REMETENTE_OFUSCADO ZRTI - Remetente com caracteres ofuscados

# 10. Caracteres Invisiveis, Zero-Width e Homografos
header   LOCAL_CARACTERES_ESTRANHOS Subject =~ /[\\u200B-\\u200D\\uFEFF]|[\\u0400-\\u04FF].*[\\u0041-\\u007A]/
score    LOCAL_CARACTERES_ESTRANHOS 10.0
describe LOCAL_CARACTERES_ESTRANHOS ZRTI - Caracteres estranhos, zero-width ou homografos no assunto"""
        content = content[:cf_start] + new_cf + content[cf_end:]
        with open('server.ts', 'w', encoding='utf-8') as f_out:
            f_out.write(content)
        print("Updated virtualLocalCf in server.ts successfully!")
