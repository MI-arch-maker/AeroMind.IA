import { useEffect, useState, useMemo, useRef } from "react";
import { Play, Pause, FastForward, Rewind, Crosshair, Radio } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// ===========================================================================
// AdvancedReplay — timeline scrubber + 3D trail + speed/heading chart (v12)
//
// Fetches persisted telemetry from /api/hardware/fleet/telemetry/history/range
// and renders an advanced replay with:
//   1. Timeline scrubber (zoomable, drag to scrub)
//   2. 3D trail (altitude encoded as circle size + color)
//   3. Speed + heading chart synced with scrubber position
// ===========================================================================

type Sample = {
  sampleTime: string;
  latitude_deg: number | null;
  longitude_deg: number | null;
  relative_altitude_m: number | null;
  x_m: number | null;
  y_m: number | null;
  heading_deg: number | null;
  battery_remaining_pct: number | null;
  armed: boolean;
  connected: boolean;
};

type Props = {
  projectId: string | null;
};

const W = 600;
const H = 400;

export function AdvancedReplay({ projectId }: Props) {
  const [allSamples, setAllSamples] = useState<Record<string, Sample[]>>({});
  const [droneIds, setDroneIds] = useState<string[]>([]);
  const [activeDrone, setActiveDrone] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [minutes, setMinutes] = useState(15);
  const [loading, setLoading] = useState(false);
  const [scale, setScale] = useState(200);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadHistory = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const r = await fetch(
        `/api/hardware/fleet/telemetry/history/range?project_id=${encodeURIComponent(projectId)}&minutes=${minutes}`,
        { credentials: "include" },
      );
      if (r.ok) {
        const body = await r.json();
        const drones = body?.drones ?? {};
        setAllSamples(drones);
        const ids = Object.keys(drones);
        setDroneIds(ids);
        if (ids.length > 0 && !activeDrone) setActiveDrone(ids[0]);
        setIndex(0);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { void loadHistory(); }, [projectId, minutes]);

  // Auto-play
  useEffect(() => {
    if (!playing || !activeDrone) return;
    const samples = allSamples[activeDrone] ?? [];
    if (samples.length === 0) return;
    const interval = setInterval(() => {
      setIndex((i) => {
        if (i >= samples.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 500 / speed);
    return () => clearInterval(interval);
  }, [playing, speed, activeDrone, allSamples]);

  const samples = activeDrone ? (allSamples[activeDrone] ?? []) : [];
  const totalSamples = samples.length;
  const currentSample = samples[Math.min(index, totalSamples - 1)];

  // Chart data (last 200 samples around current index)
  const chartData = useMemo(() => {
    if (!currentSample) return [];
    const start = Math.max(0, index - 100);
    const end = Math.min(totalSamples, index + 100);
    return samples.slice(start, end).map((s, i) => ({
      idx: start + i,
      alt: s.relative_altitude_m,
      batt: s.battery_remaining_pct,
      hdg: s.heading_deg,
    }));
  }, [samples, index, totalSamples, currentSample]);

  // Canvas render — 3D trail (x_m, y_m + altitude as circle size)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssSize = canvas.clientWidth || W;
    if (canvas.width !== cssSize * dpr) {
      canvas.width = cssSize * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
    }
    const W2 = cssSize;
    const H2 = H;
    const cx = W2 / 2;
    const cy = H2 / 2;
    const radiusPx = Math.min(W2, H2) * 0.44;
    const mPerPx = scale / (radiusPx * 2);

    // Background
    ctx.fillStyle = "#081419";
    ctx.fillRect(0, 0, W2, H2);

    // Scale rings
    ctx.strokeStyle = "rgba(37,208,217,.06)";
    ctx.lineWidth = 1;
    for (const d of [25, 50, 100, 200, 500]) {
      if (d > scale / 2) break;
      const r = d / mPerPx;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Crosshair
    ctx.strokeStyle = "rgba(160,215,222,.05)";
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, H2);
    ctx.moveTo(0, cy); ctx.lineTo(W2, cy);
    ctx.stroke();

    // Trail up to current index — 3D effect (altitude → color)
    if (activeDrone && samples.length > 0) {
      const trail = samples.slice(0, index + 1);
      for (let i = 0; i < trail.length; i++) {
        const s = trail[i];
        if (s.x_m == null || s.y_m == null) continue;
        const px = cx + s.x_m / mPerPx;
        const py = cy - s.y_m / mPerPx;
        const alt = s.relative_altitude_m ?? 0;
        // Color: blue (ground) → cyan (low) → yellow (mid) → red (high)
        const altFrac = Math.min(1, alt / 50);
        const r = Math.floor(37 + altFrac * (250 - 37));
        const g = Math.floor(208 - altFrac * (208 - 100));
        const b = Math.floor(217 - altFrac * (217 - 50));
        const alpha = i / trail.length * 0.6 + 0.1;
        // Circle size proportional to altitude (3D depth)
        const size = 2 + Math.min(6, alt / 10);
        ctx.beginPath();
        ctx.arc(px, py, size, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fill();
        // Trail line
        if (i > 0) {
          const prev = trail[i - 1];
          if (prev.x_m != null && prev.y_m != null) {
            ctx.beginPath();
            ctx.moveTo(cx + prev.x_m / mPerPx, cy - prev.y_m / mPerPx);
            ctx.lineTo(px, py);
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      // Current position marker (bright)
      if (currentSample && currentSample.x_m != null && currentSample.y_m != null) {
        const px = cx + currentSample.x_m / mPerPx;
        const py = cy - currentSample.y_m / mPerPx;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, 2 * Math.PI);
        ctx.fillStyle = currentSample.armed ? "#f1b954" : "#25d0d9";
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1;
        ctx.stroke();
        // Label
        ctx.font = '10px "IBM Plex Mono", monospace';
        ctx.fillStyle = "#dff8f7";
        ctx.fillText(`alt: ${(currentSample.relative_altitude_m ?? 0).toFixed(1)}m`, px + 10, py - 4);
        ctx.fillStyle = "#88a4ad";
        ctx.fillText(`batt: ${currentSample.battery_remaining_pct ?? "—"}%`, px + 10, py + 10);
      }
    }

    // Home marker
    ctx.fillStyle = "#75d7ad";
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.fillText("HOME", cx + 6, cy + 3);
  }, [currentSample, index, samples, activeDrone, scale, allSamples]);

  return (
    <div className="lb-replay-adv">
      <div className="lb-radar-toolbar">
        <span className="lb-radar-title">
          <Crosshair size={14} /> Replay avancé 3D (v12) · {totalSamples} samples
        </span>
        <div className="lb-radar-controls">
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            <option value={5}>5 min</option>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>60 min</option>
          </select>
          <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
            <option value={100}>100 m</option>
            <option value={200}>200 m</option>
            <option value={500}>500 m</option>
            <option value={1000}>1 km</option>
          </select>
          <button className="lb-secondary" onClick={() => void loadHistory()} disabled={loading}>
            <Radio size={13} /> {loading ? "…" : "Charger"}
          </button>
        </div>
      </div>

      {droneIds.length > 1 && (
        <div className="lb-replay-drone-select">
          <span>Drone:</span>
          {droneIds.map((id, i) => (
            <button
              key={id}
              className={`lb-secondary ${activeDrone === id ? "is-active" : ""}`}
              onClick={() => { setActiveDrone(id); setIndex(0); }}
            >
              Drone {i + 1}
            </button>
          ))}
        </div>
      )}

      <div className="lb-replay-grid">
        {/* 3D trail canvas */}
        <div className="lb-replay-canvas-wrap">
          <canvas ref={canvasRef} className="lb-radar-canvas" style={{ maxHeight: H }} />
        </div>

        {/* Speed/heading chart */}
        <div className="lb-replay-chart">
          <div className="lb-panel-title">
            <Activity size={14} /> Altitude & batterie (window)
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="rgba(160,215,222,.06)" />
                <XAxis dataKey="idx" tick={{ fill: "#88a4ad", fontSize: 9 }} />
                <YAxis yAxisId="alt" tick={{ fill: "#88a4ad", fontSize: 9 }} unit="m" />
                <YAxis yAxisId="batt" orientation="right" tick={{ fill: "#88a4ad", fontSize: 9 }} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={{ background: "#0c1a28", border: "1px solid #1f3a4d", fontSize: 10 }} />
                <Line yAxisId="alt" type="monotone" dataKey="alt" stroke="#25d0d9" strokeWidth={1.5} dot={false} name="Altitude (m)" isAnimationActive={false} />
                <Line yAxisId="batt" type="monotone" dataKey="batt" stroke="#f1b954" strokeWidth={1.5} dot={false} name="Batterie (%)" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="lb-empty-state">Aucune donnée.</p>
          )}
        </div>
      </div>

      {/* Timeline scrubber */}
      <div className="lb-replay-timeline">
        <button className="lb-secondary" onClick={() => setIndex(0)} disabled={totalSamples === 0}>
          <Rewind size={13} />
        </button>
        <button
          className={playing ? "lb-estop" : "lb-primary"}
          onClick={() => setPlaying((p) => !p)}
          disabled={totalSamples === 0}
        >
          {playing ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Play</>}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0, totalSamples - 1)}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          className="lb-replay-scrubber"
        />
        <span className="lb-replay-time">
          {currentSample ? `${currentSample.sampleTime?.slice(11, 19)}` : "—:—:—"}
          {" / "}
          {totalSamples > 0 ? samples[totalSamples - 1]?.sampleTime?.slice(11, 19) : "—:—:—"}
        </span>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
          <option value={8}>8×</option>
          <option value={16}>16×</option>
        </select>
        <button className="lb-secondary" onClick={() => setIndex(totalSamples - 1)} disabled={totalSamples === 0}>
          <FastForward size={13} />
        </button>
      </div>

      {totalSamples === 0 && !loading && (
        <p className="lb-empty-state">Aucun échantillon pour cette période. Lancez le stream SSE pour accumuler de la télémétrie, puis rechargez.</p>
      )}
    </div>
  );
}

// Inline icon (to avoid extra import)
function Activity({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>;
}
