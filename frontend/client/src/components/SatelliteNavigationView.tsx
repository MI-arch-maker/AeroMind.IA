import { useEffect, useMemo, useState } from "react";
import { Crosshair, MapPin, Satellite, ShieldCheck, Trash2, Waypoints } from "lucide-react";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import { OpenStreetMapView, type MapLayerMode } from "./OpenStreetMapView";
import { MavlinkTelemetryPanel } from "./MavlinkTelemetryPanel";
import "./satellite-navigation.css";

type Coordinate = { lat: number; lng: number };
type RoutePoint = Coordinate & { id: string; name: string };
type SavedRoute = { center: Coordinate; points: RoutePoint[] };
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
        const points = parsed.points.filter((point): point is RoutePoint => Boolean(point && typeof point === "object" && typeof point.id === "string" && typeof point.name === "string" && validCoordinate({ lat: Number(point.lat), lng: Number(point.lng) }))).slice(0, 50).map(point => ({ ...point, lat: Number(point.lat), lng: Number(point.lng) }));
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

  useEffect(() => {
    const saved = readRoute(storageKey, userIdentity === "local" ? legacyKeyFor(designId) : undefined);
    setCenter(saved.center); setPoints(saved.points);
    setLatitude(String(saved.center.lat)); setLongitude(String(saved.center.lng));
    setMapError("");
  }, [designId, storageKey, userIdentity]);

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify({ center, points })); } catch { /* cache local facultatif */ }
  }, [center, points, storageKey]);

  const addWaypoint = (coordinate: Coordinate) => {
    if (!validCoordinate(coordinate)) { setMapError("Coordonnées invalides : latitude −90…90°, longitude −180…180°."); return; }
    if (points.length >= 50) { setMapError("Limite de 50 points pour ce plan local."); return; }
    setMapError("");
    setLatitude(coordinate.lat.toFixed(6));
    setLongitude(coordinate.lng.toFixed(6));
    setPoints(current => [...current, { ...coordinate, id: `openmap-${Date.now()}-${current.length}`, name: `Point ${current.length + 1}` }]);
  };
  const addTypedWaypoint = () => addWaypoint({ lat: parseDegrees(latitude), lng: parseDegrees(longitude) });
  const applyCenter = () => {
    const next = { lat: parseDegrees(latitude), lng: parseDegrees(longitude) };
    if (!validCoordinate(next)) { setMapError("Coordonnées WGS84 invalides : latitude −90…90°, longitude −180…180°. Saisissez des degrés décimaux."); return; }
    if (Math.abs(next.lat) > MAX_MERCATOR_LATITUDE) { setMapError("Cette latitude dépasse la limite d’affichage Esri/Web Mercator (−85,05113° à +85,05113°)."); return; }
    setCenter(next); setMapError("");
  };
  const onCenterChange = (next: Coordinate) => { setCenter(next); setLatitude(next.lat.toFixed(6)); setLongitude(next.lng.toFixed(6)); };
  const coordinateControls = (satelliteMode: boolean) => <section className={`satnav-coordinate-card ${satelliteMode ? "satnav-satellite-coordinate-card" : ""}`}>
    <div className="satnav-card-heading"><span>{satelliteMode ? "CENTRER L’IMAGERIE SATELLITE" : "CENTRE / AJOUT MANUEL"}</span><span>WGS 84</span></div>
    <div className="satnav-coordinate-fields"><label>Latitude (°)<input type="text" inputMode="decimal" placeholder="48.8566" value={latitude} onChange={event => setLatitude(event.target.value)} aria-label="Latitude WGS84 en degrés décimaux" /></label><label>Longitude (°)<input type="text" inputMode="decimal" placeholder="2.3522" value={longitude} onChange={event => setLongitude(event.target.value)} aria-label="Longitude WGS84 en degrés décimaux" /></label></div>
    <div className="satnav-coordinate-actions"><button type="button" onClick={applyCenter}><Crosshair size={13} /> {satelliteMode ? "Centrer l’imagerie" : "Centrer"}</button><button type="button" className="is-primary" onClick={addTypedWaypoint}><MapPin size={13} /> Ajouter point</button></div>
    <small className="satnav-coordinate-note">Degrés décimaux WGS84 · position mémorisée par utilisateur et par cellule dans ce navigateur.</small>
  </section>;

  return <div className="satnav-shell">
    <header className="satnav-header">
      <div className="satnav-heading-icon"><Satellite size={21} /></div>
      <div className="satnav-title"><span>AEROMIND / NAVIGATION CARTOGRAPHIQUE</span><h2>Navigation satellite</h2><p>Fond ouvert interactif · points GNSS saisis manuellement · préparation locale</p></div>
      <span className="satnav-local-badge"><i /> PLAN LOCAL · NON TRANSMIS</span>
    </header>

    <div className="satnav-safety-note"><ShieldCheck size={17} /><span><strong>Préparation uniquement — aucun guidage réel.</strong> Cette alternative cartographique n’exécute aucun calcul autonome, ne lit aucun GNSS embarqué et n’envoie ni itinéraire ni commande à un aéronef.</span></div>

    <MavlinkTelemetryPanel />

    <div className="satnav-layout">
      <section className="satnav-map-panel" aria-label="Carte ouverte de préparation">
        <div className="satnav-map-toolbar"><div><span className="satnav-section-kicker">CARTE OUVERTE / POINTS DE PASSAGE</span><strong>{layerMode === "satellite" ? "Imagerie satellite Esri World Imagery" : "Plan / tactique · Esri World Street Map"}</strong></div><div className="satnav-map-actions" role="group" aria-label="Mode de fond cartographique"><button type="button" aria-pressed={layerMode === "tactical"} className={layerMode === "tactical" ? "is-active" : ""} onClick={() => setLayerMode("tactical")}>Plan / Tactique</button><button type="button" aria-pressed={layerMode === "satellite"} className={layerMode === "satellite" ? "is-active" : ""} onClick={() => setLayerMode("satellite")}>Satellite</button></div><span className="satnav-provider-chip">{layerMode === "satellite" ? "ESRI IMAGE → RUES → OSM → CARTO" : "ESRI RUES → IMAGE → OSM → CARTO"} · FALLBACK AUTO</span></div>
        {layerMode === "satellite" && coordinateControls(true)}
        <div className="satnav-map-canvas"><OpenStreetMapView className="satnav-open-map" center={center} points={points} zoom={13} layerMode={layerMode} onCenterChange={onCenterChange} onMapClick={coordinate => addWaypoint(coordinate)} />{mapError && <div className="satnav-map-error" role="status"><Satellite size={18} /><strong>Plan local à vérifier</strong><span>{mapError}</span><small>Les coordonnées restent éditables manuellement.</small></div>}<div className="satnav-map-instruction"><MapPin size={13} /> Cliquez pour ajouter · glissez pour déplacer · molette pour zoomer</div></div>
        <div className="satnav-map-footer"><span><i className="satnav-home-dot" /> CENTRE DU PLAN</span><code>{center.lat.toFixed(5)}°, {center.lng.toFixed(5)}°</code><span className="satnav-point-count"><Waypoints size={13} /> {points.length} / 50 points</span></div>
      </section>

      <aside className="satnav-side-panel">
        <section className="satnav-cell-card"><div className="satnav-card-heading"><span>CELLULE ASSOCIÉE</span><span className={activeProfile ? "is-ready" : "is-empty"}>{activeProfile ? "SÉLECTIONNÉE" : "EN ATTENTE"}</span></div>{activeProfile ? <><strong>{activeProfile.label}</strong><small>{activeProfile.family}</small><div className="satnav-cell-specs"><span>Envergure<strong>{activeProfile.configuration.wingspan?.toFixed(2) ?? "—"} m</strong></span><span>Architecture<strong>{activeProfile.key.toUpperCase()}</strong></span></div></> : <p>Sélectionnez d’abord une cellule dans la bibliothèque. Le plan actuel reste un brouillon local non associé.</p>}</section>
        {layerMode !== "satellite" && coordinateControls(false)}
        <section className="satnav-route-card"><div className="satnav-card-heading"><span>PLAN LOCAL</span><button type="button" onClick={() => setPoints([])} disabled={!points.length} aria-label="Effacer les points du plan"><Trash2 size={13} /> Effacer</button></div>{points.length ? <ol className="satnav-point-list">{points.map((point, index) => <li key={point.id}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{point.name}</strong><small>{point.lat.toFixed(6)}, {point.lng.toFixed(6)}</small></span><button type="button" aria-label={`Supprimer ${point.name}`} onClick={() => setPoints(current => current.filter(item => item.id !== point.id))}><Trash2 size={13} /></button></li>)}</ol> : <p className="satnav-empty-route">Aucun point. Ajoutez une coordonnée ou cliquez sur la carte.</p>}<div className="satnav-route-footer">Enregistré localement dans ce navigateur · par cellule</div></section>
      </aside>
    </div>
    <footer className="satnav-disclaimer">Les fonds CARTO/OSM et Esri World Imagery sont des services externes soumis à disponibilité, attribution et conditions d’utilisation propres ; vérifier ces conditions avant tout usage externe. Pour la simulation hors-ligne, configurer VITE_OFFLINE_TILE_URL vers un serveur XYZ local exposant des tuiles issues d’un MBTiles (le navigateur ne lit pas directement le fichier SQLite) ; consulter docs/cartographie-hors-ligne.md. Cette vue reste un brouillon cartographique local : elle ne génère ni trajectoire automatique, ni zone d’action, ni fichier de téléversement de mission.</footer>
  </div>;
}
