import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { SavedLocation } from '../types';
import { convertCoordinate } from '../utils/CoordinateUtils';
import { useOrthometricHeight } from '../hooks/useGeoid';


// Map rendering fix for modals
const MapResizer = () => {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize();
    }, 200);
  }, [map]);
  return null;
};

interface Props {
  location: SavedLocation;
  initialShowMap?: boolean;
  onCloseMap?: () => void;
}

const ResultCard: React.FC<Props> = ({ location, initialShowMap = false, onCloseMap }) => {
  const [showMap, setShowMap] = useState(initialShowMap);
  const { x, y, labelX, labelY, zone } = convertCoordinate(location.lat, location.lng, location.coordinateSystem || 'WGS84');
  const isUTM = location.coordinateSystem && location.coordinateSystem !== 'WGS84';
  const formattedX = isUTM ? x.toFixed(0) : x.toFixed(6);
  const formattedY = isUTM ? y.toFixed(0) : y.toFixed(6);
  
  const geoidInfo = useOrthometricHeight(location.altitude, location.lat, location.lng);
  const orthometricHeight = geoidInfo.orthometricHeight;

  const getMapUrl = () => {
    const provider = localStorage.getItem('default_map_provider') || 'Google Hybrid';
    switch (provider) {
      case 'Google Hybrid': return "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}";
      case 'Google Satellite': return "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";
      case 'OpenTopoMap': return "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";
      case 'Google Roadmap':
      default: return "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
    }
  };

  return (
    <>
      <div className="soft-card p-5 md:p-6 border-slate-200/60 space-y-5 md:space-y-6 text-center animate-in relative overflow-hidden bg-white max-w-sm mx-auto shadow-2xl shadow-slate-300/50">
        <div className="space-y-2 md:space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full border border-emerald-100 shadow-sm">
             <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
             <span className="text-[10px] md:text-[11px] font-black text-emerald-600 uppercase tracking-[0.2em] leading-none">Kayıt Edildi</span>
          </div>
          <div className="space-y-1">
            <p className="text-[14px] md:text-[16px] font-black text-slate-400 uppercase tracking-[0.3em] leading-none">{location.folderName}</p>
            <h3 className="text-3xl md:text-4xl font-black text-slate-900 leading-none tracking-tight truncate px-4">{location.name}</h3>
          </div>
        </div>

        <div className="space-y-4">
          {location.coordinateSystem && (
            <div className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] leading-none">
              {location.coordinateSystem.replace(/_/g, ' ')} {zone && `(${zone})`}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <div className="bg-slate-50 p-4 md:p-5 rounded-2xl md:rounded-3xl border border-slate-100 text-left shadow-sm">
              <div className="text-[9px] md:text-[10px] text-slate-400 font-black uppercase mb-1 leading-none">{labelY}</div>
              <div className="text-[14px] md:text-[16px] font-bold text-slate-900 mono-font leading-none">{formattedY}</div>
            </div>
            <div className="bg-slate-50 p-4 md:p-5 rounded-2xl md:rounded-3xl border border-slate-100 text-left shadow-sm">
              <div className="text-[9px] md:text-[10px] text-slate-400 font-black uppercase mb-1 leading-none">{labelX}</div>
              <div className="text-[14px] md:text-[16px] font-bold text-slate-900 mono-font leading-none">{formattedX}</div>
            </div>
            <div className="bg-indigo-50/50 p-4 md:p-5 rounded-2xl md:rounded-3xl border border-indigo-100 text-left shadow-sm">
              <div className="text-[9px] md:text-[10px] text-indigo-500 font-black uppercase mb-1 leading-none">Yükseklik</div>
              <div className="text-xl md:text-2xl font-black text-indigo-600 mono-font leading-none">{orthometricHeight !== null ? Math.round(orthometricHeight) : '---'}<span className="text-[10px] ml-1">m</span></div>
            </div>
            <div className={`p-4 md:p-5 rounded-2xl md:rounded-3xl border text-left transition-colors shadow-sm ${
              location.accuracy <= 10 ? 'bg-emerald-50/50 border-emerald-100' : 
              location.accuracy <= 20 ? 'bg-amber-50/50 border-amber-100' : 'bg-rose-50/50 border-rose-100'
            }`}>
              <div className={`text-[9px] md:text-[10px] font-black uppercase mb-1 leading-none ${
                location.accuracy <= 10 ? 'text-emerald-500' : 
                location.accuracy <= 20 ? 'text-amber-500' : 'text-rose-500'
              }`}>Hassasiyet</div>
              <div className={`text-xl md:text-2xl font-black mono-font leading-none ${
                location.accuracy <= 10 ? 'text-emerald-600' : 
                location.accuracy <= 20 ? 'text-amber-600' : 'text-rose-600'
              }`}>±{location.accuracy.toFixed(1)}<span className="text-[10px] ml-1">m</span></div>
            </div>
          </div>
        </div>
        
        <button 
          onClick={() => setShowMap(true)}
          className="w-full pt-4 md:pt-5 border-t border-slate-100 flex items-center justify-center gap-3 text-[11px] font-black text-indigo-600 uppercase tracking-[0.3em] active:scale-95 transition-all hover:text-indigo-700"
        >
          <i className="fas fa-map-marked-alt text-sm"></i>
          HARİTADA GÖR
        </button>

        <button 
          onClick={() => {
            const url = `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`;
            window.open(url, '_blank');
          }}
          className="w-full pt-4 md:pt-5 border-t border-slate-100 flex items-center justify-center gap-3 text-[11px] font-black text-emerald-600 uppercase tracking-[0.3em] active:scale-95 transition-all hover:text-emerald-700"
        >
          <i className="fas fa-route text-sm"></i>
          NAVİGASYONA GÖNDER
        </button>
      </div>

      {showMap && (
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col animate-in fade-in">
          <div className="absolute top-6 left-6 z-[10000]">
            <button 
              onClick={() => {
                setShowMap(false);
                if (onCloseMap) onCloseMap();
              }}
              className="w-12 h-12 bg-slate-200/90 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-2xl text-slate-900 active:scale-90 transition-all"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
          
          <MapContainer 
            center={[location.lat, location.lng]} 
            zoom={19} 
            maxZoom={22}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer
              url={getMapUrl()}
              attribution={localStorage.getItem('default_map_provider') === 'OpenTopoMap' ? '&copy; OpenTopoMap' : '&copy; Google'}
              maxZoom={22}
              maxNativeZoom={localStorage.getItem('default_map_provider') === 'OpenTopoMap' ? 17 : 20}
            />
            <Marker 
              position={[location.lat, location.lng]} 
              icon={L.divIcon({
                className: 'custom-marker',
                html: `<div style="width: 12px; height: 12px; background: #3b82f6; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 5px rgba(0,0,0,0.3);"></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
              })}
            />
            <Circle 
              center={[location.lat, location.lng]} 
              radius={location.accuracy} 
              pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.2 }} 
            />
            <MapResizer />
          </MapContainer>
          
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[10000] w-full max-w-xs px-6">
            <div className="bg-white/90 backdrop-blur-md p-5 rounded-2xl shadow-2xl border border-slate-200 flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Hassasiyet</p>
                <p className={`text-base font-black mono-font leading-none ${
                  location.accuracy <= 10 ? 'text-emerald-600' : 
                  location.accuracy <= 20 ? 'text-amber-600' : 'text-rose-600'
                }`}>
                  ±{location.accuracy.toFixed(1)}m
                </p>
              </div>
              <div className="text-right flex-1 min-w-0">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Nokta Adı</p>
                <p className="text-sm font-black text-slate-900 truncate leading-none">{location.name}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ResultCard;