import React, { useState, useEffect } from 'react';
import { QueueItem, DnsReport, DkimKeyInfo } from '../types';
import { 
  Search, 
  ShieldCheck, 
  ListOrdered, 
  Send, 
  Trash2, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Key, 
  Copy, 
  Check, 
  HelpCircle, 
  ExternalLink, 
  Server, 
  FileText,
  AlertTriangle,
  Sparkles,
  Info
} from 'lucide-react';

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

  // DNS & DKIM
  const [dnsDomain, setDnsDomain] = useState('zrti.com.br');
  const [dnsSelector, setDnsSelector] = useState('default');
  const [dnsReport, setDnsReport] = useState<DnsReport | null>(null);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [generatingDkim, setGeneratingDkim] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [activeRemediationTab, setActiveRemediationTab] = useState<'all' | 'dkim' | 'spf' | 'dmarc' | 'mx'>('all');

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
    // Auto run DNS check for initial domain
    runDnsCheck('zrti.com.br', 'default');
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

  const runDnsCheck = async (domainToTest: string, selectorToTest: string) => {
    if (!domainToTest) return;
    setDnsLoading(true);
    try {
      const res = await fetch(`/api/troubleshooting/dns-check?domain=${encodeURIComponent(domainToTest)}&selector=${encodeURIComponent(selectorToTest)}`);
      const data = await res.json();
      if (data.success && data.dns_report) {
        setDnsReport(data.dns_report);
      }
    } catch (e) {
      console.error(e);
      onShowAlert("Falha ao consultar DNS do domínio", "danger");
    } finally {
      setDnsLoading(false);
    }
  };

  const handleCheckDns = (e: React.FormEvent) => {
    e.preventDefault();
    runDnsCheck(dnsDomain, dnsSelector);
  };

  const handleGenerateDkim = async () => {
    if (!dnsDomain) return;
    setGeneratingDkim(true);
    try {
      const res = await fetch('/api/troubleshooting/dkim/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: dnsDomain, selector: dnsSelector || 'default' })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        // Re-run DNS audit to update state
        runDnsCheck(dnsDomain, dnsSelector);
      } else {
        onShowAlert(data.message || 'Erro ao gerar chave DKIM', 'danger');
      }
    } catch (err: any) {
      onShowAlert(err.message || 'Erro na requisição', 'danger');
    } finally {
      setGeneratingDkim(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2500);
    onShowAlert('Registro copiado para a área de transferência!', 'success');
  };

  return (
    <div className="space-y-6">
      
      {/* SEÇÃO PRINCIPAL: AUDITORIA DNS & AUTENTICAÇÃO COM GUIA DE RESOLUÇÃO */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-emerald-600" />
              Auditoria de Saúde DNS & Diagnóstico de Autenticação
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Validação ativa de registros <strong>MX</strong>, <strong>SPF</strong>, <strong>DKIM (RSA 2048-bit)</strong> e <strong>DMARC</strong> com guias passo a passo para resolução de falhas.
            </p>
          </div>
          {dnsReport && (
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                dnsReport.is_local_domain 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {dnsReport.is_local_domain ? '✓ Domínio Local no Vmail' : '⚠ Domínio Externo'}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold font-mono ${
                dnsReport.health_score === 100 
                  ? 'bg-emerald-600 text-white' 
                  : dnsReport.health_score >= 50 
                    ? 'bg-amber-500 text-white' 
                    : 'bg-rose-600 text-white'
              }`}>
                Saúde DNS: {dnsReport.health_score}% ({dnsReport.passed_checks}/{dnsReport.total_checks} OK)
              </span>
            </div>
          )}
        </div>

        {/* Formulário de Auditoria */}
        <form onSubmit={handleCheckDns} className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="md:col-span-6">
            <label className="block text-xs font-bold text-slate-700 mb-1">Domínio a Testar:</label>
            <input
              type="text"
              placeholder="ex: zrti.com.br ou empresa.com.br"
              value={dnsDomain}
              onChange={(e) => setDnsDomain(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-slate-700 mb-1">Seletor DKIM:</label>
            <input
              type="text"
              placeholder="default, mail, dkim..."
              value={dnsSelector}
              onChange={(e) => setDnsSelector(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="md:col-span-3 flex items-end">
            <button
              type="submit"
              disabled={dnsLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              {dnsLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Auditar DNS & Autenticação
            </button>
          </div>
        </form>

        {/* Relatório Detalhado com Diagnóstico e Soluções */}
        {dnsReport ? (
          <div className="space-y-6">
            
            {/* DESTAQUE ESPECIAL DKIM: GERAÇÃO E APONTAMENTO DA CHAVE (Solicitado pelo usuário) */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-200/70 pb-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-600 text-white rounded-lg shadow-sm">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      Autenticação Criptográfica DKIM (DomainKeys Identified Mail)
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        dnsReport.dkim.status === 'OK' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        Status DNS: {dnsReport.dkim.status}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Geração de par de chaves RSA 2048-bit para assinatura automática pelo Postfix / OpenDKIM / Rspamd.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateDkim}
                    disabled={generatingDkim}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    {generatingDkim ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    Gerar / Renovar Chave DKIM 2048-bit
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowServerConfig(!showServerConfig)}
                    className="border border-blue-300 hover:bg-blue-100 text-blue-800 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  >
                    {showServerConfig ? 'Ocultar Config Servidor' : 'Ver Config Servidor Linux'}
                  </button>
                </div>
              </div>

              {/* Informações da Chave e Instruções de Apontamento DNS */}
              {dnsReport.dkim.dkim_key && (
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-blue-600" />
                        Apontamento DNS TXT Obrigatório para Publicação:
                      </span>
                      <button
                        onClick={() => copyToClipboard(dnsReport.dkim.dkim_key!.dns_record_value, 'dkim-val')}
                        className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                      >
                        {copiedKey === 'dkim-val' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedKey === 'dkim-val' ? 'Copiado!' : 'Copiar Valor TXT'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-mono mb-2">
                      <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                        <span className="text-slate-400 block text-[10px] uppercase font-sans font-bold">Tipo:</span>
                        <strong className="text-blue-700">TXT</strong>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded border border-slate-200 md:col-span-2">
                        <span className="text-slate-400 block text-[10px] uppercase font-sans font-bold">Nome / Host / Subdomínio:</span>
                        <strong className="text-slate-800 break-all">{dnsReport.dkim.dkim_key.dns_record_name}</strong>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                        <span className="text-slate-400 block text-[10px] uppercase font-sans font-bold">TTL:</span>
                        <strong className="text-slate-800">3600 (1 hora)</strong>
                      </div>
                    </div>

                    <div className="bg-slate-900 text-slate-200 p-3 rounded font-mono text-xs break-all relative">
                      <span className="text-slate-500 text-[10px] block mb-1">Conteúdo / Valor do Registro TXT:</span>
                      <span className="text-emerald-400">{dnsReport.dkim.dkim_key.dns_record_value}</span>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-1 text-slate-600">
                        <Info className="w-3.5 h-3.5 text-blue-500" />
                        Após criar este registro no seu painel DNS (Cloudflare, Registro.br, Route53, cPanel), aguarde a propagação e clique em <strong>Auditar DNS</strong>.
                      </span>
                    </div>
                  </div>

                  {/* Configurações Internas no Linux (OpenDKIM / Rspamd) */}
                  {showServerConfig && (
                    <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs space-y-3 border border-slate-800">
                      <div>
                        <span className="text-sky-400 font-bold block mb-1">1. Tabela OpenDKIM (/etc/opendkim/KeyTable):</span>
                        <code className="text-slate-300 block bg-black/40 p-2 rounded">{dnsReport.dkim.dkim_key.opendkim_table_line}</code>
                      </div>
                      <div>
                        <span className="text-sky-400 font-bold block mb-1">2. Configuração Rspamd (/etc/rspamd/local.d/dkim_signing.conf):</span>
                        <pre className="text-slate-300 block bg-black/40 p-2 rounded whitespace-pre-wrap">{dnsReport.dkim.dkim_key.rspamd_dkim_conf}</pre>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Chave Privada salva em: <code className="text-amber-300">/etc/opendkim/keys/{dnsDomain}/{dnsSelector}.private</code>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* GRADE DOS 4 PILARES DNS COM DIAGNÓSTICO & COMO RESOLVER */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* CARD 1: MX */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${dnsReport.mx.status === 'OK' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        <Server className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">Registro MX (Mail Exchanger)</h4>
                        <span className="text-[10px] text-slate-400">Roteamento de e-mails de entrada</span>
                      </div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                      dnsReport.mx.status === 'OK' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {dnsReport.mx.status}
                    </span>
                  </div>

                  <div className="space-y-2 mb-3">
                    <div className="text-xs">
                      <span className="text-slate-500 font-semibold block mb-0.5">Detectado no DNS:</span>
                      <div className="bg-slate-50 p-2 rounded border border-slate-200 font-mono text-xs text-slate-700">
                        {dnsReport.mx.records && dnsReport.mx.records.length > 0 ? (
                          dnsReport.mx.records.join(' | ')
                        ) : (
                          <span className="text-rose-600 italic">Nenhum registro MX encontrado</span>
                        )}
                      </div>
                    </div>

                    <div className="text-xs">
                      <span className="text-slate-500 font-semibold block mb-0.5">Diagnóstico:</span>
                      <p className="text-slate-700 bg-slate-50/70 p-2 rounded text-xs leading-relaxed">
                        {dnsReport.mx.diagnosis}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Caixa "Como Resolver" */}
                <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-amber-900 flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
                      Como Solucionar no DNS:
                    </span>
                    {dnsReport.mx.suggested_record && (
                      <button
                        onClick={() => copyToClipboard(`Tipo: MX | Host: @ | Valor: ${dnsReport.mx.suggested_record!.value} | Prioridade: 10`, 'mx-rec')}
                        className="text-[10px] text-amber-800 hover:text-amber-950 font-bold flex items-center gap-0.5"
                      >
                        {copiedKey === 'mx-rec' ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                        Copiar Entrada
                      </button>
                    )}
                  </div>
                  <p className="text-slate-600 text-[11px] mb-2">{dnsReport.mx.solution}</p>
                  {dnsReport.mx.suggested_record && (
                    <div className="bg-white p-2 rounded border border-amber-200 font-mono text-[11px] text-slate-800 flex items-center justify-between">
                      <span><strong>MX:</strong> Prioridade 10 &rarr; <code>{dnsReport.mx.suggested_record.value}</code></span>
                    </div>
                  )}
                </div>
              </div>

              {/* CARD 2: SPF */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${dnsReport.spf.status === 'OK' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">Registro SPF (Sender Policy Framework)</h4>
                        <span className="text-[10px] text-slate-400">Autorização de IPs emissores (TXT)</span>
                      </div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                      dnsReport.spf.status === 'OK' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {dnsReport.spf.status}
                    </span>
                  </div>

                  <div className="space-y-2 mb-3">
                    <div className="text-xs">
                      <span className="text-slate-500 font-semibold block mb-0.5">Detectado no DNS:</span>
                      <div className="bg-slate-50 p-2 rounded border border-slate-200 font-mono text-xs text-slate-700 break-all">
                        {dnsReport.spf.record ? (
                          dnsReport.spf.record
                        ) : (
                          <span className="text-rose-600 italic">Registro SPF ausente na zona raiz (@)</span>
                        )}
                      </div>
                    </div>

                    <div className="text-xs">
                      <span className="text-slate-500 font-semibold block mb-0.5">Diagnóstico:</span>
                      <p className="text-slate-700 bg-slate-50/70 p-2 rounded text-xs leading-relaxed">
                        {dnsReport.spf.diagnosis}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Caixa "Como Resolver" */}
                <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-amber-900 flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
                      Como Solucionar no DNS:
                    </span>
                    {dnsReport.spf.suggested_record && (
                      <button
                        onClick={() => copyToClipboard(dnsReport.spf.suggested_record!.value, 'spf-rec')}
                        className="text-[10px] text-amber-800 hover:text-amber-950 font-bold flex items-center gap-0.5"
                      >
                        {copiedKey === 'spf-rec' ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                        Copiar TXT
                      </button>
                    )}
                  </div>
                  <p className="text-slate-600 text-[11px] mb-2">{dnsReport.spf.solution}</p>
                  {dnsReport.spf.suggested_record && (
                    <div className="bg-white p-2 rounded border border-amber-200 font-mono text-[11px] text-slate-800 flex items-center justify-between">
                      <span><strong>TXT @:</strong> <code>{dnsReport.spf.suggested_record.value}</code></span>
                    </div>
                  )}
                </div>
              </div>

              {/* CARD 3: DKIM RESUMO */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${dnsReport.dkim.status === 'OK' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        <Key className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">Registro DKIM ({dnsSelector}._domainkey)</h4>
                        <span className="text-[10px] text-slate-400">Assinatura Digital de E-mails</span>
                      </div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                      dnsReport.dkim.status === 'OK' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {dnsReport.dkim.status}
                    </span>
                  </div>

                  <div className="space-y-2 mb-3">
                    <div className="text-xs">
                      <span className="text-slate-500 font-semibold block mb-0.5">Detectado no DNS:</span>
                      <div className="bg-slate-50 p-2 rounded border border-slate-200 font-mono text-xs text-slate-700 truncate">
                        {dnsReport.dkim.record ? (
                          dnsReport.dkim.record
                        ) : (
                          <span className="text-amber-600 italic">Não localizado em {dnsSelector}._domainkey.{dnsDomain}</span>
                        )}
                      </div>
                    </div>

                    <div className="text-xs">
                      <span className="text-slate-500 font-semibold block mb-0.5">Diagnóstico:</span>
                      <p className="text-slate-700 bg-slate-50/70 p-2 rounded text-xs leading-relaxed">
                        {dnsReport.dkim.diagnosis}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Caixa "Como Resolver" */}
                <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-blue-900 flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5 text-blue-700" />
                      Chave Gerada no Painel Acima:
                    </span>
                    <button
                      onClick={handleGenerateDkim}
                      className="text-[10px] text-blue-800 hover:text-blue-950 font-bold"
                    >
                      Gerar Nova Chave
                    </button>
                  </div>
                  <p className="text-slate-600 text-[11px]">{dnsReport.dkim.solution}</p>
                </div>
              </div>

              {/* CARD 4: DMARC */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${dnsReport.dmarc.status === 'OK' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">Registro DMARC (_dmarc.{dnsDomain})</h4>
                        <span className="text-[10px] text-slate-400">Políticas Anti-Phishing & Relatórios</span>
                      </div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                      dnsReport.dmarc.status === 'OK' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {dnsReport.dmarc.status}
                    </span>
                  </div>

                  <div className="space-y-2 mb-3">
                    <div className="text-xs">
                      <span className="text-slate-500 font-semibold block mb-0.5">Detectado no DNS:</span>
                      <div className="bg-slate-50 p-2 rounded border border-slate-200 font-mono text-xs text-slate-700 break-all">
                        {dnsReport.dmarc.record ? (
                          dnsReport.dmarc.record
                        ) : (
                          <span className="text-rose-600 italic">Registro DMARC não configurado</span>
                        )}
                      </div>
                    </div>

                    <div className="text-xs">
                      <span className="text-slate-500 font-semibold block mb-0.5">Diagnóstico:</span>
                      <p className="text-slate-700 bg-slate-50/70 p-2 rounded text-xs leading-relaxed">
                        {dnsReport.dmarc.diagnosis}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Caixa "Como Resolver" */}
                <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-amber-900 flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
                      Como Solucionar no DNS:
                    </span>
                    {dnsReport.dmarc.suggested_record && (
                      <button
                        onClick={() => copyToClipboard(dnsReport.dmarc.suggested_record!.value, 'dmarc-rec')}
                        className="text-[10px] text-amber-800 hover:text-amber-950 font-bold flex items-center gap-0.5"
                      >
                        {copiedKey === 'dmarc-rec' ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                        Copiar TXT
                      </button>
                    )}
                  </div>
                  <p className="text-slate-600 text-[11px] mb-2">{dnsReport.dmarc.solution}</p>
                  {dnsReport.dmarc.suggested_record && (
                    <div className="bg-white p-2 rounded border border-amber-200 font-mono text-[11px] text-slate-800 flex items-center justify-between">
                      <span><strong>TXT _dmarc:</strong> <code>{dnsReport.dmarc.suggested_record.value}</code></span>
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
        ) : (
          <div className="bg-slate-50 p-6 rounded-xl text-center text-xs text-slate-500 border border-slate-200">
            Insira o domínio e clique em <strong>Auditar DNS & Autenticação</strong> para visualizar os diagnósticos e instruções de resolução.
          </div>
        )}
      </div>

      {/* SEÇÃO 2: RASTREAMENTO DE JORNADA DE E-MAIL & FILA POSTFIX */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Rastreamento de Jornada de E-mail */}
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

        {/* Fila Postfix */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
            <div>
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <ListOrdered className="w-5 h-5 text-amber-600" /> Fila Postfix (postqueue -p)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Mensagens atualmente retidas na fila de transmissão
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleFlushQueue}
                className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
              >
                <Send className="w-3 h-3" /> Forçar Envio
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

          <div className="overflow-x-auto max-h-60 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[11px] font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="px-3 py-2">Queue ID</th>
                  <th className="px-3 py-2">Remetente</th>
                  <th className="px-3 py-2">Destinatário</th>
                  <th className="px-3 py-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-mono">
                {queue.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-emerald-600 font-sans text-xs">
                      <CheckCircle2 className="w-4 h-4 inline me-1" /> Fila limpa! Nenhuma mensagem retida.
                    </td>
                  </tr>
                ) : (
                  queue.map((q) => (
                    <tr key={q.queue_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3 py-2 font-bold text-slate-800">{q.queue_id}</td>
                      <td className="px-3 py-2 text-slate-700 truncate max-w-[120px]">{q.sender}</td>
                      <td className="px-3 py-2 text-slate-600 truncate max-w-[120px]">{q.recipients.join(', ')}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handleDeleteQueueItem(q.queue_id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="Deletar com postsuper -d"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

    </div>
  );
}
