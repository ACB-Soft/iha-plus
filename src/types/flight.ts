export interface Camera {
  name: string;
  sensorWidth: number; // mm
  focalLength: number; // mm
  imageWidth: number; // pixels
}

export const CAMERAS: Camera[] = [
  { name: 'DJI Zenmuse P1 (35mm)', sensorWidth: 35.9, focalLength: 35, imageWidth: 8192 },
  { name: 'DJI Zenmuse P1 (24mm)', sensorWidth: 35.9, focalLength: 24, imageWidth: 8192 },
  { name: 'DJI Zenmuse P1 (50mm)', sensorWidth: 35.9, focalLength: 50, imageWidth: 8192 },
  { name: 'DJI Mavic 3 Enterprise', sensorWidth: 17.3, focalLength: 12.3, imageWidth: 5280 },
  { name: 'DJI Phantom 4 RTK', sensorWidth: 13.2, focalLength: 8.8, imageWidth: 5472 },
  { name: 'DJI Zenmuse L1', sensorWidth: 12.8, focalLength: 8.8, imageWidth: 5472 },
  { name: 'Autel EVO II Pro RTK', sensorWidth: 13.2, focalLength: 9, imageWidth: 5472 },
  { name: 'Sony a7R IV (35mm)', sensorWidth: 35.7, focalLength: 35, imageWidth: 9504 },
  { name: 'Sony a7R IV (24mm)', sensorWidth: 35.7, focalLength: 24, imageWidth: 9504 },
  { name: 'Phase One iXM-100 (35mm)', sensorWidth: 43.9, focalLength: 35, imageWidth: 11664 },
  { name: 'Phase One iXM-100 (80mm)', sensorWidth: 43.9, focalLength: 80, imageWidth: 11664 },
  { name: 'Phase One iXM-RS150F', sensorWidth: 53.4, focalLength: 50, imageWidth: 14204 },
  { name: 'WingtraOne Sony RX1R II', sensorWidth: 35.9, focalLength: 35, imageWidth: 7952 },
  { name: 'SenseFly eBee X (S.O.D.A.)', sensorWidth: 13.2, focalLength: 10.6, imageWidth: 5472 },
  { name: 'DJI Mini 3 Pro', sensorWidth: 9.6, focalLength: 6.7, imageWidth: 8064 },
  { name: 'DJI Air 2S', sensorWidth: 13.2, focalLength: 8.8, imageWidth: 5472 },
];

export const SCALES = ['1/500', '1/1000', '1/5000'];

export const SCALE_TARGET_GSD: Record<string, number> = {
  '1/500': 3,
  '1/1000': 6,
  '1/5000': 30
};

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
  gcpDistance?: number;
  gcpStartOffset?: number;
  stripBuffer?: number;
  stripSplitDistance?: number;
}
