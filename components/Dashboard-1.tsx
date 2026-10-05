import React from 'react';
import { BRAND_NAME, FULL_BRAND } from '../version';

interface Props {
  onSelectFlightType: (type: 'Normal' | 'Strip') => void;
  onShowHelp: () => void;
  onShowSettings: () => void;
  onShowPresetTemplates: () => void;
  onShowControlFlight: () => void;
}

const Dashboard: React.FC<Props> = ({ 
  onSelectFlightType, 
  onShowHelp, 
  onShowSettings, 
  onShowPresetTemplates, 
  onShowControlFlight 
}) => {
  return (
    <div className="flex-1 flex flex-col bg-slate-50 text-slate-800 font-sans min-h-screen">
      {/* Top Header matching consistent height */}
      <header className="bg-slate-900 text-white shadow-md border-b border-slate-800 no-print shrink-0 h-16 sm:h-[72px] flex items-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white border border-slate-200/90 flex items-center justify-center p-1.5 shadow-sm shrink-0">
              <img src="/favicon.svg" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-white flex items-center gap-2 leading-none">
                {BRAND_NAME}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button 
              onClick={onShowSettings}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors border border-slate-700 flex items-center gap-1.5 shadow-sm"
              title="Ayarlar"
            >
              <i className="fa-solid fa-sliders text-slate-300"></i>
              <span className="hidden sm:inline">Ayarlar</span>
            </button>

            <button 
              onClick={onShowHelp}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-medium rounded-lg transition-colors border border-slate-700 flex items-center gap-1.5 shadow-sm"
              title="Kılavuz ve Yardım"
            >
              <i className="fa-solid fa-circle-question text-sky-400"></i>
              <span className="hidden sm:inline">Yardım</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* 4 Ana Modül Kartları */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. Normal Alan Haritalama */}
          <div 
            onClick={() => onSelectFlightType('Normal')}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <i className="fa-solid fa-draw-polygon text-xl"></i>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  POLİGON UÇUŞU
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-600 transition-colors flex items-center gap-2">
                NORMAL ALAN HARİTALAMA
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Kapalı poligon sınırlarına göre optimum uçuş açısı, irtifa, bindirme oranları ve YKN noktalarını otomatik olarak belirler.
              </p>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-400 font-medium">Tampon & Grid genişletme desteği</span>
              <span className="font-semibold text-emerald-600 flex items-center gap-1.5 group-hover:translate-x-1 transition-transform">
                <span>Planı Başlat</span>
                <i className="fa-solid fa-arrow-right text-[11px]"></i>
              </span>
            </div>
          </div>

          {/* 2. Şeritvari Alan Haritalama */}
          <div 
            onClick={() => onSelectFlightType('Strip')}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:border-brand-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 rounded-xl bg-brand-50 border border-brand-200 text-brand-600 flex items-center justify-center group-hover:bg-brand-600 group-hover:text-white transition-colors">
                  <i className="fa-solid fa-road text-xl"></i>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200">
                  KORİDOR UÇUŞU
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-brand-600 transition-colors flex items-center gap-2">
                ŞERİTVARİ ALAN HARİTALAMA
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Yol, boru hattı, demiryolu ve kanal gibi çizgi güzergahları boyunca koridor genişliği ve parçalı uçuş planlaması gerçekleştirir.
              </p>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-400 font-medium">Otomatik şerit segmentasyonu</span>
              <span className="font-semibold text-brand-600 flex items-center gap-1.5 group-hover:translate-x-1 transition-transform">
                <span>Planı Başlat</span>
                <i className="fa-solid fa-arrow-right text-[11px]"></i>
              </span>
            </div>
          </div>

          {/* 3. Kontrol Uçuşu Planlama */}
          <div 
            onClick={onShowControlFlight}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:border-sky-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 rounded-xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center group-hover:bg-sky-600 group-hover:text-white transition-colors">
                  <i className="fa-solid fa-clipboard-check text-xl"></i>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                  DENETİM & KALİTE
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-sky-600 transition-colors flex items-center gap-2">
                KONTROL UÇUŞU PLANLAMA
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Mevcut harita üretimi sonrası kontrol doğruluğu için grid, Z-şerit ve doğrusal numune hatlarıyla kalite kontrol planı hazırlar.
              </p>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-400 font-medium">Yüzdesel kontrol oranı hesaplama</span>
              <span className="font-semibold text-sky-600 flex items-center gap-1.5 group-hover:translate-x-1 transition-transform">
                <span>Kontrol Planla</span>
                <i className="fa-solid fa-arrow-right text-[11px]"></i>
              </span>
            </div>
          </div>

          {/* 4. Hazır YKN Şablonları */}
          <div 
            onClick={onShowPresetTemplates}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:border-slate-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center group-hover:bg-slate-800 group-hover:text-white transition-colors">
                  <i className="fa-solid fa-crosshairs text-xl"></i>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  ŞABLON KÜTÜPHANESİ
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-slate-800 transition-colors flex items-center gap-2">
                HAZIR YKN ŞABLONLARI
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Farklı alan geometrileri için standart yer kontrol noktası şablonlarını inceleyin, dışa aktarın ve projelerinizde kullanın.
              </p>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-400 font-medium">KML, GeoJSON ve TXT desteği</span>
              <span className="font-semibold text-slate-700 flex items-center gap-1.5 group-hover:translate-x-1 transition-transform">
                <span>Şablonları İncele</span>
                <i className="fa-solid fa-arrow-right text-[11px]"></i>
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;