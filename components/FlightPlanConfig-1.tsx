import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Camera, CAMERAS, SCALES, FlightConfig } from '../src/types/flight';
import { parseKMLorKMZ, KMLData } from './KMLUtils';
import GlobalFooter from './GlobalFooter';
import Header from './Header';
import { AppSettings } from '../types';
import DrawBoundaryModal from './DrawBoundaryModal';
import { MapContainer, TileLayer, Polygon, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as turf from '@turf/turf';
import { 
  expandPolygon, 
  expandLineToPolygon, 
  getSteppedGridPolygon, 
  getMinBoundingBoxPolygon, 
  getGridPolygon, 
  calculatePolygonArea,
  calculateOptimumFlightAngle,
  generateFlightRoute,
  generateStripFlightRoute,
  calculateDJIPilot2Stats,
  splitLineByDistance,
  calculateLineBearing
} from './GeometryUtils';

const FitPreviewBounds: React.FC<{ coords: { lat: number; lng: number }[] }> = ({ coords }) => {
  const map = useMap();
  useEffect(() => {
    if (coords && coords.length > 0) {
      const bounds = L.latLngBounds(coords.map(c => [c.lat, c.lng]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }
    }
  }, [coords, map]);
  return null;
};

interface Props {
  onBack: () => void;
  flightType: 'Normal' | 'Strip';
  onPlanCreated: (kmlData: KMLData, config: FlightConfig, isGcpEnabled: boolean) => void;
  initialKmlData?: KMLData | null;
  initialSubAreaKmlData?: KMLData | null;
  initialConfig?: FlightConfig | null;
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
  initialConfig,
  onKmlDataChange, 
  onSubAreaKmlDataChange,
  settings
}) => {
  const fd = settings.flightDefaults;

  const [selectedCamera, setSelectedCamera] = useState<Camera>(() => {
    if (initialConfig?.camera) {
      const found = CAMERAS.find(c => c.name === initialConfig.camera.name);
      if (found) return found;
      if (initialConfig.camera.isCustom) {
        return CAMERAS.find(c => c.isCustom) || initialConfig.camera;
      }
      return initialConfig.camera;
    }
    return CAMERAS.find(c => c.name === fd.defaultCameraName) || CAMERAS[0];
  });
  const [selectedScale] = useState(SCALES[0]);
  const [height, setHeight] = useState<number>(() => initialConfig?.height ?? fd.defaultHeight ?? 200);
  const [buffer, setBuffer] = useState<number>(() => initialConfig?.buffer ?? fd.defaultBuffer ?? 0);
  const [expandToGrid, setExpandToGrid] = useState<number>(() => initialConfig?.expandToGrid ?? fd.defaultExpandToGrid ?? 0);
  const [expandToRectangle, setExpandToRectangle] = useState<boolean>(() => initialConfig?.expandToRectangle ?? fd.defaultExpandToRectangle ?? false);
  const [expandToMinRectangle, setExpandToMinRectangle] = useState<boolean>(() => initialConfig?.expandToMinRectangle ?? fd.defaultExpandToMinRectangle ?? false);
  const [stripBuffer, setStripBuffer] = useState<number>(() => initialConfig?.stripBuffer ?? fd.defaultStripBuffer ?? 50);
  const [isStripSplitEnabled, setIsStripSplitEnabled] = useState<boolean>(() => initialConfig?.stripSplitDistance !== undefined ? true : (fd.defaultIsStripSplitEnabled ?? false));
  const [stripSplitDistance, setStripSplitDistance] = useState<number>(() => initialConfig?.stripSplitDistance ?? fd.defaultStripSplitDistance ?? 2000);
  
  const [kmlData, setKmlData] = useState<KMLData | null>(initialKmlData || null);
  const [subAreaKmlData, setSubAreaKmlData] = useState<KMLData | null>(initialSubAreaKmlData || initialConfig?.subAreaKmlData || null);

  // GCP (YKN) States
  const [isGcpEnabled, setIsGcpEnabled] = useState<boolean>(() => initialConfig?.isGcpEnabled ?? fd.defaultIsGcpEnabled ?? false);
  const [gcpDistance, setGcpDistance] = useState<number>(() => initialConfig?.gcpDistance ?? fd.defaultGcpDistance ?? 400);
  const [gcpStartOffset, setGcpStartOffset] = useState<number>(() => initialConfig?.gcpStartOffset ?? fd.defaultGcpStartOffset ?? 10);
  const [gcpStartNumber, setGcpStartNumber] = useState<number>(() => initialConfig?.gcpStartNumber ?? fd.defaultGcpStartNumber ?? 1);

  // Camera Step Optional & Custom Camera States
  const [isCameraStepEnabled, setIsCameraStepEnabled] = useState<boolean>(() => initialConfig?.isCameraStepEnabled ?? fd.defaultIsCameraStepEnabled ?? false);
  const [customCamName, setCustomCamName] = useState<string>(() => initialConfig?.customCamName ?? initialConfig?.camera?.name ?? 'Özel Drone Kamera');
  const [customSensorWidth, setCustomSensorWidth] = useState<number>(() => initialConfig?.customSensorWidth ?? initialConfig?.camera?.sensorWidth ?? 13.2);
  const [customFocalLength, setCustomFocalLength] = useState<number>(() => initialConfig?.customFocalLength ?? initialConfig?.camera?.focalLength ?? 8.8);
  const [customImageWidth, setCustomImageWidth] = useState<number>(() => initialConfig?.customImageWidth ?? initialConfig?.camera?.imageWidth ?? 5472);

  const activeCamera: Camera = React.useMemo(() => {
    if (!isCameraStepEnabled) {
      return {
        name: 'Seç',
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
    setKmlData(initialKmlData || null);
  }, [initialKmlData, flightType]);

  React.useEffect(() => {
    setSubAreaKmlData(initialSubAreaKmlData || null);
  }, [initialSubAreaKmlData]);

  const [isParsing, setIsParsing] = useState(false);
  const [isParsingSubArea, setIsParsingSubArea] = useState(false);
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewMapProvider, setPreviewMapProvider] = useState(() => 
    localStorage.getItem('default_map_provider') || 'Google Satellite'
  );
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subAreaFileInputRef = useRef<HTMLInputElement>(null);

  const handleProcessFile = async (file: File) => {
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
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleProcessFile(file);
    }
  };

  const livePreviewData = React.useMemo(() => {
    if (!kmlData || !kmlData.features || kmlData.features.length === 0) return null;
    const feature = kmlData.features[0];
    const originalCoords = feature.coordinates || [];
    if (originalCoords.length === 0) return null;

    if (flightType === 'Normal') {
      const expanded = buffer > 0 ? expandPolygon(originalCoords, buffer) : null;
      const gridded = expandToGrid > 0 ? getSteppedGridPolygon(expanded || originalCoords, expandToGrid) : null;
      const baseForRect = gridded || expanded || originalCoords;

      let rectCoords = null;
      if (expandToMinRectangle) {
        rectCoords = getMinBoundingBoxPolygon(baseForRect);
      } else if (expandToRectangle) {
        rectCoords = getGridPolygon(baseForRect, 1);
      }

      const activeBoundary = rectCoords || gridded || expanded || originalCoords;
      const areaM2 = calculatePolygonArea(activeBoundary);
      const originalAreaM2 = calculatePolygonArea(originalCoords);

      return {
        originalCoords,
        activeBoundary,
        areaHa: areaM2 / 10000,
        originalAreaHa: originalAreaM2 / 10000,
        isModified: !!(buffer > 0 || expandToGrid > 0 || expandToRectangle || expandToMinRectangle)
      };
    } else {
      const lineCoords = originalCoords.map(c => [c.lng, c.lat]);
      let totalMeters = 0;
      if (lineCoords.length > 1) {
        const line = turf.lineString(lineCoords);
        totalMeters = Math.round(turf.length(line, { units: 'meters' }));
      }
      const corridor = expandLineToPolygon(originalCoords, stripBuffer || 50);
      const corridorAreaM2 = calculatePolygonArea(corridor);

      return {
        originalCoords,
        activeBoundary: corridor,
        stripLengthMeters: totalMeters,
        areaHa: corridorAreaM2 / 10000,
        isModified: true
      };
    }
  }, [kmlData, flightType, buffer, expandToGrid, expandToRectangle, expandToMinRectangle, stripBuffer]);

  const liveStats = React.useMemo(() => {
    if (!livePreviewData) return null;
    try {
      if (flightType === 'Normal') {
        const opt = calculateOptimumFlightAngle(
          livePreviewData.activeBoundary, 
          height, 
          activeCamera.sensorWidth || 13.2, 
          activeCamera.focalLength || 8.8, 
          80, 
          70
        );
        const route = generateFlightRoute(
          livePreviewData.activeBoundary, 
          opt.angle, 
          height, 
          activeCamera.sensorWidth || 13.2, 
          activeCamera.focalLength || 8.8, 
          80, 
          70
        );
        const stats = calculateDJIPilot2Stats(
          route, 
          height, 
          activeCamera.sensorWidth || 13.2, 
          activeCamera.focalLength || 8.8, 
          activeCamera.imageWidth || 5472, 
          80, 
          10
        );
        const batteries = Math.max(1, Math.ceil(stats.durationMinutes / 22));
        return {
          ...stats,
          batteries,
          angle: opt.angle
        };
      } else {
        const originalCoords = livePreviewData.originalCoords;
        const isSplit = isStripSplitEnabled && stripSplitDistance > 0;
        const splitSegs = isSplit ? splitLineByDistance(originalCoords, stripSplitDistance, 20) : [originalCoords];
        let totalMins = 0;
        let totalDistance = 0;
        splitSegs.forEach(seg => {
          const expanded = expandLineToPolygon(seg, stripBuffer || 50);
          const optAngle = calculateLineBearing(seg);
          const route = generateStripFlightRoute(
            expanded, 
            optAngle, 
            height, 
            activeCamera.sensorWidth || 13.2, 
            activeCamera.focalLength || 8.8, 
            80, 
            70
          );
          const stats = calculateDJIPilot2Stats(
            route, 
            height, 
            activeCamera.sensorWidth || 13.2, 
            activeCamera.focalLength || 8.8, 
            activeCamera.imageWidth || 5472, 
            80, 
            10
          );
          totalMins += stats.durationMinutes;
          totalDistance += stats.totalDistanceMeters;
        });
        const batteries = Math.max(1, Math.ceil(totalMins / 22));
        const totalSec = Math.round(totalMins * 60);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        return {
          durationMinutes: Math.round(totalMins * 10) / 10,
          durationText: `${mins} dk. ${secs} s.`,
          totalDistanceMeters: Math.round(totalDistance),
          batteries,
          angle: 0
        };
      }
    } catch (e) {
      return null;
    }
  }, [livePreviewData, flightType, height, activeCamera, isStripSplitEnabled, stripSplitDistance, stripBuffer]);

  const getPreviewTileLayer = () => {
    switch (previewMapProvider) {
      case 'Google Satellite':
        return <TileLayer url="https://mt1.google.com/vt/lyrs=s&hl=tr&gl=TR&x={x}&y={y}&z={z}" attribution="&copy; Google" crossOrigin="anonymous" />;
      case 'Google Hybrid':
        return <TileLayer url="https://mt1.google.com/vt/lyrs=y&hl=tr&gl=TR&x={x}&y={y}&z={z}" attribution="&copy; Google" crossOrigin="anonymous" />;
      case 'OpenStreetMap':
        return <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" crossOrigin="anonymous" />;
      case 'OpenTopoMap':
        return <TileLayer url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" attribution="&copy; OpenTopoMap" crossOrigin="anonymous" />;
      default:
        return <TileLayer url="https://mt1.google.com/vt/lyrs=y&hl=tr&gl=TR&x={x}&y={y}&z={z}" attribution="&copy; Google" crossOrigin="anonymous" />;
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
      height,
      buffer,
      expandToGrid,
      overlapFront: 80,
      overlapSide: 70,
      expandToRectangle,
      expandToMinRectangle,
      stripBuffer: flightType === 'Strip' ? stripBuffer : undefined,
      stripSplitDistance: (flightType === 'Strip' && isStripSplitEnabled) ? stripSplitDistance : undefined,
      gcpDistance,
      gcpStartOffset,
      gcpStartNumber,
      gcpLayoutType: flightType,
      subAreaKmlData: isGcpEnabled ? subAreaKmlData : null,
      isGcpEnabled,
      isCameraStepEnabled,
      customCamName,
      customSensorWidth,
      customFocalLength,
      customImageWidth
    };
    
    onPlanCreated(kmlData, config, isGcpEnabled);
  };

  const initialPoints = React.useMemo(() => kmlData?.features[0]?.coordinates || [], [kmlData]);

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800 overflow-hidden animate-in fade-in">
      <Header 
        title="Uçuş Planı Hazırlığı" 
        onBack={onBack} 
      />

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Sol Panel: Parametre ve Kontrol Formu */}
        <div className="w-full lg:w-[460px] xl:w-[500px] 2xl:w-[540px] shrink-0 h-full overflow-y-auto p-4 sm:p-6 lg:border-r border-slate-200 flex flex-col justify-between z-10 bg-slate-50 custom-scrollbar">
          <div className="max-w-xl mx-auto lg:max-w-none w-full space-y-4">
        {/* 1. Tahdit Dosyası */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <i className="fa-solid fa-file-code text-brand-600"></i>
              <span>1. Tahdit Dosyası</span>
            </label>
            {kmlData && (
              <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 font-mono">
                {kmlData.features[0]?.coordinates?.length || 0} Nokta
              </span>
            )}
          </div>
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
                className="p-3.5 bg-slate-50 border-2 border-dashed border-slate-300 hover:border-brand-500 rounded-xl flex items-center gap-3 cursor-pointer transition-all active:scale-[0.98] group"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                  <i className={`fas ${isParsing ? 'fa-spinner fa-spin' : 'fa-file-upload'} text-sm`}></i>
                </div>
                <div className="flex-1 truncate">
                  <p className="font-bold text-slate-800 text-xs">KML / KMZ Yükle</p>
                  <p className="text-[10px] text-slate-500">Dosya seçin</p>
                </div>
              </div>

              {/* Draw on Map Option */}
              <div 
                onClick={() => setIsDrawModalOpen(true)}
                className="p-3.5 bg-emerald-50 border-2 border-dashed border-emerald-300 hover:border-emerald-600 rounded-xl flex items-center gap-3 cursor-pointer transition-all active:scale-[0.98] group"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                  <i className={`fas ${flightType === 'Normal' ? 'fa-draw-polygon' : 'fa-route'} text-sm`}></i>
                </div>
                <div className="flex-1 truncate">
                  <p className="font-bold text-slate-800 text-xs">Haritada Çiz</p>
                  <p className="text-[10px] text-emerald-700">
                    {flightType === 'Normal' ? 'Alan çiz' : 'Hat çiz'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 truncate">
                <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-sm shrink-0">
                  <i className="fas fa-check text-sm"></i>
                </div>
                <div className="truncate">
                  <p className="font-bold text-slate-900 text-xs truncate font-mono">{kmlData.name}</p>
                  <p className="text-[10px] text-emerald-700 font-medium">
                    {kmlData.features[0]?.coordinates?.length || 0} Nokta • {flightType === 'Normal' ? 'Tahdit Alanı' : 'Şerit Hattı'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <button 
                  onClick={() => setIsDrawModalOpen(true)}
                  className="flex-1 sm:flex-initial px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <i className="fas fa-edit text-[10px]"></i>
                  <span>Düzenle</span>
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 sm:flex-initial px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-300 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <i className="fas fa-folder-open text-[10px]"></i>
                  <span>Değiştir</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 2. Uçuş Genişliği */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <i className="fa-solid fa-arrows-left-right-to-line text-brand-600"></i>
            <span>2. Uçuş Genişliği</span>
          </label>

          {flightType === 'Normal' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">Tahditi Genişlet (Buffer)</span>
                <div className="flex gap-2">
                  {[0, 5, 10, 20].map(val => (
                    <button
                      key={val}
                      onClick={() => setBuffer(val)}
                      className={`flex-1 py-2 px-1 rounded-lg font-bold text-xs transition-all border ${
                        buffer === val 
                        ? 'bg-brand-600 border-brand-600 text-white shadow-sm' 
                        : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {val === 0 ? 'Hayır' : `${val}m`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">Tahditi Genişlet (Ortogonal)</span>
                <div className="flex gap-2">
                  {[0, 50, 100, 200].map(val => (
                    <button
                      key={val}
                      onClick={() => setExpandToGrid(val)}
                      className={`flex-1 py-2 px-1 rounded-lg font-bold text-xs transition-all border ${
                        expandToGrid === val 
                        ? 'bg-brand-600 border-brand-600 text-white shadow-sm' 
                        : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {val === 0 ? 'Hayır' : `${val}m`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">Tahditi Genişlet (Geometri / Şekil)</span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setExpandToRectangle(false);
                      setExpandToMinRectangle(false);
                    }}
                    className={`py-2 px-1 rounded-lg font-bold text-xs transition-all border text-center ${
                      !expandToRectangle && !expandToMinRectangle
                      ? 'bg-brand-600 border-brand-600 text-white shadow-sm' 
                      : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    HAYIR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExpandToRectangle(true);
                      setExpandToMinRectangle(false);
                    }}
                    className={`py-2 px-1 rounded-lg font-bold text-xs transition-all border text-center ${
                      expandToRectangle && !expandToMinRectangle
                      ? 'bg-brand-600 border-brand-600 text-white shadow-sm' 
                      : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Eksenel Dikdörtgen
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExpandToRectangle(false);
                      setExpandToMinRectangle(true);
                    }}
                    className={`py-2 px-1 rounded-lg font-bold text-xs transition-all border text-center ${
                      expandToMinRectangle
                      ? 'bg-brand-600 border-brand-600 text-white shadow-sm' 
                      : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Döndürülmüş
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
                <button onClick={() => setStripBuffer(p => Math.max(5, p - 5))} className="w-9 h-9 bg-white border border-slate-300 rounded-lg text-slate-700 shadow-sm active:scale-95 transition-all">
                  <i className="fas fa-minus text-xs"></i>
                </button>
                <div className="flex-1 text-center font-mono">
                  <span className="block font-bold text-slate-900 text-base leading-none">{stripBuffer}m x 2</span>
                </div>
                <button onClick={() => setStripBuffer(p => Math.min(500, p + 5))} className="w-9 h-9 bg-white border border-slate-300 rounded-lg text-slate-700 shadow-sm active:scale-95 transition-all">
                  <i className="fas fa-plus text-xs"></i>
                </button>
              </div>
              <p className="text-[10px] text-slate-400 font-medium text-center">
                Toplam {stripBuffer * 2}m (Sağ/Sol Koridor)
              </p>
            </div>
          )}
        </section>

        {/* 3. Uçuşu Parçalara Ayır (Şerit Uçuş için) */}
        {flightType === 'Strip' && (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <i className="fa-solid fa-scissors text-brand-600"></i>
                <span>3. Uçuşu Parçalara Ayır</span>
              </label>
              <div className="flex bg-slate-100 p-1 rounded-lg gap-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsStripSplitEnabled(true)}
                  className={`px-3 py-1 rounded-md font-bold text-xs uppercase tracking-wider transition-all ${
                    isStripSplitEnabled
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  EVET
                </button>
                <button
                  type="button"
                  onClick={() => setIsStripSplitEnabled(false)}
                  className={`px-3 py-1 rounded-md font-bold text-xs uppercase tracking-wider transition-all ${
                    !isStripSplitEnabled
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  HAYIR
                </button>
              </div>
            </div>

            {isStripSplitEnabled && (
              <div className="animate-in slide-in-from-top-2 duration-300 space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <button onClick={() => setStripSplitDistance(p => Math.max(100, p - 100))} className="w-9 h-9 bg-white border border-slate-300 rounded-lg text-slate-700 shadow-sm active:scale-95 transition-all">
                    <i className="fas fa-minus text-xs"></i>
                  </button>
                  <span className="flex-1 text-center font-bold text-slate-900 text-base font-mono">{stripSplitDistance}m</span>
                  <button onClick={() => setStripSplitDistance(p => Math.min(10000, p + 100))} className="w-9 h-9 bg-white border border-slate-300 rounded-lg text-slate-700 shadow-sm active:scale-95 transition-all">
                    <i className="fas fa-plus text-xs"></i>
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 font-medium text-center">
                  Uçuşlar 20m overlap ile parçalara ayrılacaktır.
                </p>
              </div>
            )}
          </section>
        )}

        {/* 4. Yer Kontrol Noktası */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <i className="fa-solid fa-location-crosshairs text-brand-600"></i>
              <span>{flightType === 'Strip' ? '4. Yer Kontrol Noktası' : '3. Yer Kontrol Noktası'}</span>
            </label>
            <div className="flex bg-slate-100 p-1 rounded-lg gap-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setIsGcpEnabled(true)}
                className={`px-3 py-1 rounded-md font-bold text-xs uppercase tracking-wider transition-all ${
                  isGcpEnabled
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                EVET
              </button>
              <button
                type="button"
                onClick={() => setIsGcpEnabled(false)}
                className={`px-3 py-1 rounded-md font-bold text-xs uppercase tracking-wider transition-all ${
                  !isGcpEnabled
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                HAYIR
              </button>
            </div>
          </div>

          {!isGcpEnabled ? null : (
            <div className="space-y-4 animate-in fade-in duration-200 pt-2 border-t border-slate-100">
              {/* Alt Alan Seçimi */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                  Alt Alan Seçimi (İsteğe Bağlı)
                </span>
                <div className="flex flex-col gap-2">
                  <div 
                    onClick={() => !subAreaKmlData && subAreaFileInputRef.current?.click()}
                    className={`w-full p-3 border-2 border-dashed rounded-xl flex items-center gap-3 transition-all ${
                      subAreaKmlData ? 'bg-emerald-50 border-emerald-200 cursor-default' : 'bg-slate-50 border-slate-300 hover:border-brand-500 cursor-pointer'
                    }`}
                  >
                    <input 
                      type="file" 
                      ref={subAreaFileInputRef} 
                      onChange={handleSubAreaFileChange} 
                      accept=".kml,.kmz" 
                      className="hidden" 
                    />
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shadow-sm shrink-0 ${
                      subAreaKmlData ? 'bg-emerald-600 text-white' : 'bg-brand-600 text-white'
                    }`}>
                      <i className={`fas ${isParsingSubArea ? 'fa-spinner fa-spin' : subAreaKmlData ? 'fa-check' : 'fa-file-upload'} text-xs`}></i>
                    </div>
                    <div className="flex-1 truncate">
                      <p className="font-bold text-slate-800 truncate text-xs font-mono">{subAreaKmlData ? subAreaKmlData.name : 'Dosya Seçin'}</p>
                      <p className="text-[10px] text-slate-500">
                        {subAreaKmlData ? '1 Polygon bulundu' : 'Sadece Polygon tipi KML/KMZ'}
                      </p>
                    </div>
                  </div>
                  {subAreaKmlData && (
                    <button 
                      onClick={() => {
                        setSubAreaKmlData(null);
                        onSubAreaKmlDataChange?.(null);
                      }}
                      className="w-full py-2 bg-slate-100 border border-slate-200 rounded-lg font-bold text-slate-600 text-[11px] hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 active:scale-95 transition-all"
                    >
                      Alt Alanı Kaldır
                    </button>
                  )}
                </div>
              </div>

              {/* YKN Arası Mesafe */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                  YKN Arası Mesafe
                </span>
                <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <button 
                    onClick={() => setGcpDistance(p => Math.max(50, p - 50))} 
                    className="w-9 h-9 bg-white rounded-lg text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-300"
                  >
                    <i className="fas fa-minus text-xs"></i>
                  </button>
                  <span className="flex-1 text-center font-bold text-slate-800 text-base font-mono">{gcpDistance}m</span>
                  <button 
                    onClick={() => setGcpDistance(p => Math.min(2000, p + 50))} 
                    className="w-9 h-9 bg-white rounded-lg text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-300"
                  >
                    <i className="fas fa-plus text-xs"></i>
                  </button>
                </div>
              </div>

              {/* YKN Başlangıç Mesafesi */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                  YKN Başlangıç Mesafesi (m)
                </span>
                <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <button 
                    onClick={() => setGcpStartOffset(p => Math.max(0, p - 10))} 
                    className="w-9 h-9 bg-white rounded-lg text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-300"
                  >
                    <i className="fas fa-minus text-xs"></i>
                  </button>
                  <span className="flex-1 text-center font-bold text-slate-800 text-base font-mono">{gcpStartOffset}m</span>
                  <button 
                    onClick={() => setGcpStartOffset(p => Math.min(500, p + 10))} 
                    className="w-9 h-9 bg-white rounded-lg text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-300"
                  >
                    <i className="fas fa-plus text-xs"></i>
                  </button>
                </div>
              </div>

              {/* YKN Başlangıç Numarası */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                  YKN Başlangıç Numarası
                </span>
                <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <button 
                    onClick={() => setGcpStartNumber(p => Math.max(1, p - 1))} 
                    className="w-9 h-9 bg-white rounded-lg text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-300"
                  >
                    <i className="fas fa-minus text-xs"></i>
                  </button>
                  <input 
                    type="number"
                    value={gcpStartNumber}
                    onChange={(e) => setGcpStartNumber(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 text-center font-bold text-slate-800 text-base font-mono bg-transparent focus:outline-none"
                    min="1"
                  />
                  <button 
                    onClick={() => setGcpStartNumber(p => p + 1)} 
                    className="w-9 h-9 bg-white rounded-lg text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-300"
                  >
                    <i className="fas fa-plus text-xs"></i>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 5. / 4. Kamera Seçimi */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <i className="fa-solid fa-camera text-brand-600"></i>
              <span>{flightType === 'Strip' ? '5. Kamera Seçimi' : '4. Kamera Seçimi'}</span>
            </label>
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setIsCameraStepEnabled(true)}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                  isCameraStepEnabled
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                EVET
              </button>
              <button
                type="button"
                onClick={() => setIsCameraStepEnabled(false)}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                  !isCameraStepEnabled
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                HAYIR
              </button>
            </div>
          </div>

          {isCameraStepEnabled && (
            <div className="space-y-4 pt-2 border-t border-slate-100 animate-in fade-in">
              {/* Kamera Seçimi */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                    Kamera Modeli
                  </span>
                  {!selectedCamera.isCustom && (
                    <span className="text-[10px] font-bold text-slate-500 font-mono">
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
                  className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs cursor-pointer shadow-sm"
                >
                  {CAMERAS.map(cam => (
                    <option key={cam.name} value={cam.name}>{cam.name}</option>
                  ))}
                </select>
              </div>

              {/* Special Custom Camera Fields if selectedCamera is custom / unlisted */}
              {(selectedCamera.isCustom || selectedCamera.name.includes('Özel')) && (
                <div className="p-3.5 bg-brand-50/50 border border-brand-200 rounded-xl space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-brand-800 uppercase tracking-wider">
                    <i className="fa-solid fa-sliders text-brand-600"></i>
                    <span>Özel Kamera Parametreleri</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600 uppercase">Cihaz / Kamera Adı</label>
                    <input 
                      type="text"
                      value={customCamName}
                      onChange={(e) => setCustomCamName(e.target.value)}
                      placeholder="Örn: Custom Payload Drone"
                      className="w-full h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] font-bold text-slate-600 uppercase block truncate">Sensör (mm)</label>
                      <input 
                        type="number"
                        step="0.1"
                        value={customSensorWidth}
                        onChange={(e) => setCustomSensorWidth(Number(e.target.value))}
                        className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm text-center"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-600 uppercase block truncate">Odak (mm)</label>
                      <input 
                        type="number"
                        step="0.1"
                        value={customFocalLength}
                        onChange={(e) => setCustomFocalLength(Number(e.target.value))}
                        className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm text-center"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-600 uppercase block truncate">Piksel (px)</label>
                      <input 
                        type="number"
                        value={customImageWidth}
                        onChange={(e) => setCustomImageWidth(Number(e.target.value))}
                        className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm text-center"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Uçuş Yüksekliği */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                    Uçuş Yüksekliği
                  </span>
                  <span className="text-[10px] font-bold bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full border border-brand-200 font-mono">
                    GSD: ~{effectiveGsd.toFixed(2)} cm/px
                  </span>
                </div>
                <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <button 
                    type="button"
                    onClick={() => setHeight(p => Math.max(20, p - 10))}
                    className="w-9 h-9 bg-white rounded-lg text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-300"
                  >
                    <i className="fas fa-minus text-xs"></i>
                  </button>
                  <span className="flex-1 text-center font-bold text-slate-800 text-base font-mono">{height}m</span>
                  <button 
                    type="button"
                    onClick={() => setHeight(p => Math.min(500, p + 10))}
                    className="w-9 h-9 bg-white rounded-lg text-slate-700 shadow-sm active:scale-90 transition-all border border-slate-300"
                  >
                    <i className="fas fa-plus text-xs"></i>
                  </button>
                </div>
                <div className="flex gap-2 pt-1">
                  {[40, 60, 80, 100, 120].map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHeight(h)}
                      className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-all border ${
                        height === h
                          ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {h}m
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

            <div className="pt-4 pb-2">
              <button 
                onClick={handleCreatePlan}
                className="w-full py-4.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[20px] font-black uppercase tracking-[0.18em] text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 shadow-blue-500/20"
              >
                <span>UÇUŞ PLANLA</span>
                <i className="fas fa-arrow-right"></i>
              </button>
            </div>
          </div>
        </div>

        {/* Sağ Panel: Canlı İnteraktif Harita Önizleme (Masaüstü) */}
        <div 
          className="hidden lg:flex flex-1 h-full relative overflow-hidden bg-slate-100 flex-col"
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleProcessFile(file);
          }}
        >
          {/* Top Bar HUD - Katman Seçimi */}
          <div className="absolute top-4 right-4 z-[500] pointer-events-auto">
            <select
              value={previewMapProvider}
              onChange={(e) => setPreviewMapProvider(e.target.value)}
              className="bg-slate-900/85 backdrop-blur-md text-white border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-blue-500 shadow-xl cursor-pointer"
            >
              <option value="Google Satellite">Google Uydu</option>
              <option value="Google Hybrid">Google Hibrit</option>
              <option value="OpenStreetMap">OpenStreetMap</option>
              <option value="OpenTopoMap">Topografya</option>
            </select>
          </div>

          {/* Leaflet Map */}
          <div className="flex-1 relative w-full h-full">
            <MapContainer
              center={livePreviewData?.activeBoundary[0] ? [livePreviewData.activeBoundary[0].lat, livePreviewData.activeBoundary[0].lng] : [39, 35]}
              zoom={livePreviewData ? 14 : 6}
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
              attributionControl={false}
            >
              {getPreviewTileLayer()}
              {livePreviewData && (
                <FitPreviewBounds coords={livePreviewData.activeBoundary} />
              )}

              {/* Orijinal Tahdit Çizgisi (Kırmızı) */}
              {livePreviewData && (
                flightType === 'Normal' ? (
                  <Polygon
                    positions={livePreviewData.originalCoords.map(c => [c.lat, c.lng] as [number, number])}
                    color="red"
                    fillOpacity={0}
                    weight={2.5}
                  />
                ) : (
                  <Polyline
                    positions={livePreviewData.originalCoords.map(c => [c.lat, c.lng] as [number, number])}
                    color="red"
                    weight={3}
                  />
                )
              )}

              {/* Genişletilmiş / Tampon Uçuş Bölgesi (Sarı) */}
              {livePreviewData && (
                <Polygon
                  positions={livePreviewData.activeBoundary.map(c => [c.lat, c.lng] as [number, number])}
                  color="#ffff7f"
                  fillColor="#ffff7f"
                  fillOpacity={0.4}
                  weight={2.5}
                />
              )}

              {/* Alt Alan Varsa (Mor Kesikli Çizgi) */}
              {subAreaKmlData?.features.map((f, i) => {
                if (f.type === 'Polygon') {
                  return (
                    <Polygon
                      key={`subarea-${i}`}
                      positions={f.coordinates.map(c => [c.lat, c.lng] as [number, number])}
                      color="#d946ef"
                      fillOpacity={0.15}
                      weight={2}
                      dashArray="5, 5"
                    />
                  );
                }
                return null;
              })}
            </MapContainer>

            {/* Drag-over indicator overlay when dragging over the map */}
            {isDragOver && (
              <div className="absolute inset-0 z-[600] bg-blue-600/30 backdrop-blur-[2px] border-4 border-dashed border-blue-500 m-4 rounded-3xl flex items-center justify-center pointer-events-none animate-in fade-in duration-150">
                <div className="bg-slate-900/90 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3">
                  <i className="fas fa-cloud-upload-alt text-2xl text-blue-400 animate-bounce"></i>
                  <span className="text-sm font-black uppercase tracking-wider">KML/KMZ Dosyasını Buraya Bırakın</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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
