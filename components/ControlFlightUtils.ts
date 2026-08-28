import * as turf from '@turf/turf';
import { Camera, KMLData } from '../src/types/flight';
import { Point, metersToDegrees, calculateLineBearing, expandLineToPolygon, rotatePointAroundCenter, rotatePointsAroundCenter } from './GeometryUtils';

export interface ControlSpot {
  id: string;
  name: string;
  center: Point;
  boundary: Point[];
  flightLines: Point[][];
  lengthMeters: number;
  rotationAngle?: number; // In degrees
}

/**
 * Rotates a ControlSpot's boundary polygon and flight lines around its center of mass (centroid).
 */
export function rotateSpotAroundCenter(spot: ControlSpot, angleDeltaDeg: number): ControlSpot {
  if (angleDeltaDeg === 0) return spot;
  const newBoundary = rotatePointsAroundCenter(spot.boundary, spot.center, angleDeltaDeg);
  const newFlightLines = spot.flightLines.map(line =>
    rotatePointsAroundCenter(line, spot.center, angleDeltaDeg)
  );
  const currentAngle = spot.rotationAngle || 0;
  const newAngle = (currentAngle + angleDeltaDeg) % 360;

  return {
    ...spot,
    boundary: newBoundary,
    flightLines: newFlightLines,
    rotationAngle: newAngle >= 0 ? newAngle : newAngle + 360
  };
}

/**
 * Rotates associated GCPs of a spot around the spot's center of mass.
 */
export function rotateGCPsAroundSpotCenter(
  gcps: ControlGCP[],
  spotId: string,
  center: Point,
  angleDeltaDeg: number
): ControlGCP[] {
  if (angleDeltaDeg === 0) return gcps;
  return gcps.map(g => {
    if (g.spotId === spotId) {
      const rotated = rotatePointAroundCenter({ lat: g.lat, lng: g.lng }, center, angleDeltaDeg);
      return {
        ...g,
        lat: rotated.lat,
        lng: rotated.lng
      };
    }
    return g;
  });
}

export interface ControlGCP {
  id: string;
  name: string;
  lat: number;
  lng: number;
  alt?: number;
  spotId?: string;
}

export interface ControlFlightResult {
  projectName: string;
  routeType: 'Grid' | 'StripCross';
  samplePercentage: number;
  totalAreaM2: number;
  totalAreaHa: number;
  targetControlAreaM2: number;
  targetControlAreaHa: number;
  controlAreaM2: number;
  controlAreaHa: number;
  effectivePercentage: number;
  spotCount: number;
  timeSavingsPercentage: number;
  totalFlightDistanceMeters: number;
  estimatedFlightSeconds: number;
  spots: ControlSpot[];
  gcps: ControlGCP[];
  originalBoundary: Point[];
  camera: Camera;
  height: number;
  gsd: number;
}

/**
 * Robust Polygon Area calculation in Square Meters (m²) using Geodesic Turf / Spherical trigonometry
 */
export function calculateAreaM2(coords: Point[]): number {
  if (!coords || coords.length < 3) return 0;
  try {
    const ring = coords.map(c => [c.lng, c.lat]);
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
      ring.push(ring[0]);
    }
    const poly = turf.polygon([ring]);
    return turf.area(poly); // returns in square meters (m²)
  } catch (err) {
    // Fallback: shoelace in meters
    const centerLat = coords[0].lat;
    const { latDeg, lngDeg } = metersToDegrees(1, centerLat);
    let area = 0;
    for (let i = 0; i < coords.length; i++) {
      const p1 = coords[i];
      const p2 = coords[(i + 1) % coords.length];
      const x1 = p1.lng / lngDeg;
      const y1 = p1.lat / latDeg;
      const x2 = p2.lng / lngDeg;
      const y2 = p2.lat / latDeg;
      area += (x1 * y2 - x2 * y1);
    }
    return Math.abs(area) / 2;
  }
}

/**
 * Extract all polygon / boundary points from a KMLData object
 */
export function extractBoundaryPoints(kmlData: KMLData | null): Point[] {
  if (!kmlData || !kmlData.features || kmlData.features.length === 0) {
    return [];
  }

  // First prioritize Polygon features
  const polyFeature = kmlData.features.find(f => f.type === 'Polygon' && f.coordinates && f.coordinates.length >= 3);
  if (polyFeature && polyFeature.coordinates) {
    return polyFeature.coordinates.map(c => ({ lat: c.lat, lng: c.lng }));
  }

  // Next LineString with >= 3 points
  const lineFeature = kmlData.features.find(f => f.coordinates && f.coordinates.length >= 3);
  if (lineFeature && lineFeature.coordinates) {
    return lineFeature.coordinates.map(c => ({ lat: c.lat, lng: c.lng }));
  }

  // Otherwise collect all coordinates
  const allCoords: Point[] = [];
  kmlData.features.forEach(f => {
    if (f.coordinates) {
      f.coordinates.forEach(c => allCoords.push({ lat: c.lat, lng: c.lng }));
    }
  });

  return allCoords;
}

/**
 * Generate regular grid flight lines inside a rectangular polygon
 */
function generateSubGridFlightLines(
  spotCoords: Point[],
  height: number,
  camera: Camera
): { flightLines: Point[][]; totalLength: number } {
  const centerLat = spotCoords.reduce((sum, p) => sum + p.lat, 0) / spotCoords.length;

  const focalLength = camera.focalLength > 0 ? camera.focalLength : 8.8;
  const sensorWidth = camera.sensorWidth > 0 ? camera.sensorWidth : 13.2;
  const groundWidth = (sensorWidth * height) / focalLength;
  
  // 65% side overlap -> line spacing
  const lineSpacing = Math.max(10, Math.min(groundWidth * 0.35, 45));

  const bbox = turf.bbox(turf.polygon([[...spotCoords.map(p => [p.lng, p.lat]), [spotCoords[0].lng, spotCoords[0].lat]]]));
  const minLng = bbox[0];
  const minLat = bbox[1];
  const maxLng = bbox[2];
  const maxLat = bbox[3];

  const widthMeters = turf.distance([minLng, centerLat], [maxLng, centerLat], { units: 'kilometers' }) * 1000;
  const numLines = Math.max(2, Math.min(15, Math.round(widthMeters / lineSpacing)));

  const poly = turf.polygon([[...spotCoords.map(p => [p.lng, p.lat]), [spotCoords[0].lng, spotCoords[0].lat]]]);
  const lines: Point[][] = [];
  let totalLength = 0;

  for (let i = 0; i <= numLines; i++) {
    const frac = numLines > 0 ? i / numLines : 0.5;
    const lng = minLng + frac * (maxLng - minLng);
    
    const pTop = [lng, maxLat + 0.0002];
    const pBottom = [lng, minLat - 0.0002];
    const testLine = turf.lineString([pBottom, pTop]);

    try {
      const intersects = turf.lineIntersect(poly, testLine);
      if (intersects.features.length >= 2) {
        const pts = intersects.features.map(f => ({
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
        })).sort((a, b) => a.lat - b.lat);

        if (pts.length >= 2) {
          const seg = i % 2 === 0 ? [pts[0], pts[pts.length - 1]] : [pts[pts.length - 1], pts[0]];
          lines.push(seg);
          const segDist = turf.distance([seg[0].lng, seg[0].lat], [seg[1].lng, seg[1].lat], { units: 'kilometers' }) * 1000;
          totalLength += segDist;
        }
      }
    } catch {
      // ignore clipping error
    }
  }

  // Fallback if clipping failed
  if (lines.length === 0) {
    const defaultLine = [
      { lat: minLat + (maxLat - minLat) * 0.15, lng: minLng + (maxLng - minLng) * 0.5 },
      { lat: maxLat - (maxLat - minLat) * 0.15, lng: minLng + (maxLng - minLng) * 0.5 }
    ];
    lines.push(defaultLine);
    totalLength += turf.distance([defaultLine[0].lng, defaultLine[0].lat], [defaultLine[1].lng, defaultLine[1].lat], { units: 'kilometers' }) * 1000;
  }

  return { flightLines: lines, totalLength };
}

/**
 * Buffers a LineString by stripBuffer meters and robustly clips the resulting corridor
 * to the project boundary polygon using Turf.js.
 */
function bufferLineAndClipToBoundary(
  linePoints: Point[],
  bufferMeters: number,
  boundaryPoly: any
): Point[][] {
  try {
    if (linePoints.length < 2) return [];

    const lineCoords = linePoints.map(p => [p.lng, p.lat]);
    const lineFeature = turf.lineString(lineCoords);

    // Apply exact user-specified buffer distance in meters
    const bufferedFeature = turf.buffer(lineFeature, Math.max(5, bufferMeters), { units: 'meters' });
    if (!bufferedFeature || !bufferedFeature.geometry) return [];

    let intersection: any = null;
    try {
      intersection = turf.intersect(turf.featureCollection([boundaryPoly, bufferedFeature]));
    } catch {
      try {
        intersection = (turf as any).intersect(boundaryPoly, bufferedFeature);
      } catch {
        intersection = null;
      }
    }

    if (!intersection || !intersection.geometry) {
      // If boundary intersection fails, extract the unclipped buffer ring
      const geomType = (bufferedFeature.geometry as any).type;
      const coords = (bufferedFeature.geometry as any).coordinates;
      if (geomType === 'Polygon' && coords && coords[0] && coords[0].length >= 4) {
        return [(coords[0] as number[][]).map((c: number[]) => ({ lat: c[1], lng: c[0] }))];
      }
      return [];
    }

    const geomType = (intersection.geometry as any).type;
    const coords = (intersection.geometry as any).coordinates;

    if (geomType === 'Polygon') {
      const ring = coords[0] as number[][];
      if (ring && ring.length >= 4) {
        return [ring.map((c: number[]) => ({ lat: c[1], lng: c[0] }))];
      }
    } else if (geomType === 'MultiPolygon') {
      const polygons: Point[][] = [];
      (coords as number[][][][]).forEach((polyCoords: number[][][]) => {
        const ring = polyCoords[0];
        if (ring && ring.length >= 4) {
          polygons.push(ring.map((c: number[]) => ({ lat: c[1], lng: c[0] })));
        }
      });
      return polygons;
    }
  } catch (err) {
    console.error('Error buffering and clipping line to boundary:', err);
  }
  return [];
}

/**
 * Generates exact "Z" shape flight lines without external clipping:
 * 1. Top Parallel Line (P1 -> P2)
 * 2. 45° Diagonal Connecting Line (P2 -> P3)
 * 3. Bottom Parallel Line (P3 -> P4)
 * Lines and corridors are kept intact so the user can freely drag/slide them.
 */
function generateZPatternFlightLines(
  rawZPoints: Point[]
): { flightLines: Point[][]; totalLength: number } {
  if (rawZPoints.length < 4) {
    return { flightLines: [], totalLength: 0 };
  }

  // 3 segments of 'Z': [P1->P2 (Top Parallel)], [P2->P3 (45° Diagonal)], [P3->P4 (Bottom Parallel)]
  const candidateSegments: Point[][] = [
    [rawZPoints[0], rawZPoints[1]],
    [rawZPoints[1], rawZPoints[2]],
    [rawZPoints[2], rawZPoints[3]]
  ];

  let totalLength = 0;
  candidateSegments.forEach(seg => {
    const d = turf.distance([seg[0].lng, seg[0].lat], [seg[1].lng, seg[1].lat], { units: 'kilometers' }) * 1000;
    totalLength += d;
  });

  return { flightLines: candidateSegments, totalLength };
}

/**
 * Creates a square polygon centered at (lat, lng) with size in meters
 */
function createBoxPolygon(center: Point, sizeMeters: number): Point[] {
  const { latDeg, lngDeg } = metersToDegrees(sizeMeters / 2, center.lat);
  return [
    { lat: center.lat - latDeg, lng: center.lng - lngDeg }, // SW
    { lat: center.lat + latDeg, lng: center.lng - lngDeg }, // NW
    { lat: center.lat + latDeg, lng: center.lng + lngDeg }, // NE
    { lat: center.lat - latDeg, lng: center.lng + lngDeg }, // SE
    { lat: center.lat - latDeg, lng: center.lng - lngDeg }  // SW (closed)
  ];
}

/**
 * Robustly clips a spot/corridor polygon to the main boundary polygon using Turf.js intersect.
 * Guarantees that no part of the spot ever extends outside the boundary.
 */
function clipPolygonToBoundary(spotCoords: Point[], boundaryPoly: any): Point[][] {
  try {
    const closedSpot = [...spotCoords];
    if (
      closedSpot.length >= 3 &&
      (closedSpot[0].lat !== closedSpot[closedSpot.length - 1].lat ||
        closedSpot[0].lng !== closedSpot[closedSpot.length - 1].lng)
    ) {
      closedSpot.push(closedSpot[0]);
    }
    const spotPoly = turf.polygon([closedSpot.map(p => [p.lng, p.lat])]);

    let intersection: any = null;
    try {
      intersection = turf.intersect(turf.featureCollection([boundaryPoly, spotPoly]));
    } catch {
      try {
        intersection = (turf as any).intersect(boundaryPoly, spotPoly);
      } catch {
        intersection = null;
      }
    }

    if (!intersection || !intersection.geometry) {
      return [];
    }

    const geomType = intersection.geometry.type;
    const coords = intersection.geometry.coordinates;

    if (geomType === 'Polygon') {
      const ring = coords[0];
      if (ring && ring.length >= 4) {
        return [ring.map((c: number[]) => ({ lat: c[1], lng: c[0] }))];
      }
    } else if (geomType === 'MultiPolygon') {
      const polygons: Point[][] = [];
      coords.forEach((polyCoords: number[][][]) => {
        const ring = polyCoords[0];
        if (ring && ring.length >= 4) {
          polygons.push(ring.map((c: number[]) => ({ lat: c[1], lng: c[0] })));
        }
      });
      return polygons;
    }
  } catch (err) {
    console.error('Error clipping spot polygon to boundary:', err);
  }
  return [];
}

/**
 * Distributes N points inside a polygon using a uniform spatial grid and k-means clustering.
 * Automatically samples from an eroded inner buffer to prevent grid spots from touching the border.
 */
function distributeHomogeneousCenters(
  poly: any,
  originalBoundary: Point[],
  targetCount: number,
  gridEdgeLength: number = 0
): Point[] {
  if (targetCount <= 0) return [];
  
  const centerLat = originalBoundary.reduce((s, p) => s + p.lat, 0) / originalBoundary.length;
  const centerLng = originalBoundary.reduce((s, p) => s + p.lng, 0) / originalBoundary.length;
  const centroidPt: Point = { lat: centerLat, lng: centerLng };

  if (targetCount === 1) {
    return [centroidPt];
  }

  // Try to sample inside an inner eroded boundary first so grid boxes fit nicely
  let samplingPoly = poly;
  if (gridEdgeLength > 0) {
    try {
      const bufferDistMeters = -(gridEdgeLength * 0.45);
      const innerBuffer = turf.buffer(poly, bufferDistMeters, { units: 'meters' });
      if (innerBuffer && innerBuffer.geometry && turf.area(innerBuffer) > 200) {
        samplingPoly = innerBuffer;
      }
    } catch {
      // ignore buffer error
    }
  }

  const bbox = turf.bbox(samplingPoly);
  const minLng = bbox[0];
  const minLat = bbox[1];
  const maxLng = bbox[2];
  const maxLat = bbox[3];

  // Dense sampling of interior points
  const gridResolution = Math.max(16, Math.min(60, Math.ceil(Math.sqrt(targetCount * 50))));
  const insidePoints: Point[] = [];

  for (let r = 0; r <= gridResolution; r++) {
    for (let c = 0; c <= gridResolution; c++) {
      const lat = minLat + (r / gridResolution) * (maxLat - minLat);
      const lng = minLng + (c / gridResolution) * (maxLng - minLng);
      const pt = turf.point([lng, lat]);
      if (turf.booleanPointInPolygon(pt, samplingPoly)) {
        insidePoints.push({ lat, lng });
      }
    }
  }

  // If eroded boundary had too few samples, sample from the full boundary
  if (insidePoints.length < targetCount && samplingPoly !== poly) {
    const fullBbox = turf.bbox(poly);
    for (let r = 0; r <= gridResolution; r++) {
      for (let c = 0; c <= gridResolution; c++) {
        const lat = fullBbox[1] + (r / gridResolution) * (fullBbox[3] - fullBbox[1]);
        const lng = fullBbox[0] + (c / gridResolution) * (fullBbox[2] - fullBbox[0]);
        const pt = turf.point([lng, lat]);
        if (turf.booleanPointInPolygon(pt, poly)) {
          insidePoints.push({ lat, lng });
        }
      }
    }
  }

  if (insidePoints.length === 0) {
    insidePoints.push(centroidPt);
  }

  if (insidePoints.length <= targetCount) {
    return insidePoints;
  }

  // Farthest point initialization
  const centers: Point[] = [];
  centers.push(insidePoints[Math.floor(insidePoints.length / 2)]);

  while (centers.length < targetCount) {
    let bestCandidate: Point = insidePoints[0];
    let maxMinDist = -1;

    for (const pt of insidePoints) {
      let minDistToCenter = Infinity;
      for (const c of centers) {
        const d = turf.distance([pt.lng, pt.lat], [c.lng, c.lat], { units: 'kilometers' });
        if (d < minDistToCenter) minDistToCenter = d;
      }
      if (minDistToCenter > maxMinDist) {
        maxMinDist = minDistToCenter;
        bestCandidate = pt;
      }
    }
    centers.push(bestCandidate);
  }

  // 6 iterations of K-Means to settle centers uniformly
  let refinedCenters = [...centers];
  for (let iter = 0; iter < 6; iter++) {
    const clusters: Point[][] = Array.from({ length: targetCount }, () => []);
    
    for (const pt of insidePoints) {
      let nearestIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < refinedCenters.length; i++) {
        const d = turf.distance([pt.lng, pt.lat], [refinedCenters[i].lng, refinedCenters[i].lat], { units: 'kilometers' });
        if (d < minDist) {
          minDist = d;
          nearestIdx = i;
        }
      }
      clusters[nearestIdx].push(pt);
    }

    refinedCenters = clusters.map((cluster, i) => {
      if (cluster.length === 0) return refinedCenters[i];
      const meanLat = cluster.reduce((sum, p) => sum + p.lat, 0) / cluster.length;
      const meanLng = cluster.reduce((sum, p) => sum + p.lng, 0) / cluster.length;
      
      let closestPt = cluster[0];
      let cDist = Infinity;
      for (const cp of cluster) {
        const d = (cp.lat - meanLat) ** 2 + (cp.lng - meanLng) ** 2;
        if (d < cDist) {
          cDist = d;
          closestPt = cp;
        }
      }
      return closestPt;
    });
  }

  return refinedCenters;
}

/**
 * Main Calculation Engine for Control Flight
 */
export function calculateControlFlightPlan(params: {
  kmlData: KMLData;
  samplePercentage: number;
  routeType: 'Grid' | 'StripCross';
  gridEdgeLength: number;
  stripBuffer: number;
  crossStripCount?: number;
  zStripLength?: number;
  initialRotationAngle?: number;
  isGcpEnabled: boolean;
  gcpPlacementType: 'center' | 'corners_center';
  gcpStartNumber: number;
  camera: Camera;
  height: number;
}): ControlFlightResult {
  const {
    kmlData,
    samplePercentage,
    routeType,
    gridEdgeLength,
    stripBuffer,
    crossStripCount = 3,
    zStripLength = 1000,
    initialRotationAngle = 0,
    isGcpEnabled,
    gcpPlacementType,
    gcpStartNumber,
    camera,
    height
  } = params;

  // 1. Extract boundary coordinates safely
  const originalBoundary = extractBoundaryPoints(kmlData);
  const totalAreaM2 = Math.max(100, calculateAreaM2(originalBoundary));
  const totalAreaHa = totalAreaM2 / 10000;

  // GSD calculation
  const focal = camera.focalLength > 0 ? camera.focalLength : 8.8;
  const sensW = camera.sensorWidth > 0 ? camera.sensorWidth : 13.2;
  const imgW = camera.imageWidth > 0 ? camera.imageWidth : 5472;
  const gsd = (height * sensW * 100) / (focal * imgW);

  // Exact target control area (Örn: 34 ha * %5 = 1.7 ha = 17,000 m²)
  const targetControlAreaM2 = totalAreaM2 * (samplePercentage / 100);
  const targetControlAreaHa = targetControlAreaM2 / 10000;

  const spots: ControlSpot[] = [];
  const gcps: ControlGCP[] = [];
  let gcpCounter = gcpStartNumber;

  // Turf polygon for containment check and strict clipping
  let turfPoly: any = null;
  try {
    const closed = [...originalBoundary];
    if (closed.length >= 3 && (closed[0].lat !== closed[closed.length - 1].lat || closed[0].lng !== closed[closed.length - 1].lng)) {
      closed.push(closed[0]);
    }
    turfPoly = turf.polygon([closed.map(p => [p.lng, p.lat])]);
  } catch (e) {
    const p0 = originalBoundary[0] || { lat: 39.92, lng: 32.85 };
    turfPoly = turf.polygon([[
      [p0.lng, p0.lat],
      [p0.lng + 0.01, p0.lat],
      [p0.lng + 0.01, p0.lat + 0.01],
      [p0.lng, p0.lat]
    ]]);
  }

  const bbox = turf.bbox(turfPoly);
  const minLng = bbox[0];
  const minLat = bbox[1];
  const maxLng = bbox[2];
  const maxLat = bbox[3];

  let totalControlArea = 0;
  let totalFlightDistance = 0;

  if (routeType === 'Grid') {
    // -------------------------------------------------------------------------
    // HESAPLAMA MANTIĞI (GRID ALANLAR):
    // -------------------------------------------------------------------------
    const singleSpotArea = Math.max(100, gridEdgeLength * gridEdgeLength);
    const calculatedSpotCount = Math.max(1, Math.ceil(targetControlAreaM2 / singleSpotArea));

    const centers = distributeHomogeneousCenters(
      turfPoly,
      originalBoundary,
      calculatedSpotCount,
      gridEdgeLength
    );

    centers.forEach((center, idx) => {
      const spotId = `spot-${idx + 1}`;
      const spotName = `Kontrol Alanı ${idx + 1}`;
      const rawBox = createBoxPolygon(center, gridEdgeLength);

      // TAHDİT SINIRINA KESİN KIRPMA (TAŞMAYI ÖNLER)
      const clippedPieces = clipPolygonToBoundary(rawBox, turfPoly);
      const boundary = clippedPieces.length > 0 ? clippedPieces[0] : rawBox;

      const { flightLines, totalLength } = generateSubGridFlightLines(boundary, height, camera);
      const spotArea = calculateAreaM2(boundary);

      spots.push({
        id: spotId,
        name: spotName,
        center,
        boundary,
        flightLines,
        lengthMeters: totalLength
      });

      totalControlArea += spotArea;
      totalFlightDistance += totalLength;

      // GCP Generation - Sadece Tahdit Sınırı İçerisindeki Noktalar
      if (isGcpEnabled) {
        if (gcpPlacementType === 'center') {
          // Merkez noktanın poligon içinde olup olmadığını kontrol et
          let validCenter = center;
          try {
            if (!turf.booleanPointInPolygon(turf.point([center.lng, center.lat]), turfPoly)) {
              const boundaryPoly = turf.polygon([[...boundary.map(p => [p.lng, p.lat])]]);
              const ptOnFeat = turf.pointOnFeature(boundaryPoly);
              validCenter = { lat: ptOnFeat.geometry.coordinates[1], lng: ptOnFeat.geometry.coordinates[0] };
            }
          } catch {
            validCenter = center;
          }

          gcps.push({
            id: `gcp-${gcpCounter}`,
            name: `YKN-${gcpCounter}`,
            lat: validCenter.lat,
            lng: validCenter.lng,
            alt: height,
            spotId
          });
          gcpCounter++;
        } else {
          // 4 corners + 1 center (5 nokta)
          const { latDeg, lngDeg } = metersToDegrees(gridEdgeLength * 0.4, center.lat);
          const rawCandidates = [
            { name: `YKN-${gcpCounter}`, lat: center.lat, lng: center.lng },
            { name: `YKN-${gcpCounter + 1}`, lat: center.lat - latDeg, lng: center.lng - lngDeg },
            { name: `YKN-${gcpCounter + 2}`, lat: center.lat + latDeg, lng: center.lng - lngDeg },
            { name: `YKN-${gcpCounter + 3}`, lat: center.lat + latDeg, lng: center.lng + lngDeg },
            { name: `YKN-${gcpCounter + 4}`, lat: center.lat - latDeg, lng: center.lng + lngDeg }
          ];

          rawCandidates.forEach((cand) => {
            let pLat = cand.lat;
            let pLng = cand.lng;
            let isInside = true;
            try {
              isInside = turf.booleanPointInPolygon(turf.point([pLng, pLat]), turfPoly);
            } catch {
              isInside = true;
            }

            if (isInside) {
              gcps.push({
                id: `gcp-${gcpCounter}`,
                name: `YKN-${gcpCounter}`,
                lat: pLat,
                lng: pLng,
                alt: height,
                spotId
              });
              gcpCounter++;
            }
          });
        }
      }
    });

  } else {
    // -------------------------------------------------------------------------
    // ŞERİTVARİ 'Z' MODELİ KONTROL DAĞITIM ALGORİTMASI:
    // Kullanıcının belirlediği Toplam Z Uzunluğu (zStripLength, örn: 1000m, 2000m)
    // ve Şerit Genişliği (stripBuffer * 2) ile 1 adet Z-şeridinin alanı hesaplanır.
    // Otomatik Şerit Sayısı = Hedef Kontrol Alanı / Tek Z Alanı
    // -------------------------------------------------------------------------
    const singleZEstimatedAreaM2 = Math.max(100, zStripLength * (stripBuffer * 2));
    const calculatedSpotCount = (singleZEstimatedAreaM2 > 0 && targetControlAreaM2 > 0)
      ? Math.max(1, Math.ceil(targetControlAreaM2 / singleZEstimatedAreaM2))
      : 1;

    // Sahada homojen dağıtılmış Z-merkez noktaları belirle
    const zCenters = distributeHomogeneousCenters(
      turfPoly,
      originalBoundary,
      calculatedSpotCount,
      stripBuffer * 4
    );

    // Z hat uzunluğunu 3 segmente dağıt: Üst Hat (W), Alt Hat (W), Çapraz 45° Hat (W * sqrt(2))
    // Toplam Uzunluk = W + W + W*sqrt(2) = W * (2 + sqrt(2)) => W = zStripLength / 3.4142
    // Merkezden yarıçap dLngMeters = dLatMeters = W / 2 = zStripLength / 6.8284
    const zRadiusMeters = Math.max(50, zStripLength / (2 * (2 + Math.SQRT2)));

    zCenters.forEach((center, idx) => {
      const spotId = `z-strip-${idx + 1}`;
      const spotName = `Z-Kontrol Şeridi ${idx + 1}`;

      // 45 derece eğim için dLat = dLng
      const { latDeg: dLat } = metersToDegrees(zRadiusMeters, center.lat);
      const { lngDeg: dLng } = metersToDegrees(zRadiusMeters, center.lat);

      // Z'nin 4 köşe noktası (P1 -> P2 -> P3 -> P4)
      // P1: Üst-Sol, P2: Üst-Sağ, P3: Alt-Sol (45° Çapraz), P4: Alt-Sağ
      const baseZPoints: Point[] = [
        { lat: center.lat + dLat, lng: center.lng - dLng }, // P1: Üst-Sol
        { lat: center.lat + dLat, lng: center.lng + dLng }, // P2: Üst-Sağ
        { lat: center.lat - dLat, lng: center.lng - dLng }, // P3: Alt-Sol (P2'den 45° açılı çapraz iniş)
        { lat: center.lat - dLat, lng: center.lng + dLng }  // P4: Alt-Sağ
      ];

      const rawZPoints = initialRotationAngle !== 0
        ? rotatePointsAroundCenter(baseZPoints, center, initialRotationAngle)
        : baseZPoints;

      // Şeritvari alan haritalama yöntemindeki Square Buffer (Mitered Offset) mantığı:
      // Z poliline hattının her iki yanına dik (perpendicular) stripBuffer ofseti uygulanarak tam koridor poligonu oluşturulur.
      // Dış tahdit ile kırpılmadan tam geometri korunur, kullanıcı dilediği konuma kaydırabilir.
      const boundary: Point[] = expandLineToPolygon(rawZPoints, stripBuffer);

      // Z-Şeklinde Hatlar (2 Paralel Hat + 45° Çapraz Birleşim - Kırpmasız Tam Hatlar)
      const { flightLines, totalLength } = generateZPatternFlightLines(rawZPoints);
      const spotArea = calculateAreaM2(boundary);

      spots.push({
        id: spotId,
        name: spotName,
        center,
        boundary,
        flightLines,
        lengthMeters: totalLength,
        rotationAngle: initialRotationAngle || 0
      });

      totalControlArea += spotArea;
      totalFlightDistance += totalLength;

      // Yer Kontrol Noktaları (Z-şeklinin köşe dönemeçleri ve merkez)
      if (isGcpEnabled) {
        if (gcpPlacementType === 'center') {
          gcps.push({
            id: `gcp-${gcpCounter}`,
            name: `YKN-${gcpCounter}`,
            lat: center.lat,
            lng: center.lng,
            alt: height,
            spotId
          });
          gcpCounter++;
        } else {
          // Z'nin 4 köşe noktası + 1 merkez noktası
          const cornerCandidates: Point[] = [
            { lat: center.lat, lng: center.lng }, // Merkez
            rawZPoints[0], // P1
            rawZPoints[1], // P2
            rawZPoints[2], // P3
            rawZPoints[3]  // P4
          ];

          cornerCandidates.forEach((cand) => {
            let isInside = true;
            try {
              isInside = turf.booleanPointInPolygon(turf.point([cand.lng, cand.lat]), turfPoly);
            } catch {
              isInside = true;
            }

            if (isInside) {
              gcps.push({
                id: `gcp-${gcpCounter}`,
                name: `YKN-${gcpCounter}`,
                lat: cand.lat,
                lng: cand.lng,
                alt: height,
                spotId
              });
              gcpCounter++;
            }
          });
        }
      }
    });
  }

  const effectivePercentage = Math.min(100, Math.max(0.01, (totalControlArea / totalAreaM2) * 100));
  const timeSavingsPercentage = Math.max(30, Math.min(98, Math.round(100 - effectivePercentage)));
  
  // Average 8 m/s flight speed + transit buffer between spots
  const estimatedFlightSeconds = Math.round((totalFlightDistance / 8) + (spots.length * 40));

  return {
    projectName: kmlData.name || 'Kontrol_Ucusu',
    routeType,
    samplePercentage,
    totalAreaM2: Math.round(totalAreaM2),
    totalAreaHa: Number(totalAreaHa.toFixed(2)),
    targetControlAreaM2: Math.round(targetControlAreaM2),
    targetControlAreaHa: Number(targetControlAreaHa.toFixed(2)),
    controlAreaM2: Math.round(totalControlArea),
    controlAreaHa: Number((totalControlArea / 10000).toFixed(2)),
    effectivePercentage: Number(effectivePercentage.toFixed(2)),
    spotCount: spots.length,
    timeSavingsPercentage,
    totalFlightDistanceMeters: Math.round(totalFlightDistance),
    estimatedFlightSeconds,
    spots,
    gcps,
    originalBoundary,
    camera,
    height,
    gsd: Number(gsd.toFixed(2))
  };
}

/**
 * Generates KML string for control flight (flight lines + boundaries + GCPs)
 */
export function generateControlFlightKML(result: ControlFlightResult): string {
  const cleanName = result.projectName.replace(/\.(kml|kmz)$/i, '');

  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>KONTROL_${cleanName}</name>
    <description>İHA Plus - Kontrol ve Kalite Doğrulama Uçuş Planı (${result.spots.length} Grid Alan, %${result.samplePercentage} Örneklem, ${result.totalAreaHa} ha)</description>

    <!-- STYLES -->
    <Style id="mainBoundary">
      <LineStyle>
        <color>ff0000ff</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <color>1a0000ff</color>
      </PolyStyle>
    </Style>

    <Style id="spotBoundary">
      <LineStyle>
        <color>ffd97706</color>
        <width>3</width>
      </LineStyle>
      <PolyStyle>
        <color>33d97706</color>
      </PolyStyle>
    </Style>

    <Style id="flightLine">
      <LineStyle>
        <color>ff00ffff</color>
        <width>4</width>
      </LineStyle>
    </Style>

    <Style id="gcpPin">
      <IconStyle>
        <scale>1.2</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <!-- ANA SAHA TAHDİDİ -->
    <Folder>
      <name>Ana Çalışma Sahası (${result.totalAreaHa} ha)</name>
      <Placemark>
        <name>Orijinal Saha Sınırı</name>
        <styleUrl>#mainBoundary</styleUrl>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>
${result.originalBoundary.map(p => `                ${p.lng},${p.lat},0`).join('\n')}
              </coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>
    </Folder>

    <!-- KONTROL UÇUŞ ROTALARI -->
    <Folder>
      <name>Kontrol Uçuş Rotaları (${result.spots.length} Adacık, ${result.controlAreaHa} ha)</name>
`;

  result.spots.forEach(spot => {
    kml += `      <Folder>
        <name>${spot.name}</name>
        <!-- Adacık Sınırı -->
        <Placemark>
          <name>${spot.name} - Sınır</name>
          <styleUrl>#spotBoundary</styleUrl>
          <Polygon>
            <outerBoundaryIs>
              <LinearRing>
                <coordinates>
${spot.boundary.map(p => `                  ${p.lng},${p.lat},0`).join('\n')}
                </coordinates>
              </LinearRing>
            </outerBoundaryIs>
          </Polygon>
        </Placemark>

        <!-- Uçuş Hattı (StripCross modunda Tek Çoklu Çizgi & Zemine Bağlı) -->
`;
    if (result.routeType !== 'Grid') {
      const orderedPoints: Point[] = [];
      spot.flightLines.forEach(line => {
        line.forEach(pt => {
          const last = orderedPoints[orderedPoints.length - 1];
          if (!last || Math.abs(last.lat - pt.lat) > 0.0000001 || Math.abs(last.lng - pt.lng) > 0.0000001) {
            orderedPoints.push(pt);
          }
        });
      });

      if (orderedPoints.length >= 2) {
        kml += `        <Placemark>
          <name>${spot.name} - Uçuş Rotası</name>
          <styleUrl>#flightLine</styleUrl>
          <LineString>
            <tessellate>1</tessellate>
            <altitudeMode>clampToGround</altitudeMode>
            <coordinates>
${orderedPoints.map(p => `              ${p.lng},${p.lat},0`).join('\n')}
            </coordinates>
          </LineString>
        </Placemark>
`;
      }
    }

    kml += `      </Folder>\n`;
  });

  kml += `    </Folder>\n`;

  // GCPs
  if (result.gcps.length > 0) {
    kml += `    <!-- YER KONTROL NOKTALARI -->
    <Folder>
      <name>Yer Kontrol Noktaları (${result.gcps.length} Adet YKN)</name>
`;
    result.gcps.forEach(gcp => {
      kml += `      <Placemark>
        <name>${gcp.name}</name>
        <description>Kontrol Uçuşu YKN</description>
        <styleUrl>#gcpPin</styleUrl>
        <Point>
          <coordinates>${gcp.lng},${gcp.lat},${gcp.alt || 0}</coordinates>
        </Point>
      </Placemark>
`;
    });
    kml += `    </Folder>\n`;
  }

  kml += `  </Document>
</kml>`;

  return kml;
}

/**
 * Generates CSV string for control GCPs
 */
export function generateControlGCPCSV(gcps: ControlGCP[]): string {
  let csv = 'Nokta_No,Enlem_Lat,Boylam_Lng,Yukseklik_Alt\n';
  gcps.forEach(g => {
    csv += `${g.name},${g.lat.toFixed(7)},${g.lng.toFixed(7)},${(g.alt || 0).toFixed(2)}\n`;
  });
  return csv;
}

/**
 * Generates TXT string for control GCPs
 */
export function generateControlGCPTXT(gcps: ControlGCP[]): string {
  let txt = 'NO\tLATITUDE\tLONGITUDE\tALTITUDE\n';
  gcps.forEach(g => {
    txt += `${g.name}\t${g.lat.toFixed(7)}\t${g.lng.toFixed(7)}\t${(g.alt || 0).toFixed(2)}\n`;
  });
  return txt;
}
