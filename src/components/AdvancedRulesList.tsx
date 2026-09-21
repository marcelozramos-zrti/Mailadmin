import React, { useState } from 'react';
import {
  Sparkles,
  Search,
  Filter,
  Plus,
  Play,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Code2,
  Info,
  Sliders,
  Layers,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Terminal
} from 'lucide-react';
import { AdvancedAntispamRule } from '../types';

interface AdvancedRulesListProps {
  rules: AdvancedAntispamRule[];
  loading: boolean;
  onRefresh: () => void;
  onCreateNew: () => void;
  onEdit: (rule: AdvancedAntispamRule) => void;
  onDelete: (rule: AdvancedAntispamRule) => void;
  onToggleActive: (rule: AdvancedAntispamRule) => void;
  onTestRule: (rule: AdvancedAntispamRule) => void;
}

export const AdvancedRulesList: React.FC<AdvancedRulesListProps> = ({
  rules,
  loading,
  onRefresh,
  onCreateNew,
  onEdit,
  onDelete,
  onToggleActive,
  onTestRule,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [showSaConfigModal, setShowSaConfigModal] = useState(false);
  const [selectedRuleForSa, setSelectedRuleForSa] = useState<AdvancedAntispamRule | null>(null);

  const filteredRules = rules.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(searchTerm.toLowerCase()));

    if (filterStatus === 'active') return matchesSearch && r.is_active;
    if (filterStatus === 'inactive') return matchesSearch && !r.is_active;
    return matchesSearch;
  });

  const totalHits = rules.reduce((acc, r) => acc + (r.hits_count || 0), 0);
  const activeCount = rules.filter((r) => r.is_active).length;

  const generateSaPreview = (rule: AdvancedAntispamRule) => {
    const subRules: string[] = [];
    rule.conditions.forEach((c, idx) => {
      const subName = `__ADV_${rule.code}_${idx + 1}`;
      let pat = c.value;
      if (!pat.startsWith('/')) pat = `/${pat}/i`;

      if (c.field === 'origin') {
        if (c.value === 'external') {
          subRules.push(`header   ${subName} Received =~ /from\\s+[^\\s]+\\s+\\((?:\\[(?!(?:127\\.|10\\.|172\\.(?:1[6-9]|2[0-9]|3[01])\\.|192\\.168\\.))\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\])/i`);
        } else {
          subRules.push(`header   ${subName} Received =~ /from\\s+[^\\s]+\\s+\\((?:\\[(?:127\\.|10\\.|172\\.(?:1[6-9]|2[0-9]|3[01])\\.|192\\.168\\.)\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\])/i`);
        }
      } else if (c.field === 'from') {
        subRules.push(`header   ${subName} From =~ ${pat}`);
      } else if (c.field === 'subject') {
        subRules.push(`header   ${subName} Subject =~ ${pat}`);
      } else if (c.field === 'body') {
        subRules.push(`body     ${subName} =~ ${pat}`);
      } else if (c.field === 'uri') {
        subRules.push(`uri      ${subName} =~ ${pat}`);
      } else {
        subRules.push(`header   ${subName} ${c.field} =~ ${pat}`);
      }
    });

    const subNames = rule.conditions.map((c, i) => (c.negate ? `!__ADV_${rule.code}_${i + 1}` : `__ADV_${rule.code}_${i + 1}`));
    const joint = rule.logic === 'OR' ? ' || ' : ' && ';
    const metaExpr = subNames.length > 1 ? `(${subNames.join(joint)})` : subNames[0] || '1';
    const scoreVal = rule.action.type === 'sub_score' 
      ? (-Math.abs(rule.action.value)).toFixed(1)
      : (rule.action.type === 'no_op' ? '0.0' : (+Math.abs(rule.action.value)).toFixed(1));

    return [
      `# ==========================================================`,
      `# Regra Composta: ${rule.name}`,
      `# Código: ${rule.code} | Lógica: ${rule.logic}`,
      `# ==========================================================`,
      ...subRules,
      `meta     ${rule.code} ${metaExpr}`,
      `score    ${rule.code} ${scoreVal}`,
      `describe ${rule.code} ZRTI Adv - ${rule.name}`,
    ].join('\n');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Total de Regras</span>
            <Sparkles className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{rules.length}</span>
            <span className="text-xs text-slate-500">cadastradas</span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Regras Ativas</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600">{activeCount}</span>
            <span className="text-xs text-slate-500">em produção</span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Disparos (Hits)</span>
            <ShieldAlert className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-700">{totalHits}</span>
            <span className="text-xs text-slate-500">interceptações</span>
          </div>
        </div>

        <div className="p-4 bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-xl border border-indigo-800/60 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider text-indigo-300 uppercase">
                Arquitetura
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-800/80 text-indigo-200 border border-indigo-700/50">
                ZRTI Engine
              </span>
            </div>
            <p className="text-xs text-indigo-200 mt-1">
              Multi-condições, contexto de rede e meta-regras SpamAssassin.
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedRuleForSa(rules[0] || null);
              setShowSaConfigModal(true);
            }}
            className="mt-2 text-[11px] text-amber-300 hover:text-amber-200 font-bold flex items-center gap-1 hover:underline self-start"
          >
            <Terminal className="w-3.5 h-3.5" />
            Ver Compilação SpamAssassin
          </button>
        </div>
      </div>

      {/* Action Bar & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, código ou descrição da regra..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1 rounded font-semibold transition-colors ${
                filterStatus === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todas ({rules.length})
            </button>
            <button
              onClick={() => setFilterStatus('active')}
              className={`px-3 py-1 rounded font-semibold transition-colors ${
                filterStatus === 'active'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ativas ({activeCount})
            </button>
            <button
              onClick={() => setFilterStatus('inactive')}
              className={`px-3 py-1 rounded font-semibold transition-colors ${
                filterStatus === 'inactive'
                  ? 'bg-slate-700 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Inativas ({rules.length - activeCount})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-300 transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={onCreateNew}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs hover:shadow flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nova Regra Avançada
          </button>
        </div>
      </div>

      {/* Rules Cards List */}
      {filteredRules.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-8 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto border border-indigo-100">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">
              Nenhuma regra avançada encontrada
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {searchTerm || filterStatus !== 'all'
                ? 'Nenhuma regra corresponde aos filtros selecionados. Tente ajustar os termos de busca.'
                : 'Crie sua primeira regra de inteligência composta combinando contexto de tráfego, regex de remetente e palavras-chave de urgência.'}
            </p>
          </div>
          <button
            onClick={onCreateNew}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Criar Primeira Regra Avançada
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRules.map((rule) => {
            const isScoreAddition = rule.action.type === 'add_score';
            const scorePoints = Math.abs(rule.action.value || 0);

            return (
              <div
                key={rule.id || rule.code}
                className={`bg-white rounded-xl border transition-all shadow-2xs hover:shadow-md ${
                  rule.is_active
                    ? 'border-slate-200 hover:border-indigo-300'
                    : 'border-slate-200 opacity-70 bg-slate-50/50'
                }`}
              >
                <div className="p-5 space-y-4">
                  {/* Top Row: Code, Name, Badges & Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded bg-indigo-50 text-indigo-900 border border-indigo-200">
                          {rule.code}
                        </span>

                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          rule.logic === 'AND'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          Lógica: {rule.logic === 'AND' ? 'E (AND)' : 'OU (OR)'}
                        </span>

                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                          rule.is_active
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          {rule.is_active ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              Ativa
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3" />
                              Pausada
                            </>
                          )}
                        </span>

                        <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          Hits: <strong>{rule.hits_count || 0}</strong>
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-slate-900 pt-1">
                        {rule.name}
                      </h4>

                      {rule.description && (
                        <p className="text-xs text-slate-600 leading-relaxed pt-0.5">
                          {rule.description}
                        </p>
                      )}
                    </div>

                    {/* Right Side: Score Badge & Control Buttons */}
                    <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                      {/* Score Impact Badge */}
                      <div className={`px-3 py-1.5 rounded-lg font-mono font-black text-xs flex items-center gap-1.5 border ${
                        rule.action.type === 'no_op'
                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                          : isScoreAddition
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        <span>{isScoreAddition ? `+${scorePoints.toFixed(1)} pts` : rule.action.type === 'sub_score' ? `-${scorePoints.toFixed(1)} pts` : 'No-Op'}</span>
                      </div>

                      {/* Toggle Active Button */}
                      <button
                        onClick={() => onToggleActive(rule)}
                        className={`p-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                          rule.is_active
                            ? 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                            : 'text-slate-500 border-slate-300 hover:bg-slate-100'
                        }`}
                        title={rule.is_active ? 'Pausar regra' : 'Ativar regra'}
                      >
                        {rule.is_active ? 'Ativa' : 'Inativa'}
                      </button>

                      {/* Test Button */}
                      <button
                        onClick={() => onTestRule(rule)}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-colors"
                        title="Simular / Testar Regra"
                      >
                        <Play className="w-4 h-4" />
                      </button>

                      {/* View SpamAssassin Technical Syntax */}
                      <button
                        onClick={() => {
                          setSelectedRuleForSa(rule);
                          setShowSaConfigModal(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-colors"
                        title="Ver Configuração SpamAssassin (local.cf)"
                      >
                        <Terminal className="w-4 h-4" />
                      </button>

                      {/* Edit Button */}
                      <button
                        onClick={() => onEdit(rule)}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-colors"
                        title="Editar Regra"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => onDelete(rule)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors"
                        title="Excluir Regra"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Conditions Chips & Logic */}
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 mb-2">
                      <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Condições Avaliadas ({rule.conditions.length}):</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {rule.conditions.map((cond, idx) => {
                        const isNegated = !!cond.negate;
                        return (
                          <div
                            key={cond.id || idx}
                            className="flex items-center gap-1.5 p-1.5 px-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono"
                          >
                            <span className="font-bold text-slate-700">
                              {cond.field.toUpperCase()}
                            </span>
                            <span className="text-slate-400">
                              {isNegated ? 'NÃO ' : ''}{cond.operator}
                            </span>
                            <span className="font-bold text-indigo-950 bg-white px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[200px]" title={cond.value}>
                              {cond.value}
                            </span>

                            {idx < rule.conditions.length - 1 && (
                              <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                rule.logic === 'AND' ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {rule.logic}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Sintaxe SpamAssassin */}
      {showSaConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div 
            className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 p-4 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold">
                  Compilação Interna SpamAssassin (local.cf)
                </h3>
              </div>
              <button
                onClick={() => setShowSaConfigModal(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                O MailAdmin traduz as regras compostas visuais em diretivas nativas do SpamAssassin com sub-regras privadas e meta-expressões lógicas booleanas:
              </p>

              <pre className="p-4 bg-slate-950 text-emerald-400 font-mono text-xs rounded-xl overflow-x-auto border border-slate-800 leading-relaxed">
                {selectedRuleForSa
                  ? generateSaPreview(selectedRuleForSa)
                  : rules.map((r) => generateSaPreview(r)).join('\n\n')}
              </pre>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowSaConfigModal(false)}
                className="px-4 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg shadow-2xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
