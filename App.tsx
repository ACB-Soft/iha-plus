import React, { useState, useEffect } from 'react';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import GCPPlanConfig from './components/GCPPlanConfig';
import HelpView from './components/HelpView';
import SettingsView from './components/SettingsView';
import KMLMapView from './components/KMLMapView';
import FlightPlanConfig from './components/FlightPlanConfig';
import GCPPlanDisplay from './components/GCPPlanDisplay';
import GlobalFooter from './components/GlobalFooter';
import { AppSettings } from './types';
import { KMLData } from './components/KMLUtils';
import { FlightConfig } from './src/types/flight';

const App = () => {
  type ViewType = 'onboarding' | 'dashboard' | 'flightPlanner' | 'help' | 'settings' | 'kmlMap' | 'flightConfig' | 'gcpMap';
  const [view, setView] = useState<ViewType>('onboarding');
  const [subView, setSubView] = useState<string | null>(null);
  const [normalKmlData, setNormalKmlData] = useState<KMLData | null>(null);
  const [stripKmlData, setStripKmlData] = useState<KMLData | null>(null);
  const [gcpKmlData, setGcpKmlData] = useState<KMLData | null>(null);
  const [flightType, setFlightType] = useState<'Normal' | 'Strip'>('Normal');
  const [flightStep, setFlightStep] = useState<'selection' | 'config'>('selection');
  const [flightConfig, setFlightConfig] = useState<FlightConfig | null>(null);
  const viewRef = React.useRef<ViewType>(view);
  const subViewRef = React.useRef<string | null>(subView);

  // Keep refs in sync
  React.useEffect(() => {
    viewRef.current = view;
    subViewRef.current = subView;
  }, [view, subView]);

  const [settings, setSettings] = useState<AppSettings>(() => ({
    defaultCoordinateSystem: localStorage.getItem('default_coord_system') || 'WGS84',
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

  const handleFinishOnboarding = () => {
    localStorage.setItem('onboarding_v1.2_done', 'true');
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
              onStartFlightConfig={() => navigateTo('flightConfig')} 
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
                alertsEnabled: localStorage.getItem('default_audio_feedback_enabled') !== 'false',
                screenAlwaysOn: localStorage.getItem('default_screen_always_on') === 'true',
                mapProvider: localStorage.getItem('default_map_provider') || 'Google Hybrid',
              });
              window.history.back();
            }} 
          />
        )}

        {view === 'flightConfig' && (
          <FlightPlanConfig 
            onBack={() => {
              if (flightStep === 'config') {
                setFlightStep('selection');
              } else {
                navigateTo('dashboard');
              }
            }}
            flightType={flightType}
            onFlightTypeChange={setFlightType}
            step={flightStep}
            onStepChange={setFlightStep}
            initialKmlData={flightType === 'Normal' ? normalKmlData : stripKmlData}
            onKmlDataChange={(data) => {
              if (flightType === 'Normal') setNormalKmlData(data);
              else setStripKmlData(data);
            }}
            onPlanCreated={(data, config) => {
              if (flightType === 'Normal') setNormalKmlData(data);
              else setStripKmlData(data);
              setFlightConfig(config);
              navigateTo('kmlMap');
            }}
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

        {view === 'flightPlanner' && (
          <GCPPlanConfig 
            onBack={() => window.history.back()} 
            initialKmlData={gcpKmlData}
            onKmlDataChange={setGcpKmlData}
            onPlanCreated={(data, config) => {
              setGcpKmlData(data);
              setFlightConfig(config);
              navigateTo('gcpMap');
            }}
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
