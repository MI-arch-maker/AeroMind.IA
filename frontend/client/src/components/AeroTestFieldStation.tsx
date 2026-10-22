import { useEffect, useMemo, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from "react";
import { Activity, MapPin, Pause, Play, Plus, RotateCcw, Route, Trash2 } from "lucide-react";
import type { ConceptConfig, MissionWaypoint, SimulationResult } from "../lib/aeroEngine";
import { droneCatalog, type DroneCatalogDesign } from "../lib/droneCatalog";
import { ParametricDronePreview } from "./ParametricDronePreview";
import "./aero-test-field-station.css";

type Props = {
  config: ConceptConfig;
  setConfig: Dispatch<SetStateAction<ConceptConfig>>;
  simulation: SimulationResult;
  isRunning: boolean;
  onRunSimulation: (config?: ConceptConfig) => void;
  onOpenBuilder: () => void;
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const fieldScreenPoint = (point: MissionWaypoint, altitudeLimit: number) => ({
  x: 8 + clamp(point.x, 0, 100) * 0.84,
  y: 42 + (100 - clamp(point.y, 0, 100)) * 0.44 - clamp(point.altitudeM / Math.max(altitudeLimit, 1), 0, 1) * 10,
});
function emptyMissionPlan(config: ConceptConfig) {
  return {
    operationName: "Itinéraire terrain personnalisé",
    radiusKm: 1,
    returnAltitudeM: Math.max(5, Math.min(config.altitudeM || 30, 100)),
    lostLinkAction: "return" as const,
    homeX: 50,
    homeY: 82,
    waypoints: [] as MissionWaypoint[],
  };
}
export function AeroTestFieldStation({ config, setConfig, simulation, isRunning, onRunSimulation, onOpenBuilder }: Props) {
  const [routeEditMode, setRouteEditMode] = useState(false);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const route = config.missionPlan?.waypoints ?? [];
  const selectedWaypoint = route.find((point) => point.id === selectedWaypointId) ?? route[0];
  const hasUserSketch = Boolean(config.customSketch?.strokes.some((stroke) => stroke.tool !== "annotation"));
  const hasActiveUserDesign = Boolean(config.engineeringSelection?.droneId || config.platformProfile || hasUserSketch);
  const droneName = hasActiveUserDesign
    ? config.engineeringSelection?.droneLabel || config.designName || config.platformProfile || "Drone personnalisé"
    : "Aucun drone sélectionné";
  const catalogDesign = droneCatalog.find((item) => item.id === config.engineeringSelection?.droneId || item.id === config.platformProfile);
  const activeDesign = useMemo<DroneCatalogDesign | undefined>(() => {
    if (!hasActiveUserDesign || (!config.airframe && !config.modelType && !catalogDesign)) return undefined;
    const fallbackKey = config.airframe ?? catalogDesign?.key ?? "quadcopter";
    const modelType = config.modelType ?? catalogDesign?.modelType ?? (fallbackKey === "fixed-wing" ? "voilure-conventionnelle" : fallbackKey === "vtol" ? "tiltrotor" : "multirotor");
    return {
      ...(catalogDesign ?? {}),
      key: fallbackKey,
      modelType,
      id: config.engineeringSelection?.droneId ?? catalogDesign?.id ?? config.platformProfile ?? "user-drone",
      label: droneName,
      family: catalogDesign?.family ?? String(modelType),
      mission: catalogDesign?.mission ?? config.missionBrief ?? "Cellule issue de la configuration AeroMind active.",
      specs: catalogDesign?.specs ?? `${config.wingspan.toFixed(1)} m · ${config.fuselageLength.toFixed(1)} m · ${Math.max(1, Math.round(config.motorCount ?? 4))} moteur(s)`,
      disciplines: catalogDesign?.disciplines ?? "Configuration projet · dimensions · propulsion",
      tone: catalogDesign?.tone ?? "cyan",
      configuration: { ...(catalogDesign?.configuration ?? {}), ...config },
      role: catalogDesign?.role ?? "civil",
      defenseUse: catalogDesign?.defenseUse ?? "Visualisation de conception locale.",
      origin: catalogDesign?.origin ?? "aeromind-parametric",
    };
  }, [catalogDesign, config, droneName, hasActiveUserDesign]);
  const altitudeLimit = Math.max(1, config.altitudeM || 100, ...route.map((point) => point.altitudeM));
  const screenRoute = route.map((point) => fieldScreenPoint(point, altitudeLimit));
  const routePath = screenRoute.map((point) => `${point.x},${point.y}`).join(" ");
  const position = useMemo(() => {
    if (!route.length) return null;
    if (route.length === 1) return { ...fieldScreenPoint(route[0], altitudeLimit), yaw: 0, altitudeM: route[0].altitudeM };
    const scaled = clamp(progress, 0, 1) * (route.length - 1);
    const index = Math.min(Math.floor(scaled), route.length - 2);
    const mix = scaled - index;
    const a = route[index];
    const b = route[index + 1];
    const ax = fieldScreenPoint(a, altitudeLimit);
    const bx = fieldScreenPoint(b, altitudeLimit);
    return {
      x: ax.x + (bx.x - ax.x) * mix,
      y: ax.y + (bx.y - ax.y) * mix,
      yaw: Math.atan2(bx.y - ax.y, bx.x - ax.x) * 180 / Math.PI,
      altitudeM: a.altitudeM + (b.altitudeM - a.altitudeM) * mix,
    };
  }, [altitudeLimit, progress, route]);
  useEffect(() => {
    if (!playing) return;
    if (route.length < 2) { setPlaying(false); return; }
    const timer = window.setInterval(() => setProgress((value) => {
      return Math.min(1, value + 0.0025);
    }), 50);
    return () => window.clearInterval(timer);
  }, [playing, route.length]);
  useEffect(() => { setProgress(0); setPlaying(false); }, [config.engineeringSelection?.droneId, config.designName]);
  const updateRoute = (updater: (points: MissionWaypoint[]) => MissionWaypoint[]) => {
    setConfig((current) => {
      const plan = current.missionPlan ?? emptyMissionPlan(current);
      return { ...current, missionPlan: { ...plan, waypoints: updater(plan.waypoints) } };
    });
    setProgress(0);
    setPlaying(false);
  };
  const addWaypoint = (x: number, y: number) => {
    if (!hasActiveUserDesign) return;
    const id = `LOCAL-WP-${Date.now()}`;
    const point: MissionWaypoint = {
      id,
      name: `WP-${String(route.length + 1).padStart(2, "0")}`,
      x: Math.round(clamp(x, 0, 100)),
      y: Math.round(clamp(y, 0, 100)),
      altitudeM: Math.max(5, Math.round((config.altitudeM || 30) * 0.7)),
      speedKmh: Math.max(5, Math.round(config.cruiseSpeedKmh || 20)),
      action: "inspection",
    };
    updateRoute((points) => [...points, point]);
    setSelectedWaypointId(id);
  };
  const addWaypointAtCenter = () => addWaypoint(route.length ? (route[route.length - 1].x + 50) / 2 : 50, route.length ? (route[route.length - 1].y + 50) / 2 : 50);
  const updateWaypoint = (patch: Partial<MissionWaypoint>) => {
    if (!selectedWaypoint) return;
    updateRoute((points) => points.map((point) => point.id === selectedWaypoint.id ? { ...point, ...patch } : point));
  };
  const deleteWaypoint = (id: string) => {
    updateRoute((points) => points.filter((point) => point.id !== id));
    setSelectedWaypointId(route.find((point) => point.id !== id)?.id ?? null);
  };
  useEffect(() => { if (playing && progress >= 1) setPlaying(false); }, [playing, progress]);
  const handleFieldClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!routeEditMode || !hasActiveUserDesign) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) / rect.width * 100;
    const screenY = (event.clientY - rect.top) / rect.height * 100;
    const x = (screenX - 8) / 0.84;
    const y = 100 - (screenY - 42) / 0.44;
    addWaypoint(x, y);
  };
  const resetPlayback = () => { setPlaying(false); setProgress(0); };

  return <main className="aero-field-station">
    <header className="afs-header">
      <div><span className="afs-eyebrow">AEROMIND / AEROLAB · SITE EXTÉRIEUR</span><h2>Terrain d’essais · vol simulé</h2><p>Le modèle affiché suit la cellule active et son plan de mission partagé.</p></div>
      <div className={`afs-status ${playing ? "is-live" : ""}`}><i />{playing ? "SIMULATION EN COURS" : hasActiveUserDesign ? "CELLULE ACTIVE" : "SÉLECTION REQUISE"}<small>LOCAL · SORTIE MATÉRIELLE DÉSACTIVÉE</small></div>
    </header>
    <div className="afs-toolbar">
      <div className="afs-drone-id"><span>DRONE DU PROJET</span><strong>{droneName}</strong><small>{activeDesign ? `${activeDesign.modelType} · ${config.airframe ?? activeDesign.key} · ${Math.max(1, Math.round(config.motorCount ?? 1))} moteur(s)` : "Aucun drone de démonstration ne sera affiché."}</small></div>
      <button type="button" className="afs-primary" disabled={!hasActiveUserDesign || route.length < 2 || isRunning} onClick={() => { if (playing) setPlaying(false); else { if (progress >= 1) setProgress(0); onRunSimulation(config); setPlaying(true); } }}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? "Pause du vol" : isRunning ? "Calcul…" : "Lancer le vol simulé"}</button>
      <button type="button" disabled={!route.length || isRunning} onClick={() => { setPlaying(false); onRunSimulation(config); }}><Activity size={14} />Analyser</button>
      <button type="button" onClick={resetPlayback}><RotateCcw size={14} />Réinitialiser</button>
      {!hasActiveUserDesign && <button type="button" className="afs-secondary" onClick={onOpenBuilder}>Choisir / construire un drone</button>}
    </div>
    <div className="afs-layout">
      <section className="afs-scene-card">
        <div className="afs-scene-heading"><div><span>CHAMP EXTÉRIEUR · VUE DE TEST</span><strong>{config.missionPlan?.operationName || "Itinéraire local"}</strong></div><span className="afs-ref">REPÈRE LOCAL X/Y/Z · SANS GPS</span></div>
        <div className={`afs-field ${routeEditMode ? "is-editing" : ""}`} onClick={handleFieldClick} role="img" aria-label="Terrain d’essai extérieur avec trajectoire locale du drone sélectionné">
          <div className="afs-field-vignette" />
          <div className="afs-runway-marking" aria-hidden="true"><i /><b>H-01</b></div>
          <svg className="afs-route-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Itinéraire local dessiné sur le terrain">
            {screenRoute.length > 1 && <><polyline className="afs-route-shadow" points={routePath} /><polyline className="afs-route-line" points={routePath} />{position && <polyline className="afs-route-flown" points={`${screenRoute[0].x},${screenRoute[0].y} ${position.x},${position.y}`} />}</>}
            {route.map((point, index) => { const plotted = screenRoute[index]; return <g className={`afs-waypoint ${selectedWaypoint?.id === point.id ? "is-selected" : ""}`} key={point.id} onClick={(event) => { event.stopPropagation(); setSelectedWaypointId(point.id); }}><circle className="afs-wp-halo" cx={plotted.x} cy={plotted.y} r="2.3" /><circle className="afs-wp-dot" cx={plotted.x} cy={plotted.y} r="1.1" /><text x={plotted.x + 2} y={plotted.y - 2}>{point.name || `WP-${index + 1}`}</text></g>; })}
          </svg>
          {activeDesign && position && <div className="afs-aircraft" data-testid="afs-selected-drone" style={{ left: `${position.x}%`, top: `${position.y}%`, transform: `translate(-50%, -50%) rotate(${position.yaw}deg)` }} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} role="img" aria-label={`${droneName}, en vol simulé à ${Math.round(position.altitudeM)} mètres`}><ParametricDronePreview design={activeDesign} zoom={0.72} /><span className="afs-aircraft-tag">{droneName} · {Math.round(position.altitudeM)} m</span></div>}
          {!activeDesign && <div className="afs-no-drone"><MapPin size={20} /><strong>AUCUN DRONE CHARGÉ</strong><span>Sélectionnez votre cellule pour afficher son modèle réel ici. Aucun drone générique n’est substitué.</span><button type="button" onClick={(event) => { event.stopPropagation(); onOpenBuilder(); }}>Ouvrir le choix du drone</button></div>}
          {routeEditMode && hasActiveUserDesign && <div className="afs-edit-tip">CLIQUEZ SUR LE TERRAIN POUR AJOUTER UN WAYPOINT</div>}
          <div className="afs-field-readout"><span>{route.length} WP · {route.length >= 2 ? "ROUTE ACTIVE" : "AJOUTEZ DES POINTS"}</span><span>SIMULATION · {simulation.runId}</span></div>
        </div>
        <div className="afs-field-legend"><span><i className="afs-legend-plan" /> Plan prévu</span><span><i className="afs-legend-flown" /> Parcours simulé</span><span><i className="afs-legend-drone" /> Cellule active</span><small>Terrain illustratif ; plan local sans coordonnées de vol réelles.</small></div>
      </section>
      <aside className="afs-route-card">
        <div className="afs-route-head"><div><span>PLAN DE VOL · PROJET ACTIF</span><h3>Itinéraire personnalisable</h3><small>{route.length} point(s) · {config.missionPlan ? "lié au plan AeroMind" : "pas encore enregistré"}</small></div><Route size={19} /></div>
        <div className="afs-route-actions"><button type="button" className={routeEditMode ? "is-active" : ""} disabled={!hasActiveUserDesign} onClick={() => setRouteEditMode((value) => !value)}>{routeEditMode ? "Terminer le tracé" : "Tracer sur le terrain"}</button><button type="button" disabled={!hasActiveUserDesign} onClick={addWaypointAtCenter}><Plus size={14} />Point</button></div>
        {!hasActiveUserDesign && <p className="afs-empty-note">Choisissez d’abord un drone dans AeroMind pour créer son itinéraire de test.</p>}
        {routeEditMode && hasActiveUserDesign && <p className="afs-instruction">Mode tracé actif : cliquez dans le terrain pour placer des points. Les coordonnées restent locales (X/Y en %), sans GPS.</p>}
        <ol className="afs-waypoint-list">{route.map((point, index) => <li key={point.id} className={selectedWaypoint?.id === point.id ? "is-selected" : ""}><button type="button" className="afs-wp-select" onClick={() => setSelectedWaypointId(point.id)}><b>{String(index + 1).padStart(2, "0")}</b><span>{point.name || `WP-${index + 1}`}<small>X {point.x}% · Y {point.y}% · {point.altitudeM} m</small></span></button><button type="button" className="afs-wp-delete" aria-label={`Supprimer ${point.name || `waypoint ${index + 1}`}`} onClick={() => deleteWaypoint(point.id)}><Trash2 size={13} /></button></li>)}</ol>
        {selectedWaypoint && <div className="afs-wp-editor"><strong>ÉDITER LE POINT SÉLECTIONNÉ</strong><label>Nom<input value={selectedWaypoint.name} onChange={(event) => updateWaypoint({ name: event.target.value })} /></label><div><label>X · %<input type="number" min="0" max="100" value={selectedWaypoint.x} onChange={(event) => updateWaypoint({ x: clamp(Number(event.target.value), 0, 100) })} /></label><label>Y · %<input type="number" min="0" max="100" value={selectedWaypoint.y} onChange={(event) => updateWaypoint({ y: clamp(Number(event.target.value), 0, 100) })} /></label></div><div><label>Altitude · m<input type="number" min="0" max="6000" step="5" value={selectedWaypoint.altitudeM} onChange={(event) => updateWaypoint({ altitudeM: clamp(Number(event.target.value), 0, 6000) })} /></label><label>Vitesse · km/h<input type="number" min="0" max="300" value={selectedWaypoint.speedKmh} onChange={(event) => updateWaypoint({ speedKmh: clamp(Number(event.target.value), 0, 300) })} /></label></div></div>}
        <div className="afs-route-footer"><span><i />ITINÉRAIRE PARTAGÉ AVEC LE PROJET</span><small>Les modifications du plan sont enregistrées localement.</small></div>
      </aside>
      <section className="afs-bottom-bar"><div><span>AVANCEMENT DU VOL SIMULÉ</span><b>{Math.round(progress * 100)}%</b></div><input aria-label="Progression de l’itinéraire simulé" type="range" min="0" max="1000" value={Math.round(progress * 1000)} onChange={(event) => { setPlaying(false); setProgress(Number(event.target.value) / 1000); }} disabled={route.length < 2} /><div className="afs-bottom-meta"><span>{activeDesign ? `${droneName} · ${activeDesign.modelType}` : "Cellule en attente"}</span><span>{position ? `ALT ${Math.round(position.altitudeM)} m · ${route.length} waypoint(s)` : "Sélection et route requises"}</span></div></section>
    </div>
    <p className="afs-safety-note">Aperçu de conception AeroMind uniquement : scène visuelle et valeurs calculées par modèle. Ce n’est ni une image réelle d’essai, ni une mesure physique, ni une commande de drone.</p>
  </main>;
}
