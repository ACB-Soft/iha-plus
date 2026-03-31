import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Popup, Polyline, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { KMLData, KMLFeature } from './KMLUtils';
import GlobalFooter from './GlobalFooter';
import Header from './Header';
import { SCALE_TARGET_GSD, FlightConfig, Camera, CAMERAS } from '../src/types/flight';
import { getBoundingBox, expandPolygon, expandLineToPolygon, splitLineByDistance, getGridPolygon, getSteppedGridPolygon, calculatePolygonArea } from './GeometryUtils';

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
  const mapProvider = localStorage.getItem('default_map_provider') || 'Google Satellite';
  
  // Initial calculation based on config
  const initialAltitude = config.height;
  const initialGsd = (initialAltitude * config.camera.sensorWidth) / (config.camera.focalLength * config.camera.imageWidth) * 100;
  
  const [altitude, setAltitude] = useState(Math.round(initialAltitude));
  const [gsd, setGsd] = useState(Number(initialGsd.toFixed(2)));
  const [currentCamera, setCurrentCamera] = useState<Camera>(config.camera);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [exportName, setExportName] = useState(`TAHDIT_${projectName.replace(/\.(kml|kmz)$/i, '')}`);
  
  const boundaryArea = useMemo(() => {
    const polygonFeature = features.find(f => f.type === 'Polygon');
    if (!polygonFeature) return 0;
    return calculatePolygonArea(polygonFeature.coordinates.map(c => ({ lat: c.lat, lng: c.lng })));
  }, [features]);

  // Recalculate GSD when altitude changes
  const handleAltitudeChange = (newAlt: number) => {
    setAltitude(newAlt);
    const newGsd = (newAlt * currentCamera.sensorWidth) / (currentCamera.focalLength * currentCamera.imageWidth) * 100;
    setGsd(Number(newGsd.toFixed(2)));
  };

  // Recalculate altitude when GSD changes
  const handleGsdChange = (newGsd: number) => {
    setGsd(newGsd);
    const newAlt = (newGsd * currentCamera.focalLength * currentCamera.imageWidth) / (currentCamera.sensorWidth * 100);
    setAltitude(Math.round(newAlt));
  };

  const handleCameraChange = (newCam: Camera) => {
    setCurrentCamera(newCam);
    // Recalculate GSD based on current altitude and new camera
    const newGsd = (altitude * newCam.sensorWidth) / (newCam.focalLength * newCam.imageWidth) * 100;
    setGsd(Number(newGsd.toFixed(2)));
  };

  // Calculate all geometry and flight lines once
  const processedFeatures = useMemo(() => features.flatMap(f => {
    const originalCoords = f.coordinates.map(c => ({ lat: c.lat, lng: c.lng }));

    if (f.type === 'LineString' && config.flightType === 'Strip') {
      const buffer = config.stripBuffer || 50;
      
      // Split the line into segments with 20m overlap ONLY if stripSplitDistance is defined
      const segments = config.stripSplitDistance 
        ? splitLineByDistance(originalCoords, config.stripSplitDistance, 20)
        : [originalCoords];
      
      return segments.map((segCoords, idx) => {
        const expandedCoords = expandLineToPolygon(segCoords, buffer);
        const initialArea = calculatePolygonArea(expandedCoords);
        
        return {
          ...f,
          name: `${f.name} (Parça ${idx + 1})`,
          originalCoords: segCoords,
          expandedCoords,
          gridCoords: null,
          rectangleCoords: null,
          initialArea,
          finalArea: initialArea
        };
      });
    }

    if (f.type !== 'Polygon') return [{ ...f, originalCoords: [], expandedCoords: null, gridCoords: null, rectangleCoords: null, initialArea: 0, finalArea: 0 }];
    
    const initialArea = calculatePolygonArea(originalCoords);
    
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
      
    return [{
      ...f,
      originalCoords,
      expandedCoords,
      gridCoords,
      rectangleCoords,
      initialArea,
      finalArea
    }];
  }), [features, config, altitude]);

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
    if (processedFeatures.length === 0) return;

    const generateKML = (name: string, features: any[]) => {
      return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    ${features.map((feature, idx) => {
      const coords = feature.rectangleCoords || feature.gridCoords || feature.expandedCoords || feature.originalCoords;
      if (!coords || coords.length === 0) return '';
      
      return `
    <Placemark>
      <name>${feature.name || name}</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${coords.map(c => `${c.lng},${c.lat},0`).join(' ')}
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;
    }).join('')}
  </Document>
</kml>`;
    };

    const downloadFile = (kmlContent: string, fileName: string) => {
      const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.kml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    // If it's a split Strip flight, download only individual segments as separate files
    if (config.flightType === 'Strip' && processedFeatures.length > 1) {
      processedFeatures.forEach((feature, idx) => {
        // Use a small delay for each subsequent download to avoid browser blocking
        setTimeout(() => {
          const partName = `${exportName}${idx + 1}`;
          const partKml = generateKML(partName, [feature]);
          downloadFile(partKml, partName);
        }, idx * 300); // 300ms delay between files
      });
    } else {
      // Normal behavior: Download Full KML (one file containing all features)
      const fullKml = generateKML(exportName, processedFeatures);
      downloadFile(fullKml, exportName);
    }

    setShowExportModal(false);
  };

  return (
    <div className="w-full flex flex-col bg-slate-200 h-full animate-in overflow-hidden">
      <Header title="Uçuş Planı Ekranı" onBack={onBack} />

      <div className="flex-1 relative z-10">
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
            if (f.type === 'Polygon' || (f.type === 'LineString' && config.flightType === 'Strip')) {
              return (
                <React.Fragment key={i}>
                  {/* Original Shape (Transparent) */}
                  {f.type === 'Polygon' ? (
                    <Polygon 
                      positions={f.originalCoords.map(c => [c.lat, c.lng] as [number, number])} 
                      color="red"
                      fillOpacity={0.1}
                      weight={3}
                    />
                  ) : (
                    <Polyline
                      positions={f.originalCoords.map(c => [c.lat, c.lng] as [number, number])}
                      color="red"
                      weight={3}
                    />
                  )}
                  
                  {/* Expanded, Grid or Rectangle Polygon */}
                  {(f.expandedCoords || f.gridCoords || f.rectangleCoords) && (
                    <Polygon 
                      positions={(f.rectangleCoords || f.gridCoords || f.expandedCoords || []).map(c => [c.lat, c.lng] as [number, number])} 
                      color="#4f46e5"
                      fillOpacity={0.2}
                      weight={2}
                      dashArray="10, 10"
                    >
                      <Popup>
                        <div className="font-bold">Planlanan Alan</div>
                        <div className="text-xs">
                          {f.type === 'LineString' ? 'Şeritvari Tampon Bölge' : 'Genişletilmiş Uçuş Bölgesi'}
                        </div>
                      </Popup>
                    </Polygon>
                  )}
                </React.Fragment>
              );
            }
            return null;
          })}
        </MapContainer>
      </div>

      {/* Uçuş Bilgi Alanı */}
      <div className="bg-slate-200 px-6 py-2 border-t border-slate-300 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-start w-1/4">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Tahdit Alanı</span>
            <span className="text-[11px] font-black text-slate-900">{boundaryArea.toFixed(2)} ha</span>
          </div>

          <div className="flex flex-col items-start w-1/4">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">GSD (cm/px)</span>
            <div className="flex items-center gap-1.5">
               <button onClick={() => handleGsdChange(Number((gsd - 0.01).toFixed(2)))} className="w-5 h-5 bg-white rounded-lg shadow-sm flex items-center justify-center text-slate-600 active:bg-blue-50"><i className="fas fa-minus text-[7px]"></i></button>
               <span className="text-[11px] font-black text-blue-600 w-10 text-center">{gsd.toFixed(2)}</span>
               <button onClick={() => handleGsdChange(Number((gsd + 0.01).toFixed(2)))} className="w-5 h-5 bg-white rounded-lg shadow-sm flex items-center justify-center text-slate-600 active:bg-blue-50"><i className="fas fa-plus text-[7px]"></i></button>
            </div>
          </div>

          <button 
            onClick={() => setShowCameraModal(true)}
            className="flex flex-col items-center w-1/4 group"
          >
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1 group-active:text-blue-500 transition-colors">Kamera</span>
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-black text-slate-900 truncate max-w-[100px]">{currentCamera.name}</span>
              <i className="fas fa-chevron-down text-[7px] text-slate-400"></i>
            </div>
          </button>

          <div className="flex flex-col items-end w-1/4">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Yükseklik (m)</span>
            <div className="flex items-center gap-1.5">
               <button onClick={() => handleAltitudeChange(altitude - 5)} className="w-5 h-5 bg-white rounded-lg shadow-sm flex items-center justify-center text-slate-600 active:bg-emerald-50"><i className="fas fa-minus text-[7px]"></i></button>
               <span className="text-[11px] font-black text-emerald-600 w-8 text-center">{altitude}</span>
               <button onClick={() => handleAltitudeChange(altitude + 5)} className="w-5 h-5 bg-white rounded-lg shadow-sm flex items-center justify-center text-slate-600 active:bg-emerald-50"><i className="fas fa-plus text-[7px]"></i></button>
            </div>
          </div>
        </div>
        
        <button 
          onClick={() => setShowExportModal(true)}
          className="w-full py-2.5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <i className="fas fa-file-export"></i>
          DIŞARI AKTAR
        </button>
      </div>

      <GlobalFooter />

      {/* Camera Selection Modal */}
      {showCameraModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowCameraModal(false)}></div>
          <div className="bg-slate-100 w-full max-w-md h-[70vh] rounded-[32px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
            <div className="p-6 shrink-0 flex items-center justify-between border-b border-slate-200">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">Kamera Seçimi</h3>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Fotogrametrik Sensörler</p>
              </div>
              <button onClick={() => setShowCameraModal(false)} className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-500">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {CAMERAS.map(cam => (
                <button
                  key={cam.name}
                  onClick={() => {
                    handleCameraChange(cam);
                    setShowCameraModal(false);
                  }}
                  className={`w-full p-4 rounded-2xl text-left transition-all border ${
                    currentCamera.name === cam.name 
                    ? 'bg-blue-50 border-blue-200' 
                    : 'bg-white border-slate-100 hover:border-blue-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className={`font-black text-sm ${currentCamera.name === cam.name ? 'text-blue-600' : 'text-slate-900'}`}>{cam.name}</p>
                    {currentCamera.name === cam.name && <i className="fas fa-check-circle text-blue-500"></i>}
                  </div>
                  <div className="flex gap-3 mt-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">SW: {cam.sensorWidth}mm</span>
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">FL: {cam.focalLength}mm</span>
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">RES: {cam.imageWidth}px</span>
                  </div>
                </button>
              ))}
            </div>
            
            <div className="p-4 bg-slate-50 shrink-0">
              <button 
                onClick={() => setShowCameraModal(false)}
                className="w-full py-3.5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px]"
              >
                KAPAT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowExportModal(false)}></div>
          <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl relative overflow-hidden p-8 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">Dışarı Aktar</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 mb-6">Tahdit Dosya Adı Belirleyin</p>
            
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
                  className="flex-1 py-4 bg-slate-200 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px]"
                >
                  İPTAL
                </button>
                <button 
                  onClick={() => {
                    handleExport();
                    setShowExportModal(false);
                  }}
                  className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-blue-100"
                >
                  ONAYLA
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KMLMapView;
