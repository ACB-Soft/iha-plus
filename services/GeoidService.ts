import { Coordinate } from '../types';
import { TG20_DATA } from './tg20Data';
import { EGM96_TURKEY_DATA, EGM96_TURKEY_PARAMS } from './egm96Data';

// TG-20 Grid Parameters (from ISG header)
const TG20_PARAMS = {
  latMin: 35.05, // 35°03'00"
  latMax: 42.9666667, // 42°58'00"
  lonMin: 25.0333333, // 25°02'00"
  lonMax: 44.95, // 44°57'00"
  deltaLat: 0.0833333, // 5'
  deltaLon: 0.0833333, // 5'
  nrows: 96,
  ncols: 240,
  noData: -9999.0
};

class GeoidService {
  private tg20Grid: Float32Array | null = null;
  private egm96Grid: Float32Array | null = null;
  private isLoaded = false;

  constructor() {
    this.initialize();
  }

  initialize() {
    if (this.isLoaded) return;
    
    try {
      // Offline Support: Using embedded data
      this.tg20Grid = TG20_DATA;
      this.egm96Grid = EGM96_TURKEY_DATA;
      this.isLoaded = true;
      console.log('TG-20 ve Hassas EGM96 Modelleri başarıyla yüklendi (Tam Çevrimdışı Destek)');
    } catch (error) {
      console.error('Veri modelleri yüklenirken hata oluştu:', error);
    }
  }

  getUndulation(lat: number, lon: number, model: 'TG-20' | 'EGM96' = 'TG-20'): number {
    if (!this.isLoaded) return 0;

    if (model === 'TG-20') {
      return this.calculateUndulation(lat, lon, this.tg20Grid, TG20_PARAMS);
    } else {
      return this.calculateUndulation(lat, lon, this.egm96Grid, {
        latMin: EGM96_TURKEY_PARAMS.latMin,
        latMax: EGM96_TURKEY_PARAMS.latMax,
        lonMin: EGM96_TURKEY_PARAMS.lonMin,
        lonMax: EGM96_TURKEY_PARAMS.lonMax,
        deltaLat: EGM96_TURKEY_PARAMS.delta,
        deltaLon: EGM96_TURKEY_PARAMS.delta,
        nrows: EGM96_TURKEY_PARAMS.nrows,
        ncols: EGM96_TURKEY_PARAMS.ncols,
        noData: -9999.0
      });
    }
  }

  private calculateUndulation(lat: number, lon: number, grid: Float32Array | null, params: any): number {
    if (!grid) return 0;

    // Check bounds
    if (lat < params.latMin || lat > params.latMax || 
        lon < params.lonMin || lon > params.lonMax) {
      return 0; // Outside grid
    }

    // Calculate grid indices
    const rowFloat = (params.latMax - lat) / params.deltaLat;
    const colFloat = (lon - params.lonMin) / params.deltaLon;

    const r0 = Math.floor(rowFloat);
    const c0 = Math.floor(colFloat);
    const r1 = Math.min(r0 + 1, params.nrows - 1);
    const c1 = Math.min(c0 + 1, params.ncols - 1);

    // Bilinear interpolation
    const dr = rowFloat - r0;
    const dc = colFloat - c0;

    // Get values at 4 corners
    const v00 = grid[r0 * params.ncols + c0];
    const v01 = grid[r0 * params.ncols + c1];
    const v10 = grid[r1 * params.ncols + c0];
    const v11 = grid[r1 * params.ncols + c1];

    // Handle NoData
    if (v00 === params.noData || v01 === params.noData || 
        v10 === params.noData || v11 === params.noData) {
      return 0;
    }

    // Interpolate
    const top = v00 * (1 - dc) + v01 * dc;
    const bottom = v10 * (1 - dc) + v11 * dc;
    const val = top * (1 - dr) + bottom * dr;

    return val;
  }
}

export const geoidService = new GeoidService();
