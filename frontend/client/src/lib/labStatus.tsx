// AeroMind LABBENCH-01 — Operation mode + session status bar (UX-09 + EXIGENCE C-002)
//
// This component fetches the current operation mode from /api/lab/mode/{projectId}
// and displays a persistent status bar with:
//   - Mode badge (DEMO/SIMULATION/SITL/HIL/HARDWARE/OFFLINE)
//   - API reachability
//   - WebSocket connection state
//   - Last sync timestamp
//   - Active revision (first 8 chars of checksum)
//   - Current user + roles
//
// EXIGENCE C-002 — Badge de mode visible en permanence.
// EXIGENCE SYNC-07 — every screen exposes source_type + persisted + timestamp.
//
// Usage: <LabStatusBar projectId="..." /> placed at the top of every LABBENCH screen.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

export type OperationMode = "demo" | "simulation" | "sitl" | "hil" | "hardware" | "offline";
export type TelemetryState = "fresh" | "stale" | "offline" | "error";

interface ModeStatus {
  mode: OperationMode;
  source_type: string;
  persisted: boolean;
  engine_version: string;
  timestamp_utc: string;
  quality: "unknown" | "good" | "warn" | "fail";
  api_reachable: boolean;
  websocket_connected: boolean;
  last_sync_at: string | null;
  gate_progress: string[];
}

interface LabSessionInfo {
  user_id: string;
  project_id: string;
  roles: string[];
  assurance_level: string;
  expires_at: string;
}

const MODE_LABELS: Record<OperationMode, string> = {
  demo: "DÉMO",
  simulation: "SIMULATION",
  sitl: "SITL",
  hil: "HIL",
  hardware: "HARDWARE",
  offline: "HORS LIGNE",
};

const MODE_COLORS: Record<OperationMode, string> = {
  demo: "bg-gray-100 text-gray-800 border-gray-300",
  simulation: "bg-blue-100 text-blue-800 border-blue-300",
  sitl: "bg-amber-100 text-amber-800 border-amber-300",
  hil: "bg-purple-100 text-purple-800 border-purple-300",
  hardware: "bg-red-100 text-red-800 border-red-300",
  offline: "bg-red-50 text-red-900 border-red-500",
};

export function LabStatusBar({ projectId }: { projectId: string }) {
  // Fetch mode from /api/lab/mode/{projectId}
  const { data: mode, isLoading, error } = useQuery<ModeStatus>({
    queryKey: ["lab-mode", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/lab/mode/${projectId}`, {
        credentials: "include",
        headers: {},
      });
      if (!r.ok) throw new Error(`Mode fetch failed: ${r.status}`);
      return r.json();
    },
    refetchInterval: 5000,  // Refresh every 5s
    retry: 1,
  });

  // Fetch session info from local state (set on step-up)
  const [session, setSession] = useState<LabSessionInfo | null>(null);
  useEffect(() => {
    const raw = sessionStorage.getItem("lab_session_info");
    if (raw) {
      try {
        setSession(JSON.parse(raw));
      } catch {
        setSession(null);
      }
    }
  }, []);

  if (isLoading) {
    return (
      <div className="px-3 py-1.5 text-xs bg-muted text-muted-foreground border-b">
        Chargement du statut LABBENCH…
      </div>
    );
  }

  if (error || !mode) {
    return (
      <div className="px-3 py-1.5 text-xs bg-red-50 text-red-900 border-b border-red-200 flex items-center gap-2">
        <span className="font-bold">⚠ HORS LIGNE / NON SYNCHRONISÉ</span>
        <span className="text-red-700">
          {error?.message || "Impossible de récupérer le mode opération"}
        </span>
      </div>
    );
  }

  // EXIGENCE C-002 — visible at all times
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-1.5 text-xs border-b bg-card">
      {/* Mode badge — always visible */}
      <span
        className={`px-2 py-0.5 font-bold rounded border ${MODE_COLORS[mode.mode]}`}
        aria-label={`Mode opération: ${MODE_LABELS[mode.mode]}`}
      >
        {MODE_LABELS[mode.mode]}
      </span>

      {/* Source type + persisted — EXIGENCE SYNC-07 */}
      <span className="text-muted-foreground">
        source: <code className="font-mono">{mode.source_type}</code>
        {mode.persisted ? (
          <span className="ml-1 text-green-700">● persisté</span>
        ) : (
          <span className="ml-1 text-amber-700">○ non persisté</span>
        )}
      </span>

      {/* API + WebSocket */}
      <span className={mode.api_reachable ? "text-green-700" : "text-red-700"}>
        API: {mode.api_reachable ? "●" : "○"}
      </span>
      <span className={mode.websocket_connected ? "text-green-700" : "text-red-700"}>
        WS: {mode.websocket_connected ? "●" : "○"}
      </span>

      {/* Last sync */}
      {mode.last_sync_at && (
        <span className="text-muted-foreground">
          sync: {new Date(mode.last_sync_at).toLocaleTimeString()}
        </span>
      )}

      {/* Gate progress (only if any gates approved) */}
      {mode.gate_progress.length > 0 && (
        <span className="text-amber-700">
          gates: {mode.gate_progress.length}/6 ({mode.gate_progress.join(", ")})
        </span>
      )}

      {/* User + roles */}
      {session && (
        <span className="text-muted-foreground ml-auto">
          {session.user_id.substring(0, 8)}… ({session.roles.join(", ")}) ·
          expire à {new Date(session.expires_at).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}

// Step-up login hook — call from the LABBENCH entry screen.

export type RestoredLabSession = {
  project_id: string;
  roles: string[];
  assurance_level: string;
  expires_at: string;
};

function csrfCookie(): string {
  if (typeof document === "undefined") return "";
  const cookie = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("aeromind_lab_csrf="));
  return cookie ? decodeURIComponent(cookie.slice("aeromind_lab_csrf=".length)) : "";
}

/** Recover the active authorization from the server-managed HttpOnly cookie. */
export async function restoreLabSession(): Promise<RestoredLabSession | null> {
  const response = await fetch("/api/lab/sessions/current", { credentials: "include", cache: "no-store" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Restauration de session LABBENCH impossible (${response.status})`);
  return response.json();
}

export async function revokeLabSession(): Promise<void> {
  const csrf = csrfCookie();
  const response = await fetch("/api/lab/sessions/revoke", {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-Token": csrf },
  });
  if (!response.ok) throw new Error(`Déconnexion LABBENCH refusée (${response.status})`);
  sessionStorage.removeItem("lab_csrf_token");
  sessionStorage.removeItem("lab_session_info");
}

/** Persist the Home workspace's explicit selection in the canonical LabBench project. */
export async function syncSelectedDrone(projectId: string, config: unknown, sessionToken?: string): Promise<void> {
  const record = config && typeof config === "object" ? config as Record<string, unknown> : {};
  const selection = record.engineeringSelection && typeof record.engineeringSelection === "object"
    ? record.engineeringSelection as Record<string, unknown> : {};
  const droneId = typeof selection.droneId === "string" && selection.droneId !== "unselected"
    ? selection.droneId : typeof record.platformProfile === "string" ? record.platformProfile : "";
  if (!droneId) return;
  const csrf = csrfCookie();
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-CSRF-Token": csrf };
  if (sessionToken) headers["X-Lab-Session"] = `Lab ${sessionToken}`;
  const source = selection.source === "industrial" ? "industrial" : selection.source === "custom" ? "sketch" : "catalog";
  const response = await fetch(`/api/lab/projects/${encodeURIComponent(projectId)}/drones/select`, {
    method: "POST", credentials: "include", headers,
    body: JSON.stringify({ drone_id: droneId, source, source_id: typeof selection.sourceId === "string" ? selection.sourceId : droneId, config_json: record }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail || `Synchronisation du drone refusée (${response.status})`);
  }
}

export async function performStepUp(
  projectId: string,
  mfaCode: string,
  roles: string[] = ["reader"],
  assuranceLevel: "step-up" | "mfa" | "passkey" = "step-up",
): Promise<{ token: string; csrf: string; expires_at: string; roles: string[] }> {
  const r = await fetch("/api/lab/sessions/step-up", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: projectId,
      roles,
      assurance_level: assuranceLevel,
      mfa_code: mfaCode,
    }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: "step-up failed" }));
    throw new Error(err.detail || `step-up failed: ${r.status}`);
  }
  const data = await r.json();
  // Persist session info for LabStatusBar
  sessionStorage.setItem("lab_csrf_token", data.csrf_token);
  sessionStorage.setItem(
    "lab_session_info",
    JSON.stringify({
      user_id: data.user_id || "(unknown)",
      project_id: data.project_id,
      roles: data.roles,
      assurance_level: data.assurance_level,
      expires_at: data.expires_at,
    }),
  );
  return { token: data.session_token, csrf: data.csrf_token, expires_at: data.expires_at, roles: data.roles ?? [] };
}

// Helper — fetch the active drone + revision at LABBENCH entry (EXIGENCE SYNC-03).
export async function fetchActiveDrone(
  projectId: string,
  sessionToken?: string,
): Promise<{
  active_drone: { drone_id: string; drone_name: string; config_json: Record<string, unknown> } | null;
  active_revision: {
    revision_id: string | null;
    revision_number: number | null;
    checksum: string | null;
    origin_type: string | null;
    activated_at: string | null;
  } | null;
  last_sync_at: string;
}> {
  const r = await fetch(`/api/lab/projects/${projectId}/drones/active`, {
    credentials: "include",
    headers: sessionToken ? { "X-Lab-Session": `Lab ${sessionToken}` } : {},
  });
  if (!r.ok) throw new Error(`fetch active drone failed: ${r.status}`);
  return r.json();
}
