import { useEffect, useState } from "react";
import { Battery, Clock3, MapPin, Radio, ShieldCheck } from "lucide-react";

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

export function MavlinkTelemetryPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch("/api/telemetry/mavlink/status", { cache: "no-store" });
        const next = await response.json() as Snapshot;
        if (active) { setSnapshot(next); setLoading(false); }
      } catch (error) {
        if (active) { setSnapshot(current => ({ ...current, status: "ERROR", error: error instanceof Error ? error.message : "API indisponible" })); setLoading(false); }
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const fenceBreached = snapshot.fence_status?.breach_status === 1;
  return <section className="satnav-telemetry-card" aria-label="Télémétrie MAVLink en lecture seule">
    <div className="satnav-card-heading"><span><Radio size={12} /> MAVLINK / OBSERVATION</span><span className={snapshot.status === "OBSERVING" ? "is-ready" : "is-empty"}>{loading ? "CHARGEMENT" : snapshot.status}</span></div>
    <div className="satnav-readonly-banner"><ShieldCheck size={14} /> READ_ONLY · aucune écriture ni commande</div>
    <div className="satnav-telemetry-grid">
      <div><span><MapPin size={11} /> POSITION</span><strong>{snapshot.position ? `${number(snapshot.position.latitude_deg, 5)}, ${number(snapshot.position.longitude_deg, 5)}` : "—"}</strong></div>
      <div><span><Battery size={11} /> BATTERIE</span><strong>{snapshot.battery?.battery_remaining === undefined ? "—" : `${number(snapshot.battery.battery_remaining, 0)} %`}</strong></div>
      <div><span>MODE AUTOPILOTE</span><strong>{snapshot.heartbeat.custom_mode === undefined ? "—" : `CUSTOM ${snapshot.heartbeat.custom_mode}`}</strong></div>
      <div><span>GEOFENCE</span><strong className={fenceBreached ? "is-breach" : ""}>{snapshot.fence_status ? (fenceBreached ? `ALERTE · ${snapshot.fence_status.breach_count ?? 0}` : "DANS LA ZONE") : "—"}</strong></div>
      <div><span>ALTITUDE RELATIVE</span><strong>{snapshot.position?.relative_altitude_m === undefined ? "—" : `${number(snapshot.position.relative_altitude_m)} m`}</strong></div>
      <div><span><Clock3 size={11} /> DERNIÈRE TRAME</span><strong>{time(snapshot.last_frame_at)}</strong></div>
    </div>
    <small className="satnav-telemetry-meta">Heartbeat : {time(snapshot.last_heartbeat_at)} · Reconnexions : {snapshot.reconnect_attempts}{snapshot.last_disconnect_reason ? ` · Motif : ${snapshot.last_disconnect_reason}` : ""}{snapshot.error ? ` · ${snapshot.error}` : ""}</small>
  </section>;
}
