import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Popup, Polyline, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { KMLData, KMLFeature } from './KMLUtils';
import GlobalFooter from './GlobalFooter';
import Header from './Header';
import { SCALE_TARGET_GSD, FlightConfig, Camera, CAMERAS } from '../src/types/flight';
import { getBoundingBox, expandPolygon, expandLineToPolygon, splitLineByDistance, getGridPolygon, getSteppedGridPolygon, calculatePolygonArea, getMinBoundingBoxPolygon, calculateOptimumFlightAngle, generateFlightRoute, generateStripFlightRoute, calculateLineBearing, calculateDJIPilot2Stats, formatDurationText } from './GeometryUtils';
import { generateFlightPlanPDF } from '../src/utils/pdfExport';
import * as turf from '@turf/turf';

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

const getCleanBaseName = (pName: string) => {
  return pName
    .replace(/\.(kml|kmz)$/i, '')
    .replace(/^(YKN_|UCUS_|TAHDIT_|Normal_|Strip_|YKN_Normal_|YKN_Strip_|Plan_)/gi, '')
    .trim();
};

const KMLMapView: React.FC<Props> = ({ projectName, features, config, onBack }) => {
  const mapProvider = localStorage.getItem('default_map_provider') || 'Google Satellite';
  
  // Initial calculation based on config
  const initialAltitude = config.height || 200;
  const initialGsd = (initialAltitude && config.camera.focalLength && config.camera.imageWidth) 
    ? (initialAltitude * config.camera.sensorWidth) / (config.camera.focalLength * config.camera.imageWidth) * 100 
    : (config.gsd || 0);
  
  const [altitude, setAltitude] = useState(Math.round(initialAltitude));
  const [gsd, setGsd] = useState(Number(initialGsd.toFixed(2)));
  const [currentCamera, setCurrentCamera] = useState<Camera>(config.camera);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [customCamName, setCustomCamName] = useState(config.camera.isCustom ? config.camera.name : 'Özel Drone Model');
  const [customSW, setCustomSW] = useState(config.camera.sensorWidth || 13.2);
  const [customFL, setCustomFL] = useState(config.camera.focalLength || 8.8);
  const [customRes, setCustomRes] = useState(config.camera.imageWidth || 5472);
  const [exportType, setExportType] = useState<'flight_plan' | 'ykn_plan' | 'pdf_summary'>('ykn_plan');
  const [exportName, setExportName] = useState(`YKN_${getCleanBaseName(projectName)}`);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleOpenExportModal = (type: 'flight_plan' | 'ykn_plan' | 'pdf_summary') => {
    const baseName = getCleanBaseName(projectName);
    setExportType(type);
    if (type === 'flight_plan') {
      setExportName(`UCUS_${baseName}`);
    } else if (type === 'pdf_summary') {
      setExportName(`RAPOR_${baseName}`);
    } else {
      setExportName(`YKN_${baseName}`);
    }
    setShowExportModal(true);
  };
  
  // Recalculate GSD when altitude changes
  const handleAltitudeChange = (newAlt: number) => {
    setAltitude(newAlt);
    if (currentCamera.focalLength > 0 && currentCamera.imageWidth > 0) {
      const newGsd = (newAlt * currentCamera.sensorWidth) / (currentCamera.focalLength * currentCamera.imageWidth) * 100;
      setGsd(Number(newGsd.toFixed(2)));
    }
  };

  // Recalculate altitude when GSD changes
  const handleGsdChange = (newGsd: number) => {
    setGsd(newGsd);
    if (currentCamera.sensorWidth > 0) {
      const newAlt = (newGsd * currentCamera.focalLength * currentCamera.imageWidth) / (currentCamera.sensorWidth * 100);
      setAltitude(Math.round(newAlt));
    }
  };

  const handleCameraChange = (newCam: Camera) => {
    setCurrentCamera(newCam);
    if (newCam.focalLength > 0 && newCam.imageWidth > 0 && altitude > 0) {
      const newGsd = (altitude * newCam.sensorWidth) / (newCam.focalLength * newCam.imageWidth) * 100;
      setGsd(Number(newGsd.toFixed(2)));
    }
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

    const baseForRect = gridCoords || expandedCoords || originalCoords;

    let rectangleCoords: any = null;
    if (config.expandToMinRectangle) {
      rectangleCoords = getMinBoundingBoxPolygon(baseForRect);
    } else if (config.expandToRectangle) {
      rectangleCoords = getGridPolygon(baseForRect, 1);
    }
      
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

  const boundaryArea = useMemo(() => {
    // Sum up the final areas of all processed features (expanded polygons, strip buffers, etc.)
    return processedFeatures.reduce((sum, f) => sum + (f.finalArea || 0), 0);
  }, [processedFeatures]);

  const allPoints = useMemo(() => {
    const pts: { lat: number; lng: number }[] = [];
    processedFeatures.forEach(f => {
      const coords = f.rectangleCoords || f.gridCoords || f.expandedCoords || f.originalCoords;
      if (coords) {
        coords.forEach((c: any) => pts.push({ lat: c.lat, lng: c.lng }));
      }
    });
    return pts;
  }, [processedFeatures]);

  const optResult = useMemo(() => {
    return calculateOptimumFlightAngle(
      allPoints,
      config.overlapSide || 70,
      currentCamera.sensorWidth || 13.2,
      currentCamera.focalLength || 8.8,
      altitude || 120
    );
  }, [allPoints, config, currentCamera, altitude]);

  const flightRoutes = useMemo(() => {
    return processedFeatures.map(f => {
      if (f.type === 'LineString' || config.flightType === 'Strip') {
        return generateStripFlightRoute(
          f.originalCoords,
          config.stripBuffer || 50,
          config.overlapSide || 70,
          config.overlapFront || 80,
          currentCamera.sensorWidth || 13.2,
          currentCamera.focalLength || 8.8,
          altitude || 120
        );
      }
      const polyCoords = f.rectangleCoords || f.gridCoords || f.expandedCoords || f.originalCoords;
      if (!polyCoords || polyCoords.length < 3) return [];
      return generateFlightRoute(
        polyCoords,
        optResult.angle,
        config.overlapSide || 70,
        config.overlapFront || 80,
        currentCamera.sensorWidth || 13.2,
        currentCamera.focalLength || 8.8,
        altitude || 120
      );
    });
  }, [processedFeatures, optResult.angle, config, currentCamera, altitude]);

  const displayOptResult = useMemo(() => {
    if (config.flightType === 'Strip') {
      const combinedRoute = flightRoutes.flat();
      const firstLineFeature = processedFeatures.find(f => f.type === 'LineString');
      const firstCoords = firstLineFeature ? firstLineFeature.originalCoords : [];
      const angle = calculateLineBearing(firstCoords);
      const stats = calculateDJIPilot2Stats(
        combinedRoute,
        altitude || 120,
        currentCamera.sensorWidth || 13.2,
        currentCamera.focalLength || 8.8,
        currentCamera.imageWidth || 8192,
        config.overlapFront || 80,
        10
      );
      return {
        angle,
        durationMinutes: stats.durationMinutes,
        durationText: stats.durationText
      };
    }
    return optResult;
  }, [config.flightType, flightRoutes, processedFeatures, optResult, altitude, currentCamera, config.overlapFront]);

  const totalStripLength = useMemo(() => {
    let totalMeters = 0;
    features.forEach(f => {
      if (f.type === 'LineString' && f.coordinates.length > 1) {
        const line = turf.lineString(f.coordinates.map(c => [c.lng, c.lat]));
        totalMeters += turf.length(line, { units: 'meters' });
      }
    });
    return Math.round(totalMeters);
  }, [features]);

  const handleExportPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const mapEl = document.querySelector('.leaflet-container') as HTMLElement | null;
      await generateFlightPlanPDF({
        projectName: exportName || projectName,
        flightType: config.flightType === 'Strip' ? 'Strip' : 'Normal',
        camera: currentCamera,
        altitude: altitude,
        gsd: gsd,
        areaSizeM2: boundaryArea * 10000,
        stripLengthMeters: totalStripLength,
        stripBufferMeters: config.stripBuffer || 50,
        isStripSplitEnabled: typeof config.stripSplitDistance === 'number' && config.stripSplitDistance > 0,
        stripSplitDistance: config.stripSplitDistance,
        bufferMeters: config.buffer || 0,
        expandToGridMeters: config.expandToGrid,
        expandToRectangle: config.expandToRectangle,
        expandToMinRectangle: config.expandToMinRectangle,
        flightAngle: displayOptResult.angle,
        estimatedDurationMinutes: displayOptResult.durationMinutes,
        gcpEnabled: false,
        mapElement: mapEl
      }, exportName || `RAPOR_${getCleanBaseName(projectName)}`);
    } catch (err) {
      console.error('PDF Export Error:', err);
      alert('PDF raporu oluşturulurken bir hata oluştu.');
    } finally {
      setIsGeneratingPdf(false);
      setShowExportModal(false);
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

  const handleExport = (type: 'flight_plan' | 'ykn_plan' = exportType) => {
    if (processedFeatures.length === 0) return;

    const generateKML = (name: string, featuresList: any[]) => {
      let ucusPlaniKml = '';
      let tahditKml = '';

      featuresList.forEach((feature) => {
        const coords = feature.rectangleCoords || feature.gridCoords || feature.expandedCoords || feature.originalCoords;
        if (coords && coords.length > 0) {
          ucusPlaniKml += `
    <Placemark>
      <name>1-UCUS_PLANI</name>
      <Style>
        <LineStyle><color>ff7fffff</color><width>3</width></LineStyle>
        <PolyStyle><color>807fffff</color><fill>1</fill></PolyStyle>
      </Style>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${coords.map((c: any) => `${c.lng},${c.lat},0`).join(' ')}
              ${coords[0].lng},${coords[0].lat},0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;
        }

        if (type === 'ykn_plan' && feature.originalCoords && feature.originalCoords.length > 0) {
          if (feature.type === 'Polygon') {
            tahditKml += `
    <Placemark>
      <name>2-TAHDIT</name>
      <Style>
        <LineStyle><color>ff0000ff</color><width>3</width></LineStyle>
        <PolyStyle><fill>0</fill></PolyStyle>
      </Style>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${feature.originalCoords.map((c: any) => `${c.lng},${c.lat},0`).join(' ')}
              ${feature.originalCoords[0].lng},${feature.originalCoords[0].lat},0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;
          } else if (feature.type === 'LineString') {
            tahditKml += `
    <Placemark>
      <name>2-TAHDIT</name>
      <Style>
        <LineStyle><color>ff0000ff</color><width>3</width></LineStyle>
      </Style>
      <LineString>
        <coordinates>
          ${feature.originalCoords.map((c: any) => `${c.lng},${c.lat},0`).join(' ')}
        </coordinates>
      </LineString>
    </Placemark>`;
          }
        }
      });

      const downloadFileName = name;

      return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${downloadFileName}</name>
    ${ucusPlaniKml}
    ${tahditKml}
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
      const downloadFileName = exportName;
      downloadFile(fullKml, downloadFileName);
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
                  {/* Original Shape (Tahdit - Red) */}
                  {f.type === 'Polygon' ? (
                    <Polygon 
                      positions={f.originalCoords.map(c => [c.lat, c.lng] as [number, number])} 
                      color="red"
                      fillOpacity={0}
                      weight={3}
                    />
                  ) : (
                    <Polyline
                      positions={f.originalCoords.map(c => [c.lat, c.lng] as [number, number])}
                      color="red"
                      weight={3}
                    />
                  )}
                  
                  {/* Expanded, Grid or Rectangle Polygon (Yeni oluşturulan Uçuş Planı alanı - Sarı) */}
                  {(f.expandedCoords || f.gridCoords || f.rectangleCoords) && (
                    <Polygon 
                      positions={(f.rectangleCoords || f.gridCoords || f.expandedCoords || []).map(c => [c.lat, c.lng] as [number, number])} 
                      color="#ffff7f"
                      fillColor="#ffff7f"
                      fillOpacity={0.5}
                      weight={3}
                    >
                      <Popup>
                        <div className="font-bold">Planlanan Alan</div>
                        <div className="text-xs">
                          {f.type === 'LineString' ? 'Şeritvari Tampon Bölge' : 'Genişletilmiş Uçuş Bölgesi'}
                        </div>
                      </Popup>
                    </Polygon>
                  )}

                  {/* Flight Route lines (Tahmini Uçuş Rotası - Mavi) */}
                  {flightRoutes[i] && flightRoutes[i].length > 1 && (
                    <Polyline
                      positions={flightRoutes[i].map(c => [c.lat, c.lng] as [number, number])}
                      color="#0284c7"
                      weight={2.5}
                      opacity={0.9}
                    />
                  )}
                </React.Fragment>
              );
            }
            return null;
          })}
        </MapContainer>
      </div>

      {/* Uçuş Bilgi Alanı */}
      <div className="bg-slate-200 px-6 py-2.5 border-t border-slate-300 flex flex-col gap-2.5 shrink-0">
        <div className="grid grid-cols-4 gap-2 w-full py-1">
          <div className="flex flex-col items-start">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Uçuş Alanı</span>
            <span className="text-[11px] font-black text-slate-900">{boundaryArea.toFixed(2)} ha</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Toplam YKN</span>
            <span className="text-[11px] font-black text-blue-600">0</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Uçuş Açısı</span>
            <span className="text-[11px] font-black text-emerald-600">{displayOptResult.angle}°</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Uçuş Süresi</span>
            <span className="text-[11px] font-black text-purple-600">~{displayOptResult.durationText || formatDurationText(displayOptResult.durationMinutes)}</span>
          </div>
        </div>
        
        <div className="flex gap-2 w-full">
          <button 
            onClick={() => handleOpenExportModal('flight_plan')} 
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase tracking-[0.1em] text-[10px] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <i className="fas fa-plane-departure"></i>UÇUŞ PLANI
          </button>
          <button 
            onClick={() => handleOpenExportModal('pdf_summary')} 
            className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black uppercase tracking-[0.1em] text-[10px] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <i className="fas fa-file-pdf"></i>PDF ÖZETİ
          </button>
        </div>
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
              {CAMERAS.map(cam => {
                const isSelected = currentCamera.name === cam.name || (cam.isCustom && currentCamera.isCustom);
                return (
                  <div key={cam.name} className="space-y-2">
                    <button
                      onClick={() => {
                        if (cam.isCustom) {
                          const customCamObj: Camera = {
                            name: customCamName || 'Özel / Diğer Kamera Model',
                            sensorWidth: customSW,
                            focalLength: customFL,
                            imageWidth: customRes,
                            isCustom: true
                          };
                          handleCameraChange(customCamObj);
                        } else {
                          handleCameraChange(cam);
                          setShowCameraModal(false);
                        }
                      }}
                      className={`w-full p-4 rounded-2xl text-left transition-all border ${
                        isSelected
                        ? 'bg-blue-50 border-blue-200' 
                        : 'bg-white border-slate-100 hover:border-blue-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className={`font-black text-sm ${isSelected ? 'text-blue-600' : 'text-slate-900'}`}>{cam.name}</p>
                        {isSelected && <i className="fas fa-check-circle text-blue-500"></i>}
                      </div>
                      <div className="flex gap-3 mt-1">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">SW: {cam.isCustom ? customSW : cam.sensorWidth}mm</span>
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">FL: {cam.isCustom ? customFL : cam.focalLength}mm</span>
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">RES: {cam.isCustom ? customRes : cam.imageWidth}px</span>
                      </div>
                    </button>

                    {cam.isCustom && isSelected && (
                      <div className="p-3 bg-white border border-blue-200 rounded-2xl space-y-2 text-xs">
                        <div>
                          <label className="text-[8px] font-bold text-slate-400 uppercase">Kamera Adı</label>
                          <input 
                            type="text"
                            value={customCamName}
                            onChange={(e) => {
                              setCustomCamName(e.target.value);
                              handleCameraChange({ name: e.target.value || 'Özel Kamera', sensorWidth: customSW, focalLength: customFL, imageWidth: customRes, isCustom: true });
                            }}
                            className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <div>
                            <label className="text-[8px] font-bold text-slate-400 uppercase block truncate">SW (mm)</label>
                            <input 
                              type="number"
                              step="0.1"
                              value={customSW}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setCustomSW(val);
                                handleCameraChange({ name: customCamName, sensorWidth: val, focalLength: customFL, imageWidth: customRes, isCustom: true });
                              }}
                              className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="text-[8px] font-bold text-slate-400 uppercase block truncate">FL (mm)</label>
                            <input 
                              type="number"
                              step="0.1"
                              value={customFL}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setCustomFL(val);
                                handleCameraChange({ name: customCamName, sensorWidth: customSW, focalLength: val, imageWidth: customRes, isCustom: true });
                              }}
                              className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="text-[8px] font-bold text-slate-400 uppercase block truncate">RES (px)</label>
                            <input 
                              type="number"
                              value={customRes}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setCustomRes(val);
                                handleCameraChange({ name: customCamName, sensorWidth: customSW, focalLength: customFL, imageWidth: val, isCustom: true });
                              }}
                              className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
          <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl relative overflow-hidden p-6 animate-in zoom-in-95 duration-200">
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dışa Aktar</p>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-2xl">
                  <button 
                    onClick={() => setExportType('flight_plan')} 
                    className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${exportType === 'flight_plan' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-600'}`}
                  >
                    Uçuş Planı
                  </button>
                  <button 
                    onClick={() => setExportType('pdf_summary')} 
                    className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${exportType === 'pdf_summary' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-600'}`}
                  >
                    PDF Raporu
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Dosya Adı</label>
                <input 
                  type="text" 
                  value={exportName}
                  onChange={(e) => setExportName(e.target.value)}
                  className="w-full p-3.5 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-slate-900 focus:outline-none focus:border-blue-500 text-xs"
                  placeholder="Dosya adı giriniz..."
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setShowExportModal(false)} 
                  className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all hover:bg-slate-200"
                >
                  İPTAL
                </button>
                <button 
                  disabled={isGeneratingPdf}
                  onClick={() => exportType === 'pdf_summary' ? handleExportPdf() : handleExport(exportType)} 
                  className={`flex-1 py-3.5 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${
                    exportType === 'pdf_summary' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200' : exportType === 'flight_plan' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                  }`}
                >
                  {isGeneratingPdf ? (
                    <>
                      <i className="fas fa-spinner fa-spin text-xs"></i>
                      <span>RAPORLANIYOR...</span>
                    </>
                  ) : (
                    <span>İNDİR</span>
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

export default KMLMapView;
