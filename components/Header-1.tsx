import React from 'react';

interface HeaderProps {
  title: string;
  onBack?: () => void;
  sticky?: boolean;
  rightContent?: React.ReactNode;
}

const Header: React.FC<HeaderProps> = ({ title, onBack, sticky = false, rightContent }) => {
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      window.history.back();
    }
  };

  return (
    <header className={`bg-slate-900 text-white shadow-md border-b border-slate-800 shrink-0 z-30 h-16 sm:h-[72px] flex items-center ${sticky ? 'sticky top-0' : ''}`}>
      <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div className="flex items-center space-x-3 min-w-0">
          <button 
            onClick={handleBack} 
            className="w-10 h-10 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl flex items-center justify-center border border-slate-700 active:scale-95 transition-all shadow-sm group shrink-0"
            title="Geri Dön"
          >
            <i className="fa-solid fa-chevron-left text-xs group-hover:-translate-x-0.5 transition-transform"></i>
          </button>

          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2 leading-tight truncate">
              {title}
            </h1>
          </div>
        </div>

        {rightContent && (
          <div className="flex items-center gap-2 shrink-0">
            {rightContent}
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
