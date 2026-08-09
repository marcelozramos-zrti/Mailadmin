import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { DashboardTab } from './components/DashboardTab';
import { SpamRulesTab } from './components/SpamRulesTab';
import { LogAuditTab } from './components/LogAuditTab';
import { PythonExportTab } from './components/PythonExportTab';
import { ServicesMap } from './types';
import { CheckCircle, AlertTriangle, X } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'spam' | 'logs' | 'export'>('dashboard');
  const [services, setServices] = useState<ServicesMap>({});
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);
  
  // Alert banner state
  const [alert, setAlert] = useState<{ message: string; type: 'success' | 'danger' } | null>(null);

  const showAlert = (message: string, type: 'success' | 'danger' = 'success') => {
    setAlert({ message, type });
    setTimeout(() => {
      setAlert(null);
    }, 6000);
  };

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setServices(data);
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
      const res = await fetch('/api/service/restart', {
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
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800 flex flex-col selection:bg-blue-500 selection:text-white">
      
      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        services={services}
      />

      {/* Alert / Notification Banner */}
      {alert && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full mt-4">
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-6 flex-1">
        {activeTab === 'dashboard' && (
          <DashboardTab
            services={services}
            loading={loadingStatus}
            onRefresh={fetchStatus}
            onRestartService={handleRestartService}
          />
        )}

        {activeTab === 'spam' && (
          <SpamRulesTab
            onShowAlert={showAlert}
            onRefreshStatus={fetchStatus}
          />
        )}

        {activeTab === 'logs' && <LogAuditTab />}

        {activeTab === 'export' && <PythonExportTab />}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 py-4 text-center text-xs mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Painel de Administração Interno • Postfix | Amavis | SpamAssassin | ClamAV
          </span>
          <span className="font-mono text-slate-500">
            Flask / Express API • Debian/Ubuntu Support
          </span>
        </div>
      </footer>

    </div>
  );
}
