import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { formatDurationText } from '../../components/GeometryUtils';

export interface PDFExportData {
  projectName: string;
  areaSizeM2: number;
  flightType?: 'Normal' | 'Strip';
  stripLengthMeters?: number;
  stripBuffer?: number;
  stripBufferMeters?: number;
  isStripSplitEnabled?: boolean;
  stripSplitDistance?: number;
  bufferMeters?: number;
  expandToGridMeters?: number;
  expandToRectangle?: boolean;
  expandToMinRectangle?: boolean;
  camera: {
    name: string;
    sensorWidth: number;
    focalLength: number;
    imageWidth: number;
  };
  altitude?: number;
  gsd?: string | number;
  flightAngle?: number;
  estimatedDurationMinutes?: number | string;
  gcpPoints?: { id: string; name: string; lat: number; lng: number }[];
  gcpDistance?: number;
  gcpStartOffset?: number;
  gcpStartNumber?: number;
  mapElement?: HTMLElement | null;
}

function renderYknTableColumns(points: { id: string; name: string; lat: number; lng: number }[]) {
  if (points.length === 0) {
    return `
      <div style="text-align: center; padding: 16px; color: #94a3b8; font-size: 11px; font-weight: 700; font-style: italic;">
        Bu plan için henüz YKN noktası üretilmedi veya YKN planlaması kapalı.
      </div>
    `;
  }

  const half = Math.ceil(points.length / 2);
  const leftCol = points.slice(0, half);
  const rightCol = points.slice(half);

  const renderTable = (items: typeof points) => `
    <table style="width: 100%; table-layout: fixed; font-size: 9px; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #cbd5e1; box-sizing: border-box;">
      <thead>
        <tr style="background: #2563eb; color: white; text-align: left; height: 26px;">
          <th style="width: 32%; padding: 4px 8px; font-weight: 900; vertical-align: middle;">Ad</th>
          <th style="width: 34%; padding: 4px 8px; font-weight: 900; vertical-align: middle;">Enlem</th>
          <th style="width: 34%; padding: 4px 8px; font-weight: 900; vertical-align: middle;">Boylam</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((pt, idx) => `
          <tr style="border-bottom: 1px solid #f1f5f9; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; height: 22px;">
            <td style="padding: 3px 8px; font-weight: 800; color: #2563eb; vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pt.name}</td>
            <td style="padding: 3px 8px; font-family: monospace, sans-serif; color: #334155; vertical-align: middle; white-space: nowrap;">${pt.lat.toFixed(6)}°</td>
            <td style="padding: 3px 8px; font-family: monospace, sans-serif; color: #334155; vertical-align: middle; white-space: nowrap;">${pt.lng.toFixed(6)}°</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  return `
    <div style="display: flex; gap: 16px; align-items: flex-start; width: 100%; box-sizing: border-box;">
      <div style="flex: 1; min-width: 0;">
        ${renderTable(leftCol)}
      </div>
      <div style="flex: 1; min-width: 0;">
        ${rightCol.length > 0 ? renderTable(rightCol) : ''}
      </div>
    </div>
  `;
}

function addSelectableTextOverlay(
  pdf: jsPDF,
  pageElement: HTMLElement,
  pdfWidthMm: number,
  pageWidthPx: number
) {
  const pageRect = pageElement.getBoundingClientRect();
  const scale = pdfWidthMm / pageWidthPx;

  const range = document.createRange();
  const walker = document.createTreeWalker(pageElement, NodeFilter.SHOW_TEXT, null);

  pdf.internal.write('3 Tr'); // Set PDF Text Rendering Mode to 3 (Invisible text layer)

  let currentNode = walker.nextNode();
  while (currentNode) {
    const rawText = currentNode.nodeValue;
    if (rawText && rawText.trim().length > 0) {
      const parentEl = currentNode.parentElement;
      if (parentEl) {
        range.selectNodeContents(currentNode);
        const rect = range.getBoundingClientRect();

        if (rect.width > 0 && rect.height > 0) {
          const xMm = (rect.left - pageRect.left) * scale;
          const computedStyle = window.getComputedStyle(parentEl);
          const fontSizePx = parseFloat(computedStyle.fontSize) || 12;
          const yMm = (rect.top - pageRect.top + fontSizePx * 0.78) * scale;
          const fontSizePt = fontSizePx * scale * (72 / 25.4);

          pdf.setFontSize(Math.max(4, fontSizePt));
          pdf.text(rawText.trim(), xMm, yMm);
        }
      }
    }
    currentNode = walker.nextNode();
  }

  pdf.internal.write('0 Tr'); // Reset PDF Text Rendering Mode to 0 (Fill)
}

export async function generateFlightPlanPDF(data: PDFExportData, fileName: string): Promise<void> {
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
  const stripBuffer = data.stripBuffer || data.stripBufferMeters || 50;
  const yknList = data.gcpPoints || [];

  const PAGE_1_MAX_YKN = 50;
  const SUBSEQUENT_PAGE_MAX_YKN = 50;

  let totalPages = 1;
  if (yknList.length > PAGE_1_MAX_YKN) {
    const remaining = yknList.length - PAGE_1_MAX_YKN;
    totalPages = 1 + Math.ceil(remaining / SUBSEQUENT_PAGE_MAX_YKN);
  }

  const wrapper = document.createElement('div');
  wrapper.style.position = 'absolute';
  wrapper.style.top = '-9999px';
  wrapper.style.left = '-9999px';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.gap = '40px';

  const pageElements: HTMLDivElement[] = [];

  for (let p = 0; p < totalPages; p++) {
    const isFirstPage = p === 0;
    const startIdx = isFirstPage ? 0 : PAGE_1_MAX_YKN + (p - 1) * SUBSEQUENT_PAGE_MAX_YKN;
    const endIdx = Math.min(startIdx + (isFirstPage ? PAGE_1_MAX_YKN : SUBSEQUENT_PAGE_MAX_YKN), yknList.length);
    const currentPageYkns = yknList.slice(startIdx, endIdx);
    const currentPageNum = p + 1;

    const page = document.createElement('div');
    page.style.width = '800px';
    page.style.backgroundColor = '#ffffff';
    page.style.color = '#0f172a';
    page.style.fontFamily = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
    page.style.padding = '32px';
    page.style.boxSizing = 'border-box';

    page.innerHTML = `
      <div style="border: 2px solid #e2e8f0; border-radius: 20px; padding: 24px; background: #ffffff; box-sizing: border-box;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2563eb; padding-bottom: 14px; margin-bottom: 18px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 36px; height: 36px; background: #2563eb; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-size: 18px; line-height: 1;">
              ✈
            </div>
            <div>
              <h1 style="margin: 0; font-size: 18px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: -0.01em; line-height: 1.2;">
                PLANLANAN UÇUŞ RAPORU
              </h1>
              <p style="margin: 3px 0 0 0; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em;">
                Proje: <span style="color: #0f172a; font-weight: 900;">${data.projectName}</span>
              </p>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; font-weight: 700; color: #64748b;">${formattedDate}</div>
          </div>
        </div>

        <!-- Main Info Cards Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
          
          <!-- Box 1: Field & Flight Geometry -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; box-sizing: border-box;">
            <h2 style="margin: 0 0 10px 0; font-size: 11px; font-weight: 900; color: #2563eb; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; line-height: 1.2;">
              <span style="font-size: 13px;">📐</span> Uçuş Alanı & Geometri
            </h2>
            <table style="width: 100%; table-layout: fixed; font-size: 10px; border-collapse: collapse; line-height: 1.3;">
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 5px 0; font-weight: 700; color: #64748b; vertical-align: middle;">Uçuş Alanı Büyüklüğü:</td>
                <td style="padding: 5px 0; text-align: right; font-weight: 900; color: #0f172a; vertical-align: middle;">
                  ${areaHa} ha
                </td>
              </tr>
              ${isStrip ? `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 5px 0; font-weight: 700; color: #64748b; vertical-align: middle;">Güzergah Toplam Uzunluğu:</td>
                  <td style="padding: 5px 0; text-align: right; font-weight: 900; color: #0369a1; vertical-align: middle;">
                    ${(stripLen / 1000).toFixed(2)} km
                  </td>
                </tr>
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 5px 0; font-weight: 700; color: #64748b; vertical-align: middle;">Şerit Genişliği (Sol / Sağ):</td>
                  <td style="padding: 5px 0; text-align: right; font-weight: 900; color: #0f172a; vertical-align: middle;">
                    ${stripBuffer} metre x 2
                  </td>
                </tr>
                <tr>
                  <td style="padding: 5px 0; font-weight: 700; color: #64748b; vertical-align: middle;">Şerit Parçalama:</td>
                  <td style="padding: 5px 0; text-align: right; font-weight: 900; color: #0f172a; vertical-align: middle;">
                    ${data.isStripSplitEnabled ? `EVET (${data.stripSplitDistance} m)` : 'HAYIR'}
                  </td>
                </tr>
              ` : `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 5px 0; font-weight: 700; color: #64748b; vertical-align: middle;">Tahditi Genişlet (Buffer):</td>
                  <td style="padding: 5px 0; text-align: right; font-weight: 900; color: #0f172a; vertical-align: middle;">
                    +${data.bufferMeters || 0} m
                  </td>
                </tr>
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 5px 0; font-weight: 700; color: #64748b; vertical-align: middle;">Ortogonal Genişletme:</td>
                  <td style="padding: 5px 0; text-align: right; font-weight: 900; color: #0f172a; vertical-align: middle;">
                    ${data.expandToGridMeters ? `${data.expandToGridMeters} m` : 'Hayır'}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 5px 0; font-weight: 700; color: #64748b; vertical-align: middle;">Geometrik Genişletme:</td>
                  <td style="padding: 5px 0; text-align: right; font-weight: 900; color: #0f172a; vertical-align: middle;">
                    ${data.expandToMinRectangle ? 'Döndürülmüş Dikdörtgen' : data.expandToRectangle ? 'Eksenel Dikdörtgen' : 'Hayır'}
                  </td>
                </tr>
              `}
            </table>
          </div>

          <!-- Box 2: Flight Parameters & Camera -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; box-sizing: border-box;">
            <h2 style="margin: 0 0 10px 0; font-size: 11px; font-weight: 900; color: #2563eb; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; line-height: 1.2;">
              <span style="font-size: 13px;">📷</span> Kamera & Uçuş Parametreleri
            </h2>
            <table style="width: 100%; table-layout: fixed; font-size: 10px; border-collapse: collapse; line-height: 1.3;">
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 5px 0; font-weight: 700; color: #64748b; vertical-align: middle;">Kamera Modeli:</td>
                <td style="padding: 5px 0; text-align: right; font-weight: 900; color: #0f172a; vertical-align: middle;">
                  ${(!data.camera.name || data.camera.name.includes('Belirtilmedi') || data.camera.name === 'Seç') ? '' : data.camera.name}
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 5px 0; font-weight: 700; color: #64748b; vertical-align: middle;">Sensör / Odak Uzaklığı:</td>
                <td style="padding: 5px 0; text-align: right; font-weight: 900; color: #0f172a; vertical-align: middle;">
                  ${(!data.camera.name || data.camera.name.includes('Belirtilmedi') || data.camera.name === 'Seç' || !data.camera.sensorWidth || !data.camera.focalLength) ? '' : `${data.camera.sensorWidth} mm / ${data.camera.focalLength} mm`}
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 5px 0; font-weight: 700; color: #64748b; vertical-align: middle;">Uçuş Yüksekliği (H):</td>
                <td style="padding: 5px 0; text-align: right; font-weight: 900; color: ${data.altitude ? '#16a34a' : '#64748b'}; vertical-align: middle;">
                  ${data.altitude ? `${data.altitude} m` : ''}
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 5px 0; font-weight: 700; color: #64748b; vertical-align: middle;">Piksel Boyutu (GSD):</td>
                <td style="padding: 5px 0; text-align: right; font-weight: 900; color: ${data.gsd ? '#16a34a' : '#64748b'}; vertical-align: middle;">
                  ${data.gsd ? `~${data.gsd} cm/px` : ''}
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 5px 0; font-weight: 700; color: #64748b; vertical-align: middle;">Uçuş Açısı:</td>
                <td style="padding: 5px 0; text-align: right; font-weight: 900; color: #0f172a; vertical-align: middle;">
                  ${data.flightAngle || 0}°
                </td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-weight: 700; color: #64748b; vertical-align: middle;">Tahmini Uçuş Süresi:</td>
                <td style="padding: 5px 0; text-align: right; font-weight: 900; color: #0f172a; vertical-align: middle;">
                  ~${formatDurationText(typeof data.estimatedDurationMinutes === 'number' ? data.estimatedDurationMinutes : parseFloat(data.estimatedDurationMinutes || '0'))}
                </td>
              </tr>
            </table>
          </div>

        </div>

        <!-- Box 3: Ground Control Points (YKN / GCP) Summary -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; margin-bottom: 20px; box-sizing: border-box;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h2 style="margin: 0; font-size: 11px; font-weight: 900; color: #2563eb; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; line-height: 1.2;">
              <span style="font-size: 13px;">📍</span> Yer Kontrol Noktaları (YKN) Listesi
            </h2>
            <span style="font-size: 10px; font-weight: 900; color: #1e40af; background: #dbeafe; padding: 3px 10px; border-radius: 8px;">
              Toplam: ${yknList.length} Adet YKN ${totalPages > 1 ? `(Sayfa ${currentPageNum}: ${startIdx + 1} - ${endIdx})` : ''}
            </span>
          </div>

          ${renderYknTableColumns(currentPageYkns)}
        </div>

        <!-- Footer Note -->
        <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #94a3b8; font-weight: 700; line-height: 1;">
          <div>ACB MAPS - İHA PLUS</div>
          <div>Sayfa ${currentPageNum} / ${totalPages}</div>
        </div>
      </div>
    `;

    wrapper.appendChild(page);
    pageElements.push(page);
  }

  document.body.appendChild(wrapper);

  try {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();

    // Embed Roboto font for accurate Turkish character text selection in PDF
    try {
      const fontRes = await fetch('https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5WZLCzYlKw.ttf');
      if (fontRes.ok) {
        const fontBuf = await fontRes.arrayBuffer();
        const base64Font = window.btoa(
          new Uint8Array(fontBuf).reduce((acc, byte) => acc + String.fromCharCode(byte), '')
        );
        pdf.addFileToVFS('Roboto-Regular.ttf', base64Font);
        pdf.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
        pdf.setFont('Roboto');
      }
    } catch (err) {
      console.warn("Turkish font loading for PDF text layer warning:", err);
    }

    for (let i = 0; i < pageElements.length; i++) {
      if (i > 0) {
        pdf.addPage();
      }

      const pageEl = pageElements[i];
      const canvas = await html2canvas(pageEl, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');

      // Overlay invisible selectable text on top of the rendered image page
      addSelectableTextOverlay(pdf, pageEl, pdfWidth, 800);
    }

    const cleanName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    pdf.save(cleanName);

  } finally {
    if (document.body.contains(wrapper)) {
      document.body.removeChild(wrapper);
    }
  }
}

