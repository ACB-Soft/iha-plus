import { useState, useEffect } from 'react';
import { getGeoidInfo, GeoidInfo } from '../components/GeoidUtils';

export const useOrthometricHeight = (ellipsoidalHeight: number | null, lat: number, lng: number) => {
  const [geoidInfo, setGeoidInfo] = useState<GeoidInfo>({ 
    orthometricHeight: null, 
    undulation: 0, 
    model: 'None', 
    isSmartCorrectionApplied: false
  });

  useEffect(() => {
    setGeoidInfo(getGeoidInfo(lat, lng, ellipsoidalHeight));
  }, [ellipsoidalHeight, lat, lng]);

  return geoidInfo;
};
