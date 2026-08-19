import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { DashboardTab } from './components/DashboardTab';
import { VmailTab } from './components/VmailTab';
import { TroubleshootingTab } from './components/TroubleshootingTab';
import { SpamRulesTab } from './components/SpamRulesTab';
import { ServersTab } from './components/ServersTab';
import { LogAuditTab } from './components/LogAuditTab';
import { PythonExportTab } from './components/PythonExportTab';
import { MfaModal } from './components/MfaModal';
import { ServicesMap, LayoutPosition } from './types';
import { CheckCircle, AlertTriangle, X } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'servers' | 'vmail' | 'troubleshooting' | 'spam' | 'logs' | 'export'>('dashboard');
  const [services, setServices] = useState<ServicesMap>({});
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);
  const [isMfaOpen, setIsMfaOpen] = useState<boolean>(false);

  // Layout customization state (Left Sidebar vs Top Navbar)
  const [layoutPosition, setLayoutPosition] = useState<LayoutPosition>(() => {
    return (localStorage.getItem('mailadmin_layout_pos') as LayoutPosition) || 'left';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Alert banner state
  const [alert, setAlert] = useState<{ message: string; type: 'success' | 'danger' } | null>(null);

  useEffect(() => {
    localStorage.setItem('mailadmin_layout_pos', layoutPosition);
  }, [layoutPosition]);

  const showAlert = (message: string, type: 'success' | 'danger' = 'success') => {
    setAlert({ message, type });
    setTimeout(() => {
      setAlert(null);
    }, 6000);
  };

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/services/status');
      if (res.ok) {
        const data = await res.json();
        setServices(data.services || data);
      }
    } catch (err) {
      console.error("Erro ao obter status dos serviços:", err);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleRestartService = async (serviceName: string) => {
    try {
      const res = await fetch('/api/services/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: serviceName })
      });
      const data = await res.json();
      if (data.success) {
        showAlert(data.message, 'success');
        fetchStatus();
      } else {
        showAlert(data.message || 'Falha ao reiniciar serviço', 'danger');
      }
    } catch (err: any) {
      showAlert('Erro na requisição: ' + err.message, 'danger');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800 flex flex-col md:flex-row selection:bg-blue-500 selection:text-white">
      
      {/* 1. Left Sidebar Navigation (When layoutPosition === 'left') */}
      {layoutPosition === 'left' && (
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          services={services}
          onOpenMfa={() => setIsMfaOpen(true)}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          layoutPosition={layoutPosition}
          setLayoutPosition={setLayoutPosition}
        />
      )}

      {/* Main Content Area Container */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        
        {/* Top Header / Navbar */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          services={services}
          onOpenMfa={() => setIsMfaOpen(true)}
          layoutPosition={layoutPosition}
          setLayoutPosition={setLayoutPosition}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
        />

        {/* Alert / Notification Banner */}
        {alert && (
          <div className={`${layoutPosition === 'top' ? 'max-w-7xl mx-auto' : 'w-full'} px-4 sm:px-6 lg:px-8 mt-4`}>
            <div
              className={`p-4 rounded-xl border flex items-center justify-between shadow-sm transition-all ${
                alert.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-3">
                {alert.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                )}
                <span className="text-sm font-medium">{alert.message}</span>
              </div>

              <button
                onClick={() => setAlert(null)}
                className="p-1 hover:bg-black/5 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 opacity-70" />
              </button>
            </div>
          </div>
        )}

        {/* Main Content View */}
        <main className={`${layoutPosition === 'top' ? 'max-w-7xl mx-auto' : 'w-full'} px-4 sm:px-6 lg:px-8 py-6 flex-1`}>
          {activeTab === 'dashboard' && (
            <DashboardTab
              services={services}
              loading={loadingStatus}
              onRefresh={fetchStatus}
              onRestartService={handleRestartService}
              onNavigateToServers={() => setActiveTab('servers')}
              onNavigateToSpam={() => setActiveTab('spam')}
            />
          )}

          {activeTab === 'servers' && (
            <ServersTab
              services={services}
              onShowAlert={showAlert}
              onRefreshStatus={fetchStatus}
              onNavigateToSpamIntelligence={() => setActiveTab('spam')}
            />
          )}

          {activeTab === 'vmail' && <VmailTab onShowAlert={showAlert} />}

          {activeTab === 'troubleshooting' && <TroubleshootingTab onShowAlert={showAlert} />}

          {activeTab === 'spam' && (
            <SpamRulesTab
              onShowAlert={showAlert}
              onRefreshStatus={fetchStatus}
            />
          )}

          {activeTab === 'logs' && <LogAuditTab />}

          {activeTab === 'export' && <PythonExportTab />}
        </main>

        {/* MFA Setup Modal */}
        <MfaModal
          isOpen={isMfaOpen}
          onClose={() => setIsMfaOpen(false)}
          onShowAlert={showAlert}
        />

        {/* Footer */}
        <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 py-4 text-center text-xs mt-auto">
          <div className={`${layoutPosition === 'top' ? 'max-w-7xl mx-auto' : 'w-full'} px-4 flex flex-col sm:flex-row items-center justify-between gap-2`}>
            <span>
              MailAdmin Suite • Postfix | MariaDB vmail | Amavis | SpamAssassin | ClamAV
            </span>
            <span className="font-mono text-slate-500">
              Python Flask + Blueprints • Debian/Ubuntu Production Ready
            </span>
          </div>
        </footer>

      </div>

    </div>
  );
}
