import L from 'leaflet';

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
  
  const centerLat = coords.reduce((sum, c) => sum + c.lat, 0) / coords.length;
  const { latDeg, lngDeg } = metersToDegrees(bufferMeters, centerLat);

  const n = coords.length;
  const result: Point[] = [];
  
  // Determine orientation (CW or CCW) to ensure outward expansion
  let area = 0;
  for (let i = 0; i < n; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % n];
    area += (p2.lng - p1.lng) * (p2.lat + p1.lat);
  }
  const isCCW = area < 0;

  for (let i = 0; i < n; i++) {
    const p1 = coords[(i - 1 + n) % n];
    const p2 = coords[i];
    const p3 = coords[(i + 1) % n];
    
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
    // For CCW, outward normal of (dx, dy) is (dy, -dx)
    // For CW, outward normal of (dx, dy) is (-dy, dx)
    const sign = isCCW ? 1 : -1;
    const n1 = { x: sign * v1.y / l1, y: -sign * v1.x / l1 };
    const n2 = { x: sign * v2.y / l2, y: -sign * v2.x / l2 };
    
    // Bisector vector
    const bx = n1.x + n2.x;
    const by = n1.y + n2.y;
    const bl = Math.sqrt(bx * bx + by * by);
    
    if (bl < 1e-6) {
      // Parallel edges (180 deg turn), use normal
      result.push({ 
        lat: p2.lat + n1.y * latDeg, 
        lng: p2.lng + n1.x * lngDeg 
      });
    } else {
      // Miter length calculation: dist = buffer / cos(half_angle_between_normals)
      const dot = n1.x * n2.x + n1.y * n2.y;
      const cosHalfAngleSq = (1.0 + dot) / 2.0;
      const miterScale = 1.0 / Math.sqrt(Math.max(cosHalfAngleSq, 0.01));
      
      // Limit scale to avoid extreme spikes at sharp corners
      const safeScale = Math.min(miterScale, 3);
      
      result.push({
        lat: p2.lat + (by / bl) * safeScale * latDeg,
        lng: p2.lng + (bx / bl) * safeScale * lngDeg
      });
    }
  }
  
  return result;
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
 * Calculates distance between two points in meters using Haversine formula
 */
export const calculateDistance = (p1: Point, p2: Point) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = p1.lat * Math.PI / 180;
  const φ2 = p2.lat * Math.PI / 180;
  const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
  const Δλ = (p2.lng - p1.lng) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

/**
 * Generates flight lines within a polygon, clipped to its boundaries and connected by turns.
 */
export const generateFlightLines = (
  polygon: Point[],
  altitude: number,
  sensorWidth: number,
  focalLength: number,
  sideOverlap: number
) => {
  if (polygon.length < 3) return [];

  const bbox = getBoundingBox(polygon);
  const groundSwathWidth = altitude * (sensorWidth / focalLength);
  const spacingMeters = groundSwathWidth * (1 - sideOverlap / 100);
  
  const centerLat = (bbox.minLat + bbox.maxLat) / 2;
  const centerLng = (bbox.minLng + bbox.maxLng) / 2;
  const { lngDeg } = metersToDegrees(spacingMeters, centerLat);
  
  const totalWidthDeg = bbox.maxLng - bbox.minLng;
  const numLines = Math.max(1, Math.ceil(totalWidthDeg / lngDeg));
  
  const totalSpanDeg = (numLines - 1) * lngDeg;
  const startLng = centerLng - totalSpanDeg / 2;
  
  const path: Point[] = [];
  
  for (let i = 0; i < numLines; i++) {
    const currentLng = startLng + i * lngDeg;
    
    // Find all intersections of the vertical line at currentLng with polygon edges
    const intersections: number[] = [];
    for (let j = 0; j < polygon.length; j++) {
      const p1 = polygon[j];
      const p2 = polygon[(j + 1) % polygon.length];
      
      if ((p1.lng <= currentLng && p2.lng > currentLng) || (p2.lng <= currentLng && p1.lng > currentLng)) {
        const t = (currentLng - p1.lng) / (p2.lng - p1.lng);
        const intersectLat = p1.lat + t * (p2.lat - p1.lat);
        intersections.push(intersectLat);
      }
    }
    
    if (intersections.length < 2) continue;
    
    // Sort intersections by latitude
    intersections.sort((a, b) => a - b);
    
    // Create segments (pairs of intersections)
    // For a simple convex polygon, there will be exactly 2 intersections.
    // For concave, there could be more.
    const segments: [number, number][] = [];
    for (let j = 0; j < intersections.length - 1; j += 2) {
      segments.push([intersections[j], intersections[j + 1]]);
    }
    
    // Zigzag direction: alternate up and down
    const goingUp = i % 2 === 0;
    
    if (goingUp) {
      // Add segments from bottom to top
      for (const seg of segments) {
        path.push({ lat: seg[0], lng: currentLng });
        path.push({ lat: seg[1], lng: currentLng });
      }
    } else {
      // Add segments from top to bottom
      for (let j = segments.length - 1; j >= 0; j--) {
        path.push({ lat: segments[j][1], lng: currentLng });
        path.push({ lat: segments[j][0], lng: currentLng });
      }
    }
  }
  
  // Return as a single continuous line (including turns)
  return path.length > 0 ? [path] : [];
};
