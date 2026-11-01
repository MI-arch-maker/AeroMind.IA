import type { AppLanguage } from "../lib/language";

export function currentAppLanguage(): AppLanguage {
  try {
    const stored = window.localStorage.getItem("aeromind-language");
    if (stored === "fr" || stored === "en") return stored;
  } catch { /* a blocked storage falls back to the initialized document locale */ }
  return window.document.documentElement.lang === "fr" ? "fr" : "en";
}

/** Adds an explicit version-neutral locale header to every same-origin fetch. */
export function installLocaleFetch() {
  const target = globalThis as typeof globalThis & { __aeromindLocaleFetchInstalled?: boolean };
  if (target.__aeromindLocaleFetchInstalled) return;
  target.__aeromindLocaleFetchInstalled = true;
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(requestUrl, window.location.href);
    if (url.origin !== window.location.origin) return originalFetch(input, init);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set("X-AeroMind-Language", currentAppLanguage());
    return originalFetch(input, { ...init, headers });
  };
}
