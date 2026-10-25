import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Crosshair,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Wifi,
  WifiOff,
  History,
  FastForward,
} from "lucide-react";

// ===========================================================================
// FleetRadar — Real-time canvas-based radar for the AeroMind fleet.
//
// Subscribes to /api/hardware/fleet/telemetry/stream (SSE) and renders a
// top-down view centered on the project's home position. Each drone appears
// as a colored blip with a heading arrow, a fading trail, an altitude label
// and a flashing red ring if it leaves the geofence.
//
// The radar works even when HARDWARE_CONTROL is dormant: drones registered
// in the pool without a MAVLink heartbeat appear as grey "awaiting
// connection" blips in the top-left corner.
// ===========================================================================

export type DroneTelemetry = {
  droneId: string;
  droneName: string;
  connected: boolean;
  armed: boolean;
  position: {
    latitude_deg: number | null;
    longitude_deg: number | null;
    altitude_m: number | null;
    relative_altitude_m: number | null;
  };
  x_m: number | null;
  y_m: number | null;
  battery_remaining_pct: number | null;
  voltage_v: number | null;
  current_a: number | null;
  flight: Record<string, number>;
  gps: Record<string, number>;
  inside_geofence: boolean;
  altitude_ok: boolean;
  last_heartbeat_at: string | null;
  messages_received: number;
  error?: string;
};

export type FleetSnapshot = {
  timestamp: string;
  hardwareControlEnabled: boolean;
  poolSize: number;
  geofenceConfigured: boolean;
  homeLat: number | null;
  homeLon: number | null;
  maxAltitudeM: number | null;
  drones: DroneTelemetry[];
};

export type GeofenceState = {
  projectId: string;
  configured: boolean;
  polygon?: Array<[number, number]>;
  maxAltitudeM?: number;
  maxDistanceM?: number;
  homeLat?: number;
  homeLon?: number;
};

const DRONE_COLORS = [
  "#25d0d9",
  "#f1b954",
  "#75d7ad",
  "#fa7f78",
  "#9b8cff",
  "#82d4ff",
  "#ffd166",
  "#a3e635",
  "#fb7185",
  "#60a5fa",
  "#f472b6",
  "#34d399",
];

const TRAIL_LENGTH = 40; // ~20 s at 2 Hz

type TrailPoint = { x: number; y: number; t: number };

type Props = {
  projectId: string | null;
  geofence: GeofenceState | null;
};

export function FleetRadar({ projectId, geofence }: Props) {
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [paused, setPaused] = useState(false);
  const [scale, setScale] = useState(500); // meters across the radar diameter
  const [trails, setTrails] = useState<Record<string, TrailPoint[]>>({});
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // === SSE subscription ===
  useEffect(() => {
    if (paused || !projectId) return;
    let stopped = false;
    try {
      const es = new EventSource("/api/hardware/fleet/telemetry/stream", {
        withCredentials: true,
      });
      eventSourceRef.current = es;
      es.onmessage = (event) => {
        if (stopped) return;
        try {
          const data = JSON.parse(event.data) as FleetSnapshot;
          setSnapshot(data);
          setTrails((prev) => {
            const next: Record<string, TrailPoint[]> = { ...prev };
            for (const d of data.drones) {
              if (d.x_m == null || d.y_m == null) continue;
              const arr = next[d.droneId] ?? [];
              const point: TrailPoint = { x: d.x_m, y: d.y_m, t: Date.now() };
              next[d.droneId] = [...arr.slice(-TRAIL_LENGTH + 1), point];
            }
            return next;
          });
          setError(null);
        } catch {
          setError("Parsing snapshot failed");
        }
      };
      es.onerror = () => {
        if (!stopped) setError("SSE connection lost (reconnect auto)");
      };
      return () => {
        stopped = true;
        es.close();
      };
    } catch (e: any) {
      setError(`EventSource indisponible: ${e?.message ?? "browser too old"}`);
    }
  }, [paused, projectId]);

  // === Fetch one-shot snapshot when SSE not yet ready ===
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/hardware/fleet/telemetry/snapshot`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setSnapshot(data);
      })
      .catch(() => { /* silent — SSE will retry */ });
  }, [projectId]);

  // === v7 — Replay mode (defined BEFORE canvas useEffect so displaySnapshot is in scope) ===
  const [replayMode, setReplayMode] = useState(false);
  const [replayHistory, setReplayHistory] = useState<Record<string, Array<Record<string, unknown>>>>({});
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [replayLoading, setReplayLoading] = useState(false);

  const loadReplayHistory = async () => {
    if (!snapshot || snapshot.drones.length === 0) {
      setError("Aucun drone dans le pool — rien à rejouer");
      return;
    }
    setReplayLoading(true);
    try {
      const byDrone: Record<string, Array<Record<string, unknown>>> = {};
      for (const d of snapshot.drones) {
        const r = await fetch(
          `/api/hardware/fleet/telemetry/history?drone_id=${encodeURIComponent(d.droneId)}&limit=500`,
          { credentials: "include" },
        );
        if (r.ok) {
          const body = await r.json();
          if (Array.isArray(body?.samples)) byDrone[d.droneId] = body.samples;
        }
      }
      setReplayHistory(byDrone);
      const totalSamples = Object.values(byDrone).reduce((sum, arr) => sum + arr.length, 0);
      if (totalSamples === 0) {
        setError("Aucun échantillon persisté pour le replay (le stream n'a pas tourné assez longtemps)");
        setReplayMode(false);
      } else {
        setReplayMode(true);
        setReplayIndex(0);
        setError(null);
      }
    } catch (e: any) {
      setError(`Replay indisponible: ${e?.message ?? "réseau"}`);
    } finally {
      setReplayLoading(false);
    }
  };

  // Replay animation loop
  useEffect(() => {
    if (!replayMode) return;
    const totalSamples = Object.values(replayHistory).reduce((sum, arr) => Math.max(sum, arr.length), 0);
    if (totalSamples === 0) return;
    const interval = setInterval(() => {
      setReplayIndex((i) => {
        if (i >= totalSamples - 1) return 0; // loop
        return i + 1;
      });
    }, 500 / replaySpeed);
    return () => clearInterval(interval);
  }, [replayMode, replayHistory, replaySpeed]);

  // Build a synthetic snapshot from replay data
  const replaySnapshot: FleetSnapshot | null = useMemo(() => {
    if (!replayMode || !snapshot) return null;
    const drones: DroneTelemetry[] = [];
    for (const d of snapshot.drones) {
      const samples = replayHistory[d.droneId] ?? [];
      const sample = samples[Math.min(replayIndex, samples.length - 1)] as any;
      if (sample) {
        drones.push({
          droneId: d.droneId,
          droneName: d.droneName,
          connected: true,
          armed: Boolean(sample.armed),
          position: {
            latitude_deg: sample.latitude_deg ?? null,
            longitude_deg: sample.longitude_deg ?? null,
            altitude_m: sample.altitude_m ?? null,
            relative_altitude_m: sample.relative_altitude_m ?? null,
          },
          x_m: sample.x_m ?? null,
          y_m: sample.y_m ?? null,
          battery_remaining_pct: sample.battery_remaining_pct ?? null,
          voltage_v: null,
          current_a: null,
          flight: { heading: sample.heading_deg ?? 0 },
          gps: {},
          inside_geofence: Boolean(sample.inside_geofence),
          altitude_ok: Boolean(sample.altitude_ok),
          last_heartbeat_at: sample.sampleTime ?? null,
          messages_received: 0,
        });
      }
    }
    return {
      timestamp: new Date().toISOString(),
      hardwareControlEnabled: snapshot.hardwareControlEnabled,
      poolSize: drones.length,
      geofenceConfigured: snapshot.geofenceConfigured,
      homeLat: snapshot.homeLat,
      homeLon: snapshot.homeLon,
      maxAltitudeM: snapshot.maxAltitudeM,
      drones,
      alerts: [],
    };
  }, [replayMode, replayHistory, replayIndex, snapshot]);

  // Use replay snapshot if in replay mode, else live snapshot
  const displaySnapshot = replaySnapshot ?? snapshot;
  const displayTrails = replayMode ? {} : trails; // disable trails in replay
  // === End v7 replay mode ===

  // === Canvas render ===
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Resize for high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    const cssSize = canvas.clientWidth || 600;
    if (canvas.width !== cssSize * dpr) {
      canvas.width = cssSize * dpr;
      canvas.height = cssSize * dpr;
      ctx.scale(dpr, dpr);
    }
    const W = cssSize;
    const H = cssSize;
    const cx = W / 2;
    const cy = H / 2;
    const radiusPx = Math.min(W, H) * 0.46;
    const mPerPx = scale / (radiusPx * 2);

    // === Background ===
    ctx.fillStyle = "#081419";
    ctx.fillRect(0, 0, W, H);

    // === Crosshair (N/S/E/W axes) ===
    ctx.strokeStyle = "rgba(160,215,222,.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, H);
    ctx.moveTo(0, cy);
    ctx.lineTo(W, cy);
    ctx.stroke();

    // === Scale rings ===
    const ringDistances = [25, 50, 100, 200, 500, 1000].filter((d) => d <= scale / 2);
    ctx.font = '10px "IBM Plex Mono", monospace';
    for (const d of ringDistances) {
      const r = d / mPerPx;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(37,208,217,.08)";
      ctx.stroke();
      ctx.fillStyle = "#6e939e";
      ctx.fillText(`${d}m`, cx + 4, cy - r + 12);
    }

    // === Compass labels (N E S W) ===
    ctx.font = 'bold 13px "IBM Plex Sans", sans-serif';
    ctx.fillStyle = "rgba(160,215,222,.4)";
    ctx.textAlign = "center";
    ctx.fillText("N", cx, 18);
    ctx.fillText("S", cx, H - 6);
    ctx.fillText("E", W - 12, cy + 4);
    ctx.fillText("W", 12, cy + 4);
    ctx.textAlign = "start";

    // === Geofence polygon ===
    if (
      geofence?.polygon &&
      geofence.polygon.length >= 3 &&
      geofence.homeLat != null &&
      geofence.homeLon != null
    ) {
      ctx.beginPath();
      for (let i = 0; i < geofence.polygon.length; i++) {
        const [lat, lon] = geofence.polygon[i];
        const dlat = lat - geofence.homeLat;
        const dlon =
          (lon - geofence.homeLon) *
          Math.cos((geofence.homeLat * Math.PI) / 180);
        const x = dlon * 111_000;
        const y = dlat * 111_000; // y axis: north up
        const px = cx + x / mPerPx;
        const py = cy - y / mPerPx; // canvas y is inverted
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(249,127,120,.55)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Subtle fill
      ctx.fillStyle = "rgba(249,127,120,.04)";
      ctx.fill();
    }

    // === Trails ===
    for (const [droneId, trail] of Object.entries(displayTrails)) {
      if (trail.length < 2) continue;
      const colorIdx = _colorIdx(droneId);
      const color = DRONE_COLORS[colorIdx];
      for (let i = 1; i < trail.length; i++) {
        const p0 = trail[i - 1];
        const p1 = trail[i];
        const alpha = i / trail.length;
        ctx.beginPath();
        ctx.moveTo(cx + p0.x / mPerPx, cy - p0.y / mPerPx);
        ctx.lineTo(cx + p1.x / mPerPx, cy - p1.y / mPerPx);
        ctx.strokeStyle = color + Math.floor(alpha * 200).toString(16).padStart(2, "0");
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // === Drones ===
    if (displaySnapshot) {
      displaySnapshot.drones.forEach((d, i) => {
        const color = DRONE_COLORS[i % DRONE_COLORS.length];
        const x = d.x_m;
        const y = d.y_m;
        const alive = d.connected;
        if (x == null || y == null) {
          // No position yet — display as "awaiting" in the top-left list area
          _drawAwaitingDrone(ctx, d, color, i);
          return;
        }
        const px = cx + x / mPerPx;
        const py = cy - y / mPerPx;

        // Lost heartbeat → grey
        const blipColor = !alive
          ? "#6e939e"
          : !d.inside_geofence || !d.altitude_ok
            ? "#fa7f78"
            : d.armed
              ? "#f1b954"
              : color;

        // Outer ring (battery ring)
        const battery = d.battery_remaining_pct;
        if (battery != null && battery >= 0 && battery <= 100) {
          ctx.beginPath();
          ctx.arc(px, py, 11, -Math.PI / 2, -Math.PI / 2 + (battery / 100) * 2 * Math.PI);
          ctx.strokeStyle = battery > 50 ? "#75d7ad" : battery > 20 ? "#f1b954" : "#fa7f78";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Blip
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, 2 * Math.PI);
        ctx.fillStyle = blipColor;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.4)";
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Heading arrow
        const heading = d.flight?.heading;
        if (heading != null && alive) {
          const rad = (heading * Math.PI) / 180;
          const arrowLen = 16;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(
            px + Math.sin(rad) * arrowLen,
            py - Math.cos(rad) * arrowLen,
          );
          ctx.strokeStyle = blipColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          // Arrow tip
          ctx.beginPath();
          ctx.moveTo(
            px + Math.sin(rad) * arrowLen,
            py - Math.cos(rad) * arrowLen,
          );
          ctx.lineTo(
            px + Math.sin(rad - 0.4) * (arrowLen - 5),
            py - Math.cos(rad - 0.4) * (arrowLen - 5),
          );
          ctx.lineTo(
            px + Math.sin(rad + 0.4) * (arrowLen - 5),
            py - Math.cos(rad + 0.4) * (arrowLen - 5),
          );
          ctx.closePath();
          ctx.fillStyle = blipColor;
          ctx.fill();
        }

        // Label (name + alt)
        ctx.font = '10px "IBM Plex Mono", monospace';
        ctx.fillStyle = blipColor;
        ctx.fillText(d.droneName, px + 14, py - 3);
        if (d.position.relative_altitude_m != null) {
          ctx.fillStyle = "#88a4ad";
          ctx.fillText(
            `${d.position.relative_altitude_m.toFixed(1)}m`,
            px + 14,
            py + 10,
          );
        }

        // Out-of-geofence flashing ring
        if (alive && (!d.inside_geofence || !d.altitude_ok)) {
          const t = Date.now() / 200;
          const r = 9 + Math.abs(Math.sin(t)) * 5;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, 2 * Math.PI);
          ctx.strokeStyle = "rgba(249,127,120,.7)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Armed pulsing dot
        if (d.armed && alive) {
          const t = Date.now() / 400;
          const r = 3 + Math.abs(Math.sin(t)) * 2;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, 2 * Math.PI);
          ctx.fillStyle = "rgba(241,185,84,.8)";
          ctx.fill();
        }
      });
    }

    // === Home marker ===
    ctx.font = 'bold 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = "#75d7ad";
    ctx.textAlign = "center";
    ctx.fillText("HOME", cx, cy - 8);
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy + 4);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.lineTo(cx, cy - 4);
    ctx.closePath();
    ctx.fillStyle = "#75d7ad";
    ctx.fill();
    ctx.textAlign = "start";
  }, [displaySnapshot, displayTrails, geofence, scale]);

  // === Animation loop (for flashing rings + armed pulse) ===
  useEffect(() => {
    if (paused) return;
    let rafId: number;
    const tick = () => {
      // Trigger a re-render of the canvas effect by toggling a hidden state
      setSnapshot((s) => (s ? { ...s, timestamp: s.timestamp } : s));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [paused]);

  const droneCount = snapshot?.poolSize ?? 0;
  const armedCount = snapshot?.drones.filter((d) => d.armed).length ?? 0;
  const disconnectedCount =
    snapshot?.drones.filter((d) => !d.connected).length ?? 0;
  const outOfGeofenceCount =
    snapshot?.drones.filter((d) => d.connected && !d.inside_geofence).length ??
    0;

  return (
    <div className="lb-radar">
      <div className="lb-radar-toolbar">
        <span className="lb-radar-title">
          <Crosshair size={14} /> {replayMode ? "Replay" : "Radar temps réel"} · {droneCount} drone(s)
        </span>
        <div className="lb-radar-controls">
          <select
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            aria-label="Échelle du radar"
          >
            <option value={100}>100 m</option>
            <option value={200}>200 m</option>
            <option value={500}>500 m</option>
            <option value={1000}>1 km</option>
            <option value={2000}>2 km</option>
            <option value={5000}>5 km</option>
          </select>
          <button
            onClick={() => setPaused((p) => !p)}
            className="lb-secondary"
            title={paused ? "Reprendre le stream" : "Mettre en pause"}
          >
            {paused ? (
              <>
                <Play size={13} /> Reprendre
              </>
            ) : (
              <>
                <Pause size={13} /> Pause
              </>
            )}
          </button>
          <button
            onClick={() => setTrails({})}
            className="lb-secondary"
            title="Effacer les traces"
          >
            <RotateCcw size={13} /> Traces
          </button>
          {!replayMode ? (
            <button
              onClick={loadReplayHistory}
              className="lb-secondary"
              title="Rejouer l'historique (replay mode)"
              disabled={replayLoading}
            >
              <History size={13} /> {replayLoading ? "Chargement…" : "Replay"}
            </button>
          ) : (
            <>
              <button
                onClick={() => setReplayMode(false)}
                className="lb-secondary"
                title="Quitter le replay"
              >
                <Radio size={13} /> Live
              </button>
              <select
                value={replaySpeed}
                onChange={(e) => setReplaySpeed(Number(e.target.value))}
                aria-label="Vitesse du replay"
                title="Vitesse du replay"
              >
                <option value={1}>1×</option>
                <option value={2}>2×</option>
                <option value={4}>4×</option>
                <option value={8}>8×</option>
              </select>
              <input
                type="range"
                min={0}
                max={Math.max(0, Object.values(replayHistory).reduce((m, arr) => Math.max(m, arr.length), 0) - 1)}
                value={replayIndex}
                onChange={(e) => setReplayIndex(Number(e.target.value))}
                title="Scrub replay"
                className="lb-radar-scrub"
              />
            </>
          )}
        </div>
      </div>

      <div className="lb-radar-canvas-wrap">
        <canvas ref={canvasRef} className="lb-radar-canvas" />
        {error && (
          <div className="lb-radar-error">
            <AlertTriangle size={14} /> {error}
          </div>
        )}
        {!displaySnapshot && !error && (
          <div className="lb-radar-loading">
            <Radio size={20} className="lb-radar-spin" /> Connexion SSE…
          </div>
        )}
      </div>

      <div className="lb-radar-stats">
        <span className={displaySnapshot?.hardwareControlEnabled ? "lb-text-good" : "lb-text-warning"}>
          <Radio size={12} /> {displaySnapshot?.hardwareControlEnabled ? "HW ACTIF" : "HW DORMANT"}
          {replayMode && <span className="lb-radar-replay-badge"> · REPLAY</span>}
        </span>
        <span className={armedCount > 0 ? "lb-text-warning" : ""}>
          <Crosshair size={12} /> {armedCount} armé(s)
        </span>
        <span className={disconnectedCount > 0 ? "lb-text-danger" : ""}>
          {disconnectedCount > 0 ? <WifiOff size={12} /> : <Wifi size={12} />}{" "}
          {droneCount - disconnectedCount}/{droneCount} connecté(s)
        </span>
        {outOfGeofenceCount > 0 && (
          <span className="lb-text-danger">
            <AlertTriangle size={12} /> {outOfGeofenceCount} hors géofence
          </span>
        )}
        {displaySnapshot?.geofenceConfigured ? (
          <span>
            <span className="lb-text-good">✓</span> Géofence
            {displaySnapshot.maxAltitudeM ? ` (max ${displaySnapshot.maxAltitudeM}m)` : ""}
          </span>
        ) : (
          <span className="lb-text-danger">
            <AlertTriangle size={12} /> Pas de géofence
          </span>
        )}
      </div>

      {/* Drone list with detail */}
      {displaySnapshot && displaySnapshot.drones.length > 0 && (
        <div className="lb-radar-list">
          {displaySnapshot.drones.map((d, i) => {
            const color = DRONE_COLORS[i % DRONE_COLORS.length];
            return (
              <div
                key={d.droneId}
                className={`lb-radar-list-row ${!d.connected ? "is-offline" : ""} ${!d.inside_geofence || !d.altitude_ok ? "is-alert" : ""}`}
              >
                <span
                  className="lb-radar-blip-dot"
                  style={{ background: color }}
                />
                <div>
                  <strong>{d.droneName}</strong>
                  <small>
                    {d.connected
                      ? d.armed
                        ? "ARMED"
                        : "connected"
                      : "offline"}
                    {d.position.relative_altitude_m != null &&
                      ` · ${d.position.relative_altitude_m.toFixed(1)}m`}
                    {d.battery_remaining_pct != null &&
                      ` · ${d.battery_remaining_pct}%`}
                    {d.flight?.heading != null &&
                      ` · HDG ${Math.round(d.flight.heading)}°`}
                  </small>
                </div>
                {d.error && (
                  <span className="lb-text-danger">{d.error}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// === Helpers ===

function _colorIdx(droneId: string): number {
  // Hash the droneId to a stable color index.
  let h = 0;
  for (let i = 0; i < droneId.length; i++) {
    h = (h * 31 + droneId.charCodeAt(i)) >>> 0;
  }
  return h % DRONE_COLORS.length;
}

function _drawAwaitingDrone(
  ctx: CanvasRenderingContext2D,
  d: DroneTelemetry,
  color: string,
  _i: number,
) {
  // Render a small icon in the top-left corner indicating "drone registered
  // but no MAVLink heartbeat yet". This is the dormant-mode state.
  const x = 16 + (_i % 6) * 8;
  const y = 16 + Math.floor(_i / 6) * 14;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, 2 * Math.PI);
  ctx.fillStyle = "#6e939e";
  ctx.fill();
  ctx.font = '9px "IBM Plex Mono", monospace';
  ctx.fillStyle = "#88a4ad";
  ctx.fillText(d.droneName.slice(0, 12), x + 6, y + 3);
}
