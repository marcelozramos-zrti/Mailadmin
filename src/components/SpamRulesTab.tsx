import React, { useState, useEffect } from 'react';
import { Shield, CheckCircle, AlertTriangle, Save, RefreshCw, Code2, PlusCircle, FileText, Check } from 'lucide-react';
import { LintResponse } from '../types';

interface SpamRulesTabProps {
  onShowAlert: (msg: string, type: 'success' | 'danger') => void;
  onRefreshStatus: () => void;
}

export const SpamRulesTab: React.FC<SpamRulesTabProps> = ({ onShowAlert, onRefreshStatus }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [testingSyntax, setTestingSyntax] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [lintResult, setLintResult] = useState<LintResponse | null>(null);

  const fetchRules = async () => {
    setLoading(true);
    setLintResult(null);
    try {
      const res = await fetch('/api/spamassassin/rules');
      const data = await res.json();
      if (data.success) {
        setContent(data.content);
      } else {
        onShowAlert(data.message || 'Não foi possível carregar o local.cf', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro ao carregar regras: ' + err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleTestSyntax = async () => {
    setTestingSyntax(true);
    setLintResult(null);
    try {
      const res = await fetch('/api/spamassassin/lint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      setLintResult(data);
    } catch (err: any) {
      setLintResult({
        success: false,
        message: 'Erro de comunicação ao testar sintaxe: ' + err.message
      });
    } finally {
      setTestingSyntax(false);
    }
  };

  const handleSaveRules = async () => {
    if (!window.confirm("Deseja realmente salvar as alterações no '/etc/spamassassin/local.cf' e reiniciar o serviço Amavis?")) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/spamassassin/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        onRefreshStatus();
      } else {
        onShowAlert(data.message || 'Falha ao salvar arquivo.', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro ao salvar regras: ' + err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const appendSnippet = (snippet: string) => {
    setContent((prev) => prev.trim() + '\n\n' + snippet + '\n');
    setLintResult(null);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="w-6 h-6 text-amber-500" />
            <span>Gestão de Regras SpamAssassin</span>
            <span className="bg-amber-50 text-amber-700 text-xs px-2.5 py-1 rounded-full border border-amber-200 font-mono">
              /etc/spamassassin/local.cf
            </span>
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Edite e ajuste os parâmetros heurísticos, Bayes, pontuações de regras, whitelists e blacklists.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchRules}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors border border-slate-300"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Recarregar</span>
          </button>
        </div>
      </div>

      {/* Preset Rules Bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-2">
          Inserir Atalhos de Regras Rápidas:
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => appendSnippet('whitelist_from *@dominio-confiavel.com.br')}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-slate-300 hover:bg-emerald-50 hover:border-emerald-300 text-slate-700 hover:text-emerald-700 rounded-lg transition-colors font-medium shadow-xs"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>+ Whitelist Domínio</span>
          </button>

          <button
            onClick={() => appendSnippet('blacklist_from *@spammer-fraude.xyz')}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-slate-300 hover:bg-rose-50 hover:border-rose-300 text-slate-700 hover:text-rose-700 rounded-lg transition-colors font-medium shadow-xs"
          >
            <PlusCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>+ Blacklist Domínio</span>
          </button>

          <button
            onClick={() => appendSnippet('required_score 4.5')}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-slate-300 hover:bg-blue-50 hover:border-blue-300 text-slate-700 hover:text-blue-700 rounded-lg transition-colors font-medium shadow-xs"
          >
            <PlusCircle className="w-3.5 h-3.5 text-blue-600" />
            <span>+ Ajustar required_score (4.5)</span>
          </button>

          <button
            onClick={() => appendSnippet('score BAYES_99 5.0\nscore BAYES_80 3.5')}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-slate-300 hover:bg-amber-50 hover:border-amber-300 text-slate-700 hover:text-amber-700 rounded-lg transition-colors font-medium shadow-xs"
          >
            <PlusCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>+ Pontuação Bayes Extra</span>
          </button>

          <button
            onClick={() => appendSnippet('header LOCAL_SUBJECT_URGENT Subject =~ /urgente/i\nscore LOCAL_SUBJECT_URGENT 2.0')}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-slate-300 hover:bg-purple-50 hover:border-purple-300 text-slate-700 hover:text-purple-700 rounded-lg transition-colors font-medium shadow-xs"
          >
            <PlusCircle className="w-3.5 h-3.5 text-purple-600" />
            <span>+ Regra de Cabeçalho (Header)</span>
          </button>
        </div>
      </div>

      {/* Main Textarea Container */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-md">
        
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-amber-400" />
            <span className="text-sm font-semibold text-slate-200">Editor de Código: /etc/spamassassin/local.cf</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {content.split('\n').length} linhas
          </span>
        </div>

        <div className="p-4">
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setLintResult(null);
            }}
            rows={18}
            className="w-full bg-slate-900 text-emerald-400 font-mono text-sm leading-relaxed p-4 border border-slate-800 rounded-lg focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 transition-all resize-y"
            placeholder="# Digite ou cole aqui o conteúdo do arquivo local.cf..."
          />
        </div>

        {/* Syntax Test Result Alert Box */}
        {lintResult && (
          <div className="px-4 pb-4">
            {lintResult.success ? (
              <div className="p-4 bg-emerald-950/80 border border-emerald-500/40 rounded-lg text-emerald-200 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm text-emerald-300">Sintaxe OK!</h4>
                  <p className="text-xs text-emerald-200/90 mt-0.5">{lintResult.message}</p>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-rose-950/80 border border-rose-500/40 rounded-lg text-rose-200 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="w-full">
                  <h4 className="font-bold text-sm text-rose-300">Erro de Sintaxe Detectado (spamassassin --lint)</h4>
                  <pre className="text-xs font-mono bg-slate-950 p-3 rounded mt-2 text-rose-200 overflow-x-auto border border-rose-900/50 whitespace-pre-wrap">
                    {lintResult.message}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <button
            onClick={handleTestSyntax}
            disabled={testingSyntax || loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 rounded-lg text-sm font-semibold transition-colors"
          >
            <Check className={`w-4 h-4 text-blue-400 ${testingSyntax ? 'animate-spin' : ''}`} />
            <span>Testar Sintaxe (spamassassin --lint)</span>
          </button>

          <button
            onClick={handleSaveRules}
            disabled={saving || loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-emerald-950/40"
          >
            <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            <span>Salvar Regras e Reiniciar Amavis</span>
          </button>
        </div>

      </div>

    </div>
  );
};
