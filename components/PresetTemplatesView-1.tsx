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
            {centerCross}
            {outerBorder}
          </svg>
        );

      default:
        return null;
    }
  };

  // Generate PDF for selected template
  const handleExportPDF = async () => {
    if (!previewRef.current) return;
    setIsExporting(true);

    try {
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
      const cleanFilename = `${selectedTemplate.id.toUpperCase()}_YKN_SABLONU_${pageSize.toUpperCase()}.pdf`;
      pdf.save(cleanFilename);
    } catch (err) {
      console.error('PDF alma hatası:', err);
      alert('PDF oluşturulurken bir hata oluştu. Lütfen tekrar deneyiniz.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800 overflow-hidden animate-in fade-in">
      <Header 
        title="Hazır YKN Şablonları" 
        onBack={onBack} 
      />

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Sol Panel: Şablon Seçimi ve Özelleştirme Formu */}
        <div className="w-full lg:w-[460px] xl:w-[500px] 2xl:w-[540px] shrink-0 h-full overflow-y-auto p-4 sm:p-6 lg:border-r border-slate-200 flex flex-col justify-between z-10 bg-slate-50 custom-scrollbar">
          <div className="max-w-xl mx-auto lg:max-w-none w-full space-y-4">

            {/* 1. Şablon Tasarımı Seçin */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-3">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <i className="fa-solid fa-shapes text-blue-600"></i>
                <span>1. Şablon Tasarımı Seçin</span>
              </label>

              <div className="grid grid-cols-3 gap-2.5">
                {TEMPLATES.map((tmpl) => {
                  const isSelected = selectedTemplate.id === tmpl.id;
                  return (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => setSelectedTemplate(tmpl)}
                      className={`p-2.5 sm:p-3 rounded-xl border transition-all flex flex-col items-center text-center space-y-2 relative overflow-hidden active:scale-95 ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                      }`}
                    >
                      <div className={`w-full max-w-[64px] aspect-[5/7] rounded-lg border p-1 shadow-inner flex items-center justify-center overflow-hidden ${
                        isSelected ? 'bg-white/10 border-white/30' : 'bg-white border-slate-200'
                      }`}>
                        {renderTargetSVG(
                          tmpl.type,
                          isSelected ? '#ffffff' : '#000000',
                          isSelected ? '#1e40af' : '#ffffff',
                          isSelected ? '#ffffff' : '#94a3b8',
                          false
                        )}
                      </div>
                      <span className="text-[11px] font-black leading-tight tracking-tight">
                        {tmpl.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 2. Şablon Özelleştirme */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <i className="fa-solid fa-palette text-blue-600"></i>
                <span>2. Renk ve Kağıt Parametreleri</span>
              </label>

              {/* Color Scheme & Paper Size */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                    Renk Teması
                  </span>
                  <select
                    value={colorScheme}
                    onChange={(e) => setColorScheme(e.target.value as ColorScheme)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {COLOR_SCHEMES.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                    Kağıt Boyutu
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPageSize('a4')}
                      className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                        pageSize === 'a4' 
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                    >
                      A4 (210×297 mm)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPageSize('a3')}
                      className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                        pageSize === 'a3' 
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                    >
                      A3 (297×420 mm)
                    </button>
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCenterCross}
                    onChange={(e) => setShowCenterCross(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-600"
                  />
                  <span>Merkez Artı Nişangah</span>
                </label>
                
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reverseColors}
                    onChange={(e) => setReverseColors(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-600"
                  />
                  <span>Renkleri Ters Çevir</span>
                </label>
              </div>
            </section>

            {/* PDF İndir Butonu */}
            <div className="pt-2 pb-4">
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={isExporting}
                className="w-full py-4 sm:py-4.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-xl shadow-blue-600/25 active:scale-95 transition-all font-black uppercase tracking-[0.18em] text-sm flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <i className="fas fa-spinner fa-spin text-base"></i>
                    <span>PDF Hazırlanıyor...</span>
                  </>
                ) : (
                  <>
                    <i className="fas fa-file-pdf text-base"></i>
                    <span>PDF Formatında İndir ({pageSize.toUpperCase()})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Sağ Panel: Canlı Baskı Önizleme Alanı */}
        <div className="flex-1 h-full relative overflow-y-auto bg-slate-200/90 p-4 sm:p-6 flex flex-col items-center justify-center">
          {/* Paper Canvas Simulator */}
          <div className="flex-1 w-full flex items-center justify-center min-h-0 py-2">
            <div
              className="bg-white shadow-2xl rounded-sm border border-slate-300 relative flex items-center justify-center overflow-hidden transition-all duration-300"
              style={{
                aspectRatio: '210 / 297',
                maxHeight: '100%',
                maxWidth: '100%',
                height: 'calc(100vh - 8rem)',
              }}
            >
              <div
                ref={previewRef}
                className="w-full h-full bg-white text-slate-900 flex flex-col justify-center items-center relative overflow-hidden"
                style={{
                  aspectRatio: '210 / 297',
                  boxSizing: 'border-box'
                }}
              >
                <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
                  <div className="w-full h-full relative flex items-center justify-center">
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresetTemplatesView;
