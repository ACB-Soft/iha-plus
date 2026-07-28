import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface PDFExportData {
  projectName: string;
  flightType: 'Normal' | 'Strip';
  camera: {
    name: string;
    sensorWidth: number;
    focalLength: number;
    imageWidth: number;
  };
  altitude: number;
  gsd: number;
  areaSizeM2: number;
  
  // Strip Flight specific
  stripLengthMeters?: number;
  stripBufferMeters?: number;
  isStripSplitEnabled?: boolean;
  stripSplitDistance?: number;
  
  // Normal Area specific
  bufferMeters?: number;
  expandToGridMeters?: number;
  expandToRectangle?: boolean;

  // GCP / YKN details
  gcpEnabled?: boolean;
  gcpPoints?: { id: string; name: string; lat: number; lng: number }[];
  gcpDistance?: number;
  gcpStartOffset?: number;
  gcpStartNumber?: number;

  // Map container reference (optional, legacy)
  mapElement?: HTMLElement | null;
}

export async function generateFlightPlanPDF(data: PDFExportData, fileName: string): Promise<void> {
  // Build offscreen HTML container for styled PDF layout
  const pdfContainer = document.createElement('div');
  pdfContainer.style.position = 'absolute';
  pdfContainer.style.top = '-9999px';
  pdfContainer.style.left = '-9999px';
  pdfContainer.style.width = '800px';
  pdfContainer.style.backgroundColor = '#ffffff';
  pdfContainer.style.color = '#0f172a';
  pdfContainer.style.fontFamily = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
  pdfContainer.style.padding = '32px';
  pdfContainer.style.boxSizing = 'border-box';

  const formattedDate = new Date().toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const areaHa = (data.areaSizeM2 / 10000).toFixed(2);

  const isStrip = data.flightType === 'Strip';
  const stripLen = data.stripLengthMeters || 0;
  const stripBuffer = data.stripBufferMeters || 50;

  const yknList = data.gcpPoints || [];

  pdfContainer.innerHTML = `
    <div style="border: 2px solid #e2e8f0; border-radius: 20px; padding: 24px; background: #ffffff;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 32px; height: 32px; background: #2563eb; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-size: 16px;">
              ✈
            </div>
            <h1 style="margin: 0; font-size: 20px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: -0.02em;">
              PLANLANAN UÇUŞ RAPORU
            </h1>
          </div>
          <p style="margin: 4px 0 0 0; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">
            Proje: <span style="color: #0f172a; font-weight: 900;">${data.projectName}</span>
          </p>
        </div>
        <div style="text-align: right;">
          <span style="display: inline-block; padding: 4px 12px; background: ${isStrip ? '#0284c7' : '#2563eb'}; color: white; font-size: 10px; font-weight: 900; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px;">
            ${isStrip ? 'ŞERİTVARİ UÇUŞ' : 'NORMAL ALAN UÇUŞU'}
          </span>
          <div style="font-size: 10px; font-weight: 700; color: #94a3b8;">${formattedDate}</div>
        </div>
      </div>

      <!-- Main Info Cards Grid -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
        
        <!-- Box 1: Field & Flight Geometry -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px;">
          <h2 style="margin: 0 0 12px 0; font-size: 12px; font-weight: 900; color: #2563eb; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px;">
            <span>📐</span> Uçuş Alanı & Geometri
          </h2>
          <table style="width: 100%; font-size: 11px; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px 0; font-weight: 700; color: #64748b;">Uçuş Alanı Büyüklüğü:</td>
              <td style="padding: 6px 0; text-align: right; font-weight: 900; color: #0f172a;">
                ${data.areaSizeM2.toLocaleString('tr-TR')} m² (${areaHa} ha)
              </td>
            </tr>
            ${isStrip ? `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 0; font-weight: 700; color: #64748b;">Güzergah Toplam Uzunluğu:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: 900; color: #0369a1;">
                  ${stripLen.toLocaleString('tr-TR')} m (${(stripLen / 1000).toFixed(2)} km)
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 0; font-weight: 700; color: #64748b;">Şerit Genişliği (Sol / Sağ):</td>
                <td style="padding: 6px 0; text-align: right; font-weight: 900; color: #0f172a;">
                  ±${stripBuffer} m (Toplam: ${stripBuffer * 2} m)
                </td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: 700; color: #64748b;">Şerit Parçalama:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: 900; color: #0f172a;">
                  ${data.isStripSplitEnabled ? `EVET (${data.stripSplitDistance} m)` : 'HAYIR'}
                </td>
              </tr>
            ` : `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 0; font-weight: 700; color: #64748b;">Tahditi Genişlet (Buffer):</td>
                <td style="padding: 6px 0; text-align: right; font-weight: 900; color: #0f172a;">
                  +${data.bufferMeters || 0} m
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 0; font-weight: 700; color: #64748b;">Ortogonal Genişletme:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: 900; color: #0f172a;">
                  ${data.expandToGridMeters ? `${data.expandToGridMeters} m` : 'Hayır'}
                </td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: 700; color: #64748b;">Dikdörtgen Genişletme:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: 900; color: #0f172a;">
                  ${data.expandToRectangle ? 'EVET' : 'HAYIR'}
                </td>
              </tr>
            `}
          </table>
        </div>

        <!-- Box 2: Flight Parameters & Camera -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px;">
          <h2 style="margin: 0 0 12px 0; font-size: 12px; font-weight: 900; color: #2563eb; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px;">
            <span>📷</span> Kamera & Uçuş Parametreleri
          </h2>
          <table style="width: 100%; font-size: 11px; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px 0; font-weight: 700; color: #64748b;">Kamera Modeli:</td>
              <td style="padding: 6px 0; text-align: right; font-weight: 900; color: #0f172a;">
                ${data.camera.name}
              </td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px 0; font-weight: 700; color: #64748b;">Sensör / Odak Uzaklığı:</td>
              <td style="padding: 6px 0; text-align: right; font-weight: 900; color: #0f172a;">
                ${data.camera.sensorWidth} mm / ${data.camera.focalLength} mm
              </td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px 0; font-weight: 700; color: #64748b;">Uçuş Yüksekliği (H):</td>
              <td style="padding: 6px 0; text-align: right; font-weight: 900; color: #16a34a;">
                ${data.altitude} m
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: 700; color: #64748b;">Piksel Boyutu (GSD):</td>
              <td style="padding: 6px 0; text-align: right; font-weight: 900; color: #16a34a;">
                ${data.gsd} cm/px
              </td>
            </tr>
          </table>
        </div>

      </div>

      <!-- Box 3: Ground Control Points (YKN / GCP) Summary -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h2 style="margin: 0; font-size: 12px; font-weight: 900; color: #2563eb; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px;">
            <span>📍</span> Yer Kontrol Noktaları (YKN) Listesi
          </h2>
          <span style="font-size: 11px; font-weight: 900; color: #1e40af; background: #dbeafe; padding: 3px 10px; border-radius: 8px;">
            Toplam: ${yknList.length} Adet YKN
          </span>
        </div>

        ${yknList.length > 0 ? `
          <div style="display: flex; gap: 16px;">
            <div style="flex: 1;">
              <table style="width: 100%; font-size: 9px; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
                <thead>
                  <tr style="background: #2563eb; color: white; text-align: left;">
                    <th style="padding: 5px 8px; font-weight: 900;">Ad</th>
                    <th style="padding: 5px 8px; font-weight: 900;">Enlem</th>
                    <th style="padding: 5px 8px; font-weight: 900;">Boylam</th>
                  </tr>
                </thead>
                <tbody>
                  ${yknList.slice(0, Math.ceil(yknList.length / 2)).map((pt, idx) => `
                    <tr style="border-bottom: 1px solid #f1f5f9; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                      <td style="padding: 4px 8px; font-weight: 800; color: #2563eb;">${pt.name}</td>
                      <td style="padding: 4px 8px; font-family: monospace; color: #334155;">${pt.lat.toFixed(6)}°</td>
                      <td style="padding: 4px 8px; font-family: monospace; color: #334155;">${pt.lng.toFixed(6)}°</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            <div style="flex: 1;">
              ${yknList.length > 1 ? `
                <table style="width: 100%; font-size: 9px; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
                  <thead>
                    <tr style="background: #2563eb; color: white; text-align: left;">
                      <th style="padding: 5px 8px; font-weight: 900;">Ad</th>
                      <th style="padding: 5px 8px; font-weight: 900;">Enlem</th>
                      <th style="padding: 5px 8px; font-weight: 900;">Boylam</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${yknList.slice(Math.ceil(yknList.length / 2)).map((pt, idx) => `
                      <tr style="border-bottom: 1px solid #f1f5f9; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                        <td style="padding: 4px 8px; font-weight: 800; color: #2563eb;">${pt.name}</td>
                        <td style="padding: 4px 8px; font-family: monospace; color: #334155;">${pt.lat.toFixed(6)}°</td>
                        <td style="padding: 4px 8px; font-family: monospace; color: #334155;">${pt.lng.toFixed(6)}°</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : ''}
            </div>
          </div>
        ` : `
          <div style="text-align: center; padding: 12px; color: #94a3b8; font-size: 11px; font-weight: 700; font-style: italic;">
            Bu plan için henüz YKN noktası üretilmedi veya YKN planlaması kapalı.
          </div>
        `}
      </div>

      <!-- Footer Note -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #94a3b8; font-weight: 700;">
        <div>ACB MAPS - İHA PLUS</div>
        <div>RAPOR ÇIKTISI</div>
      </div>
    </div>
  `;

  document.body.appendChild(pdfContainer);

  try {
    const pdfCanvas = await html2canvas(pdfContainer, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff'
    });

    const imgData = pdfCanvas.toDataURL('image/jpeg', 0.85);

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pdfWidth;
    const imgHeight = (pdfCanvas.height * pdfWidth) / pdfCanvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
    heightLeft -= pdfHeight;

    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pdfHeight;
    }

    const cleanName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    pdf.save(cleanName);

  } finally {
    document.body.removeChild(pdfContainer);
  }
}
