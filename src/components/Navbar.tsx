import React from 'react';
import { ServicesMap, LayoutPosition } from '../types';
import { Server, Mail, Wrench, Shield, Terminal, Download, ShieldCheck, LayoutGrid, PanelLeft, Settings, Users } from 'lucide-react';

interface NavbarProps {
  activeTab: 'dashboard' | 'servers' | 'vmail' | 'troubleshooting' | 'spam' | 'logs' | 'export' | 'settings' | 'usuarios';
  setActiveTab: (tab: 'dashboard' | 'servers' | 'vmail' | 'troubleshooting' | 'spam' | 'logs' | 'export' | 'settings' | 'usuarios') => void;
  services: ServicesMap;
  onOpenMfa: () => void;
  layoutPosition: LayoutPosition;
  setLayoutPosition: (pos: LayoutPosition) => void;
  collapsed?: boolean;
  setCollapsed?: (collapsed: boolean) => void;
}

export function Navbar({
  activeTab,
  setActiveTab,
  services,
  onOpenMfa,
  layoutPosition,
  setLayoutPosition,
  collapsed,
  setCollapsed
}: NavbarProps) {
  const postfixActive = services['postfix']?.active;
  const amavisActive = services['amavis']?.active;
  const clamActive = services['clamav-daemon']?.active;
  const spamActive = services['spamassassin']?.active;

  const allActive = postfixActive && amavisActive && clamActive && spamActive;

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md">
      <div className={`${layoutPosition === 'top' ? 'max-w-7xl mx-auto' : 'w-full'} px-4 sm:px-6 lg:px-8`}>
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Title (Only shown in Top layout or when Sidebar collapsed) */}
          <div className="flex items-center gap-3">
            {layoutPosition === 'left' && setCollapsed && (
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="p-2 hover:bg-slate-800 text-slate-300 rounded-lg transition-colors md:hidden"
                title="Toggle Sidebar"
              >
                <PanelLeft className="w-5 h-5" />
              </button>
            )}

            {(layoutPosition === 'top' || collapsed) && (
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 p-2 rounded-xl text-white shadow-lg shadow-blue-500/20">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg tracking-tight">MailAdmin</span>
                    <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Suite v1.1.0
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 hidden sm:block">
                    Postfix • MariaDB vmail • Amavis • SpamAssassin
                  </p>
                </div>
              </div>
            )}

            {layoutPosition === 'left' && !collapsed && (
              <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
                <span className="font-medium text-slate-200 uppercase tracking-wider text-[11px] font-mono">
                  Painel de Controle do Servidor
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400">Debian 12 / Linux Kernel 6.1</span>
              </div>
            )}
          </div>

          {/* Navigation Links (When in Top layout) */}
          {layoutPosition === 'top' && (
            <nav className="hidden md:flex items-center gap-1">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'dashboard'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Server className="w-4 h-4" />
                Dashboard
              </button>

              <button
                onClick={() => setActiveTab('servers')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'servers'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                Servidores
              </button>

              <button
                onClick={() => setActiveTab('vmail')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'vmail'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Mail className="w-4 h-4" />
                Domínios & Contas
              </button>

              <button
                onClick={() => setActiveTab('troubleshooting')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'troubleshooting'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Wrench className="w-4 h-4" />
                Troubleshooting
              </button>

              <button
                onClick={() => setActiveTab('spam')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'spam'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Shield className="w-4 h-4" />
                Regras Spam
              </button>

              <button
                onClick={() => setActiveTab('logs')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'logs'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Terminal className="w-4 h-4" />
                Logs
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'settings'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Settings className="w-4 h-4" />
                Configurações
              </button>

              <button
                onClick={() => setActiveTab('usuarios')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'usuarios'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Users className="w-4 h-4" />
                Usuários
              </button>

              <button
                onClick={() => setActiveTab('export')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'export'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Download className="w-4 h-4" />
                Código Python
              </button>
            </nav>
          )}

          {/* Right Controls (MFA, Layout Toggle, Service Badge) */}
          <div className="flex items-center gap-2.5">
            {/* Position Layout Switch Button */}
            <button
              onClick={() => setLayoutPosition(layoutPosition === 'top' ? 'left' : 'top')}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5"
              title={layoutPosition === 'top' ? 'Mudar para Menu Lateral Esquerdo' : 'Mudar para Navegação Superior'}
            >
              <LayoutGrid className="w-4 h-4 text-blue-400" />
              <span className="hidden sm:inline">
                {layoutPosition === 'top' ? 'Menu Esquerda' : 'Menu Topo'}
              </span>
            </button>

            {layoutPosition === 'top' && (
              <button
                onClick={onOpenMfa}
                className="bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" /> Configurar MFA
              </button>
            )}

            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700 text-xs">
              <span className={`w-2 h-2 rounded-full ${allActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-slate-300 font-medium hidden sm:inline">
                {allActive ? 'Serviços 100% OK' : 'Alerta de Serviços'}
              </span>
            </div>
          </div>

        </div>
      </div>
    </header>
  );
}
