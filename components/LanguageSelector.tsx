import React, { useState } from 'react';
import { useLanguage } from '../utils/LanguageContext';

export const LanguageSelector: React.FC = () => {
  const { language, changeLanguage, t } = useLanguage();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [tempLanguage, setTempLanguage] = useState(language);

  const handleApply = (newLang: 'TR' | 'EN') => {
    setShowLangMenu(false);
    changeLanguage(newLang);
  };

  return (
    <div className="relative z-30">
      {/* Tetikleyici Buton */}
      <button 
        onClick={() => {
          setTempLanguage(language);
          setShowLangMenu(prev => !prev);
        }}
        className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center shadow-xl border border-slate-300/80 active:scale-90 transition-all hover:bg-slate-200 cursor-pointer"
        title={t("Dil Seçin")}
      >
        <div className="w-8 h-6 rounded-md flex items-center justify-center bg-slate-600 text-[10px] font-black text-slate-100 tracking-widest shadow-sm uppercase leading-none overflow-hidden">
          {language}
        </div>
      </button>

      {/* Dil Seçenekleri Popover / Modal */}
      {showLangMenu && (
        <div className="absolute left-0 mt-3 w-48 bg-slate-50/98 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-300 p-4 space-y-3 animate-in slide-in-from-top-2 z-50">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
            {t("Dil Seçin")}
          </h4>
          
          <div className="space-y-1.5">
            {/* Türkçe Seçeneği */}
            <button
              onClick={() => setTempLanguage('TR')}
              className={`w-full p-2 rounded-xl flex items-center justify-between transition-colors text-left cursor-pointer ${
                tempLanguage === 'TR' ? 'bg-slate-200 border border-slate-300 text-slate-800' : 'bg-transparent border border-transparent text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-3.5 rounded-xs overflow-hidden shadow-xs flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="6750 -25500 76500 51000" className="w-full h-full object-cover" style={{ objectPosition: '35% 50%' }}>
                    <path fill="#e30a17" d="m0-30000h90000v60000H0z"/>
                    <path fill="#fff" d="m41750 0 13568-4408-8386 11541V-7133l8386 11541zm925 8021a15000 15000 0 1 1 0-16042 12000 12000 0 1 0 0 16042z"/>
                  </svg>
                </div>
                <span className="text-xs font-black">Türkçe</span>
              </div>
              {tempLanguage === 'TR' && <i className="fas fa-check-circle text-xs text-slate-600"></i>}
            </button>
            
            {/* İngilizce Seçeneği */}
            <button
              onClick={() => setTempLanguage('EN')}
              className={`w-full p-2 rounded-xl flex items-center justify-between transition-colors text-left cursor-pointer ${
                tempLanguage === 'EN' ? 'bg-slate-200 border border-slate-300 text-slate-800' : 'bg-transparent border border-transparent text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-5 h-3.5 rounded-xs bg-slate-600 text-[9px] font-black text-white flex items-center justify-center tracking-wider leading-none shrink-0">
                  EN
                </span>
                <span className="text-xs font-black">English</span>
              </div>
              {tempLanguage === 'EN' && <i className="fas fa-check-circle text-xs text-slate-600"></i>}
            </button>
          </div>
          
          {/* İptal / Uygula Butonları */}
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button
              onClick={() => setShowLangMenu(false)}
              className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-wider text-center cursor-pointer transition-colors"
            >
              {t("İptal")}
            </button>
            <button
              onClick={() => handleApply(tempLanguage)}
              className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider text-center cursor-pointer transition-colors shadow-md"
            >
              {t("Uygula")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
