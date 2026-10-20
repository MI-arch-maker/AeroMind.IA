import fr from "./locales/fr.json";
import en from "./locales/en.json";
import type { AppLanguage } from "../lib/language";

export const messages = { fr, en } as const;
export type I18nNamespace = keyof typeof fr;
export type MessageKey = {
  [N in I18nNamespace]: `${N}.${Extract<keyof (typeof fr)[N], string>}`;
}[I18nNamespace];

const fallbackText: Record<AppLanguage, string> = {
  fr: fr.common["fallback.unavailable"],
  en: en.common["fallback.unavailable"],
};
const reportedMissing = new Set<string>();

/** Resolves a namespaced message. Missing entries never leak a raw key to the UI. */
export function resolveMessage(
  language: AppLanguage,
  key: string,
  values: Record<string, string | number> = {},
): string {
  const [namespace, ...keyParts] = key.split(".");
  const leaf = keyParts.join(".");
  const catalog = messages[language] as unknown as Record<string, Record<string, string>>;
  const source = catalog[namespace]?.[leaf];
  if (!source) {
    const fingerprint = `${language}:${key}`;
    if (!reportedMissing.has(fingerprint)) {
      reportedMissing.add(fingerprint);
      console.warn("[i18n] Missing translation", { language, key });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("aeromind-i18n-fallback", { detail: { language, key } }));
      }
    }
    return fallbackText[language];
  }
  return source.replace(/\{([a-zA-Z][\w]*)\}/g, (token, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : token,
  );
}

export function formatNumber(language: AppLanguage, value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-GB", options).format(value);
}

export function formatDate(language: AppLanguage, value: Date | number | string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-GB", options).format(value instanceof Date ? value : new Date(value));
}

export function compareLocale(language: AppLanguage, left: string, right: string) {
  return left.localeCompare(right, language === "fr" ? "fr-FR" : "en-GB", { sensitivity: "base" });
}
