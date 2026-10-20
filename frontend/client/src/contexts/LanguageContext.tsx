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
    const root = document.body;
    translateDom(root, language);
    const observer = new MutationObserver(() => translateDom(root, language));
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
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
