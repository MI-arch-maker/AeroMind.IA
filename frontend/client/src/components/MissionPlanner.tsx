import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, Plane, Plus, RefreshCw, Trash2, Upload, Crosshair } from "lucide-react";

// ===========================================================================
// MissionPlanner — waypoints on SVG map + MAVLink mission upload (v8)
//
// Fetches missions from /api/missions, lets the operator click on the map to
// add waypoints, reorder, save, and upload to a drone via MAVLink (gated by
// HARDWARE_CONTROL + token + geofence per waypoint).
// ===========================================================================

type Waypoint = {
  id?: string;
  sequence: number;
  command: string;
  latitude: number | null;
  longitude: number | null;
  altitude_m: number | null;
  param1?: number | null;
  param2?: number | null;
  param3?: number | null;
  param4?: number | null;
  [key: string]: unknown;  // allow extra fields from API
};

type Mission = {
  id: string;
  projectId: string | null;
  name: string;
  description: string;
  waypointsCount: number;
  waypoints: Waypoint[];
  createdAt: string;
  uploadedAt: string | null;
  uploadedToDroneId: string | null;
};

type GeofenceState = {
  projectId: string;
  configured: boolean;
  polygon?: Array<[number, number]>;
  homeLat?: number;
  homeLon?: number;
};

type Props = {
  projectId: string | null;
  geofence: GeofenceState | null;
};

const W = 640;
const H = 480;

export function normalizeMission(input: Partial<Mission> & { id: string; name?: string }): Mission {
  const waypoints = Array.isArray(input.waypoints) ? input.waypoints.map((waypoint, index) => ({
    ...waypoint,
    sequence: Number.isFinite(Number(waypoint.sequence)) ? Number(waypoint.sequence) : index + 1,
    command: String(waypoint.command || "NAV_WAYPOINT"),
    latitude: waypoint.latitude == null ? null : Number(waypoint.latitude),
    longitude: waypoint.longitude == null ? null : Number(waypoint.longitude),
    altitude_m: waypoint.altitude_m == null ? null : Number(waypoint.altitude_m),
  })) : [];
  return {
    id: String(input.id),
    projectId: input.projectId ?? null,
    name: String(input.name || "Mission sans nom"),
    description: String(input.description || ""),
    waypointsCount: waypoints.length,
    waypoints,
    createdAt: String(input.createdAt || new Date(0).toISOString()),
    uploadedAt: input.uploadedAt ?? null,
    uploadedToDroneId: input.uploadedToDroneId ?? null,
  };
}

export function hasWaypointCoordinates(waypoint: Waypoint): waypoint is Waypoint & { latitude: number; longitude: number } {
  return Number.isFinite(waypoint.latitude) && Number.isFinite(waypoint.longitude);
}

export function formatWaypointCoordinate(value: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(5) : "—";
}

export function missionHttpError(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const record = body as { detail?: unknown; message?: unknown; error?: unknown };
    const nested = record.error && typeof record.error === "object" ? (record.error as { message?: unknown }).message : undefined;
    for (const candidate of [record.detail, nested, record.message]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
  }
  return `HTTP ${status}`;
}

export function MissionPlanner({ projectId, geofence }: Props) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [activeMission, setActiveMission] = useState<Mission | null>(null);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const responseError = async (r: Response) => {
    try { return missionHttpError(r.status, await r.json()); }
    catch { return `HTTP ${r.status}`; }
  };

  const refreshMissions = async () => {
    const url = new URL("/api/missions", window.location.origin);
    if (projectId) url.searchParams.set("projectId", projectId);
    const r = await fetch(url.toString(), { credentials: "include" });
    if (!r.ok) throw new Error(await responseError(r));
    const body = await r.json() as { missions?: Mission[] };
    const list: Mission[] = Array.isArray(body?.missions)
      ? body.missions.filter((mission): mission is Mission & { id: string } => Boolean(mission && mission.id)).map(normalizeMission)
      : [];
    setMissions(list);
    setActiveMission((current) => {
      if (!current) return null;
      return list.find((mission) => mission.id === current.id) ?? null;
    });
  };

  useEffect(() => { void refreshMissions().catch((error) => setActionMessage(`Échec du rafraîchissement des missions: ${error instanceof Error ? error.message : "erreur réseau"}`)); }, [projectId]);

  const firstLocatedWaypoint = activeMission?.waypoints.find(hasWaypointCoordinates);
  const homeLat = geofence?.homeLat ?? firstLocatedWaypoint?.latitude ?? 0;
  const homeLon = geofence?.homeLon ?? firstLocatedWaypoint?.longitude ?? 0;

  // Bounding box around home + located waypoints + geofence. Draft points
  // without coordinates remain editable and never break map rendering.
  const locatedWaypoints = activeMission?.waypoints.filter(hasWaypointCoordinates) ?? [];
  const allLats = [homeLat, ...locatedWaypoints.map((w) => w.latitude), ...(geofence?.polygon?.map((p) => p[0]) ?? [])];
  const allLons = [homeLon, ...locatedWaypoints.map((w) => w.longitude), ...(geofence?.polygon?.map((p) => p[1]) ?? [])];
  const minLat = Math.min(...allLats) - 0.001;
  const maxLat = Math.max(...allLats) + 0.001;
  const minLon = Math.min(...allLons) - 0.001;
  const maxLon = Math.max(...allLons) + 0.001;
  const latRange = maxLat - minLat || 0.01;
  const lonRange = maxLon - minLon || 0.01;

  const project = (lat: number, lon: number) => ({
    x: ((lon - minLon) / lonRange) * W,
    y: H - ((lat - minLat) / latRange) * H,
  });

  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!activeMission) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    // Inverse projection
    const lon = minLon + (x / W) * lonRange;
    const lat = minLat + ((H - y) / H) * latRange;
    const seq = (activeMission.waypoints?.length ?? 0) + 1;
    if (!activeMission) return;
    setActiveMission({
      ...activeMission,
      waypoints: [...(activeMission.waypoints ?? []), {
        sequence: seq,
        command: "NAV_WAYPOINT",
        latitude: lat,
        longitude: lon,
        altitude_m: 30, // default 30m
      }],
    });
  };

  const createMission = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    setActionMessage(null);
    try {
      const r = await fetch("/api/missions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), projectId, waypoints: [] }),
      });
      if (!r.ok) throw new Error(await responseError(r));
      const created = await r.json();
      setNewName("");
      // Select the new mission
      const newM: Mission = {
        id: created.id,
        projectId,
        name: newName.trim() || created.name,
        description: "",
        waypointsCount: 0,
        waypoints: [],
        createdAt: new Date().toISOString(),
        uploadedAt: null,
        uploadedToDroneId: null,
      };
      setActiveMission(newM);
      try {
        await refreshMissions();
      } catch (error) {
        setActionMessage(`Mission créée, mais la liste n’a pas pu être actualisée: ${error instanceof Error ? error.message : "erreur réseau"}`);
      }
    } catch (error) {
      setActionMessage(`Échec de création: ${error instanceof Error ? error.message : "erreur réseau"}`);
    } finally { setLoading(false); }
  };

  const saveMission = async () => {
    if (!activeMission) return;
    setLoading(true);
    setActionMessage(null);
    try {
      const r = await fetch(`/api/missions/${activeMission.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waypoints: activeMission.waypoints }),
      });
      if (!r.ok) throw new Error(await responseError(r));
      setActionMessage("Mission sauvegardée.");
      try {
        await refreshMissions();
      } catch (error) {
        setActionMessage(`Mission sauvegardée, mais la liste n’a pas pu être actualisée: ${error instanceof Error ? error.message : "erreur réseau"}`);
      }
    } catch (error) {
      setActionMessage(`Échec de sauvegarde; le plan local est conservé: ${error instanceof Error ? error.message : "erreur réseau"}`);
    } finally { setLoading(false); }
  };

  const uploadMission = async () => {
    if (!activeMission) return;
    const droneId = prompt("Drone ID cible (UUID):");
    if (!droneId) return;
    const token = prompt("Token single-use (issu par /api/hardware/gate/issue-token):");
    if (!token || token.length < 16) {
      alert("Token invalide (≥ 16 chars)");
      return;
    }
    setLoading(true);
    setActionMessage(null);
    try {
      const r = await fetch(`/api/missions/${activeMission.id}/upload`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ droneId, confirmationToken: token, projectId }),
      });
      if (!r.ok) throw new Error(await responseError(r));
      const body = await r.json().catch(() => null) as { waypointsSent?: unknown; totalWaypoints?: unknown } | null;
      if (typeof body?.waypointsSent === "number" && typeof body.totalWaypoints === "number") {
        setUploadResult(`Mission uploadée: ${body.waypointsSent}/${body.totalWaypoints} waypoints envoyés`);
      } else {
        setUploadResult("Réponse HTTP réussie; le bilan d’envoi n’a pas été fourni et reste à confirmer.");
      }
      try {
        await refreshMissions();
      } catch (error) {
        setActionMessage(`Upload terminé, mais la liste n’a pas pu être actualisée: ${error instanceof Error ? error.message : "erreur réseau"}`);
      }
    } catch (error) {
      setUploadResult(`Échec upload: ${error instanceof Error ? error.message : "erreur réseau"}`);
    } finally { setLoading(false); }
  };

  const deleteMission = async (id: string) => {
    if (!confirm("Supprimer cette mission ?")) return;
    setLoading(true);
    setActionMessage(null);
    try {
      const r = await fetch(`/api/missions/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error(await responseError(r));
      // Avoid TypeScript type narrowing on activeMission?.id
      const am = activeMission as Mission | null;
      if (am != null && am.id === id) setActiveMission(null);
      setActionMessage("Mission supprimée.");
      try {
        await refreshMissions();
      } catch (error) {
        setActionMessage(`Mission supprimée, mais la liste n’a pas pu être actualisée: ${error instanceof Error ? error.message : "erreur réseau"}`);
      }
    } catch (error) {
      setActionMessage(`Échec de suppression: ${error instanceof Error ? error.message : "erreur réseau"}`);
    } finally {
      setLoading(false);
    }
  };

  const selectMission = (mission: Mission) => {
    setActiveMission(normalizeMission(mission));
    setUploadResult(null);
    setActionMessage(null);
  };
  const removeWaypoint = (seq: number) => {
    if (!activeMission) return;
    const filtered = activeMission.waypoints?.filter((w) => w.sequence !== seq) ?? [];
    // Re-sequence
    const renumbered = filtered.map((w, i) => ({ ...w, sequence: i + 1 }));
    setActiveMission({ ...activeMission, waypoints: renumbered });
  };

  return (
    <div className="lb-mission">
      {actionMessage && <div role="status" aria-live="polite">{actionMessage}</div>}
      <div className="lb-mission-toolbar">
        <span className="lb-radar-title">
          <Plane size={14} /> Mission planner · {missions.length} mission(s)
        </span>
        <div className="lb-radar-controls">
          <button type="button" className="lb-secondary" onClick={() => void refreshMissions().catch((error) => setActionMessage(`Échec du rafraîchissement: ${error instanceof Error ? error.message : "erreur réseau"}`))} disabled={loading} aria-label="Actualiser les missions" title="Actualiser les missions">
            <RefreshCw size={13} /> Actualiser
          </button>
          <input
            type="text"
            placeholder="Nouvelle mission…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="lb-mission-input"
          />
          <button type="button" className="lb-secondary" onClick={createMission} disabled={loading || !newName.trim()}>
            <Plus size={13} /> Créer
          </button>
        </div>
      </div>

      <div className="lb-mission-grid">
        {/* Map */}
        <div className="lb-mission-map-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} className="lb-map-svg" preserveAspectRatio="xMidYMid meet" onClick={handleMapClick}>
            <rect x={0} y={0} width={W} height={H} fill="#0a1621" />
            {/* Grid */}
            {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((f) => (
              <g key={f}>
                <line x1={f * W} y1={0} x2={f * W} y2={H} stroke="rgba(160,215,222,.06)" />
                <line x1={0} y1={f * H} x2={W} y2={f * H} stroke="rgba(160,215,222,.06)" />
              </g>
            ))}
            {/* Geofence */}
            {geofence?.polygon && geofence.polygon.length >= 3 && (
              <polygon
                points={geofence.polygon.map(([lat, lon]) => `${project(lat, lon).x},${project(lat, lon).y}`).join(" ")}
                fill="rgba(249,127,120,.04)"
                stroke="rgba(249,127,120,.4)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
            )}
            {/* Home */}
            <circle cx={project(homeLat, homeLon).x} cy={project(homeLat, homeLon).y} r={5} fill="#75d7ad" />
            <text x={project(homeLat, homeLon).x + 8} y={project(homeLat, homeLon).y + 4} fill="#75d7ad" fontSize="11" fontFamily="IBM Plex Mono">HOME</text>
            {/* Waypoints */}
            {activeMission?.waypoints?.filter(hasWaypointCoordinates).map((w, i) => {
              const p = project(w.latitude, w.longitude);
              return (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={6} fill="#25d0d9" stroke="white" strokeWidth={0.5} />
                  <text x={p.x + 10} y={p.y + 4} fill="#25d0d9" fontSize="11" fontFamily="IBM Plex Mono">{w.sequence}</text>
                  {i > 0 && (() => {
                    const previousLocated = locatedWaypoints[i - 1];
                    if (!previousLocated) return null;
                    const pp = project(previousLocated.latitude, previousLocated.longitude);
                    return <line x1={pp.x} y1={pp.y} x2={p.x} y2={p.y} stroke="rgba(37,208,217,.4)" strokeWidth={1} strokeDasharray="3 3" />;
                  })()}
                </g>
              );
            })}
            {/* Compass */}
            <text x={W / 2} y={18} fill="rgba(160,215,222,.4)" fontSize="13" fontWeight="bold" textAnchor="middle">N</text>
            <text x={W / 2} y={H - 6} fill="rgba(160,215,222,.4)" fontSize="13" fontWeight="bold" textAnchor="middle">S</text>
          </svg>
          <div className="lb-mission-hint">Cliquez sur la carte pour ajouter des waypoints</div>
        </div>

        {/* Side panel — waypoints list */}
        <div className="lb-mission-side">
          {activeMission ? (
            <>
              <div className="lb-mission-side-head">
                <div>
                  <strong>{activeMission.name}</strong>
                  <small>{activeMission.waypoints?.length ?? 0} waypoints</small>
                </div>
                <button type="button" className="lb-secondary" onClick={() => { setActiveMission(null); setUploadResult(null); }} aria-label="Retour à la liste des missions" title="Retour à la liste">
                  <ArrowLeft size={12} /> Liste
                </button>
              </div>
              <div className="lb-mission-wps">
                {activeMission.waypoints?.map((w, i) => (
                  <div key={i} className="lb-mission-wp">
                    <span className="lb-mission-wp-seq">{w.sequence}</span>
                    <div>
                      <strong>{w.command}</strong>
                      <small>{formatWaypointCoordinate(w.latitude)}, {formatWaypointCoordinate(w.longitude)} · {w.altitude_m == null ? "—" : `${w.altitude_m}m`}</small>
                    </div>
                    <button type="button" className="lb-secondary" onClick={() => removeWaypoint(w.sequence)} aria-label={`Supprimer le waypoint ${w.sequence}`} title="Supprimer le waypoint">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {(activeMission.waypoints?.length ?? 0) === 0 && (
                  <p className="lb-empty-state">Cliquez sur la carte pour ajouter des waypoints.</p>
                )}
              </div>
              {!projectId && <p className="lb-empty-state">Sélectionnez un projet avant tout upload matériel. La sauvegarde locale reste disponible.</p>}
              <div className="lb-mission-actions">
                <button type="button" className="lb-secondary" onClick={saveMission} disabled={loading}>
                  Sauvegarder
                </button>
                <button type="button" className="lb-primary" onClick={uploadMission} disabled={loading || !projectId} title={!projectId ? "Un projet est requis pour l’upload" : "Uploader la mission"}>
                  <Upload size={13} /> Upload vers drone
                </button>
              </div>
              {uploadResult && <div className="lb-mission-upload-result">{uploadResult}</div>}
            </>
          ) : (
            <div>
              <strong>Sélectionnez une mission</strong>
              {missions.length === 0 ? (
                <p className="lb-empty-state">Aucune mission. Créez-en une ci-dessus.</p>
              ) : (
                <div className="lb-mission-list">
                  {missions.map((m: Mission, i: number) => {
                    const mId = String(m.id ?? i);
                    const am = activeMission as Mission | null;
                    const activeId = am != null ? String(am.id ?? "") : "";
                    const isActive = activeId === mId;
                    return (
                      <div key={mId} className={`lb-mission-row ${isActive ? "is-selected" : ""}`}>
                        <button type="button" onClick={() => selectMission(m)}>
                          <strong>{m.name}</strong>
                          <small>{m.waypointsCount} waypoints · {m.uploadedAt ? "uploadée" : "brouillon"}</small>
                        </button>
                        <button type="button" className="lb-secondary" onClick={() => deleteMission(mId)} aria-label={`Supprimer la mission ${m.name}`} title="Supprimer la mission">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
