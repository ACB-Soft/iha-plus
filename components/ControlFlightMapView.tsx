import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Popup, Polygon, Polyline, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import GlobalFooter from './GlobalFooter';
import Header from './Header';
import {
  ControlFlightResult,
  ControlSpot,
  ControlGCP,
  calculateAreaM2,
  generateControlFlightKML,
  generateControlGCPCSV,
  generateControlGCPTXT,
  rotateSpotAroundCenter,
  rotateGCPsAroundSpotCenter
} from './ControlFlightUtils';
import { Point } from './GeometryUtils';
import { generateFlightPlanPDF } from '../src/utils/pdfExport';
import { formatDurationText } from './GeometryUtils';

// Fix Leaflet icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface Props {
  result: ControlFlightResult;
  onBack: () => void;
}

const FitBounds: React.FC<{ result: ControlFlightResult }> = ({ result }) => {
  const map = useMap();
  const hasFittedRef = React.useRef(false);

  useEffect(() => {
    if (!hasFittedRef.current && result.originalBoundary.length > 0) {
      const bounds = L.latLngBounds([]);
      result.originalBoundary.forEach(c => {
        bounds.extend([c.lat, c.lng]);
      });
      if (result.spots) {
        result.spots.forEach(s => {
          s.boundary.forEach(c => bounds.extend([c.lat, c.lng]));
        });
      }
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
        hasFittedRef.current = true;
      }
    }
  }, [result, map]);

  return null;
};

const ZoomTracker: React.FC<{ onZoomChange: (z: number) => void }> = ({ onZoomChange }) => {
  const map = useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
    zoom: () => {
      onZoomChange(map.getZoom());
    }
  });

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  return null;
};

const getSpotHandleIcon = (zoom: number) => {
  // Uzak seviyelerde (zoom < 13) devasa tutamaç görünmesin, tamamen gizle
  if (zoom < 13) {
    return null;
  }
  // 13 <= zoom < 15: Çok uzak olmayan ama hafif seviyelerde küçük bir nokta tutamaç (10px)
  if (zoom < 15) {
    return L.divIcon({
      className: 'custom-spot-handle-mini',
      html: `<div class="w-2.5 h-2.5 rounded-full bg-amber-500 hover:bg-amber-600 border border-white shadow-sm flex items-center justify-center cursor-grab active:cursor-grabbing transition-transform hover:scale-125">
             </div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    });
  }
  // 15 <= zoom < 17: Standart orta yakınlıkta kompakt tutamaç (16px)
  if (zoom < 17) {
    return L.divIcon({
      className: 'custom-spot-handle-compact',
      html: `<div class="w-4 h-4 rounded-full bg-amber-500 hover:bg-amber-600 active:scale-90 border-[1.5px] border-white shadow-md flex items-center justify-center text-white text-[7px] cursor-grab active:cursor-grabbing transition-all">
               <i class="fas fa-arrows-alt"></i>
             </div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
  }
  // zoom >= 17: Yakın seviyede net ve kibar tutamaç (20px)
  return L.divIcon({
    className: 'custom-spot-handle-normal',
    html: `<div class="w-5 h-5 rounded-full bg-amber-500 hover:bg-amber-600 active:scale-90 border-2 border-white shadow-md flex items-center justify-center text-white text-[9px] cursor-grab active:cursor-grabbing transition-all">
             <i class="fas fa-arrows-alt"></i>
           </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
};

const getCleanBaseName = (pName: string) => {
  return pName
    .replace(/\.(kml|kmz)$/i, '')
    .replace(/^(YKN_|UCUS_|TAHDIT_|KONTROL_|Normal_|Strip_|Plan_)/gi, '')
    .trim();
};

const ControlFlightMapView: React.FC<Props> = ({ result, onBack }) => {
  const mapProvider = localStorage.getItem('default_map_provider') || 'Google Satellite';
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportType, setExportType] = useState<'flight_plan' | 'ykn_plan' | 'pdf_summary'>('flight_plan');
  const [exportName, setExportName] = useState(`UCUS_KONTROL_${getCleanBaseName(result.projectName)}`);
  const [yknSubFormat, setYknSubFormat] = useState<'kml' | 'csv' | 'txt'>('kml');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // Stateful spots & gcps for interactive dragging/repositioning
  const [spots, setSpots] = useState<ControlSpot[]>(result.spots || []);
  const [gcps, setGcps] = useState<ControlGCP[]>(result.gcps || []);
  const [currentZoom, setCurrentZoom] = useState<number>(15);
  const [selectedSpotId, setSelectedSpotId] = useState<string>('all');
  const [isRotationOpen, setIsRotationOpen] = useState<boolean>(false);

  // Stats dynamically computed from active spots
  const totalAreaHa = (result.totalAreaM2 / 10000).toFixed(2);
  const controlAreaM2 = useMemo(() => {
    return spots.reduce((acc, s) => acc + calculateAreaM2(s.boundary), 0);
  }, [spots]);
  const controlAreaHa = (controlAreaM2 / 10000).toFixed(2);
  const realPercentage = result.totalAreaM2 > 0
    ? ((controlAreaM2 / result.totalAreaM2) * 100).toFixed(2)
    : (result.effectivePercentage ? result.effectivePercentage.toFixed(2) : result.samplePercentage.toFixed(2));

  // Active angle of the currently selected spot or the first spot for display
  const activeAngle = useMemo(() => {
    if (selectedSpotId === 'all') {
      return spots.length > 0 ? (spots[0].rotationAngle || 0) : 0;
    }
    const target = spots.find(s => s.id === selectedSpotId);
    return target ? (target.rotationAngle || 0) : 0;
  }, [selectedSpotId, spots]);

  // Rotate a specific spot around its centroid / center of mass
  const handleRotateSpot = (spotId: string, angleDeltaDeg: number) => {
    setSpots(prev =>
      prev.map(s => {
        if (s.id === spotId) {
          return rotateSpotAroundCenter(s, angleDeltaDeg);
        }
        return s;
      })
    );

    const targetSpot = spots.find(s => s.id === spotId);
    if (targetSpot) {
      setGcps(prev => rotateGCPsAroundSpotCenter(prev, spotId, targetSpot.center, angleDeltaDeg));
    }
  };

  // Rotate all spots around their individual centroids
  const handleRotateAllSpots = (angleDeltaDeg: number) => {
    setSpots(prev =>
      prev.map(s => rotateSpotAroundCenter(s, angleDeltaDeg))
    );

    spots.forEach(s => {
      setGcps(prev => rotateGCPsAroundSpotCenter(prev, s.id, s.center, angleDeltaDeg));
    });
  };

  // Set absolute angle for a spot or all spots
  const handleSetAngle = (spotId: string, targetAngle: number) => {
    const normalized = ((targetAngle % 360) + 360) % 360;
    if (spotId === 'all') {
      spots.forEach(s => {
        const cur = s.rotationAngle || 0;
        const delta = normalized - cur;
        handleRotateSpot(s.id, delta);
      });
    } else {
      const targetSpot = spots.find(s => s.id === spotId);
      if (targetSpot) {
        const cur = targetSpot.rotationAngle || 0;
        const delta = normalized - cur;
        handleRotateSpot(spotId, delta);
      }
    }
  };

  const getTileLayer = () => {
    switch (mapProvider) {
      case 'Google Satellite':
        return <TileLayer url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" attribution="&copy; Google" crossOrigin="anonymous" />;
      case 'Google Hybrid':
        return <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" attribution="&copy; Google" crossOrigin="anonymous" />;
      case 'Esri Satellite':
      case 'Esri World Imagery':
        return <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" crossOrigin="anonymous" />;
      case 'OpenStreetMap':
        return <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" crossOrigin="anonymous" />;
      case 'OpenTopoMap':
        return <TileLayer url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" attribution="&copy; OpenTopoMap" crossOrigin="anonymous" />;
      default:
        return <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" attribution="&copy; Google" crossOrigin="anonymous" />;
    }
  };

  const handleOpenExportModal = (type: 'flight_plan' | 'ykn_plan' | 'pdf_summary') => {
    const baseName = getCleanBaseName(result.projectName);
    setExportType(type);
    if (type === 'flight_plan') {
      setExportName(`UCUS_KONTROL_${baseName}`);
    } else if (type === 'pdf_summary') {
      setExportName(`RAPOR_KONTROL_${baseName}`);
    } else {
      setExportName(`YKN_KONTROL_${baseName}`);
    }
    setShowExportModal(true);
  };

  // Helper file download
  const downloadFile = (content: string, fileName: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // PDF Export
  const handleExportPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const mapEl = document.querySelector('.leaflet-container') as HTMLElement | null;
      await generateFlightPlanPDF({
        projectName: exportName || result.projectName,
        flightType: 'Normal',
        camera: result.camera,
        altitude: result.height,
        gsd: result.gsd,
        areaSizeM2: result.totalAreaM2,
        bufferMeters: 0,
        gcpEnabled: gcps.length > 0,
        gcpPoints: gcps.map(g => ({ id: g.id, name: g.name, lat: g.lat, lng: g.lng })),
        estimatedDurationMinutes: result.estimatedFlightSeconds ? result.estimatedFlightSeconds / 60 : 15,
        mapElement: mapEl
      }, exportName || `RAPOR_KONTROL_${getCleanBaseName(result.projectName)}`);
    } catch (err) {
      console.error('PDF Export Error:', err);
      alert('PDF raporu oluşturulurken bir hata oluştu.');
    } finally {
      setIsGeneratingPdf(false);
      setShowExportModal(false);
    }
  };

  // Main Export execution
  const handleExport = () => {
    const cleanName = exportName || getCleanBaseName(result.projectName);

    if (exportType === 'flight_plan') {
      const kmlStr = generateControlFlightKML({
        ...result,
        spots,
        gcps,
        controlAreaM2,
        controlAreaHa: Number(controlAreaHa),
        effectivePercentage: Number(realPercentage)
      });
      downloadFile(kmlStr, `${cleanName}.kml`, 'application/vnd.google-earth.kml+xml');
    } else if (exportType === 'ykn_plan') {
      if (yknSubFormat === 'csv') {
        const csvStr = generateControlGCPCSV(gcps);
        downloadFile(csvStr, `${cleanName}.csv`, 'text/csv;charset=utf-8;');
      } else if (yknSubFormat === 'txt') {
        const txtStr = generateControlGCPTXT(gcps);
        downloadFile(txtStr, `${cleanName}.txt`, 'text/plain;charset=utf-8;');
      } else {
        const kmlStr = generateControlFlightKML({ ...result, spots: [], gcps });
        downloadFile(kmlStr, `${cleanName}.kml`, 'application/vnd.google-earth.kml+xml');
      }
    }
    setShowExportModal(false);
  };

  // GCP Marker Drag update
  const handleMarkerDragEnd = (id: string, e: any) => {
    const newLatLng = e.target.getLatLng();
    setGcps(prev => prev.map(g => g.id === id ? { ...g, lat: newLatLng.lat, lng: newLatLng.lng } : g));
  };

  // Grid Spot Handle Drag update (moves polygon, center, flightLines and attached GCPs)
  const handleSpotDragEnd = (spotId: string, e: any) => {
    const newLatLng = e.target.getLatLng();
    const targetSpot = spots.find(s => s.id === spotId);
    if (!targetSpot) return;

    const dLat = newLatLng.lat - targetSpot.center.lat;
    const dLng = newLatLng.lng - targetSpot.center.lng;

    const newCenter: Point = { lat: newLatLng.lat, lng: newLatLng.lng };
    const newBoundary: Point[] = targetSpot.boundary.map(p => ({
      lat: p.lat + dLat,
      lng: p.lng + dLng
    }));
    const newFlightLines: Point[][] = targetSpot.flightLines.map(line =>
      line.map(p => ({
        lat: p.lat + dLat,
        lng: p.lng + dLng
      }))
    );

    setSpots(prev =>
      prev.map(s =>
        s.id === spotId
          ? {
              ...s,
              center: newCenter,
              boundary: newBoundary,
              flightLines: newFlightLines
            }
          : s
      )
    );

    // Synchronize associated GCPs
    setGcps(prev =>
      prev.map(g => {
        if (g.spotId === spotId) {
          return {
            ...g,
            lat: g.lat + dLat,
            lng: g.lng + dLng
          };
        }
        return g;
      })
    );
  };

  return (
    <div className="w-full flex flex-col bg-slate-200 h-full animate-in overflow-hidden">
      {/* Header */}
      <Header title="Uçuş Planı Ekranı" onBack={onBack} />

      {/* Main Map Viewport */}
      <div className="flex-1 relative z-10">
        {/* Z-Rotasyon Birleşik Alet Çubuğu (Simgeye tıklandığında genişler / daralır) */}
        {result.routeType === 'StripCross' && (
          <div className="absolute top-4 left-4 z-[500] animate-in fade-in duration-150">
            {!isRotationOpen ? (
              <button
                type="button"
                id="control-flight-rotate-toggle-btn"
                onClick={() => setIsRotationOpen(true)}
                className="w-10 h-10 bg-slate-200/95 hover:bg-slate-300 border border-slate-300 rounded-2xl shadow-xl backdrop-blur-md flex items-center justify-center text-blue-600 transition-all active:scale-95 group"
                title="Z Deseni Döndürme Panelini Aç"
              >
                <i className="fas fa-sync-alt text-sm group-hover:rotate-45 transition-transform"></i>
              </button>
            ) : (
              <div className="w-64 max-w-[calc(100vw-2rem)] bg-slate-200/95 backdrop-blur-md border border-slate-300 rounded-2xl p-2.5 shadow-2xl flex flex-col gap-2 text-slate-800 animate-in zoom-in-95 duration-150">
                {/* Üst Satır: Şerit Seçimi ve Kapat Butonu */}
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center text-[10px] shadow-sm shrink-0">
                    <i className="fas fa-sync-alt"></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <select
                      value={selectedSpotId}
                      onChange={(e) => setSelectedSpotId(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-2 py-1 text-xs font-bold focus:outline-none focus:border-blue-500 cursor-pointer shadow-sm truncate"
                      title="Döndürülecek Şeridi Seçin"
                    >
                      {spots.length > 1 && (
                        <option value="all">⚡ Tüm Şeritler (Toplu)</option>
                      )}
                      {spots.map((s, idx) => (
                        <option key={s.id} value={s.id}>
                          {s.name || `Şerit ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRotationOpen(false)}
                    className="w-6 h-6 rounded-lg bg-slate-300/80 hover:bg-slate-300 text-slate-600 hover:text-slate-900 flex items-center justify-center text-[10px] transition-colors shrink-0"
                    title="Paneli Kapat"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                </div>

                {/* Alt Satır: Açı Girişi ve Canlı Kaydırıcı */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-300/80">
                  {/* Manuel Açı Girişi (3 haneli sayılar tam sığar) */}
                  <div className="relative w-16 shrink-0">
                    <input
                      type="number"
                      min="0"
                      max="360"
                      step="1"
                      value={Math.round(activeAngle)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          handleSetAngle(selectedSpotId, ((val % 360) + 360) % 360);
                        }
                      }}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl pl-2 pr-4 py-1 text-xs font-bold font-mono text-center focus:outline-none focus:border-blue-500 shadow-sm"
                      placeholder="0"
                      title="Açı derecesi girin (0-360)"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">
                      °
                    </span>
                  </div>

                  {/* Canlı Açı Kaydırıcı */}
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="1"
                    value={Math.round(activeAngle)}
                    onChange={(e) => handleSetAngle(selectedSpotId, parseFloat(e.target.value))}
                    className="flex-1 min-w-0 h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    title="Canlı açı ayarı"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <MapContainer
          center={[result.originalBoundary[0]?.lat || 39.92, result.originalBoundary[0]?.lng || 32.85]}
          zoom={15}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          {getTileLayer()}
          <FitBounds result={result} />
          <ZoomTracker onZoomChange={setCurrentZoom} />

          {/* 1. Orijinal Çalışma Sahası Sınırı (Kırmızı Çerçeve - Tahdit) */}
          {result.originalBoundary.length > 2 && (
            <Polygon
              positions={result.originalBoundary.map(p => [p.lat, p.lng] as [number, number])}
              color="red"
              fillOpacity={0}
              weight={3}
            >
              <Popup>
                <div className="font-bold text-slate-900">Ana Çalışma Sahası Sınırı</div>
                <div className="text-xs text-slate-600">Toplam Alan: {totalAreaHa} ha</div>
              </Popup>
            </Polygon>
          )}

          {/* 2. Kontrol Alanları (Sarı Dolgulu Poligon Alanlar) */}
          {spots.map((spot) => (
            <Polygon
              key={spot.id}
              positions={spot.boundary.map(p => [p.lat, p.lng] as [number, number])}
              color="#ffff7f"
              fillColor="#ffff7f"
              fillOpacity={0.4}
              weight={2.5}
            >
              <Popup>
                <div className="p-1 space-y-1 min-w-[180px]">
                  <div className="font-bold text-slate-900">{spot.name}</div>
                  <div className="text-xs text-slate-600 font-mono">
                    Merkez: {spot.center.lat.toFixed(6)}, {spot.center.lng.toFixed(6)}
                  </div>
                  <div className="text-[10px] text-amber-700 font-medium">
                    💡 Tutamacı sürükleyerek taşıyabilirsiniz.
                  </div>
                </div>
              </Popup>
            </Polygon>
          ))}

          {/* 2.1 Grid / Şerit Taşıma Tutamaçları (Draggable Handle Markers) - Yakınlaştıkça görünür */}
          {spots.map((spot) => {
            const icon = getSpotHandleIcon(currentZoom);
            if (!icon) return null;
            return (
              <Marker
                key={`handle-${spot.id}`}
                position={[spot.center.lat, spot.center.lng]}
                draggable={true}
                icon={icon}
                eventHandlers={{
                  dragend: (e) => handleSpotDragEnd(spot.id, e),
                }}
              >
                <Popup>
                  <div className="text-xs p-1 space-y-1 min-w-[180px]">
                    <p className="font-black text-amber-600">{spot.name}</p>
                    <p className="text-slate-600 font-mono text-[10px]">
                      Merkez: {spot.center.lat.toFixed(6)}, {spot.center.lng.toFixed(6)}
                    </p>
                    <p className="text-[9px] text-amber-800 font-medium">Bu alanı haritada taşımak için tutun ve sürükleyin.</p>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* 2.2 Kontrol Uçuş Hatları (Sadece StripCross 'Z' modunda göster, GridSpot modunda gizle) */}
          {result.routeType === 'StripCross' && spots.map((spot) =>
            spot.flightLines.map((line, lIdx) => (
              <Polyline
                key={`${spot.id}-line-${lIdx}`}
                positions={line.map(p => [p.lat, p.lng] as [number, number])}
                color="#0284c7"
                weight={2.5}
                dashArray="4, 4"
              />
            ))
          )}

          {/* 3. Yer Kontrol Noktaları (YKN) */}
          {gcps.map(gcp => (
            <Marker
              key={gcp.id}
              position={[gcp.lat, gcp.lng]}
              draggable={true}
              icon={L.divIcon({
                className: 'custom-ykn-marker',
                html: `<div class="flex flex-col items-center">
                        <div class="w-6 h-6 bg-red-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-black text-white">${gcp.name.replace('YKN', '')}</div>
                        <div class="bg-slate-900/80 text-white text-[8px] font-black px-1 rounded mt-0.5 whitespace-nowrap">${gcp.name}</div>
                      </div>`,
                iconSize: [40, 40],
                iconAnchor: [20, 20]
              })}
              eventHandlers={{
                dragend: (e) => handleMarkerDragEnd(gcp.id, e),
              }}
            >
              <Popup>
                <div className="text-xs p-1 space-y-1">
                  <p className="font-black text-red-600">{gcp.name}</p>
                  <p className="text-slate-600 font-mono text-[10px]">
                    Enlem: {gcp.lat.toFixed(6)}<br />
                    Boylam: {gcp.lng.toFixed(6)}
                  </p>
                  <p className="text-[9px] text-slate-400 italic">Konumu değiştirmek için harita üzerinde sürükleyebilirsiniz.</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Uçuş Bilgi Alanı (Footer Üstündeki Alt Bilgi Alanı) */}
      <div className="bg-slate-200 px-4 sm:px-6 py-2.5 border-t border-slate-300 flex flex-col gap-2.5 shrink-0">
        <div className="grid grid-cols-12 gap-1 sm:gap-2 w-full py-1">
          <div className="col-span-3 flex flex-col items-start min-w-0">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1 truncate w-full">Uçuş Alanı</span>
            <span className="text-[11px] font-black text-slate-900 truncate">{totalAreaHa} ha</span>
          </div>
          <div className="col-span-2 flex flex-col items-center text-center min-w-0">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1 truncate w-full">Toplam YKN</span>
            <span className="text-[11px] font-black text-blue-600 truncate">
              {gcps.length > 0 ? `${gcps.length} Adet` : '0'}
            </span>
          </div>
          <div className="col-span-4 flex flex-col items-center text-center min-w-0">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1 truncate w-full">Kontrol Oranı</span>
            <span className="text-[11px] font-black text-emerald-600 truncate">
              %{realPercentage}
            </span>
          </div>
          <div className="col-span-3 flex flex-col items-end text-right min-w-0">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1 truncate w-full">
              {result.routeType === 'StripCross' ? 'Şerit Sayısı' : 'Grid Sayısı'}
            </span>
            <span className="text-[11px] font-black text-purple-600 truncate">
              {spots.length} {result.routeType === 'StripCross' ? 'Şerit' : 'Grid'}
            </span>
          </div>
        </div>

        {/* Dışarı Aktarma Butonları */}
        <div className="flex gap-2 w-full">
          <button
            onClick={() => handleOpenExportModal('flight_plan')}
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase tracking-[0.1em] text-[10px] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <i className="fas fa-plane-departure"></i>UÇUŞ PLANI
          </button>
          {gcps.length > 0 && (
            <button
              onClick={() => handleOpenExportModal('ykn_plan')}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase tracking-[0.1em] text-[10px] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <i className="fas fa-map-marked-alt"></i>YKN PLANI
            </button>
          )}
          <button
            onClick={() => handleOpenExportModal('pdf_summary')}
            className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black uppercase tracking-[0.1em] text-[10px] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <i className="fas fa-file-pdf"></i>PDF ÖZETİ
          </button>
        </div>
      </div>

      {/* Global Footer */}
      <GlobalFooter />

      {/* Dışa Aktar Modalı */}
      {showExportModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowExportModal(false)}></div>
          <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl relative overflow-hidden p-6 animate-in zoom-in-95 duration-200">
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dışa Aktar</p>
                <div className={`grid ${gcps.length > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5 p-1 bg-slate-100 rounded-2xl`}>
                  <button
                    type="button"
                    onClick={() => setExportType('flight_plan')}
                    className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
                      exportType === 'flight_plan' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-600'
                    }`}
                  >
                    Uçuş Planı
                  </button>
                  {gcps.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExportType('ykn_plan')}
                      className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
                        exportType === 'ykn_plan' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600'
                      }`}
                    >
                      YKN Planı
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setExportType('pdf_summary')}
                    className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
                      exportType === 'pdf_summary' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-600'
                    }`}
                  >
                    PDF Özeti
                  </button>
                </div>
              </div>

              {exportType === 'ykn_plan' && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Format Seçimi</p>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl">
                    <button
                      type="button"
                      onClick={() => setYknSubFormat('kml')}
                      className={`py-2 rounded-xl text-[10px] font-black tracking-wider transition-all ${
                        yknSubFormat === 'kml' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600'
                      }`}
                    >
                      KML
                    </button>
                    <button
                      type="button"
                      onClick={() => setYknSubFormat('csv')}
                      className={`py-2 rounded-xl text-[10px] font-black tracking-wider transition-all ${
                        yknSubFormat === 'csv' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600'
                      }`}
                    >
                      CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => setYknSubFormat('txt')}
                      className={`py-2 rounded-xl text-[10px] font-black tracking-wider transition-all ${
                        yknSubFormat === 'txt' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600'
                      }`}
                    >
                      TXT
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dosya Adı</label>
                <div className="relative">
                  <input
                    type="text"
                    value={exportName}
                    onChange={(e) => setExportName(e.target.value)}
                    className="w-full bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <span className="absolute right-4 top-3.5 text-[10px] font-black text-slate-400">
                    {exportType === 'pdf_summary' ? '.pdf' : exportType === 'ykn_plan' ? `.${yknSubFormat}` : '.kml'}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-wider transition-all"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={exportType === 'pdf_summary' ? handleExportPdf : handleExport}
                  disabled={isGeneratingPdf}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-wider shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isGeneratingPdf ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      <span>HAZIRLANIYOR...</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-download"></i>
                      <span>İNDİR</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ControlFlightMapView;
