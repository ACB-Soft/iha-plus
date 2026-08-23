import JSZip from 'jszip';
import { KMLFeature, KMLData } from '../src/types/flight';

export type { KMLFeature, KMLData };

/**
 * Helper to extract coordinates string from a container element regardless of namespace
 */
function getElementCoordinates(element: Element): string | null {
  // Try standard selectors
  const coordElem = element.getElementsByTagName("coordinates")[0] 
    || element.querySelector("coordinates")
    || element.getElementsByTagNameNS("*", "coordinates")[0];
  
  return coordElem?.textContent?.trim() || null;
}

export const parseKML = (kmlText: string): { name: string; features: KMLFeature[] } => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlText, "text/xml");
  const features: KMLFeature[] = [];
  
  // Document name fallback
  let docName = xmlDoc.querySelector("Document > name")?.textContent 
    || xmlDoc.querySelector("Folder > name")?.textContent
    || xmlDoc.querySelector("kml > name")?.textContent
    || "KML Projesi";

  // Find all Placemarks (with or without namespace)
  const placemarks = xmlDoc.querySelectorAll("Placemark, kml Placemark, document Placemark");
  
  placemarks.forEach(pm => {
    const name = pm.querySelector("name")?.textContent || "İsimsiz";
    const description = pm.querySelector("description")?.textContent || "";
    
    // 1. Check Polygon (outerBoundaryIs or linearRing)
    const polygonNode = pm.querySelector("Polygon") || pm.getElementsByTagNameNS("*", "Polygon")[0];
    if (polygonNode) {
      const polyCoord = getElementCoordinates(polygonNode);
      if (polyCoord) {
        const coords = polyCoord.trim().split(/\s+/).map(c => {
          const parts = c.split(",");
          return { lng: parseFloat(parts[0]), lat: parseFloat(parts[1]), alt: parts[2] ? parseFloat(parts[2]) : 0 };
        }).filter(p => !isNaN(p.lat) && !isNaN(p.lng));

        if (coords.length >= 3) {
          features.push({ name, description, type: 'Polygon', coordinates: coords });
          return;
        }
      }
    }

    // 2. Check LineString
    const lineNode = pm.querySelector("LineString") || pm.getElementsByTagNameNS("*", "LineString")[0];
    if (lineNode) {
      const lineCoord = getElementCoordinates(lineNode);
      if (lineCoord) {
        const coords = lineCoord.trim().split(/\s+/).map(c => {
          const parts = c.split(",");
          return { lng: parseFloat(parts[0]), lat: parseFloat(parts[1]), alt: parts[2] ? parseFloat(parts[2]) : 0 };
        }).filter(p => !isNaN(p.lat) && !isNaN(p.lng));

        if (coords.length >= 2) {
          features.push({ name, description, type: 'LineString', coordinates: coords });
          return;
        }
      }
    }

    // 3. Check Point
    const pointNode = pm.querySelector("Point") || pm.getElementsByTagNameNS("*", "Point")[0];
    if (pointNode) {
      const pointCoord = getElementCoordinates(pointNode);
      if (pointCoord) {
        const parts = pointCoord.trim().split(",");
        if (parts.length >= 2 && !isNaN(parseFloat(parts[1])) && !isNaN(parseFloat(parts[0]))) {
          features.push({
            name,
            description,
            type: 'Point',
            coordinates: [{ lng: parseFloat(parts[0]), lat: parseFloat(parts[1]), alt: parts[2] ? parseFloat(parts[2]) : 0 }]
          });
          return;
        }
      }
    }
  });

  // If no placemark features were extracted but <coordinates> tags exist directly in doc
  if (features.length === 0) {
    const allCoordTags = xmlDoc.getElementsByTagName("coordinates");
    for (let i = 0; i < allCoordTags.length; i++) {
      const raw = allCoordTags[i].textContent?.trim();
      if (raw) {
        const coords = raw.split(/\s+/).map(c => {
          const parts = c.split(",");
          return { lng: parseFloat(parts[0]), lat: parseFloat(parts[1]), alt: parts[2] ? parseFloat(parts[2]) : 0 };
        }).filter(p => !isNaN(p.lat) && !isNaN(p.lng));

        if (coords.length >= 3) {
          features.push({ name: docName, description: '', type: 'Polygon', coordinates: coords });
        } else if (coords.length === 1 || coords.length === 2) {
          features.push({ name: docName, description: '', type: 'LineString', coordinates: coords });
        }
      }
    }
  }

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
