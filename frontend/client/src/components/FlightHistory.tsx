import { useEffect, useState } from "react";
import { Activity, Download, Filter } from "lucide-react";

// ===========================================================================
// FlightHistory — historical telemetry samples viewer (v9)
//
// Fetches samples from /api/flights/history with a time filter (15/60/360/1440 min),
// displays them in a scrollable table. CSV export link is in the parent's
// SectionHeading actions.
// ===========================================================================

type Sample = {
  sampleTime: string;
  droneId: string;
  droneName: string;
  latitude_deg: number | null;
  longitude_deg: number | null;
  relative_altitude_m: number | null;
  heading_deg: number | null;
  battery_remaining_pct: number | null;
  voltage_v: number | null;
  current_a: number | null;
  armed: boolean;
  connected: boolean;
  inside_geofence: boolean;
};

type Props = {
  projectId: string | null;
};

export function FlightHistory({ projectId }: Props) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [minutes, setMinutes] = useState(60);
  const [loading, setLoading] = useState(false);
  const [filterArmed, setFilterArmed] = useState(false);
  const [filterAlerts, setFilterAlerts] = useState(false);

  const refresh = async () => {
    if (!projectId) {
      setSamples([]);
      return;
    }
    setLoading(true);
    try {
      const url = new URL("/api/flights/history", window.location.origin);
      url.searchParams.set("projectId", projectId);
      url.searchParams.set("minutes", String(minutes));
      const r = await fetch(url.toString(), { credentials: "include" });
      if (r.ok) {
        const body = await r.json();
        setSamples(Array.isArray(body?.samples) ? body.samples : []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [projectId, minutes]);

  const filtered = samples.filter((s) => {
    if (filterArmed && !s.armed) return false;
    if (filterAlerts && s.inside_geofence && s.battery_remaining_pct != null && s.battery_remaining_pct > 20) return false;
    return true;
  });

  return (
    <div className="lb-flights">
      <div className="lb-flights-toolbar">
        <span className="lb-radar-title">
          <Activity size={14} /> {filtered.length} / {samples.length} samples · {minutes}min
        </span>
        <div className="lb-radar-controls">
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            <option value={15}>15 min</option>
            <option value={60}>60 min</option>
            <option value={360}>6 h</option>
            <option value={1440}>24 h</option>
          </select>
          <label className="lb-flights-filter">
            <input type="checkbox" checked={filterArmed} onChange={(e) => setFilterArmed(e.target.checked)} />
            <span>Armés seulement</span>
          </label>
          <label className="lb-flights-filter">
            <input type="checkbox" checked={filterAlerts} onChange={(e) => setFilterAlerts(e.target.checked)} />
            <span>Alertes seulement</span>
          </label>
          <button className="lb-secondary" onClick={refresh} disabled={loading}>
            {loading ? "…" : "Rafraîchir"}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="lb-empty-state">Aucun sample pour cette période. Le stream SSE doit tourner pour accumuler de la télémétrie.</p>
      ) : (
        <div className="lb-flights-table">
          <div className="lb-flights-row lb-flights-head">
            <span>Heure</span>
            <span>Drone</span>
            <span>Lat</span>
            <span>Lon</span>
            <span>Alt (m)</span>
            <span>Cap (°)</span>
            <span>Batt (%)</span>
            <span>État</span>
          </div>
          {filtered.slice(-500).reverse().map((s, i) => (
            <div key={i} className={`lb-flights-row ${!s.inside_geofence ? "is-alert" : ""} ${s.armed ? "is-armed" : ""}`}>
              <span className="lb-flights-time">{s.sampleTime?.slice(11, 19)}</span>
              <span>{s.droneName}</span>
              <span>{s.latitude_deg?.toFixed(5)}</span>
              <span>{s.longitude_deg?.toFixed(5)}</span>
              <span>{s.relative_altitude_m?.toFixed(1)}</span>
              <span>{s.heading_deg != null ? Math.round(s.heading_deg) : "—"}</span>
              <span className={s.battery_remaining_pct != null && s.battery_remaining_pct < 20 ? "lb-text-danger" : ""}>
                {s.battery_remaining_pct ?? "—"}
              </span>
              <span>
                {s.armed && <span className="lb-text-warning">ARMED</span>}
                {!s.inside_geofence && <span className="lb-text-danger"> GEOFENCE</span>}
                {!s.armed && s.inside_geofence && s.connected && <span className="lb-text-good">OK</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
