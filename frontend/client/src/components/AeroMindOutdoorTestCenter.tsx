import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Activity, AlertTriangle, CheckCircle2, Cloud, Compass, Crosshair, Map, Pause, Play, Plus, Radio, ShieldCheck, Square, Users, Zap } from "lucide-react";
import type { ConceptConfig, MissionWaypoint, SimulationResult } from "../lib/aeroEngine";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import { droneCatalog } from "../lib/droneCatalog";
import { OpenStreetMapView, type MapLayerMode } from "./OpenStreetMapView";
import { UniversalWaypointSelector } from "./UniversalWaypointSelector";
import { migrateLegacyMissionPlan, toLegacyMissionPlan, type UniversalWaypoint } from "../lib/globalWaypointEngine";
import { useLanguage } from "../contexts/LanguageContext";
import "./aeromind-outdoor-test-center.css";

type OutdoorTab = "supervision" | "mission" | "simulation" | "physical";
type FleetState = "READY" | "SIMULATING" | "STANDBY" | "HOLD";
type FleetUnit = { id: string; label: string; design: DroneCatalogDesign; state: FleetState; battery: number; position: { lat: number; lng: number } | null; role: string };

type Props = {
  hasProject: boolean;
  config: ConceptConfig;
  setConfig: Dispatch<SetStateAction<ConceptConfig>>;
  simulation: SimulationResult;
  isRunning: boolean;
  onRunSimulation: (config?: ConceptConfig) => void;
  onOpenBuilder: () => void;
};

const BASE_CENTER = { lat: 0, lng: 0 };
const FLEET_ROLES = ["LEAD / NAVIGATION", "SCOUT / OBSERVATION", "RELAY / COMMS", "RESERVE / SAFETY"];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function buildOutdoorFleet(activeDesign?: DroneCatalogDesign): FleetUnit[] {
  const designs = [activeDesign, ...droneCatalog].filter((design, index, all): design is DroneCatalogDesign => Boolean(design) && all.findIndex((candidate) => candidate?.key === design?.key) === index).slice(0, 4);
  return designs.map((design, index) => ({
    id: `OUT-${String(index + 1).padStart(2, "0")}`,
    label: index === 0 ? "AEROMIND-01" : `AEROMIND-${String(index + 1).padStart(2, "0")}`,
    design,
    state: index === 0 ? "READY" : "STANDBY",
    battery: 96 - index * 7,
    position: null,
    role: FLEET_ROLES[index],
  }));
}

export function buildOutdoorMissionPoints(fleet: FleetUnit[]): Array<{ id: string; name: string; lat: number; lng: number; approximate?: boolean }> {
  return fleet.filter((unit): unit is FleetUnit & { position: { lat: number; lng: number } } => unit.position !== null).map((unit) => ({ id: unit.id, name: unit.label, ...unit.position, approximate: true }));
}

export function AeroMindOutdoorTestCenter({ hasProject, config, setConfig, simulation, isRunning, onRunSimulation, onOpenBuilder }: Props) {
  const { t } = useLanguage();
  const activeDesign = useMemo(() => droneCatalog.find((design) => design.key === config.airframe), [config.airframe]);
  const [tab, setTab] = useState<OutdoorTab>("supervision");
  const [layerMode, setLayerMode] = useState<MapLayerMode>("tactical");
  const [fleet, setFleet] = useState<FleetUnit[]>(() => buildOutdoorFleet(activeDesign));
  const [selectedDroneId, setSelectedDroneId] = useState("OUT-01");
  const [selectedPointId, setSelectedPointId] = useState<string | undefined>(undefined);
  const [missionPoints, setMissionPoints] = useState<MissionWaypoint[]>(() => config.missionPlan?.waypoints ?? []);
  const [universalWaypoints, setUniversalWaypoints] = useState<UniversalWaypoint[]>(() => migrateLegacyMissionPlan(config.missionPlan, "outdoor-test-center", "simulation").waypoints);
  const [missionArmed, setMissionArmed] = useState(false);
  const [physicalArmed, setPhysicalArmed] = useState(false);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [eventLog, setEventLog] = useState<string[]>(["Centre initialisé · sortie matérielle verrouillée", "Flotte locale chargée · 4 unités supervisables"]);

  useEffect(() => {
    setFleet(buildOutdoorFleet(activeDesign));
  }, [activeDesign]);

  useEffect(() => {
    if (!isRunning) return;
    setSimulationProgress(0);
    const timer = window.setInterval(() => setSimulationProgress((progress) => progress >= 1 ? 1 : progress + 0.05), 120);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  const selectedDrone = fleet.find((unit) => unit.id === selectedDroneId) ?? fleet[0];
  const mapPoints = useMemo(() => buildOutdoorMissionPoints(fleet), [fleet]);
  const canSimulate = hasProject && Boolean(config.airframe) && missionPoints.length >= 2;
  const pushEvent = (message: string) => setEventLog((events) => [`${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · ${message}`, ...events].slice(0, 8));
  const persistMission = (waypoints: MissionWaypoint[]) => setConfig((current) => ({ ...current, missionPlan: { ...(current.missionPlan ?? {}), operationName: "AeroMind Outdoor Coordinated Test", radiusKm: current.missionPlan?.radiusKm ?? 1, returnAltitudeM: current.missionPlan?.returnAltitudeM ?? 50, lostLinkAction: current.missionPlan?.lostLinkAction ?? "return", homeX: current.missionPlan?.homeX ?? 50, homeY: current.missionPlan?.homeY ?? 82, waypoints } }));
  const updateFleetState = (state: FleetState) => setFleet((units) => units.map((unit) => ({ ...unit, state })));
  const addMissionPoint = () => {
    const next = missionPoints.length + 1;
    const waypoint = { id: `wp-${next}`, name: `Point ${next}`, x: clamp(20 + next * 13, 10, 92), y: clamp(78 - next * 14, 12, 88), altitudeM: 40 + next * 10, speedKmh: 30, action: "inspection" as const };
    setMissionPoints((points) => { const nextPoints = [...points, waypoint]; persistMission(nextPoints); return nextPoints; });
    pushEvent(`Waypoint WP-${next} ajouté à la mission coordonnée`);
  };
  const updateUniversalWaypoints = (next: UniversalWaypoint[]) => {
    setUniversalWaypoints(next);
    const legacy = toLegacyMissionPlan({ mission_id: "outdoor-test-center", environment: "simulation", waypoints: next, updated_at: new Date().toISOString() });
    setMissionPoints(legacy.waypoints);
    setConfig((current) => ({ ...current, missionPlan: { ...(current.missionPlan ?? legacy), ...legacy } }));
  };
  const runFleetSimulation = () => {
    if (!canSimulate) return;
    updateFleetState("SIMULATING");
    setTab("simulation");
    pushEvent(`Simulation de flotte lancée · ${fleet.length} unités · ${missionPoints.length} waypoints`);
    onRunSimulation(config);
  };
  const armPhysical = () => {
    if (!hasProject || !selectedDrone) return;
    const next = !physicalArmed;
    setPhysicalArmed(next);
    pushEvent(next ? `Essai physique préparé pour ${selectedDrone.label} · aucune commande transmise` : "Essais physiques désarmés");
  };

  return (
    <section className="aotc-center" aria-label="AeroMind Outdoor Test Center">
      <header className="aotc-header">
        <div className="aotc-brand"><div className="aotc-mark">A</div><div><span>AEROMIND / AEROLAB</span><h2>AEROMIND OUTDOOR TEST CENTER</h2><p>Supervision multi-drones · cartographie extérieure · essais séparés et traçables</p></div></div>
        <div className="aotc-header-state"><span className={physicalArmed ? "aotc-dot warn" : "aotc-dot"} />{physicalArmed ? "PHYSICAL TEST PREPARED" : "SIMULATION SAFE MODE"}<small>{hasProject ? "PROJECT CONFIGURATION LOADED" : "PROJECT REQUIRED"}</small></div>
      </header>
      <nav className="aotc-tabs" aria-label="Outdoor Test Center modes">
        {(["supervision", "mission", "simulation", "physical"] as OutdoorTab[]).map((item) => <button key={item} type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "supervision" ? <Radio size={14} /> : item === "mission" ? <Crosshair size={14} /> : item === "simulation" ? <Activity size={14} /> : <ShieldCheck size={14} />}{item === "supervision" ? "Supervision flotte" : item === "mission" ? "Mission coordonnée" : item === "simulation" ? "Simulation" : "Essais physiques"}</button>)}
      </nav>
      <div className="aotc-layout">
        <aside className="aotc-fleet-panel">
          <div className="aotc-panel-title"><span><Users size={14} /> FLEET CONTROL</span><b>{fleet.length} UNITS</b></div>
          <div className="aotc-fleet-list">{fleet.map((unit) => <button key={unit.id} type="button" className={`aotc-fleet-row ${selectedDroneId === unit.id ? "selected" : ""}`} onClick={() => { setSelectedDroneId(unit.id); setSelectedPointId(unit.id); }}><span className={`aotc-state-dot ${unit.state.toLowerCase()}`} /><span><strong>{unit.label}</strong><small>{unit.role}</small></span><b>{unit.battery}%</b></button>)}</div>
          <div className="aotc-panel-block"><span className="aotc-kicker">UNIT SELECTED</span><strong className="aotc-selected-name">{selectedDrone?.label ?? "—"}</strong><span>{selectedDrone?.design.modelType ?? "No airframe"}</span><span>{selectedDrone?.state ?? "HOLD"} · {selectedDrone?.battery ?? 0}% battery</span></div>
          <div className="aotc-safety-card"><ShieldCheck size={16} /><div><strong>SAFETY BOUNDARY</strong><span>Simulation and physical test channels are separated.</span></div></div>
        </aside>
        <main className="aotc-main">
          <div className="aotc-map-toolbar"><div><span className="aotc-kicker">OUTDOOR OPERATIONS MAP</span><strong>LOCAL TEST RANGE · {missionPoints.length} WAYPOINTS</strong></div><div className="aotc-map-actions"><button type="button" className={layerMode === "tactical" ? "active" : ""} onClick={() => setLayerMode("tactical")}><Map size={13} /> Tactical</button><button type="button" className={layerMode === "satellite" ? "active" : ""} onClick={() => setLayerMode("satellite")}><Compass size={13} /> Satellite</button></div></div>
          <div className="aotc-map-wrap"><OpenStreetMapView center={universalWaypoints.find((point) => point.latitude !== null && point.longitude !== null) ? { lat: universalWaypoints.find((point) => point.latitude !== null && point.longitude !== null)!.latitude as number, lng: universalWaypoints.find((point) => point.latitude !== null && point.longitude !== null)!.longitude as number } : BASE_CENTER} points={mapPoints} zoom={universalWaypoints.length ? 10 : 2} layerMode={layerMode} selectedPointId={selectedPointId} onPointSelect={(id) => { setSelectedPointId(id); const unit = fleet.find((candidate) => candidate.id === id); if (unit) setSelectedDroneId(id); }} onMapClick={(coordinate) => pushEvent(`Position cartographique inspectée · ${coordinate.lat.toFixed(4)}, ${coordinate.lng.toFixed(4)}`)} simulatedProgress={isRunning ? simulationProgress : 0} simulatedAltitudeM={selectedDrone?.position ? 60 : undefined} simulatedHeadingDeg={90} /></div>
          <div className="aotc-metrics"><div><small>FLEET READINESS</small><strong>{Math.round(fleet.reduce((sum, unit) => sum + unit.battery, 0) / Math.max(1, fleet.length))}%</strong></div><div><small>MISSION STATE</small><strong>{missionArmed ? "ARMED" : "DRAFT"}</strong></div><div><small>SIM RUN</small><strong>{simulation.runId}</strong></div><div><small>WEATHER</small><strong><Cloud size={14} /> LOCAL</strong></div></div>
        </main>
        <aside className="aotc-right-panel">
          {tab === "supervision" && <><div className="aotc-panel-title"><span><Radio size={14} /> SUPERVISION</span><b>LIVE</b></div><div className="aotc-check-list"><span><CheckCircle2 size={14} /> Telemetry localisée</span><span><CheckCircle2 size={14} /> Geofence de test actif</span><span><CheckCircle2 size={14} /> Collision avoidance: monitor</span><span><AlertTriangle size={14} /> GNSS réel: non connecté</span></div><button type="button" className="aotc-primary" onClick={runFleetSimulation} disabled={!canSimulate || isRunning}><Play size={14} />{isRunning ? "SIMULATION…" : "LANCER SIMULATION FLOTTE"}</button></>}
          {tab === "mission" && <><div className="aotc-panel-title"><span><Crosshair size={14} /> MISSION COORDINÉE</span><b>{missionPoints.length} WP</b></div><p className="aotc-note">Préparez la mission puis armez-la pour la simulation. Aucun armement physique n’est déclenché ici.</p><div className="aotc-waypoints">{missionPoints.map((point, index) => <div key={point.id}><b>{String(index + 1).padStart(2, "0")}</b><span>{point.name}<small>{point.altitudeM} m · X {point.x}% · Y {point.y}%</small></span></div>)}</div><div className="aotc-actions"><button type="button" onClick={addMissionPoint}><Plus size={13} /> Ajouter waypoint</button><button type="button" className={missionArmed ? "armed" : ""} onClick={() => { setMissionArmed((armed) => !armed); pushEvent(missionArmed ? "Mission coordonnée désarmée" : "Mission coordonnée armée pour simulation"); }}><Crosshair size={13} />{missionArmed ? "Désarmer mission" : "Armer simulation"}</button></div></>}
          {tab === "simulation" && <><div className="aotc-panel-title"><span><Activity size={14} /> SIMULATION FLOTTE</span><b>{Math.round(simulationProgress * 100)}%</b></div><div className="aotc-progress"><i style={{ width: `${simulationProgress * 100}%` }} /></div><p className="aotc-note">Run local reproductible · aucune commande radio, moteur ou actionneur physique.</p><div className="aotc-sim-readout"><span>Run ID <b>{simulation.runId}</b></span><span>Endurance <b>{simulation.enduranceH.toFixed(2)} h</b></span><span>Range théorique <b>{simulation.rangeKm.toFixed(1)} km</b></span><span>Risques ouverts <b>{simulation.risks.filter((risk) => risk.status === "open").length}</b></span></div><button type="button" className="aotc-primary" onClick={runFleetSimulation} disabled={!canSimulate || isRunning}><Zap size={14} /> Rejouer le run de flotte</button></>}
          {tab === "physical" && <><div className="aotc-panel-title"><span><ShieldCheck size={14} /> ESSAIS PHYSIQUES</span><b className="hold">HOLD</b></div><div className="aotc-physical-warning"><AlertTriangle size={18} /><strong>ZONE PHYSIQUE SÉPARÉE</strong><span>Cette zone ne transmet aucune commande. Elle prépare uniquement une campagne vérifiable et exige une validation humaine externe.</span></div><label className="aotc-ack"><input type="checkbox" checked={physicalArmed} onChange={armPhysical} /> Je confirme la préparation de l’essai pour {selectedDrone?.label ?? "l’unité sélectionnée"}.</label><button type="button" className="aotc-physical-button" onClick={armPhysical}><Square size={13} />{physicalArmed ? "DÉSARMER LA PRÉPARATION" : "PRÉPARER ESSAI PHYSIQUE"}</button><div className="aotc-physical-gates"><span>01 · Configuration validée <b>{hasProject ? "READY" : "HOLD"}</b></span><span>02 · Simulation exécutée <b>{simulation.runId === "SIM-000" ? "HOLD" : "READY"}</b></span><span>03 · Autorisation opérateur <b>EXTERNE</b></span></div></>}
        </aside>
      </div>
      <UniversalWaypointSelector missionId="outdoor-test-center" environment="simulation" waypoints={universalWaypoints} onChange={updateUniversalWaypoints} title="Sélecteur universel · Outdoor Test Center" />
      <footer className="aotc-footer"><span><Activity size={13} /> EVENT LOG</span><div>{eventLog.slice(0, 3).map((event) => <small key={event}>{event}</small>)}</div><button type="button" onClick={() => { setFleet((units) => units.map((unit) => ({ ...unit, state: "STANDBY" }))); setSimulationProgress(0); pushEvent("Centre réinitialisé · aucun canal physique actif"); }}><Pause size={12} /> Reset</button></footer>
      {!hasProject && <div className="aotc-builder-note"><button type="button" onClick={onOpenBuilder}>Choisir / construire une cellule</button><span>Un projet AeroMind est requis pour exécuter une simulation de flotte.</span></div>}
    </section>
  );
}
