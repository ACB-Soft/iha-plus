import React, { useState } from 'react';
import { BRAND_NAME } from '../version';

interface Props {
  onStartFlightConfig: () => void;
  onShowFlightPlanner: () => void;
  onShowHelp: () => void;
  onShowSettings: () => void;
}

const Dashboard: React.FC<Props> = ({ onStartFlightConfig, onShowFlightPlanner, onShowHelp, onShowSettings }) => {
  return (
    <div className="flex-1 flex flex-col bg-slate-200 animate-in px-8 pt-20 md:pt-28 justify-start relative">
      {/* Dil / Bayrak - Sol Üst Köşe */}
      <div className="absolute top-6 left-8 z-20">
        <button 
          className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center shadow-xl border border-blue-200 active:scale-90 transition-all hover:bg-blue-100 overflow-hidden"
          title="Dil Değiştir"
        >
          <div className="w-8 h-6 rounded-md overflow-hidden flex items-center justify-center shadow-sm bg-white">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="6750 -25500 76500 51000" className="w-full h-full object-cover" style={{ objectPosition: '35% 50%' }}>
              <path fill="#e30a17" d="m0-30000h90000v60000H0z"/>
              <path fill="#fff" d="m41750 0 13568-4408-8386 11541V-7133l8386 11541zm925 8021a15000 15000 0 1 1 0-16042 12000 12000 0 1 0 0 16042z"/>
            </svg>
          </div>
        </button>
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

      {/* Header - Logo ve Marka Bilgisi Onboarding ile Aynı */}
      <header className="flex flex-col items-center shrink-0 mb-10 md:mb-16">
        
        <div className="space-y-2 md:space-y-3 text-center">
          <p className="text-slate-900 font-black text-[12px] md:text-[14px] uppercase tracking-[0.18em] leading-tight max-w-[260px] mx-auto opacity-80">
            Mobil Cihazlarınız için<br/>Uçuş Planlama Uygulaması
          </p>
          <h1 className="text-5xl md:text-6xl font-black text-blue-600 tracking-tighter leading-none">
            {BRAND_NAME}
          </h1>
        </div>
      </header>

      <main className="w-full max-w-sm mx-auto flex flex-col space-y-2.5 md:space-y-3">
        {/* Ana Menü - Uçuş Planlama Odaklı */}
        
        {/* Uçuş Planı Oluştur */}
        <button 
          onClick={onStartFlightConfig}
          className="w-full py-3 md:py-4 px-5 bg-emerald-600 text-white rounded-xl md:rounded-2xl shadow-lg shadow-emerald-600/30 active:scale-[0.98] transition-all flex items-center justify-between group relative overflow-hidden border border-white/10"
        >
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30">
              <i className="fas fa-file-circle-plus text-base md:text-lg text-white"></i>
            </div>
            <span className="text-sm md:text-base font-black tracking-tight leading-none uppercase text-left">uçuş planı oluştur</span>
          </div>
          <i className="fas fa-chevron-right text-white/40 group-hover:translate-x-1 transition-transform text-[10px]"></i>
          <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-6 -mt-6 blur-xl"></div>
        </button>

        {/* YKN Planı Oluştur */}
        <button 
          onClick={onShowFlightPlanner}
          className="w-full py-3 md:py-4 px-5 bg-blue-600 text-white rounded-xl md:rounded-2xl shadow-lg shadow-blue-600/30 active:scale-[0.98] transition-all flex items-center justify-between group relative overflow-hidden border border-white/10"
        >
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30">
              <i className="fas fa-file-import text-base md:text-lg text-white"></i>
            </div>
            <span className="text-sm md:text-base font-black tracking-tight leading-none uppercase text-left">ykn planı oluştur</span>
          </div>
          <i className="fas fa-chevron-right text-white/40 group-hover:translate-x-1 transition-transform text-[10px]"></i>
          <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-6 -mt-6 blur-xl"></div>
        </button>

      </main>
    </div>
  );
};

export default Dashboard;