import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Shield, 
  Key, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Lock, 
  ShieldCheck, 
  ShieldAlert, 
  X, 
  Check, 
  UserCheck, 
  UserX,
  Mail,
  Fingerprint
} from 'lucide-react';
import { AdminUserItem } from '../types';

interface UsersTabProps {
  onShowAlert: (msg: string, type: 'success' | 'danger') => void;
}

export function UsersTab({ onShowAlert }: UsersTabProps) {
  const [admins, setAdmins] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState<boolean>(false);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminUserItem | null>(null);

  // Form states
  const [newUsername, setNewUsername] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [newRole, setNewRole] = useState<'superadmin' | 'admin' | 'operator' | 'readonly'>('admin');
  const [newEmail, setNewEmail] = useState<string>('');
  
  // Password change state
  const [changePasswordVal, setChangePasswordVal] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/admins');
      const data = await res.json();
      if (data.success && data.admins) {
        setAdmins(data.admins);
      }
    } catch (err) {
      console.error("Erro ao carregar administradores:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) {
      onShowAlert("Preencha nome de usuário e senha.", "danger");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
          email: newEmail
        })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert("Novo administrador criado com sucesso!", "success");
        setIsAddModalOpen(false);
        setNewUsername('');
        setNewPassword('');
        setNewEmail('');
        fetchAdmins();
      } else {
        onShowAlert(data.message || "Erro ao criar administrador", "danger");
      }
    } catch (err: any) {
      onShowAlert(err.message || "Erro na conexão", "danger");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmin || !changePasswordVal || changePasswordVal.length < 6) {
      onShowAlert("A senha deve ter no mínimo 6 caracteres.", "danger");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/admins/${selectedAdmin.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: changePasswordVal })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(`Senha do usuário ${selectedAdmin.username} atualizada com sucesso!`, "success");
        setIsPasswordModalOpen(false);
        setChangePasswordVal('');
        setSelectedAdmin(null);
      } else {
        onShowAlert(data.message || "Erro ao alterar senha", "danger");
      }
    } catch (err: any) {
      onShowAlert(err.message || "Erro na conexão", "danger");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleMfa = async (admin: AdminUserItem) => {
    try {
      const res = await fetch(`/api/auth/admins/${admin.id}/toggle-mfa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable: !admin.mfa_enabled })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(`MFA 2FA ${!admin.mfa_enabled ? 'ativado' : 'desativado'} para ${admin.username}`, "success");
        fetchAdmins();
      } else {
        onShowAlert(data.message || "Erro ao alterar status MFA", "danger");
      }
    } catch (err: any) {
      onShowAlert(err.message || "Erro na conexão", "danger");
    }
  };

  const handleDeleteAdmin = async (admin: AdminUserItem) => {
    if (admin.role === 'superadmin' || admin.username === 'admin') {
      onShowAlert("Não é permitido excluir a conta SuperAdmin principal.", "danger");
      return;
    }
    if (!confirm(`Tem certeza que deseja excluir o administrador ${admin.username}?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/auth/admins/${admin.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        onShowAlert(`Administrador ${admin.username} removido.`, "success");
        fetchAdmins();
      } else {
        onShowAlert(data.message || "Erro ao excluir", "danger");
      }
    } catch (err: any) {
      onShowAlert(err.message || "Erro na conexão", "danger");
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'superadmin':
        return <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-xs font-bold font-mono">SuperAdmin</span>;
      case 'admin':
        return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-bold font-mono">Administrador</span>;
      case 'operator':
        return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold font-mono">Operador</span>;
      default:
        return <span className="px-2.5 py-1 bg-slate-50 text-slate-700 border border-slate-200 rounded-full text-xs font-bold font-mono">Read-Only</span>;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-6 text-white shadow-md border border-slate-700/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="p-2 bg-blue-600/30 rounded-xl text-blue-400 border border-blue-500/30">
              <Users className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Gestão de Usuários & Administradores</h1>
            <span className="bg-blue-500/20 text-blue-300 text-xs px-2.5 py-0.5 rounded-full font-mono border border-blue-500/30">
              RBAC & 2FA
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Controle de acesso ao painel MailAdmin. Gerencie credenciais de administradores, papéis de autorização e autenticação em dois fatores (TOTP MFA).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchAdmins}
            disabled={loading}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 text-blue-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Recarregar</span>
          </button>
          
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/20 flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            <span>Novo Administrador</span>
          </button>
        </div>
      </div>

      {/* Tabela de Usuários */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Contas Administrativas Ativas</h3>
            <p className="text-xs text-slate-500">Usuários com autorização de gerenciamento no servidor</p>
          </div>
          <span className="text-xs font-mono text-slate-500 font-semibold">
            Total: {admins.length} administradores
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="px-4 py-3 font-semibold">Usuário</th>
                <th className="px-4 py-3 font-semibold">E-mail</th>
                <th className="px-4 py-3 font-semibold">Papel (RBAC)</th>
                <th className="px-4 py-3 font-semibold text-center">Status</th>
                <th className="px-4 py-3 font-semibold text-center">Autenticação 2FA</th>
                <th className="px-4 py-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400 font-mono">
                    Nenhum administrador encontrado.
                  </td>
                </tr>
              ) : (
                admins.map((adm) => (
                  <tr key={adm.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs">
                        {adm.username.charAt(0).toUpperCase()}
                      </div>
                      <span>{adm.username}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">
                      {adm.email || `${adm.username}@zrti.com.br`}
                    </td>
                    <td className="px-4 py-3">
                      {getRoleBadge(adm.role)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[11px] font-semibold">
                        Ativo
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleMfa(adm)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1.5 mx-auto ${
                          adm.mfa_enabled
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                        title={adm.mfa_enabled ? 'Clique para desativar 2FA' : 'Clique para ativar 2FA'}
                      >
                        <Fingerprint className="w-3.5 h-3.5" />
                        <span>{adm.mfa_enabled ? '2FA Ativado' : '2FA Desativado'}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedAdmin(adm);
                            setIsPasswordModalOpen(true);
                          }}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition-all flex items-center gap-1"
                          title="Trocar senha"
                        >
                          <Key className="w-3.5 h-3.5 text-blue-600" />
                          <span>Senha</span>
                        </button>
                        
                        {adm.role !== 'superadmin' && adm.username !== 'admin' && (
                          <button
                            onClick={() => handleDeleteAdmin(adm)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                            title="Excluir administrador"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Novo Administrador */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <span>Cadastrar Novo Administrador</span>
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome de Usuário (Login)</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="ex: operador_zrti"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">E-mail para Alertas</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="ex: operador@zrti.com.br"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Senha de Acesso</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                  minLength={6}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Papel / Nível de Acesso (RBAC)</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="admin">Administrador (Gestão de Contas e Logs)</option>
                  <option value="operator">Operador (Apenas visualização e monitoramento)</option>
                  <option value="readonly">Somente Leitura</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/20"
                >
                  {submitting ? 'Criando...' : 'Criar Administrador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Troca de Senha */}
      {isPasswordModalOpen && selectedAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Key className="w-5 h-5 text-blue-600" />
                <span>Alterar Senha</span>
              </h3>
              <button onClick={() => setIsPasswordModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                <span className="text-slate-500 block">Usuário selecionado:</span>
                <strong className="text-slate-900 font-mono text-sm">{selectedAdmin.username}</strong>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nova Senha</label>
                <input
                  type="password"
                  value={changePasswordVal}
                  onChange={(e) => setChangePasswordVal(e.target.value)}
                  placeholder="Nova senha forte"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                  minLength={6}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/20"
                >
                  {submitting ? 'Salvando...' : 'Atualizar Senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
