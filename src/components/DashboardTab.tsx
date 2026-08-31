import React, { useState, useEffect } from 'react';
import { 
  Send, Filter, Bug, RefreshCw, Power, CheckCircle, XCircle, 
  Activity, Layers, ShieldAlert, Cpu, HardDrive, Database, 
  Server, Zap, ShieldCheck, ArrowUpRight, ArrowDownLeft, Gauge,
  Clock, Check, Mail, Calendar, Download, Plus, BarChart2,
  TrendingDown, TrendingUp, AlertOctagon, HelpCircle, FileSpreadsheet,
  Inbox, Share2, ShieldX, Sparkles
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, 
  BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';
import { 
  ServicesMap, SystemMetrics, MailStatsResponse, DailyMailMetric, 
  MailTrafficSummary 
} from '../types';

interface DashboardTabProps {
  services: ServicesMap;
  loading: boolean;
  onRefresh: () => void;
  onRestartService: (serviceName: string) => Promise<void>;
  onNavigateToServers?: () => void;
  onNavigateToSpam?: () => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  services,
  loading,
  onRefresh,
  onRestartService,
  onNavigateToServers,
  onNavigateToSpam
}) => {
  // Sub-tab selection: 'mail' (Métricas de E-mail 7 Dias) or 'hardware' (Telemetria)
  const [subTab, setSubTab] = useState<'mail' | 'hardware'>('mail');

  // Mail Stats State
  const [mailStats, setMailStats] = useState<MailStatsResponse | null>(null);
  const [mailStatsLoading, setMailStatsLoading] = useState<boolean>(true);
  const [selectedDay, setSelectedDay] = useState<string>('all');
  const [tableSearch, setTableSearch] = useState<string>('');

  // Simulation Modal State
  const [isSimModalOpen, setIsSimModalOpen] = useState<boolean>(false);
  const [simReceived, setSimReceived] = useState<number>(20);
  const [simSent, setSimSent] = useState<number>(10);
  const [simSpam, setSimSpam] = useState<number>(4);
  const [simBounce, setSimBounce] = useState<number>(1);
  const [simSubmitting, setSimSubmitting] = useState<boolean>(false);

  // Audit Diagnostics Modal State
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [auditDiagData, setAuditDiagData] = useState<any>(null);
  const [auditDiagLoading, setAuditDiagLoading] = useState<boolean>(false);
  const [ingesting, setIngesting] = useState<boolean>(false);

  // Hardware Telemetry State
  const [restarting, setRestarting] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [metricsLoading, setMetricsLoading] = useState<boolean>(false);

  // Fetch Mail Stats from Database
  const fetchMailStats = async (dateFilter = selectedDay) => {
    setMailStatsLoading(true);
    try {
      const url = dateFilter === 'all' 
        ? '/api/dashboard/mail-stats' 
        : `/api/dashboard/mail-stats?date=${encodeURIComponent(dateFilter)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setMailStats(data);
      }
    } catch (err) {
      console.error("Erro ao buscar estatísticas de e-mail:", err);
    } finally {
      setMailStatsLoading(false);
    }
  };

  // Fetch Hardware Metrics
  const fetchMetrics = async () => {
    setMetricsLoading(true);
    try {
      const res = await fetch('/api/services/system-metrics');
      const data = await res.json();
      if (data.success && data.metrics) {
        setMetrics(data.metrics);
      }
    } catch (e) {
      console.error("Erro ao buscar métricas de hardware:", e);
    } finally {
      setMetricsLoading(false);
    }
  };

  useEffect(() => {
    fetchMailStats(selectedDay);
    fetchMetrics();
  }, [selectedDay]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (subTab === 'hardware') fetchMetrics();
      if (subTab === 'mail') fetchMailStats(selectedDay);
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, subTab, selectedDay]);

  const handleRestart = async (svc: string) => {
    setRestarting(svc);
    await onRestartService(svc);
    setRestarting(null);
  };

  const handleSimulateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimSubmitting(true);
    try {
      const res = await fetch('/api/dashboard/mail-stats/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received: Number(simReceived),
          sent: Number(simSent),
          spam: Number(simSpam),
          bounce: Number(simBounce)
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsSimModalOpen(false);
        await fetchMailStats(selectedDay);
      }
    } catch (err) {
      console.error("Erro ao simular tráfego:", err);
    } finally {
      setSimSubmitting(false);
    }
  };

  const fetchAuditDiagnostics = async () => {
    setAuditDiagLoading(true);
    try {
      const res = await fetch('/api/dashboard/audit-diagnostics');
      const data = await res.json();
      if (data.success) {
        setAuditDiagData(data);
      }
    } catch (e) {
      console.error("Erro ao buscar diagnóstico de auditoria:", e);
    } finally {
      setAuditDiagLoading(false);
    }
  };

  const handleIngestNow = async () => {
    setIngesting(true);
    try {
      const res = await fetch('/api/troubleshooting/maillog/ingest', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await fetchAuditDiagnostics();
        await fetchMailStats(selectedDay);
      }
    } catch (e) {
      console.error("Erro ao disparar ingestão:", e);
    } finally {
      setIngesting(false);
    }
  };

  const getServiceInfo = (key: string) => {
    switch (key) {
      case 'postfix':
        return {
          name: 'Postfix (MTA)',
          icon: <Send className="w-5 h-5 text-blue-500" />,
          desc: 'Servidor principal de envio e recebimento de e-mails via SMTP.',
          port: 'Portas 25, 465, 587'
        };
      case 'amavis':
        return {
          name: 'Amavis (Content Filter)',
          icon: <Filter className="w-5 h-5 text-amber-500" />,
          desc: 'Interface de verificação de conteúdo intermediária entre Postfix e SpamAssassin/ClamAV.',
          port: 'Porta 10024'
        };
      case 'clamav-daemon':
        return {
          name: 'ClamAV Daemon',
          icon: <Bug className="w-5 h-5 text-rose-500" />,
          desc: 'Motor antivírus de alta performance para escaneamento de anexos maliciosos.',
          port: 'Socket UNIX / TCP 3310'
        };
      case 'spamassassin':
      default:
        return {
          name: 'SpamAssassin Engine',
          icon: <ShieldAlert className="w-5 h-5 text-purple-500" />,
          desc: 'Mecanismo de análise heurística, Bayes, regras de pontuação e listas RBL.',
          port: 'Módulo SpamD'
        };
    }
  };

  // Selected Day Data or Consolidated 7-Day Metrics
  const activeDayMetric: DailyMailMetric | null = selectedDay !== 'all' && mailStats?.daily_metrics
    ? mailStats.daily_metrics.find(d => d.date === selectedDay) || null
    : null;

  // Compute metrics to display in KPI cards
  const displayTotal = activeDayMetric ? activeDayMetric.total_processed : (mailStats?.summary.total_processed_7d || 0);
  const displayReceived = activeDayMetric ? activeDayMetric.received : (mailStats?.summary.total_received_7d || 0);
  const displaySent = activeDayMetric ? activeDayMetric.sent : (mailStats?.summary.total_sent_7d || 0);
  const displaySpam = activeDayMetric ? activeDayMetric.spam_blocked : (mailStats?.summary.total_spam_blocked_7d || 0);
  const displayBounce = activeDayMetric ? activeDayMetric.rejected_bounced : (mailStats?.summary.total_rejected_bounced_7d || 0);
  const displaySpamPct = activeDayMetric ? activeDayMetric.spam_pct : (mailStats?.summary.overall_spam_pct || 0);
  const displayCleanRate = activeDayMetric ? activeDayMetric.clean_delivery_rate : (mailStats?.summary.clean_delivery_rate_pct || 100);
  const displayLatency = activeDayMetric ? activeDayMetric.avg_latency_ms : (mailStats?.summary.avg_latency_overall_ms || 300);

  // Verdict Pie Chart Data
  const verdictPieData = [
    { name: 'Recebidos (Inbound)', value: displayReceived, color: '#10b981' },
    { name: 'Enviados (Outbound)', value: displaySent, color: '#3b82f6' },
    { name: 'SPAM Bloqueado', value: displaySpam, color: '#f43f5e' },
    { name: 'Bounces / Rejeições', value: displayBounce, color: '#f59e0b' }
  ];

  // Daily Chart Area Data
  const dailyAreaChartData = mailStats?.daily_metrics.map(d => ({
    date: d.displayDate || d.date,
    rawDate: d.date,
    Recebidos: d.received,
    Enviados: d.sent,
    SPAM: d.spam_blocked,
    Bounces: d.rejected_bounced,
    Total: d.total_processed,
    SpamPct: d.spam_pct
  })) || [];

  // Hourly Distribution Data (If specific day selected, use that day; otherwise use today's or average)
  const hourlyData = activeDayMetric 
    ? activeDayMetric.hourly_distribution 
    : (mailStats?.daily_metrics && mailStats.daily_metrics.length > 0 
        ? mailStats.daily_metrics[mailStats.daily_metrics.length - 1].hourly_distribution 
        : []);

  // Top Senders to Display
  const topSendersList = (activeDayMetric?.top_sender_domains && activeDayMetric.top_sender_domains.length > 0)
    ? activeDayMetric.top_sender_domains
    : (mailStats?.aggregated_top_senders && mailStats.aggregated_top_senders.length > 0)
      ? mailStats.aggregated_top_senders
      : (mailStats?.daily_metrics && mailStats.daily_metrics.length > 0 ? (mailStats.daily_metrics[mailStats.daily_metrics.length - 1].top_sender_domains || (mailStats.daily_metrics[mailStats.daily_metrics.length - 1] as any).top_senders || []) : []);

  // Top Recipients to Display
  const topRecipientsList = (activeDayMetric?.top_recipient_domains && activeDayMetric.top_recipient_domains.length > 0)
    ? activeDayMetric.top_recipient_domains
    : (mailStats?.aggregated_top_recipients && mailStats.aggregated_top_recipients.length > 0)
      ? mailStats.aggregated_top_recipients
      : (mailStats?.daily_metrics && mailStats.daily_metrics.length > 0 ? (mailStats.daily_metrics[mailStats.daily_metrics.length - 1].top_recipient_domains || (mailStats.daily_metrics[mailStats.daily_metrics.length - 1] as any).top_recipients || []) : []);

  // Top Spam Rules to Display
  const topSpamRulesList = (activeDayMetric?.spam_rules_triggered && activeDayMetric.spam_rules_triggered.length > 0)
    ? activeDayMetric.spam_rules_triggered
    : (mailStats?.aggregated_spam_rules && mailStats.aggregated_spam_rules.length > 0)
      ? mailStats.aggregated_spam_rules
      : (mailStats?.daily_metrics && mailStats.daily_metrics.length > 0 ? (mailStats.daily_metrics[mailStats.daily_metrics.length - 1].spam_rules_triggered || []) : []);

  // Filter Table Data
  const filteredTableData = (mailStats?.daily_metrics || []).filter(d => 
    d.date.includes(tableSearch) || 
    d.displayDate.toLowerCase().includes(tableSearch.toLowerCase()) || 
    d.weekday.toLowerCase().includes(tableSearch.toLowerCase())
  );

  // RAM Pie chart data for hardware tab
  const ramPieData = metrics ? [
    { name: 'Em Uso', value: metrics.memory.used_mb, color: '#3b82f6' },
    { name: 'Buffers/Cache', value: metrics.memory.cached_mb, color: '#8b5cf6' },
    { name: 'Livre', value: metrics.memory.free_mb, color: '#10b981' }
  ] : [];

  return (
    <div className="space-y-6">
      
      {/* 1. Master Sub-Tab Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        
        {/* Sub-tab pills */}
        <div className="flex items-center bg-slate-100 p-1.5 rounded-xl gap-1">
          <button
            onClick={() => setSubTab('mail')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
              subTab === 'mail'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>Métricas de E-mail (Retenção 7 Dias)</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
              subTab === 'mail' ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-700'
            }`}>
              Banco vmail
            </span>
          </button>

          <button
            onClick={() => setSubTab('hardware')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
              subTab === 'hardware'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Telemetria de Hardware & Servidores</span>
          </button>
        </div>

        {/* Global Action Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              autoRefresh
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-slate-100 text-slate-600 border-slate-300'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${autoRefresh ? 'text-emerald-600 animate-bounce' : 'text-slate-400'}`} />
            <span>{autoRefresh ? 'Auto-Refresh (10s)' : 'Auto-Refresh Pausado'}</span>
          </button>

          <button
            onClick={() => { onRefresh(); fetchMetrics(); fetchMailStats(selectedDay); }}
            disabled={loading || metricsLoading || mailStatsLoading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || metricsLoading || mailStatsLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* VIEW A: DASHBOARD DE MÉTRICAS DE E-MAIL (RETENÇÃO 7 DIAS EM BANCO DE DADOS) */}
      {/* ========================================================================= */}
      {subTab === 'mail' && (
        <div className="space-y-6">

          {/* Top Mail Filter & Control Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 border border-slate-800 shadow-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-400" />
                  <span>Tráfego & Inteligência de Mensagens de E-mail</span>
                </h2>
                <span className="bg-blue-500/20 text-blue-300 text-xs px-2.5 py-0.5 rounded-full border border-blue-500/30 font-mono font-semibold flex items-center gap-1">
                  <Database className="w-3 h-3 text-blue-400" />
                  Fonte: SQLite/MariaDB mail_logs_history
                </span>
                <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2.5 py-0.5 rounded-full border border-emerald-500/30 font-mono font-semibold">
                  Retenção 7 Dias Ativa
                </span>
              </div>

              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                Visualização em tempo real das mensagens recebidas, enviadas via Postfix, bloqueadas pelo SpamAssassin/Amavis e rejeitadas. Os registros são persistidos na base de dados para cálculo de métricas e tendências semanais.
              </p>
            </div>

            {/* Filter by Day & Actions */}
            <div className="flex items-center gap-2 flex-wrap self-stretch lg:self-auto">
              
              {/* Interactive Calendar Date Picker */}
              <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 gap-1.5" title="Selecionar data no calendário">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                <input
                  type="date"
                  value={selectedDay === 'all' ? '' : selectedDay}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedDay(val || 'all');
                  }}
                  className="bg-transparent text-white text-xs font-mono font-semibold focus:outline-none cursor-pointer"
                />
              </div>

              {/* Quick Day Selector Dropdown */}
              <div className="relative">
                <select
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  className="bg-slate-800 text-white text-xs font-semibold rounded-xl border border-slate-700 px-3 py-2.5 pr-8 appearance-none hover:bg-slate-700 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                >
                  <option value="all">📅 Todos os 7 Dias (Agregado)</option>
                  {mailStats?.daily_metrics.map(d => (
                    <option key={d.date} value={d.date}>
                      {d.displayDate || d.date} - {d.weekday} • {d.total_processed} msgs
                    </option>
                  ))}
                </select>
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  ▼
                </div>
              </div>

              {/* Refresh button */}
              <button
                onClick={() => fetchMailStats(selectedDay)}
                disabled={mailStatsLoading}
                className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5"
                title="Recarregar dados do banco"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${mailStatsLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Atualizar</span>
              </button>

              {/* Simulate traffic button */}
              <button
                onClick={() => setIsSimModalOpen(true)}
                className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                title="Injetar tráfego simulado no banco"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                <span>Simular Tráfego</span>
              </button>

              {/* CSV Export Button */}
              <a
                href="/api/dashboard/mail-stats/export"
                download
                className="px-3 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5"
                title="Baixar relatório CSV de 7 dias"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Exportar CSV</span>
              </a>

              {/* Diagnóstico BD & Auditoria Button */}
              <button
                onClick={() => {
                  setIsAuditModalOpen(true);
                  fetchAuditDiagnostics();
                }}
                className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5"
                title="Diagnóstico da tabela mail_logs_history e Auditoria"
              >
                <Database className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden xl:inline">Diagnóstico BD</span>
              </button>

            </div>
          </div>

          {/* 2. Top 5 KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            
            {/* KPI 1: Total Processado */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Processado</span>
                  <div className="p-2 bg-slate-100 rounded-xl text-slate-700">
                    <Layers className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900 font-mono">
                  {displayTotal.toLocaleString()}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {selectedDay === 'all' ? 'Volume total nos 7 dias' : 'Volume neste dia'}
                </p>
              </div>
              <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span>Latência Média:</span>
                <strong className="text-slate-800">{displayLatency} ms</strong>
              </div>
            </div>

            {/* KPI 2: Recebidos (Inbound) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Recebidos (Inbound)</span>
                  <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                    <Inbox className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-emerald-600 font-mono">
                  {displayReceived.toLocaleString()}
                </div>
                <p className="text-[11px] text-emerald-700/80 mt-1">
                  {displayTotal > 0 ? `${((displayReceived / displayTotal) * 100).toFixed(1)}% do total` : '0%'}
                </p>
              </div>
              <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-emerald-700 font-semibold">
                <span>Entrega Limpa:</span>
                <span className="font-mono">{displayCleanRate}%</span>
              </div>
            </div>

            {/* KPI 3: Enviados (Outbound) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Enviados (Outbound)</span>
                  <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                    <Send className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-blue-600 font-mono">
                  {displaySent.toLocaleString()}
                </div>
                <p className="text-[11px] text-blue-700/80 mt-1">
                  {displayTotal > 0 ? `${((displaySent / displayTotal) * 100).toFixed(1)}% do total` : '0%'}
                </p>
              </div>
              <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-blue-700 font-semibold">
                <span>Postfix SMTP:</span>
                <span className="font-mono text-slate-700">Autenticado</span>
              </div>
            </div>

            {/* KPI 4: SPAM Bloqueado */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">SPAM Bloqueado</span>
                  <div className="p-2 bg-rose-50 rounded-xl text-rose-600">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-rose-600 font-mono">
                  {displaySpam.toLocaleString()}
                </div>
                <p className="text-[11px] text-rose-700/80 mt-1 flex items-center gap-1 font-semibold">
                  <span>Taxa: {displaySpamPct}%</span>
                  <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />
                </p>
              </div>
              <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-rose-700 font-semibold">
                <span>SpamAssassin:</span>
                <span className="font-mono text-slate-700">Heurística & RBL</span>
              </div>
            </div>

            {/* KPI 5: Bounces & Rejeições */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Bounces & Rejeições</span>
                  <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
                    <AlertOctagon className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-amber-600 font-mono">
                  {displayBounce.toLocaleString()}
                </div>
                <p className="text-[11px] text-amber-700/80 mt-1">
                  {displayTotal > 0 ? `${((displayBounce / displayTotal) * 100).toFixed(1)}% rejeitado` : '0%'}
                </p>
              </div>
              <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600 font-mono">
                <span>User Unknown:</span>
                <span className="font-bold text-slate-800">Postfix RCPT</span>
              </div>
            </div>

          </div>

          {/* 3. Row 1 of Visualizations: 7-Day Area Chart + Verdict Donut Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Area Chart: 7-Day Volume Timeline */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                      <BarChart2 className="w-5 h-5 text-blue-600" />
                      <span>Evolução do Volume de E-mails (7 Dias)</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Comparativo diário entre E-mails Recebidos, Enviados, SPAMs bloqueados e Bounces
                    </p>
                  </div>

                  <span className="text-xs font-mono bg-blue-50 text-blue-700 px-3 py-1 rounded-lg font-bold border border-blue-200">
                    Histórico 7 Dias
                  </span>
                </div>

                <div className="h-64 w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyAreaChartData}>
                      <defs>
                        <linearGradient id="recGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="spamGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.5} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem', color: '#fff', fontSize: '12px' }}
                      />
                      <Area type="monotone" dataKey="Recebidos" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#recGrad)" />
                      <Area type="monotone" dataKey="Enviados" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#sentGrad)" />
                      <Area type="monotone" dataKey="SPAM" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#spamGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 flex-wrap gap-2">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500" /> Recebidos</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500" /> Enviados</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-500" /> SPAM Bloqueado</span>
                </div>
                <span className="font-mono text-slate-500 font-semibold">
                  {mailStats?.summary.spam_trend || 'Queda constante de SPAM'}
                </span>
              </div>
            </div>

            {/* Verdict Pie / Donut Chart */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">Veredito das Mensagens</h3>
                    <p className="text-xs text-slate-500">Distribuição percentual do tráfego</p>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded">
                    {selectedDay === 'all' ? '7 Dias' : selectedDay}
                  </span>
                </div>

                <div className="h-48 w-full relative flex items-center justify-center my-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={verdictPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {verdictPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderRadius: '0.5rem', color: '#fff', fontSize: '11px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-base font-black font-mono text-slate-800">
                      {displayTotal.toLocaleString()}
                    </span>
                    <span className="text-[9px] text-slate-400 uppercase font-semibold">Total</span>
                  </div>
                </div>

                {/* Verdict List */}
                <div className="space-y-1.5 text-xs">
                  {verdictPieData.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-1.5 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-slate-700 font-medium">{item.name}</span>
                      </div>
                      <span className="font-mono font-bold text-slate-800">
                        {item.value.toLocaleString()} ({displayTotal > 0 ? ((item.value / displayTotal) * 100).toFixed(1) : 0}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 text-center font-mono">
                Taxa de Entrega Limpa: <strong className="text-emerald-600">{displayCleanRate}%</strong>
              </div>
            </div>

          </div>

          {/* 4. Row 2 of Visualizations: SPAM Rate (%) & 24h Hourly Traffic Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* SPAM Rate Bar Chart */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                      <ShieldX className="w-5 h-5 text-rose-600" />
                      <span>Taxa Diária de SPAM (%) nos 7 Dias</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Percentual de mensagens descartadas pelo filtro antispam dia a dia
                    </p>
                  </div>
                  <span className="text-xs font-mono bg-rose-50 text-rose-700 px-2.5 py-1 rounded-lg font-bold border border-rose-200">
                    Média: {mailStats?.summary.overall_spam_pct}%
                  </span>
                </div>

                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyAreaChartData}>
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} unit="%" domain={[0, 30]} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem', color: '#fff', fontSize: '12px' }}
                        formatter={(val: number) => [`${val}%`, 'Taxa de SPAM']}
                      />
                      <Bar dataKey="SpamPct" name="Taxa de SPAM (%)" radius={[6, 6, 0, 0]}>
                        {dailyAreaChartData.map((entry, index) => (
                          <Cell 
                            key={`cell-spam-${index}`} 
                            fill={entry.SpamPct > 15 ? '#f43f5e' : entry.SpamPct > 10 ? '#f59e0b' : '#10b981'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>Verde &lt;10% • Âmbar 10-15% • Vermelho &gt;15%</span>
                <span className="text-emerald-600 font-bold">Filtro Bayes Ativo</span>
              </div>
            </div>

            {/* 24-Hour Distribution Chart */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                      <Clock className="w-5 h-5 text-indigo-600" />
                      <span>Distribuição de Tráfego Horário (24 Horas)</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Volume por hora das 00:00 às 23:00 ({selectedDay === 'all' ? 'Dia Atual' : selectedDay})
                    </p>
                  </div>
                  <span className="text-xs font-mono bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg font-bold border border-indigo-200">
                    24h
                  </span>
                </div>

                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyData}>
                      <XAxis dataKey="hour" stroke="#94a3b8" fontSize={9} tickLine={false} interval={2} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem', color: '#fff', fontSize: '12px' }}
                      />
                      <Bar dataKey="received" name="Recebidos" stackId="a" fill="#10b981" />
                      <Bar dataKey="sent" name="Enviados" stackId="a" fill="#3b82f6" />
                      <Bar dataKey="spam" name="SPAM" stackId="a" fill="#f43f5e" />
                      <Bar dataKey="bounced" name="Bounces" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Pico de Mensagens: Horário Comercial (08h - 18h)</span>
                <span className="font-mono text-indigo-600 font-bold">SMTP Throttle OK</span>
              </div>
            </div>

          </div>

          {/* 5. Row 3: Top Sender Domains, Local Recipient Domains, and Spam Rules Triggered */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* A. Top Domínios Remetentes */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-base mb-1 flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-blue-600" />
                  <span>Top Domínios Remetentes</span>
                </h3>
                <p className="text-xs text-slate-500 mb-4">Maiores emissores de mensagens e reputação SPF/DKIM</p>

                <div className="space-y-2.5">
                  {topSendersList.length === 0 ? (
                    <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-400 font-mono">
                      Nenhum remetente catalogado no período
                    </div>
                  ) : (
                    topSendersList.slice(0, 5).map((sender, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-800 text-xs font-mono truncate">{sender.domain}</span>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold inline-block mt-1 ${
                            sender.reputation === 'Boa' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : sender.reputation === 'Suspeita'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {sender.reputation === 'Boa' ? 'Confiável (SPF Pass)' : sender.reputation === 'Suspeita' ? 'Suspeito' : 'Bloqueado (RBL)'}
                          </span>
                        </div>

                        <div className="text-right shrink-0 font-mono">
                          <div className="text-sm font-bold text-slate-900">{sender.count} msgs</div>
                          <div className="text-[10px] text-slate-500">
                            {sender.spam_count > 0 ? <span className="text-rose-600 font-bold">{sender.spam_count} spams</span> : <span className="text-emerald-600">100% limpo</span>}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-100 text-xs text-slate-500 flex justify-between font-mono">
                <span>Reputação DMARC: Ativa</span>
                <span className="text-blue-600 font-semibold">Postfix Postscreen</span>
              </div>
            </div>

            {/* B. Top Domínios de Destino (Caixas Locais) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-base mb-1 flex items-center gap-2">
                  <Database className="w-5 h-5 text-emerald-600" />
                  <span>Top Domínios de Destino (vmail)</span>
                </h3>
                <p className="text-xs text-slate-500 mb-4">Domínios corporativos hospedados no servidor</p>

                <div className="space-y-2.5">
                  {topRecipientsList.length === 0 ? (
                    <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-400 font-mono">
                      Nenhum domínio de destino catalogado
                    </div>
                  ) : (
                    topRecipientsList.slice(0, 5).map((recip, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-800 text-xs font-mono">{recip.domain}</span>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {recip.mailboxes_active} caixas ativas
                          </div>
                        </div>
                        <div className="text-right font-mono">
                          <span className="text-sm font-bold text-emerald-700">{recip.count} entregues</span>
                          <span className="block text-[10px] text-emerald-600">100% OK</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-100 text-xs text-slate-500 flex justify-between font-mono">
                <span>Storage /var/vmail</span>
                <span className="text-emerald-600 font-semibold">LMTP Dovecot</span>
              </div>
            </div>

            {/* C. Regras AntiSPAM Disparadas */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-base mb-1 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-purple-600" />
                  <span>Regras AntiSPAM Mais Disparadas</span>
                </h3>
                <p className="text-xs text-slate-500 mb-4">Regras do SpamAssassin e Amavis com mais correspondências</p>

                <div className="space-y-2.5">
                  {topSpamRulesList.length === 0 ? (
                    <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-400 font-mono">
                      Nenhuma regra disparada no período
                    </div>
                  ) : (
                    topSpamRulesList.slice(0, 5).map((rule, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                        <div className="min-w-0">
                          <span className="font-bold text-purple-700 text-xs font-mono">{rule.rule}</span>
                          <p className="text-[10px] text-slate-500 truncate max-w-[180px]">{rule.description}</p>
                        </div>
                        <div className="text-right font-mono shrink-0">
                          <span className="text-sm font-black text-rose-600">{rule.hits}</span>
                          <span className="text-[10px] text-slate-400 block">disparos</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-100 text-xs text-slate-500 flex justify-between font-mono">
                <span>SpamAssassin Score</span>
                <span className="text-purple-600 font-semibold">Amavis Quarentena</span>
              </div>
            </div>

          </div>

          {/* 6. Row 4: Consolidated 7-Day History Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                  <span>Tabela Consolidada de Retenção de 7 Dias</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Histórico granular de mensagens com filtros, taxas de bloqueio e tempos médios de entrega
                </p>
              </div>

              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Filtrar por data ou dia..."
                className="px-3.5 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                    <th className="px-3 py-2.5">Data / Dia</th>
                    <th className="px-3 py-2.5">Total</th>
                    <th className="px-3 py-2.5">Recebidos</th>
                    <th className="px-3 py-2.5">Enviados</th>
                    <th className="px-3 py-2.5">SPAM Bloqueado</th>
                    <th className="px-3 py-2.5">Vírus</th>
                    <th className="px-3 py-2.5">Bounces</th>
                    <th className="px-3 py-2.5">Taxa SPAM</th>
                    <th className="px-3 py-2.5">Entrega Limpa</th>
                    <th className="px-3 py-2.5">Latência</th>
                    <th className="px-3 py-2.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredTableData.map((row) => {
                    const isCurrentFilter = selectedDay === row.date;
                    return (
                      <tr key={row.date} className={`hover:bg-slate-50 transition-colors ${isCurrentFilter ? 'bg-blue-50/50 font-semibold' : ''}`}>
                        <td className="px-3 py-3 font-mono text-slate-800">
                          <div className="font-bold">{row.displayDate}</div>
                          <span className="text-[10px] text-slate-400">{row.date}</span>
                        </td>
                        <td className="px-3 py-3 font-mono font-bold text-slate-900">{row.total_processed}</td>
                        <td className="px-3 py-3 font-mono text-emerald-600 font-bold">{row.received}</td>
                        <td className="px-3 py-3 font-mono text-blue-600 font-bold">{row.sent}</td>
                        <td className="px-3 py-3 font-mono text-rose-600 font-bold">{row.spam_blocked}</td>
                        <td className="px-3 py-3 font-mono text-rose-800 font-bold">{row.virus_blocked}</td>
                        <td className="px-3 py-3 font-mono text-amber-600">{row.rejected_bounced}</td>
                        <td className="px-3 py-3 font-mono">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.spam_pct > 15 ? 'bg-rose-100 text-rose-800' : row.spam_pct > 10 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {row.spam_pct}%
                          </span>
                        </td>
                        <td className="px-3 py-3 font-mono text-emerald-700 font-bold">{row.clean_delivery_rate}%</td>
                        <td className="px-3 py-3 font-mono text-slate-600">{row.avg_latency_ms} ms</td>
                        <td className="px-3 py-3 text-right">
                          <button
                            onClick={() => setSelectedDay(isCurrentFilter ? 'all' : row.date)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                              isCurrentFilter
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            {isCurrentFilter ? 'Visualizando' : 'Filtrar Dia'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW B: TELEMETRIA DE HARDWARE & SERVIDORES (CPU, RAM, DISCO, PROCESSOS) */}
      {/* ========================================================================= */}
      {subTab === 'hardware' && (
        <div className="space-y-6">
          
          {/* Hardware Header Banner */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap mb-1">
                <h2 className="text-xl font-bold text-slate-800 tracking-tight">
                  Dashboard de Telemetria e Hardware
                </h2>
                <span className="bg-blue-50 text-blue-700 text-xs px-2.5 py-0.5 rounded-full border border-blue-200 font-mono font-semibold">
                  {metrics?.hostname || 'mailserver.empresa.com.br'}
                </span>
                <span className="bg-emerald-50 text-emerald-700 text-xs px-2.5 py-0.5 rounded-full border border-emerald-200 font-mono font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  {metrics?.os || 'Debian GNU/Linux 12'}
                </span>
              </div>
              
              <p className="text-xs text-slate-600 flex items-center gap-3 flex-wrap mt-1">
                <span className="flex items-center gap-1 font-mono text-slate-500">
                  <Clock className="w-3.5 h-3.5 text-slate-400" /> Uptime: <strong className="text-slate-700">{metrics?.uptime || '18 dias'}</strong>
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-mono text-slate-500">
                  Kernel: <strong className="text-slate-700">{metrics?.kernel || '6.1.0-21-amd64'}</strong>
                </span>
              </p>
            </div>
          </div>

          {/* Hardware Charts: CPU & RAM */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* CPU Chart */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-base">Processador (CPU & Cargas)</h3>
                      <p className="text-xs text-slate-500 truncate max-w-sm">
                        {metrics?.cpu.model || 'Intel Xeon Silver 4314 (16 Cores)'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-black text-blue-600 font-mono tracking-tight">
                      {metrics?.cpu.usage_percent || 0}%
                    </div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Uso Total de Processamento
                    </span>
                  </div>
                </div>

                {/* Load Average Indicators */}
                <div className="grid grid-cols-3 gap-2 mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Load 1min</span>
                    <span className="text-sm font-bold font-mono text-slate-700">
                      {metrics?.cpu.load_avg[0] || '0.18'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Load 5min</span>
                    <span className="text-sm font-bold font-mono text-slate-700">
                      {metrics?.cpu.load_avg[1] || '0.25'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Load 15min</span>
                    <span className="text-sm font-bold font-mono text-slate-700">
                      {metrics?.cpu.load_avg[2] || '0.31'}
                    </span>
                  </div>
                </div>

                {/* Area Chart for CPU History */}
                <div className="h-48 w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={metrics?.cpu.history || []}>
                      <defs>
                        <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={10} tickLine={false} unit="%" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem', color: '#fff', fontSize: '12px' }}
                        itemStyle={{ color: '#60a5fa' }}
                      />
                      <Area type="monotone" dataKey="usage" name="Uso CPU (%)" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#cpuGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Coerência Térmica: Normal (38°C)</span>
                <span className="font-mono text-slate-600">Núcleos Ativos: {metrics?.cpu.cores || 16} Cores</span>
              </div>
            </div>

            {/* RAM Pie Chart */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-base">Memória RAM</h3>
                      <p className="text-xs text-slate-500">Total: {((metrics?.memory.total_mb || 16384) / 1024).toFixed(1)} GB DDR4</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xl font-bold text-indigo-600 font-mono">
                      {metrics?.memory.usage_percent || 31.2}%
                    </div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Alocada</span>
                  </div>
                </div>

                <div className="h-40 w-full relative flex items-center justify-center my-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={ramPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={65}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {ramPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderRadius: '0.5rem', color: '#fff', fontSize: '11px' }}
                        formatter={(val: number) => [`${(val / 1024).toFixed(2)} GB`, '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xs font-bold font-mono text-slate-800">
                      {(((metrics?.memory.used_mb || 5120)) / 1024).toFixed(1)} GB
                    </span>
                    <span className="text-[9px] text-slate-400 uppercase font-semibold">Em Uso</span>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <span className="text-slate-700 font-medium">Em Uso (Processos)</span>
                    </div>
                    <span className="font-mono font-bold text-slate-800">
                      {(((metrics?.memory.used_mb || 5120)) / 1024).toFixed(2)} GB
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                      <span className="text-slate-700 font-medium">Cache / Buffers OS</span>
                    </div>
                    <span className="font-mono font-bold text-slate-800">
                      {(((metrics?.memory.cached_mb || 3464)) / 1024).toFixed(2)} GB
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="text-slate-700 font-medium">Livre</span>
                    </div>
                    <span className="font-mono font-bold text-slate-800">
                      {(((metrics?.memory.free_mb || 7800)) / 1024).toFixed(2)} GB
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 flex justify-between font-mono">
                <span>SWAP: {metrics?.memory.swap_used_mb || 128} MB / {metrics?.memory.swap_total_mb || 4096} MB</span>
                <span className="text-emerald-600 font-semibold">Sem Paging Ativo</span>
              </div>
            </div>

          </div>

          {/* Storage Partitions */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Espaço em Disco e Partições</h3>
                  <p className="text-xs text-slate-500">
                    Armazenamento de caixas postais, sistema operacional e logs do Postfix
                  </p>
                </div>
              </div>

              <span className="text-xs font-mono bg-slate-100 text-slate-700 px-3 py-1 rounded-lg font-semibold border border-slate-200">
                NVMe SSD Storage
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {metrics?.disks.map((disk, idx) => (
                <div key={idx} className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm truncate">{disk.mount}</h4>
                        <span className="text-[10px] font-mono text-slate-400 block truncate">{disk.filesystem}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                        disk.usage_percent > 85 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {disk.usage_percent}% Ocupado
                      </span>
                    </div>

                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden my-3">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          disk.usage_percent > 85 ? 'bg-rose-500' : disk.usage_percent > 70 ? 'bg-amber-500' : 'bg-blue-600'
                        }`}
                        style={{ width: `${disk.usage_percent}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-xs font-mono text-slate-600 mt-1">
                      <span>Usado: <strong>{disk.used_gb} GB</strong></span>
                      <span>Livre: <strong>{disk.free_gb} GB</strong></span>
                    </div>
                  </div>

                  <div className="pt-3 mt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Capacidade Total:</span>
                    <span className="font-bold font-mono text-slate-800">{disk.total_gb} GB</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Processes & Network */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Top Processes Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-bold text-slate-800 text-base mb-1 flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-600" />
                <span>Processos Principais do Servidor de E-mail</span>
              </h3>
              <p className="text-xs text-slate-500 mb-4">Uso de CPU e Memória pelos daemons de mensageria e banco de dados</p>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                      <th className="px-3 py-2">Processo / Serviço</th>
                      <th className="px-3 py-2">PID</th>
                      <th className="px-3 py-2">Uso CPU</th>
                      <th className="px-3 py-2">Uso RAM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {metrics?.top_processes.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{p.name}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-500">{p.pid}</td>
                        <td className="px-3 py-2.5 font-mono font-bold text-blue-600">{p.cpu_percent}%</td>
                        <td className="px-3 py-2.5 font-mono text-slate-700">{p.mem_mb} MB</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Network & Mail Throughput Cards */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-base mb-1 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-emerald-600" />
                  <span>Tráfego de Rede & Conexões SMTP</span>
                </h3>
                <p className="text-xs text-slate-500 mb-4">Banda de entrada/saída e tráfego de mensageria em tempo real</p>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold mb-1">
                      <ArrowDownLeft className="w-4 h-4 text-emerald-600" /> Recebimento (RX)
                    </div>
                    <div className="text-2xl font-bold font-mono text-emerald-900">
                      {metrics?.network.rx_kbps || 140} <span className="text-xs">KB/s</span>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="flex items-center gap-1.5 text-xs text-blue-700 font-semibold mb-1">
                      <ArrowUpRight className="w-4 h-4 text-blue-600" /> Envio (TX)
                    </div>
                    <div className="text-2xl font-bold font-mono text-blue-900">
                      {metrics?.network.tx_kbps || 95} <span className="text-xs">KB/s</span>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-900 text-slate-200 rounded-xl font-mono text-xs space-y-2">
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-400">Conexões SMTP Ativas:</span>
                    <span className="font-bold text-emerald-400">{metrics?.network.smtp_conns || 8} ativas</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-400">Mensagens na Fila Postfix:</span>
                    <span className="font-bold text-amber-400">{metrics?.network.active_queue_count || 0} pendentes</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fila Diferida (Deferred):</span>
                    <span className="font-bold text-sky-400">{metrics?.network.deferred_queue_count || 0} erros</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Global Actions & Services Controls */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Power className="w-5 h-5 text-amber-400" />
                <h3 className="font-semibold text-slate-100">Controle e Reinicialização de Serviços</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">sudo systemctl restart</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <button
                onClick={() => handleRestart('postfix')}
                disabled={restarting === 'postfix'}
                className="flex items-center justify-between px-4 py-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 rounded-xl text-blue-200 transition-all font-medium text-sm group"
              >
                <div className="flex items-center gap-2.5">
                  <Send className="w-4 h-4 text-blue-400" />
                  <span>Reiniciar Postfix</span>
                </div>
                <RefreshCw className={`w-4 h-4 text-blue-400 group-hover:rotate-180 transition-transform ${restarting === 'postfix' ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => handleRestart('amavis')}
                disabled={restarting === 'amavis'}
                className="flex items-center justify-between px-4 py-3 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 rounded-xl text-amber-200 transition-all font-medium text-sm group"
              >
                <div className="flex items-center gap-2.5">
                  <Filter className="w-4 h-4 text-amber-400" />
                  <span>Reiniciar Amavis</span>
                </div>
                <RefreshCw className={`w-4 h-4 text-amber-400 group-hover:rotate-180 transition-transform ${restarting === 'amavis' ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => handleRestart('clamav-daemon')}
                disabled={restarting === 'clamav-daemon'}
                className="flex items-center justify-between px-4 py-3 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 rounded-xl text-rose-200 transition-all font-medium text-sm group"
              >
                <div className="flex items-center gap-2.5">
                  <Bug className="w-4 h-4 text-rose-400" />
                  <span>Reiniciar ClamAV</span>
                </div>
                <RefreshCw className={`w-4 h-4 text-rose-400 group-hover:rotate-180 transition-transform ${restarting === 'clamav-daemon' ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SIMULADOR DE TRÁFEGO DE E-MAIL (GRAVAÇÃO DIRETA NO BANCO DE DADOS) */}
      {/* ========================================================================= */}
      {isSimModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 relative">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Simulador de Tráfego de E-mail</h3>
                  <p className="text-xs text-slate-500">Injeta logs diretamente na tabela SQLite/MariaDB mail_logs_history</p>
                </div>
              </div>

              <button
                onClick={() => setIsSimModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSimulateSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    + Mensagens Recebidas (Inbound)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="500"
                    value={simReceived}
                    onChange={(e) => setSimReceived(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    + Mensagens Enviadas (Outbound)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="500"
                    value={simSent}
                    onChange={(e) => setSimSent(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-rose-700 mb-1">
                    + SPAMs Bloqueados
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="200"
                    value={simSpam}
                    onChange={(e) => setSimSpam(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-rose-300 text-rose-700 rounded-xl font-mono focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-700 mb-1">
                    + Bounces / Rejeições
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={simBounce}
                    onChange={(e) => setSimBounce(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-amber-300 text-amber-700 rounded-xl font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600 flex items-start gap-2">
                <Database className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <span>
                  Cada mensagem gerada é gravada como uma linha individual na base de dados com data e hora real, alimentando os gráficos e a tabela de auditoria instantaneamente.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSimModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={simSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                >
                  {simSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Gravar no Banco & Atualizar Gráficos</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit Diagnostics Modal */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-900 text-white rounded-2xl">
                  <Database className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Diagnóstico da Tabela mail_logs_history & Auditoria
                  </h3>
                  <p className="text-xs text-slate-500">
                    Rastreabilidade de consultas SQL, registros gravados e integridade do banco
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
              >
                ✕
              </button>
            </div>

            {auditDiagLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                <span className="text-xs font-semibold">Consultando métricas do banco de dados...</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                      Total de Logs no Banco
                    </span>
                    <span className="text-2xl font-black text-blue-600 font-mono">
                      {(auditDiagData?.total_mail_logs_in_db || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                      Registro Mais Antigo
                    </span>
                    <span className="text-xs font-bold text-slate-700 font-mono block truncate">
                      {auditDiagData?.oldest_record || 'Nenhum'}
                    </span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                      Registro Mais Recente
                    </span>
                    <span className="text-xs font-bold text-slate-700 font-mono block truncate">
                      {auditDiagData?.newest_record || 'Nenhum'}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700">Logs Recentes de Auditoria (Dashboard)</span>
                    <button
                      onClick={fetchAuditDiagnostics}
                      className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Recarregar</span>
                    </button>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-2">
                    {auditDiagData?.recent_audit_logs && auditDiagData.recent_audit_logs.length > 0 ? (
                      auditDiagData.recent_audit_logs.map((log: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between border-b border-slate-200/60 pb-1.5 last:border-0 last:pb-0">
                          <div>
                            <span className="text-slate-400 text-[10px] mr-2">{log.timestamp || log.created_at}</span>
                            <span className="font-bold text-slate-800">{log.action}</span>
                            <span className="text-slate-500 text-[11px] ml-2">{log.target}</span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md">
                            {log.admin_user || 'admin'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 text-center py-4">Nenhum evento registrado recentemente.</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <button
                    onClick={handleIngestNow}
                    disabled={ingesting}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <Download className={`w-3.5 h-3.5 ${ingesting ? 'animate-bounce' : ''}`} />
                    <span>{ingesting ? 'Ingerindo /var/log/mail.log...' : 'Ingerir MailLog Agora'}</span>
                  </button>

                  <button
                    onClick={() => setIsAuditModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
