import React from 'react';
import { FULL_BRAND } from '../version';

interface Props {
  noPadding?: boolean;
}

const GlobalFooter: React.FC<Props> = ({ noPadding = false }) => (
  <footer className={`bg-slate-900 text-slate-400 text-xs py-2.5 border-t border-slate-800 no-print z-40 shrink-0 select-none ${noPadding ? '' : 'px-4 sm:px-6 lg:px-8'}`}>
    <div className="max-w-7xl mx-auto flex items-center justify-center text-xs">
      <p className="font-semibold text-slate-300 tracking-wide text-center text-[11px] sm:text-xs">
        {FULL_BRAND}
      </p>
    </div>
  </footer>
);

export default GlobalFooter;
