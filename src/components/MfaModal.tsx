import React, { useState } from 'react';
import { QrCode, ShieldCheck, KeyRound, X, CheckCircle2 } from 'lucide-react';

interface MfaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowAlert: (msg: string, type?: 'success' | 'danger') => void;
}

export function MfaModal({ isOpen, onClose, onShowAlert }: MfaModalProps) {
  const [loading, setLoading] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [otpSecret, setOtpSecret] = useState<string>('');
  const [tokenInput, setTokenInput] = useState('');

  const fetchMfaSetup = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/mfa/setup');
      const data = await res.json();
      if (data.success) {
        setQrCodeData(data.qr_code_base64);
        setOtpSecret(data.otp_secret);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      fetchMfaSetup();
    }
  }, [isOpen]);

  const handleEnableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenInput.length !== 6) {
      onShowAlert('Insira o código TOTP de 6 dígitos.', 'danger');
      return;
    }

    try {
      const res = await fetch('/api/auth/mfa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput })
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert(data.message, 'success');
        onClose();
      } else {
        onShowAlert(data.message, 'danger');
      }
    } catch (err: any) {
      onShowAlert(err.message, 'danger');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
        
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <h3 className="font-semibold text-lg">Autenticação MFA (TOTP)</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 text-center">
          <p className="text-xs text-slate-600 mb-4">
            Escaneie o QR Code abaixo usando o aplicativo <strong>Google Authenticator</strong> ou <strong>Authy</strong> no celular:
          </p>

          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl inline-flex items-center justify-center mb-4 min-h-[180px] min-w-[180px]">
            {loading || !qrCodeData ? (
              <div className="text-slate-400 text-xs flex flex-col items-center gap-2">
                <QrCode className="w-8 h-8 animate-pulse text-blue-500" /> Gerando QR Code TOTP...
              </div>
            ) : (
              <img src={qrCodeData} alt="MFA QR Code" className="w-44 h-44 rounded" />
            )}
          </div>

          <div className="mb-4">
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Chave Secreta Manual</label>
            <div className="flex items-center justify-center gap-2 bg-slate-100 p-2 rounded-lg font-mono text-xs text-slate-800 font-bold tracking-widest">
              <KeyRound className="w-4 h-4 text-slate-500" />
              {otpSecret || 'JBSWY3DPEHPK3PXP'}
            </div>
          </div>

          <form onSubmit={handleEnableMfa} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Digite o token de 6 dígitos gerado no app:
              </label>
              <input
                type="text"
                required
                maxLength={6}
                placeholder="000000"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center text-2xl font-mono tracking-[0.5em] py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" /> Ativar MFA
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}
