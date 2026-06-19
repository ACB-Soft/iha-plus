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

const FitBounds: React.FC<{ features: KMLFeature[], subArea?: any }> = ({ features, subArea }) => {
  const map = useMap();
  
  useEffect(() => {
    if (features.length > 0) {
      const bounds = L.latLngBounds([]);
      features.forEach(f => {
        f.coordinates.forEach(c => {
          bounds.extend([c.lat, c.lng]);
        });
      });
      
      if (subArea && subArea.features) {
        subArea.features.forEach((f: any) => {
          f.coordinates.forEach((c: any) => {
            bounds.extend([c.lat, c.lng]);
          });
        });
      }

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [features, subArea, map]);
  
  return null;
};

const GCPNormalPlanDisplay: React.FC<Props> = ({ projectName, features, config, onBack }) => {
  const mapProvider = localStorage.getItem('default_map_provider') || 'Google Satellite';
  const [points, setPoints] = useState<YKNPoint[]>([]);
  const [shrunkPolygon, setShrunkPolygon] = useState<[number, number][] | null>(null);
  const [isAddingPoint, setIsAddingPoint] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportName, setExportName] = useState(`YKN_Normal_${projectName.replace(/\.(kml|kmz)$/i, '')}`);

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

      const coords = polygonFeature.coordinates.map(c => [c.lng, c.lat]);
      if (coords.length > 0 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
        coords.push(coords[0]);
      }
      const poly = turf.polygon([coords]);

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

      // --- UPGRADED NORMAL AREA ALGORITHM ---
      
      // 1. High-Resolution Boundary Sampling (5m)
      const boundaryLine = turf.polygonToLine(targetPoly) as any;
      const boundaryLength = turf.length(boundaryLine, { units: 'meters' });
      const sampleDist = 5; // 5m resolution
      const boundarySamples: [number, number][] = [];
      
      for (let d = 0; d < boundaryLength; d += sampleDist) {
        boundarySamples.push(turf.along(boundaryLine, d, { units: 'meters' }).geometry.coordinates as [number, number]);
      }

      // 2. Find Anchor Points (Extremes)
      let northVertex = boundarySamples[0];
      for (const pt of boundarySamples) {
        if (pt[1] > northVertex[1]) northVertex = pt;
      }

      // 3. Grid Rotation (Disabled - aligned to North-South)
      const angleDeg = 0;

      // 4. Align Polygon (No rotation)
      const centroid = turf.centroid(targetPoly);
      const rotatedPoly = targetPoly; // No rotation
      const rotatedBbox = turf.bbox(rotatedPoly);
      const anchorRot = northVertex; // No rotation needed

      // 5. Grid Step Calculation with Staggered Support
      const targetStep = dist;
      const centerLat = centroid.geometry.coordinates[1];
      const latStepDeg = targetStep / 111320;
      const lngStepDeg = targetStep / (111320 * Math.cos(centerLat * Math.PI / 180));

      const gridPointsRaw: [number, number][] = [];
      const yMin = rotatedBbox[1] - latStepDeg;
      const yMax = rotatedBbox[3] + latStepDeg;
      const xMin = rotatedBbox[0] - lngStepDeg;
      const xMax = rotatedBbox[2] + lngStepDeg;

      // Tolerance for snapping (2%)
      const snapTolerance = targetStep * 0.02;

      let rowIndex = 0;
      for (let y = anchorRot[1] + Math.round((yMax - anchorRot[1]) / latStepDeg) * latStepDeg; y >= yMin; y -= latStepDeg) {
        // Staggered offset: every second row is shifted by half a step
        const xOffset = (rowIndex % 2 === 1) ? (lngStepDeg / 2) : 0;
        
        for (let x = anchorRot[0] - Math.round((anchorRot[0] - xMin) / lngStepDeg) * lngStepDeg + xOffset; x <= xMax; x += lngStepDeg) {
          const pt = turf.point([x, y]);
          const ptOriginal = turf.transformRotate(pt, angleDeg, { pivot: centroid });
          
          // Check if point is in poly or very close to boundary (±2% tolerance)
          const distToBoundary = turf.pointToLineDistance(ptOriginal, boundaryLine, { units: 'meters' });
          const isInPoly = turf.booleanPointInPolygon(ptOriginal, targetPoly);

          if (isInPoly || distToBoundary < snapTolerance) {
            gridPointsRaw.push([x, y]);
          }
        }
        rowIndex++;
      }

      // Ensure anchor point (North Vertex) is included if not already
      const northPtRot: [number, number] = [anchorRot[0], anchorRot[1]];
      const hasNorthPt = gridPointsRaw.some(p => Math.abs(p[0] - northPtRot[0]) < 0.000001 && Math.abs(p[1] - northPtRot[1]) < 0.000001);
      if (!hasNorthPt) {
        gridPointsRaw.push(northPtRot);
      }

      // 6. Group into Rows and Sort with Zigzag
      const rowsMap = new Map<number, [number, number][]>();
      gridPointsRaw.forEach(p => {
        const yKey = Math.round(p[1] * 1000000) / 1000000;
        if (!rowsMap.has(yKey)) rowsMap.set(yKey, []);
        rowsMap.get(yKey)!.push(p);
      });

      const sortedYKeys = Array.from(rowsMap.keys()).sort((a, b) => b - a);

      const finalGridPoints: [number, number][] = [];
      sortedYKeys.forEach((yKey, rIdx) => {
        const row = rowsMap.get(yKey)!;
        row.sort((a, b) => a[0] - b[0]);
        
        // Apply zigzag for rows
        if (rIdx % 2 === 1) row.reverse();
        
        finalGridPoints.push(...row);
      });

      // 5. Convert to final format
      const resultPoints = finalGridPoints.map(p => {
        const pt = turf.transformRotate(turf.point(p), angleDeg, { pivot: centroid });
        return { 
          lat: pt.geometry.coordinates[1], 
          lng: pt.geometry.coordinates[0] 
        };
      });

      const startNum = config.gcpStartNumber || 1;
      return resultPoints.map((p, i) => ({
        id: `ykn-${i}`,
        name: `YKN${i + startNum}`,
        lng: p.lng,
        lat: p.lat
      }));
    };

    let distance = config.gcpDistance || 400;
    let finalPoints = generatePoints(distance);

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
    const startNum = config.gcpStartNumber || 1;
    const newName = `YKN${points.length + startNum}`;
    setPoints(prev => [...prev, { id: newId, name: newName, lat, lng }]);
    setIsAddingPoint(false);
  };

  const handleDeletePoint = (id: string) => {
    setPoints(prev => {
      const filtered = prev.filter(p => p.id !== id);
      const startNum = config.gcpStartNumber || 1;
      return filtered.map((p, i) => ({ ...p, name: `YKN${i + startNum}` }));
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
        <LineStyle><color>ff0000ff</color><width>3</width></LineStyle>
        <PolyStyle><fill>0</fill></PolyStyle>
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

    let subAreaKml = '';
    if (config.subAreaKmlData) {
      const subAreaFeature = config.subAreaKmlData.features.find(f => f.type === 'Polygon');
      if (subAreaFeature) {
        subAreaKml = `
    <Placemark>
      <name>Alt Alan</name>
      <Style>
        <LineStyle><color>ff00ffff</color><width>2</width></LineStyle>
        <PolyStyle><fill>0</fill></PolyStyle>
      </Style>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${subAreaFeature.coordinates.map(c => `${c.lng},${c.lat},0`).join(' ')}
              ${subAreaFeature.coordinates[0].lng},${subAreaFeature.coordinates[0].lat},0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;
      }
    }

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${projectName} - Normal YKN Planı</name>
    ${polygonKml}
    ${subAreaKml}
    ${points.map(p => `
    <Placemark>
      <name>${p.name}</name>
      <Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>
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
      <Header title="Normal YKN Planı" onBack={onBack} />

      <div className="flex-1 relative z-10">
        <div className="absolute top-6 right-6 z-[1000] pointer-events-none flex flex-col gap-2 items-end">
          <button 
            onClick={() => setIsAddingPoint(!isAddingPoint)}
            className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 shadow-xl font-black text-[9px] uppercase tracking-widest active:scale-95 transition-all pointer-events-auto border ${
              isAddingPoint ? 'bg-orange-500 text-white border-orange-400 animate-pulse' : 'bg-blue-600 text-white border-blue-500'
            }`}
          >
            <i className={`fas ${isAddingPoint ? 'fa-times' : 'fa-plus'} text-xs`}></i>
            <span>{isAddingPoint ? 'İptal' : 'YKN'}</span>
          </button>
        </div>

        {isAddingPoint && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
            <div className="bg-orange-500 text-white px-4 py-2 rounded-full shadow-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 border border-orange-400">
              <i className="fas fa-mouse-pointer"></i>
              Harita üzerinde bir noktaya tıklayın
            </div>
          </div>
        )}

        <MapContainer center={[39, 35]} zoom={6} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
          {getTileLayer()}
          <FitBounds features={features} subArea={config.subAreaKmlData} />
          <MapClickHandler active={isAddingPoint} onMapClick={handleAddPoint} />
          
          {features.map((f, i) => {
            if (f.type === 'Polygon') {
              return <Polygon key={i} positions={f.coordinates.map(c => [c.lat, c.lng] as [number, number])} color="red" fillOpacity={0.05} weight={3} />;
            }
            return null;
          })}

          {config.subAreaKmlData?.features.map((f, i) => {
            if (f.type === 'Polygon') {
              return <Polygon key={`sub-${i}`} positions={f.coordinates.map(c => [c.lat, c.lng] as [number, number])} color="#d946ef" fillOpacity={0.1} weight={2} dashArray="5, 5" />;
            }
            return null;
          })}

          {shrunkPolygon && <Polygon positions={shrunkPolygon} color="#4f46e5" fillOpacity={0.1} weight={2} dashArray="10, 10" />}

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
                <button onClick={() => handleDeletePoint(p.id)} className="w-full py-1.5 bg-red-50 text-red-600 rounded border border-red-100 text-[9px] font-black uppercase tracking-widest hover:bg-red-100 transition-colors">SİL</button>
              </Popup>
            </Marker>
          ))}

          {pointConnections.map((conn, i) => (
            <React.Fragment key={i}>
              <Polyline positions={[[conn.from.lat, conn.from.lng], [conn.to.lat, conn.to.lng]]} color="#94a3b8" weight={1} dashArray="4, 4" />
              <Marker position={[(conn.from.lat + conn.to.lat) / 2, (conn.from.lng + conn.to.lng) / 2]} icon={L.divIcon({
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
        <button onClick={() => setShowExportModal(true)} className="w-full py-2.5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2">
          <i className="fas fa-file-export"></i>YKN'LERİ DIŞARI AKTAR
        </button>
      </div>

      <GlobalFooter />

      {showExportModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowExportModal(false)}></div>
          <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl relative overflow-hidden p-8 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">Dışarı Aktar</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 mb-6">YKN Planı Dosya Adı Belirleyin</p>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Dosya Adı</label>
                <input type="text" value={exportName} onChange={(e) => setExportName(e.target.value)} className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-slate-900 focus:outline-none focus:border-blue-500" placeholder="Dosya adı giriniz..." autoFocus />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowExportModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all">İPTAL</button>
                <button onClick={handleExport} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-blue-200 active:scale-95 transition-all">İNDİR</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GCPNormalPlanDisplay;
