import React from 'react';
import { X, Sparkles, Sliders, ArrowRight, Check } from 'lucide-react';

interface RuleTypeSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectType: (type: 'simple' | 'advanced') => void;
}

export const RuleTypeSelectModal: React.FC<RuleTypeSelectModalProps> = ({
  isOpen,
  onClose,
  onSelectType,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 p-5 text-white flex items-center justify-between border-b border-amber-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Criar Nova Regra de Inteligência AntiSPAM
              </h3>
              <p className="text-xs text-amber-200/90 mt-0.5">
                Selecione a modalidade da regra conforme a complexidade desejada
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content / Options */}
        <div className="p-6 space-y-4">
          {/* Opção 1: Regra Simples */}
          <div
            onClick={() => {
              onSelectType('simple');
              onClose();
            }}
            className="group relative p-4 rounded-xl border-2 border-slate-200 hover:border-amber-500 hover:bg-amber-50/40 transition-all cursor-pointer shadow-2xs"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-slate-100 group-hover:bg-amber-100 text-slate-700 group-hover:text-amber-800 rounded-xl transition-colors shrink-0">
                <Sliders className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-amber-950 transition-colors">
                    Regra Simples
                  </h4>
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 group-hover:bg-amber-200 group-hover:text-amber-900">
                    1 Condição → 1 Ação
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Avalia um único campo específico (Assunto, Corpo, Remetente, Reply-To ou URI) através de termo ou expressão regular direta.
                </p>
                <div className="mt-2 text-[11px] font-mono text-slate-500 bg-slate-50 group-hover:bg-white p-2 rounded border border-slate-200">
                  Ex: <span className="text-amber-700 font-semibold">Subject</span> contém <span className="text-blue-700">"pendência"</span> → <span className="font-bold text-rose-600">+5.0 pts</span>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-amber-600 transition-colors shrink-0 self-center" />
            </div>
          </div>

          {/* Opção 2: Regra Avançada / Composta */}
          <div
            onClick={() => {
              onSelectType('advanced');
              onClose();
            }}
            className="group relative p-4 rounded-xl border-2 border-slate-200 hover:border-indigo-600 hover:bg-indigo-50/40 transition-all cursor-pointer shadow-2xs"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-indigo-100 text-indigo-700 rounded-xl transition-colors shrink-0">
                <Sparkles className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-950 transition-colors">
                    Regra Avançada (Composta)
                  </h4>
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                    Múltiplas Condições + Contexto
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Combina contexto de tráfego (origem externa vs interna), múltiplos cabeçalhos, autenticação (SPF/DKIM) e corpo com operadores lógicos (E / OU / NÃO).
                </p>
                <div className="mt-2 text-[11px] font-mono text-slate-500 bg-slate-50 group-hover:bg-white p-2 rounded border border-slate-200">
                  Ex: SE <span className="text-indigo-700 font-semibold">Origem = Externa</span> E <span className="text-amber-700 font-semibold">From =~ Regex</span> E <span className="text-blue-700 font-semibold">Subject</span> contém "pendência" → <span className="font-bold text-rose-600">+5.0 pts</span>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0 self-center" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
