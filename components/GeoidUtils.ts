
import { geoidService } from '../services/GeoidService';

export interface GeoidInfo {
  orthometricHeight: number | null;
  undulation: number;
  model: 'TG-20' | 'EGM96' | 'None';
  isSmartCorrectionApplied: boolean;
}

export const getGeoidInfo = (lat: number, lng: number, inputHeight: number | null): GeoidInfo => {
  if (inputHeight === null) {
    return { orthometricHeight: null, undulation: 0, model: 'None', isSmartCorrectionApplied: false };
  }
  
  const tg20Undulation = geoidService.getUndulation(lat, lng, 'TG-20');
  const egm96Undulation = geoidService.getUndulation(lat, lng, 'EGM96');
  
  // 1. Detect OS
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) || (typeof navigator !== 'undefined' && (navigator as any).platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
  
  let finalHeight = inputHeight;
  let usedUndulation = 0;
  let usedModel: 'TG-20' | 'EGM96' | 'None' = 'None';
  let isSmartCorrectionApplied = false;

  // Logic:
  // Android provides Ellipsoidal Height (h).
  // iOS provides Orthometric Height (H_egm96).
  
  if (tg20Undulation !== 0) {
    // Inside Turkey (TG-20 available)
    usedModel = 'TG-20';
    usedUndulation = tg20Undulation;
    isSmartCorrectionApplied = true;

    if (isIOS) {
      // iOS (Input = H_egm96) -> Convert to H_tg20
      // Step 1: Recover h = H_egm96 + N_egm96
      // Step 2: Calculate H_tg20 = h - N_tg20
      // Combined: H_tg20 = Input + N_egm96 - N_tg20
      finalHeight = inputHeight + egm96Undulation - tg20Undulation;
    } else {
      // Android (Input = h) -> Convert to H_tg20
      // H_tg20 = h - N_tg20
      finalHeight = inputHeight - tg20Undulation;
    }
  } else {
    // Outside Turkey (Fallback to EGM96)
    usedModel = 'EGM96';
    usedUndulation = egm96Undulation;
    
    if (isIOS) {
      // iOS (Input = H_egm96) -> Already correct for EGM96
      finalHeight = inputHeight;
      isSmartCorrectionApplied = false; // No extra correction needed
    } else {
      // Android (Input = h) -> Convert to H_egm96
      finalHeight = inputHeight - egm96Undulation;
      isSmartCorrectionApplied = true;
    }
  }

  return {
    orthometricHeight: finalHeight,
    undulation: usedUndulation,
    model: usedModel,
    isSmartCorrectionApplied: isSmartCorrectionApplied
  };
};

export const getCorrectedHeight = (lat: number, lng: number, ellipsoidalHeight: number | null): number | null => {
  return getGeoidInfo(lat, lng, ellipsoidalHeight).orthometricHeight;
};

export const convertToMSL = (lat: number, lng: number, ellipsoidalHeight: number | null): number | null => {
  return getCorrectedHeight(lat, lng, ellipsoidalHeight);
};
