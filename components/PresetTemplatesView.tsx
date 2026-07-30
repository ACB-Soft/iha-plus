import React, { useState, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import Header from './Header';
import GlobalFooter from './GlobalFooter';
import { sanitizeOklchColors } from '../src/utils/pdfExport';

interface Props {
  onBack: () => void;
}

export interface YKNTemplateDef {
  id: string;
  name: string;
  category: string;
  description: string;
  type: 'checkerboard' | 'bowtie' | 'plus';
}

const TEMPLATES: YKNTemplateDef[] = [
  {
    id: 'plus',
    name: 'Artı Şablonu',
    category: '',
    description: 'Dikey ve yatay dik eksenli nişan hatları ile belirgin merkez kestirimi sağlayan (+) şablonu.',
    type: 'plus',
  },
  {
    id: 'checkerboard',
    name: 'Dama Şablonu',
    category: '',
    description: 'En yaygın kullanılan, 4 çeyrekli yüksek kontrastlı fotogrametrik dama şablonu.',
    type: 'checkerboard',
  },
  {
    id: 'bowtie',
    name: 'Kelebek Şablonu',
    category: '',
    description: 'Karşılıklı iki dolu üçgen ile merkez çakışmasında milimetrik nişanlama sağlar.',
    type: 'bowtie',
  },
];

type ColorScheme = 'bw' | 'rw' | 'bo' | 'by';

const COLOR_SCHEMES: { id: ColorScheme; label: string; primary: string; secondary: string; accent: string; textPrimary: string }[] = [
  { id: 'bw', label: 'Siyah - Beyaz (Klasik)', primary: '#000000', secondary: '#ffffff', accent: '#000000', textPrimary: '#000000' },
  { id: 'rw', label: 'Kırmızı - Beyaz (Yüksek Görünürlük)', primary: '#dc2626', secondary: '#ffffff', accent: '#dc2626', textPrimary: '#dc2626' },
  { id: 'bo', label: 'Siyah - Turuncu (Tozlu/Taşlı Zemin)', primary: '#000000', secondary: '#ea580c', accent: '#ea580c', textPrimary: '#ea580c' },
  { id: 'by', label: 'Siyah - Sarı (Asfalt/Beton)', primary: '#000000', secondary: '#eab308', accent: '#ca8a04', textPrimary: '#ca8a04' },
];

const PresetTemplatesView: React.FC<Props> = ({ onBack }) => {
  const [selectedTemplate, setSelectedTemplate] = useState<YKNTemplateDef>(TEMPLATES[0]);
  const [colorScheme, setColorScheme] = useState<ColorScheme>('rw');
  const [pageSize, setPageSize] = useState<'a4' | 'a3'>('a4');
  
  // Customization fields
  const [showCenterCross, setShowCenterCross] = useState<boolean>(true);
  const [reverseColors, setReverseColors] = useState<boolean>(false);

  // Batch Export state
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  const [batchCount, setBatchCount] = useState<number>(5);

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const activeColorBase = COLOR_SCHEMES.find(c => c.id === colorScheme) || COLOR_SCHEMES[0];
  const activeColor = reverseColors 
    ? { ...activeColorBase, primary: activeColorBase.secondary, secondary: activeColorBase.primary }
    : activeColorBase;

  // Helper renderer for SVG target pattern (Rectangular A4/A3 format 400x565)
  const renderTargetSVG = (
    type: YKNTemplateDef['type'],
    primary: string,
    secondary: string,
    accent: string,
    showCross: boolean = true
  ) => {
    const outerBorder = <rect x="4" y="4" width="392" height="557" fill="none" stroke={accent} strokeWidth="8" />;

    const bottomRightLabel = (
      <text
        x="385"
        y="552"
        textAnchor="end"
        fill="#334155"
        fontSize="8"
        fontWeight="900"
        fontFamily="monospace"
        letterSpacing="1"
        opacity="0.8"
      >
        ACB MAPS - İHA PLUS
      </text>
    );

    const centerCross = showCross ? (
      <g>
        <line x1="0" y1="282.5" x2="400" y2="282.5" stroke={accent} strokeWidth="2" opacity="0.9" />
        <line x1="200" y1="0" x2="200" y2="565" stroke={accent} strokeWidth="2" opacity="0.9" />
        <circle cx="200" cy="282.5" r="10" fill={secondary === '#ffffff' ? '#ffffff' : '#000000'} stroke={accent} strokeWidth="2.5" />
        <circle cx="200" cy="282.5" r="3.5" fill={accent} />
      </g>
    ) : null;

    switch (type) {
      case 'checkerboard':
        return (
          <svg viewBox="0 0 400 565" className="w-full h-full">
            <rect x="0" y="0" width="400" height="565" fill={secondary} />
            <path d="M 0 0 L 200 0 L 200 282.5 L 0 282.5 Z" fill={primary} />
            <path d="M 200 282.5 L 400 282.5 L 400 565 L 200 565 Z" fill={primary} />
            <line x1="0" y1="282.5" x2="400" y2="282.5" stroke={primary === '#ffffff' ? '#000' : '#ffffff'} strokeWidth="1.5" opacity="0.4" />
            <line x1="200" y1="0" x2="200" y2="565" stroke={primary === '#ffffff' ? '#000' : '#ffffff'} strokeWidth="1.5" opacity="0.4" />
            {bottomRightLabel}
            {centerCross}
            {outerBorder}
          </svg>
        );

      case 'bowtie':
        return (
          <svg viewBox="0 0 400 565" className="w-full h-full">
            <rect x="0" y="0" width="400" height="565" fill={secondary} />
            <polygon points="0,0 200,282.5 0,565" fill={primary} />
            <polygon points="400,0 200,282.5 400,565" fill={primary} />
            {bottomRightLabel}
            {centerCross}
            {outerBorder}
          </svg>
        );

      case 'plus':
        return (
          <svg viewBox="0 0 400 565" className="w-full h-full">
            <rect x="0" y="0" width="400" height="565" fill={secondary} />
            <rect x="150" y="0" width="100" height="565" fill={primary} />
            <rect x="0" y="232.5" width="400" height="100" fill={primary} />
            <circle cx="200" cy="282.5" r="50" fill={secondary} stroke={primary} strokeWidth="12" />
            <circle cx="200" cy="282.5" r="14" fill={primary} />
            {bottomRightLabel}
            {centerCross}
            {outerBorder}
          </svg>
        );

      default:
        return null;
    }
  };

  // Generate PDF for single or batch
  const handleExportPDF = async () => {
    if (!previewRef.current) return;
    setIsExporting(true);

    try {
      if (!isBatchMode) {
        // Single Template Export
        const canvas = await html2canvas(previewRef.current, {
          scale: 3,
          useCORS: true,
          backgroundColor: '#ffffff',
          onclone: (clonedDoc) => sanitizeOklchColors(clonedDoc)
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pdf = new jsPDF('p', 'mm', pageSize);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        const cleanFilename = `${selectedTemplate.id.toUpperCase()}_YKN_SABLONU.pdf`;
        pdf.save(cleanFilename);
      } else {
        // Batch Export (e.g. 5 identical pages or requested count)
        const pdf = new jsPDF('p', 'mm', pageSize);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        const count = Math.max(1, Math.min(50, batchCount));

        const canvas = await html2canvas(previewRef.current, {
          scale: 2.5,
          useCORS: true,
          backgroundColor: '#ffffff',
          onclone: (clonedDoc) => sanitizeOklchColors(clonedDoc)
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.90);

        for (let i = 1; i <= count; i++) {
          if (i > 1) pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        }

        pdf.save(`${selectedTemplate.id.toUpperCase()}_TOPLU_${count}_ADET_YKN_SABLONU.pdf`);
      }
    } catch (err) {
      console.error('PDF alma hatası:', err);
      alert('PDF oluşturulurken bir hata oluştu. Lütfen tekrar deneyiniz.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-200">
      <Header title="Hazır YKN Şablonları" onBack={onBack} />

      <div className="flex-1 px-4 overflow-y-auto no-scrollbar py-6">
        <div className="max-w-lg mx-auto w-full space-y-6 pb-6">

          {/* Template Selection Gallery */}
          <section className="space-y-3">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              1. Şablon Tasarımı Seçin
            </h3>
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              {TEMPLATES.map((tmpl) => {
                const isSelected = selectedTemplate.id === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(tmpl)}
                    className={`p-2.5 sm:p-3.5 rounded-2xl border transition-all flex flex-col items-center text-center space-y-1.5 sm:space-y-2 relative overflow-hidden group ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/30 scale-[1.02]'
                        : 'bg-white text-slate-800 border-slate-200 hover:border-blue-300 hover:bg-blue-50/50'
                    }`}
                  >
                    <div className={`w-full max-w-[76px] aspect-[5/7] rounded-xl border p-1 shadow-inner flex items-center justify-center overflow-hidden ${isSelected ? 'bg-white/10 border-white/30' : 'bg-slate-100 border-slate-200'}`}>
                      {renderTargetSVG(
                        tmpl.type,
                        isSelected ? '#ffffff' : '#000000',
                        isSelected ? '#1e40af' : '#ffffff',
                        isSelected ? '#ffffff' : '#94a3b8',
                        false
                      )}
                    </div>
                    <span className="text-[11px] sm:text-xs font-black leading-tight tracking-tight line-clamp-2">
                      {tmpl.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Customization Options */}
          <section className="space-y-3">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              2. Şablon Özelleştirme
            </h3>

            {/* Color Scheme & Paper Size */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider block">
                  Renk Teması
                </label>
                <select
                  value={colorScheme}
                  onChange={(e) => setColorScheme(e.target.value as ColorScheme)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {COLOR_SCHEMES.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider block">
                  Kağıt Boyutu
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPageSize('a4')}
                    className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                      pageSize === 'a4' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    A4 (Standard)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageSize('a3')}
                    className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                      pageSize === 'a3' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    A3 (Büyük)
                  </button>
                </div>
              </div>
            </div>

            {/* Toggles */}
            <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCenterCross}
                  onChange={(e) => setShowCenterCross(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                Merkez Artı Nişangah
              </label>
              
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reverseColors}
                  onChange={(e) => setReverseColors(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                Renkleri Tersine Çevir
              </label>
            </div>

            {/* Batch Export Configuration Panel (When Active) */}
            {isBatchMode && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 space-y-3 animate-in">
                <div className="flex items-center gap-2 text-amber-900 font-black text-xs uppercase tracking-wider">
                  <i className="fas fa-layer-group text-amber-600"></i> Toplu Seri PDF İndirme Ayarları
                </div>
                <div>
                  <label className="text-[10px] font-black text-amber-800 uppercase block mb-1">Toplam Sayfa Sayısı</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={batchCount}
                    onChange={(e) => setBatchCount(parseInt(e.target.value) || 1)}
                    className="w-full bg-white border border-amber-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900"
                  />
                </div>
                <p className="text-[11px] text-amber-800 font-medium">
                  Aynı YKN şablonundan <b>{batchCount}</b> adet özdeş sayfa tek bir PDF dosyası olarak indirilecektir.
                </p>
              </div>
            )}

          </section>

          {/* Live Print Preview Section */}
          <section className="space-y-2">
            <div className="w-full flex items-center justify-between">
              <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                3. Baskı Önizleme
              </span>
              <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                {pageSize.toUpperCase()} ({pageSize === 'a4' ? '210x297mm' : '297x420mm'})
              </span>
            </div>

            {/* A4/A3 Simulated Printable Paper Card */}
            <div className="w-full bg-slate-300 p-4 rounded-3xl shadow-2xl flex justify-center border border-slate-300">
              <div
                ref={previewRef}
                className="w-full bg-white text-slate-900 shadow-xl rounded-lg p-0 flex flex-col justify-center items-center relative overflow-hidden transition-all"
                style={{
                  aspectRatio: '210 / 297',
                  boxSizing: 'border-box'
                }}
              >
                {/* Target Graphic Container - Full Paper 100% Fit */}
                <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
                  <div className="w-full h-full relative flex items-center justify-center">
                    {/* SVG Target Render with dynamic theme accent border and crosshair */}
                    {renderTargetSVG(
                      selectedTemplate.type,
                      activeColor.primary,
                      activeColor.secondary,
                      activeColor.accent,
                      showCenterCross
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* PDF Download Button */}
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="w-full py-4 px-6 bg-[#E52521] hover:bg-[#C91D1A] active:scale-[0.99] text-white rounded-2xl shadow-xl shadow-red-600/30 transition-all font-black uppercase tracking-wider text-sm flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <i className="fas fa-spinner fa-spin text-lg"></i>
                PDF Hazırlanıyor...
              </>
            ) : (
              <>
                <i className="fas fa-file-pdf text-lg"></i>
                {isBatchMode ? `Toplu PDF İndir (${batchCount} Sayfa)` : `PDF Formatında İndir (${pageSize.toUpperCase()})`}
              </>
            )}
          </button>

        </div>
      </div>

      <GlobalFooter />
    </div>
  );
};

export default PresetTemplatesView;
