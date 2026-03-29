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
  
  // Flight Plan Defaults
  const [fpHeight, setFpHeight] = useState(Number(localStorage.getItem('fp_default_height')) || 150);
  const [fpBuffer, setFpBuffer] = useState(Number(localStorage.getItem('fp_default_buffer')) || 0);
  const [fpExpandGrid, setFpExpandGrid] = useState(Number(localStorage.getItem('fp_default_expand_to_grid')) || 0);
  const [fpExpandRect, setFpExpandRect] = useState(localStorage.getItem('fp_default_expand_to_rectangle') === 'true');
  const [fpStripBuffer, setFpStripBuffer] = useState(Number(localStorage.getItem('fp_default_strip_buffer')) || 50);
  const [fpStripSplit, setFpStripSplit] = useState(Number(localStorage.getItem('fp_default_strip_split_distance')) || 1000);

  // GCP Plan Defaults
  const [gcpDistance, setGcpDistance] = useState(Number(localStorage.getItem('gcp_default_distance')) || 400);
  const [gcpOffset, setGcpOffset] = useState(Number(localStorage.getItem('gcp_default_start_offset')) || 10);
  
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
    localStorage.setItem('fp_default_height', fpHeight.toString());
    localStorage.setItem('fp_default_buffer', fpBuffer.toString());
    localStorage.setItem('fp_default_expand_to_grid', fpExpandGrid.toString());
    localStorage.setItem('fp_default_expand_to_rectangle', fpExpandRect.toString());
    localStorage.setItem('fp_default_strip_buffer', fpStripBuffer.toString());
    localStorage.setItem('fp_default_strip_split_distance', fpStripSplit.toString());
    localStorage.setItem('gcp_default_distance', gcpDistance.toString());
    localStorage.setItem('gcp_default_start_offset', gcpOffset.toString());
  }, [mapProvider, fpHeight, fpBuffer, fpExpandGrid, fpExpandRect, fpStripBuffer, fpStripSplit, gcpDistance, gcpOffset]);

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

          {/* Uçuş Planı Ayarları */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                <i className="fas fa-plane"></i>
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Uçuş Planı</h3>
            </div>
            
            <div className="soft-card p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Varsayılan Yükseklik (m)</label>
                <input 
                  type="number"
                  value={fpHeight}
                  onChange={(e) => setFpHeight(Number(e.target.value))}
                  className="w-full h-12 px-4 bg-slate-100 border border-slate-100 rounded-2xl text-slate-900 font-bold focus:outline-none shadow-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Buffer (m)</label>
                  <input 
                    type="number"
                    value={fpBuffer}
                    onChange={(e) => setFpBuffer(Number(e.target.value))}
                    className="w-full h-12 px-4 bg-slate-100 border border-slate-100 rounded-2xl text-slate-900 font-bold focus:outline-none shadow-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Grid Gen. (m)</label>
                  <input 
                    type="number"
                    value={fpExpandGrid}
                    onChange={(e) => setFpExpandGrid(Number(e.target.value))}
                    className="w-full h-12 px-4 bg-slate-100 border border-slate-100 rounded-2xl text-slate-900 font-bold focus:outline-none shadow-sm"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-100 rounded-2xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">Dikdörtgen Genişletme</span>
                <button 
                  onClick={() => setFpExpandRect(!fpExpandRect)}
                  className={`w-12 h-6 rounded-full transition-all relative ${fpExpandRect ? 'bg-blue-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${fpExpandRect ? 'left-7' : 'left-1'}`}></div>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Şerit Buffer (m)</label>
                  <input 
                    type="number"
                    value={fpStripBuffer}
                    onChange={(e) => setFpStripBuffer(Number(e.target.value))}
                    className="w-full h-12 px-4 bg-slate-100 border border-slate-100 rounded-2xl text-slate-900 font-bold focus:outline-none shadow-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Şerit Bölme (m)</label>
                  <input 
                    type="number"
                    value={fpStripSplit}
                    onChange={(e) => setFpStripSplit(Number(e.target.value))}
                    className="w-full h-12 px-4 bg-slate-100 border border-slate-100 rounded-2xl text-slate-900 font-bold focus:outline-none shadow-sm"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* YkN Planı Ayarları */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                <i className="fas fa-map-marker-alt"></i>
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">YkN Planı</h3>
            </div>
            
            <div className="soft-card p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nokta Arası (m)</label>
                  <input 
                    type="number"
                    value={gcpDistance}
                    onChange={(e) => setGcpDistance(Number(e.target.value))}
                    className="w-full h-12 px-4 bg-slate-100 border border-slate-100 rounded-2xl text-slate-900 font-bold focus:outline-none shadow-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Başlangıç Ofs (m)</label>
                  <input 
                    type="number"
                    value={gcpOffset}
                    onChange={(e) => setGcpOffset(Number(e.target.value))}
                    className="w-full h-12 px-4 bg-slate-100 border border-slate-100 rounded-2xl text-slate-900 font-bold focus:outline-none shadow-sm"
                  />
                </div>
              </div>
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
