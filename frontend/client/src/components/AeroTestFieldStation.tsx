import { useEffect, useMemo, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type ReactNode, type SetStateAction } from "react";
import { Activity, Building2, CloudSnow, MapPin, Pause, Play, Plus, RotateCcw, Route, SunMedium, Trash2, TreePine } from "lucide-react";
import type { ConceptConfig, MissionWaypoint, SimulationResult } from "../lib/aeroEngine";
import { droneCatalog, type DroneCatalogDesign } from "../lib/droneCatalog";
import { ParametricDronePreview } from "./ParametricDronePreview";
import { useLanguage } from "../contexts/LanguageContext";
import "./aero-test-field-station.css";

type Environment = "urban" | "sand" | "forest" | "snow";
type LucideIcon = typeof Building2;

type Props = {
  config: ConceptConfig;
  setConfig: Dispatch<SetStateAction<ConceptConfig>>;
  simulation: SimulationResult;
  isRunning: boolean;
  onRunSimulation: (config?: ConceptConfig) => void;
  onOpenBuilder: () => void;
};

const ENVIRONMENT_DEFS: ReadonlyArray<{ id: Environment; label: string; Icon: LucideIcon }> = [
  { id: "urban", label: "Zone urbaine", Icon: Building2 },
  { id: "sand", label: "Sable", Icon: SunMedium },
  { id: "forest", label: "Forêt", Icon: TreePine },
  { id: "snow", label: "Neige", Icon: CloudSnow },
];
const AXIS_TICKS = [0, 25, 50, 75, 100];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const fieldScreenPoint = (point: MissionWaypoint, altitudeLimit: number) => ({
  x: 8 + clamp(point.x, 0, 100) * 0.84,
  y: 42 + (100 - clamp(point.y, 0, 100)) * 0.44 - clamp(point.altitudeM / Math.max(altitudeLimit, 1), 0, 1) * 10,
});

function emptyMissionPlan(config: ConceptConfig) {
  return { operationName: "Itinéraire terrain personnalisé", radiusKm: 1, returnAltitudeM: Math.max(5, Math.min(config.altitudeM || 30, 100)), lostLinkAction: "return" as const, homeX: 50, homeY: 82, waypoints: [] as MissionWaypoint[] };
}

/** SVG decorative layer per environment — small, performant, pointer-events disabled via CSS. */
const ENV_DECOR: Record<Environment, ReactNode> = {
  urban: (
    <svg className="afs-env-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {[[8, 70, 6, 22], [16, 64, 8, 28], [26, 76, 5, 16], [38, 60, 10, 36], [52, 68, 7, 26], [64, 72, 6, 20], [76, 62, 9, 30], [86, 70, 6, 24]].map(([x, yb, w, h], i) => (
        <rect key={`b${i}`} x={x} y={yb - h} width={w} height={h} rx="0.4" className="afs-decor-building" />
      ))}
      <line x1="6" y1="78" x2="94" y2="78" className="afs-decor-street" />
      <line x1="6" y1="86" x2="94" y2="86" className="afs-decor-street" />
    </svg>
  ),
  sand: (
    <svg className="afs-env-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <circle cx="78" cy="20" r="5" className="afs-decor-sun" />
      <path d="M0 62 Q15 50 30 62 T60 62 T100 62 L100 100 L0 100 Z" className="afs-decor-dune" />
      <path d="M0 76 Q22 66 44 76 T88 76 L100 76 L100 100 L0 100 Z" className="afs-decor-dune afs-decor-dune--2" />
      <path d="M0 88 Q26 82 52 88 T100 88 L100 100 L0 100 Z" className="afs-decor-dune afs-decor-dune--3" />
    </svg>
  ),
  forest: (
    <svg className="afs-env-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {[[10, 74], [18, 80], [26, 72], [38, 78], [48, 70], [60, 76], [70, 70], [82, 78], [88, 72], [14, 62], [32, 64], [50, 60], [70, 64], [86, 58]].map(([x, y], i) => (
        <g key={`t${i}`} className="afs-decor-tree" transform={`translate(${x} ${y})`}>
          <rect x="-0.25" y="0" width="0.5" height="2" />
          <polygon points="-1.6,0 1.6,0 0,-4.2" />
        </g>
      ))}
      <line x1="0" y1="88" x2="100" y2="88" className="afs-decor-street" />
    </svg>
  ),
  snow: (
    <svg className="afs-env-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <ellipse cx="20" cy="78" rx="16" ry="4" className="afs-decor-drift" />
      <ellipse cx="60" cy="82" rx="24" ry="5" className="afs-decor-drift" />
      <ellipse cx="90" cy="76" rx="11" ry="3.5" className="afs-decor-drift" />
      {[[10, 18], [26, 30], [42, 14], [58, 26], [74, 18], [88, 32], [22, 42], [54, 48], [78, 50], [36, 22]].map(([x, y], i) => (
        <g key={`f${i}`} className="afs-decor-flake" transform={`translate(${x} ${y})`}>
          <line x1="-1.4" y1="0" x2="1.4" y2="0" />
          <line x1="0" y1="-1.4" x2="0" y2="1.4" />
          <line x1="-1" y1="-1" x2="1" y2="1" />
          <line x1="-1" y1="1" x2="1" y2="-1" />
        </g>
      ))}
    </svg>
  ),
};

function TechnicalGrid({ lang }: { lang: string }) {
  return (
    <svg className="afs-grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: 11 }).map((_, i) => (
        <line key={`gv${i}`} x1={i * 10} y1="0" x2={i * 10} y2="100" className="afs-grid-line" />
      ))}
      {Array.from({ length: 11 }).map((_, i) => (
        <line key={`gh${i}`} x1="0" y1={i * 10} x2="100" y2={i * 10} className="afs-grid-line" />
      ))}
      {AXIS_TICKS.map((tick) => (
        <g key={`tx${tick}`}>
          <line x1={tick} y1="0" x2={tick} y2="2.2" className="afs-grid-tick" />
          <text x={tick} y="-0.8" textAnchor="middle" className="afs-grid-label" lang={lang}>{tick}</text>
        </g>
      ))}
      {AXIS_TICKS.map((tick) => (
        <g key={`ty${tick}`}>
          <line x1="0" y1={tick} x2="2.2" y2={tick} className="afs-grid-tick" />
          <text x="-0.8" y={tick} dy="0.35" textAnchor="end" className="afs-grid-label" lang={lang}>{tick}</text>
        </g>
      ))}
    </svg>
  );
}

export function AeroTestFieldStation({ config, setConfig, simulation, isRunning, onRunSimulation, onOpenBuilder }: Props) {
  const { t, tKey, language } = useLanguage();
  const [routeEditMode, setRouteEditMode] = useState(false);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [environment, setEnvironment] = useState<Environment>("urban");

  const route = config.missionPlan?.waypoints ?? [];
  const selectedWaypoint = route.find((point) => point.id === selectedWaypointId) ?? route[0];
  const hasUserSketch = Boolean(config.customSketch?.strokes.some((stroke) => stroke.tool !== "annotation"));
  const hasActiveUserDesign = Boolean(config.engineeringSelection?.droneId || config.platformProfile || hasUserSketch);
  const droneName = hasActiveUserDesign
    ? config.engineeringSelection?.droneLabel || config.designName || config.platformProfile || t("Drone personnalisé")
    : t("Aucun drone sélectionné");
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
      mission: catalogDesign?.mission ?? config.missionBrief ?? t("Cellule issue de la configuration AeroMind active."),
      specs: catalogDesign?.specs ?? `${config.wingspan.toFixed(1)} m · ${config.fuselageLength.toFixed(1)} m · ${Math.max(1, Math.round(config.motorCount ?? 4))} ${t("moteur(s)")}`,
      disciplines: catalogDesign?.disciplines ?? t("Configuration projet · dimensions · propulsion"),
      tone: catalogDesign?.tone ?? "cyan",
      configuration: { ...(catalogDesign?.configuration ?? {}), ...config },
      role: catalogDesign?.role ?? "civil",
      defenseUse: catalogDesign?.defenseUse ?? t("Visualisation de conception locale."),
      origin: catalogDesign?.origin ?? "aeromind-parametric",
    };
  }, [catalogDesign, config, droneName, hasActiveUserDesign, t]);

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
    return { x: ax.x + (bx.x - ax.x) * mix, y: ax.y + (bx.y - ax.y) * mix, yaw: Math.atan2(bx.y - ax.y, bx.x - ax.x) * 180 / Math.PI, altitudeM: a.altitudeM + (b.altitudeM - a.altitudeM) * mix };
  }, [altitudeLimit, progress, route]);

  useEffect(() => {
    if (!playing) return;
    if (route.length < 2) { setPlaying(false); return; }
    const timer = window.setInterval(() => setProgress((value) => Math.min(1, value + 0.0025)), 50);
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
      id, name: `WP-${String(route.length + 1).padStart(2, "0")}`,
      x: Math.round(clamp(x, 0, 100)), y: Math.round(clamp(y, 0, 100)),
      altitudeM: Math.max(5, Math.round((config.altitudeM || 30) * 0.7)),
      speedKmh: Math.max(5, Math.round(config.cruiseSpeedKmh || 20)), action: "inspection",
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
    addWaypoint((screenX - 8) / 0.84, 100 - (screenY - 42) / 0.44);
  };
  const resetPlayback = () => { setPlaying(false); setProgress(0); };

  const activeEnvDef = ENVIRONMENT_DEFS.find((e) => e.id === environment) ?? ENVIRONMENT_DEFS[0];
  const envLabel = t(activeEnvDef.label);
  const EnvBadgeIcon = activeEnvDef.Icon;

  return (
    <main className={`aero-field-station afs-env--${environment}`}>
      <div className="afs-top-accent" aria-hidden="true" />
      <header className="afs-header">
        <div>
          <span className="afs-eyebrow">{t("AEROMIND / AEROLAB · SITE EXTÉRIEUR")}</span>
          <h2>{t("Terrain d’essais · vol simulé")}</h2>
          <p>{t("Le modèle affiché suit la cellule active et son plan de mission partagé.")}</p>
        </div>
        <div className={`afs-status ${playing ? "is-live" : ""}`}>
          <i />
          {playing ? t("SIMULATION EN COURS") : hasActiveUserDesign ? t("CELLULE ACTIVE") : t("SÉLECTION REQUISE")}
          <small>{t("LOCAL · SORTIE MATÉRIELLE DÉSACTIVÉE")}</small>
        </div>
      </header>

      <div className="afs-toolbar">
        <div className="afs-env-selector" role="group" aria-label={t("Sélecteur d’environnement de test")}>
          {ENVIRONMENT_DEFS.map(({ id, label, Icon }) => (
            <button key={id} type="button" className={`afs-env-btn ${environment === id ? "afs-env-btn--active" : ""}`} onClick={() => setEnvironment(id)} aria-pressed={environment === id} title={t(label)}>
              <Icon size={13} /><span>{t(label)}</span>
            </button>
          ))}
        </div>
        <div className="afs-drone-id">
          <span>{t("DRONE DU PROJET")}</span>
          <strong>{droneName}</strong>
          <small>{activeDesign ? `${activeDesign.modelType} · ${config.airframe ?? activeDesign.key} · ${Math.max(1, Math.round(config.motorCount ?? 1))} ${t("moteur(s)")}` : t("Aucun drone de démonstration ne sera affiché.")}</small>
        </div>
        <button type="button" className="afs-primary" disabled={!hasActiveUserDesign || route.length < 2 || isRunning} onClick={() => { if (playing) setPlaying(false); else { if (progress >= 1) setProgress(0); onRunSimulation(config); setPlaying(true); } }}>
          {playing ? <Pause size={15} /> : <Play size={15} />}{playing ? t("Pause du vol") : isRunning ? t("Calcul…") : t("Lancer le vol simulé")}
        </button>
        <button type="button" disabled={!route.length || isRunning} onClick={() => { setPlaying(false); onRunSimulation(config); }}><Activity size={14} />{t("Analyser")}</button>
        <button type="button" onClick={resetPlayback}><RotateCcw size={14} />{t("Réinitialiser")}</button>
        {!hasActiveUserDesign && <button type="button" className="afs-secondary" onClick={onOpenBuilder}>{t("Choisir / construire un drone")}</button>}
      </div>

      <div className="afs-layout">
        <aside className="afs-side-panel">
          <div className="afs-panel-block">
            <span className="afs-panel-label">{t("ENVIRONNEMENT ACTIF")}</span>
            <div className={`afs-env-badge afs-env-badge--${environment}`}><EnvBadgeIcon size={14} /><strong>{envLabel.toUpperCase()}</strong></div>
          </div>
          <div className="afs-panel-block">
            <span className="afs-panel-label">{t("TÉLÉMÉTRIE LOCALE")}</span>
            <ul className="afs-telemetry">
              <li><span>{t("Altitude")}</span><b>{position ? `${Math.round(position.altitudeM)} m` : "—"}</b></li>
              <li><span>{t("Cap")}</span><b>{position ? `${Math.round(((position.yaw % 360) + 360) % 360)}°` : "—"}</b></li>
              <li><span>{t("Waypoints")}</span><b>{route.length}</b></li>
              <li><span>{t("Avancement")}</span><b>{Math.round(progress * 100)}%</b></li>
              <li><span>{t("Envergure")}</span><b>{config.wingspan.toFixed(1)} m</b></li>
              <li><span>{t("Vitesse croisière")}</span><b>{Math.round(config.cruiseSpeedKmh)} km/h</b></li>
              <li><span>{t("Moteurs")}</span><b>{Math.max(1, Math.round(config.motorCount ?? 1))}</b></li>
            </ul>
          </div>
          {playing && <div className="afs-live-indicator" role="status" aria-live="polite"><i /><span>{t("INDICATEUR TEMPS RÉEL · VOL EN COURS")}</span></div>}
        </aside>

        <section className="afs-scene-card">
          <div className="afs-scene-heading">
            <div><span>{t("CHAMP EXTÉRIEUR · VUE DE TEST")}</span><strong>{config.missionPlan?.operationName || t("Itinéraire local")}</strong></div>
            <span className="afs-ref">{t("REPÈRE LOCAL X/Y/Z · SANS GPS")}</span>
          </div>
          <div className={`afs-field afs-field--${environment} ${routeEditMode ? "is-editing" : ""}`} onClick={handleFieldClick} role="img" aria-label={t("Terrain d’essai extérieur avec trajectoire locale du drone sélectionné")}>
            <div className="afs-field-vignette" />
            {ENV_DECOR[environment]}
            <TechnicalGrid lang={language} />
            <div className="afs-runway-marking" aria-hidden="true"><i /><b>{t("H-01")}</b></div>
            <svg className="afs-route-layer" viewBox="0 0 100 100" preserveAspectRatio="none" shapeRendering="geometricPrecision" aria-label={t("Itinéraire local dessiné sur le terrain")}>
              {screenRoute.length > 1 && (<>
                <polyline className="afs-route-shadow" points={routePath} />
                <polyline className="afs-route-line" points={routePath} />
                {screenRoute.slice(0, -1).map((p, i) => {
                  const next = screenRoute[i + 1];
                  const segLen = Math.hypot(next.x - p.x, next.y - p.y);
                  const ticks = Math.max(1, Math.round(segLen / 5));
                  return Array.from({ length: ticks + 1 }).map((_, k) => {
                    const r = ticks === 0 ? 0 : k / ticks;
                    const x = p.x + (next.x - p.x) * r;
                    const y = p.y + (next.y - p.y) * r;
                    const ang = Math.atan2(next.y - p.y, next.x - p.x) * 180 / Math.PI;
                    return <line key={`tk-${i}-${k}`} className="afs-route-tick" x1={x} y1={y - 0.5} x2={x} y2={y + 0.5} transform={`rotate(${ang} ${x} ${y})`} />;
                  });
                })}
                {position && <polyline className="afs-route-flown" points={`${screenRoute[0].x},${screenRoute[0].y} ${position.x},${position.y}`} />}
              </>)}
              {route.map((point, index) => {
                const plotted = screenRoute[index];
                return (
                  <g className={`afs-waypoint ${selectedWaypoint?.id === point.id ? "is-selected" : ""}`} key={point.id} onClick={(event) => { event.stopPropagation(); setSelectedWaypointId(point.id); }}>
                    <circle className="afs-wp-halo" cx={plotted.x} cy={plotted.y} r="1.4" />
                    <circle className="afs-wp-dot" cx={plotted.x} cy={plotted.y} r="0.55" />
                    <path className="afs-waypoint-cross" d={`M${plotted.x - 1.8},${plotted.y} L${plotted.x + 1.8},${plotted.y} M${plotted.x},${plotted.y - 1.8} L${plotted.x},${plotted.y + 1.8}`} />
                    <text className="afs-waypoint-label" x={plotted.x + 2.1} y={plotted.y - 1.6} lang={language}>{point.name || `WP-${index + 1}`}</text>
                  </g>
                );
              })}
            </svg>
            {activeDesign && position && (
              <div className="afs-aircraft" data-testid="afs-selected-drone" style={{ left: `${position.x}%`, top: `${position.y}%`, transform: `translate(-50%, -50%) rotate(${position.yaw}deg)` }} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} role="img" aria-label={`${droneName}, ${t("en vol simulé à")} ${Math.round(position.altitudeM)} ${t("mètres")}`}>
                <ParametricDronePreview design={activeDesign} zoom={0.72} />
                <span className="afs-aircraft-tag">{droneName} · {Math.round(position.altitudeM)} m</span>
              </div>
            )}
            {!activeDesign && (
              <div className="afs-no-drone">
                <MapPin size={20} /><strong>{t("AUCUN DRONE CHARGÉ")}</strong>
                <span>{t("Sélectionnez votre cellule pour afficher son modèle réel ici. Aucun drone générique n’est substitué.")}</span>
                <button type="button" onClick={(event) => { event.stopPropagation(); onOpenBuilder(); }}>{t("Ouvrir le choix du drone")}</button>
              </div>
            )}
            {routeEditMode && hasActiveUserDesign && <div className="afs-edit-tip">{t("CLIQUEZ SUR LE TERRAIN POUR AJOUTER UN WAYPOINT")}</div>}
            <div className="afs-field-readout">
              <span>{route.length} {t("WP")} · {route.length >= 2 ? t("ROUTE ACTIVE") : t("AJOUTEZ DES POINTS")}</span>
              <span>{t("SIMULATION")} · {simulation.runId}</span>
            </div>
          </div>
          <div className="afs-field-legend">
            <span><i className="afs-legend-plan" /> {t("Plan prévu")}</span>
            <span><i className="afs-legend-flown" /> {t("Parcours simulé")}</span>
            <span><i className="afs-legend-drone" /> {t("Cellule active")}</span>
            <small>{t("Terrain illustratif ; plan local sans coordonnées de vol réelles.")}</small>
          </div>
        </section>

        <aside className="afs-route-card">
          <div className="afs-route-head">
            <div><span>{t("PLAN DE VOL · PROJET ACTIF")}</span><h3>{t("Itinéraire personnalisable")}</h3><small>{route.length} {t("point(s)")} · {config.missionPlan ? t("lié au plan AeroMind") : t("pas encore enregistré")}</small></div>
            <Route size={19} />
          </div>
          <div className="afs-route-actions">
            <button type="button" className={routeEditMode ? "is-active" : ""} disabled={!hasActiveUserDesign} onClick={() => setRouteEditMode((value) => !value)}>{routeEditMode ? t("Terminer le tracé") : t("Tracer sur le terrain")}</button>
            <button type="button" disabled={!hasActiveUserDesign} onClick={addWaypointAtCenter}><Plus size={14} />{t("Point")}</button>
          </div>
          {!hasActiveUserDesign && <p className="afs-empty-note">{t("Choisissez d’abord un drone dans AeroMind pour créer son itinéraire de test.")}</p>}
          {routeEditMode && hasActiveUserDesign && <p className="afs-instruction">{t("Mode tracé actif : cliquez dans le terrain pour placer des points. Les coordonnées restent locales (X/Y en %), sans GPS.")}</p>}
          <ol className="afs-waypoint-list">
            {route.map((point, index) => (
              <li key={point.id} className={selectedWaypoint?.id === point.id ? "is-selected" : ""}>
                <button type="button" className="afs-wp-select" onClick={() => setSelectedWaypointId(point.id)}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <span>{point.name || `WP-${index + 1}`}<small>X {point.x}% · Y {point.y}% · {point.altitudeM} m</small></span>
                </button>
                <button type="button" className="afs-wp-delete" aria-label={`${t("Supprimer")} ${point.name || `waypoint ${index + 1}`}`} onClick={() => deleteWaypoint(point.id)}><Trash2 size={13} /></button>
              </li>
            ))}
          </ol>
          {selectedWaypoint && (
            <div className="afs-wp-editor">
              <strong>{t("ÉDITER LE POINT SÉLECTIONNÉ")}</strong>
              <label>{t("Nom")}<input value={selectedWaypoint.name} onChange={(event) => updateWaypoint({ name: event.target.value })} /></label>
              <div>
                <label>{t("X")} · %<input type="number" min="0" max="100" value={selectedWaypoint.x} onChange={(event) => updateWaypoint({ x: clamp(Number(event.target.value), 0, 100) })} /></label>
                <label>{t("Y")} · %<input type="number" min="0" max="100" value={selectedWaypoint.y} onChange={(event) => updateWaypoint({ y: clamp(Number(event.target.value), 0, 100) })} /></label>
              </div>
              <div>
                <label>{t("Altitude")} · m<input type="number" min="0" max="6000" step="5" value={selectedWaypoint.altitudeM} onChange={(event) => updateWaypoint({ altitudeM: clamp(Number(event.target.value), 0, 6000) })} /></label>
                <label>{t("Vitesse")} · km/h<input type="number" min="0" max="300" value={selectedWaypoint.speedKmh} onChange={(event) => updateWaypoint({ speedKmh: clamp(Number(event.target.value), 0, 300) })} /></label>
              </div>
            </div>
          )}
          <div className="afs-route-footer"><span><i />{t("ITINÉRAIRE PARTAGÉ AVEC LE PROJET")}</span><small>{t("Les modifications du plan sont enregistrées localement.")}</small></div>
        </aside>

        <section className="afs-bottom-bar">
          <div className="afs-progress-block"><span>{t("AVANCEMENT DU VOL SIMULÉ")}</span><b>{Math.round(progress * 100)}%</b></div>
          <input aria-label={t("Progression de l’itinéraire simulé")} type="range" min="0" max="1000" value={Math.round(progress * 1000)} onChange={(event) => { setPlaying(false); setProgress(Number(event.target.value) / 1000); }} disabled={route.length < 2} />
          <div className="afs-bottom-meta">
            <span>{activeDesign ? `${droneName} · ${activeDesign.modelType}` : t("Cellule en attente")}</span>
            <span>{position ? `${t("ALT")} ${Math.round(position.altitudeM)} m · ${route.length} ${t("waypoint(s)")}` : t("Sélection et route requises")}</span>
          </div>
          <div className="afs-footer-strip" role="contentinfo">
            <span><b>{t("SIMULATION RUN ID")}</b><i>{simulation.runId}</i></span>
            <span><b>{t("ENV")}</b><i>{envLabel}</i></span>
            <span><b>{t("WP")}</b><i>{route.length}</i></span>
            <span><b>{t("TÉLÉMÉTRIE")}</b><i>{t("OK · LOCAL")}</i></span>
          </div>
        </section>
      </div>
      <p className="afs-safety-note">{t("Aperçu de conception AeroMind uniquement : scène visuelle et valeurs calculées par modèle. Ce n’est ni une image réelle d’essai, ni une mesure physique, ni une commande de drone.")}</p>
    </main>
  );
}
