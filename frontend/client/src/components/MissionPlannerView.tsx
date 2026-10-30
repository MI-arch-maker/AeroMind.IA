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
import { optimizeMissionRoute } from "../lib/missionRouteOptimizer";
import { useLanguage } from "../contexts/LanguageContext";
import { OpenStreetMapView, type MapLayerMode } from "./OpenStreetMapView";
import { toast } from "sonner";
import { parseWgs84Coordinates } from "../lib/wgs84Coordinates";
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
  action?: MissionWaypoint["action"];
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
  const [gpsLatitude, setGpsLatitude] = useState("");
  const [gpsLongitude, setGpsLongitude] = useState("");
  const [gpsWaypointName, setGpsWaypointName] = useState("");
  const [missionItems, setMissionItems] = useState<MissionItem[]>(() => {
    const saved = config.missionPlan?.waypoints ?? [];
    if (!saved.length) return DEFAULT_MISSION;
    return saved.map((point, index) => ({
      id: point.id,
      type: "waypoint" as const,
      name: point.name || `Waypoint ${index + 1}`,
      lat: point.latitude ?? Math.max(-85, Math.min(85, 90 - point.y * 1.8)),
      lng: point.longitude ?? point.x * 3.6 - 180,
      alt: point.altitudeM,
      speed: point.speedKmh,
      detail: `Alt ${point.altitudeM} m · ${point.speedKmh} km/h`,
      action: point.action,
    }));
  });
  const [selectedItemId, setSelectedItemId] = useState<string>(() => config.missionPlan?.waypoints[0]?.id ?? "survey");
  const [hasUserEditedMission, setHasUserEditedMission] = useState(false);
  const [fencePoints, setFencePoints] = useState<Array<{ id: string; name: string; lat: number; lng: number; approximate: boolean }>>([]);
  const [rallyPoints, setRallyPoints] = useState<Array<{ id: string; name: string; lat: number; lng: number; approximate: boolean }>>([]);
  const measureStart = useRef<{ lat: number; lng: number } | null>(null);
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
  // ── AI navigation: synthetic radar, suggested waypoints, trajectory optimization ──
  const [aiSuggestions, setAiSuggestions] = useState<Array<{ lat: number; lng: number; reason: string; originalId?: string }>>([]);
  const [aiOptimized, setAiOptimized] = useState(false);
  const [aiObstacles, setAiObstacles] = useState<Array<{ lat: number; lng: number; radiusM: number; label: string }>>([
    { lat: 48.8572, lng: 2.3530, radiusM: 60, label: "Tour antenne (virtuelle)" },
    { lat: 48.8560, lng: 2.3548, radiusM: 40, label: "Ligne HT (virtuelle)" },
  ]);

  // ── Convert MissionItems to OpenStreetMapView route points ──
  const mapPoints = useMemo(() => missionItems
    .filter(item => item.type !== "start")
    .map(item => ({
      id: item.id,
      name: item.name,
      lat: item.lat,
      lng: item.lng,
    })), [missionItems]);
  const routeDistanceM = useMemo(() => mapPoints.slice(1).reduce(
    (distance, point, index) => distance + haversineMeters(
      mapPoints[index].lat,
      mapPoints[index].lng,
      point.lat,
      point.lng,
    ),
    0,
  ), [mapPoints]);
  const localCruiseSpeedKmh = Math.min(config.cruiseSpeedKmh || 15, 300);
  const routeDurationMin = routeDistanceM > 0 && localCruiseSpeedKmh > 0
    ? Math.round((routeDistanceM / 1000 / localCruiseSpeedKmh) * 60)
    : 0;

  const surveyCornersRef = useRef<Array<{ lat: number; lng: number }>>([]);

  // ── Sync mission plan back to ConceptConfig (config.missionPlan.waypoints) ──
  useEffect(() => {
    // Default demo items stay view-local; only an explicit user edit updates the project.
    if (!hasUserEditedMission) return;
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
        action: item.action ?? (item.type === "land" ? "return" : item.type === "takeoff" ? "turn" : "inspection"),
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
        waypoints: waypoints.map((point, index) => {
          const original = prev.missionPlan?.waypoints.find(saved => saved.id === point.id);
          return original ? { ...point, x: original.x, y: original.y, action: original.action } : point;
        }),
      },
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionItems, hasUserEditedMission]);

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
    setHasUserEditedMission(true);
    const num = missionItems.filter(i => i.type === "waypoint").length + 2;
    const item: MissionItem = {
      id: `wp-${Date.now()}`,
      type: "waypoint",
      name: `Waypoint ${num}`,
      lat, lng,
      alt: config.altitudeM || 100,
      speed: Math.min(config.cruiseSpeedKmh || 15, 300),
      detail: `Alt ${config.altitudeM || 100} m · ${Math.min(config.cruiseSpeedKmh || 15, 300)} km/h`,
    };
    setMissionItems(prev => { const insertAt = prev.at(-1)?.type === "land" ? prev.length - 1 : prev.length; return [...prev.slice(0, insertAt), item, ...prev.slice(insertAt)]; });
    toast.success(t("Waypoint ajouté"), { description: `${item.name} · ${lat.toFixed(4)}, ${lng.toFixed(4)}` });
  }, [missionItems, config, t]);

  const addGpsWaypoint = () => {
    const coordinates = parseWgs84Coordinates(gpsLatitude, gpsLongitude);
    if (!coordinates.valid) {
      toast.error(t("Coordonnées GPS invalides"), { description: t(coordinates.error) });
      return;
    }
    const { latitude, longitude } = coordinates;
    const name = gpsWaypointName.trim() || `Waypoint GPS ${missionItems.filter(item => item.type === "waypoint").length + 1}`;
    const altitudeM = Math.max(0, config.altitudeM || 100);
    const speedKmh = Math.min(config.cruiseSpeedKmh || 15, 300);
    const item: MissionItem = {
      id: `gps-${Date.now()}`,
      type: "waypoint",
      name,
      lat: latitude,
      lng: longitude,
      alt: altitudeM,
      speed: speedKmh,
      detail: `WGS84 · ${latitude.toFixed(6)}, ${longitude.toFixed(6)} · Alt ${altitudeM} m · ${speedKmh} km/h`,
    };
    const baseItems = config.missionPlan?.waypoints?.length || hasUserEditedMission
      ? missionItems
      : [];
    setMissionItems(prev => {
      const base = baseItems.length ? prev : [];
      const insertAt = base.at(-1)?.type === "land" ? base.length - 1 : base.length;
      return [...base.slice(0, insertAt), item, ...base.slice(insertAt)];
    });
    setHasUserEditedMission(true);
    setSelectedItemId(item.id);
    setCenter({ lat: latitude, lng: longitude });
    setZoom(18);
    setAiSuggestions([]);
    setAiOptimized(false);
    setGpsLatitude("");
    setGpsLongitude("");
    setGpsWaypointName("");
    toast.success(t("Coordonnée ajoutée au plan local"), {
      description: `${latitude.toFixed(6)}, ${longitude.toFixed(6)} · WGS84 · aucune transmission au drone`,
    });
  };

  const addMissionItem = (type: MissionItem["type"], name: string, lat: number, lng: number, alt: number) => {
    setHasUserEditedMission(true);
    const item: MissionItem = { id: `${type}-${Date.now()}`, type, name, lat, lng, alt, detail: `Alt ${alt} m` };
    setMissionItems(prev => { const insertAt = prev.at(-1)?.type === "land" ? prev.length - 1 : prev.length; return [...prev.slice(0, insertAt), item, ...prev.slice(insertAt)]; });
    toast.success(t(name), { description: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
  };

  const handleMapClick = (coord: { lat: number; lng: number }) => {
    const { lat, lng } = coord;
    if (tool === "select") return;
    if (tool === "waypoint") addWaypoint(lat, lng);
    else if (tool === "takeoff") addMissionItem("takeoff", "VTOL Takeoff", lat, lng, 20);
    else if (tool === "land") addMissionItem("land", "Land", lat, lng, 0);
    else if (tool === "survey") {
      surveyCornersRef.current.push({ lat, lng });
      const corners = surveyCornersRef.current;
      toast.info(`${t("Coin survey ajouté")} (${corners.length}/4)`);
      if (corners.length >= 4) {
        setHasUserEditedMission(true);
        const minLat = Math.min(...corners.map(point => point.lat));
        const maxLat = Math.max(...corners.map(point => point.lat));
        const minLng = Math.min(...corners.map(point => point.lng));
        const maxLng = Math.max(...corners.map(point => point.lng));
        const areaKm2 = haversineMeters(minLat, minLng, minLat, maxLng) * haversineMeters(minLat, minLng, maxLat, minLng) / 1_000_000;
        const newSurvey: MissionItem = {
          id: `survey-${Date.now()}`,
          type: "survey",
          name: `Survey — Zone ${String.fromCharCode(65 + missionItems.filter(i => i.type === "survey").length)}`,
          lat: corners.reduce((sum, point) => sum + point.lat, 0) / corners.length,
          lng: corners.reduce((sum, point) => sum + point.lng, 0) / corners.length,
          alt: surveyParams.altitude,
          detail: `${surveyParams.photoCount} photos · ${areaKm2.toFixed(2)} km² · paramètres de recouvrement ${surveyParams.overlapFront}/${surveyParams.overlapSide}%`,
        };
        setMissionItems(prev => { const insertAt = prev.at(-1)?.type === "land" ? prev.length - 1 : prev.length; return [...prev.slice(0, insertAt), newSurvey, ...prev.slice(insertAt)]; });
        toast.success(t("Survey enregistré"), { description: t("Emprise estimée depuis quatre coins; les lignes de vol ne sont pas générées par ce prototype.") });
        surveyCornersRef.current = [];
      }
    } else if (tool === "fence") {
      setFencePoints(prev => [...prev, { id: `fence-${Date.now()}`, name: `Limite ${prev.length + 1}`, lat, lng, approximate: false }]);
      toast.success(t("Point de géofence ajouté"));
    } else if (tool === "rally") {
      setRallyPoints(prev => [...prev, { id: `rally-${Date.now()}`, name: `Rally ${prev.length + 1}`, lat, lng, approximate: false }]);
      toast.success(t("Point de rassemblement ajouté"));
    } else if (tool === "measure") {
      if (!measureStart.current) {
        measureStart.current = { lat, lng };
        toast.info(t("Point de départ de mesure posé; cliquez le second point."));
      } else {
        const distance = haversineMeters(measureStart.current.lat, measureStart.current.lng, lat, lng);
        measureStart.current = null;
        toast.success(t("Distance mesurée"), { description: `${distance >= 1000 ? `${(distance / 1000).toFixed(2)} km` : `${Math.round(distance)} m`} · estimation cartographique` });
      }
    }
  };

  // ── Local deterministic route advice (simulation only; never sends vehicle commands) ──
  const runAiOptimization = useCallback(() => {
    if (mapPoints.length < 2) {
      setAiOptimized(false);
      setAiSuggestions([]);
      toast.error(t("Ajoutez au moins deux waypoints"), { description: t("L’optimisation locale nécessite une trajectoire de base.") });
      return;
    }
    const result = optimizeMissionRoute(mapPoints, aiObstacles, { clearanceM: 20 });
    if (!result.feasible) {
      setAiSuggestions([]);
      setAiOptimized(false);
      toast.error(t("Optimisation locale impossible"), { description: result.reason });
      return;
    }
    const suggestions: Array<{ lat: number; lng: number; reason: string; originalId?: string }> = [];
    let originalIndex = 0;
    for (const point of result.points) {
      const original = mapPoints[originalIndex];
      if (original && Math.abs(point.lat - original.lat) < 1e-9 && Math.abs(point.lng - original.lng) < 1e-9) {
        suggestions.push({ ...point, reason: "Point original conservé", originalId: original.id });
        originalIndex++;
      } else suggestions.push({ ...point, reason: "Détour local calculé" });
    }
    if (originalIndex !== mapPoints.length || result.points.length === 0) {
      setAiSuggestions([]);
      setAiOptimized(false);
      toast.error(t("Optimisation locale impossible"), { description: t("Le résultat ne conserve pas tous les points du plan dans leur ordre initial.") });
      return;
    }
    if (result.detourCount === 0) {
      setAiSuggestions([]);
      setAiOptimized(false);
      toast.info(t("Aucun détour requis"), { description: t("La trajectoire ne croise pas les obstacles virtuels configurés; le plan reste inchangé.") });
      return;
    }
    setAiSuggestions(suggestions);
    setAiOptimized(true);
    toast.success(t("Aide d’optimisation locale prête"), { description: `${result.detourCount} détour(s) · ${Math.round(result.totalDistanceM)} m · simulation uniquement; rien n’est appliqué.` });
  }, [mapPoints, aiObstacles, t]);

  const applyAiSuggestions = () => {
    if (!aiSuggestions.length) return;
    if (!aiSuggestions.length || !aiSuggestions.some(s => !s.originalId)) return;
    const source = new Map(missionItems.filter(item => item.type !== "start").map(item => [item.id, item]));
    if (aiSuggestions.filter(s => s.originalId).some(s => !source.has(s.originalId!))) {
      toast.error(t("Plan modifié"), { description: t("Recalculez l’aide avant de l’appliquer.") });
      return;
    }
    const newItems: MissionItem[] = aiSuggestions.map((s, idx) => s.originalId
      ? { ...source.get(s.originalId)!, lat: s.lat, lng: s.lng }
      : { id: `route-detour-${Date.now()}-${idx}`, type: "waypoint", name: `Détour local ${idx + 1}`, lat: s.lat, lng: s.lng, alt: config.altitudeM || 100, speed: Math.min(config.cruiseSpeedKmh || 15, 300), detail: `Simulation · ${s.reason}` });
    setHasUserEditedMission(true);
    setMissionItems(prev => [...prev.filter(item => item.type === "start"), ...newItems]);
    setAiSuggestions([]);
    setAiOptimized(false);
    toast.success(t("Itinéraire local appliqué au plan"));
  };

  const handleUpload = () => toast.error(t("Téléversement indisponible dans le planificateur local"), { description: t("Le plan reste local; aucune mission n’a été envoyée à un véhicule.") });
  const handleCenter = () => setCenter(PARIS_CENTER);
  const handleClearSurvey = () => {
    surveyCornersRef.current = [];
    setMissionItems(prev => prev.filter(item => item.type !== "survey"));
    toast.success(t("Surveys et coins de survey effacés"));
  };
  const handleClearMission = () => {
    setHasUserEditedMission(true);
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
        <button className="mp-upload-btn" onClick={handleUpload} title={t("Plan local uniquement; téléversement non disponible")}><Upload size={14} /> {t("Upload Required · indisponible")}</button>
      </div>

      {/* Sub-toolbar */}
      <div className="mp-subtoolbar">
        <button className={`mp-tb-btn ${activeTab === "mission" ? "active" : ""}`} onClick={() => setActiveTab("mission")}><Navigation size={14} /> {t("Plan")}</button>
        <button className={`mp-tb-btn ${activeTab === "ai" ? "active" : ""}`} onClick={() => setActiveTab("ai")}><BrainCircuit size={14} /> {t("Navigation IA")}</button>
        <button className="mp-tb-btn" disabled title={t("Contrôle de vol indisponible dans ce planificateur local")}><Crosshair size={14} /> {t("Fly · indisponible")}</button>
        <button className="mp-tb-btn" disabled title={t("Analyse complète non implémentée dans cette vue")}><Activity size={14} /> {t("Analyse · indisponible")}</button>
        <div className="mp-tb-sep" />
        <span className="mp-coord">LAT <b>{center.lat.toFixed(4)}°N</b> · LON <b>{center.lng.toFixed(4)}°E</b> · ZOOM <b>{zoom}</b></span>
        <div className="mp-spacer" />
        <button className="mp-tb-btn" onClick={handleClearSurvey}><MapPinned size={14} /> {t("Effacer survey")}</button>
        <button className="mp-tb-btn" onClick={handleClearMission}><Spline size={14} /> {t("Effacer mission")}</button>
        <button className="mp-tb-btn" disabled title={t("Journal de vol non disponible dans cette vue")}><SettingsIcon size={14} /> {t("Journal · indisponible")}</button>
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
              points={[...mapPoints, ...aiOverlayPoints, ...fencePoints, ...rallyPoints]}
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
              <div className="mp-th-title">▼ {t("Télémétrie simulée · aucune liaison avion")}</div>
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
            <button className={`mp-rp-tab ${activeTab === "gps" ? "active" : ""}`} onClick={() => setActiveTab("gps")}><MapPinned size={12} /> {t("GPS")}</button>
            <button className={`mp-rp-tab ${activeTab === "fence" ? "active" : ""}`} onClick={() => setActiveTab("fence")}>{t("Fence")} <span className="mp-badge">{fencePoints.length}</span></button>
            <button className={`mp-rp-tab ${activeTab === "rally" ? "active" : ""}`} onClick={() => setActiveTab("rally")}>{t("Rally")} <span className="mp-badge">{rallyPoints.length}</span></button>
            <button className={`mp-rp-tab ${activeTab === "ai" ? "active" : ""}`} onClick={() => setActiveTab("ai")}><Sparkles size={12} /> IA <span className="mp-badge">{aiSuggestions.length}</span></button>
          </div>

          {activeTab === "gps" ? (
            <form className="mp-gps-panel mp-ai-panel" onSubmit={event => { event.preventDefault(); addGpsWaypoint(); }}>
              <div className="mp-ai-panel-head">
                <MapPinned size={18} />
                <div>
                  <strong>{t("Saisie d’une position GPS")}</strong>
                  <small>{t("Coordonnées géographiques WGS84 en degrés décimaux.")}</small>
                </div>
              </div>
              <label className="mp-gps-field">
                {t("Latitude WGS84 (°)")}
                <input type="number" inputMode="decimal" step="any" min="-90" max="90" required value={gpsLatitude} onChange={event => setGpsLatitude(event.target.value)} placeholder="48.856613" />
              </label>
              <label className="mp-gps-field">
                {t("Longitude WGS84 (°)")}
                <input type="number" inputMode="decimal" step="any" min="-180" max="180" required value={gpsLongitude} onChange={event => setGpsLongitude(event.target.value)} placeholder="2.352222" />
              </label>
              <label className="mp-gps-field">
                {t("Nom du point (facultatif)")}
                <input type="text" maxLength={80} value={gpsWaypointName} onChange={event => setGpsWaypointName(event.target.value)} placeholder={t("Waypoint GPS")} />
              </label>
              <p className="mp-gps-altitude">{t("Altitude du point")}: {Math.max(0, config.altitudeM || 100)} m · {t("vitesse de plan locale limitée à 300 km/h")}</p>
              <div className="mp-ai-actions">
                <button className="primary-button" type="submit"><MapPin size={13} /> {t("Ajouter au plan local")}</button>
              </div>
              <p className="mp-ai-disclaimer" role="note"><ShieldCheck size={11} /> {t("Cette action synchronise le point avec le plan du projet et recentre la carte. Elle n’envoie aucune commande au drone.")}</p>
            </form>
          ) : activeTab === "ai" ? (
            <div className="mp-ai-panel">
              <div className="mp-ai-panel-head">
                <BrainCircuit size={18} />
                <div>
                  <strong>{t("Aide à la navigation · calcul local")}</strong>
                  <small>{t("Contournement d'obstacles virtuels · optimisation géométrique · suggestions de waypoints")}</small>
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
                  <BrainCircuit size={13} /> {t("Calculer l’optimisation locale")}
                </button>
                <button className="secondary-button" onClick={applyAiSuggestions} disabled={!aiSuggestions.length}>
                  <MapPin size={13} /> {t("Appliquer les suggestions")}
                </button>
              </div>
              <p className="mp-ai-disclaimer">
                <ShieldCheck size={11} /> {t("Suggestions locales uniquement · aucune commande transmise · simulation.")}
              </p>
            </div>
          ) : activeTab === "fence" ? (
            <div className="mp-mission-list" aria-label={t("Points de géofence")}> 
              <p className="mp-empty-state">{t("Cliquez sur la carte avec l’outil Géofence pour ajouter un point.")}</p>
              {fencePoints.map((point, index) => <button className="mp-mission-item" key={point.id} onClick={() => { setCenter({ lat: point.lat, lng: point.lng }); setZoom(18); }}>
                <div className="mp-mi-icon waypoint"><ShieldCheck size={16} /></div><div className="mp-mi-info"><div className="mp-mi-name">{point.name}</div><div className="mp-mi-detail">{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</div></div><div className="mp-mi-num">{index + 1}</div>
              </button>)}
              <button className="mp-tb-btn" disabled={!fencePoints.length} onClick={() => setFencePoints([])}><Trash2 size={13} /> {t("Effacer la géofence")}</button>
            </div>
          ) : activeTab === "rally" ? (
            <div className="mp-mission-list" aria-label={t("Points Rally")}> 
              <p className="mp-empty-state">{t("Cliquez sur la carte avec l’outil Rally pour ajouter un point de rassemblement.")}</p>
              {rallyPoints.map((point, index) => <button className="mp-mission-item" key={point.id} onClick={() => { setCenter({ lat: point.lat, lng: point.lng }); setZoom(18); }}>
                <div className="mp-mi-icon takeoff"><Flag size={16} /></div><div className="mp-mi-info"><div className="mp-mi-name">{point.name}</div><div className="mp-mi-detail">{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</div></div><div className="mp-mi-num">{index + 1}</div>
              </button>)}
              <button className="mp-tb-btn" disabled={!rallyPoints.length} onClick={() => setRallyPoints([])}><Trash2 size={13} /> {t("Effacer les points Rally")}</button>
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
                <label className="mp-sp-control">{t("Altitude survey")} · {surveyParams.altitude} m
                  <input type="range" min="20" max="1200" step="10" value={surveyParams.altitude} onChange={event => setSurveyParams(prev => ({ ...prev, altitude: Number(event.target.value) }))} />
                </label>
                <label className="mp-sp-control">{t("Recouvrement avant")} · {surveyParams.overlapFront}%
                  <input type="range" min="30" max="90" step="5" value={surveyParams.overlapFront} onChange={event => setSurveyParams(prev => ({ ...prev, overlapFront: Number(event.target.value) }))} />
                </label>
                <label className="mp-sp-control">{t("Espacement des lignes")} · {surveyParams.spacing.toFixed(1)} m
                  <input type="range" min="10" max="200" step="1" value={surveyParams.spacing} onChange={event => setSurveyParams(prev => ({ ...prev, spacing: Number(event.target.value) }))} />
                </label>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="mp-timeline">
        <div className="mp-tl-item"><span className="dot amber" /> {t("Plan local · non transmis")}</div>
        <div className="mp-tl-item"><span className="dot cyan" /> {t("Plan")} <b>{missionItems.length} WP</b></div>
        <div className="mp-tl-item">{t("Durée estimée")} <b>{routeDurationMin} min</b></div>
        <div className="mp-tl-item">{t("Distance estimée")} <b>{Math.round(routeDistanceM)} m</b></div>
        <div className="mp-tl-item">{t("Survey")} <b>{missionItems.filter(item => item.type === "survey").length}</b></div>
        {plannerLayerMode === "ai" && (
          <div className="mp-tl-item"><span className="dot cyan" /> {t("IA")} <b>{aiOptimized ? "OPTIMISÉ" : "STANDBY"}</b></div>
        )}
        <div className="mp-spacer" />
        <div className="mp-tl-item">{t("Vent")} <b>{t("non chargé")}</b></div>
        <div className="mp-tl-item">{t("Visibilité")} <b>{t("non chargée")}</b></div>
        <div className="mp-tl-item">{t("Température")} <b>{t("non chargée")}</b></div>
        <div className="mp-tl-item" style={{ color: "var(--mp-amber)", fontWeight: 700 }}>● {t("Simulation locale — à vérifier")}</div>
      </div>
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
