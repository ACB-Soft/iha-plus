import React, { useState, useRef, useMemo } from 'react';
import Header from './Header';
import GlobalFooter from './GlobalFooter';
import { Camera, CAMERAS, KMLData } from '../src/types/flight';
import { parseKMLorKMZ } from './KMLUtils';
import { AppSettings, DEFAULT_FLIGHT_DEFAULTS } from '../types';
import DrawBoundaryModal from './DrawBoundaryModal';
import { calculateControlFlightPlan, ControlFlightResult, extractBoundaryPoints, calculateAreaM2 } from './ControlFlightUtils';
import ControlFlightMapView from './ControlFlightMapView';

interface Props {
  onBack: () => void;
  settings?: AppSettings;
}

export type ControlRouteType = 'Grid' | 'StripCross';
export type GcpPlacementType = 'center' | 'corners_center' | 'interval';

const ControlFlightView: React.FC<Props> = ({ onBack, settings }) => {
  const fd = settings?.flightDefaults || DEFAULT_FLIGHT_DEFAULTS;

  // Active Plan Result (if created)
  const [planResult, setPlanResult] = useState<ControlFlightResult | null>(null);

  // 1. KML Data & Upload States
  const [kmlData, setKmlData] = useState<KMLData | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 2. Kontrol Alanı Yüzdesi (%5, %10, %15, %20)
  const [samplePercentage, setSamplePercentage] = useState<number>(5);

  // 3. Kontrol Rotası Seçimi (Grid Alan vs Şeritvari Çapraz)
  const [routeType, setRouteType] = useState<ControlRouteType>('Grid');

  // 4. Kenar Uzunluğu (Grid Alan) / Şerit Genişliği ve Z Uzunluğu (Şeritvari Çapraz)
  const [gridEdgeLength, setGridEdgeLength] = useState<number>(250); // 250m x 250m
  const [stripBuffer, setStripBuffer] = useState<number>(50); // 50m x 2
  const [zStripLength, setZStripLength] = useState<number>(1000); // 1000m toplam Z hat uzunluğu

  // 5. Yer Kontrol Noktası (YKN)
  const [isGcpEnabled, setIsGcpEnabled] = useState<boolean>(false);
  const [gcpPlacementType, setGcpPlacementType] = useState<GcpPlacementType>('center');
  const [gcpStartNumber, setGcpStartNumber] = useState<number>(1);

  // 6. Kamera & Uçuş Parametreleri
  const [isCameraStepEnabled, setIsCameraStepEnabled] = useState<boolean>(false);
  const [selectedCamera, setSelectedCamera] = useState<Camera>(() => {
    return CAMERAS.find(c => c.name === fd.defaultCameraName) || CAMERAS[0];
  });
  const [customCamName, setCustomCamName] = useState<string>('Özel Drone Kamera');
  const [customSensorWidth, setCustomSensorWidth] = useState<number>(13.2);
  const [customFocalLength, setCustomFocalLength] = useState<number>(8.8);
  const [customImageWidth, setCustomImageWidth] = useState<number>(5472);
  const [height, setHeight] = useState<number>(fd.defaultHeight || 120);

  const activeCamera: Camera = useMemo(() => {
    if (!isCameraStepEnabled) {
      return {
        name: 'Standart',
        sensorWidth: 13.2,
        focalLength: 8.8,
        imageWidth: 5472,
      };
    }
    if (selectedCamera.isCustom || selectedCamera.name.includes('Özel')) {
      return {
        name: customCamName.trim() || 'Özel Kamera',
        sensorWidth: Number(customSensorWidth) || 13.2,
        focalLength: Number(customFocalLength) || 8.8,
        imageWidth: Number(customImageWidth) || 5472,
        isCustom: true,
      };
    }
    return selectedCamera;
  }, [isCameraStepEnabled, selectedCamera, customCamName, customSensorWidth, customFocalLength, customImageWidth]);

  const effectiveGsd = useMemo(() => {
    if (!activeCamera.focalLength || !activeCamera.imageWidth) return 0;
    return (activeCamera.sensorWidth * height * 100) / (activeCamera.focalLength * activeCamera.imageWidth);
  }, [activeCamera, height]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsParsing(true);
      try {
        const data = await parseKMLorKMZ(file);
        if (!data.features || data.features.length === 0) {
          alert('HATA: Yüklenen KML/KMZ dosyasında geçerli geometri bulunamadı.');
          return;
        }
        setKmlData(data);
      } catch (err) {
        alert('HATA: KML dosyası ayrıştırılamadı. Lütfen geçerli bir dosya yükleyin.');
      } finally {
        setIsParsing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const handleCreateControlPlan = () => {
    if (!kmlData) {
      alert('Lütfen öncelikle bir KML/KMZ uçuş alanı dosyası yükleyin veya harita üzerinden çizin.');
      return;
    }

    try {
      const calculated = calculateControlFlightPlan({
        kmlData,
        samplePercentage,
        routeType,
        gridEdgeLength,
        stripBuffer,
        zStripLength,
        isGcpEnabled,
        gcpPlacementType,
        gcpStartNumber,
        camera: activeCamera,
        height
      });

      setPlanResult(calculated);
    } catch (err) {
      console.error('Plan calculation error:', err);
      alert('Kontrol uçuş planı oluşturulurken bir hata meydana geldi. Lütfen parametreleri kontrol ediniz.');
    }
  };

  const initialPoints = useMemo(() => kmlData?.features[0]?.coordinates || [], [kmlData]);

  // Canlı Hesaplama Özeti (Grid Alan veya Z-Şerit Modu)
  const liveCalculation = useMemo(() => {
    const coords = extractBoundaryPoints(kmlData);
    const areaM2 = coords.length >= 3 ? calculateAreaM2(coords) : 0;
    const totalAreaHa = areaM2 / 10000;
    const targetAreaM2 = areaM2 * (samplePercentage / 100);
    const targetAreaHa = targetAreaM2 / 10000;

    // 1. Grid Modu Hesabı
    const singleGridAreaM2 = gridEdgeLength * gridEdgeLength;
    const singleGridAreaHa = singleGridAreaM2 / 10000;
    const calculatedGridSpots = (singleGridAreaM2 > 0 && targetAreaM2 > 0) ? Math.max(1, Math.ceil(targetAreaM2 / singleGridAreaM2)) : 0;
    const actualGridControlAreaM2 = calculatedGridSpots * singleGridAreaM2;

    // 2. Şeritvari 'Z' Modu Hesabı
    const singleZAreaM2 = zStripLength * (stripBuffer * 2);
    const singleZAreaHa = singleZAreaM2 / 10000;
    const calculatedZSpots = (singleZAreaM2 > 0 && targetAreaM2 > 0) ? Math.max(1, Math.ceil(targetAreaM2 / singleZAreaM2)) : 0;
    const actualZControlAreaM2 = calculatedZSpots * singleZAreaM2;

    const isGrid = routeType === 'Grid';
    const singleItemAreaM2 = isGrid ? singleGridAreaM2 : singleZAreaM2;
    const singleItemAreaHa = isGrid ? singleGridAreaHa : singleZAreaHa;
    const calculatedSpots = isGrid ? calculatedGridSpots : calculatedZSpots;
    const actualControlAreaM2 = isGrid ? actualGridControlAreaM2 : actualZControlAreaM2;
    const actualControlAreaHa = actualControlAreaM2 / 10000;
    const actualPercentage = areaM2 > 0 ? (actualControlAreaM2 / areaM2) * 100 : samplePercentage;

    return {
      totalAreaM2: areaM2,
      totalAreaHa: totalAreaHa.toFixed(2),
      targetAreaM2,
      targetAreaHa: targetAreaHa.toFixed(2),
      actualControlAreaM2,
      actualControlAreaHa: actualControlAreaHa.toFixed(2),
      actualPercentage: actualPercentage.toFixed(2),
      singleGridAreaM2,
      singleGridAreaHa: singleGridAreaHa.toFixed(2),
      singleZAreaM2,
      singleZAreaHa: singleZAreaHa.toFixed(2),
      singleItemAreaM2,
      singleItemAreaHa: singleItemAreaHa.toFixed(2),
      calculatedSpots,
      hasArea: areaM2 > 0
    };
  }, [kmlData, samplePercentage, gridEdgeLength, zStripLength, stripBuffer, routeType]);

  if (planResult) {
    return (
      <ControlFlightMapView
        result={planResult}
        onBack={() => setPlanResult(null)}
      />
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-200 overflow-hidden animate-in fade-in">
      <Header title="Kontrol Uçuşu" onBack={onBack} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* 1. Uçuş Alanı KML Yükleme */}
        <section className="space-y-2">
          <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
            <span>1. Uçuş Alanı (Tahdit Dosyası)</span>
          </label>
          
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
                className="p-4 bg-slate-100 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-[24px] flex items-center gap-3.5 cursor-pointer transition-all active:scale-[0.98] group shadow-sm"
              >
                <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200 shrink-0 group-hover:scale-105 transition-transform">
                  <i className={`fas ${isParsing ? 'fa-spinner fa-spin' : 'fa-file-upload'} text-lg`}></i>
                </div>
                <div className="flex-1 truncate">
                  <p className="font-black text-slate-900 text-xs uppercase tracking-wider">KML / KMZ Dosyası Yükle</p>
                  <p className="text-[10px] text-slate-500 font-medium">Uçulmuş veya planlanan saha</p>
                </div>
              </div>

              {/* Draw on Map Option */}
              <div 
                onClick={() => setIsDrawModalOpen(true)}
                className="p-4 bg-emerald-50 border-2 border-dashed border-emerald-300 hover:border-emerald-600 rounded-[24px] flex items-center gap-3.5 cursor-pointer transition-all active:scale-[0.98] group shadow-sm"
              >
                <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-200 shrink-0 group-hover:scale-105 transition-transform">
                  <i className="fas fa-draw-polygon text-lg"></i>
                </div>
                <div className="flex-1 truncate">
                  <p className="font-black text-slate-900 text-xs uppercase tracking-wider">Harita Üzerinden Çiz</p>
                  <p className="text-[10px] text-emerald-700 font-semibold">Noktaları tıklayarak alan belirle</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-emerald-50 border-2 border-emerald-200 rounded-[24px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3 truncate">
                <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-200 shrink-0">
                  <i className="fas fa-check text-lg"></i>
                </div>
                <div className="truncate">
                  <p className="font-black text-slate-900 text-sm truncate">{kmlData.name || 'Uçuş Alanı'}</p>
                  <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
                    {extractBoundaryPoints(kmlData).length} Nokta • {liveCalculation.totalAreaHa} ha Saha Yüklendi
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <button 
                  onClick={() => setIsDrawModalOpen(true)}
                  className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95"
                >
                  <i className="fas fa-map-marked-alt"></i>
                  <span>DÜZENLE</span>
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <i className="fas fa-folder-open"></i>
                  <span>DEĞİŞTİR</span>
                </button>
                <button 
                  onClick={() => setKmlData(null)}
                  className="w-9 h-9 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl flex items-center justify-center text-xs transition-all active:scale-95"
                  title="Kaldır"
                >
                  <i className="fas fa-trash-alt"></i>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 2. Kontrol Edilecek Alan Yüzdesi */}
        <section className="space-y-3 pt-2 border-t border-slate-300/60">
          <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest block">
            2. Kontrol Edilecek Alan Yüzdesi
          </label>

          <div className="grid grid-cols-4 gap-2">
            {[5, 10, 15, 20].map(val => (
              <button
                key={val}
                type="button"
                onClick={() => setSamplePercentage(val)}
                className={`py-3 rounded-xl font-black text-xs transition-all border ${
                  samplePercentage === val 
                    ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:border-blue-300'
                }`}
              >
                %{val}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button 
              type="button"
              onClick={() => setSamplePercentage(p => Math.max(1, p - 1))} 
              className="w-10 h-10 bg-white rounded-xl text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-100 flex items-center justify-center font-bold"
            >
              <i className="fas fa-minus text-xs"></i>
            </button>
            <div className="flex-1 text-center font-black text-slate-900 text-sm">
              Özel Oran: %{samplePercentage}
            </div>
            <button 
              type="button"
              onClick={() => setSamplePercentage(p => Math.min(100, p + 1))} 
              className="w-10 h-10 bg-white rounded-xl text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-100 flex items-center justify-center font-bold"
            >
              <i className="fas fa-plus text-xs"></i>
            </button>
          </div>
        </section>

        {/* 3. Kontrol Rotası Seçimi */}
        <section className="space-y-3 pt-2 border-t border-slate-300/60">
          <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">
            3. Kontrol Rotası Modeli
          </label>

          <div className="grid grid-cols-2 gap-3">
            {/* Grid Alan Seçeneği */}
            <button
              type="button"
              onClick={() => setRouteType('Grid')}
              className={`p-3.5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between space-y-2 ${
                routeType === 'Grid'
                  ? 'bg-blue-50/80 border-blue-600 shadow-md'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold ${
                  routeType === 'Grid' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  <i className="fas fa-th-large"></i>
                </div>
                {routeType === 'Grid' && (
                  <i className="fas fa-check-circle text-blue-600 text-sm"></i>
                )}
              </div>
              <div>
                <p className="font-black text-slate-900 text-xs uppercase">Grid Alan (Mini Adacık)</p>
                <p className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">
                  Köşeler ve merkezde homojen spot gridler
                </p>
              </div>
            </button>

            {/* Şeritvari 'Z' Deseni Seçeneği */}
            <button
              type="button"
              onClick={() => setRouteType('StripCross')}
              className={`p-3.5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between space-y-2 ${
                routeType === 'StripCross'
                  ? 'bg-blue-50/80 border-blue-600 shadow-md'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold ${
                  routeType === 'StripCross' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  <i className="fas fa-bolt"></i>
                </div>
                {routeType === 'StripCross' && (
                  <i className="fas fa-check-circle text-blue-600 text-sm"></i>
                )}
              </div>
              <div>
                <p className="font-black text-slate-900 text-xs uppercase">Şeritvari 'Z' Deseni</p>
                <p className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">
                  2 Paralel hat ve 45° açılı çapraz 'Z' rotası
                </p>
              </div>
            </button>
          </div>
        </section>

        {/* 4. Seçilen Modele Göre Boyut / Genişlik Parametreleri */}
        <section className="space-y-4 pt-2 border-t border-slate-300/60 animate-in fade-in">
          {routeType === 'Grid' ? (
            <div className="space-y-3">
              <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">
                4. Grid Kenar Uzunluğu (m)
              </label>

              <div className="grid grid-cols-4 gap-2">
                {[250, 500, 1000, 2000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setGridEdgeLength(val)}
                    className={`py-3 rounded-xl font-black text-xs transition-all border ${
                      gridEdgeLength === val 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                        : 'bg-slate-100 border-slate-200 text-slate-700 hover:border-blue-300'
                    }`}
                  >
                    {val}m
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                <button 
                  type="button"
                  onClick={() => setGridEdgeLength(p => Math.max(50, p - 50))} 
                  className="w-10 h-10 bg-white rounded-xl text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-100 flex items-center justify-center font-bold"
                >
                  <i className="fas fa-minus text-xs"></i>
                </button>
                <span className="flex-1 text-center font-black text-slate-900 text-base">
                  {gridEdgeLength}m × {gridEdgeLength}m
                </span>
                <button 
                  type="button"
                  onClick={() => setGridEdgeLength(p => Math.min(5000, p + 50))} 
                  className="w-10 h-10 bg-white rounded-xl text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-100 flex items-center justify-center font-bold"
                >
                  <i className="fas fa-plus text-xs"></i>
                </button>
              </div>

              {/* Matematiksel Dağılım Hesap Kartı */}
              {liveCalculation.hasArea && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-2xl space-y-1.5 text-xs text-slate-800">
                  <div className="flex items-center justify-between font-black text-blue-900 text-[11px] uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <i className="fas fa-calculator text-blue-600"></i>
                      Homojen Grid Dağılım Hesabı
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    <span className="font-bold text-slate-900">{liveCalculation.totalAreaHa} ha</span> toplam alan için hedeflenen <span className="font-bold text-blue-700">%{samplePercentage}</span> = <span className="font-bold text-slate-900">{liveCalculation.targetAreaHa} ha</span>.
                  </p>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Her biri {gridEdgeLength}x{gridEdgeLength}m ({liveCalculation.singleGridAreaHa} ha) olan <strong className="text-blue-800">{liveCalculation.calculatedSpots} adet</strong> grid alan ile toplam <strong className="text-emerald-700">{liveCalculation.actualControlAreaHa} ha (%{liveCalculation.actualPercentage})</strong> kontrol alanı oluşturulacaktır.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">
                4. Z-Şerit Uzunluğu ve Şerit Genişliği
              </label>

              {/* Z-Şerit Uzunluğu (Toplam Hat Boyu) */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Z-Şerit Uzunluğu (Toplam Uçuş Hattı)
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {[500, 1000, 2500, 5000].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setZStripLength(val)}
                      className={`py-3 rounded-xl font-black text-xs transition-all border ${
                        zStripLength === val 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                          : 'bg-slate-100 border-slate-200 text-slate-700 hover:border-blue-300'
                      }`}
                    >
                      {val}m
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                  <button 
                    type="button"
                    onClick={() => setZStripLength(p => Math.max(200, p - 100))} 
                    className="w-10 h-10 bg-white rounded-xl text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-100 flex items-center justify-center font-bold"
                  >
                    <i className="fas fa-minus text-xs"></i>
                  </button>
                  <span className="flex-1 text-center font-black text-slate-900 text-base">
                    Toplam {zStripLength}m Hat Boyu
                  </span>
                  <button 
                    type="button"
                    onClick={() => setZStripLength(p => Math.min(5000, p + 100))} 
                    className="w-10 h-10 bg-white rounded-xl text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-100 flex items-center justify-center font-bold"
                  >
                    <i className="fas fa-plus text-xs"></i>
                  </button>
                </div>
              </div>

              {/* Şerit Genişliği */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Şerit Genişliği (Sağ/Sol Buffer)
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {[25, 50, 75, 100].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setStripBuffer(val)}
                      className={`py-3 rounded-xl font-black text-xs transition-all border ${
                        stripBuffer === val 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                          : 'bg-slate-100 border-slate-200 text-slate-700 hover:border-blue-300'
                      }`}
                    >
                      {val}m x 2
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                  <button 
                    type="button"
                    onClick={() => setStripBuffer(p => Math.max(10, p - 5))} 
                    className="w-10 h-10 bg-white rounded-xl text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-100 flex items-center justify-center font-bold"
                  >
                    <i className="fas fa-minus text-xs"></i>
                  </button>
                  <span className="flex-1 text-center font-black text-slate-900 text-base">
                    Toplam {stripBuffer * 2}m ({stripBuffer}m x 2)
                  </span>
                  <button 
                    type="button"
                    onClick={() => setStripBuffer(p => Math.min(500, p + 5))} 
                    className="w-10 h-10 bg-white rounded-xl text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-100 flex items-center justify-center font-bold"
                  >
                    <i className="fas fa-plus text-xs"></i>
                  </button>
                </div>
              </div>

              {/* Matematiksel Otomatik Şerit Dağılım Hesap Kartı */}
              {liveCalculation.hasArea && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-2xl space-y-1.5 text-xs text-slate-800">
                  <div className="flex items-center justify-between font-black text-blue-900 text-[11px] uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <i className="fas fa-calculator text-blue-600"></i>
                      Otomatik Z-Şerit Dağılım Hesabı
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    <span className="font-bold text-slate-900">{liveCalculation.totalAreaHa} ha</span> toplam alan için hedeflenen <span className="font-bold text-blue-700">%{samplePercentage}</span> = <span className="font-bold text-slate-900">{liveCalculation.targetAreaHa} ha</span>.
                  </p>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Her biri {zStripLength}m uzunluğunda ve {stripBuffer * 2}m genişliğinde (~{liveCalculation.singleZAreaHa} ha) olan <strong className="text-blue-800">{liveCalculation.calculatedSpots} adet</strong> Z-şeridi ile toplam <strong className="text-emerald-700">{liveCalculation.actualControlAreaHa} ha (%{liveCalculation.actualPercentage})</strong> kontrol alanı otomatik oluşturulacaktır.
                  </p>
                </div>
              )}


            </div>
          )}
        </section>

        {/* 5. Yer Kontrol Noktası (YKN) */}
        <section className="space-y-4 pt-2 border-t border-slate-300/60">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">
              5. Yer Kontrol Noktası (YKN)
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

          {isGcpEnabled && (
            <div className="space-y-4 animate-in fade-in duration-200 pt-1">
              {/* YKN Dağıtım Tipi */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  YKN Dağıtım Şekli
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGcpPlacementType('center')}
                    className={`py-3 px-3 rounded-xl font-bold text-xs transition-all border text-left ${
                      gcpPlacementType === 'center'
                        ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-sm'
                        : 'bg-slate-100 border-slate-200 text-slate-700 hover:border-blue-200'
                    }`}
                  >
                    <p className="font-black text-[11px] uppercase">Merkez Noktalar</p>
                    <p className="text-[9px] text-slate-500 font-medium">Her kontrol adacığına 1 YKN</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGcpPlacementType('corners_center')}
                    className={`py-3 px-3 rounded-xl font-bold text-xs transition-all border text-left ${
                      gcpPlacementType === 'corners_center'
                        ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-sm'
                        : 'bg-slate-100 border-slate-200 text-slate-700 hover:border-blue-200'
                    }`}
                  >
                    <p className="font-black text-[11px] uppercase">Köşeler + Merkez</p>
                    <p className="text-[9px] text-slate-500 font-medium">Hassas 5 nokta geometrisi</p>
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
                    type="button"
                    onClick={() => setGcpStartNumber(p => Math.max(1, p - 1))} 
                    className="w-10 h-10 bg-white rounded-xl text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-100 font-bold"
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
                    type="button"
                    onClick={() => setGcpStartNumber(p => p + 1)} 
                    className="w-10 h-10 bg-white rounded-xl text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-100 font-bold"
                  >
                    <i className="fas fa-plus text-xs"></i>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 6. Kamera ve Uçuş Parametreleri */}
        <section className="space-y-4 pt-2 border-t border-slate-300/60">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-black text-slate-900 uppercase tracking-widest">
              6. Kamera & Yükseklik Seçimi
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

          {isCameraStepEnabled && (
            <div className="p-4 bg-slate-100 rounded-[24px] border border-slate-200 space-y-4 animate-in fade-in">
              {/* Kamera Seçimi */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Kamera Modeli
                  </label>
                  {!selectedCamera.isCustom && (
                    <span className="text-[10px] font-bold text-slate-500">
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

              {/* Özel Kamera Alanları */}
              {(selectedCamera.isCustom || selectedCamera.name.includes('Özel')) && (
                <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-1.5 text-[10px] font-black text-blue-900 uppercase tracking-wider">
                    <i className="fas fa-sliders-h text-blue-600"></i>
                    Özel Kamera Parametreleri
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Kamera / Model Adı</label>
                    <input 
                      type="text"
                      value={customCamName}
                      onChange={(e) => setCustomCamName(e.target.value)}
                      placeholder="Örn: Özel Fotogrametri Sensörü"
                      className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-sm"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[8px] font-bold text-slate-500 uppercase block truncate">Sensör (mm)</label>
                      <input 
                        type="number"
                        step="0.1"
                        value={customSensorWidth}
                        onChange={(e) => setCustomSensorWidth(Number(e.target.value))}
                        className="w-full h-9 px-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-sm text-center"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-slate-500 uppercase block truncate">Odak (mm)</label>
                      <input 
                        type="number"
                        step="0.1"
                        value={customFocalLength}
                        onChange={(e) => setCustomFocalLength(Number(e.target.value))}
                        className="w-full h-9 px-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-sm text-center"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-slate-500 uppercase block truncate">Piksel (px)</label>
                      <input 
                        type="number"
                        value={customImageWidth}
                        onChange={(e) => setCustomImageWidth(Number(e.target.value))}
                        className="w-full h-9 px-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-sm text-center"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Uçuş Yüksekliği & GSD */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Uçuş Yüksekliği (m)
                  </label>
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
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

        {/* Planla Butonu */}
        <div className="pt-4 pb-6">
          <button 
            type="button"
            onClick={handleCreateControlPlan}
            className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-[24px] font-black uppercase tracking-[0.2em] text-sm shadow-xl shadow-blue-600/25 active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            <span>KONTROL UÇUŞUNU PLANLA</span>
            <i className="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>

      <GlobalFooter />

      <DrawBoundaryModal 
        isOpen={isDrawModalOpen}
        onClose={() => setIsDrawModalOpen(false)}
        flightType="Normal"
        initialPoints={initialPoints}
        onSave={(data) => setKmlData(data)}
      />
    </div>
  );
};

export default ControlFlightView;
