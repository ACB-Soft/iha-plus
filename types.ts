// Shared interfaces for application settings
export interface FlightPlanDefaults {
  defaultCameraName: string;
  defaultIsCameraStepEnabled: boolean;
  defaultHeight: number;
  defaultBuffer: number;
  defaultExpandToGrid: number;
  defaultExpandToRectangle: boolean;
  defaultStripBuffer: number;
  defaultIsStripSplitEnabled: boolean;
  defaultStripSplitDistance: number;
  defaultIsGcpEnabled: boolean;
  defaultGcpDistance: number;
  defaultGcpStartOffset: number;
  defaultGcpStartNumber: number;
}

export interface AppSettings {
  mapProvider: string;
  flightDefaults: FlightPlanDefaults;
}

export const DEFAULT_FLIGHT_DEFAULTS: FlightPlanDefaults = {
  defaultCameraName: 'DJI Zenmuse P1 (35mm)',
  defaultIsCameraStepEnabled: false,
  defaultHeight: 200,
  defaultBuffer: 0,
  defaultExpandToGrid: 0,
  defaultExpandToRectangle: false,
  defaultStripBuffer: 50,
  defaultIsStripSplitEnabled: false,
  defaultStripSplitDistance: 2000,
  defaultIsGcpEnabled: false,
  defaultGcpDistance: 400,
  defaultGcpStartOffset: 10,
  defaultGcpStartNumber: 1,
};
