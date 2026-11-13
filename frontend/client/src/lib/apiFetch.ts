const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function csrfCookie(): string {
  if (typeof document === "undefined") return "";
  const pair = document.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith("aeromind_lab_csrf="));
  return pair ? decodeURIComponent(pair.slice("aeromind_lab_csrf=".length)) : "";
}

/** Same-origin fetch with credentials and double-submit CSRF protection. */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = String(init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (MUTATING_METHODS.has(method) && url.startsWith("/api/")) {
    const token = csrfCookie() || (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("lab_csrf_token") ?? "" : "");
    if (token && !headers.has("X-CSRF-Token")) headers.set("X-CSRF-Token", token);
  }
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  return fetch(input, { ...init, headers, credentials: init.credentials ?? "include" });
}
