import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Play,
  Save,
  HelpCircle,
  Code2,
  Sliders,
  Check,
  Search
} from 'lucide-react';
import { AdvancedAntispamRule, AdvancedRuleCondition, AdvancedRuleAction } from '../types';

interface AdvancedRuleModalProps {
  isOpen: boolean;
  ruleToEdit?: AdvancedAntispamRule | null;
  onClose: () => void;
  onSave: (rule: AdvancedAntispamRule) => Promise<boolean | void>;
  onTestRule: (rule: AdvancedAntispamRule) => void;
}

const FIELD_OPTIONS = [
  // Contexto & Origem
  { group: '🌐 Contexto & Origem', value: 'origin', label: 'Origem da Mensagem (Externa / Interna)' },
  { group: '🌐 Contexto & Origem', value: 'client_ip', label: 'IP do Cliente Conectado' },
  
  // Cabeçalhos
  { group: '✉️ Cabeçalhos', value: 'from', label: 'From (Remetente exibido / Header)' },
  { group: '✉️ Cabeçalhos', value: 'from_domain', label: 'Domínio do Remetente' },
  { group: '✉️ Cabeçalhos', value: 'envelope_from', label: 'Envelope-From (Return-Path)' },
  { group: '✉️ Cabeçalhos', value: 'to', label: 'To (Destinatário)' },
  { group: '✉️ Cabeçalhos', value: 'reply_to', label: 'Reply-To (Responder para)' },
  { group: '✉️ Cabeçalhos', value: 'subject', label: 'Subject (Assunto)' },
  { group: '✉️ Cabeçalhos', value: 'message_id', label: 'Message-ID' },
  { group: '✉️ Cabeçalhos', value: 'received', label: 'Received (Hop de transporte)' },
  { group: '✉️ Cabeçalhos', value: 'custom_header', label: 'Outro Cabeçalho Personalizado...' },

  // Conteúdo
  { group: '📄 Conteúdo', value: 'body', label: 'Corpo da Mensagem (Texto & HTML)' },
  { group: '📄 Conteúdo', value: 'uri', label: 'URIs / Links Encontrados' },
  { group: '📄 Conteúdo', value: 'attachments', label: 'Nome dos Arquivos Anexados' },
  { group: '📄 Conteúdo', value: 'content_type', label: 'Content-Type' },

  // Autenticação
  { group: '🛡️ Autenticação', value: 'spf', label: 'SPF (Status de Autenticação)' },
  { group: '🛡️ Autenticação', value: 'dkim', label: 'DKIM (Status de Assinatura)' },
  { group: '🛡️ Autenticação', value: 'dmarc', label: 'DMARC (Status de Alinhamento)' },
  { group: '🛡️ Autenticação', value: 'smtp_auth', label: 'Autenticado via SMTP AUTH' },

  // Reputação
  { group: '🌐 Reputação & Inteligência', value: 'dnsbl', label: 'Listagem em DNSBL' },
  { group: '🌐 Reputação & Inteligência', value: 'uribl', label: 'Listagem em URIBL' },
  { group: '🌐 Reputação & Inteligência', value: 'bayes', label: 'Probabilidade Bayesiana' },
  { group: '🌐 Reputação & Inteligência', value: 'sa_score', label: 'Score Base SpamAssassin' },
];

const OPERATOR_OPTIONS = [
  { value: 'contains', label: 'Contém' },
  { value: 'not_contains', label: 'Não contém' },
  { value: 'equals', label: 'É igual a' },
  { value: 'not_equals', label: 'É diferente de' },
  { value: 'regex', label: 'Expressão Regular (Regex)' },
  { value: 'not_regex', label: 'Não corresponde à Regex' },
  { value: 'starts_with', label: 'Começa com' },
  { value: 'ends_with', label: 'Termina com' },
  { value: 'exists', label: 'Está presente' },
  { value: 'not_exists', label: 'Está ausente' },
  { value: 'gt', label: 'Maior que (>)' },
  { value: 'gte', label: 'Maior ou igual a (>=)' },
  { value: 'lt', label: 'Menor que (<)' },
  { value: 'lte', label: 'Menor ou igual a (<=)' },
];

export const AdvancedRuleModal: React.FC<AdvancedRuleModalProps> = ({
  isOpen,
  ruleToEdit,
  onClose,
  onSave,
  onTestRule,
}) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND');
  const [conditions, setConditions] = useState<AdvancedRuleCondition[]>([]);
  const [actionType, setActionType] = useState<'add_score' | 'sub_score' | 'no_op'>('add_score');
  const [actionValue, setActionValue] = useState<number>(5.0);
  const [isActive, setIsActive] = useState(true);

  // Regex testing drawer
  const [activeRegexTestIndex, setActiveRegexTestIndex] = useState<number | null>(null);
  const [regexTestSample, setRegexTestSample] = useState('');
  const [regexTestResult, setRegexTestResult] = useState<{ matched: boolean; slice?: string; error?: string } | null>(null);

  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    if (ruleToEdit) {
      setName(ruleToEdit.name || '');
      setCode(ruleToEdit.code || '');
      setDescription(ruleToEdit.description || '');
      setLogic(ruleToEdit.logic || 'AND');
      setConditions(
        ruleToEdit.conditions && ruleToEdit.conditions.length > 0
          ? JSON.parse(JSON.stringify(ruleToEdit.conditions))
          : [createDefaultCondition()]
      );
      setActionType(ruleToEdit.action?.type || 'add_score');
      setActionValue(typeof ruleToEdit.action?.value === 'number' ? ruleToEdit.action.value : 5.0);
      setIsActive(ruleToEdit.is_active !== false);
    } else {
      setName('');
      setCode('');
      setDescription('');
      setLogic('AND');
      setConditions([
        {
          id: 'c_1',
          field: 'origin',
          operator: 'equals',
          value: 'external',
          negate: false,
        },
        {
          id: 'c_2',
          field: 'from',
          operator: 'regex',
          value: '@([a-z0-9-]*[0-9][a-z0-9-]*[a-z]|[a-z0-9-]*[a-z][a-z0-9-]*[0-9])[a-z0-9-]*\\.',
          negate: false,
        },
      ]);
      setActionType('add_score');
      setActionValue(3.0);
      setIsActive(true);
    }
    setValidationErrors([]);
    setActiveRegexTestIndex(null);
  }, [ruleToEdit, isOpen]);

  if (!isOpen) return null;

  function createDefaultCondition(): AdvancedRuleCondition {
    return {
      id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      field: 'subject',
      operator: 'contains',
      value: '',
      negate: false,
    };
  }

  const handleAddCondition = () => {
    setConditions([...conditions, createDefaultCondition()]);
  };

  const handleRemoveCondition = (index: number) => {
    if (conditions.length <= 1) {
      alert('A regra deve conter pelo menos uma condição.');
      return;
    }
    const updated = conditions.filter((_, i) => i !== index);
    setConditions(updated);
    if (activeRegexTestIndex === index) {
      setActiveRegexTestIndex(null);
    }
  };

  const handleUpdateCondition = (index: number, updates: Partial<AdvancedRuleCondition>) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], ...updates };

    // Se o campo mudou para origin, ajusta operador/valor padrão
    if (updates.field === 'origin' && !updates.value) {
      updated[index].operator = 'equals';
      updated[index].value = 'external';
    } else if (updates.field === 'smtp_auth' && !updates.value) {
      updated[index].operator = 'equals';
      updated[index].value = 'yes';
    } else if (updates.field === 'spf' && !updates.value) {
      updated[index].operator = 'equals';
      updated[index].value = 'FAIL';
    }

    setConditions(updated);
  };

  // Auto-generate code from name if empty
  const handleNameChange = (val: string) => {
    setName(val);
    if (!ruleToEdit && (!code || code.startsWith('LOCAL_ADV_'))) {
      const generated = 'LOCAL_ADV_' + val
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 45);
      setCode(generated);
    }
  };

  // Test Regex quickly via server endpoint
  const handleTestRegex = async (pattern: string, testValue: string) => {
    try {
      const res = await fetch('/api/antispam/advanced-rules/test-regex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern, test_value: testValue }),
      });
      const data = await res.json();
      if (data.success) {
        setRegexTestResult({
          matched: data.matched,
          slice: data.match_slice,
        });
      } else {
        setRegexTestResult({
          matched: false,
          error: data.error || data.message || 'Padrão regex inválido',
        });
      }
    } catch (e: any) {
      setRegexTestResult({
        matched: false,
        error: e?.message || 'Falha de comunicação',
      });
    }
  };

  // Build natural language summary of the rule
  const buildRuleSummary = () => {
    const condSummaries = conditions.map((c) => {
      const fieldObj = FIELD_OPTIONS.find((f) => f.value === c.field);
      const fieldLabel = fieldObj ? fieldObj.label.split(' (')[0] : c.field;
      const opObj = OPERATOR_OPTIONS.find((o) => o.value === c.operator);
      const opLabel = opObj ? opObj.label.toLowerCase() : c.operator;
      const notPrefix = c.negate ? 'NÃO ' : '';

      let valText = `'${c.value}'`;
      if (c.field === 'origin') {
        valText = c.value === 'external' ? 'Externa (Internet)' : 'Interna (Rede Local / Autenticada)';
      } else if (c.operator === 'exists') {
        return `${notPrefix}estiver presente o campo ${fieldLabel}`;
      } else if (c.operator === 'not_exists') {
        return `${notPrefix}estiver ausente o campo ${fieldLabel}`;
      }

      return `${fieldLabel} ${notPrefix}${opLabel} ${valText}`;
    });

    const logicWord = logic === 'AND' ? ' E ' : ' OU ';
    const conditionsCombined = condSummaries.join(logicWord);

    let actionSummary = '';
    if (actionType === 'add_score') {
      actionSummary = `Adicionar +${Math.abs(actionValue).toFixed(1)} pontos ao Score SPAM`;
    } else if (actionType === 'sub_score') {
      actionSummary = `Subtrair -${Math.abs(actionValue).toFixed(1)} pontos (Bônus de Legitimidade)`;
    } else {
      actionSummary = `Registrar em auditoria sem alteração de pontuação (No-Op)`;
    }

    return `SE ${conditionsCombined} ENTÃO: ${actionSummary}.`;
  };

  const constructRuleObject = (): AdvancedAntispamRule => {
    return {
      id: ruleToEdit?.id || `rule_adv_${Date.now()}`,
      code: code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
      name: name.trim(),
      description: description.trim(),
      type: 'advanced',
      logic,
      conditions,
      action: {
        type: actionType,
        value: actionType === 'no_op' ? 0 : Math.abs(actionValue),
      },
      is_active: isActive,
      hits_count: ruleToEdit?.hits_count || 0,
      created_at: ruleToEdit?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  };

  const handleValidateAndSave = async () => {
    const errors: string[] = [];
    if (!name.trim()) errors.push('Informe o nome da regra.');
    if (!code.trim()) {
      errors.push('Informe o código identificador da regra (ex: LOCAL_ADV_REMETENTE_SUSPEITO).');
    } else if (!/^[A-Z0-9_]{3,60}$/.test(code.trim().toUpperCase())) {
      errors.push('O código deve conter apenas letras maiúsculas, números e sublinhados (3 a 60 caracteres).');
    }

    if (conditions.length === 0) {
      errors.push('A regra deve ter pelo menos uma condição.');
    } else {
      conditions.forEach((c, idx) => {
        if (!c.field) errors.push(`Condição #${idx + 1}: Selecione um campo.`);
        if (!c.operator) errors.push(`Condição #${idx + 1}: Selecione um operador.`);
        if (c.operator !== 'exists' && c.operator !== 'not_exists' && !c.value.trim()) {
          errors.push(`Condição #${idx + 1}: Preencha o valor esperado.`);
        }
      });
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors([]);
    setSaving(true);
    try {
      const ruleObj = constructRuleObject();
      await onSave(ruleObj);
      onClose();
    } catch (e: any) {
      setValidationErrors([e?.message || 'Erro ao salvar regra avançada.']);
    } finally {
      setSaving(false);
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
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  {ruleToEdit ? 'Editar Regra Avançada' : 'Nova Regra de Inteligência AntiSPAM'}
                </h3>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-indigo-900/80 text-indigo-200 border border-indigo-700/50">
                  Composta
                </span>
              </div>
              <p className="text-xs text-indigo-200/90 mt-0.5">
                Crie regras através de múltiplas condições lógicas, contexto de tráfego e cálculo de score
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

        {/* Form Body - Scrollable */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800">
          {/* Validation errors alert */}
          {validationErrors.length > 0 && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-800 text-xs">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block mb-1">Por favor corrija os seguintes itens:</strong>
                <ul className="list-disc list-inside space-y-0.5">
                  {validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* 1. Identificação da Regra */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600" />
              1. Identificação da Regra
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome da Regra <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Ex: Remetente externo suspeito com pendência no assunto"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Código da Regra (Identificador Único) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                  placeholder="LOCAL_ADV_REMETENTE_SUSPEITO"
                  className="w-full text-xs font-mono font-bold px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden uppercase text-indigo-900"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Utilizado no SpamAssassin e nos registros de auditoria do sistema.
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Descrição e Contexto da Regra
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explique detalhadamente por que esta regra existe, casos de uso e riscos de falsos positivos."
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden"
              />
            </div>
          </div>

          {/* 2. Seção QUANDO (Condições) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  2. QUANDO (Condições da Regra)
                </h4>
                <span className="text-[10px] bg-indigo-100 text-indigo-800 font-mono font-bold px-2 py-0.5 rounded-full">
                  {conditions.length} condição(ões)
                </span>
              </div>

              {/* Seletor Operador Lógico Global */}
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-300 text-xs">
                <span className="text-slate-600 font-medium">Lógica entre condições:</span>
                <button
                  type="button"
                  onClick={() => setLogic('AND')}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                    logic === 'AND'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  E (AND)
                </button>
                <button
                  type="button"
                  onClick={() => setLogic('OR')}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                    logic === 'OR'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  OU (OR)
                </button>
              </div>
            </div>

            {/* Lista de Condições */}
            <div className="space-y-3">
              {conditions.map((cond, idx) => (
                <div
                  key={cond.id || idx}
                  className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3 shadow-2xs hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        Condição #{idx + 1}
                      </span>
                      {idx > 0 && (
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          logic === 'AND' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {logic === 'AND' ? 'E (AND)' : 'OU (OR)'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Checkbox Inverter (NOT) */}
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={cond.negate}
                          onChange={(e) => handleUpdateCondition(idx, { negate: e.target.checked })}
                          className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                        />
                        <span className={`text-[11px] font-bold ${cond.negate ? 'text-rose-600' : 'text-slate-500'}`}>
                          NÃO (Inverter)
                        </span>
                      </label>

                      <button
                        type="button"
                        onClick={() => handleRemoveCondition(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors rounded hover:bg-rose-50"
                        title="Remover condição"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    {/* Campo */}
                    <div className="md:col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Campo / Contexto
                      </label>
                      <select
                        value={cond.field}
                        onChange={(e) => handleUpdateCondition(idx, { field: e.target.value as any })}
                        className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        {Array.from(new Set(FIELD_OPTIONS.map((f) => f.group))).map((grp) => (
                          <optgroup key={grp} label={grp}>
                            {FIELD_OPTIONS.filter((f) => f.group === grp).map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {/* Operador */}
                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Operador
                      </label>
                      <select
                        value={cond.operator}
                        onChange={(e) => handleUpdateCondition(idx, { operator: e.target.value as any })}
                        className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        {OPERATOR_OPTIONS.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Valor Esperado */}
                    <div className="md:col-span-5">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center justify-between">
                        <span>Valor / Expressão</span>
                        {cond.operator === 'regex' && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveRegexTestIndex(activeRegexTestIndex === idx ? null : idx);
                              setRegexTestSample('');
                              setRegexTestResult(null);
                            }}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 hover:underline"
                          >
                            <Code2 className="w-3 h-3" />
                            {activeRegexTestIndex === idx ? 'Fechar Testador' : 'Testar Regex'}
                          </button>
                        )}
                      </label>

                      {/* Inputs especializados dependendo do campo */}
                      {cond.field === 'origin' ? (
                        <select
                          value={cond.value}
                          onChange={(e) => handleUpdateCondition(idx, { value: e.target.value })}
                          className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-800"
                        >
                          <option value="external">Externa (Internet / Conexão não-confiável)</option>
                          <option value="internal">Interna (Rede Local / Autenticada / Confiável)</option>
                        </select>
                      ) : cond.field === 'smtp_auth' ? (
                        <select
                          value={cond.value}
                          onChange={(e) => handleUpdateCondition(idx, { value: e.target.value })}
                          className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-800"
                        >
                          <option value="yes">Sim (Autenticado)</option>
                          <option value="no">Não (Não autenticado)</option>
                        </select>
                      ) : cond.field === 'spf' || cond.field === 'dkim' || cond.field === 'dmarc' ? (
                        <select
                          value={cond.value}
                          onChange={(e) => handleUpdateCondition(idx, { value: e.target.value })}
                          className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-800 uppercase"
                        >
                          <option value="FAIL">FAIL (Falha de autenticação)</option>
                          <option value="SOFTFAIL">SOFTFAIL</option>
                          <option value="NONE">NONE (Sem registro)</option>
                          <option value="NEUTRAL">NEUTRAL</option>
                          <option value="PASS">PASS (Válido)</option>
                        </select>
                      ) : cond.operator === 'exists' || cond.operator === 'not_exists' ? (
                        <div className="text-xs text-slate-500 italic py-1.5">
                          (Não requer valor — valida presença do cabeçalho)
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={cond.value}
                          onChange={(e) => handleUpdateCondition(idx, { value: e.target.value })}
                          placeholder={
                            cond.operator === 'regex'
                              ? '@[a-z0-9-]*[0-9][a-z0-9-]*[a-z]'
                              : 'Ex: pendência ou fatura'
                          }
                          className={`w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                            cond.operator === 'regex' ? 'font-mono text-indigo-950 font-medium' : ''
                          }`}
                        />
                      )}
                    </div>
                  </div>

                  {/* Testador Regex Inline */}
                  {cond.operator === 'regex' && activeRegexTestIndex === idx && (
                    <div className="mt-2 p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-2 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-indigo-900 flex items-center gap-1.5">
                          <Code2 className="w-3.5 h-3.5 text-indigo-600" />
                          Testador Rápido de Expressão Regular (Regex)
                        </span>
                        <span className="text-[10px] font-mono text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200">
                          Padrão: {cond.value || '(vazio)'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={regexTestSample}
                          onChange={(e) => setRegexTestSample(e.target.value)}
                          placeholder="Digite um texto de teste (ex: remetente@2f1ab419.apriori.net.br)..."
                          className="flex-1 text-xs px-2.5 py-1.5 bg-white border border-indigo-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleTestRegex(cond.value, regexTestSample)}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-md transition-colors"
                        >
                          Executar Teste
                        </button>
                      </div>

                      {regexTestResult && (
                        <div className={`p-2 rounded-md text-xs font-mono flex items-center justify-between ${
                          regexTestResult.matched 
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : 'bg-rose-100 text-rose-900 border border-rose-300'
                        }`}>
                          <div className="flex items-center gap-2">
                            {regexTestResult.matched ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-rose-600" />
                            )}
                            <span>
                              {regexTestResult.matched ? 'MATCH CONFIRMADO' : 'NÃO CORRESPONDEU (NÃO MATCH)'}
                            </span>
                          </div>
                          {regexTestResult.slice && (
                            <span className="text-[11px] bg-white/70 px-2 py-0.5 rounded text-slate-800">
                              Captura: <strong>{regexTestResult.slice}</strong>
                            </span>
                          )}
                          {regexTestResult.error && (
                            <span className="text-[11px] text-rose-700">
                              {regexTestResult.error}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Botão Adicionar Condição */}
            <button
              type="button"
              onClick={handleAddCondition}
              className="w-full py-2.5 border-2 border-dashed border-indigo-300 hover:border-indigo-500 bg-white hover:bg-indigo-50/50 rounded-xl text-xs font-bold text-indigo-700 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              + ADICIONAR CONDIÇÃO
            </button>
          </div>

          {/* 3. Seção ENTÃO (Ação & Pontuação) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              3. ENTÃO (Ação e Pontuação da Regra)
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Tipo de Ação */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ação ao Disparar
                </label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as any)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold"
                >
                  <option value="add_score">Adicionar Pontuação (+ SPAM Score)</option>
                  <option value="sub_score">Reduzir Pontuação (- Bônus de Legitimidade)</option>
                  <option value="no_op">Apenas Auditoria (No-Op)</option>
                </select>
              </div>

              {/* Valor do Score */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pontuação (Score)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    disabled={actionType === 'no_op'}
                    value={actionValue}
                    onChange={(e) => setActionValue(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs font-mono font-bold px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                  />
                  <span className="text-xs font-bold text-slate-500 shrink-0">pontos</span>
                </div>
              </div>

              {/* Status Ativa / Inativa */}
              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2.5 p-2 bg-white rounded-lg border border-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Regra Ativa no Mecanismo
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {isActive ? 'Avaliando em tempo real' : 'Pausada temporariamente'}
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* 4. Resumo em Linguagem Humana (Seção 11 do prompt) */}
          <div className="bg-gradient-to-br from-indigo-50/80 via-white to-slate-50 border border-indigo-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-indigo-950 font-bold text-xs">
              <Code2 className="w-4 h-4 text-indigo-600" />
              <span>Resumo Legível da Regra Composta:</span>
            </div>
            <p className="text-xs font-mono text-indigo-900 bg-white p-3 rounded-lg border border-indigo-100 leading-relaxed shadow-2xs">
              {buildRuleSummary()}
            </p>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onTestRule(constructRuleObject())}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors border border-slate-300"
          >
            <Play className="w-4 h-4 text-indigo-600" />
            Testar Regra com Amostra
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleValidateAndSave}
              disabled={saving}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Gravando...' : 'Salvar Regra'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
