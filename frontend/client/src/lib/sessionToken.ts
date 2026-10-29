const SESSION_TOKEN_KEY = "aeromind-entra-session";

// P1-15 fix — sessionStorage is XSS-exfiltrable. We now only use it as a
// fallback in development/preview origins. In production, the httpOnly cookie
// (aeromind_session) is the primary auth mechanism and JS cannot read it.
function isDevOrigin(): boolean {
  try {
    const origin = window.location.origin;
    // Dev origins: localhost, 127.0.0.1, *.onrender.com preview, Vite dev server
    return (
      origin.includes("localhost") ||
      origin.includes("127.0.0.1") ||
      origin.includes(".onrender.com") ||
      origin.includes(":5173") ||
      origin.includes(":5174")
    );
  } catch {
    return false;
  }
}

export function consumeSessionTokenFromFragment(): void {
  try {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hash);
    const queryParams = new URLSearchParams(window.location.search);
    const token = hashParams.get("aeromind_session") ?? queryParams.get("aeromind_session");
    if (!token) return;
    // P1-15 fix: only persist to sessionStorage in dev/preview origins.
    // In production, rely on the httpOnly cookie set by the OIDC callback.
    if (isDevOrigin()) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    }
    hashParams.delete("aeromind_session");
    queryParams.delete("aeromind_session");
    const remainingHash = hashParams.toString();
    const remainingQuery = queryParams.toString();
    window.history.replaceState(
      null,
      document.title,
      `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ""}${remainingHash ? `#${remainingHash}` : ""}`,
    );
  } catch {
    // Un navigateur sans sessionStorage utilisera le cookie HttpOnly normal.
  }
}

export function getEntraSessionToken(): string | null {
  // P1-15 fix: only return token from sessionStorage in dev/preview origins.
  // In production, return null — the httpOnly cookie is sent automatically by
  // the browser and JS should not have access to the bearer token.
  if (!isDevOrigin()) return null;
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearSessionToken(): void {
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem("manus-cookie");
  } catch {
    // sessionStorage unavailable
  }
}

export function bearerHeaders(): Record<string, string> {
  const token = getEntraSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
