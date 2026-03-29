// Shared interfaces for application settings
export interface AppSettings {
  mapProvider: string;
  flightPlan: {
    defaultHeight: number;
    defaultBuffer: number;
    defaultExpandToGrid: number;
    defaultExpandToRectangle: boolean;
    defaultStripBuffer: number;
    defaultStripSplitDistance: number;
  };
  gcpPlan: {
    defaultDistance: number;
    defaultStartOffset: number;
  };
}
