import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { cn } from "@/lib/utils";

type Coordinate = { lat: number; lng: number };
type RoutePoint = Coordinate & { id: string; name: string };
export type MapLayerMode = "tactical" | "satellite";

type OpenStreetMapViewProps = {
  className?: string;
  center: Coordinate;
  points: RoutePoint[];
  zoom?: number;
  layerMode: MapLayerMode;
  onCenterChange?: (center: Coordinate) => void;
  onMapClick?: (coordinate: Coordinate) => void;
  simulatedProgress?: number;
};

type TileProvider = {
  id: string;
  label: string;
  attribution: string;
  template: string;
  subdomains: readonly string[];
  esri?: boolean;
};

const TILE_SIZE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 18;
const TACTICAL_PROVIDERS: TileProvider[] = [
  { id: "esri-world-street", label: "Esri World Street Map", attribution: "Tiles © Esri and data partners", template: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", subdomains: [""], esri: true },
  { id: "esri-world-imagery", label: "Esri World Imagery", attribution: "Tiles © Esri — Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community", template: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", subdomains: [""], esri: true },
  { id: "osm-standard", label: "OpenStreetMap standard", attribution: "© OpenStreetMap contributors", template: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", subdomains: [""] },
  // CARTO can return an HTTP 200 placeholder image when an API key is required;
  // keep it as a final fallback rather than the default layer.
  { id: "carto-dark", label: "CARTO Dark", attribution: "© OpenStreetMap contributors © CARTO", template: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", subdomains: ["a", "b", "c", "d"] },
];
const SATELLITE_PROVIDERS = [TACTICAL_PROVIDERS[1], TACTICAL_PROVIDERS[0], TACTICAL_PROVIDERS[2], TACTICAL_PROVIDERS[3]];
// Optional local XYZ endpoint backed by MBTiles (e.g. http://localhost:8080/tiles/{z}/{x}/{y}.png).
// Browsers cannot read an MBTiles SQLite file directly; expose it through a local tile server.
const OFFLINE_TILE_TEMPLATE = import.meta.env.VITE_OFFLINE_TILE_URL?.trim();
const OFFLINE_PROVIDER: TileProvider | null = OFFLINE_TILE_TEMPLATE
  ? { id: "offline-tiles", label: "Tuiles locales (MBTiles via XYZ)", attribution: "Tuiles locales — source/attribution à renseigner selon le jeu de données", template: OFFLINE_TILE_TEMPLATE, subdomains: [""] }
  : null;

function providersFor(mode: MapLayerMode): TileProvider[] {
  const providers = mode === "satellite" ? SATELLITE_PROVIDERS : TACTICAL_PROVIDERS;
  return OFFLINE_PROVIDER ? [OFFLINE_PROVIDER, ...providers] : providers;
}

function clampLatitude(lat: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

function project(coordinate: Coordinate, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const sin = Math.sin((clampLatitude(coordinate.lat) * Math.PI) / 180);
  return {
    x: ((coordinate.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function unproject(x: number, y: number, zoom: number): Coordinate {
  const scale = TILE_SIZE * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lat: clampLatitude(lat), lng: ((lng + 540) % 360) - 180 };
}

export function interpolateMapRoutePosition(route: Coordinate[], progress: number, zoom: number): Coordinate | null {
  if (route.length < 2 || !Number.isFinite(progress)) return null;
  const projected = route.map(point => project(point, zoom));
  const lengths = projected.slice(1).map((point, index) => Math.hypot(point.x - projected[index].x, point.y - projected[index].y));
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  if (totalLength === 0) return route[0];
  let remaining = totalLength * Math.max(0, Math.min(1, progress));
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (remaining <= length || index === lengths.length - 1) {
      const start = projected[index];
      const end = projected[index + 1];
      const ratio = length === 0 ? 0 : Math.max(0, Math.min(1, remaining / length));
      return unproject(start.x + (end.x - start.x) * ratio, start.y + (end.y - start.y) * ratio, zoom);
    }
    remaining -= length;
  }
  return route[route.length - 1];
}

function wrapTile(value: number, count: number) {
  return ((value % count) + count) % count;
}

export function OpenStreetMapView({
  className,
  center,
  points,
  zoom = 13,
  layerMode,
  onCenterChange,
  onMapClick,
  simulatedProgress,
}: OpenStreetMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; center: { x: number; y: number }; moved: boolean } | null>(null);
  const providers = useMemo(() => providersFor(layerMode), [layerMode]);
  const [viewport, setViewport] = useState({ width: 900, height: 500 });
  const [mapZoom, setMapZoom] = useState(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)));
  const [mapCenter, setMapCenter] = useState(center);
  const [providerIndex, setProviderIndex] = useState(0);
  const [failedTiles, setFailedTiles] = useState(0);
  const provider = providers[Math.min(providerIndex, providers.length - 1)];

  useEffect(() => {
    setMapCenter(center);
  }, [center.lat, center.lng]);

  useEffect(() => {
    setProviderIndex(0);
    setFailedTiles(0);
  }, [layerMode]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setViewport({ width: element.clientWidth || 900, height: element.clientHeight || 500 });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setFailedTiles(0);
  }, [providerIndex, mapZoom, mapCenter.lat, mapCenter.lng]);

  const centerPixel = useMemo(() => project(mapCenter, mapZoom), [mapCenter, mapZoom]);
  const tiles = useMemo(() => {
    const minX = Math.floor((centerPixel.x - viewport.width / 2) / TILE_SIZE) - 1;
    const maxX = Math.floor((centerPixel.x + viewport.width / 2) / TILE_SIZE) + 1;
    const minY = Math.floor((centerPixel.y - viewport.height / 2) / TILE_SIZE) - 1;
    const maxY = Math.floor((centerPixel.y + viewport.height / 2) / TILE_SIZE) + 1;
    const count = 2 ** mapZoom;
    return Array.from({ length: (maxX - minX + 1) * (maxY - minY + 1) }, (_, index) => {
      const x = minX + (index % (maxX - minX + 1));
      const y = minY + Math.floor(index / (maxX - minX + 1));
      return { x, y, wrappedX: wrapTile(x, count), count };
    }).filter(tile => tile.y >= 0 && tile.y < tile.count);
  }, [centerPixel, mapZoom, viewport.height, viewport.width]);

  useEffect(() => {
    if (tiles.length > 0 && failedTiles >= tiles.length && providerIndex < providers.length - 1) {
      setProviderIndex(index => index + 1);
    }
  }, [failedTiles, providerIndex, providers.length, tiles.length]);

  const toScreen = (coordinate: Coordinate) => {
    const pixel = project(coordinate, mapZoom);
    return { left: pixel.x - centerPixel.x + viewport.width / 2, top: pixel.y - centerPixel.y + viewport.height / 2 };
  };
  const simulatedPosition = typeof simulatedProgress === "number"
    ? interpolateMapRoutePosition([mapCenter, ...points], simulatedProgress, mapZoom)
    : null;

  const commitCenter = (nextPixel: { x: number; y: number }) => {
    const next = unproject(nextPixel.x, nextPixel.y, mapZoom);
    setMapCenter(next);
    onCenterChange?.(next);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, center: centerPixel, moved: false };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    setMapCenter(unproject(drag.center.x - dx, drag.center.y - dy, mapZoom));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (drag.moved) {
      commitCenter({ x: drag.center.x - dx, y: drag.center.y - dy });
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const clicked = unproject(centerPixel.x + event.clientX - bounds.left - viewport.width / 2, centerPixel.y + event.clientY - bounds.top - viewport.height / 2, mapZoom);
    onMapClick?.(clicked);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, mapZoom + (event.deltaY < 0 ? 1 : -1)));
    if (nextZoom === mapZoom) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const before = unproject(centerPixel.x + pointer.x - viewport.width / 2, centerPixel.y + pointer.y - viewport.height / 2, mapZoom);
    setMapZoom(nextZoom);
    const after = project(before, nextZoom);
    const nextCenter = unproject(after.x - pointer.x + viewport.width / 2, after.y - pointer.y + viewport.height / 2, nextZoom);
    setMapCenter(nextCenter);
    onCenterChange?.(nextCenter);
  };

  const tileUrl = (tile: (typeof tiles)[number]) => {
    const subdomain = provider.subdomains[(tile.wrappedX + tile.y) % provider.subdomains.length];
    return provider.template
      .replace("{s}", subdomain)
      .replace("{z}", String(mapZoom))
      .replace("{x}", String(tile.wrappedX))
      .replace("{y}", String(provider.esri ? tile.y : tile.y))
      .replace("{r}", "");
  };

  return (
    <div
      ref={containerRef}
      className={cn("aeromind-open-map", className)}
      role="application"
      aria-label={`Carte ${layerMode === "satellite" ? "satellite" : "Plan / tactique"} de préparation locale`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { dragRef.current = null; }}
      onWheel={handleWheel}
    >
      <div className="aeromind-open-map-tiles">
        {tiles.map(tile => {
          const left = tile.x * TILE_SIZE - centerPixel.x + viewport.width / 2;
          const top = tile.y * TILE_SIZE - centerPixel.y + viewport.height / 2;
          return <img key={`${provider.id}-${mapZoom}-${tile.x}-${tile.y}`} src={tileUrl(tile)} alt="" draggable={false} className="aeromind-map-tile" style={{ left, top }} onError={() => {
            setFailedTiles(current => current + 1);
          }} />;
        })}
      </div>
      {failedTiles >= tiles.length && providerIndex === providers.length - 1 && <div className="satnav-map-error" role="status"><strong>Fond cartographique indisponible</strong><span>Utilisez les coordonnées manuelles ou réessayez plus tard.</span></div>}
      <div className="aeromind-open-map-overlay" aria-hidden="true">
        {points.map((point, index) => {
          const position = toScreen(point);
          return <div key={point.id} className="aeromind-open-map-marker" style={position} title={`${point.name} · ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`}><span>{index + 1}</span></div>;
        })}
        {points.length > 0 && <svg className="aeromind-open-map-route" width={viewport.width} height={viewport.height}><polyline points={[mapCenter, ...points].map(point => { const position = toScreen(point); return `${position.left},${position.top}`; }).join(" ")} /></svg>}
        {simulatedPosition && <div className="aeromind-open-map-simulated-position" style={toScreen(simulatedPosition)} title="Position de démonstration locale, simulée"><span>SIM</span></div>}
      </div>
      <div className="aeromind-open-map-controls"><button type="button" aria-label="Zoom avant" onPointerDown={event => event.stopPropagation()} onClick={() => setMapZoom(value => Math.min(MAX_ZOOM, value + 1))}>+</button><button type="button" aria-label="Zoom arrière" onPointerDown={event => event.stopPropagation()} onClick={() => setMapZoom(value => Math.max(MIN_ZOOM, value - 1))}>−</button></div>
      <div className="aeromind-open-map-attribution">{provider.attribution} · {provider.label}</div>
    </div>
  );
}
