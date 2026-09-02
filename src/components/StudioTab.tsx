import React, { useState, useEffect } from 'react';
import { ServerScriptItem, ScriptExecutionResult } from '../types';
import { 
  Terminal, Database, Calendar, Play, RefreshCw, PlusCircle, CheckCircle2, 
  AlertTriangle, Copy, Download, Trash2, Code2, ShieldAlert, Sliders, 
  FileCode, Check, CornerDownRight, ExternalLink
} from 'lucide-react';

interface StudioTabProps {
  onShowAlert: (message: string, type: 'success' | 'danger') => void;
}

export function StudioTab({ onShowAlert }: StudioTabProps) {
  const [subTab, setSubTab] = useState<'scripts' | 'sql' | 'cron'>('scripts');

  // Script Runner State
  const [scripts, setScripts] = useState<ServerScriptItem[]>([]);
  const [selectedScript, setSelectedScript] = useState<ServerScriptItem | null>(null);
  const [scriptArgs, setScriptArgs] = useState<string>('');
  const [useSudo, setUseSudo] = useState<boolean>(true);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [showSource, setShowSource] = useState<boolean>(false);
  const [sourceCode, setSourceCode] = useState<string>('');
  const [loadingSource, setLoadingSource] = useState<boolean>(false);

  // Terminal State
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [lastExecution, setLastExecution] = useState<ScriptExecutionResult | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // SQL Studio State
  const [sqlQuery, setSqlQuery] = useState<string>('SELECT * FROM mail_logs_history ORDER BY timestamp DESC LIMIT 20;');
  const [sqlResults, setSqlResults] = useState<{ columns: string[]; rows: any[]; row_count: number; execution_time_ms: number } | null>(null);
  const [isExecutingSql, setIsExecutingSql] = useState<boolean>(false);

  // Load available scripts on mount
  useEffect(() => {
    fetchScripts();
  }, []);

  const fetchScripts = async () => {
    try {
      const res = await fetch('/api/automation/scripts');
      if (res.ok) {
        const data = await res.json();
        if (data.scripts) {
          setScripts(data.scripts);
          if (!selectedScript && data.scripts.length > 0) {
            const def = data.scripts.find((s: ServerScriptItem) => s.filename === 'fix_permissions_and_amavis.py') || data.scripts[0];
            selectScript(def);
          }
        }
      }
    } catch (err: any) {
      console.error('Erro ao carregar scripts:', err);
    }
  };

  const selectScript = (script: ServerScriptItem) => {
    setSelectedScript(script);
    setScriptArgs(script.default_args || '');
    setUseSudo(script.requires_sudo !== false);
    if (showSource) {
      loadScriptSource(script.filename);
    }
  };

  const loadScriptSource = async (filename: string) => {
    setLoadingSource(true);
    try {
      const res = await fetch(`/api/automation/scripts/${encodeURIComponent(filename)}/content`);
      if (res.ok) {
        const data = await res.json();
        setSourceCode(data.content || '# Arquivo sem conteúdo.');
      } else {
        setSourceCode('# Não foi possível obter o código-fonte.');
      }
    } catch (err: any) {
      setSourceCode(`# Erro: ${err.message}`);
    } finally {
      setLoadingSource(false);
    }
  };

  const toggleSourceView = () => {
    const nextState = !showSource;
    setShowSource(nextState);
    if (nextState && selectedScript) {
      loadScriptSource(selectedScript.filename);
    }
  };

  const handleRunScript = async () => {
    if (!selectedScript) return;
    setIsRunning(true);

    const cmdStr = `${useSudo ? 'sudo -n ' : ''}${selectedScript.type === 'python' ? 'python3 scripts/' : 'bash scripts/'}${selectedScript.filename} ${scriptArgs}`.trim();
    const timeStr = new Date().toLocaleTimeString();

    setTerminalOutput(prev => [
      ...prev,
      `\n[${timeStr}] $ ${cmdStr}`,
      `> Disparando subprocess no servidor Linux...`
    ]);

    try {
      const res = await fetch('/api/automation/scripts/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: selectedScript.filename,
          args: scriptArgs,
          use_sudo: useSudo
        })
      });

      const data = await res.json();
      setLastExecution(data);

      const outText = data.output || data.stdout || data.message || '(Sem saída)';
      setTerminalOutput(prev => [
        ...prev,
        outText,
        `[Processo concluído com código ${data.returncode} em ${data.duration_ms || 0}ms]`
      ]);

      if (data.success) {
        onShowAlert(`Script "${selectedScript.filename}" executado com sucesso!`, 'success');
      } else {
        onShowAlert(`Script "${selectedScript.filename}" finalizou com código ${data.returncode}.`, 'danger');
      }
    } catch (err: any) {
      setTerminalOutput(prev => [
        ...prev,
        `[ERRO DE CONEXÃO] ${err.message}`
      ]);
      onShowAlert(`Falha ao executar script: ${err.message}`, 'danger');
    } finally {
      setIsRunning(false);
    }
  };

  const handleExecuteSql = async () => {
    if (!sqlQuery.trim()) return;
    setIsExecutingSql(true);
    try {
      const res = await fetch('/api/troubleshooting/sql-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sqlQuery })
      });
      const data = await res.json();
      if (data.success || data.status === 'success') {
        setSqlResults(data);
        onShowAlert(`Query executada com sucesso (${data.row_count} linhas em ${data.execution_time_ms}ms).`, 'success');
      } else {
        onShowAlert(data.message || 'Erro ao executar query SQL.', 'danger');
      }
    } catch (err: any) {
      onShowAlert(`Erro na consulta SQL: ${err.message}`, 'danger');
    } finally {
      setIsExecutingSql(false);
    }
  };

  const copyOutput = () => {
    const text = terminalOutput.join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadOutput = () => {
    const text = terminalOutput.join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `script_terminal_${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Subtab Navigation */}
      <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap gap-2">
        <button
          onClick={() => setSubTab('scripts')}
          className={`px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${
            subTab === 'scripts'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Terminal className="w-4 h-4" />
          Script Runner & Manutenção
        </button>

        <button
          onClick={() => setSubTab('sql')}
          className={`px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${
            subTab === 'sql'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Database className="w-4 h-4" />
          SQL Studio (MariaDB Explorer)
        </button>
      </div>

      {subTab === 'scripts' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5 mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-emerald-600" />
                  Script Runner & Terminal de Execução
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Execute rotinas de manutenção, diagnósticos e scripts customizados com parametrização em tempo real e captura de saída no terminal.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchScripts}
                  className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Atualizar Catálogo
                </button>
              </div>
            </div>

            {/* Script Selection Dropdown & Shortcut Badges */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
              <div className="lg:col-span-6 space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-blue-600" />
                  Selecionar Script no Servidor:
                </label>
                <select
                  value={selectedScript?.filename || ''}
                  onChange={(e) => {
                    const found = scripts.find(s => s.filename === e.target.value);
                    if (found) selectScript(found);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {scripts.map(s => (
                    <option key={s.filename} value={s.filename}>
                      {s.type === 'python' ? '🐍' : '📜'} {s.filename} — {s.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-6 space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-600" />
                  Atalhos Rápidos Oficiais:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {scripts.slice(0, 5).map(s => (
                    <button
                      key={s.filename}
                      onClick={() => selectScript(s)}
                      className={`text-xs font-mono px-2.5 py-1 rounded-lg border transition-all ${
                        selectedScript?.filename === s.filename
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      ⚡ {s.filename}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Selected Script Configuration Panel */}
            {selectedScript && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`text-[11px] font-bold uppercase font-mono px-2 py-0.5 rounded-md ${
                      selectedScript.type === 'python' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-white'
                    }`}>
                      {selectedScript.type === 'python' ? 'PYTHON 3' : 'BASH SHELL'}
                    </span>
                    <span className="font-mono font-bold text-slate-900 text-sm">{selectedScript.filename}</span>
                    <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                      {selectedScript.category}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleSourceView}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg flex items-center gap-1.5 transition-colors"
                    >
                      <Code2 className="w-3.5 h-3.5 text-slate-600" />
                      {showSource ? 'Ocultar Código' : 'Inspecionar Código'}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {selectedScript.description}
                </p>

                {/* Collapsible Source Code Box */}
                {showSource && (
                  <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                    <div className="bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-400 flex items-center justify-between border-b border-slate-800">
                      <span>scripts/{selectedScript.filename}</span>
                      <span>{loadingSource ? 'Carregando...' : `${sourceCode.length} chars`}</span>
                    </div>
                    <pre className="p-4 text-xs font-mono text-emerald-400 overflow-x-auto max-h-64 overflow-y-auto leading-relaxed">
                      <code>{sourceCode}</code>
                    </pre>
                  </div>
                )}

                {/* Parameters & Execution Form */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end pt-2">
                  <div className="md:col-span-6 space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span>Parâmetros / Argumentos CLI:</span>
                      <span className="text-slate-400 font-normal text-[11px]">Opcional</span>
                    </label>
                    <input
                      type="text"
                      value={scriptArgs}
                      onChange={(e) => setScriptArgs(e.target.value)}
                      placeholder="Ex: --user suporte ou flags"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    {selectedScript.suggested_args && selectedScript.suggested_args.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pt-1">
                        <span className="text-[11px] text-slate-400">Sugestões:</span>
                        {selectedScript.suggested_args.map((arg, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setScriptArgs(arg)}
                            className="text-[10px] font-mono bg-white border border-slate-200 hover:border-emerald-400 text-slate-600 px-2 py-0.5 rounded-full"
                          >
                            {arg}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-3">
                    <label className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={useSudo}
                        onChange={(e) => setUseSudo(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Sudo NOPASSWD</span>
                        <span className="text-[10px] text-slate-500 block">Executar com privilégios</span>
                      </div>
                    </label>
                  </div>

                  <div className="md:col-span-3">
                    <button
                      onClick={handleRunScript}
                      disabled={isRunning}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 text-sm disabled:opacity-50 transition-all"
                    >
                      {isRunning ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Executando...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current" />
                          Executar Agora
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Terminal Viewport */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            {/* Terminal Top Bar */}
            <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
                </div>
                <span className="text-xs font-mono font-bold text-slate-300 ml-2 flex items-center gap-1">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  Console Unix Interativo
                </span>
              </div>

              <div className="flex items-center gap-2">
                {lastExecution && (
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    lastExecution.success ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}>
                    Exit: {lastExecution.returncode} ({lastExecution.duration_ms}ms)
                  </span>
                )}

                <button
                  onClick={copyOutput}
                  className="px-2 py-1 text-[11px] font-mono text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md flex items-center gap-1 transition-colors"
                  title="Copiar Console"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>

                <button
                  onClick={downloadOutput}
                  className="px-2 py-1 text-[11px] font-mono text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md flex items-center gap-1 transition-colors"
                  title="Salvar Log"
                >
                  <Download className="w-3 h-3" />
                  Salvar
                </button>

                <button
                  onClick={() => {
                    setTerminalOutput([]);
                    setLastExecution(null);
                  }}
                  className="px-2 py-1 text-[11px] font-mono text-rose-400 hover:text-rose-300 bg-slate-800 hover:bg-slate-700 rounded-md flex items-center gap-1 transition-colors"
                  title="Limpar Console"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Terminal Content Canvas */}
            <div className="p-4 font-mono text-xs text-slate-200 max-h-96 min-h-[260px] overflow-y-auto space-y-1 select-text leading-relaxed">
              <div className="text-slate-500">
                ┌──(mailadmin㉿zrti-mailserver)-[/opt/mailadmin]
              </div>
              <div className="text-slate-500">
                └─$ <span className="text-emerald-400"># Selecione um script acima e clique em 'Executar Agora' para rodar a rotina no servidor Debian.</span>
              </div>
              {terminalOutput.map((line, idx) => (
                <div key={idx} className="whitespace-pre-wrap">
                  {line.startsWith('\n[') ? (
                    <span className="text-amber-300 font-bold">{line}</span>
                  ) : line.includes('[OK]') || line.includes('SUCESSO') ? (
                    <span className="text-emerald-400">{line}</span>
                  ) : line.includes('[ERRO]') || line.includes('FALHA') ? (
                    <span className="text-rose-400">{line}</span>
                  ) : line.includes('[AVISO]') || line.includes('WARNING') ? (
                    <span className="text-amber-400">{line}</span>
                  ) : (
                    line
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {subTab === 'sql' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" />
                Explorador MariaDB / SQL Studio
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Execute consultas seguras (SELECT, SHOW, EXPLAIN) nas tabelas do banco vmail e analise métricas.
              </p>
            </div>
            <span className="text-xs font-mono bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-xl font-bold">
              MariaDB • Database: vmail
            </span>
          </div>

          {/* Quick Queries Shortcuts */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Consultas Frequentes:
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSqlQuery('SHOW DATABASES;')}
                className="text-xs font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                SHOW DATABASES;
              </button>
              <button
                onClick={() => setSqlQuery('SHOW TABLES;')}
                className="text-xs font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                SHOW TABLES;
              </button>
              <button
                onClick={() => setSqlQuery('SELECT * FROM mail_logs_history ORDER BY timestamp DESC LIMIT 50;')}
                className="text-xs font-mono bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                mail_logs_history
              </button>
              <button
                onClick={() => setSqlQuery('SELECT * FROM domain;')}
                className="text-xs font-mono bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                domain
              </button>
              <button
                onClick={() => setSqlQuery('SELECT username, quota, active, created FROM mailbox LIMIT 50;')}
                className="text-xs font-mono bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                mailbox
              </button>
              <button
                onClick={() => setSqlQuery('SELECT * FROM system_audit_logs ORDER BY id DESC LIMIT 20;')}
                className="text-xs font-mono bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                system_audit_logs
              </button>
            </div>
          </div>

          {/* SQL Input */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700">Instrução SQL:</label>
            <textarea
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              rows={3}
              className="w-full bg-slate-950 text-emerald-400 font-mono text-xs p-4 rounded-xl border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={handleExecuteSql}
              disabled={isExecutingSql}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-xl text-sm flex items-center gap-2 shadow-md shadow-blue-500/20 disabled:opacity-50 transition-all"
            >
              {isExecutingSql ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
              Executar Query SQL
            </button>

            {sqlResults && (
              <span className="text-xs text-slate-500 font-mono">
                {sqlResults.row_count} linhas retornadas ({sqlResults.execution_time_ms} ms)
              </span>
            )}
          </div>

          {/* Results Table */}
          {sqlResults && (
            <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 font-mono font-bold text-slate-700">
                  <tr>
                    {sqlResults.columns.map((col, idx) => (
                      <th key={idx} className="p-3 whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {sqlResults.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50/80">
                      {sqlResults.columns.map((col, cIdx) => (
                        <td key={cIdx} className="p-3 text-slate-600 max-w-xs truncate">
                          {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-slate-300 italic">NULL</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
