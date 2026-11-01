import { useMemo } from "react";

/**
 * AeroMind · graphiques de télémétrie défilants.
 *
 * Le composant reçoit un tampon borné alimenté en continu par le flux de
 * simulation : la courbe se décale d'elle-même à chaque nouvelle trame, sans
 * interaction. Les valeurs sont des hypothèses de simulation locale.
 */

export type StripTone = "cyan" | "amber" | "violet" | "green" | "coral";

const toneColors: Record<StripTone, string> = {
  cyan: "#48d3f0",
  amber: "#f4be4f",
  violet: "#a98bf5",
  green: "#6fe0ad",
  coral: "#f28d76",
};

export function TelemetryStripChart({
  label,
  unit,
  values,
  tone = "cyan",
  decimals = 1,
  height = 54,
  showAxis = true,
}: {
  label: string;
  unit: string;
  values: number[];
  tone?: StripTone;
  decimals?: number;
  height?: number;
  showAxis?: boolean;
}) {
  const width = 240;
  const series = useMemo(() => values.slice(-180), [values]);
  const geometry = useMemo(() => {
    if (series.length < 2) return null;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = max - min < 0.001 ? 1 : max - min;
    const padding = span * 0.12;
    const low = min - padding;
    const high = max + padding;
    const step = width / (series.length - 1);
    const points = series.map((value, index) => {
      const x = index * step;
      const y = height - ((value - low) / (high - low)) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return {
      points,
      area: `0,${height} ${points.join(" ")} ${width},${height}`,
      min,
      max,
      last: series[series.length - 1],
      previous: series[series.length - 2] ?? series[series.length - 1],
      low,
      high,
    };
  }, [series, height]);

  const color = toneColors[tone];
  const last = geometry?.last ?? series[series.length - 1] ?? 0;
  const delta = geometry ? geometry.last - geometry.previous : 0;

  return (
    <figure className={`telemetry-strip tone-${tone}`} aria-label={`${label} — graphique défilant`}>
      <figcaption>
        <span>{label}</span>
        <strong>
          {last.toFixed(decimals)}
          {unit ? ` ${unit}` : ""}
        </strong>
        {geometry && (
          <em className={delta >= 0 ? "is-up" : "is-down"}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(decimals)}
          </em>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${label} sur ${series.length} trames`}>
        <defs>
          <linearGradient id={`strip-fill-${tone}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.34" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {showAxis && (
          <g className="telemetry-strip-grid" stroke="currentColor" strokeWidth="0.4" opacity="0.22">
            {[0.25, 0.5, 0.75].map(ratio => (
              <line key={ratio} x1="0" y1={height * ratio} x2={width} y2={height * ratio} />
            ))}
            {[0.25, 0.5, 0.75].map(ratio => (
              <line key={`v-${ratio}`} x1={width * ratio} y1="0" x2={width * ratio} y2={height} />
            ))}
          </g>
        )}
        {geometry ? (
          <>
            <polygon points={geometry.area} fill={`url(#strip-fill-${tone})`} />
            <polyline points={geometry.points.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={width} cy={height - ((geometry.last - geometry.low) / (geometry.high - geometry.low)) * height} r="2.4" fill={color} className="telemetry-strip-cursor" />
          </>
        ) : (
          <text x={width / 2} y={height / 2 + 3} textAnchor="middle" fontSize="8" className="telemetry-strip-empty">
            ACQUISITION EN COURS…
          </text>
        )}
      </svg>
      <div className="telemetry-strip-range">
        <span>MIN {geometry ? geometry.min.toFixed(decimals) : "—"}</span>
        <span>MAX {geometry ? geometry.max.toFixed(decimals) : "—"}</span>
        <span>{series.length} TRAMES</span>
      </div>
    </figure>
  );
}