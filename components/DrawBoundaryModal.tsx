import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Polyline, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';
import { KMLData } from '../src/types/flight';
import GlobalFooter from './GlobalFooter';
import Header from './Header';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  flightType: 'Normal' | 'Strip';
  onSave: (kmlData: KMLData) => void;
  initialPoints?: { lat: number; lng: number }[];
  title?: string;
}

const MapClickHandler: React.FC<{ onMapClick: (lat: number, lng: number) => void }> = ({ onMapClick }) => {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const FitOrCenterMap: React.FC<{ points: { lat: number; lng: number }[] }> = ({ points }) => {
  const map = useMap();
  const hasCentered = React.useRef(false);
  
  useEffect(() => {
    if (points.length > 0 && !hasCentered.current) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
      hasCentered.current = true;
    }
  }, [map, points]);

  return null;
};

const MapController: React.FC<{ targetCoords: [number, number] | null }> = ({ targetCoords }) => {
  const map = useMap();

  useEffect(() => {
    if (targetCoords) {
      map.flyTo(targetCoords, 16, { animate: true });
    }
  }, [targetCoords, map]);

  return null;
};

const DrawBoundaryModal: React.FC<Props> = ({
  isOpen,
  onClose,
  flightType,
  onSave,
  initialPoints = [],
  title
}) => {
  if (!isOpen) return null;

  const [points, setPoints] = useState<{ lat: number; lng: number }[]>(initialPoints);
  const [mapProvider] = useState<string>(() => 
    localStorage.getItem('default_map_provider') || 'Google Hybrid'
  );
  const [targetCoords] = useState<[number, number] | null>(null);

  // Sync initial points if provided on modal open
  useEffect(() => {
    if (isOpen) {
      setPoints(initialPoints);
    }
  }, [isOpen, initialPoints]);

  // Memoize marker icons to prevent recreation on every render
  const markerIcons = React.useMemo(() => {
    return points.map((_, idx) => L.divIcon({
      className: 'custom-draw-marker',
      html: `<div style="
        background: ${flightType === 'Normal' ? '#059669' : '#2563eb'};
        color: white;
        width: 26px;
        height: 26px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        font-size: 11px;
        border: 2px solid white;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        cursor: grab;
      ">${idx + 1}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    }));
  }, [points.length, flightType]); // Only re-calc if length or type changes

  const midpoints = React.useMemo(() => {
    if (points.length < 2) return [];
    const mids: { lat: number; lng: number; index: number }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      mids.push({
        lat: (p1.lat + p2.lat) / 2,
        lng: (p1.lng + p2.lng) / 2,
        index: i + 1
      });
    }
    if (flightType === 'Normal' && points.length >= 3) {
      const p1 = points[points.length - 1];
      const p2 = points[0];
      mids.push({
        lat: (p1.lat + p2.lat) / 2,
        lng: (p1.lng + p2.lng) / 2,
        index: points.length
      });
    }
    return mids;
  }, [points, flightType]);

  // Memoize ghost icon to prevent recreation
  const ghostIcon = React.useMemo(() => L.divIcon({
    className: 'ghost-midpoint-marker',
    html: `<div style="
      background: white;
      color: #64748b;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      border: 1.5px solid #cbd5e1;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      cursor: pointer;
      opacity: 0.8;
    "><i class="fas fa-plus"></i></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  }), []);

  const handleMapClick = (lat: number, lng: number) => {
    setPoints(prev => [...prev, { lat, lng }]);
  };

  const handleUndo = () => {
    setPoints(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPoints([]);
  };

  const handleRemovePoint = (index: number) => {
    setPoints(prev => prev.filter((_, i) => i !== index));
  };

  const handleInsertPoint = (index: number, lat: number, lng: number) => {
    setPoints(prev => {
      const newPoints = [...prev];
      newPoints.splice(index, 0, { lat, lng });
      return newPoints;
    });
  };

  const handleDragPoint = (index: number, lat: number, lng: number) => {
    setPoints(prev => prev.map((p, i) => (i === index ? { lat, lng } : p)));
  };

  const handleLocateMe = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // No direct map flyTo here anymore without a ref, 
          // but we can set target coords if we had a state update.
          // For now, simplify and remove complex logic as requested.
        },
        (err) => {
          alert('Mevcut konum alınamadı: ' + err.message);
        }
      );
    } else {
      alert('Tarayıcınız konum servisini desteklemiyor.');
    }
  };

  const handleSave = () => {
    if (flightType === 'Normal' && points.length < 3) {
      alert('Lütfen haritaya en az 3 nokta ekleyerek kapalı bir alan oluşturun.');
      return;
    }
    if (flightType === 'Strip' && points.length < 2) {
      alert('Lütfen haritaya en az 2 nokta ekleyerek bir hat oluşturun.');
      return;
    }

    const defaultName = `TAHDIT_${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;

    const kmlData: KMLData = {
      name: defaultName,
      features: [
        {
          name: flightType === 'Normal' ? 'Tahdit Alanı' : 'Şerit Güzergahı',
          description: flightType === 'Normal' ? 'Harita üzerinden çizilen tahdit alanı' : 'Harita üzerinden çizilen şerit hattı',
          type: flightType === 'Normal' ? 'Polygon' : 'LineString',
          coordinates: points,
        },
      ],
    };

    onSave(kmlData);
    onClose();
  };

  const getTileLayer = () => {
    switch (mapProvider) {
      case 'Google Satellite':
        return <TileLayer url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" attribution="&copy; Google" crossOrigin="anonymous" />;
      case 'Google Hybrid':
        return <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" attribution="&copy; Google" crossOrigin="anonymous" />;
      case 'Esri World Imagery':
        return <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="&copy; Esri" crossOrigin="anonymous" />;
      case 'OpenStreetMap':
        return <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" crossOrigin="anonymous" />;
      default:
        return <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" attribution="&copy; Google" crossOrigin="anonymous" />;
    }
  };

  // Metrics calculation
  let metricLabel = '0 Metre';
  if (flightType === 'Normal') {
    if (points.length >= 3) {
      try {
        const ring = [...points.map(p => [p.lng, p.lat]), [points[0].lng, points[0].lat]];
        const poly = turf.polygon([ring]);
        const sqMeters = turf.area(poly);
        metricLabel = `${Math.round(sqMeters).toLocaleString('tr-TR')} m²`;
      } catch {
        metricLabel = '0 Metre';
      }
    } else {
      metricLabel = '0 Metre';
    }
  } else if (flightType === 'Strip') {
    if (points.length >= 2) {
      try {
        const line = turf.lineString(points.map(p => [p.lng, p.lat]));
        const meters = turf.length(line, { units: 'meters' });
        metricLabel = `${Math.round(meters).toLocaleString('tr-TR')} Metre`;
      } catch {
        metricLabel = '0 Metre';
      }
    } else {
      metricLabel = '0 Metre';
    }
  }

  // Initial map center
  const initialCenter: [number, number] =
    points.length > 0 ? [points[0].lat, points[0].lng] : [39.0, 35.0];

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-slate-200">
      {/* Top Header */}
      <Header 
        title="Harita Üzerinden Çiz" 
        onBack={onClose}
      />
      
      {/* Main Map Canvas */}
      <div className="flex-1 relative w-full h-full">
        <MapContainer
          center={initialCenter}
          zoom={points.length > 0 ? 15 : 6}
          style={{ width: '100%', height: '100%' }}
          zoomControl={true}
          attributionControl={false}
        >
          {getTileLayer()}
          <MapClickHandler onMapClick={handleMapClick} />
          <FitOrCenterMap points={points} />
          <MapController targetCoords={targetCoords} />

          {/* Polygon for Normal flight */}
          {flightType === 'Normal' && points.length >= 3 && (
            <Polygon
              positions={points.map(p => [p.lat, p.lng])}
              pathOptions={{
                color: '#10b981',
                fillColor: '#10b981',
                fillOpacity: 0.2,
                weight: 3,
                dashArray: '5, 8'
              }}
            />
          )}

          {/* Polyline connecting points */}
          {points.length >= 2 && (
            <Polyline
              positions={points.map(p => [p.lat, p.lng])}
              pathOptions={{
                color: flightType === 'Normal' ? '#059669' : '#2563eb',
                weight: 4,
                lineCap: 'round'
              }}
            />
          )}

          {/* Point Markers */}
          {points.map((pt, idx) => (
            <Marker
              key={`point-${idx}`}
              position={[pt.lat, pt.lng]}
              draggable={true}
              eventHandlers={{
                dragend: (e) => {
                  const marker = e.target;
                  const newPos = marker.getLatLng();
                  handleDragPoint(idx, newPos.lat, newPos.lng);
                }
              }}
              icon={markerIcons[idx]}
            >
              <Popup>
                <div className="p-1 space-y-2 text-center">
                  <p className="font-black text-[10px] uppercase tracking-widest text-slate-500">Nokta #{idx + 1}</p>
                  <p className="text-[11px] font-bold text-slate-900">{pt.lat.toFixed(6)}, {pt.lng.toFixed(6)}</p>
                  <button
                    onClick={() => handleRemovePoint(idx)}
                    className="w-full py-2 bg-rose-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg shadow-rose-100"
                  >
                    NOKTAYI SİL
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Midpoint Ghost Markers for Insertion */}
          {midpoints.map((mid, idx) => (
            <Marker
              key={`mid-${idx}`}
              position={[mid.lat, mid.lng]}
              icon={ghostIcon}
              eventHandlers={{
                click: () => handleInsertPoint(mid.index, mid.lat, mid.lng)
              }}
            />
          ))}
        </MapContainer>
      </div>

      <footer className="bg-slate-200 border-t border-slate-300 py-2.5 px-6 z-20 shrink-0 flex flex-col gap-3">
        {/* Row 1: Points Info, Undo, and Clear */}
        <div className="flex items-center justify-between max-w-5xl mx-auto w-full gap-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-3 bg-white px-3 py-2 rounded-xl border border-slate-300/50 shadow-sm h-[42px] shrink-0">
            <span className={`text-[10px] font-black whitespace-nowrap ${
              (flightType === 'Normal' && points.length >= 3) || (flightType === 'Strip' && points.length >= 2)
                ? 'text-emerald-600'
                : 'text-amber-600'
            }`}>
              {points.length} nokta
            </span>

            <div className="w-px h-4 bg-slate-200"></div>

            <span className="text-[10px] font-black text-emerald-600 whitespace-nowrap">{metricLabel}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              disabled={points.length === 0}
              onClick={handleUndo}
              className="h-[42px] px-3 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 border border-slate-200 shadow-sm active:scale-95"
              title="Son işlemi geri al"
            >
              <i className="fas fa-undo text-amber-500"></i>
              <span>Geri Al</span>
            </button>

            <button
              disabled={points.length === 0}
              onClick={handleClear}
              className="h-[42px] px-3 bg-rose-50 hover:bg-rose-100 disabled:opacity-40 text-rose-600 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 border border-rose-100 shadow-sm active:scale-95"
              title="Tüm noktaları temizle"
            >
              <i className="fas fa-trash-alt"></i>
              <span>Temizle</span>
            </button>
          </div>
        </div>

        {/* Row 2: Complete Drawing Button */}
        <div className="flex justify-center max-w-5xl mx-auto w-full">
          <button
            onClick={handleSave}
            disabled={(flightType === 'Normal' && points.length < 3) || (flightType === 'Strip' && points.length < 2)}
            className={`w-full sm:w-auto px-10 py-2.5 font-black rounded-xl text-[10px] uppercase tracking-[0.2em] text-white shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 ${
              (flightType === 'Normal' && points.length >= 3) || (flightType === 'Strip' && points.length >= 2)
                ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20'
                : 'bg-slate-400 text-slate-200 cursor-not-allowed shadow-none'
            }`}
          >
            <i className="fas fa-check text-[10px]"></i>
            <span>ÇİZİMİ TAMAMLA</span>
          </button>
        </div>
      </footer>
      <GlobalFooter noPadding />
    </div>
  );
};

export default DrawBoundaryModal;
