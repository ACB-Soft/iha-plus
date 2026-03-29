import React, { useState, useEffect } from 'react';
import { APP_VERSION, FULL_BRAND } from '../version';
import GlobalFooter from './GlobalFooter';
import Modal from './Modal';
import Header from './Header';

interface Props {
  onBack: () => void;
}

const SettingsView: React.FC<Props> = ({ onBack }) => {
  const [coordinateSystem, setCoordinateSystem] = useState(localStorage.getItem('default_coord_system') || 'WGS84');
  const [mapProvider, setMapProvider] = useState(localStorage.getItem('default_map_provider') || 'Google Hybrid');
  const [audioEnabled, setAudioEnabled] = useState(localStorage.getItem('default_audio_feedback_enabled') !== 'false');
  const [screenAlwaysOn, setScreenAlwaysOn] = useState(localStorage.getItem('default_screen_always_on') === 'true');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  
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
    localStorage.setItem('default_coord_system', coordinateSystem);
    localStorage.setItem('default_map_provider', mapProvider);
    localStorage.setItem('default_audio_feedback_enabled', audioEnabled.toString());
    localStorage.setItem('default_screen_always_on', screenAlwaysOn.toString());
  }, [coordinateSystem, mapProvider, audioEnabled, screenAlwaysOn]);

  const handleReset = () => {
    setModal({
      isOpen: true,
      title: 'Ayarları Sıfırla',
      message: 'Tüm ayarlar varsayılan değerlerine döndürülecektir. Emin misiniz?',
      type: 'confirm',
      onConfirm: () => {
        localStorage.clear();
        window.location.reload();
      }
    });
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
        confirmLabel={modal.type === 'confirm' ? (modal.title === 'Ayarları Sıfırla' ? 'Sıfırla' : 'Güncelle') : undefined}
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
                onClick={handleReset}
                className="w-full h-12 px-5 bg-rose-50 text-rose-600 rounded-2xl font-bold flex items-center justify-between shadow-sm border border-rose-100 active:scale-[0.98] transition-all"
              >
                <div className="flex items-center gap-3">
                  <i className="fas fa-trash-alt"></i>
                  <span className="text-[13px]">Ayarları Sıfırla</span>
                </div>
                <i className="fas fa-chevron-right text-rose-200 text-xs"></i>
              </button>
            </div>
          </section>

          {/* Görünüm ve Bildirim Ayarları */}
          <section className="space-y-3 pb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                <i className="fas fa-bell"></i>
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Görünüm & Bildirim</h3>
            </div>
            
            <div className="soft-card p-5 space-y-4">
              {/* Koordinat Sistemi */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Varsayılan Koordinat Sistemi</label>
                <select 
                  value={coordinateSystem}
                  onChange={(e) => setCoordinateSystem(e.target.value)}
                  className="w-full h-12 px-4 bg-slate-100 border border-slate-100 rounded-2xl text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 appearance-none shadow-sm"
                >
                  <option value="WGS84">WGS84 (Coğrafi)</option>
                  <option value="UTM">UTM (Projeksiyon)</option>
                </select>
              </div>

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
                  <option value="OpenTopoMap">OpenTopoMap</option>
                </select>
              </div>

              {/* Sesli Geri Bildirim */}
              <div className="flex items-center justify-between h-12 px-4 bg-slate-100 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-900 leading-none">Sesli Bildirim</span>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Uygulama İçi</span>
                </div>
                <button 
                  onClick={() => setAudioEnabled(!audioEnabled)}
                  className={`w-12 h-6 rounded-full transition-all relative ${audioEnabled ? 'bg-blue-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${audioEnabled ? 'right-1' : 'left-1'}`}></div>
                </button>
              </div>

              {/* Ekran Her Zaman Açık */}
              <div className="flex items-center justify-between h-12 px-4 bg-slate-100 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-900 leading-none">Ekran Her Zaman Açık</span>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Planlama Sırasında</span>
                </div>
                <button 
                  onClick={() => setScreenAlwaysOn(!screenAlwaysOn)}
                  className={`w-12 h-6 rounded-full transition-all relative ${screenAlwaysOn ? 'bg-blue-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${screenAlwaysOn ? 'right-1' : 'left-1'}`}></div>
                </button>
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
