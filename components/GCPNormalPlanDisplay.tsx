import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Popup, Polygon, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as turf from '@turf/turf';
import { KMLFeature } from './KMLUtils';
import GlobalFooter from './GlobalFooter';
import Header from './Header';
import { FlightConfig } from '../src/types/flight';
import { calculatePolygonArea, expandLineToPolygon, expandPolygon, getSteppedGridPolygon, getGridPolygon, getMinBoundingBoxPolygon, calculateOptimumFlightAngle, Point, formatDurationText } from './GeometryUtils';
import { generateFlightPlanPDF } from '../src/utils/pdfExport';

// Helper to compute boundary expansion
function getExpandedPolygonCoords(featureCoords: { lat: number, lng: number }[], config: FlightConfig) {
  const originalCoords = featureCoords.map(c => ({ lat: c.lat, lng: c.lng }));

  const expandedCoords = config.buffer && config.buffer > 0 
    ? expandPolygon(originalCoords, config.buffer) 
    : null;

  const gridCoords = config.expandToGrid && config.expandToGrid > 0 
    ? getSteppedGridPolygon(expandedCoords || originalCoords, config.expandToGrid) 
    : null;

  const baseForRect = gridCoords || expandedCoords || originalCoords;

  let rectangleCoords: { lat: number; lng: number }[] | null = null;
  if (config.expandToMinRectangle) {
    rectangleCoords = getMinBoundingBoxPolygon(baseForRect);
  } else if (config.expandToRectangle) {
    rectangleCoords = getGridPolygon(baseForRect, 1);
  }

  const finalCoords = rectangleCoords || gridCoords || expandedCoords || originalCoords;
  const isExpanded = !!(rectangleCoords || gridCoords || expandedCoords);

  return { originalCoords, finalCoords, isExpanded, baseForRect };
}

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

const FitBounds: React.FC<{ features: KMLFeature[], config: FlightConfig, subArea?: any }> = ({ features, config, subArea }) => {
  const map = useMap();
  
  useEffect(() => {
    if (features.length > 0) {
      const bounds = L.latLngBounds([]);
      features.forEach(f => {
        if (f.type === 'Polygon') {
          const { finalCoords } = getExpandedPolygonCoords(f.coordinates, config);
          finalCoords.forEach(c => {
            bounds.extend([c.lat, c.lng]);
          });
        } else {
          f.coordinates.forEach(c => {
            bounds.extend([c.lat, c.lng]);
          });
        }
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
  }, [features, config, subArea, map]);
  
  return null;
};

const getCleanBaseName = (pName: string) => {
  return pName
    .replace(/\.(kml|kmz)$/i, '')
    .replace(/^(YKN_|UCUS_|TAHDIT_|Normal_|Strip_|YKN_Normal_|YKN_Strip_|Plan_)/gi, '')
    .trim();
};

const GCPNormalPlanDisplay: React.FC<Props> = ({ projectName, features, config, onBack }) => {
  const mapProvider = localStorage.getItem('default_map_provider') || 'Google Satellite';
  const [points, setPoints] = useState<YKNPoint[]>([]);
  const [shrunkPolygon, setShrunkPolygon] = useState<[number, number][] | null>(null);
  const [isAddingPoint, setIsAddingPoint] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState<'flight_plan' | 'ykn_plan' | 'pdf_summary'>('ykn_plan');
  const [exportName, setExportName] = useState(`YKN_${getCleanBaseName(projectName)}`);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const allPoints = useMemo(() => {
    const pts: Point[] = [];
    features.forEach(f => {
      const { finalCoords } = getExpandedPolygonCoords(f.coordinates, config);
      finalCoords.forEach(c => pts.push(c));
    });
    return pts;
  }, [features, config]);

  const optResult = useMemo(() => calculateOptimumFlightAngle(allPoints, config.overlapSide || 70, config.camera.sensorWidth, config.camera.focalLength, config.height || 120), [allPoints, config]);

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

  const handleExportPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const mapEl = document.querySelector('.leaflet-container') as HTMLElement | null;
      const calculatedGsd = (config.camera && config.height) 
        ? Math.round(((config.camera.sensorWidth * config.height * 100) / (config.camera.focalLength * config.camera.imageWidth)) * 100) / 100 
        : (config.gsd || 2.5);

      await generateFlightPlanPDF({
        projectName: exportName || projectName,
        flightType: 'Normal',
        camera: config.camera,
        altitude: config.height || 200,
        gsd: calculatedGsd,
        areaSizeM2: boundaryArea * 10000,
        bufferMeters: config.buffer || 0,
        expandToGridMeters: config.expandToGrid,
        expandToRectangle: config.expandToRectangle,
        expandToMinRectangle: config.expandToMinRectangle,
        gcpEnabled: true,
        gcpPoints: points,
        gcpDistance: config.gcpDistance || 400,
        gcpStartOffset: config.gcpStartOffset || 10,
        gcpStartNumber: config.gcpStartNumber || 1,
        flightAngle: optResult.angle,
        estimatedDurationMinutes: optResult.durationMinutes,
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

  const boundaryArea = useMemo(() => {
    let totalArea = 0;
    features.forEach(f => {
      if (f.type === 'Polygon') {
        const { finalCoords } = getExpandedPolygonCoords(f.coordinates, config);
        totalArea += calculatePolygonArea(finalCoords);
      } else if (f.type === 'LineString') {
        const expanded = expandLineToPolygon(f.coordinates.map(c => ({ lat: c.lat, lng: c.lng })), config.buffer || 50);
        totalArea += calculatePolygonArea(expanded);
      }
    });
    return totalArea;
  }, [features, config]);

  // Initial Point Generation
  useEffect(() => {
    const generatePoints = (dist: number): YKNPoint[] => {
      const polygonFeature = features.find(f => f.type === 'Polygon');
      const lineFeature = features.find(f => f.type === 'LineString');
      if (!polygonFeature && !lineFeature) return [];

      let polyCoords: [number, number][] = [];
      if (polygonFeature) {
        const { finalCoords } = getExpandedPolygonCoords(polygonFeature.coordinates, config);
        polyCoords = finalCoords.map(c => [c.lng, c.lat]);
      } else if (lineFeature) {
        const expanded = expandLineToPolygon(lineFeature.coordinates.map(c => ({ lat: c.lat, lng: c.lng })), config.buffer || 50);
        polyCoords = expanded.map(c => [c.lng, c.lat]);
      }

      if (polyCoords.length < 3) return [];
      if (polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] || polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]) {
        polyCoords.push(polyCoords[0]);
      }
      const poly = turf.polygon([polyCoords]);

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

      // --- OPTIMIZED NORMAL AREA YKN GENERATION ALGORITHM ---
      
      const boundaryLine = turf.polygonToLine(targetPoly) as any;
      const boundaryLength = turf.length(boundaryLine, { units: 'meters' });
      
      const allCandidatePoints: [number, number][] = [];

      // 1. Edge-by-Edge Perimeter Sampling: Distribute points equally along each edge
      const ringCoords = targetPoly.geometry.coordinates[0] as [number, number][];
      const rawPerimeterPoints: [number, number][] = [];

      for (let k = 0; k < ringCoords.length - 1; k++) {
        const v1 = ringCoords[k];
        const v2 = ringCoords[k + 1];
        const edgeLength = turf.distance(turf.point(v1), turf.point(v2), { units: 'meters' });

        if (edgeLength < 1) continue;

        const numSegments = Math.max(1, Math.round(edgeLength / dist));
        for (let j = 0; j < numSegments; j++) {
          const t = j / numSegments;
          const lng = v1[0] + t * (v2[0] - v1[0]);
          const lat = v1[1] + t * (v2[1] - v1[1]);
          rawPerimeterPoints.push([lng, lat]);
        }
      }

      // Proximity Filter: Filter out perimeter points that are too close to each other (e.g., adjacent corners)
      const minPerimeterDist = Math.max(20, dist * 0.45);
      const perimeterPoints: [number, number][] = [];

      for (const pt of rawPerimeterPoints) {
        const turfPt = turf.point(pt);
        const tooClose = perimeterPoints.some(p => turf.distance(turfPt, turf.point(p), { units: 'meters' }) < minPerimeterDist);
        if (!tooClose) {
          perimeterPoints.push(pt);
        }
      }

      allCandidatePoints.push(...perimeterPoints);

      // 2. Centroid & Staggered Interior Grid Sampling
      // First, evaluate placing a YKN point at the polygon's geometric centroid (Ağırlık Merkezi)
      let centroidPt = turf.centroid(targetPoly);
      if (!turf.booleanPointInPolygon(centroidPt, targetPoly)) {
        centroidPt = turf.pointOnFeature(targetPoly) as any;
      }

      const centerCoords = centroidPt.geometry.coordinates as [number, number];
      const centerLng = centerCoords[0];
      const centerLat = centerCoords[1];

      const centroidDistToBoundary = turf.pointToLineDistance(centroidPt, boundaryLine, { units: 'meters' });
      const centroidDistToPerimeter = perimeterPoints.length > 0 
        ? Math.min(...perimeterPoints.map(p => turf.distance(centroidPt, turf.point(p), { units: 'meters' })))
        : Infinity;

      // If centroid has sufficient clearance, add it directly as an interior YKN point
      if (centroidDistToBoundary >= dist * 0.35 && centroidDistToPerimeter >= dist * 0.45) {
        allCandidatePoints.push(centerCoords);
      }

      // Staggered Interior Grid centered on the Polygon Centroid
      const bbox = turf.bbox(targetPoly); // [minX, minY, maxX, maxY]

      const latStepDeg = dist / 111320;
      const lngStepDeg = dist / (111320 * Math.cos(centerLat * Math.PI / 180));
      const rowHeightDeg = latStepDeg * 0.866; // Hexagonal/triangular packing

      const rMin = Math.floor((bbox[1] - centerLat) / rowHeightDeg) - 1;
      const rMax = Math.ceil((bbox[3] - centerLat) / rowHeightDeg) + 1;
      const cMin = Math.floor((bbox[0] - centerLng) / lngStepDeg) - 1;
      const cMax = Math.ceil((bbox[2] - centerLng) / lngStepDeg) + 1;

      for (let r = rMax; r >= rMin; r--) {
        const y = centerLat + r * rowHeightDeg;
        const xOffset = (r % 2 !== 0) ? (lngStepDeg * 0.5) : 0;

        for (let c = cMin; c <= cMax; c++) {
          if (r === 0 && c === 0) continue; // Skip exact centroid if evaluated

          const x = centerLng + c * lngStepDeg + xOffset;
          const pt = turf.point([x, y]);

          // Must be strictly inside the target polygon
          if (turf.booleanPointInPolygon(pt, targetPoly)) {
            // Must be at least dist * 0.35 meters away from the boundary line
            const distToBoundary = turf.pointToLineDistance(pt, boundaryLine, { units: 'meters' });
            if (distToBoundary >= dist * 0.35) {
              // Must be at least dist * 0.5 meters away from all perimeter and existing interior points
              const tooClose = allCandidatePoints.some(p => turf.distance(pt, turf.point(p), { units: 'meters' }) < dist * 0.5);
              if (!tooClose) {
                allCandidatePoints.push([x, y]);
              }
            }
          }
        }
      }

      // 3. Sort Points (North to South, West to East with Zigzag)
      const sortedPoints = [...allCandidatePoints];
      sortedPoints.sort((a, b) => {
        // Group by ~0.0005 deg (~50m) row band
        const latDiff = Math.abs(a[1] - b[1]);
        if (latDiff > latStepDeg * 0.4) {
          return b[1] - a[1]; // North to South
        }
        return a[0] - b[0]; // West to East
      });

      // 4. Convert to final YKNPoint format
      const startNum = config.gcpStartNumber || 1;
      return sortedPoints.map((p, i) => ({
        id: `ykn-${i}`,
        name: `YKN${i + startNum}`,
        lng: p[0],
        lat: p[1]
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

  const findBestInsertIndex = (lat: number, lng: number, currentPoints: YKNPoint[]): number => {
    if (currentPoints.length < 2) {
      return currentPoints.length;
    }

    const clickPt = turf.point([lng, lat]);
    let minDistance = Infinity;
    let bestIndex = currentPoints.length;

    const firstPt = turf.point([currentPoints[0].lng, currentPoints[0].lat]);
    const distToStart = turf.distance(clickPt, firstPt, { units: 'meters' });

    const lastPt = turf.point([currentPoints[currentPoints.length - 1].lng, currentPoints[currentPoints.length - 1].lat]);
    const distToEnd = turf.distance(clickPt, lastPt, { units: 'meters' });

    for (let i = 0; i < currentPoints.length - 1; i++) {
      const p1 = currentPoints[i];
      const p2 = currentPoints[i + 1];
      const line = turf.lineString([[p1.lng, p1.lat], [p2.lng, p2.lat]]);
      const distToSeg = turf.pointToLineDistance(clickPt, line, { units: 'meters' });

      if (distToSeg < minDistance) {
        minDistance = distToSeg;
        bestIndex = i + 1;
      }
    }

    if (distToStart < minDistance * 0.7) {
      return 0;
    }
    if (distToEnd < minDistance * 0.7) {
      return currentPoints.length;
    }

    return bestIndex;
  };

  const insertPointAtIndex = (lat: number, lng: number, targetIndex: number) => {
    const newId = `ykn-${Date.now()}`;
    const startNum = config.gcpStartNumber || 1;
    setPoints(prev => {
      const updated = [...prev];
      const idx = Math.max(0, Math.min(targetIndex, updated.length));
      updated.splice(idx, 0, { id: newId, name: '', lat, lng });
      return updated.map((p, i) => ({
        ...p,
        name: `YKN${i + startNum}`
      }));
    });
  };

  const handleAddPoint = (lat: number, lng: number) => {
    const targetIdx = findBestInsertIndex(lat, lng, points);
    insertPointAtIndex(lat, lng, targetIdx);
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
    const connections: { from: YKNPoint; to: YKNPoint; distance: number; index: number }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      const dist = turf.distance([from.lng, from.lat], [to.lng, to.lat], { units: 'meters' });
      connections.push({ from, to, distance: Math.round(dist), index: i });
    }
    return connections;
  }, [points]);

  const handleExport = (type: 'flight_plan' | 'ykn_plan' = exportType) => {
    const polygonFeature = features.find(f => f.type === 'Polygon');
    const lineFeature = features.find(f => f.type === 'LineString');

    let ucusPlaniKml = '';
    let tahditKml = '';

    if (polygonFeature) {
      const { originalCoords, finalCoords } = getExpandedPolygonCoords(polygonFeature.coordinates, config);
      
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
              ${finalCoords.map(c => `${c.lng},${c.lat},0`).join(' ')}
              ${finalCoords[0].lng},${finalCoords[0].lat},0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;

      if (type === 'ykn_plan') {
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
              ${originalCoords.map(c => `${c.lng},${c.lat},0`).join(' ')}
              ${originalCoords[0].lng},${originalCoords[0].lat},0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;
      }
    } else if (lineFeature) {
      const expanded = expandLineToPolygon(lineFeature.coordinates.map(c => ({ lat: c.lat, lng: c.lng })), config.buffer || 50);
      
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
              ${expanded.map(c => `${c.lng},${c.lat},0`).join(' ')}
              ${expanded[0].lng},${expanded[0].lat},0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;

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
      <Header title="Uçuş Planı" onBack={onBack} />

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
          <FitBounds features={features} config={config} subArea={config.subAreaKmlData} />
          <MapClickHandler active={isAddingPoint} onMapClick={handleAddPoint} />
          
          {features.map((f, i) => {
            if (f.type === 'Polygon') {
              const { finalCoords } = getExpandedPolygonCoords(f.coordinates, config);
              return (
                <React.Fragment key={i}>
                  <Polygon 
                    positions={f.coordinates.map(c => [c.lat, c.lng] as [number, number])} 
                    color="red" 
                    fillOpacity={0} 
                    weight={3} 
                  />
                  <Polygon 
                    positions={finalCoords.map(c => [c.lat, c.lng] as [number, number])} 
                    color="#ffff7f" 
                    fillColor="#ffff7f" 
                    fillOpacity={0.5} 
                    weight={3} 
                  />
                </React.Fragment>
              );
            } else if (f.type === 'LineString') {
              const expanded = expandLineToPolygon(f.coordinates.map(c => ({ lat: c.lat, lng: c.lng })), config.buffer || 50);
              return (
                <React.Fragment key={i}>
                  <Polyline positions={f.coordinates.map(c => [c.lat, c.lng] as [number, number])} color="red" weight={3} />
                  <Polygon positions={expanded.map(c => [c.lat, c.lng] as [number, number])} color="#ffff7f" fillColor="#ffff7f" fillOpacity={0.5} weight={3} />
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

          {points.map((p, idx) => (
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
                <div className="font-black text-slate-900 mb-2">{p.name}</div>
                <button onClick={() => handleDeletePoint(p.id)} className="w-full py-1.5 bg-red-50 text-red-600 rounded border border-red-100 text-[9px] font-black uppercase tracking-widest hover:bg-red-100 transition-colors">SİL</button>
              </Popup>
            </Marker>
          ))}

          {pointConnections.map((conn, i) => {
            const midLat = (conn.from.lat + conn.to.lat) / 2;
            const midLng = (conn.from.lng + conn.to.lng) / 2;
            const fromNum = conn.from.name.replace('YKN', '');
            const toNum = conn.to.name.replace('YKN', '');

            return (
              <React.Fragment key={i}>
                <Polyline positions={[[conn.from.lat, conn.from.lng], [conn.to.lat, conn.to.lng]]} color="#3b82f6" weight={2} dashArray="4, 4" />
                <Marker 
                  position={[midLat, midLng]} 
                  icon={L.divIcon({
                    className: 'custom-conn-badge',
                    html: `
                      <div title="YKN${fromNum} ile YKN${toNum} arasına yeni nokta ekle" class="group flex items-center gap-1.5 bg-white hover:bg-blue-600 text-slate-700 hover:text-white px-2 py-0.5 rounded-full shadow-md border border-slate-300 hover:border-blue-500 transition-all cursor-pointer select-none">
                        <i class="fas fa-plus text-[8px] text-blue-600 group-hover:text-white"></i>
                        <span class="text-[9px] font-black">${conn.distance}m</span>
                      </div>
                    `,
                    iconSize: [64, 22],
                    iconAnchor: [32, 11]
                  })}
                  eventHandlers={{
                    click: (e) => {
                      L.DomEvent.stopPropagation(e.originalEvent);
                      insertPointAtIndex(midLat, midLng, conn.index + 1);
                    }
                  }}
                />
              </React.Fragment>
            );
          })}
        </MapContainer>
      </div>

      <div className="bg-slate-200 px-6 py-2.5 border-t border-slate-300 flex flex-col gap-2.5 shrink-0">
        <div className="grid grid-cols-4 gap-2 w-full py-1">
          <div className="flex flex-col items-start">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Uçuş Alanı</span>
            <span className="text-[11px] font-black text-slate-900">{boundaryArea.toFixed(2)} ha</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Toplam YKN</span>
            <span className="text-[11px] font-black text-blue-600">
              {config.isGcpEnabled && points.length > 0 ? `${points.length} Adet` : '0'}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Uçuş Açısı</span>
            <span className="text-[11px] font-black text-emerald-600">{optResult.angle}°</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Uçuş Süresi</span>
            <span className="text-[11px] font-black text-purple-600">~{optResult.durationText || formatDurationText(optResult.durationMinutes)}</span>
          </div>
        </div>
        <div className="flex gap-2 w-full">
          <button 
            onClick={() => handleOpenExportModal('flight_plan')} 
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase tracking-[0.1em] text-[10px] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <i className="fas fa-plane-departure"></i>UÇUŞ PLANI
          </button>
          {config.isGcpEnabled && (
            <button 
              onClick={() => handleOpenExportModal('ykn_plan')} 
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase tracking-[0.1em] text-[10px] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <i className="fas fa-map-marked-alt"></i>YKN PLANI
            </button>
          )}
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
                <div className={`grid ${config.isGcpEnabled ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5 p-1 bg-slate-100 rounded-2xl`}>
                  <button 
                    onClick={() => setExportType('flight_plan')} 
                    className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${exportType === 'flight_plan' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-600'}`}
                  >
                    Uçuş Planı
                  </button>
                  {config.isGcpEnabled && (
                    <button 
                      onClick={() => setExportType('ykn_plan')} 
                      className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${exportType === 'ykn_plan' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600'}`}
                    >
                      YKN Planı
                    </button>
                  )}
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

export default GCPNormalPlanDisplay;
