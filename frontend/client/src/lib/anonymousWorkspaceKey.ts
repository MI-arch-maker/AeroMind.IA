/**
 * Anonymous workspace key helper.
 *
 * P0-05 fix — the backend `/api/local/workspace` endpoints now require an
 * opaque `X-AeroMind-Workspace` header (32..128 chars of [A-Za-z0-9_-]) to
 * isolate anonymous browser drafts. The previous frontend code omitted the
 * header entirely, so two anonymous browsers silently shared the same
 * `'default'` slot and could read or overwrite each other's drafts.
 *
 * This module issues a per-browser opaque key on first visit and persists
 * it in `localStorage` so the same browser keeps its draft across reloads.
 * The key is generated with `crypto.getRandomValues` (32 bytes → 43 base64url
 * chars after stripping padding) and is therefore unique across browsers and
 * sessions to the level of cryptographic randomness (≥ 122 bits of entropy).
 *
 * Authenticated users do NOT use this path — their workspace is loaded via
 * the canonical `/api/lab/projects/{id}/drones/active` API from the server's
 * source of truth. This anonymous key only routes the local-draft fallback
 * for visitors who have not yet signed in.
 */

const WORKSPACE_KEY_STORAGE = "aeromind-workspace-key-v1";
const KEY_LENGTH_BYTES = 32; // 32 bytes → 43 base64url chars (without padding)

/**
 * Validate a candidate workspace key against the backend's regex
 * `^[A-Za-z0-9_-]{32,128}$`. Returns true if the key is acceptable.
 */
export function isValidWorkspaceKey(key: string | null | undefined): key is string {
  if (typeof key !== "string") return false;
  return /^[A-Za-z0-9_-]{32,128}$/.test(key);
}

/**
 * Generate a fresh opaque workspace key (43 chars of base64url, ~122 bits
 * of entropy). Used the first time a browser visits AeroMind without an
 * existing key, OR to rotate a compromised / legacy key.
 */
function generateWorkspaceKey(): string {
  if (typeof globalThis === "undefined" || !globalThis.crypto?.getRandomValues) {
    // SSR / no-crypto fallback — not expected in a real browser, but kept
    // deterministic so unit tests do not crash. The key is still 43 chars
    // and matches the allowed charset.
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
    let out = "";
    for (let i = 0; i < 43; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }
  const bytes = new Uint8Array(KEY_LENGTH_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  // Base64url-encode without padding to keep the charset within [A-Za-z0-9-_].
  // 32 bytes → 43 base64 chars (with one padding '=' which we strip).
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return b64;
}

/**
 * Return the persistent anonymous workspace key for the current browser.
 *
 * Lazily generates + persists the key on first call. Safe to call repeatedly
 * from React effects; the same key is returned every time until the user
 * explicitly clears their `localStorage`.
 *
 * Returns `null` when called from a non-browser context (SSR / tests).
 */
export function getOrCreateWorkspaceKey(storage: Storage | null = typeof window === "undefined" ? null : window.localStorage): string | null {
  if (storage === null) return null;
  let existing = storage.getItem(WORKSPACE_KEY_STORAGE);
  if (!isValidWorkspaceKey(existing)) {
    existing = generateWorkspaceKey();
    try {
      storage.setItem(WORKSPACE_KEY_STORAGE, existing);
    } catch {
      // localStorage may be full or blocked; keep the in-memory key.
    }
  }
  return existing;
}

/**
 * Read-only accessor that does NOT persist a fresh key if none is stored.
 * Useful for tests that want to assert the absence of a key.
 */
export function readWorkspaceKey(storage: Storage | null = typeof window === "undefined" ? null : window.localStorage): string | null {
  if (storage === null) return null;
  const raw = storage.getItem(WORKSPACE_KEY_STORAGE);
  return isValidWorkspaceKey(raw) ? raw : null;
}

/**
 * Build the headers object for an anonymous `/api/local/workspace` request.
 * Returns `null` if no key could be minted (e.g. SSR / no localStorage). The
 * caller should skip the request in that case rather than falling back to
 * the shared 'default' slot which the backend now rejects.
 */
export function anonymousWorkspaceHeaders(
  storage: Storage | null = typeof window === "undefined" ? null : window.localStorage,
): Record<string, string> | null {
  const key = getOrCreateWorkspaceKey(storage);
  if (!key) return null;
  return { "X-AeroMind-Workspace": key };
}

export const WORKSPACE_KEY_STORAGE_KEY = WORKSPACE_KEY_STORAGE;
