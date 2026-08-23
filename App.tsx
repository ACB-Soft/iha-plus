import React, { useState, useEffect } from 'react';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import HelpView from './components/HelpView';
import SettingsView from './components/SettingsView';
import PresetTemplatesView from './components/PresetTemplatesView';
import ControlFlightView from './components/ControlFlightView';
import KMLMapView from './components/KMLMapView';
import FlightPlanConfig from './components/FlightPlanConfig';
import GCPPlanDisplay from './components/GCPPlanDisplay';
import GlobalFooter from './components/GlobalFooter';
import { AppSettings, DEFAULT_FLIGHT_DEFAULTS } from './types';
import { KMLData } from './components/KMLUtils';
import { FlightConfig } from './src/types/flight';

const getInitialSettings = (): AppSettings => {
  let flightDefaults = { ...DEFAULT_FLIGHT_DEFAULTS };
  const storedFlight = localStorage.getItem('flight_plan_defaults');
  if (storedFlight) {
    try {
      flightDefaults = { ...DEFAULT_FLIGHT_DEFAULTS, ...JSON.parse(storedFlight) };
    } catch (e) {
      console.error('Error parsing stored flight defaults', e);
    }
  }

  return {
    mapProvider: localStorage.getItem('default_map_provider') || 'Google Satellite',
    flightDefaults,
  };
};

const App = () => {
  type ViewType = 'onboarding' | 'dashboard' | 'help' | 'settings' | 'templates' | 'controlFlight' | 'kmlMap' | 'flightConfig' | 'gcpMap';
  const [view, setView] = useState<ViewType>('dashboard');
  const [subView, setSubView] = useState<string | null>(null);
  const [normalKmlData, setNormalKmlData] = useState<KMLData | null>(null);
  const [stripKmlData, setStripKmlData] = useState<KMLData | null>(null);
  const [gcpKmlData, setGcpKmlData] = useState<KMLData | null>(null);
  const [gcpSubAreaKmlData, setGcpSubAreaKmlData] = useState<KMLData | null>(null);
  const [flightType, setFlightType] = useState<'Normal' | 'Strip'>('Normal');
  const [flightConfig, setFlightConfig] = useState<FlightConfig | null>(null);
  const [savedNormalConfig, setSavedNormalConfig] = useState<FlightConfig | null>(null);
  const [savedStripConfig, setSavedStripConfig] = useState<FlightConfig | null>(null);

  const resetSessionData = () => {
    setNormalKmlData(null);
    setStripKmlData(null);
    setGcpKmlData(null);
    setGcpSubAreaKmlData(null);
    setFlightConfig(null);
    setSavedNormalConfig(null);
    setSavedStripConfig(null);
  };

  const viewRef = React.useRef<ViewType>(view);
  const subViewRef = React.useRef<string | null>(subView);

  // Keep refs in sync
  React.useEffect(() => {
    viewRef.current = view;
    subViewRef.current = subView;
  }, [view, subView]);

  const [settings, setSettings] = useState<AppSettings>(getInitialSettings);

  // Navigation wrapper to sync with browser history
  const navigateTo = (newView: ViewType, newSubView: string | null = null) => {
    if (newView !== view || newSubView !== subView) {
      const currentState = window.history.state;
      const currentIndex = (currentState && typeof currentState.index === 'number') ? currentState.index : 0;

      if (newView === 'dashboard') {
        resetSessionData();
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
    // Default initial view is dashboard
    setView('dashboard');
    setSubView(null);
    window.history.replaceState({ view: 'dashboard', subView: null, index: 0 }, '');

    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        if (event.state.view === 'dashboard') {
          resetSessionData();
        }
        setView(event.state.view);
        setSubView(event.state.subView || null);
      } else if (viewRef.current !== 'dashboard') {
        resetSessionData();
        setView('dashboard');
        setSubView(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleFinishOnboarding = () => {
    localStorage.setItem('onboarding_v1.4_done', 'true');
    navigateTo('dashboard');
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
              onSelectFlightType={(type) => {
                resetSessionData();
                setFlightType(type);
                navigateTo('flightConfig');
              }} 
              onShowHelp={() => navigateTo('help')}
              onShowSettings={() => navigateTo('settings')}
              onShowPresetTemplates={() => navigateTo('templates')}
              onShowControlFlight={() => navigateTo('controlFlight')}
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
              setSettings(getInitialSettings());
              window.history.back();
            }} 
          />
        )}

        {view === 'templates' && (
          <PresetTemplatesView onBack={() => window.history.back()} />
        )}

        {view === 'controlFlight' && (
          <ControlFlightView 
            onBack={() => window.history.back()} 
            settings={settings}
          />
        )}

        {view === 'flightConfig' && (
          <FlightPlanConfig 
            onBack={() => navigateTo('dashboard')}
            flightType={flightType}
            initialKmlData={flightType === 'Normal' ? normalKmlData : stripKmlData}
            initialSubAreaKmlData={gcpSubAreaKmlData}
            initialConfig={flightType === 'Normal' ? savedNormalConfig : savedStripConfig}
            onKmlDataChange={(data) => {
              if (flightType === 'Normal') setNormalKmlData(data);
              else setStripKmlData(data);
            }}
            onSubAreaKmlDataChange={setGcpSubAreaKmlData}
            onPlanCreated={(data, config, isGcpEnabled) => {
              if (flightType === 'Normal') {
                setNormalKmlData(data);
                setSavedNormalConfig(config);
              } else {
                setStripKmlData(data);
                setSavedStripConfig(config);
              }

              setFlightConfig(config);

              if (isGcpEnabled) {
                setGcpKmlData(data);
                setGcpSubAreaKmlData(config.subAreaKmlData || null);
                navigateTo('gcpMap');
              } else {
                navigateTo('kmlMap');
              }
            }}
            settings={settings}
          />
        )}

        {view === 'kmlMap' && (flightType === 'Normal' ? normalKmlData : stripKmlData) && flightConfig && (
          <KMLMapView 
            projectName={(flightType === 'Normal' ? normalKmlData : stripKmlData)!.name} 
            features={(flightType === 'Normal' ? normalKmlData : stripKmlData)!.features} 
            config={flightConfig}
            onBack={() => window.history.back()} 
          />
        )}

        {view === 'gcpMap' && gcpKmlData && flightConfig && (
          <GCPPlanDisplay
            projectName={gcpKmlData.name}
            features={gcpKmlData.features}
            config={flightConfig}
            onBack={() => window.history.back()}
          />
        )}

      </div>
    </div>
  );
};

export default App;
