import React, { useState, useRef } from 'react';
import { Camera, CAMERAS, SCALES, SCALE_TARGET_GSD, FlightConfig } from '../src/types/flight';
import { parseKMLorKMZ, KMLData } from './KMLUtils';
import GlobalFooter from './GlobalFooter';
import Header from './Header';
import { AppSettings } from '../types';

interface Props {
  onBack: () => void;
  flightType: 'Normal' | 'Strip';
  onFlightTypeChange: (type: 'Normal' | 'Strip') => void;
  step: 'selection' | 'config';
  onStepChange: (step: 'selection' | 'config') => void;
  onPlanCreated: (kmlData: KMLData, config: FlightConfig) => void;
  initialKmlData?: KMLData | null;
  onKmlDataChange?: (data: KMLData | null) => void;
  settings: AppSettings;
}

const FlightPlanConfig: React.FC<Props> = ({ 
  onBack, 
  flightType, 
  onFlightTypeChange, 
  step, 
  onStepChange, 
  onPlanCreated, 
  initialKmlData, 
  onKmlDataChange,
  settings
}) => {
  const [selectedCamera, setSelectedCamera] = useState<Camera>(CAMERAS[0]);
  const [selectedScale, setSelectedScale] = useState(SCALES[0]);
  const [height, setHeight] = useState(200);
  const [buffer, setBuffer] = useState(0);
  const [expandToGrid, setExpandToGrid] = useState<number>(0);
  const [overlapFront, setOverlapFront] = useState(80);
  const [overlapSide, setOverlapSide] = useState(70);
  const [stripBuffer, setStripBuffer] = useState(50);
  const [isStripSplitEnabled, setIsStripSplitEnabled] = useState(false);
  const [stripSplitDistance, setStripSplitDistance] = useState(2000);
  const [expandToRectangle, setExpandToRectangle] = useState(false);
  const [kmlData, setKmlData] = useState<KMLData | null>(initialKmlData || null);
  
  // Sync kmlData with initialKmlData when flightType or initialKmlData changes
  React.useEffect(() => {
    setKmlData(initialKmlData || null);
  }, [initialKmlData, flightType]);
  const [isParsing, setIsParsing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update height when camera or scale changes
  React.useEffect(() => {
    const targetGSD = SCALE_TARGET_GSD[selectedScale];
    if (targetGSD) {
      const calculatedHeight = (targetGSD * selectedCamera.focalLength * selectedCamera.imageWidth) / (selectedCamera.sensorWidth * 100);
      setHeight(Math.round(calculatedHeight));
    }
  }, [selectedScale, selectedCamera]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsParsing(true);
      try {
        const data = await parseKMLorKMZ(file);
        
        if (flightType === 'Normal') {
          const polygonFeatures = data.features.filter(f => f.type === 'Polygon');
          if (polygonFeatures.length !== 1) {
            alert('HATA: Normal uçuş için tahdit dosyası sadece tek bir Polygon (alan) objesi içermelidir. Lütfen dosyanızı kontrol edip tekrar deneyin.');
            setKmlData(null);
            onKmlDataChange?.(null);
            return;
          }
        } else {
          const lineFeatures = data.features.filter(f => f.type === 'LineString');
          if (lineFeatures.length !== 1) {
            alert('HATA: Şeritvari uçuş için tahdit dosyası sadece tek bir LineString (çizgi) objesi içermelidir. Lütfen dosyanızı kontrol edip tekrar deneyin.');
            setKmlData(null);
            onKmlDataChange?.(null);
            return;
          }
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

    // Calculate GSD: (SensorWidth * Height * 100) / (FocalLength * ImageWidth)
    const gsd = (selectedCamera.sensorWidth * height * 100) / (selectedCamera.focalLength * selectedCamera.imageWidth);
    
    const config: FlightConfig = {
      flightType,
      camera: selectedCamera,
      scale: selectedScale,
      gsd: Math.round(gsd * 100) / 100,
      height,
      buffer,
      expandToGrid,
      overlapFront,
      overlapSide,
      expandToRectangle,
      stripBuffer: flightType === 'Strip' ? stripBuffer : undefined,
      stripSplitDistance: (flightType === 'Strip' && isStripSplitEnabled) ? stripSplitDistance : undefined
    };
    
    onPlanCreated(kmlData, config);
  };

  if (step === 'selection') {
    return (
      <div className="w-full h-full flex flex-col bg-slate-200 overflow-hidden animate-in fade-in">
        <Header title="Uçuş Tipi Seçimi" onBack={onBack} />
        
        <div className="flex-1 p-6 flex flex-col justify-start gap-4 pt-8">
          <button 
            onClick={() => {
              onFlightTypeChange('Normal');
              onStepChange('config');
            }}
            className="group relative bg-white p-5 rounded-[32px] border-2 border-transparent hover:border-blue-500 transition-all shadow-xl shadow-slate-300/50 active:scale-95 text-left overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <i className="fas fa-draw-polygon text-7xl"></i>
            </div>
            <div className="relative z-10 flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200 shrink-0">
                <i className="fas fa-draw-polygon text-xl"></i>
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Normal Uçuş</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium leading-tight">Poligon tabanlı alan uçuşu. Harita ve modelleme projeleri için idealdir.</p>
              </div>
            </div>
          </button>

          <button 
            onClick={() => {
              onFlightTypeChange('Strip');
              onStepChange('config');
            }}
            className="group relative bg-white p-5 rounded-[32px] border-2 border-transparent hover:border-emerald-500 transition-all shadow-xl shadow-slate-300/50 active:scale-95 text-left overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <i className="fas fa-route text-7xl"></i>
            </div>
            <div className="relative z-10 flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200 shrink-0">
                <i className="fas fa-route text-xl"></i>
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Şeritvari Uçuş</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium leading-tight">Çizgi tabanlı koridor uçuşu. Yol, kanal ve enerji hattı projeleri için idealdir.</p>
              </div>
            </div>
          </button>

          {/* KML Plus Tanıtım */}
          <div className="mt-4 pt-4 border-t border-slate-300/50">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center mb-4">Tahdit Dosyanız Yok mu?</p>
            
            <button 
              onClick={() => window.open('https://acb-soft.github.io/KML-Plus/', '_blank')}
              className="w-full group relative bg-gradient-to-br from-blue-600 to-blue-700 p-6 rounded-[32px] shadow-2xl shadow-blue-400/30 active:scale-95 text-left overflow-hidden border border-blue-500/50"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <i className="fas fa-external-link-alt text-7xl text-white"></i>
              </div>
              
              <div className="relative z-10">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">KML Plus</h3>
                  <span className="px-2 py-0.5 bg-white/20 backdrop-blur-sm text-[8px] font-black text-white rounded-full tracking-widest border border-white/30">ACB SOFTWARE</span>
                </div>
                <p className="text-xs text-blue-100 mt-0.5 font-medium leading-tight">Hızlıca KML/KMZ tahdit dosyası oluşturmak için yardımcı uygulamayı kullanın.</p>
              </div>
            </button>
          </div>
        </div>
        <GlobalFooter />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-200 overflow-hidden animate-in fade-in">
      <Header 
        title={flightType === 'Normal' ? 'Normal Uçuş Hazırlığı' : 'Şeritvari Uçuş Hazırlığı'} 
        onBack={onBack} 
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* 1. Tahdit Dosyası */}
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
                  {kmlData ? (flightType === 'Normal' ? '1 Polygon bulundu' : '1 Çizgi bulundu') : 'KML veya KMZ formatında'}
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

        {flightType === 'Normal' ? (
          <>
            {/* 2. Genişletme Ayarları */}
            <section className="space-y-4">
              <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">2. Genişletme Ayarları</label>
              
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tahditi Genişlet (Buffer)</span>
                <div className="flex gap-3">
                  {[0, 5, 10, 20].map(val => (
                    <button
                      key={val}
                      onClick={() => setBuffer(val)}
                      className={`flex-1 py-3 rounded-xl font-black text-xs transition-all border ${
                        buffer === val 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                        : 'bg-slate-100 border-slate-200 text-slate-600 hover:border-blue-200'
                      }`}
                    >
                      {val === 0 ? 'Hayır' : `${val}m`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tahditi Genişlet (Ortogonal)</span>
                <div className="flex gap-3">
                  {[0, 50, 100, 200].map(val => (
                    <button
                      key={val}
                      onClick={() => setExpandToGrid(val)}
                      className={`flex-1 py-3 rounded-xl font-black text-xs transition-all border ${
                        expandToGrid === val 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                        : 'bg-slate-100 border-slate-200 text-slate-600 hover:border-blue-200'
                      }`}
                    >
                      {val === 0 ? 'Hayır' : `${val}m`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tahditi Genişlet (Dikdörtgen)</span>
                <div className="flex gap-3">
                  {[false, true].map(val => (
                    <button
                      key={val.toString()}
                      onClick={() => setExpandToRectangle(val)}
                      className={`flex-1 py-3 rounded-xl font-black text-xs transition-all border ${
                        expandToRectangle === val 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                        : 'bg-slate-100 border-slate-200 text-slate-600 hover:border-blue-200'
                      }`}
                    >
                      {val ? 'EVET' : 'HAYIR'}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
            {/* 2. Uçuş Genişliği (Buffer) */}
            <section className="space-y-3">
              <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">2. Uçuş Genişliği (Buffer)</label>
              <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                <button onClick={() => setStripBuffer(p => Math.max(5, p - 5))} className="w-10 h-10 bg-slate-50 rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all">
                  <i className="fas fa-minus text-xs"></i>
                </button>
                <div className="flex-1 text-center">
                  <span className="block font-black text-slate-900 text-lg leading-none">{stripBuffer}metre x 2</span>
                </div>
                <button onClick={() => setStripBuffer(p => Math.min(500, p + 5))} className="w-10 h-10 bg-slate-50 rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all">
                  <i className="fas fa-plus text-xs"></i>
                </button>
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">
                Toplam {stripBuffer * 2}m (Sağ/Sol)
              </p>
            </section>

            {/* 3. Uçuşu Parçalara Ayır */}
            <section className="space-y-3">
              <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">3. Uçuşu Parçalara Ayır</label>
              <div className="flex gap-3">
                {[false, true].map(val => (
                  <button
                    key={val.toString()}
                    onClick={() => setIsStripSplitEnabled(val)}
                    className={`flex-1 py-3.5 rounded-2xl font-black text-sm transition-all border ${
                      isStripSplitEnabled === val 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100' 
                      : 'bg-slate-100 border-slate-200 text-slate-600 hover:border-blue-200'
                    }`}
                  >
                    {val ? 'EVET' : 'HAYIR'}
                  </button>
                ))}
              </div>

              {isStripSplitEnabled && (
                <div className="animate-in slide-in-from-top-2 duration-300 space-y-3">
                  <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                    <button onClick={() => setStripSplitDistance(p => Math.max(100, p - 100))} className="w-10 h-10 bg-slate-50 rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all">
                      <i className="fas fa-minus text-xs"></i>
                    </button>
                    <span className="flex-1 text-center font-black text-slate-900 text-lg">{stripSplitDistance}m</span>
                    <button onClick={() => setStripSplitDistance(p => Math.min(10000, p + 100))} className="w-10 h-10 bg-slate-50 rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all">
                      <i className="fas fa-plus text-xs"></i>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest text-center">
                    Uçuşlar 20m overlap ile parçalara ayrılacaktır.
                  </p>
                </div>
              )}
            </section>
          </>
        )}

        <div className="pt-4">
          <button 
            onClick={handleCreatePlan}
            className="w-full py-5 bg-blue-600 text-white rounded-[24px] font-black uppercase tracking-[0.2em] text-sm shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3 shadow-blue-100"
          >
            <span>PLANLAMA EKRANINA GEÇ</span>
            <i className="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>

      <GlobalFooter />
    </div>
  );
};

export default FlightPlanConfig;
