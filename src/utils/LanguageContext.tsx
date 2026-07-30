import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'TR' | 'EN';

interface LanguageContextType {
  language: Language;
  changeLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<string, Record<Language, string>> = {
  "Dil Seçin": {
    TR: "Dil Seçin",
    EN: "Select Language"
  },
  "İptal": {
    TR: "İptal",
    EN: "Cancel"
  },
  "Uygula": {
    TR: "Uygula",
    EN: "Apply"
  },
  "Türkçe": {
    TR: "Türkçe",
    EN: "Turkish"
  },
  "English": {
    TR: "İngilizce",
    EN: "English"
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('app_language');
    return (saved === 'EN' || saved === 'TR') ? saved : 'TR';
  });

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('app_language', lang);
  };

  const t = (key: string): string => {
    if (translations[key] && translations[key][language]) {
      return translations[key][language];
    }
    return key;
  };

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
