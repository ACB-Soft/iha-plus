export interface Camera {
  name: string;
  sensorWidth: number; // mm
  focalLength: number; // mm
  imageWidth: number; // pixels
  isCustom?: boolean;
}

export const CAMERAS: Camera[] = [
  // DJI Matrice 4 & New Series
  { name: 'DJI Matrice 4E / Matrice 4 (Geniş)', sensorWidth: 17.3, focalLength: 12.3, imageWidth: 5280 },
  { name: 'DJI Matrice 4T (Termal / Geniş)', sensorWidth: 17.3, focalLength: 12.3, imageWidth: 5280 },
  { name: 'DJI Matrice 3D / 3TD (Dock 2)', sensorWidth: 17.3, focalLength: 12.3, imageWidth: 5280 },
  { name: 'DJI Matrice 30 / 30T', sensorWidth: 6.4, focalLength: 4.5, imageWidth: 4000 },
  { name: 'DJI Zenmuse L2 (Matrice 350)', sensorWidth: 17.3, focalLength: 12.3, imageWidth: 5280 },
  { name: 'DJI Zenmuse P1 (35mm)', sensorWidth: 35.9, focalLength: 35, imageWidth: 8192 },
  { name: 'DJI Zenmuse P1 (24mm)', sensorWidth: 35.9, focalLength: 24, imageWidth: 8192 },
  { name: 'DJI Zenmuse P1 (50mm)', sensorWidth: 35.9, focalLength: 50, imageWidth: 8192 },
  { name: 'DJI Zenmuse L1', sensorWidth: 12.8, focalLength: 8.8, imageWidth: 5472 },
  
  // DJI Enterprise Series
  { name: 'DJI Mavic 3 Enterprise (M3E)', sensorWidth: 17.3, focalLength: 12.3, imageWidth: 5280 },
  { name: 'DJI Mavic 3 Thermal (M3T)', sensorWidth: 6.4, focalLength: 4.5, imageWidth: 4000 },
  { name: 'DJI Mavic 3 Multispectral (M3M)', sensorWidth: 17.3, focalLength: 12.3, imageWidth: 5280 },
  { name: 'DJI Phantom 4 RTK', sensorWidth: 13.2, focalLength: 8.8, imageWidth: 5472 },

  // Autel Series
  { name: 'Autel EVO Max 4T / 4N', sensorWidth: 9.6, focalLength: 4.5, imageWidth: 8000 },
  { name: 'Autel EVO II Pro RTK', sensorWidth: 13.2, focalLength: 9.0, imageWidth: 5472 },

  // Consumer / Prosumer DJI
  { name: 'DJI Mini 4 Pro / Mini 3 Pro', sensorWidth: 9.6, focalLength: 6.7, imageWidth: 8064 },
  { name: 'DJI Air 3 / Air 2S', sensorWidth: 13.2, focalLength: 8.8, imageWidth: 5472 },

  // Surveying / Professional Cameras
  { name: 'Sony a7R IV (35mm)', sensorWidth: 35.7, focalLength: 35, imageWidth: 9504 },
  { name: 'Sony a7R IV (24mm)', sensorWidth: 35.7, focalLength: 24, imageWidth: 9504 },
  { name: 'Phase One iXM-100 (35mm)', sensorWidth: 43.9, focalLength: 35, imageWidth: 11664 },
  { name: 'Phase One iXM-100 (80mm)', sensorWidth: 43.9, focalLength: 80, imageWidth: 11664 },
  { name: 'Phase One iXM-RS150F', sensorWidth: 53.4, focalLength: 50, imageWidth: 14204 },
  { name: 'WingtraOne Sony RX1R II', sensorWidth: 35.9, focalLength: 35, imageWidth: 7952 },
  { name: 'SenseFly eBee X (S.O.D.A.)', sensorWidth: 13.2, focalLength: 10.6, imageWidth: 5472 },

  // Custom Camera Option
  { name: 'Özel / Diğer Kamera Model', sensorWidth: 13.2, focalLength: 8.8, imageWidth: 5472, isCustom: true }
];

export const SCALES = ['1/500', '1/1000', '1/5000'];

export const SCALE_TARGET_GSD: Record<string, number> = {
  '1/500': 3,
  '1/1000': 6,
  '1/5000': 30
};

export interface KMLFeature {
  name: string;
  description: string;
  coordinates: { lat: number; lng: number; alt?: number }[];
  type: 'Point' | 'LineString' | 'Polygon';
}

export interface KMLData {
  name: string;
  features: KMLFeature[];
}

export interface FlightConfig {
  flightType: 'Normal' | 'Strip';
  camera: Camera;
  scale: string;
  gsd: number;
  height: number;
  buffer: number;
  expandToGrid: number; // 0 for "Yok", or step size in meters
  overlapFront: number;
  overlapSide: number;
  expandToRectangle: boolean;
  expandToMinRectangle?: boolean;
  gcpDistance?: number;
  gcpStartOffset?: number;
  gcpStartNumber?: number;
  gcpLayoutType?: 'Normal' | 'Strip';
  stripBuffer?: number;
  stripSplitDistance?: number;
  flightAngle?: number;
  subAreaKmlData?: KMLData | null;
}
