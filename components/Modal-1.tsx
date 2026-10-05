import React from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  confirmLabel?: string;
  onConfirm?: () => void;
  type?: 'info' | 'error' | 'success' | 'confirm';
}

const Modal: React.FC<Props> = ({ isOpen, onClose, title, children, confirmLabel, onConfirm, type = 'info' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${
              type === 'error' ? 'bg-red-50 text-red-600' :
              type === 'success' ? 'bg-emerald-50 text-emerald-600' :
              type === 'confirm' ? 'bg-amber-50 text-amber-600' :
              'bg-blue-50 text-blue-600'
            }`}>
              <i className={`fas ${
                type === 'error' ? 'fa-triangle-exclamation' :
                type === 'success' ? 'fa-circle-check' :
                type === 'confirm' ? 'fa-circle-question' :
                'fa-circle-info'
              } text-2xl`}></i>
            </div>
            <div>
              <h3 className="text-slate-900 font-black uppercase tracking-tight text-lg leading-tight">
                {title}
              </h3>
            </div>
          </div>
          
          <div className="space-y-4 text-[13px] font-bold text-slate-600 leading-snug">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              {children}
            </div>
            
            <div className="pt-2 flex gap-3">
              {onConfirm && (
                <button 
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-[13px] uppercase tracking-[0.2em] active:scale-95 transition-all shadow-xl shadow-blue-200"
                >
                  {confirmLabel || 'Tamam'}
                </button>
              )}
              <button 
                onClick={onClose}
                className={`flex-1 py-4 rounded-2xl font-black text-[13px] uppercase tracking-[0.2em] active:scale-95 transition-all ${
                  onConfirm ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white shadow-xl shadow-blue-200'
                }`}
              >
                {onConfirm ? 'İptal' : 'Kapat'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
