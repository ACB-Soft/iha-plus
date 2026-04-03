import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Popup, Polygon, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as turf from '@turf/turf';
import { Delaunay } from 'd3-delaunay';
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
  const [spineMarkers, setSpineMarkers] = useState<YKNPoint[]>([]);
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
    const generatePoints = (dist: number): { ykns: YKNPoint[], spinePts: [number, number][], spineMarkers: YKNPoint[] } => {
      const polygonFeature = features.find(f => f.type === 'Polygon');
      if (!polygonFeature) return { ykns: [], spinePts: [], spineMarkers: [] };

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

      // --- VORONOI-BASED SKELETONIZATION (MEDIAL AXIS TRANSFORM) ---
      
      // 1. Sample points along the boundary
      const line = turf.polygonToLine(targetPoly) as any;
      const lineLength = turf.length(line, { units: 'meters' });
      const sampleDist = 5; // Increased resolution for high fidelity
      const boundaryPoints: [number, number][] = [];
      
      for (let d = 0; d < lineLength; d += sampleDist) {
        const p = turf.along(line, d, { units: 'meters' }).geometry.coordinates as [number, number];
        boundaryPoints.push(p);
      }

      // 2. Compute Voronoi Diagram
      const bbox = turf.bbox(targetPoly);
      const delaunay = Delaunay.from(boundaryPoints);
      const voronoi = delaunay.voronoi(bbox);
      
      // 3. Filter Voronoi edges that are inside the polygon
      const pointsInPoly: [number, number][] = [];
      const pointMap = new Map<string, number>();

      const getPointId = (pt: [number, number]) => {
        const key = `${pt[0].toFixed(7)},${pt[1].toFixed(7)}`;
        if (!pointMap.has(key)) {
          pointMap.set(key, pointsInPoly.length);
          pointsInPoly.push(pt);
        }
        return pointMap.get(key)!;
      };

      const circumcenters: [number, number][] = [];
      for (let i = 0; i < delaunay.triangles.length / 3; i++) {
        const center = [voronoi.circumcenters[i * 2], voronoi.circumcenters[i * 2 + 1]] as [number, number];
        circumcenters.push(center);
      }

      const graph: Map<number, number[]> = new Map();
      const validCenters = new Set<number>();

      circumcenters.forEach((c, i) => {
        if (turf.booleanPointInPolygon(c, targetPoly)) {
          validCenters.add(i);
        }
      });

      for (let i = 0; i < delaunay.halfedges.length; i++) {
        const j = delaunay.halfedges[i];
        if (j < i || j === -1) continue; 
        
        const tri1 = Math.floor(i / 3);
        const tri2 = Math.floor(j / 3);
        
        if (validCenters.has(tri1) && validCenters.has(tri2)) {
          const p1 = circumcenters[tri1];
          const p2 = circumcenters[tri2];
          
          const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2] as [number, number];
          if (turf.booleanPointInPolygon(mid, targetPoly)) {
            const id1 = getPointId(p1);
            const id2 = getPointId(p2);
            
            if (!graph.has(id1)) graph.set(id1, []);
            if (!graph.has(id2)) graph.set(id2, []);
            graph.get(id1)!.push(id2);
            graph.get(id2)!.push(id1);
          }
        }
      }

      if (pointsInPoly.length < 2) return { ykns: [], spinePts: [], spineMarkers: [] };

      const findFurthest = (startId: number) => {
        const distances = new Map<number, number>();
        const parent = new Map<number, number>();
        const queue = [startId];
        distances.set(startId, 0);
        parent.set(startId, -1);

        let furthestId = startId;
        let maxDist = 0;

        while (queue.length > 0) {
          const curr = queue.shift()!;
          const d = distances.get(curr)!;

          if (d > maxDist) {
            maxDist = d;
            furthestId = curr;
          }

          const neighbors = graph.get(curr) || [];
          for (const next of neighbors) {
            if (!distances.has(next)) {
              distances.set(next, d + 1);
              parent.set(next, curr);
              queue.push(next);
            }
          }
        }
        return { furthestId, parent };
      };

      if (graph.size === 0) return { ykns: [], spinePts: [], spineMarkers: [] };

      const startNode = Array.from(graph.keys())[0];
      const { furthestId: end1 } = findFurthest(startNode);
      const { furthestId: end2, parent } = findFurthest(end1);

      const spinePoints: [number, number][] = [];
      let currNode = end2;
      while (currNode !== -1) {
        spinePoints.push(pointsInPoly[currNode]);
        currNode = parent.get(currNode) ?? -1;
      }

      const smoothedSpine: [number, number][] = [];
      const windowSize = 3;
      for (let i = 0; i < spinePoints.length; i++) {
        let sumLng = 0;
        let sumLat = 0;
        let count = 0;
        for (let j = i - windowSize; j <= i + windowSize; j++) {
          if (j >= 0 && j < spinePoints.length) {
            sumLng += spinePoints[j][0];
            sumLat += spinePoints[j][1];
            count++;
          }
        }
        smoothedSpine.push([sumLng / count, sumLat / count]);
      }

      if (smoothedSpine.length < 2) return { ykns: [], spinePts: [], spineMarkers: [] };

      // 4. Calculate turn angles and directions for corner optimization
      const turnInfo = smoothedSpine.map((p, i) => {
        if (i === 0 || i === smoothedSpine.length - 1) return { angle: 0, direction: 0 };
        const prev = smoothedSpine[i - 1];
        const next = smoothedSpine[i + 1];
        const b1 = turf.bearing(prev, p);
        const b2 = turf.bearing(p, next);
        let diff = b2 - b1;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        return { angle: Math.abs(diff), direction: Math.sign(diff) }; // 1: right, -1: left
      });

      const runGeneration = (currentDist: number) => {
        const resultYKNS: YKNPoint[] = [];
        let zigzag = 1;
        let cornerModeCount = 0;
        let forcedZigzag = 0;
        
        const getYKNPos = (idx: number, zz: number): [number, number] => {
          const spinePt = smoothedSpine[idx];
          const prevIdx = Math.max(0, idx - 1);
          const nextIdx = Math.min(smoothedSpine.length - 1, idx + 1);
          const prevP = smoothedSpine[prevIdx];
          const nextP = smoothedSpine[nextIdx];
          const bearing = turf.bearing(prevP, nextP);
          const perpBearing = bearing + 90 * zz;

          let bestPt = spinePt;
          for (let o = 5; o <= 200; o += 5) {
            const testPt = turf.destination(spinePt, o, perpBearing, { units: 'meters' }).geometry.coordinates as [number, number];
            if (turf.booleanPointInPolygon(testPt, targetPoly)) {
              bestPt = testPt;
            } else {
              break;
            }
          }
          return bestPt;
        };

        let lastYKNPos = getYKNPos(0, zigzag);
        resultYKNS.push({
          id: `ykn-0`,
          name: `YKN1`,
          lng: lastYKNPos[0],
          lat: lastYKNPos[1]
        });

        let currentSpineIdx = 0;
        const targetDist = currentDist;
        const lowerBound = currentDist * 0.99;
        const upperBound = currentDist * 1.01;

        while (currentSpineIdx < smoothedSpine.length - 1) {
          let nextZigzag = zigzag;
          if (cornerModeCount > 0) {
            nextZigzag = forcedZigzag;
          } else {
            const lookAheadIdx = Math.floor(targetDist / 10);
            let maxTurnAngle = 0;
            let turnDirection = 0;
            for (let k = currentSpineIdx; k < Math.min(currentSpineIdx + lookAheadIdx, smoothedSpine.length); k++) {
              if (turnInfo[k].angle > maxTurnAngle) {
                maxTurnAngle = turnInfo[k].angle;
                turnDirection = turnInfo[k].direction;
              }
            }
            if (maxTurnAngle > 20) nextZigzag = -turnDirection;
            else nextZigzag = zigzag * -1;
          }

          // Optimization: Find the spine index that yields the point closest to targetDist within ±1% window
          let bestI = -1;
          let minDiff = Infinity;
          
          for (let i = currentSpineIdx + 1; i < smoothedSpine.length; i++) {
            const potPos = getYKNPos(i, nextZigzag);
            const d = turf.distance(lastYKNPos, potPos, { units: 'meters' });
            const diff = Math.abs(d - targetDist);

            // If we find a point that is better than previous best, track it
            if (diff < minDiff) {
              minDiff = diff;
              bestI = i;
            }

            // If we have already passed the target distance and the distance is getting worse, stop searching
            if (d > upperBound && diff > minDiff) {
              break;
            }
          }

          // Fallback: If we couldn't find a point (shouldn't happen with 5m resolution), break
          if (bestI === -1) break;

          if (cornerModeCount > 0) {
            cornerModeCount--;
          } else {
            const lookAheadIdx = Math.floor(targetDist / 10);
            let maxTurnAngle = 0;
            let turnDirection = 0;
            for (let k = currentSpineIdx; k < Math.min(currentSpineIdx + lookAheadIdx, smoothedSpine.length); k++) {
              if (turnInfo[k].angle > maxTurnAngle) {
                maxTurnAngle = turnInfo[k].angle;
                turnDirection = turnInfo[k].direction;
              }
            }
            if (maxTurnAngle > 20) {
              forcedZigzag = -turnDirection;
              cornerModeCount = 2;
              zigzag = forcedZigzag;
            } else {
              zigzag *= -1;
            }
          }

          currentSpineIdx = bestI;
          lastYKNPos = getYKNPos(currentSpineIdx, zigzag);
          resultYKNS.push({
            id: `ykn-${resultYKNS.length}`,
            name: `YKN${resultYKNS.length + 1}`,
            lng: lastYKNPos[0],
            lat: lastYKNPos[1]
          });
        }
        return resultYKNS;
      };

      let finalYKNS = runGeneration(dist);
      let attemptDist = dist;
      while (finalYKNS.length < 5 && attemptDist > 50) {
        attemptDist -= 50;
        finalYKNS = runGeneration(attemptDist);
      }

      // Generate spine markers at exact distance intervals
      const spineMarkers: YKNPoint[] = [];
      let currentMarkerDist = 0;
      
      // Add start marker
      spineMarkers.push({
        id: `sm-0`,
        name: `0m`,
        lng: smoothedSpine[0][0],
        lat: smoothedSpine[0][1]
      });

      let accumulatedSpineDist = 0;
      let nextMarkerTarget = attemptDist;

      for (let i = 1; i < smoothedSpine.length; i++) {
        const d = turf.distance(smoothedSpine[i - 1], smoothedSpine[i], { units: 'meters' });
        accumulatedSpineDist += d;

        while (accumulatedSpineDist >= nextMarkerTarget) {
          spineMarkers.push({
            id: `sm-${spineMarkers.length}`,
            name: `${Math.round(nextMarkerTarget)}m`,
            lng: smoothedSpine[i][0],
            lat: smoothedSpine[i][1]
          });
          nextMarkerTarget += attemptDist;
        }
      }

      return { ykns: finalYKNS, spinePts: smoothedSpine, spineMarkers };
    };

    const { ykns, spinePts, spineMarkers: sm } = generatePoints(config.gcpDistance || 400);
    setPoints(ykns);
    setSpineMarkers(sm);
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
            <Polyline positions={spine} color="#ef4444" weight={3} opacity={1} />
          )}

          {/* Spine Markers */}
          {spineMarkers.map((m) => (
            <Marker 
              key={m.id} 
              position={[m.lat, m.lng]}
              icon={L.divIcon({
                className: 'bg-transparent',
                html: `
                  <div class="flex flex-col items-center">
                    <div class="w-2 h-2 bg-red-600 rounded-full border border-white shadow-sm"></div>
                    <div class="bg-white/90 px-1 rounded text-[8px] font-black text-red-600 mt-0.5 whitespace-nowrap border border-red-200">${m.name}</div>
                  </div>
                `,
                iconSize: [40, 20],
                iconAnchor: [20, 4]
              })}
            />
          ))}

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
