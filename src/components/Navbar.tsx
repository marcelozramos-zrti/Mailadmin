import React from 'react';
import { Mail, Shield, Server, Terminal, Code, Cpu } from 'lucide-react';
import { ServicesMap, ServiceStatus } from '../types';

interface NavbarProps {
  activeTab: 'dashboard' | 'spam' | 'logs' | 'export';
  setActiveTab: (tab: 'dashboard' | 'spam' | 'logs' | 'export') => void;
  services: ServicesMap;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, services }) => {
  const allActive = Object.values(services).length > 0 && (Object.values(services) as ServiceStatus[]).every(s => s.active);

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Platform Info */}
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg text-white shadow-sm">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-tight">MailAdmin Web</span>
                <span className="bg-slate-800 text-slate-300 text-xs px-2 py-0.5 rounded border border-slate-700 font-mono">
                  Debian / Ubuntu
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Postfix • Amavis • SpamAssassin • ClamAV</p>
            </div>
          </div>

          {/* Quick Status Pill */}
          <div className="hidden md:flex items-center space-x-4">
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700/60 text-xs">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-300">Acesso Restrito:</span>
              <span className="font-mono text-amber-300 font-medium">VPN (Porta 5000)</span>
            </div>

            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700/60 text-xs">
              <span className={`w-2 h-2 rounded-full ${allActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
              <span className="text-slate-300">Status Geral:</span>
              <span className={`font-semibold ${allActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {allActive ? 'Todos Serviços Ativos' : 'Atenção Requerida'}
              </span>
            </div>
          </div>

        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 border-t border-slate-800 pt-2 pb-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'dashboard'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('spam')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'spam'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Regras SpamAssassin</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'logs'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Auditoria de Logs</span>
          </button>

          <button
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'export'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-amber-400/90 hover:text-amber-200 hover:bg-slate-800'
            }`}
          >
            <Code className="w-4 h-4" />
            <span>Código Python & Deploy</span>
            <span className="bg-amber-500/20 text-amber-300 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border border-amber-500/30">
              Flask
            </span>
          </button>
        </div>

      </div>
    </header>
  );
};
