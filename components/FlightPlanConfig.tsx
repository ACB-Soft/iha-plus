import React, { useState, useRef } from 'react';
import { Camera, CAMERAS, SCALES, SCALE_TARGET_GSD, FlightConfig } from '../src/types/flight';
import { parseKMLorKMZ, KMLData } from './KMLUtils';
import GlobalFooter from './GlobalFooter';
import Header from './Header';

interface Props {
  onBack: () => void;
  onPlanCreated: (kmlData: KMLData, config: FlightConfig) => void;
  initialKmlData?: KMLData | null;
  onKmlDataChange?: (data: KMLData | null) => void;
}

const FlightPlanConfig: React.FC<Props> = ({ onBack, onPlanCreated, initialKmlData, onKmlDataChange }) => {
  const [flightType, setFlightType] = useState<'Normal' | 'Strip'>('Normal');
  const [selectedCamera, setSelectedCamera] = useState<Camera>(CAMERAS[0]);
  const [selectedScale, setSelectedScale] = useState(SCALES[0]);
  const [height, setHeight] = useState(100);
  const [buffer, setBuffer] = useState(0);
  const [expandToGrid, setExpandToGrid] = useState<number>(0);
  const [overlapFront, setOverlapFront] = useState(80);
  const [overlapSide, setOverlapSide] = useState(70);
  const [stripBuffer, setStripBuffer] = useState(50);
  const [stripSplitDistance, setStripSplitDistance] = useState(1000);
  const [expandToRectangle, setExpandToRectangle] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const [kmlData, setKmlData] = useState<KMLData | null>(initialKmlData || null);
  const [isParsing, setIsParsing] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  
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
            alert('Tahdit dosyası sadece tek bir polygon içermelidir.');
            setKmlData(null);
            onKmlDataChange?.(null);
            return;
          }
        } else {
          const lineFeatures = data.features.filter(f => f.type === 'LineString');
          if (lineFeatures.length !== 1) {
            alert('Tahdit dosyası sadece tek bir line veya polyline içermelidir.');
            setKmlData(null);
            onKmlDataChange?.(null);
            return;
          }
        }

        setKmlData(data);
        onKmlDataChange?.(data);
      } catch (err) {
        alert('KML dosyası ayrıştırılamadı.');
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
      showRoute,
      stripBuffer: flightType === 'Strip' ? stripBuffer : undefined,
      stripSplitDistance: flightType === 'Strip' ? stripSplitDistance : undefined
    };
    
    onPlanCreated(kmlData, config);
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-200 overflow-hidden animate-in fade-in">
      <Header title="Uçuş Planı Hazırlığı" onBack={onBack} />

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* 1. Uçuş Tipi */}
        <section className="space-y-4">
          <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">1. Uçuş Tipi</label>
          <div className="flex gap-3">
            {[
              { id: 'Normal', label: 'Normal Uçuş' },
              { id: 'Strip', label: 'Şeritvari Uçuş' }
            ].map(type => (
              <button
                key={type.id}
                onClick={() => setFlightType(type.id as 'Normal' | 'Strip')}
                className={`flex-1 py-3.5 rounded-2xl font-black text-sm transition-all border ${
                  flightType === type.id 
                  ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100' 
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:border-blue-200'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </section>

        {/* 2. Tahdit Dosyası */}
        <section className="space-y-4">
          <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">2. Tahdit Dosyası</label>
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

        {/* 3. Kamera Seçimi */}
        <section className="space-y-4">
          <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">3. Kamera Seçimi</label>
          <button
            onClick={() => setShowCameraModal(true)}
            className="w-full p-3.5 bg-slate-100 border border-slate-200 rounded-[24px] flex items-center justify-between shadow-sm hover:border-blue-300 transition-all active:scale-[0.98]"
          >
            <div className="text-left">
              <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest leading-none mb-1">Seçili Kamera</p>
              <p className="font-black text-slate-900 text-base leading-none">{selectedCamera.name}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
                {selectedCamera.sensorWidth}mm Sw | {selectedCamera.focalLength}mm f | {selectedCamera.imageWidth}px
              </p>
            </div>
            <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
              <i className="fas fa-camera text-sm"></i>
            </div>
          </button>
        </section>

        {flightType === 'Normal' ? (
          <>
            {/* 4. Bindirme Oranları */}
            <section className="space-y-4">
              <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">4. Bindirme Oranları</label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-500">Enine (Side)</span>
                  <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                    <button onClick={() => setOverlapSide(p => Math.max(0, p - 5))} className="w-8 h-8 bg-slate-50 rounded-xl text-slate-600"><i className="fas fa-minus text-xs"></i></button>
                    <span className="flex-1 text-center font-black text-slate-900 text-sm">{overlapSide}%</span>
                    <button onClick={() => setOverlapSide(p => Math.min(100, p + 5))} className="w-8 h-8 bg-slate-50 rounded-xl text-slate-600"><i className="fas fa-plus text-xs"></i></button>
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-500">Boyuna (Frontal)</span>
                  <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                    <button onClick={() => setOverlapFront(p => Math.max(0, p - 5))} className="w-8 h-8 bg-slate-50 rounded-xl text-slate-600"><i className="fas fa-minus text-xs"></i></button>
                    <span className="flex-1 text-center font-black text-slate-900 text-sm">{overlapFront}%</span>
                    <button onClick={() => setOverlapFront(p => Math.min(100, p + 5))} className="w-8 h-8 bg-slate-50 rounded-xl text-slate-600"><i className="fas fa-plus text-xs"></i></button>
                  </div>
                </div>
              </div>
            </section>

            {/* 5. Genişletme Ayarları */}
            <section className="space-y-6">
              <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">5. Genişletme Ayarları</label>
              
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
            {/* 4. Uçuş Genişliği (Buffer) */}
            <section className="space-y-4">
              <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">4. Uçuş Genişliği (Buffer)</label>
              <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                <button onClick={() => setStripBuffer(p => Math.max(5, p - 5))} className="w-10 h-10 bg-slate-50 rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all">
                  <i className="fas fa-minus text-xs"></i>
                </button>
                <span className="flex-1 text-center font-black text-slate-900 text-lg">{stripBuffer}m</span>
                <button onClick={() => setStripBuffer(p => Math.min(500, p + 5))} className="w-10 h-10 bg-slate-50 rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all">
                  <i className="fas fa-plus text-xs"></i>
                </button>
              </div>
            </section>

            {/* 5. Uçuşu Parçalara Ayır */}
            <section className="space-y-4">
              <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">5. Uçuşu Parçalara Ayır</label>
              <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                <button onClick={() => setStripSplitDistance(p => Math.max(100, p - 100))} className="w-10 h-10 bg-slate-50 rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all">
                  <i className="fas fa-minus text-xs"></i>
                </button>
                <span className="flex-1 text-center font-black text-slate-900 text-lg">{stripSplitDistance}m</span>
                <button onClick={() => setStripSplitDistance(p => Math.min(10000, p + 100))} className="w-10 h-10 bg-slate-50 rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all">
                  <i className="fas fa-plus text-xs"></i>
                </button>
              </div>
            </section>
          </>
        )}

        {/* 6. Show Route */}
        <section className="space-y-4">
          <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">
            6. Planlanan Uçuş Rotasını Göster
          </label>
          <div className="flex gap-3">
            {[false, true].map(val => (
              <button
                key={val.toString()}
                onClick={() => setShowRoute(val)}
                className={`flex-1 py-3.5 rounded-2xl font-black text-sm transition-all border ${
                  showRoute === val 
                  ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100' 
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:border-blue-200'
                }`}
              >
                {val ? 'EVET' : 'HAYIR'}
              </button>
            ))}
          </div>
        </section>

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

      {/* Camera Selection Modal */}
      {showCameraModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowCameraModal(false)}></div>
          <div className="bg-slate-100 w-full max-w-md h-[80vh] rounded-[32px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
            <div className="p-8 shrink-0 flex items-center justify-between border-b border-slate-50">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">Kamera Seçimi</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Fotogrametrik Sensörler</p>
              </div>
              <button onClick={() => setShowCameraModal(false)} className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-slate-500">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-2">
              {CAMERAS.map(cam => (
                <button
                  key={cam.name}
                  onClick={() => {
                    setSelectedCamera(cam);
                    setShowCameraModal(false);
                  }}
                  className={`w-full p-4 rounded-2xl text-left transition-all border ${
                    selectedCamera.name === cam.name 
                    ? 'bg-blue-50 border-blue-200' 
                    : 'bg-slate-200 border-slate-100 hover:border-blue-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className={`font-black text-sm ${selectedCamera.name === cam.name ? 'text-blue-600' : 'text-slate-900'}`}>{cam.name}</p>
                    {selectedCamera.name === cam.name && <i className="fas fa-check-circle text-blue-500"></i>}
                  </div>
                  <div className="flex gap-3 mt-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">SW: {cam.sensorWidth}mm</span>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">FL: {cam.focalLength}mm</span>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">RES: {cam.imageWidth}px</span>
                  </div>
                </button>
              ))}
            </div>
            
            <div className="p-6 bg-slate-50 shrink-0">
              <button 
                onClick={() => setShowCameraModal(false)}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs"
              >
                KAPAT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlightPlanConfig;
