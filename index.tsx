import React from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import App from './App';
import { LanguageProvider } from './src/utils/LanguageContext';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <LanguageProvider>
      <App />
    </LanguageProvider>
  );
}

// Service Worker Registration disabled
