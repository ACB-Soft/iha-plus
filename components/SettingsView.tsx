import React, { useState, useEffect } from 'react';
import { APP_VERSION } from '../version';
import GlobalFooter from './GlobalFooter';
import Modal from './Modal';
import Header from './Header';
import { CAMERAS } from '../src/types/flight';
import { FlightPlanDefaults, DEFAULT_FLIGHT_DEFAULTS } from '../types';

interface Props {
  onBack: () => void;
  onOpenOnboarding?: () => void;
}

const SettingsView: React.FC<Props> = ({ onBack, onOpenOnboarding }) => {
  const [mapProvider, setMapProvider] = useState(localStorage.getItem('default_map_provider') || 'Google Satellite');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const getInitialFlightDefaults = (): FlightPlanDefaults => {
    const saved = localStorage.getItem('flight_plan_defaults');
    if (saved) {
      try {
        return { ...DEFAULT_FLIGHT_DEFAULTS, ...JSON.parse(saved) };
      } catch (e) {
        console.error('Error parsing stored flight defaults', e);
      }
    }
    return { ...DEFAULT_FLIGHT_DEFAULTS };
  };

  const [flightDefaults, setFlightDefaults] = useState<FlightPlanDefaults>(getInitialFlightDefaults);

  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'error' | 'success' | 'confirm';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  useEffect(() => {
    localStorage.setItem('default_map_provider', mapProvider);
  }, [mapProvider]);

  useEffect(() => {
    localStorage.setItem('flight_plan_defaults', JSON.stringify(flightDefaults));
  }, [flightDefaults]);

  const updateFlightDefault = <K extends keyof FlightPlanDefaults>(key: K, value: FlightPlanDefaults[K]) => {
    setFlightDefaults(prev => ({ ...prev, [key]: value }));
  };

  const handleResetDefaults = () => {
    setFlightDefaults({ ...DEFAULT_FLIGHT_DEFAULTS });
  };

  const handleUpdateCheck = async () => {
    if (isCheckingUpdate) return;
    
    setIsCheckingUpdate(true);
    
    try {
      // Cache-busting query parameter to ensure we get the latest version from the server
      const response = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`);
      if (!response.ok) throw new Error('Sunucuya erişilemedi');
      
      const data = await response.json();
      const serverVersion = data.version;
      
      // Simüle edilmiş bir ağ gecikmesi (kullanıcıya işlemin yapıldığını hissettirmek için)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setIsCheckingUpdate(false);
      
      if (serverVersion !== APP_VERSION) {
        setModal({
          isOpen: true,
          title: 'Yeni Sürüm Mevcut',
          message: `Yeni bir sürüm mevcut (${serverVersion}).\n\nMevcut Sürüm: ${APP_VERSION}\n\nSayfayı yenileyerek güncellemek ister misiniz?`,
          type: 'confirm',
          onConfirm: () => window.location.reload()
        });
      } else {
        setModal({
          isOpen: true,
          title: 'Uygulama Güncel',
          message: `Güncelleştirmeler denetlendi.\n\nMevcut Sürüm: ${APP_VERSION}\nDurum: Uygulamanız güncel.`,
          type: 'success'
        });
      }
    } catch (error) {
      console.error('Güncelleme kontrolü hatası:', error);
      setIsCheckingUpdate(false);
      setModal({
        isOpen: true,
        title: 'Hata Oluştu',
        message: 'Güncelleştirme denetimi sırasında bir hata oluştu. Lütfen internet bağlantınızı kontrol edin.',
        type: 'error'
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col animate-in h-full overflow-hidden bg-slate-200">
      <Modal 
        isOpen={modal.isOpen} 
        onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
        title={modal.title}
        type={modal.type}
        onConfirm={modal.onConfirm}
        confirmLabel={modal.type === 'confirm' ? 'Güncelle' : undefined}
      >
        <p className="whitespace-pre-line">{modal.message}</p>
      </Modal>
      <Header title="Ayarlar" onBack={onBack} />

      <div className="flex-1 px-8 overflow-y-auto no-scrollbar py-4">
        <div className="max-w-sm mx-auto w-full space-y-6">
          {/* Sistem Ayarları */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                <i className="fas fa-cog"></i>
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Sistem</h3>
            </div>
            
            <div className="soft-card p-5 space-y-3">
              <button 
                onClick={handleUpdateCheck}
                disabled={isCheckingUpdate}
                className={`w-full h-12 px-5 bg-slate-100 text-blue-600 rounded-2xl font-bold flex items-center justify-between shadow-sm border border-slate-100 active:scale-[0.98] transition-all ${isCheckingUpdate ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <i className={`fas ${isCheckingUpdate ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`}></i>
                  <span className="text-[13px] whitespace-nowrap">
                    {isCheckingUpdate ? 'Denetleniyor...' : 'Güncelleştirme Denetimi'}
                  </span>
                </div>
                {!isCheckingUpdate && <i className="fas fa-chevron-right text-blue-300 text-xs"></i>}
              </button>

              <button 
                onClick={onOpenOnboarding}
                className="w-full h-12 px-5 bg-slate-100 text-slate-700 rounded-2xl font-bold flex items-center justify-between shadow-sm border border-slate-100 active:scale-[0.98] transition-all hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <i className="fas fa-graduation-cap text-blue-600"></i>
                  <span className="text-[13px] whitespace-nowrap">
                    Tanıtım Ekranını Başlat
                  </span>
                </div>
                <i className="fas fa-chevron-right text-slate-400 text-xs"></i>
              </button>
            </div>
          </section>

          {/* Görünüm Ayarları */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                <i className="fas fa-map"></i>
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Görünüm</h3>
            </div>
            
            <div className="soft-card p-5 space-y-4">
              {/* Harita Sağlayıcısı */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Harita Sağlayıcısı</label>
                <select 
                  value={mapProvider}
                  onChange={(e) => setMapProvider(e.target.value)}
                  className="w-full h-12 px-4 bg-slate-100 border border-slate-100 rounded-2xl text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 appearance-none shadow-sm"
                >
                  <option value="Google Hybrid">Google Hibrit</option>
                  <option value="Google Satellite">Google Satellite</option>
                  <option value="Esri World Imagery">Esri World Imagery (Uydu)</option>
                  <option value="OpenStreetMap">OpenStreetMap</option>
                  <option value="OpenTopoMap">OpenTopoMap</option>
                </select>
              </div>
            </div>
          </section>

          {/* Uçuş Planı Konfigürasyonları */}
          <section className="space-y-3 pb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                  <i className="fas fa-plane"></i>
                </div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Uçuş Planı Ayarları</h3>
              </div>
              <button 
                onClick={handleResetDefaults}
                className="text-[10px] font-black text-slate-500 hover:text-blue-600 uppercase tracking-widest bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition-all active:scale-95"
                title="Varsayılan değerlere sıfırla"
              >
                SIFIRLA
              </button>
            </div>

            <div className="soft-card p-5 space-y-5">
              {/* Kamera Seçimi */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Varsayılan Kamera</label>
                <select 
                  value={flightDefaults.defaultCameraName}
                  onChange={(e) => updateFlightDefault('defaultCameraName', e.target.value)}
                  className="w-full h-12 px-4 bg-slate-100 border border-slate-100 rounded-2xl text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 appearance-none shadow-sm text-xs"
                >
                  {CAMERAS.map(cam => (
                    <option key={cam.name} value={cam.name}>{cam.name}</option>
                  ))}
                </select>
              </div>

              {/* Uçuş Yüksekliği */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Varsayılan Yükseklik (m)</label>
                <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                  <button 
                    type="button"
                    onClick={() => updateFlightDefault('defaultHeight', Math.max(20, flightDefaults.defaultHeight - 10))} 
                    className="w-9 h-9 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all font-bold"
                  >
                    <i className="fas fa-minus text-xs"></i>
                  </button>
                  <span className="flex-1 text-center font-black text-slate-900 text-sm">{flightDefaults.defaultHeight}m</span>
                  <button 
                    type="button"
                    onClick={() => updateFlightDefault('defaultHeight', Math.min(500, flightDefaults.defaultHeight + 10))} 
                    className="w-9 h-9 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all font-bold"
                  >
                    <i className="fas fa-plus text-xs"></i>
                  </button>
                </div>
              </div>

              {/* Tahditi Genişlet (Buffer) */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tahditi Genişlet (Buffer)</label>
                <div className="flex gap-2">
                  {[0, 5, 10, 20].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => updateFlightDefault('defaultBuffer', val)}
                      className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all border ${
                        flightDefaults.defaultBuffer === val 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                        : 'bg-slate-100 border-slate-200 text-slate-600 hover:border-blue-200'
                      }`}
                    >
                      {val === 0 ? 'Hayır' : `${val}m`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ortogonal Genişletme */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tahditi Genişlet (Ortogonal)</label>
                <div className="flex gap-2">
                  {[0, 50, 100, 200].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => updateFlightDefault('defaultExpandToGrid', val)}
                      className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all border ${
                        flightDefaults.defaultExpandToGrid === val 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                        : 'bg-slate-100 border-slate-200 text-slate-600 hover:border-blue-200'
                      }`}
                    >
                      {val === 0 ? 'Hayır' : `${val}m`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dikdörtgen Genişletme */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tahditi Genişlet (Dikdörtgen)</label>
                <div className="flex gap-2">
                  {[false, true].map(val => (
                    <button
                      key={val.toString()}
                      type="button"
                      onClick={() => updateFlightDefault('defaultExpandToRectangle', val)}
                      className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all border ${
                        flightDefaults.defaultExpandToRectangle === val 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                        : 'bg-slate-100 border-slate-200 text-slate-600 hover:border-blue-200'
                      }`}
                    >
                      {val ? 'EVET' : 'HAYIR'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Şerit Genişliği */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Şerit Uçuş Genişliği (Buffer)</label>
                <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                  <button 
                    type="button"
                    onClick={() => updateFlightDefault('defaultStripBuffer', Math.max(5, flightDefaults.defaultStripBuffer - 5))} 
                    className="w-9 h-9 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all font-bold"
                  >
                    <i className="fas fa-minus text-xs"></i>
                  </button>
                  <span className="flex-1 text-center font-black text-slate-900 text-sm">{flightDefaults.defaultStripBuffer}m x 2</span>
                  <button 
                    type="button"
                    onClick={() => updateFlightDefault('defaultStripBuffer', Math.min(500, flightDefaults.defaultStripBuffer + 5))} 
                    className="w-9 h-9 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all font-bold"
                  >
                    <i className="fas fa-plus text-xs"></i>
                  </button>
                </div>
              </div>

              {/* Uçuşu Parçalara Ayır */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Şerit Uçuşu Parçalara Ayır</label>
                <div className="flex gap-2">
                  {[false, true].map(val => (
                    <button
                      key={val.toString()}
                      type="button"
                      onClick={() => updateFlightDefault('defaultIsStripSplitEnabled', val)}
                      className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all border ${
                        flightDefaults.defaultIsStripSplitEnabled === val 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                        : 'bg-slate-100 border-slate-200 text-slate-600 hover:border-blue-200'
                      }`}
                    >
                      {val ? 'EVET' : 'HAYIR'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Parçalama Mesafesi */}
              {flightDefaults.defaultIsStripSplitEnabled && (
                <div className="space-y-1 animate-in fade-in">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Şerit Parçalama Mesafesi (m)</label>
                  <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                    <button 
                      type="button"
                      onClick={() => updateFlightDefault('defaultStripSplitDistance', Math.max(100, flightDefaults.defaultStripSplitDistance - 100))} 
                      className="w-9 h-9 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all font-bold"
                    >
                      <i className="fas fa-minus text-xs"></i>
                    </button>
                    <span className="flex-1 text-center font-black text-slate-900 text-sm">{flightDefaults.defaultStripSplitDistance}m</span>
                    <button 
                      type="button"
                      onClick={() => updateFlightDefault('defaultStripSplitDistance', Math.min(10000, flightDefaults.defaultStripSplitDistance + 100))} 
                      className="w-9 h-9 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all font-bold"
                    >
                      <i className="fas fa-plus text-xs"></i>
                    </button>
                  </div>
                </div>
              )}

              {/* YKN Planlama Durumu */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Varsayılan YKN Planlama</label>
                <div className="flex gap-2">
                  {[true, false].map(val => (
                    <button
                      key={val.toString()}
                      type="button"
                      onClick={() => updateFlightDefault('defaultIsGcpEnabled', val)}
                      className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all border ${
                        flightDefaults.defaultIsGcpEnabled === val 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                        : 'bg-slate-100 border-slate-200 text-slate-600 hover:border-blue-200'
                      }`}
                    >
                      {val ? 'YKN İLE' : 'YKN\'SİZ'}
                    </button>
                  ))}
                </div>
              </div>

              {/* YKN Arası Mesafe */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">YKN Arası Mesafe (m)</label>
                <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                  <button 
                    type="button"
                    onClick={() => updateFlightDefault('defaultGcpDistance', Math.max(50, flightDefaults.defaultGcpDistance - 50))} 
                    className="w-9 h-9 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all font-bold"
                  >
                    <i className="fas fa-minus text-xs"></i>
                  </button>
                  <span className="flex-1 text-center font-black text-slate-900 text-sm">{flightDefaults.defaultGcpDistance}m</span>
                  <button 
                    type="button"
                    onClick={() => updateFlightDefault('defaultGcpDistance', Math.min(2000, flightDefaults.defaultGcpDistance + 50))} 
                    className="w-9 h-9 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all font-bold"
                  >
                    <i className="fas fa-plus text-xs"></i>
                  </button>
                </div>
              </div>

              {/* YKN Başlangıç Mesafesi */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">YKN Başlangıç Mesafesi (m)</label>
                <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                  <button 
                    type="button"
                    onClick={() => updateFlightDefault('defaultGcpStartOffset', Math.max(0, flightDefaults.defaultGcpStartOffset - 10))} 
                    className="w-9 h-9 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all font-bold"
                  >
                    <i className="fas fa-minus text-xs"></i>
                  </button>
                  <span className="flex-1 text-center font-black text-slate-900 text-sm">{flightDefaults.defaultGcpStartOffset}m</span>
                  <button 
                    type="button"
                    onClick={() => updateFlightDefault('defaultGcpStartOffset', Math.min(500, flightDefaults.defaultGcpStartOffset + 10))} 
                    className="w-9 h-9 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all font-bold"
                  >
                    <i className="fas fa-plus text-xs"></i>
                  </button>
                </div>
              </div>

              {/* YKN Başlangıç Numarası */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">YKN Başlangıç Numarası</label>
                <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                  <button 
                    type="button"
                    onClick={() => updateFlightDefault('defaultGcpStartNumber', Math.max(1, flightDefaults.defaultGcpStartNumber - 1))} 
                    className="w-9 h-9 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all font-bold"
                  >
                    <i className="fas fa-minus text-xs"></i>
                  </button>
                  <input 
                    type="number"
                    value={flightDefaults.defaultGcpStartNumber}
                    onChange={(e) => updateFlightDefault('defaultGcpStartNumber', Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 text-center font-black text-slate-900 text-sm bg-transparent focus:outline-none"
                    min="1"
                  />
                  <button 
                    type="button"
                    onClick={() => updateFlightDefault('defaultGcpStartNumber', flightDefaults.defaultGcpStartNumber + 1)} 
                    className="w-9 h-9 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all font-bold"
                  >
                    <i className="fas fa-plus text-xs"></i>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
      
      <GlobalFooter />
    </div>
  );
};

export default SettingsView;

