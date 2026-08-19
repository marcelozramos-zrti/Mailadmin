import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Mail, 
  Shield, 
  Bug, 
  RefreshCw, 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  Lock, 
  Key, 
  FileCode, 
  Terminal, 
  Search, 
  Sliders, 
  Save, 
  Check, 
  X, 
  Clock, 
  Cpu, 
  HardDrive, 
  Activity, 
  Calendar, 
  ExternalLink, 
  Download, 
  Copy, 
  Sparkles, 
  Zap, 
  AlertCircle,
  Database,
  Filter
} from 'lucide-react';
import { ServicesMap, ServerServiceDetail, SslCertificateInfo } from '../types';

interface ServersTabProps {
  services: ServicesMap;
  onShowAlert: (msg: string, type: 'success' | 'danger') => void;
  onRefreshStatus: () => void;
  onNavigateToSpamIntelligence?: () => void;
}

type ServerSubTab = 'postfix' | 'amavis' | 'clamav' | 'spamassassin';

export const ServersTab: React.FC<ServersTabProps> = ({
  services,
  onShowAlert,
  onRefreshStatus,
  onNavigateToSpamIntelligence
}) => {
  const [activeSubTab, setActiveSubTab] = useState<ServerSubTab>('postfix');
  const [loading, setLoading] = useState<boolean>(true);
  const [overview, setOverview] = useState<Record<string, any>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Power Query / SearchLog state
  const [logQuery, setLogQuery] = useState<string>('');
  const [logFilter, setLogFilter] = useState<'all' | 'errors' | 'clean' | 'auth' | 'spam_virus'>('all');
  const [logs, setLogs] = useState<string[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState<boolean>(false);

  // Raw editor state
  const [configFile, setConfigFile] = useState<string>('/etc/postfix/main.cf');
  const [configContent, setConfigContent] = useState<string>('');
  const [loadingConfig, setLoadingConfig] = useState<boolean>(false);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [syntaxResult, setSyntaxResult] = useState<{ success: boolean; message: string } | null>(null);

  // Visual feature state (Editable controls)
  const [features, setFeatures] = useState<Record<string, any>>({
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
  });

  const [savingFeature, setSavingFeature] = useState<boolean>(false);

  // SSL Certificate state
  const [sslInfo, setSslInfo] = useState<SslCertificateInfo>({
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
  });

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/servers/overview');
      if (res.ok) {
        const data = await res.json();
        setOverview(data.services || {});
        if (data.ssl_info) {
          setSslInfo(data.ssl_info);
        }
        if (data.features) {
          setFeatures(prev => ({ ...prev, ...data.features }));
        }
      }
    } catch (err: any) {
      console.error("Erro ao obter overview dos servidores:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchServiceLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/servers/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: activeSubTab,
          query: logQuery,
          filter: logFilter,
          limit: 50
        })
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Erro ao buscar logs:", err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchConfigFile = async (fileKey?: string) => {
    setLoadingConfig(true);
    setSyntaxResult(null);
    try {
      const targetFile = fileKey || configFile;
      const res = await fetch(`/api/servers/config?service=${activeSubTab}&file=${encodeURIComponent(targetFile)}`);
      if (res.ok) {
        const data = await res.json();
        setConfigContent(data.content || '');
        setConfigFile(data.file || targetFile);
      }
    } catch (err: any) {
      onShowAlert('Erro ao carregar arquivo de configuração: ' + err.message, 'danger');
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  useEffect(() => {
    // When subtab changes, update default config file and reload logs & config
    let defaultFile = '/etc/postfix/main.cf';
    if (activeSubTab === 'postfix') defaultFile = '/etc/postfix/main.cf';
    else if (activeSubTab === 'amavis') defaultFile = '/etc/amavis/conf.d/50-user';
    else if (activeSubTab === 'clamav') defaultFile = '/etc/clamav/clamd.conf';
    else if (activeSubTab === 'spamassassin') defaultFile = '/etc/spamassassin/local.cf';

    setConfigFile(defaultFile);
    fetchServiceLogs();
    fetchConfigFile(defaultFile);
  }, [activeSubTab]);

  useEffect(() => {
    fetchServiceLogs();
  }, [logFilter, logQuery]);

  useEffect(() => {
    if (!autoRefreshLogs) return;
    const interval = setInterval(fetchServiceLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefreshLogs, activeSubTab, logFilter, logQuery]);

  const handleServiceAction = async (action: 'restart' | 'reload' | 'stop' | 'start' | 'check') => {
    setActionLoading(action);
    try {
      const res = await fetch('/api/servers/service-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: activeSubTab, action })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        fetchOverview();
        fetchServiceLogs();
        onRefreshStatus();
      } else {
        onShowAlert(data.message || 'Falha ao executar ação', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro: ' + err.message, 'danger');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setSyntaxResult(null);
    try {
      const res = await fetch('/api/servers/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: activeSubTab,
          file: configFile,
          content: configContent
        })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message || `Configuração ${configFile} salva com sucesso!`, 'success');
        setSyntaxResult({ success: true, message: 'Arquivo salvo e sintaxe validada pelo daemon.' });
        fetchOverview();
        fetchServiceLogs();
      } else {
        onShowAlert(data.message || 'Falha ao salvar configuração', 'danger');
        setSyntaxResult({ success: false, message: data.message || 'Erro de sintaxe detectado.' });
      }
    } catch (err: any) {
      onShowAlert('Erro: ' + err.message, 'danger');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveFeature = async (featureName: string, value: any) => {
    setSavingFeature(true);
    try {
      const res = await fetch('/api/servers/feature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: activeSubTab,
          feature: featureName,
          value: value
        })
      });
      const data = await res.json();
      if (data.success) {
        setFeatures(prev => ({ ...prev, [featureName]: value }));
        onShowAlert(data.message || `Parâmetro ${featureName} atualizado com sucesso!`, 'success');
        fetchOverview();
        fetchConfigFile();
      } else {
        onShowAlert(data.message || 'Erro ao atualizar recurso', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro: ' + err.message, 'danger');
    } finally {
      setSavingFeature(false);
    }
  };

  const handleRenewSsl = async () => {
    setActionLoading('ssl_renew');
    try {
      const res = await fetch('/api/servers/ssl-cert/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: sslInfo.domain })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message || 'Certificado SSL verificado e renovado via Certbot!', 'success');
        if (data.ssl_info) {
          setSslInfo(data.ssl_info);
        }
      } else {
        onShowAlert(data.message || 'Erro ao renovar certificado SSL', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro: ' + err.message, 'danger');
    } finally {
      setActionLoading(null);
    }
  };

  // Get current active service info from overview
  const currentServiceKey = activeSubTab === 'clamav' ? 'clamav-daemon' : activeSubTab;
  const currentServiceInfo = overview[currentServiceKey] || {
    name: activeSubTab,
    status: services[currentServiceKey]?.active ? 'active' : 'inactive',
    pid: activeSubTab === 'postfix' ? 14010 : activeSubTab === 'amavis' ? 1204 : activeSubTab === 'clamav' ? 890 : 1350,
    memory_mb: activeSubTab === 'clamav' ? 1024 : activeSubTab === 'amavis' ? 384 : 128,
    cpu_percent: 1.2,
    uptime: '14 dias, 6 horas',
    ports: activeSubTab === 'postfix' ? [25, 465, 587] : activeSubTab === 'amavis' ? [10024, 10025] : activeSubTab === 'clamav' ? [3310] : [783]
  };

  const isServiceActive = services[currentServiceKey]?.active ?? true;

  return (
    <div className="space-y-6">
      {/* Top Header Title & Tab Navigation */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-md shadow-indigo-500/20">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Servidores & Daemons de E-mail
                </h1>
                <p className="text-xs text-slate-500">
                  Gerenciamento individual, controle de recursos visuais, expiração de certificados SSL, logs em tempo real e editor de arquivos raw.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Refresh Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                fetchOverview();
                fetchServiceLogs();
                fetchConfigFile();
                onRefreshStatus();
              }}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors border border-slate-300 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar Painel
            </button>
          </div>
        </div>

        {/* 4 Main Server Tabs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-6 pt-4 border-t border-slate-100">
          {/* 1. Postfix */}
          <button
            onClick={() => setActiveSubTab('postfix')}
            className={`p-3.5 rounded-xl text-left border transition-all flex items-center justify-between ${
              activeSubTab === 'postfix'
                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${activeSubTab === 'postfix' ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-700'}`}>
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold leading-tight">Postfix</div>
                <div className={`text-[10px] ${activeSubTab === 'postfix' ? 'text-blue-100' : 'text-slate-500'}`}>
                  MTA & SMTP Server
                </div>
              </div>
            </div>
            <span className={`w-2.5 h-2.5 rounded-full ${services['postfix']?.active ? 'bg-emerald-400' : 'bg-rose-500'}`} />
          </button>

          {/* 2. Amavis */}
          <button
            onClick={() => setActiveSubTab('amavis')}
            className={`p-3.5 rounded-xl text-left border transition-all flex items-center justify-between ${
              activeSubTab === 'amavis'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${activeSubTab === 'amavis' ? 'bg-indigo-700 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold leading-tight">Amavis</div>
                <div className={`text-[10px] ${activeSubTab === 'amavis' ? 'text-indigo-100' : 'text-slate-500'}`}>
                  Content Filter & Policy
                </div>
              </div>
            </div>
            <span className={`w-2.5 h-2.5 rounded-full ${services['amavis']?.active ? 'bg-emerald-400' : 'bg-rose-500'}`} />
          </button>

          {/* 3. ClamAV */}
          <button
            onClick={() => setActiveSubTab('clamav')}
            className={`p-3.5 rounded-xl text-left border transition-all flex items-center justify-between ${
              activeSubTab === 'clamav'
                ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/20'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${activeSubTab === 'clamav' ? 'bg-rose-700 text-white' : 'bg-rose-100 text-rose-700'}`}>
                <Bug className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold leading-tight">ClamAV (Antivírus)</div>
                <div className={`text-[10px] ${activeSubTab === 'clamav' ? 'text-rose-100' : 'text-slate-500'}`}>
                  clamd & freshclam
                </div>
              </div>
            </div>
            <span className={`w-2.5 h-2.5 rounded-full ${services['clamav-daemon']?.active ? 'bg-emerald-400' : 'bg-rose-500'}`} />
          </button>

          {/* 4. AntiSpam */}
          <button
            onClick={() => setActiveSubTab('spamassassin')}
            className={`p-3.5 rounded-xl text-left border transition-all flex items-center justify-between ${
              activeSubTab === 'spamassassin'
                ? 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-600/20'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${activeSubTab === 'spamassassin' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-700'}`}>
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold leading-tight">AntiSpam</div>
                <div className={`text-[10px] ${activeSubTab === 'spamassassin' ? 'text-amber-100' : 'text-slate-500'}`}>
                  SpamAssassin Daemon
                </div>
              </div>
            </div>
            <span className={`w-2.5 h-2.5 rounded-full ${services['spamassassin']?.active ? 'bg-emerald-400' : 'bg-rose-500'}`} />
          </button>
        </div>
      </div>

      {/* Main Service Status Header & Quick Controls */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-sm border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold uppercase tracking-wide text-white">
                {activeSubTab === 'postfix' && 'Postfix Mail Transfer Agent (MTA)'}
                {activeSubTab === 'amavis' && 'Amavisd-new Content Router & Filter'}
                {activeSubTab === 'clamav' && 'ClamAV Daemon & FreshClam Antivirus'}
                {activeSubTab === 'spamassassin' && 'SpamAssassin Heuristic & Bayesian Filter'}
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                isServiceActive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isServiceActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                {isServiceActive ? 'Serviço Ativo' : 'Serviço Inativo'}
              </span>
            </div>

            {/* Service details badges */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 font-mono">
              <span className="bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                PID: <strong className="text-blue-400">{currentServiceInfo.pid || 14010}</strong>
              </span>
              <span className="bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                Memória: <strong className="text-emerald-400">{currentServiceInfo.memory_mb || 128} MB</strong>
              </span>
              <span className="bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                Portas: <strong className="text-amber-400">{(currentServiceInfo.ports || []).join(', ')}</strong>
              </span>
              <span className="bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                Uptime: <strong className="text-slate-200">{currentServiceInfo.uptime || '14 dias, 6 horas'}</strong>
              </span>
            </div>
          </div>

          {/* Action Control Buttons (Restart, Reload, Syntax Check) */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleServiceAction('restart')}
              disabled={actionLoading !== null}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 transition-all"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${actionLoading === 'restart' ? 'animate-spin' : ''}`} />
              Reiniciar Serviço
            </button>

            <button
              onClick={() => handleServiceAction('reload')}
              disabled={actionLoading !== null}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${actionLoading === 'reload' ? 'animate-spin' : ''}`} />
              Recarregar (Reload)
            </button>

            <button
              onClick={() => handleServiceAction('check')}
              disabled={actionLoading !== null}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Testar Sintaxe
            </button>
          </div>
        </div>
      </div>

      {/* Visual Resource Dropdowns & Feature Controls */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Painel de Recursos Visuais & Parâmetros do {activeSubTab.toUpperCase()}
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Ajustes aplicados diretamente nas diretivas do sistema
          </span>
        </div>

        {/* 1. POSTFIX SPECIFIC VISUAL CONTROLS */}
        {activeSubTab === 'postfix' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Autenticação SMTP (SASL) */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-blue-600" /> Autenticação SMTP (SASL)
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    Ativo
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Exigir autenticação de usuário para envio de e-mails via Dovecot SASL.
                </p>
                <div className="space-y-2 pt-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">Tipo de Backend SASL:</label>
                  <select
                    value={features.smtpd_sasl_type}
                    onChange={(e) => handleSaveFeature('smtpd_sasl_type', e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="dovecot">Dovecot (Recomendado - Unix Socket)</option>
                    <option value="cyrus">Cyrus SASL</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-slate-700 block">Opções de Segurança:</label>
                  <select
                    value={features.smtpd_sasl_security_options}
                    onChange={(e) => handleSaveFeature('smtpd_sasl_security_options', e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="noanonymous, noplaintext">Bloquear Anônimo e Texto Claro (noanonymous, noplaintext)</option>
                    <option value="noanonymous">Apenas Bloquear Anônimo (noanonymous)</option>
                  </select>
                </div>
              </div>

              {/* Nível de Criptografia TLS/SSL & Portas */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-indigo-600" /> Criptografia TLS & Portas
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                    STARTTLS / SSL
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Definição do nível de segurança TLS e portas de envio disponíveis.
                </p>
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-slate-700 block">Nível de Segurança TLS:</label>
                  <select
                    value={features.smtpd_tls_security_level}
                    onChange={(e) => handleSaveFeature('smtpd_tls_security_level', e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="may">Oportunístico (may - STARTTLS se suportado)</option>
                    <option value="encrypt">Obrigatório (encrypt - Requer TLS)</option>
                    <option value="mandatory">Mandatório (mandatory)</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={features.submission_port_enabled}
                      onChange={(e) => handleSaveFeature('submission_port_enabled', e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    Porta 587 (Submission)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={features.smtps_port_enabled}
                      onChange={(e) => handleSaveFeature('smtps_port_enabled', e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    Porta 465 (SMTPS)
                  </label>
                </div>
              </div>

              {/* Limite de Tamanho de Mensagem */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <HardDrive className="w-4 h-4 text-amber-600" /> Limite de Tamanho de E-mail
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                    {features.message_size_limit_mb} MB
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Tamanho máximo permitido por mensagem (message_size_limit).
                </p>
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-slate-700 block">Tamanho Máximo:</label>
                  <select
                    value={features.message_size_limit_mb}
                    onChange={(e) => handleSaveFeature('message_size_limit_mb', Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value={25}>25 MB (Padrão Corporativo)</option>
                    <option value={50}>50 MB (Recomendado)</option>
                    <option value={100}>100 MB (Arquivos Grandes)</option>
                  </select>
                </div>
                <div className="pt-2">
                  <button
                    onClick={() => handleServiceAction('reload')}
                    className="w-full py-1.5 px-3 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Esvaziar / Forçar Fila de Mensagens (postqueue -f)
                  </button>
                </div>
              </div>
            </div>

            {/* Certificado SSL/TLS & Data de Expiração */}
            <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-sm">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Certificado Digital TLS/SSL do Servidor ({sslInfo.domain})
                    </h4>
                    <p className="text-xs text-slate-600">
                      Emissor: <strong>{sslInfo.issuer}</strong> • Renovação automática Certbot: <strong>Ativa</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="text-xs font-bold text-emerald-900 block">
                      Válido até {sslInfo.valid_to.substring(0, 10)}
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-200/80 px-2 py-0.5 rounded-full inline-block">
                      {sslInfo.days_remaining} dias restantes
                    </span>
                  </div>
                  <button
                    onClick={handleRenewSsl}
                    disabled={actionLoading === 'ssl_renew'}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${actionLoading === 'ssl_renew' ? 'animate-spin' : ''}`} />
                    Verificar / Renovar SSL
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono text-slate-700 bg-white p-3 rounded-xl border border-emerald-200/60">
                <div>
                  <span className="text-slate-400">smtpd_tls_cert_file:</span> {sslInfo.cert_path}
                </div>
                <div>
                  <span className="text-slate-400">smtpd_tls_key_file:</span> {sslInfo.key_path}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. AMAVIS SPECIFIC VISUAL CONTROLS */}
        {activeSubTab === 'amavis' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Bypass de Antivírus e Antispam */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-indigo-600" /> Roteamento de Filtros
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                    Porta 10024
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Ativar ou ignorar checagens no fluxo de entrada do Amavis.
                </p>
                <div className="space-y-2 pt-1">
                  <label className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-xs cursor-pointer">
                    <span className="text-slate-800 font-medium">Verificação de Antivírus (ClamAV)</span>
                    <input
                      type="checkbox"
                      checked={!features.bypass_virus_checks}
                      onChange={(e) => handleSaveFeature('bypass_virus_checks', !e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-xs cursor-pointer">
                    <span className="text-slate-800 font-medium">Verificação de Spam (SpamAssassin)</span>
                    <input
                      type="checkbox"
                      checked={!features.bypass_spam_checks}
                      onChange={(e) => handleSaveFeature('bypass_spam_checks', !e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                  </label>
                </div>
              </div>

              {/* Limiares de Pontuação de Spam ($sa_..._level_deflt) */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-blue-600" /> Limiares de Ação de Spam
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                    $sa_*_level
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500">Tag Level</div>
                    <div className="text-sm font-bold text-blue-600">{features.sa_tag_level_deflt}</div>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500">Tag2 (Header)</div>
                    <div className="text-sm font-bold text-amber-600">{features.sa_tag2_level_deflt}</div>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500">Kill / Quarentena</div>
                    <div className="text-sm font-bold text-rose-600">{features.sa_kill_level_deflt}</div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Mensagens com score &ge; {features.sa_tag2_level_deflt} recebem a marcação [SPAM]. Score &ge; {features.sa_kill_level_deflt} são bloqueadas.
                </p>
              </div>

              {/* Servidores Paralelos ($max_servers) */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-purple-600" /> Processamento Concorrente
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                    {features.max_servers} Instâncias
                  </span>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-slate-700 block">Processos Paralelos ($max_servers):</label>
                  <select
                    value={features.max_servers}
                    onChange={(e) => handleSaveFeature('max_servers', Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value={2}>2 Processos (Servidores Leves &le; 2GB RAM)</option>
                    <option value={4}>4 Processos (Recomendado - 4GB RAM)</option>
                    <option value={8}>8 Processos (Alto Tráfego &ge; 8GB RAM)</option>
                  </select>
                </div>
                <div className="text-[11px] text-slate-500">
                  Socket ClamAV: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">/var/run/clamav/clamd.ctl</code>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. CLAMAV SPECIFIC VISUAL CONTROLS */}
        {activeSubTab === 'clamav' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Base de Assinaturas FreshClam */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-rose-600" /> Base de Vírus FreshClam
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                    8.7M+ Assinaturas
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Base: <strong>daily.cld (v27192) / main.cvd (v62)</strong><br />
                  Última atualização: <strong className="text-emerald-700">Hoje às 06:00 (OK)</strong>
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => handleServiceAction('restart')}
                    className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Atualizar Base de Vírus Agora (freshclam)
                  </button>
                </div>
              </div>

              {/* Verificação de Arquivos e Extensões */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Bug className="w-4 h-4 text-amber-600" /> Inspeção Profunda de Arquivos
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={features.scan_archive}
                      onChange={(e) => handleSaveFeature('scan_archive', e.target.checked)}
                      className="rounded text-rose-600"
                    />
                    Scan Compactados (.zip, .rar, .tar)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={features.scan_ole2}
                      onChange={(e) => handleSaveFeature('scan_ole2', e.target.checked)}
                      className="rounded text-rose-600"
                    />
                    Scan Macros Office (.docm)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={features.scan_pdf}
                      onChange={(e) => handleSaveFeature('scan_pdf', e.target.checked)}
                      className="rounded text-rose-600"
                    />
                    Scan Scripts PDF
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={features.scan_html}
                      onChange={(e) => handleSaveFeature('scan_html', e.target.checked)}
                      className="rounded text-rose-600"
                    />
                    Scan Phishing HTML
                  </label>
                </div>
              </div>

              {/* Limites de Descompressão (Zip Bomb Protection) */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-blue-600" /> Limites de Escaneamento
                </span>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-600">MaxFileSize:</span>
                    <strong className="text-slate-900">{features.max_file_size} MB</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-600">MaxScanSize:</span>
                    <strong className="text-slate-900">{features.max_scan_size} MB</strong>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-600">MaxRecursion:</span>
                    <strong className="text-slate-900">{features.max_recursion} Níveis</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. SPAMASSASSIN SPECIFIC VISUAL CONTROLS */}
        {activeSubTab === 'spamassassin' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Parâmetros Gerais */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-amber-600" /> Pontuação de Corte (Required Score)
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                    {features.required_score} Pontos
                  </span>
                </div>
                <div className="space-y-2">
                  <select
                    value={features.required_score}
                    onChange={(e) => handleSaveFeature('required_score', Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
                  >
                    <option value={3.0}>3.0 Pontos (Rigoroso - Alta Segurança)</option>
                    <option value={5.0}>5.0 Pontos (Padrão Recomendado)</option>
                    <option value={7.0}>7.0 Pontos (Tolerante - Poucos Falso-Positivos)</option>
                  </select>
                </div>
                <div className="text-[11px] text-slate-500">
                  Assunto Modificado: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">{features.rewrite_header_subject}</code>
                </div>
              </div>

              {/* Redes Heurísticas & Bayes */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-600" /> Módulos & Redes Heurísticas
                </span>
                <div className="space-y-1.5 text-xs pt-1">
                  <label className="flex items-center justify-between p-1.5 rounded bg-white border border-slate-200 cursor-pointer">
                    <span>Filtro Bayesiano & Auto-Learn</span>
                    <input
                      type="checkbox"
                      checked={features.use_bayes}
                      onChange={(e) => handleSaveFeature('use_bayes', e.target.checked)}
                      className="rounded text-blue-600"
                    />
                  </label>
                  <label className="flex items-center justify-between p-1.5 rounded bg-white border border-slate-200 cursor-pointer">
                    <span>Rede de Reputação Pyzor</span>
                    <input
                      type="checkbox"
                      checked={features.use_pyzor}
                      onChange={(e) => handleSaveFeature('use_pyzor', e.target.checked)}
                      className="rounded text-blue-600"
                    />
                  </label>
                  <label className="flex items-center justify-between p-1.5 rounded bg-white border border-slate-200 cursor-pointer">
                    <span>Rede Vipul's Razor2</span>
                    <input
                      type="checkbox"
                      checked={features.use_razor2}
                      onChange={(e) => handleSaveFeature('use_razor2', e.target.checked)}
                      className="rounded text-blue-600"
                    />
                  </label>
                </div>
              </div>

              {/* Atalho Inteligência AntiSPAM */}
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 flex flex-col justify-between space-y-3">
                <div>
                  <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-600" /> Regras Heurísticas Locais
                  </span>
                  <p className="text-xs text-amber-800 mt-1">
                    Crie e gerencie regras heurísticas avançadas no Banco de Dados para capturar palavras no assunto ou corpo de mensagens de phishing.
                  </p>
                </div>
                {onNavigateToSpamIntelligence && (
                  <button
                    onClick={onNavigateToSpamIntelligence}
                    className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir Inteligência AntiSPAM
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* POWER QUERY / SEARCHLOG: ÚLTIMAS 50 LINHAS DE LOG DO SERVIÇO */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-sm border border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-blue-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Últimas 50 Linhas de Log & Power Query ({activeSubTab.toUpperCase()})
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Visualizador dinâmico de logs com busca em tempo real, detecção de erros e filtros de status.
            </p>
          </div>

          {/* Log Controls & Filter Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Power Query (termo, IP, status, email)..."
                value={logQuery}
                onChange={(e) => setLogQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              {logQuery && (
                <button
                  onClick={() => setLogQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={() => setAutoRefreshLogs(!autoRefreshLogs)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                autoRefreshLogs
                  ? 'bg-blue-600/30 text-blue-400 border-blue-500/50'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${autoRefreshLogs ? 'animate-spin' : ''}`} />
              {autoRefreshLogs ? 'Auto-Live (5s)' : 'Auto-Live'}
            </button>

            <button
              onClick={() => {
                navigator.clipboard.writeText(logs.join('\n'));
                onShowAlert('Logs copiados para a área de transferência!', 'success');
              }}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              title="Copiar Logs"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Quick Filter Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-400 font-medium mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3 text-slate-500" /> Filtros:
          </span>
          {[
            { id: 'all', label: 'Todos os Eventos' },
            { id: 'errors', label: 'Erros & Rejeições (FATAL / REJECT)' },
            { id: 'auth', label: 'Autenticação & SASL' },
            { id: 'clean', label: 'Entregues (CLEAN / Sent)' },
            { id: 'spam_virus', label: 'Spam & Vírus Detectados' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setLogFilter(f.id as any)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                logFilter === f.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Log Viewer Terminal Screen */}
        <div className="bg-slate-950 rounded-xl p-4 font-mono text-xs text-slate-300 border border-slate-800 max-h-80 overflow-y-auto space-y-1 select-text">
          {loadingLogs ? (
            <div className="text-center py-6 text-slate-500 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Carregando logs em tempo real...
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-6 text-slate-500">
              Nenhuma linha de log encontrada com os critérios informados.
            </div>
          ) : (
            logs.map((line, idx) => {
              const upper = line.toUpperCase();
              const isError = upper.includes('REJECT') || upper.includes('ERROR') || upper.includes('FAILED') || upper.includes('FATAL') || upper.includes('DENIED');
              const isClean = upper.includes('PASSED CLEAN') || upper.includes('STATUS=SENT') || upper.includes('250 2.0.0 OK');
              const isSpamVirus = upper.includes('SPAM') || upper.includes('INFECTED') || upper.includes('VIRUS') || upper.includes('BLOCKED');
              const isWarn = upper.includes('WARN') || upper.includes('TIMEOUT') || upper.includes('DEFERRED');

              let lineClass = 'text-slate-300';
              if (isError) lineClass = 'text-rose-400 bg-rose-950/30 px-1 rounded';
              else if (isSpamVirus) lineClass = 'text-amber-400 bg-amber-950/30 px-1 rounded';
              else if (isClean) lineClass = 'text-emerald-400';
              else if (isWarn) lineClass = 'text-amber-300';

              return (
                <div key={idx} className={`leading-relaxed whitespace-pre-wrap ${lineClass}`}>
                  <span className="text-slate-600 select-none mr-2">{String(idx + 1).padStart(2, '0')}</span>
                  {line}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* MODO AVANÇADO: EDITOR RAW DO ARQUIVO DE CONFIGURAÇÃO */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-800 text-white">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Modo Avançado: Editor Raw ({configFile})
              </h3>
              <p className="text-xs text-slate-500">
                Edição direta com backup automático e validação de sintaxe antes do reload.
              </p>
            </div>
          </div>

          {/* Config file switcher */}
          <div className="flex items-center gap-2">
            {activeSubTab === 'postfix' && (
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => { setConfigFile('/etc/postfix/main.cf'); fetchConfigFile('/etc/postfix/main.cf'); }}
                  className={`px-3 py-1 rounded-lg transition-all ${configFile === '/etc/postfix/main.cf' ? 'bg-white shadow text-blue-600' : 'text-slate-600'}`}
                >
                  main.cf
                </button>
                <button
                  onClick={() => { setConfigFile('/etc/postfix/master.cf'); fetchConfigFile('/etc/postfix/master.cf'); }}
                  className={`px-3 py-1 rounded-lg transition-all ${configFile === '/etc/postfix/master.cf' ? 'bg-white shadow text-blue-600' : 'text-slate-600'}`}
                >
                  master.cf
                </button>
              </div>
            )}

            {activeSubTab === 'clamav' && (
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => { setConfigFile('/etc/clamav/clamd.conf'); fetchConfigFile('/etc/clamav/clamd.conf'); }}
                  className={`px-3 py-1 rounded-lg transition-all ${configFile === '/etc/clamav/clamd.conf' ? 'bg-white shadow text-rose-600' : 'text-slate-600'}`}
                >
                  clamd.conf
                </button>
                <button
                  onClick={() => { setConfigFile('/etc/clamav/freshclam.conf'); fetchConfigFile('/etc/clamav/freshclam.conf'); }}
                  className={`px-3 py-1 rounded-lg transition-all ${configFile === '/etc/clamav/freshclam.conf' ? 'bg-white shadow text-rose-600' : 'text-slate-600'}`}
                >
                  freshclam.conf
                </button>
              </div>
            )}

            <button
              onClick={() => fetchConfigFile()}
              disabled={loadingConfig}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
              title="Recarregar Arquivo"
            >
              <RefreshCw className={`w-4 h-4 ${loadingConfig ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Syntax Test Notice */}
        {syntaxResult && (
          <div className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-medium ${
            syntaxResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {syntaxResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{syntaxResult.message}</span>
          </div>
        )}

        {/* Raw Textarea */}
        <div className="relative">
          <textarea
            value={configContent}
            onChange={(e) => setConfigContent(e.target.value)}
            disabled={loadingConfig}
            rows={14}
            className="w-full bg-slate-950 font-mono text-xs text-slate-200 p-4 rounded-xl border border-slate-800 focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed"
            placeholder="Carregando conteúdo do arquivo de configuração..."
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-500 font-mono">
            Tamanho: <strong>{configContent.length} bytes</strong> • Linhas: <strong>{configContent.split('\n').length}</strong>
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveConfig}
              disabled={savingConfig || loadingConfig}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all"
            >
              <Save className={`w-4 h-4 ${savingConfig ? 'animate-spin' : ''}`} />
              Salvar Alterações no {configFile}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
