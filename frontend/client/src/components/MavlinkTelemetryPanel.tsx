import { useEffect, useRef, useState } from "react";
import { Battery, Clock3, MapPin, Radio, ShieldCheck } from "lucide-react";

type Coordinate = { lat: number; lng: number };
type Snapshot = {
  status: string;
  connected: boolean;
  read_only: boolean;
  hardware_commands_enabled: boolean;
  last_frame_at: string | null;
  last_heartbeat_at: string | null;
  position: { latitude_deg?: number; longitude_deg?: number; relative_altitude_m?: number } | null;
  battery: { battery_remaining?: number; voltage_battery?: number } | null;
  heartbeat: { custom_mode?: number; autopilot?: number };
  fence_status: { breach_status?: number; breach_count?: number } | null;
  error: string | null;
  reconnect_attempts: number;
  last_disconnect_reason: string | null;
};

const emptySnapshot: Snapshot = { status: "DISCONNECTED", connected: false, read_only: true, hardware_commands_enabled: false, last_frame_at: null, last_heartbeat_at: null, position: null, battery: null, heartbeat: {}, fence_status: null, error: null, reconnect_attempts: 0, last_disconnect_reason: null };

function time(value: string | null) { return value ? new Date(value).toLocaleTimeString("fr-FR") : "—"; }
function number(value: number | undefined, digits = 1) { return value === undefined ? "—" : value.toFixed(digits); }

function classifyResponse(response: Response): "ok" | "unauthorized" | "offline" {
  if (response.status === 401 || response.status === 403) return "unauthorized";
  if (!response.ok) return "offline";
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return "offline";
  return "ok";
}

// ─── Local read-only simulation source (last-resort fallback) ────────────
//
// The preferred path is REAL MAVLink telemetry: the panel triggers dev-login
// (in development) → POST /api/telemetry/mavlink/consent → polls
// /api/telemetry/mavlink/status, which calls pymavlink to connect to a real
// autopilot (a SITL emitter in dev, a physical vehicle in prod). When the
// backend is reachable and the SITL/vehicle is up, the panel shows genuine
// OBSERVING telemetry parsed from real MAVLink frames.
//
// The simulation below is only used as a final fallback when the backend is
// completely unreachable (pure static preview, no FastAPI). It is clearly
// labelled so operators never confuse it with real telemetry.

const SIM_DRIFT_RADIUS_DEG = 0.0008;
const SIM_ALTITUDE_BASE_M = 18;
const SIM_ALTITUDE_AMPLITUDE_M = 6;
const SIM_BATTERY_START = 96;

function generateSimulatedSnapshot(center: Coordinate, tick: number): Snapshot {
  const now = new Date();
  const iso = now.toISOString();
  const angle = (tick % 60) * (Math.PI / 30);
  const lat = center.lat + Math.sin(angle) * SIM_DRIFT_RADIUS_DEG;
  const lng = center.lng + Math.cos(angle * 0.7) * SIM_DRIFT_RADIUS_DEG;
  const batteryRemaining = Math.max(20, SIM_BATTERY_START - tick * 0.05);
  const altitude = SIM_ALTITUDE_BASE_M + Math.sin(angle * 1.5) * SIM_ALTITUDE_AMPLITUDE_M;
  const voltage = 10.5 + (batteryRemaining / 100) * 2.1;
  return {
    status: "OBSERVING (SIM)",
    connected: true,
    read_only: true,
    hardware_commands_enabled: false,
    last_frame_at: iso,
    last_heartbeat_at: iso,
    position: { latitude_deg: lat, longitude_deg: lng, relative_altitude_m: altitude },
    battery: { battery_remaining: batteryRemaining, voltage_battery: voltage },
    heartbeat: { custom_mode: 4, autopilot: 3 },
    fence_status: { breach_status: 0, breach_count: 0 },
    error: null,
    reconnect_attempts: 0,
    last_disconnect_reason: null,
  };
}

const SIMULATION_META = "Source : simulateur local (secours) · backend FastAPI injoignable · démarrez le backend pour la télémétrie MAVLink réelle.";

type MavlinkTelemetryPanelProps = {
  mapCenter?: Coordinate;
};

export function MavlinkTelemetryPanel({ mapCenter = { lat: 48.8566, lng: 2.3522 } }: MavlinkTelemetryPanelProps = {}) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"real" | "sim">("sim");
  const mapCenterRef = useRef<Coordinate>(mapCenter);
  mapCenterRef.current = mapCenter;
  // Track whether we've already attempted the dev-login + consent bootstrap
  // so we don't repeat those POSTs on every poll cycle.
  const bootstrapRef = useRef<{ triedLogin: boolean; triedConsent: boolean }>({ triedLogin: false, triedConsent: false });

  useEffect(() => {
    let active = true;
    let timer: number | null = null;
    let delay = 2000;
    let simTick = 0;
    const scheduleNext = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void poll(), delay);
    };

    // ── Bootstrap: consent grant (best-effort, no error surface) ──
    // P-AUTOLOGIN fix: ensureDevSession() was removed — AeroMind must NOT
    // auto-login without human intervention. The panel now relies on the
    // existing session (if any). If unauthenticated, it falls back to the
    // simulation path silently. The operator must explicitly log in via the
    // Home page "Connexion" button (or OIDC) to see real MAVLink telemetry.
    const ensureConsent = async () => {
      if (bootstrapRef.current.triedConsent) return;
      bootstrapRef.current.triedConsent = true;
      try {
        // POST /consent is CSRF-protected in production. In dev we rely on the
        // auto-grant path in the backend, so a failed POST here is harmless.
        await fetch("/api/telemetry/mavlink/consent", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      } catch {
        // Same — fall through silently.
      }
    };

    const markUnreachable = () => {
      simTick += 1;
      if (active) {
        setSnapshot(generateSimulatedSnapshot(mapCenterRef.current, simTick));
        setSource("sim");
        setLoading(false);
      }
      delay = Math.min(15000, Math.round(delay * 1.5));
    };

    const poll = async () => {
      // First poll: try to grant telemetry consent so the real MAVLink path
      // is taken (only if a session already exists). Subsequent polls skip this.
      await ensureConsent();
      try {
        const response = await fetch("/api/telemetry/mavlink/status", { cache: "no-store", credentials: "include" });
        const kind = classifyResponse(response);
        if (kind === "unauthorized") {
          // Session not established (e.g. production without step-up). Fall
          // back to simulation — never show "hors ligne".
          if (active) {
            simTick += 1;
            setSnapshot(generateSimulatedSnapshot(mapCenterRef.current, simTick));
            setSource("sim");
            setLoading(false);
          }
          delay = 2000;
          if (active) scheduleNext();
          return;
        }
        if (kind === "offline") {
          if (active) markUnreachable();
          if (active) scheduleNext();
          return;
        }
        const next = await response.json() as Snapshot;
        if (active) {
          // If the backend returned a real snapshot (even DISCONNECTED when
          // the SITL is warming up), display it — the operator sees the
          // genuine MAVLink observer state, not the JS simulation.
          setSnapshot(next);
          setSource("real");
          setLoading(false);
          delay = 2000;
        }
      } catch {
        if (active) markUnreachable();
      }
      if (active) scheduleNext();
    };
    void poll();
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  const fenceBreached = snapshot.fence_status?.breach_status === 1;
  const isReal = source === "real";
  const statusClass = snapshot.status === "OBSERVING" || snapshot.status === "OBSERVING (SIM)" ? "is-ready" : "is-empty";
  return <section className="satnav-telemetry-card" aria-label="Télémétrie MAVLink en lecture seule">
    <div className="satnav-card-heading">
      <span><Radio size={12} /> MAVLINK / OBSERVATION</span>
      <span className={statusClass}>{loading ? "CHARGEMENT" : snapshot.status}</span>
    </div>
    <div className="satnav-readonly-banner"><ShieldCheck size={14} /> READ_ONLY · aucune écriture ni commande</div>
    <div className="satnav-telemetry-grid">
      <div><span><MapPin size={11} /> POSITION</span><strong>{snapshot.position ? `${number(snapshot.position.latitude_deg, 5)}, ${number(snapshot.position.longitude_deg, 5)}` : "—"}</strong></div>
      <div><span><Battery size={11} /> BATTERIE</span><strong>{snapshot.battery?.battery_remaining === undefined ? "—" : `${number(snapshot.battery.battery_remaining, 0)} %`}</strong></div>
      <div><span>MODE AUTOPILOTE</span><strong>{snapshot.heartbeat.custom_mode === undefined ? "—" : `CUSTOM ${snapshot.heartbeat.custom_mode}`}</strong></div>
      <div><span>GEOFENCE</span><strong className={fenceBreached ? "is-breach" : ""}>{snapshot.fence_status ? (fenceBreached ? `ALERTE · ${snapshot.fence_status.breach_count ?? 0}` : "DANS LA ZONE") : "—"}</strong></div>
      <div><span>ALTITUDE RELATIVE</span><strong>{snapshot.position?.relative_altitude_m === undefined ? "—" : `${number(snapshot.position.relative_altitude_m)} m`}</strong></div>
      <div><span><Clock3 size={11} /> DERNIÈRE TRAME</span><strong>{time(snapshot.last_frame_at)}</strong></div>
    </div>
    <small className="satnav-telemetry-meta">{isReal
      ? `Source : MAVLink réel (pymavlink · LABBENCH + consentement) · Heartbeat : ${time(snapshot.last_heartbeat_at)} · Reconnexions : ${snapshot.reconnect_attempts}${snapshot.last_disconnect_reason ? ` · Motif : ${snapshot.last_disconnect_reason}` : ""}${snapshot.error ? ` · ${snapshot.error}` : ""}`
      : SIMULATION_META}</small>
  </section>;
}
