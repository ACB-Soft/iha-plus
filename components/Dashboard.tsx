import React, { useState } from 'react';
import { BRAND_NAME } from '../version';
import { LanguageSelector } from './LanguageSelector';

interface Props {
  onSelectFlightType: (type: 'Normal' | 'Strip') => void;
  onShowHelp: () => void;
  onShowSettings: () => void;
  onShowPresetTemplates: () => void;
}

const Dashboard: React.FC<Props> = ({ onSelectFlightType, onShowHelp, onShowSettings, onShowPresetTemplates }) => {
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
            <img 
              src="./favicon.svg" 
              alt="iHA Plus Logo" 
              className="h-11 w-11 md:h-14 md:w-14 object-contain filter drop-shadow-md shrink-0"
            />
            <h1 className="text-5xl md:text-6xl font-black text-blue-600 tracking-tighter leading-none">
              {BRAND_NAME}
            </h1>
          </div>
        </div>
      </header>

      <main className="w-full max-w-sm mx-auto flex flex-col space-y-3.5 md:space-y-4">
        {/* Normal Alan Haritalama */}
        <button 
          onClick={() => onSelectFlightType('Normal')}
          className="w-full py-4.5 md:py-5 px-5 md:px-6 bg-emerald-600 text-white rounded-2xl shadow-xl shadow-emerald-600/25 active:scale-[0.98] transition-all flex items-center justify-between group relative overflow-hidden border border-white/10"
        >
          <div className="relative z-10 flex items-center gap-3.5 md:gap-4">
            <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30 shrink-0 shadow-inner">
              <i className="fas fa-draw-polygon text-lg md:text-xl text-white"></i>
            </div>
            <div className="flex flex-col text-left space-y-0.5">
              <span className="text-sm md:text-base font-black tracking-tight leading-tight uppercase">NORMAL ALAN HARİTALAMA</span>
              <span className="text-[11px] md:text-xs font-medium text-white/80 leading-tight">Poligon tabanlı alan uçuşu</span>
            </div>
          </div>
          <i className="fas fa-chevron-right text-white/50 group-hover:translate-x-1 transition-transform text-xs"></i>
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-6 -mt-6 blur-xl"></div>
        </button>

        {/* Şeritvari Alan Haritalama */}
        <button 
          onClick={() => onSelectFlightType('Strip')}
          className="w-full py-4.5 md:py-5 px-5 md:px-6 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-600/25 active:scale-[0.98] transition-all flex items-center justify-between group relative overflow-hidden border border-white/10"
        >
          <div className="relative z-10 flex items-center gap-3.5 md:gap-4">
            <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30 shrink-0 shadow-inner">
              <i className="fas fa-route text-lg md:text-xl text-white"></i>
            </div>
            <div className="flex flex-col text-left space-y-0.5">
              <span className="text-sm md:text-base font-black tracking-tight leading-tight uppercase">ŞERİTVARİ ALAN HARİTALAMA</span>
              <span className="text-[11px] md:text-xs font-medium text-white/80 leading-tight">Çizgi tabanlı koridor uçuşu</span>
            </div>
          </div>
          <i className="fas fa-chevron-right text-white/50 group-hover:translate-x-1 transition-transform text-xs"></i>
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-6 -mt-6 blur-xl"></div>
        </button>

        {/* Hazır YKN Şablonları */}
        <button 
          onClick={onShowPresetTemplates}
          className="w-full py-4.5 md:py-5 px-5 md:px-6 bg-slate-600 hover:bg-slate-700 text-white rounded-2xl shadow-xl shadow-slate-600/30 active:scale-[0.98] transition-all flex items-center justify-between group relative overflow-hidden border border-white/10"
        >
          <div className="relative z-10 flex items-center gap-3.5 md:gap-4">
            <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/20 shrink-0 shadow-inner">
              <i className="fas fa-crosshairs text-lg md:text-xl text-white"></i>
            </div>
            <div className="flex flex-col text-left space-y-0.5">
              <span className="text-sm md:text-base font-black tracking-tight leading-tight uppercase">HAZIR YKN ŞABLONLARI</span>
              <span className="text-[11px] md:text-xs font-medium text-slate-300 leading-tight">YKN şablonu üret ve indir</span>
            </div>
          </div>
          <i className="fas fa-chevron-right text-white/50 group-hover:translate-x-1 transition-transform text-xs"></i>
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-6 -mt-6 blur-xl"></div>
        </button>
      </main>
    </div>
  );
};


export default Dashboard;