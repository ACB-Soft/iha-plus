import * as turf from '@turf/turf';

export interface Point {
  lat: number;
  lng: number;
}

/**
 * Approximate conversion from meters to degrees at a given latitude
 */
export const metersToDegrees = (meters: number, lat: number) => {
  const latDeg = meters / 111111;
  const lngDeg = meters / (111111 * Math.cos(lat * Math.PI / 180));
  return { latDeg, lngDeg };
};

/**
 * Calculates the bounding box of a set of coordinates
 */
export const getBoundingBox = (coords: Point[]) => {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  coords.forEach(c => {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLng) minLng = c.lng;
    if (c.lng > maxLng) maxLng = c.lng;
  });
  return { minLat, maxLat, minLng, maxLng };
};

/**
 * Expands a polygon by a buffer in meters using "Square Buffer" (Mitered Offset) logic.
 * This ensures the expansion follows the corners accurately.
 */
export const expandPolygon = (coords: Point[], bufferMeters: number) => {
  if (bufferMeters <= 0 || coords.length < 3) return coords;
  
  // If the polygon is closed (last point == first point), remove the last point for calculation
  let workingCoords = [...coords];
  const isClosed = workingCoords.length > 1 && 
    workingCoords[0].lat === workingCoords[workingCoords.length - 1].lat && 
    workingCoords[0].lng === workingCoords[workingCoords.length - 1].lng;
  
  if (isClosed) {
    workingCoords.pop();
  }

  if (workingCoords.length < 3) return coords;

  const n = workingCoords.length;
  const result: Point[] = [];
  
  const centerLat = workingCoords.reduce((sum, c) => sum + c.lat, 0) / n;
  const { latDeg, lngDeg } = metersToDegrees(bufferMeters, centerLat);
  
  // Determine orientation (CW or CCW) to ensure outward expansion
  let area = 0;
  for (let i = 0; i < n; i++) {
    const p1 = workingCoords[i];
    const p2 = workingCoords[(i + 1) % n];
    area += (p2.lng - p1.lng) * (p2.lat + p1.lat);
  }
  const isCCW = area < 0;

  for (let i = 0; i < n; i++) {
    const p1 = workingCoords[(i - 1 + n) % n];
    const p2 = workingCoords[i];
    const p3 = workingCoords[(i + 1) % n];
    
    // Edge vectors in "meters" (approximate)
    const v1 = { x: (p2.lng - p1.lng) / lngDeg, y: (p2.lat - p1.lat) / latDeg };
    const v2 = { x: (p3.lng - p2.lng) / lngDeg, y: (p3.lat - p2.lat) / latDeg };
    
    const l1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const l2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    
    if (l1 < 1e-9 || l2 < 1e-9) {
      result.push(p2);
      continue;
    }
    
    // Unit normals
    const sign = isCCW ? 1 : -1;
    const n1 = { x: sign * v1.y / l1, y: -sign * v1.x / l1 };
    const n2 = { x: sign * v2.y / l2, y: -sign * v2.x / l2 };
    
    // Bisector vector
    const bx = n1.x + n2.x;
    const by = n1.y + n2.y;
    const bl = Math.sqrt(bx * bx + by * by);
    
    if (bl < 1e-6) {
      result.push({ 
        lat: p2.lat + n1.y * latDeg, 
        lng: p2.lng + n1.x * lngDeg 
      });
    } else {
      const dot = n1.x * n2.x + n1.y * n2.y;
      const cosHalfAngleSq = (1.0 + dot) / 2.0;
      const miterScale = 1.0 / Math.sqrt(Math.max(cosHalfAngleSq, 0.01));
      const safeScale = Math.min(miterScale, 3);
      
      result.push({
        lat: p2.lat + (by / bl) * safeScale * latDeg,
        lng: p2.lng + (bx / bl) * safeScale * lngDeg
      });
    }
  }
  
  if (isClosed) {
    result.push(result[0]);
  }
  
  return result;
};

/**
 * Expands a LineString (polyline) into a Polygon using "Square Buffer" logic.
 */
export const expandLineToPolygon = (coords: Point[], bufferMeters: number) => {
  if (bufferMeters <= 0 || coords.length < 2) return coords;

  const n = coords.length;
  const centerLat = coords.reduce((sum, c) => sum + c.lat, 0) / n;
  const { latDeg, lngDeg } = metersToDegrees(bufferMeters, centerLat);

  const leftSide: Point[] = [];
  const rightSide: Point[] = [];

  for (let i = 0; i < n; i++) {
    const pPrev = i > 0 ? coords[i - 1] : null;
    const pCurr = coords[i];
    const pNext = i < n - 1 ? coords[i + 1] : null;

    let nx = 0, ny = 0;

    if (!pPrev && pNext) {
      // Start point: perpendicular to first segment
      const dx = (pNext.lng - pCurr.lng) / lngDeg;
      const dy = (pNext.lat - pCurr.lat) / latDeg;
      const len = Math.sqrt(dx * dx + dy * dy);
      nx = -dy / len;
      ny = dx / len;
    } else if (pPrev && !pNext) {
      // End point: perpendicular to last segment
      const dx = (pCurr.lng - pPrev.lng) / lngDeg;
      const dy = (pCurr.lat - pPrev.lat) / latDeg;
      const len = Math.sqrt(dx * dx + dy * dy);
      nx = -dy / len;
      ny = dx / len;
    } else if (pPrev && pNext) {
      // Intermediate point: average of normals (bisector)
      const dx1 = (pCurr.lng - pPrev.lng) / lngDeg;
      const dy1 = (pCurr.lat - pPrev.lat) / latDeg;
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const n1x = -dy1 / len1;
      const n1y = dx1 / len1;

      const dx2 = (pNext.lng - pCurr.lng) / lngDeg;
      const dy2 = (pNext.lat - pCurr.lat) / latDeg;
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      const n2x = -dy2 / len2;
      const n2y = dx2 / len2;

      const bx = n1x + n2x;
      const by = n1y + n2y;
      const bl = Math.sqrt(bx * bx + by * by);

      if (bl < 1e-6) {
        nx = n1x;
        ny = n1y;
      } else {
        const dot = n1x * n2x + n1y * n2y;
        const cosHalfAngleSq = (1.0 + dot) / 2.0;
        const miterScale = 1.0 / Math.sqrt(Math.max(cosHalfAngleSq, 0.01));
        const safeScale = Math.min(miterScale, 3);
        nx = (bx / bl) * safeScale;
        ny = (by / bl) * safeScale;
      }
    }

    leftSide.push({
      lat: pCurr.lat + ny * latDeg,
      lng: pCurr.lng + nx * lngDeg
    });
    rightSide.push({
      lat: pCurr.lat - ny * latDeg,
      lng: pCurr.lng - nx * lngDeg
    });
  }

  // Combine to form a closed polygon
  // Start with left side, then reverse right side
  return [...leftSide, ...rightSide.reverse(), leftSide[0]];
};

/**
 * Splits a line into segments of a given distance with a specified overlap.
 */
export const splitLineByDistance = (coords: Point[], segmentLengthMeters: number, overlapMeters: number = 20) => {
  if (coords.length < 2) return [coords];

  const line = turf.lineString(coords.map(c => [c.lng, c.lat]));
  const totalLength = turf.length(line, { units: 'meters' });

  if (totalLength <= segmentLengthMeters) return [coords];

  const segments: Point[][] = [];
  let currentStart = 0;

  while (currentStart < totalLength) {
    let currentEnd = currentStart + segmentLengthMeters;
    
    // If it's not the first segment, start overlapMeters before
    const actualStart = Math.max(0, currentStart - (segments.length > 0 ? overlapMeters : 0));
    const actualEnd = Math.min(totalLength, currentEnd);

    const sliced = turf.lineSliceAlong(line, actualStart, actualEnd, { units: 'meters' });
    const segmentCoords = sliced.geometry.coordinates.map(c => ({ lng: c[0], lat: c[1] }));
    
    segments.push(segmentCoords);
    
    if (actualEnd >= totalLength) break;
    currentStart = actualEnd;
  }

  return segments;
};

/**
 * Checks if a point is inside a polygon using ray-casting algorithm
 */
export const isPointInPolygon = (point: Point, polygon: Point[]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
        (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

/**
 * Returns the bounding box as a polygon (rectangle) snapped to 25m grid
 */
export const getGridPolygon = (coords: Point[], snapSize: number = 25) => {
  const { minLat, maxLat, minLng, maxLng } = getBoundingBox(coords);
  
  // To snap to 25m, we need to work in meters relative to a reference point
  const centerLat = (minLat + maxLat) / 2;
  const { latDeg, lngDeg } = metersToDegrees(snapSize, centerLat);
  
  // Snap min/max to grid
  const snappedMinLat = Math.floor(minLat / latDeg) * latDeg;
  const snappedMaxLat = Math.ceil(maxLat / latDeg) * latDeg;
  const snappedMinLng = Math.floor(minLng / lngDeg) * lngDeg;
  const snappedMaxLng = Math.ceil(maxLng / lngDeg) * lngDeg;
  
  return [
    { lat: snappedMinLat, lng: snappedMinLng },
    { lat: snappedMinLat, lng: snappedMaxLng },
    { lat: snappedMaxLat, lng: snappedMaxLng },
    { lat: snappedMaxLat, lng: snappedMinLng },
    { lat: snappedMinLat, lng: snappedMinLng }
  ];
};

/**
 * Calculates the area of a polygon in hectares using the Shoelace formula
 */
export const calculatePolygonArea = (coords: Point[]) => {
  if (coords.length < 3) return 0;
  
  // Convert lat/lng to meters relative to the first point for area calculation
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
  
  const areaM2 = Math.abs(area) / 2;
  return areaM2 / 10000; // Convert to hectares
};

/**
 * Generates a stepped (rectilinear) grid polygon that covers the original polygon
 * using the "Basamaklı Yaklaşım" (Stepped Approach).
 */
export const getSteppedGridPolygon = (
  coords: Point[],
  stepSize: number
) => {
  if (coords.length < 3 || stepSize <= 0) return coords;

  const bbox = getBoundingBox(coords);
  const centerLat = (bbox.minLat + bbox.maxLat) / 2;
  const { latDeg, lngDeg } = metersToDegrees(stepSize, centerLat);
  
  // Create grid boundaries
  const minLat = Math.floor(bbox.minLat / latDeg) * latDeg;
  const maxLat = Math.ceil(bbox.maxLat / latDeg) * latDeg;
  const minLng = Math.floor(bbox.minLng / lngDeg) * lngDeg;
  const maxLng = Math.ceil(bbox.maxLng / lngDeg) * lngDeg;
  
  const rows = Math.round((maxLat - minLat) / latDeg);
  const cols = Math.round((maxLng - minLng) / lngDeg);
  
  // Binary matrix
  const grid: number[][] = Array(rows).fill(0).map(() => Array(cols).fill(0));
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellMinLat = minLat + r * latDeg;
      const cellMaxLat = minLat + (r + 1) * latDeg;
      const cellMinLng = minLng + c * lngDeg;
      const cellMaxLng = minLng + (c + 1) * lngDeg;
      
      const cellCorners = [
        { lat: cellMinLat, lng: cellMinLng },
        { lat: cellMinLat, lng: cellMaxLng },
        { lat: cellMaxLat, lng: cellMaxLng },
        { lat: cellMaxLat, lng: cellMinLng },
        { lat: (cellMinLat + cellMaxLat) / 2, lng: (cellMinLng + cellMaxLng) / 2 }
      ];
      
      // Check if any cell corner/center is in polygon
      const isCellInPoly = cellCorners.some(p => isPointInPolygon(p, coords));
      
      // Check if any polygon vertex is in cell
      const isPolyInCell = coords.some(p => 
        p.lat >= cellMinLat && p.lat <= cellMaxLat && 
        p.lng >= cellMinLng && p.lng <= cellMaxLng
      );
      
      if (isCellInPoly || isPolyInCell) {
        grid[r][c] = 1;
      }
    }
  }

  // Collect all boundary edges
  const edges: [Point, Point][] = [];
  
  // Horizontal edges
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const above = r > 0 ? grid[r - 1][c] : 0;
      const below = r < rows ? grid[r][c] : 0;
      if (above !== below) {
        const lat = Math.max(bbox.minLat, Math.min(bbox.maxLat, minLat + r * latDeg));
        const lng1 = Math.max(bbox.minLng, Math.min(bbox.maxLng, minLng + c * lngDeg));
        const lng2 = Math.max(bbox.minLng, Math.min(bbox.maxLng, minLng + (c + 1) * lngDeg));
        if (Math.abs(lng1 - lng2) > 1e-10) {
          edges.push([
            { lat, lng: lng1 },
            { lat, lng: lng2 }
          ]);
        }
      }
    }
  }
  
  // Vertical edges
  for (let c = 0; c <= cols; c++) {
    for (let r = 0; r < rows; r++) {
      const left = c > 0 ? grid[r][c - 1] : 0;
      const right = c < cols ? grid[r][c] : 0;
      if (left !== right) {
        const lng = Math.max(bbox.minLng, Math.min(bbox.maxLng, minLng + c * lngDeg));
        const lat1 = Math.max(bbox.minLat, Math.min(bbox.maxLat, minLat + r * latDeg));
        const lat2 = Math.max(bbox.minLat, Math.min(bbox.maxLat, minLat + (r + 1) * latDeg));
        if (Math.abs(lat1 - lat2) > 1e-10) {
          edges.push([
            { lat: lat1, lng },
            { lat: lat2, lng }
          ]);
        }
      }
    }
  }

  if (edges.length === 0) return getGridPolygon(coords, 25);

  // Chain edges into a polygon
  // This is a simplified chaining that assumes a single closed loop
  const result: Point[] = [];
  let currentEdge = edges.shift()!;
  result.push(currentEdge[0]);
  let currentPoint = currentEdge[1];

  while (edges.length > 0) {
    result.push(currentPoint);
    const nextEdgeIndex = edges.findIndex(e => 
      (Math.abs(e[0].lat - currentPoint.lat) < 1e-10 && Math.abs(e[0].lng - currentPoint.lng) < 1e-10) ||
      (Math.abs(e[1].lat - currentPoint.lat) < 1e-10 && Math.abs(e[1].lng - currentPoint.lng) < 1e-10)
    );
    
    if (nextEdgeIndex === -1) break;
    
    const nextEdge = edges.splice(nextEdgeIndex, 1)[0];
    currentPoint = (Math.abs(nextEdge[0].lat - currentPoint.lat) < 1e-10 && Math.abs(nextEdge[0].lng - currentPoint.lng) < 1e-10)
      ? nextEdge[1]
      : nextEdge[0];
  }
  
  result.push(result[0]); // Close the loop
  return result;
};

/**
 * Computes 2D Convex Hull of a set of Cartesian points using Monotone Chain algorithm.
 */
function convexHull2D(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length <= 3) return [...points];
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const crossProduct = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: { x: number; y: number }[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: { x: number; y: number }[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Calculates the Minimum Area Rotated Bounding Box for a set of coordinates (Minimum Çevreleyen Dikdörtgen).
 */
export const getMinBoundingBoxPolygon = (coords: Point[]): Point[] => {
  if (coords.length < 3) return coords;

  const centerLat = coords.reduce((sum, c) => sum + c.lat, 0) / coords.length;
  const centerLng = coords.reduce((sum, c) => sum + c.lng, 0) / coords.length;
  const { latDeg, lngDeg } = metersToDegrees(1, centerLat);

  // Convert to Cartesian (x, y) in meters
  const points = coords.map(c => ({
    x: (c.lng - centerLng) / lngDeg,
    y: (c.lat - centerLat) / latDeg
  }));

  const hull = convexHull2D(points);
  if (hull.length < 3) return getGridPolygon(coords, 1);

  let minArea = Infinity;
  let bestAngle = 0;
  let bestBox = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  // Candidate angles from convex hull edges
  const angles: number[] = [];
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    const p1 = hull[i];
    const p2 = hull[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    angles.push(Math.atan2(dy, dx));
  }

  for (let a = 0; a < 180; a += 2) {
    angles.push((a * Math.PI) / 180);
  }

  for (const angle of angles) {
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const p of points) {
      const xr = p.x * cos - p.y * sin;
      const yr = p.x * sin + p.y * cos;
      if (xr < minX) minX = xr;
      if (xr > maxX) maxX = xr;
      if (yr < minY) minY = yr;
      if (yr > maxY) maxY = yr;
    }

    const area = (maxX - minX) * (maxY - minY);
    if (area < minArea) {
      minArea = area;
      bestAngle = angle;
      bestBox = { minX, maxX, minY, maxY };
    }
  }

  const cos = Math.cos(bestAngle);
  const sin = Math.sin(bestAngle);
  const { minX, maxX, minY, maxY } = bestBox;

  const rawCorners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY }
  ];

  const corners = rawCorners.map(c => {
    const x = c.x * cos - c.y * sin;
    const y = c.x * sin + c.y * cos;
    return {
      lat: centerLat + y * latDeg,
      lng: centerLng + x * lngDeg
    };
  });

  corners.push(corners[0]); // Close polygon
  return corners;
};

/**
 * Calculates the Optimal Flight Angle and estimates duration.
 * Finds the orientation angle that minimizes total flight turns (pass count)
 * and total flight time penalty (including climb, descent, turns, and overshoot).
 */
export const formatDurationText = (durationMinutes: number): string => {
  if (!durationMinutes || isNaN(durationMinutes) || durationMinutes <= 0) return '0dk 0sn';
  const totalSec = Math.round(durationMinutes * 60);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}dk ${secs}sn`;
};

export const calculateOptimumFlightAngle = (
  coords: Point[], 
  overlapSide: number = 70, 
  sensorWidth: number = 13.2, 
  focalLength: number = 8.8, 
  altitude: number = 120,
  droneSpeed: number = 10 // m/s (Flight cruise speed)
): { angle: number, durationMinutes: number, durationText: string } => {
  if (coords.length < 3) return { angle: 0, durationMinutes: 0, durationText: '0dk 0sn' };

  const centerLat = coords.reduce((sum, c) => sum + c.lat, 0) / coords.length;
  const centerLng = coords.reduce((sum, c) => sum + c.lng, 0) / coords.length;
  const { latDeg, lngDeg } = metersToDegrees(1, centerLat);

  // Convert to Cartesian (x, y) in meters where x = East, y = North
  const points = coords.map(c => ({
    x: (c.lng - centerLng) / lngDeg,
    y: (c.lat - centerLat) / latDeg
  }));

  const hull = convexHull2D(points);
  if (hull.length < 3) return { angle: 0, durationMinutes: 0, durationText: '0dk 0sn' };

  // Sensor geometry & footprint calculation
  const sensorHeight = sensorWidth * 0.667; // 3:2 aspect ratio standard for mapping sensors
  const footprintWidth = (altitude * sensorWidth) / focalLength;
  const footprintLength = (altitude * sensorHeight) / focalLength;
  const stripWidth = Math.max(1, footprintWidth * (1 - overlapSide / 100));
  const overshootMeters = Math.max(5, footprintLength / 4);

  // Ascent/Descent speeds & pre-flight margins (10 m/s climb/descent)
  const ascentSpeed = 10.0;  // m/s takeoff climb
  const descentSpeed = 10.0; // m/s landing descent
  const ascentTimeSec = altitude / ascentSpeed;
  const descentTimeSec = altitude / descentSpeed;
  const transitMarginSec = 15; // takeoff/landing hover margin

  let minFlightCost = Infinity;
  let bestAngleCompass = 0;
  let bestDurationMinutes = 0;

  const turnPenaltySeconds = 3; // Smooth curved turns in DJI Pilot 2

  // Candidate angles in Cartesian radians
  const candidateAngles: number[] = [];
  const n = hull.length;

  for (let i = 0; i < n; i++) {
    const p1 = hull[i];
    const p2 = hull[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    candidateAngles.push(Math.atan2(dy, dx));
  }
  
  // Sweep every 1 degree for high precision candidate search
  for (let deg = 0; deg < 180; deg += 1) {
    candidateAngles.push((deg * Math.PI) / 180);
  }

  for (const cartesianAngle of candidateAngles) {
    const cos = Math.cos(-cartesianAngle);
    const sin = Math.sin(-cartesianAngle);

    const rotatedPoints = points.map(p => ({
      x: p.x * cos - p.y * sin,
      y: p.x * sin + p.y * cos
    }));

    let minY = Infinity, maxY = -Infinity;
    for (const p of rotatedPoints) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const width = Math.max(0.1, maxY - minY);
    const passesCount = Math.max(1, Math.round(width / stripWidth));
    const actualSpan = (passesCount - 1) * stripWidth;
    const startY = minY + (width - actualSpan) / 2;

    let totalGridDistance = 0;
    let actualPassesCount = 0;
    const numPts = rotatedPoints.length;

    for (let i = 0; i < passesCount; i++) {
      const yPass = startY + i * stripWidth;
      const intersects: number[] = [];

      for (let j = 0; j < numPts; j++) {
        const p1 = rotatedPoints[j];
        const p2 = rotatedPoints[(j + 1) % numPts];

        if ((p1.y <= yPass && p2.y > yPass) || (p2.y <= yPass && p1.y > yPass)) {
          if (p1.y !== p2.y) {
            const t = (yPass - p1.y) / (p2.y - p1.y);
            const xInt = p1.x + t * (p2.x - p1.x);
            intersects.push(xInt);
          }
        }
      }

      if (intersects.length >= 2) {
        intersects.sort((a, b) => a - b);
        const lineLen = intersects[intersects.length - 1] - intersects[0];
        if (lineLen > 0.5) {
          totalGridDistance += lineLen;
          actualPassesCount++;
        }
      }
    }

    const gridTimeSec = totalGridDistance / Math.max(1, droneSpeed);
    // Connecting U-turn distance between passes (semicircle turn arc = pi/2 * stripWidth)
    const transitionCount = Math.max(0, actualPassesCount - 1);
    const turnConnectDistance = transitionCount * (stripWidth * Math.PI / 2);
    const turnConnectTimeSec = turnConnectDistance / Math.max(1, droneSpeed);
    // Double turn maneuver per pass transition (exit turn + entry alignment turn)
    // Each turn maneuver takes ~2 seconds for acceleration/deceleration and heading change
    const turnDelaySec = transitionCount * 2 * 2.0;

    const totalTimeSeconds = ascentTimeSec + descentTimeSec + transitMarginSec + gridTimeSec + turnConnectTimeSec + turnDelaySec;

    if (totalTimeSeconds < minFlightCost) {
      minFlightCost = totalTimeSeconds;
      
      // Convert Cartesian angle (0 rad = East, pi/2 rad = North) to Compass Bearing (0 deg = North, 90 deg = East)
      let degCartesian = (cartesianAngle * 180 / Math.PI) % 180;
      if (degCartesian < 0) degCartesian += 180;
      
      let compassBearing = (90 - degCartesian) % 180;
      if (compassBearing < 0) compassBearing += 180;

      // Snap to exact cardinal angles (0° or 90°) if very close
      if (Math.abs(compassBearing - 0) < 3 || Math.abs(compassBearing - 180) < 3) compassBearing = 0;
      if (Math.abs(compassBearing - 90) < 3) compassBearing = 90;

      bestAngleCompass = Math.round(compassBearing);
      bestDurationMinutes = totalTimeSeconds / 60;
    }
  }

  return { 
    angle: bestAngleCompass, 
    durationMinutes: Math.max(0.1, Math.round(bestDurationMinutes * 100) / 100),
    durationText: formatDurationText(bestDurationMinutes)
  };
};

/**
 * Calculates the overall bearing (compass angle 0-360) of a LineString.
 */
export const calculateLineBearing = (lineCoords: Point[]): number => {
  if (!lineCoords || lineCoords.length < 2) return 0;
  const p1 = turf.point([lineCoords[0].lng, lineCoords[0].lat]);
  const p2 = turf.point([lineCoords[lineCoords.length - 1].lng, lineCoords[lineCoords.length - 1].lat]);
  let b = Math.round(turf.bearing(p1, p2));
  if (b < 0) b += 360;
  return b;
};

/**
 * Generates corridor/strip flight route parallel to the center line (LineString).
 * Spaces parallel passes based on stripBuffer and side overlap.
 */
export const generateStripFlightRoute = (
  lineCoords: Point[],
  stripBuffer: number = 50,
  overlapSide: number = 70,
  overlapFront: number = 80,
  sensorWidth: number = 13.2,
  focalLength: number = 8.8,
  altitude: number = 120
): Point[] => {
  if (!lineCoords || lineCoords.length < 2) return [];

  // Footprint & strip width calculation
  const footprintWidth = (altitude * sensorWidth) / focalLength;
  const stripWidth = Math.max(1, footprintWidth * (1 - Math.min(95, Math.max(10, overlapSide)) / 100));

  // Total corridor width is 2 * stripBuffer (buffer on left and right)
  const totalWidth = stripBuffer * 2;
  const passesCount = Math.max(1, Math.round(totalWidth / stripWidth));

  const totalSpan = (passesCount - 1) * stripWidth;
  const startOffset = -totalSpan / 2;

  const lineGeoJson = turf.lineString(lineCoords.map(c => [c.lng, c.lat]));

  const route: Point[] = [];

  for (let i = 0; i < passesCount; i++) {
    const offsetDist = passesCount === 1 ? 0 : (startOffset + i * stripWidth);
    
    let passPoints: Point[] = [];
    if (Math.abs(offsetDist) < 0.1) {
      passPoints = lineCoords.map(c => ({ lat: c.lat, lng: c.lng }));
    } else {
      try {
        const offsetGeo = turf.lineOffset(lineGeoJson, offsetDist, { units: 'meters' });
        passPoints = offsetGeo.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
      } catch (err) {
        passPoints = lineCoords.map(c => ({ lat: c.lat, lng: c.lng }));
      }
    }

    // Reverse alternate passes for smooth serpentine flight
    if (i % 2 === 1) {
      passPoints.reverse();
    }

    passPoints.forEach(p => route.push(p));
  }

  return route;
};

/**
 * Generates estimated photogrammetric lawnmower flight path route matching DJI Pilot 2 logic.
 * Trims flight lines strictly to polygon boundary edges (no overshoot outside restriction area).
 */
export const generateFlightRoute = (
  polygonCoords: Point[],
  angleCompass: number = 0,
  overlapSide: number = 70,
  overlapFront: number = 80,
  sensorWidth: number = 13.2,
  focalLength: number = 8.8,
  altitude: number = 120
): Point[] => {
  if (!polygonCoords || polygonCoords.length < 3) return [];

  const centerLat = polygonCoords.reduce((sum, c) => sum + c.lat, 0) / polygonCoords.length;
  const centerLng = polygonCoords.reduce((sum, c) => sum + c.lng, 0) / polygonCoords.length;
  const { latDeg, lngDeg } = metersToDegrees(1, centerLat);

  // Convert polygon points to local Cartesian meters (x = East, y = North)
  const cartesianPoly = polygonCoords.map(c => ({
    x: (c.lng - centerLng) / lngDeg,
    y: (c.lat - centerLat) / latDeg
  }));

  // Convert Compass angle (0° = North, 90° = East) to Cartesian angle (rad)
  let degCartesian = (90 - angleCompass) % 180;
  if (degCartesian < 0) degCartesian += 180;
  const theta = (degCartesian * Math.PI) / 180;

  const cos = Math.cos(-theta);
  const sin = Math.sin(-theta);

  // Rotate points so flight direction aligns with X-axis
  const rotatedPoly = cartesianPoly.map(p => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos
  }));

  // Find bounding box in rotated space
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const p of rotatedPoly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  // Camera footprint & strip width calculation
  const footprintWidth = (altitude * sensorWidth) / focalLength;
  const stripWidth = Math.max(1, footprintWidth * (1 - Math.min(95, Math.max(10, overlapSide)) / 100));

  const width = maxY - minY;
  if (width <= 0) return [];

  const passesCount = Math.max(1, Math.round(width / stripWidth));
  const actualSpan = (passesCount - 1) * stripWidth;
  const startY = minY + (width - actualSpan) / 2;

  const routeRotated: { x: number; y: number }[] = [];

  for (let i = 0; i < passesCount; i++) {
    const yPass = startY + i * stripWidth;

    // Find intersections of line y = yPass with polygon edges in rotated space
    const intersects: number[] = [];
    const n = rotatedPoly.length;
    for (let j = 0; j < n; j++) {
      const p1 = rotatedPoly[j];
      const p2 = rotatedPoly[(j + 1) % n];

      if ((p1.y <= yPass && p2.y > yPass) || (p2.y <= yPass && p1.y > yPass)) {
        if (p1.y !== p2.y) {
          const t = (yPass - p1.y) / (p2.y - p1.y);
          const xInt = p1.x + t * (p2.x - p1.x);
          intersects.push(xInt);
        }
      }
    }

    if (intersects.length < 2) continue;

    intersects.sort((a, b) => a - b);
    const lineMinX = intersects[0];
    const lineMaxX = intersects[intersects.length - 1];

    if (lineMaxX - lineMinX < 1) continue; // Skip near zero length passes

    // DJI Pilot 2 behavior: exact polygon boundary intersection clipping (no overshoot outside boundary)
    if (i % 2 === 0) {
      routeRotated.push({ x: lineMinX, y: yPass });
      routeRotated.push({ x: lineMaxX, y: yPass });
    } else {
      routeRotated.push({ x: lineMaxX, y: yPass });
      routeRotated.push({ x: lineMinX, y: yPass });
    }
  }

  // Convert back to original coordinate system
  const invCos = Math.cos(theta);
  const invSin = Math.sin(theta);

  return routeRotated.map(p => {
    const x = p.x * invCos - p.y * invSin;
    const y = p.x * invSin + p.y * invCos;
    return {
      lat: centerLat + y * latDeg,
      lng: centerLng + x * lngDeg
    };
  });
};

/**
 * Calculates complete DJI Pilot 2 style flight statistics.
 */
export const calculateDJIPilot2Stats = (
  route: Point[],
  altitude: number = 100,
  sensorWidth: number = 35.9,
  focalLength: number = 35,
  imageWidthPx: number = 8192,
  overlapFront: number = 80,
  flightSpeed: number = 10 // m/s
) => {
  if (!route || route.length < 2) {
    return {
      totalDistanceMeters: 0,
      durationText: '0 dk 0 s',
      durationMinutes: 0,
      waypointCount: 0,
      photoCount: 0,
      gsdCm: 0
    };
  }

  // Calculate GSD (cm/px)
  const gsdCm = (altitude * sensorWidth * 100) / (focalLength * imageWidthPx);

  // Calculate total route distance (in meters)
  let totalDistanceMeters = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i];
    const p2 = route[i + 1];
    const latMid = (p1.lat + p2.lat) / 2;
    const { latDeg, lngDeg } = metersToDegrees(1, latMid);
    const dx = (p2.lng - p1.lng) / lngDeg;
    const dy = (p2.lat - p1.lat) / latDeg;
    totalDistanceMeters += Math.sqrt(dx * dx + dy * dy);
  }

  // Waypoints (endpoints of each pass segment)
  const waypointCount = route.length;

  // Sensor height & ground footprint height
  const sensorHeight = sensorWidth * 0.667;
  const footprintHeight = (altitude * sensorHeight) / focalLength;
  const photoDistance = Math.max(1, footprintHeight * (1 - Math.min(95, Math.max(10, overlapFront)) / 100));

  // Photo count estimation across pass segments
  let photoCount = 0;
  for (let i = 0; i < route.length - 1; i += 2) {
    const p1 = route[i];
    const p2 = route[i + 1];
    const latMid = (p1.lat + p2.lat) / 2;
    const { latDeg, lngDeg } = metersToDegrees(1, latMid);
    const dx = (p2.lng - p1.lng) / lngDeg;
    const dy = (p2.lat - p1.lat) / latDeg;
    const passLength = Math.sqrt(dx * dx + dy * dy);

    photoCount += Math.max(1, Math.floor(passLength / photoDistance) + 1);
  }

  // Flight duration calculation:
  // Speed during flight: flightSpeed (10 m/s)
  // Takeoff/climb and descent speed: 10 m/s
  const flightTimeSec = totalDistanceMeters / Math.max(1, flightSpeed);
  const climbDescentTimeSec = (altitude / 10.0) + (altitude / 10.0) + 15; // ascent/descent at 10m/s + margin
  const totalSec = Math.round(flightTimeSec + climbDescentTimeSec);

  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const durationText = `${mins} dk. ${secs} s.`;
  const durationMinutes = Math.round((totalSec / 60) * 10) / 10;

  return {
    totalDistanceMeters: Math.round(totalDistanceMeters),
    durationText,
    durationMinutes,
    waypointCount,
    photoCount,
    gsdCm: Math.round(gsdCm * 100) / 100
  };
};
