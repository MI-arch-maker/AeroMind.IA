import { useEffect, useMemo, useState } from "react";
import {
  Crosshair,
  MapPin,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Satellite,
  ShieldCheck,
  Sun,
  Trash2,
  Waypoints,
} from "lucide-react";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import { OpenStreetMapView, type MapLayerMode } from "./OpenStreetMapView";
import { MavlinkTelemetryPanel } from "./MavlinkTelemetryPanel";
import "./satellite-navigation.css";

type Coordinate = { lat: number; lng: number };
type RoutePoint = Coordinate & { id: string; name: string };
type SavedRoute = { center: Coordinate; points: RoutePoint[] };
type DemoStatus = "ready" | "running" | "paused" | "completed";

const DEFAULT_CENTER = { lat: 48.8566, lng: 2.3522 };
const MAX_MERCATOR_LATITUDE = 85.05112878;
const legacyKeyFor = (id: string) => `aeromind-satellite-planner-v2:${encodeURIComponent(id || "no-cell")}`;
const keyFor = (userIdentity: string, id: string) => {
  let hash = 2166136261;
  for (const character of userIdentity.trim().toLocaleLowerCase()) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `aeromind-satellite-planner-v3:${(hash >>> 0).toString(36)}:${encodeURIComponent(id || "no-cell")}`;
};

function parseDegrees(raw: string) {
  const value = raw.trim().replace(",", ".");
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) ? Number(value) : Number.NaN;
}

function validCoordinate(point: Coordinate) {
  return Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90 && Number.isFinite(point.lng) && point.lng >= -180 && point.lng <= 180;
}

function readRoute(key: string, legacyKey?: string): SavedRoute {
  try {
    const raw = window.localStorage.getItem(key) ?? (legacyKey ? window.localStorage.getItem(legacyKey) : null);
    const parsed = JSON.parse(raw ?? "null") as Partial<SavedRoute> | null;
    if (parsed?.center && Array.isArray(parsed.points)) {
      const center = { lat: Number(parsed.center.lat), lng: Number(parsed.center.lng) };
      if (validCoordinate(center)) {
        const points = parsed.points
          .filter((point): point is RoutePoint => Boolean(point && typeof point === "object" && typeof point.id === "string" && typeof point.name === "string" && validCoordinate({ lat: Number(point.lat), lng: Number(point.lng) })))
          .slice(0, 50)
          .map(point => ({ ...point, lat: Number(point.lat), lng: Number(point.lng) }));
        return { center, points };
      }
    }
  } catch { /* Le plan reste disponible en mémoire. */ }
  return { center: DEFAULT_CENTER, points: [] };
}

export function SatelliteNavigationView({ activeProfile, userIdentity = "local" }: { activeProfile?: DroneCatalogDesign; userIdentity?: string }) {
  const designId = activeProfile?.id ?? "no-cell";
  const storageKey = useMemo(() => keyFor(userIdentity, designId), [designId, userIdentity]);
  const [initial] = useState(() => readRoute(storageKey, userIdentity === "local" ? legacyKeyFor(designId) : undefined));
  const [center, setCenter] = useState<Coordinate>(initial.center);
  const [points, setPoints] = useState<RoutePoint[]>(initial.points);
  const [latitude, setLatitude] = useState(String(initial.center.lat));
  const [longitude, setLongitude] = useState(String(initial.center.lng));
  const [mapError, setMapError] = useState("");
  const [layerMode, setLayerMode] = useState<MapLayerMode>(() => new URLSearchParams(window.location.search).get("layer") === "satellite" ? "satellite" : "tactical");
  const [nightDisplay, setNightDisplay] = useState(false);
  const [demoStatus, setDemoStatus] = useState<DemoStatus>("ready");
  const [demoProgress, setDemoProgress] = useState(0);
  const routeLocked = demoStatus === "running" || demoStatus === "paused";

  useEffect(() => {
    const saved = readRoute(storageKey, userIdentity === "local" ? legacyKeyFor(designId) : undefined);
    setCenter(saved.center);
    setPoints(saved.points);
    setLatitude(String(saved.center.lat));
    setLongitude(String(saved.center.lng));
    setMapError("");
    setDemoStatus("ready");
    setDemoProgress(0);
  }, [designId, storageKey, userIdentity]);

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify({ center, points })); } catch { /* cache local facultatif */ }
  }, [center, points, storageKey]);

  useEffect(() => {
    if (demoStatus !== "running") return;
    const timer = window.setInterval(() => setDemoProgress(current => Math.min(100, current + 4)), 500);
    return () => window.clearInterval(timer);
  }, [demoStatus]);

  useEffect(() => {
    if (demoStatus === "running" && demoProgress >= 100) setDemoStatus("completed");
  }, [demoProgress, demoStatus]);

  const resetDemo = () => {
    setDemoStatus("ready");
    setDemoProgress(0);
  };
  const markPlanChanged = () => resetDemo();
  const addWaypoint = (coordinate: Coordinate) => {
    if (routeLocked) return;
    if (!validCoordinate(coordinate)) { setMapError("Coordonnées invalides : latitude −90…90°, longitude −180…180°."); return; }
    if (points.length >= 50) { setMapError("Limite de 50 points pour ce plan local."); return; }
    setMapError("");
    setLatitude(coordinate.lat.toFixed(6));
    setLongitude(coordinate.lng.toFixed(6));
    setPoints(current => [...current, { ...coordinate, id: `openmap-${Date.now()}-${current.length}`, name: `Point d’inspection ${current.length + 1}` }]);
    markPlanChanged();
  };
  const addTypedWaypoint = () => addWaypoint({ lat: parseDegrees(latitude), lng: parseDegrees(longitude) });
  const applyCenter = () => {
    const next = { lat: parseDegrees(latitude), lng: parseDegrees(longitude) };
    if (!validCoordinate(next)) { setMapError("Coordonnées WGS84 invalides : latitude −90…90°, longitude −180…180°. Saisissez des degrés décimaux."); return; }
    if (Math.abs(next.lat) > MAX_MERCATOR_LATITUDE) { setMapError("Cette latitude dépasse la limite d’affichage Esri/Web Mercator (−85,05113° à +85,05113°)."); return; }
    setCenter(next);
    setMapError("");
  };
  const onCenterChange = (next: Coordinate) => {
    setCenter(next);
    setLatitude(next.lat.toFixed(6));
    setLongitude(next.lng.toFixed(6));
  };
  const renameWaypoint = (id: string, name: string) => {
    if (routeLocked) return;
    setPoints(current => current.map(point => point.id === id ? { ...point, name } : point));
    markPlanChanged();
  };
  const clearRoute = () => {
    if (routeLocked) return;
    setPoints([]);
    markPlanChanged();
  };
  const coordinateControls = (satelliteMode: boolean) => <section className={`satnav-coordinate-card ${satelliteMode ? "satnav-satellite-coordinate-card" : ""}`}>
    <div className="satnav-card-heading"><span>{satelliteMode ? "CENTRER L’IMAGERIE SATELLITE" : "CENTRE / AJOUT MANUEL"}</span><span>WGS 84</span></div>
    <div className="satnav-coordinate-fields"><label>Latitude (°)<input type="text" inputMode="decimal" placeholder="48.8566" value={latitude} onChange={event => setLatitude(event.target.value)} aria-label="Latitude WGS84 en degrés décimaux" /></label><label>Longitude (°)<input type="text" inputMode="decimal" placeholder="2.3522" value={longitude} onChange={event => setLongitude(event.target.value)} aria-label="Longitude WGS84 en degrés décimaux" /></label></div>
    <div className="satnav-coordinate-actions"><button type="button" onClick={applyCenter}><Crosshair size={13} /> {satelliteMode ? "Centrer l’imagerie" : "Centrer"}</button><button type="button" className="is-primary" onClick={addTypedWaypoint} disabled={routeLocked}><MapPin size={13} /> Ajouter point</button></div>
    <small className="satnav-coordinate-note">Degrés décimaux WGS84 · position mémorisée par utilisateur et par cellule dans ce navigateur.</small>
  </section>;

  const statusLabel: Record<DemoStatus, string> = {
    ready: "PRÊT · LOCAL",
    running: "DÉMONSTRATION EN COURS",
    paused: "DÉMONSTRATION EN PAUSE",
    completed: "DÉMONSTRATION TERMINÉE",
  };

  return <div className="satnav-shell">
    <header className="satnav-header">
      <div className="satnav-heading-icon"><Satellite size={21} /></div>
      <div className="satnav-title"><span>AEROMIND / NAVIGATION CARTOGRAPHIQUE</span><h2>Navigation satellite</h2><p>Imagerie ouverte · points d’inspection personnalisables · télémétrie MAVLink réelle en lecture seule</p></div>
      <span className="satnav-local-badge"><i /> PLAN LOCAL · NON TRANSMIS</span>
    </header>

    <div className="satnav-safety-note"><ShieldCheck size={17} /><span><strong>Télémétrie MAVLink réelle en lecture seule — parcours de démonstration local.</strong> La télémétrie affichée provient d’un autopilote observé via pymavlink (session LABBENCH authentifiée + consentement). Le parcours d’inspection reste une démonstration visuelle : aucune commande n’est envoyée à l’autopilote ; armement, ciblage et actionneurs sont absents.</span></div>

    <MavlinkTelemetryPanel mapCenter={center} />

    <div className="satnav-layout">
      <section className="satnav-map-panel" aria-label="Carte ouverte de préparation">
        <div className="satnav-map-toolbar">
          <div><span className="satnav-section-kicker">CARTE OUVERTE / POINTS D’INSPECTION</span><strong>{layerMode === "satellite" ? "Imagerie satellite Esri World Imagery" : "Plan / fond cartographique · Esri World Street Map"}</strong></div>
          <div className="satnav-map-actions" role="group" aria-label="Mode de fond cartographique">
            <button type="button" aria-pressed={layerMode === "tactical"} className={layerMode === "tactical" ? "is-active" : ""} onClick={() => setLayerMode("tactical")}>Plan</button>
            <button type="button" aria-pressed={layerMode === "satellite"} className={layerMode === "satellite" ? "is-active" : ""} onClick={() => setLayerMode("satellite")}><Satellite size={12} /> Satellite</button>
            <button type="button" aria-pressed={nightDisplay} className={nightDisplay ? "is-active" : ""} onClick={() => setNightDisplay(value => !value)} title="Filtre de couleur simulé, sans capteur nocturne">{nightDisplay ? <Sun size={12} /> : <Moon size={12} />} {nightDisplay ? "Jour" : "Filtre nuit"}</button>
          </div>
          <span className="satnav-provider-chip">{layerMode === "satellite" ? "ESRI IMAGE → RUES → OSM → CARTO" : "ESRI RUES → IMAGE → OSM → CARTO"} · FALLBACK AUTO</span>
        </div>
        {layerMode === "satellite" && coordinateControls(true)}
        <div className={`satnav-map-canvas ${nightDisplay ? "is-night-display" : ""}`}>
          <OpenStreetMapView className="satnav-open-map" center={center} points={points} zoom={13} layerMode={layerMode} onCenterChange={onCenterChange} onMapClick={coordinate => addWaypoint(coordinate)} simulatedProgress={demoStatus === "ready" ? undefined : demoProgress / 100} />
          {mapError && <div className="satnav-map-error" role="status"><Satellite size={18} /><strong>Plan local à vérifier</strong><span>{mapError}</span><small>Les coordonnées restent éditables manuellement.</small></div>}
          <div className="satnav-map-instruction"><MapPin size={13} /> Cliquez pour ajouter un point · glissez pour déplacer · molette pour zoomer</div>
          {nightDisplay && <span className="satnav-night-caption">FILTRE NOCTURNE SIMULÉ · AFFICHAGE UNIQUEMENT</span>}
        </div>
        <div className="satnav-map-footer"><span><i className="satnav-home-dot" /> CENTRE DU PLAN</span><code>{center.lat.toFixed(5)}°, {center.lng.toFixed(5)}°</code><span className="satnav-point-count"><Waypoints size={13} /> {points.length} / 50 points</span></div>
      </section>

      <aside className="satnav-side-panel">
        <section className="satnav-cell-card"><div className="satnav-card-heading"><span>CELLULE ASSOCIÉE</span><span className={activeProfile ? "is-ready" : "is-empty"}>{activeProfile ? "SÉLECTIONNÉE" : "EN ATTENTE"}</span></div>{activeProfile ? <><strong>{activeProfile.label}</strong><small>{activeProfile.family}</small><div className="satnav-cell-specs"><span>Envergure<strong>{activeProfile.configuration.wingspan?.toFixed(2) ?? "—"} m</strong></span><span>Architecture<strong>{activeProfile.key.toUpperCase()}</strong></span></div></> : <p>Sélectionnez d’abord une cellule dans la bibliothèque. Le plan actuel reste un brouillon local non associé.</p>}</section>
        {layerMode !== "satellite" && coordinateControls(false)}

        <section className="satnav-route-card"><div className="satnav-card-heading"><span>POINTS D’INSPECTION LOCAUX</span><button type="button" onClick={clearRoute} disabled={!points.length || routeLocked} aria-label="Effacer les points du plan"><Trash2 size={13} /> Effacer</button></div>
          {points.length ? <ol className="satnav-point-list">{points.map((point, index) => <li key={point.id}><b>{String(index + 1).padStart(2, "0")}</b><span className="satnav-point-fields"><input className="satnav-point-name" type="text" maxLength={48} value={point.name} disabled={routeLocked} aria-label="Nom du point d’inspection" onChange={event => renameWaypoint(point.id, event.target.value)} /><small>{point.lat.toFixed(6)}, {point.lng.toFixed(6)}</small></span><button type="button" aria-label={`Supprimer ${point.name}`} disabled={routeLocked} onClick={() => { setPoints(current => current.filter(item => item.id !== point.id)); markPlanChanged(); }}><Trash2 size={13} /></button></li>)}</ol> : <p className="satnav-empty-route">Aucun point. Ajoutez une coordonnée ou cliquez sur la carte.</p>}
          <div className="satnav-route-footer">Enregistré localement dans ce navigateur · par cellule</div>
        </section>

        <section className="satnav-demo-card" aria-label="Simulation locale du parcours d’inspection">
          <div className="satnav-card-heading"><span>SIMULATION LOCALE / INSPECTION CIVILE</span><span className={demoStatus === "running" ? "is-ready" : "is-empty"}>{statusLabel[demoStatus]}</span></div>
          <div className="satnav-demo-progress" role="progressbar" aria-label="Progression de la démonstration locale" aria-valuemin={0} aria-valuemax={100} aria-valuenow={demoProgress}><span style={{ width: `${demoProgress}%` }} /></div>
          <div className="satnav-demo-progress-label"><span>{demoStatus === "ready" ? "Démonstration prête" : demoStatus === "completed" ? "Parcours simulé terminé" : demoStatus === "paused" ? "Parcours suspendu" : "Parcours simulé en cours"}</span><strong>{demoProgress}%</strong></div>
          <div className="satnav-demo-actions">
            {demoStatus === "running" ? <button type="button" onClick={() => setDemoStatus("paused")}><Pause size={13} /> Pause</button> : demoStatus === "paused" ? <button type="button" onClick={() => setDemoStatus("running")}><Play size={13} /> Reprendre</button> : demoStatus === "completed" ? <button type="button" onClick={resetDemo}><RotateCcw size={13} /> Réinitialiser</button> : <button type="button" className="is-primary" disabled={points.length < 2} onClick={() => { setDemoProgress(0); setDemoStatus("running"); }}><Play size={13} /> Démarrer la simulation</button>}
            <button type="button" className="is-end" disabled={demoStatus === "ready" || demoStatus === "completed"} onClick={() => { setDemoProgress(100); setDemoStatus("completed"); }}>Fin de mission</button>
          </div>
          <small>Chronologie visuelle synthétique, sans GNSS embarqué, trajectoire téléchargée ni commande d’appareil. Deux points minimum.</small>
        </section>
      </aside>
    </div>

    <footer className="satnav-disclaimer">Les fonds CARTO/OSM et Esri World Imagery sont des services externes soumis à disponibilité, attribution et conditions d’utilisation propres. Le filtre nocturne ne révèle aucune information supplémentaire : c’est seulement une transformation de couleurs à l’écran. Cette vue demeure une préparation et une démonstration locales ; elle ne produit aucun ciblage, armement, trajectoire téléversable ou commande réelle.</footer>
  </div>;
}
