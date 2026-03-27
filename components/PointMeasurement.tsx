import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Coordinate, SavedLocation } from '../types';
import { convertToMSL } from './GeoidUtils';
import { getAccuracyColor, getAccuracyBg } from '../utils/StyleUtils';
import { parseKML, parseKMZ, KMLFeature } from './KMLUtils';
import { BRAND_NAME } from '../version';
import GlobalFooter from './GlobalFooter';

interface Props {
  onComplete: (coord: Coordinate, folderName: string, pointName: string, description: string, coordinateSystem: string) => void;
  onCancel: () => void;
  isContinuing?: boolean;
  existingLocations: SavedLocation[];
  currentStep?: 'SELECT_MODE' | 'FORM' | 'READY' | 'COUNTDOWN';
  onNavigate: (step: 'SELECT_MODE' | 'FORM' | 'READY' | 'COUNTDOWN') => void;
  onStartFlightConfig?: () => void;
}

const PointMeasurement: React.FC<Props> = ({ onComplete, onCancel, isContinuing = false, existingLocations, currentStep, onNavigate, onStartFlightConfig }) => {
  const [step, setStep] = useState<'SELECT_MODE' | 'FORM' | 'READY' | 'COUNTDOWN'>(currentStep || (isContinuing ? 'READY' : 'SELECT_MODE'));
  const [isNewProject, setIsNewProject] = useState(!isContinuing);

  useEffect(() => {
    if (currentStep && currentStep !== step) {
      setStep(currentStep);
    }
  }, [currentStep]);
  const [folderName, setFolderName] = useState(localStorage.getItem('last_folder_name') || '');
  const [pointName, setPointName] = useState('');
  
  const getInitialSystem = () => {
     const savedFolder = localStorage.getItem('last_folder_name');
     if (savedFolder) {
        const proj = existingLocations.find(l => l.folderName === savedFolder);
        if (proj && proj.coordinateSystem) return proj.coordinateSystem;
     }
     return localStorage.getItem('default_coord_system') || 'WGS84';
  };

  const [coordinateSystem, setCoordinateSystem] = useState(getInitialSystem());
  const [accuracyLimit, setAccuracyLimit] = useState(parseFloat(localStorage.getItem('default_accuracy_limit') || '5.0'));
  const [measurementDuration, setMeasurementDuration] = useState(parseInt(localStorage.getItem('default_duration') || '5'));
  const [seconds, setSeconds] = useState(parseInt(localStorage.getItem('default_duration') || '5'));
  const [sampleCount, setSampleCount] = useState(0);
  const [instantAccuracy, setInstantAccuracy] = useState<number | null>(null);
  const [waitingForSignal, setWaitingForSignal] = useState(true);
  const [captureError, setCaptureError] = useState<string | null>(null);
  
  const samplesRef = useRef<Coordinate[]>([]);
  const lastPositionRef = useRef<GeolocationPosition | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('Wake Lock is active');
      } catch (err: any) {
        console.error(`${err.name}, ${err.message}`);
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
      console.log('Wake Lock released');
    }
  };

  // Warm up GPS on mount
  useEffect(() => {
    startGPSWarmup();
    return () => {
      releaseWakeLock();
    };
  }, []);

  const startGPSWarmup = () => {
    if (navigator.geolocation) {
      setWaitingForSignal(true);
      setCaptureError(null);
      
      // iOS için optimize edilmiş ayarlar
      // maximumAge: 5000 -> Son 5 saniyedeki konumu kabul et (hızlı açılış için)
      // timeout: 30000 -> GPS'in ısınması için iPhone'lara daha fazla zaman tanı
      const options = { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 };
      
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setInstantAccuracy(pos.coords.accuracy);
          lastPositionRef.current = pos;
          setWaitingForSignal(false);
          setCaptureError(null);
        },
        (err) => {
          console.warn("High accuracy failed, trying low accuracy...", err);
          // Yüksek hassasiyet başarısız olursa, düşük hassasiyeti dene (Fallback)
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setInstantAccuracy(pos.coords.accuracy);
              lastPositionRef.current = pos;
              setWaitingForSignal(false);
              setCaptureError(null);
            },
            (err2) => {
              let msg = `Kod: ${err2.code} - ${err2.message}`;
              if (err2.code === 1) {
                msg = "Konum izni reddedildi. Lütfen ayarlardan izin verin.";
              }
              else if (err2.code === 2) msg = "Konum alınamıyor. GPS sinyali zayıf olabilir.";
              else if (err2.code === 3) msg = "Zaman aşımı. GPS yanıt vermedi.";
              setCaptureError(msg);
            },
            { enableHighAccuracy: false, timeout: 30000, maximumAge: 10000 }
          );
        },
        options
      );
    } else {
      setCaptureError("Tarayıcınız konum servisini desteklemiyor.");
    }
  };

  const getNextPointName = useCallback((projName: string) => {
    const projPoints = existingLocations.filter(l => l.folderName === projName);
    return `Nokta${projPoints.length + 1}`;
  }, [existingLocations]);

  useEffect(() => {
    if (folderName) setPointName(getNextPointName(folderName));
  }, [folderName, getNextPointName]);

  useEffect(() => {
    if (folderName) {
      const existingProject = existingLocations.find(l => l.folderName === folderName);
      if (existingProject && existingProject.coordinateSystem) {
        setCoordinateSystem(existingProject.coordinateSystem);
      }
    }
  }, [folderName, existingLocations]);

  useEffect(() => {
    if (step === 'READY' || step === 'COUNTDOWN') {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setInstantAccuracy(pos.coords.accuracy);
          lastPositionRef.current = pos;
          setWaitingForSignal(false);
          setCaptureError(null);
          if (step === 'COUNTDOWN' && !waitingForSignal) {
            samplesRef.current.push({
              lat: pos.coords.latitude, lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy, altitude: pos.coords.altitude, timestamp: Date.now()
            });
            setSampleCount(samplesRef.current.length);
          }
        },
        (err) => { 
          setInstantAccuracy(null); 
          setWaitingForSignal(true);
          setCaptureError(`Kod: ${err.code} - ${err.message}`);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      );
    } else {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }
    return () => { 
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [step]); // Removed waitingForSignal from deps to avoid infinite loop

  const processSamples = useCallback(() => {
    let samples = [...samplesRef.current];
    if (samples.length === 0 && lastPositionRef.current) {
      const p = lastPositionRef.current;
      samples.push({ 
        lat: p.coords.latitude, 
        lng: p.coords.longitude, 
        accuracy: p.coords.accuracy, 
        altitude: p.coords.altitude, 
        timestamp: Date.now() 
      });
    }
    if (samples.length === 0) {
      alert("Konum verisi alınamadı.");
      window.history.back();
      return;
    }
    const avg = {
      lat: samples.reduce((a, b) => a + b.lat, 0) / samples.length,
      lng: samples.reduce((a, b) => a + b.lng, 0) / samples.length,
      accuracy: samples.reduce((a, b) => a + b.accuracy, 0) / samples.length,
      altitude: samples.reduce((a, b) => a + (b.altitude || 0), 0) / samples.length,
      timestamp: Date.now()
    };

    // Feedback (Sound/Vibration)
    const audioEnabled = localStorage.getItem('default_audio_feedback_enabled') !== 'false';
    const vibrationEnabled = localStorage.getItem('default_vibration_feedback_enabled') !== 'false';

    if (vibrationEnabled && navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
    
    if (audioEnabled) {
      // Simple beep sound using Web Audio API
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.3);
      } catch (e) {
        console.warn("Audio feedback failed", e);
      }
    }

    onComplete(avg, folderName, pointName, '', coordinateSystem);
    releaseWakeLock();
  }, [folderName, pointName, coordinateSystem, onComplete]);

  // Ref to track accuracy validity without triggering effect re-runs
  const isAccuracyOkRef = useRef(false);

  useEffect(() => {
    isAccuracyOkRef.current = instantAccuracy !== null && instantAccuracy <= accuracyLimit;
  }, [instantAccuracy, accuracyLimit]);

  useEffect(() => {
    let timer: any;
    
    if (step === 'COUNTDOWN' && !waitingForSignal) {
      timer = setInterval(() => {
        // Only decrement if accuracy is within limits
        if (isAccuracyOkRef.current) {
          setSeconds(prev => prev > 0 ? prev - 1 : 0);
        }
      }, 1000);
    }
    
    return () => clearInterval(timer);
  }, [step, waitingForSignal]);

  useEffect(() => {
    if (step === 'COUNTDOWN' && seconds === 0) {
      processSamples();
    }
  }, [step, seconds, processSamples]);

  const handleStartMeasurement = () => {
    requestWakeLock();
    // Start with the last known position as the first sample
    if (lastPositionRef.current) {
      const p = lastPositionRef.current;
      samplesRef.current = [{
        lat: p.coords.latitude, 
        lng: p.coords.longitude, 
        accuracy: p.coords.accuracy, 
        altitude: p.coords.altitude, 
        timestamp: Date.now()
      }];
      setSampleCount(1);
    } else {
      samplesRef.current = [];
      setSampleCount(0);
    }

    setSeconds(measurementDuration);
    if (lastPositionRef.current && instantAccuracy !== null) setWaitingForSignal(false);
    else setWaitingForSignal(true);
    onNavigate('COUNTDOWN');
  };

  const PageHeader = (title: string) => (
    <header className="flex flex-col items-center shrink-0 mb-10 md:mb-16">
      <div className="space-y-2 md:space-y-3 text-center px-6">
        <p className="text-slate-900 font-black text-[12px] md:text-[14px] uppercase tracking-[0.18em] leading-tight max-w-[260px] mx-auto opacity-80">
          {title}
        </p>
        <h1 className="text-5xl md:text-6xl font-black text-blue-600 tracking-tighter leading-none">
          {BRAND_NAME}
        </h1>
      </div>
    </header>
  );

  const BackButton = (onClick: () => void) => (
    <div className="absolute top-6 left-8 z-20">
      <button 
        onClick={onClick} 
        className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center shadow-xl border border-blue-200 text-slate-800 active:scale-90 transition-all hover:bg-blue-100"
      >
        <i className="fas fa-chevron-left text-sm"></i>
      </button>
    </div>
  );

  if (step === 'SELECT_MODE') return (
    <div className="w-full flex flex-col bg-slate-200 animate-in h-full relative overflow-y-auto no-scrollbar pt-20 md:pt-28">
      {BackButton(onCancel)}
      {PageHeader("Uçuş Planı Oluştur")}
      
      <main className="w-full max-w-sm mx-auto flex flex-col space-y-3 px-6">
        {/* Yeni Uçuş Planı */}
        <button 
          onClick={() => { setIsNewProject(true); setFolderName(''); onNavigate('FORM'); }}
          className="w-full py-4 px-5 bg-emerald-600 text-white rounded-2xl shadow-lg shadow-emerald-600/30 active:scale-[0.98] transition-all flex items-center justify-between group relative overflow-hidden border border-white/10"
        >
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30">
              <i className="fas fa-folder-plus text-lg text-white"></i>
            </div>
            <span className="text-base font-black tracking-tight leading-none uppercase text-left">Yeni Uçuş Planı</span>
          </div>
          <i className="fas fa-chevron-right text-white/40 group-hover:translate-x-1 transition-transform text-[10px]"></i>
          <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-6 -mt-6 blur-xl"></div>
        </button>

        {/* KML/KMZ Yükle */}
        <button 
          onClick={onStartFlightConfig}
          className="w-full py-4 px-5 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-600/30 active:scale-[0.98] transition-all flex items-center justify-between group relative overflow-hidden border border-white/10"
        >
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30">
              <i className="fas fa-file-import text-lg text-white"></i>
            </div>
            <span className="text-base font-black tracking-tight leading-none uppercase text-left">KML/KMZ Yükle</span>
          </div>
          <i className="fas fa-chevron-right text-white/40 group-hover:translate-x-1 transition-transform text-[10px]"></i>
          <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-6 -mt-6 blur-xl"></div>
        </button>
      </main>

      <GlobalFooter />
    </div>
  );

  if (step === 'FORM') return (
    <div className="w-full flex flex-col bg-slate-200 animate-in h-full relative overflow-y-auto no-scrollbar pt-20 md:pt-28">
      {BackButton(() => onNavigate('SELECT_MODE'))}
      {PageHeader("Proje Bilgisi")}

      <div className="w-full px-6 mx-auto">
        <div className="max-w-sm mx-auto w-full">
          <div className="bg-white p-8 rounded-[32px] shadow-xl border border-slate-100 space-y-6">
          <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">Proje Adı</label>
            {isNewProject ? (
              <input type="text" placeholder="Örn: Saha Çalışması A" value={folderName} onChange={e => setFolderName(e.target.value)} className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all text-base" />
            ) : (
              <select value={folderName} onChange={e => setFolderName(e.target.value)} className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none appearance-none text-base">
                <option value="">Seçiniz...</option>
                {Array.from(new Set(existingLocations.map(l => l.folderName))).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
          </div>
          
          <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">Koordinat Sistemi</label>
            <select 
              value={coordinateSystem} 
              onChange={e => setCoordinateSystem(e.target.value)} 
              disabled={!isNewProject}
              className={`w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none appearance-none text-base ${!isNewProject ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <option value="WGS84">WGS84 (Enlem-Boylam)</option>
              <option value="ITRF96_3">ITRF96 - 3°</option>
              <option value="ED50_3">ED50 - 3°</option>
              <option value="ED50_6">ED50 - 6°</option>
            </select>
          </div>

          <button 
            disabled={!folderName.trim()}
            onClick={() => { localStorage.setItem('last_folder_name', folderName); onNavigate('READY'); }} 
            className="w-full py-3 md:py-4 px-5 bg-blue-600 text-white rounded-2xl font-black text-[13px] uppercase tracking-[0.2em] active:scale-95 disabled:opacity-30 transition-all shadow-xl shadow-blue-100"
          >
            ÖLÇÜME HAZIRLAN
          </button>
        </div>
      </div>
      </div>
      <GlobalFooter />
    </div>
  );

  return (
    <div className="w-full flex flex-col bg-slate-200 h-full animate-in overflow-hidden relative">
      {BackButton(() => {
        if (step === 'COUNTDOWN' || step === 'READY' || step === 'FORM') {
          onNavigate('FORM');
        } else if (isContinuing) {
          onCancel();
        } else {
          window.history.back();
        }
      })}

      <div className="flex-1 flex flex-col overflow-y-auto no-scrollbar pt-20 md:pt-28">
        <div className="flex-1 flex flex-col items-center justify-start p-6 text-center relative">
          
          <div className="mb-8">
            <p className="text-slate-900 font-black text-[12px] uppercase tracking-[0.18em] leading-tight opacity-80 mb-1">
              {folderName}
            </p>
            <h2 className="text-3xl font-black text-blue-600 tracking-tighter leading-none">Ölçüm Ekranı</h2>
          </div>

          <div className="relative flex items-center justify-center w-full max-h-[300px] mb-8">
            <div className="w-44 h-44 sm:w-56 sm:h-56 md:w-72 md:h-72 rounded-[3.5rem] md:rounded-[4.5rem] border-8 border-slate-50 shadow-2xl flex items-center justify-center relative bg-slate-200">
              <div className={`absolute inset-4 md:inset-6 border-2 rounded-[2.8rem] md:rounded-[3.8rem] ${instantAccuracy && instantAccuracy <= 10 ? 'border-emerald-100' : 'border-slate-50'}`}></div>
              {step === 'COUNTDOWN' && !waitingForSignal && <div className="scanner-line"></div>}
              
              <span className="text-7xl md:text-9xl font-black text-slate-900 mono-font z-10 tracking-tighter leading-none">
                {waitingForSignal ? (
                  <div className="flex flex-col items-center gap-4">
                    <i className="fas fa-satellite fa-spin text-blue-600 text-4xl md:text-5xl"></i>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 animate-pulse">Sinyal Bekleniyor</span>
                  </div>
                ) : (
                  step === 'COUNTDOWN' ? seconds : <i className={`fas fa-satellite-dish text-5xl md:text-7xl transition-all duration-700 ${getAccuracyColor(instantAccuracy)}`}></i>
                )}
              </span>

              {instantAccuracy !== null && (
                 <div className={`absolute -bottom-4 px-5 py-2.5 rounded-2xl border-2 shadow-xl flex items-center gap-2.5 animate-in fade-in zoom-in ${getAccuracyBg(instantAccuracy)}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${getAccuracyColor(instantAccuracy).replace('text','bg')} animate-pulse`}></div>
                    <span className={`text-[12px] md:text-[14px] font-black mono-font ${getAccuracyColor(instantAccuracy)}`}>±{instantAccuracy.toFixed(1)}m</span>
                 </div>
              )}

              {captureError && (
                <div className="absolute -bottom-24 left-0 right-0 animate-in slide-in-from-top-2 flex flex-col items-center gap-2 z-30">
                  <div className="bg-rose-50 border border-rose-100 px-4 py-2 rounded-xl flex items-center gap-3 shadow-sm">
                    <i className="fas fa-exclamation-circle text-rose-500 text-xs"></i>
                    <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">{captureError}</span>
                  </div>
                  <button 
                    onClick={startGPSWarmup}
                    className="px-4 py-2 bg-slate-200 border border-slate-200 shadow-sm rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-600 active:scale-95 transition-all"
                  >
                    <i className="fas fa-rotate-right mr-2"></i>
                    Tekrar Dene
                  </button>
                  {captureError.includes("izni reddedildi") && (
                    <p className="text-[9px] text-rose-500 font-black uppercase tracking-widest mt-1 text-center px-4 leading-tight opacity-80">
                      Safari Ayarlarından "Konum" İznini Kontrol Edin
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="w-full max-w-sm mx-auto w-full shrink-0 pb-4">
            {step === 'READY' ? (
              <div className="bg-white p-8 rounded-[32px] shadow-xl border border-slate-100 space-y-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] leading-tight block px-1">
                    Nokta İsmi
                  </label>
                  <input type="text" value={pointName} onChange={e => setPointName(e.target.value)} className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl font-black text-center text-lg text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all leading-none" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] leading-tight block px-1">
                      Hassasiyet (m)
                    </label>
                    <select 
                      value={accuracyLimit} 
                      onChange={e => setAccuracyLimit(parseFloat(e.target.value))}
                      className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl font-black text-center text-lg text-slate-900 outline-none appearance-none leading-none"
                    >
                      {[2, 3, 5, 10, 20, 50, 100].map(v => <option key={v} value={v}>{v}m</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] leading-tight block px-1">
                      Süre (sn)
                    </label>
                    <select 
                      value={measurementDuration} 
                      onChange={setMeasurementDuration}
                      className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl font-black text-center text-lg text-slate-900 outline-none appearance-none leading-none"
                    >
                      {[5, 10, 15, 20, 30].map(v => <option key={v} value={v}>{v}sn</option>)}
                    </select>
                  </div>
                </div>

                <button 
                  onClick={handleStartMeasurement} 
                  disabled={instantAccuracy === null}
                  className="w-full py-5 px-5 bg-emerald-600 text-white rounded-2xl font-black text-[14px] active:scale-[0.96] disabled:bg-slate-300 transition-all uppercase tracking-[0.25em] leading-none shadow-2xl shadow-emerald-100"
                >
                  ÖLÇÜMÜ BAŞLAT
                </button>
              </div>
            ) : (
              <div className="space-y-2 py-2">
                {instantAccuracy !== null && instantAccuracy > accuracyLimit ? (
                  <div className="animate-pulse space-y-1">
                    <p className="font-black text-amber-600 text-[12px] md:text-[13px] uppercase tracking-[0.2em] leading-none">Hassasiyet Bekleniyor...</p>
                    <p className="text-slate-400 text-[10px] font-bold leading-tight uppercase tracking-widest px-4">
                      Mevcut hassasiyet (±{instantAccuracy.toFixed(1)}m),<br/>belirlenen {accuracyLimit}m limitinden yüksek.
                    </p>
                  </div>
                ) : (
                  <div className="animate-pulse space-y-1">
                    <p className="font-black text-emerald-600 text-[12px] md:text-[13px] uppercase tracking-[0.3em] leading-none">{sampleCount} KONUM ÖRNEĞİ</p>
                    <p className="text-slate-400 text-[11px] md:text-[12px] font-bold leading-none uppercase tracking-widest">SABİT TUTUN</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <GlobalFooter />
      </div>
    </div>
  );
};

export default PointMeasurement;
