import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  CheckCircle, 
  AlertTriangle, 
  Save, 
  RefreshCw, 
  Code2, 
  PlusCircle, 
  Check, 
  ListFilter, 
  Search, 
  Pencil, 
  Trash2, 
  ShieldAlert, 
  ShieldCheck, 
  X,
  Layers
} from 'lucide-react';
import { LintResponse, VisualSpamRule } from '../types';

interface SpamRulesTabProps {
  onShowAlert: (msg: string, type: 'success' | 'danger') => void;
  onRefreshStatus: () => void;
}

export const SpamRulesTab: React.FC<SpamRulesTabProps> = ({ onShowAlert, onRefreshStatus }) => {
  // Main view mode: 'visual' | 'raw'
  const [activeView, setActiveView] = useState<'visual' | 'raw'>('visual');
  
  // Category filter: 'all' | 'blacklist_from' | 'spam_from' | 'whitelist_from'
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'blacklist_from' | 'spam_from' | 'whitelist_from'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Visual rules state
  const [visualRules, setVisualRules] = useState<VisualSpamRule[]>([]);
  const [loadingVisual, setLoadingVisual] = useState<boolean>(true);
  const [newAction, setNewAction] = useState<'blacklist_from' | 'spam_from' | 'whitelist_from'>('blacklist_from');
  const [newValue, setNewValue] = useState<string>('');
  const [addingRule, setAddingRule] = useState<boolean>(false);

  // Edit Modal state
  const [editingRule, setEditingRule] = useState<VisualSpamRule | null>(null);
  const [editAction, setEditAction] = useState<'blacklist_from' | 'spam_from' | 'whitelist_from'>('blacklist_from');
  const [editValue, setEditValue] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  // Raw editor state
  const [content, setContent] = useState<string>('');
  const [loadingRaw, setLoadingRaw] = useState<boolean>(true);
  const [testingSyntax, setTestingSyntax] = useState<boolean>(false);
  const [savingRaw, setSavingRaw] = useState<boolean>(false);
  const [lintResult, setLintResult] = useState<LintResponse | null>(null);

  // Fetch visual rules
  const fetchVisualRules = async () => {
    setLoadingVisual(true);
    try {
      const res = await fetch('/api/services/spamassassin/visual-rules');
      const data = await res.json();
      if (data.success && Array.isArray(data.rules)) {
        setVisualRules(data.rules);
      } else {
        setVisualRules([]);
      }
    } catch (err: any) {
      onShowAlert('Erro ao carregar regras visuais: ' + err.message, 'danger');
    } finally {
      setLoadingVisual(false);
    }
  };

  // Fetch raw content
  const fetchRawRules = async () => {
    setLoadingRaw(true);
    setLintResult(null);
    try {
      const res = await fetch('/api/services/spamassassin/rules');
      const data = await res.json();
      if (data.content !== undefined) {
        setContent(data.content);
      } else if (data.success && data.content) {
        setContent(data.content);
      } else {
        onShowAlert(data.message || 'Não foi possível carregar o local.cf', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro ao carregar regras raw: ' + err.message, 'danger');
    } finally {
      setLoadingRaw(false);
    }
  };

  const refreshAll = () => {
    fetchVisualRules();
    fetchRawRules();
  };

  useEffect(() => {
    refreshAll();
  }, []);

  // Add rule handler
  const handleAddVisualRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newValue.trim()) return;

    setAddingRule(true);
    try {
      const res = await fetch('/api/services/spamassassin/visual-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: newAction, value: newValue.trim() })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message || 'Regra adicionada com sucesso!', 'success');
        setNewValue('');
        fetchVisualRules();
        fetchRawRules();
      } else {
        onShowAlert(data.message || 'Erro ao adicionar regra.', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro ao adicionar regra: ' + err.message, 'danger');
    } finally {
      setAddingRule(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (rule: VisualSpamRule) => {
    setEditingRule(rule);
    setEditAction(rule.type);
    setEditValue(rule.value);
  };

  // Save Edit Rule
  const handleSaveEditRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule || !editValue.trim()) return;

    setSavingEdit(true);
    try {
      const res = await fetch('/api/services/spamassassin/visual-rules/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_raw: editingRule.raw,
          new_action: editAction,
          new_value: editValue.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message || 'Regra atualizada com sucesso!', 'success');
        setEditingRule(null);
        fetchVisualRules();
        fetchRawRules();
      } else {
        onShowAlert(data.message || 'Erro ao atualizar regra.', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro ao atualizar regra: ' + err.message, 'danger');
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete Visual Rule
  const handleDeleteVisualRule = async (rule: VisualSpamRule) => {
    if (!window.confirm(`Deseja realmente remover a regra "${rule.raw}"?`)) {
      return;
    }

    try {
      const res = await fetch('/api/services/spamassassin/visual-rules/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: rule.raw })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message || 'Regra removida com sucesso!', 'success');
        fetchVisualRules();
        fetchRawRules();
      } else {
        onShowAlert(data.message || 'Erro ao remover regra.', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro ao remover regra: ' + err.message, 'danger');
    }
  };

  // Test Raw Syntax
  const handleTestSyntax = async () => {
    setTestingSyntax(true);
    setLintResult(null);
    try {
      const res = await fetch('/api/services/spamassassin/lint', {
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

  // Save Raw Rules
  const handleSaveRawRules = async () => {
    if (!window.confirm("Deseja realmente salvar as alterações no '/etc/spamassassin/local.cf' e reiniciar o serviço SpamAssassin?")) {
      return;
    }

    setSavingRaw(true);
    try {
      const res = await fetch('/api/services/spamassassin/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message || 'Regras salvas com sucesso!', 'success');
        onRefreshStatus();
        fetchVisualRules();
      } else {
        onShowAlert(data.message || 'Falha ao salvar arquivo.', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro ao salvar regras: ' + err.message, 'danger');
    } finally {
      setSavingRaw(false);
    }
  };

  // Quick Snippets
  const appendSnippet = (snippet: string) => {
    setContent((prev) => prev.trim() + '\n\n' + snippet + '\n');
    setLintResult(null);
  };

  // Filtered visual rules calculations
  const countAll = visualRules.length;
  const countBlacklist = visualRules.filter(r => r.type === 'blacklist_from').length;
  const countSpam = visualRules.filter(r => r.type === 'spam_from').length;
  const countWhitelist = visualRules.filter(r => r.type === 'whitelist_from').length;

  const filteredRules = visualRules.filter(r => {
    if (categoryFilter !== 'all' && r.type !== categoryFilter) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      return (
        r.value.toLowerCase().includes(term) ||
        r.raw.toLowerCase().includes(term) ||
        r.action_label.toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="w-6 h-6 text-amber-500" />
            <span>Gestão de Regras Antispam (SpamAssassin)</span>
            <span className="bg-amber-50 text-amber-700 text-xs px-2.5 py-1 rounded-full border border-amber-200 font-mono">
              /etc/spamassassin/local.cf
            </span>
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Controle listas de bloqueio, regras de SPAM, whitelists confiáveis e edição avançada de sintaxe.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshAll}
            disabled={loadingVisual || loadingRaw}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors border border-slate-300 shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${loadingVisual || loadingRaw ? 'animate-spin' : ''}`} />
            <span>Recarregar</span>
          </button>
        </div>
      </div>

      {/* Main View Tabs (Visual vs Raw) */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveView('visual')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeView === 'visual'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <ListFilter className="w-4 h-4" />
          <span>Gestão Visual (Listas de Acesso)</span>
        </button>

        <button
          onClick={() => setActiveView('raw')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeView === 'raw'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Code2 className="w-4 h-4 text-slate-500" />
          <span>Modo Avançado (Editor raw)</span>
        </button>
      </div>

      {/* TAB 1: GESTÃO VISUAL */}
      {activeView === 'visual' && (
        <div className="space-y-6">
          
          {/* Add Rule Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
              <PlusCircle className="w-4 h-4 text-blue-600" />
              <span>Adicionar Nova Regra Antispam</span>
            </h3>
            
            <form onSubmit={handleAddVisualRule} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Tipo / Ação
                </label>
                <select
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value as any)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <option value="blacklist_from">🚫 Bloquear (Blacklist)</option>
                  <option value="spam_from">⚠️ Marcar como SPAM</option>
                  <option value="whitelist_from">✅ Liberar (White List)</option>
                </select>
              </div>

              <div className="md:col-span-5">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Endereço ou Domínio Alvo
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="Ex: *@spammer.com, baduser@domain.com ou IP"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <button
                  type="submit"
                  disabled={addingRule || !newValue.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded-lg transition-colors shadow-xs disabled:opacity-50"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>{addingRule ? 'Salvando...' : 'Adicionar Regra'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Sub-Tabs: 3 Categories + Search */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            
            {/* 3 Tabs / Filter Pills */}
            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  categoryFilter === 'all'
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span>Todas</span>
                <span className="ml-1 bg-slate-200 text-slate-700 text-[10px] px-1.5 py-0.5 rounded-full font-mono">
                  {countAll}
                </span>
              </button>

              <button
                onClick={() => setCategoryFilter('blacklist_from')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  categoryFilter === 'blacklist_from'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Bloqueados</span>
                <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-mono ${categoryFilter === 'blacklist_from' ? 'bg-rose-700 text-white' : 'bg-rose-100 text-rose-800'}`}>
                  {countBlacklist}
                </span>
              </button>

              <button
                onClick={() => setCategoryFilter('spam_from')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  categoryFilter === 'spam_from'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'text-amber-800 hover:bg-amber-50'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>SPAM</span>
                <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-mono ${categoryFilter === 'spam_from' ? 'bg-amber-600 text-slate-950 font-bold' : 'bg-amber-100 text-amber-900'}`}>
                  {countSpam}
                </span>
              </button>

              <button
                onClick={() => setCategoryFilter('whitelist_from')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  categoryFilter === 'whitelist_from'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>White List</span>
                <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-mono ${categoryFilter === 'whitelist_from' ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                  {countWhitelist}
                </span>
              </button>
            </div>

            {/* Live Search Input */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por endereço ou domínio..."
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

          </div>

          {/* Rules Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="py-3 px-4 w-48">Tipo / Ação</th>
                    <th className="py-3 px-4">Endereço ou Domínio Alvo</th>
                    <th className="py-3 px-4">Sintaxe no local.cf</th>
                    <th className="py-3 px-4 text-center w-28">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingVisual ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400 font-mono text-xs">
                        Carregando regras antispam...
                      </td>
                    </tr>
                  ) : filteredRules.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500 text-sm">
                        {categoryFilter === 'blacklist_from'
                          ? 'Nenhum domínio ou e-mail Bloqueado (Blacklist) cadastrado.'
                          : categoryFilter === 'spam_from'
                          ? 'Nenhum domínio ou e-mail classificado como SPAM cadastrado.'
                          : categoryFilter === 'whitelist_from'
                          ? 'Nenhum domínio ou e-mail em White List cadastrado.'
                          : 'Nenhuma regra encontrada.'}
                      </td>
                    </tr>
                  ) : (
                    filteredRules.map((rule, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          {rule.type === 'blacklist_from' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                              <span>Bloqueado (Blacklist)</span>
                            </span>
                          ) : rule.type === 'spam_from' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                              <span>SPAM</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                              <span>White List (Liberado)</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <code className="text-slate-900 font-bold font-mono text-sm">
                            {rule.value}
                          </code>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">
                          {rule.raw}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex items-center gap-1">
                            {/* Pencil / Edit Button */}
                            <button
                              onClick={() => openEditModal(rule)}
                              title="Editar Regra / Alterar Tipo"
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>

                            {/* Trash / Delete Button */}
                            <button
                              onClick={() => handleDeleteVisualRule(rule)}
                              title="Remover Regra"
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* TAB 2: MODO AVANÇADO (RAW EDITOR) */}
      {activeView === 'raw' && (
        <div className="space-y-6">
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
                onClick={() => appendSnippet('spam_from *@dominio-suspeito.xyz')}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-slate-300 hover:bg-amber-50 hover:border-amber-300 text-slate-700 hover:text-amber-800 rounded-lg transition-colors font-medium shadow-xs"
              >
                <PlusCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>+ Marcar como SPAM</span>
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
                disabled={testingSyntax || loadingRaw}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 rounded-lg text-sm font-semibold transition-colors"
              >
                <Check className={`w-4 h-4 text-blue-400 ${testingSyntax ? 'animate-spin' : ''}`} />
                <span>Testar Sintaxe (spamassassin --lint)</span>
              </button>

              <button
                onClick={handleSaveRawRules}
                disabled={savingRaw || loadingRaw}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-all shadow-md shadow-emerald-950/40"
              >
                <Save className={`w-4 h-4 ${savingRaw ? 'animate-spin' : ''}`} />
                <span>Salvar Regras e Reiniciar Amavis</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* EDIT RULE MODAL */}
      {editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-150">
            
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Pencil className="w-4 h-4 text-blue-600" />
                <span>Editar Regra Antispam</span>
              </h3>
              <button
                onClick={() => setEditingRule(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditRule} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Tipo / Ação
                </label>
                <select
                  value={editAction}
                  onChange={(e) => setEditAction(e.target.value as any)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="blacklist_from">🚫 Bloquear (Blacklist)</option>
                  <option value="spam_from">⚠️ Marcar como SPAM</option>
                  <option value="whitelist_from">✅ Liberar (White List)</option>
                </select>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Altere a classificação entre Bloqueado, SPAM ou White List.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Endereço ou Domínio Alvo
                </label>
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingRule(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || !editValue.trim()}
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors shadow-xs disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{savingEdit ? 'Salvando...' : 'Salvar Alterações'}</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
