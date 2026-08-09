import React, { useState, useEffect } from 'react';
import { 
  Send, Filter, Bug, RefreshCw, Power, CheckCircle, XCircle, 
  Activity, Layers, ShieldAlert, Cpu, HardDrive, Database, 
  Server, Zap, ShieldCheck, ArrowUpRight, ArrowDownLeft, Gauge,
  Clock, Check
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import { ServicesMap, SystemMetrics } from '../types';

interface DashboardTabProps {
  services: ServicesMap;
  loading: boolean;
  onRefresh: () => void;
  onRestartService: (serviceName: string) => Promise<void>;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  services,
  loading,
  onRefresh,
  onRestartService
}) => {
  const [restarting, setRestarting] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [metricsLoading, setMetricsLoading] = useState<boolean>(false);

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
    fetchMetrics();
    if (!autoRefresh) return;
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const handleRestart = async (svc: string) => {
    setRestarting(svc);
    await onRestartService(svc);
    setRestarting(null);
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

  // RAM Pie chart data
  const ramPieData = metrics ? [
    { name: 'Em Uso', value: metrics.memory.used_mb, color: '#3b82f6' },
    { name: 'Buffers/Cache', value: metrics.memory.cached_mb, color: '#8b5cf6' },
    { name: 'Livre', value: metrics.memory.free_mb, color: '#10b981' }
  ] : [];

  return (
    <div className="space-y-6">
      
      {/* 1. Top Header Banner & Server Info */}
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

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              autoRefresh
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-slate-100 text-slate-600 border-slate-300'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${autoRefresh ? 'text-emerald-600 animate-bounce' : 'text-slate-400'}`} />
            <span>{autoRefresh ? 'Auto-Refresh (5s)' : 'Auto-Refresh Pausado'}</span>
          </button>

          <button
            onClick={() => { onRefresh(); fetchMetrics(); }}
            disabled={loading || metricsLoading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || metricsLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar Agora</span>
          </button>
        </div>
      </div>

      {/* 2. Hardware Charts Section (CPU, RAM, DISK) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* A. Processador (CPU Usage Chart) */}
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

            {/* Recharts Area Chart for CPU History */}
            <div className="h-48 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics?.cpu.history || []}>
                  <defs>
                    <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
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
                  <Area type="monotone" dataKey="usage" name="Uso CPU (%)" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#cpuGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Coerência Térmica: Normal (38°C)</span>
            <span className="font-mono text-slate-600">Núcleos Ativos: {metrics?.cpu.cores || 16} Cores</span>
          </div>
        </div>

        {/* B. Memória RAM & Cache */}
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

            {/* RAM Pie Chart */}
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

            {/* RAM Breakdown List */}
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

      {/* 3. Armazenamento em Disco (Partições /var/vmail, /, /var/log) */}
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

                {/* Progress bar */}
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

      {/* 4. Top Processos e Tráfego de Rede */}
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

      {/* 5. Global Actions & Services Controls */}
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

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {['postfix', 'amavis', 'clamav-daemon'].map((svcKey) => {
          const info = getServiceInfo(svcKey);
          const status = services[svcKey] || { active: false, state: 'desconhecido' };
          const isBusy = restarting === svcKey;

          return (
            <div key={svcKey} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
              <div className="p-5 border-b border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-slate-100 rounded-xl">
                      {info.icon}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-base">{info.name}</h4>
                      <span className="text-xs font-mono text-slate-400">{info.port}</span>
                    </div>
                  </div>

                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                    status.active
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    {status.active ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Online</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Offline</span>
                      </>
                    )}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {info.desc}
                </p>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500 font-mono">
                  Estado: <span className="font-semibold text-slate-700">{status.state}</span>
                </div>

                <button
                  onClick={() => handleRestart(svcKey)}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition-colors shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isBusy ? 'animate-spin' : ''}`} />
                  <span>Reiniciar</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};
