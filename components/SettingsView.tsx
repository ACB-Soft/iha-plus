import React, { useState, useEffect } from 'react';
import { APP_VERSION } from '../version';
import GlobalFooter from './GlobalFooter';
import Modal from './Modal';
import Header from './Header';

interface Props {
  onBack: () => void;
}

const SettingsView: React.FC<Props> = ({ onBack }) => {
  const [mapProvider, setMapProvider] = useState(localStorage.getItem('default_map_provider') || 'Google Satellite');
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
    localStorage.setItem('default_map_provider', mapProvider);
  }, [mapProvider]);

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
            </div>
          </section>

          {/* Görünüm Ayarları */}
          <section className="space-y-3 pb-6">
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
                  <option value="OpenTopoMap">OpenTopoMap</option>
                </select>
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
