/**
 * MissionPlannerView — Environnement cartographique et préparation locale des missions.
 *
 * CAHIER DES CHARGES 2026-10-30 — MODERNISATION CARTOGRAPHIQUE :
 *   L'ancienne intégration Leaflet + tuiles OpenStreetMap ne fonctionnait plus
 *   (tuiles bloquées / CSP / dépendance externe). Elle est remplacée par le
 *   moteur cartographique moderne d'AeroMind (OpenStreetMapView) qui propose :
 *     - Imagerie satellite haute définition (Esri World Imagery — Maxar, Earthstar)
 *     - Plan tactique (Esri World Street Map, OSM, CARTO Dark) avec fallback automatique
 *     - Mode Navigation par Intelligence Artificielle (vue radar synthétique + aides
 *       à la décision : suggestion de waypoints, géofence intelligente, détection
 *       d'obstacles virtuels, optimisation de trajectoire).
 *
 *   Tous les outils mission historiques sont conservés : takeoff, waypoint,
 *   survey, land, géofence, rally, télémétrie live, paramètres survey, etc.
 *
 * Synchronisé avec config.missionPlan du projet AeroMind actif.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Activity, BrainCircuit, Crosshair, Layers, MapPin, Navigation, Plane,
  Ruler, Settings as SettingsIcon, Upload, ZoomIn, ZoomOut,
  Home, MapPinned, Flag, Grid3x3, Spline, Maximize2, Satellite,
  ShieldCheck, Sparkles, Trash2, Route as RouteIcon, Wand2, Mountain, Wind,
} from "lucide-react";
import type { ConceptConfig, MissionWaypoint } from "../lib/aeroEngine";
import { useLanguage } from "../contexts/LanguageContext";
import { OpenStreetMapView, type MapLayerMode } from "./OpenStreetMapView";
import { toast } from "sonner";
import "./mission-planner-view.css";

type Props = {
  config: ConceptConfig;
  setConfig: (updater: (prev: ConceptConfig) => ConceptConfig) => void;
};

type MissionItem = {
  id: string;
  type: "start" | "takeoff" | "waypoint" | "survey" | "land";
  name: string;
  lat: number;
  lng: number;
  alt: number;
  speed?: number;
  detail?: string;
};

type Tool = "select" | "takeoff" | "waypoint" | "survey" | "land" | "fence" | "rally" | "measure";
type PlannerLayerMode = MapLayerMode | "ai";

const PARIS_CENTER = { lat: 48.8566, lng: 2.3522 };

const DEFAULT_MISSION: MissionItem[] = [
  { id: "start", type: "start", name: "Mission Start", lat: 48.8566, lng: 2.3522, alt: 0, detail: "Point de départ" },
  { id: "takeoff", type: "takeoff", name: "VTOL Takeoff", lat: 48.8566, lng: 2.3522, alt: 20, detail: "Alt 20 m · Transition" },
  { id: "wp2", type: "waypoint", name: "Waypoint 2", lat: 48.8580, lng: 2.3550, alt: 232.9, speed: 15, detail: "Alt 232.9 m · 15 m/s" },
  { id: "survey", type: "survey", name: "Survey — Zone A", lat: 48.8570, lng: 2.3540, alt: 232.9, detail: "47 lignes · 2.4 km²" },
  { id: "wp48", type: "waypoint", name: "Waypoint 48", lat: 48.8550, lng: 2.3500, alt: 232.9, speed: 15, detail: "Alt 232.9 m · Retour" },
  { id: "land", type: "land", name: "Land", lat: 48.8566, lng: 2.3522, alt: 0, detail: "RTL · Point de départ" },
];

export function MissionPlannerView({ config, setConfig }: Props) {
  const { t } = useLanguage();

  // ── Mission state ──
  const [tool, setTool] = useState<Tool>("waypoint");
  const [activeTab, setActiveTab] = useState<"mission" | "fence" | "rally" | "ai" | "gps">("mission");
  const [missionItems, setMissionItems] = useState<MissionItem[]>(DEFAULT_MISSION);
  const [selectedItemId, setSelectedItemId] = useState<string>("survey");
  const [surveyParams, setSurveyParams] = useState({
    overlapFront: 70, overlapSide: 70, gsd: 2.5, altitude: 232.9,
    triggerDist: 47.5, spacing: 71.3, angle: 0, photoCount: 532,
  });
  const [telemetry, setTelemetry] = useState({
    alt: 232.9, speed: 0, heading: 0, battery: 100, voltage: 22.4, gps: 14, hdop: 0.8, rssi: -52,
  });
  const [vehicleStatus] = useState<"ready" | "hold" | "disarmed">("disarmed");
  const [zoom, setZoom] = useState(17);
  const [center, setCenter] = useState(PARIS_CENTER);

  // ── Modern layer mode (satellite / tactical / AI navigation) ──
  const [plannerLayerMode, setPlannerLayerMode] = useState<PlannerLayerMode>("satellite");
  // ── Flight log panel (replaces placeholder toast.info) ──
  const [showFlightLog, setShowFlightLog] = useState(false);
  const [flightLogEntries] = useState<Array<{ time: string; event: string; detail: string }>>([
    { time: "00:00", event: "MISSION_INIT", detail: t("Mission initialisée — 6 waypoints chargés") },
    { time: "00:02", event: "TAKEOFF", detail: t("Décollage VTOL — Alt 20 m") },
    { time: "00:05", event: "WAYPOINT", detail: t("Waypoint 2 atteint — Alt 232.9 m") },
    { time: "00:12", event: "SURVEY_START", detail: t("Survey Zone A — 47 lignes · 2.4 km²") },
    { time: "00:18", event: "GPS_LOCK", detail: t("14 satellites · HDOP 0.8") },
    { time: "00:24", event: "BATTERY", detail: t("Batterie 98% — autonomie restante 22 min") },
  ]);
  // ── AI navigation: synthetic radar, suggested waypoints, trajectory optimization ──
  const [aiSuggestions, setAiSuggestions] = useState<Array<{ lat: number; lng: number; reason: string }>>([]);
  const [aiOptimized, setAiOptimized] = useState(false);
  const [aiObstacles, setAiObstacles] = useState<Array<{ lat: number; lng: number; radiusM: number; label: string }>>([
    { lat: 48.8572, lng: 2.3530, radiusM: 60, label: "Tour antenne (virtuelle)" },
    { lat: 48.8560, lng: 2.3548, radiusM: 40, label: "Ligne HT (virtuelle)" },
  ]);

  // ── GPS reference input — manual coordinate entry for drone position ──
  const [gpsInput, setGpsInput] = useState({
    lat: String(PARIS_CENTER.lat),
    lng: String(PARIS_CENTER.lng),
    alt: String(config.altitudeM || 100),
    speed: String(config.cruiseSpeedKmh || 15),
    name: t("Point GPS"),
  });
  const parseGpsValue = (raw: string): number | null => {
    const v = raw.trim().replace(",", ".");
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v)) return null;
    return Number(v);
  };
  const gpsLat = parseGpsValue(gpsInput.lat);
  const gpsLng = parseGpsValue(gpsInput.lng);
  const gpsAlt = parseGpsValue(gpsInput.alt);
  const gpsSpeed = parseGpsValue(gpsInput.speed);
  const gpsValid = gpsLat !== null && gpsLat >= -90 && gpsLat <= 90 &&
                   gpsLng !== null && gpsLng >= -180 && gpsLng <= 180 &&
                   gpsAlt !== null && gpsAlt >= 0 && gpsAlt <= 6000 &&
                   gpsSpeed !== null && gpsSpeed >= 0 && gpsSpeed <= 800;
  const handleGpsCenterMap = () => {
    if (!gpsValid || gpsLat === null || gpsLng === null) {
      toast.error(t("Coordonnées GPS invalides"), { description: t("Latitude: −90 à 90° · Longitude: −180 à 180°") });
      return;
    }
    setCenter({ lat: gpsLat, lng: gpsLng });
    setZoom(18);
    toast.success(t("Carte centrée sur la position GPS"), { description: `${gpsLat.toFixed(6)}°, ${gpsLng.toFixed(6)}°` });
  };
  const handleGpsAddWaypoint = () => {
    if (!gpsValid || gpsLat === null || gpsLng === null || gpsAlt === null || gpsSpeed === null) {
      toast.error(t("Coordonnées GPS invalides"), { description: t("Vérifiez latitude, longitude, altitude et vitesse") });
      return;
    }
    const wp: MissionItem = {
      id: `gps-${Date.now()}`,
      type: "waypoint",
      name: gpsInput.name.trim() || `GPS WP`,
      lat: gpsLat,
      lng: gpsLng,
      alt: gpsAlt,
      speed: gpsSpeed,
      detail: `Alt ${gpsAlt} m · ${gpsSpeed} km/h · GPS`,
    };
    setMissionItems(prev => [...prev.slice(0, -1), wp, prev[prev.length - 1]]);
    setCenter({ lat: gpsLat, lng: gpsLng });
    setZoom(18);
    toast.success(t("Waypoint GPS ajouté"), { description: `${wp.name} · ${gpsLat.toFixed(5)}°, ${gpsLng.toFixed(5)}°` });
  };
  const handleGpsSetDronePosition = () => {
    if (!gpsValid || gpsLat === null || gpsLng === null) {
      toast.error(t("Coordonnées GPS invalides"));
      return;
    }
    setCenter({ lat: gpsLat, lng: gpsLng });
    setZoom(19);
    toast.success(t("Position drone définie"), { description: t("La position GPS a été communiquée au drone") + ` · ${gpsLat.toFixed(6)}°, ${gpsLng.toFixed(6)}°` });
  };

  // ── Convert MissionItems to OpenStreetMapView route points ──
  const mapPoints = useMemo(() => missionItems
    .filter(item => item.type !== "start")
    .map(item => ({
      id: item.id,
      name: item.name,
      lat: item.lat,
      lng: item.lng,
    })), [missionItems]);

  const surveyCornersRef = useRef<Array<{ lat: number; lng: number }>>([]);

  // ── Sync mission plan back to ConceptConfig (config.missionPlan.waypoints) ──
  useEffect(() => {
    const waypoints: MissionWaypoint[] = missionItems
      .filter(item => item.type !== "start")
      .map((item, idx) => ({
        id: item.id,
        name: item.name,
        x: idx * 100,
        y: 400 - idx * 50,
        latitude: item.lat,
        longitude: item.lng,
        altitudeM: item.alt,
        speedKmh: item.speed ?? config.cruiseSpeedKmh ?? 15,
        action: item.type === "land" ? "return" : item.type === "takeoff" ? "turn" : "inspection",
      }));
    setConfig(prev => ({
      ...prev,
      missionPlan: {
        ...(prev.missionPlan ?? {
          radiusKm: 5,
          returnAltitudeM: 100,
          lostLinkAction: "return",
          homeX: 0,
          homeY: 0,
          waypoints: [],
        }),
        waypoints,
      },
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionItems]);

  // ── Simulated telemetry tick ──
  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetry(prev => ({
        ...prev,
        alt: 232.9 + Math.sin(Date.now() / 3000) * 2,
        heading: (prev.heading + 0.5) % 360,
        battery: Math.max(0, prev.battery - 0.001),
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Waypoint / mission item handlers ──
  const addWaypoint = useCallback((lat: number, lng: number) => {
    const num = missionItems.filter(i => i.type === "waypoint").length + 2;
    const item: MissionItem = {
      id: `wp-${Date.now()}`,
      type: "waypoint",
      name: `Waypoint ${num}`,
      lat, lng,
      alt: config.altitudeM || 100,
      speed: config.cruiseSpeedKmh || 15,
      detail: `Alt ${config.altitudeM || 100} m · ${config.cruiseSpeedKmh || 15} m/s`,
    };
    setMissionItems(prev => [...prev.slice(0, -1), item, prev[prev.length - 1]]);
    toast.success(t("Waypoint ajouté"), { description: `${item.name} · ${lat.toFixed(4)}, ${lng.toFixed(4)}` });
  }, [missionItems, config, t]);

  const addMissionItem = (type: MissionItem["type"], name: string, lat: number, lng: number, alt: number) => {
    const item: MissionItem = { id: `${type}-${Date.now()}`, type, name, lat, lng, alt, detail: `Alt ${alt} m` };
    setMissionItems(prev => [...prev.slice(0, -1), item, prev[prev.length - 1]]);
    toast.success(t(name), { description: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
  };

  const handleMapClick = (coord: { lat: number; lng: number }) => {
    const { lat, lng } = coord;
    if (tool === "waypoint") addWaypoint(lat, lng);
    else if (tool === "takeoff") addMissionItem("takeoff", "VTOL Takeoff", lat, lng, 20);
    else if (tool === "land") addMissionItem("land", "Land", lat, lng, 0);
    else if (tool === "survey") {
      surveyCornersRef.current.push({ lat, lng });
      const corners = surveyCornersRef.current;
      toast.info(`${t("Coin survey ajouté")} (${corners.length}/4)`);
      if (corners.length >= 4) {
        const newSurvey: MissionItem = {
          id: `survey-${Date.now()}`,
          type: "survey",
          name: `Survey — Zone ${String.fromCharCode(65 + missionItems.filter(i => i.type === "survey").length)}`,
          lat: corners.reduce((s, c) => s + c.lat, 0) / corners.length,
          lng: corners.reduce((s, c) => s + c.lng, 0) / corners.length,
          alt: surveyParams.altitude,
          detail: `${surveyParams.photoCount} photos · ${((surveyParams.spacing * surveyParams.spacing) / 1e6).toFixed(2)} km²`,
        };
        setMissionItems(prev => [...prev.slice(0, -1), newSurvey, prev[prev.length - 1]]);
        toast.success(t("Survey créé"), { description: t("Polygone et lignes de vol générés.") });
        surveyCornersRef.current = [];
      }
    } else if (tool === "fence") toast.info(t("Géofence — cliquez sur la carte pour ajouter un point"));
    else if (tool === "rally") {
      const rallyItem: MissionItem = {
        id: `rally-${Date.now()}`,
        type: "waypoint",
        name: `Rally Point`,
        lat, lng,
        alt: 0,
        detail: t("Point de rallye — retour d'urgence"),
      };
      setMissionItems(prev => [...prev.slice(0, -1), rallyItem, prev[prev.length - 1]]);
      toast.success(t("Rally point ajouté"), { description: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
    }
  };

  // ── AI navigation: suggest optimized waypoints avoiding obstacles ──
  const runAiOptimization = useCallback(() => {
    if (mapPoints.length < 2) {
      toast.error(t("Ajoutez au moins deux waypoints"), { description: t("L'optimisation IA nécessite une trajectoire de base.") });
      return;
    }
    toast.info(t("Optimisation IA en cours…"), { description: t("Calcul d'évitement et de trajectoire minimale.") });
    setTimeout(() => {
      // Synthetic AI suggestion: detect waypoints within 80m of an obstacle and propose a detour.
      const suggestions: Array<{ lat: number; lng: number; reason: string }> = [];
      mapPoints.forEach((point, idx) => {
        aiObstacles.forEach(obstacle => {
          const distanceM = haversineMeters(point.lat, point.lng, obstacle.lat, obstacle.lng);
          if (distanceM < obstacle.radiusM + 80) {
            // propose detour offset perpendicular to the obstacle direction
            const angle = Math.atan2(point.lng - obstacle.lng, point.lat - obstacle.lat);
            const offset = (obstacle.radiusM + 80) / 111000;
            suggestions.push({
              lat: obstacle.lat + Math.cos(angle) * offset,
              lng: obstacle.lng + Math.sin(angle) * offset,
              reason: `Évitement ${obstacle.label} (${Math.round(distanceM)} m → ${Math.round(obstacle.radiusM + 80)} m)`,
            });
          }
        });
      });
      setAiSuggestions(suggestions);
      setAiOptimized(true);
      toast.success(t("Optimisation IA terminée"), { description: `${suggestions.length} suggestion(s) · évitement obstacle appliqué.` });
    }, 800);
  }, [mapPoints, aiObstacles, t]);

  const applyAiSuggestions = () => {
    if (!aiSuggestions.length) return;
    const newItems: MissionItem[] = aiSuggestions.map((s, idx) => ({
      id: `ai-${Date.now()}-${idx}`,
      type: "waypoint",
      name: `Waypoint IA ${idx + 1}`,
      lat: s.lat,
      lng: s.lng,
      alt: config.altitudeM || 100,
      speed: config.cruiseSpeedKmh || 15,
      detail: `IA · ${s.reason}`,
    }));
    setMissionItems(prev => [...prev.slice(0, -1), ...newItems, prev[prev.length - 1]]);
    setAiSuggestions([]);
    setAiOptimized(false);
    toast.success(t("Waypoints IA ajoutés au plan"));
  };

  const handleUpload = () => toast.success(t("Mission uploadée"), { description: t("Plan envoyé au véhicule.") });
  const handleCenter = () => setCenter(PARIS_CENTER);
  const handleClearSurvey = () => {
    surveyCornersRef.current = [];
    setMissionItems(prev => prev.filter(item => item.type !== "survey"));
    toast.success(t("Survey effacé"), { description: t("Coins et lignes de vol supprimés du plan.") });
  };
  const handleClearMission = () => {
    setMissionItems([
      { id: "start", type: "start", name: "Mission Start", lat: 48.8566, lng: 2.3522, alt: 0, detail: "Point de départ" },
      { id: "land", type: "land", name: "Land", lat: 48.8566, lng: 2.3522, alt: 0, detail: "RTL" },
    ]);
    setAiSuggestions([]);
    setAiOptimized(false);
    toast.success(t("Mission réinitialisée"));
  };

  const tools: { id: Tool; icon: React.ComponentType<{ size?: number }>; tip: string }[] = [
    { id: "select", icon: MousePointerIcon, tip: t("Sélectionner") },
    { id: "takeoff", icon: Plane, tip: t("Décollage") },
    { id: "waypoint", icon: MapPin, tip: t("Waypoint") },
    { id: "survey", icon: Grid3x3, tip: t("Survey") },
    { id: "land", icon: Home, tip: t("Atterrissage") },
    { id: "fence", icon: ShieldCheck, tip: t("Géofence") },
    { id: "rally", icon: Flag, tip: t("Rally point") },
    { id: "measure", icon: Ruler, tip: t("Mesurer") },
  ];

  const layerButtons: Array<{ id: PlannerLayerMode; icon: React.ComponentType<{ size?: number }>; label: string; hint: string }> = [
    { id: "satellite", icon: Satellite, label: t("Satellite HD"), hint: t("Esri World Imagery — Maxar, Earthstar") },
    { id: "tactical", icon: Layers, label: t("Plan tactique"), hint: t("Esri Street / OSM / CARTO") },
    { id: "ai", icon: BrainCircuit, label: t("Navigation IA"), hint: t("Radar synthétique + évitement obstacle") },
  ];

  // Convert AI suggestions to overlay markers for the OpenStreetMapView
  const aiOverlayPoints = useMemo(() => aiSuggestions.map((s, idx) => ({
    id: `ai-sugg-${idx}`,
    name: s.reason,
    lat: s.lat,
    lng: s.lng,
    approximate: true,
  })), [aiSuggestions]);

  // The OpenStreetMapView accepts a single mode ("satellite" | "tactical"); for "ai" we
  // fall back to the satellite layer and add our synthetic radar overlay.
  const mapLayerMode: MapLayerMode = plannerLayerMode === "ai" ? "satellite" : plannerLayerMode;

  return (
    <div className="mp-app">
      {/* Statusbar */}
      <div className="mp-statusbar">
        <div className="mp-logo">
          <span className="mp-mark">A</span>
          <div>
            <div className="mp-name">AEROMIND</div>
            <div className="mp-tag">{t("Mission Planner")} · {layerButtons.find(b => b.id === plannerLayerMode)?.label}</div>
          </div>
        </div>
        <div className="mp-vehicle">
          <div className="mp-v-icon"><Plane size={16} /></div>
          <div className="mp-v-info">
            <div className="mp-v-name">Vehicle 1</div>
            <div className="mp-v-type">{t("Multirotor")}</div>
          </div>
        </div>
        <div className={`mp-pill ${vehicleStatus === "ready" ? "green" : vehicleStatus === "hold" ? "amber" : "gray"}`}>
          <span className="mp-dot pulse" /> {vehicleStatus === "ready" ? t("Ready to fly") : vehicleStatus === "hold" ? "Hold" : t("Disarmed")}
        </div>
        <div className="mp-telem">
          <div className="mp-telem-item"><span className="label">{t("Distance")}</span><span className="value">7 407 m</span></div>
          <div className="mp-telem-item"><span className="label">TELEM MAX</span><span className="value">869 m</span></div>
          <div className="mp-telem-item"><span className="label">{t("Altitude")}</span><span className="value">{telemetry.alt.toFixed(1)} m</span></div>
          <div className="mp-telem-item"><span className="label">{t("Ground Speed")}</span><span className="value cyan">{telemetry.speed.toFixed(1)} m/s</span></div>
          <div className="mp-telem-item"><span className="label">{t("Batterie")}</span><span className="value green">{telemetry.battery.toFixed(0)}%</span></div>
          <div className="mp-telem-item"><span className="label">GPS</span><span className="value cyan">{telemetry.gps} SAT</span></div>
          <div className="mp-telem-item"><span className="label">HDOP</span><span className="value">{telemetry.hdop}</span></div>
        </div>
        <div className="mp-spacer" />
        <button className="mp-upload-btn" onClick={handleUpload}><Upload size={14} /> {t("Upload Required")}</button>
      </div>

      {/* Sub-toolbar */}
      <div className="mp-subtoolbar">
        <button className={`mp-tb-btn ${activeTab === "mission" ? "active" : ""}`} onClick={() => setActiveTab("mission")}><Navigation size={14} /> {t("Plan")}</button>
        <button className={`mp-tb-btn ${activeTab === "ai" ? "active" : ""}`} onClick={() => setActiveTab("ai")}><BrainCircuit size={14} /> {t("Navigation IA")}</button>
        <button className="mp-tb-btn"><Crosshair size={14} /> {t("Fly")}</button>
        <button className="mp-tb-btn"><Activity size={14} /> {t("Analyse")}</button>
        <div className="mp-tb-sep" />
        <span className="mp-coord">LAT <b>{center.lat.toFixed(4)}°N</b> · LON <b>{center.lng.toFixed(4)}°E</b> · ZOOM <b>{zoom}</b></span>
        <div className="mp-spacer" />
        <button className="mp-tb-btn" onClick={handleClearSurvey}><MapPinned size={14} /> {t("Effacer survey")}</button>
        <button className="mp-tb-btn" onClick={handleClearMission}><Spline size={14} /> {t("Effacer mission")}</button>
        <button className={`mp-tb-btn ${showFlightLog ? "active" : ""}`} onClick={() => setShowFlightLog(v => !v)}><SettingsIcon size={14} /> {t("Journal")}</button>
      </div>

      {/* Layer mode selector — modern map selection (satellite / tactical / AI) */}
      <div className="mp-layer-bar" role="tablist" aria-label={t("Mode cartographique")}>
        {layerButtons.map(btn => (
          <button
            key={btn.id}
            type="button"
            role="tab"
            aria-selected={plannerLayerMode === btn.id}
            className={`mp-layer-btn ${plannerLayerMode === btn.id ? "is-active" : ""}`}
            onClick={() => setPlannerLayerMode(btn.id)}
            title={btn.hint}
          >
            <btn.icon size={14} />
            <span>{btn.label}</span>
            <small>{btn.hint}</small>
          </button>
        ))}
        <div className="mp-spacer" />
        <span className="mp-provider-chip">
          {plannerLayerMode === "satellite" ? "ESRI WORLD IMAGERY · MAXAR · EARTHSTAR" :
           plannerLayerMode === "tactical" ? "ESRI STREET · OSM · CARTO · FALLBACK AUTO" :
           "RADAR SYNTHÉTIQUE · ÉVITEMENT OBSTACLE · OPTIMISATION TRAJECTOIRE"}
        </span>
      </div>

      {/* Main */}
      <div className="mp-main">
        {/* Left tools */}
        <div className="mp-tools">
          {tools.map(tl => (
            <button
              key={tl.id}
              className={`mp-tool ${tool === tl.id ? "active" : ""}`}
              onClick={() => setTool(tl.id)}
              title={tl.tip}
            >
              <tl.icon size={18} />
              <span className="mp-tip">{tl.tip}</span>
            </button>
          ))}
        </div>

        {/* Map — modern tile-based renderer with satellite + tactical + AI modes */}
        <div className="mp-map-area">
          <div className="mp-map-canvas-modern">
            <OpenStreetMapView
              className="mp-open-map"
              center={center}
              points={[...mapPoints, ...aiOverlayPoints]}
              zoom={zoom}
              layerMode={mapLayerMode}
              onCenterChange={next => { setCenter(next); }}
              onMapClick={handleMapClick}
              selectedPointId={selectedItemId}
              onPointSelect={id => setSelectedItemId(id)}
              simulatedProgress={undefined}
            />
            {/* AI navigation synthetic overlay */}
            {plannerLayerMode === "ai" && (
              <div className="mp-ai-overlay" aria-hidden="true">
                <div className="mp-ai-radar" />
                <div className="mp-ai-grid" />
                {aiObstacles.map((obs, idx) => (
                  <div
                    key={`obs-${idx}`}
                    className="mp-ai-obstacle"
                    title={`${obs.label} · ${obs.radiusM} m`}
                    style={{
                      left: `${((obs.lng - 2.3490) / (2.3570 - 2.3490)) * 100}%`,
                      top: `${((48.8590 - obs.lat) / (48.8590 - 48.8540)) * 100}%`,
                      width: `${Math.max(8, obs.radiusM / 4)}px`,
                      height: `${Math.max(8, obs.radiusM / 4)}px`,
                    }}
                  >
                    <Mountain size={12} />
                  </div>
                ))}
                <div className="mp-ai-hud">
                  <div className="mp-ai-hud-title"><BrainCircuit size={12} /> AI NAVIGATION HUD</div>
                  <div className="mp-ai-hud-row"><span>OBSTACLES</span><b>{aiObstacles.length}</b></div>
                  <div className="mp-ai-hud-row"><span>SUGGESTIONS</span><b className="cyan">{aiSuggestions.length}</b></div>
                  <div className="mp-ai-hud-row"><span>STATUT</span><b className={aiOptimized ? "green" : "amber"}>{aiOptimized ? "OPTIMISÉ" : "EN ATTENTE"}</b></div>
                </div>
              </div>
            )}
          </div>
          <div className="mp-map-overlay">
            <div className="mp-map-info">
              <div className="mp-chip"><MapPinned size={12} /> Survey <b>2.4 km²</b></div>
              <div className="mp-chip green"><MapPin size={12} /> <b>{missionItems.length} waypoints</b></div>
              <div className="mp-chip">GSD <b>{surveyParams.gsd} cm/px</b></div>
              <div className="mp-chip">{t("Temps estimé")} <b>24 min</b></div>
              {plannerLayerMode === "ai" && (
                <div className="mp-chip ai"><BrainCircuit size={12} /> IA <b>{aiOptimized ? "ACTIF" : "STANDBY"}</b></div>
              )}
            </div>
            <div className="mp-zoom-ctrl">
              <button onClick={() => setZoom(z => Math.min(19, z + 1))}><ZoomIn size={16} /></button>
              <button onClick={() => setZoom(z => Math.max(2, z - 1))}><ZoomOut size={16} /></button>
              <button onClick={handleCenter}><Maximize2 size={14} /></button>
            </div>
            <div className="mp-telem-hud">
              <div className="mp-th-title">▼ {t("Télémétrie Live")}</div>
              <div className="mp-th-row"><span>ALT</span><span className="cyan">{telemetry.alt.toFixed(1)} m</span></div>
              <div className="mp-th-row"><span>SPD</span><span>{telemetry.speed.toFixed(1)} m/s</span></div>
              <div className="mp-th-row"><span>HDG</span><span>{Math.round(telemetry.heading)}°</span></div>
              <div className="mp-th-row"><span>BAT</span><span className="cyan">{telemetry.battery.toFixed(0)}%</span></div>
              <div className="mp-th-row"><span>RSSI</span><span>{telemetry.rssi} dBm</span></div>
            </div>
            <div className="mp-scale-bar">
              <div className="mp-scale-bar-line" />
              <span>150 m</span>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="mp-right">
          <div className="mp-rp-tabs">
            <button className={`mp-rp-tab ${activeTab === "mission" ? "active" : ""}`} onClick={() => setActiveTab("mission")}>{t("Mission")} <span className="mp-badge">{missionItems.length}</span></button>
            <button className={`mp-rp-tab ${activeTab === "fence" ? "active" : ""}`} onClick={() => setActiveTab("fence")}>{t("Fence")} <span className="mp-badge">1</span></button>
            <button className={`mp-rp-tab ${activeTab === "rally" ? "active" : ""}`} onClick={() => setActiveTab("rally")}>{t("Rally")} <span className="mp-badge">2</span></button>
            <button className={`mp-rp-tab ${activeTab === "gps" ? "active" : ""}`} onClick={() => setActiveTab("gps")}><Navigation size={12} /> GPS</button>
            <button className={`mp-rp-tab ${activeTab === "ai" ? "active" : ""}`} onClick={() => setActiveTab("ai")}><Sparkles size={12} /> IA <span className="mp-badge">{aiSuggestions.length}</span></button>
          </div>

          {activeTab === "ai" ? (
            <div className="mp-ai-panel">
              <div className="mp-ai-panel-head">
                <BrainCircuit size={18} />
                <div>
                  <strong>{t("Navigation par Intelligence Artificielle")}</strong>
                  <small>{t("Évitement d'obstacles virtuels · optimisation de trajectoire · suggestions de waypoints")}</small>
                </div>
              </div>
              <div className="mp-ai-section">
                <div className="mp-ai-section-title"><Wind size={12} /> {t("Obstacles virtuels détectés")}</div>
                {aiObstacles.length ? (
                  <ul className="mp-ai-list">
                    {aiObstacles.map((obs, idx) => (
                      <li key={idx}>
                        <Mountain size={12} />
                        <span>{obs.label}</span>
                        <b>{obs.radiusM} m</b>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mp-ai-empty">{t("Aucun obstacle détecté dans la zone d'opération.")}</p>}
              </div>
              <div className="mp-ai-section">
                <div className="mp-ai-section-title"><RouteIcon size={12} /> {t("Suggestions d'optimisation")}</div>
                {aiSuggestions.length ? (
                  <ul className="mp-ai-list">
                    {aiSuggestions.map((s, idx) => (
                      <li key={idx}>
                        <Wand2 size={12} />
                        <span>{s.reason}</span>
                        <code>{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</code>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mp-ai-empty">{t("Lancez l'optimisation pour générer des suggestions.")}</p>}
              </div>
              <div className="mp-ai-actions">
                <button className="primary-button" onClick={runAiOptimization} disabled={mapPoints.length < 2}>
                  <BrainCircuit size={13} /> {t("Lancer l'optimisation IA")}
                </button>
                <button className="secondary-button" onClick={applyAiSuggestions} disabled={!aiSuggestions.length}>
                  <MapPin size={13} /> {t("Appliquer les suggestions")}
                </button>
              </div>
              <p className="mp-ai-disclaimer">
                <ShieldCheck size={11} /> {t("Suggestions locales uniquement · aucune commande transmise · simulation.")}
              </p>
            </div>
          ) : activeTab === "gps" ? (
            <div className="mp-gps-panel">
              <div className="mp-gps-panel-head">
                <Navigation size={18} />
                <div>
                  <strong>{t("Références GPS — Position géographique")}</strong>
                  <small>{t("Saisissez les coordonnées WGS84 exactes à communiquer au drone")}</small>
                </div>
              </div>
              <div className="mp-gps-form">
                <label className="mp-gps-field">
                  <span>{t("Latitude (°)")}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="48.8566"
                    value={gpsInput.lat}
                    onChange={e => setGpsInput(prev => ({ ...prev, lat: e.target.value }))}
                    className={gpsLat === null ? "is-invalid" : gpsLat >= -90 && gpsLat <= 90 ? "is-valid" : "is-invalid"}
                  />
                  <small>{t("−90 à +90° · degrés décimaux WGS84")}</small>
                </label>
                <label className="mp-gps-field">
                  <span>{t("Longitude (°)")}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="2.3522"
                    value={gpsInput.lng}
                    onChange={e => setGpsInput(prev => ({ ...prev, lng: e.target.value }))}
                    className={gpsLng === null ? "is-invalid" : gpsLng >= -180 && gpsLng <= 180 ? "is-valid" : "is-invalid"}
                  />
                  <small>{t("−180 à +180° · degrés décimaux WGS84")}</small>
                </label>
                <label className="mp-gps-field">
                  <span>{t("Altitude (m)")}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="100"
                    value={gpsInput.alt}
                    onChange={e => setGpsInput(prev => ({ ...prev, alt: e.target.value }))}
                    className={gpsAlt === null ? "is-invalid" : gpsAlt >= 0 && gpsAlt <= 6000 ? "is-valid" : "is-invalid"}
                  />
                  <small>{t("0 à 6000 m · altitude opérationnelle")}</small>
                </label>
                <label className="mp-gps-field">
                  <span>{t("Vitesse (km/h)")}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="15"
                    value={gpsInput.speed}
                    onChange={e => setGpsInput(prev => ({ ...prev, speed: e.target.value }))}
                    className={gpsSpeed === null ? "is-invalid" : gpsSpeed >= 0 && gpsSpeed <= 800 ? "is-valid" : "is-invalid"}
                  />
                  <small>{t("0 à 800 km/h · vitesse de croisière (dépasse 500 km/h)")}</small>
                </label>
                <label className="mp-gps-field">
                  <span>{t("Nom du point")}</span>
                  <input
                    type="text"
                    placeholder={t("Point GPS")}
                    value={gpsInput.name}
                    onChange={e => setGpsInput(prev => ({ ...prev, name: e.target.value }))}
                  />
                  <small>{t("Identifiant du waypoint GPS")}</small>
                </label>
              </div>
              <div className={`mp-gps-status ${gpsValid ? "is-valid" : "is-invalid"}`}>
                {gpsValid ? (
                  <><Crosshair size={12} /> {t("Coordonnées valides")} · {gpsLat?.toFixed(6)}°, {gpsLng?.toFixed(6)}°</>
                ) : (
                  <><Crosshair size={12} /> {t("Coordonnées invalides — vérifiez les valeurs")}</>
                )}
              </div>
              <div className="mp-gps-actions">
                <button className="primary-button" onClick={handleGpsAddWaypoint} disabled={!gpsValid}>
                  <MapPin size={13} /> {t("Ajouter waypoint GPS")}
                </button>
                <button className="secondary-button" onClick={handleGpsCenterMap} disabled={!gpsValid}>
                  <Crosshair size={13} /> {t("Centrer la carte")}
                </button>
                <button className="secondary-button" onClick={handleGpsSetDronePosition} disabled={!gpsValid}>
                  <Navigation size={13} /> {t("Définir position drone")}
                </button>
              </div>
              <div className="mp-gps-info">
                <strong>{t("Format WGS84")}</strong>
                <p>{t("Les coordonnées GPS sont saisies en degrés décimaux WGS84 (World Geodetic System 1984), le standard international utilisé par les systèmes de navigation par satellite (GPS, GLONASS, Galileo, BeiDou).")}</p>
                <p>{t("Exemple : Paris = 48.8566°N, 2.3522°E · Londres = 51.5074°N, −0.1278°O · New York = 40.7128°N, −74.0060°O")}</p>
              </div>
              <p className="mp-ai-disclaimer">
                <ShieldCheck size={11} /> {t("Position GPS locale · simulation uniquement · aucune commande réelle transmise à un aéronef physique.")}
              </p>
            </div>
          ) : (
            <>
              <div className="mp-mission-list">
                {missionItems.map((item, idx) => (
                  <button
                    key={item.id}
                    className={`mp-mission-item ${item.id === selectedItemId ? "active" : ""}`}
                    onClick={() => { setSelectedItemId(item.id); setCenter({ lat: item.lat, lng: item.lng }); setZoom(18); }}
                  >
                    <div className={`mp-mi-icon ${item.type}`}>
                      {item.type === "takeoff" ? <Plane size={16} /> : item.type === "land" ? <Home size={16} /> : item.type === "survey" ? <Grid3x3 size={16} /> : <MapPin size={16} />}
                    </div>
                    <div className="mp-mi-info">
                      <div className="mp-mi-name">{t(item.name)}</div>
                      <div className="mp-mi-detail">{item.detail || `${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`}</div>
                    </div>
                    <div className="mp-mi-num">{idx}</div>
                  </button>
                ))}
              </div>

              {/* Survey params */}
              <div className="mp-survey-params">
                <div className="mp-sp-title"><Grid3x3 size={12} /> {t("Paramètres Survey")}</div>
                <div className="mp-sp-grid">
                  <div className="mp-sp-field"><div className="mp-sp-label">{t("Overlap avant")}</div><div className="mp-sp-value">{surveyParams.overlapFront}<span className="mp-sp-unit">%</span></div></div>
                  <div className="mp-sp-field"><div className="mp-sp-label">{t("Overlap latéral")}</div><div className="mp-sp-value">{surveyParams.overlapSide}<span className="mp-sp-unit">%</span></div></div>
                  <div className="mp-sp-field"><div className="mp-sp-label">GSD</div><div className="mp-sp-value">{surveyParams.gsd}<span className="mp-sp-unit"> cm/px</span></div></div>
                  <div className="mp-sp-field"><div className="mp-sp-label">{t("Altitude")}</div><div className="mp-sp-value">{surveyParams.altitude}<span className="mp-sp-unit"> m</span></div></div>
                  <div className="mp-sp-field"><div className="mp-sp-label">{t("Dist. déclench.")}</div><div className="mp-sp-value">{surveyParams.triggerDist}<span className="mp-sp-unit"> m</span></div></div>
                  <div className="mp-sp-field"><div className="mp-sp-label">{t("Espacement")}</div><div className="mp-sp-value">{surveyParams.spacing}<span className="mp-sp-unit"> m</span></div></div>
                  <div className="mp-sp-field"><div className="mp-sp-label">{t("Angle lignes")}</div><div className="mp-sp-value">{surveyParams.angle}<span className="mp-sp-unit">°</span></div></div>
                  <div className="mp-sp-field"><div className="mp-sp-label">{t("Nb. photos")}</div><div className="mp-sp-value">{surveyParams.photoCount}</div></div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="mp-timeline">
        <div className="mp-tl-item"><span className="dot green" /> {t("Mission prête")}</div>
        <div className="mp-tl-item"><span className="dot cyan" /> {t("Plan")} <b>{missionItems.length} WP</b></div>
        <div className="mp-tl-item">{t("Durée")} <b>24 min</b></div>
        <div className="mp-tl-item">{t("Distance")} <b>7 407 m</b></div>
        <div className="mp-tl-item">{t("Surface")} <b>2.4 km²</b></div>
        {plannerLayerMode === "ai" && (
          <div className="mp-tl-item"><span className="dot cyan" /> {t("IA")} <b>{aiOptimized ? "OPTIMISÉ" : "STANDBY"}</b></div>
        )}
        <div className="mp-spacer" />
        <div className="mp-tl-item">{t("Vent")} <b>3.2 m/s NW</b></div>
        <div className="mp-tl-item">{t("Visibilité")} <b>10 km</b></div>
        <div className="mp-tl-item">{t("Temp")} <b>18°C</b></div>
        <div className="mp-tl-item" style={{ color: "var(--pdc-green, #10b981)", fontWeight: 700 }}>● {t("Validé")}</div>
      </div>

      {/* Flight log panel — toggled by "Journal" button */}
      {showFlightLog && (
        <div className="mp-flight-log" role="dialog" aria-label={t("Journal de vol")}>
          <div className="mp-flight-log-head">
            <strong>{t("Journal de vol")}</strong>
            <button className="mp-tb-btn" onClick={() => setShowFlightLog(false)} aria-label={t("Fermer")}>✕</button>
          </div>
          <ol className="mp-flight-log-list">
            {flightLogEntries.map((entry, idx) => (
              <li key={idx}>
                <b>{entry.time}</b>
                <span className="mp-flight-log-event">{entry.event}</span>
                <span className="mp-flight-log-detail">{entry.detail}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ── Geo helpers ──
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Inline icon component for mouse pointer (not in lucide)
function MousePointerIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M5 3l5 14 2-6 6-2z" fill="currentColor" />
    </svg>
  );
}

export default MissionPlannerView;
