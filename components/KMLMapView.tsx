import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Popup, Polyline, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { KMLData, KMLFeature } from './KMLUtils';
import GlobalFooter from './GlobalFooter';
import Header from './Header';
import { SCALE_TARGET_GSD, FlightConfig } from '../src/types/flight';
import { getBoundingBox, expandPolygon, getGridPolygon, getSteppedGridPolygon, generateFlightLines, calculateDistance, calculatePolygonArea } from './GeometryUtils';

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

const KMLMapView: React.FC<Props> = ({ projectName, features, config, onBack }) => {
  const mapProvider = localStorage.getItem('default_map_provider') || 'Google Hybrid';
  
  // Initial calculation based on config
  const initialAltitude = config.height;
  const initialGsd = (initialAltitude * config.camera.sensorWidth) / (config.camera.focalLength * config.camera.imageWidth) * 100;
  
  const [altitude, setAltitude] = useState(Math.round(initialAltitude));
  const [gsd, setGsd] = useState(Number(initialGsd.toFixed(2)));
  const [initialStats, setInitialStats] = useState({ distance: 0, photoCount: 0, time: 0 });
  const [finalStats, setFinalStats] = useState({ distance: 0, photoCount: 0, time: 0 });

  // Recalculate GSD when altitude changes
  const handleAltitudeChange = (newAlt: number) => {
    setAltitude(newAlt);
    const newGsd = (newAlt * config.camera.sensorWidth) / (config.camera.focalLength * config.camera.imageWidth) * 100;
    setGsd(Number(newGsd.toFixed(2)));
  };

  // Recalculate altitude when GSD changes
  const handleGsdChange = (newGsd: number) => {
    setGsd(newGsd);
    const newAlt = (newGsd * config.camera.focalLength * config.camera.imageWidth) / (config.camera.sensorWidth * 100);
    setAltitude(Math.round(newAlt));
  };

  // Calculate all geometry and flight lines once
  const processedFeatures = features.map(f => {
    if (f.type !== 'Polygon') return { ...f, originalCoords: [], expandedCoords: null, gridCoords: null, rectangleCoords: null, flightLines: [], initialFlightLines: [], initialArea: 0, finalArea: 0 };
    
    const originalCoords = f.coordinates.map(c => ({ lat: c.lat, lng: c.lng }));
    const initialArea = calculatePolygonArea(originalCoords);
    
    const initialFlightLines = config.showRoute
      ? generateFlightLines(
          originalCoords,
          altitude,
          config.camera.sensorWidth,
          config.camera.focalLength,
          config.overlapSide
        )
      : [];

    const expandedCoords = config.buffer > 0 
      ? expandPolygon(originalCoords, config.buffer)
      : null;
      
    const gridCoords = config.expandToGrid > 0
      ? getSteppedGridPolygon(
          expandedCoords || originalCoords,
          config.expandToGrid
        )
      : null;

    const rectangleCoords = config.expandToRectangle
      ? getGridPolygon(gridCoords || expandedCoords || originalCoords, 1)
      : null;
      
    const finalArea = calculatePolygonArea(rectangleCoords || gridCoords || expandedCoords || originalCoords);
      
    const flightLines = config.showRoute
      ? generateFlightLines(
          rectangleCoords || gridCoords || expandedCoords || originalCoords,
          altitude,
          config.camera.sensorWidth,
          config.camera.focalLength,
          config.overlapSide
        )
      : [];
      
    return {
      ...f,
      originalCoords,
      expandedCoords,
      gridCoords,
      rectangleCoords,
      flightLines,
      initialFlightLines,
      initialArea,
      finalArea
    };
  });

  // Update stats
  useEffect(() => {
    let iDist = 0;
    let fDist = 0;
    
    processedFeatures.forEach(f => {
      f.initialFlightLines.forEach(line => {
        for (let j = 0; j < line.length - 1; j++) {
          iDist += calculateDistance(line[j], line[j + 1]);
        }
      });
      f.flightLines.forEach(line => {
        for (let j = 0; j < line.length - 1; j++) {
          fDist += calculateDistance(line[j], line[j + 1]);
        }
      });
    });

    const sensorHeight = config.camera.sensorWidth * 0.66;
    const groundSwathHeight = altitude * (sensorHeight / config.camera.focalLength);
    const distanceBetweenPhotos = groundSwathHeight * (1 - config.overlapFront / 100);
    
    const speed = 10; // 10 m/s
    
    setInitialStats({
      distance: iDist,
      photoCount: distanceBetweenPhotos > 0 ? Math.ceil(iDist / distanceBetweenPhotos) : 0,
      time: Math.ceil(iDist / (speed * 60))
    });

    setFinalStats({
      distance: fDist,
      photoCount: distanceBetweenPhotos > 0 ? Math.ceil(fDist / distanceBetweenPhotos) : 0,
      time: Math.ceil(fDist / (speed * 60))
    });
  }, [altitude, config.overlapSide, config.overlapFront, config.showRoute, config.buffer, config.expandToGrid, features]);

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

  const handleExport = () => {
    const feature = processedFeatures.find(f => f.type === 'Polygon');
    if (!feature) return;

    const coords = feature.rectangleCoords || feature.gridCoords || feature.expandedCoords || feature.originalCoords;
    if (!coords || coords.length === 0) return;

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${projectName} - Grid Tahdit</name>
    <Placemark>
      <name>Grid Tahdit</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${coords.map(c => `${c.lng},${c.lat},0`).join(' ')}
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;

    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const cleanName = projectName.replace(/\.(kml|kmz)$/i, '');
    const a = document.createElement('a');
    a.href = url;
    a.download = `GRID_${cleanName}.kml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full flex flex-col bg-slate-200 h-full animate-in overflow-hidden">
      <Header title="Uçuş Planı Ekranı" onBack={onBack} />

      <div className="flex-1 relative z-10">
        {/* Top Right Export Button Overlay */}
        <div className="absolute top-6 right-6 z-[1000] pointer-events-none">
          <button 
            onClick={handleExport}
            className="px-4 py-3 bg-blue-600 rounded-xl flex items-center gap-2 shadow-xl text-white font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all pointer-events-auto border border-blue-500/50"
          >
            <i className="fas fa-file-export"></i>
            Tahditi Dışa Aktar
          </button>
        </div>

        {/* Bottom Stats & Controls Overlay */}
        <div className="absolute bottom-6 left-4 right-4 z-[1000] pointer-events-none flex items-end gap-3 justify-center">
          {/* Controls Stacked Vertically */}
          <div className="flex flex-col gap-2 pointer-events-auto w-[120px] shrink-0">
            {/* GSD Control */}
            <div className="bg-slate-100/95 backdrop-blur-md px-2 py-1.5 rounded-xl shadow-lg border border-slate-200 flex flex-col items-center">
              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">GSD (cm/px)</p>
              <div className="flex items-center justify-between w-full gap-1">
                <button 
                  onClick={() => handleGsdChange(Number((gsd - 0.01).toFixed(2)))}
                  className="w-5 h-5 bg-slate-200 rounded-md flex items-center justify-center text-slate-600 active:bg-blue-100"
                >
                  <i className="fas fa-minus text-[8px]"></i>
                </button>
                <input 
                  type="number" 
                  step="0.01"
                  value={gsd.toFixed(2)}
                  onChange={(e) => handleGsdChange(parseFloat(e.target.value) || 0)}
                  className="w-full bg-transparent text-center text-[11px] font-black text-blue-600 mono-font focus:outline-none"
                />
                <button 
                  onClick={() => handleGsdChange(Number((gsd + 0.01).toFixed(2)))}
                  className="w-5 h-5 bg-slate-200 rounded-md flex items-center justify-center text-slate-600 active:bg-blue-100"
                >
                  <i className="fas fa-plus text-[8px]"></i>
                </button>
              </div>
            </div>

            {/* Altitude Control */}
            <div className="bg-slate-100/95 backdrop-blur-md px-2 py-1.5 rounded-xl shadow-lg border border-slate-200 flex flex-col items-center">
              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Yükseklik (m)</p>
              <div className="flex items-center justify-between w-full gap-1">
                <button 
                  onClick={() => handleAltitudeChange(altitude - 5)}
                  className="w-5 h-5 bg-slate-200 rounded-md flex items-center justify-center text-slate-600 active:bg-emerald-100"
                >
                  <i className="fas fa-minus text-[8px]"></i>
                </button>
                <input 
                  type="number" 
                  value={altitude}
                  onChange={(e) => handleAltitudeChange(parseInt(e.target.value) || 0)}
                  className="w-full bg-transparent text-center text-[11px] font-black text-emerald-600 mono-font focus:outline-none"
                />
                <button 
                  onClick={() => handleAltitudeChange(altitude + 5)}
                  className="w-5 h-5 bg-slate-200 rounded-md flex items-center justify-center text-slate-600 active:bg-emerald-100"
                >
                  <i className="fas fa-plus text-[8px]"></i>
                </button>
              </div>
            </div>
          </div>

          {/* Stats Table (Shrunk & Matched Theme) */}
          <div className="bg-slate-100/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200 overflow-hidden pointer-events-auto w-full max-w-lg">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-200/30">
                  <th className="px-3 py-1.5 text-[7px] font-black text-slate-400 uppercase tracking-widest">Kategori</th>
                  <th className="px-3 py-1.5 text-[7px] font-black text-slate-400 uppercase tracking-widest text-center">Alan (ha)</th>
                  <th className="px-3 py-1.5 text-[7px] font-black text-slate-400 uppercase tracking-widest text-center">Süre (dk)</th>
                  <th className="px-3 py-1.5 text-[7px] font-black text-slate-400 uppercase tracking-widest text-center">Foto (ad)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-1 text-[9px] font-black text-slate-500">İlk Alan</td>
                  <td className="px-3 py-1 text-[10px] font-black text-slate-700 mono-font text-center">{processedFeatures[0]?.initialArea.toFixed(2)}</td>
                  <td className="px-3 py-1 text-[10px] font-black text-slate-700 mono-font text-center">{initialStats.time}</td>
                  <td className="px-3 py-1 text-[10px] font-black text-slate-700 mono-font text-center">{initialStats.photoCount}</td>
                </tr>
                <tr>
                  <td className="px-3 py-1 text-[9px] font-black text-blue-600">Planlanan</td>
                  <td className="px-3 py-1 text-[10px] font-black text-blue-600 mono-font text-center">{processedFeatures[0]?.finalArea.toFixed(2)}</td>
                  <td className="px-3 py-1 text-[10px] font-black text-orange-600 mono-font text-center">{finalStats.time}</td>
                  <td className="px-3 py-1 text-[10px] font-black text-emerald-600 mono-font text-center">{finalStats.photoCount}</td>
                </tr>
              </tbody>
            </table>
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
          
          {processedFeatures.map((f, i) => {
            if (f.type === 'Polygon') {
              return (
                <React.Fragment key={i}>
                  {/* Original Polygon (Transparent) */}
                  <Polygon 
                    positions={f.originalCoords.map(c => [c.lat, c.lng] as [number, number])} 
                    color="red"
                    fillOpacity={0.1}
                    weight={1}
                    dashArray="5, 5"
                  />
                  
                  {/* Expanded, Grid or Rectangle Polygon */}
                  {(f.expandedCoords || f.gridCoords || f.rectangleCoords) && (
                    <Polygon 
                      positions={(f.rectangleCoords || f.gridCoords || f.expandedCoords || []).map(c => [c.lat, c.lng] as [number, number])} 
                      color="#4f46e5"
                      fillOpacity={0.2}
                      weight={2}
                    >
                      <Popup>
                        <div className="font-bold">Planlanan Alan</div>
                        <div className="text-xs">Genişletilmiş Uçuş Bölgesi</div>
                      </Popup>
                    </Polygon>
                  )}
                  
                  {/* Flight Lines */}
                  {f.flightLines.map((line, li) => (
                    <Polyline 
                      key={`line-${li}`} 
                      positions={line.map(c => [c.lat, c.lng] as [number, number])} 
                      color="#10b981"
                      weight={2}
                      opacity={0.8}
                    />
                  ))}
                </React.Fragment>
              );
            }
            return null;
          })}
        </MapContainer>
      </div>

      <GlobalFooter />
    </div>
  );
};

export default KMLMapView;
