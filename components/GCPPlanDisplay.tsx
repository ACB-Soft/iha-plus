import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Popup, Polygon, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as turf from '@turf/turf';
import { KMLFeature } from './KMLUtils';
import GlobalFooter from './GlobalFooter';
import Header from './Header';
import { FlightConfig } from '../src/types/flight';
import { calculatePolygonArea } from './GeometryUtils';

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

interface YKNPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface Props {
  projectName: string;
  features: KMLFeature[];
  config: FlightConfig;
  onBack: () => void;
}

const MapClickHandler: React.FC<{ onMapClick: (lat: number, lng: number) => void; active: boolean }> = ({ onMapClick, active }) => {
  useMapEvents({
    click(e) {
      if (active) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
};

const FitBounds: React.FC<{ features: KMLFeature[] }> = ({ features }) => {
  const map = useMap();
  
  useEffect(() => {
    if (features.length > 0) {
      const bounds = L.latLngBounds([]);
      features.forEach(f => {
        f.coordinates.forEach(c => {
          bounds.extend([c.lat, c.lng]);
        });
      });
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [features, map]);
  
  return null;
};

const GCPPlanDisplay: React.FC<Props> = ({ projectName, features, config, onBack }) => {
  const mapProvider = localStorage.getItem('default_map_provider') || 'Google Satellite';
  const [points, setPoints] = useState<YKNPoint[]>([]);
  const [shrunkPolygon, setShrunkPolygon] = useState<[number, number][] | null>(null);
  const [isAddingPoint, setIsAddingPoint] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportName, setExportName] = useState(`YKN_${projectName.replace(/\.(kml|kmz)$/i, '')}`);

  const boundaryArea = useMemo(() => {
    const polygonFeature = features.find(f => f.type === 'Polygon');
    if (!polygonFeature) return 0;
    return calculatePolygonArea(polygonFeature.coordinates.map(c => ({ lat: c.lat, lng: c.lng })));
  }, [features]);

  // Initial Point Generation
  useEffect(() => {
    const generatePoints = (dist: number): YKNPoint[] => {
      const polygonFeature = features.find(f => f.type === 'Polygon');
      if (!polygonFeature) return [];

      // 1. Convert to Turf Polygon
      const coords = polygonFeature.coordinates.map(c => [c.lng, c.lat]);
      if (coords.length > 0 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
        coords.push(coords[0]);
      }
      const poly = turf.polygon([coords]);

      // 2. Apply Start Offset (Negative Buffer)
      const offsetMeters = config.gcpStartOffset || 0;
      let targetPoly = poly;
      let shrunkCoords: [number, number][] | null = null;

      if (offsetMeters > 0) {
        try {
          const buffered = turf.buffer(poly, -offsetMeters, { units: 'meters' });
          if (buffered) {
            if (buffered.geometry.type === 'Polygon') {
              targetPoly = buffered as any;
              shrunkCoords = (buffered.geometry.coordinates[0] as any[]).map((c: any) => [c[1], c[0]] as [number, number]);
            } else if (buffered.geometry.type === 'MultiPolygon') {
              const polys = (buffered.geometry.coordinates as any[][][]).map(c => turf.polygon(c));
              const largest = polys.reduce((prev, current) => (turf.area(prev) > turf.area(current) ? prev : current));
              targetPoly = largest as any;
              shrunkCoords = (largest.geometry.coordinates[0] as any[]).map((c: any) => [c[1], c[0]] as [number, number]);
            }
          }
        } catch (e) {
          console.error("Buffer error", e);
        }
      }
      setShrunkPolygon(shrunkCoords);

      // 3. Robust Candidate Generation
      const bbox = turf.bbox(targetPoly);
      const candidates: [number, number][] = [];
      const stepMeters = Math.min(dist / 6, 40); // Even denser for better axis sorting
      
      const latMid = (bbox[1] + bbox[3]) / 2;
      const latStep = stepMeters / 111320;
      const lngStep = stepMeters / (111320 * Math.cos(latMid * Math.PI / 180));

      for (let x = bbox[0]; x <= bbox[2]; x += lngStep) {
        for (let y = bbox[1]; y <= bbox[3]; y += latStep) {
          const pt: [number, number] = [x, y];
          if (turf.booleanPointInPolygon(pt, targetPoly)) {
            candidates.push(pt);
          }
        }
      }

      if (candidates.length < 2) return [];

      // 4. Find the Main Axis (Furthest Points)
      let p1 = candidates[0];
      let maxD = 0;
      candidates.forEach(p => {
        const d = turf.distance(candidates[0], p);
        if (d > maxD) { maxD = d; p1 = p; }
      });

      let p2 = p1;
      maxD = 0;
      candidates.forEach(p => {
        const d = turf.distance(p1, p);
        if (d > maxD) { maxD = d; p2 = p; }
      });

      // Ensure start is West-most for consistent numbering
      let startPt = p1[0] <= p2[0] ? p1 : p2;
      let endPt = p1[0] <= p2[0] ? p2 : p1;

      // 5. Project Candidates onto Axis and Sort
      const vx = endPt[0] - startPt[0];
      const vy = endPt[1] - startPt[1];
      const vLenSq = vx * vx + vy * vy || 1;

      const projected = candidates.map(p => {
        const px = p[0] - startPt[0];
        const py = p[1] - startPt[1];
        const t = (px * vx + py * vy) / vLenSq;
        return { point: p, t };
      }).sort((a, b) => a.t - b.t);

      // 6. Sequential Selection with Zigzag
      const resultPoints: { lat: number, lng: number }[] = [];
      let lastPicked = projected[0];
      resultPoints.push({ lat: lastPicked.point[1], lng: lastPicked.point[0] });

      let zigzag = 1;
      let currentIndex = 0;

      while (currentIndex < projected.length) {
        // Find the range of points that are approximately 'dist' away
        let nextIdx = currentIndex + 1;
        while (nextIdx < projected.length && 
               turf.distance(lastPicked.point, projected[nextIdx].point, {units: 'meters'}) < dist * 0.95) {
          nextIdx++;
        }

        if (nextIdx >= projected.length) break;

        // Look at a small window of points ahead to pick for zigzag
        const windowSize = Math.max(1, Math.floor(projected.length * 0.03));
        const window = projected.slice(nextIdx, Math.min(nextIdx + windowSize, projected.length));
        
        // Pick based on zigzag (alternate North/South relative to the axis or just raw Latitude)
        window.sort((a, b) => a.point[1] - b.point[1]);
        const next = zigzag > 0 ? window[window.length - 1] : window[0];
        
        resultPoints.push({ lat: next.point[1], lng: next.point[0] });
        lastPicked = next;
        currentIndex = projected.indexOf(next);
        zigzag *= -1;

        if (resultPoints.length > 500) break;
      }

      return resultPoints.map((p, i) => ({
        id: `ykn-${i}`,
        name: `YKN${i + 1}`,
        lng: p.lng,
        lat: p.lat
      }));
    };

    let distance = config.gcpDistance || 400;
    let finalPoints = generatePoints(distance);

    // 5. Min 5 Points Fallback
    if (finalPoints.length < 5) {
      let attempts = 0;
      while (finalPoints.length < 5 && attempts < 10) {
        distance *= 0.8;
        finalPoints = generatePoints(distance);
        attempts++;
      }
    }

    setPoints(finalPoints);
  }, [features, config]);

  const handleMarkerDragEnd = (id: string, newLat: number, newLng: number) => {
    setPoints(prev => prev.map(p => p.id === id ? { ...p, lat: newLat, lng: newLng } : p));
  };

  const handleAddPoint = (lat: number, lng: number) => {
    const newId = `ykn-${Date.now()}`;
    const newName = `YKN${points.length + 1}`;
    setPoints(prev => [...prev, { id: newId, name: newName, lat, lng }]);
    setIsAddingPoint(false);
  };

  const handleDeletePoint = (id: string) => {
    setPoints(prev => {
      const filtered = prev.filter(p => p.id !== id);
      // Re-index names
      return filtered.map((p, i) => ({ ...p, name: `YKN${i + 1}` }));
    });
  };

  const getTileLayer = () => {
    switch (mapProvider) {
      case 'Google Satellite':
        return <TileLayer url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" attribution="&copy; Google" />;
      case 'Google Hybrid':
        return <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" attribution="&copy; Google" />;
      case 'OpenStreetMap':
        return <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />;
      default:
        return <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" attribution="&copy; Google" />;
    }
  };

  // Calculate distances between consecutive points for interactive display
  const pointConnections = useMemo(() => {
    const connections: { from: YKNPoint; to: YKNPoint; distance: number }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      const dist = turf.distance([from.lng, from.lat], [to.lng, to.lat], { units: 'meters' });
      connections.push({ from, to, distance: Math.round(dist) });
    }
    return connections;
  }, [points]);

  const handleExport = () => {
    const polygonFeature = features.find(f => f.type === 'Polygon');
    const polygonKml = polygonFeature ? `
    <Placemark>
      <name>Tahdit Sınırı</name>
      <Style>
        <LineStyle>
          <color>ff0000ff</color>
          <width>3</width>
        </LineStyle>
        <PolyStyle>
          <fill>0</fill>
        </PolyStyle>
      </Style>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${polygonFeature.coordinates.map(c => `${c.lng},${c.lat},0`).join(' ')}
              ${polygonFeature.coordinates[0].lng},${polygonFeature.coordinates[0].lat},0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>` : '';

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${projectName} - YKN Planı</name>
    ${polygonKml}
    ${points.map(p => `
    <Placemark>
      <name>${p.name}</name>
      <Point>
        <coordinates>${p.lng},${p.lat},0</coordinates>
      </Point>
    </Placemark>`).join('')}
  </Document>
</kml>`;

    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportName}.kml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportModal(false);
  };

  return (
    <div className="w-full flex flex-col bg-slate-200 h-full animate-in overflow-hidden">
      <Header title="YKN Planı Ekranı" onBack={onBack} />

      <div className="flex-1 relative z-10">
        {/* Top Right Buttons Overlay */}
        <div className="absolute top-6 right-6 z-[1000] pointer-events-none flex flex-col gap-2 items-end">
          <button 
            onClick={() => setIsAddingPoint(!isAddingPoint)}
            className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 shadow-xl font-black text-[9px] uppercase tracking-widest active:scale-95 transition-all pointer-events-auto border ${
              isAddingPoint 
                ? 'bg-orange-500 text-white border-orange-400 animate-pulse' 
                : 'bg-blue-600 text-white border-blue-500'
            }`}
          >
            <i className={`fas ${isAddingPoint ? 'fa-times' : 'fa-plus'} text-xs`}></i>
            <span>{isAddingPoint ? 'İptal' : 'YKN'}</span>
          </button>
        </div>

        {/* Add Point Instructions Overlay */}
        {isAddingPoint && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
            <div className="bg-orange-500 text-white px-4 py-2 rounded-full shadow-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 border border-orange-400">
              <i className="fas fa-mouse-pointer"></i>
              Harita üzerinde bir noktaya tıklayın
            </div>
          </div>
        )}

        <MapContainer 
          center={[39, 35]} 
          zoom={6} 
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          {getTileLayer()}
          <FitBounds features={features} />
          <MapClickHandler active={isAddingPoint} onMapClick={handleAddPoint} />
          
          {features.map((f, i) => {
            if (f.type === 'Polygon') {
              return (
                <Polygon 
                  key={i}
                  positions={f.coordinates.map(c => [c.lat, c.lng] as [number, number])} 
                  color="red"
                  fillOpacity={0.05}
                  weight={3}
                />
              );
            }
            return null;
          })}

          {shrunkPolygon && (
            <Polygon 
              positions={shrunkPolygon} 
              color="#4f46e5"
              fillOpacity={0.1}
              weight={2}
              dashArray="10, 10"
            />
          )}

          {points.map((p) => (
            <Marker 
              key={p.id} 
              position={[p.lat, p.lng]} 
              draggable={true}
              icon={L.divIcon({
                className: 'custom-ykn-marker',
                html: `<div class="flex flex-col items-center">
                        <div class="w-6 h-6 bg-blue-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-black text-white">${p.name.replace('YKN', '')}</div>
                        <div class="bg-slate-900/80 text-white text-[8px] font-black px-1 rounded mt-0.5 whitespace-nowrap">${p.name}</div>
                      </div>`,
                iconSize: [40, 40],
                iconAnchor: [20, 20]
              })}
              eventHandlers={{
                dragend: (e) => {
                  const marker = e.target;
                  const position = marker.getLatLng();
                  handleMarkerDragEnd(p.id, position.lat, position.lng);
                },
              }}
            >
              <Popup>
                <div className="font-black text-slate-900">{p.name}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Sürükleyerek konumlandırın</div>
                <button 
                  onClick={() => handleDeletePoint(p.id)}
                  className="w-full py-1.5 bg-red-50 text-red-600 rounded border border-red-100 text-[9px] font-black uppercase tracking-widest hover:bg-red-100 transition-colors"
                >
                  SİL
                </button>
              </Popup>
            </Marker>
          ))}

          {pointConnections.map((conn, i) => (
            <React.Fragment key={i}>
              <Polyline 
                positions={[[conn.from.lat, conn.from.lng], [conn.to.lat, conn.to.lng]]}
                color="#94a3b8"
                weight={1}
                dashArray="4, 4"
              />
              <Marker 
                position={[(conn.from.lat + conn.to.lat) / 2, (conn.from.lng + conn.to.lng) / 2]}
                icon={L.divIcon({
                  className: 'bg-white/80 backdrop-blur-sm px-1.5 py-0.5 rounded border border-slate-200 shadow-sm text-[9px] font-black text-slate-600 whitespace-nowrap',
                  html: `${conn.distance}m`,
                  iconSize: [40, 16],
                  iconAnchor: [20, 8]
                })}
              />
            </React.Fragment>
          ))}
        </MapContainer>
      </div>

      {/* YKN Bilgi Alanı */}
      <div className="bg-slate-200 px-6 py-2 border-t border-slate-300 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-start w-1/4">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Tahdit Alanı</span>
            <span className="text-[11px] font-black text-slate-900">{boundaryArea.toFixed(2)} ha</span>
          </div>

          <div className="flex flex-col items-center w-1/4">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Toplam YKN</span>
            <span className="text-[11px] font-black text-blue-600">{points.length} Adet</span>
          </div>

          <div className="flex flex-col items-center w-1/4">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Hedef Mesafe</span>
            <span className="text-[11px] font-black text-emerald-600">{config.gcpDistance}m</span>
          </div>

          <div className="flex flex-col items-end w-1/4">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Ofset</span>
            <span className="text-[11px] font-black text-orange-600">{config.gcpStartOffset}m</span>
          </div>
        </div>
        
        <button 
          onClick={() => setShowExportModal(true)}
          className="w-full py-2.5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <i className="fas fa-file-export"></i>
          YKN'LERİ DIŞARI AKTAR
        </button>
      </div>

      <GlobalFooter />

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowExportModal(false)}></div>
          <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl relative overflow-hidden p-8 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">Dışarı Aktar</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 mb-6">YKN Planı Dosya Adı Belirleyin</p>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Dosya Adı</label>
                <input 
                  type="text" 
                  value={exportName}
                  onChange={(e) => setExportName(e.target.value)}
                  className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                  placeholder="Dosya adı giriniz..."
                  autoFocus
                />
              </div>
              
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setShowExportModal(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all"
                >
                  İPTAL
                </button>
                <button 
                  onClick={handleExport}
                  className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-blue-200 active:scale-95 transition-all"
                >
                  İNDİR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GCPPlanDisplay;
