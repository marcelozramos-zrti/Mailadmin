import express from "express";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { createServer as createViteServer } from "vite";
import { DatabaseSync } from "node:sqlite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize SQLite Database for Persistent Audit Logging
  const dbPath = path.join(process.cwd(), "vmail.sqlite");
  const sqliteDb = new DatabaseSync(dbPath);

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS system_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      admin_user TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT DEFAULT '-',
      ip_address TEXT DEFAULT '127.0.0.1',
      severity_level TEXT DEFAULT 'normal',
      details_json TEXT DEFAULT '{}'
    )
  `);

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

    try {
      const stmt = sqliteDb.prepare(`
        INSERT INTO system_audit_logs (timestamp, admin_user, action, target, ip_address, severity_level, details_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(timestampStr, username, action, target || "-", reqIp, severityLevel, detailsStr);
    } catch (err) {
      console.error("Erro ao inserir log de auditoria no SQLite:", err);
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
      severity_level: severityLevel,
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
# Gerenciado via MailAdmin Suite Web

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

whitelist_from *@empresa.com.br
whitelist_from *@parceiro.com.br
blacklist_from *@spammerdomain.net
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
    addAuditLog("DOMAIN_DELETE", req.params.domain, {}, "critical", req);
    res.json({ success: true, message: `Domínio e registros associados excluídos com sucesso!` });
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

    const mockLines = [
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

    // Filter by time window
    const timeFiltered = mockLines.filter(line => {
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
    res.json({ success: true, message: `Mensagem ${queue_id} deletada da fila com postsuper -d!` });
  });

  app.post("/api/troubleshooting/queue/flush", (req, res) => {
    virtualQueue = [];
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

    return res.json({
      status: "success",
      message: "Regra aplicada com sucesso!",
      rule: newRule
    });
  });

  // Validador DNS (dnspython)
  app.all("/api/troubleshooting/dns-check", (req, res) => {
    const domain = (req.body?.domain || req.query?.domain as string || "empresa.com.br").toLowerCase();
    const selector = (req.body?.selector || req.query?.selector as string || "dkim").toLowerCase();

    res.json({
      success: true,
      dns_report: {
        domain: domain,
        mx: {
          status: "OK",
          records: [`10 mail.${domain}`, `20 backup-mail.${domain}`],
          details: "2 servidores MX configurados e operacionais."
        },
        spf: {
          status: "OK",
          record: `v=spf1 mx ip4:203.0.113.10 include:_spf.google.com ~all`,
          details: "Registro SPF v=spf1 válido encontrado no TXT."
        },
        dkim: {
          status: "OK",
          record: `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ...`,
          details: `Chave Pública DKIM validada com sucesso no seletor '${selector}'`,
          selector: selector
        },
        dmarc: {
          status: "OK",
          record: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100`,
          details: "Política DMARC com quarentena e relatórios configurada."
        }
      }
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

    addAuditLog(
      "MAILLOG_INGEST",
      "Importação MailLog MariaDB",
      {
        batch_records: newBatch,
        total_records: virtualMailLogCount,
        new_incident_detected: selectedInc.title,
        incident_id: newIncident.id
      },
      "normal"
    );

    res.json({
      success: true,
      total_records: virtualMailLogCount,
      message: `Ingestão de MailLog executada com sucesso! ${newBatch} novos registros gravados. Incidente #${newIncident.id} ("${selectedInc.title}") gerado.`,
      output: `[${nowStr}] ${newBatch} linhas lidas de /var/log/mail.log -> ${virtualMailLogCount} total de registros inseridos no MariaDB.`
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
    res.json({ success: true, message: `Serviço ${service} reiniciado com sucesso via sudo systemctl!` });
  });

  app.get("/api/services/spamassassin/rules", (req, res) => {
    res.json({ success: true, content: virtualLocalCf });
  });

  app.post("/api/services/spamassassin/rules", (req, res) => {
    const { content } = req.body || {};
    virtualLocalCf = content;
    res.json({ success: true, message: "Regras salvas no local.cf e Amavis reiniciado!" });
  });

  app.get("/api/services/spamassassin/visual-rules", (req, res) => {
    const lines = virtualLocalCf.split("\n");
    const rules: any[] = [];
    const pattern = /^\s*(blacklist_from|whitelist_from)\s+(.+)$/i;

    let id = 0;
    for (const line of lines) {
      const match = line.trim().match(pattern);
      if (match) {
        const action_type = match[1].toLowerCase();
        const val = match[2].trim();
        rules.push({
          id: id++,
          type: action_type,
          action_label: action_type === "blacklist_from" ? "Bloquear (Blacklist)" : "Liberar (Whitelist)",
          value: val,
          raw: line.trim()
        });
      }
    }
    res.json({ success: true, rules });
  });

  app.post("/api/services/spamassassin/visual-rules", (req, res) => {
    const { action, value } = req.body || {};
    if (!action || !["blacklist_from", "whitelist_from"].includes(action)) {
      return res.status(400).json({ success: false, message: "Ação inválida." });
    }
    if (!value || !value.trim()) {
      return res.status(400).json({ success: false, message: "Valor inválido." });
    }

    const newRuleLine = `${action} ${value.trim()}`;
    const lines = virtualLocalCf.split("\n").map(l => l.trim());

    if (!lines.includes(newRuleLine)) {
      if (virtualLocalCf && !virtualLocalCf.endsWith("\n")) {
        virtualLocalCf += "\n";
      }
      virtualLocalCf += newRuleLine + "\n";
    }

    res.json({
      success: true,
      message: `Regra '${newRuleLine}' adicionada com sucesso! Serviço SpamAssassin reiniciado.`
    });
  });

  const deleteVisualRule = (req: express.Request, res: express.Response) => {
    const { raw, action, value } = req.body || {};
    const targetLine = raw || (action && value ? `${action} ${value}` : req.query.raw as string || req.query.value as string);

    if (!targetLine) {
      return res.status(400).json({ success: false, message: "Especificação da regra não fornecida." });
    }

    const targetClean = targetLine.trim().toLowerCase();
    const lines = virtualLocalCf.split("\n");
    const filtered = lines.filter(l => l.trim().toLowerCase() !== targetClean);
    virtualLocalCf = filtered.join("\n");

    res.json({
      success: true,
      message: "Regra removida com sucesso! Serviço SpamAssassin reiniciado."
    });
  };

  app.delete("/api/services/spamassassin/visual-rules", deleteVisualRule);
  app.post("/api/services/spamassassin/visual-rules/delete", deleteVisualRule);

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
