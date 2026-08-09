import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Search, RefreshCw, Filter, Download, Pause, Play, ShieldAlert, ArrowDownCircle } from 'lucide-react';

export const LogAuditTab: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [logSource, setLogSource] = useState<string>('/var/log/mail.log');
  
  const logViewerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/logs?lines=100');
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        setLogs(data.logs);
        if (data.source) setLogSource(data.source);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    let interval: any;
    if (autoRefresh) {
      interval = setInterval(fetchLogs, 10000); // 10 segundos
    }
    return () => clearInterval(interval);
  }, [autoRefresh]);

  useEffect(() => {
    if (logViewerRef.current) {
      logViewerRef.current.scrollTop = logViewerRef.current.scrollHeight;
    }
  }, [logs, searchQuery]);

  // Filter logic
  const filteredLogs = logs.filter((line) =>
    line.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const getLineClass = (line: string) => {
    const l = line.toLowerCase();
    if (l.includes('blocked') || l.includes('reject') || l.includes('d_discard') || l.includes('denied')) {
      return 'text-rose-400 font-semibold bg-rose-950/20';
    }
    if (l.includes('spam') || l.includes('bayes_99')) {
      return 'text-amber-300 font-semibold bg-amber-950/20';
    }
    if (l.includes('passed clean') || l.includes('clean') || l.includes('status=sent')) {
      return 'text-emerald-400';
    }
    if (l.includes('connect from') || l.includes('disconnect from')) {
      return 'text-slate-400 font-mono';
    }
    return 'text-slate-300 font-mono';
  };

  const downloadLogFile = () => {
    const element = document.createElement("a");
    const file = new Blob([logs.join("\n")], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `mail_server_log_${new Date().toISOString().substring(0,10)}.log`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Terminal className="w-6 h-6 text-blue-600" />
            <span>Auditoria de Logs do Servidor</span>
            <span className="bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full border border-blue-200 font-mono">
              {logSource}
            </span>
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Monitoramento em tempo real das mensagens processadas, eventos do Postfix, Amavis e SpamAssassin.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-colors border ${
              autoRefresh
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-slate-100 text-slate-700 border-slate-300'
            }`}
          >
            {autoRefresh ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{autoRefresh ? 'Atualização Automática (10s)' : 'Pausado'}</span>
          </button>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors border border-slate-300"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar Agora</span>
          </button>
        </div>
      </div>

      {/* Search Bar & Preset Filters */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
        
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Busca Rápida: digite palavras como 'Blocked', 'Spam', 'score=', 'D_DISCARD', 'Passed'..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>

          <button
            onClick={downloadLogFile}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Exportar Log</span>
          </button>
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-100 text-xs">
          <span className="text-slate-500 font-medium">Filtros Rápidos:</span>
          
          <button
            onClick={() => setSearchQuery('Blocked')}
            className="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-md font-semibold transition-colors"
          >
            Blocked
          </button>

          <button
            onClick={() => setSearchQuery('Spam')}
            className="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-md font-semibold transition-colors"
          >
            Spam
          </button>

          <button
            onClick={() => setSearchQuery('score=')}
            className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-md font-semibold transition-colors"
          >
            score=
          </button>

          <button
            onClick={() => setSearchQuery('D_DISCARD')}
            className="px-2.5 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-md font-semibold transition-colors"
          >
            D_DISCARD
          </button>

          <button
            onClick={() => setSearchQuery('Passed CLEAN')}
            className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-md font-semibold transition-colors"
          >
            Passed CLEAN
          </button>

          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-slate-400 hover:text-slate-600 underline font-medium ml-auto"
            >
              Limpar Filtro
            </button>
          )}
        </div>

      </div>

      {/* Terminal Display */}
      <div className="bg-slate-950 rounded-xl border border-slate-800 shadow-md overflow-hidden">
        
        <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
            <span className="ml-2 text-slate-300 font-bold">Mail Log Stream</span>
          </div>
          <div>
            Exibindo <span className="text-amber-400 font-bold">{filteredLogs.length}</span> de {logs.length} linhas
          </div>
        </div>

        <div
          ref={logViewerRef}
          className="p-4 font-mono text-xs leading-relaxed h-[500px] overflow-y-auto space-y-1 select-text"
        >
          {filteredLogs.length === 0 ? (
            <div className="text-slate-500 italic p-8 text-center">
              Nenhuma linha do log corresponde ao filtro atual "{searchQuery}".
            </div>
          ) : (
            filteredLogs.map((line, idx) => (
              <div
                key={idx}
                className={`py-0.5 px-2 rounded hover:bg-slate-900/80 transition-colors ${getLineClass(line)}`}
              >
                {line}
              </div>
            ))
          )}
        </div>

      </div>

    </div>
  );
};
