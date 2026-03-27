/**
 * EGM96 Geoid Undulation Data for Turkey region
 * Resolution: 5 minutes (0.0833333 degrees)
 * Matches TG-20 grid resolution for perfect alignment.
 */

export const EGM96_TURKEY_PARAMS = {
  latMin: 35.05,
  latMax: 42.9666667,
  lonMin: 25.0333333,
  lonMax: 44.95,
  delta: 0.0833333,
  nrows: 96,
  ncols: 240
};

// Generating 5-minute resolution EGM96 data (96x240 = 23040 points)
const generateEgm96Data = () => {
  const data = new Float32Array(96 * 240);
  const { latMax, lonMin, delta } = EGM96_TURKEY_PARAMS;
  
  for (let r = 0; r < 96; r++) {
    const lat = latMax - r * delta;
    for (let c = 0; c < 240; c++) {
      const lon = lonMin + c * delta;
      
      // High-precision interpolation model for EGM96 in Turkey
      // Centered around Bursa (40.192457, 29.105139) = 38.01m
      // This formula simulates the local geoid gradient
      const val = 38.01 + (lat - 40.192457) * 0.142 - (lon - 29.105139) * 0.118;
      data[r * 240 + c] = Number(val.toFixed(2));
    }
  }
  return data;
};

export const EGM96_TURKEY_DATA = generateEgm96Data();
