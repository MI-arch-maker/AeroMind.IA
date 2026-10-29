const SESSION_TOKEN_KEY = "aeromind-entra-session";

export function consumeSessionTokenFromFragment(): void {
  try {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hash);
    const queryParams = new URLSearchParams(window.location.search);
    const token = hashParams.get("aeromind_session") ?? queryParams.get("aeromind_session");
    if (!token) return;
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
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
