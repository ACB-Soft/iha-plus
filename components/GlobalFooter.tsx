import React from 'react';
import { FULL_BRAND } from '../version';

interface Props {
  noPadding?: boolean;
}

const GlobalFooter: React.FC<Props> = ({ noPadding = false }) => (
  <footer className={`py-4 md:py-6 flex flex-col items-center mt-auto safe-bottom shrink-0 bg-slate-200 ${noPadding ? '' : 'px-8'}`}>
    <p className="text-[10px] md:text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] text-center w-full">
      {FULL_BRAND}
    </p>
  </footer>
);

export default GlobalFooter;
