import proj4 from 'proj4';

// WGS84 zaten proj4'ün varsayılanı
const WGS84 = 'EPSG:4326';

// ITRF96 ~ WGS84 kabul edilebilir pratik kullanımda (hassas dönüşüm için parametreler gerekir ama mobil GPS hassasiyeti için ihmal edilebilir)
// UTM Dilim hesaplama fonksiyonu
const getUTMZone = (lon: number) => {
  return Math.floor((lon + 180) / 6) + 1;
};

const getDom3 = (lon: number) => {
    // 3 derecelik dilim orta meridyeni
    // Türkiye için dilimler: 27, 30, 33, 36, 39, 42, 45
    // Formül: DOM = Round(lon / 3) * 3
    return Math.round(lon / 3) * 3;
};

const getDom6 = (lon: number) => {
    // 6 derecelik dilim orta meridyeni (UTM)
    // Zone = floor((lon + 180) / 6) + 1
    // DOM = Zone * 6 - 183
    const zone = Math.floor((lon + 180) / 6) + 1;
    return zone * 6 - 183;
};

export const convertCoordinate = (lat: number, lng: number, system: string) => {
  if (!system || system === 'WGS84') {
    return { x: lng, y: lat, labelX: 'Boylam', labelY: 'Enlem', zone: '' };
  }

  let destProj = '';
  let zoneLabel = '';

  if (system === 'ITRF96_3') {
    const dom = getDom3(lng);
    destProj = `+proj=tmerc +lat_0=0 +lon_0=${dom} +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs`;
    zoneLabel = `DOM ${dom}`;
  } else if (system === 'ED50_3') {
    const dom = getDom3(lng);
    // Türkiye için ortalama ED50-WGS84 dönüşüm parametreleri (HGM/EPSG standartları)
    // +towgs84=dX,dY,dZ,Rx,Ry,Rz,dS
    destProj = `+proj=tmerc +lat_0=0 +lon_0=${dom} +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs`;
    zoneLabel = `DOM ${dom}`;
  } else if (system === 'ED50_6') {
    const dom = getDom6(lng);
    destProj = `+proj=utm +zone=${getUTMZone(lng)} +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs`;
    zoneLabel = `DOM ${dom}`;
  }

  if (destProj) {
    try {
      const [x, y] = proj4(WGS84, destProj, [lng, lat]);
      return { x, y, labelX: 'Sağa (Y)', labelY: 'Yukarı (X)', zone: zoneLabel };
    } catch (e) {
      console.error("Proj4 conversion error:", e);
      return { x: lng, y: lat, labelX: 'Boylam', labelY: 'Enlem', zone: 'Hata' };
    }
  }

  return { x: lng, y: lat, labelX: 'Boylam', labelY: 'Enlem', zone: '' };
};

export const convertToWGS84 = (x: number, y: number, system: string, referenceLng?: number) => {
  if (!system || system === 'WGS84') {
    return { lat: y, lng: x };
  }

  const lng = referenceLng || 33; // Türkiye için varsayılan orta meridyen (yaklaşık)
  let srcProj = '';

  if (system === 'ITRF96_3') {
    const dom = getDom3(lng);
    srcProj = `+proj=tmerc +lat_0=0 +lon_0=${dom} +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs`;
  } else if (system === 'ED50_3') {
    const dom = getDom3(lng);
    srcProj = `+proj=tmerc +lat_0=0 +lon_0=${dom} +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs`;
  } else if (system === 'ED50_6') {
    const zone = getUTMZone(lng);
    srcProj = `+proj=utm +zone=${zone} +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs`;
  }

  if (srcProj) {
    try {
      const [lngResult, latResult] = proj4(srcProj, WGS84, [x, y]);
      return { lat: latResult, lng: lngResult };
    } catch (e) {
      console.error("Proj4 reverse conversion error:", e);
    }
  }

  return { lat: y, lng: x };
};
