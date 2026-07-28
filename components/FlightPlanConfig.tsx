import React, { useState, useRef } from 'react';
import { Camera, CAMERAS, SCALES, FlightConfig } from '../src/types/flight';
import { parseKMLorKMZ, KMLData } from './KMLUtils';
import GlobalFooter from './GlobalFooter';
import Header from './Header';
import { AppSettings } from '../types';
import DrawBoundaryModal from './DrawBoundaryModal';

interface Props {
  onBack: () => void;
  flightType: 'Normal' | 'Strip';
  onPlanCreated: (kmlData: KMLData, config: FlightConfig, isGcpEnabled: boolean) => void;
  initialKmlData?: KMLData | null;
  initialSubAreaKmlData?: KMLData | null;
  onKmlDataChange?: (data: KMLData | null) => void;
  onSubAreaKmlDataChange?: (data: KMLData | null) => void;
  settings: AppSettings;
}

const FlightPlanConfig: React.FC<Props> = ({ 
  onBack, 
  flightType, 
  onPlanCreated, 
  initialKmlData, 
  initialSubAreaKmlData,
  onKmlDataChange, 
  onSubAreaKmlDataChange,
  settings
}) => {
  const fd = settings.flightDefaults;

  const [selectedCamera, setSelectedCamera] = useState<Camera>(() => {
    return CAMERAS.find(c => c.name === fd.defaultCameraName) || CAMERAS[0];
  });
  const [selectedScale] = useState(SCALES[0]);
  const [height, setHeight] = useState(fd.defaultHeight ?? 200);
  const [buffer, setBuffer] = useState(fd.defaultBuffer ?? 0);
  const [expandToGrid, setExpandToGrid] = useState<number>(fd.defaultExpandToGrid ?? 0);
  const [expandToRectangle, setExpandToRectangle] = useState(fd.defaultExpandToRectangle ?? false);
  const [stripBuffer, setStripBuffer] = useState(fd.defaultStripBuffer ?? 50);
  const [isStripSplitEnabled, setIsStripSplitEnabled] = useState(fd.defaultIsStripSplitEnabled ?? false);
  const [stripSplitDistance, setStripSplitDistance] = useState(fd.defaultStripSplitDistance ?? 2000);
  
  const [kmlData, setKmlData] = useState<KMLData | null>(initialKmlData || null);
  const [subAreaKmlData, setSubAreaKmlData] = useState<KMLData | null>(initialSubAreaKmlData || null);

  // GCP (YKN) States
  const [isGcpEnabled, setIsGcpEnabled] = useState<boolean>(fd.defaultIsGcpEnabled ?? false);
  const [gcpDistance, setGcpDistance] = useState(fd.defaultGcpDistance ?? 400);
  const [gcpStartOffset, setGcpStartOffset] = useState(fd.defaultGcpStartOffset ?? 10);
  const [gcpStartNumber, setGcpStartNumber] = useState(fd.defaultGcpStartNumber ?? 1);

  // Camera Step Optional & Custom Camera States
  const [isCameraStepEnabled, setIsCameraStepEnabled] = useState<boolean>(fd.defaultIsCameraStepEnabled ?? false);
  const [customCamName, setCustomCamName] = useState<string>('Özel Drone Kamera');
  const [customSensorWidth, setCustomSensorWidth] = useState<number>(13.2);
  const [customFocalLength, setCustomFocalLength] = useState<number>(8.8);
  const [customImageWidth, setCustomImageWidth] = useState<number>(5472);

  const activeCamera: Camera = React.useMemo(() => {
    if (!isCameraStepEnabled) {
      return {
        name: 'Belirtilmedi (İsteğe Bağlı)',
        sensorWidth: 13.2,
        focalLength: 8.8,
        imageWidth: 5472,
        isCustom: true
      };
    }
    if (selectedCamera.isCustom || selectedCamera.name.includes('Özel')) {
      return {
        name: customCamName.trim() || 'Özel / Diğer Kamera Model',
        sensorWidth: Number(customSensorWidth) || 13.2,
        focalLength: Number(customFocalLength) || 8.8,
        imageWidth: Number(customImageWidth) || 5472,
        isCustom: true
      };
    }
    return selectedCamera;
  }, [isCameraStepEnabled, selectedCamera, customCamName, customSensorWidth, customFocalLength, customImageWidth]);

  const effectiveGsd = React.useMemo(() => {
    if (!isCameraStepEnabled || !activeCamera.focalLength || !activeCamera.imageWidth) {
      return 0;
    }
    return (activeCamera.sensorWidth * height * 100) / (activeCamera.focalLength * activeCamera.imageWidth);
  }, [isCameraStepEnabled, activeCamera, height]);

  React.useEffect(() => {
    if (settings.flightDefaults) {
      const defCam = CAMERAS.find(c => c.name === settings.flightDefaults.defaultCameraName) || CAMERAS[0];
      setSelectedCamera(defCam);
      setHeight(settings.flightDefaults.defaultHeight ?? 200);
      setBuffer(settings.flightDefaults.defaultBuffer ?? 0);
      setExpandToGrid(settings.flightDefaults.defaultExpandToGrid ?? 0);
      setExpandToRectangle(settings.flightDefaults.defaultExpandToRectangle ?? false);
      setStripBuffer(settings.flightDefaults.defaultStripBuffer ?? 50);
      setIsStripSplitEnabled(settings.flightDefaults.defaultIsStripSplitEnabled ?? false);
      setStripSplitDistance(settings.flightDefaults.defaultStripSplitDistance ?? 2000);
      setIsGcpEnabled(settings.flightDefaults.defaultIsGcpEnabled ?? true);
      setGcpDistance(settings.flightDefaults.defaultGcpDistance ?? 400);
      setGcpStartOffset(settings.flightDefaults.defaultGcpStartOffset ?? 10);
      setGcpStartNumber(settings.flightDefaults.defaultGcpStartNumber ?? 1);
    }
  }, [settings.flightDefaults]);

  React.useEffect(() => {
    setKmlData(initialKmlData || null);
  }, [initialKmlData, flightType]);

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

    const config: FlightConfig = {
      flightType,
      camera: activeCamera,
      scale: selectedScale,
      gsd: Math.round(effectiveGsd * 100) / 100,
      height: isCameraStepEnabled ? height : 0,
      buffer,
      expandToGrid,
      overlapFront: 80,
      overlapSide: 70,
      expandToRectangle,
      stripBuffer: flightType === 'Strip' ? stripBuffer : undefined,
      stripSplitDistance: (flightType === 'Strip' && isStripSplitEnabled) ? stripSplitDistance : undefined,
      gcpDistance,
      gcpStartOffset,
      gcpStartNumber,
      gcpLayoutType: flightType,
      subAreaKmlData: isGcpEnabled ? subAreaKmlData : null
    };
    
    onPlanCreated(kmlData, config, isGcpEnabled);
  };

  const initialPoints = React.useMemo(() => kmlData?.features[0]?.coordinates || [], [kmlData]);

  return (
    <div className="w-full h-full flex flex-col bg-slate-200 overflow-hidden animate-in fade-in">
      <Header 
        title="Uçuş Hazırlığı" 
        onBack={onBack} 
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* 1. Tahdit Dosyası */}
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
                  <i className={`fas ${flightType === 'Normal' ? 'fa-draw-polygon' : 'fa-route'} text-lg`}></i>
                </div>
                <div className="flex-1 truncate">
                  <p className="font-black text-slate-900 text-xs uppercase tracking-wider">Harita Üzerinden Çiz</p>
                  <p className="text-[10px] text-emerald-700 font-semibold">
                    {flightType === 'Normal' ? 'Noktaları tıklayarak alan çiz' : 'Noktaları tıklayarak hat çiz'}
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
                    {kmlData.features[0]?.coordinates?.length || 0} Nokta • {flightType === 'Normal' ? 'Tahdit Alanı' : 'Şerit Hattı'}
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

        {/* 2. Uçuş Genişliği */}
        <section className="space-y-4">
          <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">
            2. Uçuş Genişliği
          </label>

          {flightType === 'Normal' ? (
            <div className="space-y-4">
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
            </div>
          ) : (
            <div className="space-y-3">
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
            </div>
          )}
        </section>

        {/* 3. Uçuşu Parçalara Ayır (Şerit Uçuş için) */}
        {flightType === 'Strip' && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">
                3. Uçuşu Parçalara Ayır
              </label>
              <div className="flex bg-slate-200 p-1 rounded-xl gap-1 border border-slate-300/60">
                <button
                  type="button"
                  onClick={() => setIsStripSplitEnabled(true)}
                  className={`px-3 py-1 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all ${
                    isStripSplitEnabled
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  EVET
                </button>
                <button
                  type="button"
                  onClick={() => setIsStripSplitEnabled(false)}
                  className={`px-3 py-1 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all ${
                    !isStripSplitEnabled
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  HAYIR
                </button>
              </div>
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
        )}

        {/* 4. Yer Kontrol Noktası */}
        <section className="space-y-4 pt-2 border-t border-slate-300/60">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">
              {flightType === 'Strip' ? '4. Yer Kontrol Noktası' : '3. Yer Kontrol Noktası'}
            </label>
            <div className="flex bg-slate-200 p-1 rounded-xl gap-1 border border-slate-300/60">
              <button
                type="button"
                onClick={() => setIsGcpEnabled(true)}
                className={`px-3 py-1 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all ${
                  isGcpEnabled
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                EVET
              </button>
              <button
                type="button"
                onClick={() => setIsGcpEnabled(false)}
                className={`px-3 py-1 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all ${
                  !isGcpEnabled
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                HAYIR
              </button>
            </div>
          </div>

          {!isGcpEnabled ? null : (
            <div className="space-y-5 animate-in fade-in duration-200 pt-1">
              {/* Alt Alan Seçimi */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Alt Alan Seçimi (İsteğe Bağlı)
                </span>
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
              </div>

              {/* YKN Arası Mesafe */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  YKN Arası Mesafe
                </span>
                <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                  <button 
                    onClick={() => setGcpDistance(p => Math.max(50, p - 50))} 
                    className="w-10 h-10 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all border border-slate-100"
                  >
                    <i className="fas fa-minus text-xs"></i>
                  </button>
                  <span className="flex-1 text-center font-black text-slate-900 text-lg">{gcpDistance}m</span>
                  <button 
                    onClick={() => setGcpDistance(p => Math.min(2000, p + 50))} 
                    className="w-10 h-10 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all border border-slate-100"
                  >
                    <i className="fas fa-plus text-xs"></i>
                  </button>
                </div>
              </div>

              {/* YKN Başlangıç Mesafesi */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  YKN Başlangıç Mesafesi
                </span>
                <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                  <button 
                    onClick={() => setGcpStartOffset(p => Math.max(0, p - 10))} 
                    className="w-10 h-10 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all border border-slate-100"
                  >
                    <i className="fas fa-minus text-xs"></i>
                  </button>
                  <span className="flex-1 text-center font-black text-slate-900 text-lg">{gcpStartOffset}m</span>
                  <button 
                    onClick={() => setGcpStartOffset(p => Math.min(500, p + 10))} 
                    className="w-10 h-10 bg-white rounded-xl text-slate-600 shadow-sm active:scale-90 transition-all border border-slate-100"
                  >
                    <i className="fas fa-plus text-xs"></i>
                  </button>
                </div>
              </div>

              {/* YKN Başlangıç Numarası */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  YKN Başlangıç Numarası
                </span>
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
              </div>
            </div>
          )}
        </section>

        {/* 5. Kamera Seçimi */}
        <section className="space-y-4 pt-2 border-t border-slate-300/60">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">
              {flightType === 'Strip' ? '5. Kamera Seçimi' : '4. Kamera Seçimi'}
            </label>
            <div className="flex bg-slate-200 p-1 rounded-xl gap-1 border border-slate-300/60">
              <button
                type="button"
                onClick={() => setIsCameraStepEnabled(true)}
                className={`px-3 py-1 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all ${
                  isCameraStepEnabled
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                EVET
              </button>
              <button
                type="button"
                onClick={() => setIsCameraStepEnabled(false)}
                className={`px-3 py-1 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all ${
                  !isCameraStepEnabled
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                HAYIR
              </button>
            </div>
          </div>

          {!isCameraStepEnabled ? null : (
            <div className="p-4 bg-slate-100 rounded-[24px] border border-slate-200 space-y-4 animate-in fade-in">
              {/* Kamera Seçimi */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Kamera Modeli
                  </label>
                  {!selectedCamera.isCustom && (
                    <span className="text-[10px] font-bold text-slate-400">
                      {selectedCamera.sensorWidth}mm / {selectedCamera.focalLength}mm
                    </span>
                  )}
                </div>
                <select 
                  value={selectedCamera.name}
                  onChange={(e) => {
                    const cam = CAMERAS.find(c => c.name === e.target.value);
                    if (cam) setSelectedCamera(cam);
                  }}
                  className="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 appearance-none shadow-sm text-xs cursor-pointer"
                >
                  {CAMERAS.map(cam => (
                    <option key={cam.name} value={cam.name}>{cam.name}</option>
                  ))}
                </select>
              </div>

              {/* Special Custom Camera Fields if selectedCamera is custom / unlisted */}
              {(selectedCamera.isCustom || selectedCamera.name.includes('Özel')) && (
                <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-1.5 text-[10px] font-black text-blue-800 uppercase tracking-wider">
                    <i className="fas fa-sliders-h text-blue-600"></i>
                    Özel / Listede Olmayan Cihaz Parametreleri
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Cihaz / Kamera Adı</label>
                    <input 
                      type="text"
                      value={customCamName}
                      onChange={(e) => setCustomCamName(e.target.value)}
                      placeholder="Örn: Custom Payload Drone"
                      className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-sm"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[8px] font-bold text-slate-500 uppercase block truncate">Sensör Gen. (mm)</label>
                      <input 
                        type="number"
                        step="0.1"
                        value={customSensorWidth}
                        onChange={(e) => setCustomSensorWidth(Number(e.target.value))}
                        className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-slate-500 uppercase block truncate">Odak Uzak. (mm)</label>
                      <input 
                        type="number"
                        step="0.1"
                        value={customFocalLength}
                        onChange={(e) => setCustomFocalLength(Number(e.target.value))}
                        className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-slate-500 uppercase block truncate">Res. Gen. (px)</label>
                      <input 
                        type="number"
                        value={customImageWidth}
                        onChange={(e) => setCustomImageWidth(Number(e.target.value))}
                        className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Uçuş Yüksekliği */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Uçuş Yüksekliği (m)
                  </label>
                  <span className="text-[10px] font-bold text-blue-600">
                    GSD: ~{effectiveGsd.toFixed(2)} cm/px
                  </span>
                </div>
                <div className="flex items-center gap-3 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm">
                  <button 
                    type="button"
                    onClick={() => setHeight(p => Math.max(20, p - 10))}
                    className="w-9 h-9 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-bold active:scale-95 transition-all flex items-center justify-center"
                  >
                    <i className="fas fa-minus text-xs"></i>
                  </button>
                  <div className="flex-1 text-center font-black text-slate-900 text-sm">
                    {height}m
                  </div>
                  <button 
                    type="button"
                    onClick={() => setHeight(p => Math.min(500, p + 10))}
                    className="w-9 h-9 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-bold active:scale-95 transition-all flex items-center justify-center"
                  >
                    <i className="fas fa-plus text-xs"></i>
                  </button>
                </div>
              </div>
            </div>
          )}
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

      <DrawBoundaryModal 
        isOpen={isDrawModalOpen}
        onClose={() => setIsDrawModalOpen(false)}
        flightType={flightType}
        initialPoints={initialPoints}
        onSave={(data) => {
          setKmlData(data);
          onKmlDataChange?.(data);
        }}
      />
    </div>
  );
};


export default FlightPlanConfig;
