// Shared interfaces for GPS coordinates and saved location data
export interface Coordinate {
  lat: number;
  lng: number;
  accuracy: number;
  altitude: number | null;
  timestamp: number;
}

export interface SavedLocation extends Coordinate {
  id: string;
  name: string;
  folderName: string;
  description?: string;
  coordinateSystem?: string;
}

export interface AppSettings {
  defaultCoordinateSystem: string;
  defaultAccuracyLimit: number;
  defaultMeasurementDuration: number;
  alertsEnabled: boolean;
  screenAlwaysOn: boolean;
  mapProvider: string;
}
