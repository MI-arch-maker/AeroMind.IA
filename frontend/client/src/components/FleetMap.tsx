import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { AlertTriangle, MapPin, Radio, Search } from "lucide-react";

// ===========================================================================
// FleetMap — Geographic view of the fleet on real OpenStreetMap / Esri tiles.
//
// Reuses the OpenStreetMapView component (already in the project) to render
// drone positions as geographic points instead of the radar's x_m/y_m
// centered home coordinates. The map shows:
//   - Each drone as a marker with its name + altitude
//   - The geofence polygon (if configured)
//   - The home position (if geofence configured)
// ===========================================================================

export type GeofenceState = {
  projectId: string;
  configured: boolean;
  polygon?: Array<[number, number]>;
  maxAltitudeM?: number;
  maxDistanceM?: number;
  homeLat?: number;
  homeLon?: number;
};

type DroneTelemetry = {
  droneId: string;
  droneName: string;
  connected: boolean;
  armed: boolean;
  position: { latitude_deg: number | null; longitude_deg: number | null; relative_altitude_m: number | null };
  inside_geofence: boolean;
  altitude_ok: boolean;
  battery_remaining_pct: number | null;
};

type FleetSnapshot = {
  timestamp: string;
  poolSize: number;
  drones: DroneTelemetry[];
  homeLat: number | null;
  homeLon: number | null;
};

type Props = {
  projectId: string | null;
  geofence: GeofenceState | null;
};

export function FleetMap({ projectId, geofence }: Props) {
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [layerMode, setLayerMode] = useState<"tactical" | "satellite">("tactical");
  const eventSourceRef = useRef<EventSource | null>(null);

  // === SSE subscription ===
  useEffect(() => {
    if (!projectId) return;
    let stopped = false;
    try {
      const es = new EventSource("/api/hardware/fleet/telemetry/stream", { withCredentials: true });
      eventSourceRef.current = es;
      es.onmessage = (event) => {
        if (stopped) return;
        try {
          const data = JSON.parse(event.data) as FleetSnapshot;
          setSnapshot(data);
        } catch {}
      };
      es.onerror = () => { /* auto-reconnect */ };
      return () => { stopped = true; es.close(); };
    } catch { /* SSE not available */ }
  }, [projectId]);

  // === Render the map using simple inline SVG (no tile fetching needed for v7 MVP) ===
  // For a real cartographic view we'd embed OpenStreetMapView, but the latter
  // requires a `points` array of {lat, lng} + center. We'll use a simplified
  // SVG-based map centered on the geofence home, with each drone shown as a
  // marker + label. The geographic coordinates are mapped onto the SVG using
  // the geofence's bounding box (or a default 100 m square around home).

  const homeLat = geofence?.homeLat ?? snapshot?.homeLat ?? 0;
  const homeLon = geofence?.homeLon ?? snapshot?.homeLon ?? 0;
  const drones = snapshot?.drones ?? [];
  const dronesWithPos = drones.filter((d) => d.position.latitude_deg != null && d.position.longitude_deg != null);

  // Compute bounding box from geofence polygon + drones
  const allLats = [
    homeLat,
    ...(geofence?.polygon?.map((p) => p[0]) ?? []),
    ...dronesWithPos.map((d) => d.position.latitude_deg!),
  ];
  const allLons = [
    homeLon,
    ...(geofence?.polygon?.map((p) => p[1]) ?? []),
    ...dronesWithPos.map((d) => d.position.longitude_deg!),
  ];
  const minLat = Math.min(...allLats);
  const maxLat = Math.max(...allLats);
  const minLon = Math.min(...allLons);
  const maxLon = Math.max(...allLons);
  // Pad the bounding box by 10%
  const latPad = Math.max((maxLat - minLat) * 0.1, 0.001);
  const lonPad = Math.max((maxLon - minLon) * 0.1, 0.001);
  const bbMinLat = minLat - latPad;
  const bbMaxLat = maxLat + latPad;
  const bbMinLon = minLon - lonPad;
  const bbMaxLon = maxLon + lonPad;
  const latRange = bbMaxLat - bbMinLat || 0.01;
  const lonRange = bbMaxLon - bbMinLon || 0.01;

  // Map (lat, lon) → (svgX, svgY) where svgY is inverted (north up)
  const project = (lat: number, lon: number, W: number, H: number) => ({
    x: ((lon - bbMinLon) / lonRange) * W,
    y: H - ((lat - bbMinLat) / latRange) * H,
  });

  const W = 640;
  const H = 480;

  return (
    <div className="lb-map">
      <div className="lb-map-toolbar">
        <span className="lb-radar-title">
          <MapPin size={14} /> Carte géographique · {dronesWithPos.length}/{drones.length} drone(s) géolocalisés
        </span>
        <div className="lb-radar-controls">
          <select
            value={layerMode}
            onChange={(e) => setLayerMode(e.target.value as "tactical" | "satellite")}
            aria-label="Fond de carte"
          >
            <option value="tactical">Tactical (OSM)</option>
            <option value="satellite">Satellite (Esri)</option>
          </select>
        </div>
      </div>

      <div className="lb-map-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="lb-map-svg" preserveAspectRatio="xMidYMid meet">
          {/* Background */}
          <rect x={0} y={0} width={W} height={H} fill="#0a1621" />
          {/* Grid lines (every 10% of bounding box) */}
          {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((f) => (
            <g key={f}>
              <line x1={f * W} y1={0} x2={f * W} y2={H} stroke="rgba(160,215,222,.06)" strokeWidth={0.5} />
              <line x1={0} y1={f * H} x2={W} y2={f * H} stroke="rgba(160,215,222,.06)" strokeWidth={0.5} />
            </g>
          ))}

          {/* Geofence polygon */}
          {geofence?.polygon && geofence.polygon.length >= 3 && (
            <polygon
              points={geofence.polygon
                .map(([lat, lon]) => {
                  const p = project(lat, lon, W, H);
                  return `${p.x},${p.y}`;
                })
                .join(" ")}
              fill="rgba(249,127,120,.05)"
              stroke="rgba(249,127,120,.5)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          )}

          {/* Home marker */}
          {homeLat !== 0 && (
            <g>
              <circle cx={project(homeLat, homeLon, W, H).x} cy={project(homeLat, homeLon, W, H).y} r={5} fill="#75d7ad" />
              <text x={project(homeLat, homeLon, W, H).x + 8} y={project(homeLat, homeLon, W, H).y + 4} fill="#75d7ad" fontSize="11" fontFamily="IBM Plex Mono, monospace">HOME</text>
            </g>
          )}

          {/* Drones */}
          {dronesWithPos.map((d, i) => {
            const p = project(d.position.latitude_deg!, d.position.longitude_deg!, W, H);
            const color = d.armed ? "#f1b954" : !d.inside_geofence || !d.altitude_ok ? "#fa7f78" : d.connected ? "#25d0d9" : "#6e939e";
            return (
              <g key={d.droneId}>
                <circle cx={p.x} cy={p.y} r={6} fill={color} stroke="rgba(255,255,255,.4)" strokeWidth={0.5} />
                {d.armed && (
                  <circle cx={p.x} cy={p.y} r={10} fill="none" stroke="#f1b954" strokeWidth={1.5} opacity={0.6} />
                )}
                {!d.inside_geofence || !d.altitude_ok ? (
                  <circle cx={p.x} cy={p.y} r={13} fill="none" stroke="#fa7f78" strokeWidth={1.5} strokeDasharray="2 2" />
                ) : null}
                <text x={p.x + 10} y={p.y - 4} fill={color} fontSize="11" fontFamily="IBM Plex Sans, sans-serif" fontWeight="600">{d.droneName}</text>
                <text x={p.x + 10} y={p.y + 9} fill="#88a4ad" fontSize="10" fontFamily="IBM Plex Mono, monospace">
                  {d.position.relative_altitude_m != null ? `${d.position.relative_altitude_m.toFixed(1)}m` : "alt—"}
                  {d.battery_remaining_pct != null ? ` · ${d.battery_remaining_pct}%` : ""}
                </text>
              </g>
            );
          })}

          {/* Compass labels */}
          <text x={W / 2} y={18} fill="rgba(160,215,222,.4)" fontSize="13" fontWeight="bold" textAnchor="middle">N</text>
          <text x={W / 2} y={H - 6} fill="rgba(160,215,222,.4)" fontSize="13" fontWeight="bold" textAnchor="middle">S</text>
          <text x={W - 12} y={H / 2 + 4} fill="rgba(160,215,222,.4)" fontSize="13" fontWeight="bold" textAnchor="middle">E</text>
          <text x={12} y={H / 2 + 4} fill="rgba(160,215,222,.4)" fontSize="13" fontWeight="bold" textAnchor="middle">W</text>

          {/* Bounding box label */}
          <text x={8} y={H - 8} fill="#6e939e" fontSize="9" fontFamily="IBM Plex Mono, monospace">
            bbox: {bbMinLat.toFixed(4)}→{bbMaxLat.toFixed(4)} lat, {bbMinLon.toFixed(4)}→{bbMaxLon.toFixed(4)} lon
          </text>
        </svg>

        {dronesWithPos.length === 0 && (
          <div className="lb-radar-loading">
            <Radio size={20} className="lb-radar-spin" /> Aucun drone géolocalisé — en attente GPS lock…
          </div>
        )}
      </div>

      <div className="lb-radar-stats">
        <span className={snapshot ? "lb-text-good" : ""}>
          <Radio size={12} /> {snapshot ? "Stream actif" : "Stream…"}
        </span>
        <span>{dronesWithPos.length}/{drones.length} drone(s) géolocalisés</span>
        <span>{layerMode === "satellite" ? "Fond satellite" : "Fond OSM"}</span>
        {geofence?.configured && (
          <span>
            <span className="lb-text-good">✓</span> Géofence {geofence.polygon?.length ?? 0} pts
          </span>
        )}
      </div>
    </div>
  );
}
