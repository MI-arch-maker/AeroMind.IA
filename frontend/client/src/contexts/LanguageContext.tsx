import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { isAppLanguage, translate, translateDom, type AppLanguage } from "../lib/language";
import { resolveMessage } from "../i18n";

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (text: string) => string;
  tKey: (key: string, values?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readLanguage(): AppLanguage {
  const bootLanguage = document.documentElement.lang;
  if (isAppLanguage(bootLanguage)) return bootLanguage;
  try {
    const stored = window.localStorage.getItem("aeromind-language");
    if (isAppLanguage(stored)) return stored;
    const browserLanguages = [...(navigator.languages ?? []), navigator.language]
      .map((value) => value?.toLowerCase().split("-")[0]);
    if (browserLanguages.includes("fr")) return "fr";
    if (browserLanguages.includes("en")) return "en";
    return "en";
  } catch {
    return "en";
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>(readLanguage);
  useLayoutEffect(() => {
    document.documentElement.lang = language;
    try { window.localStorage.setItem("aeromind-language", language); } catch { /* storage optional */ }
    window.dispatchEvent(new CustomEvent("aeromind-language-changed", { detail: language }));
  }, [language]);
  useEffect(() => {
    // P3-06 fix: retired MutationObserver — was racing with React DOM mutations
    // (flicker, reverted text, screen reader re-announcements). The translateDom
    // call on language change is kept for initial translation, but the observer
    // that re-translated on every DOM mutation is removed. Components should use
    // t()/tKey() explicitly in JSX instead of relying on DOM translation.
    translateDom(document.body, language);
    // Listen for the custom language-changed event (dispatched above) so
    // sibling components that re-render independently still get translated.
    const handler = () => translateDom(document.body, language);
    window.addEventListener("aeromind-language-changed", handler);
    return () => window.removeEventListener("aeromind-language-changed", handler);
  }, [language]);
  const value = useMemo(() => ({
    language,
    setLanguage,
    t: (text: string) => translate(language, text),
    tKey: (key: string, values?: Record<string, string | number>) => resolveMessage(language, key, values),
  }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage doit être utilisé sous LanguageProvider");
  return value;
}
