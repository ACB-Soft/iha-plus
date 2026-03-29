import L from 'leaflet';

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
