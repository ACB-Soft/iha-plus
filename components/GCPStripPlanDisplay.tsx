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

const GCPStripPlanDisplay: React.FC<Props> = ({ projectName, features, config, onBack }) => {
  const mapProvider = localStorage.getItem('default_map_provider') || 'Google Satellite';
  const [points, setPoints] = useState<YKNPoint[]>([]);
  const [shrunkPolygon, setShrunkPolygon] = useState<[number, number][] | null>(null);
  const [spine, setSpine] = useState<[number, number][]>([]);
  const [isAddingPoint, setIsAddingPoint] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportName, setExportName] = useState(`YKN_Strip_${projectName.replace(/\.(kml|kmz)$/i, '')}`);

  const boundaryArea = useMemo(() => {
    const polygonFeature = features.find(f => f.type === 'Polygon');
    if (!polygonFeature) return 0;
    return calculatePolygonArea(polygonFeature.coordinates.map(c => ({ lat: c.lat, lng: c.lng })));
  }, [features]);

  // Initial Point Generation
  useEffect(() => {
    const generatePoints = (dist: number): { ykns: YKNPoint[], spinePts: [number, number][] } => {
      const polygonFeature = features.find(f => f.type === 'Polygon');
      if (!polygonFeature) return { ykns: [], spinePts: [] };

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

      // 1. Generate Grid Points with Distance to Edge
      const bbox = turf.bbox(targetPoly);
      const gridSpacing = 15; // 15m resolution for pathfinding
      const candidates: { pt: [number, number], distToEdge: number, id: number }[] = [];
      
      const latMid = (bbox[1] + bbox[3]) / 2;
      const latStep = gridSpacing / 111320;
      const lngStep = gridSpacing / (111320 * Math.cos(latMid * Math.PI / 180));

      let idCounter = 0;
      for (let x = bbox[0]; x <= bbox[2]; x += lngStep) {
        for (let y = bbox[1]; y <= bbox[3]; y += latStep) {
          const pt: [number, number] = [x, y];
          if (turf.booleanPointInPolygon(pt, targetPoly)) {
            // Calculate distance to nearest edge
            let minDist = Infinity;
            const polyCoords = targetPoly.geometry.coordinates[0];
            for (let k = 0; k < polyCoords.length - 1; k++) {
              const line = turf.lineString([polyCoords[k], polyCoords[k+1]]);
              const d = turf.pointToLineDistance(pt, line, { units: 'meters' });
              if (d < minDist) minDist = d;
            }
            candidates.push({ pt, distToEdge: minDist, id: idCounter++ });
          }
        }
      }

      if (candidates.length < 2) return { ykns: [], spinePts: [] };

      // 2. Find the two furthest points to identify the "ends" of the strip
      let pA = 0;
      let maxD = -1;
      const centroid = turf.centroid(targetPoly).geometry.coordinates as [number, number];
      candidates.forEach((c, i) => {
        const d = turf.distance(c.pt, centroid);
        if (d > maxD) { maxD = d; pA = i; }
      });

      let pB = 0;
      maxD = -1;
      candidates.forEach((c, i) => {
        const d = turf.distance(candidates[pA].pt, c.pt);
        if (d > maxD) { maxD = d; pB = i; }
      });

      // Refine start/end to be at the center of the "end zones"
      let startIdx = pA;
      let endIdx = pB;
      let maxDistToEdgeStart = -1;
      let maxDistToEdgeEnd = -1;

      candidates.forEach((c, i) => {
        const dStart = turf.distance(candidates[pA].pt, c.pt, { units: 'meters' });
        if (dStart < 50 && c.distToEdge > maxDistToEdgeStart) {
          maxDistToEdgeStart = c.distToEdge;
          startIdx = i;
        }
        const dEnd = turf.distance(candidates[pB].pt, c.pt, { units: 'meters' });
        if (dEnd < 50 && c.distToEdge > maxDistToEdgeEnd) {
          maxDistToEdgeEnd = c.distToEdge;
          endIdx = i;
        }
      });

      // 3. Dijkstra to find the centered spine
      const costs = new Float32Array(candidates.length).fill(Infinity);
      const parent = new Int32Array(candidates.length).fill(-1);
      const visited = new Uint8Array(candidates.length).fill(0);
      
      costs[startIdx] = 0;
      const queue: number[] = [startIdx];

      let iterations = 0;
      const maxIterations = 20000; // Increased limit for large areas (e.g., 80ha)

      while (queue.length > 0 && iterations < maxIterations) {
        iterations++;
        // Find node with minimum cost (simple but effective for this scale)
        let minIdx = 0;
        let minVal = Infinity;
        for (let i = 0; i < queue.length; i++) {
          if (costs[queue[i]] < minVal) {
            minVal = costs[queue[i]];
            minIdx = i;
          }
        }
        
        const curr = queue.splice(minIdx, 1)[0];
        if (curr === endIdx) break;
        if (visited[curr]) continue;
        visited[curr] = 1;

        const c = candidates[curr];
        // Check neighbors (within gridSpacing * 1.8 to ensure connectivity)
        for (let i = 0; i < candidates.length; i++) {
          if (visited[i]) continue;
          const n = candidates[i];
          const d = turf.distance(c.pt, n.pt, { units: 'meters' });
          if (d < gridSpacing * 1.8) {
            // Cost favors center: distance / (distToEdge^3)
            const weight = d * (1 / Math.pow(n.distToEdge + 1, 3));
            const newCost = costs[curr] + weight;
            if (newCost < costs[i]) {
              costs[i] = newCost;
              parent[i] = curr;
              queue.push(i);
            }
          }
        }
      }

      const spinePoints: [number, number][] = [];
      let currPath: number = endIdx;
      while (currPath !== -1) {
        spinePoints.push(candidates[currPath].pt);
        currPath = parent[currPath];
      }
      spinePoints.reverse();

      if (spinePoints.length < 2) return { ykns: [], spinePts: [] };

      // 5. Generate YKNs along the Spine
      const resultYKNS: YKNPoint[] = [];
      let zigzag = 1;
      
      // Helper to get YKN position from spine index with offset
      const getYKNPos = (idx: number, zz: number): [number, number] => {
        const spinePt = spinePoints[idx];
        const prevPt = spinePoints[Math.max(0, idx - 2)];
        const nextPt = spinePoints[Math.min(spinePoints.length - 1, idx + 2)];
        
        const dx = nextPt[0] - prevPt[0];
        const dy = nextPt[1] - prevPt[1];
        
        const mag = Math.sqrt(dx*dx + dy*dy) || 1;
        const nx = (-dy / mag) * zz;
        const ny = (dx / mag) * zz;

        let bestPt = spinePt;
        // Try to push point towards the edge (up to 40% of strip width roughly)
        for (let o = 5; o <= 150; o += 5) {
          const testLng = spinePt[0] + nx * (o / 111320 / Math.cos(spinePt[1] * Math.PI / 180));
          const testLat = spinePt[1] + ny * (o / 111320);
          const testPt: [number, number] = [testLng, testLat];
          
          if (turf.booleanPointInPolygon(testPt, targetPoly)) {
            bestPt = testPt;
          } else {
            break;
          }
        }
        return bestPt;
      };

      // Place first YKN
      let lastYKNPos = getYKNPos(0, zigzag);
      resultYKNS.push({
        id: `ykn-0`,
        name: `YKN1`,
        lng: lastYKNPos[0],
        lat: lastYKNPos[1]
      });
      zigzag *= -1;

      let currentSpineIdx = 0;
      const targetDist = dist; // User selected distance (e.g., 200m, 400m)
      const minAcceptable = dist * 0.95; // 5% tolerance (e.g., 190m, 380m)

      while (currentSpineIdx < spinePoints.length - 1) {
        let bestNextIdx = -1;

        // Search forward along the spine to find the furthest point within [0.95*dist, 1.0*dist]
        for (let i = currentSpineIdx + 1; i < spinePoints.length; i++) {
          const potPos = getYKNPos(i, zigzag);
          const d = turf.distance(lastYKNPos, potPos, { units: 'meters' });

          if (d > targetDist) {
            // CRITICAL: We hit the hard limit. 
            // If we found a point in the 5% zone before this, we already have it in bestNextIdx.
            // If we haven't found a point in the 5% zone yet, we MUST take the previous point (i-1)
            // to ensure we NEVER exceed the target distance.
            if (bestNextIdx === -1) {
              bestNextIdx = Math.max(currentSpineIdx + 1, i - 1);
            }
            break;
          }
          
          if (d >= minAcceptable) {
            // We are in the 5% tolerance zone. 
            // We keep updating bestNextIdx to get as close to targetDist as possible without exceeding it.
            bestNextIdx = i;
          }
          
          // If we reach the end of the spine without exceeding targetDist or hitting minAcceptable,
          // we will handle it after the loop.
        }

        if (bestNextIdx !== -1) {
          const finalPos = getYKNPos(bestNextIdx, zigzag);
          
          resultYKNS.push({
            id: `ykn-${resultYKNS.length}`,
            name: `YKN${resultYKNS.length + 1}`,
            lng: finalPos[0],
            lat: finalPos[1]
          });
          
          lastYKNPos = finalPos;
          currentSpineIdx = bestNextIdx;
          zigzag *= -1;
        } else {
          // Could not find any point that reaches even the minimum distance before spine ends.
          break;
        }
        
        if (resultYKNS.length > 500) break;
      }

      return { ykns: resultYKNS, spinePts: spinePoints };
    };

    const { ykns, spinePts } = generatePoints(config.gcpDistance || 400);
    setPoints(ykns);
    const leafletSpine: any[] = [];
    for (const p of spinePts) {
      leafletSpine.push([p[1], p[0]]);
    }
    setSpine(leafletSpine as [number, number][]);
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

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${projectName} - Şeritvari YKN Planı</name>
    ${polygonKml}
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
      <Header title="Şeritvari YKN Planı" onBack={onBack} />

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
          <FitBounds features={features} />
          <MapClickHandler active={isAddingPoint} onMapClick={handleAddPoint} />
          
          {features.map((f, i) => {
            if (f.type === 'Polygon') {
              return <Polygon key={i} positions={f.coordinates.map(c => [c.lat, c.lng] as [number, number])} color="red" fillOpacity={0.05} weight={3} />;
            }
            return null;
          })}

          {shrunkPolygon && <Polygon positions={shrunkPolygon} color="#4f46e5" fillOpacity={0.1} weight={2} dashArray="10, 10" />}
          
          {spine.length > 0 && (
            <Polyline positions={spine} color="#2563eb" weight={2} dashArray="5, 10" opacity={0.5} />
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
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Mesafe</span>
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

export default GCPStripPlanDisplay;
