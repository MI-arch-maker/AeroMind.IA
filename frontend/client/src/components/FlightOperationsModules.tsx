import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, ClipboardList, Gamepad2, Map, Radio, Thermometer, Waypoints } from "lucide-react";
import type { LocalMissionPlan, MissionEnvironment, MissionWaypoint } from "../lib/aeroEngine";
import type { MissionTelemetryFrame } from "../lib/missionBridge";
import { SimulationOnlyAdapterPanel } from "./SimulationOnlyAdapterPanel";
import "./flight-operations.css";

type Sample = { t: number; speed: number; altitude: number; pitch: number; roll: number; battery: number };
type LogEntry = { time: string; level: "INFO" | "WARN" | "SIM"; event: string; detail: string };
type Props = {
  demoState: string;
  activeWaypoint: number;
  waypoints: LocalMissionPlan["waypoints"];
  missionPlan: LocalMissionPlan;
  environment: MissionEnvironment;
  enduranceH: number;
  batteryWh: number;
  telemetryState: string;
  telemetry?: MissionTelemetryFrame & { receivedAt?: number } | null;
  telemetrySource: "none" | "synthetic" | "wss" | "mavlink";
  onMissionPlanChange: (plan: LocalMissionPlan) => void;
  onEnvironmentChange: (environment: MissionEnvironment) => void;
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clock = () => new Date().toLocaleTimeString("fr-FR", { hour12: false });
const restrictedPolygon = [[23, 23], [43, 23], [43, 40], [23, 40]] as const;
const insideRestrictedPolygon = (x: number, y: number) => x >= 23 && x <= 43 && y >= 23 && y <= 40;

function sparkline(values: number[], width = 240, height = 52) {
  if (values.length < 2) return "";
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  return values.map((value, index) => `${index ? "L" : "M"}${(index / (values.length - 1)) * width},${height - 4 - ((value - min) / span) * (height - 10)}`).join(" ");
}
function TelemetryChart({ title, value, unit, values, tone }: { title: string; value: string; unit: string; values: number[]; tone: string }) {
  return <article className="fom-chart-card"><div><span>{title}</span><strong>{value}<small>{unit}</small></strong></div><svg viewBox="0 0 240 52" preserveAspectRatio="none" aria-label={`${title}, historique de télémétrie synthétique`}><path className={`fom-chart-line ${tone}`} d={sparkline(values)} /></svg></article>;
}

export function FlightOperationsModules({ demoState, activeWaypoint, waypoints, missionPlan, environment, enduranceH, batteryWh, telemetryState, telemetry, telemetrySource, onMissionPlanChange, onEnvironmentChange }: Props) {
  const [view, setView] = useState<"telemetry" | "tactical" | "thermal" | "logs" | "mission" | "adapter">("telemetry");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [selectedWaypointId, setSelectedWaypointId] = useState(waypoints[activeWaypoint]?.id ?? waypoints[0]?.id ?? "");
  const [thermalGain, setThermalGain] = useState(65);
  const [thermalPalette, setThermalPalette] = useState<"inferno" | "ice" | "mono">("inferno");
  const [thermalMotion, setThermalMotion] = useState(true);
  const [propulsionMode, setPropulsionMode] = useState<"piston" | "jet" | "hybrid">("piston");
  const [activeIncidents, setActiveIncidents] = useState<string[]>([]);
  const [logFilter, setLogFilter] = useState<"ALL" | LogEntry["level"]>("ALL");
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: clock(), level: "INFO", event: "SIM.SESSION_READY", detail: "Console locale initialisée; sorties physiques désactivées." },
    { time: clock(), level: "SIM" as const, event: "TELEMETRY.SYNTHETIC", detail: "Aucune donnée capteur revendiquée; courbes issues du modèle de démonstration." },
  ]);
  const tick = useRef(0);
  const priorState = useRef(demoState);
  const priorWaypoint = useRef(activeWaypoint);
  const latestTelemetry = useRef(telemetry);
  latestTelemetry.current = telemetry;
  const current = waypoints[activeWaypoint];
  const currentWaypointInFence = Boolean(current && insideRestrictedPolygon(current.x, current.y));
  const selectedWaypoint = waypoints.find(point => point.id === selectedWaypointId) ?? current ?? waypoints[0];
  useEffect(() => {
    if (!waypoints.some(point => point.id === selectedWaypointId)) setSelectedWaypointId(waypoints[activeWaypoint]?.id ?? waypoints[0]?.id ?? "");
  }, [activeWaypoint, selectedWaypointId, waypoints]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      tick.current += 1;
      const phase = tick.current / 3;
      const active = demoState === "running";
      const targetSpeed = active ? current?.speedKmh ?? 0 : 0;
      const targetAltitude = active ? current?.altitudeM ?? 0 : 0;
      const batteryPct = clamp(100 - (active ? tick.current / Math.max(1, enduranceH * 36) : 0), 0, 100);
      const frame = latestTelemetry.current;
      const externalFrameFresh = (telemetrySource === "wss" || telemetrySource === "mavlink") && frame?.receivedAt !== undefined && Date.now() - frame.receivedAt < 2500;
      const sample: Sample = {
        t: tick.current,
        speed: externalFrameFresh ? frame?.speedKmh ?? targetSpeed : Math.max(0, targetSpeed + (active ? Math.sin(phase) * 1.2 : 0)),
        altitude: externalFrameFresh ? frame?.altitudeM ?? targetAltitude : Math.max(0, targetAltitude + (active ? Math.sin(phase * 0.7) * 0.7 : 0)),
        pitch: externalFrameFresh ? frame?.pitchDeg ?? 0 : active ? Math.sin(phase * 0.8) * 3.5 : 0,
        roll: externalFrameFresh ? frame?.rollDeg ?? 0 : active ? Math.sin(phase * 0.6) * 2.2 : 0,
        battery: externalFrameFresh ? frame?.batteryPct ?? batteryPct : batteryPct,
      };
      setSamples(previous => [...previous, sample].slice(-28));
    }, 850);
    return () => window.clearInterval(timer);
  }, [demoState, current?.speedKmh, current?.altitudeM, enduranceH, telemetrySource]);

  useEffect(() => {
    if (priorState.current !== demoState) {
      const state = demoState.toUpperCase();
      setLogs(previous => [{ time: clock(), level: (demoState === "running" ? "SIM" : "INFO") as LogEntry["level"], event: `MISSION.STATE_${state}`, detail: `État local mis à jour : ${demoState}.` }, ...previous].slice(0, 18));
      priorState.current = demoState;
    }
  }, [demoState]);
  useEffect(() => {
    if (priorWaypoint.current !== activeWaypoint && waypoints[activeWaypoint]) {
      const point = waypoints[activeWaypoint];
      setLogs(previous => [{ time: clock(), level: "SIM" as const, event: "ROUTE.WAYPOINT_SELECTED", detail: `${point.id} ${point.name} · ${point.altitudeM} m · simulation locale.` }, ...previous].slice(0, 18));
      priorWaypoint.current = activeWaypoint;
    }
  }, [activeWaypoint, waypoints]);

  const latest = samples[samples.length - 1];
  const speedData = useMemo(() => samples.map(item => item.speed), [samples]);
  const altitudeData = useMemo(() => samples.map(item => item.altitude), [samples]);
  const pitchData = useMemo(() => samples.map(item => item.pitch), [samples]);
  const rollData = useMemo(() => samples.map(item => item.roll), [samples]);
  const batteryData = useMemo(() => samples.map(item => item.battery), [samples]);
  const wssFresh = (telemetrySource === "wss" || telemetrySource === "mavlink") && telemetry?.receivedAt !== undefined && Date.now() - telemetry.receivedAt < 2500;
  const coords = [{ x: missionPlan.homeX, y: missionPlan.homeY }, ...waypoints, { x: missionPlan.homeX, y: missionPlan.homeY }];
  const routePath = coords.map(point => `${point.x},${point.y}`).join(" ");
  const stressPenalty = clamp(1 - Math.max(0, environment.windKmh - 8) * 0.004 - Math.abs(environment.ambientC - 20) * 0.002 - environment.emiLevel * 0.06, 0.35, 1);
  const degradedEndurance = enduranceH * stressPenalty;

  const updateWaypoint = (index: number, patch: Partial<MissionWaypoint>) => {
    const next = missionPlan.waypoints.map((point, i) => i === index ? { ...point, ...patch } : point);
    onMissionPlanChange({ ...missionPlan, waypoints: next });
    const point = next[index];
    if (point) setLogs(previous => [{ time: clock(), level: "SIM" as const, event: "ROUTE.WAYPOINT_EDITED", detail: `${point.id} modifié dans le plan local.` }, ...previous].slice(0, 18));
  };
  const nextWaypointId = () => {
    let number = 1;
    while (waypoints.some(point => point.id === `WP-${String(number).padStart(2, "0")}`)) number++;
    return `WP-${String(number).padStart(2, "0")}`;
  };
  const addWaypoint = () => {
    const last = waypoints.at(-1) ?? { x: missionPlan.homeX + 8, y: missionPlan.homeY - 8, altitudeM: 60, speedKmh: 35 };
    const point: MissionWaypoint = { id: nextWaypointId(), name: `Point ${waypoints.length + 1}`, x: clamp(last.x + 10, 5, 95), y: clamp(last.y - 8, 5, 95), altitudeM: last.altitudeM, speedKmh: last.speedKmh, action: "turn" };
    onMissionPlanChange({ ...missionPlan, waypoints: [...waypoints, point] });
    setSelectedWaypointId(point.id);
    setLogs(previous => [{ time: clock(), level: "SIM" as const, event: "ROUTE.WAYPOINT_ADDED", detail: `${point.id} ajouté depuis l’éditeur.` }, ...previous].slice(0, 18));
  };
  const addWaypointAt = (x: number, y: number) => {
    const last = waypoints.at(-1);
    const point: MissionWaypoint = {
      id: nextWaypointId(),
      name: `Point ${waypoints.length + 1}`,
      x: clamp(Math.round(x), 2, 98), y: clamp(Math.round(y), 2, 98),
      altitudeM: last?.altitudeM ?? 60, speedKmh: last?.speedKmh ?? 35, action: "inspection",
    };
    onMissionPlanChange({ ...missionPlan, waypoints: [...waypoints, point] });
    setSelectedWaypointId(point.id);
    setLogs(previous => [{ time: clock(), level: "SIM" as const, event: "ROUTE.WAYPOINT_ADDED", detail: `${point.name} ajouté au canevas local.` }, ...previous].slice(0, 18));
  };
  const moveWaypoint = (index: number, offset: number) => {
    const destination = index + offset;
    if (destination < 0 || destination >= waypoints.length) return;
    const next = [...waypoints];
    [next[index], next[destination]] = [next[destination], next[index]];
    onMissionPlanChange({ ...missionPlan, waypoints: next });
  };
  const planDetour = () => {
    const center = { x: 53, y: 51 }, radius = 13;
    let changed = false;
    const next = waypoints.map((point, index) => {
      const distance = Math.hypot(point.x - center.x, point.y - center.y);
      if (distance < radius + 3) {
        changed = true;
        const dx = point.x - center.x, dy = point.y - center.y;
        const length = Math.hypot(dx, dy) || 1;
        return { ...point, x: clamp(center.x + dx / length * (radius + 8), 4, 96), y: clamp(center.y + dy / length * (radius + 8), 4, 96), action: "turn" as const, name: point.name.includes("détour") ? point.name : `${point.name} · détour` };
      }
      if (!changed && index === waypoints.length - 1 && distance >= radius + 3) {
        return point;
      }
      return point;
    });
    if (!changed && next.length) {
      const index = Math.floor(next.length / 2), point = next[index];
      next[index] = { ...point, x: clamp(point.x, 4, 96), y: clamp(point.y - (point.y > center.y ? 18 : -18), 4, 96), action: "turn", name: `${point.name} · détour simulé` };
    }
    onMissionPlanChange({ ...missionPlan, waypoints: next });
    setLogs(previous => [{ time: clock(), level: "SIM" as const, event: "ROUTE.DETOUR_RECALCULATED", detail: "Détour 2D généré autour de la zone d’exclusion illustrée; à vérifier, aucun fond géographique." }, ...previous].slice(0, 18));
  };
  const setEnvironment = (patch: Partial<MissionEnvironment>) => {
    const next = { ...environment, ...patch };
    onEnvironmentChange(next);
    setLogs(previous => [{ time: clock(), level: "SIM" as const, event: "ENVIRONMENT.MODEL_UPDATED", detail: `Température ${next.ambientC} °C · vent ${next.windKmh} km/h · CEM ${Math.round(next.emiLevel * 100)} %.` }, ...previous].slice(0, 18));
  };
  const resetEnvironment = () => { setEnvironment({ ambientC: 20, windKmh: 0, emiLevel: 0 }); };
  const exportLogs = () => {
    const rows = [["heure", "niveau", "événement", "détail"], ...logs.map(entry => [entry.time, entry.level, entry.event, entry.detail])];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "journal-mission-aeromind.csv"; anchor.click(); URL.revokeObjectURL(url);
  };
  const filteredLogs = logFilter === "ALL" ? logs : logs.filter(entry => entry.level === logFilter);

  const views = [
    ["telemetry", "Télémétrie", Activity], ["tactical", "Carte SIG locale", Map], ["thermal", "Thermique IR", Thermometer], ["logs", "Journal", ClipboardList], ["mission", "Milieux extrêmes", Waypoints], ["adapter", "Banc commandes SIM", Gamepad2],
  ] as const;
  return <section className="fom-shell" aria-label="Modules de simulation tactique">
    <div className="fom-heading"><div><span className="fom-eyebrow">FLIGHT SYSTEMS / SIMULATEUR LOCAL</span><h3>Console de mission &amp; télémétrie</h3></div><span className="fom-synth-badge"><i /> SYNTHÉTIQUE · LECTURE SEULE</span></div>
    <div className="fom-tabs" role="tablist" aria-label="Vues de mission">{views.map(([id, label, Icon]) => <button key={id} id={`fom-tab-${id}`} role="tab" aria-controls={`fom-panel-${id}`} aria-selected={view === id} tabIndex={view === id ? 0 : -1} className={view === id ? "is-active" : ""} onClick={() => setView(id)}><Icon size={14} />{label}</button>)}</div>

    {view === "telemetry" && <div id="fom-panel-telemetry" role="tabpanel" aria-labelledby="fom-tab-telemetry" className="fom-content"><div className="fom-telemetry-meta"><span><Radio size={13} /> {wssFresh ? `Flux ${telemetrySource === "mavlink" ? "MAVLink" : "WSS"} reçu · lecture seule` : telemetrySource === "synthetic" ? "Feed synthétique de démonstration" : telemetryState === "connected" || telemetryState === "connecting" ? `${telemetrySource === "mavlink" ? "MAVLink" : "WSS"} · en attente d’une trame récente` : "Aucun flux · simulation locale"}</span><small>{wssFresh ? "Champs absents : valeur du modèle local; horodatage du frame affiché au journal." : "Courbes de démonstration synthétiques, non mesurées."}</small></div><div className="fom-chart-grid">
      <TelemetryChart title="Vitesse" value={(latest?.speed ?? 0).toFixed(1)} unit="km/h" values={speedData} tone="cyan" />
      <TelemetryChart title="Altitude relative" value={(latest?.altitude ?? 0).toFixed(1)} unit="m" values={altitudeData} tone="blue" />
      <TelemetryChart title="Tangage" value={(latest?.pitch ?? 0).toFixed(1)} unit="°" values={pitchData} tone="violet" />
      <TelemetryChart title="Roulis" value={(latest?.roll ?? 0).toFixed(1)} unit="°" values={rollData} tone="violet" />
      <TelemetryChart title="Batterie" value={`${(latest?.battery ?? 100).toFixed(0)}`} unit="%" values={batteryData} tone="green" />
    </div><div className="fom-kpi-strip"><span>Énergie nominale<strong>{batteryWh} Wh</strong></span><span>État scénario<strong>{demoState.toUpperCase()}</strong></span><span>WP actif<strong>{current?.id ?? "—"}</strong></span></div></div>}

    {view === "adapter" && <div id="fom-panel-adapter" role="tabpanel" aria-labelledby="fom-tab-adapter" className="fom-content">
      <section aria-label="Banc de propulsion simulé" style={{ marginBottom: 18, padding: 16, border: "1px solid rgba(117,226,220,.2)", borderRadius: 10, background: "rgba(7,19,25,.7)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><div><strong>Propulsion · banc SIM</strong><div style={{ fontSize: 11, opacity: .72, marginTop: 4 }}>Flux récent : paramètres moteur uniquement si la trame les fournit; sinon valeurs de démonstration.</div></div><label>Configuration <select value={propulsionMode} onChange={event => setPropulsionMode(event.target.value as typeof propulsionMode)}><option value="piston">Piston / essence</option><option value="jet">Turboréacteur</option><option value="hybrid">Hybride</option></select></label></div>
        <div className="fom-kpi-strip" style={{ marginTop: 14 }}><span>Carburant restant<strong>{telemetry?.fuelRemainingKg !== undefined && wssFresh ? `${telemetry.fuelRemainingKg.toFixed(2)} kg` : `${Math.max(0, 12 - tick.current * (propulsionMode === "jet" ? 0.009 : 0.0015)).toFixed(2)} kg · SIM`}</strong></span><span>Niveau carburant<strong>{telemetry?.fuelPct !== undefined && wssFresh ? `${telemetry.fuelPct.toFixed(0)} %` : `${Math.max(0, 100 - tick.current * (propulsionMode === "jet" ? 0.075 : 0.0125)).toFixed(0)} % · SIM`}</strong></span><span>{propulsionMode === "jet" ? "Poussée / RPM" : "Régime moteur"}<strong>{telemetry?.engineRpm !== undefined && wssFresh ? `${Math.round(telemetry.engineRpm)} RPM` : propulsionMode === "jet" && telemetry?.thrustN !== undefined && wssFresh ? `${telemetry.thrustN.toFixed(0)} N` : propulsionMode === "jet" ? "— · capteur absent" : `${demoState === "running" ? 3600 : 1400} RPM · SIM`}</strong></span><span>{propulsionMode === "jet" ? "Température échappement" : "Température moteur"}<strong>{telemetry?.exhaustTempC !== undefined && wssFresh ? `${telemetry.exhaustTempC.toFixed(0)} °C` : telemetry?.engineTempC !== undefined && wssFresh ? `${telemetry.engineTempC.toFixed(0)} °C` : `${propulsionMode === "jet" ? 360 : 157} °C · SIM`}</strong></span></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}><button type="button" onClick={() => setActiveIncidents(items => items.includes("overheat") ? items.filter(item => item !== "overheat") : [...items, "overheat"])} style={{ borderColor: "#ff625e", color: "#ff8a82" }}>Injecter surchauffe SIM</button><button type="button" onClick={() => setActiveIncidents(items => items.includes("fuel_leak") ? items.filter(item => item !== "fuel_leak") : [...items, "fuel_leak"])} style={{ borderColor: "#ff9a42", color: "#ffc17d" }}>Injecter fuite carburant SIM</button><button type="button" disabled={propulsionMode !== "hybrid"} onClick={() => setActiveIncidents(items => items.includes("hybrid_partial") ? items.filter(item => item !== "hybrid_partial") : [...items, "hybrid_partial"])} style={{ borderColor: "#f0c64e", color: "#f0d981" }}>Panne partielle hybride SIM</button><button type="button" onClick={() => setActiveIncidents([])}>Effacer incidents</button></div>
        {activeIncidents.length > 0 && <div role="alert" aria-live="assertive" style={{ marginTop: 12, padding: 12, border: "1px solid #ff625e", borderRadius: 8, color: "#ffd2ce", background: "rgba(120,20,24,.38)", fontWeight: 700 }}>ALERTE SIM — {activeIncidents.map(item => item === "overheat" ? "SURCHAUFFE INJECTÉE" : item === "fuel_leak" ? "FUITE CARBURANT INJECTÉE" : "PANNE HYBRIDE PARTIELLE").join(" · ")}</div>}
        <div style={{ fontSize: 11, color: "#a9bec0", marginTop: 10 }}>Alertes : {activeIncidents.length ? "incident(s) injecté(s) dans la simulation" : wssFresh && telemetry?.fuelPct !== undefined && telemetry.fuelPct <= 10 ? "BAS CARBURANT" : wssFresh && (telemetry?.engineTempC !== undefined && telemetry.engineTempC >= 220 || telemetry?.exhaustTempC !== undefined && telemetry.exhaustTempC >= 850) ? "SURCHAUFFE MOTEUR" : propulsionMode === "hybrid" ? `BASCULE MODE HYBRIDE · ${telemetry?.hybridMode ?? "état simulé"}` : "aucune alerte rapportée"}. Affichage indicatif, non certifié.</div>
      </section><SimulationOnlyAdapterPanel /></div>}

    {view === "tactical" && <div id="fom-panel-tactical" role="tabpanel" aria-labelledby="fom-tab-tactical" className="fom-content fom-map-layout"><div className="fom-tactical-map"><div className="fom-map-label">CANEVAS LOCAL · COORDONNÉES NORMALISÉES · SANS GPS</div><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Carte tactique locale. Cliquez sur un waypoint pour le sélectionner ou sur une zone vide pour ajouter un point." onClick={event => { if ((event.target as Element).closest(".fom-waypoint-marker")) return; const rect = event.currentTarget.getBoundingClientRect(); addWaypointAt((event.clientX - rect.left) / rect.width * 100, (event.clientY - rect.top) / rect.height * 100); }}><defs><pattern id="fom-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="rgba(117,226,220,.14)" strokeWidth=".35" /></pattern></defs><rect width="100" height="100" fill="url(#fom-grid)"/><circle cx="53" cy="51" r="13" className="fom-no-go-zone"/><text x="53" y="51" textAnchor="middle" className="fom-zone-label">ZONE D’EXCLUSION</text><polygon points={restrictedPolygon.map(([x, y]) => `${x},${y}`).join(" ")} fill="rgba(255,70,70,.18)" stroke="#ff625e" strokeWidth=".8" strokeDasharray="2 1" pointerEvents="none"/><text x="24" y="21" fill="#ff8a82" fontSize="2.5" pointerEvents="none">GEOFENCE SIM</text><polyline points={routePath} className="fom-route"/><circle cx={missionPlan.homeX} cy={missionPlan.homeY} r="3.5" className="fom-home"/><text x={missionPlan.homeX + 4} y={missionPlan.homeY + 2} className="fom-map-tag">BASE SIM.</text>{waypoints.map((point, index) => <g key={point.id} className="fom-waypoint-marker" role="button" tabIndex={0} aria-label={`Sélectionner ${point.name}`} onClick={event => { event.stopPropagation(); setSelectedWaypointId(point.id); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedWaypointId(point.id); } }}><circle cx={point.x} cy={point.y} r={point.id === selectedWaypoint?.id ? 3.8 : index === activeWaypoint ? 3.6 : 2.4} className={`fom-waypoint ${point.id === selectedWaypoint?.id ? "is-active" : ""}`} /><text x={point.x + 3} y={point.y - 2} className="fom-map-tag">{String(index + 1).padStart(2, "0")}</text></g>)}</svg></div><div className="fom-map-side"><strong>Plan local — {waypoints.length} waypoint(s)</strong><p>Carte de canevas sans GPS. Cliquez sur un waypoint pour le sélectionner, ou sur une zone vide pour ajouter un point. Le polygone rouge est une barrière SIM.</p>{currentWaypointInFence && <div role="alert" aria-live="assertive" style={{ padding: 10, margin: "8px 0", border: "1px solid #ff625e", color: "#ffd2ce", background: "rgba(120,20,24,.38)" }}>ALERTE GEOFENCE SIM — le waypoint actif est dans la zone interdite.</div>}{selectedWaypoint&&<small className="fom-selected-point">Sélection : {selectedWaypoint.name} · X {selectedWaypoint.x.toFixed(0)} / Y {selectedWaypoint.y.toFixed(0)}</small>}<button onClick={planDetour} disabled={!waypoints.length}><Waypoints size={14} /> Calculer un détour simulé</button><small>Revue humaine obligatoire avant toute utilisation hors simulation.</small></div></div>}

    {view === "thermal" && <div id="fom-panel-thermal" role="tabpanel" aria-labelledby="fom-tab-thermal" className="fom-content"><div className="fom-ir-banner"><Thermometer size={14} /> VUE THERMIQUE SYNTHÉTIQUE · NE PROVIENT PAS D’UN CAPTEUR IR</div><div className={`fom-ir-screen palette-${thermalPalette} ${thermalMotion ? "is-animated" : ""}`} role="img" aria-label={`Visualisation thermique synthétique, palette ${thermalPalette}, gain ${thermalGain} pour cent`}><div className="fom-ir-grid"/><div className="fom-ir-heat heat-a" style={{opacity:thermalGain/100}}/><div className="fom-ir-heat heat-b" style={{opacity:thermalGain/100}}/><div className="fom-ir-heat heat-c" style={{opacity:thermalGain/100}}/><div className="fom-ir-reticle"/><span className="fom-ir-corner">SIM · GAIN {thermalGain}%</span><span className="fom-ir-scale">38°C ━━━ 20°C ━━━ 5°C</span></div><div className="fom-ir-controls"><label>Gain thermique <strong>{thermalGain}%</strong><input aria-label="Gain de la visualisation thermique" type="range" min="10" max="100" value={thermalGain} onChange={event=>setThermalGain(Number(event.target.value))}/></label><label>Palette<select aria-label="Palette thermique" value={thermalPalette} onChange={event=>setThermalPalette(event.target.value as typeof thermalPalette)}><option value="inferno">Inferno</option><option value="ice">Glace</option><option value="mono">Monochrome</option></select></label><button aria-pressed={thermalMotion} onClick={()=>setThermalMotion(value=>!value)}>{thermalMotion?"Suspendre l’animation":"Reprendre l’animation"}</button></div><p className="fom-muted-note">Visualisation CSS de démonstration. Aucun flux vidéo ni capteur IR réel n’est utilisé.</p></div>}

    {view === "logs" && <div id="fom-panel-logs" role="tabpanel" aria-labelledby="fom-tab-logs" className="fom-content"><div className="fom-log-head"><strong><ClipboardList size={14} /> Journal de simulation · {filteredLogs.length} entrée(s)</strong><div className="fom-log-actions"><label>Filtrer<select aria-label="Filtrer le journal par niveau" value={logFilter} onChange={event=>setLogFilter(event.target.value as typeof logFilter)}><option value="ALL">Tous</option><option value="INFO">Info</option><option value="WARN">Alerte</option><option value="SIM">Simulation</option></select></label><button onClick={exportLogs}>Exporter CSV</button><button onClick={() => setLogs([{ time: clock(), level: "INFO", event: "LOG.CLEARED", detail: "Journal local réinitialisé." }])}>Effacer</button></div></div><div className="fom-log-table" role="table" aria-label="Journal structuré local"><div className="fom-log-row fom-log-header" role="row"><span>HEURE</span><span>NIVEAU</span><span>ÉVÉNEMENT</span><span>DÉTAIL</span></div>{filteredLogs.map((entry, index) => <div className="fom-log-row" role="row" key={`${entry.time}-${entry.event}-${index}`}><span>{entry.time}</span><b className={`level-${entry.level.toLowerCase()}`}>{entry.level}</b><code>{entry.event}</code><span>{entry.detail}</span></div>)}</div>{!filteredLogs.length&&<p className="fom-muted-note">Aucune entrée pour ce filtre.</p>}</div>}

    {view === "mission" && <div id="fom-panel-mission" role="tabpanel" aria-labelledby="fom-tab-mission" className="fom-content fom-mission-grid"><div className="fom-environment"><div className="fom-panel-title"><AlertTriangle size={15} /> Conditions dégradées (modèle exploratoire)<button onClick={resetEnvironment}>Réinitialiser</button></div><label>Température ambiante <strong>{environment.ambientC} °C</strong><input type="range" min="-20" max="55" step="1" value={environment.ambientC} onChange={event => setEnvironment({ ambientC: Number(event.target.value) })} /></label><label>Vent simulé <strong>{environment.windKmh} km/h</strong><input type="range" min="0" max="70" step="1" value={environment.windKmh} onChange={event => setEnvironment({ windKmh: Number(event.target.value) })} /></label><label>Perturbation CEM <strong>{Math.round(environment.emiLevel * 100)} %</strong><input type="range" min="0" max="1" step="0.05" value={environment.emiLevel} onChange={event => setEnvironment({ emiLevel: Number(event.target.value) })} /></label><div className="fom-degraded-readout"><span>Autonomie de référence<strong>{enduranceH.toFixed(2)} h</strong></span><span>Estimation dégradée<strong>{degradedEndurance.toFixed(2)} h</strong></span><small>Facteur heuristique exploratoire — non qualifié, non utilisable pour autoriser un vol.</small></div></div><div className="fom-waypoint-editor"><div className="fom-panel-title"><Waypoints size={15} /> Éditeur de route canevas <button onClick={addWaypoint}>+ Point</button></div>
      <label className="fom-operation-name">Mission / objectif libre<input aria-label="Nom ou objectif de la mission" placeholder="Ex. inspection de toiture, cartographie…" value={missionPlan.operationName ?? ""} onChange={event => onMissionPlanChange({ ...missionPlan, operationName: event.target.value })} /></label>
      <p className="fom-map-hint">Cliquez sur le canevas « Carte SIG locale » pour ajouter un point à l’endroit choisi. L’ordre de passage est celui de la liste ci-dessous.</p>
      {waypoints.length ? waypoints.map((point, index) => <div className={`fom-waypoint-edit-row ${selectedWaypointId === point.id ? "is-selected" : ""}`} key={point.id} onFocusCapture={() => setSelectedWaypointId(point.id)} onClick={() => setSelectedWaypointId(point.id)}><span>{String(index + 1).padStart(2, "0")}</span><input aria-label={`Nom du point ${index + 1}`} value={point.name} onChange={event => updateWaypoint(index, { name: event.target.value })} /><label>X<input aria-label={`Coordonnée X du point ${index + 1}`} type="number" min="0" max="100" value={point.x} onChange={event => updateWaypoint(index, { x: clamp(Number(event.target.value), 0, 100) })} /></label><label>Y<input aria-label={`Coordonnée Y du point ${index + 1}`} type="number" min="0" max="100" value={point.y} onChange={event => updateWaypoint(index, { y: clamp(Number(event.target.value), 0, 100) })} /></label><label>Alt. m<input type="number" min="0" max="300" value={point.altitudeM} onChange={event => updateWaypoint(index, { altitudeM: clamp(Number(event.target.value), 0, 300) })} /></label><label>Vitesse<input type="number" min="0" max="150" value={point.speedKmh} onChange={event => updateWaypoint(index, { speedKmh: clamp(Number(event.target.value), 0, 150) })} /></label><label>Action<select aria-label={`Action du point ${index + 1}`} value={point.action} onChange={event => updateWaypoint(index, { action: event.target.value as MissionWaypoint["action"] })}><option value="inspection">Inspection</option><option value="turn">Virage</option><option value="return">Retour</option></select></label><button aria-label={`Monter ${point.name}`} disabled={index === 0} onClick={() => moveWaypoint(index, -1)}>↑</button><button aria-label={`Descendre ${point.name}`} disabled={index === waypoints.length - 1} onClick={() => moveWaypoint(index, 1)}>↓</button><button aria-label={`Supprimer ${point.id}`} onClick={() => { const next = waypoints.filter((_, i) => i !== index); onMissionPlanChange({ ...missionPlan, waypoints: next }); setSelectedWaypointId(next[Math.min(index, next.length - 1)]?.id ?? ""); setLogs(previous => [{ time: clock(), level: "SIM" as const, event: "ROUTE.WAYPOINT_REMOVED", detail: `${point.id} supprimé du plan local.` }, ...previous].slice(0, 18)); }}>×</button></div>) : <p className="fom-muted-note">Aucun waypoint. Ajoutez un point pour construire une route de démonstration locale.</p>}<small>Les modifications réinitialisent l’approbation prévol. Pas de coordonnées GPS ni de téléversement de plan.</small></div></div>}
    <div className="fom-safety-note"><AlertTriangle size={13} /> Simulation de recherche, secours et formation uniquement. Les zones et conditions ne décrivent pas un site réel; commandes d’actionneur, largage réel et téléversement sont absents.</div>
  </section>;
}
