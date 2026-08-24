import React, { useState } from 'react';
import { BRAND_NAME } from '../version';
import { LanguageSelector } from './LanguageSelector';

interface Props {
  onSelectFlightType: (type: 'Normal' | 'Strip') => void;
  onShowHelp: () => void;
  onShowSettings: () => void;
  onShowPresetTemplates: () => void;
  onShowControlFlight: () => void;
}

const Dashboard: React.FC<Props> = ({ onSelectFlightType, onShowHelp, onShowSettings, onShowPresetTemplates, onShowControlFlight }) => {
  const [logoError, setLogoError] = useState(false);

  return (
    <div className="flex-1 flex flex-col bg-slate-200 animate-in px-8 pt-20 md:pt-28 justify-start relative">
      {/* Dil Seçici - Sol Üst Köşe */}
      <div className="absolute top-6 left-8 z-20">
        <LanguageSelector />
      </div>

      {/* Ayarlar ve Yardım Butonları - Sağ Üst Köşe */}
      <div className="absolute top-6 right-8 z-20 flex gap-3">
        {/* Ayarlar Butonu */}
        <button 
          onClick={onShowSettings}
          className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center shadow-xl border border-blue-200 text-slate-600 active:scale-90 transition-all hover:bg-blue-100 group"
          title="Ayarlar"
        >
          <i className="fas fa-cog text-xl group-hover:text-blue-600 transition-colors"></i>
        </button>

        {/* Yardım Butonu (Glow Efektli) */}
        <div className="relative">
          <div className="absolute inset-0 bg-blue-400 rounded-2xl blur-xl opacity-20 animate-pulse"></div>
          <button 
            onClick={onShowHelp}
            className="relative w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center shadow-xl border border-blue-200 text-blue-600 active:scale-90 transition-all hover:bg-blue-100 group"
            title="Yardım"
          >
            <i className="fas fa-question text-xl font-black group-hover:text-amber-500 transition-colors stroke-current stroke-2" style={{ WebkitTextStroke: '1px' }}></i>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-600 rounded-full border-2 border-white animate-bounce"></div>
          </button>
        </div>
      </div>

      {/* Header - Logo ve Marka Bilgisi */}
      <header className="flex flex-col items-center shrink-0 mb-8 md:mb-12">
        <div className="space-y-2 md:space-y-3 text-center">
          <p className="text-slate-900 font-black text-[12px] md:text-[14px] uppercase tracking-[0.18em] leading-tight max-w-[260px] mx-auto opacity-80">
            Mobil Cihazlarınız için<br/>Uçuş Planlama Uygulaması
          </p>
          <div className="flex items-center justify-center gap-2.5 md:gap-3">
            {!logoError ? (
              <img 
                src="./favicon.svg" 
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src.includes('./favicon.svg')) {
                    target.src = '/favicon.svg';
                  } else {
                    setLogoError(true);
                  }
                }}
                alt="iHA Plus Logo" 
                className="h-11 w-11 md:h-14 md:w-14 object-contain filter drop-shadow-md shrink-0"
              />
            ) : (
              <div className="h-11 w-11 md:h-14 md:w-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0">
                <i className="fas fa-plane text-2xl"></i>
              </div>
            )}
            <h1 className="text-5xl md:text-6xl font-black text-blue-600 tracking-tighter leading-none">
              {BRAND_NAME}
            </h1>
          </div>
        </div>
      </header>

      <main className="w-full max-w-sm md:max-w-md mx-auto flex flex-col space-y-2.5">
        {/* Normal Alan Haritalama */}
        <button 
          onClick={() => onSelectFlightType('Normal')}
          className="w-full h-[58px] md:h-[64px] px-3.5 md:px-4.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all flex items-center justify-between group relative overflow-hidden border border-white/10 shrink-0"
        >
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30 shrink-0 shadow-inner">
              <i className="fas fa-draw-polygon text-base md:text-lg text-white"></i>
            </div>
            <div className="flex flex-col text-left leading-none min-w-0">
              <span className="text-[13px] md:text-[15px] font-black tracking-tight leading-tight uppercase truncate">NORMAL ALAN HARİTALAMA</span>
              <span className="text-[11px] md:text-xs font-medium text-white/80 leading-tight truncate mt-0.5">Poligon tabanlı alan uçuşu</span>
            </div>
          </div>
          <i className="fas fa-chevron-right text-white/50 group-hover:translate-x-1 transition-transform text-sm shrink-0"></i>
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-6 -mt-6 blur-xl pointer-events-none"></div>
        </button>

        {/* Şeritvari Alan Haritalama */}
        <button 
          onClick={() => onSelectFlightType('Strip')}
          className="w-full h-[58px] md:h-[64px] px-3.5 md:px-4.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all flex items-center justify-between group relative overflow-hidden border border-white/10 shrink-0"
        >
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30 shrink-0 shadow-inner">
              <i className="fas fa-route text-base md:text-lg text-white"></i>
            </div>
            <div className="flex flex-col text-left leading-none min-w-0">
              <span className="text-[13px] md:text-[15px] font-black tracking-tight leading-tight uppercase truncate">ŞERİTVARİ ALAN HARİTALAMA</span>
              <span className="text-[11px] md:text-xs font-medium text-white/80 leading-tight truncate mt-0.5">Çizgi tabanlı koridor uçuşu</span>
            </div>
          </div>
          <i className="fas fa-chevron-right text-white/50 group-hover:translate-x-1 transition-transform text-sm shrink-0"></i>
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-6 -mt-6 blur-xl pointer-events-none"></div>
        </button>

        {/* Kontrol Uçuşu Planlama */}
        <button 
          onClick={onShowControlFlight}
          className="w-full h-[58px] md:h-[64px] px-3.5 md:px-4.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-2xl shadow-lg shadow-cyan-600/20 active:scale-[0.98] transition-all flex items-center justify-between group relative overflow-hidden border border-white/10 shrink-0"
        >
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30 shrink-0 shadow-inner">
              <i className="fas fa-clipboard-check text-base md:text-lg text-white"></i>
            </div>
            <div className="flex flex-col text-left leading-none min-w-0">
              <span className="text-[13px] md:text-[15px] font-black tracking-tight leading-tight uppercase truncate">KONTROL UÇUŞU PLANLAMA</span>
              <span className="text-[11px] md:text-xs font-medium text-white/80 leading-tight truncate mt-0.5">Doğrulama ve kalite kontrol uçuşu</span>
            </div>
          </div>
          <i className="fas fa-chevron-right text-white/50 group-hover:translate-x-1 transition-transform text-sm shrink-0"></i>
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-6 -mt-6 blur-xl pointer-events-none"></div>
        </button>

        {/* Hazır YKN Şablonları */}
        <button 
          onClick={onShowPresetTemplates}
          className="w-full h-[58px] md:h-[64px] px-3.5 md:px-4.5 bg-slate-600 hover:bg-slate-700 text-white rounded-2xl shadow-lg shadow-slate-600/20 active:scale-[0.98] transition-all flex items-center justify-between group relative overflow-hidden border border-white/10 shrink-0"
        >
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/20 shrink-0 shadow-inner">
              <i className="fas fa-crosshairs text-base md:text-lg text-white"></i>
            </div>
            <div className="flex flex-col text-left leading-none min-w-0">
              <span className="text-[13px] md:text-[15px] font-black tracking-tight leading-tight uppercase truncate">HAZIR YKN ŞABLONLARI</span>
              <span className="text-[11px] md:text-xs font-medium text-slate-300 leading-tight truncate mt-0.5">YKN şablonu üret ve indir</span>
            </div>
          </div>
          <i className="fas fa-chevron-right text-white/50 group-hover:translate-x-1 transition-transform text-sm shrink-0"></i>
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-6 -mt-6 blur-xl pointer-events-none"></div>
        </button>
      </main>
    </div>
  );
};


export default Dashboard;