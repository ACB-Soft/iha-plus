import React from 'react';

interface HeaderProps {
  title: string;
  onBack?: () => void;
  sticky?: boolean;
}

const Header: React.FC<HeaderProps> = ({ title, onBack, sticky = false }) => {
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      window.history.back();
    }
  };

  return (
    <header className={`px-8 pt-4 pb-2 flex items-center gap-5 shrink-0 bg-slate-200 shadow-sm z-30 ${sticky ? 'sticky top-0' : ''}`}>
      <button 
        onClick={handleBack} 
        className="w-12 h-12 bg-slate-200 rounded-2xl flex items-center justify-center shadow-md border border-slate-100 text-slate-800 active:scale-90 transition-all"
      >
        <i className="fas fa-chevron-left text-sm"></i>
      </button>
      <div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none">{title}</h2>
      </div>
    </header>
  );
};

export default Header;
