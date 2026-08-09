import React, { useState, useEffect } from 'react';
import { QueueItem, DnsReport } from '../types';
import { Search, ShieldCheck, ListOrdered, Send, Trash2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

interface TroubleshootingTabProps {
  onShowAlert: (msg: string, type?: 'success' | 'danger') => void;
}

export function TroubleshootingTab({ onShowAlert }: TroubleshootingTabProps) {
  // Tracking
  const [trackQuery, setTrackQuery] = useState('');
  const [trackingEvents, setTrackingEvents] = useState<{ raw: string; type: string }[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Queue
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);

  // DNS
  const [dnsDomain, setDnsDomain] = useState('empresa.com.br');
  const [dnsSelector, setDnsSelector] = useState('dkim');
  const [dnsReport, setDnsReport] = useState<DnsReport | null>(null);
  const [dnsLoading, setDnsLoading] = useState(false);

  const fetchQueue = async () => {
    setQueueLoading(true);
    try {
      const res = await fetch('/api/troubleshooting/queue');
      const data = await res.json();
      if (data.success) {
        setQueue(data.messages || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackQuery) return;
    setTrackingLoading(true);
    try {
      const res = await fetch(`/api/troubleshooting/email-tracking?email=${encodeURIComponent(trackQuery)}`);
      const data = await res.json();
      if (data.success) {
        setTrackingEvents(data.events || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleFlushQueue = async () => {
    try {
      const res = await fetch('/api/troubleshooting/queue/flush', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        fetchQueue();
      }
    } catch (err: any) {
      onShowAlert(err.message, 'danger');
    }
  };

  const handleDeleteQueueItem = async (queueId: string) => {
    try {
      const res = await fetch('/api/troubleshooting/queue/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue_id: queueId })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        fetchQueue();
      }
    } catch (err: any) {
      onShowAlert(err.message, 'danger');
    }
  };

  const handleCheckDns = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dnsDomain) return;
    setDnsLoading(true);
    try {
      const res = await fetch(`/api/troubleshooting/dns-check?domain=${encodeURIComponent(dnsDomain)}&selector=${encodeURIComponent(dnsSelector)}`);
      const data = await res.json();
      if (data.success) {
        setDnsReport(data.dns_report);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDnsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 1. Rastreamento de Jornada de E-mail */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-1">
              <Search className="w-5 h-5 text-blue-600" /> Rastrear Jornada do E-mail
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Busca registros em <code>/var/log/mail.log</code> para verificar entregas, bloqueios Amavis e Queue-IDs
            </p>

            <form onSubmit={handleTrack} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Insira e-mail do remetente ou destino..."
                value={trackQuery}
                onChange={(e) => setTrackQuery(e.target.value)}
                className="flex-1 px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={trackingLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                {trackingLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Rastrear
              </button>
            </form>
          </div>

          <div className="bg-slate-900 text-slate-200 rounded-lg p-4 font-mono text-xs max-h-60 overflow-y-auto space-y-1.5 border border-slate-800">
            {trackingEvents.length === 0 ? (
              <span className="text-slate-500 italic">Insira um e-mail para visualizar o histórico de conexão SMTP e filtros...</span>
            ) : (
              trackingEvents.map((ev, idx) => (
                <div key={idx} className="leading-relaxed border-b border-slate-800/50 pb-1">
                  <span className="text-sky-400 font-semibold me-2">[{ev.type}]</span>
                  <span className="text-slate-300">{ev.raw}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 2. Validador DNS público (dnspython) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-emerald-600" /> Validador DNS (dnspython)
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Verifica apontamentos MX, SPF (TXT), DKIM e DMARC em tempo real
            </p>

            <form onSubmit={handleCheckDns} className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
              <input
                type="text"
                placeholder="Domínio ex: empresa.com.br"
                value={dnsDomain}
                onChange={(e) => setDnsDomain(e.target.value)}
                className="col-span-2 px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={dnsLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                {dnsLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Validar
              </button>
            </form>
          </div>

          {dnsReport ? (
            <div className="space-y-2 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs">
              <div className="flex items-center justify-between p-2 bg-white rounded border border-slate-200">
                <div>
                  <span className="font-bold text-slate-800 me-2">MX:</span>
                  <span className="text-slate-600">{dnsReport.mx.records?.join(', ') || 'Ausente'}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${dnsReport.mx.status === 'OK' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                  {dnsReport.mx.status}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 bg-white rounded border border-slate-200">
                <div className="truncate max-w-xs">
                  <span className="font-bold text-slate-800 me-2">SPF:</span>
                  <code className="text-slate-600">{dnsReport.spf.record || 'Ausente'}</code>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${dnsReport.spf.status === 'OK' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                  {dnsReport.spf.status}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 bg-white rounded border border-slate-200">
                <div className="truncate max-w-xs">
                  <span className="font-bold text-slate-800 me-2">DKIM:</span>
                  <code className="text-slate-600">{dnsReport.dkim.record || 'Não localizado'}</code>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${dnsReport.dkim.status === 'OK' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {dnsReport.dkim.status}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 bg-white rounded border border-slate-200">
                <div className="truncate max-w-xs">
                  <span className="font-bold text-slate-800 me-2">DMARC:</span>
                  <code className="text-slate-600">{dnsReport.dmarc.record || 'Ausente'}</code>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${dnsReport.dmarc.status === 'OK' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                  {dnsReport.dmarc.status}
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 p-4 rounded-lg text-center text-xs text-slate-400 border border-slate-200">
              Execute uma validação para exibir os relatórios de saúde DNS do domínio.
            </div>
          )}
        </div>

      </div>

      {/* 3. Fila de Mensagens Postfix */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <ListOrdered className="w-5 h-5 text-amber-600" /> Fila Postfix (postqueue -p)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Mensagens atualmente retidas na fila de transmissão do servidor
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleFlushQueue}
              className="bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" /> Forçar Envio (postqueue -f)
            </button>
            <button
              onClick={fetchQueue}
              disabled={queueLoading}
              className="p-1.5 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${queueLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                <th className="px-6 py-3">Queue ID</th>
                <th className="px-6 py-3">Tamanho</th>
                <th className="px-6 py-3">Data</th>
                <th className="px-6 py-3">Remetente</th>
                <th className="px-6 py-3">Destinatário(s)</th>
                <th className="px-6 py-3">Motivo / Erro</th>
                <th className="px-6 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {queue.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-emerald-600 font-medium">
                    <span className="inline-flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" /> Fila limpa! Nenhuma mensagem retida no momento.
                    </span>
                  </td>
                </tr>
              ) : (
                queue.map((q) => (
                  <tr key={q.queue_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs font-bold text-slate-800">{q.queue_id}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">{q.size} B</td>
                    <td className="px-6 py-4 text-xs text-slate-600">{q.date}</td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-700">{q.sender}</td>
                    <td className="px-6 py-4 text-xs text-slate-600">{q.recipients.join(', ')}</td>
                    <td className="px-6 py-4 text-xs text-rose-600 font-medium">{q.reason || 'Pendente'}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDeleteQueueItem(q.queue_id)}
                        className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                        title="Deletar com postsuper -d"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
