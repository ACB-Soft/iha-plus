import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Popup, Polygon, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as turf from '@turf/turf';
import { KMLFeature } from './KMLUtils';
import GlobalFooter from './GlobalFooter';
import Header from './Header';
import { FlightConfig } from '../src/types/flight';
import { calculatePolygonArea, expandLineToPolygon, splitLineByDistance, Point } from './GeometryUtils';
import { generateFlightPlanPDF } from '../src/utils/pdfExport';

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

const getCleanBaseName = (pName: string) => {
  return pName
    .replace(/\.(kml|kmz)$/i, '')
    .replace(/^(YKN_|UCUS_|TAHDIT_|Normal_|Strip_|YKN_Normal_|YKN_Strip_|Plan_)/gi, '')
    .trim();
};

const GCPStripPlanDisplay: React.FC<Props> = ({ projectName, features, config, onBack }) => {
  const mapProvider = localStorage.getItem('default_map_provider') || 'Google Satellite';
  const [points, setPoints] = useState<YKNPoint[]>([]);
  const [spineSegments, setSpineSegments] = useState<[number, number][][]>([]);
  const [spineMarkers, setSpineMarkers] = useState<YKNPoint[]>([]);
  const [isAddingPoint, setIsAddingPoint] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
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

  const boundaryArea = useMemo(() => {
    let totalArea = 0;
    features.forEach(f => {
      if (f.type === 'Polygon') {
        totalArea += calculatePolygonArea(f.coordinates.map(c => ({ lat: c.lat, lng: c.lng })));
      } else if (f.type === 'LineString') {
        const stripBuf = config.stripBuffer || 50;
        const expanded = expandLineToPolygon(f.coordinates.map(c => ({ lat: c.lat, lng: c.lng })), stripBuf);
        totalArea += calculatePolygonArea(expanded);
      }
    });
    return totalArea;
  }, [features, config]);

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
        flightType: 'Strip',
        camera: config.camera,
        altitude: config.altitude || 200,
        gsd: config.gsd || 2.5,
        areaSizeM2: boundaryArea * 10000,
        stripLengthMeters: totalStripLength,
        stripBufferMeters: config.stripBuffer || 50,
        isStripSplitEnabled: typeof config.stripSplitDistance === 'number' && config.stripSplitDistance > 0,
        stripSplitDistance: config.stripSplitDistance,
        gcpEnabled: true,
        gcpPoints: points,
        gcpDistance: config.gcpDistance || 400,
        gcpStartOffset: config.gcpStartOffset || 10,
        gcpStartNumber: config.gcpStartNumber || 1,
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

  // Initial Point Generation
  useEffect(() => {
    const generatePoints = (dist: number): { ykns: YKNPoint[], spineSegs: [number, number][][], spineMarkers: YKNPoint[] } => {
      const lineFeatures = features.filter(f => f.type === 'LineString');
      const polygonFeature = features.find(f => f.type === 'Polygon');

      const allLineCoords: [number, number][] = [];

      if (lineFeatures.length > 0) {
        lineFeatures.forEach(lf => {
          lf.coordinates.forEach(c => {
            allLineCoords.push([c.lng, c.lat]);
          });
        });
      } else if (polygonFeature) {
        polygonFeature.coordinates.forEach(c => {
          allLineCoords.push([c.lng, c.lat]);
        });
      }

      if (allLineCoords.length < 2) return { ykns: [], spineSegs: [], spineMarkers: [] };

      // Optional sub-area polygon filter
      let subAreaPoly: any = null;
      if (config.subAreaKmlData && config.subAreaKmlData.features) {
        const subPolyFeature = config.subAreaKmlData.features.find(f => f.type === 'Polygon');
        if (subPolyFeature) {
          const subCoords = subPolyFeature.coordinates.map(c => [c.lng, c.lat]);
          if (subCoords.length > 0 && (subCoords[0][0] !== subCoords[subCoords.length - 1][0] || subCoords[0][1] !== subCoords[subCoords.length - 1][1])) {
            subCoords.push(subCoords[0]);
          }
          subAreaPoly = turf.polygon([subCoords]);
        }
      }

      const linePoints: Point[] = allLineCoords.map(c => ({ lng: c[0], lat: c[1] }));
      const isSplit = typeof config.stripSplitDistance === 'number' && config.stripSplitDistance > 0;
      const rawSegments: Point[][] = isSplit
        ? splitLineByDistance(linePoints, config.stripSplitDistance!, 20)
        : [linePoints];

      const stripBuffer = config.stripBuffer || 50;
      const startOffset = config.gcpStartOffset || 10;
      const offsetDist = Math.max(5, stripBuffer - startOffset);

      const resultYKNS: YKNPoint[] = [];
      const allSpineSegmentsLeaflet: [number, number][][] = [];
      const spineMarkersList: YKNPoint[] = [];

      let yknCounter = config.gcpStartNumber || 1;

      rawSegments.forEach((seg, segIdx) => {
        const segCoords = seg.map(p => [p.lng, p.lat] as [number, number]);
        if (segCoords.length < 2) return;

        const spineLine = turf.lineString(segCoords);
        const lineLength = turf.length(spineLine, { units: 'meters' });
        if (lineLength <= 0) return;

        // 1. Densify spine points for display
        const smoothedSpine: [number, number][] = [];
        const sampleStep = 5;
        for (let d = 0; d < lineLength; d += sampleStep) {
          const pt = turf.along(spineLine, d, { units: 'meters' }).geometry.coordinates as [number, number];
          smoothedSpine.push(pt);
        }
        const endPt = turf.along(spineLine, lineLength, { units: 'meters' }).geometry.coordinates as [number, number];
        smoothedSpine.push(endPt);

        allSpineSegmentsLeaflet.push(smoothedSpine.map(p => [p[1], p[0]] as [number, number]));

        // Helper function to add YKN
        const addYknPoint = (lng: number, lat: number) => {
          let isInsideSubArea = true;
          if (subAreaPoly) {
            isInsideSubArea = turf.booleanPointInPolygon(turf.point([lng, lat]), subAreaPoly);
          }
          if (isInsideSubArea) {
            resultYKNS.push({
              id: `ykn-${resultYKNS.length}`,
              name: `YKN${yknCounter++}`,
              lng,
              lat
            });
          }
        };

        // 2. YKN generation for this segment
        const userStartOffset = config.gcpStartOffset || 10;
        const startDist = Math.min(userStartOffset, lineLength / 2);
        const endDist = Math.max(startDist, lineLength - startDist);

        // 1) Start YKN on segment centerline (10m from segment start)
        const startPt = turf.along(spineLine, startDist, { units: 'meters' });
        const [startLng, startLat] = startPt.geometry.coordinates;
        addYknPoint(startLng, startLat);

        // 2) Intermediate YKNs (Alternating perpendicular offsets)
        let sideToggle = (segIdx % 2 === 0) ? 1 : -1;
        let currentD = startDist + dist;

        while (currentD < endDist - (dist * 0.25)) {
          const currPt = turf.along(spineLine, currentD, { units: 'meters' });

          const pPrev = turf.along(spineLine, Math.max(0, currentD - 2), { units: 'meters' });
          const pNext = turf.along(spineLine, Math.min(lineLength, currentD + 2), { units: 'meters' });
          const tangentBearing = turf.bearing(pPrev, pNext);

          const perpendicularBearing = tangentBearing + (sideToggle * 90);

          const dest = turf.destination(currPt, offsetDist, perpendicularBearing, { units: 'meters' });
          const [yknLng, yknLat] = dest.geometry.coordinates;

          addYknPoint(yknLng, yknLat);

          sideToggle *= -1;
          currentD += dist;
        }

        // 3) End YKN on segment centerline (10m from segment end)
        if (endDist > startDist + 5) {
          const endPt = turf.along(spineLine, endDist, { units: 'meters' });
          const [endLng, endLat] = endPt.geometry.coordinates;
          addYknPoint(endLng, endLat);
        }

        // 3. Spine markers for this segment
        let markerDist = 0;
        while (markerDist <= lineLength) {
          const pt = turf.along(spineLine, markerDist, { units: 'meters' });
          const [mLng, mLat] = pt.geometry.coordinates;
          spineMarkersList.push({
            id: `sm-${segIdx}-${spineMarkersList.length}`,
            name: rawSegments.length > 1 ? `P${segIdx + 1}: ${Math.round(markerDist)}m` : `${Math.round(markerDist)}m`,
            lng: mLng,
            lat: mLat
          });
          markerDist += dist;
        }
      });

      return { ykns: resultYKNS, spineSegs: allSpineSegmentsLeaflet, spineMarkers: spineMarkersList };
    };

    const { ykns, spineSegs, spineMarkers: sm } = generatePoints(config.gcpDistance || 400);
    setPoints(ykns);
    setSpineMarkers(sm);
    setSpineSegments(spineSegs);
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

  const handleExport = (type: 'flight_plan' | 'ykn_plan' = exportType) => {
    const polygonFeature = features.find(f => f.type === 'Polygon');
    const lineFeature = features.find(f => f.type === 'LineString');

    let ucusPlaniKml = '';
    let tahditKml = '';

    if (type === 'ykn_plan' && polygonFeature) {
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
              ${polygonFeature.coordinates.map(c => `${c.lng},${c.lat},0`).join(' ')}
              ${polygonFeature.coordinates[0].lng},${polygonFeature.coordinates[0].lat},0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;
    }

    if (lineFeature) {
      const linePts = lineFeature.coordinates.map(c => ({ lat: c.lat, lng: c.lng }));
      const isSplit = typeof config.stripSplitDistance === 'number' && config.stripSplitDistance > 0;
      const splitSegs = isSplit ? splitLineByDistance(linePts, config.stripSplitDistance!, 20) : [linePts];

      if (type === 'ykn_plan') {
        tahditKml += `
    <Placemark>
      <name>2-TAHDIT</name>
      <Style>
        <LineStyle><color>ff0000ff</color><width>3</width></LineStyle>
      </Style>
      <LineString>
        <coordinates>
          ${lineFeature.coordinates.map(c => `${c.lng},${c.lat},0`).join(' ')}
        </coordinates>
      </LineString>
    </Placemark>`;
      }

      ucusPlaniKml += splitSegs.map((seg, sIdx) => {
        const expanded = expandLineToPolygon(seg, config.stripBuffer || 50);
        return `
    <Placemark>
      <name>1-UCUS_PLANI${splitSegs.length > 1 ? ` (Bölüm ${sIdx + 1})` : ''}</name>
      <Style>
        <LineStyle><color>ff7fffff</color><width>3</width></LineStyle>
        <PolyStyle><color>807fffff</color><fill>1</fill></PolyStyle>
      </Style>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${expanded.map(c => `${c.lng},${c.lat},0`).join(' ')}
              ${expanded[0].lng},${expanded[0].lat},0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;
      }).join('');
    }

    if (config.subAreaKmlData) {
      const subAreaFeature = config.subAreaKmlData.features.find(f => f.type === 'Polygon');
      if (subAreaFeature) {
        ucusPlaniKml += `
    <Placemark>
      <name>1-UCUS_PLANI (Alt Alan)</name>
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

    let yknKml = '';
    if (type === 'ykn_plan') {
      yknKml = points.map(p => `
    <Placemark>
      <name>${p.name}</name>
      <Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>
    </Placemark>`).join('');
    }

    const downloadFileName = exportName;

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${downloadFileName}</name>
    ${ucusPlaniKml}
    ${tahditKml}
    ${yknKml}
  </Document>
</kml>`;

    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${downloadFileName}.kml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportModal(false);
  };

  return (
    <div className="w-full flex flex-col bg-slate-200 h-full animate-in overflow-hidden">
      <Header title="Şeritvari Uçuş Planı" onBack={onBack} />

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
              return (
                <Polygon 
                  key={i} 
                  positions={f.coordinates.map(c => [c.lat, c.lng] as [number, number])} 
                  color="red" 
                  fillOpacity={0} 
                  weight={3} 
                />
              );
            } else if (f.type === 'LineString') {
              const linePts = f.coordinates.map(c => ({ lat: c.lat, lng: c.lng }));
              const isSplit = typeof config.stripSplitDistance === 'number' && config.stripSplitDistance > 0;
              const splitSegs = isSplit ? splitLineByDistance(linePts, config.stripSplitDistance!, 20) : [linePts];

              return (
                <React.Fragment key={i}>
                  <Polyline positions={f.coordinates.map(c => [c.lat, c.lng] as [number, number])} color="red" weight={3} />
                  {splitSegs.map((seg, sIdx) => {
                    const expanded = expandLineToPolygon(seg, config.stripBuffer || 50);
                    return (
                      <Polygon 
                        key={sIdx} 
                        positions={expanded.map(c => [c.lat, c.lng] as [number, number])} 
                        color="#ffff7f" 
                        fillColor="#ffff7f" 
                        fillOpacity={0.5} 
                        weight={3} 
                      />
                    );
                  })}
                </React.Fragment>
              );
            }
            return null;
          })}

          {config.subAreaKmlData?.features.map((f, i) => {
            if (f.type === 'Polygon') {
              return <Polygon key={`sub-${i}`} positions={f.coordinates.map(c => [c.lat, c.lng] as [number, number])} color="#d946ef" fillOpacity={0.1} weight={2} dashArray="5, 5" />;
            }
            return null;
          })}
          
          {spineSegments.map((seg, i) => (
            <Polyline key={`spine-seg-${i}`} positions={seg} color={i % 2 === 0 ? "#ef4444" : "#f59e0b"} weight={3} opacity={1} />
          ))}

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
        <div className="flex gap-2 w-full">
          <button 
            onClick={() => handleOpenExportModal('flight_plan')} 
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase tracking-[0.1em] text-[10px] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <i className="fas fa-plane-departure"></i>UÇUŞ PLANI
          </button>
          <button 
            onClick={() => handleOpenExportModal('ykn_plan')} 
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase tracking-[0.1em] text-[10px] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <i className="fas fa-map-marked-alt"></i>YKN PLANI
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

      {showExportModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowExportModal(false)}></div>
          <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl relative overflow-hidden p-6 animate-in zoom-in-95 duration-200">
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dışa Aktar</p>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl">
                  <button 
                    onClick={() => setExportType('flight_plan')} 
                    className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${exportType === 'flight_plan' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-600'}`}
                  >
                    Uçuş Planı
                  </button>
                  <button 
                    onClick={() => setExportType('ykn_plan')} 
                    className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${exportType === 'ykn_plan' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600'}`}
                  >
                    YKN Planı
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

export default GCPStripPlanDisplay;
