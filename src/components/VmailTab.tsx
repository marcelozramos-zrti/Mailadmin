import React, { useState, useEffect } from 'react';
import { DomainItem, MailboxItem, AliasItem, DomainAliasItem } from '../types';
import { 
  Globe, Mail, Split, Plus, Trash2, CheckCircle2, XCircle, HardDrive, 
  KeyRound, Shield, RefreshCw, ArrowRightLeft, Layers, Info, Check, Eye, EyeOff
} from 'lucide-react';

interface VmailTabProps {
  onShowAlert: (msg: string, type?: 'success' | 'danger') => void;
}

export function VmailTab({ onShowAlert }: VmailTabProps) {
  // Main Section & Sub-tabs
  const [mainSection, setMainSection] = useState<'domains' | 'mailboxes'>('domains');
  const [domainSubTab, setDomainSubTab] = useState<'registered_domains' | 'domain_aliases'>('registered_domains');
  const [mailboxSubTab, setMailboxSubTab] = useState<'mailboxes_list' | 'email_aliases'>('mailboxes_list');
  
  // Domains State
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [newDomName, setNewDomName] = useState('');
  const [newDomDesc, setNewDomDesc] = useState('');
  const [newDomQuota, setNewDomQuota] = useState(10240);
  const [showDomModal, setShowDomModal] = useState(false);

  // Domain Aliases State (e.g. zrti.tech -> zrti.com.br)
  const [domainAliases, setDomainAliases] = useState<DomainAliasItem[]>([]);
  const [newAdAlias, setNewAdAlias] = useState('');
  const [newAdTarget, setNewAdTarget] = useState('');
  const [showAdModal, setShowAdModal] = useState(false);

  // Mailboxes State
  const [mailboxes, setMailboxes] = useState<MailboxItem[]>([]);
  const [newMbUser, setNewMbUser] = useState('');
  const [newMbDom, setNewMbDom] = useState('');
  const [newMbName, setNewMbName] = useState('');
  const [newMbPass, setNewMbPass] = useState('');
  const [newMbQuota, setNewMbQuota] = useState(1024);
  const [newMbScheme, setNewMbScheme] = useState('SSHA512');
  const [showMbModal, setShowMbModal] = useState(false);

  // Password Reset State
  const [showResetPassModal, setShowResetPassModal] = useState(false);
  const [resetMbEmail, setResetMbEmail] = useState('');
  const [resetNewPass, setResetNewPass] = useState('');
  const [resetMbScheme, setResetMbScheme] = useState('SSHA512');
  const [showPlainPassword, setShowPlainPassword] = useState(false);

  // Email Aliases State
  const [aliases, setAliases] = useState<AliasItem[]>([]);
  const [newAlAddress, setNewAlAddress] = useState('');
  const [newAlGoto, setNewAlGoto] = useState('');
  const [showAlModal, setShowAlModal] = useState(false);

  const fetchDomains = async () => {
    try {
      const res = await fetch('/api/vmail/domains');
      const data = await res.json();
      if (data.success) setDomains(data.domains || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDomainAliases = async () => {
    try {
      const res = await fetch('/api/vmail/alias-domains');
      const data = await res.json();
      if (data.success) setDomainAliases(data.alias_domains || data.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMailboxes = async () => {
    try {
      const res = await fetch('/api/vmail/mailboxes');
      const data = await res.json();
      if (data.success) setMailboxes(data.mailboxes || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAliases = async () => {
    try {
      const res = await fetch('/api/vmail/aliases');
      const data = await res.json();
      if (data.success) setAliases(data.aliases || data.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const refreshAll = () => {
    fetchDomains();
    fetchDomainAliases();
    fetchMailboxes();
    fetchAliases();
  };

  useEffect(() => {
    refreshAll();
  }, []);

  // Handlers - Domains
  const handleCreateDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/vmail/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomName, description: newDomDesc, maxquota: newDomQuota })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        setShowDomModal(false);
        setNewDomName('');
        setNewDomDesc('');
        fetchDomains();
      } else {
        onShowAlert(data.message, 'danger');
      }
    } catch (err: any) {
      onShowAlert(err.message, 'danger');
    }
  };

  const handleDeleteDomain = async (domain: string) => {
    if (!confirm(`Remover o domínio virtual "${domain}" e todas as suas contas/aliases associadas do MariaDB vmail?`)) return;
    try {
      const res = await fetch(`/api/vmail/domains/${domain}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        refreshAll();
      }
    } catch (err: any) {
      onShowAlert(err.message, 'danger');
    }
  };

  // Handlers - Domain Aliases
  const handleCreateDomainAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdAlias || !newAdTarget) {
      onShowAlert('Informe o domínio alias e o domínio de destino.', 'danger');
      return;
    }
    try {
      const res = await fetch('/api/vmail/alias-domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias_domain: newAdAlias, target_domain: newAdTarget })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        setShowAdModal(false);
        setNewAdAlias('');
        setNewAdTarget('');
        fetchDomainAliases();
      } else {
        onShowAlert(data.message, 'danger');
      }
    } catch (err: any) {
      onShowAlert(err.message, 'danger');
    }
  };

  const handleToggleDomainAlias = async (alias_domain: string) => {
    try {
      const res = await fetch(`/api/vmail/alias-domains/${encodeURIComponent(alias_domain)}/toggle`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        fetchDomainAliases();
      }
    } catch (err: any) {
      onShowAlert(err.message, 'danger');
    }
  };

  const handleDeleteDomainAlias = async (alias_domain: string) => {
    if (!confirm(`Remover o alias de domínio "${alias_domain}"? Mensagens enviadas a este domínio não serão mais mapeadas.`)) return;
    try {
      const res = await fetch(`/api/vmail/alias-domains/${encodeURIComponent(alias_domain)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        fetchDomainAliases();
      }
    } catch (err: any) {
      onShowAlert(err.message, 'danger');
    }
  };

  // Handlers - Mailboxes
  const handleCreateMailbox = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/vmail/mailboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newMbUser,
          domain: newMbDom || (domains[0]?.domain || 'empresa.com.br'),
          name: newMbName,
          password: newMbPass,
          quota: newMbQuota,
          scheme: newMbScheme
        })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        setShowMbModal(false);
        setNewMbUser('');
        setNewMbName('');
        setNewMbPass('');
        fetchMailboxes();
        fetchDomains();
      } else {
        onShowAlert(data.message, 'danger');
      }
    } catch (err: any) {
      onShowAlert(err.message, 'danger');
    }
  };

  const handleDeleteMailbox = async (email: string) => {
    if (!confirm(`Excluir a caixa postal ${email} permanentemente do vmail?`)) return;
    try {
      const res = await fetch(`/api/vmail/mailboxes/${encodeURIComponent(email)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        fetchMailboxes();
        fetchDomains();
      }
    } catch (err: any) {
      onShowAlert(err.message, 'danger');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetNewPass.trim()) {
      onShowAlert('Informe uma nova senha para a caixa postal.', 'danger');
      return;
    }
    try {
      const res = await fetch(`/api/vmail/mailboxes/${encodeURIComponent(resetMbEmail)}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetNewPass, scheme: resetMbScheme })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        setShowResetPassModal(false);
        setResetNewPass('');
      } else {
        onShowAlert(data.message || 'Erro ao redefinir senha.', 'danger');
      }
    } catch (err: any) {
      onShowAlert(err.message, 'danger');
    }
  };

  const generateRandomPassword = () => {
    const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
    let pass = '';
    for (let i = 0; i < 16; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setResetNewPass(pass);
    setShowPlainPassword(true);
  };

  // Handlers - Email Aliases
  const handleCreateAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/vmail/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: newAlAddress, goto: newAlGoto })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        setShowAlModal(false);
        setNewAlAddress('');
        setNewAlGoto('');
        fetchAliases();
      } else {
        onShowAlert(data.message, 'danger');
      }
    } catch (err: any) {
      onShowAlert(err.message, 'danger');
    }
  };

  const handleDeleteAlias = async (address: string) => {
    if (!confirm(`Remover o alias "${address}"?`)) return;
    try {
      const res = await fetch(`/api/vmail/aliases/${encodeURIComponent(address)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        fetchAliases();
      }
    } catch (err: any) {
      onShowAlert(err.message, 'danger');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* 1. SELETOR PRINCIPAL: DOMÍNIOS vs MAILBOX */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex bg-slate-100 p-1.5 rounded-xl gap-1">
          <button
            onClick={() => setMainSection('domains')}
            className={`px-5 py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
              mainSection === 'domains'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Globe className="w-4 h-4" /> Domínios ({domains.length + domainAliases.length})
          </button>

          <button
            onClick={() => setMainSection('mailboxes')}
            className={`px-5 py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
              mainSection === 'mailboxes'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Mail className="w-4 h-4" /> Mailbox ({mailboxes.length + aliases.length})
          </button>
        </div>

        <button
          onClick={refreshAll}
          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium self-end sm:self-auto"
          title="Recarregar Dados"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO 1: DOMÍNIOS (Domínios Virtuais Registrados & Aliases de Domínio)     */}
      {/* ========================================================================= */}
      {mainSection === 'domains' && (
        <div className="space-y-4">
          
          {/* Sub-abas de Domínios */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              onClick={() => setDomainSubTab('registered_domains')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                domainSubTab === 'registered_domains'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Globe className="w-4 h-4 text-blue-400" /> Domínios Virtuais Registrados ({domains.length})
            </button>
            <button
              onClick={() => setDomainSubTab('domain_aliases')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                domainSubTab === 'domain_aliases'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ArrowRightLeft className="w-4 h-4 text-emerald-400" /> Aliases de Domínio ({domainAliases.length})
            </button>
          </div>

          {/* Sub-Aba A: Domínios Virtuais Registrados */}
          {domainSubTab === 'registered_domains' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-600" /> Domínios Virtuais Registrados
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Tabela <code>domain</code> do MariaDB vmail (Postfix Virtual Mailbox Domains)
                  </p>
                </div>
                <button
                  onClick={() => setShowDomModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center gap-2 shrink-0"
                >
                  <Plus className="w-4 h-4" /> Novo Domínio Virtual
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                      <th className="px-6 py-3.5">Domínio</th>
                      <th className="px-6 py-3.5">Descrição</th>
                      <th className="px-6 py-3.5">Caixas Postais</th>
                      <th className="px-6 py-3.5">Cota Máxima</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {domains.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                          Nenhum domínio virtual cadastrado no banco MariaDB.
                        </td>
                      </tr>
                    ) : (
                      domains.map((dom) => (
                        <tr key={dom.domain} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-900 font-mono text-sm">{dom.domain}</td>
                          <td className="px-6 py-4 text-slate-600">{dom.description || '-'}</td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              {dom.mailboxes} caixas
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-600 font-medium">{dom.maxquota} MB</td>
                          <td className="px-6 py-4">
                            {dom.active ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Ativo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                <XCircle className="w-3.5 h-3.5" /> Inativo
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleDeleteDomain(dom.domain)}
                              className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                              title="Excluir Domínio"
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
          )}

          {/* Sub-Aba B: Aliases de Domínio (Domain Aliases) */}
          {domainSubTab === 'domain_aliases' && (
            <div className="space-y-4">
              {/* Card Explicativo com Exemplo zrti.tech -> zrti.com.br */}
              <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 flex items-start gap-3.5">
                <div className="p-2 bg-blue-600 text-white rounded-lg shrink-0 mt-0.5 shadow-sm">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div className="text-xs text-blue-950 leading-relaxed">
                  <span className="font-bold text-sm text-blue-900 block mb-0.5">O que são Aliases de Domínio (Domain Aliases)?</span>
                  Permitem que um domínio secundário (ex: <code className="font-bold bg-white px-1.5 py-0.5 rounded border border-blue-300 text-blue-800">zrti.tech</code>) 
                  seja mapeado diretamente para um domínio virtual principal (ex: <code className="font-bold bg-white px-1.5 py-0.5 rounded border border-blue-300 text-blue-800">zrti.com.br</code>).
                  Dessa forma, todos os colaboradores recebem e enviam e-mails por ambos os domínios sem necessidade de criar caixas postais duplicadas.
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                      <ArrowRightLeft className="w-5 h-5 text-emerald-600" /> Aliases de Domínio Registrados
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Tabela <code>alias_domain</code> do MariaDB vmail
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setNewAdTarget(domains[0]?.domain || '');
                      setShowAdModal(true);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center gap-2 shrink-0"
                  >
                    <Plus className="w-4 h-4" /> Novo Alias de Domínio
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                        <th className="px-6 py-3.5">Domínio Alias (Espelho)</th>
                        <th className="px-6 py-3.5">Mapeado Para (Domínio Alvo)</th>
                        <th className="px-6 py-3.5">Comportamento de Entrega</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {domainAliases.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                            Nenhum alias de domínio configurado. Clique no botão acima para adicionar.
                          </td>
                        </tr>
                      ) : (
                        domainAliases.map((ad) => (
                          <tr key={ad.alias_domain} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-6 py-4 font-bold text-slate-900 font-mono text-sm">
                              @{ad.alias_domain}
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-mono text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 font-semibold text-xs inline-flex items-center gap-1">
                                <ArrowRightLeft className="w-3 h-3 text-blue-500" /> @{ad.target_domain}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500">
                              Ex: <code>usuario@{ad.alias_domain}</code> ➔ entrega em <code>usuario@{ad.target_domain}</code>
                            </td>
                            <td className="px-6 py-4">
                              <button
                                onClick={() => handleToggleDomainAlias(ad.alias_domain)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                  ad.active
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                }`}
                              >
                                {ad.active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                                {ad.active ? 'Ativo' : 'Inativo'}
                              </button>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => handleDeleteDomainAlias(ad.alias_domain)}
                                className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                                title="Remover Alias de Domínio"
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
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* SEÇÃO 2: MAILBOX (Vmail Mailbox & Aliases de E-mail)                      */}
      {/* ========================================================================= */}
      {mainSection === 'mailboxes' && (
        <div className="space-y-4">
          
          {/* Sub-abas de Mailbox */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              onClick={() => setMailboxSubTab('mailboxes_list')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                mailboxSubTab === 'mailboxes_list'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Mail className="w-4 h-4 text-blue-400" /> Vmail Mailbox (Caixas Postais) ({mailboxes.length})
            </button>
            <button
              onClick={() => setMailboxSubTab('email_aliases')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                mailboxSubTab === 'email_aliases'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Split className="w-4 h-4 text-purple-400" /> Aliases de E-mail (Redirecionamentos) ({aliases.length})
            </button>
          </div>

          {/* Sub-Aba 1: Vmail Mailboxes (Caixas Postais) */}
          {mailboxSubTab === 'mailboxes_list' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Mail className="w-5 h-5 text-blue-600" /> Caixas Postais Virtuais
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Tabela <code>mailbox</code> do MariaDB com suporte a hashes de senha Dovecot ({'{SSHA512}'}, {'{BCRYPT}'})
                  </p>
                </div>
                <button
                  onClick={() => {
                    setNewMbDom(domains[0]?.domain || '');
                    setShowMbModal(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center gap-2 shrink-0"
                >
                  <Plus className="w-4 h-4" /> Nova Caixa Postal
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                      <th className="px-6 py-3.5">E-mail (Username)</th>
                      <th className="px-6 py-3.5">Nome de Exibição</th>
                      <th className="px-6 py-3.5">Diretório Maildir</th>
                      <th className="px-6 py-3.5">Cota</th>
                      <th className="px-6 py-3.5">Domínio</th>
                      <th className="px-6 py-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {mailboxes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                          Nenhuma caixa postal encontrada no banco de dados.
                        </td>
                      </tr>
                    ) : (
                      mailboxes.map((mb) => (
                        <tr key={mb.username} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-900 font-mono text-sm">{mb.username}</td>
                          <td className="px-6 py-4 text-slate-600">{mb.name || '-'}</td>
                          <td className="px-6 py-4 font-mono text-xs text-slate-500 bg-slate-50/50 px-2 py-1 rounded w-fit">{mb.maildir}</td>
                          <td className="px-6 py-4 text-slate-700 font-medium">
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3.5 h-3.5 text-slate-400" /> {mb.quota} MB
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-500 text-xs font-mono">{mb.domain}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setResetMbEmail(mb.username);
                                  setResetNewPass('');
                                  setShowPlainPassword(false);
                                  setShowResetPassModal(true);
                                }}
                                className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors border border-amber-200/60 flex items-center gap-1 text-xs font-semibold px-2.5"
                                title="Redefinir Senha da Caixa Postal"
                              >
                                <KeyRound className="w-3.5 h-3.5" /> Senha
                              </button>
                              <button
                                onClick={() => handleDeleteMailbox(mb.username)}
                                className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                                title="Remover Caixa Postal"
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
          )}

          {/* Sub-Aba 2: Aliases de E-mail (Redirecionamentos) */}
          {mailboxSubTab === 'email_aliases' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Split className="w-5 h-5 text-purple-600" /> Aliases de E-mail (Redirecionamentos de Contas)
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Tabela <code>alias</code> / <code>forwardings</code> do MariaDB vmail
                  </p>
                </div>
                <button
                  onClick={() => setShowAlModal(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center gap-2 shrink-0"
                >
                  <Plus className="w-4 h-4" /> Novo Alias de E-mail
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                      <th className="px-6 py-3.5">Endereço Alias</th>
                      <th className="px-6 py-3.5">Destino(s) (goto / forwardings)</th>
                      <th className="px-6 py-3.5">Domínio</th>
                      <th className="px-6 py-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {aliases.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                          Nenhum alias de e-mail registrado. Clique no botão acima para adicionar.
                        </td>
                      </tr>
                    ) : (
                      aliases.map((al) => (
                        <tr key={al.address} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-900 font-mono text-sm">{al.address}</td>
                          <td className="px-6 py-4">
                            <span className="font-mono text-xs text-purple-700 bg-purple-50 px-2.5 py-1 rounded-md border border-purple-200 font-medium">
                              {al.goto}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-500 text-xs font-mono">{al.domain}</td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleDeleteAlias(al.address)}
                              className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                              title="Remover Alias"
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
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAIS                                                                    */}
      {/* ========================================================================= */}

      {/* Modal 1: Criar Domínio Virtual */}
      {showDomModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="font-bold text-lg text-slate-900 mb-1">Adicionar Novo Domínio Virtual</h3>
            <p className="text-xs text-slate-500 mb-4">Insira o domínio no MariaDB vmail (tabela <code>domain</code>)</p>
            
            <form onSubmit={handleCreateDomain} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Nome do Domínio</label>
                <input
                  type="text"
                  required
                  placeholder="ex: zrti.com.br"
                  value={newDomName}
                  onChange={(e) => setNewDomName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Descrição</label>
                <input
                  type="text"
                  placeholder="ex: Domínio Corporativo Matriz"
                  value={newDomDesc}
                  onChange={(e) => setNewDomDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Cota Máxima Total (MB)</label>
                <input
                  type="number"
                  value={newDomQuota}
                  onChange={(e) => setNewDomQuota(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDomModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm"
                >
                  Salvar Domínio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Criar Alias de Domínio (Domain Alias) */}
      {showAdModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-900">Novo Alias de Domínio</h3>
                <p className="text-xs text-slate-500">Mapeamento de domínio espelho no Postfix</p>
              </div>
            </div>

            <form onSubmit={handleCreateDomainAlias} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Domínio Alias (Espelho)</label>
                <input
                  type="text"
                  required
                  placeholder="ex: zrti.tech"
                  value={newAdAlias}
                  onChange={(e) => setNewAdAlias(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">O domínio secundário que receberá e encaminhará mensagens.</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Domínio Alvo (Destino Principal)</label>
                <select
                  required
                  value={newAdTarget}
                  onChange={(e) => setNewAdTarget(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {domains.map((d) => (
                    <option key={d.domain} value={d.domain}>
                      {d.domain} ({d.mailboxes} caixas)
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400 mt-1 block">As contas deste domínio atenderão automaticamente o domínio alias.</span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAdModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-sm"
                >
                  Criar Alias de Domínio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Criar Mailbox */}
      {showMbModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="font-bold text-lg text-slate-900 mb-1">Nova Caixa Postal (vmail)</h3>
            <p className="text-xs text-slate-500 mb-4">Criação de usuário na tabela <code>mailbox</code> do MariaDB</p>
            
            <form onSubmit={handleCreateMailbox} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Usuário / Local-part</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: wilker.oliveira"
                    value={newMbUser}
                    onChange={(e) => setNewMbUser(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Domínio</label>
                  <select
                    value={newMbDom}
                    onChange={(e) => setNewMbDom(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {domains.map((d) => (
                      <option key={d.domain} value={d.domain}>
                        @{d.domain}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Nome Completo</label>
                <input
                  type="text"
                  placeholder="ex: Wilker Oliveira"
                  value={newMbName}
                  onChange={(e) => setNewMbName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Senha (Criptografada no Dovecot)</label>
                <input
                  type="password"
                  required
                  placeholder="Senha forte para a conta"
                  value={newMbPass}
                  onChange={(e) => setNewMbPass(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Cota (MB)</label>
                  <input
                    type="number"
                    value={newMbQuota}
                    onChange={(e) => setNewMbQuota(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Esquema Hash</label>
                  <select
                    value={newMbScheme}
                    onChange={(e) => setNewMbScheme(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="SSHA512">SSHA512 (Padrão)</option>
                    <option value="SHA512-CRYPT">SHA512-CRYPT</option>
                    <option value="BCRYPT">BCRYPT</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowMbModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm"
                >
                  Criar Caixa Postal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Redefinir Senha da Mailbox */}
      {showResetPassModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-900">Redefinir Senha da Caixa Postal</h3>
                <p className="text-xs text-slate-500">Atualiza o hash na tabela <code>mailbox</code> do MariaDB</p>
              </div>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Caixa Postal (E-mail)</label>
                <input
                  type="text"
                  disabled
                  value={resetMbEmail}
                  className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-800 font-mono font-bold cursor-not-allowed"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase">Nova Senha</label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold hover:underline flex items-center gap-1"
                  >
                    Gerar Senha Forte
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPlainPassword ? 'text' : 'password'}
                    required
                    placeholder="Digite ou gere a nova senha"
                    value={resetNewPass}
                    onChange={(e) => setResetNewPass(e.target.value)}
                    className="w-full px-3.5 py-2.5 pr-10 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPlainPassword(!showPlainPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPlainPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Esquema de Criptografia Dovecot</label>
                <select
                  value={resetMbScheme}
                  onChange={(e) => setResetMbScheme(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="SSHA512">SSHA512 (Padrão Dovecot - Recomendado)</option>
                  <option value="SHA512-CRYPT">SHA512-CRYPT</option>
                  <option value="BCRYPT">BCRYPT (Blowfish)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowResetPassModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold shadow-sm flex items-center gap-1.5"
                >
                  <KeyRound className="w-4 h-4" /> Redefinir Senha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 5: Criar Alias de E-mail */}
      {showAlModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="font-bold text-lg text-slate-900 mb-1">Novo Alias de E-mail</h3>
            <p className="text-xs text-slate-500 mb-4">Redirecionamento virtual na tabela <code>alias</code> do MariaDB</p>
            
            <form onSubmit={handleCreateAlias} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Endereço Alias</label>
                <input
                  type="text"
                  required
                  placeholder="ex: vendas@zrti.com.br"
                  value={newAlAddress}
                  onChange={(e) => setNewAlAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Destinatário(s) / Goto (Separar por vírgula se múltiplos)</label>
                <input
                  type="text"
                  required
                  placeholder="ex: wilker.oliveira@zrti.com.br, andreza.carvalho@zrti.com.br"
                  value={newAlGoto}
                  onChange={(e) => setNewAlGoto(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAlModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold shadow-sm"
                >
                  Salvar Alias de E-mail
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
