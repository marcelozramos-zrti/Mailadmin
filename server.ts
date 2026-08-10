import express from "express";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Virtual Database for Preview Mode (vmail MariaDB simulation)
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
    { domain: "empresa.com.br", description: "Domínio Principal da Empresa", aliases: 3, mailboxes: 12, maxquota: 51200, transport: "virtual", active: true, created: "2026-01-15 10:00:00" },
    { domain: "parceiro.com.br", description: "Domínio de Parceiro Comercial", aliases: 1, mailboxes: 4, maxquota: 20480, transport: "virtual", active: true, created: "2026-02-01 14:30:00" },
    { domain: "loja-online.com", description: "E-commerce e Vendas", aliases: 5, mailboxes: 8, maxquota: 30720, transport: "virtual", active: false, created: "2026-03-10 09:15:00" }
  ];

  let virtualMailboxes = [
    { username: "diretoria@empresa.com.br", name: "Diretoria Executiva", maildir: "empresa.com.br/diretoria/", quota: 10240, bytes_used: 3221225472, domain: "empresa.com.br", active: true, created: "2026-01-15 10:05:00" },
    { username: "financeiro@empresa.com.br", name: "Setor Financeiro", maildir: "empresa.com.br/financeiro/", quota: 5120, bytes_used: 4194304000, domain: "empresa.com.br", active: true, created: "2026-01-15 10:10:00" },
    { username: "suporte@empresa.com.br", name: "Atendimento & Suporte", maildir: "empresa.com.br/suporte/", quota: 5120, bytes_used: 838860800, domain: "empresa.com.br", active: true, created: "2026-01-16 08:00:00" },
    { username: "vendas@loja-online.com", name: "Equipe de Vendas", maildir: "loja-online.com/vendas/", quota: 2048, bytes_used: 1258291200, domain: "loja-online.com", active: true, created: "2026-03-10 09:20:00" }
  ];

  let virtualAliases = [
    { address: "contato@empresa.com.br", goto: "suporte@empresa.com.br, vendas@loja-online.com", domain: "empresa.com.br", active: true, created: "2026-01-16 09:00:00" },
    { address: "sac@loja-online.com", goto: "suporte@empresa.com.br", domain: "loja-online.com", active: true, created: "2026-03-11 11:00:00" }
  ];

  let virtualQueue = [
    { queue_id: "4YtZ8b3K", size: 3412, date: "Tue Aug 9 10:20:00", sender: "marketing@spammerdomain.net", recipients: ["diretoria@empresa.com.br"], reason: "Connection timed out with mailserver.spammerdomain.net[198.51.100.42]" },
    { queue_id: "9A1X0c9P", size: 8192, date: "Tue Aug 9 10:35:12", sender: "boleto-falso@bancofake.com", recipients: ["financeiro@empresa.com.br"], reason: "451 4.3.0 <financeiro@empresa.com.br>: Temporary lookup failure" }
  ];

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

  app.post("/api/auth/login", (req, res) => {
    const { username, password, token } = req.body || {};
    if (username !== virtualAdmin.username || password !== virtualAdmin.password) {
      return res.status(401).json({ success: false, message: "Usuário ou senha incorretos." });
    }

    if (!virtualAdmin.otp_enabled) {
      const qrDemo = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><rect width='200' height='200' fill='%23f8fafc'/><rect x='20' y='20' width='60' height='60' fill='%230f172a'/><rect x='30' y='30' width='40' height='40' fill='%23ffffff'/><rect x='40' y='40' width='20' height='20' fill='%230f172a'/><rect x='120' y='20' width='60' height='60' fill='%230f172a'/><rect x='130' y='30' width='40' height='40' fill='%23ffffff'/><rect x='140' y='40' width='20' height='20' fill='%230f172a'/><rect x='20' y='120' width='60' height='60' fill='%230f172a'/><rect x='30' y='130' width='40' height='40' fill='%23ffffff'/><rect x='40' y='140' width='20' height='20' fill='%230f172a'/><path d='M100 20h10v30h-10zM100 80h30v20h-30zM120 120h40v20h-40zM150 150h30v30h-30z' fill='%230f172a'/></svg>";
      return res.json({
        success: false,
        require_mfa_setup: true,
        temp_user_id: 1,
        username: virtualAdmin.username,
        otp_secret: virtualAdmin.otp_secret,
        provision_url: `otpauth://totp/MailAdmin%20Suite:${virtualAdmin.username}?secret=${virtualAdmin.otp_secret}&issuer=MailAdmin%20Suite`,
        qr_code_base64: qrDemo,
        message: "Configuração do Autenticador MFA é OBRIGATÓRIA no primeiro acesso ao painel."
      });
    }

    if (!token) {
      return res.json({ success: false, mfa_required: true, message: "Insira o código TOTP de 6 dígitos do Google Authenticator." });
    }
    if (token.length !== 6) {
      return res.status(401).json({ success: false, message: "Código TOTP inválido." });
    }

    res.json({
      success: true,
      message: "Login realizado com sucesso!",
      user: { id: 1, username: virtualAdmin.username, role: virtualAdmin.role, mfa_enabled: true }
    });
  });

  app.get("/api/auth/mfa/setup", (req, res) => {
    const qrDemo = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><rect width='200' height='200' fill='%23f8fafc'/><rect x='20' y='20' width='60' height='60' fill='%230f172a'/><rect x='30' y='30' width='40' height='40' fill='%23ffffff'/><rect x='40' y='40' width='20' height='20' fill='%230f172a'/><rect x='120' y='20' width='60' height='60' fill='%230f172a'/><rect x='130' y='30' width='40' height='40' fill='%23ffffff'/><rect x='140' y='40' width='20' height='20' fill='%230f172a'/><rect x='20' y='120' width='60' height='60' fill='%230f172a'/><rect x='30' y='130' width='40' height='40' fill='%23ffffff'/><rect x='40' y='140' width='20' height='20' fill='%230f172a'/><path d='M100 20h10v30h-10zM100 80h30v20h-30zM120 120h40v20h-40zM150 150h30v30h-30z' fill='%230f172a'/></svg>";
    res.json({
      success: true,
      otp_secret: virtualAdmin.otp_secret,
      qr_code_base64: qrDemo,
      provision_url: `otpauth://totp/MailAdmin%20Suite:${virtualAdmin.username}?secret=${virtualAdmin.otp_secret}&issuer=MailAdmin%20Suite`
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
    res.json({ success: true, message: `Administrador "${removedUsername}" excluído com sucesso!` });
  };

  app.delete("/api/auth/admins/:id", deleteAdminHandler);
  app.post("/api/auth/admins/:id/delete", deleteAdminHandler);

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
    res.json({ success: true, message: `Domínio ${domain} criado no banco vmail!`, domain: newDom });
  });

  app.post("/api/vmail/domains/:domain/toggle", (req, res) => {
    const dom = virtualDomains.find(d => d.domain === req.params.domain);
    if (!dom) return res.status(404).json({ success: false, message: "Domínio não encontrado." });
    dom.active = !dom.active;
    res.json({ success: true, message: `Status do domínio ${dom.domain} alterado!` });
  });

  app.delete("/api/vmail/domains/:domain", (req, res) => {
    virtualDomains = virtualDomains.filter(d => d.domain !== req.params.domain);
    virtualMailboxes = virtualMailboxes.filter(m => m.domain !== req.params.domain);
    virtualAliases = virtualAliases.filter(a => a.domain !== req.params.domain);
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
    const fullEmail = username.includes("@") ? username : `${username}@${domain}`;
    const domName = domain || fullEmail.split("@")[1];

    if (virtualMailboxes.some(m => m.username === fullEmail)) {
      return res.status(400).json({ success: false, message: "Caixa postal já existente." });
    }

    const newMb = {
      username: fullEmail,
      name: name || "",
      maildir: `${domName}/${fullEmail.split("@")[0]}/`,
      quota: quota || 1024,
      bytes_used: 0,
      domain: domName,
      active: true,
      created: new Date().toISOString().replace("T", " ").substring(0, 19)
    };
    virtualMailboxes.push(newMb);

    const d = virtualDomains.find(dom => dom.domain === domName);
    if (d) d.mailboxes += 1;

    res.json({ success: true, message: `Caixa postal ${fullEmail} criada com hash Dovecot ${scheme || 'SSHA512'}!`, mailbox: newMb });
  });

  app.put("/api/vmail/mailboxes/:email/quota", (req, res) => {
    const email = decodeURIComponent(req.params.email);
    const { quota } = req.body || {};
    const mb = virtualMailboxes.find(m => m.username === email);
    if (!mb) return res.status(404).json({ success: false, message: "Caixa postal não encontrada." });
    mb.quota = parseInt(quota) || 1024;
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
    res.json({ success: true, message: `Caixa postal ${email} removida do banco vmail.` });
  });

  app.get("/api/vmail/aliases", (req, res) => {
    res.json({ success: true, aliases: virtualAliases });
  });

  app.post("/api/vmail/aliases", (req, res) => {
    const { address, goto } = req.body || {};
    const domName = address.split("@")[1];
    const newAl = {
      address,
      goto,
      domain: domName,
      active: true,
      created: new Date().toISOString().replace("T", " ").substring(0, 19)
    };
    virtualAliases.push(newAl);
    res.json({ success: true, message: `Alias ${address} -> ${goto} cadastrado!` });
  });

  app.delete("/api/vmail/aliases/:address", (req, res) => {
    const address = decodeURIComponent(req.params.address);
    virtualAliases = virtualAliases.filter(a => a.address !== address);
    res.json({ success: true, message: `Alias ${address} removido!` });
  });

  // ===============================================
  // 3. TROUBLESHOOTING & HEALTH TOOLS
  // ===============================================

  // Tracking de E-mail (/var/log/mail.log)
  app.all("/api/troubleshooting/email-tracking", (req, res) => {
    const data = req.method === "POST" ? (req.body || {}) : req.query;
    const date = String(data.date || data.data_busca || data.period || data.periodo || new Date().toISOString().split("T")[0]).trim();
    const delivery_status = String(data.delivery_status || data.status_entrega || "").trim().toLowerCase();
    const service = String(data.service || data.servico || "").trim().toLowerCase();
    const mailbox = String(data.mailbox || data.caixa_postal || data.sender || data.recipient || "").trim().toLowerCase();
    const search_term = String(data.search_term || data.termo_busca || "").trim().toLowerCase();
    const limit = parseInt(String(data.limit || data.limite || "500"), 10) || 500;

    const parts = date.split("-");
    let formattedDate = date;
    if (parts.length === 3) {
      formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    const sendAddr = mailbox || "usuario@empresa.com.br";
    const recvAddr = "destino@cliente.com.br";
    const qid = "4YtZ8b3K";

    const mockLines = [
      `${date} 10:14:02 mailserver postfix/smtpd[14201]: connect from mail-out.parceiro.com.br[198.51.100.12]`,
      `${date} 10:14:02 mailserver postfix/smtpd[14201]: 4YtZ8b3K: client=mail-out.parceiro.com.br[198.51.100.12]`,
      `${date} 10:14:03 mailserver postfix/cleanup[14205]: 4YtZ8b3K: message-id=<202608091014.4YtZ8b3K@parceiro.com.br>`,
      `${date} 10:14:03 mailserver postfix/qmgr[1820]: 4YtZ8b3K: from=<${sendAddr}>, size=2849, nrcpt=1 (queue active)`,
      `${date} 10:14:04 mailserver amavis[1204]: (4YtZ8b3K) Passed CLEAN {RelayedInbound}, [198.51.100.12] <${sendAddr}> -> <${recvAddr}>, Hits: -0.100`,
      `${date} 10:14:05 mailserver postfix/lmtp[14220]: 4YtZ8b3K: to=<${recvAddr}>, relay=127.0.0.1[127.0.0.1]:24, delay=2.1, dsn=2.0.0, status=sent (250 2.0.0 OK saved_to_mailbox)`,
      `${date} 10:14:05 mailserver dovecot: lda(${recvAddr}): msgid=<202608091014.4YtZ8b3K@parceiro.com.br>: saved mail to INBOX`,
      `${date} 10:14:05 mailserver postfix/qmgr[1820]: 4YtZ8b3K: removed`
    ];

    let filtered = mockLines;
    if (mailbox) filtered = filtered.filter(l => l.toLowerCase().includes(mailbox));
    if (search_term) filtered = filtered.filter(l => l.toLowerCase().includes(search_term));
    if (delivery_status) filtered = filtered.filter(l => l.toLowerCase().includes(delivery_status));
    if (service) filtered = filtered.filter(l => l.toLowerCase().includes(service));

    res.json({
      success: true,
      period: date,
      period_label: `Data: ${formattedDate}`,
      mailbox,
      search_term,
      delivery_status,
      service,
      limit,
      total_matches: filtered.length,
      lines: filtered.slice(-limit),
      raw_text: filtered.join("\n")
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
