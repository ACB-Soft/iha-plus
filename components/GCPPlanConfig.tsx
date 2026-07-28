import React, { useState, useRef } from 'react';
import { FlightConfig, CAMERAS } from '../src/types/flight';
import { parseKMLorKMZ, KMLData } from './KMLUtils';
import GlobalFooter from './GlobalFooter';
import Header from './Header';
import { AppSettings } from '../types';
import DrawBoundaryModal from './DrawBoundaryModal';

interface Props {
  onBack: () => void;
  onPlanCreated: (kmlData: KMLData, config: FlightConfig) => void;
  initialKmlData?: KMLData | null;
  initialSubAreaKmlData?: KMLData | null;
  onKmlDataChange?: (data: KMLData | null) => void;
  onSubAreaKmlDataChange?: (data: KMLData | null) => void;
  gcpLayoutType: 'Normal' | 'Strip';
  settings: AppSettings;
}

const GCPPlanConfig: React.FC<Props> = ({ 
  onBack, 
  onPlanCreated, 
  initialKmlData, 
  initialSubAreaKmlData,
  onKmlDataChange, 
  onSubAreaKmlDataChange,
  gcpLayoutType, 
  settings 
}) => {
  const fd = settings.flightDefaults;
  const [gcpDistance, setGcpDistance] = useState(fd.defaultGcpDistance ?? 400);
  const [gcpStartOffset, setGcpStartOffset] = useState(fd.defaultGcpStartOffset ?? 10);
  const [gcpStartNumber, setGcpStartNumber] = useState(fd.defaultGcpStartNumber ?? 1);
  const [buffer, setBuffer] = useState(fd.defaultBuffer ?? 0);
  const [expandToGrid, setExpandToGrid] = useState(fd.defaultExpandToGrid ?? 0);
  const [expandToRectangle, setExpandToRectangle] = useState(fd.defaultExpandToRectangle ?? false);
  const [stripBuffer, setStripBuffer] = useState(fd.defaultStripBuffer ?? 50);
  const [isStripSplitEnabled, setIsStripSplitEnabled] = useState(fd.defaultIsStripSplitEnabled ?? false);
  const [stripSplitDistance, setStripSplitDistance] = useState(fd.defaultStripSplitDistance ?? 2000);

  const [kmlData, setKmlData] = useState<KMLData | null>(initialKmlData || null);
  const [subAreaKmlData, setSubAreaKmlData] = useState<KMLData | null>(initialSubAreaKmlData || null);

  React.useEffect(() => {
    setKmlData(initialKmlData || null);
  }, [initialKmlData]);

  React.useEffect(() => {
    setSubAreaKmlData(initialSubAreaKmlData || null);
  }, [initialSubAreaKmlData]);

  const [isParsing, setIsParsing] = useState(false);
  const [isParsingSubArea, setIsParsingSubArea] = useState(false);
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subAreaFileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsParsing(true);
      try {
        const data = await parseKMLorKMZ(file);
        
        if (gcpLayoutType === 'Strip') {
          const lineFeatures = data.features.filter(f => f.type === 'LineString');
          const polyFeatures = data.features.filter(f => f.type === 'Polygon');
          if (lineFeatures.length === 0 && polyFeatures.length === 0) {
            alert('HATA: Şeritvari YKN planı için tahdit dosyası en az bir Çizgi (LineString) veya Polygon içermelidir.');
            setKmlData(null);
            onKmlDataChange?.(null);
            return;
          }
        } else {
          const polygonFeatures = data.features.filter(f => f.type === 'Polygon');
          if (polygonFeatures.length !== 1) {
            alert('HATA: YKN planı için tahdit dosyası sadece tek bir Polygon (alan) objesi içermelidir. Lütfen dosyanızı kontrol edip tekrar deneyin.');
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

  const handleSubAreaFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsParsingSubArea(true);
      try {
        const data = await parseKMLorKMZ(file);
        
        const polygonFeatures = data.features.filter(f => f.type === 'Polygon');
        if (polygonFeatures.length !== 1) {
          alert('HATA: Alt alan dosyası sadece tek bir Polygon (alan) objesi içermelidir.');
          setSubAreaKmlData(null);
          onSubAreaKmlDataChange?.(null);
          return;
        }

        setSubAreaKmlData(data);
        onSubAreaKmlDataChange?.(data);
      } catch (err) {
        alert('HATA: KML dosyası ayrıştırılamadı.');
      } finally {
        setIsParsingSubArea(false);
        if (subAreaFileInputRef.current) subAreaFileInputRef.current.value = '';
      }
    }
  };

  const handleCreatePlan = () => {
    if (!kmlData) {
      alert('Lütfen bir KML/KMZ dosyası seçin.');
      return;
    }

    const selectedCam = CAMERAS.find(c => c.name === fd.defaultCameraName) || CAMERAS[0];
    const flightHeight = fd.defaultHeight ?? 200;
    const calcGsd = Math.round(((selectedCam.sensorWidth * flightHeight * 100) / (selectedCam.focalLength * selectedCam.imageWidth)) * 100) / 100;

    const config: FlightConfig = {
      flightType: gcpLayoutType === 'Strip' ? 'Strip' : 'Normal',
      camera: selectedCam,
      scale: '1/1000',
      gsd: calcGsd,
      height: flightHeight,
      buffer,
      expandToGrid,
      overlapFront: 0,
      overlapSide: 0,
      expandToRectangle,
      stripBuffer: gcpLayoutType === 'Strip' ? stripBuffer : undefined,
      stripSplitDistance: (gcpLayoutType === 'Strip' && isStripSplitEnabled) ? stripSplitDistance : undefined,
      gcpDistance,
      gcpStartOffset,
      gcpStartNumber,
      gcpLayoutType,
      subAreaKmlData
    };
    
    onPlanCreated(kmlData, config);
  };

  const initialPoints = React.useMemo(() => kmlData?.features[0]?.coordinates || [], [kmlData]);

  return (
    <div className="w-full h-full flex flex-col bg-slate-200 overflow-hidden animate-in fade-in">
      <Header title="YKN Planı Hazırlığı" onBack={onBack} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* 1. KML Selection */}
        <section className="space-y-2">
          <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">1. Tahdit Dosyası</label>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".kml,.kmz" 
            className="hidden" 
          />

          {!kmlData ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* File Upload Option */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="p-4 bg-slate-100 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-[24px] flex items-center gap-3.5 cursor-pointer transition-all active:scale-[0.98] group"
              >
                <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200 shrink-0 group-hover:scale-105 transition-transform">
                  <i className={`fas ${isParsing ? 'fa-spinner fa-spin' : 'fa-file-upload'} text-lg`}></i>
                </div>
                <div className="flex-1 truncate">
                  <p className="font-black text-slate-900 text-xs uppercase tracking-wider">KML / KMZ Dosyası Yükle</p>
                  <p className="text-[10px] text-slate-500 font-medium">Bilgisayardan dosya seçin</p>
                </div>
              </div>

              {/* Draw on Map Option */}
              <div 
                onClick={() => setIsDrawModalOpen(true)}
                className="p-4 bg-emerald-50 border-2 border-dashed border-emerald-300 hover:border-emerald-600 rounded-[24px] flex items-center gap-3.5 cursor-pointer transition-all active:scale-[0.98] group"
              >
                <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-200 shrink-0 group-hover:scale-105 transition-transform">
                  <i className={`fas ${gcpLayoutType === 'Normal' ? 'fa-draw-polygon' : 'fa-route'} text-lg`}></i>
                </div>
                <div className="flex-1 truncate">
                  <p className="font-black text-slate-900 text-xs uppercase tracking-wider">Harita Üzerinden Çiz</p>
                  <p className="text-[10px] text-emerald-700 font-semibold">
                    {gcpLayoutType === 'Normal' ? 'Noktaları tıklayarak alan çiz' : 'Noktaları tıklayarak hat çiz'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-emerald-50 border-2 border-emerald-200 rounded-[24px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 truncate">
                <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-200 shrink-0">
                  <i className="fas fa-check text-lg"></i>
                </div>
                <div className="truncate">
                  <p className="font-black text-slate-900 text-sm truncate">{kmlData.name}</p>
                  <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
                    {kmlData.features[0]?.coordinates?.length || 0} Nokta • {gcpLayoutType === 'Normal' ? 'Tahdit Alanı' : 'Şerit Hattı'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <button 
                  onClick={() => setIsDrawModalOpen(true)}
                  className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md"
                >
                  <i className="fas fa-map-marked-alt"></i>
                  <span>DÜZENLE</span>
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                >
                  <i className="fas fa-folder-open"></i>
                  <span>DOSYA YÜKLE</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 2. Alt Alan Seçimi */}
        <section className="space-y-2">
          <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">2. Alt Alan Seçimi (İsteğe Bağlı)</label>
          <div className="flex flex-col gap-3">
            <div 
              onClick={() => !subAreaKmlData && subAreaFileInputRef.current?.click()}
              className={`w-full p-3 border-2 border-dashed rounded-[24px] flex items-center gap-4 transition-all ${
                subAreaKmlData ? 'bg-emerald-50 border-emerald-200 cursor-default' : 'bg-slate-100 border-slate-200 hover:border-blue-300 cursor-pointer'
              }`}
            >
              <input 
                type="file" 
                ref={subAreaFileInputRef} 
                onChange={handleSubAreaFileChange} 
                accept=".kml,.kmz" 
                className="hidden" 
              />
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-md shrink-0 ${
                subAreaKmlData ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white'
              }`}>
                <i className={`fas ${isParsingSubArea ? 'fa-spinner fa-spin' : subAreaKmlData ? 'fa-check' : 'fa-file-upload'} text-lg`}></i>
              </div>
              <div className="flex-1 truncate">
                <p className="font-black text-slate-900 truncate text-sm">{subAreaKmlData ? subAreaKmlData.name : 'Dosya Seçin'}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                  {subAreaKmlData ? '1 Polygon bulundu' : 'Sadece Polygon (Alan) tipi KML/KMZ'}
                </p>
              </div>
            </div>
            {subAreaKmlData && (
              <button 
                onClick={() => {
                  setSubAreaKmlData(null);
                  onSubAreaKmlDataChange?.(null);
                }}
                className="w-full py-3.5 bg-slate-100 border border-slate-200 rounded-[24px] font-black text-slate-600 uppercase tracking-widest text-[10px] hover:bg-slate-50 active:scale-95 transition-all"
              >
                KALDIR
              </button>
            )}
          </div>
        </section>

        {/* 3. Genişletme Ayarları (Sadece Normal YKN için) */}
        {gcpLayoutType === 'Normal' && (
          <section className="space-y-4">
            <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">3. Genişletme Ayarları</label>
            
            <div className="space-y-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tahditi Genişlet (Buffer)</span>
              <div className="flex gap-3">
                {[0, 5, 10, 20].map(val => (
                  <button
                    key={val}
                    type="button"
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
                    type="button"
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
                    type="button"
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
        )}

        {/* 4. YKN Arası Mesafe */}
        <section className="space-y-2">
          <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">
            {gcpLayoutType === 'Normal' ? '4. YKN Arası Mesafe' : '3. YKN Arası Mesafe'}
          </label>
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

        {/* 5. YKN Başlangıç Mesafesi */}
        <section className="space-y-2">
          <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">
            {gcpLayoutType === 'Normal' ? '5. YKN Başlangıç Mesafesi' : '4. YKN Başlangıç Mesafesi'}
          </label>
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

        {/* 6. YKN Başlangıç Numarası */}
        <section className="space-y-2">
          <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">
            {gcpLayoutType === 'Normal' ? '6. YKN Başlangıç Numarası' : '5. YKN Başlangıç Numarası'}
          </label>
          <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button 
              onClick={() => setGcpStartNumber(p => Math.max(1, p - 1))} 
              className="w-10 h-10 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all border border-slate-100"
            >
              <i className="fas fa-minus text-xs"></i>
            </button>
            <input 
              type="number"
              value={gcpStartNumber}
              onChange={(e) => setGcpStartNumber(Math.max(1, parseInt(e.target.value) || 1))}
              className="flex-1 text-center font-black text-slate-900 text-lg bg-transparent focus:outline-none"
              min="1"
            />
            <button 
              onClick={() => setGcpStartNumber(p => p + 1)} 
              className="w-10 h-10 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all border border-slate-100"
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

      <DrawBoundaryModal 
        isOpen={isDrawModalOpen}
        onClose={() => setIsDrawModalOpen(false)}
        flightType={gcpLayoutType}
        initialPoints={initialPoints}
        onSave={(data) => {
          setKmlData(data);
          onKmlDataChange?.(data);
        }}
      />
    </div>
  );
};

export default GCPPlanConfig;
