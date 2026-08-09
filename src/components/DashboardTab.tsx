import React, { useState } from 'react';
import { Send, Filter, Bug, RefreshCw, Power, CheckCircle, XCircle, Activity, Layers, ShieldAlert, Cpu } from 'lucide-react';
import { ServicesMap } from '../types';

interface DashboardTabProps {
  services: ServicesMap;
  loading: boolean;
  onRefresh: () => void;
  onRestartService: (serviceName: string) => Promise<void>;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  services,
  loading,
  onRefresh,
  onRestartService
}) => {
  const [restarting, setRestarting] = useState<string | null>(null);

  const handleRestart = async (svc: string) => {
    setRestarting(svc);
    await onRestartService(svc);
    setRestarting(null);
  };

  const getServiceInfo = (key: string) => {
    switch (key) {
      case 'postfix':
        return {
          name: 'Postfix (MTA)',
          icon: <Send className="w-5 h-5 text-blue-500" />,
          desc: 'Servidor principal de envio e recebimento de e-mails via SMTP.',
          port: 'Portas 25, 465, 587'
        };
      case 'amavis':
        return {
          name: 'Amavis (Content Filter)',
          icon: <Filter className="w-5 h-5 text-amber-500" />,
          desc: 'Interface de verificação de conteúdo intermediária entre Postfix e SpamAssassin/ClamAV.',
          port: 'Porta 10024'
        };
      case 'clamav-daemon':
        return {
          name: 'ClamAV Daemon',
          icon: <Bug className="w-5 h-5 text-rose-500" />,
          desc: 'Motor antivírus de alta performance para escaneamento de anexos maliciosos.',
          port: 'Socket UNIX / TCP 3310'
        };
      case 'spamassassin':
      default:
        return {
          name: 'SpamAssassin Engine',
          icon: <ShieldAlert className="w-5 h-5 text-purple-500" />,
          desc: 'Mecanismo de análise heurística, Bayes, regras de pontuação e listas RBL.',
          port: 'Módulo SpamD'
        };
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Welcome Banner */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span>Visão Geral do Servidor de E-mail</span>
            <span className="bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full border border-blue-200 font-mono">
              Debian/Ubuntu Server
            </span>
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Monitoramento de serviços em tempo real e controle operacional do ambiente de mensageria.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors border border-slate-300"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar Status</span>
          </button>
        </div>
      </div>

      {/* Global Actions Cards */}
      <div className="bg-slate-900 text-white rounded-xl p-6 border border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Power className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-slate-100">Ações Globais de Reinicialização</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">Execução via sudo systemctl restart</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <button
            onClick={() => handleRestart('postfix')}
            disabled={restarting === 'postfix'}
            className="flex items-center justify-between px-4 py-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 rounded-lg text-blue-200 transition-all font-medium text-sm group"
          >
            <div className="flex items-center gap-2.5">
              <Send className="w-4 h-4 text-blue-400" />
              <span>Reiniciar Postfix</span>
            </div>
            <RefreshCw className={`w-4 h-4 text-blue-400 group-hover:rotate-180 transition-transform ${restarting === 'postfix' ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => handleRestart('amavis')}
            disabled={restarting === 'amavis'}
            className="flex items-center justify-between px-4 py-3 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 rounded-lg text-amber-200 transition-all font-medium text-sm group"
          >
            <div className="flex items-center gap-2.5">
              <Filter className="w-4 h-4 text-amber-400" />
              <span>Reiniciar Amavis</span>
            </div>
            <RefreshCw className={`w-4 h-4 text-amber-400 group-hover:rotate-180 transition-transform ${restarting === 'amavis' ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => handleRestart('clamav-daemon')}
            disabled={restarting === 'clamav-daemon'}
            className="flex items-center justify-between px-4 py-3 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 rounded-lg text-rose-200 transition-all font-medium text-sm group"
          >
            <div className="flex items-center gap-2.5">
              <Bug className="w-4 h-4 text-rose-400" />
              <span>Reiniciar ClamAV</span>
            </div>
            <RefreshCw className={`w-4 h-4 text-rose-400 group-hover:rotate-180 transition-transform ${restarting === 'clamav-daemon' ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {['postfix', 'amavis', 'clamav-daemon'].map((svcKey) => {
          const info = getServiceInfo(svcKey);
          const status = services[svcKey] || { active: false, state: 'desconhecido' };
          const isBusy = restarting === svcKey;

          return (
            <div key={svcKey} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
              
              {/* Header */}
              <div className="p-5 border-b border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      {info.icon}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-base">{info.name}</h4>
                      <span className="text-xs font-mono text-slate-400">{info.port}</span>
                    </div>
                  </div>

                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                    status.active
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    {status.active ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Rodando</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Parado</span>
                      </>
                    )}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed min-h-[36px]">
                  {info.desc}
                </p>
              </div>

              {/* Body / Actions */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500 font-mono">
                  State: <span className="font-semibold text-slate-700">{status.state}</span>
                </div>

                <button
                  onClick={() => handleRestart(svcKey)}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition-colors shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isBusy ? 'animate-spin' : ''}`} />
                  <span>Reiniciar</span>
                </button>
              </div>

            </div>
          );
        })}
      </div>

      {/* Metrics & Queue Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium">Fila Postfix (Active / Deferred)</span>
            <div className="text-2xl font-bold text-slate-800 font-mono mt-0.5">0 / 0 msgs</div>
            <span className="text-[11px] text-emerald-600 font-medium">✔ Fila limpa sem atrasos</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium">Filtro de Conteúdo Amavis</span>
            <div className="text-2xl font-bold text-slate-800 font-mono mt-0.5">99.4% Eficiência</div>
            <span className="text-[11px] text-slate-500">SpamAssassin + ClamAV online</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium">Processador do Servidor</span>
            <div className="text-2xl font-bold text-slate-800 font-mono mt-0.5">0.12 Load Avg</div>
            <span className="text-[11px] text-slate-500">Memória RAM: 1.4GB / 4.0GB</span>
          </div>
        </div>

      </div>

    </div>
  );
};
