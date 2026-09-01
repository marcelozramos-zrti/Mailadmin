import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Server, 
  Shield, 
  Key, 
  Database, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Lock, 
  Globe, 
  FileText, 
  Clock, 
  HardDrive,
  Cpu,
  Mail,
  Zap
} from 'lucide-react';
import { SystemConfigSettings } from '../types';

interface SettingsTabProps {
  onShowAlert: (msg: string, type: 'success' | 'danger') => void;
}

export function SettingsTab({ onShowAlert }: SettingsTabProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [reloadingService, setReloadingService] = useState<string | null>(null);

  const [settings, setSettings] = useState<SystemConfigSettings>({
    server_hostname: 'brsaolxmail.zrti.com.br',
    server_ip: '177.153.61.166',
    message_size_limit_mb: 50,
    mailbox_size_limit_mb: 5120,
    relayhost: '',
    tls_security_level: 'may',
    spam_required_score: 5.0,
    spam_auto_learn: true,
    clamav_scan_enabled: true,
    clamav_max_scan_size_mb: 25,
    log_ingestion_interval_min: 5,
    log_retention_days: 7,
    log_auto_truncate: true,
    log_safety_backup: true,
    cert_domain: 'brsaolxmail.zrti.com.br',
    cert_issuer: "Let's Encrypt Authority X3",
    cert_valid_until: '2026-11-30'
  });

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.settings) {
          setSettings(data.settings);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar configurações:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert("Configurações salvas com sucesso no servidor!", "success");
      } else {
        onShowAlert(data.message || "Erro ao salvar configurações", "danger");
      }
    } catch (err: any) {
      onShowAlert(err.message || "Falha na comunicação com o servidor", "danger");
    } finally {
      setSaving(false);
    }
  };

  const handleReloadService = async (serviceName: string) => {
    setReloadingService(serviceName);
    try {
      const res = await fetch(`/api/services/${serviceName}/restart`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onShowAlert(`Serviço ${serviceName} recarregado com sucesso!`, "success");
      } else {
        onShowAlert(data.message || `Erro ao recarregar ${serviceName}`, "danger");
      }
    } catch (err: any) {
      onShowAlert(err.message || "Erro de rede", "danger");
    } finally {
      setReloadingService(null);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-6 text-white shadow-md border border-slate-700/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="p-2 bg-blue-600/30 rounded-xl text-blue-400 border border-blue-500/30">
              <Settings className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Configurações Gerais do Sistema</h1>
            <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2.5 py-0.5 rounded-full font-mono border border-emerald-500/30">
              Produção Online
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Parâmetros operacionais do MTA Postfix, limites de anexos, filtragem Amavis/ClamAV, retenção de log e certificados SSL/TLS.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchSettings}
            disabled={loading}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 text-blue-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Recarregar</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* Bloco 1: MTA Postfix & Rede */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 mb-5">
            <Mail className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-base font-bold text-slate-800">Parâmetros do MTA Postfix</h2>
              <p className="text-xs text-slate-500">Configurações de rede, host e limites de tráfego de correio eletrônico</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Hostname do Servidor (myhostname)</label>
              <input
                type="text"
                value={settings.server_hostname}
                onChange={(e) => setSettings({ ...settings, server_hostname: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
              <span className="text-[10px] text-slate-500 mt-1 block">FQDN principal configurado no main.cf</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">IP Público do Servidor</label>
              <input
                type="text"
                value={settings.server_ip}
                onChange={(e) => setSettings({ ...settings, server_ip: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
              <span className="text-[10px] text-slate-500 mt-1 block">IP de saída para PTR/rDNS</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Tamanho Máx. Anexo (MB)</label>
              <input
                type="number"
                value={settings.message_size_limit_mb}
                onChange={(e) => setSettings({ ...settings, message_size_limit_mb: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                min={1}
                max={100}
                required
              />
              <span className="text-[10px] text-slate-500 mt-1 block">message_size_limit (padrão: 50MB)</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Quota Padrão de Caixa (MB)</label>
              <input
                type="number"
                value={settings.mailbox_size_limit_mb}
                onChange={(e) => setSettings({ ...settings, mailbox_size_limit_mb: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                min={500}
                max={50000}
                required
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Quota inicial para novas contas vmail</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Relayhost Opcional (SmartHost)</label>
              <input
                type="text"
                value={settings.relayhost}
                onChange={(e) => setSettings({ ...settings, relayhost: e.target.value })}
                placeholder="[smtp.sendgrid.net]:587"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Deixe em branco para entrega direta via MX</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Segurança TLS SMTP (smtp_tls_security_level)</label>
              <select
                value={settings.tls_security_level}
                onChange={(e) => setSettings({ ...settings, tls_security_level: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="may">may (Opportunistic TLS - Recomendado)</option>
                <option value="encrypt">encrypt (Obrigatório / Strict)</option>
                <option value="dane">dane (DNSSEC / DANE)</option>
              </select>
              <span className="text-[10px] text-slate-500 mt-1 block">Criptografia em trânsito com STARTTLS</span>
            </div>
          </div>
        </div>

        {/* Bloco 2: AntiSpam, Heurística & ClamAV */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 mb-5">
            <Shield className="w-5 h-5 text-purple-600" />
            <div>
              <h2 className="text-base font-bold text-slate-800">Filtragem de Conteúdo & AntiSpam</h2>
              <p className="text-xs text-slate-500">Parâmetros do SpamAssassin, Bayes e motor Antivírus ClamAV</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Score de Corte SpamAssassin (required_score)</label>
              <input
                type="number"
                step="0.5"
                value={settings.spam_required_score}
                onChange={(e) => setSettings({ ...settings, spam_required_score: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                min={1.0}
                max={15.0}
                required
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Mensagens acima deste score são marcadas/rejeitadas</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Tamanho Máx. Escaneamento ClamAV (MB)</label>
              <input
                type="number"
                value={settings.clamav_max_scan_size_mb}
                onChange={(e) => setSettings({ ...settings, clamav_max_scan_size_mb: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                min={5}
                max={50}
                required
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Limite para extração e varredura de arquivos .zip/.exe</span>
            </div>

            <div className="flex flex-col justify-center space-y-3 pt-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.spam_auto_learn}
                  onChange={(e) => setSettings({ ...settings, spam_auto_learn: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-xs font-bold text-slate-700">Auto-aprendizado Bayes (bayes_auto_learn)</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.clamav_scan_enabled}
                  onChange={(e) => setSettings({ ...settings, clamav_scan_enabled: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-xs font-bold text-slate-700">Varredura ClamAV Ativa em Anexos</span>
              </label>
            </div>
          </div>
        </div>

        {/* Bloco 3: Banco de Dados, Retenção de Logs & Ingestão */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 mb-5">
            <Database className="w-5 h-5 text-emerald-600" />
            <div>
              <h2 className="text-base font-bold text-slate-800">Retenção de Logs & Ingestão SQLite / MariaDB</h2>
              <p className="text-xs text-slate-500">Política de persistência de histórico para cálculo do painel de 7 dias</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Intervalo do Cron de Ingestão (Minutos)</label>
              <input
                type="number"
                value={settings.log_ingestion_interval_min}
                onChange={(e) => setSettings({ ...settings, log_ingestion_interval_min: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                min={1}
                max={60}
                required
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Frequência de parsing de /var/log/mail.log</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Janela de Retenção no Banco (Dias)</label>
              <input
                type="number"
                value={settings.log_retention_days}
                onChange={(e) => setSettings({ ...settings, log_retention_days: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                min={3}
                max={90}
                required
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Registros anteriores são expurgados automaticamente</span>
            </div>

            <div className="flex flex-col justify-center space-y-3 pt-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.log_auto_truncate}
                  onChange={(e) => setSettings({ ...settings, log_auto_truncate: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-xs font-bold text-slate-700">Expurgo Automático de Logs Antigos</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.log_safety_backup}
                  onChange={(e) => setSettings({ ...settings, log_safety_backup: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-xs font-bold text-slate-700">Backup Compactado .gz Antes do Expurgo</span>
              </label>
            </div>
          </div>
        </div>

        {/* Bloco 4: Certificados SSL/TLS Let's Encrypt */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
            <div className="flex items-center gap-2.5">
              <Lock className="w-5 h-5 text-amber-600" />
              <div>
                <h2 className="text-base font-bold text-slate-800">Certificados de Segurança TLS (Certbot)</h2>
                <p className="text-xs text-slate-500">Criptografia RSA 2048-bit para Postfix, Dovecot e Webmail</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold font-mono">
              Válido até {settings.cert_valid_until}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-slate-500 block mb-1">Domínio do Certificado:</span>
              <strong className="text-slate-900">{settings.cert_domain}</strong>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-slate-500 block mb-1">Autoridade Certificadora:</span>
              <strong className="text-slate-900">{settings.cert_issuer}</strong>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-slate-500 block mb-1">Caminho /etc/letsencrypt:</span>
              <strong className="text-slate-900">/etc/letsencrypt/live/{settings.cert_domain}/fullchain.pem</strong>
            </div>
          </div>
        </div>

        {/* Action Bottom Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleReloadService('postfix')}
              disabled={reloadingService === 'postfix'}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all border border-slate-300"
            >
              {reloadingService === 'postfix' ? 'Recarregando...' : 'Recarregar Postfix'}
            </button>
            <button
              type="button"
              onClick={() => handleReloadService('amavis')}
              disabled={reloadingService === 'amavis'}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all border border-slate-300"
            >
              {reloadingService === 'amavis' ? 'Recarregando...' : 'Recarregar Amavis'}
            </button>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/20 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Salvando Configurações...' : 'Salvar e Aplicar no Servidor'}</span>
          </button>
        </div>

      </form>

    </div>
  );
}
