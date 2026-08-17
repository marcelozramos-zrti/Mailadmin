import React from 'react';
import { ServicesMap, LayoutPosition } from '../types';
import { 
  Server, Mail, Wrench, Shield, Terminal, Download, ShieldCheck, 
  ChevronLeft, ChevronRight, LayoutGrid, Settings, HardDrive, Cpu, 
  Activity, CheckCircle2, AlertTriangle, Layers
} from 'lucide-react';

interface SidebarProps {
  activeTab: 'dashboard' | 'vmail' | 'troubleshooting' | 'spam' | 'logs' | 'export';
  setActiveTab: (tab: 'dashboard' | 'vmail' | 'troubleshooting' | 'spam' | 'logs' | 'export') => void;
  services: ServicesMap;
  onOpenMfa: () => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  layoutPosition: LayoutPosition;
  setLayoutPosition: (pos: LayoutPosition) => void;
}

export function Sidebar({
  activeTab,
  setActiveTab,
  services,
  onOpenMfa,
  collapsed,
  setCollapsed,
  layoutPosition,
  setLayoutPosition
}: SidebarProps) {
  const postfixActive = services['postfix']?.active;
  const amavisActive = services['amavis']?.active;
  const clamActive = services['clamav-daemon']?.active;
  const spamActive = services['spamassassin']?.active;
  const allActive = postfixActive && amavisActive && clamActive && spamActive;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Server, badge: 'Hardware & Status' },
    { id: 'vmail', label: 'Domínios & Contas', icon: Mail, badge: 'MariaDB vmail' },
    { id: 'troubleshooting', label: 'Troubleshooting', icon: Wrench, badge: 'Logs & DNS' },
    { id: 'spam', label: 'Regras Spam', icon: Shield, badge: 'SpamAssassin' },
    { id: 'logs', label: 'Audit Logs', icon: Terminal, badge: 'Tempo Real' },
    { id: 'export', label: 'Código Python', icon: Download, badge: 'Flask Suite' },
  ] as const;

  return (
    <aside
      className={`bg-slate-900 text-white border-r border-slate-800 flex flex-col justify-between transition-all duration-300 z-30 shrink-0 select-none ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Top Header Logo */}
      <div>
        <div className="p-4 border-b border-slate-800 flex items-center justify-between h-16">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-500/20 shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            {!collapsed && (
              <div className="truncate">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-base tracking-tight text-white">MailAdmin</span>
                  <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[9px] font-extrabold px-1.5 py-0.2 rounded uppercase">
                    v1.1.0
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate">Debian/Ubuntu Server</p>
              </div>
            )}
          </div>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors hidden md:block"
            title={collapsed ? "Expandir Menu" : "Recolher Menu"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Status Pill Badge */}
        {!collapsed && (
          <div className="p-3 mx-3 my-3 bg-slate-950/70 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${allActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-xs font-medium text-slate-300">
                {allActive ? 'Serviços 100% On' : 'Alerta nos Serviços'}
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
              4/4 SVC
            </span>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="p-3 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group relative ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                
                {!collapsed && (
                  <div className="flex items-center justify-between flex-1 truncate">
                    <span className="truncate">{item.label}</span>
                    {isActive && (
                      <span className="text-[9px] bg-blue-700/80 text-blue-100 px-1.5 py-0.5 rounded font-mono">
                        Ativo
                      </span>
                    )}
                  </div>
                )}

                {/* Tooltip for Collapsed Mode */}
                {collapsed && (
                  <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
                    {item.label}
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer Controls */}
      <div className="p-3 border-t border-slate-800 space-y-2">
        {/* Layout Switcher (Menu Lateral vs Superior) */}
        {!collapsed && (
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
              <span className="flex items-center gap-1.5 text-slate-300">
                <LayoutGrid className="w-3.5 h-3.5 text-blue-400" /> Posicionamento
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-1.5 text-[10px] font-semibold">
              <button
                onClick={() => setLayoutPosition('left')}
                className={`py-1.5 px-2 rounded-lg border transition-all flex items-center justify-center gap-1 ${
                  layoutPosition === 'left'
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                }`}
              >
                Esquerda
              </button>
              <button
                onClick={() => setLayoutPosition('top')}
                className={`py-1.5 px-2 rounded-lg border transition-all flex items-center justify-center gap-1 ${
                  layoutPosition === 'top'
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                }`}
              >
                Topo
              </button>
            </div>
          </div>
        )}

        {/* MFA Button */}
        <button
          onClick={onOpenMfa}
          className={`w-full bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 text-xs py-2 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
            collapsed ? 'px-0' : 'px-3'
          }`}
          title="Configurar MFA TOTP"
        >
          <ShieldCheck className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Configurar MFA</span>}
        </button>

        {!collapsed && (
          <div className="pt-1 text-[10px] font-mono text-slate-500 text-center">
            Postfix • MariaDB vmail
          </div>
        )}
      </div>
    </aside>
  );
}
