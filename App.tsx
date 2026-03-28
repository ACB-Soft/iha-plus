import React, { useState, useEffect } from 'react';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import PointMeasurement from './components/PointMeasurement';
import SavedLocationsList from './components/SavedLocationsList';
import GCPPlanConfig from './components/GCPPlanConfig';
import ResultCard from './components/ResultCard';
import HelpView from './components/HelpView';
import SettingsView from './components/SettingsView';
import KMLMapView from './components/KMLMapView';
import FlightPlanConfig from './components/FlightPlanConfig';
import GCPPlanDisplay from './components/GCPPlanDisplay';
import GlobalFooter from './components/GlobalFooter';
import { SavedLocation, Coordinate, AppSettings } from './types';
import { KMLFeature } from './components/KMLUtils';
import { FlightConfig } from './src/types/flight';
import { geoidService } from './services/GeoidService';

const App = () => {
  type ViewType = 'onboarding' | 'dashboard' | 'capture' | 'list' | 'flightPlanner' | 'result' | 'help' | 'settings' | 'kmlMap' | 'flightConfig' | 'gcpMap';
  const [view, setView] = useState<ViewType>('onboarding');
  const [subView, setSubView] = useState<string | null>(null);
  const [kmlData, setKmlData] = useState<{ name: string; features: KMLFeature[] } | null>(null);
  const [flightConfig, setFlightConfig] = useState<FlightConfig | null>(null);
  const viewRef = React.useRef<ViewType>(view);
  const subViewRef = React.useRef<string | null>(subView);

  // Keep refs in sync
  React.useEffect(() => {
    viewRef.current = view;
    subViewRef.current = subView;
  }, [view, subView]);

  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [lastResult, setLastResult] = useState<SavedLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [resultSource, setResultSource] = useState<'capture' | 'list'>('capture');
  const [autoShowMap, setAutoShowMap] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => ({
    defaultCoordinateSystem: localStorage.getItem('default_coord_system') || 'WGS84',
    defaultAccuracyLimit: parseFloat(localStorage.getItem('default_accuracy_limit') || '5'),
    defaultMeasurementDuration: parseInt(localStorage.getItem('default_duration') || '5'),
    alertsEnabled: localStorage.getItem('default_audio_feedback_enabled') !== 'false',
    screenAlwaysOn: localStorage.getItem('default_screen_always_on') === 'true',
    mapProvider: localStorage.getItem('default_map_provider') || 'Google Hybrid',
  }));

  // Navigation wrapper to sync with browser history
  const navigateTo = (newView: ViewType, newSubView: string | null = null) => {
    if (newView !== view || newSubView !== subView) {
      const currentState = window.history.state;
      const currentIndex = (currentState && typeof currentState.index === 'number') ? currentState.index : 0;

      if (newView === 'dashboard') {
        // Reset to dashboard: jump back to the root entry
        if (currentIndex > 0) {
          window.history.go(-currentIndex);
        } else {
          window.history.replaceState({ view: 'dashboard', subView: null, index: 0 }, '');
          setView('dashboard');
          setSubView(null);
        }
      } else {
        const nextIndex = currentIndex + 1;
        window.history.pushState({ view: newView, subView: newSubView, index: nextIndex }, '');
        setView(newView);
        setSubView(newSubView);
      }
    }
  };

  useEffect(() => {
    geoidService.initialize();

    // Always start with onboarding as requested
    setView('onboarding');
    setSubView(null);
    window.history.replaceState({ view: 'onboarding', subView: null, index: 0 }, '');

    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        setView(event.state.view);
        setSubView(event.state.subView || null);
      } else if (viewRef.current !== 'onboarding') {
        // Only go back to onboarding if we're not already there
        setView('onboarding');
        setSubView(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const CURRENT_KEY = 'iha_locations_v1.1';
    const PREV_KEY = 'gps_locations_v5.0';
    const OLD_KEY = 'gps_locations_v7.8.8';
    
    let saved = localStorage.getItem(CURRENT_KEY);
    if (!saved) {
      const prevData = localStorage.getItem(PREV_KEY);
      if (prevData) {
        localStorage.setItem(CURRENT_KEY, prevData);
        saved = prevData;
      } else {
        const oldData = localStorage.getItem(OLD_KEY);
        if (oldData) {
          localStorage.setItem(CURRENT_KEY, oldData);
          saved = oldData;
        }
      }
    }
    
    if (saved) setLocations(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('iha_locations_v1.1', JSON.stringify(locations));
  }, [locations]);

  const handleFinishOnboarding = () => {
    localStorage.setItem('onboarding_v1.1_done', 'true');
    navigateTo('dashboard');
  };

  const handleGPSComplete = (coord: Coordinate, folderName: string, pointName: string, description: string, coordinateSystem: string) => {
    const newLoc: SavedLocation = {
      ...coord,
      id: Date.now().toString(),
      name: pointName,
      folderName: folderName,
      description: description,
      coordinateSystem: coordinateSystem
    };
    setLocations(prev => [newLoc, ...prev]);
    setLastResult(newLoc);
    setAutoShowMap(false);
    setResultSource('capture');
    navigateTo('result');
  };

  const resetToDashboard = () => {
    setIsContinuing(false);
    navigateTo('dashboard');
  };

  const handleNewMeasurement = (continuing: boolean) => {
    setIsContinuing(continuing);
    navigateTo('capture', continuing ? 'READY' : 'SELECT_MODE');
  };

  const handleViewOnMap = (l: SavedLocation) => {
    setLastResult(l);
    setAutoShowMap(true);
    setResultSource('list');
    navigateTo('result');
  };

  return (
    <div className="h-full bg-slate-200 font-sans text-slate-900 overflow-hidden flex flex-col">
      <div className="flex-1 flex flex-col relative overflow-hidden h-full">
        
        {view === 'onboarding' && (
          <div className="flex-1 flex flex-col overflow-y-auto h-full">
            <Onboarding onFinish={handleFinishOnboarding} />
            <GlobalFooter />
          </div>
        )}
        
        {view === 'dashboard' && (
          <div className="flex-1 flex flex-col overflow-y-auto h-full no-scrollbar">
            <Dashboard 
              onStartFlightConfig={() => navigateTo('flightConfig')} 
              onShowList={() => navigateTo('list')}
              onShowFlightPlanner={() => navigateTo('flightPlanner')}
              onShowHelp={() => navigateTo('help')}
              onShowSettings={() => navigateTo('settings')}
            />
            <GlobalFooter />
          </div>
        )}

        {view === 'help' && (
          <HelpView onBack={() => window.history.back()} />
        )}

        {view === 'settings' && (
          <SettingsView 
            onBack={() => {
              // Refresh settings when coming back from settings
              setSettings({
                defaultCoordinateSystem: localStorage.getItem('default_coord_system') || 'WGS84',
                defaultAccuracyLimit: parseFloat(localStorage.getItem('default_accuracy_limit') || '5'),
                defaultMeasurementDuration: parseInt(localStorage.getItem('default_duration') || '5'),
                alertsEnabled: localStorage.getItem('default_audio_feedback_enabled') !== 'false',
                screenAlwaysOn: localStorage.getItem('default_screen_always_on') === 'true',
                mapProvider: localStorage.getItem('default_map_provider') || 'Google Hybrid',
              });
              window.history.back();
            }} 
          />
        )}

        {view === 'capture' && (
          <div className="flex-1 flex flex-col overflow-y-auto h-full">
            <PointMeasurement 
              existingLocations={locations}
              onComplete={handleGPSComplete}
              onCancel={() => window.history.back()}
              isContinuing={isContinuing}
              currentStep={subView as any}
              onNavigate={(step) => navigateTo('capture', step)}
              onStartFlightConfig={() => navigateTo('flightConfig')}
            />
          </div>
        )}

        {view === 'flightConfig' && (
          <FlightPlanConfig 
            onBack={() => window.history.back()}
            initialKmlData={kmlData}
            onKmlDataChange={setKmlData}
            onPlanCreated={(data, config) => {
              setKmlData(data);
              setFlightConfig(config);
              navigateTo('kmlMap');
            }}
          />
        )}

        {view === 'kmlMap' && kmlData && flightConfig && (
          <KMLMapView 
            projectName={kmlData.name} 
            features={kmlData.features} 
            config={flightConfig}
            onBack={() => window.history.back()} 
          />
        )}

        {view === 'list' && (
          <div className="flex-1 flex flex-col animate-in h-full overflow-y-auto no-scrollbar bg-slate-200">
            <header className="px-8 pt-6 pb-6 flex items-center gap-5 shrink-0 bg-slate-200 shadow-sm z-30">
              <button onClick={() => window.history.back()} className="w-12 h-12 bg-slate-200 rounded-2xl flex items-center justify-center shadow-md border border-slate-100 text-slate-800 active:scale-90 transition-all">
                <i className="fas fa-chevron-left text-sm"></i>
              </button>
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none">Kayıtlı Projeler</h2>
              </div>
            </header>
            <div className="px-8 pt-4 pb-4 w-full">
              <div className="max-w-sm mx-auto w-full">
                <SavedLocationsList 
                  locations={locations} 
                  onDelete={(id) => setLocations(prev => prev.filter(l => l.id !== id))}
                onDeleteFolder={(name) => setLocations(prev => prev.filter(l => l.folderName !== name))}
                onRenameFolder={(oldName, newName) => setLocations(prev => prev.map(l => 
                  l.folderName === oldName ? { ...l, folderName: newName } : l
                ))}
                onBulkDelete={(ids) => setLocations(prev => prev.filter(l => !ids.includes(l.id)))}
                onViewOnMap={handleViewOnMap}
              />
            </div>
            </div>
            <GlobalFooter />
          </div>
        )}

        {view === 'flightPlanner' && (
          <GCPPlanConfig 
            onBack={() => window.history.back()} 
            onPlanCreated={(data, config) => {
              setKmlData(data);
              setFlightConfig(config);
              navigateTo('gcpMap');
            }}
          />
        )}

        {view === 'gcpMap' && kmlData && flightConfig && (
          <GCPPlanDisplay
            projectName={kmlData.name}
            features={kmlData.features}
            config={flightConfig}
            onBack={() => window.history.back()}
          />
        )}

        {view === 'result' && lastResult && (
          <div className="flex-1 flex flex-col animate-in h-full overflow-y-auto no-scrollbar bg-slate-200 px-8">
            <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full pt-8">
              <ResultCard 
                location={lastResult} 
                initialShowMap={autoShowMap} 
                onCloseMap={resultSource === 'list' ? () => window.history.back() : undefined}
              />
              <div className="mt-8 space-y-4">
                 <button 
                   onClick={() => handleNewMeasurement(true)} 
                   className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-2xl shadow-indigo-200 active:scale-95 transition-all text-[13px] uppercase tracking-[0.2em] leading-none"
                 >
                   YENİ NOKTA EKLE
                 </button>
                 <button 
                   onClick={resetToDashboard} 
                   className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[12px] uppercase tracking-[0.2em] transition-all leading-none shadow-xl shadow-slate-300"
                 >
                   ÖLÇÜMÜ BİTİR
                 </button>
              </div>
            </div>
            <GlobalFooter noPadding={true} />
          </div>
        )}

      </div>
    </div>
  );
};

export default App;
