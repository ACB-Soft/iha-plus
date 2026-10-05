import React from 'react';
import { FULL_BRAND } from '../version';

interface Props {
  noPadding?: boolean;
}

const GlobalFooter: React.FC<Props> = ({ noPadding = false }) => (
  <footer className={`bg-slate-900 text-slate-400 text-xs py-2.5 border-t border-slate-800 no-print z-40 shrink-0 select-none ${noPadding ? '' : 'px-4 sm:px-6 lg:px-8'}`}>
    <div className="max-w-7xl mx-auto flex flex-row items-center justify-between gap-2.5 text-xs">
      <div className="flex items-center gap-2">
        <p className="font-semibold text-slate-300 tracking-wide text-left text-[11px] sm:text-xs">
          {FULL_BRAND}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <p className="text-[10px] sm:text-[11px] text-slate-400 text-right">
          Fotogrametrik Uçuş Planlama Uygulaması
        </p>
      </div>
    </div>
  </footer>
);

export default GlobalFooter;
