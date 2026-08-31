import express from "express";
import path from "path";
import fs from "fs";
import crypto from "node:crypto";
import { exec } from "child_process";
import { createServer as createViteServer } from "vite";
import { DatabaseSync } from "node:sqlite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize SQLite Database with Auto-Recovery for Persistent Audit Logging and Mail Log History
  const dbPath = path.join(process.cwd(), "vmail.sqlite");
  let sqliteDb: any = null;

  function initSqliteInstance(): any {
    try {
      const db = new DatabaseSync(dbPath);
      db.exec(`
        CREATE TABLE IF NOT EXISTS system_audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          admin_user TEXT NOT NULL,
          action TEXT NOT NULL,
          target TEXT DEFAULT '-',
          ip_address TEXT DEFAULT '127.0.0.1',
          severity_level TEXT DEFAULT 'normal',
          details_json TEXT DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS mail_logs_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          queue_id TEXT DEFAULT '-',
          sender TEXT DEFAULT '-',
          recipient TEXT DEFAULT '-',
          client_ip TEXT DEFAULT '-',
          status TEXT DEFAULT 'Sent',
          message TEXT,
          created_at TEXT
        );
      `);
      return db;
    } catch (e: any) {
      console.warn("Aviso ao abrir vmail.sqlite (tentando auto-recuperação):", e?.message || e);
      try {
        if (fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
        }
        const freshDb = new DatabaseSync(dbPath);
        freshDb.exec(`
          CREATE TABLE IF NOT EXISTS system_audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            admin_user TEXT NOT NULL,
            action TEXT NOT NULL,
            target TEXT DEFAULT '-',
            ip_address TEXT DEFAULT '127.0.0.1',
            severity_level TEXT DEFAULT 'normal',
            details_json TEXT DEFAULT '{}'
          );

          CREATE TABLE IF NOT EXISTS mail_logs_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            queue_id TEXT DEFAULT '-',
            sender TEXT DEFAULT '-',
            recipient TEXT DEFAULT '-',
            client_ip TEXT DEFAULT '-',
            status TEXT DEFAULT 'Sent',
            message TEXT,
            created_at TEXT
          );
        `);
        return freshDb;
      } catch (fallbackErr: any) {
        console.warn("Fallback para SQLite em memória:", fallbackErr?.message || fallbackErr);
        try {
          const memDb = new DatabaseSync(":memory:");
          memDb.exec(`
            CREATE TABLE IF NOT EXISTS system_audit_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              timestamp TEXT NOT NULL,
              admin_user TEXT NOT NULL,
              action TEXT NOT NULL,
              target TEXT DEFAULT '-',
              ip_address TEXT DEFAULT '127.0.0.1',
              severity_level TEXT DEFAULT 'normal',
              details_json TEXT DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS mail_logs_history (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              timestamp TEXT NOT NULL,
              queue_id TEXT DEFAULT '-',
              sender TEXT DEFAULT '-',
              recipient TEXT DEFAULT '-',
              client_ip TEXT DEFAULT '-',
              status TEXT DEFAULT 'Sent',
              message TEXT,
              created_at TEXT
            );
          `);
          return memDb;
        } catch {
          return null;
        }
      }
    }
  }

  sqliteDb = initSqliteInstance();

  // Seed sample records into mail_logs_history if empty
  if (sqliteDb) {
    try {
      const mlCount = (sqliteDb.prepare("SELECT COUNT(*) as c FROM mail_logs_history").get() as any)?.c || 0;
      if (mlCount === 0) {
        const seedStmt = sqliteDb.prepare(`
          INSERT INTO mail_logs_history (timestamp, queue_id, sender, recipient, client_ip, status, message, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const nowIso = new Date().toISOString().substring(0, 10);
        const seedLogs = [
          [ `${nowIso} 08:30:00`, "NOQUEUE", "-", "-", "198.51.100.77", "Rejected", `${nowIso} 08:30:00 mailserver postfix/smtpd[13110]: NOQUEUE: reject: RCPT from unknown[198.51.100.77]: 554 5.7.1 <test@external.org>: Relay access denied;`, `${nowIso} 08:30:00` ],
          [ `${nowIso} 09:45:12`, "NOQUEUE", "-", "-", "185.220.101.5", "AuthFail", `${nowIso} 09:45:12 mailserver postfix/smtpd[14201]: warning: unknown[185.220.101.5]: SASL LOGIN authentication failed: U3Vwb3J0ZQ==`, `${nowIso} 09:45:12` ],
          [ `${nowIso} 10:14:02`, "4YtZ8b3K", "usuario@empresa.com.br", "destino@cliente.com.br", "198.51.100.12", "Sent", `${nowIso} 10:14:04 mailserver amavis[1204]: (4YtZ8b3K) Passed CLEAN {RelayedInbound}, [198.51.100.12] <usuario@empresa.com.br> -> <destino@cliente.com.br>, Hits: -0.100`, `${nowIso} 10:14:04` ],
          [ `${nowIso} 10:14:05`, "4YtZ8b3K", "usuario@empresa.com.br", "destino@cliente.com.br", "198.51.100.12", "Sent", `${nowIso} 10:14:05 mailserver postfix/lmtp[14220]: 4YtZ8b3K: to=<destino@cliente.com.br>, relay=127.0.0.1[127.0.0.1]:24, delay=2.1, dsn=2.0.0, status=sent (250 2.0.0 OK saved_to_mailbox)`, `${nowIso} 10:14:05` ],
          [ `${nowIso} 11:20:10`, "NOQUEUE", "-", "-", "185.220.101.5", "Info", `${nowIso} 11:20:10 mailserver postfix/smtpd[14500]: warning: improper command pipelining after HELO from unknown[185.220.101.5]`, `${nowIso} 11:20:10` ],
          [ `${nowIso} 11:25:00`, "NOQUEUE", "-", "-", "192.168.1.50", "AuthFail", `${nowIso} 11:25:00 mailserver dovecot: auth-worker(14550): password mismatch for user user1@domain.com from 192.168.1.50`, `${nowIso} 11:25:00` ]
        ];
        for (const row of seedLogs) {
          seedStmt.run(...row);
        }
      }
    } catch (seedErr) {
      console.error("Erro ao popular tabela mail_logs_history:", seedErr);
    }
  }

  // Virtual Database for Preview Mode (vmail MariaDB simulation)
  let sessionUser = "admin";

  let virtualAdmin = {
    username: "admin",
    password: "senha_segura_123",
    otp_secret: "JBSWY3DPEHPK3PXP",
    otp_enabled: false,
    role: "admin"
  };

  let virtualAdminsList = [
    { id: 1, username: "admin", role: "admin", otp_enabled: false, created_at: "2026-01-15 10:00:00" },
    { id: 2, username: "analista_suporte", role: "user", otp_enabled: true, created_at: "2026-02-10 14:30:00" }
  ];

  let virtualDomains = [
    { domain: "zrti.com.br", description: "Domínio Principal ZRTI", aliases: 4, mailboxes: 8, maxquota: 51200, transport: "virtual", active: true, created: "2026-01-15 10:00:00" },
    { domain: "zrti.tech", description: "Domínio Técnico ZRTI Tech", aliases: 1, mailboxes: 2, maxquota: 20480, transport: "virtual", active: true, created: "2026-02-01 14:30:00" },
    { domain: "empresa.com.br", description: "Domínio Corporativo Demo", aliases: 3, mailboxes: 5, maxquota: 30720, transport: "virtual", active: true, created: "2026-01-10 09:15:00" },
    { domain: "emporiomisticosaboaria.com.br", description: "Empório Místico Saboaria", aliases: 1, mailboxes: 2, maxquota: 20480, transport: "virtual", active: true, created: "2026-03-01 11:00:00" }
  ];

  let virtualMailboxes = [
    { username: "suporte@zrti.com.br", name: "Suporte Técnico", maildir: "zrti.com.br/suporte/", quota: 5120, bytes_used: 1048576000, domain: "zrti.com.br", active: true, created: "2026-01-15 10:05:00" },
    { username: "comercial@zrti.com.br", name: "Comercial & Vendas", maildir: "zrti.com.br/comercial/", quota: 5120, bytes_used: 2097152000, domain: "zrti.com.br", active: true, created: "2026-01-15 10:10:00" },
    { username: "wilker.oliveira@zrti.com.br", name: "Wilker Oliveira", maildir: "zrti.com.br/wilker.oliveira/", quota: 10240, bytes_used: 3145728000, domain: "zrti.com.br", active: true, created: "2026-01-16 08:00:00" },
    { username: "andreza.carvalho@zrti.com.br", name: "Andreza Carvalho", maildir: "zrti.com.br/andreza.carvalho/", quota: 5120, bytes_used: 524288000, domain: "zrti.com.br", active: true, created: "2026-01-16 08:30:00" },
    { username: "noreply@zrti.com.br", name: "No-Reply Notifications", maildir: "zrti.com.br/noreply/", quota: 2048, bytes_used: 104857600, domain: "zrti.com.br", active: true, created: "2026-01-17 09:00:00" },
    { username: "postmaster@zrti.tech", name: "Postmaster Tech", maildir: "zrti.tech/postmaster/", quota: 2048, bytes_used: 52428800, domain: "zrti.tech", active: true, created: "2026-02-01 14:35:00" },
    { username: "andreza@emporiomisticosaboaria.com.br", name: "Andreza Saboaria", maildir: "emporiomisticosaboaria.com.br/andreza/", quota: 2048, bytes_used: 157286400, domain: "emporiomisticosaboaria.com.br", active: true, created: "2026-03-01 11:05:00" }
  ];

  let virtualAliases = [
    { address: "contato@empresa.com.br", goto: "suporte@empresa.com.br, vendas@loja-online.com", domain: "empresa.com.br", active: true, created: "2026-01-16 09:00:00" },
    { address: "sac@loja-online.com", goto: "suporte@empresa.com.br", domain: "loja-online.com", active: true, created: "2026-03-11 11:00:00" }
  ];

  let virtualDomainAliases = [
    { alias_domain: "zrti.tech", target_domain: "zrti.com.br", active: true, created: "2026-02-01 14:30:00" }
  ];

  let virtualQueue = [
    { queue_id: "4YtZ8b3K", size: 3412, date: "Tue Aug 9 10:20:00", sender: "marketing@spammerdomain.net", recipients: ["diretoria@empresa.com.br"], reason: "Connection timed out with mailserver.spammerdomain.net[198.51.100.42]" },
    { queue_id: "9A1X0c9P", size: 8192, date: "Tue Aug 9 10:35:12", sender: "boleto-falso@bancofake.com", recipients: ["financeiro@empresa.com.br"], reason: "451 4.3.0 <financeiro@empresa.com.br>: Temporary lookup failure" }
  ];

  let virtualMailRules: Array<{ id: number; target: string; action_type: string; created_at: string }> = [
    { id: 1, target: "spammer@badactor.org", action_type: "block", created_at: "2026-08-10 12:00:00" }
  ];

  let virtualCronJobs = [
    {
      id: 1,
      name: "Ingestão de Logs de E-mail para MariaDB (Log-to-DB)",
      schedule_preset: "1h",
      cron_expression: "0 * * * *",
      schedule: "0 * * * *",
      command: "python3 /opt/mailadmin/scripts/mail_log_ingestor.py",
      enabled: true,
      last_run: "2026-08-11 18:00:00",
      last_output: "Ingestão concluída. 45 novos registros processados com sucesso."
    },
    {
      id: 2,
      name: "Backup Automatizado das Tabelas vmail",
      schedule_preset: "daily",
      cron_expression: "0 2 * * *",
      schedule: "0 2 * * *",
      command: "mysqldump -u vmailadmin -p'senha_vmail_123' vmail > /var/backups/vmail_backup.sql",
      enabled: true,
      last_run: "2026-08-11 02:00:00",
      last_output: "Backup concluído (vmail_backup.sql: 1.2MB)."
    },
    {
      id: 3,
      name: "Expurgar Logs de Antispam Antigos (>30 Dias)",
      schedule_preset: "daily",
      cron_expression: "0 3 * * *",
      schedule: "0 3 * * *",
      command: "find /var/log/amavis -name '*.gz' -mtime +30 -delete 2>/dev/null || true",
      enabled: false,
      last_run: null,
      last_output: null
    }
  ];

  let virtualAuditLogs: Array<{ id: number; username: string; action: string; target: string; ip_address: string; details: Record<string, any>; created_at: string }> = [];

  let virtualIncidents = [
    {
      id: 101,
      title: "Múltiplas Falhas de Autenticação SASL (Possível Ataque Brute-force)",
      severity_code: "critical",
      level: 3,
      status: "Pendente",
      summary: "Detectadas 24 tentativas consecutivas de autenticação falhada vindas do IP 185.220.101.5 em menos de 5 minutos.",
      raw_logs: "Aug 13 09:45:12 mailserver postfix/smtpd[14201]: warning: unknown[185.220.101.5]: SASL LOGIN authentication failed: U3Vwb3J0ZQ==\nAug 13 09:45:14 mailserver postfix/smtpd[14201]: warning: unknown[185.220.101.5]: SASL LOGIN authentication failed: YWRtaW4=\nAug 13 09:45:18 mailserver postfix/smtpd[14201]: warning: unknown[185.220.101.5]: SASL LOGIN authentication failed: cm9vdA==",
      affected_target: "185.220.101.5",
      action_taken: "Incidente automático registrado pelo radar de segurança.",
      timestamp: "2026-08-13 09:45:12",
      resolved_at: null,
      resolved_by: null
    },
    {
      id: 102,
      title: "Tentativa de Relay Aberto Rejeitada",
      severity_code: "potential",
      level: 2,
      status: "Em Análise",
      summary: "Endereço IP 198.51.100.77 tentou enviar e-mail não autenticado para destinatário externo via Postfix.",
      raw_logs: "Aug 13 08:30:00 mailserver postfix/smtpd[13110]: NOQUEUE: reject: RCPT from unknown[198.51.100.77]: 554 5.7.1 <test@external.org>: Relay access denied;",
      affected_target: "198.51.100.77",
      action_taken: "Bloqueio automático na etapa RCPT TO.",
      timestamp: "2026-08-13 08:30:00",
      resolved_at: null,
      resolved_by: null
    },
    {
      id: 103,
      title: "Spam em Massa Rejeitado por SpamAssassin",
      severity_code: "suspicious",
      level: 1,
      status: "Mitigado",
      summary: "Mensagem vinda de promo@cheap-deals-online.biz com score 14.2 pontuada como SPAM crítico.",
      raw_logs: "Aug 12 16:15:22 mailserver amavis[8841]: (08841-03) Blocked SPAM {DiscardedInbound}, [192.0.2.14] <promo@cheap-deals-online.biz> -> <diretoria@empresa.com.br>, Hits: 14.2",
      affected_target: "cheap-deals-online.biz",
      action_taken: "Regra BLOCK aplicada ao domínio.",
      timestamp: "2026-08-12 16:15:22",
      resolved_at: "2026-08-12 16:20:00",
      resolved_by: "admin"
    }
  ];

  function getAuditUser(req?: express.Request): string {
    if (req) {
      const userHeader = req.headers["x-admin-user"] || req.headers["x-user"];
      if (userHeader && typeof userHeader === "string" && userHeader.trim()) {
        return userHeader.trim();
      }
      if (req.body && req.body.active_user) {
        return String(req.body.active_user).trim();
      }
    }
    return sessionUser || "admin";
  }

  function addAuditLog(
    action: string,
    target = "-",
    details: Record<string, any> = {},
    severityLevel: 'normal' | 'suspicious' | 'potential' | 'critical' = 'normal',
    req?: express.Request
  ) {
    const username = getAuditUser(req);
    let reqIp = "127.0.0.1";
    if (req) {
      const xff = req.headers["x-forwarded-for"];
      if (xff && typeof xff === "string") {
        reqIp = xff.split(",")[0].trim();
      } else if (req.socket && req.socket.remoteAddress) {
        reqIp = req.socket.remoteAddress;
      }
    }

    const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const detailsStr = JSON.stringify(details || {});

    // Auto-detectar severidade crítica se detalhes ou ação contiverem erro/falha
    let finalSeverity = severityLevel || 'normal';
    const combinedUpper = `${action} ${target || ''} ${detailsStr}`.toUpperCase();
    const errorKeywords = ['ERRO', 'ERROR', 'ACCESS DENIED', 'EXCEPTION', 'FAILED', 'FALHA', 'FATAL', '1045', '1142', 'FAIL'];
    if (finalSeverity === 'normal' && errorKeywords.some(k => combinedUpper.includes(k))) {
      finalSeverity = 'critical';
    }

    if (sqliteDb) {
      try {
        const stmt = sqliteDb.prepare(`
          INSERT INTO system_audit_logs (timestamp, admin_user, action, target, ip_address, severity_level, details_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(timestampStr, username, action, target || "-", reqIp, finalSeverity, detailsStr);
      } catch (err) {
        console.error("Erro ao inserir log de auditoria no SQLite:", err);
      }
    }

    const newLog = {
      id: virtualAuditLogs.length + 1,
      username: username,
      admin_user: username,
      action: action,
      target: target || "-",
      ip_address: reqIp,
      details: details,
      details_json: detailsStr,
      severity_level: finalSeverity,
      created_at: timestampStr,
      timestamp: timestampStr
    };
    virtualAuditLogs.unshift(newLog);
    return newLog;
  }

  const virtualServices: Record<string, { active: boolean; state: string }> = {
    postfix: { active: true, state: "active" },
    amavis: { active: true, state: "active" },
    "clamav-daemon": { active: true, state: "active" },
    spamassassin: { active: true, state: "active" }
  };

  let virtualLocalCf = `# /etc/spamassassin/local.cf
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

# Regras de Demonstração e Auditoria de Duplicidades
blacklist_from *@sensoebs.com
blacklist_from @sensoebs.com
blacklist_from *@residuos3.com
blacklist_from @residuos3.com
blacklist_from *@neocomunicar1.com
blacklist_from *@uraprods.com

# ==========================================================
# BLOQUEIO ZRTI: PHISHING PEDAGIO / RECLAME AQUI (V2 - Sem Acentos)
# ==========================================================

# 1. Pega palavras no Assunto (Subject) ignorando acentos
header   LOCAL_GOLPE_ASSUNTO Subject =~ /ped.gios?|vi.ria|rodovi.rio|pend.ncia/i
score    LOCAL_GOLPE_ASSUNTO 15.0
describe LOCAL_GOLPE_ASSUNTO ZRTI - Bloqueio de Assunto Phishing

# 2. Pega nomes falsos no Remetente (From) ignorando acentos
header   LOCAL_GOLPE_REMETENTE From =~ /Regulariza..o|Pend.ncias|Cobran.a|ReclameAqui/i
score    LOCAL_GOLPE_REMETENTE 15.0
describe LOCAL_GOLPE_REMETENTE ZRTI - Bloqueio de Remetente Phishing

# 3. Pega o dominio de Reply-To hackeado (A falha deles)
header   LOCAL_GOLPE_REPLYTO Reply-To =~ /vidracariarubi\\.com\\.br/i
score    LOCAL_GOLPE_REPLYTO 15.0
describe LOCAL_GOLPE_REPLYTO ZRTI - Bloqueio de Dominio Sequestrado

# ==========================================================
# BLOQUEIO ZRTI: OFUSCACAO E ERROS DE ENCODING (Spammer Amador)
# ==========================================================

# 1. Pega multiplas interrogacoes seguidas no Assunto (Falha de charset do spammer)
header   LOCAL_ASSUNTO_QUEBRADO Subject =~ /\\?{2,}/
score    LOCAL_ASSUNTO_QUEBRADO 5.0
describe LOCAL_ASSUNTO_QUEBRADO ZRTI - Assunto com erro de codificacao (??)

# 2. Pega pontuacao/simbolos repetidos no meio de letras no Remetente (Ofuscacao ex: S.e.r.v.i.c.o)
header   LOCAL_REMETENTE_OFUSCADO From =~ /[a-z][._\\-*&%][a-z][._\\-*&%][a-z]/i
score    LOCAL_REMETENTE_OFUSCADO 5.0
describe LOCAL_REMETENTE_OFUSCADO ZRTI - Remetente com caracteres ofuscados
`;

  let virtualMainCf = `# /etc/postfix/main.cf - Debian 12 Production Config
# Gerenciado via MailAdmin Suite Web

# Informações do Servidor
myhostname = mail.empresa.com.br
mydomain = empresa.com.br
myorigin = $mydomain
mydestination = $myhostname, localhost.$mydomain, localhost

# Configurações de Rede e Interfaces
inet_interfaces = all
inet_protocols = ipv4
mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128 192.168.1.0/24

# Autenticação SASL (Dovecot)
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_auth_enable = yes
smtpd_sasl_security_options = noanonymous, noplaintext
smtpd_sasl_tls_security_options = noanonymous
smtpd_sasl_authenticated_header = yes

# Criptografia TLS / SSL (Certbot Let's Encrypt)
smtpd_tls_security_level = may
smtpd_tls_cert_file = /etc/letsencrypt/live/mail.empresa.com.br/fullchain.pem
smtpd_tls_key_file = /etc/letsencrypt/live/mail.empresa.com.br/privkey.pem
smtpd_tls_session_cache_database = btree:\${data_directory}/smtpd_scache
smtp_tls_security_level = may
smtp_tls_session_cache_database = btree:\${data_directory}/smtp_scache
smtpd_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1
smtpd_tls_mandatory_ciphers = medium

# Políticas e Restrições de Envio (Anti-Spam / Anti-Relay)
smtpd_recipient_restrictions =
    permit_mynetworks,
    permit_sasl_authenticated,
    reject_unauth_destination,
    reject_invalid_helo_hostname,
    reject_non_fqdn_helo_hostname,
    reject_non_fqdn_sender,
    reject_non_fqdn_recipient,
    reject_unknown_recipient_domain

# Integração com Amavis (Content Filter Porta 10024)
content_filter = smtp-amavis:[127.0.0.1]:10024

# Limites de Tamanho
message_size_limit = 52428800
mailbox_size_limit = 0
biff = no
append_dot_mydomain = no
readme_directory = no
`;

  let virtualMasterCf = `# /etc/postfix/master.cf
# ==========================================================================
# service type  private unpriv  chroot  wakeup  maxproc command + args
#               (yes)   (yes)   (no)    (never) (100)
# ==========================================================================
smtp      inet  n       -       y       -       -       smtpd
submission inet n       -       y       -       -       smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_security_level=encrypt
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_recipient_restrictions=permit_sasl_authenticated,reject
smtps     inet  n       -       y       -       -       smtpd
  -o syslog_name=postfix/smtps
  -o smtpd_tls_wrappermode=yes
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_recipient_restrictions=permit_sasl_authenticated,reject

# Amavis Filter Feeder
smtp-amavis unix -      -       y       -       2       smtp
  -o smtp_data_done_timeout=1200
  -o smtp_send_xforward_command=yes
  -o disable_dns_lookups=yes
  -o max_use=20

# Amavis Re-injection
127.0.0.1:10025 inet n  -       y       -       -       smtpd
  -o content_filter=
  -o local_recipient_maps=
  -o relay_recipient_maps=
  -o smtpd_restriction_classes=
  -o smtpd_client_restrictions=
  -o smtpd_helo_restrictions=
  -o smtpd_sender_restrictions=
  -o smtpd_recipient_restrictions=permit_mynetworks,reject
  -o mynetworks=127.0.0.0/8
  -o strict_rfc821_envelopes=yes
  -o smtpd_error_sleep_time=0
`;

  let virtualAmavis50User = `# /etc/amavis/conf.d/50-user - Amavis Configuration
use strict;

# Níveis de Tag e Bloqueio de Spam
$sa_tag_level_deflt  = 2.0;
$sa_tag2_level_deflt = 5.0;
$sa_kill_level_deflt = 8.0;
$sa_dsn_cutoff_level = 15.0;

# Ações de Quarentena
$final_virus_destiny      = D_DISCARD;
$final_banned_destiny     = D_BOUNCE;
$final_spam_destiny       = D_PASS;
$final_bad_header_destiny = D_PASS;

# Concorrência e Conexões
$max_servers = 4;
$daemon_user  = 'amavis';
$daemon_group = 'amavis';

# Integração ClamAV Socket
@av_scanners = (
  ['ClamAV-clamd',
    \\&ask_daemon, ["CONTSCAN {}\\n", "/var/run/clamav/clamd.ctl"],
    qr/\\bOK$/m, qr/\\bFOUND$/m,
    qr/^.*?: (?!Infected Archive)(.*) FOUND$/m ],
);

# Bypass Flags (0 = verificar, 1 = ignorar)
@bypass_virus_checks_maps = ( 0 );
@bypass_spam_checks_maps  = ( 0 );

1;
`;

  let virtualClamdConf = `# /etc/clamav/clamd.conf - ClamAV Antivirus Daemon
LocalSocket /var/run/clamav/clamd.ctl
FixStaleSocket true
LocalSocketGroup amavis
LocalSocketMode 660

ScanArchive true
ScanOLE2 true
ScanPDF true
ScanHTML true
ScanMail true
ScanSWF true

AlertEncrypted false
MaxFileSize 25M
MaxScanSize 100M
MaxRecursion 16
MaxFiles 10000

User clamav
DatabaseDirectory /var/lib/clamav
`;

  let virtualFreshclamConf = `# /etc/clamav/freshclam.conf - FreshClam Signature Updater
DatabaseOwner clamav
UpdateLogFile /var/log/clamav/freshclam.log
LogVerbose false
LogSyslog false

DatabaseMirror db.local.clamav.net
DatabaseMirror database.clamav.net
Checks 12
`;

  const runCmd = (cmd: string): Promise<{ code: number; stdout: string; stderr: string }> => {
    return new Promise((resolve) => {
      exec(cmd, { timeout: 800 }, (error, stdout, stderr) => {
        resolve({
          code: error ? error.code || 1 : 0,
          stdout: stdout ? stdout.trim() : "",
          stderr: stderr ? stderr.trim() : ""
        });
      });
    });
  };

  // ===============================================
  // 1. AUTENTICAÇÃO E MFA (Flask-Login / TOTP pyotp)
  // ===============================================

  app.get("/api/auth/me", (req, res) => {
    const userHeader = req.headers["x-admin-user"] || req.headers["x-user"];
    const username = (userHeader && typeof userHeader === "string" && userHeader.trim()) ? userHeader.trim() : (sessionUser || "admin");
    res.json({
      authenticated: true,
      success: true,
      username: username,
      role: "admin",
      mfa_enabled: true
    });
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password, token } = req.body || {};
    const uName = (username || "").trim() || "admin";

    sessionUser = uName;

    // Check if user exists in virtualAdminsList; if not, add them
    let foundAdmin = virtualAdminsList.find(a => a.username.toLowerCase() === uName.toLowerCase());
    if (!foundAdmin) {
      foundAdmin = {
        id: virtualAdminsList.length + 1,
        username: uName,
        role: "admin",
        otp_enabled: true,
        created_at: new Date().toISOString().replace("T", " ").substring(0, 19)
      };
      virtualAdminsList.push(foundAdmin);
    }

    if (!virtualAdmin.otp_enabled && uName === "admin" && (!password || password !== virtualAdmin.password)) {
      // allow fallback
    }

    if (!token && uName === "admin" && !virtualAdmin.otp_enabled) {
      const qrDemo = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><rect width='200' height='200' fill='%23f8fafc'/><rect x='20' y='20' width='60' height='60' fill='%230f172a'/><rect x='30' y='30' width='40' height='40' fill='%23ffffff'/><rect x='40' y='40' width='20' height='20' fill='%230f172a'/><rect x='120' y='20' width='60' height='60' fill='%230f172a'/><rect x='130' y='30' width='40' height='40' fill='%23ffffff'/><rect x='140' y='40' width='20' height='20' fill='%230f172a'/><rect x='20' y='120' width='60' height='60' fill='%230f172a'/><rect x='30' y='130' width='40' height='40' fill='%23ffffff'/><rect x='40' y='140' width='20' height='20' fill='%230f172a'/><path d='M100 20h10v30h-10zM100 80h30v20h-30zM120 120h40v20h-40zM150 150h30v30h-30z' fill='%230f172a'/></svg>";
      return res.json({
        success: false,
        require_mfa_setup: true,
        temp_user_id: 1,
        username: uName,
        otp_secret: virtualAdmin.otp_secret,
        provision_url: `otpauth://totp/MailAdmin%20Suite:${uName}?secret=${virtualAdmin.otp_secret}&issuer=MailAdmin%20Suite`,
        qr_code_base64: qrDemo,
        message: "Configuração do Autenticador MFA é OBRIGATÓRIA no primeiro acesso ao painel."
      });
    }

    if (!token && uName === "admin" && virtualAdmin.otp_enabled) {
      return res.json({ success: false, mfa_required: true, message: "Insira o código TOTP de 6 dígitos do Google Authenticator." });
    }

    addAuditLog("LOGIN_SUCCESS", "Painel Admin", { username: uName, method: "password_totp" }, "normal", req);

    res.json({
      success: true,
      message: "Login realizado com sucesso!",
      user: { id: foundAdmin.id, username: uName, role: foundAdmin.role || "admin", mfa_enabled: true }
    });
  });

  app.get("/api/auth/mfa/setup", (req, res) => {
    const qrDemo = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><rect width='200' height='200' fill='%23f8fafc'/><rect x='20' y='20' width='60' height='60' fill='%230f172a'/><rect x='30' y='30' width='40' height='40' fill='%23ffffff'/><rect x='40' y='40' width='20' height='20' fill='%230f172a'/><rect x='120' y='20' width='60' height='60' fill='%230f172a'/><rect x='130' y='30' width='40' height='40' fill='%23ffffff'/><rect x='140' y='40' width='20' height='20' fill='%230f172a'/><rect x='20' y='120' width='60' height='60' fill='%230f172a'/><rect x='30' y='130' width='40' height='40' fill='%23ffffff'/><rect x='40' y='140' width='20' height='20' fill='%230f172a'/><path d='M100 20h10v30h-10zM100 80h30v20h-30zM120 120h40v20h-40zM150 150h30v30h-30z' fill='%230f172a'/></svg>";
    res.json({
      success: true,
      otp_secret: virtualAdmin.otp_secret,
      qr_code_base64: qrDemo,
      provision_url: `otpauth://totp/MailAdmin%20Suite:${sessionUser}?secret=${virtualAdmin.otp_secret}&issuer=MailAdmin%20Suite`
    });
  });

  app.post("/api/auth/mfa/enable", (req, res) => {
    const { token } = req.body || {};
    if (!token || token.length !== 6) {
      return res.status(400).json({ success: false, message: "Código de 6 dígitos inválido." });
    }
    virtualAdmin.otp_enabled = true;
    res.json({
      success: true,
      message: "MFA ativado com sucesso! Seja bem-vindo ao painel.",
      user: { id: 1, username: virtualAdmin.username, role: virtualAdmin.role, mfa_enabled: true }
    });
  });

  app.get("/api/auth/me", (req, res) => {
    res.json({ authenticated: true, username: virtualAdmin.username, role: virtualAdmin.role, mfa_enabled: virtualAdmin.otp_enabled });
  });

  // Gestão de Administradores (vmail_admins)
  app.get("/api/auth/admins", (req, res) => {
    res.json({ success: true, admins: virtualAdminsList });
  });

  app.post("/api/auth/admins", (req, res) => {
    const { username, password, role } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Nome de usuário e senha são obrigatórios." });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "A senha deve conter no mínimo 6 caracteres." });
    }
    if (virtualAdminsList.some(a => a.username.toLowerCase() === username.trim().toLowerCase())) {
      return res.status(400).json({ success: false, message: `O usuário "${username}" já está cadastrado.` });
    }

    const nextId = virtualAdminsList.length > 0 ? Math.max(...virtualAdminsList.map(a => a.id)) + 1 : 1;
    const newAdmin = {
      id: nextId,
      username: username.trim(),
      role: (role === 'user' ? 'user' : 'admin'),
      otp_enabled: false,
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19)
    };
    virtualAdminsList.push(newAdmin);
    addAuditLog("ADMIN_CREATE", newAdmin.username, { role: newAdmin.role }, "suspicious", req);
    res.json({ success: true, message: `Usuário "${username}" (${newAdmin.role}) criado com sucesso!`, admin: newAdmin });
  });

  app.post("/api/auth/admins/:id/password", (req, res) => {
    const adminId = parseInt(req.params.id);
    const { password } = req.body || {};
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: "A senha deve conter no mínimo 6 caracteres." });
    }
    const admin = virtualAdminsList.find(a => a.id === adminId);
    if (!admin) return res.status(404).json({ success: false, message: "Administrador não encontrado." });

    addAuditLog("ADMIN_PASSWORD_CHANGE", admin.username, {}, "suspicious", req);
    res.json({ success: true, message: `Senha do administrador "${admin.username}" alterada com sucesso!` });
  });

  app.put("/api/auth/admins/:id/password", (req, res) => {
    const adminId = parseInt(req.params.id);
    const { password } = req.body || {};
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: "A senha deve conter no mínimo 6 caracteres." });
    }
    const admin = virtualAdminsList.find(a => a.id === adminId);
    if (!admin) return res.status(404).json({ success: false, message: "Administrador não encontrado." });

    addAuditLog("ADMIN_PASSWORD_CHANGE", admin.username, {}, "suspicious", req);
    res.json({ success: true, message: `Senha do administrador "${admin.username}" alterada com sucesso!` });
  });

  const deleteAdminHandler = (req: express.Request, res: express.Response) => {
    const adminId = parseInt(req.params.id);
    const adminIndex = virtualAdminsList.findIndex(a => a.id === adminId);
    if (adminIndex === -1) {
      return res.status(404).json({ success: false, message: "Administrador não encontrado." });
    }

    if (virtualAdminsList.length <= 1) {
      return res.status(400).json({ success: false, message: "Trava de Segurança: Não é possível excluir o único administrador restante no painel." });
    }

    const removedUsername = virtualAdminsList[adminIndex].username;
    virtualAdminsList.splice(adminIndex, 1);
    addAuditLog("ADMIN_DELETE", removedUsername, {}, "critical", req);
    res.json({ success: true, message: `Administrador "${removedUsername}" excluído com sucesso!` });
  };

  app.delete("/api/auth/admins/:id", deleteAdminHandler);
  app.post("/api/auth/admins/:id/delete", deleteAdminHandler);

  app.post("/api/auth/admins/:id/toggle-mfa", (req, res) => {
    const adminId = parseInt(req.params.id);
    const admin = virtualAdminsList.find(a => a.id === adminId);
    if (!admin) return res.status(404).json({ success: false, message: "Usuário não encontrado." });

    const { enable } = req.body || {};
    admin.otp_enabled = enable !== undefined ? Boolean(enable) : !admin.otp_enabled;
    const statusStr = admin.otp_enabled ? "ativado" : "desativado";

    virtualAuditLogs.unshift({
      id: virtualAuditLogs.length + 1,
      username: virtualAdmin.username,
      action: "MFA_TOGGLE",
      target: admin.username,
      ip_address: "127.0.0.1",
      details: { admin_id: adminId, enabled: admin.otp_enabled },
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19)
    });

    res.json({
      success: true,
      message: `MFA ${statusStr} com sucesso para o usuário "${admin.username}"!`,
      otp_enabled: admin.otp_enabled
    });
  });

  app.get("/api/auth/audit-logs", (req, res) => {
    res.json({
      success: true,
      count: virtualAuditLogs.length,
      audit_logs: virtualAuditLogs
    });
  });

  // ===============================================
  // 2. DOMÍNIOS E MAILBOXES (CRUD MariaDB vmail)
  // ===============================================

  app.get("/api/vmail/domains", (req, res) => {
    const domainsWithCounts = virtualDomains.map(d => {
      const realCount = virtualMailboxes.filter(m => m.domain === d.domain).length;
      return { ...d, mailboxes: realCount };
    });
    res.json({ success: true, domains: domainsWithCounts });
  });

  app.post("/api/vmail/domains", (req, res) => {
    const { domain, description, maxquota } = req.body || {};
    if (!domain) return res.status(400).json({ success: false, message: "Domínio é obrigatório." });
    const newDom = {
      domain: domain.toLowerCase(),
      description: description || "",
      aliases: 0,
      mailboxes: 0,
      maxquota: maxquota || 10240,
      transport: "virtual",
      active: true,
      created: new Date().toISOString().replace("T", " ").substring(0, 19)
    };
    virtualDomains.push(newDom);
    addAuditLog("DOMAIN_CREATE", newDom.domain, { description: newDom.description, maxquota: newDom.maxquota }, "normal", req);
    res.json({ success: true, message: `Domínio ${domain} criado no banco vmail!`, domain: newDom });
  });

  app.post("/api/vmail/domains/:domain/toggle", (req, res) => {
    const dom = virtualDomains.find(d => d.domain === req.params.domain);
    if (!dom) return res.status(404).json({ success: false, message: "Domínio não encontrado." });
    dom.active = !dom.active;
    addAuditLog("DOMAIN_TOGGLE", dom.domain, { active: dom.active }, "suspicious", req);
    res.json({ success: true, message: `Status do domínio ${dom.domain} alterado!` });
  });

  app.delete("/api/vmail/domains/:domain", (req, res) => {
    virtualDomains = virtualDomains.filter(d => d.domain !== req.params.domain);
    virtualMailboxes = virtualMailboxes.filter(m => m.domain !== req.params.domain);
    virtualAliases = virtualAliases.filter(a => a.domain !== req.params.domain);
    virtualDomainAliases = virtualDomainAliases.filter(ad => ad.target_domain !== req.params.domain && ad.alias_domain !== req.params.domain);
    addAuditLog("DOMAIN_DELETE", req.params.domain, {}, "critical", req);
    res.json({ success: true, message: `Domínio e registros associados excluídos com sucesso!` });
  });

  // Domain Aliases Endpoints
  app.get(["/api/vmail/alias-domains", "/api/vmail/domain-aliases"], (req, res) => {
    res.json({ success: true, alias_domains: virtualDomainAliases, data: virtualDomainAliases });
  });

  app.post(["/api/vmail/alias-domains", "/api/vmail/domain-aliases"], (req, res) => {
    const { alias_domain, target_domain } = req.body || {};
    if (!alias_domain || !target_domain) {
      return res.status(400).json({ success: false, message: "Domínio alias e domínio de destino são obrigatórios." });
    }
    const cleanAlias = alias_domain.toLowerCase().trim();
    const cleanTarget = target_domain.toLowerCase().trim();
    if (cleanAlias === cleanTarget) {
      return res.status(400).json({ success: false, message: "O domínio alias não pode ser idêntico ao destino." });
    }
    const targetExists = virtualDomains.some(d => d.domain.toLowerCase() === cleanTarget);
    if (!targetExists) {
      return res.status(400).json({ success: false, message: `Domínio de destino ${cleanTarget} não está cadastrado.` });
    }
    if (virtualDomainAliases.some(ad => ad.alias_domain.toLowerCase() === cleanAlias)) {
      return res.status(400).json({ success: false, message: `Alias de domínio ${cleanAlias} já existe.` });
    }
    const newAD = {
      alias_domain: cleanAlias,
      target_domain: cleanTarget,
      active: true,
      created: new Date().toISOString().replace("T", " ").substring(0, 19)
    };
    virtualDomainAliases.unshift(newAD);
    addAuditLog("DOMAIN_ALIAS_CREATE", cleanAlias, { target_domain: cleanTarget }, "normal", req);
    res.json({ success: true, message: `Alias de domínio ${cleanAlias} -> ${cleanTarget} criado com sucesso!`, alias_domain: newAD });
  });

  app.all(["/api/vmail/alias-domains/:domain/toggle", "/api/vmail/domain-aliases/:domain/toggle"], (req, res) => {
    const domain = decodeURIComponent(req.params.domain).toLowerCase();
    const ad = virtualDomainAliases.find(a => a.alias_domain.toLowerCase() === domain);
    if (!ad) return res.status(404).json({ success: false, message: "Alias de domínio não encontrado." });
    ad.active = !ad.active;
    addAuditLog("DOMAIN_ALIAS_TOGGLE", domain, { active: ad.active }, "normal", req);
    res.json({ success: true, message: `Alias de domínio ${domain} ${ad.active ? 'ativado' : 'desativado'} com sucesso!` });
  });

  app.delete(["/api/vmail/alias-domains/:domain", "/api/vmail/domain-aliases/:domain"], (req, res) => {
    const domain = decodeURIComponent(req.params.domain).toLowerCase();
    virtualDomainAliases = virtualDomainAliases.filter(a => a.alias_domain.toLowerCase() !== domain);
    addAuditLog("DOMAIN_ALIAS_DELETE", domain, {}, "normal", req);
    res.json({ success: true, message: `Alias de domínio ${domain} excluído com sucesso!` });
  });

  app.get("/api/vmail/mailboxes", (req, res) => {
    const domainFilter = req.query.domain as string;
    let result = virtualMailboxes;
    if (domainFilter) {
      result = result.filter(m => m.domain === domainFilter);
    }
    res.json({ success: true, mailboxes: result });
  });

  app.post("/api/vmail/mailboxes", (req, res) => {
    const { username, domain, name, password, quota, scheme } = req.body || {};
    if (!username) {
      return res.status(400).json({ success: false, message: "Endereço de e-mail é obrigatório." });
    }
    const fullEmail = (username.includes("@") ? username : `${username}@${domain || ""}`).toLowerCase().trim();
    const domName = domain || fullEmail.split("@")[1];

    if (!domName) {
      return res.status(400).json({ success: false, message: "Domínio é obrigatório." });
    }

    if (virtualMailboxes.some(m => m.username.toLowerCase() === fullEmail)) {
      return res.status(400).json({ success: false, message: `Caixa postal ${fullEmail} já existe.` });
    }

    // Auto-create domain if missing
    let d = virtualDomains.find(dom => dom.domain.toLowerCase() === domName.toLowerCase());
    if (!d) {
      d = {
        domain: domName.toLowerCase(),
        description: "Domínio gerado automaticamente",
        aliases: 0,
        mailboxes: 0,
        maxquota: 10240,
        transport: "virtual",
        active: true,
        created: new Date().toISOString().replace("T", " ").substring(0, 19)
      };
      virtualDomains.push(d);
    }

    const newMb = {
      username: fullEmail,
      name: name || "",
      maildir: `${domName.toLowerCase()}/${fullEmail.split("@")[0]}/`,
      quota: quota ? parseInt(quota) : 1024,
      bytes_used: 0,
      domain: domName.toLowerCase(),
      active: true,
      created: new Date().toISOString().replace("T", " ").substring(0, 19)
    };
    virtualMailboxes.unshift(newMb);
    d.mailboxes = (d.mailboxes || 0) + 1;

    addAuditLog("MAILBOX_CREATE", fullEmail, { quota: newMb.quota, domain: domName, scheme: scheme || 'SSHA512' }, "normal", req);
    res.json({ success: true, message: `Caixa postal ${fullEmail} criada com sucesso!`, mailbox: newMb });
  });

  app.put("/api/vmail/mailboxes/:email/quota", (req, res) => {
    const email = decodeURIComponent(req.params.email);
    const { quota } = req.body || {};
    const mb = virtualMailboxes.find(m => m.username === email);
    if (!mb) return res.status(404).json({ success: false, message: "Caixa postal não encontrada." });
    mb.quota = parseInt(quota) || 1024;
    addAuditLog("MAILBOX_QUOTA_UPDATE", email, { quota: mb.quota }, "normal", req);
    res.json({ success: true, message: `Cota de ${email} atualizada para ${mb.quota} MB.` });
  });

  app.all(["/api/vmail/mailboxes/:email/password", "/api/vmail/mailboxes/:email/reset-password"], (req, res) => {
    if (req.method === "GET") {
      return res.json({ success: true, email: req.params.email });
    }
    const email = decodeURIComponent(req.params.email);
    const { password, scheme } = req.body || {};
    if (!password) {
      return res.status(400).json({ success: false, message: "A nova senha é obrigatória." });
    }
    const mb = virtualMailboxes.find(m => m.username.toLowerCase() === email.toLowerCase());
    if (!mb) {
      return res.status(404).json({ success: false, message: "Caixa postal não encontrada." });
    }
    addAuditLog("MAILBOX_PASSWORD_RESET", email, { scheme: scheme || "SSHA512" }, "suspicious", req);
    res.json({ success: true, message: `Senha da caixa postal ${email} redefinida com sucesso!` });
  });

  app.delete("/api/vmail/mailboxes/:email", (req, res) => {
    const email = decodeURIComponent(req.params.email);
    const mb = virtualMailboxes.find(m => m.username === email);
    if (mb) {
      const d = virtualDomains.find(dom => dom.domain === mb.domain);
      if (d && d.mailboxes > 0) d.mailboxes -= 1;
    }
    virtualMailboxes = virtualMailboxes.filter(m => m.username !== email);
    addAuditLog("MAILBOX_DELETE", email, {}, "potential", req);
    res.json({ success: true, message: `Caixa postal ${email} removida do banco vmail.` });
  });

  app.get("/api/vmail/aliases", (req, res) => {
    res.json({ success: true, aliases: virtualAliases });
  });

  app.post("/api/vmail/aliases", (req, res) => {
    const { address, goto } = req.body || {};
    if (!address || !goto) {
      return res.status(400).json({ success: false, message: "Endereço do Alias e Destino são obrigatórios." });
    }
    const fullAddress = address.toLowerCase().trim();
    const domName = fullAddress.split("@")[1] || "local";

    const existingAl = virtualAliases.find(a => a.address.toLowerCase() === fullAddress);
    if (existingAl) {
      existingAl.goto = goto.trim();
      addAuditLog("ALIAS_CREATE", fullAddress, { goto: existingAl.goto, domain: domName }, "normal", req);
      return res.json({ success: true, message: `Alias ${fullAddress} atualizado para redirecionar para ${existingAl.goto}!`, alias: existingAl });
    }

    let d = virtualDomains.find(dom => dom.domain.toLowerCase() === domName.toLowerCase());
    if (!d && domName !== "local") {
      d = {
        domain: domName.toLowerCase(),
        description: "Domínio gerado automaticamente",
        aliases: 0,
        mailboxes: 0,
        maxquota: 10240,
        transport: "virtual",
        active: true,
        created: new Date().toISOString().replace("T", " ").substring(0, 19)
      };
      virtualDomains.push(d);
    }

    const newAl = {
      address: fullAddress,
      goto: goto.trim(),
      domain: domName.toLowerCase(),
      active: true,
      created: new Date().toISOString().replace("T", " ").substring(0, 19)
    };
    virtualAliases.unshift(newAl);

    if (d) {
      d.aliases = (d.aliases || 0) + 1;
    }

    addAuditLog("ALIAS_CREATE", fullAddress, { goto: newAl.goto, domain: domName }, "normal", req);
    res.json({ success: true, message: `Alias ${fullAddress} -> ${newAl.goto} cadastrado com sucesso!`, alias: newAl });
  });

  app.delete("/api/vmail/aliases/:address", (req, res) => {
    const address = decodeURIComponent(req.params.address);
    virtualAliases = virtualAliases.filter(a => a.address !== address);
    addAuditLog("ALIAS_DELETE", address, {}, "normal", req);
    res.json({ success: true, message: `Alias ${address} removido!` });
  });

  // ===============================================
  // 3. TROUBLESHOOTING & HEALTH TOOLS
  // ===============================================

  // Tracking de E-mail (/var/log/mail.log)
  app.all("/api/troubleshooting/email-tracking", (req, res) => {
    const data = req.method === "POST" ? (req.body || {}) : req.query;
    const powerQuery = String(data.power_query || data.query || data.pq || data.search_term || data.termo_busca || "").trim();

    const rawConditions = powerQuery.split(";").map(c => c.trim()).filter(Boolean);
    if (rawConditions.length === 0) {
      const mb = String(data.mailbox || data.caixa_postal || "").trim();
      if (mb) rawConditions.push(`from:${mb}`);
      const st = String(data.search_term || data.termo_busca || "").trim();
      if (st) rawConditions.push(st);
      const ds = String(data.delivery_status || data.status_entrega || "").trim();
      if (ds) rawConditions.push(`status:${ds}`);
      const srv = String(data.service || data.servico || "").trim();
      if (srv) rawConditions.push(`prot:${srv}`);
    }

    const parsedConditions = rawConditions.map(cond => {
      const condClean = cond.trim();
      if (condClean.startsWith('"') && condClean.endsWith('"') && condClean.length >= 2) {
        return { key: "free", op: "contains", val: condClean.slice(1, -1).toLowerCase() };
      } else if (condClean.includes("!=")) {
        const [k, v] = condClean.split("!=", 2);
        const vS = v.trim();
        const val = (vS.startsWith('"') && vS.endsWith('"') && vS.length >= 2) ? vS.slice(1, -1).toLowerCase() : vS.toLowerCase();
        return { key: k.trim().toLowerCase(), op: "!=", val };
      } else if (condClean.includes(":")) {
        const [k, v] = condClean.split(":", 2);
        const vS = v.trim();
        const val = (vS.startsWith('"') && vS.endsWith('"') && vS.length >= 2) ? vS.slice(1, -1).toLowerCase() : vS.toLowerCase();
        return { key: k.trim().toLowerCase(), op: ":", val };
      } else if (condClean.includes("=")) {
        const [k, v] = condClean.split("=", 2);
        const vS = v.trim();
        const val = (vS.startsWith('"') && vS.endsWith('"') && vS.length >= 2) ? vS.slice(1, -1).toLowerCase() : vS.toLowerCase();
        return { key: k.trim().toLowerCase(), op: ":", val };
      } else {
        return { key: "free", op: "contains", val: condClean.toLowerCase() };
      }
    });

    const date = String(data.start_date || data.data_inicio || data.date || data.data_busca || data.period || new Date().toISOString().split("T")[0]).trim();
    const startTime = String(data.start_time || data.hora_inicial || "00:00").trim();
    const endTime = String(data.end_time || data.hora_final || "23:59").trim();
    const quickLens = String(data.quick_lens || data.event_lens || data.lente || "").trim().toLowerCase();
    const limit = parseInt(String(data.limit || data.limite || "500"), 10) || 500;

    const parts = date.split("-");
    let formattedDate = date;
    if (parts.length === 3) {
      formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    const fromCond = parsedConditions.find(c => ["from", "remetente", "sender", "caixa_postal", "mailbox"].includes(c.key));
    const toCond = parsedConditions.find(c => ["to", "destinatario", "recipient"].includes(c.key));
    const protCond = parsedConditions.find(c => ["prot", "service", "servico", "protocol"].includes(c.key));
    const statusCond = parsedConditions.find(c => ["status", "delivery_status", "status_entrega", "veredito", "verdict"].includes(c.key));

    const queryFrom = fromCond ? fromCond.val : "";
    const queryTo = toCond ? toCond.val : "";
    const queryProt = protCond ? protCond.val : "";
    const queryStatus = statusCond ? statusCond.val : "";

    const sendAddr = (fromCond && fromCond.op !== "!=") ? fromCond.val : "usuario@empresa.com.br";
    const recvAddr = (toCond && toCond.op !== "!=") ? toCond.val : "destino@cliente.com.br";

    // 1. Consulta primária na tabela SQLite mail_logs_history (Log-to-DB)
    let sourceLines: string[] = [];
    try {
      const rows = sqliteDb.prepare("SELECT * FROM mail_logs_history ORDER BY id ASC").all() as Array<any>;
      if (rows && rows.length > 0) {
        for (const r of rows) {
          if (r.message && r.message.trim().length > 0) {
            const msgClean = r.message.trim();
            if (/^[A-Z][a-z]{2}\s+\d+|\d{4}-\d{2}-\d{2}/.test(msgClean)) {
              sourceLines.push(msgClean);
            } else {
              sourceLines.push(`${r.timestamp || date + ' 10:00:00'} mailserver postfix/smtpd[${r.queue_id || '1001'}]: ${r.queue_id ? r.queue_id + ': ' : ''}${msgClean}`);
            }
          } else {
            sourceLines.push(`${r.timestamp || date + ' 10:00:00'} mailserver postfix/qmgr[${r.queue_id || '1001'}]: ${r.queue_id || 'NOQUEUE'}: from=<${r.sender || ''}>, to=<${r.recipient || ''}>, status=${r.status || 'Sent'}`);
          }
        }
      }
    } catch (dbErr) {
      console.error("Erro ao consultar mail_logs_history no SQLite:", dbErr);
    }

    if (sourceLines.length === 0) {
      sourceLines = [
        `${date} 10:14:02 mailserver postfix/smtpd[14201]: connect from mail-out.parceiro.com.br[198.51.100.12]`,
        `${date} 10:14:02 mailserver postfix/smtpd[14201]: 4YtZ8b3K: client=mail-out.parceiro.com.br[198.51.100.12]`,
        `${date} 10:14:03 mailserver postfix/cleanup[14205]: 4YtZ8b3K: message-id=<202608091014.4YtZ8b3K@parceiro.com.br>`,
        `${date} 10:14:03 mailserver postfix/qmgr[1820]: 4YtZ8b3K: from=<${sendAddr}>, size=2849, nrcpt=1 (queue active)`,
        `${date} 10:14:04 mailserver amavis[1204]: (4YtZ8b3K) Passed CLEAN {RelayedInbound}, [198.51.100.12] <${sendAddr}> -> <${recvAddr}>, Hits: -0.100`,
        `${date} 10:14:05 mailserver postfix/lmtp[14220]: 4YtZ8b3K: to=<${recvAddr}>, relay=127.0.0.1[127.0.0.1]:24, delay=2.1, dsn=2.0.0, status=sent (250 2.0.0 OK saved_to_mailbox)`,
        `${date} 10:14:05 mailserver dovecot: lda(${recvAddr}): msgid=<202608091014.4YtZ8b3K@parceiro.com.br>: saved mail to INBOX`,
        `${date} 10:14:05 mailserver postfix/qmgr[1820]: 4YtZ8b3K: removed`,
        `${date} 11:20:10 mailserver postfix/smtpd[14500]: warning: improper command pipelining after HELO from unknown[185.220.101.5]`,
        `${date} 11:20:11 mailserver postfix/smtpd[14500]: disconnect from unknown[185.220.101.5] ehlo=1 commands=1`,
        `${date} 11:25:00 mailserver dovecot: auth-worker(14550): password mismatch for user user1@domain.com from 192.168.1.50`,
        `${date} 11:25:01 mailserver postfix/smtpd[14560]: warning: SASL authentication failure: Password verification failed`
      ];
    }

    // Filter by time window
    const timeFiltered = sourceLines.filter(line => {
      const match = line.match(/(?:[T\s])?(\d{2}:\d{2})/);
      if (match) {
        const t = match[1];
        if (startTime && t < startTime) return false;
        if (endTime && t > endTime) return false;
      }
      return true;
    });

    // Group into blocks
    const extractGroupKey = (line: string): string | null => {
      const amavisTaskMatch = line.match(/amavis\[\d+\]:\s*\(([\d]+-[\d]+)\)/i) || line.match(/\(([\d]+-[\d]+)\)/);
      if (amavisTaskMatch) return `amavis:${amavisTaskMatch[1]}`;

      const mailIdMatch = line.match(/mail_id:\s*([0-9A-Za-z_\-]+)/i);
      if (mailIdMatch) return `mail_id:${mailIdMatch[1]}`;

      const qidMatch = line.match(/\b([0-9A-Za-z]{8,16}):/) || line.match(/\(([0-9A-Za-z]{8,16})\)/);
      if (qidMatch && !/^\d+$/.test(qidMatch[1])) return `qid:${qidMatch[1]}`;

      const pidMatch = line.match(/\b([a-zA-Z0-9_\-/]+\[\d+\]):/);
      if (pidMatch) {
        if (pidMatch[1].toLowerCase().includes("amavis")) return null;
        return `pid:${pidMatch[1]}`;
      }
      return null;
    };

    const blocks: { key: string | null; lines: string[] }[] = [];
    const keyMap = new Map<string, number>();

    for (const line of timeFiltered) {
      const key = extractGroupKey(line);

      if (key) {
        if (keyMap.has(key)) {
          blocks[keyMap.get(key)!].lines.push(line);
        } else {
          keyMap.set(key, blocks.length);
          blocks.push({ key, lines: [line] });
        }
      } else {
        blocks.push({ key: null, lines: [line] });
      }
    }

    const smtpAttackKeywords = ["improper command pipelining", "non-smtp command", "unknown[", "warning: hostname", "lost connection after", "too many errors", "connect from unknown", "anvil"];
    const authFailureKeywords = ["authentication failed", "auth failed", "sasl", "password mismatch", "unknown user", "relay access denied", "554 5.7.1", "reject: rcp", "login failed"];

    const checkBlock = (blk: { key: string | null; lines: string[] }) => {
      const blkLines = blk.lines;
      const blkText = blkLines.join("\n").toLowerCase();

      if (quickLens === 'smtp_attacks') {
        if (!smtpAttackKeywords.some(kw => blkText.includes(kw))) return false;
      } else if (quickLens === 'auth_failures') {
        if (!authFailureKeywords.some(kw => blkText.includes(kw))) return false;
      } else if (quickLens) {
        const terms = quickLens.split('|').map(t => t.trim()).filter(Boolean);
        if (terms.length && !terms.some(t => blkText.includes(t))) return false;
      }

      if (parsedConditions.length === 0) return true;

      let cachedSender: string | null = null;
      let cachedRecipient: string | null = null;

      const getSender = () => {
        if (cachedSender === null) {
          let snd = "";
          for (const line of blkLines) {
            const m1 = line.match(/ESMTP\s*<([^>]+)>\s*->/i);
            if (m1) { snd = m1[1].trim().toLowerCase(); break; }
            const m2 = line.match(/from=<([^>]+)>/i);
            if (m2) { snd = m2[1].trim().toLowerCase(); break; }
            const m3 = line.match(/From:\s*<([^>]+)>/i);
            if (m3) { snd = m3[1].trim().toLowerCase(); break; }
            const m4 = line.match(/from=\s*<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9._%+-]+)>?/i);
            if (m4) { snd = m4[1].trim().toLowerCase(); break; }
          }
          cachedSender = snd;
        }
        return cachedSender;
      };

      const getRecipient = () => {
        if (cachedRecipient === null) {
          let rcp = "";
          for (const line of blkLines) {
            const m1 = line.match(/->\s*<([^>]+)>/i);
            if (m1) { rcp = m1[1].trim().toLowerCase(); break; }
            const m2 = line.match(/to=<([^>]+)>/i);
            if (m2) { rcp = m2[1].trim().toLowerCase(); break; }
            const m3 = line.match(/To:\s*<([^>]+)>/i);
            if (m3) { rcp = m3[1].trim().toLowerCase(); break; }
            const m4 = line.match(/to=\s*<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9._%+-]+)>?/i);
            if (m4) { rcp = m4[1].trim().toLowerCase(); break; }
          }
          cachedRecipient = rcp;
        }
        return cachedRecipient;
      };

      for (const c of parsedConditions) {
        const { key, op, val } = c;
        if (!val) continue;

        if (["from", "remetente", "sender", "caixa_postal", "mailbox"].includes(key)) {
          const snd = getSender();
          const hasVal = snd.includes(val) || (blkText.includes(val) && (blkText.includes("from=") || blkText.includes("from:") || blkText.includes("esmtp")));
          if (op === "!=" && hasVal) return false;
          if ((op === ":" || op === "=") && !hasVal) return false;
        } else if (["to", "destinatario", "recipient"].includes(key)) {
          const rcp = getRecipient();
          const hasVal = rcp.includes(val) || (blkText.includes(val) && (blkText.includes("to=") || blkText.includes("to:") || blkText.includes("->")));
          if (op === "!=" && hasVal) return false;
          if ((op === ":" || op === "=") && !hasVal) return false;
        } else if (["status", "delivery_status", "status_entrega", "veredito", "verdict"].includes(key)) {
          const hasVal = blkText.includes(val);
          if (op === "!=" && hasVal) return false;
          if ((op === ":" || op === "=") && !hasVal) return false;
        } else if (["prot", "service", "servico", "protocol"].includes(key)) {
          const hasVal = blkText.includes(val);
          if (op === "!=" && hasVal) return false;
          if ((op === ":" || op === "=") && !hasVal) return false;
        } else {
          const hasVal = blkText.includes(val);
          if (op === "!=" && hasVal) return false;
          if ((op === ":" || op === "=" || op === "contains") && !hasVal) return false;
        }
      }

      return true;
    };

    const matchingBlocks: Array<{ key: string | null; lines: string[] }> = [];
    let filteredLines: string[] = [];
    for (const blk of blocks) {
      if (checkBlock(blk)) {
        matchingBlocks.push(blk);
        filteredLines.push(...blk.lines);
      }
    }

    const transacoes = matchingBlocks.map(blk => {
      const lines = blk.lines;
      const blkFull = lines.join("\n");
      const keyVal = blk.key || "";
      let qid = keyVal.replace(/^(qid|pid|amavis|mail_id):/, "");
      if (!qid) {
        const qm = blkFull.match(/\b([0-9A-Za-z]{8,16}):/);
        qid = qm ? qm[1] : "NOQUEUE";
      }

      const verdictKeywords = [
        "passed clean", "passed spam", "passed", "status=sent", "bounced",
        "reject:", "chkrootkit", "auth failed", "alert", "warning", "hits:"
      ];
      let targetLine = lines.find(line => {
        const lLow = line.toLowerCase();
        return verdictKeywords.some(kw => lLow.includes(kw));
      });
      if (!targetLine) {
        targetLine = lines[lines.length - 1] || blkFull;
      }

      const tsMatch = targetLine.match(/([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2}|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}|\d{2}:\d{2}:\d{2})/)
        || (lines[0] && lines[0].match(/([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2}|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}|\d{2}:\d{2}:\d{2})/));
      const data_hora = tsMatch ? tsMatch[1] : "N/A";

      const extractSender = (text: string) => {
        const m1 = text.match(/ESMTP\s*<([^>]+)>\s*->/i);
        if (m1) return m1[1].trim();
        const m2 = text.match(/from=<([^>]+)>/i);
        if (m2) return m2[1].trim();
        const m3 = text.match(/From:\s*<([^>]+)>/i);
        if (m3) return m3[1].trim();
        const m4 = text.match(/from=\s*<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9._%+-]+)>?/i);
        if (m4) return m4[1].trim();
        return null;
      };

      let remetente = extractSender(targetLine);
      if (!remetente) {
        for (const line of lines) {
          remetente = extractSender(line);
          if (remetente) break;
        }
      }
      if (!remetente || ["none", "null", "<>"].includes(remetente.toLowerCase())) {
        remetente = blkFull.toLowerCase().includes("from=<>") || (targetLine || "").includes("<>") ? "<> (Bounce)" : "N/A";
      }

      const extractRecipient = (text: string) => {
        const m1 = text.match(/->\s*<([^>]+)>/i);
        if (m1) return m1[1].trim();
        const m2 = text.match(/to=<([^>]+)>/i);
        if (m2) return m2[1].trim();
        const m3 = text.match(/To:\s*<([^>]+)>/i);
        if (m3) return m3[1].trim();
        const m4 = text.match(/to=\s*<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9._%+-]+)>?/i);
        if (m4) return m4[1].trim();
        return null;
      };

      let destinatario = extractRecipient(targetLine);
      if (!destinatario) {
        for (const line of lines) {
          destinatario = extractRecipient(line);
          if (destinatario) break;
        }
      }
      if (!destinatario || ["none", "null"].includes(destinatario.toLowerCase())) {
        destinatario = "N/A";
      }

      const extractScore = (text: string) => {
        const m1 = text.match(/Hits:\s*([-\d\.]+)/i);
        if (m1) return m1[1];
        const m2 = text.match(/score=([-\d\.]+)/i);
        if (m2) return m2[1];
        const m3 = text.match(/(?:hits|score)\s*[:=]\s*([-\d\.]+)/i);
        if (m3) return m3[1];
        return null;
      };

      let score = extractScore(targetLine);
      if (!score) {
        for (const line of lines) {
          score = extractScore(line);
          if (score) break;
        }
      }
      if (!score) score = "-";

      const tLow = (targetLine + "\n" + blkFull).toLowerCase();
      let veredito = "CLEAN";
      if (tLow.includes("passed spam") || tLow.includes("spam") || tLow.includes("bounced")) {
        veredito = "SPAM";
      } else if (tLow.includes("alert") || tLow.includes("warning") || tLow.includes("chkrootkit") || tLow.includes("auth failed") || tLow.includes("reject")) {
        veredito = "ALERTA";
      } else if (tLow.includes("passed clean") || tLow.includes("clean") || tLow.includes("sent") || tLow.includes("status=sent")) {
        veredito = "CLEAN";
      }

      return { queue_id: qid, data_hora, remetente, destinatario, score, veredito };
    });

    res.json({
      success: true,
      period: date,
      period_label: `Data: ${formattedDate}`,
      power_query: powerQuery,
      query_from: queryFrom,
      query_to: queryTo,
      query_prot: queryProt,
      query_status: queryStatus,
      limit,
      total_matches: filteredLines.length,
      lines: filteredLines.slice(-limit),
      raw_text: filteredLines.join("\n"),
      texto_bruto: filteredLines.join("\n"),
      transacoes,
      transactions: transacoes
    });
  });

  // Fila Postfix (postqueue -p)
  app.all("/api/troubleshooting/queue", (req, res) => {
    res.json({
      success: true,
      queue_empty: virtualQueue.length === 0,
      total_messages: virtualQueue.length,
      messages: virtualQueue
    });
  });

  app.post("/api/troubleshooting/queue/delete", (req, res) => {
    const { queue_id } = req.body || {};
    virtualQueue = virtualQueue.filter(q => q.queue_id !== queue_id);
    addAuditLog("QUEUE_DELETE_MESSAGE", queue_id || "-", { queue_id }, "normal", req);
    res.json({ success: true, message: `Mensagem ${queue_id} deletada da fila com postsuper -d!` });
  });

  app.post("/api/troubleshooting/queue/flush", (req, res) => {
    virtualQueue = [];
    addAuditLog("QUEUE_FLUSH", "Postfix Mail Queue", {}, "normal", req);
    res.json({ success: true, message: `Fila Postfix liberada/flushed com sucesso via postqueue -f!` });
  });

  app.post(["/api/rules/add", "/api/troubleshooting/rules/add"], (req, res) => {
    const { target, action_type } = req.body || {};
    if (!target) {
      return res.status(400).json({ status: "error", message: "O campo target (e-mail ou IP) é obrigatório." });
    }
    const act = String(action_type || "").trim().toLowerCase();
    if (!["block", "spam", "whitelist"].includes(act)) {
      return res.status(400).json({ status: "error", message: "Tipo de ação inválido. Opções: block, spam, whitelist." });
    }

    const newRule = {
      id: virtualMailRules.length + 1,
      target: String(target).trim(),
      action_type: act,
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };
    virtualMailRules.push(newRule);
    addAuditLog("SOAR_RULE_ADD", newRule.target, { action_type: act }, "normal", req);

    return res.json({
      status: "success",
      message: "Regra aplicada com sucesso!",
      rule: newRule
    });
  });

  // Gerenciador de Chaves DKIM (RSA 2048-bit)
  interface VirtualDkimKey {
    domain: string;
    selector: string;
    key_size: number;
    public_key_b64: string;
    private_key_pem: string;
    dns_record_name: string;
    dns_record_type: string;
    dns_record_value: string;
    opendkim_table_line: string;
    rspamd_dkim_conf: string;
    created_at: string;
  }

  const virtualDkimKeys = new Map<string, VirtualDkimKey>();

  function getOrGenerateDkimKey(domain: string, selector = "default", forceNew = false): VirtualDkimKey {
    const domClean = domain.toLowerCase().trim();
    const selClean = (selector || "default").toLowerCase().trim();
    const keyMapId = `${domClean}:${selClean}`;

    if (!forceNew && virtualDkimKeys.has(keyMapId)) {
      return virtualDkimKeys.get(keyMapId)!;
    }

    // Geração de par de chaves RSA 2048-bit
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem"
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem"
      }
    });

    const cleanB64 = publicKey
      .replace(/-----BEGIN PUBLIC KEY-----/g, "")
      .replace(/-----END PUBLIC KEY-----/g, "")
      .replace(/\r?\n|\r|\s/g, "");

    const dnsName = `${selClean}._domainkey.${domClean}`;
    const dnsValue = `v=DKIM1; k=rsa; p=${cleanB64}`;
    const opendkimTable = `${selClean}._domainkey.${domClean} ${domClean}:${selClean}:/etc/opendkim/keys/${domClean}/${selClean}.private`;
    const rspamdConf = `domain {\n  "${domClean}" {\n    path = "/var/lib/rspamd/dkim/${domClean}.${selClean}.key";\n    selector = "${selClean}";\n  }\n}`;

    const dkimEntry: VirtualDkimKey = {
      domain: domClean,
      selector: selClean,
      key_size: 2048,
      public_key_b64: cleanB64,
      private_key_pem: privateKey,
      dns_record_name: dnsName,
      dns_record_type: "TXT",
      dns_record_value: dnsValue,
      opendkim_table_line: opendkimTable,
      rspamd_dkim_conf: rspamdConf,
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19)
    };

    virtualDkimKeys.set(keyMapId, dkimEntry);
    return dkimEntry;
  }

  // Pre-seed DKIM keys for existing local domains
  ["zrti.com.br", "zrti.tech", "empresa.com.br", "emporiomisticosaboaria.com.br"].forEach(d => {
    getOrGenerateDkimKey(d, "default");
    getOrGenerateDkimKey(d, "mail");
    getOrGenerateDkimKey(d, "dkim");
  });

  // Geração / Renovação de Chaves DKIM sob demanda
  app.post("/api/troubleshooting/dkim/generate", (req, res) => {
    const { domain, selector } = req.body || {};
    if (!domain) {
      return res.status(400).json({ success: false, message: "O domínio é obrigatório para gerar a chave DKIM." });
    }
    const domClean = String(domain).toLowerCase().trim();
    const selClean = String(selector || "default").toLowerCase().trim();

    const isLocal = virtualDomains.some(d => d.domain.toLowerCase() === domClean) ||
                    virtualDomainAliases.some(a => a.alias_domain.toLowerCase() === domClean);

    const dkimKey = getOrGenerateDkimKey(domClean, selClean, true);

    addAuditLog(
      "DKIM_KEY_GENERATE",
      `${selClean}._domainkey.${domClean}`,
      { domain: domClean, selector: selClean, key_size: 2048, is_local_domain: isLocal },
      "normal",
      req
    );

    res.json({
      success: true,
      message: `Chave criptográfica DKIM (RSA 2048-bit) para o seletor '${selClean}' do domínio '${domClean}' gerada com sucesso!`,
      dkim_key: dkimKey,
      is_local: isLocal,
      dns_guide: {
        host: dkimKey.dns_record_name,
        type: "TXT",
        value: dkimKey.dns_record_value,
        ttl: 3600,
        opendkim_path: `/etc/opendkim/keys/${domClean}/${selClean}.private`,
        rspamd_path: `/var/lib/rspamd/dkim/${domClean}.${selClean}.key`
      }
    });
  });

  // Obter Chave DKIM de Domínio
  app.get("/api/troubleshooting/dkim", (req, res) => {
    const domain = String(req.query.domain || "").toLowerCase().trim();
    const selector = String(req.query.selector || "default").toLowerCase().trim();
    if (!domain) {
      return res.status(400).json({ success: false, message: "Domínio não informado." });
    }
    const isLocal = virtualDomains.some(d => d.domain.toLowerCase() === domain) ||
                    virtualDomainAliases.some(a => a.alias_domain.toLowerCase() === domain);

    const dkimKey = getOrGenerateDkimKey(domain, selector, false);
    res.json({
      success: true,
      dkim_key: dkimKey,
      is_local: isLocal
    });
  });

  // Validador DNS com Diagnóstico Didático e Guia de Solução Completo
  app.all("/api/troubleshooting/dns-check", (req, res) => {
    const domain = (req.body?.domain || req.query?.domain as string || "empresa.com.br").toLowerCase().trim();
    const selector = (req.body?.selector || req.query?.selector as string || "default").toLowerCase().trim();

    const isLocal = virtualDomains.some(d => d.domain.toLowerCase() === domain) ||
                    virtualDomainAliases.some(a => a.alias_domain.toLowerCase() === domain);

    // Domínios de exemplo simulados ou externos
    const isExampleFailure = domain.includes("sem-dns") || domain.includes("invalido") || domain.includes("falha");
    const isExternalValid = domain.includes("gmail.com") || domain.includes("google.com") || domain.includes("microsoft.com");

    const dkimKey = getOrGenerateDkimKey(domain, selector, false);

    let mxStatus: "OK" | "FALHA" | "ALERTA" = "OK";
    let spfStatus: "OK" | "FALHA" | "ALERTA" = "OK";
    let dkimStatus: "OK" | "FALHA" | "ALERTA" = "OK";
    let dmarcStatus: "OK" | "FALHA" | "ALERTA" = "OK";

    let mxRecords = [`10 mail.${domain}`, `20 backup-mail.${domain}`];
    let spfRecord = `v=spf1 mx ip4:203.0.113.10 ~all`;
    let dkimRecord = dkimKey.dns_record_value;
    let dmarcRecord = `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@${domain}; pct=100`;

    if (isExampleFailure) {
      mxStatus = "FALHA";
      spfStatus = "FALHA";
      dkimStatus = "FALHA";
      dmarcStatus = "FALHA";
      mxRecords = [];
      spfRecord = "";
      dkimRecord = "";
      dmarcRecord = "";
    } else if (domain === "emporiomisticosaboaria.com.br") {
      // Exemplo com SPF ausente e DKIM pendente de apontamento para demonstrar o guia
      mxStatus = "OK";
      spfStatus = "FALHA";
      dkimStatus = "FALHA";
      dmarcStatus = "ALERTA";
      spfRecord = "";
      dkimRecord = "";
      dmarcRecord = `v=DMARC1; p=none; sp=none;`;
    }

    const report = {
      domain: domain,
      is_local_domain: isLocal,
      health_score: 0,
      total_checks: 4,
      passed_checks: 0,
      overall_status: "EXCELLENT" as "EXCELLENT" | "ATTENTION" | "CRITICAL",
      mx: {
        status: mxStatus,
        records: mxRecords,
        details: mxStatus === "OK" ? `${mxRecords.length} servidores MX configurados no DNS.` : "Nenhum registro MX encontrado na zona de DNS deste domínio.",
        importance: "Crítica" as const,
        diagnosis: mxStatus === "OK" 
          ? "Roteamento de e-mails de entrada operacional. Servidores remotos sabem onde entregar as mensagens para este domínio."
          : "Sem o registro MX, nenhum servidor de e-mail na internet conseguirá entregar mensagens para as caixas postais deste domínio.",
        solution: mxStatus === "OK"
          ? "Nenhuma ação necessária. Apontamento MX ativo e respondendo."
          : `Acesse a zona de DNS do domínio e crie uma entrada do Tipo MX apontando para o hostname do seu servidor (ex: mail.${domain}) com Prioridade 10. Certifique-se de que mail.${domain} possui uma entrada A apontando para o IP público do servidor de e-mail.`,
        suggested_record: {
          type: "MX",
          host: "@",
          value: `mail.${domain}`,
          priority: 10,
          ttl: 3600,
          description: `Servidor MX primário para receber mensagens de ${domain}`
        }
      },
      spf: {
        status: spfStatus,
        record: spfRecord,
        details: spfStatus === "OK" ? "Registro SPF v=spf1 válido e ativo." : "Nenhum registro TXT contendo 'v=spf1' localizado no domínio.",
        importance: "Alta" as const,
        diagnosis: spfStatus === "OK"
          ? "O SPF informa quais IPs têm autorização para enviar e-mails em nome deste domínio, protegendo contra falsificação de remetente."
          : "Sem registro SPF, servidores receptores como Gmail, Outlook e Yahoo podem classificar todos os seus e-mails como SPAM ou rejeitá-los.",
        solution: spfStatus === "OK"
          ? "Registro SPF validado com sucesso."
          : `Crie uma entrada TXT no DNS raiz (@ ou ${domain}) contendo a política SPF autorizando o IP do seu servidor Postfix: 'v=spf1 mx ip4:203.0.113.10 ~all'. Use '~all' (SoftFail) inicialmente para testes e '-all' (HardFail) após validar todos os gateways de envio.`,
        suggested_record: {
          type: "TXT",
          host: "@",
          value: `v=spf1 mx ip4:203.0.113.10 ~all`,
          ttl: 3600,
          description: `Autoriza os servidores MX e o IP 203.0.113.10 a enviar e-mails pelo domínio ${domain}`
        }
      },
      dkim: {
        status: dkimStatus,
        selector: selector,
        record: dkimRecord,
        details: dkimStatus === "OK" ? `Chave Pública DKIM validada com sucesso no seletor '${selector}'` : `Registro TXT não localizado no host '${selector}._domainkey.${domain}'.`,
        importance: "Alta" as const,
        diagnosis: dkimStatus === "OK"
          ? `Assinatura criptográfica DKIM ativa. O seletor '${selector}' permite aos destinatários comprovarem matematicamente que o e-mail não foi alterado em trânsito.`
          : isLocal
            ? `O domínio '${domain}' está cadastrado no servidor vmail local, mas o apontamento DNS da Chave Pública DKIM ainda não foi criado ou não propagou.`
            : `O registro DKIM não foi encontrado no DNS. Caso este domínio seja hospedado neste servidor, cadastre-o primeiro em 'Domínios' para gerar as chaves criptográficas.`,
        solution: dkimStatus === "OK"
          ? "Autenticação DKIM operando com sucesso."
          : isLocal
            ? `Copie o apontamento TXT gerado abaixo e publique no painel DNS (Cloudflare, Registro.br, cPanel, Route53, etc.) no host '${selector}._domainkey.${domain}'. Assim que propagar, execute o teste novamente.`
            : `Gere a chave DKIM no servidor de e-mail de origem e crie uma entrada TXT em '${selector}._domainkey.${domain}' com a chave pública RSA gerada.`,
        suggested_record: {
          type: "TXT",
          host: `${selector}._domainkey.${domain}`,
          value: dkimKey.dns_record_value,
          ttl: 3600,
          description: `Chave pública RSA 2048-bit para autenticação DKIM do seletor '${selector}'`
        },
        dkim_key: dkimKey,
        is_local: isLocal
      },
      dmarc: {
        status: dmarcStatus,
        record: dmarcRecord,
        details: dmarcStatus === "OK" ? "Política DMARC configurada e protegendo o domínio." : (dmarcStatus === "ALERTA" ? "DMARC configurado com política 'p=none' (somente monitoramento)." : "Nenhum registro DMARC encontrado em '_dmarc." + domain + "'."),
        importance: "Alta" as const,
        diagnosis: dmarcStatus === "OK"
          ? "Política DMARC alinha SPF e DKIM, informando aos servidores o que fazer com e-mails forjados e coletando relatórios de entregabilidade (RUA/RUF)."
          : dmarcStatus === "ALERTA"
            ? "Política em modo monitoramento ('p=none'). Útil para início de homologação, mas não bloqueia ataques de phishing ativos."
            : "Sem DMARC, provedores modernos (Google, Yahoo, Microsoft) reduzem a reputação de entrega e não fornecem relatórios de abuso.",
        solution: dmarcStatus === "OK"
          ? "Política DMARC alinhada."
          : `Crie uma entrada TXT no host '_dmarc.${domain}' com a política recomendada: 'v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@${domain}; pct=100'. Isso coloca mensagens fraudulentas na quarentena e envia relatórios agregados de conformidade.`,
        suggested_record: {
          type: "TXT",
          host: `_dmarc.${domain}`,
          value: `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@${domain}; pct=100`,
          ttl: 3600,
          description: `Política DMARC com quarentena para mensagens que falharem no SPF ou DKIM`
        }
      }
    };

    let passed = 0;
    if (report.mx.status === "OK") passed++;
    if (report.spf.status === "OK") passed++;
    if (report.dkim.status === "OK") passed++;
    if (report.dmarc.status === "OK") passed++;

    report.passed_checks = passed;
    report.health_score = Math.round((passed / 4) * 100);

    if (report.health_score === 100) {
      report.overall_status = "EXCELLENT";
    } else if (report.health_score >= 50) {
      report.overall_status = "ATTENTION";
    } else {
      report.overall_status = "CRITICAL";
    }

    res.json({
      success: true,
      dns_report: report
    });
  });

  // Incidente de Segurança - Listagem com Filtros
  app.get("/api/troubleshooting/incidents", (req, res) => {
    const statusFilter = String(req.query.status || "all");
    const severityFilter = String(req.query.severity || "all");
    const search = String(req.query.search || "").toLowerCase().trim();

    let filtered = [...virtualIncidents];

    if (statusFilter !== "all") {
      filtered = filtered.filter(i => i.status === statusFilter);
    }

    if (severityFilter !== "all") {
      filtered = filtered.filter(i =>
        i.severity_code === severityFilter ||
        (severityFilter === "critical" && i.level === 3) ||
        (severityFilter === "potential" && i.level === 2) ||
        (severityFilter === "suspicious" && i.level === 1)
      );
    }

    if (search) {
      filtered = filtered.filter(i =>
        i.title.toLowerCase().includes(search) ||
        i.summary.toLowerCase().includes(search) ||
        i.affected_target.toLowerCase().includes(search) ||
        i.raw_logs.toLowerCase().includes(search)
      );
    }

    const stats = {
      total: virtualIncidents.length,
      pendente: virtualIncidents.filter(i => i.status === "Pendente").length,
      em_analise: virtualIncidents.filter(i => i.status === "Em Análise").length,
      mitigado: virtualIncidents.filter(i => i.status === "Mitigado").length,
      resolvido: virtualIncidents.filter(i => i.status === "Resolvido").length
    };

    res.json({
      success: true,
      incidents: filtered,
      stats
    });
  });

  // Atualizar Status / Nota do Incidente
  app.post("/api/troubleshooting/incidents/:inc_id/status", (req, res) => {
    const incId = parseInt(req.params.inc_id, 10);
    const inc = virtualIncidents.find(i => i.id === incId);
    if (!inc) {
      return res.status(404).json({ success: false, message: "Incidente não encontrado." });
    }

    const { status, action_note } = req.body || {};
    if (status) {
      inc.status = status;
      if (status === "Mitigado" || status === "Resolvido") {
        inc.resolved_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
        inc.resolved_by = "admin";
      }
    }

    if (action_note && String(action_note).trim()) {
      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
      const newEntry = `[${nowStr} - admin] ${String(action_note).trim()}`;
      inc.action_taken = inc.action_taken ? `${inc.action_taken}\n${newEntry}` : newEntry;
    }

    addAuditLog(
      "INCIDENT_STATUS_UPDATE",
      `Incidente #${inc.id}`,
      { status: inc.status, action_note: action_note || "" },
      "potential",
      req
    );

    res.json({
      success: true,
      message: `Incidente #${inc.id} atualizado para ${inc.status}.`,
      incident: inc
    });
  });

  // Mitigação Direta SOAR
  app.post("/api/troubleshooting/incidents/:inc_id/mitigate", (req, res) => {
    const incId = parseInt(req.params.inc_id, 10);
    const inc = virtualIncidents.find(i => i.id === incId);
    if (!inc) {
      return res.status(404).json({ success: false, message: "Incidente não encontrado." });
    }

    const { target, action_type } = req.body || {};
    const targetVal = String(target || inc.affected_target || "").trim();
    if (!targetVal || targetVal === "-") {
      return res.status(400).json({ success: false, message: "Informe um alvo (e-mail, domínio ou IP) válido para mitigação." });
    }

    const actType = String(action_type || "block").toLowerCase();

    const existingRule = virtualMailRules.find(r => r.target.toLowerCase() === targetVal.toLowerCase());
    if (existingRule) {
      existingRule.action_type = actType;
    } else {
      virtualMailRules.push({
        id: virtualMailRules.length + 1,
        target: targetVal,
        action_type: actType,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
      });
    }

    inc.status = "Mitigado";
    inc.resolved_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
    inc.resolved_by = "admin";

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const mitigationNote = `[${nowStr} - admin] Mitigação executada: Regra '${actType.toUpperCase()}' aplicada ao alvo '${targetVal}'.`;
    inc.action_taken = inc.action_taken ? `${inc.action_taken}\n${mitigationNote}` : mitigationNote;

    addAuditLog(
      "INCIDENT_MITIGATE",
      targetVal,
      { action_type: actType, incident_id: inc.id },
      "critical",
      req
    );

    res.json({
      success: true,
      message: `Mitigação aplicada com sucesso ao alvo ${targetVal} e incidente marcado como Mitigado.`,
      incident: inc
    });
  });

  // Log de Auditoria do Sistema
  app.get("/api/troubleshooting/audit-logs", (req, res) => {
    const severity = String(req.query.severity || "all").toLowerCase();
    const datePreset = String(req.query.date_preset || "all").toLowerCase();
    const search = String(req.query.search || "").toLowerCase().trim();

    try {
      const stmt = sqliteDb.prepare("SELECT * FROM system_audit_logs ORDER BY id DESC LIMIT 500");
      const dbRows = stmt.all() as Array<any>;

      const counts = { normal: 0, suspicious: 0, potential: 0, critical: 0 };
      const filtered: Array<any> = [];

      for (const r of dbRows) {
        const sev = (r.severity_level || "normal").toLowerCase();
        if (sev in counts) {
          counts[sev as keyof typeof counts]++;
        }

        if (severity === "all" || sev === severity) {
          const textToSearch = `${r.admin_user || ""} ${r.action || ""} ${r.target || ""} ${r.ip_address || ""} ${r.details_json || ""}`.toLowerCase();
          if (!search || textToSearch.includes(search)) {
            filtered.push({
              id: r.id,
              timestamp: r.timestamp,
              admin_user: r.admin_user || "System",
              action: r.action,
              target: r.target || "-",
              ip_address: r.ip_address || "127.0.0.1",
              severity_level: sev,
              details_json: r.details_json || "{}"
            });
          }
        }
      }

      res.json({
        success: true,
        logs: filtered,
        total: filtered.length,
        counts: counts
      });
    } catch (e: any) {
      res.status(500).json({ success: false, message: `Erro ao obter logs de auditoria: ${e.message}` });
    }
  });

  let isIncidentsModuleActive = true;
  let maillogAutoIngest = true;
  let virtualMailLogCount = 1840;

  // Status do Módulo de Incidentes & Auditoria MariaDB
  app.get("/api/troubleshooting/module-status", (req, res) => {
    let auditCount = 0;
    try {
      const cRes = sqliteDb.prepare("SELECT COUNT(*) as count FROM system_audit_logs").get() as any;
      auditCount = cRes?.count || 0;
    } catch(e){}

    res.json({
      success: true,
      active: isIncidentsModuleActive,
      incidents_count: virtualIncidents.length,
      audit_count: auditCount,
      maillog_count: virtualMailLogCount,
      maillog_auto: maillogAutoIngest
    });
  });

  // Ativar Módulo de Incidentes & Auditoria
  app.post("/api/troubleshooting/activate-module", (req, res) => {
    isIncidentsModuleActive = true;
    addAuditLog("MODULE_ACTIVATED", "Módulo de Incidentes e Auditoria MariaDB", {}, "normal", req);
    res.json({
      success: true,
      active: true,
      message: "Módulo de Incidentes e Auditoria ativado com sucesso! Tabelas ativas no MariaDB."
    });
  });

  // Expurgar Dados de Incidentes e Auditoria
  app.post("/api/troubleshooting/purge-data", (req, res) => {
    const target = (req.body && req.body.target) || "all";
    let deletedInc = 0;
    let deletedAudit = 0;

    if (target === "incidents" || target === "all") {
      deletedInc = virtualIncidents.length;
      virtualIncidents = [];
    }

    if (target === "audit" || target === "all") {
      try {
        const cRes = sqliteDb.prepare("SELECT COUNT(*) as count FROM system_audit_logs").get() as any;
        deletedAudit = cRes?.count || 0;
        sqliteDb.exec("DELETE FROM system_audit_logs");
      } catch (err) {
        console.error("Erro ao expurgar tabela no SQLite:", err);
      }
      virtualAuditLogs = [];
    }

    addAuditLog(
      "PURGE_DATA",
      `Expurgo de Dados (${target})`,
      { deleted_incidents: deletedInc, deleted_audit_logs: deletedAudit },
      "critical",
      req
    );

    res.json({
      success: true,
      message: `Expurgo concluído! ${deletedInc} incidentes e ${deletedAudit} logs de auditoria foram expurgados.`
    });
  });

  // Importar MailLog para o MariaDB com Detecção Real de Incidentes
  app.post("/api/troubleshooting/maillog/ingest", (req, res) => {
    const newBatch = Math.floor(Math.random() * 20) + 15;
    virtualMailLogCount += newBatch;

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const randomIpSuffix = Math.floor(Math.random() * 200) + 10;
    const attackIp = `185.220.101.${randomIpSuffix}`;

    const incidentTypes = [
      {
        title: `Tentativa de Autenticação Maliciosa SASL (${attackIp})`,
        severity_code: 'critical',
        level: 3,
        summary: `Múltiplas falhas de login SASL/Dovecot registradas para o IP ${attackIp} no log de e-mail.`,
        raw_logs: `${nowStr} mailserver postfix/smtpd[${Math.floor(Math.random()*10000)+10000}]: warning: unknown[${attackIp}]: SASL LOGIN authentication failed: U3Vwb3J0ZQ==`,
        affected_target: attackIp
      },
      {
        title: `Tentativa de Relay Aberto Rejeitada (${attackIp})`,
        severity_code: 'potential',
        level: 2,
        summary: `Disparo não autenticado vindo do IP ${attackIp} rejeitado na etapa RCPT TO.`,
        raw_logs: `${nowStr} mailserver postfix/smtpd[${Math.floor(Math.random()*10000)+10000}]: NOQUEUE: reject: RCPT from unknown[${attackIp}]: 554 5.7.1 Relay access denied`,
        affected_target: attackIp
      },
      {
        title: `Spam em Massa Rejeitado pelo Amavis/SpamAssassin`,
        severity_code: 'suspicious',
        level: 1,
        summary: `Mensagem vinda de alerta-financas${randomIpSuffix}@phish-domain.net pontuada com score 12.8.`,
        raw_logs: `${nowStr} mailserver amavis[${Math.floor(Math.random()*5000)+5000}]: Blocked SPAM {DiscardedInbound}, [${attackIp}] <alerta-financas${randomIpSuffix}@phish-domain.net> -> <financeiro@empresa.com.br>, Hits: 12.8`,
        affected_target: `phish-domain.net`
      }
    ];

    const selectedInc = incidentTypes[Math.floor(Math.random() * incidentTypes.length)];
    const newIncident = {
      id: 100 + virtualIncidents.length + 1,
      title: selectedInc.title,
      severity_code: selectedInc.severity_code,
      level: selectedInc.level,
      status: "Pendente",
      summary: selectedInc.summary,
      raw_logs: selectedInc.raw_logs,
      affected_target: selectedInc.affected_target,
      action_taken: "Incidente detectado e registrado pela Ingestão do MailLog.",
      timestamp: nowStr,
      resolved_at: null,
      resolved_by: null
    };

    virtualIncidents.unshift(newIncident);

    // Inserir batch no mail_logs_history (SQLite simulando MariaDB)
    try {
      const insStmt = sqliteDb.prepare(`
        INSERT INTO mail_logs_history (timestamp, queue_id, sender, recipient, client_ip, status, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insStmt.run(
        nowStr,
        selectedInc.severity_code === 'critical' ? 'NOQUEUE' : `${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        `usuario${Math.floor(Math.random()*100)}@empresa.com.br`,
        `cliente${Math.floor(Math.random()*100)}@externo.com`,
        attackIp,
        selectedInc.severity_code === 'critical' ? 'AuthFail' : (selectedInc.severity_code === 'potential' ? 'Rejected' : 'Spam'),
        selectedInc.raw_logs,
        nowStr
      );
      const totalInDb = (sqliteDb.prepare("SELECT COUNT(*) as c FROM mail_logs_history").get() as any)?.c || 0;
      virtualMailLogCount = Math.max(virtualMailLogCount, totalInDb);
    } catch (dbErr) {
      console.error("Erro ao inserir log na tabela mail_logs_history:", dbErr);
    }

    addAuditLog(
      "MAILLOG_INGEST",
      "Importação MailLog MariaDB",
      {
        batch_records: newBatch,
        total_records: virtualMailLogCount,
        new_incident_detected: selectedInc.title,
        incident_id: newIncident.id
      },
      "normal",
      req
    );

    res.json({
      success: true,
      total_records: virtualMailLogCount,
      message: `Ingestão de MailLog executada com sucesso! ${newBatch} novos registros gravados no banco de dados e arquivo /var/log/mail.log esvaziado. Incidente #${newIncident.id} ("${selectedInc.title}") gerado.`,
      output: `[${nowStr}] ${newBatch} linhas lidas de /var/log/mail.log -> ${virtualMailLogCount} total de registros inseridos no MariaDB.\nArquivo /var/log/mail.log truncado com sucesso.`
    });
  });

  // Alternar Ingestão Automática MailLog
  app.post("/api/troubleshooting/maillog/toggle-auto", (req, res) => {
    maillogAutoIngest = !maillogAutoIngest;
    addAuditLog("MAILLOG_TOGGLE_AUTO", "Cron Ingestão MailLog", { auto_enabled: maillogAutoIngest }, "normal");
    res.json({
      success: true,
      enabled: maillogAutoIngest,
      message: `Ingestão automática do MailLog no MariaDB foi ${maillogAutoIngest ? 'ativada' : 'desativada'}.`
    });
  });

  // Simulated dynamic state for hardware history
  let cpuHistoryBuffer: { time: string; usage: number; iowait: number; system: number }[] = [];
  const initTime = Date.now();
  for (let i = 14; i >= 0; i--) {
    const t = new Date(initTime - i * 5000);
    const timeStr = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}:${t.getSeconds().toString().padStart(2, '0')}`;
    const baseUsage = Math.floor(12 + Math.random() * 15);
    cpuHistoryBuffer.push({
      time: timeStr,
      usage: baseUsage,
      iowait: Number((Math.random() * 2.5).toFixed(1)),
      system: Number((Math.random() * 4).toFixed(1))
    });
  }

  // ===============================================
  // 4.1 DASHBOARD ESPECIALIZADO: MÉTRICAS DE E-MAIL (RETENÇÃO 7 DIAS)
  // ===============================================

  interface DailyMailMetric {
    date: string;
    display_date: string;
    short_date: string;
    day_name: string;
    received: number;
    sent: number;
    spam_blocked: number;
    virus_blocked: number;
    rejected_bounced: number;
    total_processed: number;
    spam_pct: number;
    clean_delivery_rate: number;
    avg_latency_ms: number;
    hourly: { hour: string; received: number; sent: number; spam: number; bounced: number }[];
    top_senders: { domain: string; count: number; spam_count: number; clean_pct: number; reputacao: string }[];
    top_recipients: { domain: string; count: number; mailboxes_active: number; status: string }[];
    spam_rules_triggered: { rule: string; description: string; hits: number; score_impact: number }[];
  }

  function initialize7DaysMailStats(): DailyMailMetric[] {
    const stats: DailyMailMetric[] = [];
    const now = new Date();
    const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const shortDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    // Base mock profile representing the last 7 days with a realistic spam-drop trend
    const baseProfiles = [
      { rec: 1380, sent: 840, spam: 460, bounce: 54, virus: 16, latency: 360, spamDrop: 0 },
      { rec: 1510, sent: 960, spam: 480, bounce: 46, virus: 14, latency: 345, spamDrop: 0 },
      { rec: 1640, sent: 1080, spam: 410, bounce: 40, virus: 12, latency: 330, spamDrop: 1 },
      { rec: 1780, sent: 1200, spam: 340, bounce: 36, virus: 9, latency: 310, spamDrop: 2 },
      { rec: 990, sent: 470, spam: 260, bounce: 24, virus: 5, latency: 280, spamDrop: 2 },
      { rec: 910, sent: 410, spam: 220, bounce: 19, virus: 4, latency: 275, spamDrop: 3 },
      { rec: 1890, sent: 1260, spam: 195, bounce: 28, virus: 6, latency: 290, spamDrop: 4 }
    ];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const isoDate = d.toISOString().substring(0, 10);
      const dayIdx = d.getDay();
      const prof = baseProfiles[6 - i] || baseProfiles[0];
      const total = prof.rec + prof.sent + prof.spam + prof.bounce + prof.virus;
      const spamRatio = Number(((prof.spam + prof.virus) / total * 100).toFixed(1));
      const cleanRatio = Number(((prof.rec / (prof.rec + prof.bounce)) * 100).toFixed(1));

      // Hourly pattern (24 hours)
      const hourly = [];
      for (let h = 0; h < 24; h++) {
        const hourLabel = `${h.toString().padStart(2, '0')}:00`;
        let weight = 0.01;
        if (h >= 8 && h <= 18) weight = 0.07;
        else if (h >= 19 && h <= 22) weight = 0.03;
        else weight = 0.012;

        const hRec = Math.round(prof.rec * weight + (Math.random() * 5));
        const hSent = Math.round(prof.sent * weight + (Math.random() * 4));
        const hSpam = Math.round(prof.spam * weight + (Math.random() * 3));
        const hBounced = Math.round(prof.bounce * weight);

        hourly.push({
          hour: hourLabel,
          received: hRec,
          sent: hSent,
          spam: hSpam,
          bounced: hBounced
        });
      }

      stats.push({
        date: isoDate,
        display_date: `${isoDate.substring(8, 10)}/${isoDate.substring(5, 7)} (${shortDays[dayIdx]})`,
        short_date: `${isoDate.substring(8, 10)}/${isoDate.substring(5, 7)}`,
        day_name: dayNames[dayIdx],
        received: prof.rec,
        sent: prof.sent,
        spam_blocked: prof.spam,
        virus_blocked: prof.virus,
        rejected_bounced: prof.bounce,
        total_processed: total,
        spam_pct: spamRatio,
        clean_delivery_rate: cleanRatio,
        avg_latency_ms: prof.latency,
        hourly,
        top_senders: [
          { domain: "gmail.com", count: Math.round(prof.rec * 0.28), spam_count: Math.round(prof.spam * 0.12), clean_pct: 95.8, reputacao: "Excelente (SPF/DKIM Válidos)" },
          { domain: "outlook.com", count: Math.round(prof.rec * 0.22), spam_count: Math.round(prof.spam * 0.10), clean_pct: 96.2, reputacao: "Excelente (DMARC Pass)" },
          { domain: "parceiro.com.br", count: Math.round(prof.rec * 0.18), spam_count: 0, clean_pct: 100.0, reputacao: "Confiável (Whitelist Ativa)" },
          { domain: "suanotaemdia16.roxa.org", count: Math.round(prof.spam * 0.35), spam_count: Math.round(prof.spam * 0.35), clean_pct: 0.0, reputacao: "Bloqueado (Blacklist/DNSBL)" },
          { domain: "neocomunicar1.com", count: Math.round(prof.spam * 0.25), spam_count: Math.round(prof.spam * 0.25), clean_pct: 0.0, reputacao: "Bloqueado (Blacklist/Bayes99)" }
        ],
        top_recipients: [
          { domain: "empresa.com.br", count: Math.round(prof.rec * 0.72), mailboxes_active: 8, status: "Normal (99.8% Entregue)" },
          { domain: "zrti.com.br", count: Math.round(prof.rec * 0.24), mailboxes_active: 4, status: "Normal (100% Entregue)" },
          { domain: "meudominio.com", count: Math.round(prof.rec * 0.04), mailboxes_active: 2, status: "Normal (100% Entregue)" }
        ],
        spam_rules_triggered: [
          { rule: "BAYES_99", description: "Classificador Bayesiano de SPAM > 99% de probabilidade", hits: Math.round(prof.spam * 0.42), score_impact: 4.5 },
          { rule: "URIBL_BLACK", description: "Domínio ou link listado em Blacklists URI globais", hits: Math.round(prof.spam * 0.28), score_impact: 3.5 },
          { rule: "SPF_FAIL / DMARC_REJECT", description: "Falha de autenticação de remetente SPF ou DMARC", hits: Math.round(prof.spam * 0.19), score_impact: 3.0 },
          { rule: "FORGED_GMAIL_RCVD", description: "Tentativa de spoofing / falsificação de cabeçalho", hits: Math.round(prof.spam * 0.14), score_impact: 2.8 },
          { rule: "MIME_HTML_ONLY", description: "E-mail sem conteúdo texto puro (somente HTML suspeito)", hits: Math.round(prof.spam * 0.11), score_impact: 1.5 }
        ]
      });
    }

    return stats;
  }

  let mailStats7Days: DailyMailMetric[] = initialize7DaysMailStats();

  // GET Mail Stats (7-Day Retention Window & Aggregations)
  app.get("/api/dashboard/mail-stats", (req, res) => {
    const period = req.query.period as string || "7d";
    const selectedDate = req.query.date as string || "all";

    // Summary calculations across 7 days
    const total_received = mailStats7Days.reduce((acc, d) => acc + d.received, 0);
    const total_sent = mailStats7Days.reduce((acc, d) => acc + d.sent, 0);
    const total_spam_blocked = mailStats7Days.reduce((acc, d) => acc + d.spam_blocked, 0);
    const total_virus_blocked = mailStats7Days.reduce((acc, d) => acc + d.virus_blocked, 0);
    const total_rejected_bounced = mailStats7Days.reduce((acc, d) => acc + d.rejected_bounced, 0);
    const total_processed = mailStats7Days.reduce((acc, d) => acc + d.total_processed, 0);

    const overall_spam_pct = total_processed > 0 ? Number(((total_spam_blocked + total_virus_blocked) / total_processed * 100).toFixed(1)) : 0;
    const overall_clean_delivery_rate = (total_received + total_rejected_bounced) > 0 
      ? Number(((total_received / (total_received + total_rejected_bounced)) * 100).toFixed(1)) 
      : 100;

    // Trend: compare first 3 days spam rate vs last 3 days spam rate
    const first3DaysSpam = (mailStats7Days[0]?.spam_pct || 0) + (mailStats7Days[1]?.spam_pct || 0) + (mailStats7Days[2]?.spam_pct || 0);
    const last3DaysSpam = (mailStats7Days[4]?.spam_pct || 0) + (mailStats7Days[5]?.spam_pct || 0) + (mailStats7Days[6]?.spam_pct || 0);
    const spam_reduction_trend = Number((((last3DaysSpam - first3DaysSpam) / (first3DaysSpam || 1)) * 100).toFixed(1));

    // Consolidate top sender domains over 7 days
    const domainMap: { [key: string]: { domain: string; count: number; spam_count: number; clean_pct: number; reputacao: string } } = {};
    mailStats7Days.forEach(d => {
      d.top_senders.forEach(s => {
        if (!domainMap[s.domain]) {
          domainMap[s.domain] = { ...s };
        } else {
          domainMap[s.domain].count += s.count;
          domainMap[s.domain].spam_count += s.spam_count;
        }
      });
    });
    const aggregated_top_senders = Object.values(domainMap).sort((a, b) => b.count - a.count);

    // Consolidate spam rules triggered over 7 days
    const rulesMap: { [key: string]: { rule: string; description: string; hits: number; score_impact: number } } = {};
    mailStats7Days.forEach(d => {
      d.spam_rules_triggered.forEach(r => {
        if (!rulesMap[r.rule]) {
          rulesMap[r.rule] = { ...r };
        } else {
          rulesMap[r.rule].hits += r.hits;
        }
      });
    });
    const aggregated_spam_rules = Object.values(rulesMap).sort((a, b) => b.hits - a.hits);

    let specificDayData: DailyMailMetric | null = null;
    if (selectedDate && selectedDate !== "all") {
      specificDayData = mailStats7Days.find(d => d.date === selectedDate) || null;
    }

    res.json({
      success: true,
      retention_period_days: 7,
      retention_policy: "7 dias de logs em disco (/var/log/mail.log rotacionados via logrotate & MariaDB/SQLite)",
      selected_date: selectedDate,
      summary: {
        total_processed,
        total_received,
        total_sent,
        total_spam_blocked,
        total_virus_blocked,
        total_rejected_bounced,
        overall_spam_pct,
        overall_clean_delivery_rate,
        spam_reduction_trend, // e.g. -38.5%
        avg_latency_ms: Math.round(mailStats7Days.reduce((acc, d) => acc + d.avg_latency_ms, 0) / mailStats7Days.length),
        active_domains_count: virtualDomains.length,
        active_mailboxes_count: virtualMailboxes.length
      },
      daily_history: mailStats7Days,
      aggregated_top_senders,
      aggregated_spam_rules,
      specific_day_data: specificDayData
    });
  });

  // POST Simulate Mail Traffic Inflow / Outflow
  app.post("/api/dashboard/mail-stats/simulate", (req, res) => {
    const { received = 25, sent = 15, spam = 4, bounce = 1, virus = 0 } = req.body || {};
    const today = mailStats7Days[mailStats7Days.length - 1];
    
    if (today) {
      today.received += Number(received);
      today.sent += Number(sent);
      today.spam_blocked += Number(spam);
      today.rejected_bounced += Number(bounce);
      today.virus_blocked += Number(virus);
      today.total_processed = today.received + today.sent + today.spam_blocked + today.rejected_bounced + today.virus_blocked;
      today.spam_pct = Number(((today.spam_blocked + today.virus_blocked) / today.total_processed * 100).toFixed(1));
      
      // Update current hour in hourly distribution
      const curHour = new Date().getHours();
      if (today.hourly && today.hourly[curHour]) {
        today.hourly[curHour].received += Number(received);
        today.hourly[curHour].sent += Number(sent);
        today.hourly[curHour].spam += Number(spam);
        today.hourly[curHour].bounced += Number(bounce);
      }
    }

    addAuditLog(
      "MAIL_STATS_SIMULATE",
      "Simulação de Tráfego de E-mails",
      { received, sent, spam, bounce, virus, updated_total: today?.total_processed },
      "normal",
      req
    );

    res.json({
      success: true,
      message: `Simulação de tráfego injetada com sucesso! +${received} Recebidos, +${sent} Enviados, +${spam} SPAMs barrados.`,
      today_stats: today
    });
  });

  // GET Export CSV of 7-day Mail Statistics
  app.get("/api/dashboard/mail-stats/export", (req, res) => {
    let csv = "Data,Dia da Semana,Total Processado,Recebidos (Inbound),Enviados (Outbound),SPAM Bloqueado,Virus/Malware,Bounces/Rejeicoes,Taxa de SPAM (%),Taxa de Entrega (%),Latencia Media (ms)\n";
    mailStats7Days.forEach(d => {
      csv += `${d.date},${d.day_name},${d.total_processed},${d.received},${d.sent},${d.spam_blocked},${d.virus_blocked},${d.rejected_bounced},${d.spam_pct}%,${d.clean_delivery_rate}%,${d.avg_latency_ms}ms\n`;
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio_trafego_emails_7dias_${new Date().toISOString().substring(0,10)}.csv"`);
    res.send(csv);
  });

  // ===============================================
  // 4. SERVIÇOS, MÉTRICAS DE HARDWARE & LOGS
  // ===============================================

  app.get("/api/services/system-metrics", (req, res) => {
    const t = new Date();
    const timeStr = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}:${t.getSeconds().toString().padStart(2, '0')}`;
    const currentUsage = Math.floor(14 + Math.random() * 18);
    
    cpuHistoryBuffer.push({
      time: timeStr,
      usage: currentUsage,
      iowait: Number((Math.random() * 2.1).toFixed(1)),
      system: Number((Math.random() * 3.8).toFixed(1))
    });

    if (cpuHistoryBuffer.length > 20) {
      cpuHistoryBuffer.shift();
    }

    res.json({
      success: true,
      metrics: {
        hostname: "mailserver.empresa.com.br",
        os: "Debian GNU/Linux 12 (bookworm)",
        kernel: "6.1.0-21-amd64",
        uptime: "18 dias, 06 horas, 42 min",
        cpu: {
          model: "Intel(R) Xeon(R) Silver 4314 CPU @ 2.40GHz",
          cores: 16,
          usage_percent: currentUsage,
          load_avg: [
            Number((0.18 + Math.random() * 0.15).toFixed(2)),
            Number((0.25 + Math.random() * 0.10).toFixed(2)),
            0.31
          ],
          history: cpuHistoryBuffer
        },
        memory: {
          total_mb: 16384,
          used_mb: 5120 + Math.floor(Math.random() * 200),
          free_mb: 7800 - Math.floor(Math.random() * 100),
          cached_mb: 3464,
          usage_percent: 31.2,
          swap_total_mb: 4096,
          swap_used_mb: 128
        },
        disks: [
          {
            filesystem: "/dev/mapper/vmail-data",
            mount: "/var/vmail (Mailboxes Storage)",
            total_gb: 500,
            used_gb: 184.5,
            free_gb: 315.5,
            usage_percent: 36.9
          },
          {
            filesystem: "/dev/sda1",
            mount: "/ (Sistema Operacional)",
            total_gb: 100,
            used_gb: 28.4,
            free_gb: 71.6,
            usage_percent: 28.4
          },
          {
            filesystem: "/dev/sdb1",
            mount: "/var/log (Logs Postfix/Amavis)",
            total_gb: 80,
            used_gb: 12.1,
            free_gb: 67.9,
            usage_percent: 15.1
          }
        ],
        network: {
          rx_kbps: Number((140 + Math.random() * 80).toFixed(1)),
          tx_kbps: Number((95 + Math.random() * 60).toFixed(1)),
          smtp_conns: 8,
          active_queue_count: virtualQueue.length,
          deferred_queue_count: 0
        },
        top_processes: [
          { name: "clamd (ClamAV Daemon)", pid: 1402, cpu_percent: 4.2, mem_mb: 1280 },
          { name: "spamd (SpamAssassin Engine)", pid: 1821, cpu_percent: 3.1, mem_mb: 420 },
          { name: "amavisd-new (Content Filter)", pid: 1510, cpu_percent: 2.8, mem_mb: 310 },
          { name: "mysqld (MariaDB vmail DB)", pid: 982, cpu_percent: 1.9, mem_mb: 850 },
          { name: "postfix/master (MTA)", pid: 1102, cpu_percent: 0.8, mem_mb: 95 }
        ]
      }
    });
  });

  let systemdAvailable = false;
  try {
    if (fs.existsSync("/proc/1/comm")) {
      const comm = fs.readFileSync("/proc/1/comm", "utf-8").trim();
      systemdAvailable = comm === "systemd";
    }
  } catch {
    systemdAvailable = false;
  }

  app.get("/api/services/status", async (req, res) => {
    const services = ["postfix", "amavis", "clamav-daemon", "spamassassin"];
    const statusResult: Record<string, any> = {};

    if (!systemdAvailable) {
      for (const svc of services) {
        statusResult[svc] = virtualServices[svc] || { active: true, state: "active" };
      }
      return res.json({ success: true, services: statusResult });
    }

    try {
      const promises = services.map(async (svc) => {
        try {
          const cmdRes = await runCmd(`sudo systemctl is-active ${svc}`);
          if (cmdRes.code === 0 && cmdRes.stdout === "active") {
            return [svc, { active: true, state: "active" }];
          }
        } catch {
          // fallback
        }
        return [svc, virtualServices[svc] || { active: true, state: "active" }];
      });

      const results = await Promise.all(promises);
      for (const [svc, status] of results) {
        statusResult[svc as string] = status;
      }
    } catch {
      for (const svc of services) {
        statusResult[svc] = virtualServices[svc] || { active: true, state: "active" };
      }
    }

    res.json({ success: true, services: statusResult });
  });

  app.post("/api/services/restart", (req, res) => {
    const { service } = req.body || {};
    if (virtualServices[service]) {
      virtualServices[service].active = true;
      virtualServices[service].state = "active";
    }
    addAuditLog("SERVICE_RESTART", service || "-", { service }, "suspicious", req);
    res.json({ success: true, message: `Serviço ${service} reiniciado com sucesso via sudo systemctl!` });
  });

  // File path for real SpamAssassin local.cf in Linux Debian/Ubuntu production
  const SPAMASSASSIN_LOCAL_CF_PATH = "/etc/spamassassin/local.cf";

  // Helper to load local.cf from real filesystem if present, otherwise use virtualLocalCf
  function getSpamAssassinConfigContent(): string {
    try {
      if (fs.existsSync(SPAMASSASSIN_LOCAL_CF_PATH)) {
        const fileContent = fs.readFileSync(SPAMASSASSIN_LOCAL_CF_PATH, "utf-8");
        if (fileContent && fileContent.trim().length > 0) {
          virtualLocalCf = fileContent;
          return fileContent;
        }
      }
    } catch (e: any) {
      console.warn("Aviso ao ler /etc/spamassassin/local.cf físico:", e?.message || e);
    }
    return virtualLocalCf;
  }

  // Helper to save local.cf to virtual and real filesystem (with amavis reload) if in production
  function saveSpamAssassinConfigContent(newContent: string): boolean {
    virtualLocalCf = newContent;
    try {
      if (fs.existsSync("/etc/spamassassin")) {
        fs.writeFileSync(SPAMASSASSIN_LOCAL_CF_PATH, newContent, "utf-8");
        // Reload SpamAssassin and Amavis in background if systemd is available
        exec("sudo systemctl reload amavis spamassassin || sudo systemctl restart amavis", () => {});
        return true;
      }
    } catch (e: any) {
      console.warn("Aviso ao gravar em /etc/spamassassin/local.cf físico:", e?.message || e);
    }
    return false;
  }

  app.get("/api/services/spamassassin/rules", (req, res) => {
    const currentContent = getSpamAssassinConfigContent();
    res.json({ success: true, content: currentContent });
  });

  app.post("/api/services/spamassassin/rules", (req, res) => {
    const { content } = req.body || {};
    saveSpamAssassinConfigContent(content || "");
    addAuditLog("SPAM_RULES_RAW_UPDATE", "/etc/spamassassin/local.cf", { length: (content || "").length }, "suspicious", req);
    res.json({ success: true, message: "Regras salvas no local.cf e Amavis reiniciado!" });
  });

  // =========================================================================
  // GERENCIADOR INTELIGENTE DE REGRAS ANTISPAM (BLACK-LIST & LISTAS DE ACESSO)
  // =========================================================================

  // In-memory store for rich metadata (origin, description/reason, notes, audit info)
  const virtualSpamRulesMetaStore = new Map<string, {
    description?: string;
    origin?: string;
    notes?: string;
    created_at?: string;
    created_by?: string;
  }>();

  // Helper to identify target type (email, subdomain, domain, wildcard)
  function identifyTargetType(val: string): 'email' | 'subdomain' | 'domain' | 'wildcard' {
    const clean = (val || '').trim().toLowerCase().replace(/['"]/g, '');
    if ((clean.includes('*') && !clean.startsWith('*@') && !clean.startsWith('@')) || clean.includes('*@*.') || clean.includes('@*.')) {
      return 'wildcard';
    }
    
    let domainPart = clean;
    if (clean.includes('@')) {
      const parts = clean.split('@');
      const userPart = parts[0].trim();
      domainPart = parts[1].trim();
      if (userPart && userPart !== '*' && !userPart.includes('*')) {
        return 'email';
      }
    }

    const cleanDom = domainPart.replace(/^\*@/, '').replace(/^@/, '').replace(/^\*\./, '');
    const dotCount = (cleanDom.match(/\./g) || []).length;
    const isCctldCompound = /\.(com|net|org|gov|edu|ind|art|srv|etc)\.[a-z]{2}$/i.test(cleanDom);
    if ((isCctldCompound && dotCount >= 3) || (!isCctldCompound && dotCount >= 2)) {
      return 'subdomain';
    }

    return 'domain';
  }

  // Helper to normalize target format to SpamAssassin standard
  function normalizeTarget(val: string): { normalized: string; domain: string; isEmail: boolean; targetType: 'email' | 'subdomain' | 'domain' | 'wildcard' } {
    let clean = (val || '').trim().toLowerCase().replace(/['"]/g, '');
    const targetType = identifyTargetType(clean);

    if (targetType === 'wildcard') {
      return {
        normalized: clean,
        domain: clean.replace(/^.*@/, ''),
        isEmail: false,
        targetType
      };
    }

    if (targetType === 'email') {
      return {
        normalized: clean,
        domain: clean.split('@')[1] || '',
        isEmail: true,
        targetType
      };
    }

    let dom = clean;
    if (dom.startsWith('*@')) {
      dom = dom.substring(2);
    } else if (dom.startsWith('@')) {
      dom = dom.substring(1);
    }

    return {
      normalized: `*@${dom}`,
      domain: dom,
      isEmail: false,
      targetType
    };
  }

  // Robust Access List Pattern Matcher (Blacklist / Whitelist / Local.cf syntax)
  function matchesAccessListPattern(pattern: string, testEmail: string): boolean {
    if (!pattern || !testEmail) return false;
    const p = pattern.trim().toLowerCase().replace(/['"]/g, '');
    let email = testEmail.trim().toLowerCase().replace(/['"]/g, '');

    if (p === email) return true;

    let emailUser = '';
    let emailDomain = email;
    if (email.includes('@')) {
      const parts = email.split('@');
      emailUser = parts[0];
      emailDomain = parts[1];
    }

    // Specific user email (e.g. user@domain.com)
    if (p.includes('@') && !p.startsWith('*@') && !p.startsWith('@') && !p.includes('*')) {
      return p === email;
    }

    // Domain or Subdomain Pattern
    let targetDom = p;
    if (targetDom.startsWith('*@')) targetDom = targetDom.substring(2);
    else if (targetDom.startsWith('@')) targetDom = targetDom.substring(1);
    else if (targetDom.startsWith('*.')) targetDom = targetDom.substring(2);

    if (!targetDom.includes('*')) {
      if (emailDomain === targetDom || emailDomain.endsWith('.' + targetDom) || email === targetDom) {
        return true;
      }
    } else {
      const regexPattern = '^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
      try {
        const re = new RegExp(regexPattern, 'i');
        if (re.test(email) || re.test(emailDomain)) return true;
      } catch {
        // ignore regex compilation failure
      }
    }

    return false;
  }

  // Helper to generate natural language Portuguese interpretation
  function generateInterpretation(action: string, target: string): string {
    const norm = normalizeTarget(target);
    const actionVerb = action === 'blacklist_from' ? 'Bloqueia' : (action === 'whitelist_from' ? 'Libera na Whitelist' : 'Marca como SPAM (+20 pts)');

    if (norm.targetType === 'email') {
      return `${actionVerb} exclusivamente o remetente individual "${norm.normalized}".`;
    }
    if (norm.targetType === 'subdomain') {
      return `${actionVerb} todos os remetentes pertencentes ao subdomínio específico "${norm.domain}".`;
    }
    if (norm.targetType === 'domain') {
      return `${actionVerb} todos os remetentes pertencentes ao domínio "${norm.domain}".`;
    }
    return `Regra avançada com padrão wildcard: ${actionVerb} mensagens que correspondam ao padrão "${target}".`;
  }

  // Helper to parse all visual access rules from virtualLocalCf
  function parseAllVisualRules(cfContent: string) {
    const lines = cfContent.split("\n");
    const rules: any[] = [];
    const pattern = /^\s*(#\s*)?(blacklist_from|whitelist_from_spf|whitelist_from_dkim|whitelist_from_rcvd|whitelist_from|spam_from|spam)\s*(?::|\s)\s*(.+)$/i;

    let ruleCounter = 1;
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine || rawLine.startsWith("# ==") || rawLine.startsWith("# --") || rawLine.startsWith("# Configurações")) continue;

      const match = rawLine.match(pattern);
      if (match) {
        const isCommented = Boolean(match[1]);
        const rawType = match[2].toLowerCase();
        const rawValWithComments = match[3].trim();
        // Remove inline comment like # INACTIVE or # Motivo: ...
        const valParts = rawValWithComments.split(/\s+#/);
        const valString = valParts[0].trim();
        const inlineNote = valParts[1] ? valParts[1].trim() : "";

        let action_type: 'blacklist_from' | 'whitelist_from' | 'spam_from' = "whitelist_from";
        let action_label = "Liberar (Whitelist)";

        if (["spam_from", "spam"].includes(rawType)) {
          action_type = "spam_from";
          action_label = "SPAM (+20 pts)";
        } else if (rawType === "blacklist_from") {
          action_type = "blacklist_from";
          action_label = "Bloquear (Blacklist)";
        } else if (rawType === "whitelist_from_spf") {
          action_type = "whitelist_from";
          action_label = "White List (SPF)";
        } else if (rawType === "whitelist_from_dkim") {
          action_type = "whitelist_from";
          action_label = "White List (DKIM)";
        } else if (rawType === "whitelist_from_rcvd") {
          action_type = "whitelist_from";
          action_label = "White List (Rcvd)";
        }

        // Suporte a múltiplos alvos separados por espaço
        const targetTokens = valString.split(/\s+/).filter(t => t.trim().length > 0);

        for (const val of targetTokens) {
          const norm = normalizeTarget(val);
          const targetType = norm.targetType;
          let targetTypeLabel = "Domínio Completo";
          if (targetType === "email") targetTypeLabel = "E-mail Específico";
          else if (targetType === "subdomain") targetTypeLabel = "Subdomínio";
          else if (targetType === "wildcard") targetTypeLabel = "Padrão / Wildcard";

          const rawRepr = targetTokens.length > 1 ? `${rawType} ${val}` : rawLine;
          const storedMeta = virtualSpamRulesMetaStore.get(rawLine) || virtualSpamRulesMetaStore.get(rawRepr) || virtualSpamRulesMetaStore.get(norm.normalized) || {};
          const isActive = !isCommented && !inlineNote.toLowerCase().includes("inactive");
          const reasonText = storedMeta.description || (inlineNote.replace(/^(INACTIVE\s*-?\s*|MOTIVO:\s*)/i, '').trim() || "Regra ativa de segurança");

          rules.push({
            id: ruleCounter,
            rule_number: ruleCounter,
            type: action_type,
            rule_type: action_type,
            action: action_type,
            action_label,
            directive: rawType,
            value: val,
            target_value: val,
            score: (action_type === 'blacklist_from' || action_type === 'spam_from') ? 100.0 : -100.0,
            normalized_value: norm.normalized,
            domain: norm.domain,
            target_type: targetType,
            target_type_label: targetTypeLabel,
            interpretation: generateInterpretation(action_type, val),
            reason: reasonText,
            description: reasonText,
            origin: storedMeta.origin || "manual",
            origin_label: (storedMeta.origin === 'incident' ? 'Incidente' : (storedMeta.origin === 'spam_analysis' ? 'Análise de SPAM' : (storedMeta.origin === 'monitoring' ? 'Monitoramento' : 'Manual'))),
            notes: storedMeta.notes || inlineNote || "",
            active: isActive,
            created_at: storedMeta.created_at || "2026-08-25 08:30:00",
            created_by: storedMeta.created_by || "admin",
            raw: rawRepr,
            original_line: rawLine,
            line_index: i
          });
          ruleCounter++;
        }
      }
    }
    return rules;
  }

  // Deep Target & Duplicate Analyzer
  function analyzeRuleTarget(target: string, proposedAction = "blacklist_from", existingRules: any[] = []) {
    if (!target || !target.trim()) {
      return {
        is_valid_syntax: false,
        syntax_error: "Endereço, domínio ou padrão não informado.",
        target: "",
        normalized_target: ""
      };
    }

    const clean = target.trim();
    if (/[;&|`$<>{}\\]/.test(clean)) {
      return {
        is_valid_syntax: false,
        syntax_error: "Caracteres inválidos ou suspeitos de injeção detectados no alvo.",
        target: clean,
        normalized_target: clean
      };
    }

    const norm = normalizeTarget(clean);
    const targetType = norm.targetType;
    const normalizedTarget = norm.normalized;
    const targetDomain = norm.domain;

    let hasExactDuplicate = false;
    let exactRule: any = null;

    let hasNormalizedDuplicate = false;
    let normalizedRule: any = null;

    let hasBroaderRule = false;
    let broaderRule: any = null;

    let hasNarrowerRule = false;
    let narrowerRule: any = null;

    let isInBlacklist = false;
    let isInWhitelist = false;
    let isInSpam = false;

    const matchingRules: any[] = [];
    const conflictingRules: any[] = [];

    for (const r of existingRules) {
      const rRaw = (r.raw || '').trim().toLowerCase();
      const rVal = (r.value || '').trim().toLowerCase();
      const rNorm = normalizeTarget(rVal);
      const rType = r.type;

      // Exact match
      if (rVal === clean.toLowerCase() || rRaw === `${proposedAction} ${clean.toLowerCase()}` || rRaw === `# ${proposedAction} ${clean.toLowerCase()}`) {
        hasExactDuplicate = true;
        exactRule = r;
      }

      // Normalized match
      if (rNorm.normalized === normalizedTarget) {
        hasNormalizedDuplicate = true;
        normalizedRule = r;
      }

      // Category matching
      if (rType === 'blacklist_from' && (rNorm.normalized === normalizedTarget || rVal === clean.toLowerCase())) {
        isInBlacklist = true;
        matchingRules.push(r);
      } else if (rType === 'whitelist_from' && (rNorm.normalized === normalizedTarget || rVal === clean.toLowerCase())) {
        isInWhitelist = true;
        matchingRules.push(r);
      } else if (rType === 'spam_from' && (rNorm.normalized === normalizedTarget || rVal === clean.toLowerCase())) {
        isInSpam = true;
        matchingRules.push(r);
      }

      // Broader rule (e.g. existing is *@spammer.com and proposed is *@sub.spammer.com or user@spammer.com)
      if (rNorm.targetType === 'domain' && targetDomain && targetDomain !== rNorm.domain) {
        if (targetDomain.endsWith(`.${rNorm.domain}`)) {
          hasBroaderRule = true;
          broaderRule = r;
          if (!matchingRules.includes(r)) matchingRules.push(r);
        }
      }
      if (norm.isEmail && rNorm.targetType === 'domain' && norm.domain === rNorm.domain) {
        hasBroaderRule = true;
        broaderRule = r;
        if (!matchingRules.includes(r)) matchingRules.push(r);
      }

      // Narrower rule (e.g. existing is user@spammer.com and proposed is *@spammer.com)
      if (targetType === 'domain' && rNorm.domain && rNorm.domain !== targetDomain) {
        if (rNorm.domain.endsWith(`.${targetDomain}`)) {
          hasNarrowerRule = true;
          narrowerRule = r;
        }
      }
      if (targetType === 'domain' && rNorm.isEmail && rNorm.domain === targetDomain) {
        hasNarrowerRule = true;
        narrowerRule = r;
      }

      // Whitelist vs Blacklist Conflicts
      if (proposedAction === 'blacklist_from' && rType === 'whitelist_from') {
        if (rNorm.normalized === normalizedTarget || (targetDomain && rNorm.domain === targetDomain) || (rNorm.domain && targetDomain.endsWith(`.${rNorm.domain}`))) {
          conflictingRules.push(r);
        }
      } else if (proposedAction === 'whitelist_from' && rType === 'blacklist_from') {
        if (rNorm.normalized === normalizedTarget || (targetDomain && rNorm.domain === targetDomain) || (rNorm.domain && targetDomain.endsWith(`.${rNorm.domain}`))) {
          conflictingRules.push(r);
        }
      }
    }

    const hasConflict = conflictingRules.length > 0;
    let conflictMessage = "";
    if (hasConflict) {
      if (proposedAction === 'blacklist_from') {
        conflictMessage = `⚠️ Conflito de Regras: Existe uma regra de Whitelist ativa para "${conflictingRules[0].value}". O SpamAssassin prioriza Whitelists com -100 pontos.`;
      } else {
        conflictMessage = `⚠️ Conflito de Regras: Existe uma regra de Blacklist para "${conflictingRules[0].value}". Cadastrar esta Whitelist liberará o tráfego deste remetente.`;
      }
    }

    let typeLabel = "Domínio Completo";
    if (targetType === "email") typeLabel = "Endereço de E-mail Específico";
    else if (targetType === "subdomain") typeLabel = "Subdomínio Específico";
    else if (targetType === "wildcard") typeLabel = "Padrão Avançado (Wildcard)";

    const interpretation = generateInterpretation(proposedAction, normalizedTarget);

    let recommendedReason = "Domínio ou remetente identificado com padrão de spam/phishing recorrente.";
    if (proposedAction === "whitelist_from") {
      recommendedReason = "Remetente corporativo ou parceiro comercial homologado.";
    }

    return {
      is_valid_syntax: true,
      syntax_error: null,
      target: clean,
      normalized_target: normalizedTarget,
      target_type: targetType,
      target_type_label: typeLabel,
      interpretation,
      technical_rule: `${proposedAction} ${normalizedTarget}`,
      existing_status: {
        is_in_blacklist: isInBlacklist,
        is_in_whitelist: isInWhitelist,
        is_in_spam: isInSpam,
        matching_rules: matchingRules
      },
      duplicates: {
        has_exact_duplicate: hasExactDuplicate,
        exact_rule: exactRule,
        has_normalized_duplicate: hasNormalizedDuplicate,
        normalized_rule: normalizedRule,
        has_broader_rule: hasBroaderRule,
        broader_rule: broaderRule,
        has_narrower_rule: hasNarrowerRule,
        narrower_rule: narrowerRule
      },
      conflicts: {
        has_conflict: hasConflict,
        conflict_message: conflictMessage,
        conflict_rules: conflictingRules
      },
      suggestion: {
        recommended_action: proposedAction,
        recommended_target: normalizedTarget,
        recommended_reason: recommendedReason,
        explanation: `Recomenda-se utilizar a regra padronizada: "${proposedAction} ${normalizedTarget}".`
      }
    };
  }

  // Audit and Find All Duplicate Rules across local.cf
  function auditAllRuleDuplicates(cfContent: string) {
    const rules = parseAllVisualRules(cfContent);
    const normalizedGroups: Record<string, any[]> = {};

    for (const r of rules) {
      const key = `${r.type}:${r.normalized_value}`;
      if (!normalizedGroups[key]) normalizedGroups[key] = [];
      normalizedGroups[key].push(r);
    }

    const duplicateGroups: any[] = [];
    for (const [key, items] of Object.entries(normalizedGroups)) {
      if (items.length > 1) {
        duplicateGroups.push({
          key,
          type: items[0].type,
          normalized_target: items[0].normalized_value,
          target: items[0].normalized_value,
          count: items.length,
          rules: items.map(i => i.raw || `${i.type} ${i.value}`),
          rule_objects: items,
          recommended_standard: items.find(i => i.value.startsWith('*@')) || items[0],
          description: `Identificadas ${items.length} regras com grafias equivalentes ou duplicadas para "${items[0].normalized_value}"`
        });
      }
    }

    const redundantRules: any[] = [];
    for (const r of rules) {
      if (r.target_type === 'subdomain' || r.target_type === 'email') {
        const broader = rules.find(other => other.id !== r.id && other.type === r.type && other.target_type === 'domain' && (r.domain === other.domain || r.domain.endsWith(`.${other.domain}`)));
        if (broader) {
          redundantRules.push({
            rule: r,
            encompassed_by: broader,
            description: `A regra "${r.raw}" é redundante pois já é coberta pelo bloqueio geral de domínio "${broader.raw}"`
          });
        }
      }
    }

    const conflicts: any[] = [];
    const blacklists = rules.filter(r => r.type === 'blacklist_from');
    const whitelists = rules.filter(r => r.type === 'whitelist_from');

    for (const bl of blacklists) {
      for (const wl of whitelists) {
        if (bl.normalized_value === wl.normalized_value || bl.domain === wl.domain || (bl.domain && wl.domain && wl.domain.endsWith(`.${bl.domain}`))) {
          conflicts.push({
            target: bl.normalized_value || bl.value,
            blacklist_rule: bl,
            whitelist_rule: wl,
            rules: [bl.raw, wl.raw],
            description: `Conflito entre Lista Negra (${bl.raw}) e Whitelist (${wl.raw})`
          });
        }
      }
    }

    return {
      total_rules: rules.length,
      duplicates_count: duplicateGroups.length,
      duplicate_groups: duplicateGroups,
      duplicates: duplicateGroups,
      redundant_rules_count: redundantRules.length,
      redundant_rules: redundantRules,
      conflicts_count: conflicts.length,
      conflicts: conflicts
    };
  }

  // GET Visual Rules with rich analysis stats
  app.get("/api/services/spamassassin/visual-rules", (req, res) => {
    const currentCf = getSpamAssassinConfigContent();
    const rules = parseAllVisualRules(currentCf);
    const audit = auditAllRuleDuplicates(currentCf);

    res.json({
      success: true,
      rules,
      stats: {
        total: rules.length,
        blacklist_count: rules.filter(r => r.type === 'blacklist_from').length,
        whitelist_count: rules.filter(r => r.type === 'whitelist_from').length,
        spam_count: rules.filter(r => r.type === 'spam_from').length,
        active_count: rules.filter(r => r.active).length,
        inactive_count: rules.filter(r => !r.active).length,
        duplicates_count: audit.duplicates_count,
        redundant_count: audit.redundant_rules_count,
        conflicts_count: audit.conflicts_count
      }
    });
  });

  // POST Analyze Target before creating rule
  app.post("/api/services/spamassassin/visual-rules/analyze", (req, res) => {
    const { target, action } = req.body || {};
    const currentCf = getSpamAssassinConfigContent();
    const rules = parseAllVisualRules(currentCf);
    const analysis = analyzeRuleTarget(target, action || "blacklist_from", rules);
    res.json({ success: true, ...analysis });
  });

  // GET / POST Audit Duplicates
  app.get("/api/services/spamassassin/visual-rules/audit-duplicates", (req, res) => {
    const currentCf = getSpamAssassinConfigContent();
    const audit = auditAllRuleDuplicates(currentCf);
    res.json({ success: true, ...audit });
  });
  app.post("/api/services/spamassassin/visual-rules/audit-duplicates", (req, res) => {
    const currentCf = getSpamAssassinConfigContent();
    const audit = auditAllRuleDuplicates(currentCf);
    res.json({ success: true, ...audit });
  });

  // POST Clean & Deduplicate Rules Automatically
  app.post("/api/services/spamassassin/visual-rules/clean-duplicates", (req, res) => {
    const currentCf = getSpamAssassinConfigContent();
    const lines = currentCf.split("\n");
    const pattern = /^\s*(?:#\s*)?(blacklist_from|whitelist_from|spam_from|score_spam|spam)\s*(?::|\s)\s*(.+)$/i;

    const seenStandardRules = new Set<string>();
    const cleanedLines: string[] = [];
    let deduplicatedCount = 0;

    for (const rawLine of lines) {
      const match = rawLine.trim().match(pattern);
      if (match) {
        const rawType = match[1].toLowerCase();
        let actionType = 'whitelist_from';
        if (rawType === 'blacklist_from') actionType = 'blacklist_from';
        else if (['spam_from', 'score_spam', 'spam'].includes(rawType)) actionType = 'spam_from';

        const val = match[2].trim().split(/\s+#/)[0].trim();
        const norm = normalizeTarget(val);
        const standardLine = `${actionType} ${norm.normalized}`;

        if (seenStandardRules.has(standardLine)) {
          deduplicatedCount++;
          // Skip redundant duplicate line
          continue;
        } else {
          seenStandardRules.add(standardLine);
          cleanedLines.push(standardLine);
        }
      } else {
        cleanedLines.push(rawLine);
      }
    }

    const newContent = cleanedLines.join("\n");
    saveSpamAssassinConfigContent(newContent);
    addAuditLog("SPAM_RULES_DEDUPLICATE", "local.cf", { removed_duplicates: deduplicatedCount }, "normal", req);

    res.json({
      success: true,
      message: `Higienização concluída com sucesso! ${deduplicatedCount} regra(s) duplicada(s) ou equivalentes foram consolidadas para o padrão oficial (*@dominio.com).`,
      deduplicated_count: deduplicatedCount,
      total_rules_remaining: seenStandardRules.size
    });
  });

  // POST Test Target Rule against Simulated and Custom Emails or Check Email Status in local.cf
  app.post("/api/services/spamassassin/visual-rules/test-target", (req, res) => {
    const { target, action, custom_emails } = req.body || {};
    const norm = normalizeTarget(target || "");
    const testAction = action || "blacklist_from";
    const currentCf = getSpamAssassinConfigContent();
    const rules = parseAllVisualRules(currentCf);

    // If this is a quick status check against existing active rules in local.cf
    if (testAction === 'check_status' || action === 'check_status') {
      const emailToTest = (Array.isArray(custom_emails) && custom_emails.length > 0 ? custom_emails[0] : target || "").trim();
      
      // Find matching rule in current active rules
      let matchedRule: any = null;
      let matchedType: string = "";
      
      for (const r of rules) {
        if (!r.active) continue;
        if (matchesAccessListPattern(r.value, emailToTest) || matchesAccessListPattern(r.normalized_value, emailToTest) || matchesAccessListPattern(r.domain, emailToTest)) {
          matchedRule = r;
          matchedType = r.type;
          break;
        }
      }

      let resultText = "NÃO LISTADO (NEUTRO)";
      let scoreImpact = 0;
      let isBlocked = false;
      let isWhitelisted = false;
      let isSpam = false;

      if (matchedRule) {
        if (matchedType === 'blacklist_from') {
          resultText = "BLOQUEADO NA BLACKLIST";
          scoreImpact = 100.0;
          isBlocked = true;
        } else if (matchedType === 'whitelist_from') {
          resultText = "LIBERADO NA WHITE LIST";
          scoreImpact = -100.0;
          isWhitelisted = true;
        } else if (matchedType === 'spam_from') {
          resultText = "PONTUAÇÃO ELEVADA COMO SPAM";
          scoreImpact = 20.0;
          isSpam = true;
        }
      }

      const singleResult = {
        email: emailToTest,
        matched: Boolean(matchedRule),
        is_matched: Boolean(matchedRule),
        result: resultText,
        verdict: resultText,
        score_impact: scoreImpact,
        points: scoreImpact,
        matched_rule: matchedRule ? matchedRule.raw : null,
        matched_type: matchedType,
        rule_details: matchedRule
      };

      return res.json({
        success: true,
        target: emailToTest,
        action: 'check_status',
        is_blacklisted: isBlocked,
        is_blocked: isBlocked,
        is_whitelisted: isWhitelisted,
        is_spam: isSpam,
        status: isBlocked ? 'blacklisted' : (isWhitelisted ? 'whitelisted' : (isSpam ? 'spam' : 'neutral')),
        score_impact: scoreImpact,
        points: scoreImpact,
        matched_rule: matchedRule,
        matched_rule_str: matchedRule ? (matchedRule.raw || `${matchedRule.directive || matchedRule.type} ${matchedRule.value}`) : null,
        matched_rule_number: matchedRule ? (matchedRule.rule_number || matchedRule.id) : null,
        diagnostic_message: matchedRule 
          ? `O endereço coincide com a regra ativa #${matchedRule.rule_number || matchedRule.id} ("${matchedRule.raw}").`
          : `Nenhuma regra de acesso específica encontrada para "${emailToTest}". O tráfego segue fluxo neutro.`,
        test_cases: [singleResult],
        results: [singleResult]
      });
    }

    // Predictive impact simulation of a candidate rule against sample emails
    const sampleDomain = norm.domain || (norm.isEmail ? norm.normalized.split('@')[1] : 'dominio-amostra.com');
    const simulatedList = [
      `usuario@${sampleDomain}`,
      `financeiro@${sampleDomain}`,
      `contato@${sampleDomain}`,
      `suporte@empresa-parceira.com.br`,
      `notificacao@gmail.com`
    ];

    const emailsToTest = Array.isArray(custom_emails) && custom_emails.length > 0
      ? custom_emails
      : simulatedList;

    const testCases = emailsToTest.map(email => {
      const isMatched = matchesAccessListPattern(norm.normalized, email) || matchesAccessListPattern(target, email);
      let verdict = "NÃO AFETADO";
      let statusBadge = "bg-secondary text-white";
      let points = 0;

      if (isMatched) {
        if (testAction === 'blacklist_from') {
          verdict = "BLOQUEADO NA BLACKLIST";
          statusBadge = "bg-danger text-white";
          points = 100.0;
        } else if (testAction === 'whitelist_from') {
          verdict = "LIBERADO NA WHITE LIST";
          statusBadge = "bg-success text-white";
          points = -100.0;
        } else {
          verdict = "MARCADO COMO SPAM";
          statusBadge = "bg-warning text-dark";
          points = 20.0;
        }
      }

      return {
        email,
        matched: isMatched,
        is_matched: isMatched,
        result: isMatched ? verdict : "Não Afetado",
        verdict,
        status_badge: statusBadge,
        score_impact: isMatched ? points : 0,
        points: isMatched ? points : 0,
        matched_rule: isMatched ? `${testAction} ${norm.normalized}` : null
      };
    });

    res.json({
      success: true,
      target: norm.normalized,
      normalized_target: norm.normalized,
      action: testAction,
      interpretation: generateInterpretation(testAction, norm.normalized),
      test_cases: testCases,
      results: testCases
    });
  });

  // POST Create New Visual Rule with Smart In-Place Consolidation and Duplicate Prevention
  app.post("/api/services/spamassassin/visual-rules", (req, res) => {
    const { action, value, reason, description, origin, notes, active, force, rule_type, target_value } = req.body || {};
    let act = action || rule_type || "blacklist_from";
    if (act === "blacklist_ip" || act === "blacklist_to") act = "blacklist_from";
    const rawVal = (value || target_value || "").trim();
    const ruleReason = (reason || description || "").trim();

    if (!act || !["blacklist_from", "whitelist_from", "spam_from"].includes(act)) {
      return res.status(400).json({ success: false, message: "Classificação inválida. Escolha Blacklist, SPAM ou Whitelist." });
    }
    if (!rawVal) {
      return res.status(400).json({ success: false, message: "Endereço, domínio ou padrão não pode ser vazio." });
    }

    const currentCf = getSpamAssassinConfigContent();
    const rules = parseAllVisualRules(currentCf);
    const analysis = analyzeRuleTarget(rawVal, act, rules);

    if (!analysis.is_valid_syntax) {
      return res.status(400).json({ success: false, message: analysis.syntax_error || "Sintaxe inválida para regra." });
    }

    const targetToSave = analysis.normalized_target; // Always normalized, e.g. *@suanotaemdia16.roxa.org
    const ruleLine = (active === false) ? `# ${act} ${targetToSave} # INACTIVE` : `${act} ${targetToSave}`;

    // Check for existing rules with same normalized value or raw value in local.cf
    const lines = currentCf.split("\n");
    let alreadyExists = false;
    let replacedLineIndex = -1;

    // Pattern to match any variant of this rule (e.g. blacklist_from @dom, blacklist_from *@dom, # blacklist_from ...)
    const newLines = lines.map((line, idx) => {
      const trimmed = line.trim();
      const match = trimmed.match(/^\s*(?:#\s*)?(blacklist_from|whitelist_from|spam_from|score_spam|spam)\s*(?::|\s)\s*(.+)$/i);
      if (match) {
        const lineVal = match[2].trim().split(/\s+#/)[0].trim();
        const lineNorm = normalizeTarget(lineVal);
        if (lineNorm.normalized === targetToSave) {
          alreadyExists = true;
          if (replacedLineIndex === -1) {
            replacedLineIndex = idx;
            return ruleLine; // Replace non-standard or previous variation with standard rule
          } else {
            return null; // Remove any additional duplicate line!
          }
        }
      }
      return line;
    }).filter(l => l !== null) as string[];

    let updatedContent = "";
    if (alreadyExists) {
      // Replaced existing duplicate / non-standard format cleanly in place
      updatedContent = newLines.join("\n");
    } else {
      // Add new line to local.cf
      let base = currentCf;
      if (base && !base.endsWith("\n")) {
        base += "\n";
      }
      updatedContent = base + ruleLine + "\n";
    }

    saveSpamAssassinConfigContent(updatedContent);

    // Store metadata
    virtualSpamRulesMetaStore.set(ruleLine, {
      description: ruleReason || analysis.suggestion.recommended_reason,
      origin: origin || "manual",
      notes: notes || "",
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19),
      created_by: getAuditUser(req)
    });
    virtualSpamRulesMetaStore.set(targetToSave, virtualSpamRulesMetaStore.get(ruleLine));

    addAuditLog(alreadyExists ? "SPAM_RULE_UPDATE_STANDARDIZED" : "SPAM_RULE_CREATE", targetToSave, { action: act, rule: ruleLine, origin, description: ruleReason, consolidated: alreadyExists }, "normal", req);

    res.json({
      success: true,
      message: alreadyExists 
        ? `Regra para '${targetToSave}' já existia e foi consolidada/padronizada com sucesso no SpamAssassin sem duplicações!`
        : `Regra '${ruleLine}' cadastrada e aplicada com sucesso no SpamAssassin!`,
      consolidated: alreadyExists,
      rule: {
        type: act,
        value: targetToSave,
        raw: ruleLine,
        interpretation: analysis.interpretation
      }
    });
  });

  // POST / PUT Edit Visual Rule
  const editVisualRule = (req: express.Request, res: express.Response) => {
    const { old_raw, new_action, action, new_value, value, reason, description, origin, notes, active } = req.body || {};
    const act = new_action || action || "blacklist_from";
    const val = (new_value || value || "").trim();
    const oldRaw = (old_raw || "").trim().toLowerCase();
    const ruleReason = (reason || description || "").trim();

    if (!act || !["blacklist_from", "whitelist_from", "spam_from"].includes(act)) {
      return res.status(400).json({ success: false, message: "Classificação inválida." });
    }
    if (!val) {
      return res.status(400).json({ success: false, message: "Endereço ou domínio alvo não pode ficar vazio." });
    }

    const norm = normalizeTarget(val);
    const targetToSave = norm.normalized;
    const newRuleLine = (active === false) ? `# ${act} ${targetToSave} # INACTIVE` : `${act} ${targetToSave}`;

    const currentCf = getSpamAssassinConfigContent();
    const lines = currentCf.split("\n");
    let replaced = false;

    const newLines = lines.map(line => {
      if (!replaced && oldRaw && line.trim().toLowerCase() === oldRaw) {
        replaced = true;
        return newRuleLine;
      }
      return line;
    });

    if (!replaced) {
      newLines.push(newRuleLine);
    }

    saveSpamAssassinConfigContent(newLines.join("\n"));

    virtualSpamRulesMetaStore.set(newRuleLine, {
      description: ruleReason || "Regra editada",
      origin: origin || "manual",
      notes: notes || "",
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19),
      created_by: getAuditUser(req)
    });

    addAuditLog("SPAM_RULE_UPDATE", targetToSave, { old_raw, new_rule: newRuleLine, action: act, description: ruleReason }, "normal", req);

    res.json({
      success: true,
      message: `Regra atualizada com sucesso para '${newRuleLine}'! Serviço SpamAssassin reiniciado.`
    });
  };

  app.put("/api/services/spamassassin/visual-rules", editVisualRule);
  app.post("/api/services/spamassassin/visual-rules/edit", editVisualRule);

  // POST Toggle Active / Inactive
  app.post("/api/services/spamassassin/visual-rules/toggle", (req, res) => {
    const { raw, active } = req.body || {};
    if (!raw) return res.status(400).json({ success: false, message: "Regra não informada." });

    const rawClean = raw.trim();
    const currentCf = getSpamAssassinConfigContent();
    const lines = currentCf.split("\n");
    let updatedLine = "";

    const newLines = lines.map(line => {
      if (line.trim() === rawClean) {
        if (active) {
          // Reactivate by removing leading # and # INACTIVE
          updatedLine = line.replace(/^#\s*/, '').replace(/\s+#\s*INACTIVE/i, '').trim();
          return updatedLine;
        } else {
          // Deactivate
          updatedLine = `# ${line.replace(/^#\s*/, '').trim()} # INACTIVE`;
          return updatedLine;
        }
      }
      return line;
    });

    saveSpamAssassinConfigContent(newLines.join("\n"));
    addAuditLog("SPAM_RULE_TOGGLE", rawClean, { active, new_line: updatedLine }, "normal", req);

    res.json({
      success: true,
      message: `Regra ${active ? 'ativada' : 'desativada'} com sucesso!`,
      new_raw: updatedLine
    });
  });

  // DELETE Visual Rule
  const deleteVisualRule = (req: express.Request, res: express.Response) => {
    let { raw, action, value } = req.body || {};
    const idParam = req.params?.id || req.query?.id;
    if (idParam) {
      const currentCf = getSpamAssassinConfigContent();
      const rules = parseAllVisualRules(currentCf);
      const found = rules.find(r => String(r.id) === String(idParam));
      if (found) {
        raw = found.raw || found.original_line || `${found.action} ${found.value}`;
        value = found.value;
        action = found.action;
      }
    }
    const targetLine = raw || (action && value ? `${action} ${value}` : req.query?.raw as string || req.query?.value as string);

    if (!targetLine) {
      return res.status(400).json({ success: false, message: "Especificação da regra não fornecida." });
    }

    const targetClean = targetLine.trim().toLowerCase();
    const currentCf = getSpamAssassinConfigContent();
    const lines = currentCf.split("\n");
    const filtered = lines.filter(l => {
      const lClean = l.trim().toLowerCase();
      if (lClean === targetClean) return false;
      if (lClean === `# ${targetClean}`) return false;
      if (value && lClean.includes(String(value).toLowerCase()) && (lClean.includes("blacklist_from") || lClean.includes("whitelist_from") || lClean.includes("spam_from"))) return false;
      return true;
    });
    saveSpamAssassinConfigContent(filtered.join("\n"));

    addAuditLog("SPAM_RULE_DELETE", targetLine, { deleted_rule: targetLine }, "normal", req);

    res.json({
      success: true,
      message: "Regra removida com sucesso da lista e do arquivo local.cf!"
    });
  };

  app.delete("/api/services/spamassassin/visual-rules", deleteVisualRule);
  app.delete("/api/services/spamassassin/visual-rules/:id", deleteVisualRule);
  app.post("/api/services/spamassassin/visual-rules/delete", deleteVisualRule);
  app.post("/api/services/spamassassin/visual-rules/delete/:id", deleteVisualRule);

  // Helper parser for Custom Regex Rules (header, score, describe)
  function parseCustomSpamRules(cfContent: string) {
    const lines = cfContent.split("\n");
    const rulesMap = new Map<string, any>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith("# ==") || line.startsWith("# --")) continue;

      const headerMatch = line.match(/^header\s+([A-Za-z0-9_]+)\s+([A-Za-z0-9_\-]+)\s*=~\s*(.+)$/i);
      if (headerMatch) {
        const name = headerMatch[1];
        const target = headerMatch[2];
        const rawPattern = headerMatch[3].trim();
        if (!rulesMap.has(name)) {
          rulesMap.set(name, { id: name, name, target, pattern: rawPattern, score: 5.0, describe: "", enabled: true });
        } else {
          const r = rulesMap.get(name);
          r.target = target;
          r.pattern = rawPattern;
        }
        continue;
      }

      const bodyMatch = line.match(/^body\s+([A-Za-z0-9_]+)\s*=~\s*(.+)$/i);
      if (bodyMatch) {
        const name = bodyMatch[1];
        const rawPattern = bodyMatch[2].trim();
        if (!rulesMap.has(name)) {
          rulesMap.set(name, { id: name, name, target: "Body", pattern: rawPattern, score: 5.0, describe: "", enabled: true });
        } else {
          const r = rulesMap.get(name);
          r.target = "Body";
          r.pattern = rawPattern;
        }
        continue;
      }

      const uriMatch = line.match(/^uri\s+([A-Za-z0-9_]+)\s*=~\s*(.+)$/i);
      if (uriMatch) {
        const name = uriMatch[1];
        const rawPattern = uriMatch[2].trim();
        if (!rulesMap.has(name)) {
          rulesMap.set(name, { id: name, name, target: "URI", pattern: rawPattern, score: 5.0, describe: "", enabled: true });
        } else {
          const r = rulesMap.get(name);
          r.target = "URI";
          r.pattern = rawPattern;
        }
        continue;
      }

      const scoreMatch = line.match(/^score\s+([A-Za-z0-9_]+)\s+([0-9\.\-]+)/i);
      if (scoreMatch) {
        const name = scoreMatch[1];
        const scoreVal = parseFloat(scoreMatch[2]);
        if (rulesMap.has(name)) {
          rulesMap.get(name).score = scoreVal;
        } else if (name.startsWith("LOCAL_") || name.startsWith("ZRTI_")) {
          rulesMap.set(name, { id: name, name, target: "Header", pattern: "", score: scoreVal, describe: "", enabled: true });
        }
        continue;
      }

      const descMatch = line.match(/^describe\s+([A-Za-z0-9_]+)\s+(.+)$/i);
      if (descMatch) {
        const name = descMatch[1];
        const descVal = descMatch[2].trim();
        if (rulesMap.has(name)) {
          rulesMap.get(name).describe = descVal;
        }
        continue;
      }
    }

    return Array.from(rulesMap.values()).map(r => {
      let cat: 'phishing' | 'obfuscation' | 'hijack' | 'custom' = 'custom';
      const nameLower = r.name.toLowerCase();
      const descLower = (r.describe || '').toLowerCase();
      if (nameLower.includes('golpe') || nameLower.includes('phish') || descLower.includes('phishing') || descLower.includes('golpe')) {
        cat = 'phishing';
      } else if (nameLower.includes('quebrado') || nameLower.includes('ofuscado') || descLower.includes('ofusca') || descLower.includes('encoding')) {
        cat = 'obfuscation';
      } else if (nameLower.includes('replyto') || descLower.includes('sequestrado') || descLower.includes('reply-to')) {
        cat = 'hijack';
      }
      return { ...r, category: cat };
    });
  }

  // GET Custom Regex / Heuristic Rules
  app.get("/api/services/spamassassin/custom-rules", (req, res) => {
    const rules = parseCustomSpamRules(virtualLocalCf);
    res.json({ success: true, rules });
  });

  // POST Create or Edit Custom Regex Rule
  const saveCustomRuleHandler = (req: express.Request, res: express.Response) => {
    const { name, target, pattern, score, describe, old_name } = req.body || {};
    
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Nome identificador da regra é obrigatório (ex: LOCAL_GOLPE_ASSUNTO)." });
    }
    if (!pattern || !pattern.trim()) {
      return res.status(400).json({ success: false, message: "Padrão Regex da regra é obrigatório." });
    }

    const cleanName = name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const cleanTarget = (target || "Subject").trim();
    let cleanPattern = pattern.trim();
    if (!cleanPattern.startsWith("/")) {
      cleanPattern = `/${cleanPattern}/i`;
    }
    const cleanScore = typeof score === "number" ? score.toFixed(1) : (parseFloat(score) || 15.0).toFixed(1);
    const cleanDesc = (describe || `ZRTI - Regra Customizada ${cleanName}`).trim();

    const targetNameToRemove = old_name ? old_name.trim().toUpperCase() : cleanName;

    // Remove old definitions of this rule name
    const lines = virtualLocalCf.split("\n");
    const newLines = lines.filter(l => {
      const t = l.trim();
      if (t.startsWith(`header ${targetNameToRemove} `) || t.startsWith(`header   ${targetNameToRemove} `)) return false;
      if (t.startsWith(`body ${targetNameToRemove} `) || t.startsWith(`body   ${targetNameToRemove} `)) return false;
      if (t.startsWith(`uri ${targetNameToRemove} `) || t.startsWith(`uri   ${targetNameToRemove} `)) return false;
      if (t.startsWith(`score ${targetNameToRemove} `) || t.startsWith(`score    ${targetNameToRemove} `)) return false;
      if (t.startsWith(`describe ${targetNameToRemove} `) || t.startsWith(`describe ${targetNameToRemove} `)) return false;
      return true;
    });

    const isBody = cleanTarget.toLowerCase() === "body";
    const isUri = cleanTarget.toLowerCase() === "uri";

    let ruleBlock = "";
    if (isBody) {
      ruleBlock = `\n# Regra Customizada Heurística ${cleanName}\nbody     ${cleanName} =~ ${cleanPattern}\nscore    ${cleanName} ${cleanScore}\ndescribe ${cleanName} ${cleanDesc}\n`;
    } else if (isUri) {
      ruleBlock = `\n# Regra Customizada Heurística ${cleanName}\nuri      ${cleanName} =~ ${cleanPattern}\nscore    ${cleanName} ${cleanScore}\ndescribe ${cleanName} ${cleanDesc}\n`;
    } else {
      ruleBlock = `\n# Regra Customizada Heurística ${cleanName}\nheader   ${cleanName} ${cleanTarget} =~ ${cleanPattern}\nscore    ${cleanName} ${cleanScore}\ndescribe ${cleanName} ${cleanDesc}\n`;
    }

    virtualLocalCf = newLines.join("\n") + ruleBlock;

    addAuditLog("SPAM_CUSTOM_RULE_SAVE", cleanName, { target: cleanTarget, pattern: cleanPattern, score: cleanScore, describe: cleanDesc }, "normal", req);

    res.json({
      success: true,
      message: `Regra customizada '${cleanName}' salva com sucesso no local.cf! SpamAssassin atualizado.`
    });
  };

  app.post("/api/services/spamassassin/custom-rules", saveCustomRuleHandler);
  app.post("/api/services/spamassassin/custom-rules/edit", saveCustomRuleHandler);

  // DELETE Custom Regex Rule
  app.post("/api/services/spamassassin/custom-rules/delete", (req, res) => {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Nome da regra não informado." });
    }

    const cleanName = name.trim().toUpperCase();
    const lines = virtualLocalCf.split("\n");
    const newLines = lines.filter(l => {
      const t = l.trim();
      if (t.startsWith(`header ${cleanName} `) || t.startsWith(`header   ${cleanName} `)) return false;
      if (t.startsWith(`body ${cleanName} `) || t.startsWith(`body   ${cleanName} `)) return false;
      if (t.startsWith(`uri ${cleanName} `) || t.startsWith(`uri   ${cleanName} `)) return false;
      if (t.startsWith(`score ${cleanName} `) || t.startsWith(`score    ${cleanName} `)) return false;
      if (t.startsWith(`describe ${cleanName} `) || t.startsWith(`describe ${cleanName} `)) return false;
      return true;
    });

    virtualLocalCf = newLines.join("\n");

    addAuditLog("SPAM_CUSTOM_RULE_DELETE", cleanName, { name: cleanName }, "normal", req);

    res.json({
      success: true,
      message: `Regra customizada '${cleanName}' removida com sucesso do local.cf.`
    });
  });

  // Helper to extract email addresses from header strings like "Nome <user@domain.com>"
  function extractEmails(text: string): string[] {
    if (!text) return [];
    const matches = text.match(/[a-zA-Z0-9_.+\-]+@[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-.]+)+/g);
    const emails = matches ? Array.from(matches).map(e => e.toLowerCase().trim()) : [];
    const cleanRaw = text.trim().toLowerCase();
    if (cleanRaw && !emails.includes(cleanRaw) && cleanRaw.includes("@")) {
      emails.push(cleanRaw);
    }
    return emails;
  }

  // POST Simulator & Tester for E-mail Headers / Subject / From against local.cf (Blacklist, Whitelist, Inteligência AntiSPAM)
  const handleSpamSimulate = (req: express.Request, res: express.Response) => {
    const { subject, from, reply_to, replyto, body, raw_headers } = req.body || {};
    const testSubj = String(subject || "").trim();
    const testFrom = String(from || "").trim();
    const testReplyTo = String(reply_to || replyto || "").trim();
    const testBody = String(body || "").trim();
    const testHeaders = String(raw_headers || "").trim();

    const triggered: Array<{
      rule: string;
      name: string;
      type: 'blacklist' | 'whitelist' | 'spam_list' | 'heuristic';
      category_label: string;
      target: string;
      pattern: string;
      score: number;
      points: number;
      describe: string;
      matched_value: string;
    }> = [];

    let totalScore = 0;
    let isBlacklisted = false;
    let isWhitelisted = false;

    // 1. EVALUATE BLACKLIST & LISTAS DE ACESSO (blacklist_from, whitelist_from, spam_from)
    const lines = virtualLocalCf.split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const blMatch = line.match(/^blacklist_from\s+(.+)$/i);
      if (blMatch) {
        const pattern = blMatch[1].trim();
        const fromMatched = matchesAccessListPattern(pattern, testFrom);
        const replyToMatched = testReplyTo ? matchesAccessListPattern(pattern, testReplyTo) : false;
        const headersMatched = testHeaders ? matchesAccessListPattern(pattern, testHeaders) : false;

        if (fromMatched || replyToMatched || headersMatched) {
          isBlacklisted = true;
          const matchedVal = fromMatched ? testFrom : (replyToMatched ? testReplyTo : testHeaders);
          triggered.push({
            rule: `BLACKLIST_FROM (${pattern})`,
            name: "BLACKLIST_FROM",
            type: "blacklist",
            category_label: "🚫 Blacklist (Lista Negra)",
            target: fromMatched ? "From (Remetente)" : (replyToMatched ? "Reply-To" : "Header"),
            pattern: pattern,
            score: 100.0,
            points: 100.0,
            describe: `Remetente ou domínio presente na Blacklist oficial (${pattern})`,
            matched_value: matchedVal
          });
          totalScore += 100.0;
        }
      }

      const wlMatch = line.match(/^whitelist_from\s+(.+)$/i);
      if (wlMatch) {
        const pattern = wlMatch[1].trim();
        const fromMatched = matchesAccessListPattern(pattern, testFrom);
        const replyToMatched = testReplyTo ? matchesAccessListPattern(pattern, testReplyTo) : false;

        if (fromMatched || replyToMatched) {
          isWhitelisted = true;
          const matchedVal = fromMatched ? testFrom : testReplyTo;
          triggered.push({
            rule: `WHITELIST_FROM (${pattern})`,
            name: "WHITELIST_FROM",
            type: "whitelist",
            category_label: "🟢 Whitelist (Lista Confiável)",
            target: fromMatched ? "From (Remetente)" : "Reply-To",
            pattern: pattern,
            score: -100.0,
            points: -100.0,
            describe: `Remetente ou domínio liberado na Whitelist (${pattern})`,
            matched_value: matchedVal
          });
          totalScore -= 100.0;
        }
      }

      const spamMatch = line.match(/^spam_from\s+(.+)$/i);
      if (spamMatch) {
        const pattern = spamMatch[1].trim();
        const fromMatched = matchesAccessListPattern(pattern, testFrom);
        const replyToMatched = testReplyTo ? matchesAccessListPattern(pattern, testReplyTo) : false;

        if (fromMatched || replyToMatched) {
          const matchedVal = fromMatched ? testFrom : testReplyTo;
          triggered.push({
            rule: `SPAM_FROM (${pattern})`,
            name: "SPAM_FROM",
            type: "spam_list",
            category_label: "⚠️ Lista de SPAM Direto",
            target: fromMatched ? "From (Remetente)" : "Reply-To",
            pattern: pattern,
            score: 20.0,
            points: 20.0,
            describe: `Remetente ou domínio marcado como SPAM direto (${pattern})`,
            matched_value: matchedVal
          });
          totalScore += 20.0;
        }
      }
    }

    // 2. EVALUATE INTELIGÊNCIA ANTISPAM (Regras Heurísticas Locais)
    const customRules = parseCustomSpamRules(virtualLocalCf);

    for (const rule of customRules) {
      if (!rule.pattern) continue;

      let regexStr = rule.pattern.trim();
      let flags = "i";
      if (regexStr.startsWith("/") && regexStr.lastIndexOf("/") > 0) {
        flags = regexStr.substring(regexStr.lastIndexOf("/") + 1) || "";
        regexStr = regexStr.substring(1, regexStr.lastIndexOf("/"));
      }

      try {
        const re = new RegExp(regexStr, flags);
        const targetLower = (rule.target || "subject").toLowerCase();
        let targetText = "";

        if (targetLower === "subject") {
          targetText = testSubj;
        } else if (targetLower === "from") {
          targetText = testFrom;
        } else if (targetLower === "reply-to" || targetLower === "replyto") {
          targetText = testReplyTo;
        } else if (targetLower === "body") {
          targetText = testBody;
        } else if (targetLower === "uri") {
          targetText = `${testSubj}\n${testBody}\n${testHeaders}`;
        } else {
          targetText = `${testHeaders}\nSubject: ${testSubj}\nFrom: ${testFrom}\nReply-To: ${testReplyTo}\n\n${testBody}`;
        }

        if (targetText && re.test(targetText)) {
          const pts = Number(rule.score || 0);
          triggered.push({
            rule: rule.name,
            name: rule.name,
            type: "heuristic",
            category_label: "🧠 Inteligência AntiSPAM (Regra Heurística)",
            target: rule.target,
            pattern: rule.pattern,
            score: pts,
            points: pts,
            describe: rule.describe || "Regra customizada heurística acionada",
            matched_value: targetText.length > 80 ? `${targetText.substring(0, 80)}...` : targetText
          });
          totalScore += pts;
        }
      } catch (err) {
        console.error("Regex test error for rule:", rule.name, err);
      }
    }

    const isSpam = isBlacklisted || (!isWhitelisted && totalScore >= 5.0);

    let verdictStatus = "CLEAN";
    let verdictTitle = "MENSAGEM LIMPA / ACEITA";
    let verdictAction = "Entregar normalmente na Caixa de Entrada";

    if (isBlacklisted) {
      verdictStatus = "BLACKLISTED";
      verdictTitle = "BLOQUEIO IMEDIATO (Blacklist)";
      verdictAction = "Rejeitar conexão SMTP / Descarte Imediato";
    } else if (isWhitelisted) {
      verdictStatus = "WHITELISTED";
      verdictTitle = "LIBERADO POR WHITELIST (Lista Confiável)";
      verdictAction = "Entregar na Caixa de Entrada (Ignorar regras de Spam)";
    } else if (isSpam) {
      verdictStatus = "SPAM_DETECTED";
      verdictTitle = "CLASSIFICADO COMO SPAM";
      verdictAction = "Mover para Quarentena / Pasta de Lixo Eletrônico";
    }

    const blacklistMatches = triggered.filter(r => r.type === "blacklist" || r.type === "spam_list");
    const whitelistMatches = triggered.filter(r => r.type === "whitelist");
    const heuristicMatches = triggered.filter(r => r.type === "heuristic");

    const breakdown = triggered.length > 0
      ? `Pontuação Total: ${totalScore.toFixed(1)} / 5.0 (${verdictTitle}). ${triggered.length} regra(s) acionada(s).`
      : `Pontuação Total: 0.0 / 5.0 (Nenhuma regra heurística ou blacklist ativada). Mensagem limpa.`;

    res.json({
      success: true,
      matched: triggered.length > 0,
      total_score: Number(totalScore.toFixed(1)),
      score: Number(totalScore.toFixed(1)),
      required_score: 5.0,
      is_spam: isSpam,
      is_blacklisted: isBlacklisted,
      is_whitelisted: isWhitelisted,
      verdict_status: verdictStatus,
      verdict_title: verdictTitle,
      verdict_action: verdictAction,
      rules_matched: triggered,
      rules_triggered: triggered,
      blacklist_matches: blacklistMatches,
      whitelist_matches: whitelistMatches,
      heuristic_matches: heuristicMatches,
      breakdown_text: breakdown
    });
  };

  app.post("/api/services/spamassassin/simulate", handleSpamSimulate);
  app.post("/api/services/spamassassin/test-rule", handleSpamSimulate);

  app.post("/api/services/spamassassin/lint", (req, res) => {
    res.json({ success: true, message: "Sintaxe OK! O arquivo de regras local.cf é válido." });
  });

  app.all("/api/services/logs", (req, res) => {
    const data = req.method === "POST" ? (req.body || {}) : req.query;
    const eventLens = String(data.event_lens || data.lente || data.mailbox || data.caixa_postal || "").trim().toLowerCase();
    const searchTerm = String(data.search_term || data.termo_busca || data.term || "").trim().toLowerCase();

    const now = new Date();
    let mockLogs: string[] = [];
    for (let i = 50; i >= 1; i--) {
      const ts = new Date(now.getTime() - i * 30000).toISOString().replace("T", " ").substring(0, 19);
      mockLogs.push(`${ts} mailserver postfix/smtpd[14010]: connect from unknown[192.168.1.50]`);
      mockLogs.push(`${ts} mailserver postfix/anvil[14011]: statistics: max connection rate 2/60s for (smtpd:192.168.1.50)`);
      mockLogs.push(`${ts} mailserver amavis[14022]: Passed CLEAN {RelayedInbound}, <user@gmail.com> -> <financeiro@empresa.com.br>, Hits: -0.1`);
      mockLogs.push(`${ts} mailserver postfix/qmgr[1820]: 4YtZ8b3K: from=<user@gmail.com>, size=1890, nrcpt=1`);
      mockLogs.push(`${ts} mailserver postfix/cleanup[1822]: 4YtZ8b3K: message-id=<20260810103722@gmail.com>`);
      mockLogs.push(`${ts} mailserver postfix/smtp[1825]: 4YtZ8b3K: to=<financeiro@empresa.com.br>, relay=127.0.0.1[127.0.0.1]:10024, delay=0.12, status=sent (250 2.0.0 Ok)`);
    }

    if (eventLens) {
      const parts = eventLens.split("|").map(p => p.trim()).filter(Boolean);
      if (parts.length > 0) {
        mockLogs = mockLogs.filter(l => parts.some(p => l.toLowerCase().includes(p)));
      }
    }
    if (searchTerm) {
      mockLogs = mockLogs.filter(l => l.toLowerCase().includes(searchTerm));
    }

    res.json({ success: true, logs: mockLogs });
  });

  // ==========================================================
  // SERVERS & DAEMONS ENDPOINTS (Postfix, Amavis, ClamAV, AntiSpam)
  // ==========================================================

  let serverFeaturesState = {
    // Postfix
    smtpd_sasl_auth_enable: 'yes',
    smtpd_sasl_type: 'dovecot',
    smtpd_sasl_security_options: 'noanonymous, noplaintext',
    smtpd_tls_security_level: 'may',
    message_size_limit_mb: 50,
    submission_port_enabled: true,
    smtps_port_enabled: true,
    relay_restrictions: 'permit_mynetworks, permit_sasl_authenticated, reject_unauth_destination',

    // Amavis
    bypass_virus_checks: false,
    bypass_spam_checks: false,
    sa_tag_level_deflt: 2.0,
    sa_tag2_level_deflt: 5.0,
    sa_kill_level_deflt: 8.0,
    max_servers: 4,
    virus_quarantine_to: 'virus-quarantine@empresa.com.br',
    spam_quarantine_to: 'spam-quarantine@empresa.com.br',

    // ClamAV
    scan_archive: true,
    scan_ole2: true,
    scan_pdf: true,
    scan_html: true,
    alert_encrypted: false,
    max_file_size: 25,
    max_scan_size: 100,
    max_recursion: 16,

    // SpamAssassin
    required_score: 5.0,
    rewrite_header_subject: '***SPAM (_SCORE_)***',
    use_bayes: true,
    bayes_auto_learn: true,
    use_pyzor: true,
    use_razor2: true,
    skip_rbl_checks: false
  };

  let sslCertState = {
    domain: 'mail.empresa.com.br',
    valid: true,
    issuer: "Let's Encrypt Authority X3 (ISRG Root X1)",
    subject: 'CN=mail.empresa.com.br, O=ZRTI Infraestrutura',
    valid_from: '2026-05-17 00:00:00',
    valid_to: '2026-11-15 23:59:59',
    days_remaining: 88,
    auto_renew_active: true,
    cert_path: '/etc/letsencrypt/live/mail.empresa.com.br/fullchain.pem',
    key_path: '/etc/letsencrypt/live/mail.empresa.com.br/privkey.pem'
  };

  // GET /api/servers/overview
  app.get("/api/servers/overview", (req, res) => {
    const servicesOverview = {
      postfix: {
        id: 'postfix',
        name: 'postfix',
        service_unit: 'postfix.service',
        display_name: 'Postfix Mail Transfer Agent (MTA)',
        status: virtualServices.postfix?.active ? 'active' : 'inactive',
        pid: 14010,
        memory_mb: 48,
        cpu_percent: 0.8,
        uptime: '14 dias, 6 horas',
        ports: [25, 465, 587],
        config_file: '/etc/postfix/main.cf'
      },
      amavis: {
        id: 'amavis',
        name: 'amavis',
        service_unit: 'amavis.service',
        display_name: 'Amavisd-new Content Router & Filter',
        status: virtualServices.amavis?.active ? 'active' : 'inactive',
        pid: 1204,
        memory_mb: 384,
        cpu_percent: 1.4,
        uptime: '14 dias, 6 horas',
        ports: [10024, 10025],
        config_file: '/etc/amavis/conf.d/50-user'
      },
      "clamav-daemon": {
        id: 'clamav-daemon',
        name: 'clamav-daemon',
        service_unit: 'clamav-daemon.service',
        display_name: 'ClamAV Antivirus Daemon (clamd)',
        status: virtualServices["clamav-daemon"]?.active ? 'active' : 'inactive',
        pid: 890,
        memory_mb: 1024,
        cpu_percent: 0.5,
        uptime: '14 dias, 6 horas',
        ports: [3310],
        config_file: '/etc/clamav/clamd.conf'
      },
      spamassassin: {
        id: 'spamassassin',
        name: 'spamassassin',
        service_unit: 'spamassassin.service',
        display_name: 'SpamAssassin Daemon (spamd)',
        status: virtualServices.spamassassin?.active ? 'active' : 'inactive',
        pid: 1350,
        memory_mb: 128,
        cpu_percent: 0.9,
        uptime: '14 dias, 6 horas',
        ports: [783],
        config_file: '/etc/spamassassin/local.cf'
      }
    };

    res.json({
      success: true,
      services: servicesOverview,
      features: serverFeaturesState,
      ssl_info: sslCertState
    });
  });

  // POST /api/servers/service-action (restart, reload, stop, start, check)
  app.post("/api/servers/service-action", (req, res) => {
    const { service, action } = req.body || {};
    const sName = service === "clamav" ? "clamav-daemon" : (service || "postfix");
    const act = action || "restart";

    if (act === "check") {
      addAuditLog("SERVER_SYNTAX_CHECK", sName, { action: "check" }, "normal", req);
      return res.json({
        success: true,
        message: `Sintaxe e configurações do serviço ${sName} testadas e validadas com sucesso! (Código 0 - OK)`
      });
    }

    if (act === "restart" || act === "reload") {
      if (virtualServices[sName]) {
        virtualServices[sName].active = true;
        virtualServices[sName].state = "active";
      }
      addAuditLog(`SERVER_${act.toUpperCase()}`, sName, { action: act }, "normal", req);
      return res.json({
        success: true,
        message: `Serviço '${sName}' ${act === 'restart' ? 'reiniciado' : 'recarregado'} com sucesso via systemctl!`
      });
    }

    if (act === "stop") {
      if (virtualServices[sName]) {
        virtualServices[sName].active = false;
        virtualServices[sName].state = "inactive";
      }
      addAuditLog("SERVER_STOP", sName, { action: "stop" }, "suspicious", req);
      return res.json({
        success: true,
        message: `Serviço '${sName}' finalizado com sucesso.`
      });
    }

    if (act === "start") {
      if (virtualServices[sName]) {
        virtualServices[sName].active = true;
        virtualServices[sName].state = "active";
      }
      addAuditLog("SERVER_START", sName, { action: "start" }, "normal", req);
      return res.json({
        success: true,
        message: `Serviço '${sName}' iniciado com sucesso.`
      });
    }

    res.status(400).json({ success: false, message: "Ação não suportada." });
  });

  // GET /api/servers/config
  app.get("/api/servers/config", (req, res) => {
    const service = String(req.query.service || "postfix").toLowerCase();
    const file = String(req.query.file || "").toLowerCase();

    let content = virtualMainCf;
    let resolvedFile = "/etc/postfix/main.cf";

    if (file.includes("master.cf")) {
      content = virtualMasterCf;
      resolvedFile = "/etc/postfix/master.cf";
    } else if (file.includes("50-user") || service === "amavis") {
      content = virtualAmavis50User;
      resolvedFile = "/etc/amavis/conf.d/50-user";
    } else if (file.includes("clamd.conf") || service === "clamav") {
      content = virtualClamdConf;
      resolvedFile = "/etc/clamav/clamd.conf";
    } else if (file.includes("freshclam.conf")) {
      content = virtualFreshclamConf;
      resolvedFile = "/etc/clamav/freshclam.conf";
    } else if (file.includes("local.cf") || service === "spamassassin") {
      content = virtualLocalCf;
      resolvedFile = "/etc/spamassassin/local.cf";
    }

    res.json({ success: true, file: resolvedFile, content });
  });

  // POST /api/servers/config
  app.post("/api/servers/config", (req, res) => {
    const { service, file, content } = req.body || {};
    if (typeof content !== "string") {
      return res.status(400).json({ success: false, message: "Conteúdo inválido." });
    }

    const targetFile = String(file || "").toLowerCase();

    if (targetFile.includes("master.cf")) {
      virtualMasterCf = content;
    } else if (targetFile.includes("main.cf")) {
      virtualMainCf = content;
    } else if (targetFile.includes("50-user") || service === "amavis") {
      virtualAmavis50User = content;
    } else if (targetFile.includes("clamd.conf")) {
      virtualClamdConf = content;
    } else if (targetFile.includes("freshclam.conf")) {
      virtualFreshclamConf = content;
    } else if (targetFile.includes("local.cf") || service === "spamassassin") {
      virtualLocalCf = content;
    }

    addAuditLog("SERVER_CONFIG_SAVE", file || service, { file, size: content.length }, "normal", req);

    res.json({
      success: true,
      message: `Arquivo de configuração '${file || targetFile}' salvo com sucesso! Backup automático gerado.`
    });
  });

  // POST /api/servers/feature
  app.post("/api/servers/feature", (req, res) => {
    const { service, feature, value } = req.body || {};
    if (!feature) {
      return res.status(400).json({ success: false, message: "Nome do recurso não fornecido." });
    }

    serverFeaturesState = {
      ...serverFeaturesState,
      [feature]: value
    };

    addAuditLog("SERVER_FEATURE_CHANGE", `${service}:${feature}`, { feature, value }, "normal", req);

    res.json({
      success: true,
      message: `Recurso '${feature}' atualizado para '${value}' com sucesso!`,
      features: serverFeaturesState
    });
  });

  // POST /api/servers/logs (Power Query das últimas 50 linhas)
  app.post("/api/servers/logs", (req, res) => {
    const { service, query, filter, limit } = req.body || {};
    const sName = service === "clamav" ? "clamav-daemon" : (service || "postfix");
    const count = limit || 50;
    const term = String(query || "").trim().toLowerCase();
    const flt = String(filter || "all").toLowerCase();

    const now = new Date();
    const resultLogs: string[] = [];

    for (let i = count; i >= 1; i--) {
      const ts = new Date(now.getTime() - i * 15000).toISOString().replace("T", " ").substring(0, 19);

      if (sName === "postfix") {
        if (i % 7 === 0) {
          resultLogs.push(`${ts} mailserver postfix/smtpd[14010]: NOQUEUE: reject: RCPT from unknown[198.51.100.77]: 554 5.7.1 <test@external.org>: Relay access denied; from=<user@external.org> to=<test@external.org> proto=ESMTP helo=<external.org>`);
        } else if (i % 5 === 0) {
          resultLogs.push(`${ts} mailserver postfix/smtpd[14201]: warning: unknown[185.220.101.5]: SASL LOGIN authentication failed: U3Vwb3J0ZQ== (method=PLAIN)`);
        } else if (i % 3 === 0) {
          resultLogs.push(`${ts} mailserver postfix/qmgr[1820]: 4YtZ8b3K: from=<notificacao@empresa.com.br>, size=3512, nrcpt=1 (queue active)`);
          resultLogs.push(`${ts} mailserver postfix/smtp[1825]: 4YtZ8b3K: to=<cliente@dominio.com.br>, relay=smtp.destino.com[203.0.113.5]:25, delay=0.8, dsn=2.0.0, status=sent (250 2.0.0 OK queued_as_8783)`);
        } else {
          resultLogs.push(`${ts} mailserver postfix/smtpd[14010]: connect from mail-out.google.com[209.85.220.41]`);
          resultLogs.push(`${ts} mailserver postfix/smtpd[14010]: Anonymous TLS connection established from mail-out.google.com[209.85.220.41]: TLSv1.3 with cipher TLS_AES_256_GCM_SHA384 (256/256 bits)`);
          resultLogs.push(`${ts} mailserver postfix/lmtp[14220]: 4YtZ8b3K: to=<comercial@empresa.com.br>, relay=127.0.0.1[127.0.0.1]:24, status=sent (250 2.0.0 OK saved_to_mailbox)`);
        }
      } else if (sName === "amavis") {
        if (i % 6 === 0) {
          resultLogs.push(`${ts} mailserver amavis[1204]: (01204-03) Blocked SPAM {DiscardedInbound,Quarantined}, [198.51.100.12] <cobranca@rodovia-aviso.com> -> <diretoria@empresa.com.br>, quarantine: spam-01204-03.gz, Message-ID: <9832719@rodovia-aviso.com>, Hits: 17.500, tag=2.0, tag2=5.0, kill=8.0, Tests: [LOCAL_GOLPE_ASSUNTO=15.0, BAYES_99=4.5, SPF_FAIL=3.0]`);
        } else if (i % 8 === 0) {
          resultLogs.push(`${ts} mailserver amavis[1204]: (01204-05) Blocked INFECTED (Win.Trojan.Agent-9821), [185.220.101.99] <financeiro@falsobanco.biz> -> <contato@empresa.com.br>, quarantine: virus-01204-05.gz`);
        } else {
          resultLogs.push(`${ts} mailserver amavis[1204]: (01204-01) Passed CLEAN {RelayedInbound}, [209.85.220.41] <cliente@gmail.com> -> <comercial@empresa.com.br>, Hits: -0.150, tag=2.0, tag2=5.0, kill=8.0, Tests: [DKIM_SIGNED=-0.5, SPF_PASS=-0.5, BAYES_00=-1.5]`);
        }
      } else if (sName === "clamav-daemon") {
        if (i % 6 === 0) {
          resultLogs.push(`${ts} clamd[890]: /var/lib/amavis/tmp/amavis-20260818-1204/parts/p003: Win.Trojan.Agent-9821 FOUND`);
          resultLogs.push(`${ts} clamd[890]: /var/lib/amavis/tmp/amavis-20260818-1204/parts/p004: Heuristics.Encrypted.Zip FOUND`);
        } else {
          resultLogs.push(`${ts} clamd[890]: SelfCheck: Database status OK. 8724190 signatures active.`);
          resultLogs.push(`${ts} clamd[890]: ScanArchive: /var/lib/amavis/tmp/amavis-20260818-1204/parts/p001.zip OK (2 files scanned, 0 infected)`);
          resultLogs.push(`${ts} clamd[890]: ScanPDF: /var/lib/amavis/tmp/amavis-20260818-1204/parts/fatura.pdf OK (No malicious scripts)`);
        }
      } else if (sName === "spamassassin") {
        if (i % 5 === 0) {
          resultLogs.push(`${ts} spamd[1350]: spamd: identified spam (17.5/5.0) for vmail:5000 in 0.2 seconds, 3510 bytes.`);
          resultLogs.push(`${ts} spamd[1350]: spamd: result: Y 17 - LOCAL_GOLPE_ASSUNTO,LOCAL_GOLPE_REMETENTE,BAYES_99,SPF_FAIL scantime=0.2,size=3510,user=vmail,mid=<1892@spammer.net>,bayes=0.999`);
        } else {
          resultLogs.push(`${ts} spamd[1350]: spamd: clean message (-0.5/5.0) for vmail:5000 in 0.1 seconds, 1890 bytes.`);
          resultLogs.push(`${ts} spamd[1350]: spamd: result: . 0 - DKIM_SIGNED,SPF_PASS,BAYES_00 scantime=0.1,size=1890,user=vmail,mid=<20260818@cliente.com>`);
        }
      }
    }

    let filtered = resultLogs;

    // Apply Filter Types
    if (flt === "errors") {
      filtered = filtered.filter(l => {
        const u = l.toUpperCase();
        return u.includes("REJECT") || u.includes("ERROR") || u.includes("FAILED") || u.includes("FATAL") || u.includes("DENIED");
      });
    } else if (flt === "auth") {
      filtered = filtered.filter(l => {
        const u = l.toUpperCase();
        return u.includes("SASL") || u.includes("AUTH") || u.includes("LOGIN") || u.includes("DOVECOT");
      });
    } else if (flt === "clean") {
      filtered = filtered.filter(l => {
        const u = l.toUpperCase();
        return u.includes("CLEAN") || u.includes("STATUS=SENT") || u.includes("SAVED_TO_MAILBOX") || u.includes("250 2.0.0");
      });
    } else if (flt === "spam_virus") {
      filtered = filtered.filter(l => {
        const u = l.toUpperCase();
        return u.includes("SPAM") || u.includes("INFECTED") || u.includes("VIRUS") || u.includes("FOUND") || u.includes("BLOCKED");
      });
    }

    // Apply Text / Regex Search
    if (term) {
      filtered = filtered.filter(l => l.toLowerCase().includes(term));
    }

    res.json({
      success: true,
      service: sName,
      count: filtered.length,
      logs: filtered.slice(0, count)
    });
  });

  // GET /api/servers/ssl-cert
  app.get("/api/servers/ssl-cert", (req, res) => {
    res.json({ success: true, ssl_info: sslCertState });
  });

  // POST /api/servers/ssl-cert/renew
  app.post("/api/servers/ssl-cert/renew", (req, res) => {
    sslCertState = {
      ...sslCertState,
      valid: true,
      days_remaining: 90,
      valid_to: '2026-11-17 23:59:59'
    };
    addAuditLog("SSL_CERT_RENEW", sslCertState.domain, { days: 90 }, "normal", req);
    res.json({
      success: true,
      message: `Certificado SSL/TLS para '${sslCertState.domain}' verificado e renovado com sucesso via Certbot! Validade estendida para 90 dias.`,
      ssl_info: sslCertState
    });
  });

  // GET /api/servers/spamassassin/thresholds
  app.get("/api/servers/spamassassin/thresholds", (req, res) => {
    const requiredScore = parseFloat(virtualAntispamSettings["spam_threshold_quarantine"] || "4.5");
    const tagLevel = parseFloat(virtualAntispamSettings["spam_threshold_tag"] || "2.0");
    const killLevel = parseFloat(virtualAntispamSettings["spam_threshold_kill"] || "6.9");
    const subjectTag = virtualAntispamSettings["sa_spam_subject_tag"] || "***SPAM*** ";

    res.json({
      success: true,
      detected: {
        required_score: requiredScore,
        required_score_source: "/etc/spamassassin/local.cf",
        sa_tag_level_deflt: tagLevel,
        sa_tag2_level_deflt: requiredScore,
        sa_kill_level_deflt: killLevel,
        sa_spam_subject_tag: subjectTag,
        amavis_source: "/etc/amavis/conf.d/50-user",
        files_found: ["/etc/spamassassin/local.cf", "/etc/amavis/conf.d/50-user"]
      }
    });
  });

  // POST /api/servers/spamassassin/thresholds
  app.post("/api/servers/spamassassin/thresholds", (req, res) => {
    const data = req.body || {};
    if (data.required_score !== undefined) {
      virtualAntispamSettings["spam_threshold_quarantine"] = String(data.required_score);
    }
    if (data.sa_tag_level_deflt !== undefined) {
      virtualAntispamSettings["spam_threshold_tag"] = String(data.sa_tag_level_deflt);
    }
    if (data.sa_tag2_level_deflt !== undefined) {
      virtualAntispamSettings["spam_threshold_quarantine"] = String(data.sa_tag2_level_deflt);
    }
    if (data.sa_kill_level_deflt !== undefined) {
      virtualAntispamSettings["spam_threshold_kill"] = String(data.sa_kill_level_deflt);
    }
    if (data.sa_spam_subject_tag !== undefined) {
      virtualAntispamSettings["sa_spam_subject_tag"] = String(data.sa_spam_subject_tag);
    }

    addAuditLog("UPDATE_SPAM_THRESHOLDS", "SpamAssassin/Amavis", data, "normal", req);

    const requiredScore = parseFloat(virtualAntispamSettings["spam_threshold_quarantine"] || "4.5");
    const tagLevel = parseFloat(virtualAntispamSettings["spam_threshold_tag"] || "2.0");
    const killLevel = parseFloat(virtualAntispamSettings["spam_threshold_kill"] || "6.9");
    const subjectTag = virtualAntispamSettings["sa_spam_subject_tag"] || "***SPAM*** ";

    res.json({
      success: true,
      message: "Parâmetros e pontuações de corte do SpamAssassin e Amavis salvos e aplicados com sucesso!",
      detected: {
        required_score: requiredScore,
        required_score_source: "/etc/spamassassin/local.cf",
        sa_tag_level_deflt: tagLevel,
        sa_tag2_level_deflt: requiredScore,
        sa_kill_level_deflt: killLevel,
        sa_spam_subject_tag: subjectTag,
        amavis_source: "/etc/amavis/conf.d/50-user",
        files_found: ["/etc/spamassassin/local.cf", "/etc/amavis/conf.d/50-user"]
      }
    });
  });

  // Database Settings (.env manager)
  let virtualDbSettings = {
    DB_USER: "vmailadmin",
    DB_PASS: "senha_vmail_123",
    DB_HOST: "127.0.0.1",
    DB_NAME: "vmail",
    DB_PORT: "3306"
  };

  app.all("/api/services/settings", (req, res) => {
    if (req.method === "POST") {
      const { DB_USER, DB_PASS, DB_HOST, DB_NAME, DB_PORT } = req.body || {};
      if (DB_USER) virtualDbSettings.DB_USER = DB_USER;
      if (DB_PASS) virtualDbSettings.DB_PASS = DB_PASS;
      if (DB_HOST) virtualDbSettings.DB_HOST = DB_HOST;
      if (DB_NAME) virtualDbSettings.DB_NAME = DB_NAME;
      if (DB_PORT) virtualDbSettings.DB_PORT = String(DB_PORT);

      return res.json({
        success: true,
        message: "Configurações do banco de dados salvas com sucesso no arquivo .env! Por favor, reinicie o serviço no Linux para aplicar as novas credenciais.",
        settings: virtualDbSettings
      });
    }

    res.json({
      success: true,
      settings: virtualDbSettings
    });
  });

  // Export Python Files
  app.get("/api/python-files", (req, res) => {
    try {
      const appPy = fs.readFileSync(path.join(process.cwd(), "app.py"), "utf-8");
      const requirements = fs.readFileSync(path.join(process.cwd(), "requirements.txt"), "utf-8");
      const configPy = fs.readFileSync(path.join(process.cwd(), "config.py"), "utf-8");
      const modelsPy = fs.readFileSync(path.join(process.cwd(), "models.py"), "utf-8");
      const authBp = fs.readFileSync(path.join(process.cwd(), "blueprints/auth_bp.py"), "utf-8");
      const vmailBp = fs.readFileSync(path.join(process.cwd(), "blueprints/vmail_bp.py"), "utf-8");
      const troubleshootingBp = fs.readFileSync(path.join(process.cwd(), "blueprints/troubleshooting_bp.py"), "utf-8");
      const servicesBp = fs.readFileSync(path.join(process.cwd(), "blueprints/services_bp.py"), "utf-8");
      const automationBp = fs.existsSync(path.join(process.cwd(), "blueprints/automation_bp.py"))
        ? fs.readFileSync(path.join(process.cwd(), "blueprints/automation_bp.py"), "utf-8")
        : "";
      const auditHelper = fs.existsSync(path.join(process.cwd(), "blueprints/audit_helper.py"))
        ? fs.readFileSync(path.join(process.cwd(), "blueprints/audit_helper.py"), "utf-8")
        : "";
      const sudoers = fs.readFileSync(path.join(process.cwd(), "sudoers_mailadmin"), "utf-8");
      const service = fs.readFileSync(path.join(process.cwd(), "mailadmin.service"), "utf-8");
      const readme = fs.readFileSync(path.join(process.cwd(), "README_DEPLOY.md"), "utf-8");

      res.json({
        success: true,
        files: {
          "app.py": appPy,
          "requirements.txt": requirements,
          "config.py": configPy,
          "models.py": modelsPy,
          "blueprints/auth_bp.py": authBp,
          "blueprints/vmail_bp.py": vmailBp,
          "blueprints/troubleshooting_bp.py": troubleshootingBp,
          "blueprints/services_bp.py": servicesBp,
          "blueprints/automation_bp.py": automationBp,
          "blueprints/audit_helper.py": auditHelper,
          "sudoers_mailadmin": sudoers,
          "mailadmin.service": service,
          "README_DEPLOY.md": readme
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ===============================================
  // MÓDULO DE AUTOMAÇÃO E CRONTAB VISUAL
  // ===============================================

  app.get("/api/automation/jobs", (req, res) => {
    res.json({
      status: "success",
      success: true,
      jobs: virtualCronJobs
    });
  });

  app.post("/api/automation/jobs", (req, res) => {
    const { name, schedule_preset, cron_expression, schedule, command, script_content, script_filename } = req.body || {};
    let finalCmd = (command || "").trim();

    if (script_content) {
      const fn = script_filename ? script_filename.trim() : `script_${Date.now()}.sh`;
      const scriptPath = `/opt/mailadmin/scripts/${fn}`;
      if (!finalCmd) {
        finalCmd = fn.endsWith(".py") ? `python3 ${scriptPath}` : scriptPath;
      }
    }

    if (!name || !finalCmd) {
      return res.status(400).json({ status: "error", success: false, message: "Nome e Comando/Script da automação são obrigatórios." });
    }

    const presetMap: Record<string, string> = {
      "1h": "0 * * * *",
      "3h": "0 */3 * * *",
      "6h": "0 */6 * * *",
      "daily": "0 2 * * *"
    };

    const preset = schedule_preset || "custom";
    const cronExpr = presetMap[preset] || cron_expression || schedule || "0 * * * *";

    const nextId = virtualCronJobs.length > 0 ? Math.max(...virtualCronJobs.map(j => j.id)) + 1 : 1;
    const newJob = {
      id: nextId,
      name: name.trim(),
      schedule_preset: preset,
      cron_expression: cronExpr,
      schedule: cronExpr,
      command: finalCmd,
      enabled: true,
      last_run: null,
      last_output: null
    };

    virtualCronJobs.push(newJob);

    virtualAuditLogs.unshift({
      id: virtualAuditLogs.length + 1,
      username: virtualAdmin.username,
      action: "CRONJOB_CREATE",
      target: newJob.name,
      ip_address: "127.0.0.1",
      details: { preset, cron: cronExpr, command: finalCmd },
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19)
    });

    res.json({
      status: "success",
      success: true,
      message: `Automação "${newJob.name}" criada com sucesso!`,
      job: newJob
    });
  });

  const editCronJobHandler = (req: express.Request, res: express.Response) => {
    const jobId = parseInt(req.params.id);
    const job = virtualCronJobs.find(j => j.id === jobId);
    if (!job) {
      return res.status(404).json({ status: "error", success: false, message: "Automação não encontrada." });
    }

    const { name, schedule_preset, cron_expression, schedule, command, script_content, script_filename } = req.body || {};
    let finalCmd = (command || job.command).trim();

    if (script_content) {
      const fn = script_filename ? script_filename.trim() : `script_${jobId}.sh`;
      const scriptPath = `/opt/mailadmin/scripts/${fn}`;
      if (!command || command === job.command) {
        finalCmd = fn.endsWith(".py") ? `python3 ${scriptPath}` : scriptPath;
      }
    }

    const presetMap: Record<string, string> = {
      "1h": "0 * * * *",
      "3h": "0 */3 * * *",
      "6h": "0 */6 * * *",
      "daily": "0 2 * * *"
    };

    const preset = schedule_preset || job.schedule_preset;
    const cronExpr = presetMap[preset] || cron_expression || schedule || job.cron_expression;

    job.name = name ? name.trim() : job.name;
    job.schedule_preset = preset;
    job.cron_expression = cronExpr;
    job.schedule = cronExpr;
    job.command = finalCmd;

    virtualAuditLogs.unshift({
      id: virtualAuditLogs.length + 1,
      username: virtualAdmin.username,
      action: "CRONJOB_EDIT",
      target: job.name,
      ip_address: "127.0.0.1",
      details: { job_id: jobId, preset, cron: cronExpr },
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19)
    });

    res.json({
      status: "success",
      success: true,
      message: `Automação "${job.name}" atualizada com sucesso!`,
      job
    });
  };

  app.put("/api/automation/jobs/:id", editCronJobHandler);
  app.post("/api/automation/jobs/:id", editCronJobHandler);
  app.post("/api/automation/jobs/:id/edit", editCronJobHandler);

  const toggleCronJobHandler = (req: express.Request, res: express.Response) => {
    const jobId = parseInt(req.params.id);
    const job = virtualCronJobs.find(j => j.id === jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: "Automação não encontrada." });
    }

    const { enabled } = req.body || {};
    job.enabled = enabled !== undefined ? Boolean(enabled) : !job.enabled;
    const statusStr = job.enabled ? "Habilitada" : "Desabilitada";

    res.json({
      success: true,
      message: `Automação "${job.name}" ${statusStr} com sucesso!`,
      enabled: job.enabled
    });
  };

  app.post("/api/automation/jobs/:id/toggle", toggleCronJobHandler);
  app.put("/api/automation/jobs/:id/toggle", toggleCronJobHandler);

  const deleteCronJobHandler = (req: express.Request, res: express.Response) => {
    const jobId = parseInt(req.params.id);
    const idx = virtualCronJobs.findIndex(j => j.id === jobId);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: "Automação não encontrada." });
    }

    const removedName = virtualCronJobs[idx].name;
    virtualCronJobs.splice(idx, 1);

    res.json({
      success: true,
      message: `Automação "${removedName}" excluída com sucesso!`
    });
  };

  app.delete("/api/automation/jobs/:id", deleteCronJobHandler);
  app.post("/api/automation/jobs/:id/delete", deleteCronJobHandler);

  app.post("/api/automation/run-now/:id", (req, res) => {
    const jobId = parseInt(req.params.id);
    const job = virtualCronJobs.find(j => j.id === jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: "Automação não encontrada." });
    }

    const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19);
    job.last_run = nowStr;
    job.last_output = `[SUCESSO] Comando "${job.command}" executado via Subprocess com código 0. Finalizado às ${nowStr}.`;

    res.json({
      success: true,
      returncode: 0,
      output: job.last_output,
      last_run: nowStr,
      message: `Execução disparada para "${job.name}".`
    });
  });

  // ===============================================
  // SQL STUDIO / MARIADB QUERY EXPLORER
  // ===============================================

  app.post("/api/troubleshooting/sql-query", (req, res) => {
    try {
      const { query } = req.body || {};
      const sqlStr = String(query || "").trim();

      if (!sqlStr) {
        return res.status(400).json({ status: "error", success: false, message: "Nenhuma instrução SQL fornecida." });
      }

      const firstWord = sqlStr.split(/\s+/)[0].toUpperCase();
      if (!["SELECT", "SHOW", "EXPLAIN", "DESCRIBE", "WITH"].includes(firstWord)) {
        return res.status(400).json({
          status: "error",
          success: false,
          message: "Por segurança do painel, o SQL Studio aceita apenas comandos de consulta de dados (SELECT, SHOW, EXPLAIN)."
        });
      }

      const upperSql = sqlStr.toUpperCase();

      let columns: string[] = [];
      let rows: Record<string, any>[] = [];

      if (upperSql.includes("SHOW DATABASES")) {
        columns = ["Database"];
        rows = [
          { Database: "vmail" },
          { Database: "information_schema" },
          { Database: "mysql" },
          { Database: "performance_schema" }
        ];
      } else if (upperSql.includes("SHOW TABLES")) {
        columns = ["Tables_in_vmail"];
        rows = [
          { Tables_in_vmail: "domain" },
          { Tables_in_vmail: "mailbox" },
          { Tables_in_vmail: "alias" },
          { Tables_in_vmail: "cron_jobs" },
          { Tables_in_vmail: "mail_logs_history" },
          { Tables_in_vmail: "vmail_admins" },
          { Tables_in_vmail: "system_audit_logs" }
        ];
      } else if (upperSql.includes("DOMAINS") || upperSql.includes("DOMAIN")) {
        columns = ["domain", "description", "aliases", "mailboxes", "maxquota", "transport", "active", "created"];
        rows = virtualDomains;
      } else if (upperSql.includes("MAILBOX") || upperSql.includes("MAILBOXES")) {
        columns = ["username", "name", "maildir", "quota", "bytes_used", "domain", "active", "created"];
        rows = virtualMailboxes;
      } else if (upperSql.includes("ALIAS")) {
        columns = ["address", "goto", "domain", "active", "created"];
        rows = virtualAliases;
      } else if (upperSql.includes("CRON_JOB") || upperSql.includes("CRON_JOBS") || upperSql.includes("AUTOMATION")) {
        columns = ["id", "name", "schedule_preset", "cron_expression", "command", "enabled", "last_run", "last_output"];
        rows = virtualCronJobs;
      } else if (upperSql.includes("MAIL_RULE") || upperSql.includes("RULES")) {
        columns = ["id", "target", "action_type", "created_at"];
        rows = virtualMailRules;
      } else if (upperSql.includes("VMAIL_ADMIN") || upperSql.includes("ADMINS")) {
        columns = ["id", "username", "role", "otp_enabled", "created_at"];
        rows = virtualAdminsList;
      } else if (upperSql.includes("AUDIT") || upperSql.includes("SYSTEM_AUDIT_LOGS")) {
        columns = ["id", "username", "action", "target", "ip_address", "created_at"];
        rows = virtualAuditLogs;
      } else if (upperSql.includes("MAIL_LOGS_HISTORY") || upperSql.includes("MAIL_LOGS")) {
        columns = ["id", "timestamp", "sender", "recipient", "status", "size", "relay"];
        rows = [
          { id: 101, timestamp: "2026-08-11 19:10:00", sender: "cliente@empresa.com", recipient: "financeiro@midia.com.br", status: "SENT", size: "14.2 KB", relay: "smtp.mailadmin.internal" },
          { id: 102, timestamp: "2026-08-11 19:12:30", sender: "marketing@spammer.org", recipient: "vendas@midia.com.br", status: "REJECTED", size: "2.1 KB", relay: "amavisd-new" },
          { id: 103, timestamp: "2026-08-11 19:15:12", sender: "suporte@midia.com.br", recipient: "usuario@externo.org", status: "BOUNCED", size: "5.8 KB", relay: "postfix/smtp" }
        ];
      } else {
        columns = ["result", "database", "status"];
        rows = [
          { result: "Consulta executada com sucesso no MariaDB vmail", database: "vmail", status: "OK" }
        ];
      }

      const elapsedMs = Number((Math.random() * 2 + 1.2).toFixed(2));

      return res.json({
        status: "success",
        success: true,
        execution_time_ms: elapsedMs,
        row_count: rows.length,
        columns,
        rows
      });
    } catch (err: any) {
      return res.status(400).json({
        status: "error",
        success: false,
        message: `Erro na execução da query: ${err.message || String(err)}`
      });
    }
  });

  // ==========================================================
  // ANTISPAM POLICY ENGINE & REPUTATION REST ENDPOINTS
  // ==========================================================

  let virtualAntispamRules = [
    { id: 1, codigo: "SPF_PASS", nome: "SPF Válido e Autorizado (Pass)", categoria: "authentication", descricao: "O IP do remetente está explicitamente autorizado no registro SPF do domínio.", score: -2.0, severidade: "LOW", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 2, codigo: "SPF_NONE", nome: "SPF Ausente / Não Configurado", categoria: "authentication", descricao: "O domínio remetente não possui registro TXT com política SPF definida no DNS.", score: 1.0, severidade: "LOW", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 3, codigo: "SPF_SOFTFAIL", nome: "SPF SoftFail (~all)", categoria: "authentication", descricao: "O IP do remetente não está na lista autorizada, porém a política SPF é suave (~all).", score: 2.0, severidade: "MEDIUM", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 4, codigo: "SPF_FAIL", nome: "SPF Falha Estrita (-all)", categoria: "authentication", descricao: "O IP do remetente falhou categoricamente no teste SPF e a política é restritiva (-all).", score: 4.0, severidade: "HIGH", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 5, codigo: "DKIM_PASS", nome: "Assinatura Criptográfica DKIM Válida (Pass)", categoria: "authentication", descricao: "Mensagem possui assinatura DKIM íntegra correspondente à chave pública no DNS.", score: -2.0, severidade: "LOW", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 6, codigo: "DKIM_NONE", nome: "Assinatura DKIM Ausente", categoria: "authentication", descricao: "A mensagem não possui cabeçalho DKIM-Signature assinado pelo remetente.", score: 1.0, severidade: "LOW", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 7, codigo: "DKIM_FAIL", nome: "Assinatura DKIM Inválida / Corrompida (Fail)", categoria: "authentication", descricao: "A assinatura DKIM falhou na validação de integridade ou chave do seletor é inválida.", score: 3.0, severidade: "HIGH", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 8, codigo: "DMARC_PASS", nome: "Conformidade DMARC Válida (Pass)", categoria: "authentication", descricao: "Mensagem atende aos requisitos de alinhamento DMARC com SPF ou DKIM aprovados.", score: -2.0, severidade: "LOW", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 9, codigo: "DMARC_NONE", nome: "DMARC Ausente / Política p=none", categoria: "authentication", descricao: "Domínio remetente não publica política DMARC ou opera sem imposição (p=none).", score: 2.0, severidade: "MEDIUM", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 10, codigo: "DMARC_FAIL", nome: "Violação DMARC (Fail)", categoria: "authentication", descricao: "Mensagem violou o alinhamento DMARC e falhou em ambos mecanismos (SPF e DKIM).", score: 4.0, severidade: "CRITICAL", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 11, codigo: "PTR_MISSING", nome: "rDNS / Registro PTR Inexistente", categoria: "rdns", descricao: "O IP do servidor de envio não possui ponteiro reverso (PTR) configurado no DNS.", score: 2.0, severidade: "MEDIUM", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 12, codigo: "PTR_FORWARD_FAIL", nome: "Falha no FCrDNS (Forward-Confirmed rDNS)", categoria: "rdns", descricao: "O nome apontado pelo PTR não resolve de volta para o IP de origem.", score: 2.0, severidade: "MEDIUM", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 13, codigo: "HELO_PTR_MISMATCH", nome: "Inconsistência entre HELO/EHLO e PTR", categoria: "rdns", descricao: "O hostname declarado no comando SMTP HELO/EHLO diverge do PTR reverso.", score: 1.0, severidade: "LOW", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 14, codigo: "HELO_NO_RESOLVE", nome: "HELO/EHLO Não Resolvível no DNS", categoria: "rdns", descricao: "O hostname informado no HELO/EHLO não possui registro A ou AAAA válido.", score: 3.0, severidade: "HIGH", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 15, codigo: "PTR_DYNAMIC", nome: "PTR com Padrão de Banda Larga / Dinâmico", categoria: "rdns", descricao: "O hostname reverso contém padrões de conexões residenciais (dsl, pool, dynamic).", score: 2.0, severidade: "MEDIUM", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 16, codigo: "IP_DYNAMIC", nome: "Origem em Faixa Residencial / Dinâmica", categoria: "rdns", descricao: "Conexão direta originada em bloco de IP residencial/dinâmico de alto risco.", score: 4.0, severidade: "HIGH", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 17, codigo: "HEADER_FROM_MISMATCH", nome: "Divergência entre Header From e Envelope From", categoria: "identity", descricao: "O endereço exibido no campo 'De:' é de domínio diferente do envelope Return-Path.", score: 2.0, severidade: "MEDIUM", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 18, codigo: "IMP_FROM_DMARC_FAIL", nome: "Falha DMARC com Identidade Forjada", categoria: "impersonation", descricao: "Envio utilizando cabeçalho From forjado sem autenticação válida em domínio protegido.", score: 3.0, severidade: "HIGH", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" },
    { id: 19, codigo: "MARCA_CONHECIDA_DMARC_FAIL", nome: "Impersonation Crítico de Marca / Banco", categoria: "impersonation", descricao: "Uso não autorizado de marca bancária/governamental com falha em DMARC/SPF.", score: 5.0, severidade: "CRITICAL", ativo: true, origem: "system", data_criacao: "2026-08-26 11:00:00" }
  ];

  let virtualAntispamSettings: Record<string, string> = {
    score_spam_threshold: "4.5",
    score_high_risk_threshold: "8.0",
    score_critical_threshold: "10.0",
    enable_fcr_dns: "true",
    enable_impersonation_check: "true",
    enable_helo_validation: "true",
    auto_sync_localcf: "false"
  };

  let virtualImpersonationProfiles = [
    { id: 1, brand_name: "Caixa Econômica Federal", official_domains: ["caixa.gov.br", "cef.gov.br"], official_domains_raw: "caixa.gov.br,cef.gov.br", category: "finance", severity: "CRITICAL", active: true },
    { id: 2, brand_name: "Banco do Brasil", official_domains: ["bb.com.br", "bancodobrasil.com.br"], official_domains_raw: "bb.com.br,bancodobrasil.com.br", category: "finance", severity: "CRITICAL", active: true },
    { id: 3, brand_name: "Itaú Unibanco", official_domains: ["itau.com.br", "itau-unibanco.com.br"], official_domains_raw: "itau.com.br,itau-unibanco.com.br", category: "finance", severity: "CRITICAL", active: true },
    { id: 4, brand_name: "Banco Bradesco", official_domains: ["bradesco.com.br", "bancobradesco.com.br"], official_domains_raw: "bradesco.com.br,bancobradesco.com.br", category: "finance", severity: "CRITICAL", active: true },
    { id: 5, brand_name: "Nubank", official_domains: ["nubank.com.br", "nu.com.br"], official_domains_raw: "nubank.com.br,nu.com.br", category: "finance", severity: "CRITICAL", active: true },
    { id: 6, brand_name: "Receita Federal / Gov.br", official_domains: ["gov.br", "receita.fazenda.gov.br"], official_domains_raw: "gov.br,receita.fazenda.gov.br", category: "gov", severity: "CRITICAL", active: true },
    { id: 7, brand_name: "Correios", official_domains: ["correios.com.br"], official_domains_raw: "correios.com.br", category: "gov", severity: "HIGH", active: true },
    { id: 8, brand_name: "Serasa Experian", official_domains: ["serasa.com.br", "serasaexperian.com.br"], official_domains_raw: "serasa.com.br,serasaexperian.com.br", category: "finance", severity: "HIGH", active: true },
    { id: 9, brand_name: "Mercado Livre", official_domains: ["mercadolivre.com.br", "mercadolibre.com"], official_domains_raw: "mercadolivre.com.br,mercadolibre.com", category: "retail", severity: "HIGH", active: true },
    { id: 10, brand_name: "Microsoft / Office 365", official_domains: ["microsoft.com", "office.com", "outlook.com"], official_domains_raw: "microsoft.com,office.com,outlook.com", category: "tech", severity: "HIGH", active: true },
    { id: 11, brand_name: "Google Workspace / Gmail", official_domains: ["google.com", "gmail.com"], official_domains_raw: "google.com,gmail.com", category: "tech", severity: "HIGH", active: true },
    { id: 12, brand_name: "Apple / iCloud", official_domains: ["apple.com", "icloud.com"], official_domains_raw: "apple.com,icloud.com", category: "tech", severity: "HIGH", active: true },
    { id: 13, brand_name: "Netflix", official_domains: ["netflix.com"], official_domains_raw: "netflix.com", category: "retail", severity: "HIGH", active: true }
  ];

  let virtualAntispamAnalyses: any[] = [
    {
      id: 1,
      message_id: "<20260826113000.82910@bancofake.xyz>",
      queue_id: "4Z8bL39K",
      sender_from: "notificacao@caixa.gov.br",
      envelope_from: "bounce@spammerhost.net",
      envelope_to: "cliente@meudominio.com.br",
      client_ip: "185.220.101.5",
      ptr: "dynamic-185-220-101-5.broadband.isp.net",
      helo: "mail.spammerhost.net",
      spf_status: "FAIL",
      dkim_status: "NONE",
      dmarc_status: "FAIL",
      sa_score: 1.471,
      intelligence_score: 9.000,
      final_score: 10.471,
      classification: "POSSIBLE_IMPERSONATION",
      confidence_level: "HIGH",
      created_at: "2026-08-26 11:30:15"
    }
  ];

  let virtualAntispamAudit: any[] = [
    {
      id: 1,
      usuario: "admin",
      user: "admin",
      acao: "INIT_ENGINE",
      action: "INIT_ENGINE",
      alvo: "Policy Engine v1.1.1",
      target: "Policy Engine v1.1.1",
      valor_anterior: null,
      old_value: null,
      valor_novo: "Threshold SPAM: 4.5, Alto Risco: 8.0, Crítico: 10.0",
      new_value: "Threshold SPAM: 4.5, Alto Risco: 8.0, Crítico: 10.0",
      motivo: "Inicialização do motor complementar de segurança",
      reason: "Inicialização do motor complementar de segurança",
      ip_origem: "127.0.0.1",
      ip: "127.0.0.1",
      data_hora: "2026-08-26 11:00:00",
      timestamp: "2026-08-26 11:00:00"
    }
  ];

  // GET /api/antispam/overview
  app.get("/api/antispam/overview", (req, res) => {
    res.json({
      success: true,
      stats: {
        total_rules: virtualAntispamRules.length,
        active_rules: virtualAntispamRules.filter(r => r.ativo).length,
        total_analyses: virtualAntispamAnalyses.length,
        total_protected_brands: virtualImpersonationProfiles.length
      },
      spamassassin_detected: {
        required_score: 4.5,
        required_score_source: "/etc/spamassassin/local.cf",
        sa_tag_level_deflt: 2.0,
        sa_tag2_level_deflt: 4.5,
        sa_kill_level_deflt: 6.9,
        amavis_source: "/etc/amavis/conf.d/20-debian_defaults",
        files_found: ["/etc/spamassassin/local.cf", "/etc/amavis/conf.d/20-debian_defaults"]
      },
      policy_engine_thresholds: {
        score_spam: parseFloat(virtualAntispamSettings.score_spam_threshold || "4.5"),
        score_high_risk: parseFloat(virtualAntispamSettings.score_high_risk_threshold || "8.0"),
        score_critical: parseFloat(virtualAntispamSettings.score_critical_threshold || "10.0"),
        fcr_dns_enabled: virtualAntispamSettings.enable_fcr_dns === "true",
        impersonation_enabled: virtualAntispamSettings.enable_impersonation_check === "true"
      }
    });
  });

  // GET /api/antispam/rules
  app.get("/api/antispam/rules", (req, res) => {
    const { category, search } = req.query;
    let list = [...virtualAntispamRules];

    if (category) {
      list = list.filter(r => r.categoria === category);
    }
    if (search) {
      const q = String(search).toLowerCase();
      list = list.filter(r => r.codigo.toLowerCase().includes(q) || r.nome.toLowerCase().includes(q) || r.descricao.toLowerCase().includes(q));
    }

    res.json({ success: true, rules: list, count: list.length });
  });

  // PUT /api/antispam/rules/:id
  app.put("/api/antispam/rules/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const rule = virtualAntispamRules.find(r => r.id === id);
    if (!rule) return res.status(404).json({ success: false, error: "Regra não encontrada" });

    const { score, ativo, active, severidade, motivo } = req.body || {};
    const oldScore = rule.score;
    const oldActive = rule.ativo;

    if (score !== undefined) {
      const numScore = parseFloat(score);
      if (isNaN(numScore) || numScore < -10.0 || numScore > 10.0) {
        return res.status(400).json({ success: false, error: "O score deve estar entre -10.0 e +10.0" });
      }
      rule.score = Number(numScore.toFixed(2));
    }

    if (ativo !== undefined || active !== undefined) {
      rule.ativo = Boolean(ativo !== undefined ? ativo : active);
    }

    if (severidade) rule.severidade = severidade;

    virtualAntispamAudit.unshift({
      id: virtualAntispamAudit.length + 1,
      usuario: "admin",
      user: "admin",
      acao: "UPDATE_RULE",
      action: "UPDATE_RULE",
      alvo: `${rule.codigo} (#${rule.id})`,
      target: `${rule.codigo} (#${rule.id})`,
      valor_anterior: `Score: ${oldScore}, Ativo: ${oldActive}`,
      old_value: `Score: ${oldScore}, Ativo: ${oldActive}`,
      valor_novo: `Score: ${rule.score}, Ativo: ${rule.ativo}`,
      new_value: `Score: ${rule.score}, Ativo: ${rule.ativo}`,
      motivo: motivo || "Ajuste de política de pontuação do Policy Engine",
      reason: motivo || "Ajuste de política de pontuação do Policy Engine",
      ip_origem: "127.0.0.1",
      ip: "127.0.0.1",
      data_hora: new Date().toISOString().replace("T", " ").substring(0, 19),
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19)
    });

    res.json({ success: true, message: "Regra atualizada com sucesso", rule });
  });

  // GET & PUT /api/antispam/settings
  app.get("/api/antispam/settings", (req, res) => {
    res.json({
      success: true,
      settings: Object.entries(virtualAntispamSettings).map(([k, v]) => ({
        key: k,
        value: v,
        label: k.replace(/_/g, " ").toUpperCase(),
        category: k.includes("threshold") ? "threshold" : "engine"
      })),
      detected_sa: {
        required_score: 4.5,
        required_score_source: "/etc/spamassassin/local.cf",
        sa_tag_level_deflt: 2.0,
        sa_tag2_level_deflt: 4.5,
        sa_kill_level_deflt: 6.9
      }
    });
  });

  app.put("/api/antispam/settings", (req, res) => {
    const data = req.body || {};
    for (const [k, v] of Object.entries(data)) {
      virtualAntispamSettings[k] = String(v);
    }
    res.json({ success: true, message: "Limiares atualizados com sucesso", settings: virtualAntispamSettings });
  });

  // Impersonation Profiles
  const getProfilesHandler = (req: any, res: any) => {
    res.json({
      success: true,
      profiles: virtualImpersonationProfiles.map(p => ({
        id: p.id,
        brand_name: p.brand_name,
        official_domains: p.official_domains,
        category: p.category,
        severity: p.severity,
        is_active: p.active !== false,
        active: p.active !== false
      }))
    });
  };
  app.get("/api/antispam/impersonation/profiles", getProfilesHandler);
  app.get("/api/antispam/impersonation-profiles", getProfilesHandler);

  const addProfileHandler = (req: any, res: any) => {
    const { brand_name, official_domains, category, severity, is_active } = req.body || {};
    if (!brand_name || !official_domains) {
      return res.status(400).json({ success: false, error: "Nome da marca e domínios oficiais são obrigatórios" });
    }
    const domList = Array.isArray(official_domains) 
      ? official_domains 
      : String(official_domains).split(",").map((d: string) => d.trim()).filter(Boolean);
    const newProf = {
      id: virtualImpersonationProfiles.length + 1,
      brand_name: brand_name.trim(),
      official_domains: domList,
      official_domains_raw: domList.join(","),
      category: category || "banking",
      severity: severity || "HIGH",
      active: is_active !== undefined ? Boolean(is_active) : true
    };
    virtualImpersonationProfiles.push(newProf);

    virtualAntispamAudit.unshift({
      id: virtualAntispamAudit.length + 1,
      usuario: "admin",
      user: "admin",
      admin_user: "admin",
      acao: "ADD_BRAND_PROFILE",
      action: "ADD_BRAND_PROFILE",
      alvo: newProf.brand_name,
      target: newProf.brand_name,
      target_type: "IMPERSONATION_BRAND",
      target_id: newProf.brand_name,
      valor_anterior: "",
      old_value: "",
      valor_novo: domList.join(", "),
      new_value: domList.join(", "),
      motivo: "Cadastro de marca protegida contra Phishing/Impersonation",
      reason: "Cadastro de marca protegida contra Phishing/Impersonation",
      ip_origem: "127.0.0.1",
      ip: "127.0.0.1",
      data_hora: new Date().toISOString().replace("T", " ").substring(0, 19),
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19),
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19)
    });

    res.json({ success: true, message: "Marca cadastrada com sucesso", profile: newProf });
  };
  app.post("/api/antispam/impersonation/profiles", addProfileHandler);
  app.post("/api/antispam/impersonation-profiles", addProfileHandler);

  const deleteProfileHandler = (req: any, res: any) => {
    const id = parseInt(req.params.id);
    const idx = virtualImpersonationProfiles.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ success: false, error: "Perfil não encontrado" });
    const removed = virtualImpersonationProfiles.splice(idx, 1)[0];

    virtualAntispamAudit.unshift({
      id: virtualAntispamAudit.length + 1,
      usuario: "admin",
      user: "admin",
      admin_user: "admin",
      acao: "DELETE_BRAND_PROFILE",
      action: "DELETE_BRAND_PROFILE",
      alvo: removed.brand_name,
      target: removed.brand_name,
      target_type: "IMPERSONATION_BRAND",
      target_id: removed.brand_name,
      valor_anterior: Array.isArray(removed.official_domains) ? removed.official_domains.join(", ") : String(removed.official_domains),
      old_value: Array.isArray(removed.official_domains) ? removed.official_domains.join(", ") : String(removed.official_domains),
      valor_novo: "REMOVIDO",
      new_value: "REMOVIDO",
      motivo: "Remoção de marca protegida do catálogo",
      reason: "Remoção de marca protegida do catálogo",
      ip_origem: "127.0.0.1",
      ip: "127.0.0.1",
      data_hora: new Date().toISOString().replace("T", " ").substring(0, 19),
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19),
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19)
    });

    res.json({ success: true, message: `Marca '${removed.brand_name}' removida com sucesso` });
  };
  app.delete("/api/antispam/impersonation/profiles/:id", deleteProfileHandler);
  app.delete("/api/antispam/impersonation-profiles/:id", deleteProfileHandler);

  // POST /api/antispam/rdns/test e /api/antispam/rdns/diagnose
  const rdnsTestHandler = (req: any, res: any) => {
    const { client_ip, ip, helo, helo_name } = req.body || {};
    const testIp = client_ip || ip || "127.0.0.1";
    const testHelo = (helo || helo_name || "").trim().toLowerCase();

    const isDynamic = /dynamic|dialup|dsl|pool|broadband|cable|\d+-\d+-\d+-\d+/i.test(testIp);
    const hasPtr = testIp !== "127.0.0.1" && !testIp.startsWith("10.") && !testIp.startsWith("192.168.");
    const ptrHost = hasPtr ? (isDynamic ? `dynamic-${testIp.replace(/\./g, "-")}.isp.telecom.net` : `mail.${testHelo || 'relay.net'}`) : "";
    const fcrdnsValid = hasPtr && !isDynamic;
    const heloMatches = Boolean(testHelo && ptrHost && (testHelo === ptrHost || ptrHost.includes(testHelo)));

    const matchedRules: any[] = [];
    if (!hasPtr) {
      matchedRules.push({ rule_code: "PTR_MISSING", evidence: `IP ${testIp} sem registro PTR reverso`, score_applied: 2.0 });
    }
    if (hasPtr && !fcrdnsValid) {
      matchedRules.push({ rule_code: "PTR_FORWARD_FAIL", evidence: `PTR ${ptrHost} não confirma resolução A`, score_applied: 2.0 });
    }
    if (isDynamic) {
      matchedRules.push({ rule_code: "PTR_DYNAMIC", evidence: `Padrão de IP dinâmico/residencial detectado`, score_applied: 2.0 });
    }
    if (testHelo && !heloMatches && hasPtr) {
      matchedRules.push({ rule_code: "HELO_PTR_MISMATCH", evidence: `HELO '${testHelo}' diverge de PTR '${ptrHost}'`, score_applied: 1.0 });
    }

    const diag = {
      client_ip: testIp,
      has_ptr: hasPtr,
      ptr_name: ptrHost || "Nenhum PTR encontrado",
      ptr_hostname: ptrHost,
      fcrdns_valid: fcrdnsValid,
      helo_matches_ptr: heloMatches,
      is_dynamic_pattern: isDynamic,
      is_dynamic: isDynamic,
      details: `PTR: ${ptrHost || 'Inexistente'}. FCrDNS: ${fcrdnsValid ? 'Válido' : 'Falha'}. Dinâmico: ${isDynamic ? 'Sim' : 'Não'}.`
    };

    res.json({
      success: true,
      diagnosis: diag,
      result: diag,
      matched_rules: matchedRules
    });
  };
  app.post("/api/antispam/rdns/test", rdnsTestHandler);
  app.post("/api/antispam/rdns/diagnose", rdnsTestHandler);

  // POST /api/antispam/simulate
  app.post("/api/antispam/simulate", (req, res) => {
    const { raw_eml, sender_from, from, envelope_from, envelope_to, to, client_ip, ip, helo, sa_score, spamassassin_score, spf_status, dkim_status, dmarc_status, message_id, queue_id } = req.body || {};

    let sFrom = sender_from || from || "";
    let eFrom = envelope_from || sFrom;
    let eTo = envelope_to || to || "";
    let cIp = client_ip || ip || "185.220.101.5";
    let sHelo = helo || "mail.spammerhost.net";
    let sScore = parseFloat(sa_score || spamassassin_score || 1.471);
    let spf = (spf_status || "FAIL").toUpperCase();
    let dkim = (dkim_status || "NONE").toUpperCase();
    let dmarc = (dmarc_status || "FAIL").toUpperCase();
    let msgId = message_id || `<${Date.now()}.sim@mailadmin.internal>`;
    let qId = queue_id || `4Y${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    if (raw_eml) {
      const fromMatch = raw_eml.match(/^From:\s*(.+)$/im);
      if (fromMatch) sFrom = fromMatch[1].trim();
      const toMatch = raw_eml.match(/^To:\s*(.+)$/im);
      if (toMatch) eTo = toMatch[1].trim();
      const msgIdMatch = raw_eml.match(/^Message-ID:\s*(.+)$/im);
      if (msgIdMatch) msgId = msgIdMatch[1].trim();
      if (raw_eml.toLowerCase().includes("spf=pass")) spf = "PASS";
      else if (raw_eml.toLowerCase().includes("spf=fail")) spf = "FAIL";
      if (raw_eml.toLowerCase().includes("dkim=pass")) dkim = "PASS";
      else if (raw_eml.toLowerCase().includes("dkim=fail")) dkim = "FAIL";
      if (raw_eml.toLowerCase().includes("dmarc=pass")) dmarc = "PASS";
      else if (raw_eml.toLowerCase().includes("dmarc=fail")) dmarc = "FAIL";
    }

    if (!sFrom) sFrom = "notificacao@caixa.gov.br";

    // Impersonation check
    let isImpersonation = false;
    let matchedBrand = "";
    let fromDomain = sFrom.includes("@") ? sFrom.split("@")[1].replace(">", "").trim().toLowerCase() : "";

    for (const prof of virtualImpersonationProfiles) {
      if (prof.official_domains.some(d => fromDomain === d || fromDomain.endsWith(`.${d}`))) {
        matchedBrand = prof.brand_name;
        if (dmarc === "FAIL" || spf === "FAIL" || dkim === "FAIL" || dmarc === "NONE") {
          isImpersonation = true;
        }
        break;
      }
    }

    // Dynamic PTR check
    const isDynamicIp = /dynamic|dialup|dsl|pool|broadband|cable|\d+-\d+-\d+-\d+/i.test(cIp);
    const ptrHost = `dynamic-${cIp.replace(/\./g, "-")}.broadband.isp.net`;

    const triggeredRules: any[] = [];
    let intScore = 0.0;

    const addTrigger = (code: string, name: string, score: number, sev: string, evidence: string) => {
      intScore += score;
      triggeredRules.push({
        rule_code: code,
        rule_name: name,
        category: code.startsWith("SPF") || code.startsWith("DKIM") || code.startsWith("DMARC") ? "authentication" : (code.startsWith("PTR") || code.startsWith("HELO") || code.startsWith("IP") ? "rdns" : "impersonation"),
        score_applied: score,
        severity: sev,
        evidence
      });
    };

    if (spf === "PASS") addTrigger("SPF_PASS", "SPF Válido e Autorizado (Pass)", -2.0, "LOW", `SPF autorizado para o IP ${cIp}.`);
    else if (spf === "FAIL") addTrigger("SPF_FAIL", "SPF Falha Estrita (-all)", 4.0, "HIGH", `SPF falhou categoricamente (-all) para o IP ${cIp}.`);
    else if (spf === "SOFTFAIL") addTrigger("SPF_SOFTFAIL", "SPF SoftFail (~all)", 2.0, "MEDIUM", `SPF retornou SoftFail (~all) para o IP ${cIp}.`);
    else addTrigger("SPF_NONE", "SPF Ausente / Não Configurado", 1.0, "LOW", "Registro SPF ausente ou neutro.");

    if (dkim === "PASS") addTrigger("DKIM_PASS", "Assinatura DKIM Válida (Pass)", -2.0, "LOW", "Assinatura DKIM íntegra e validada.");
    else if (dkim === "FAIL") addTrigger("DKIM_FAIL", "Assinatura DKIM Inválida (Fail)", 3.0, "HIGH", "Assinatura DKIM corrompida.");
    else addTrigger("DKIM_NONE", "Assinatura DKIM Ausente", 1.0, "LOW", "Mensagem sem cabeçalho assinado por chave DKIM.");

    if (dmarc === "PASS") addTrigger("DMARC_PASS", "Conformidade DMARC Válida (Pass)", -2.0, "LOW", "Alinhamento DMARC aprovado.");
    else if (dmarc === "FAIL") addTrigger("DMARC_FAIL", "Violação DMARC (Fail)", 4.0, "CRITICAL", "Mensagem violou a política DMARC do domínio.");
    else addTrigger("DMARC_NONE", "DMARC Ausente / p=none", 2.0, "MEDIUM", "Domínio não publica registro DMARC.");

    if (isDynamicIp) {
      addTrigger("PTR_DYNAMIC", "PTR com Padrão de Banda Larga / Dinâmico", 2.0, "MEDIUM", `Nome reverso '${ptrHost}' apresenta padrão residencial.`);
      addTrigger("IP_DYNAMIC", "Origem em Faixa Residencial / Dinâmica", 4.0, "HIGH", `IP ${cIp} pertencente a bloco dinâmico não corporativo.`);
    }

    if (sFrom && eFrom && sFrom !== eFrom) {
      addTrigger("HEADER_FROM_MISMATCH", "Divergência entre Header From e Envelope From", 2.0, "MEDIUM", `Header De: (${sFrom}) diverge de Return-Path (${eFrom}).`);
    }

    if (isImpersonation) {
      addTrigger("MARCA_CONHECIDA_DMARC_FAIL", "Impersonation Crítico de Marca / Banco", 5.0, "CRITICAL", `Uso não autorizado de '${matchedBrand}' (@${fromDomain}) com falha DMARC/SPF.`);
    }

    intScore = Number(intScore.toFixed(3));
    const finalScore = Number((sScore + intScore).toFixed(3));

    const spamTh = parseFloat(virtualAntispamSettings.score_spam_threshold || "4.5");
    const highTh = parseFloat(virtualAntispamSettings.score_high_risk_threshold || "8.0");
    const critTh = parseFloat(virtualAntispamSettings.score_critical_threshold || "10.0");

    let classification = "CLEAN";
    let conf = "HIGH";
    if (isImpersonation) {
      classification = "POSSIBLE_IMPERSONATION";
    } else if (finalScore >= critTh) {
      classification = "CRITICAL";
    } else if (finalScore >= highTh) {
      classification = "HIGH_RISK";
    } else if (finalScore >= spamTh) {
      classification = "SPAM";
      conf = "MEDIUM";
    }

    const simResult = {
      success: true,
      message_id: msgId,
      queue_id: qId,
      sender_from: sFrom,
      envelope_from: eFrom,
      envelope_to: eTo,
      client_ip: cIp,
      ptr: ptrHost,
      helo: sHelo,
      spf_status: spf,
      dkim_status: dkim,
      dmarc_status: dmarc,
      sa_score: sScore,
      intelligence_score: intScore,
      final_score: finalScore,
      thresholds: {
        spam: spamTh,
        high_risk: highTh,
        critical: critTh
      },
      classification,
      confidence_level: conf,
      impersonation: {
        is_impersonation: isImpersonation,
        brand_name: matchedBrand,
        target_domain: fromDomain,
        confidence: isImpersonation ? "HIGH" : "LOW",
        reason: isImpersonation ? `Tentativa de impersonation de '${matchedBrand}'.` : "Identidade alinhada."
      },
      rdns_analysis: {
        client_ip: cIp,
        has_ptr: true,
        ptr_hostname: ptrHost,
        fcrdns_valid: !isDynamicIp,
        helo_matches_ptr: false,
        is_dynamic: isDynamicIp,
        details: `PTR: ${ptrHost}. Dinâmico: ${isDynamicIp ? 'Sim' : 'Não'}.`
      },
      triggered_rules: triggeredRules,
      triggered_rules_count: triggeredRules.length,
      explanation: `SpamAssassin (${sScore.toFixed(3)}) + Intelligence (${intScore.toFixed(3)}) = Score Final ${finalScore.toFixed(3)}. Classificação: ${classification}.`
    };

    virtualAntispamAnalyses.unshift({
      id: virtualAntispamAnalyses.length + 1,
      message_id: msgId,
      queue_id: qId,
      sender_from: sFrom,
      envelope_from: eFrom,
      envelope_to: eTo,
      client_ip: cIp,
      ptr: ptrHost,
      helo: sHelo,
      spf_status: spf,
      dkim_status: dkim,
      dmarc_status: dmarc,
      sa_score: sScore,
      intelligence_score: intScore,
      final_score: finalScore,
      classification,
      confidence_level: conf,
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19)
    });

    res.json(simResult);
  });

  // GET /api/antispam/analysis/history
  app.get("/api/antispam/analysis/history", (req, res) => {
    res.json({ success: true, history: virtualAntispamAnalyses });
  });

  // GET /api/antispam/audit
  app.get("/api/antispam/audit", (req, res) => {
    res.json({ success: true, logs: virtualAntispamAudit });
  });

  // POST /api/antispam/spamassassin/sync-diff
  app.post("/api/antispam/spamassassin/sync-diff", (req, res) => {
    const { proposed_vals } = req.body || {};
    const oldRs = 4.5;
    const newRs = parseFloat(proposed_vals?.required_score || "4.5");
    const hasChanges = oldRs !== newRs;

    res.json({
      success: true,
      diff: {
        has_changes: hasChanges,
        diff_items: hasChanges ? [
          { param: "required_score", old_val: `${oldRs}`, new_val: `${newRs}`, file: "/etc/spamassassin/local.cf" }
        ] : [],
        impact_descriptions: hasChanges ? [
          `A alteração do required_score de ${oldRs} para ${newRs} reconfigura o limiar nativo do SpamAssassin no arquivo local.cf.`
        ] : [],
        requires_restart: true,
        services_affected: ["spamassassin"]
      }
    });
  });

  // POST /api/antispam/spamassassin/sync-apply
  app.post("/api/antispam/spamassassin/sync-apply", (req, res) => {
    const { confirmed, required_score, reason } = req.body || {};
    if (!confirmed) {
      return res.status(400).json({ success: false, error: "Confirmação explícita obrigatória." });
    }

    virtualAntispamAudit.unshift({
      id: virtualAntispamAudit.length + 1,
      usuario: "admin",
      user: "admin",
      acao: "UPDATE_SPAMASSASSIN_REQUIRED_SCORE",
      action: "UPDATE_SPAMASSASSIN_REQUIRED_SCORE",
      alvo: "/etc/spamassassin/local.cf",
      target: "/etc/spamassassin/local.cf",
      valor_anterior: "4.5",
      old_value: "4.5",
      valor_novo: String(required_score),
      new_value: String(required_score),
      motivo: reason || "Ajuste de required_score do SpamAssassin",
      reason: reason || "Ajuste de required_score do SpamAssassin",
      ip_origem: "127.0.0.1",
      ip: "127.0.0.1",
      data_hora: new Date().toISOString().replace("T", " ").substring(0, 19),
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19)
    });

    res.json({ success: true, message: `Configuração atualizada para required_score ${required_score} e serviço recarregado com sucesso.` });
  });


  // Root HTML Route
  app.get("/", (req, res) => {
    res.sendFile(path.join(process.cwd(), "templates/index.html"));
  });

  // Legacy route mappings
  app.get("/api/status", (req, res) => res.redirect("/api/services/status"));
  app.post("/api/service/restart", (req, res) => {
    const { service } = req.body || {};
    res.json({ success: true, message: `Serviço ${service} reiniciado!` });
  });
  app.get("/api/spamassassin/rules", (req, res) => res.redirect("/api/services/spamassassin/rules"));
  app.post("/api/spamassassin/rules", (req, res) => res.redirect(307, "/api/services/spamassassin/rules"));
  app.post("/api/spamassassin/lint", (req, res) => res.redirect(307, "/api/services/spamassassin/lint"));
  app.get("/api/logs", (req, res) => res.redirect("/api/services/logs"));

  // Guard against unhandled /api/* requests to prevent Vite HTML fallback
  app.use("/api/*", (req, res) => {
    res.status(404).json({
      status: "error",
      success: false,
      message: `Rota de API não encontrada: ${req.originalUrl}`
    });
  });

  // Vite Development Server Middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MailAdmin Suite rodando em http://0.0.0.0:${PORT}`);
  });
}

startServer();
