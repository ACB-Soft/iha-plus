import React from 'react';
import { KMLFeature } from './KMLUtils';
import { FlightConfig } from '../src/types/flight';
import GCPNormalPlanDisplay from './GCPNormalPlanDisplay';
import GCPStripPlanDisplay from './GCPStripPlanDisplay';

interface Props {
  projectName: string;
  features: KMLFeature[];
  config: FlightConfig;
  onBack: () => void;
}

const GCPPlanDisplay: React.FC<Props> = (props) => {
  const { config } = props;
  
  if (config.gcpLayoutType === 'Strip') {
    return <GCPStripPlanDisplay {...props} />;
  }
  
  return <GCPNormalPlanDisplay {...props} />;
};

export default GCPPlanDisplay;
