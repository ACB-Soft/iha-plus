import { BRAND_NAME, FULL_BRAND } from '../version';
import JSZip from 'jszip';

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

export const parseKML = (kmlText: string): { name: string; features: KMLFeature[] } => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlText, "text/xml");
  const features: KMLFeature[] = [];
  
  const docName = xmlDoc.querySelector("Document > name")?.textContent || "KML Projesi";

  const placemarks = xmlDoc.querySelectorAll("Placemark");
  placemarks.forEach(pm => {
    const name = pm.querySelector("name")?.textContent || "İsimsiz";
    const description = pm.querySelector("description")?.textContent || "";
    
    // Point
    const pointCoord = pm.querySelector("Point coordinates")?.textContent;
    if (pointCoord) {
      const parts = pointCoord.trim().split(",");
      if (parts.length >= 2) {
        features.push({
          name,
          description,
          type: 'Point',
          coordinates: [{ lng: parseFloat(parts[0]), lat: parseFloat(parts[1]), alt: parts[2] ? parseFloat(parts[2]) : 0 }]
        });
      }
    }

    // LineString
    const lineCoord = pm.querySelector("LineString coordinates")?.textContent;
    if (lineCoord) {
      const coords = lineCoord.trim().split(/\s+/).map(c => {
        const parts = c.split(",");
        return { lng: parseFloat(parts[0]), lat: parseFloat(parts[1]), alt: parts[2] ? parseFloat(parts[2]) : 0 };
      });
      features.push({ name, description, type: 'LineString', coordinates: coords });
    }

    // Polygon
    const polyCoord = pm.querySelector("Polygon outerBoundaryIs LinearRing coordinates")?.textContent;
    if (polyCoord) {
      const coords = polyCoord.trim().split(/\s+/).map(c => {
        const parts = c.split(",");
        return { lng: parseFloat(parts[0]), lat: parseFloat(parts[1]), alt: parts[2] ? parseFloat(parts[2]) : 0 };
      });
      features.push({ name, description, type: 'Polygon', coordinates: coords });
    }
  });

  return { name: docName, features };
};

export const parseKMZ = async (file: File): Promise<{ name: string; features: KMLFeature[] }> => {
  const zip = new JSZip();
  const contents = await zip.loadAsync(file);
  const kmlFile = Object.keys(contents.files).find(name => name.endsWith(".kml"));
  
  if (!kmlFile) throw new Error("KMZ içerisinde KML dosyası bulunamadı.");
  
  const kmlText = await contents.files[kmlFile].async("text");
  return parseKML(kmlText);
};

export const parseKMLorKMZ = async (file: File): Promise<KMLData> => {
  if (file.name.toLowerCase().endsWith(".kmz")) {
    return parseKMZ(file);
  } else {
    const text = await file.text();
    return parseKML(text);
  }
};

const escapeXml = (unsafe: string) => {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
};