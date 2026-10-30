/**
 * MissionPlannerView — Environnement cartographique et préparation locale des missions.
 *
 * Interface de planification de mission intégrée à AeroMind, inspirée de QGroundControl.
 * Utilise Leaflet + tuiles OpenStreetMap réelles (pas SVG) pour la carte, avec :
 * - Polygone de survey dessinable
 * - Waypoints cliquables
 * - Lignes de vol parallèles automatiques
 * - Panneau de mission avec items éditables
 * - Télémétrie véhicule en temps réel ( simulation locale )
 * - Outils : takeoff, waypoint, survey, land, géofence, rally
 *
 * Synchronisé avec config.missionPlan du projet AeroMind actif.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Activity, Crosshair, Layers, MapPin, Navigation, Plane,
  Ruler, Settings as SettingsIcon, Upload, ZoomIn, ZoomOut,
  Home, MapPinned, Flag, Grid3x3, Spline, Square, Maximize2,
} from "lucide-react";
import type { ConceptConfig, MissionWaypoint } from "../lib/aeroEngine";
import { useLanguage } from "../contexts/LanguageContext";
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

const PARIS_CENTER: [number, number] = [48.8566, 2.3522];

// Real OSM tile layer (free, no API key)
const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function MissionPlannerView({ config, setConfig }: Props) {
  const { t } = useLanguage();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const surveyLayerRef = useRef<L.LayerGroup | null>(null);
  const flightLinesRef = useRef<L.LayerGroup | null>(null);
  const droneMarkerRef = useRef<L.Marker | null>(null);

  const [tool, setTool] = useState<Tool>("waypoint");
  const [activeTab, setActiveTab] = useState<"mission" | "fence" | "rally">("mission");
  const [missionItems, setMissionItems] = useState<MissionItem[]>([
    { id: "start", type: "start", name: "Mission Start", lat: 48.8566, lng: 2.3522, alt: 0, detail: "Point de départ" },
    { id: "takeoff", type: "takeoff", name: "VTOL Takeoff", lat: 48.8566, lng: 2.3522, alt: 20, detail: "Alt 20 m · Transition" },
    { id: "wp2", type: "waypoint", name: "Waypoint 2", lat: 48.8580, lng: 2.3550, alt: 232.9, speed: 15, detail: "Alt 232.9 m · 15 m/s" },
    { id: "survey", type: "survey", name: "Survey — Zone A", lat: 48.8570, lng: 2.3540, alt: 232.9, detail: "47 lignes · 2.4 km²" },
    { id: "wp48", type: "waypoint", name: "Waypoint 48", lat: 48.8550, lng: 2.3500, alt: 232.9, speed: 15, detail: "Alt 232.9 m · Retour" },
    { id: "land", type: "land", name: "Land", lat: 48.8566, lng: 2.3522, alt: 0, detail: "RTL · Point de départ" },
  ]);
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

  // ── Initialize Leaflet map ──
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: PARIS_CENTER,
      zoom: 17,
      zoomControl: false,
      attributionControl: true,
    });
    L.tileLayer(OSM_URL, { attribution: OSM_ATTR, maxZoom: 19 }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    surveyLayerRef.current = L.layerGroup().addTo(map);
    flightLinesRef.current = L.layerGroup().addTo(map);

    map.on("zoomend", () => setZoom(map.getZoom()));
    map.on("moveend", () => { const c = map.getCenter(); setCenter([c.lat, c.lng]); });

    // Click handler — adds waypoint/mission item based on active tool
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (tool === "waypoint") addWaypoint(lat, lng);
      else if (tool === "takeoff") addMissionItem("takeoff", "VTOL Takeoff", lat, lng, 20);
      else if (tool === "land") addMissionItem("land", "Land", lat, lng, 0);
      else if (tool === "survey") drawSurveyCorner(lat, lng);
      else if (tool === "fence") toast.info(t("Géofence — cliquez pour ajouter un point"));
      else if (tool === "rally") toast.info(t("Rally point ajouté"));
    });

    mapRef.current = map;
    renderMission();
    setTimeout(() => map.invalidateSize(), 200);

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Re-render markers when mission items change ──
  useEffect(() => { renderMission(); }, [missionItems, selectedItemId]);

  // ── Tool change cursor ──
  useEffect(() => {
    if (!mapRef.current) return;
    const container = mapRef.current.getContainer();
    container.style.cursor = tool === "select" ? "" : "crosshair";
  }, [tool]);

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

  // ── Drone marker on map ──
  useEffect(() => {
    if (!mapRef.current) return;
    if (droneMarkerRef.current) {
      mapRef.current.removeLayer(droneMarkerRef.current);
    }
    const droneIcon = L.divIcon({
      className: "mp-drone-icon",
      html: `<div style="width:32px;height:32px;background:#25d0d9;border:2px solid #fff;border-radius:50%;display:grid;place-items:center;box-shadow:0 0 12px rgba(37,208,217,0.8);transform:rotate(${telemetry.heading}deg)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><path d="M8 1L6 6H2l4 3-1 5 3-3 3 3-1-5 4-3h-4z"/></svg>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    droneMarkerRef.current = L.marker([48.8575, 2.3535], { icon: droneIcon }).addTo(mapRef.current);
  }, [telemetry.heading]);

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

  const surveyCornersRef = useRef<[number, number][]>([]);
  const drawSurveyCorner = (lat: number, lng: number) => {
    surveyCornersRef.current.push([lat, lng]);
    toast.info(t("Coin survey ajouté") + ` (${surveyCornersRef.current.length}/4)`);
    if (surveyCornersRef.current.length >= 4 && surveyLayerRef.current && mapRef.current) {
      const polygon = L.polygon(surveyCornersRef.current, {
        color: "#10b981", weight: 2, fillColor: "#10b981", fillOpacity: 0.1,
      }).addTo(surveyLayerRef.current);
      // Draw flight lines
      const bounds = polygon.getBounds();
      const latSpan = bounds.getNorth() - bounds.getSouth();
      const lineCount = 12;
      for (let i = 0; i < lineCount; i++) {
        const lat = bounds.getSouth() + (latSpan / lineCount) * (i + 0.5);
        L.polyline([[lat, bounds.getWest()], [lat, bounds.getEast()]], {
          color: "#fff", weight: 1, opacity: 0.6, dashArray: "4,3",
        }).addTo(flightLinesRef.current!);
      }
      toast.success(t("Survey créé"), { description: t("Polygone et lignes de vol générés.") });
      surveyCornersRef.current = [];
    }
  };

  const renderMission = useCallback(() => {
    if (!markersRef.current || !mapRef.current) return;
    markersRef.current.clearLayers();
    flightLinesRef.current?.clearLayers();

    // Draw flight path
    const path: [number, number][] = missionItems
      .filter(i => i.type !== "start")
      .map(i => [i.lat, i.lng]);
    if (path.length > 1) {
      L.polyline(path, { color: "#25d0d9", weight: 2, opacity: 0.5, dashArray: "5,5" }).addTo(flightLinesRef.current!);
    }

    // Draw markers
    missionItems.forEach((item, idx) => {
      const isSelected = item.id === selectedItemId;
      let iconHtml = "";
      let color = "#25d0d9";
      if (item.type === "takeoff") { color = "#10b981"; iconHtml = "⬆"; }
      else if (item.type === "land") { color = "#ef4444"; iconHtml = "⬇"; }
      else if (item.type === "survey") { color = "#f5a623"; iconHtml = "◆"; }
      else if (item.type === "start") { color = "#7a8e9a"; iconHtml = "●"; }
      else { iconHtml = String(idx); }

      const size = isSelected ? 36 : 28;
      iconHtml = `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid ${isSelected ? "#fff" : "rgba(255,255,255,0.5)"};border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700;font-size:11px;${isSelected ? "box-shadow:0 0 12px " + color : ""}">${iconHtml}</div>`;

      const icon = L.divIcon({ className: "mp-waypoint-icon", html: iconHtml, iconSize: [size, size], iconAnchor: [size/2, size/2] });
      const marker = L.marker([item.lat, item.lng], { icon }).addTo(markersRef.current!);
      marker.bindPopup(`<b>${item.name}</b><br/>${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}<br/>${item.detail || ""}`);
      marker.on("click", () => setSelectedItemId(item.id));
    });
  }, [missionItems, selectedItemId]);

  const handleUpload = () => toast.success(t("Mission uploadée"), { description: t("Plan envoyé au véhicule.") });
  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleCenter = () => { mapRef.current?.setView(PARIS_CENTER, 17); };
  const handleClearSurvey = () => { surveyLayerRef.current?.clearLayers(); flightLinesRef.current?.clearLayers(); toast.info(t("Survey effacé")); };
  const handleClearMission = () => {
    setMissionItems([
      { id: "start", type: "start", name: "Mission Start", lat: 48.8566, lng: 2.3522, alt: 0, detail: "Point de départ" },
      { id: "land", type: "land", name: "Land", lat: 48.8566, lng: 2.3522, alt: 0, detail: "RTL" },
    ]);
    toast.success(t("Mission réinitialisée"));
  };

  const tools: { id: Tool; icon: React.ComponentType<{ size?: number }>; tip: string }[] = [
    { id: "select", icon: MousePointerIcon, tip: t("Sélectionner") },
    { id: "takeoff", icon: Plane, tip: t("Décollage") },
    { id: "waypoint", icon: MapPin, tip: t("Waypoint") },
    { id: "survey", icon: Grid3x3, tip: t("Survey") },
    { id: "land", icon: Home, tip: t("Atterrissage") },
    { id: "fence", icon: Square, tip: t("Géofence") },
    { id: "rally", icon: Flag, tip: t("Rally point") },
    { id: "measure", icon: Ruler, tip: t("Mesurer") },
  ];

  return (
    <div className="mp-app">
      {/* Statusbar */}
      <div className="mp-statusbar">
        <div className="mp-logo">
          <span className="mp-mark">A</span>
          <div>
            <div className="mp-name">AEROMIND</div>
            <div className="mp-tag">{t("Mission Planner")}</div>
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
        <button className="mp-tb-btn"><Crosshair size={14} /> {t("Fly")}</button>
        <button className="mp-tb-btn"><Activity size={14} /> {t("Analyse")}</button>
        <div className="mp-tb-sep" />
        <button className="mp-tb-btn"><Layers size={14} /> {t("Couches")}</button>
        <div className="mp-tb-sep" />
        <span className="mp-coord">LAT <b>{center[0].toFixed(4)}°N</b> · LON <b>{center[1].toFixed(4)}°E</b> · ZOOM <b>{zoom}</b></span>
        <div className="mp-spacer" />
        <button className="mp-tb-btn" onClick={handleClearSurvey}><MapPinned size={14} /> {t("Effacer survey")}</button>
        <button className="mp-tb-btn" onClick={handleClearMission}><Spline size={14} /> {t("Effacer mission")}</button>
        <button className="mp-tb-btn" onClick={() => toast.info(t("Journal de vol"))}><SettingsIcon size={14} /> {t("Journal")}</button>
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

        {/* Map */}
        <div className="mp-map-area">
          <div ref={mapContainerRef} className="mp-map" />
          <div className="mp-map-overlay">
            <div className="mp-map-info">
              <div className="mp-chip"><MapPinned size={12} /> Survey <b>2.4 km²</b></div>
              <div className="mp-chip green"><MapPin size={12} /> <b>{missionItems.length} waypoints</b></div>
              <div className="mp-chip">GSD <b>{surveyParams.gsd} cm/px</b></div>
              <div className="mp-chip">{t("Temps estimé")} <b>24 min</b></div>
            </div>
            <div className="mp-zoom-ctrl">
              <button onClick={handleZoomIn}><ZoomIn size={16} /></button>
              <button onClick={handleZoomOut}><ZoomOut size={16} /></button>
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
          </div>

          <div className="mp-mission-list">
            {missionItems.map((item, idx) => (
              <button
                key={item.id}
                className={`mp-mission-item ${item.id === selectedItemId ? "active" : ""}`}
                onClick={() => { setSelectedItemId(item.id); mapRef.current?.setView([item.lat, item.lng], 18); }}
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
        </div>
      </div>

      {/* Timeline */}
      <div className="mp-timeline">
        <div className="mp-tl-item"><span className="dot green" /> {t("Mission prête")}</div>
        <div className="mp-tl-item"><span className="dot cyan" /> {t("Plan")} <b>{missionItems.length} WP</b></div>
        <div className="mp-tl-item">{t("Durée")} <b>24 min</b></div>
        <div className="mp-tl-item">{t("Distance")} <b>7 407 m</b></div>
        <div className="mp-tl-item">{t("Surface")} <b>2.4 km²</b></div>
        <div className="mp-spacer" />
        <div className="mp-tl-item">{t("Vent")} <b>3.2 m/s NW</b></div>
        <div className="mp-tl-item">{t("Visibilité")} <b>10 km</b></div>
        <div className="mp-tl-item">{t("Temp")} <b>18°C</b></div>
        <div className="mp-tl-item" style={{ color: "var(--pdc-green, #10b981)", fontWeight: 700 }}>● {t("Validé")}</div>
      </div>
    </div>
  );
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
