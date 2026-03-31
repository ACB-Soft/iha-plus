import React from 'react';
import Header from './Header';
import GlobalFooter from './GlobalFooter';

interface Props {
  onBack: () => void;
  onTypeSelect: (type: 'Normal' | 'Strip') => void;
}

const GCPAreaTypeSelection: React.FC<Props> = ({ onBack, onTypeSelect }) => {
  return (
    <div className="w-full h-full flex flex-col bg-slate-200 overflow-hidden animate-in fade-in">
      <Header title="Alan Tipi Seçimi" onBack={onBack} />
      
      <div className="flex-1 p-6 flex flex-col justify-start gap-4 pt-8">
        <button 
          onClick={() => onTypeSelect('Normal')}
          className="group relative bg-white p-5 rounded-[32px] border-2 border-transparent hover:border-blue-500 transition-all shadow-xl shadow-slate-300/50 active:scale-95 text-left overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <i className="fas fa-th text-7xl"></i>
          </div>
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200 shrink-0">
              <i className="fas fa-th text-xl"></i>
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Normal Alan</h3>
              <p className="text-xs text-slate-500 mt-0.5 font-medium leading-tight">Geniş ve toplu araziler için idealdir. Izgara tabanlı homojen dağılım sağlar.</p>
            </div>
          </div>
        </button>

        <button 
          onClick={() => onTypeSelect('Strip')}
          className="group relative bg-white p-5 rounded-[32px] border-2 border-transparent hover:border-emerald-500 transition-all shadow-xl shadow-slate-300/50 active:scale-95 text-left overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <i className="fas fa-route text-7xl"></i>
          </div>
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200 shrink-0">
              <i className="fas fa-route text-xl"></i>
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Şeritvari Alan</h3>
              <p className="text-xs text-slate-500 mt-0.5 font-medium leading-tight">Yol, dere ve koridorlar için idealdir. Eksen takibi ve hassas mesafe sağlar.</p>
            </div>
          </div>
        </button>

        {/* KML Plus Tanıtım */}
        <div className="mt-4 pt-4 border-t border-slate-300/50">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center mb-4">Tahdit Dosyanız Yok mu?</p>
          
          <button 
            onClick={() => window.open('https://acb-soft.github.io/KML-Plus/', '_blank')}
            className="w-full group relative bg-gradient-to-br from-blue-600 to-blue-700 p-6 rounded-[32px] shadow-2xl shadow-blue-400/30 active:scale-95 text-left overflow-hidden border border-blue-500/50"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <i className="fas fa-external-link-alt text-7xl text-white"></i>
            </div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white uppercase tracking-tight">KML Plus</h3>
                <span className="px-2 py-0.5 bg-white/20 backdrop-blur-sm text-[8px] font-black text-white rounded-full tracking-widest border border-white/30">ACB SOFTWARE</span>
              </div>
              <p className="text-xs text-blue-100 mt-0.5 font-medium leading-tight">Hızlıca KML/KMZ tahdit dosyası oluşturmak için yardımcı uygulamayı kullanın.</p>
            </div>
          </button>
        </div>
      </div>
      <GlobalFooter />
    </div>
  );
};

export default GCPAreaTypeSelection;
