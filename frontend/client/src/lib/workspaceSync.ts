import { validateWorkspace, type ProjectWorkspace } from "./projectSyncStore";

export const WORKSPACE_SYNC_CHANNEL = "aeromind-workspace-sync";
export const LABBENCH_STATE_KEY = "aeromind-labbench-state-v1";
/** Serialize persistence requests so an older full snapshot cannot finish after a newer one. */
export function createSerialWriteQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(write: () => Promise<T>): Promise<T> {
    const result = tail.then(write, write);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}
export type WorkspaceSyncMessage =
  | { type: "workspace"; payload: ProjectWorkspace }
  | { type: "view"; view: string }
  | { type: "labbench"; payload: unknown };

export function createWorkspaceChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(WORKSPACE_SYNC_CHANNEL);
}

export function publishWorkspaceMessage(channel: BroadcastChannel | null, message: WorkspaceSyncMessage): void {
  if (typeof window === "undefined") return;
  try { channel?.postMessage(message); } catch { /* l’appelant garde ERROR/PENDING SYNC */ }
}

export function persistAndPublish<T>(key: string, value: T, channel: BroadcastChannel | null, message: WorkspaceSyncMessage): { ok: true } | { ok: false; message: string } {
  if (typeof window === "undefined") return { ok: false, message: "Stockage indisponible hors navigateur." };
  try { window.localStorage.setItem(key, JSON.stringify(value)); }
  catch (error) { return { ok: false, message: `Écriture locale impossible : ${error instanceof Error ? error.message : "erreur inconnue"}` }; }
  publishWorkspaceMessage(channel, message);
  return { ok: true };
}

export function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const raw = window.localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
}

export function parseWorkspaceMessage(raw: unknown): { ok: true; workspace: ProjectWorkspace } | { ok: false; message: string } {
  const payload = raw && typeof raw === "object" && "type" in raw && (raw as { type?: unknown }).type === "workspace"
    ? (raw as { payload?: unknown }).payload : raw;
  const result = validateWorkspace(payload);
  return result.ok ? { ok: true, workspace: result.value } : { ok: false, message: `${result.message} ${result.issues.join("; ")}` };
}
