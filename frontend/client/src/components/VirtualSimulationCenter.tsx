import { useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent, type SetStateAction } from "react";
import {
  Activity, ArrowUpRight, BatteryCharging, BrainCircuit, CheckCircle2, CloudSun,
  Compass, Copy, Cpu, Crosshair, Gauge, History, Layers3, MapPin, Pause,
  Play, Radio, RotateCw, Satellite, Save, ShieldCheck, Sparkles, Target,
  Timer, TriangleAlert, Wind, Zap, Plus, Minus, Pencil, Moon,
} from "lucide-react";
import { runSimulation, type ConceptConfig, type MissionWaypoint, type Requirement, type SimulationResult } from "../lib/aeroEngine";
import { defaultLocalMissionPlan } from "../lib/flightEngineering";
import "./virtual-simulation-center.css";

type RunRecord = { id: number; runId: string; engineVersion: string; createdAt: Date };
type VersionRecord = { id: number; version: string; createdAt: Date };
type Props = { simulation: SimulationResult; requirements: Requirement[]; onRunSimulation: () => void; isRunning: boolean; config: ConceptConfig; setConfig: Dispatch<SetStateAction<ConceptConfig>>; history: RunRecord[]; versions: VersionRecord[]; onRestoreVersion: (versionId: number) => void };
type Scenario = { id: string; name: string; weather: string; wind: number; altitude: number; terrain?: string; location?: string; status: "DRAFT" | "READY" | "RUNNING"; createdAt: string };
type MissionTab = "OVERVIEW" | "FLIGHT" | "SYSTEMS" | "PAYLOAD" | "ANALYSIS";

const initialScenarios: Scenario[] = [
  { id: "baseline", name: "Baseline cellule", weather: "Ciel clair", wind: 8, altitude: 120, status: "READY", createdAt: "local" },
  { id: "gust-front", name: "Front de rafales", weather: "Rafales synthétiques", wind: 32, altitude: 160, status: "DRAFT", createdAt: "local" },
];
const waypoints = [
  { id: "WP-01", x: 100, y: 400, altitude: 1200 },
  { id: "WP-02", x: 270, y: 225, altitude: 2800 },
  { id: "WP-03", x: 515, y: 115, altitude: 3600 },
  { id: "WP-04", x: 770, y: 280, altitude: 3900 },
];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const mercatorY = (latitude: number, zoom: number) => { const lat = clamp(latitude, -85.05112878, 85.05112878) * Math.PI / 180; return (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * 2 ** zoom; };
const worldPixel = (longitude: number, latitude: number, zoom: number) => ({ x: (longitude + 180) / 360 * 2 ** zoom * 256, y: mercatorY(latitude, zoom) * 256 });
const tabs: MissionTab[] = ["OVERVIEW", "FLIGHT", "SYSTEMS", "PAYLOAD", "ANALYSIS"];

export function VirtualSimulationCenter({ simulation, requirements, onRunSimulation, isRunning, config, setConfig, history, versions, onRestoreVersion }: Props) {
  const [activeScenario, setActiveScenario] = useState("baseline");
  const [scenarios, setScenarios] = useState<Scenario[]>(initialScenarios);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simTime, setSimTime] = useState(0);
  const [environment, setEnvironment] = useState("Ciel clair");
  const [wind, setWind] = useState(config.windSpeedKmh || 8);
  const [terrain, setTerrain] = useState("Relief synthétique");
  const [location, setLocation] = useState("Zone littorale synthétique");
  const [aiState, setAiState] = useState<"idle" | "running" | "ready">("idle");
  const [aiMessage, setAiMessage] = useState("");
  const [compare, setCompare] = useState(false);
  const [activeTab, setActiveTab] = useState<MissionTab>("OVERVIEW");
  const [activeWaypoint, setActiveWaypoint] = useState("WP-01");
  const [mapMode, setMapMode] = useState<"WORLD" | "TERRAIN" | "SAT" | "GRID" | "NIGHT">("WORLD");
  const [mapZoom, setMapZoom] = useState(2);
  const [mapCenter, setMapCenter] = useState({ longitude: 0, latitude: 18 });
  const mapDrag = useRef<{ x: number; y: number; centerX: number; centerY: number } | null>(null);
  const dragOccurred = useRef(false);
  const [routeEditMode, setRouteEditMode] = useState(false);
  const [routeFeedback, setRouteFeedback] = useState("Sélectionnez un point ou activez AJOUT RAPIDE");

  useEffect(() => {
    setWind(config.windSpeedKmh);
    const env = config.missionEnvironment;
    setEnvironment(!env ? "Ciel clair" : env.windKmh > config.windSpeedKmh ? "Rafales synthétiques" : env.ambientC < 15 ? "Brume de simulation" : env.ambientC > 25 ? "Thermiques artificielles" : "Ciel clair");
    setTerrain(env?.surfaceProfile ?? "Relief synthétique");
    setLocation(env?.locationLabel ?? "Zone littorale synthétique");
  }, [config.windSpeedKmh, config.missionEnvironment?.windKmh, config.missionEnvironment?.ambientC, config.missionEnvironment?.emiLevel, config.missionEnvironment?.surfaceProfile, config.missionEnvironment?.locationLabel]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => setSimTime(value => (value + 1) % 240), 500);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  const selectedScenario = scenarios.find(item => item.id === activeScenario) ?? scenarios[0];
  const targetAltitude = config.altitudeM;
  const progress = (simTime % 240) / 240;
  const altitude = targetAltitude;
  const speed = config.cruiseSpeedKmh;
  const battery = config.batteryWh > 0 ? Math.round(clamp(simulation.energyUsableWh / config.batteryWh * 100, 0, 100)) : 0;
  const canRunSimulation = Boolean(config.airframe && config.motorCount && config.motorCount > 0 && config.batteryWh > 0);
  const stability = canRunSimulation ? Math.round(simulation.windMarginPercent) : 0;
  const failedMetrics = canRunSimulation ? simulation.metrics.filter(metric => metric.status === "fail") : [];
  const openHighRisks = canRunSimulation ? simulation.risks.filter(risk => risk.status === "open" && risk.severity === "high") : [];
  const anomaly = failedMetrics.length > 0 || openHighRisks.length > 0;
  const activeDroneName = config.engineeringSelection?.droneLabel || config.designName || config.platformProfile || "AUCUN DRONE SÉLECTIONNÉ";
  const activeModelType = String(config.modelType ?? "").toLowerCase();
  const isVtol = config.airframe === "vtol" || activeModelType.includes("vtol") || activeModelType.includes("tiltrotor") || activeModelType.includes("tilt-wing");
  const isWinged = config.airframe === "fixed-wing" || isVtol || ["aile-volante","voilure-conventionnelle","planeur","biplan","canard","tandem-wing","stealth-wing","blended-pusher"].some(type=>activeModelType.includes(type));
  const motorCount = clamp(Math.round(config.motorCount ?? 4),1,12);
  const elapsed = `${String(Math.floor(simTime / 60)).padStart(2, "0")}:${String(simTime % 60).padStart(2, "0")}`;
  const missionWaypoints = config.missionPlan?.waypoints.length
    ? config.missionPlan.waypoints.map(point => ({ id: point.id, x: (mapMode === "WORLD" || mapMode === "SAT" || mapMode === "NIGHT") ? clamp(point.x, 0, 100) * 10 : 50 + clamp(point.x, 0, 100) * 9, y: (mapMode === "WORLD" || mapMode === "SAT" || mapMode === "NIGHT") ? clamp(point.y, 0, 100) * 5.2 : 40 + clamp(point.y, 0, 100) * 4, altitude: point.altitudeM, name: point.name }))
    : waypoints.map((point, index) => ({ ...point, y: point.y + 92, altitude: Math.round(targetAltitude * ([0.84, 0.94, 1, 0.9][index] ?? 1)), name: point.id }));
  const activeWaypointId = missionWaypoints.some(point => point.id === activeWaypoint) ? activeWaypoint : missionWaypoints[0]?.id ?? "WP-01";
  const selectedPlanWaypoint = config.missionPlan?.waypoints.find(point => point.id === activeWaypointId);
  const current = missionWaypoints.find(point => point.id === activeWaypointId) ?? missionWaypoints[0] ?? { id: "WP-01", x: 100, y: 400, altitude: targetAltitude, name: "WP-01" };
  const isImageryMode = mapMode === "SAT" || mapMode === "NIGHT";
  const centerPixel = worldPixel(mapCenter.longitude, mapCenter.latitude, mapZoom);
  const satTiles = useMemo(() => {
    if (!isImageryMode) return [];
    const tileCount = 2 ** mapZoom;
    const centerTileX = centerPixel.x / 256, centerTileY = centerPixel.y / 256;
    const tiles: { key: string; x: number; y: number; href: string }[] = [];
    for (let row = -2; row <= 2; row++) for (let col = -2; col <= 2; col++) {
      const rawX = Math.floor(centerTileX) + col, tileY = Math.floor(centerTileY) + row;
      if (tileY < 0 || tileY >= tileCount) continue;
      const tileX = ((rawX % tileCount) + tileCount) % tileCount;
      tiles.push({ key: `${mapZoom}-${rawX}-${tileY}`, x: 500 + (rawX - centerTileX) * 256, y: 260 + (tileY - centerTileY) * 256, href: `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${mapZoom}/${tileY}/${tileX}` });
    }
    return tiles;
  }, [isImageryMode, mapZoom, centerPixel.x, centerPixel.y]);
  const routePoints = missionWaypoints.map(point => {
    if (!isImageryMode) return `${point.x},${point.y}`;
    const lon = point.x / 10 - 180, lat = 90 - point.y / 5.2;
    const pixel = worldPixel(lon, lat, mapZoom);
    return `${500 + pixel.x - centerPixel.x},${260 + pixel.y - centerPixel.y}`;
  }).join(" ");
  const screenPoint = (point: typeof missionWaypoints[number]) => {
    if (!isImageryMode) return point;
    const pixel = worldPixel(point.x / 10 - 180, 90 - point.y / 5.2, mapZoom);
    return { ...point, x: 500 + pixel.x - centerPixel.x, y: 260 + pixel.y - centerPixel.y };
  };
  const routeIndex = Math.min(missionWaypoints.length - 1, Math.floor(progress * Math.max(0, missionWaypoints.length - 1)));
  const nextRoutePoint = missionWaypoints[Math.min(routeIndex + 1, missionWaypoints.length - 1)] ?? current;
  const segmentStart = missionWaypoints[routeIndex] ?? current;
  const segmentProgress = missionWaypoints.length > 1 ? progress * (missionWaypoints.length - 1) - routeIndex : progress;
  const droneX = segmentStart.x + (nextRoutePoint.x - segmentStart.x) * segmentProgress;
  const droneY = segmentStart.y + (nextRoutePoint.y - segmentStart.y) * segmentProgress;
  const droneScreen = screenPoint({ ...current, x: droneX, y: droneY });
  const routeCurrentPoints = [...missionWaypoints.slice(0, routeIndex + 1), { ...current, x: droneX, y: droneY }].map(point => { const projected = screenPoint(point); return `${projected.x},${projected.y}`; }).join(" ");
  const routeHeadingDeg = ((Math.atan2(nextRoutePoint.x - segmentStart.x, segmentStart.y - nextRoutePoint.y) * 180 / Math.PI) + 360) % 360;
  const followingPoint = missionWaypoints[Math.min(routeIndex + 2, missionWaypoints.length - 1)] ?? nextRoutePoint;
  const followingHeadingDeg = ((Math.atan2(followingPoint.x - nextRoutePoint.x, nextRoutePoint.y - followingPoint.y) * 180 / Math.PI) + 360) % 360;
  const turnDeltaDeg = ((followingHeadingDeg - routeHeadingDeg + 540) % 360) - 180;
  const attitudeRollDeg = canRunSimulation ? clamp(turnDeltaDeg * (0.24 + segmentProgress * 0.42), -35, 35) : null;
  const legDistanceKm = Math.max(0.1, Math.hypot((nextRoutePoint.x - segmentStart.x) / 1000 * 200, (nextRoutePoint.y - segmentStart.y) / 520 * 120));
  const attitudePitchDeg = canRunSimulation ? clamp(Math.atan2((nextRoutePoint.altitude - segmentStart.altitude) / 1000, legDistanceKm) * 180 / Math.PI, -20, 20) : null;
  const attitudeYawDeg = canRunSimulation ? routeHeadingDeg : null;
  const orbitRadiusX = 42 + clamp(simulation.rangeKm / 200, 0, 1) * 42;
  const orbitRadiusY = 18 + clamp(simulation.rangeKm / 200, 0, 1) * 16;
  const systemPowerScaleW = Math.max(1000, (config.motorCount ?? 4) * 750);
  const navWaypoints = missionWaypoints.map(point => ({ ...point, x: 18 + point.x / 1000 * 284, y: 8 + point.y / 520 * 130 }));
  const comparisonConfig = { ...config, windSpeedKmh: scenarios[0]?.wind ?? config.windSpeedKmh, altitudeM: scenarios[0]?.altitude ?? config.altitudeM, missionEnvironment: { ambientC: 20, windKmh: scenarios[0]?.wind ?? config.windSpeedKmh, emiLevel: 0 } };
  const comparisonSimulation = runSimulation(comparisonConfig, requirements);
  const comparisonPowerDelta = simulation.estimatedPowerW - comparisonSimulation.estimatedPowerW;
  const comparisonEnduranceDelta = simulation.enduranceH - comparisonSimulation.enduranceH;

  const selectScenario = (scenario: Scenario) => {
    setActiveScenario(scenario.id);
    setEnvironment(scenario.weather);
    setWind(scenario.wind);
    setTerrain(scenario.terrain ?? config.missionEnvironment?.surfaceProfile ?? "Relief synthétique");
    setLocation(scenario.location ?? config.missionEnvironment?.locationLabel ?? "Zone littorale synthétique");
    const weather = scenario.weather;
    setConfig(current => ({ ...current, windSpeedKmh: scenario.wind, altitudeM: scenario.altitude, missionEnvironment: { ambientC: weather === "Brume de simulation" ? 8 : weather === "Thermiques artificielles" ? 32 : 20, windKmh: weather === "Rafales synthétiques" ? scenario.wind + 12 : scenario.wind, emiLevel: weather === "Brume de simulation" ? 0.1 : 0, surfaceProfile: scenario.terrain ?? current.missionEnvironment?.surfaceProfile ?? "Relief synthétique", locationLabel: scenario.location ?? current.missionEnvironment?.locationLabel ?? "Zone littorale synthétique" } }));
    setIsPlaying(false);
    setSimTime(0);
  };
  const makeEditablePlan = () => ({
    ...defaultLocalMissionPlan,
    operationName: config.missionPlan?.operationName ?? "Mission personnalisée",
    waypoints: defaultLocalMissionPlan.waypoints.map(point => ({ ...point })),
  });
  const enableRouteEditing = () => {
    const plan = config.missionPlan ?? makeEditablePlan();
    setConfig(current => ({ ...current, missionPlan: current.missionPlan ?? plan }));
    setActiveWaypoint(plan.waypoints[0]?.id ?? "WP-01");
    setRouteEditMode(true);
    setRouteFeedback("Cliquez sur la carte pour ajouter un point à l’itinéraire");
  };
  const updateWaypoint = (patch: Partial<MissionWaypoint>) => {
    setConfig(current => {
      const plan = current.missionPlan ?? makeEditablePlan();
      return { ...current, missionPlan: { ...plan, waypoints: plan.waypoints.map(point => point.id === activeWaypointId ? { ...point, ...patch } : point) } };
    });
  };
  const addWaypoint = () => {
    const plan = config.missionPlan ?? makeEditablePlan();
    const previous = plan.waypoints[plan.waypoints.length - 1];
    let nextNumber = plan.waypoints.length + 1;
    while (plan.waypoints.some(point => point.id === `WP-${String(nextNumber).padStart(2, "0")}`)) nextNumber += 1;
    const id = `WP-${String(nextNumber).padStart(2, "0")}`;
    const point: MissionWaypoint = { id, name: `Point ${plan.waypoints.length + 1}`, x: clamp((previous?.x ?? 50) + 10, 0, 100), y: clamp((previous?.y ?? 50) - 8, 0, 100), altitudeM: Math.max(0, targetAltitude || 120), speedKmh: Math.max(0, speed || 30), action: "inspection" };
    setConfig(current => ({ ...current, missionPlan: { ...(current.missionPlan ?? plan), waypoints: [...(current.missionPlan?.waypoints ?? plan.waypoints), point] } }));
    setActiveWaypoint(id);
    setRouteFeedback(`${id} ajouté · ajustez sa position dans l’éditeur`);
  };
  const removeWaypoint = () => {
    if (!config.missionPlan || config.missionPlan.waypoints.length <= 1) return;
    const remaining = config.missionPlan.waypoints.filter(point => point.id !== activeWaypointId);
    setConfig(current => current.missionPlan ? { ...current, missionPlan: { ...current.missionPlan, waypoints: remaining } } : current);
    setActiveWaypoint(remaining[0]?.id ?? "WP-01");
    setRouteFeedback("Point supprimé · itinéraire recalculé localement");
  };
  const handleMapClick = (event: MouseEvent<SVGSVGElement>) => {
    if (dragOccurred.current) { dragOccurred.current = false; return; }
    if (!routeEditMode || (event.target as Element).closest(".vsc-mc-waypoint")) return;
    const svg = event.currentTarget;
    const bounds = svg.getBoundingClientRect();
    const screenX = (event.clientX - bounds.left) / bounds.width * 1000;
    const screenY = (event.clientY - bounds.top) / bounds.height * 520;
    let x = clamp(screenX / 10, 0, 100), y = clamp(screenY / 5.2, 0, 100);
    if (isImageryMode) {
      const worldX = centerPixel.x + screenX - 500, worldY = centerPixel.y + screenY - 260, scale = 2 ** mapZoom * 256;
      const longitude = worldX / scale * 360 - 180;
      const latitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * worldY / scale))) * 180 / Math.PI;
      x = clamp((longitude + 180) / 3.6, 0, 100); y = clamp((90 - latitude) / 1.8, 0, 100);
    }
    const plan = config.missionPlan ?? makeEditablePlan();
    let nextNumber = plan.waypoints.length + 1;
    while (plan.waypoints.some(point => point.id === `WP-${String(nextNumber).padStart(2, "0")}`)) nextNumber += 1;
    const id = `WP-${String(nextNumber).padStart(2, "0")}`;
    const point: MissionWaypoint = {
      id,
      name: `Point ${plan.waypoints.length + 1}`,
      x: Math.round(x),
      y: Math.round(y),
      altitudeM: Math.max(0, targetAltitude || 120),
      speedKmh: Math.max(0, speed || 30),
      action: "inspection",
    };
    setConfig(current => ({ ...current, missionPlan: { ...(current.missionPlan ?? plan), waypoints: [...(current.missionPlan?.waypoints ?? plan.waypoints), point] } }));
    setActiveWaypoint(id);
    const longitude = x / 100 * 360 - 180;
    const latitude = 90 - y / 100 * 180;
    setRouteFeedback(mapMode === "WORLD" ? `${id} placé · env. ${latitude.toFixed(2)}° ${latitude >= 0 ? "N" : "S"}, ${Math.abs(longitude).toFixed(2)}° ${longitude >= 0 ? "E" : "O"} · repère cartographique indicatif` : `${id} placé à ${Math.round(x)} / ${Math.round(y)} · itinéraire mis à jour`);
  };
  const resetDemoRoute = () => {
    setConfig(current => ({ ...current, missionPlan: undefined }));
    setActiveWaypoint("WP-01");
    setRouteEditMode(false);
    setRouteFeedback("Tracé de démonstration restauré");
  };
  const updateSceneDescriptor = (key: "surfaceProfile" | "locationLabel", value: string) => {
    if (key === "surfaceProfile") setTerrain(value);
    else setLocation(value);
    setConfig(current => ({ ...current, missionEnvironment: { ambientC: current.missionEnvironment?.ambientC ?? 20, windKmh: current.missionEnvironment?.windKmh ?? current.windSpeedKmh, emiLevel: current.missionEnvironment?.emiLevel ?? 0, surfaceProfile: key === "surfaceProfile" ? value : current.missionEnvironment?.surfaceProfile ?? terrain, locationLabel: key === "locationLabel" ? value : current.missionEnvironment?.locationLabel ?? location } }));
    setScenarios(current => current.map(item => item.id === activeScenario ? { ...item, [key === "surfaceProfile" ? "terrain" : "location"]: value, status: "DRAFT" } : item));
  };
  const runAi = () => {
    setAiState("running");
    window.setTimeout(() => {
      const findings = !canRunSimulation
        ? "Analyse non exécutée : aucun drone avec architecture, propulsion et batterie configurées n’est actif. Sélectionnez une cellule de la bibliothèque ou complétez sa configuration dans le Studio IDDS."
        : `Run ${simulation.runId} · cellule ${activeDroneName} · masse calculée ${simulation.totalMassKg.toFixed(2)} kg · puissance estimée ${simulation.estimatedPowerW.toFixed(0)} W · autonomie calculée ${simulation.enduranceH.toFixed(2)} h · rayon théorique ${simulation.rangeKm.toFixed(1)} km · marge au vent ${simulation.windMarginPercent.toFixed(0)}%. ${failedMetrics.length ? `Métriques en échec : ${failedMetrics.map(metric => metric.label).join(", ")}.` : "Aucune métrique en échec selon les exigences actuelles."} ${openHighRisks.length ? `Risques élevés ouverts : ${openHighRisks.map(risk => risk.label).join(", ")}.` : "Aucun risque élevé ouvert."} Confiance moteur : ${simulation.confidence}; validation humaine requise.`;
      setAiMessage(findings);
      setAiState("ready");
    }, 600);
  };
  const saveScenario = () => {
    const id = `scenario-${Date.now()}`;
    const item: Scenario = { id, name: `Campagne ${scenarios.length + 1}`, weather: environment, wind, altitude: config.altitudeM || 120, terrain, location, status: "DRAFT", createdAt: new Date().toLocaleTimeString("fr-FR") };
    setScenarios(current => [...current, item]);
    setActiveScenario(id);
  };
  const duplicateScenario = () => {
    if (!selectedScenario) return;
    const id = `copy-${Date.now()}`;
    const item = { ...selectedScenario, id, name: `${selectedScenario.name} · copie`, status: "DRAFT" as const, createdAt: new Date().toLocaleTimeString("fr-FR") };
    setScenarios(current => [...current, item]);
    setActiveScenario(id);
  };
  const updateWind = (value: number) => {
    setWind(value);
    setConfig(current => ({ ...current, windSpeedKmh: value, missionEnvironment: { ambientC: current.missionEnvironment?.ambientC ?? 20, windKmh: current.missionEnvironment?.windKmh !== undefined && current.missionEnvironment.windKmh > current.windSpeedKmh ? value + 12 : value, emiLevel: current.missionEnvironment?.emiLevel ?? 0, surfaceProfile: current.missionEnvironment?.surfaceProfile, locationLabel: current.missionEnvironment?.locationLabel } }));
    setScenarios(current => current.map(item => item.id === activeScenario ? { ...item, wind: value, status: "DRAFT" } : item));
  };
  const updateAltitude = (value: number) => {
    setConfig(current => ({ ...current, altitudeM: value }));
    setScenarios(current => current.map(item => item.id === activeScenario ? { ...item, altitude: value, status: "DRAFT" } : item));
  };
  const updateWeather = (value: string) => {
    setEnvironment(value);
    setScenarios(current => current.map(item => item.id === activeScenario ? { ...item, weather: value, status: "DRAFT" } : item));
    setConfig(current => ({ ...current, missionEnvironment: { ambientC: value === "Brume de simulation" ? 8 : value === "Thermiques artificielles" ? 32 : 20, windKmh: value === "Rafales synthétiques" ? current.windSpeedKmh + 12 : current.windSpeedKmh, emiLevel: value === "Brume de simulation" ? 0.1 : 0, surfaceProfile: current.missionEnvironment?.surfaceProfile, locationLabel: current.missionEnvironment?.locationLabel } }));
  };
  const chooseTab = (tab: MissionTab) => {
    setActiveTab(tab);
    if (tab === "ANALYSIS") runAi();
    if (tab === "FLIGHT") setIsPlaying(true);
  };
  const navSummary: Record<MissionTab, string> = {
    OVERVIEW: "SYNTHÈSE DE MISSION · DONNÉES SYNTHÉTIQUES LOCALES",
    FLIGHT: `PARAMÈTRES DE VOL · ${activeWaypointId} · ${speed.toFixed(0)} KM/H CIBLE`,
    SYSTEMS: `SORTIES MOTEUR · MASSE ${simulation.totalMassKg.toFixed(2)} KG · PUISSANCE ${simulation.estimatedPowerW.toFixed(0)} W`,
    PAYLOAD: `CHARGE UTILE CONFIGURÉE · ${Number(config.payloadKg || 0).toFixed(2)} kg · RUN ${simulation.runId}`,
    ANALYSIS: aiState === "ready" ? "ANALYSE LOCALE TERMINÉE · HEURISTIQUE EXPLICITE" : "ANALYSE LOCALE DISPONIBLE · AUCUN MODÈLE EXTERNE CONNECTÉ",
  };

  return <div className="vsc-shell vsc-mission-control" data-active-tab={activeTab}>
    <header className="vsc-mc-header">
      <div className="vsc-mc-brand"><strong>MISSION CONTROL</strong></div>
      <nav className="vsc-mc-nav" aria-label="Vues Mission Control">{tabs.map(tab => <button key={tab} className={activeTab === tab ? "is-active" : ""} aria-current={activeTab === tab ? "page" : undefined} onClick={() => chooseTab(tab)}>{tab}</button>)}</nav>
      <div className="vsc-mc-mission"><strong>{activeDroneName.toUpperCase()}</strong><span>SCÉNARIO · {selectedScenario.name.toUpperCase()}</span><span><i /> T+ {elapsed}:00 · {isPlaying ? "EN COURS" : "EN PAUSE"}</span></div>
    </header>
    <div className="vsc-mc-statusline"><span>LINK <b>LOCAL</b></span><span>SAT <b>N/D</b></span><span>GNSS <b>N/D</b></span><span>DATA <b>{config.engineeringSelection?.droneId ? "CELLULE LIÉE" : "SOURCE REQUISE"}</b></span><span className="vsc-mc-source">{navSummary[activeTab]}</span></div>
    <div className="vsc-mc-topgrid">
      <aside className="vsc-mc-left">
        <section className="vsc-mc-card vsc-mc-readout"><span>ALTITUDE CIBLE</span><strong>{altitude > 0 ? altitude.toLocaleString("fr-FR") : "—"} <small>M</small></strong><div className="vsc-mc-metric-bar" aria-label="Altitude cible configurée"><i style={{width:`${clamp(targetAltitude/6000*100,0,100)}%`}}/></div></section>
        <section className="vsc-mc-card vsc-mc-readout"><span>VITESSE CROISIÈRE</span><strong>{speed > 0 ? speed : "—"} <small>KM/H</small></strong><div className="vsc-mc-metric-bar" aria-label="Vitesse de croisière configurée"><i style={{width:`${clamp(speed/220*100,0,100)}%`}}/></div></section>
        <section className="vsc-mc-card vsc-mc-readout"><span>ÉNERGIE UTILE</span><strong>{canRunSimulation ? battery : "—"} <small>{canRunSimulation ? "%" : ""}</small></strong><div className="vsc-mc-meter"><i style={{ width: `${battery}%` }} /></div><small className="vsc-mc-foot">{canRunSimulation ? `${simulation.energyUsableWh.toFixed(0)} Wh / ${config.batteryWh.toFixed(0)} Wh · ${simulation.enduranceH.toFixed(2)} h calculées` : "Aucune batterie déclarée"}</small></section>
        <section className="vsc-mc-card vsc-mc-readout vsc-mc-stability"><span>MARGE AU VENT</span><strong>{canRunSimulation ? stability : "—"} <small>{canRunSimulation ? "%" : ""}</small></strong><div className="vsc-mc-attitude-mini"><span>ROLL <b>—</b></span><span>PITCH <b>—</b></span><span>YAW <b>—</b></span></div></section>
      </aside>

      <section className="vsc-mc-card vsc-mc-primary-scene">
        <div className="vsc-mc-panel-head"><div><span>LIVE DIGITAL TWIN · {activeDroneName}</span><strong>{terrain.toUpperCase()} / TRAJECTOIRE SUPERVISÉE</strong></div><span className="vsc-mc-live"><i /> SIM {isPlaying ? "RUNNING" : "READY"}</span></div>
        <div className="vsc-mc-map-scene" data-map-mode={mapMode} data-location={location} data-surface={terrain}>
          <svg className={`vsc-mc-terrain ${routeEditMode ? "is-editing" : ""}`} viewBox="0 0 1000 520" preserveAspectRatio="none" role="img" aria-label={mapMode === "WORLD" ? "Carte mondiale Natural Earth et route locale X/Y non géoréférencée" : "Carte de trajectoire synthétique, sans coordonnées réelles"} onClick={handleMapClick} onPointerDown={event=>{if(isImageryMode&&event.button===0){mapDrag.current={x:event.clientX,y:event.clientY,centerX:centerPixel.x,centerY:centerPixel.y};event.currentTarget.setPointerCapture(event.pointerId)}}} onPointerMove={event=>{const drag=mapDrag.current;if(!drag||!isImageryMode)return;const bounds=event.currentTarget.getBoundingClientRect(),dx=(event.clientX-drag.x)/bounds.width*1000,dy=(event.clientY-drag.y)/bounds.height*520;if(Math.abs(dx)+Math.abs(dy)>4)dragOccurred.current=true;const scale=2**mapZoom*256,worldX=drag.centerX-dx,worldY=drag.centerY-dy,longitude=worldX/scale*360-180,latitude=Math.atan(Math.sinh(Math.PI*(1-2*worldY/scale)))*180/Math.PI;setMapCenter({longitude,latitude:clamp(latitude,-85,85)})}} onPointerUp={event=>{if(mapDrag.current){mapDrag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}}} onWheel={event=>{if(isImageryMode){event.preventDefault();setMapZoom(value=>clamp(value+(event.deltaY<0?1:-1),1,18))}}}>
            <defs><radialGradient id="mc-horizon"><stop stopColor="#126b7b" stopOpacity=".64"/><stop offset="1" stopColor="#071821" stopOpacity="0"/></radialGradient><pattern id="mc-grid" width="68" height="52" patternUnits="userSpaceOnUse"><path d="M68 0H0V52" fill="none" stroke="#76d8da" strokeOpacity=".1"/></pattern><filter id="mc-glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
            <rect width="1000" height="520" fill="#071923"/><rect width="1000" height="520" fill="url(#mc-horizon)"/><rect width="1000" height="520" fill="url(#mc-grid)"/>
            {mapMode === "WORLD" ? <image href="/world-map.svg" x="0" y="0" width="1000" height="520" preserveAspectRatio="none" role="img" aria-label="Fond cartographique mondial Natural Earth, référence visuelle uniquement" /> : <g fill="#0c3641" stroke="#24707b" strokeOpacity=".32" strokeWidth="2"><path d="M40 225L95 174 155 178 202 141 253 151 294 197 273 226 231 237 210 279 158 283 131 326 86 311 61 270Z"/><path d="M308 297L351 275 393 286 416 322 390 347 355 336Z"/><path d="M602 146L650 128 702 141 734 171 717 203 670 207 640 188Z"/><path d="M742 324L791 299 850 308 886 349 859 382 808 378 780 354Z"/></g>}
            {isImageryMode&&<g className="vsc-mc-imagery-tiles">{satTiles.map(tile=><image key={tile.key} href={tile.href} x={tile.x} y={tile.y} width="256" height="256" preserveAspectRatio="none"/>)}</g>}
            <polyline points={routePoints} className="vsc-mc-route-planned"/><polyline points={routeCurrentPoints} className="vsc-mc-route-current"/>
            {missionWaypoints.map((rawPoint,index)=>{const point=screenPoint(rawPoint); return <g key={point.id} className={`vsc-mc-waypoint ${activeWaypointId===point.id?"is-active":""}`} role="button" tabIndex={0} aria-label={`Choisir ${point.name}`} onClick={()=>setActiveWaypoint(point.id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" ")setActiveWaypoint(point.id)}}><circle cx={point.x} cy={point.y} r={activeWaypointId===point.id?11:7}/><path d={`M${point.x} ${point.y-12}L${point.x-8} ${point.y-24}H${point.x+8}Z`}/><text x={point.x+14} y={point.y-7}>{point.name}</text><text x={point.x+14} y={point.y+8}>{point.altitude.toLocaleString("fr-FR")} M</text><title>Activer {point.name}</title></g>})}
            <g className="vsc-mc-drone-marker" transform={`translate(${droneScreen.x} ${droneScreen.y}) rotate(${attitudeYawDeg ?? 0})`} filter="url(#mc-glow)">{isWinged ? <><path d="M0 -32Q-7 -18 -6 17L0 39L6 17Q7 -18 0 -32Z"/><path d="M0 -10L-48 -28L-43 -7L0 8L43 -7L48 -28Z"/><path d="M0 19L-20 36L0 30L20 36Z"/>{isVtol&&Array.from({length:motorCount},(_,i)=>{const side=i%2===0?-1:1,row=Math.floor(i/2),pairs=Math.ceil(motorCount/2),x=side*(pairs===1?27:13+row*12);return <g key={`mission-vtol-${i}`}><path d={`M${x} -14V-3`} stroke="#dffefa" strokeWidth="2"/><circle cx={x} cy="-17" r="5" fill="#09242b" stroke="#ffe0a1" strokeWidth="1.5"/></g>})}</> : <><path d="M0 -5L-36 -23M0 -5L36 -23M0 -5L-36 23M0 -5L36 23" stroke="#73eee4" strokeWidth="4" fill="none"/>{Array.from({length:motorCount},(_,i)=>{const angle=-Math.PI/2+i/motorCount*Math.PI*2,x=Math.cos(angle)*39,y=-5+Math.sin(angle)*28;return <g key={`mission-rotor-${i}`}><circle cx={x} cy={y} r="6" fill="#09242b" stroke="#ffe0a1" strokeWidth="1.5"/><path d={`M${x-4} ${y}H${x+4}M${x} ${y-4}V${y+4}`} stroke="#ffe0a1" strokeWidth="1"/></g>})}<path d="M-8 -14Q0 -20 8 -14L11 10Q0 20 -11 10Z"/></>}</g>
            <g className="vsc-mc-compass"><circle cx="923" cy="79" r="32"/><path d="M923 28V130M872 79H974"/><path d="M923 42L917 80L923 74L929 80Z"/><text x="923" y="20">N</text></g>
            <text x="30" y="34" className="vsc-mc-scene-label">{mapMode === "WORLD" ? "FOND MONDIAL · NATURAL EARTH" : config.missionPlan?.waypoints.length ? "PLAN PERSONNALISÉ · WAYPOINTS SYNCHRONISÉS" : "TRAJECTOIRE DÉMO · WAYPOINTS SYNTHÉTIQUES"}</text><text x="30" y="52" className="vsc-mc-scene-label">{mapMode === "WORLD" ? `${config.missionPlan?.waypoints.length ? "ROUTE DU PLAN" : "ROUTE DÉMO"} · X/Y LOCAL 0–100 · NON GÉORÉFÉRENCÉ` : `${location.toUpperCase()} · ${terrain.toUpperCase()}`}</text><text x="30" y="492" className="vsc-mc-scene-label">ALT CIBLE {altitude||"N/D"} M · VITESSE CIBLE {speed||"N/D"} KM/H · RUN {simulation.runId}</text>{mapMode === "WORLD" && <text x="970" y="506" textAnchor="end" className="vsc-mc-scene-credit">MADE WITH NATURAL EARTH · PUBLIC DOMAIN</text>}{isImageryMode&&<text x="970" y="506" textAnchor="end" className="vsc-mc-scene-credit">IMAGERY: ESRI · MAXAR · EARTHSTAR · GIS COMMUNITY</text>}
          </svg>
          <div className="vsc-mc-map-controls"><button onClick={()=>{setMapMode("WORLD");setRouteFeedback(routeEditMode?"Mode Monde · cliquez sur une zone pour ajouter un point":"Carte mondiale · activez AJOUT RAPIDE pour tracer")}} className={mapMode==="WORLD"?"is-active":""} aria-pressed={mapMode==="WORLD"}>MONDE</button><button onClick={()=>setMapMode("TERRAIN")} className={mapMode==="TERRAIN"?"is-active":""}>TERRAIN</button><button onClick={()=>setMapMode("SAT")} className={mapMode==="SAT"?"is-active":""} aria-pressed={mapMode==="SAT"}><Satellite size={11}/> SAT</button><button onClick={()=>setMapMode("NIGHT")} className={mapMode==="NIGHT"?"is-active":""} aria-pressed={mapMode==="NIGHT"}><Moon size={11}/> NUIT</button><button onClick={()=>setMapMode("GRID")} className={mapMode==="GRID"?"is-active":""}>GRID</button><button aria-label="Ajouter un waypoint" title="Ajouter un waypoint" onClick={()=>{if(!routeEditMode)enableRouteEditing();addWaypoint()}}><Plus size={14}/></button><button aria-label="Supprimer le waypoint sélectionné" title="Supprimer le waypoint sélectionné" onClick={removeWaypoint} disabled={!config.missionPlan||config.missionPlan.waypoints.length<=1}><Minus size={14}/></button><button onClick={()=>{if(routeEditMode){setRouteEditMode(false);setRouteFeedback("Édition terminée · plan conservé")}else enableRouteEditing()}} className={routeEditMode?"is-active":""} aria-pressed={routeEditMode} aria-label="Modifier l’itinéraire" title="Modifier l’itinéraire"><Pencil size={13}/></button>{isImageryMode&&<span className="vsc-mc-zoom-tools"><button aria-label="Dézoomer" onClick={()=>setMapZoom(value=>clamp(value-1,1,18))}>−</button><b>Z{mapZoom}</b><button aria-label="Zoomer" onClick={()=>setMapZoom(value=>clamp(value+1,1,18))}>+</button></span>}</div>
        </div>
        <div className="vsc-mc-scene-footer"><span><i className="planned"/>TRAJECTOIRE PRÉVUE</span><span><i className="actual"/>SIMULATION COURANTE</span><span><MapPin size={12}/>{current.name ?? current.id} · {current.altitude.toLocaleString("fr-FR")} M</span><span>{isImageryMode?`IMAGERIE SATELLITE · ZOOM ${mapZoom} · LAT/LON ESTIMÉS`:mapMode === "WORLD" ? "X/Y LOCAL 0—100 · SANS GPS" : "ÉCHELLE LOCALE · 0—200 KM"}</span></div><div className={`vsc-mc-route-hint ${routeEditMode ? "is-active" : ""}`} role="status"><Crosshair size={12}/><span>{routeFeedback}</span><button onClick={resetDemoRoute}>TRACÉ DÉMO</button></div>
        <div className="vsc-mc-flight-controls"><div><span className="vsc-mc-status-dot"/>SCÉNARIO {isPlaying?"EN COURS":"EN PAUSE"}<small>lecture virtuelle · aucun actionneur réel</small></div><button className="vsc-mc-primary-button" onClick={()=>setIsPlaying(value=>!value)}>{isPlaying?<Pause size={14}/>:<Play size={14}/>} {isPlaying?"PAUSE":"DÉMARRER"}</button><button onClick={onRunSimulation} disabled={isRunning||!canRunSimulation} title={!canRunSimulation?"Sélectionnez une cellule avec propulsion et batterie configurées":"Recalculer avec les paramètres actifs"}><RotateCw size={13}/>{isRunning?"CALCUL…":canRunSimulation?"RECALCULER":"CELLULE REQUISE"}</button><button onClick={runAi} disabled={aiState==="running"}><BrainCircuit size={13}/>{aiState==="running"?"ANALYSE…":"ANALYSE IA"}</button></div>
      </section>

      <aside className="vsc-mc-right">
        <section className="vsc-mc-card vsc-mc-orbit"><div className="vsc-mc-panel-head"><strong>RANGE / PERFORMANCE</strong><span>{canRunSimulation?`RUN ${simulation.runId}`:"CELLULE REQUISE"}</span></div><div className="vsc-mc-orbit-content"><svg viewBox="0 0 220 180" role="img" aria-label={`Couverture de mission indicative · portée théorique ${canRunSimulation?simulation.rangeKm.toFixed(1):"non calculée"} km`}><circle cx="110" cy="90" r="68" className="globe"/><ellipse cx="110" cy="90" rx={orbitRadiusX} ry={orbitRadiusY} transform="rotate(-28 110 90)" className="orbit"/><path d="M46 88Q110 22 175 91M110 22V158M43 90H177M72 39Q110 90 72 141M148 39Q110 90 148 141" className="globe-grid"/><circle cx="110" cy="90" r="8" className="globe-core"/><circle cx={110+orbitRadiusX*.63} cy={90-orbitRadiusY*.78} r="4" className="orbit-node"/><circle cx={110-orbitRadiusX*.64} cy={90+orbitRadiusY*.78} r="4" className="orbit-node"/></svg><dl><div><dt>PORTÉE</dt><dd>{canRunSimulation?`${simulation.rangeKm.toFixed(1)} KM`:"—"}</dd></div><div><dt>AUTONOMIE</dt><dd>{canRunSimulation?`${simulation.enduranceH.toFixed(2)} H`:"—"}</dd></div><div><dt>ALT CIBLE</dt><dd>{targetAltitude||"—"} M</dd></div><div><dt>CHARGE</dt><dd>{canRunSimulation?`${config.payloadKg.toFixed(2)} KG`:"—"}</dd></div></dl></div><div className="vsc-mc-orbit-legend"><span>— — — PRÉVUE</span><span>— COURANTE</span><span>○ WAYPOINT</span><span>◇ CIBLE</span></div></section>
        <section className="vsc-mc-card vsc-mc-attitude"><div className="vsc-mc-panel-head"><strong>ATTITUDE · {canRunSimulation?"ESTIMATION CINÉMATIQUE":"SOURCE REQUISE"}</strong><span>{canRunSimulation?"ROUTE ACTIVE":"—"}</span></div><div className="vsc-mc-attitude-row"><svg viewBox="0 0 180 100" aria-label={canRunSimulation?`Attitude estimée depuis la trajectoire active : roulis ${attitudeRollDeg?.toFixed(1)} degrés, tangage ${attitudePitchDeg?.toFixed(1)} degrés, cap ${attitudeYawDeg?.toFixed(1)} degrés`:"Attitude indisponible sans cellule configurée"}><path d="M90 10V90M12 50H168"/><g transform={`rotate(${attitudeRollDeg ?? 0} 90 52)`}><path d="M25 55L62 40L90 49L118 40L155 55L116 61L90 55L64 61Z"/><circle cx="90" cy="52" r="8"/><path d="M90 25L85 35H95Z"/></g></svg><dl><div>ROLL <b>{canRunSimulation?`${attitudeRollDeg?.toFixed(1)}°`:"—"}</b></div><div>PITCH <b>{canRunSimulation?`${attitudePitchDeg?.toFixed(1)}°`:"—"}</b></div><div>YAW <b>{canRunSimulation?`${attitudeYawDeg?.toFixed(1)}°`:"—"}</b></div></dl></div><small className="vsc-mc-attitude-note">Indication cinématique synthétique dérivée du segment et des altitudes de waypoints — pas une mesure IMU.</small></section>
        <section className="vsc-mc-card vsc-mc-systems"><div className="vsc-mc-panel-head"><strong>SYSTEMS · SORTIES DU MOTEUR</strong><span className={!canRunSimulation||anomaly?"warning":"nominal"}>{!canRunSimulation?"SOURCE REQUISE":anomaly?"REVIEW":"CALCULÉ"}</span></div><div className="vsc-mc-system-grid">{[{label:"MASS",value:canRunSimulation?simulation.totalMassKg.toFixed(1):"—",unit:canRunSimulation?"KG":"",fill:canRunSimulation?clamp(simulation.totalMassKg/(config.maxTakeoffKg||1)*100,0,100):0,Icon:Cpu,title:"Masse calculée par le moteur"},{label:"PWR",value:canRunSimulation?simulation.estimatedPowerW.toFixed(0):"—",unit:canRunSimulation?"W":"",fill:canRunSimulation?clamp(simulation.estimatedPowerW/systemPowerScaleW*100,0,100):0,Icon:Zap,title:`Puissance calculée · échelle visuelle 0–${systemPowerScaleW} W`},{label:"ENDUR",value:canRunSimulation?simulation.enduranceH.toFixed(1):"—",unit:canRunSimulation?"H":"",fill:canRunSimulation?clamp(simulation.enduranceH/4*100,0,100):0,Icon:BatteryCharging,title:"Autonomie calculée"},{label:"WIND",value:canRunSimulation?simulation.windMarginPercent.toFixed(0):"—",unit:canRunSimulation?"%":"",fill:canRunSimulation?clamp(simulation.windMarginPercent,0,100):0,Icon:Wind,title:"Marge au vent calculée"}].map(({label,value,unit,fill,Icon,title})=><div key={label} title={title}><span>{label}</span><Icon size={20}/><i><b style={{width:`${fill}%`}}/></i><strong>{value} {unit}</strong></div>)}</div></section>
      </aside>
    </div>

    <div className="vsc-mc-bottomgrid">
      <section className="vsc-mc-card vsc-mc-alerts"><div className="vsc-mc-panel-head"><strong>ALERT STREAM</strong><span>{anomaly?"ATTENTION":"NOMINAL"}</span></div><ul>{failedMetrics.slice(0,2).map(metric=><li key={metric.id} className="alert-high"><TriangleAlert size={13}/><time>MODEL</time><span>{metric.label.toUpperCase()} · {metric.value} {metric.unit}</span><b>FAIL</b></li>)}{openHighRisks.slice(0,2).map(risk=><li key={risk.label} className="alert-high"><TriangleAlert size={13}/><time>RISK</time><span>{risk.label.toUpperCase()}</span><b>HIGH</b></li>)}<li className="alert-info"><Activity size={13}/><time>RUN</time><span>{simulation.runId} · {activeDroneName.toUpperCase()}</span><b>{simulation.confidence.toUpperCase()}</b></li><li><BatteryCharging size={13}/><time>ENERGY</time><span>{simulation.energyUsableWh.toFixed(0)} WH USEFUL · {simulation.enduranceH.toFixed(2)} H</span><b>CALC</b></li></ul></section>
      <section className="vsc-mc-card vsc-mc-timeline"><div className="vsc-mc-panel-head"><strong>MISSION TIMELINE</strong><span>T+{elapsed} / 04:00</span></div><div className="vsc-mc-stages">{["LAUNCH","CLIMB","CRUISE","SURVEY","RETURN","LAND"].map((step,index)=><button key={step} className={simTime/240>=index/5?"is-complete":""} onClick={()=>{setSimTime(index*40);setActiveWaypoint(missionWaypoints[Math.min(index,missionWaypoints.length-1)]?.id ?? "WP-01")}}><i/>{step}<small>{["00:00","00:12","01:26","02:10","03:00","03:24"][index]}</small></button>)}</div><div className="vsc-mc-progress"><span>PROGRESS</span><input aria-label="Avancement de la mission simulée" type="range" min="0" max="239" value={simTime} onChange={event=>setSimTime(Number(event.target.value))}/><strong>{Math.round(progress*100)}%</strong></div></section>
      <section className="vsc-mc-card vsc-mc-navmap"><div className="vsc-mc-panel-head"><strong>NAV MAP</strong><div>{(["TERRAIN","SAT","GRID"] as const).map(mode=><button key={mode} className={mapMode===mode?"is-active":""} onClick={()=>setMapMode(mode)}>{mode}</button>)}</div></div><svg viewBox="0 0 320 145" role="img" aria-label={`Carte locale synthétique, mode ${mapMode}`}><path d="M4 95Q60 64 98 74T185 39T315 47M0 126Q58 104 104 116T205 82T320 90M22 18Q90 34 120 15T230 22T310 8"/><path d="M34 117L105 62L198 102L275 37" className="nav-route"/>{navWaypoints.map((p,i)=><g key={p.id} className={activeWaypointId===p.id?"is-active":""} onClick={()=>setActiveWaypoint(p.id)}><circle cx={p.x} cy={p.y} r="5"/><text x={p.x+8} y={p.y-7}>{p.name}</text>{i===navWaypoints.length-1&&<path d={`M${p.x} ${p.y-10}L${p.x-7} ${p.y}L${p.x} ${p.y+10}L${p.x+7} ${p.y}Z`}/>}</g>)}</svg></section>
    </div>

    <div className="vsc-mc-ops-grid">
      <section className="vsc-mc-card vsc-mc-scenario-console"><div className="vsc-mc-panel-head"><strong>SCENARIO CONTROL</strong><span>{scenarios.length} CAMPAGNE</span></div><div className="vsc-mc-scenario-row">{scenarios.map(scenario=><button key={scenario.id} className={activeScenario===scenario.id?"is-active":""} onClick={()=>selectScenario(scenario)}><i/><span><b>{scenario.name}</b><small>{scenario.id===activeScenario?environment:scenario.weather} · vent {scenario.id===activeScenario?wind:scenario.wind} km/h · {scenario.id===activeScenario?targetAltitude:scenario.altitude} m</small></span><em>{scenario.status}</em></button>)}</div><div className="vsc-mc-settings"><label>VENT <b>{wind} km/h</b><input aria-label="Vent du scénario" type="range" min="0" max="80" value={wind} onChange={e=>updateWind(Number(e.target.value))}/></label><label>ALTITUDE CIBLE <b>{targetAltitude} m</b><input aria-label="Altitude cible" type="range" min="0" max="6000" step="10" value={targetAltitude} onChange={e=>updateAltitude(Number(e.target.value))}/></label><label>ENVIRONNEMENT <select value={environment} onChange={e=>updateWeather(e.target.value)}><option>Ciel clair</option><option>Rafales synthétiques</option><option>Brume de simulation</option><option>Thermiques artificielles</option></select></label><label>SURFACE <select value={terrain} onChange={e=>updateSceneDescriptor("surfaceProfile",e.target.value)}><option>Relief synthétique</option><option>Piste en terre synthétique</option><option>Sable côtier synthétique</option><option>Forêt dense synthétique</option><option>Neige / glace synthétique</option><option>Zone urbaine abstraite</option></select></label><label className="vsc-mc-location">LIEU DE SIMULATION <select value={location} onChange={e=>updateSceneDescriptor("locationLabel",e.target.value)}><option>Zone littorale synthétique</option><option>Plateau montagneux synthétique</option><option>Site industriel fictif</option><option>Forêt boréale synthétique</option><option>Couloir urbain abstrait</option><option>Lac alpin synthétique</option></select></label></div><div className="vsc-mc-route-editor"><div className="vsc-mc-route-title"><span><b>TRAJECTOIRE PERSONNALISÉE</b><small>{config.missionPlan?.waypoints.length ?? 0} point(s) · {mapMode === "WORLD" ? "carte monde · repères lat/lon indicatifs" : "coordonnées locales 0–100"}</small></span><div><button onClick={enableRouteEditing}>{routeEditMode?"CLIC SUR LA CARTE ACTIF":config.missionPlan?"ITINÉRAIRE ACTIF":"ÉDITER L’ITINÉRAIRE"}</button><button onClick={addWaypoint} aria-label="Ajouter un waypoint">＋ POINT</button><button onClick={removeWaypoint} disabled={!config.missionPlan||config.missionPlan.waypoints.length<=1} aria-label="Supprimer le waypoint actif">−</button></div></div>{config.missionPlan&&selectedPlanWaypoint&&<div className="vsc-mc-waypoint-editor"><label>POINT<select aria-label="Waypoint actif" value={selectedPlanWaypoint.id} onChange={event=>setActiveWaypoint(event.target.value)}>{config.missionPlan.waypoints.map(point=><option key={point.id} value={point.id}>{point.id} · {point.name}</option>)}</select></label><label>NOM<input value={selectedPlanWaypoint.name} onChange={event=>updateWaypoint({name:event.target.value})}/></label><label>X<input type="number" min="0" max="100" value={selectedPlanWaypoint.x} onChange={event=>updateWaypoint({x:clamp(Number(event.target.value),0,100)})}/></label><label>Y<input type="number" min="0" max="100" value={selectedPlanWaypoint.y} onChange={event=>updateWaypoint({y:clamp(Number(event.target.value),0,100)})}/></label><label>ALT. M<input type="number" min="0" max="6000" step="10" value={selectedPlanWaypoint.altitudeM} onChange={event=>updateWaypoint({altitudeM:clamp(Number(event.target.value),0,6000)})}/></label><label>VIT. KM/H<input type="number" min="0" max="300" value={selectedPlanWaypoint.speedKmh} onChange={event=>updateWaypoint({speedKmh:clamp(Number(event.target.value),0,300)})}/></label></div>}<small className="vsc-mc-scene-note">{routeEditMode?"Mode actif : cliquez dans une zone vide de la carte pour créer un waypoint." : "Lieu et surface sont des scènes synthétiques, sans coordonnées géographiques réelles. Le tracé est enregistré dans le plan de mission partagé."}</small></div><div className="vsc-mc-ops-actions"><button onClick={saveScenario}><Save size={13}/>ENREGISTRER CAMPAGNE</button><button onClick={duplicateScenario}><Copy size={13}/>DUPLIQUER</button><button className={compare?"is-active":""} onClick={()=>setCompare(v=>!v)} disabled={!canRunSimulation} title={!canRunSimulation?"Une cellule doit être configurée avant la comparaison":"Comparer aux paramètres de référence"}><Layers3 size={13}/>{compare?"COMPARAISON ACTIVE":"COMPARER"}</button></div>{compare&&canRunSimulation&&<p className="vsc-mc-compare-state">Cellule active vs référence vent {comparisonConfig.windSpeedKmh} km/h · puissance {comparisonPowerDelta>=0?"+":""}{comparisonPowerDelta.toFixed(0)} W · autonomie {comparisonEnduranceDelta>=0?"+":""}{comparisonEnduranceDelta.toFixed(2)} h · résultats calculés localement.</p>}</section>
      <section className="vsc-mc-card vsc-mc-analysis"><div className="vsc-mc-panel-head"><strong>ANALYSE / ASSISTANT</strong><span>{aiState==="ready"?"RÉSULTAT LOCAL":"ANALYSE LOCALE"}</span></div><div className="vsc-mc-ai-body"><BrainCircuit size={20}/><div><b>{aiState==="running"?"Analyse en cours…":aiState==="ready"?(canRunSimulation?"Lecture de mission terminée":"Source requise"):"Analyse de sécurité indicative"}</b><p>{aiMessage||(!canRunSimulation?"Sélectionnez une cellule ou configurez un dessin IDDS avant tout calcul.":"Analyse locale fondée sur les sorties calculées et exigences actives. Aucun modèle IA distant n’est connecté; résultats indicatifs, non certifiants.")}</p></div></div><div className={`vsc-mc-ai-result ${!canRunSimulation||anomaly?"warning":"nominal"}`}>{!canRunSimulation||anomaly?<TriangleAlert size={14}/>:<ShieldCheck size={14}/>}<span>{!canRunSimulation?"Aucune source exploitable · sélection requise":anomaly?`${failedMetrics.length} métrique(s) en échec · ${openHighRisks.length} risque(s) élevé(s) ouvert(s)`:"Masse, puissance, autonomie et vent calculés par le moteur local"}</span></div><button className="vsc-mc-run-ai" onClick={runAi} disabled={aiState==="running"}><Sparkles size={14}/>{aiState==="running"?"ANALYSE…":"LANCER L’ANALYSE LOCALE"}<ArrowUpRight size={13}/></button></section>
      <section className="vsc-mc-card vsc-mc-performance"><div className="vsc-mc-panel-head"><strong>PERFORMANCES / CALCUL DU MOTEUR</strong><span>{history.length} EXÉCUTIONS · {versions.length} VERSIONS</span></div>{canRunSimulation?<div className="vsc-mc-performance-bars"><div><span>PUISSANCE</span><i><b style={{width:`${clamp(simulation.estimatedPowerW/2000*100,0,100)}%`}}/></i><strong>{canRunSimulation?`${simulation.estimatedPowerW.toFixed(0)} W`:"—"}</strong></div><div><span>AUTONOMIE</span><i><b style={{width:`${clamp(simulation.enduranceH/5*100,0,100)}%`}}/></i><strong>{simulation.enduranceH.toFixed(2)} h</strong></div><div><span>RAYON THÉORIQUE</span><i><b style={{width:`${clamp(simulation.rangeKm/500*100,0,100)}%`}}/></i><strong>{simulation.rangeKm.toFixed(1)} km</strong></div><div><span>MARGE VENT</span><i><b style={{width:`${clamp(simulation.windMarginPercent,0,100)}%`}}/></i><strong>{simulation.windMarginPercent.toFixed(0)} %</strong></div></div>:<div className="vsc-mc-source-required">Sélectionnez une cellule dans la bibliothèque ou configurez le drone dessiné dans Studio IDDS. Aucun résultat n’est présenté avant la disponibilité des entrées requises.</div>}<div className="vsc-mc-performance-footer"><span>PUISSANCE ESTIMÉE<strong>{canRunSimulation?`${simulation.estimatedPowerW.toFixed(0)} W`:"—"}</strong></span><span>MODÈLE<strong>{canRunSimulation?(config.modelType||config.airframe||"—"):"SOURCE REQUISE"}</strong></span><button onClick={onRunSimulation} disabled={isRunning||!canRunSimulation} title={!canRunSimulation?"Sélectionnez une cellule avec propulsion et batterie configurées":"Lancer un run du moteur sur la configuration active"}><RotateCw size={13}/>{isRunning?"CALCUL…":canRunSimulation?"LANCER UN RUN":"CELLULE REQUISE"}</button></div></section>
    </div>
    <footer className="vsc-mc-footer"><span><Satellite size={12}/> AEROMIND MISSION CONTROL · TÉLÉMÉTRIE SIMULÉE · AUCUNE COORDONNÉE RÉELLE</span><span><ShieldCheck size={12}/> PAS DE COMMANDE MATÉRIELLE · VALIDATION OPÉRATEUR REQUISE</span><button onClick={()=>versions[0]&&onRestoreVersion(versions[0].id)} disabled={!versions.length}><History size={13}/>RESTAURER SNAPSHOT</button></footer>
  </div>;
}
