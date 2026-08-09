import React, { useState, useEffect } from 'react';
import { DomainItem, MailboxItem, AliasItem } from '../types';
import { Globe, Mail, Split, Plus, Trash2, CheckCircle2, XCircle, HardDrive, KeyRound } from 'lucide-react';

interface VmailTabProps {
  onShowAlert: (msg: string, type?: 'success' | 'danger') => void;
}

export function VmailTab({ onShowAlert }: VmailTabProps) {
  const [subTab, setSubTab] = useState<'domains' | 'mailboxes' | 'aliases'>('domains');
  
  // Domains State
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [newDomName, setNewDomName] = useState('');
  const [newDomDesc, setNewDomDesc] = useState('');
  const [newDomQuota, setNewDomQuota] = useState(10240);
  const [showDomModal, setShowDomModal] = useState(false);

  // Mailboxes State
  const [mailboxes, setMailboxes] = useState<MailboxItem[]>([]);
  const [newMbUser, setNewMbUser] = useState('');
  const [newMbDom, setNewMbDom] = useState('');
  const [newMbName, setNewMbName] = useState('');
  const [newMbPass, setNewMbPass] = useState('');
  const [newMbQuota, setNewMbQuota] = useState(1024);
  const [newMbScheme, setNewMbScheme] = useState('SSHA512');
  const [showMbModal, setShowMbModal] = useState(false);

  // Aliases State
  const [aliases, setAliases] = useState<AliasItem[]>([]);
  const [newAlAddress, setNewAlAddress] = useState('');
  const [newAlGoto, setNewAlGoto] = useState('');
  const [showAlModal, setShowAlModal] = useState(false);

  const fetchDomains = async () => {
    try {
      const res = await fetch('/api/vmail/domains');
      const data = await res.json();
      if (data.success) setDomains(data.domains);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMailboxes = async () => {
    try {
      const res = await fetch('/api/vmail/mailboxes');
      const data = await res.json();
      if (data.success) setMailboxes(data.mailboxes);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAliases = async () => {
    try {
      const res = await fetch('/api/vmail/aliases');
      const data = await res.json();
      if (data.success) setAliases(data.aliases);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDomains();
    fetchMailboxes();
    fetchAliases();
  }, []);

  // Handlers
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
    if (!confirm(`Remover o domínio ${domain} e todas as suas contas associadas do MariaDB vmail?`)) return;
    try {
      const res = await fetch(`/api/vmail/domains/${domain}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        fetchDomains();
        fetchMailboxes();
        fetchAliases();
      }
    } catch (err: any) {
      onShowAlert(err.message, 'danger');
    }
  };

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
    if (!confirm(`Excluir a caixa postal ${email}?`)) return;
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
    if (!confirm(`Remover o alias ${address}?`)) return;
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
      {/* Sub-navigation */}
      <div className="flex bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm w-fit gap-1">
        <button
          onClick={() => setSubTab('domains')}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
            subTab === 'domains' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Globe className="w-4 h-4" /> Domínios ({domains.length})
        </button>
        <button
          onClick={() => setSubTab('mailboxes')}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
            subTab === 'mailboxes' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Mail className="w-4 h-4" /> Caixas Postais ({mailboxes.length})
        </button>
        <button
          onClick={() => setSubTab('aliases')}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
            subTab === 'aliases' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Split className="w-4 h-4" /> Aliases ({aliases.length})
        </button>
      </div>

      {/* 1. TAB DOMÍNIOS */}
      {subTab === 'domains' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-600" /> Domínios Virtuais
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Tabela <code>domain</code> do MariaDB vmail
              </p>
            </div>
            <button
              onClick={() => setShowDomModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Novo Domínio
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="px-6 py-3">Domínio</th>
                  <th className="px-6 py-3">Descrição</th>
                  <th className="px-6 py-3">Caixas</th>
                  <th className="px-6 py-3">Cota Máxima</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {domains.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                      Nenhum domínio cadastrado no banco.
                    </td>
                  </tr>
                ) : (
                  domains.map((dom) => (
                    <tr key={dom.domain} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-900">{dom.domain}</td>
                      <td className="px-6 py-4 text-slate-600">{dom.description || '-'}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          {dom.mailboxes}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{dom.maxquota} MB</td>
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

      {/* 2. TAB CAIXAS POSTAIS */}
      {subTab === 'mailboxes' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-600" /> Caixas Postais
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Tabela <code>mailbox</code> do MariaDB com suporte a hashes de senha Dovecot ({'{SSHA512}'}, {'{BCRYPT}'})
              </p>
            </div>
            <button
              onClick={() => setShowMbModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Nova Caixa Postal
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="px-6 py-3">E-mail</th>
                  <th className="px-6 py-3">Nome</th>
                  <th className="px-6 py-3">Diretório Maildir</th>
                  <th className="px-6 py-3">Cota</th>
                  <th className="px-6 py-3">Domínio</th>
                  <th className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {mailboxes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                      Nenhuma caixa postal encontrada.
                    </td>
                  </tr>
                ) : (
                  mailboxes.map((mb) => (
                    <tr key={mb.username} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-900">{mb.username}</td>
                      <td className="px-6 py-4 text-slate-600">{mb.name || '-'}</td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">{mb.maildir}</td>
                      <td className="px-6 py-4 text-slate-600 font-medium">
                        <span className="flex items-center gap-1">
                          <HardDrive className="w-3.5 h-3.5 text-slate-400" /> {mb.quota} MB
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500">{mb.domain}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDeleteMailbox(mb.username)}
                          className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                          title="Remover Caixa Postal"
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

      {/* 3. TAB ALIASES */}
      {subTab === 'aliases' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Split className="w-5 h-5 text-blue-600" /> Aliases (Redirecionamentos)
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Tabela <code>alias</code> do MariaDB vmail
              </p>
            </div>
            <button
              onClick={() => setShowAlModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Novo Alias
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="px-6 py-3">Endereço Alias</th>
                  <th className="px-6 py-3">Destino (goto)</th>
                  <th className="px-6 py-3">Domínio</th>
                  <th className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {aliases.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                      Nenhum alias registrado.
                    </td>
                  </tr>
                ) : (
                  aliases.map((al) => (
                    <tr key={al.address} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-900">{al.address}</td>
                      <td className="px-6 py-4 font-mono text-xs text-blue-600 bg-blue-50/50 px-2 py-1 rounded w-fit">{al.goto}</td>
                      <td className="px-6 py-4 text-slate-500">{al.domain}</td>
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

      {/* Modal Criar Domínio */}
      {showDomModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="font-semibold text-lg text-slate-900 mb-4">Adicionar Novo Domínio</h3>
            <form onSubmit={handleCreateDomain} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Nome do Domínio</label>
                <input
                  type="text"
                  required
                  placeholder="ex: empresa.com.br"
                  value={newDomName}
                  onChange={(e) => setNewDomName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Descrição</label>
                <input
                  type="text"
                  placeholder="ex: Domínio Filial Rio"
                  value={newDomDesc}
                  onChange={(e) => setNewDomDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Cota Máxima (MB)</label>
                <input
                  type="number"
                  value={newDomQuota}
                  onChange={(e) => setNewDomQuota(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDomModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                >
                  Salvar Domínio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Criar Mailbox */}
      {showMbModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="font-semibold text-lg text-slate-900 mb-4">Nova Caixa Postal (vmail)</h3>
            <form onSubmit={handleCreateMailbox} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">E-mail / Usuário</label>
                <input
                  type="text"
                  required
                  placeholder="ex: joao@empresa.com.br"
                  value={newMbUser}
                  onChange={(e) => setNewMbUser(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Nome Completo</label>
                <input
                  type="text"
                  placeholder="ex: João da Silva"
                  value={newMbName}
                  onChange={(e) => setNewMbName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Senha (Será gerado Hash Dovecot)</label>
                <input
                  type="password"
                  required
                  value={newMbPass}
                  onChange={(e) => setNewMbPass(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Cota (MB)</label>
                  <input
                    type="number"
                    value={newMbQuota}
                    onChange={(e) => setNewMbQuota(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Esquema Hash</label>
                  <select
                    value={newMbScheme}
                    onChange={(e) => setNewMbScheme(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="SSHA512">SSHA512 (Dovecot)</option>
                    <option value="SHA512-CRYPT">SHA512-CRYPT</option>
                    <option value="BCRYPT">BCRYPT</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMbModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                >
                  Criar Caixa Postal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Criar Alias */}
      {showAlModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="font-semibold text-lg text-slate-900 mb-4">Novo Redirecionamento (Alias)</h3>
            <form onSubmit={handleCreateAlias} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Endereço do Alias</label>
                <input
                  type="text"
                  required
                  placeholder="ex: vendas@empresa.com.br"
                  value={newAlAddress}
                  onChange={(e) => setNewAlAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Destino / Goto (Separado por vírgula)</label>
                <input
                  type="text"
                  required
                  placeholder="ex: joao@empresa.com.br, maria@empresa.com.br"
                  value={newAlGoto}
                  onChange={(e) => setNewAlGoto(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAlModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                >
                  Salvar Alias
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
