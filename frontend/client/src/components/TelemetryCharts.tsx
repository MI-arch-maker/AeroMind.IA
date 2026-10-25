import { useEffect, useState, useMemo } from "react";
import { Activity, Battery, Radio } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// ===========================================================================
// TelemetryCharts — Altitude / battery / heading over time (v8)
//
// Fetches persisted telemetry samples via /api/flights/history and renders
// 3 charts using recharts (already a project dependency):
//   1. Altitude (relative_altitude_m) over time
//   2. Battery (%) over time
//   3. Heading (°) over time
//
// Supports filtering by drone + time range (15min / 60min / 6h / 24h).
// ===========================================================================

type Sample = {
  sampleTime: string;
  droneId: string;
  droneName: string;
  relative_altitude_m: number | null;
  battery_remaining_pct: number | null;
  heading_deg: number | null;
  voltage_v: number | null;
  current_a: number | null;
};

type Props = {
  projectId: string | null;
  droneId?: string | null;
};

export function TelemetryCharts({ projectId, droneId }: Props) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [minutes, setMinutes] = useState(60);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!projectId && !droneId) return;
    setLoading(true);
    try {
      const url = new URL("/api/flights/history", window.location.origin);
      if (projectId) url.searchParams.set("projectId", projectId);
      if (droneId) url.searchParams.set("droneId", droneId);
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

  useEffect(() => { void refresh(); }, [projectId, droneId, minutes]);

  // Format data for charts — group by drone, take latest 200 samples per chart
  const chartData = useMemo(() => {
    if (samples.length === 0) return [];
    // Sort by time
    const sorted = [...samples].sort((a, b) => a.sampleTime.localeCompare(b.sampleTime));
    // Take last 200 to keep chart readable
    const sliced = sorted.slice(-200);
    // Group by sampleTime (in case multiple drones)
    const byTime = new Map<string, any>();
    for (const s of sliced) {
      const key = s.sampleTime.slice(11, 19); // HH:MM:SS
      const existing = byTime.get(key) ?? { time: key };
      existing[`${s.droneName}_alt`] = s.relative_altitude_m;
      existing[`${s.droneName}_batt`] = s.battery_remaining_pct;
      existing[`${s.droneName}_hdg`] = s.heading_deg;
      byTime.set(key, existing);
    }
    return Array.from(byTime.values());
  }, [samples]);

  const droneNames = useMemo(() => {
    const names = new Set<string>();
    samples.forEach((s) => names.add(s.droneName));
    return Array.from(names);
  }, [samples]);

  const colors = ["#25d0d9", "#f1b954", "#75d7ad", "#fa7f78", "#9b8cff"];

  return (
    <div className="lb-charts">
      <div className="lb-charts-toolbar">
        <span className="lb-radar-title">
          <Activity size={14} /> Télémétrie · {samples.length} échantillons · {droneNames.length} drone(s)
        </span>
        <div className="lb-radar-controls">
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            <option value={15}>15 min</option>
            <option value={60}>60 min</option>
            <option value={360}>6 h</option>
            <option value={1440}>24 h</option>
          </select>
          <button className="lb-secondary" onClick={refresh} disabled={loading}>
            {loading ? "…" : "Rafraîchir"}
          </button>
        </div>
      </div>

      {samples.length === 0 ? (
        <p className="lb-empty-state">Aucune donnée télémétrique persistée pour cette période. Le stream SSE doit tourner pour accumuler des samples.</p>
      ) : (
        <div className="lb-charts-grid">
          {/* Altitude chart */}
          <section className="lb-panel lb-chart-panel">
            <div className="lb-panel-title">
              <Activity size={17} />
              <span>Altitude (m) au fil du temps</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#25d0d9" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#25d0d9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(160,215,222,.06)" />
                <XAxis dataKey="time" tick={{ fill: "#88a4ad", fontSize: 10 }} />
                <YAxis tick={{ fill: "#88a4ad", fontSize: 10 }} unit="m" />
                <Tooltip contentStyle={{ background: "#0c1a28", border: "1px solid #1f3a4d", fontSize: 11 }} />
                {droneNames.map((name, i) => (
                  <Area
                    key={name}
                    type="monotone"
                    dataKey={`${name}_alt`}
                    stroke={colors[i % colors.length]}
                    fill={`url(#altGrad)`}
                    strokeWidth={1.5}
                    name={`${name} altitude`}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </section>

          {/* Battery chart */}
          <section className="lb-panel lb-chart-panel">
            <div className="lb-panel-title">
              <Battery size={17} />
              <span>Batterie (%) au fil du temps</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="rgba(160,215,222,.06)" />
                <XAxis dataKey="time" tick={{ fill: "#88a4ad", fontSize: 10 }} />
                <YAxis tick={{ fill: "#88a4ad", fontSize: 10 }} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={{ background: "#0c1a28", border: "1px solid #1f3a4d", fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {droneNames.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={`${name}_batt`}
                    stroke={colors[i % colors.length]}
                    strokeWidth={1.5}
                    name={`${name} batterie`}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </section>

          {/* Heading chart */}
          <section className="lb-panel lb-chart-panel">
            <div className="lb-panel-title">
              <Radio size={17} />
              <span>Cap (°) au fil du temps</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="rgba(160,215,222,.06)" />
                <XAxis dataKey="time" tick={{ fill: "#88a4ad", fontSize: 10 }} />
                <YAxis tick={{ fill: "#88a4ad", fontSize: 10 }} domain={[0, 360]} unit="°" />
                <Tooltip contentStyle={{ background: "#0c1a28", border: "1px solid #1f3a4d", fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {droneNames.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={`${name}_hdg`}
                    stroke={colors[i % colors.length]}
                    strokeWidth={1.5}
                    name={`${name} cap`}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </section>
        </div>
      )}
    </div>
  );
}
