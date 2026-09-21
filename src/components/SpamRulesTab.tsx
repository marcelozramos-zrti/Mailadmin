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
  Layers,
  Sparkles,
  Zap,
  Play,
  HelpCircle,
  FileCode,
  Tag,
  Hash,
  Database,
  Terminal,
  Copy,
  Sliders,
  CheckCheck,
  AlertCircle,
  FileText
} from 'lucide-react';
import { LintResponse, VisualSpamRule, CustomRegexRule, RegexRuleTestResult, AdvancedAntispamRule } from '../types';
import { RuleTypeSelectModal } from './RuleTypeSelectModal';
import { AdvancedRuleModal } from './AdvancedRuleModal';
import { AdvancedRuleTestModal } from './AdvancedRuleTestModal';
import { AdvancedRulesList } from './AdvancedRulesList';

interface SpamRulesTabProps {
  onShowAlert: (msg: string, type: 'success' | 'danger') => void;
  onRefreshStatus: () => void;
}

const PRESET_HEURISTIC_RULES: Array<{
  title: string;
  name: string;
  target: string;
  pattern: string;
  score: number;
  describe: string;
  category: 'phishing' | 'obfuscation' | 'hijack' | 'custom';
  description: string;
}> = [
  {
    title: 'Phishing Pedágio / Rodovia (Sem Acentos)',
    name: 'LOCAL_GOLPE_PEDAGIO',
    target: 'Subject',
    pattern: '/ped.gios?|vi.ria|rodovi.rio|pend.ncia/i',
    score: 15.0,
    describe: 'ZRTI - Bloqueio de Assunto Phishing Pedágio',
    category: 'phishing',
    description: 'Bloqueia palavras de cobrança de pedágio e rodovias no assunto mesmo com variações de acento.'
  },
  {
    title: 'Remetente Falso (Reclame Aqui / Cobrança / Regularização)',
    name: 'LOCAL_GOLPE_REMETENTE',
    target: 'From',
    pattern: '/Regulariza..o|Pend.ncias|Cobran.a|ReclameAqui/i',
    score: 15.0,
    describe: 'ZRTI - Bloqueio de Remetente Phishing',
    category: 'phishing',
    description: 'Detecta remetentes forjados simulando Reclame Aqui, Regularização ou cobranças.'
  },
  {
    title: 'Reply-To Domínio Sequestrado / Vulnerável',
    name: 'LOCAL_GOLPE_REPLYTO',
    target: 'Reply-To',
    pattern: '/vidracariarubi\\.com\\.br/i',
    score: 15.0,
    describe: 'ZRTI - Bloqueio de Dominio Sequestrado',
    category: 'hijack',
    description: 'Bloqueia domínios específicos identificados como sequestrados para retorno de golpes.'
  },
  {
    title: 'Assunto com Múltiplas Interrogações (Erro de Charset)',
    name: 'LOCAL_ASSUNTO_QUEBRADO',
    target: 'Subject',
    pattern: '/\\?{2,}/',
    score: 5.0,
    describe: 'ZRTI - Assunto com erro de codificacao (??)',
    category: 'obfuscation',
    description: 'Pega falhas amadoras de encoding/charset de spammers que geram múltiplos "??" no assunto.'
  },
  {
    title: 'Remetente com Caracteres Ofuscados (ex: S.e.r.v.i.c.o)',
    name: 'LOCAL_REMETENTE_OFUSCADO',
    target: 'From',
    pattern: '/[a-z][._*&%-][a-z][._*&%-][a-z]/i',
    score: 5.0,
    describe: 'ZRTI - Remetente com caracteres ofuscados',
    category: 'obfuscation',
    description: 'Detecta tentativas de ofuscação de nome inserindo pontos ou símbolos entre as letras.'
  },
  {
    title: 'Faturas & Comprovantes PIX Suspeitos',
    name: 'LOCAL_GOLPE_PIX_FATURA',
    target: 'Subject',
    pattern: '/comprovante.*pix|fatura.*vencida|boleto.*atualizado|duplicata.*vencendo/i',
    score: 12.0,
    describe: 'ZRTI - Phishing de Boleto e PIX Falso',
    category: 'phishing',
    description: 'Captura tentativas de envio de boletos falsos ou comprovantes PIX fraudulentos.'
  },
  {
    title: 'Falso DocuSign / Assinatura de Contrato',
    name: 'LOCAL_GOLPE_DOCUSIGN',
    target: 'Subject',
    pattern: '/docusign.*assine|documento.*pendente.*assinatura|contrato.*aguardando/i',
    score: 15.0,
    describe: 'ZRTI - Phishing de Assinatura DocuSign Falsa',
    category: 'phishing',
    description: 'Bloqueia falsas notificações de assinatura eletrônica de documentos urgentes.'
  },
  {
    title: 'Links Suspeitos & Encurtadores no Corpo',
    name: 'LOCAL_LINK_SUSPEITO',
    target: 'URI',
    pattern: '/(bit\\.ly|tinyurl|is\\.gd|cutt\\.ly|t\\.co|wa\\.me|goo\\.gl)\\/[a-zA-Z0-9]+/i',
    score: 12.0,
    describe: 'ZRTI - Link Encurtador ou Redirecionamento Suspeito no Corpo',
    category: 'custom',
    description: 'Identifica links encurtados ou redirecionadores frequentemente usados para ocultar URLs maliciosas.'
  },
  {
    title: 'Link com IP Direto no E-mail (Sem Domínio DNS)',
    name: 'LOCAL_LINK_IP_DIRETO',
    target: 'URI',
    pattern: '/https?:\\/\\/\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}/i',
    score: 14.0,
    describe: 'ZRTI - Link com Endereco IP Direto no E-mail',
    category: 'custom',
    description: 'Bloqueia e pontua fortemente e-mails contendo hiperlinks que apontam diretamente para IPs em vez de nomes de domínio.'
  },
  {
    title: 'Caracteres Estranhos, Zero-Width & Homógrafos',
    name: 'LOCAL_CARACTERES_ESTRANHOS',
    target: 'Subject',
    pattern: '/[\\u200B-\\u200D\\uFEFF]|[\\u0400-\\u04FF].*[\\u0041-\\u007A]/',
    score: 10.0,
    describe: 'ZRTI - Caracteres estranhos, zero-width ou homografos no assunto',
    category: 'obfuscation',
    description: 'Detecta caracteres invisíveis (zero-width), espaços especiais e mistura de alfabetos cirílico e latino para burlar filtros.'
  },
  {
    title: '11. Remetente com LocalPart Alfanumérico Longo (>12 chars)',
    name: 'LOCAL_REMETENTE_ALFANUMERICO',
    target: 'From',
    pattern: '/^[a-z0-9_.-]{12,}@/i',
    score: 4.0,
    describe: 'ZRTI - Remetente com parte local alfanumerica extensa tipica de botnet',
    category: 'custom',
    description: 'Identifica caixas postais geradas automaticamente por scripts de envio em massa com strings alfanuméricas longas.'
  },
  {
    title: '12. Subdomínio Hexadecimal Aleatório (8 Caracteres)',
    name: 'LOCAL_SUBDOMINIO_HEX_8',
    target: 'From',
    pattern: '/@[a-f0-9]{8}\\./i',
    score: 5.0,
    describe: 'ZRTI - Subdominio hexadecimal descartavel de 8 caracteres (Ex: 2f1ab419)',
    category: 'custom',
    description: 'Bloqueia remetentes que utilizam subdomínios hexadecimais rotativos de 8 caracteres criados para burlar filtros de reputação.'
  },
  {
    title: '13. Remetente Enviado de Subdomínio de Múltiplos Níveis',
    name: 'LOCAL_SUBDOMAIN_SENDER',
    target: 'From',
    pattern: '/@[a-z0-9-]+\\.[a-z0-9-]+\\.[a-z0-9-]+\\.[a-z0-9-]+/i',
    score: 3.5,
    describe: 'ZRTI - Remetente com multiplos niveis de subdominio',
    category: 'custom',
    description: 'Detecta múltiplos níveis de subdomínios aninhados frequentemente empregados em campanhas de evasão de filtro.'
  },
  {
    title: '14. Domínio com Mistura Alfanumérica Suspeita',
    name: 'LOCAL_DOMINIO_ALFANUMERICO',
    target: 'From',
    pattern: '/@([a-z0-9-]*[a-z]+[0-9]+[a-z0-9-]*|[a-z0-9-]*[0-9]+[a-z]+[a-z0-9-]*)\\./i',
    score: 3.0,
    describe: 'ZRTI - Dominio com intercalacao alfanumerica suspeita',
    category: 'custom',
    description: 'Identifica domínios que intercalam algarismos e letras no padrão de domínios descartáveis.'
  },
  {
    title: '15. Hiperlinks e Protocolos no Corpo do E-mail',
    name: 'LOCAL_URL_NO_CORPO',
    target: 'body',
    pattern: '/https?:\\/\\/[^\\s<>"\']+/i',
    score: 2.0,
    describe: 'ZRTI - Hiperlink detectado no corpo da mensagem',
    category: 'custom',
    description: 'Identifica presença de links no corpo da mensagem que induzem o usuário a clicar em páginas externas.'
  },
  {
    title: '16. Termos Coercitivos / Phishing PROCON e Multas no Corpo',
    name: 'LOCAL_CORPO_SUSPEITO',
    target: 'body',
    pattern: '/(processo\\s+administrativo|pend[eê]ncia\\s+urgente|evitar\\s+processo|a[cç][aã]o\\s+necess[aá]ria|bloqueio\\s+imediato|regularize|cpf\\/cnpj)/i',
    score: 6.0,
    describe: 'ZRTI - Phishing com termos de urgencia, PROCON ou coercao administrativa',
    category: 'phishing',
    description: 'Detecta ameaças psicológicas e falsas intimações de órgãos como PROCON ou Receita para pressionar a vítima.'
  }
];

export const SpamRulesTab: React.FC<SpamRulesTabProps> = ({ onShowAlert, onRefreshStatus }) => {
  // Main view modes: 'heuristics' | 'visual' | 'simulator' | 'raw'
  const [activeView, setActiveView] = useState<'heuristics' | 'visual' | 'simulator' | 'raw'>('heuristics');
  
  // Category filter for Blacklist / Whitelist
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'blacklist_from' | 'spam_from' | 'whitelist_from'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Visual rules state (Simple lists: whitelist_from, blacklist_from, spam_from)
  const [visualRules, setVisualRules] = useState<VisualSpamRule[]>([]);
  const [loadingVisual, setLoadingVisual] = useState<boolean>(true);
  const [newAction, setNewAction] = useState<'blacklist_from' | 'spam_from' | 'whitelist_from'>('blacklist_from');
  const [newValue, setNewValue] = useState<string>('');
  const [addingRule, setAddingRule] = useState<boolean>(false);

  // Edit Simple Rule Modal state
  const [editingRule, setEditingRule] = useState<VisualSpamRule | null>(null);
  const [editAction, setEditAction] = useState<'blacklist_from' | 'spam_from' | 'whitelist_from'>('blacklist_from');
  const [editValue, setEditValue] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  // Custom Heuristic Regex Rules state (Database / local.cf)
  const [customRules, setCustomRules] = useState<CustomRegexRule[]>([]);
  const [loadingCustom, setLoadingCustom] = useState<boolean>(true);
  const [heuristicSearch, setHeuristicSearch] = useState<string>('');
  const [heuristicCategory, setHeuristicCategory] = useState<'all' | 'phishing' | 'obfuscation' | 'hijack' | 'custom'>('all');

  // Add / Edit Custom Regex Rule Modal
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'visual_builder' | 'regex_raw'>('visual_builder');
  const [visualKeywords, setVisualKeywords] = useState<string>('');
  const [visualMatchType, setVisualMatchType] = useState<'contains' | 'phrase' | 'starts_with' | 'ends_with' | 'obfuscated'>('contains');
  
  const [customRuleForm, setCustomRuleForm] = useState<{
    old_name?: string;
    name: string;
    target: string;
    pattern: string;
    score: number;
    describe: string;
  }>({
    name: '',
    target: 'Subject',
    pattern: '',
    score: 15.0,
    describe: ''
  });
  const [savingCustomRule, setSavingCustomRule] = useState<boolean>(false);

  // Inline Quick Tester state (inside Heuristics tab)
  const [inlineSubj, setInlineSubj] = useState<string>('Regularizacao de Debito de Pedagio Rodoviario');
  const [inlineBody, setInlineBody] = useState<string>('Prezado motorista, consta uma notificacao de pedagio pendente de pagamento.');
  const [inlineFrom, setInlineFrom] = useState<string>('Concessionaria <notificacao@pedagio-cobranca.com>');
  const [inlineReplyTo, setInlineReplyTo] = useState<string>('cobranca@vidracariarubi.com.br');
  const [inlineTesting, setInlineTesting] = useState<boolean>(false);
  const [inlineResult, setInlineResult] = useState<RegexRuleTestResult | null>(null);

  // Simulator state
  const [simOrigin, setSimOrigin] = useState<string>('external');
  const [simSmtpAuth, setSimSmtpAuth] = useState<boolean>(false);
  const [simSubject, setSimSubject] = useState<string>('PROCON: Notificação Urgente — Pendência Consumidor');
  const [simFrom, setSimFrom] = useState<string>('Julia Pereira <juliapereira@2f1ab419.apriori.net.br>');
  const [simReplyTo, setSimReplyTo] = useState<string>('notificacao@2f1ab419.apriori.net.br');
  const [simBody, setSimBody] = useState<string>('Prezado cliente, informamos que consta uma pendência urgente do PROCON referente ao seu CPF/CNPJ. Ação necessária imediata para evitar processo administrativo. Acesse: https://2f1ab419.apriori.net.br/procon/notificacao');
  const [simSpf, setSimSpf] = useState<string>('PASS');
  const [simDkim, setSimDkim] = useState<string>('PASS');
  const [simDmarc, setSimDmarc] = useState<string>('PASS');
  const [simClientIp, setSimClientIp] = useState<string>('185.220.101.5');
  const [simHelo, setSimHelo] = useState<string>('mail.2f1ab419.apriori.net.br');
  const [simHeaders, setSimHeaders] = useState<string>('X-Spam-Check-By: VALIDITY_CERTIFIED, VALIDITY_SAFE\nMessage-ID: <20260909120000.2f1ab419@apriori.net.br>');
  const [simSaBase, setSimSaBase] = useState<number>(0.0);
  const [showAdvancedParams, setShowAdvancedParams] = useState<boolean>(true);
  const [simTesting, setSimTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<RegexRuleTestResult | null>(null);

  // Advanced Rules state
  const [subTab, setSubTab] = useState<'advanced' | 'simple'>('advanced');
  const [advancedRules, setAdvancedRules] = useState<AdvancedAntispamRule[]>([]);
  const [loadingAdvanced, setLoadingAdvanced] = useState<boolean>(true);
  const [showRuleTypeModal, setShowRuleTypeModal] = useState<boolean>(false);
  const [showAdvancedModal, setShowAdvancedModal] = useState<boolean>(false);
  const [advancedRuleToEdit, setAdvancedRuleToEdit] = useState<AdvancedAntispamRule | null>(null);
  const [showAdvancedTestModal, setShowAdvancedTestModal] = useState<boolean>(false);
  const [advancedRuleToTest, setAdvancedRuleToTest] = useState<AdvancedAntispamRule | null>(null);

  // Fetch advanced rules
  const fetchAdvancedRules = async () => {
    setLoadingAdvanced(true);
    try {
      const res = await fetch('/api/antispam/advanced-rules');
      const data = await res.json();
      if (data.success && Array.isArray(data.rules)) {
        setAdvancedRules(data.rules);
      } else {
        setAdvancedRules([]);
      }
    } catch (err: any) {
      onShowAlert('Erro ao carregar regras avançadas: ' + err.message, 'danger');
    } finally {
      setLoadingAdvanced(false);
    }
  };

  const handleSaveAdvancedRule = async (rule: AdvancedAntispamRule) => {
    const res = await fetch('/api/antispam/advanced-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule)
    });
    const data = await res.json();
    if (data.success) {
      onShowAlert(data.message, 'success');
      fetchAdvancedRules();
      if (onRefreshStatus) onRefreshStatus();
    } else {
      throw new Error(data.message || 'Erro ao salvar regra avançada.');
    }
  };

  const handleToggleAdvancedActive = async (rule: AdvancedAntispamRule) => {
    try {
      const res = await fetch('/api/antispam/advanced-rules/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, is_active: !rule.is_active })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        fetchAdvancedRules();
      } else {
        onShowAlert(data.message || 'Erro ao alternar status da regra.', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro de comunicação: ' + err.message, 'danger');
    }
  };

  const handleDeleteAdvancedRule = async (rule: AdvancedAntispamRule) => {
    if (!window.confirm(`Deseja realmente excluir permanentemente a regra '${rule.code}'?`)) {
      return;
    }
    try {
      const res = await fetch('/api/antispam/advanced-rules/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        fetchAdvancedRules();
      } else {
        onShowAlert(data.message || 'Erro ao excluir regra.', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro de comunicação: ' + err.message, 'danger');
    }
  };

  // Raw editor state
  const [content, setContent] = useState<string>('');
  const [loadingRaw, setLoadingRaw] = useState<boolean>(true);
  const [testingSyntax, setTestingSyntax] = useState<boolean>(false);
  const [consolidating, setConsolidating] = useState<boolean>(false);
  const [savingRaw, setSavingRaw] = useState<boolean>(false);
  const [lintResult, setLintResult] = useState<LintResponse | null>(null);

  // Fetch visual simple rules
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
      onShowAlert('Erro ao carregar regras da Blacklist: ' + err.message, 'danger');
    } finally {
      setLoadingVisual(false);
    }
  };

  // Fetch custom heuristic regex rules
  const fetchCustomRules = async () => {
    setLoadingCustom(true);
    try {
      const res = await fetch('/api/services/spamassassin/custom-rules');
      const data = await res.json();
      if (data.success && Array.isArray(data.rules)) {
        setCustomRules(data.rules);
      } else {
        setCustomRules([]);
      }
    } catch (err: any) {
      onShowAlert('Erro ao carregar regras de Inteligência AntiSPAM: ' + err.message, 'danger');
    } finally {
      setLoadingCustom(false);
    }
  };

  // Fetch raw /etc/spamassassin/local.cf content
  const fetchRawRules = async () => {
    setLoadingRaw(true);
    try {
      const res = await fetch('/api/services/spamassassin/rules');
      const data = await res.json();
      if (data.success && data.content) {
        setContent(data.content);
      } else {
        setContent('');
      }
    } catch (err: any) {
      onShowAlert('Erro ao carregar arquivo local.cf: ' + err.message, 'danger');
    } finally {
      setLoadingRaw(false);
    }
  };

  const refreshAll = () => {
    fetchVisualRules();
    fetchCustomRules();
    fetchAdvancedRules();
    fetchRawRules();
  };

  useEffect(() => {
    refreshAll();
  }, []);

  // Convert keywords into robust regex pattern
  const generatePatternFromKeywords = (words: string, matchType: string): string => {
    if (!words.trim()) return '/palavra/i';
    
    // Se o usuário digitou uma expressão Regex pura, preservar integralmente
    if (words.trim().startsWith('/') && words.trim().lastIndexOf('/') > 0) {
      return words.trim();
    }

    // Split comma separated or pipe separated phrases
    const parts = words.split(/[,|;]/).map(w => w.trim()).filter(Boolean);
    if (parts.length === 0) return '/palavra/i';

    const cleanParts = parts.map(p => {
      // Replace accents with regex wildcard dot for robust matching
      let normalized = p
        .replace(/[aáàãâä]/gi, '[aáàãâä.]')
        .replace(/[eéèêë]/gi, '[eéèêë.]')
        .replace(/[iíìîï]/gi, '[iíìîï.]')
        .replace(/[oóòõôö]/gi, '[oóòõôö.]')
        .replace(/[uúùûü]/gi, '[uúùûü.]')
        .replace(/[cç]/gi, '[cç.]');

      if (matchType === 'starts_with') {
        return `^${normalized}`;
      } else if (matchType === 'ends_with') {
        return `${normalized}$`;
      } else if (matchType === 'obfuscated') {
        // Build obfuscated letter regex like p[._\s-]*e[._\s-]*d...
        const letters = p.replace(/\s+/g, '').split('');
        return letters.map(l => `[${l}][._\\-*&%\\s]?`).join('');
      }
      return normalized;
    });

    return `/${cleanParts.join('|')}/i`;
  };

  // Add simple visual rule (blacklist_from, whitelist_from, spam_from)
  const handleAddVisualRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newValue.trim()) return;

    setAddingRule(true);
    try {
      const res = await fetch('/api/services/spamassassin/visual-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: newAction,
          value: newValue.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message || 'Regra adicionada com sucesso!', 'success');
        setNewValue('');
        refreshAll();
      } else {
        onShowAlert(data.message || 'Erro ao adicionar regra.', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro ao adicionar regra: ' + err.message, 'danger');
    } finally {
      setAddingRule(false);
    }
  };

  // Open Edit Simple Modal
  const openEditModal = (rule: VisualSpamRule) => {
    setEditingRule(rule);
    setEditAction(rule.type);
    setEditValue(rule.value);
  };

  // Save Edit Simple Rule
  const handleSaveEditRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule || !editValue.trim()) return;

    setSavingEdit(true);
    try {
      const res = await fetch('/api/services/spamassassin/visual-rules', {
        method: 'PUT',
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
        refreshAll();
      } else {
        onShowAlert(data.message || 'Erro ao salvar alterações.', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro ao atualizar regra: ' + err.message, 'danger');
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete Simple Visual Rule
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
        refreshAll();
      } else {
        onShowAlert(data.message || 'Erro ao remover regra.', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro ao remover regra: ' + err.message, 'danger');
    }
  };

  // Open Custom Regex Modal
  const openNewCustomModal = (preset?: typeof PRESET_HEURISTIC_RULES[0]) => {
    if (preset) {
      setCustomRuleForm({
        name: preset.name,
        target: preset.target,
        pattern: preset.pattern,
        score: preset.score,
        describe: preset.describe
      });
      setModalMode('regex_raw');
    } else {
      setCustomRuleForm({
        name: 'LOCAL_GOLPE_NOVA_REGRA',
        target: 'Subject',
        pattern: '/ped.gios?|multa|debito/i',
        score: 15.0,
        describe: 'ZRTI - Bloqueio Local no Assunto'
      });
      setVisualKeywords('pedagio, rodoviario, debito pendente');
      setVisualMatchType('contains');
      setModalMode('visual_builder');
    }
    setShowCustomModal(true);
  };

  const openEditCustomModal = (rule: CustomRegexRule) => {
    setCustomRuleForm({
      old_name: rule.name,
      name: rule.name,
      target: rule.target,
      pattern: rule.pattern,
      score: rule.score,
      describe: rule.describe
    });
    setModalMode('regex_raw');
    setShowCustomModal(true);
  };

  // Save Custom Regex Rule
  const handleSaveCustomRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customRuleForm.name.trim()) return;

    let finalPattern = customRuleForm.pattern;
    if (modalMode === 'visual_builder') {
      finalPattern = generatePatternFromKeywords(visualKeywords, visualMatchType);
    }

    if (!finalPattern.trim()) {
      onShowAlert('Informe a palavra, frase ou padrão Regex da regra.', 'danger');
      return;
    }

    setSavingCustomRule(true);
    try {
      const res = await fetch('/api/services/spamassassin/custom-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...customRuleForm,
          pattern: finalPattern
        })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message || 'Regra heurística salva no banco de dados e local.cf!', 'success');
        setShowCustomModal(false);
        refreshAll();
      } else {
        onShowAlert(data.message || 'Erro ao salvar regra heurística.', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro ao salvar regra: ' + err.message, 'danger');
    } finally {
      setSavingCustomRule(false);
    }
  };

  // Delete Custom Regex Rule
  const handleDeleteCustomRule = async (rule: CustomRegexRule) => {
    if (!window.confirm(`Deseja realmente excluir a regra heurística "${rule.name}"?`)) {
      return;
    }

    try {
      const res = await fetch('/api/services/spamassassin/custom-rules/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: rule.name })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message || 'Regra removida com sucesso!', 'success');
        refreshAll();
      } else {
        onShowAlert(data.message || 'Erro ao remover regra.', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro ao remover regra: ' + err.message, 'danger');
    }
  };

  // Run Inline Quick Test inside Heuristics tab
  const handleRunInlineTest = async () => {
    setInlineTesting(true);
    setInlineResult(null);
    try {
      const res = await fetch('/api/services/spamassassin/test-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: inlineSubj,
          from: inlineFrom,
          reply_to: inlineReplyTo,
          body: inlineBody
        })
      });
      const data = await res.json();
      if (data.success) {
        setInlineResult(data);
      } else {
        onShowAlert(data.message || 'Falha ao executar teste rápido.', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro no teste: ' + err.message, 'danger');
    } finally {
      setInlineTesting(false);
    }
  };

  // Run Full Simulator Test
  const handleRunSimulator = async () => {
    setSimTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/services/spamassassin/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: simSubject,
          from: simFrom,
          reply_to: simReplyTo,
          body: simBody,
          client_ip: simClientIp,
          origin: simOrigin,
          smtp_auth: simSmtpAuth,
          helo: simHelo,
          spf_status: simSpf,
          dkim_status: simDkim,
          dmarc_status: simDmarc,
          raw_headers: simHeaders,
          sa_base_score: simSaBase
        })
      });
      const data = await res.json();
      if (data.success) {
        setTestResult(data);
      } else {
        onShowAlert(data.message || 'Falha ao processar simulação.', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro no simulador: ' + err.message, 'danger');
    } finally {
      setSimTesting(false);
    }
  };

  // Consolidate and Deduplicate local.cf
  const handleConsolidateLocalCf = async () => {
    setConsolidating(true);
    try {
      const res = await fetch('/api/services/spamassassin/consolidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        fetchRawRules();
        fetchCustomRules();
        fetchVisualRules();
        if (onRefreshStatus) onRefreshStatus();
      } else {
        onShowAlert(data.message || 'Falha ao consolidar local.cf', 'danger');
      }
    } catch (err: any) {
      onShowAlert('Erro ao consolidar regras: ' + err.message, 'danger');
    } finally {
      setConsolidating(false);
    }
  };

  // Load preset simulation scenarios
  const loadScenario = (type: 'procon' | 'pedagio' | 'reclame_aqui' | 'ofuscado' | 'interrogacoes' | 'legitimo' | 'atrushx') => {
    if (type === 'atrushx') {
      setSimSubject('Aviso de Notificação de Cobrança');
      setSimFrom('registro-brione-rc@atrushx10.com');
      setSimReplyTo('registro-brione-rc@atrushx10.com');
      setSimBody('Notificação urgente sobre sua conta atrushx.');
      setSimSpf('NONE');
      setSimDkim('NONE');
      setSimDmarc('NONE');
      setSimHeaders('');
      setSimSaBase(0.0);
    } else if (type === 'procon') {
      setSimSubject('PROCON: Notificação Urgente — Pendência Consumidor');
      setSimFrom('Julia Pereira <juliapereira@2f1ab419.apriori.net.br>');
      setSimReplyTo('notificacao@2f1ab419.apriori.net.br');
      setSimBody('Prezado cliente, informamos que consta uma pendência urgente do PROCON referente ao seu CPF/CNPJ. Ação necessária imediata para evitar processo administrativo. Acesse: https://2f1ab419.apriori.net.br/procon/notificacao');
      setSimSpf('PASS');
      setSimDkim('PASS');
      setSimDmarc('PASS');
      setSimClientIp('185.220.101.5');
      setSimHelo('mail.2f1ab419.apriori.net.br');
      setSimHeaders('X-Spam-Check-By: VALIDITY_CERTIFIED, VALIDITY_SAFE\nMessage-ID: <20260909120000.2f1ab419@apriori.net.br>');
      setSimSaBase(0.0);
      setShowAdvancedParams(true);
    } else if (type === 'pedagio') {
      setSimSubject('Notificação de Débito: Pendência em Praça de Pedágio Rodoviário');
      setSimFrom('Concessionária de Rodovias <cobranca@rodovia-aviso.com>');
      setSimReplyTo('financeiro@vidracariarubi.com.br');
      setSimBody('Identificamos uma evasão de pedágio em seu veículo. Regularize agora para evitar multa.');
      setSimSpf('NONE');
      setSimDkim('NONE');
      setSimDmarc('NONE');
      setSimHeaders('');
      setSimSaBase(0.0);
    } else if (type === 'reclame_aqui') {
      setSimSubject('Aviso de Notificação Importante');
      setSimFrom('ReclameAqui Regularização e Pendências <noreply@site-invalido.biz>');
      setSimReplyTo('atendimento@vidracariarubi.com.br');
      setSimBody('Você possui uma nova reclamação pendente de resposta em nossa plataforma.');
      setSimSpf('FAIL');
      setSimDkim('NONE');
      setSimDmarc('FAIL');
      setSimHeaders('');
      setSimSaBase(0.0);
    } else if (type === 'ofuscado') {
      setSimSubject('Atualização de Cadastro Bancário');
      setSimFrom('S.e.r.v.i.c.o B.a.n.c.o <security@banco-update.com>');
      setSimReplyTo('contato@banco-update.com');
      setSimBody('Seus dados expiraram. Atualize seu token.');
      setSimSpf('PASS');
      setSimDkim('NONE');
      setSimDmarc('NONE');
      setSimHeaders('');
      setSimSaBase(0.0);
    } else if (type === 'interrogacoes') {
      setSimSubject('Oportunidade Imperdível ??? Veja aqui');
      setSimFrom('Super Ofertas <promo@descontos-relampago.net>');
      setSimReplyTo('promo@descontos-relampago.net');
      setSimBody('Confira os novos descontos da semana.');
      setSimSpf('NONE');
      setSimDkim('NONE');
      setSimDmarc('NONE');
      setSimHeaders('');
      setSimSaBase(0.0);
    } else if (type === 'legitimo') {
      setSimSubject('Relatório Mensal de Atividades e Suporte ZRTI');
      setSimFrom('Suporte Técnico <suporte@zrti.com.br>');
      setSimReplyTo('suporte@zrti.com.br');
      setSimBody('Olá, segue em anexo o relatório mensal de desempenho dos servidores.');
      setSimSpf('PASS');
      setSimDkim('PASS');
      setSimDmarc('PASS');
      setSimHeaders('');
      setSimSaBase(-1.0);
    }
    setTestResult(null);
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
        refreshAll();
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

  // Filtered visual simple rules calculations
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

  // Filtered custom heuristic rules
  const filteredCustomRules = customRules.filter(r => {
    if (heuristicCategory !== 'all' && r.category !== heuristicCategory) return false;
    if (heuristicSearch.trim()) {
      const term = heuristicSearch.toLowerCase();
      return (
        r.name.toLowerCase().includes(term) ||
        r.describe.toLowerCase().includes(term) ||
        r.pattern.toLowerCase().includes(term) ||
        r.target.toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="w-6 h-6 text-amber-500" />
            <span>AntiSpam & Proteção Heurística</span>
            <span className="bg-amber-50 text-amber-700 text-xs px-2.5 py-1 rounded-full border border-amber-200 font-mono flex items-center gap-1">
              <Database className="w-3 h-3 text-amber-600" />
              <span>MariaDB + SpamAssassin</span>
            </span>
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Área de regras locais com inteligência heurística para identificar e bloquear palavras e termos suspeitos no Assunto ou Corpo do e-mail, além de Blacklist e editor avançado.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshAll}
            disabled={loadingVisual || loadingCustom || loadingRaw}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors border border-slate-300 shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${loadingVisual || loadingCustom || loadingRaw ? 'animate-spin' : ''}`} />
            <span>Recarregar</span>
          </button>
        </div>
      </div>

      {/* Main View Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveView('heuristics')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
            activeView === 'heuristics'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>Inteligência AntiSPAM (Regras Locais)</span>
          <span className="bg-amber-100 text-amber-800 text-[11px] px-2 py-0.5 rounded-full font-mono font-bold">
            {customRules.length}
          </span>
        </button>

        <button
          onClick={() => setActiveView('visual')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
            activeView === 'visual'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <ListFilter className="w-4 h-4 text-indigo-500" />
          <span>Blacklist & Listas de Acesso</span>
          <span className="bg-slate-100 text-slate-700 text-[11px] px-2 py-0.5 rounded-full font-mono">
            {visualRules.length}
          </span>
        </button>

        <button
          onClick={() => setActiveView('simulator')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
            activeView === 'simulator'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Play className="w-4 h-4 text-blue-500" />
          <span>Simulador & Testador Completo</span>
        </button>

        <button
          onClick={() => setActiveView('raw')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
            activeView === 'raw'
              ? 'border-slate-800 text-slate-900'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Code2 className="w-4 h-4 text-slate-500" />
          <span>Modo Avançado (Editor local.cf)</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: INTELIGÊNCIA ANTISPAM (REGRAS LOCAIS DE ASSUNTO/CORPO) */}
      {/* ========================================================= */}
      {activeView === 'heuristics' && (
        <div className="space-y-6">
          
          {/* Sub-Navigation: Regras Avançadas vs Regras Simples */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTab('advanced')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  subTab === 'advanced'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>Regras Avançadas (Compostas)</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  subTab === 'advanced' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-800'
                }`}>
                  {advancedRules.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSubTab('simple')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  subTab === 'simple'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>Regras Simples (Heurísticas)</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  subTab === 'simple' ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-800'
                }`}>
                  {customRules.length}
                </span>
              </button>
            </div>

            <button
              onClick={() => setShowRuleTypeModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ Nova Regra AntiSPAM</span>
            </button>
          </div>

          {/* VIEW: REGRAS AVANÇADAS */}
          {subTab === 'advanced' && (
            <AdvancedRulesList
              rules={advancedRules}
              loading={loadingAdvanced}
              onRefresh={fetchAdvancedRules}
              onCreateNew={() => {
                setAdvancedRuleToEdit(null);
                setShowAdvancedModal(true);
              }}
              onEdit={(rule) => {
                setAdvancedRuleToEdit(rule);
                setShowAdvancedModal(true);
              }}
              onDelete={handleDeleteAdvancedRule}
              onToggleActive={handleToggleAdvancedActive}
              onTestRule={(rule) => {
                setAdvancedRuleToTest(rule);
                setShowAdvancedTestModal(true);
              }}
            />
          )}

          {/* VIEW: REGRAS SIMPLES (PRESERVADAS 100%) */}
          {subTab === 'simple' && (
            <div className="space-y-6">
              {/* Info Banner Database Persistence */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-500 text-slate-950 p-2 rounded-lg font-bold">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-amber-900">
                      Regras Locais no Banco de Dados (Tabela <code>spam_custom_rules</code>)
                    </h3>
                    <p className="text-xs text-amber-800/90 mt-0.5">
                      Identifique termos no Assunto (Subject), Corpo (Body), Remetente ou Reply-To. As regras são persistidas no banco e sincronizadas automaticamente com o SpamAssassin (/etc/spamassassin/local.cf).
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => openNewCustomModal()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors shadow-xs shrink-0"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>+ Criar Nova Regra Simples</span>
                </button>
              </div>

          {/* Quick Presets Bar */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-600" />
                  <span>Modelos Prontos de Bloqueio ZRTI (1-Clique para Importar / Ajustar)</span>
                </h3>
                <p className="text-xs text-amber-800/90 mt-0.5">
                  Regras heurísticas prontas para capturar golpes de pedágio, falsos remetentes, e-mails ofuscados e domínios sequestrados:
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {PRESET_HEURISTIC_RULES.slice(0, 6).map((preset, idx) => (
                <div 
                  key={idx} 
                  className="bg-white/90 hover:bg-white border border-amber-200 hover:border-amber-400 p-3 rounded-lg flex flex-col justify-between transition-all shadow-2xs group"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-bold text-xs text-slate-800 group-hover:text-amber-900 transition-colors">
                        {preset.title}
                      </span>
                      <span className="bg-amber-100 text-amber-900 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
                        +{preset.score.toFixed(1)} pts
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug line-clamp-2">
                      {preset.description}
                    </p>
                    <div className="mt-2 font-mono text-[10px] bg-slate-100 text-slate-800 px-2 py-1 rounded truncate border border-slate-200">
                      {preset.target}: {preset.pattern}
                    </div>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-mono">{preset.name}</span>
                    <button
                      onClick={() => openNewCustomModal(preset)}
                      className="text-xs text-amber-700 hover:text-amber-900 font-semibold inline-flex items-center gap-1 hover:underline"
                    >
                      <PlusCircle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Adicionar / Ajustar</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Filters & Search for Custom Rules */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            
            {/* Category Pills */}
            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start">
              <button
                onClick={() => setHeuristicCategory('all')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  heuristicCategory === 'all'
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span>Todas as Regras</span>
                <span className="ml-1 bg-slate-200 text-slate-700 text-[10px] px-1.5 py-0.5 rounded-full font-mono">
                  {customRules.length}
                </span>
              </button>

              <button
                onClick={() => setHeuristicCategory('phishing')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  heuristicCategory === 'phishing'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Phishing & Golpes</span>
              </button>

              <button
                onClick={() => setHeuristicCategory('obfuscation')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  heuristicCategory === 'obfuscation'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'text-amber-800 hover:bg-amber-50'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Ofuscação & Charset</span>
              </button>

              <button
                onClick={() => setHeuristicCategory('hijack')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  heuristicCategory === 'hijack'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-purple-700 hover:bg-purple-50'
                }`}
              >
                <Tag className="w-3.5 h-3.5 text-purple-600" />
                <span>Reply-To Sequestrado</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={heuristicSearch}
                onChange={(e) => setHeuristicSearch(e.target.value)}
                placeholder="Buscar por regra, termo ou descrição..."
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Heuristic Rules Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="py-3 px-4 w-56">Identificador & Categoria</th>
                    <th className="py-3 px-4 w-32">Onde Verifica (Alvo)</th>
                    <th className="py-3 px-4">Padrão / Palavra Pesquisada</th>
                    <th className="py-3 px-4 w-32 text-center">Score (+Pts)</th>
                    <th className="py-3 px-4">Descrição Didática</th>
                    <th className="py-3 px-4 text-center w-28">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingCustom ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-mono text-xs">
                        Carregando regras da Inteligência AntiSPAM...
                      </td>
                    </tr>
                  ) : filteredCustomRules.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 text-sm">
                        Nenhuma regra heurística encontrada com os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomRules.map((rule, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1">
                            <span className="font-bold font-mono text-xs text-slate-900">
                              {rule.name}
                            </span>
                            {rule.category === 'phishing' ? (
                              <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                <ShieldAlert className="w-3 h-3 text-rose-600" />
                                <span>Phishing / Golpe</span>
                              </span>
                            ) : rule.category === 'obfuscation' ? (
                              <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                <span>Ofuscação</span>
                              </span>
                            ) : rule.category === 'hijack' ? (
                              <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                <Tag className="w-3 h-3 text-purple-600" />
                                <span>Domínio Sequestrado</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                <FileCode className="w-3 h-3 text-slate-500" />
                                <span>Customizada</span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded font-mono text-xs font-bold border ${
                            rule.target.toLowerCase() === 'subject'
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : rule.target.toLowerCase() === 'body'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : rule.target.toLowerCase() === 'from'
                              ? 'bg-purple-50 text-purple-800 border-purple-200'
                              : 'bg-slate-100 text-slate-800 border-slate-200'
                          }`}>
                            {rule.target === 'Subject' ? 'Assunto (Subject)' : rule.target === 'Body' ? 'Corpo (Body)' : rule.target}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <code className="text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 font-bold font-mono text-xs block max-w-md truncate">
                            {rule.pattern}
                          </code>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block font-mono font-extrabold text-xs px-2.5 py-1 rounded-full ${
                            rule.score >= 10.0
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : rule.score >= 5.0
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}>
                            +{rule.score.toFixed(1)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700">
                          {rule.describe || <span className="text-slate-400 italic">Sem descrição</span>}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => openEditCustomModal(rule)}
                              title="Editar Regra / Ajustar Score"
                              className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteCustomRule(rule)}
                              title="Remover Regra Heurística"
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

          {/* INLINE QUICK TESTER (Integrated on Heuristics page) */}
          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 shadow-md text-white">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                  <Play className="w-4 h-4 text-amber-400" />
                  <span>Testador Rápido de Inteligência AntiSPAM (Validação Instantânea)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Digite um Assunto e Corpo de e-mail de teste para verificar em tempo real quais regras locais dariam match e qual seria a pontuação somada:
                </p>
              </div>

              <button
                type="button"
                onClick={handleRunInlineTest}
                disabled={inlineTesting || !inlineSubj.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-xs disabled:opacity-50"
              >
                <Zap className={`w-4 h-4 ${inlineTesting ? 'animate-spin' : ''}`} />
                <span>{inlineTesting ? 'Testando...' : 'Verificar Mensagem'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Assunto do E-mail para Teste:
                </label>
                <input
                  type="text"
                  value={inlineSubj}
                  onChange={(e) => setInlineSubj(e.target.value)}
                  placeholder="Ex: Regularização de Débito de Pedágio Rodoviário"
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Remetente (From):
                </label>
                <input
                  type="text"
                  value={inlineFrom}
                  onChange={(e) => setInlineFrom(e.target.value)}
                  placeholder="Ex: Notificacao <aviso@pedagio-cobranca.com>"
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-slate-300 font-semibold mb-1">
                  Corpo do E-mail (Body):
                </label>
                <textarea
                  value={inlineBody}
                  onChange={(e) => setInlineBody(e.target.value)}
                  rows={2}
                  placeholder="Prezado motorista, consta uma pendência no sistema rodoviário. Regularize agora para evitar multa."
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none font-sans"
                />
              </div>
            </div>

            {/* Test Result Display */}
            {inlineResult && (
              <div className="mt-4 pt-4 border-t border-slate-800">
                <div className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                  inlineResult.is_spam || inlineResult.total_score >= 5.0
                    ? 'bg-rose-950/70 border-rose-500/50 text-rose-100'
                    : 'bg-emerald-950/70 border-emerald-500/50 text-emerald-100'
                }`}>
                  <div>
                    <div className="flex items-center gap-2">
                      {inlineResult.is_spam || inlineResult.total_score >= 5.0 ? (
                        <ShieldAlert className="w-5 h-5 text-rose-400" />
                      ) : (
                        <ShieldCheck className="w-5 h-5 text-emerald-400" />
                      )}
                      <span className="font-bold text-sm">
                        {inlineResult.is_spam || inlineResult.total_score >= 5.0 
                          ? 'CLASSIFICADO COMO SPAM / GOLPE' 
                          : 'MENSAGEM APROVADA (SCORE BAIXO)'}
                      </span>
                    </div>
                    <p className="text-xs mt-1 text-slate-300">
                      Score Total Acumulado: <strong className="text-white font-mono text-sm">+{inlineResult.total_score.toFixed(1)} pts</strong> (Limite de Spam: &gt;= 5.0 pts).
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-slate-300">Regras Disparadas:</span>
                    <span className="ml-2 font-mono font-bold text-amber-400">
                      {inlineResult.rules_triggered?.length || 0} regra(s)
                    </span>
                  </div>
                </div>

                {inlineResult.rules_triggered && inlineResult.rules_triggered.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Detalhamento das regras locais que identificaram o padrão:
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {inlineResult.rules_triggered.map((trig, idx) => (
                        <div key={idx} className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between gap-2">
                          <div className="truncate">
                            <span className="font-mono font-bold text-amber-400 text-xs block truncate">
                              {trig.name}
                            </span>
                            <span className="text-[11px] text-slate-400 truncate block">
                              {trig.describe} ({trig.target})
                            </span>
                          </div>
                          <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-mono font-bold px-2 py-0.5 rounded shrink-0">
                            +{trig.score.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

            </div>
          )}

        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: BLACKLIST & LISTAS DE ACESSO */}
      {/* ========================================================= */}
      {activeView === 'visual' && (
        <div className="space-y-6">
          
          {/* Add Simple Rule Form */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
              <PlusCircle className="w-4 h-4 text-indigo-600" />
              <span>Adicionar Entrada à Blacklist ou Whitelist</span>
            </h3>

            <form onSubmit={handleAddVisualRule} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
              <div className="sm:w-56">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Ação / Lista
                </label>
                <select
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value as any)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="blacklist_from">🚫 Bloquear (Blacklist)</option>
                  <option value="spam_from">⚠️ Marcar como SPAM</option>
                  <option value="whitelist_from">✅ Liberar (White List)</option>
                </select>
              </div>

              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Endereço de E-mail ou Domínio (ex: <code>*@spammer.com</code> ou <code>alvo@dominio.com</code>)
                </label>
                <input
                  type="text"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="*@spammer.com ou usuario@empresa.com.br"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={addingRule || !newValue.trim()}
                className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition-colors shadow-xs disabled:opacity-50 shrink-0 h-10"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{addingRule ? 'Salvando...' : 'Adicionar à Lista'}</span>
              </button>
            </form>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            
            {/* Filter Pills */}
            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  categoryFilter === 'all'
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ListFilter className="w-3.5 h-3.5 text-slate-500" />
                <span>Todas as Entradas</span>
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
                <span>Blacklist (Bloqueados)</span>
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
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                        Carregando regras da lista...
                      </td>
                    </tr>
                  ) : filteredRules.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500 text-sm">
                        Nenhuma entrada de lista encontrada.
                      </td>
                    </tr>
                  ) : (
                    filteredRules.map((rule, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          {rule.type === 'blacklist_from' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                              <span>Blacklist (Bloqueado)</span>
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
                            <button
                              onClick={() => openEditModal(rule)}
                              title="Editar Regra"
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
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

      {/* ========================================================= */}
      {/* TAB 3: SIMULADOR & TESTADOR COMPLETO DE E-MAIL */}
      {/* ========================================================= */}
      {activeView === 'simulator' && (
        <div className="space-y-6">
          
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Play className="w-5 h-5 text-blue-600" />
                <span>Simulador de Classificação Antispam em Tempo Real</span>
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                Insira os campos de um e-mail suspeito ou legítimo para testar instantaneamente como as regras heurísticas e listas do SpamAssassin avaliam a mensagem e calculam o score.
              </p>
            </div>

            {/* Quick Test Scenario Buttons */}
            <div>
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-2">
                Carregar Cenários de Teste Rápidos:
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => loadScenario('atrushx')}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-rose-50 hover:bg-rose-100 hover:border-rose-400 text-rose-800 rounded-lg transition-colors border border-rose-300 font-bold shadow-xs"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                  <span>Atrushx Regex (@atrushx*.com)</span>
                </button>

                <button
                  type="button"
                  onClick={() => loadScenario('procon')}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-rose-50 hover:bg-rose-100 hover:border-rose-400 text-rose-800 rounded-lg transition-colors border border-rose-300 font-bold shadow-xs"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                  <span>Phishing PROCON (Caso Crítico ZRTI)</span>
                </button>

                <button
                  type="button"
                  onClick={() => loadScenario('pedagio')}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 text-slate-700 rounded-lg transition-colors border border-slate-300 font-medium"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                  <span>Golpe do Pedágio</span>
                </button>

                <button
                  type="button"
                  onClick={() => loadScenario('reclame_aqui')}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 text-slate-700 rounded-lg transition-colors border border-slate-300 font-medium"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Falso Reclame Aqui</span>
                </button>

                <button
                  type="button"
                  onClick={() => loadScenario('ofuscado')}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 text-slate-700 rounded-lg transition-colors border border-slate-300 font-medium"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Remetente Ofuscado</span>
                </button>

                <button
                  type="button"
                  onClick={() => loadScenario('interrogacoes')}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 text-slate-700 rounded-lg transition-colors border border-slate-300 font-medium"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Assunto com "???"</span>
                </button>

                <button
                  type="button"
                  onClick={() => loadScenario('legitimo')}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 text-slate-700 rounded-lg transition-colors border border-slate-300 font-medium"
                >
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>E-mail Legítimo</span>
                </button>
              </div>
            </div>

            {/* Test Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Assunto (Subject):
                </label>
                <input
                  type="text"
                  value={simSubject}
                  onChange={(e) => setSimSubject(e.target.value)}
                  placeholder="Assunto da mensagem de e-mail..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Remetente (From):
                </label>
                <input
                  type="text"
                  value={simFrom}
                  onChange={(e) => setSimFrom(e.target.value)}
                  placeholder="Nome Exibido <email@dominio.com>"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Endereço de Retorno (Reply-To):
                </label>
                <input
                  type="text"
                  value={simReplyTo}
                  onChange={(e) => setSimReplyTo(e.target.value)}
                  placeholder="resposta@dominio-sequestrado.com"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Score Base do SpamAssassin (sa_base_score):
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={simSaBase}
                  onChange={(e) => setSimSaBase(parseFloat(e.target.value) || 0.0)}
                  placeholder="0.0"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Corpo da Mensagem (Body):
                </label>
                <textarea
                  value={simBody}
                  onChange={(e) => setSimBody(e.target.value)}
                  rows={3}
                  placeholder="Texto ou código HTML da mensagem..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none font-sans"
                />
              </div>
            </div>

            {/* Collapsible Advanced Parameters (Authentication & Network Headers) */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/70">
              <button
                type="button"
                onClick={() => setShowAdvancedParams(!showAdvancedParams)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-left text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  <span>Parâmetros de Autenticação Técnica & Rede (SPF, DKIM, DMARC, IP, HELO, Headers)</span>
                </div>
                <span className="text-[11px] text-indigo-600 font-semibold">
                  {showAdvancedParams ? '▲ Recolher Parâmetros' : '▼ Expandir Parâmetros'}
                </span>
              </button>

              {showAdvancedParams && (
                <div className="p-4 border-t border-slate-200 bg-white grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Origem do Tráfego:</label>
                    <select
                      value={simOrigin}
                      onChange={(e) => setSimOrigin(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="external">🌐 Externa (Internet)</option>
                      <option value="internal">🏢 Interna (Rede Local / VPN)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Autenticação SMTP (AUTH):</label>
                    <select
                      value={simSmtpAuth ? 'yes' : 'no'}
                      onChange={(e) => setSimSmtpAuth(e.target.value === 'yes')}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="no">Não (Conexão Anônima)</option>
                      <option value="yes">Sim (Usuário Autenticado)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Status SPF:</label>
                    <select
                      value={simSpf}
                      onChange={(e) => setSimSpf(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 font-mono focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="PASS">PASS (Válido - Score 0.0, sem imunidade)</option>
                      <option value="FAIL">FAIL (Falha de SPF - Score +4.5)</option>
                      <option value="SOFTFAIL">SOFTFAIL (Neutro/Suspeito - Score +1.5)</option>
                      <option value="NONE">NONE (Sem registro SPF)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Status DKIM:</label>
                    <select
                      value={simDkim}
                      onChange={(e) => setSimDkim(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 font-mono focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="PASS">PASS (Válido - Score 0.0, sem imunidade)</option>
                      <option value="FAIL">FAIL (Assinatura Inválida - Score +3.5)</option>
                      <option value="NONE">NONE (Não assinado)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Status DMARC:</label>
                    <select
                      value={simDmarc}
                      onChange={(e) => setSimDmarc(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 font-mono focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="PASS">PASS (Conforme - Score 0.0, sem imunidade)</option>
                      <option value="FAIL">FAIL (Rejeição DMARC - Score +5.0)</option>
                      <option value="NONE">NONE (Sem política DMARC)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">IP Remetente (client_ip):</label>
                    <input
                      type="text"
                      value={simClientIp}
                      onChange={(e) => setSimClientIp(e.target.value)}
                      placeholder="185.220.101.5"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">HELO / EHLO Declarado:</label>
                    <input
                      type="text"
                      value={simHelo}
                      onChange={(e) => setSimHelo(e.target.value)}
                      placeholder="mail.2f1ab419.apriori.net.br"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Cabeçalhos RAW Adicionais:</label>
                    <textarea
                      rows={2}
                      value={simHeaders}
                      onChange={(e) => setSimHeaders(e.target.value)}
                      placeholder="X-Spam-Check-By: VALIDITY_CERTIFIED, VALIDITY_SAFE"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Test Button */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleRunSimulator}
                disabled={simTesting || !simSubject.trim()}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg transition-colors shadow-xs disabled:opacity-50"
              >
                <Play className={`w-4 h-4 ${simTesting ? 'animate-spin' : ''}`} />
                <span>{simTesting ? 'Processando Regras...' : 'Executar Avaliação ZRTI'}</span>
              </button>
            </div>

            {/* Result Box */}
            {testResult && (
              <div className="mt-6 pt-6 border-t border-slate-200 space-y-6">
                
                {/* Main Verdict Card */}
                <div className={`p-5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  testResult.decision === 'REJECT' || testResult.total_score >= 15.0
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : testResult.total_score >= 5.0 || testResult.is_spam
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                }`}>
                  <div className="flex items-start gap-3">
                    {testResult.decision === 'REJECT' || testResult.total_score >= 15.0 ? (
                      <ShieldAlert className="w-8 h-8 text-rose-600 shrink-0 mt-0.5" />
                    ) : testResult.total_score >= 5.0 || testResult.is_spam ? (
                      <AlertTriangle className="w-8 h-8 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <ShieldCheck className="w-8 h-8 text-emerald-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-black text-base uppercase">
                          {testResult.decision === 'REJECT'
                            ? 'DECISÃO: REJEITAR E DESCARTAR (REJECT)'
                            : testResult.total_score >= 5.0 || testResult.is_spam
                            ? 'DECISÃO: QUARENTENA / TAG SPAM'
                            : 'DECISÃO: LIBERADO / HAM (PASS)'}
                        </h4>
                        <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                          testResult.decision === 'REJECT'
                            ? 'bg-rose-200 text-rose-800'
                            : testResult.total_score >= 5.0
                            ? 'bg-amber-200 text-amber-800'
                            : 'bg-emerald-200 text-emerald-800'
                        }`}>
                          {testResult.decision || (testResult.total_score >= 5.0 ? 'SPAM' : 'HAM')}
                        </span>
                      </div>
                      <p className="text-xs mt-1 opacity-90">
                        {testResult.breakdown_text || (testResult.total_score >= 5.0
                          ? 'Esta mensagem superou o limite de corte de 5.0 pontos configurado no SpamAssassin/Amavis.'
                          : 'Esta mensagem pontuou abaixo de 5.0 pontos e seria entregue normalmente na caixa de entrada.')}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white/90 p-3 rounded-lg border border-slate-200 text-center shrink-0 min-w-36">
                    <span className="text-[11px] text-slate-500 font-bold block uppercase tracking-wider">
                      Score Total ZRTI
                    </span>
                    <span className={`text-3xl font-mono font-black ${
                      testResult.total_score >= 5.0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}>
                      +{testResult.total_score.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">
                      Threshold: 5.0 pts
                    </span>
                  </div>
                </div>

                {/* 4-Score Breakdown Cards (ZRTI Intelligence Engine) */}
                <div>
                  <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Decomposição dos 4 Componentes de Score:
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                      <span className="text-[11px] font-bold text-slate-500 block uppercase">
                        1. SA Base Score
                      </span>
                      <div className="text-xl font-mono font-bold text-slate-800 mt-1">
                        {((testResult.score_breakdown?.sa_base_score ?? 0.0) >= 0 ? '+' : '')}
                        {(testResult.score_breakdown?.sa_base_score ?? 0.0).toFixed(1)} pts
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Heurística nativa do SpamAssassin
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-500 block uppercase">
                          2. Autenticação
                        </span>
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-mono">
                          SPF/DKIM/DMARC
                        </span>
                      </div>
                      <div className="text-xl font-mono font-bold text-slate-800 mt-1">
                        {((testResult.score_breakdown?.auth_score ?? 0.0) >= 0 ? '+' : '')}
                        {(testResult.score_breakdown?.auth_score ?? 0.0).toFixed(1)} pts
                      </div>
                      <p className="text-[11px] text-emerald-700 font-medium mt-1">
                        Conformidade técnica não imuniza (0.0)
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-500 block uppercase">
                          3. Reputação Externa
                        </span>
                        <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-mono">
                          VALIDITY=0.0
                        </span>
                      </div>
                      <div className="text-xl font-mono font-bold text-slate-800 mt-1">
                        {((testResult.score_breakdown?.reputation_score ?? 0.0) >= 0 ? '+' : '')}
                        {(testResult.score_breakdown?.reputation_score ?? 0.0).toFixed(1)} pts
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        VALIDITY_CERTIFIED/SAFE zerados
                      </p>
                    </div>

                    <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-amber-800 block uppercase">
                          4. Inteligência Local ZRTI
                        </span>
                        <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded font-mono font-bold">
                          Motor ZRTI
                        </span>
                      </div>
                      <div className="text-xl font-mono font-bold text-amber-900 mt-1">
                        {((testResult.score_breakdown?.local_intelligence_score ?? testResult.total_score) >= 0 ? '+' : '')}
                        {(testResult.score_breakdown?.local_intelligence_score ?? testResult.total_score).toFixed(1)} pts
                      </div>
                      <p className="text-[11px] text-amber-800 mt-1">
                        Subdomínios, Heurística & local.cf
                      </p>
                    </div>
                  </div>
                </div>

                {/* Mandated X-ZRTI-* Headers Injection Preview */}
                {testResult.headers && (
                  <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Code2 className="w-4 h-4" />
                        Cabeçalhos Mandatórios Injetados pelo Motor (X-ZRTI-*):
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">MTA / Postfix Envelope</span>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs text-emerald-400 space-y-1 overflow-x-auto">
                      {Object.entries(testResult.headers).map(([hdrKey, hdrVal]) => (
                        <div key={hdrKey} className="flex gap-2">
                          <span className="text-cyan-300 font-bold select-all shrink-0">{hdrKey}:</span>
                          <span className="text-emerald-300 select-all break-all">{hdrVal}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Triggered Rules Breakdown */}
                <div className="mt-4">
                  <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Regras Acionadas ({testResult.rules_triggered?.length || 0}):
                  </h5>
                  {testResult.rules_triggered && testResult.rules_triggered.length > 0 ? (
                    <div className="space-y-2">
                      {testResult.rules_triggered.map((rule, idx) => (
                        <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
                          <div>
                            <span className="font-mono font-bold text-xs text-slate-900">
                              {rule.name}
                            </span>
                            <span className="text-xs text-slate-600 block mt-0.5">
                              {rule.describe} {rule.target ? <>• Alvo: <strong>{rule.target}</strong></> : null}
                            </span>
                            {rule.pattern && (
                              <code className="text-[11px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-mono mt-1 inline-block">
                                {rule.pattern}
                              </code>
                            )}
                          </div>
                          <span className={`text-xs font-mono font-extrabold px-2.5 py-1 rounded-full shrink-0 border ${
                            rule.score > 0
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : rule.score < 0
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}>
                            {rule.score >= 0 ? '+' : ''}{rule.score.toFixed(1)} pts
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center text-xs text-slate-500">
                      Nenhuma regra foi acionada para este conteúdo.
                    </div>
                  )}
                </div>

                {/* Audit Records Table */}
                {testResult.audit_records && testResult.audit_records.length > 0 && (
                  <div>
                    <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-600" />
                      Trilha de Auditoria do Processamento ({testResult.audit_records.length} eventos):
                    </h5>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3">Regra (ID)</th>
                            <th className="py-2 px-3">Campo Analisado</th>
                            <th className="py-2 px-3">Evidência Identificada</th>
                            <th className="py-2 px-3 text-right">Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {testResult.audit_records.map((rec, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-bold text-slate-800">{rec.rule_id}</td>
                              <td className="py-2 px-3 text-slate-600">{rec.field_analyzed || 'envelope'}</td>
                              <td className="py-2 px-3 text-slate-700 max-w-md truncate font-sans text-xs" title={rec.matched_value}>
                                {rec.matched_value}
                              </td>
                              <td className={`py-2 px-3 text-right font-bold ${
                                rec.score_applied > 0 ? 'text-rose-600' : rec.score_applied < 0 ? 'text-emerald-600' : 'text-slate-500'
                              }`}>
                                {rec.score_applied >= 0 ? '+' : ''}{rec.score_applied.toFixed(1)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>

        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: MODO AVANÇADO (RAW EDITOR DO LOCAL.CF) */}
      {/* ========================================================= */}
      {activeView === 'raw' && (
        <div className="space-y-6">
          {/* Preset Rules Bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-2">
              Inserir Atalhos de Regras Rápidas no Arquivo:
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
                onClick={() => appendSnippet('header   LOCAL_GOLPE_PEDAGIO Subject =~ /ped.gios?|vi.ria|rodovi.rio/i\nscore    LOCAL_GOLPE_PEDAGIO 15.0\ndescribe LOCAL_GOLPE_PEDAGIO ZRTI - Bloqueio Phishing Pedágio')}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-slate-300 hover:bg-amber-50 hover:border-amber-300 text-slate-700 hover:text-amber-800 rounded-lg transition-colors font-medium shadow-xs"
              >
                <PlusCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>+ Regra Phishing Pedágio (ZRTI)</span>
              </button>

              <button
                onClick={() => appendSnippet('header   LOCAL_REMETENTE_OFUSCADO From =~ /[a-z][._*&%-][a-z][._*&%-][a-z]/i\nscore    LOCAL_REMETENTE_OFUSCADO 5.0\ndescribe LOCAL_REMETENTE_OFUSCADO ZRTI - Remetente com caracteres ofuscados')}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-slate-300 hover:bg-purple-50 hover:border-purple-300 text-slate-700 hover:text-purple-700 rounded-lg transition-colors font-medium shadow-xs"
              >
                <PlusCircle className="w-3.5 h-3.5 text-purple-600" />
                <span>+ Regra Ofuscação Remetente</span>
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
                      <p className="text-xs text-emerald-200/90 mt-1 font-mono whitespace-pre-wrap">
                        {lintResult.message}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-rose-950/80 border border-rose-500/40 rounded-lg text-rose-200 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-sm text-rose-300">Falha de Sintaxe Detectada!</h4>
                      <p className="text-xs text-rose-200/90 mt-1 font-mono whitespace-pre-wrap">
                        {lintResult.message}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bottom Actions Bar */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-slate-400">
                Ao salvar, o serviço <code className="text-amber-400 font-mono">spamassassin</code> é reiniciado automaticamente.
              </span>

              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleConsolidateLocalCf}
                  disabled={consolidating || loadingRaw}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-900 hover:bg-indigo-800 text-indigo-100 text-sm font-medium rounded-lg transition-colors border border-indigo-700 shadow-xs"
                  title="Deduplica regras, consolida listas de acesso e limpa definições obsoletas no local.cf"
                >
                  <Sparkles className={`w-4 h-4 ${consolidating ? 'animate-spin text-amber-300' : 'text-amber-400'}`} />
                  <span>{consolidating ? 'Consolidando...' : 'Deduplicar e Consolidar'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleTestSyntax}
                  disabled={testingSyntax || loadingRaw}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition-colors border border-slate-700 shadow-xs"
                >
                  <Code2 className={`w-4 h-4 ${testingSyntax ? 'animate-spin' : ''}`} />
                  <span>{testingSyntax ? 'Verificando...' : 'Testar Sintaxe (spamassassin --lint)'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveRawRules}
                  disabled={savingRaw || loadingRaw}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-bold rounded-lg transition-colors shadow-xs"
                >
                  <Save className={`w-4 h-4 ${savingRaw ? 'animate-spin' : ''}`} />
                  <span>{savingRaw ? 'Salvando...' : 'Salvar Arquivo local.cf'}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CRIAR / EDITAR REGRA DE INTELIGÊNCIA ANTISPAM */}
      {/* ========================================================= */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-150">
            
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-600" />
                <span>{customRuleForm.old_name ? 'Editar Regra da Inteligência AntiSPAM' : 'Nova Regra Inteligente (Assunto / Corpo)'}</span>
              </h3>
              <button
                onClick={() => setShowCustomModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="px-6 pt-4 border-b border-slate-100 flex gap-2">
              <button
                type="button"
                onClick={() => setModalMode('visual_builder')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border-b-2 transition-all ${
                  modalMode === 'visual_builder'
                    ? 'border-amber-500 text-amber-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Modo Amigável (Palavras & Termos)</span>
              </button>

              <button
                type="button"
                onClick={() => setModalMode('regex_raw')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border-b-2 transition-all ${
                  modalMode === 'regex_raw'
                    ? 'border-amber-500 text-amber-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Expressão Regular Avançada (Regex)</span>
              </button>
            </div>

            <form onSubmit={handleSaveCustomRule} className="p-6 space-y-4">
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome Identificador da Regra:
                </label>
                <input
                  type="text"
                  value={customRuleForm.name}
                  onChange={(e) => setCustomRuleForm(prev => ({ ...prev, name: e.target.value.toUpperCase() }))}
                  placeholder="Ex: LOCAL_GOLPE_PEDAGIO"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Identificador salvo na tabela <code>spam_custom_rules</code> e cabeçalho SpamAssassin.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Onde Verificar (Alvo):
                  </label>
                  <select
                    value={customRuleForm.target}
                    onChange={(e) => setCustomRuleForm(prev => ({ ...prev, target: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="Subject">Assunto do E-mail (Subject)</option>
                    <option value="Body">Corpo do E-mail (Body)</option>
                    <option value="From">Remetente (From)</option>
                    <option value="Reply-To">Endereço Resposta (Reply-To)</option>
                    <option value="URI">Links / URLs no Corpo (URI)</option>
                    <option value="To">Destinatário (To)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pontuação (Score):
                  </label>
                  <select
                    value={customRuleForm.score}
                    onChange={(e) => setCustomRuleForm(prev => ({ ...prev, score: parseFloat(e.target.value) || 15.0 }))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="15.0">15.0 (SPAM Imediato / Bloqueio)</option>
                    <option value="10.0">10.0 (SPAM Alto)</option>
                    <option value="5.0">5.0 (SPAM Padrão)</option>
                    <option value="3.0">3.0 (Suspeito / Pontuar)</option>
                    <option value="1.0">1.0 (Leve Heurística)</option>
                  </select>
                </div>
              </div>

              {/* Mode 1: Friendly Keywords Builder */}
              {modalMode === 'visual_builder' && (
                <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Palavras ou Termos Suspeitos (separados por vírgula):
                    </label>
                    <input
                      type="text"
                      value={visualKeywords}
                      onChange={(e) => {
                        setVisualKeywords(e.target.value);
                        setCustomRuleForm(prev => ({
                          ...prev,
                          pattern: generatePatternFromKeywords(e.target.value, visualMatchType)
                        }));
                      }}
                      placeholder="Ex: pedagio, rodoviario, notificacao de debito"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none font-semibold"
                    />
                    <span className="text-[11px] text-slate-600 mt-1 block">
                      O sistema ignora acentos automaticamente (ex: pega tanto <em>pedágio</em> quanto <em>pedagio</em>).
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Tipo de Comparação:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setVisualMatchType('contains');
                          setCustomRuleForm(prev => ({ ...prev, pattern: generatePatternFromKeywords(visualKeywords, 'contains') }));
                        }}
                        className={`p-2 rounded-lg text-xs font-semibold border text-left transition-all ${
                          visualMatchType === 'contains'
                            ? 'bg-amber-500 text-slate-950 border-amber-600 font-bold'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        Contém o texto (Recomendado)
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setVisualMatchType('obfuscated');
                          setCustomRuleForm(prev => ({ ...prev, pattern: generatePatternFromKeywords(visualKeywords, 'obfuscated') }));
                        }}
                        className={`p-2 rounded-lg text-xs font-semibold border text-left transition-all ${
                          visualMatchType === 'obfuscated'
                            ? 'bg-amber-500 text-slate-950 border-amber-600 font-bold'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        Com símbolos (p.e.d.a.g.i.o)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Mode 2: Regex Direct Mode */}
              {modalMode === 'regex_raw' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Padrão Regex (Expressão Regular):
                  </label>
                  <input
                    type="text"
                    value={customRuleForm.pattern}
                    onChange={(e) => setCustomRuleForm(prev => ({ ...prev, pattern: e.target.value }))}
                    placeholder="Ex: /ped.gios?|vi.ria|rodovi.rio/i"
                    className="w-full bg-slate-900 text-emerald-400 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    required
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Use <code>.</code> para ignorar acentos (ex: <code>ped.gio</code> pega <em>pedágio</em> e <em>pedagio</em>).
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Descrição Didática / Motivo do Bloqueio:
                </label>
                <input
                  type="text"
                  value={customRuleForm.describe}
                  onChange={(e) => setCustomRuleForm(prev => ({ ...prev, describe: e.target.value }))}
                  placeholder="Ex: ZRTI - Bloqueio de Assunto Phishing Pedágio"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCustomRule || !customRuleForm.name.trim()}
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-lg transition-colors shadow-xs disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{savingCustomRule ? 'Salvando...' : 'Salvar no Banco & Ativar'}</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: EDIT SIMPLE RULE (BLACKLIST/WHITELIST) */}
      {/* ========================================================= */}
      {editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-150">
            
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Pencil className="w-4 h-4 text-indigo-600" />
                <span>Editar Entrada da Lista</span>
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
                  Tipo / Lista
                </label>
                <select
                  value={editAction}
                  onChange={(e) => setEditAction(e.target.value as any)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="blacklist_from">🚫 Bloquear (Blacklist)</option>
                  <option value="spam_from">⚠️ Marcar como SPAM</option>
                  <option value="whitelist_from">✅ Liberar (White List)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Endereço ou Domínio Alvo
                </label>
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition-colors shadow-xs disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{savingEdit ? 'Salvando...' : 'Salvar Alterações'}</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: SELEÇÃO DE TIPO DE REGRA */}
      {/* ========================================================= */}
      <RuleTypeSelectModal
        isOpen={showRuleTypeModal}
        onClose={() => setShowRuleTypeModal(false)}
        onSelectType={(type) => {
          if (type === 'simple') {
            openNewCustomModal();
          } else {
            setAdvancedRuleToEdit(null);
            setShowAdvancedModal(true);
          }
        }}
      />

      {/* ========================================================= */}
      {/* MODAL: CONSTRUTOR / EDITOR DE REGRA AVANÇADA */}
      {/* ========================================================= */}
      <AdvancedRuleModal
        isOpen={showAdvancedModal}
        ruleToEdit={advancedRuleToEdit}
        onClose={() => {
          setShowAdvancedModal(false);
          setAdvancedRuleToEdit(null);
        }}
        onSave={handleSaveAdvancedRule}
        onTestRule={(rule) => {
          setAdvancedRuleToTest(rule);
          setShowAdvancedTestModal(true);
        }}
      />

      {/* ========================================================= */}
      {/* MODAL: TESTE E SIMULAÇÃO DE REGRA AVANÇADA */}
      {/* ========================================================= */}
      <AdvancedRuleTestModal
        isOpen={showAdvancedTestModal}
        rule={advancedRuleToTest}
        onClose={() => {
          setShowAdvancedTestModal(false);
          setAdvancedRuleToTest(null);
        }}
      />

    </div>
  );
};
