import React, { useState, useRef } from 'react';
import { FlightConfig } from '../src/types/flight';
import { parseKMLorKMZ, KMLData } from './KMLUtils';
import GlobalFooter from './GlobalFooter';
import Header from './Header';

interface Props {
  onBack: () => void;
  onPlanCreated: (kmlData: KMLData, config: FlightConfig) => void;
  initialKmlData?: KMLData | null;
  onKmlDataChange?: (data: KMLData | null) => void;
}

const GCPPlanConfig: React.FC<Props> = ({ onBack, onPlanCreated, initialKmlData, onKmlDataChange }) => {
  const [gcpDistance, setGcpDistance] = useState(400);
  const [gcpStartOffset, setGcpStartOffset] = useState(10);
  const [kmlData, setKmlData] = useState<KMLData | null>(initialKmlData || null);
  
  // Sync kmlData with initialKmlData when it changes
  React.useEffect(() => {
    setKmlData(initialKmlData || null);
  }, [initialKmlData]);
  const [isParsing, setIsParsing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsParsing(true);
      try {
        const data = await parseKMLorKMZ(file);
        
        const polygonFeatures = data.features.filter(f => f.type === 'Polygon');
        if (polygonFeatures.length !== 1) {
          alert('HATA: YKN planı için tahdit dosyası sadece tek bir Polygon (alan) objesi içermelidir. Lütfen dosyanızı kontrol edip tekrar deneyin.');
          setKmlData(null);
          onKmlDataChange?.(null);
          return;
        }

        setKmlData(data);
        onKmlDataChange?.(data);
      } catch (err) {
        alert('HATA: KML dosyası ayrıştırılamadı. Lütfen geçerli bir KML veya KMZ dosyası yüklediğinizden emin olun.');
      } finally {
        setIsParsing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const handleCreatePlan = () => {
    if (!kmlData) {
      alert('Lütfen bir KML/KMZ dosyası seçin.');
      return;
    }

    const config: FlightConfig = {
      flightType: 'Normal',
      camera: { name: 'Default', sensorWidth: 0, focalLength: 0, imageWidth: 0 }, // Placeholder for GCP
      scale: '1/1000',
      gsd: 0,
      height: 0,
      buffer: 0,
      expandToGrid: 0,
      overlapFront: 0,
      overlapSide: 0,
      expandToRectangle: false,
      gcpDistance,
      gcpStartOffset
    };
    
    onPlanCreated(kmlData, config);
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-200 overflow-hidden animate-in fade-in">
      <Header title="YKN Planı Hazırlığı" onBack={onBack} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24">
        {/* 1. KML Selection */}
        <section className="space-y-2">
          <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">1. Tahdit Dosyası</label>
          <div className="flex flex-col gap-3">
            <div 
              onClick={() => !kmlData && fileInputRef.current?.click()}
              className={`w-full p-3 border-2 border-dashed rounded-[24px] flex items-center gap-4 transition-all ${
                kmlData ? 'bg-emerald-50 border-emerald-200 cursor-default' : 'bg-slate-100 border-slate-200 hover:border-blue-300 cursor-pointer'
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".kml,.kmz" 
                className="hidden" 
              />
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-md shrink-0 ${
                kmlData ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white'
              }`}>
                <i className={`fas ${isParsing ? 'fa-spinner fa-spin' : kmlData ? 'fa-check' : 'fa-file-upload'} text-lg`}></i>
              </div>
              <div className="flex-1 truncate">
                <p className="font-black text-slate-900 truncate text-sm">{kmlData ? kmlData.name : 'Dosya Seçin'}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                  {kmlData ? '1 Polygon bulundu' : 'Sadece Polygon (Alan) tipi KML/KMZ'}
                </p>
              </div>
            </div>
            {kmlData && (
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3.5 bg-slate-100 border border-slate-200 rounded-[24px] font-black text-slate-600 uppercase tracking-widest text-[10px] hover:bg-slate-50 active:scale-95 transition-all"
              >
                DEĞİŞTİR
              </button>
            )}
          </div>
        </section>

        {/* 2. YKN Arası Mesafe */}
        <section className="space-y-2">
          <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">2. YKN Arası Mesafe</label>
          <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button 
              onClick={() => setGcpDistance(p => Math.max(50, p - 50))} 
              className="w-10 h-10 bg-slate-50 rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all"
            >
              <i className="fas fa-minus text-xs"></i>
            </button>
            <span className="flex-1 text-center font-black text-slate-900 text-lg">{gcpDistance}m</span>
            <button 
              onClick={() => setGcpDistance(p => Math.min(2000, p + 50))} 
              className="w-10 h-10 bg-slate-50 rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all"
            >
              <i className="fas fa-plus text-xs"></i>
            </button>
          </div>
        </section>

        {/* 3. YKN Başlangıç Mesafesi */}
        <section className="space-y-2">
          <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">3. YKN Başlangıç Mesafesi</label>
          <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button 
              onClick={() => setGcpStartOffset(p => Math.max(0, p - 10))} 
              className="w-10 h-10 bg-slate-50 rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all"
            >
              <i className="fas fa-minus text-xs"></i>
            </button>
            <span className="flex-1 text-center font-black text-slate-900 text-lg">{gcpStartOffset}m</span>
            <button 
              onClick={() => setGcpStartOffset(p => Math.min(500, p + 10))} 
              className="w-10 h-10 bg-slate-50 rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all"
            >
              <i className="fas fa-plus text-xs"></i>
            </button>
          </div>
        </section>

        <div className="pt-4 space-y-4">
          <button 
            onClick={handleCreatePlan}
            className="w-full py-5 bg-blue-600 text-white rounded-[24px] font-black uppercase tracking-[0.2em] text-sm shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3 shadow-blue-100"
          >
            <span>PLANLAMA EKRANINA GEÇ</span>
            <i className="fas fa-arrow-right"></i>
          </button>
          
          <p className="text-[9px] font-black text-slate-500 text-center leading-relaxed uppercase tracking-widest px-4">
            Fotogrametrik dengelemenin başarılı olması için en az 5 adet nokta otomatik olarak üretilecektir.
          </p>
        </div>
      </div>

      <GlobalFooter />
    </div>
  );
};

export default GCPPlanConfig;
