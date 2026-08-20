"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  DEFAULT_LOCALE,
  resolveLocale,
  type SupportedLocale,
} from "@openmatch/matching";

const LocaleContext = createContext<{
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
}>({ locale: DEFAULT_LOCALE, setLocale: () => undefined });

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(DEFAULT_LOCALE);
  useEffect(() => {
    const saved = sessionStorage.getItem("openmatch-locale");
    setLocaleState(resolveLocale(saved || navigator.languages));
  }, []);
  const setLocale = (next: SupportedLocale) => {
    setLocaleState(next);
    sessionStorage.setItem("openmatch-locale", next);
  };
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export const useLocale = () => useContext(LocaleContext);

export function LanguageSwitch() {
  const { locale, setLocale } = useLocale();
  return (
    <div className="language-switch" aria-label="Language / Sprache">
      {(["de", "en"] as const).map((item) => (
        <button
          type="button"
          key={item}
          className={locale === item ? "active" : ""}
          aria-pressed={locale === item}
          onClick={() => setLocale(item)}
        >
          {item.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
