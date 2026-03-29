import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Popup, Polygon, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as turf from '@turf/turf';
import { KMLFeature } from './KMLUtils';
import GlobalFooter from './GlobalFooter';
import Header from './Header';
import { FlightConfig } from '../src/types/flight';

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

  // Initial Point Generation
  useEffect(() => {
    const polygonFeature = features.find(f => f.type === 'Polygon');
    if (!polygonFeature) return;

    // 1. Convert to Turf Polygon
    const coords = polygonFeature.coordinates.map(c => [c.lng, c.lat]);
    // Ensure polygon is closed
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
        if (buffered && buffered.geometry.type === 'Polygon') {
          targetPoly = buffered as any;
          shrunkCoords = (buffered.geometry.coordinates[0] as any[]).map((c: any) => [c[1], c[0]] as [number, number]);
        } else if (buffered && buffered.geometry.type === 'MultiPolygon') {
           // Take the largest polygon if it split
           const polys = (buffered.geometry.coordinates as any[][][]).map(c => turf.polygon(c));
           const largest = polys.reduce((prev, current) => (turf.area(prev) > turf.area(current) ? prev : current));
           targetPoly = largest as any;
           shrunkCoords = (largest.geometry.coordinates[0] as any[]).map((c: any) => [c[1], c[0]] as [number, number]);
        }
      } catch (e) {
        console.error("Buffer error", e);
      }
    }
    setShrunkPolygon(shrunkCoords);

    // 3. Generate Grid
    const distanceMeters = config.gcpDistance || 400;
    const bbox = turf.bbox(targetPoly);
    const grid = turf.pointGrid(bbox, distanceMeters / 1000, { units: 'kilometers', mask: targetPoly });

    // 4. Map to YKN Points with Zigzag sorting
    const rawPoints = grid.features.map(f => ({
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1]
    }));

    // Group points by latitude (rows)
    const rows: Record<string, typeof rawPoints> = {};
    rawPoints.forEach(p => {
      const key = p.lat.toFixed(6); // Use fixed precision for grouping
      if (!rows[key]) rows[key] = [];
      rows[key].push(p);
    });

    // Center points in each row according to polygon width at that latitude
    const polyBbox = turf.bbox(targetPoly);
    Object.keys(rows).forEach(latKey => {
      const rowPoints = rows[latKey];
      if (rowPoints.length > 1) {
        const lat = parseFloat(latKey);
        // Create a horizontal line across the polygon at this latitude
        const horizontalLine = turf.lineString([
          [polyBbox[0] - 0.1, lat],
          [polyBbox[2] + 0.1, lat]
        ]);
        
        const intersections = turf.lineIntersect(horizontalLine, targetPoly);
        if (intersections.features.length >= 2) {
          const xCoords = intersections.features.map(f => f.geometry.coordinates[0]);
          const minX = Math.min(...xCoords);
          const maxX = Math.max(...xCoords);
          const polyMid = (minX + maxX) / 2;

          const ptsX = rowPoints.map(p => p.lng);
          const ptsMid = (Math.min(...ptsX) + Math.max(...ptsX)) / 2;

          const shift = polyMid - ptsMid;
          rowPoints.forEach(p => {
            p.lng += shift;
          });
        }
      }
    });

    // Sort row latitudes descending (top to bottom)
    const sortedLatKeys = Object.keys(rows).sort((a, b) => parseFloat(b) - parseFloat(a));

    // Special Rules for Single-Point Rows
    sortedLatKeys.forEach((latKey, i) => {
      const rowPoints = rows[latKey];
      if (rowPoints.length === 1) {
        const lat = parseFloat(latKey);
        // Find polygon center at this latitude
        const horizontalLine = turf.lineString([
          [polyBbox[0] - 0.1, lat],
          [polyBbox[2] + 0.1, lat]
        ]);
        const intersections = turf.lineIntersect(horizontalLine, targetPoly);
        
        if (intersections.features.length >= 2) {
          const xCoords = intersections.features.map(f => f.geometry.coordinates[0]);
          const minX = Math.min(...xCoords);
          const maxX = Math.max(...xCoords);
          const polyMid = (minX + maxX) / 2;

          // Rule: Center single points (including top and bottom)
          rowPoints[0].lng = polyMid;
        }
      }
    });

    let zigzagSorted: typeof rawPoints = [];
    sortedLatKeys.forEach((key, index) => {
      const rowPoints = rows[key].sort((a, b) => a.lng - b.lng);
      if (index % 2 === 1) {
        rowPoints.reverse(); // Reverse every second row for zigzag
      }
      zigzagSorted = zigzagSorted.concat(rowPoints);
    });

    let finalPoints: YKNPoint[] = zigzagSorted.map((p, i) => ({
      id: `ykn-${i}`,
      name: `YKN${i + 1}`,
      lng: p.lng,
      lat: p.lat
    }));

    // 5. Ensure at least 5 points for photogrammetric balancing by reducing distance if needed
    const minCount = 5;
    
    if (finalPoints.length < minCount) {
      // Try to reduce distance until we have enough points
      let currentDist = distanceMeters;
      let tempPoints: YKNPoint[] = [];
      let attempts = 0;
      
      while (tempPoints.length < minCount && attempts < 15) {
        currentDist *= 0.7; // More aggressive reduction
        const newGrid = turf.pointGrid(bbox, currentDist / 1000, { units: 'kilometers', mask: targetPoly });
        
        if (newGrid.features.length >= minCount) {
          // Re-apply zigzag sorting for the new denser grid
          const newRaw = newGrid.features.map(f => ({
            lng: f.geometry.coordinates[0],
            lat: f.geometry.coordinates[1]
          }));
          
          const newRows: Record<string, typeof newRaw> = {};
          newRaw.forEach(p => {
            const key = p.lat.toFixed(6);
            if (!newRows[key]) newRows[key] = [];
            newRows[key].push(p);
          });
          
          const newLatKeys = Object.keys(newRows).sort((a, b) => parseFloat(b) - parseFloat(a));
          let newZigzag: typeof newRaw = [];
          newLatKeys.forEach((key, idx) => {
            const rowPts = newRows[key].sort((a, b) => a.lng - b.lng);
            if (idx % 2 === 1) rowPts.reverse();
            newZigzag = newZigzag.concat(rowPts);
          });
          
          tempPoints = newZigzag.map((p, i) => ({
            id: `ykn-${i}`,
            name: `YKN${i + 1}`,
            lng: p.lng,
            lat: p.lat
          }));
          break;
        }
        attempts++;
      }
      
      if (tempPoints.length >= minCount) {
        finalPoints = tempPoints;
      }
    }

    setPoints(finalPoints);
  }, [features, config]);

  const handleMarkerDragEnd = (id: string, newLat: number, newLng: number) => {
    setPoints(prev => prev.map(p => p.id === id ? { ...p, lat: newLat, lng: newLng } : p));
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
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${projectName} - YKN Noktaları</name>
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
    const cleanName = projectName.replace(/\.(kml|kmz)$/i, '');
    const a = document.createElement('a');
    a.href = url;
    a.download = `YKN_${cleanName}.kml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full flex flex-col bg-slate-200 h-full animate-in overflow-hidden">
      <Header title="YKN Planı Ekranı" onBack={onBack} />

      <div className="flex-1 relative z-10">
        {/* Top Right Export Button Overlay */}
        <div className="absolute top-6 right-6 z-[1000] pointer-events-none">
          <button 
            onClick={handleExport}
            className="px-4 py-3 bg-blue-600 rounded-xl flex items-center gap-2 shadow-xl text-white font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all pointer-events-auto border border-blue-500/50"
          >
            <i className="fas fa-file-export"></i>
            YKN'leri Dışa Aktar
          </button>
        </div>

        {/* Bottom Stats Overlay */}
        <div className="absolute bottom-6 left-4 right-4 z-[1000] pointer-events-none flex items-end gap-3 justify-center">
          <div className="bg-slate-100/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200 overflow-hidden pointer-events-auto w-full max-w-lg p-4 flex justify-around items-center">
            <div className="text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Toplam YKN</p>
              <p className="text-xl font-black text-blue-600">{points.length}</p>
            </div>
            <div className="w-px h-8 bg-slate-200"></div>
            <div className="text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Hedef Mesafe</p>
              <p className="text-xl font-black text-emerald-600">{config.gcpDistance}m</p>
            </div>
            <div className="w-px h-8 bg-slate-200"></div>
            <div className="text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ofset</p>
              <p className="text-xl font-black text-orange-600">{config.gcpStartOffset}m</p>
            </div>
          </div>
        </div>

        <MapContainer 
          center={[39, 35]} 
          zoom={6} 
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          {getTileLayer()}
          <FitBounds features={features} />
          
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
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Sürükleyerek konumlandırın</div>
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

      <GlobalFooter />
    </div>
  );
};

export default GCPPlanDisplay;
