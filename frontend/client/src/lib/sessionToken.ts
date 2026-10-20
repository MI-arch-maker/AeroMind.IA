const SESSION_TOKEN_KEY = "aeromind-entra-session";

export function consumeSessionTokenFromFragment(): void {
  try {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const token = params.get("aeromind_session");
    if (!token) return;
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    params.delete("aeromind_session");
    const remaining = params.toString();
    window.history.replaceState(
      null,
      document.title,
      `${window.location.pathname}${window.location.search}${remaining ? `#${remaining}` : ""}`,
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

export function bearerHeaders(): Record<string, string> {
  const token = getEntraSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
