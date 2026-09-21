import React, { useState } from 'react';
import {
  X,
  Play,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  RotateCcw,
  Layers,
  ArrowRight,
  Info
} from 'lucide-react';
import { AdvancedAntispamRule } from '../types';

interface AdvancedRuleTestModalProps {
  isOpen: boolean;
  rule: AdvancedAntispamRule | null;
  onClose: () => void;
}

const TEST_SCENARIOS = [
  {
    name: '🎯 Phishing PROCON (Origem Externa + Subdomínio Hex + Pendência)',
    origin: 'external',
    client_ip: '185.220.101.5',
    from: '"PROCON — Central de Atendimento" <juliapereira@2f1ab419.apriori.net.br>',
    to: 'usuario@empresa.com.br',
    subject: 'Notificação Urgente: Consta pendência formal no PROCON',
    body: 'Prezado consumidor, identificamos uma pendência formal em seu CPF. Acesse imediatamente: https://2f1ab419.apriori.net.br/procon',
    spf: 'FAIL',
    dkim: 'NONE',
    dmarc: 'NONE',
    smtp_auth: false,
  },
  {
    name: '🏢 Tráfego Interno Confiável (Servidor Local / TI)',
    origin: 'internal',
    client_ip: '127.0.0.1',
    from: 'suporte@empresa.com.br',
    to: 'diretoria@empresa.com.br',
    subject: 'Relatório diário de infraestrutura e pendência de backup',
    body: 'Relatório de execução das rotinas locais de contingência.',
    spf: 'PASS',
    dkim: 'PASS',
    dmarc: 'PASS',
    smtp_auth: true,
  },
  {
    name: '🌐 Remetente Externo em Domínio Raiz Padrão (.com.br)',
    origin: 'external',
    client_ip: '200.189.112.45',
    from: '"Parceiro Comercial" <contato@fornecedor.com.br>',
    to: 'compras@empresa.com.br',
    subject: 'Catálogo de produtos e serviços para empresas',
    body: 'Segue catálogo anexo para cotação de novos equipamentos.',
    spf: 'PASS',
    dkim: 'PASS',
    dmarc: 'PASS',
    smtp_auth: false,
  },
  {
    name: '⚠️ Remetente Externo em Subdomínio (.financeiro.empresa.com.br)',
    origin: 'external',
    client_ip: '198.51.100.22',
    from: 'cobranca@financeiro.empresa.com.br',
    to: 'financeiro@empresa.com.br',
    subject: 'Fatura e segunda via de boleto bancário',
    body: 'Prezados, segue segunda via da fatura para quitação.',
    spf: 'NONE',
    dkim: 'NONE',
    dmarc: 'NONE',
    smtp_auth: false,
  },
];

export const AdvancedRuleTestModal: React.FC<AdvancedRuleTestModalProps> = ({
  isOpen,
  rule,
  onClose,
}) => {
  if (!isOpen || !rule) return null;

  const [origin, setOrigin] = useState<string>('external');
  const [clientIp, setClientIp] = useState<string>('185.220.101.5');
  const [from, setFrom] = useState<string>('"PROCON" <juliapereira@2f1ab419.apriori.net.br>');
  const [to, setTo] = useState<string>('usuario@empresa.com.br');
  const [subject, setSubject] = useState<string>('Notificação Urgente: Consta pendência formal');
  const [body, setBody] = useState<string>('Prezado consumidor, regularize sua pendência: https://2f1ab419.apriori.net.br/notificacao');
  const [spf, setSpf] = useState<string>('FAIL');
  const [dkim, setDkim] = useState<string>('NONE');
  const [dmarc, setDmarc] = useState<string>('NONE');
  const [smtpAuth, setSmtpAuth] = useState<boolean>(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const applyScenario = (sc: typeof TEST_SCENARIOS[0]) => {
    setOrigin(sc.origin);
    setClientIp(sc.client_ip);
    setFrom(sc.from);
    setTo(sc.to);
    setSubject(sc.subject);
    setBody(sc.body);
    setSpf(sc.spf);
    setDkim(sc.dkim);
    setDmarc(sc.dmarc);
    setSmtpAuth(sc.smtp_auth);
    setTestResult(null);
  };

  const handleRunTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const payload = {
        rule,
        sample_data: {
          origin,
          client_ip: clientIp,
          from,
          to,
          subject,
          body,
          spf,
          dkim,
          dmarc,
          smtp_auth: smtpAuth,
        },
      };

      const res = await fetch('/api/antispam/advanced-rules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setTestResult(data.evaluation);
      } else {
        alert(data.message || 'Erro ao executar teste da regra.');
      }
    } catch (e: any) {
      alert(e?.message || 'Falha ao conectar com o servidor.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden my-6 animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 text-white flex items-center justify-between border-b border-indigo-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Play className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Simulação & Teste de Regra Avançada
                </h3>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-indigo-900/80 text-indigo-200 border border-indigo-700/50">
                  {rule.code}
                </span>
              </div>
              <p className="text-xs text-indigo-200/90 mt-0.5">
                Avalie o comportamento da regra em condições controladas de tráfego antes de colocá-la em produção
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800">
          {/* Card Resumo da Regra Testada */}
          <div className="p-4 bg-indigo-50/50 border border-indigo-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-950">
                Regra em Teste: {rule.name}
              </span>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                Lógica: {rule.logic} ({rule.conditions?.length || 0} condições)
              </span>
            </div>
            <p className="text-xs text-indigo-900 leading-relaxed">
              {rule.description || 'Sem descrição cadastrada.'}
            </p>
          </div>

          {/* Cenários Pré-definidos */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Selecione um Cenário Pré-definido ou Personalize Abaixo:
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {TEST_SCENARIOS.map((sc, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => applyScenario(sc)}
                  className="text-left p-3 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/40 transition-all text-xs font-medium text-slate-700 hover:text-indigo-900 group shadow-2xs"
                >
                  <span className="font-bold block text-slate-900 group-hover:text-indigo-950">
                    {sc.name}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono mt-1 block truncate">
                    Origem: {sc.origin} | From: {sc.from}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Painel de Amostra de Dados */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              Parâmetros da Mensagem de Teste
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Origem do Tráfego
                </label>
                <select
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold"
                >
                  <option value="external">Externa (Internet / Não-confiável)</option>
                  <option value="internal">Interna (Rede Local / Autenticada)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  IP do Cliente Conectado
                </label>
                <input
                  type="text"
                  value={clientIp}
                  onChange={(e) => setClientIp(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Autenticação SMTP (AUTH)
                </label>
                <select
                  value={smtpAuth ? 'yes' : 'no'}
                  onChange={(e) => setSmtpAuth(e.target.value === 'yes')}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold"
                >
                  <option value="no">Não (Conexão externa anônima)</option>
                  <option value="yes">Sim (Usuário autenticado)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  From (Remetente exibido)
                </label>
                <input
                  type="text"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Subject (Assunto)
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Corpo da Mensagem (Texto & URLs)
              </label>
              <textarea
                rows={2}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Resultado da Avaliação */}
          {testResult && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Veredito Geral */}
              <div className={`p-4 rounded-xl border flex items-center justify-between ${
                testResult.triggered
                  ? 'bg-amber-50 border-amber-300 text-amber-950'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-950'
              }`}>
                <div className="flex items-center gap-3">
                  {testResult.triggered ? (
                    <ShieldAlert className="w-7 h-7 text-amber-600 shrink-0" />
                  ) : (
                    <ShieldCheck className="w-7 h-7 text-emerald-600 shrink-0" />
                  )}
                  <div>
                    <h4 className="text-sm font-bold">
                      {testResult.triggered ? 'REGRA ACIONADA (MATCH)' : 'REGRA NÃO ACIONADA (SEM MATCH)'}
                    </h4>
                    <p className="text-xs opacity-90 mt-0.5">
                      {testResult.summary}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-500 uppercase block font-semibold">Impacto</span>
                  <span className={`text-base font-mono font-black ${
                    testResult.score_produced > 0 ? 'text-rose-600' : 'text-slate-700'
                  }`}>
                    {testResult.score_produced > 0 ? `+${testResult.score_produced.toFixed(1)} pts` : '0.0 pts'}
                  </span>
                </div>
              </div>

              {/* Avaliação Detalhada por Condição */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-2xs">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <Info className="w-4 h-4 text-indigo-600" />
                  Detalhamento Condição por Condição:
                </h4>

                <div className="space-y-2">
                  {testResult.conditions_evaluated?.map((cEval: any, idx: number) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-4 ${
                        cEval.passed
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {cEval.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">
                              Condição #{idx + 1} ({cEval.field}):
                            </span>
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-white border border-slate-200">
                              {cEval.operator} '{cEval.expected_value}'
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-600 block mt-0.5">
                            {cEval.detail}
                          </span>
                        </div>
                      </div>

                      <span className={`text-[10px] font-bold font-mono px-2 py-1 rounded shrink-0 ${
                        cEval.passed ? 'bg-emerald-200 text-emerald-900' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {cEval.passed ? 'VERDADEIRO' : 'FALSO'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            Fechar
          </button>

          <button
            type="button"
            onClick={handleRunTest}
            disabled={testing}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Play className="w-4 h-4" />
            {testing ? 'Simulando...' : 'Executar Teste'}
          </button>
        </div>
      </div>
    </div>
  );
};
