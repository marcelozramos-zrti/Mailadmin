import React, { useState, useEffect } from 'react';
import { Code, Copy, Check, Download, FileCode, ShieldCheck, Terminal, Server, HelpCircle, Layers, Database } from 'lucide-react';
import { PythonFiles } from '../types';

export const PythonExportTab: React.FC = () => {
  const [files, setFiles] = useState<PythonFiles | null>(null);
  const [selectedFile, setSelectedFile] = useState<keyof PythonFiles>('app.py');
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetch('/api/python-files')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setFiles(data.files);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = () => {
    if (!files || !files[selectedFile]) return;
    navigator.clipboard.writeText(files[selectedFile] || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    if (!files || !files[selectedFile]) return;
    const element = document.createElement("a");
    const file = new Blob([files[selectedFile] || ''], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = selectedFile.includes('/') ? selectedFile.split('/').pop()! : selectedFile;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const getFileBadge = (key: keyof PythonFiles) => {
    switch (key) {
      case 'app.py': return 'Main Flask Application';
      case 'requirements.txt': return 'Pip Dependencies';
      case 'config.py': return 'DB & System Config';
      case 'models.py': return 'SQLAlchemy vmail Schema';
      case 'blueprints/auth_bp.py': return 'MFA TOTP Blueprint';
      case 'blueprints/vmail_bp.py': return 'Domains & Mailboxes CRUD';
      case 'blueprints/troubleshooting_bp.py': return 'Log Tracking & DNS Validator';
      case 'blueprints/services_bp.py': return 'Services & SpamAssassin Editor';
      case 'templates/index.html': return 'Bootstrap 5 SPA';
      case 'sudoers_mailadmin': return 'Sudoers Security Config';
      case 'mailadmin.service': return 'Systemd Unit File';
      case 'README_DEPLOY.md': return 'Debian/Ubuntu Deploy Guide';
      default: return 'Source Code';
    }
  };

  const fileList = [
    { key: 'app.py', label: 'app.py', icon: <FileCode className="w-4 h-4 text-blue-500" /> },
    { key: 'requirements.txt', label: 'requirements.txt', icon: <Layers className="w-4 h-4 text-indigo-500" /> },
    { key: 'config.py', label: 'config.py', icon: <FileCode className="w-4 h-4 text-cyan-500" /> },
    { key: 'models.py', label: 'models.py', icon: <Database className="w-4 h-4 text-teal-500" /> },
    { key: 'blueprints/auth_bp.py', label: 'blueprints/auth_bp.py', icon: <ShieldCheck className="w-4 h-4 text-emerald-500" /> },
    { key: 'blueprints/vmail_bp.py', label: 'blueprints/vmail_bp.py', icon: <Database className="w-4 h-4 text-blue-500" /> },
    { key: 'blueprints/troubleshooting_bp.py', label: 'blueprints/troubleshooting_bp.py', icon: <Terminal className="w-4 h-4 text-amber-500" /> },
    { key: 'blueprints/services_bp.py', label: 'blueprints/services_bp.py', icon: <Server className="w-4 h-4 text-purple-500" /> },
    { key: 'templates/index.html', label: 'templates/index.html', icon: <Code className="w-4 h-4 text-amber-500" /> },
    { key: 'sudoers_mailadmin', label: 'sudoers_mailadmin', icon: <ShieldCheck className="w-4 h-4 text-rose-500" /> },
    { key: 'mailadmin.service', label: 'mailadmin.service', icon: <Server className="w-4 h-4 text-emerald-500" /> },
    { key: 'README_DEPLOY.md', label: 'README_DEPLOY.md', icon: <Terminal className="w-4 h-4 text-purple-500" /> }
  ];

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Code className="w-6 h-6 text-amber-600" />
            <span>Código-Fonte Python Flask & Suíte Completa</span>
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Exporte os módulos organizados em Flask Blueprints, SQLAlchemy MariaDB vmail, MFA e scripts de implantação.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copiado!' : 'Copiar Código'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Baixar Arquivo</span>
          </button>
        </div>
      </div>

      {/* Main File Selector & Code Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Sidebar: File List */}
        <div className="lg:col-span-1 space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 mb-2 block">
            Módulos e Arquivos ({fileList.length}):
          </span>

          {fileList.map((f) => (
            <button
              key={f.key}
              onClick={() => setSelectedFile(f.key as keyof PythonFiles)}
              className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                selectedFile === f.key
                  ? 'bg-slate-900 text-white border-slate-800 shadow-sm font-semibold'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                {f.icon}
                <span className="text-xs font-mono truncate">{f.label}</span>
              </div>
            </button>
          ))}

          {/* Quick Technical Summary */}
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-2 mt-4">
            <div className="font-bold flex items-center gap-1.5 text-amber-900">
              <HelpCircle className="w-4 h-4 text-amber-700" />
              <span>Instruções do Sudoers</span>
            </div>
            <p className="leading-relaxed">
              O arquivo <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">/etc/sudoers.d/mailadmin</code> autoriza o usuário <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">suporte</code> a rodar <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">systemctl restart</code> e <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">postsuper/postqueue</code> sem senha.
            </p>
          </div>
        </div>

        {/* Right Code Viewer */}
        <div className="lg:col-span-3 bg-slate-950 rounded-xl border border-slate-800 shadow-md overflow-hidden flex flex-col">
          
          <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold font-mono text-slate-200">{selectedFile}</span>
              <span className="bg-slate-800 text-slate-300 text-[11px] px-2 py-0.5 rounded border border-slate-700 font-sans">
                {getFileBadge(selectedFile)}
              </span>
            </div>

            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold transition-colors border border-slate-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copiado!' : 'Copiar'}</span>
            </button>
          </div>

          <div className="p-4 font-mono text-xs leading-relaxed text-emerald-400 bg-slate-950 h-[540px] overflow-y-auto whitespace-pre select-text">
            {loading ? (
              <div className="text-slate-500 italic">Carregando arquivo...</div>
            ) : (
              files && files[selectedFile]
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
