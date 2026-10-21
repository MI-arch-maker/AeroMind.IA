import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowLeft, BatteryCharging, CircleDot, Compass, Gauge, History, Layers3, Pause, Play, Radio, RotateCcw, Route, ShieldCheck, Sparkles, Target, Wind, Zap } from "lucide-react";
import type { ConceptConfig, SimulationResult } from "../lib/aeroEngine";
import type { WorkflowRun } from "../lib/integratedWorkflow";
import { estimateFlightTestBatteryPercent, hasSynchronizedMissionRoute, projectFlightTestPoint } from "../lib/flightTestSync";
import "./virtual-flight-test-hall.css";

type Props = { config: ConceptConfig; setConfig: (config: ConceptConfig) => void; simulation: SimulationResult; requirements: unknown[]; workflowRun?: WorkflowRun | null; onOpenBuilder: () => void; viewMode?: "panoramic" | "spatial" };
type ScenarioId = "hover" | "route" | "obstacles" | "return";
type Point = { x: number; y: number; altitudeM: number; speedKmh: number; name: string };
const scenarios: Array<{ id: ScenarioId; label: string; detail: string; duration: number }> = [
  { id: "hover", label: "Vol stationnaire", detail: "Maintien positionnel et stabilisation synthétiques", duration: 90 },
  { id: "route", label: "Trajectoire active", detail: "Suivi du plan mission ou route de démonstration", duration: 150 },
  { id: "obstacles", label: "Obstacles virtuels", detail: "Évaluation de proximité dans des volumes dessinés", duration: 180 },
  { id: "return", label: "Retour au point de départ", detail: "Séquence de retour et atterrissage simulée", duration: 120 },
];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const fallbackOffsets: Record<ScenarioId, Array<[number, number]>> = {
  hover: [[0, 0], [2, -1], [0, 0], [-2, -1], [0, 0]],
  route: [[-32, 18], [-16, 5], [1, -4], [18, -15], [36, -23]],
  obstacles: [[-32, 18], [-18, 2], [-5, 14], [10, -8], [24, 6], [38, -18]],
  return: [[-32, 18], [-14, 9], [5, -2], [21, -12], [36, -23]],
};
const bearing = (from: Point, to: Point) => (Math.atan2(to.x - from.x, from.y - to.y) * 180 / Math.PI + 360) % 360;

export function VirtualFlightTestHall({ config, simulation, requirements, workflowRun, onOpenBuilder, viewMode = "spatial" }: Props) {
  const [scenario, setScenario] = useState<ScenarioId>("route");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [initialX, setInitialX] = useState(50);
  const [initialY, setInitialY] = useState(58);
  const [headingOffset, setHeadingOffset] = useState(0);
  const [runs, setRuns] = useState(0);
  const [showExpected, setShowExpected] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const hasUserSketch = Boolean(config.customSketch?.strokes.some(stroke => stroke.tool !== "annotation"));
  const hasActiveUserDesign = Boolean(config.engineeringSelection?.droneId || config.platformProfile || hasUserSketch);
  const current = scenarios.find(item => item.id === scenario) ?? scenarios[0];
  useEffect(() => {
    setPlaying(false);
    setTime(0);
    setRuns(0);
  }, [config, simulation.runId]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setTime(value => Math.min(current.duration, value + 1)), 80);
    return () => window.clearInterval(timer);
  }, [playing, current.duration]);
  useEffect(() => { if (playing && time >= current.duration) setPlaying(false); }, [playing, time, current.duration]);

  const activeRoute = useMemo<Point[]>(() => {
    if (!hasActiveUserDesign) return [];
    const mission = config.missionPlan?.waypoints ?? [];
    if (hasSynchronizedMissionRoute(mission)) return mission.map((point, index) => ({
      x: clamp(point.x, 0, 100),
      y: clamp(point.y, 0, 100),
      altitudeM: point.altitudeM,
      speedKmh: point.speedKmh || config.cruiseSpeedKmh,
      name: point.name || `WP-${String(index + 1).padStart(2, "0")}`,
    }));
    return fallbackOffsets[scenario].map(([dx, dy], index) => ({
      x: clamp(initialX + dx, 5, 95), y: clamp(initialY + dy, 8, 92),
      altitudeM: config.altitudeM * (0.75 + index / Math.max(1, fallbackOffsets[scenario].length - 1) * 0.22),
      speedKmh: config.cruiseSpeedKmh, name: `WP-${String(index + 1).padStart(2, "0")}`,
    }));
  }, [hasActiveUserDesign, config.missionPlan?.waypoints, config.cruiseSpeedKmh, config.altitudeM, initialX, initialY, scenario]);
  const playbackRoute = scenario === "return" ? [...activeRoute].reverse() : activeRoute;
  const phase = clamp(time / current.duration, 0, 1);
  const routePosition = phase * Math.max(0, playbackRoute.length - 1);
  const routeIndex = Math.min(Math.floor(routePosition), Math.max(0, playbackRoute.length - 2));
  const routeBlend = playbackRoute.length > 1 ? routePosition - routeIndex : 0;
  const neutralPoint: Point = { x: initialX, y: initialY, altitudeM: config.altitudeM, speedKmh: config.cruiseSpeedKmh, name: "—" };
  const from = playbackRoute[routeIndex] ?? playbackRoute[0] ?? neutralPoint;
  const to = playbackRoute[Math.min(routeIndex + 1, playbackRoute.length - 1)] ?? from;
  const isHover = scenario === "hover";
  const droneX = isHover ? clamp(initialX + Math.sin(time / 8) * 2.2, 5, 95) : from.x + (to.x - from.x) * routeBlend;
  const droneY = isHover ? clamp(initialY + Math.cos(time / 10) * 1.4, 5, 95) : from.y + (to.y - from.y) * routeBlend;
  const currentAltitude = isHover ? config.altitudeM * (0.68 + Math.sin(time / 11) * 0.03) : from.altitudeM + (to.altitudeM - from.altitudeM) * routeBlend;
  const cruiseSpeed = to.speedKmh || config.cruiseSpeedKmh;
  const speed = Math.round(cruiseSpeed * (isHover ? 0.18 : 0.72 + Math.sin(time / 10) * 0.05));
  const yaw = bearing(from, to) + headingOffset;
  const battery = estimateFlightTestBatteryPercent(simulation.energyUsableWh, config.batteryWh, phase);
  const obstacles = [{ x: 40, y: 36 }, { x: 58, y: 49 }, { x: 71, y: 30 }];
  const clearance = Math.min(...obstacles.map(point => Math.hypot(droneX - point.x, droneY - point.y)));
  const obstacleAlert = scenario === "obstacles" && clearance < 8;
  const simulationAlert = simulation.metrics.some(metric => metric.status === "fail") || simulation.risks.some(risk => risk.status === "open" && risk.severity === "high");
  const anomaly = obstacleAlert || simulationAlert;
  const activeModelType = String(config.modelType ?? "").toLowerCase();
  const isWinged = config.airframe === "fixed-wing" || config.airframe === "vtol" || ["aile", "wing", "planeur", "canard", "tandem", "blended", "vtol", "tilt"].some(token => activeModelType.includes(token));
  const isVtol = config.airframe === "vtol" || activeModelType.includes("vtol") || activeModelType.includes("tiltrotor") || activeModelType.includes("tilt-wing");
  const motorCount = clamp(Math.round(config.motorCount || 4), 1, 12);
  const droneName = hasActiveUserDesign ? config.engineeringSelection?.droneLabel || config.platformProfile || config.designName || "Esquisse personnalisée" : "Aucune cellule sélectionnée";
  const hasSynchronizedMission = hasSynchronizedMissionRoute(config.missionPlan?.waypoints);
  const activeScenarioLabel = !hasActiveUserDesign ? "EN ATTENTE D’UNE SÉLECTION" : hasSynchronizedMission ? "PLAN MISSION SYNCHRONISÉ" : "TRAJECTOIRE DE TEST SYNTHÉTIQUE";
  const launch = () => { if (!hasActiveUserDesign) return; setTime(0); setPlaying(true); setRuns(value => value + 1); };
  const reset = () => { setPlaying(false); setTime(0); };
  const chooseScenario = (id: ScenarioId) => { setScenario(id); setTime(0); setPlaying(false); };
  const altitudeExtentM = Math.max(1, ...[config.altitudeM, currentAltitude, ...playbackRoute.map(point => point.altitudeM), ...(!hasActiveUserDesign ? [120] : [])].filter(Number.isFinite));
  const projectToSpace = (point: Point) => projectFlightTestPoint(point, altitudeExtentM);
  const spaceRouteSource: Point[] = hasActiveUserDesign ? (isHover ? [{ x: initialX, y: initialY, altitudeM: config.altitudeM * 0.68, speedKmh: config.cruiseSpeedKmh, name: "HOLD" }] : playbackRoute) : [
    { x: 10, y: 76, altitudeM: 12, speedKmh: 0, name: "DÉMO-01" },
    { x: 27, y: 62, altitudeM: 42, speedKmh: 0, name: "DÉMO-02" },
    { x: 49, y: 55, altitudeM: 76, speedKmh: 0, name: "DÉMO-03" },
    { x: 70, y: 34, altitudeM: 63, speedKmh: 0, name: "DÉMO-04" },
    { x: 88, y: 22, altitudeM: 28, speedKmh: 0, name: "DÉMO-05" },
  ];
  const spaceRoute = spaceRouteSource.map(point => ({ ...projectToSpace(point), name: point.name }));
  const spaceObstacles = obstacles.map(point => projectToSpace({ ...point, altitudeM: 0, speedKmh: 0, name: "Obstacle" }));
  const spaceDrone = projectToSpace({ x: hasActiveUserDesign ? droneX : 49, y: hasActiveUserDesign ? droneY : 55, altitudeM: hasActiveUserDesign ? currentAltitude : 76, speedKmh: speed, name: "CELLULE" });
  const flownSpaceRoute = hasActiveUserDesign
    ? [...spaceRoute.slice(0, isHover ? 1 : routeIndex + 1), spaceDrone].map(point => `${point.x},${point.y}`).join(" ")
    : spaceRoute.slice(0, 3).map(point => `${point.x},${point.y}`).join(" ");

  return <div className={`vfth-shell vfth-pro vfth-${viewMode}`} data-view-mode={viewMode} data-workflow-run={workflowRun?.id ?? "none"}>
    <header className="vfth-hero">
      <div><p className="vfth-kicker"><span /> AEROMIND / LABORATOIRE D’ESSAIS</p><h2>{viewMode === "panoramic" ? "Laboratoire panoramique · simulation" : "Laboratoire spatial · essais en temps réel"}</h2><p>{viewMode === "panoramic" ? "Vue grand angle du volume d’essai, lecture des trajectoires et analyse synchronisée des performances du modèle." : "Environnement orbital instrumenté : suivi XYZ, volumes de référence et télémétrie de scénario en temps réel simulé."} Simulation uniquement, sans liaison à un aéronef réel.</p></div>
      <div className="vfth-badges"><span><i /> BANC VIRTUEL OPÉRATIONNEL</span><strong>SIMULATION · NIVEAU N2</strong><small>Trajectoires et télémétrie synthétiques · aucun actionneur réel</small></div>
    </header>
    <div className="vfth-command">
      <div className="vfth-status"><span className={playing ? "live" : ""} /> TEST {playing ? "EN EXÉCUTION" : !hasActiveUserDesign ? "CELLULE REQUISE" : time >= current.duration ? "TERMINÉ" : "EN ATTENTE"}<small>{hasActiveUserDesign ? `${droneName} · ${config.airframe || "architecture à définir"} · ${motorCount} moteur(s)` : "Aucun modèle ni dessin de démonstration chargé"}</small></div>
      <button className="vfth-primary" disabled={!hasActiveUserDesign} onClick={playing ? () => setPlaying(false) : launch}>{playing ? <Pause size={15} /> : <Play size={15} />} {playing ? "Suspendre" : "Lancer l’essai"}</button>
      <button onClick={reset}><RotateCcw size={14} /> Réinitialiser</button>
      <button onClick={onOpenBuilder}><ArrowLeft size={14} /> Mission Control</button>
    </div>

    <div className="vfth-live-strip"><span><CircleDot size={13} /> {activeScenarioLabel}</span><span><Activity size={13} /> PUISSANCE <b>{hasActiveUserDesign ? `${simulation.estimatedPowerW.toFixed(0)} W` : "—"}</b></span><span><Gauge size={13} /> AUTONOMIE <b>{hasActiveUserDesign ? `${simulation.enduranceH.toFixed(2)} h` : "—"}</b></span><span><Route size={13} /> PORTÉE <b>{hasActiveUserDesign ? `${simulation.rangeKm.toFixed(1)} km` : "—"}</b></span><span><Layers3 size={13} /> {requirements.length} exigence(s) projet</span></div>

    <div className="vfth-layout">
      <section className="vfth-panel vfth-hangar">
        <div className="vfth-panel-head"><div><span className="vfth-index">A / CELLULE LABORATOIRE · {droneName.toUpperCase()}</span><h3>Chambre d’essai · trajectoire supervisée</h3></div><span className="vfth-chip">T+{String(time).padStart(3, "0")}s / {current.duration}s</span></div>
        <div className="vfth-scene vfth-space-scene vfth-lab-scene" data-model={isWinged ? (isVtol ? "vtol" : "wing") : "multirotor"}>
          <div className="vfth-scene-topline"><span><i /> {viewMode === "panoramic" ? "PANORAMA L-03 · LABORATOIRE DE SIMULATION" : "CELLULE SPATIALE L-03 · BANC D’ESSAI"}</span><span>{viewMode === "panoramic" ? "VUE LARGE · TRAJECTOIRE · ANALYSE" : "REPÈRE XYZ · TÉLÉMÉTRIE · SCÉNARIOS"}</span></div>
          <div className="vfth-lab-structure" aria-hidden="true"><div className="vfth-lab-ceiling"><i/><i/><i/><i/><span>PORTIQUE XYZ · SUIVI OPTIQUE MULTICAMÉRA</span></div><div className="vfth-lab-cage"><i className="rail-top"/><i className="rail-left"/><i className="rail-right"/><i className="rail-back"/><span>VOLUME DE CAPTURE · FILET DE SÉCURITÉ</span></div><div className="vfth-lab-pad"><b>H-01</b><span>ZONE DE VOL</span></div><div className="vfth-lab-sensor vfth-lab-sensor-left"><i/><i/><i/><small>ANÉMOMÈTRE</small></div><div className="vfth-lab-sensor vfth-lab-sensor-right"><i/><i/><i/><small>CAM 04 · IR</small></div></div>
          <div className="vfth-space-ident"><span>POSTE D’ESSAI · SIMULATION</span><b>{hasActiveUserDesign ? "CELLULE SYNCHRONISÉE" : "CELLULE EN ATTENTE"}</b><small>{hasActiveUserDesign ? "REPÈRE LOCAL X/Y · ALTITUDE Z" : "TRACÉ SCHÉMATIQUE · ÉCHELLE NON DÉFINIE"}</small>{hasActiveUserDesign && <small>{hasSynchronizedMission ? `${config.missionPlan?.operationName || "MISSION ACTIVE"} · ${config.missionPlan?.waypoints.length} WP` : `${config.missionPlan?.waypoints.length ?? 0} WP · TRAJECTOIRE DE TEST SYNTHÉTIQUE`}</small>}{hasActiveUserDesign && config.missionPlan && <small>RAYON {config.missionPlan.radiusKm.toFixed(1)} km · RETOUR {config.missionPlan.returnAltitudeM.toFixed(0)} m · LINK {config.missionPlan.lostLinkAction.toUpperCase()}</small>}<small>VOLUMES ILLUSTRATIFS · GÉOREPÉRAGE NON PROJETÉ</small></div>
          {showGrid && <svg className="vfth-space-mesh" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polygon className="vfth-space-plane" points="10,76 78,76 97,46 29,46" />
            <g className="vfth-space-grid-lines">{Array.from({ length: 9 }, (_, index) => { const t = index / 8; return <g key={index}><line x1={10 + 68 * t} y1="76" x2={29 + 68 * t} y2="46" /><line x1={10 + 19 * t} y1={76 - 30 * t} x2={78 + 19 * t} y2={76 - 30 * t} /></g> })}</g>
            <g className="vfth-space-axis"><line x1="10" y1="76" x2="84" y2="76" /><line x1="10" y1="76" x2="31" y2="41" /><line x1="10" y1="76" x2="10" y2="22" /><text x="85" y="78">X · AXE 1</text><text x="27" y="39">Y · AXE 2</text><text x="7" y="20">Z · ALT</text><text x="11" y="82">0,0,0</text></g>
          </svg>}
          {showZones && <svg className="vfth-space-volumes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Volumes de référence illustratifs, sans géorepérage du plan de mission"><g className="vfth-volume-safe"><polygon points="31,68 41,63 50,68 40,73" /><polygon points="31,57 41,52 50,57 40,62" /><path d="M31 68V57M41 63V52M50 68V57M40 73V62" /><text x="32" y="51">ENVELOPPE DE RÉFÉRENCE</text></g><g className="vfth-volume-nogo"><polygon points="66,54 74,50 81,54 73,58" /><polygon points="66,45 74,41 81,45 73,49" /><path d="M66 54V45M74 50V41M81 54V45M73 58V49" /><text x="68" y="39">NO-GO DÉMO</text></g></svg>}
          {hasActiveUserDesign && scenario === "obstacles" && <svg className="vfth-space-obstacles" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Marqueurs d’obstacles du scénario aux coordonnées du test, contrôle XY uniquement">{spaceObstacles.map((point, index) => <g className="vfth-space-obstacle" transform={`translate(${point.x} ${point.y})`} key={index}><circle r="2.15" /><path d="M-1.2 -1.2L1.2 1.2M1.2 -1.2L-1.2 1.2" /><text x="2.7" y="-2">OBS-0{index + 1} · XY</text></g>)}</svg>}
          {showExpected && <svg className="vfth-space-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Trajectoire volumétrique prévue et parcourue"><defs><linearGradient id="vfth-space-route-gradient"><stop offset="0" stopColor="#e9bd69" /><stop offset="100%" stopColor="#73ead6" /></linearGradient></defs><polyline className="vfth-space-planned" points={spaceRoute.map(point => `${point.x},${point.y}`).join(" ")} /><polyline className="vfth-space-flown" points={flownSpaceRoute} />{spaceRoute.map((point, index) => <g className="vfth-space-waypoint" key={`${point.name}-${index}`}><circle cx={point.x} cy={point.y} r="1.05" /><text x={point.x + 1.4} y={point.y - 1.4}>{point.name}</text></g>)}</svg>}
          {hasActiveUserDesign && <div className={`vfth-drone ${isWinged ? "is-winged" : "is-multirotor"} ${isVtol ? "is-vtol" : ""}`} style={{ left: `${spaceDrone.x}%`, top: `${spaceDrone.y}%`, transform: `translate(-50%,-50%) rotate(${yaw}deg)` }} aria-label={`${droneName}, cap ${Math.round(yaw)} degrés`}>
            {isWinged ? <><span className="drone-wing wing-l" /><span className="drone-core" /><span className="drone-wing wing-r" /><span className="drone-tail" />{isVtol && Array.from({ length: motorCount }, (_, index) => <i key={index} className="drone-vtol-motor" style={{ left: `${18 + (index % 2) * 44}%`, top: `${24 + Math.floor(index / 2) * 12}%` }} />)}</> : <><span className="drone-multirotor-core" />{Array.from({ length: motorCount }, (_, index) => { const angle = -Math.PI / 2 + index / motorCount * Math.PI * 2; return <i key={index} className="drone-motor" style={{ left: `${50 + Math.cos(angle) * 40}%`, top: `${50 + Math.sin(angle) * 35}%` }} /> })}</>}
            <span className="drone-beacon" />
          </div>}
          {!hasActiveUserDesign && <div className="vfth-demo-drone vfth-demo-drone-space" style={{ left: `${spaceDrone.x}%`, top: `${spaceDrone.y}%` }} aria-hidden="true"><i className="arm arm-a" /><i className="arm arm-b" /><i className="arm arm-c" /><i className="arm arm-d" /><i className="rotor rotor-a" /><i className="rotor rotor-b" /><i className="rotor rotor-c" /><i className="rotor rotor-d" /><b /><span /></div>}
          {!hasActiveUserDesign && <div className="vfth-demo-hud"><span><i /> MODE APERÇU</span><b>CELLULE <em>NON CHARGÉE</em></b><b>REPÈRE <em>XYZ LOCAL</em></b><b>SORTIE <em>DÉSACTIVÉE</em></b></div>}
          {!hasActiveUserDesign && <div className="vfth-empty-cockpit vfth-empty-cockpit-advanced"><div className="vfth-empty-title"><Layers3 size={22} /><span><strong>CONFIGURATION REQUISE</strong><small>ENVIRONNEMENT DE TEST PRÊT</small></span></div><p>Sélectionnez une cellule pour charger sa géométrie, son profil de mission et ses paramètres de vol.</p><button onClick={onOpenBuilder}>Ouvrir la sélection de cellule <ArrowLeft size={14} /></button><small className="vfth-empty-footnote">Le parcours affiché est un schéma synthétique, sans coordonnées réelles ni commande d’actionneur.</small></div>}
          {hasActiveUserDesign && <div className="vfth-hangar-readout vfth-space-readout"><span>Z / ALT {Math.round(currentAltitude).toLocaleString("fr-FR")} m</span><span>VIT {speed} km/h</span><span>CAP {Math.round(yaw)}°</span><span>X/Y {Math.round(droneX)} / {Math.round(droneY)}%</span></div>}
          <div className="vfth-observation-post"><Radio size={13} /> TÉLÉMÉTRIE · SIMULATION</div>
          <div className="vfth-scene-crosshair"><CrosshairIcon /></div>
        </div>
        <div className="vfth-scene-controls"><label><input type="checkbox" checked={showExpected} onChange={event => setShowExpected(event.target.checked)} /> trajectoire & waypoints</label><label><input type="checkbox" checked={showZones} onChange={event => setShowZones(event.target.checked)} /> volumes illustratifs</label><label><input type="checkbox" checked={showGrid} onChange={event => setShowGrid(event.target.checked)} /> grille XYZ</label><span><i className="expected-dot" /> prévue <i className="actual-dot" /> parcourue</span></div>
      </section>

      <aside className="vfth-panel vfth-scenarios"><div className="vfth-panel-head"><div><span className="vfth-index">B / CAMPAGNE</span><h3>Scénarios d’essai</h3></div><Route size={17} className="vfth-icon" /></div>
        <div className="vfth-scenario-list">{scenarios.map((item, index) => <button key={item.id} className={scenario === item.id ? "is-active" : ""} onClick={() => chooseScenario(item.id)} disabled={!hasActiveUserDesign}><span className="scenario-number">0{index + 1}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><em>{item.duration}s</em></button>)}</div>
        <div className="vfth-launch-card"><strong>{hasActiveUserDesign ? current.label : "Sélection requise"}</strong><small>{activeScenarioLabel} · {runs ? `run ${String(runs).padStart(2, "0")}` : "aucun essai préchargé"}</small><button onClick={launch} disabled={!hasActiveUserDesign || playing}><Play size={13} /> Exécuter le scénario</button></div>
        <div className="vfth-placement"><span>INITIALISATION · POSITION & CAP</span><label>X <input type="range" min="15" max="80" value={initialX} onChange={event => setInitialX(Number(event.target.value))} /><b>{initialX}%</b></label><label>Y <input type="range" min="25" max="78" value={initialY} onChange={event => setInitialY(Number(event.target.value))} /><b>{initialY}%</b></label><label>CAP DE RÉFÉRENCE <input type="range" min="-180" max="180" value={headingOffset} onChange={event => setHeadingOffset(Number(event.target.value))} /><b>{headingOffset}°</b></label></div>
      </aside>

      <section className="vfth-panel vfth-timeline"><div className="vfth-panel-head"><div><span className="vfth-index">C / SÉQUENCE</span><h3>Timeline de l’essai</h3></div><span className="vfth-chip">T+{String(time).padStart(3, "0")}s / {current.duration}s</span></div><input aria-label="Position temporelle du test" type="range" min="0" max={current.duration} value={time} onChange={event => setTime(Number(event.target.value))} /><div className="vfth-sequence"><span>INITIALISATION</span><span className={time > current.duration * .18 ? "done" : ""}>DÉCOLLAGE</span><span className={time > current.duration * .4 ? "done" : ""}>CROISIÈRE</span><span className={time > current.duration * .8 ? "done" : ""}>RETOUR</span><span className={time >= current.duration ? "done" : ""}>TERMINÉ</span></div><div className="vfth-timeline-meta"><span>PROGRESSION <b>{Math.round(phase * 100)}%</b></span><span>WAYPOINT <b>{to.name}</b></span><span>CAP <b>{Math.round(yaw)}°</b></span></div></section>

      <section className="vfth-panel vfth-telemetry"><div className="vfth-panel-head"><div><span className="vfth-index">D / TÉLÉMÉTRIE VIRTUELLE</span><h3>État du prototype</h3></div><span className="vfth-chip green">{hasActiveUserDesign ? "CALCUL SYNTHÉTIQUE" : "EN ATTENTE"}</span></div><div className="vfth-telemetry-grid"><span><Gauge size={15} />ALTITUDE<strong>{hasActiveUserDesign ? Math.round(currentAltitude).toLocaleString("fr-FR") : "—"}<em>m</em></strong></span><span><Wind size={15} />VITESSE<strong>{hasActiveUserDesign ? speed : "—"}<em>km/h</em></strong></span><span><Target size={15} />POSITION<strong>{hasActiveUserDesign ? `${droneX.toFixed(0)} / ${droneY.toFixed(0)}` : "— / —"}<em>%</em></strong></span><span><BatteryCharging size={15} />ÉNERGIE<strong>{hasActiveUserDesign && battery !== null ? battery : "—"}<em>%</em></strong></span></div><div className="vfth-telemetry-foot"><span><Compass size={12} />CAP <b>{hasActiveUserDesign ? `${Math.round(yaw)}°` : "—"}</b></span><span>PUISSANCE <b>{hasActiveUserDesign ? `${simulation.estimatedPowerW.toFixed(0)} W` : "—"}</b></span><span>ÉTAT <b>{playing ? "VOL" : !hasActiveUserDesign ? "NON INITIALISÉ" : time >= current.duration && runs ? "TERMINÉ" : "SOL"}</b></span></div></section>

      <section className="vfth-panel vfth-results"><div className="vfth-panel-head"><div><span className="vfth-index">E / RÉSULTATS DU TEST</span><h3>Anomalies & observations</h3></div><History size={17} className="vfth-icon" /></div><div className={`vfth-result ${anomaly ? "warning" : "ok"}`}><span>{anomaly ? <AlertTriangle size={17} /> : <ShieldCheck size={17} />}</span><div><strong>{obstacleAlert ? "Obstacle virtuel à proximité" : simulationAlert ? "Exigence ou risque moteur à revoir" : "Aucune anomalie détectée dans ce modèle"}</strong><p>{obstacleAlert ? `Écart local XY au marqueur du scénario : ${clearance.toFixed(1)} points normalisés. Indicateur d’écran 2D, sans unité métrique ni détection certifiée.` : simulationAlert ? "Les statuts proviennent du moteur de simulation courant; consultez le détail des exigences et risques dans Mission Control." : "La trajectoire reste affichée dans le référentiel local. Les résultats ne constituent ni une validation en vol, ni une mesure physique."}</p></div></div><div className="vfth-result-meta"><span><Layers3 size={13} /> {requirements.length} exigences projet visibles</span><span><Zap size={13} /> {simulation.confidence} · {simulation.runId}</span><span><Sparkles size={13} /> Résultats moteur reliés au modèle actif</span></div></section>
    </div>
    <footer className="vfth-footer"><span>HALL NUMÉRIQUE · {droneName} · {activeScenarioLabel}</span><span>Une simulation illustratrice ne remplace pas les essais réels, l’analyse structurelle ou la qualification.</span></footer>
  </div>;
}

function CrosshairIcon() {
  return <span className="vfth-crosshair" aria-hidden="true"><i /><b /></span>;
}
