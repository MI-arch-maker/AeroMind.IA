export type GeoPoint = { lat: number; lng: number };
export type CircularObstacle = GeoPoint & { radiusM: number; label?: string };
export type RouteOptimizationResult =
  | { feasible: true; points: GeoPoint[]; detourCount: number; totalDistanceM: number }
  | { feasible: false; points: []; reason: string };

const EARTH_RADIUS_M = 6_371_000;
const TAU = Math.PI * 2;
const BOUNDARY_SIDES = 64;
const EPS = 1e-7;

type XY = { x: number; y: number };
type Circle = XY & { radius: number };

function toXY(point: GeoPoint, origin: GeoPoint): XY {
  const lat0 = origin.lat * Math.PI / 180;
  return {
    x: EARTH_RADIUS_M * (point.lng - origin.lng) * Math.PI / 180 * Math.cos(lat0),
    y: EARTH_RADIUS_M * (point.lat - origin.lat) * Math.PI / 180,
  };
}
function toGeo(point: XY, origin: GeoPoint): GeoPoint {
  const lat0 = origin.lat * Math.PI / 180;
  return {
    lat: origin.lat + point.y / EARTH_RADIUS_M * 180 / Math.PI,
    lng: origin.lng + point.x / (EARTH_RADIUS_M * Math.cos(lat0)) * 180 / Math.PI,
  };
}
function distance(a: XY, b: XY): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function segmentDistance(point: XY, a: XY, b: XY): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return distance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** Deterministic local XY visibility-graph routing around conservatively polygonized circles. */
export function optimizeMissionRoute(
  route: readonly GeoPoint[], obstacles: readonly CircularObstacle[], options: { clearanceM?: number } = {},
): RouteOptimizationResult {
  const clearance = options.clearanceM ?? 20;
  if (!Number.isFinite(clearance) || clearance < 0) return { feasible: false, points: [], reason: "La marge de sécurité doit être positive ou nulle." };
  if (route.length < 2) return { feasible: false, points: [], reason: "La trajectoire doit contenir au moins deux points." };
  if ([...route, ...obstacles].some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) >= 89.9 || Math.abs(p.lng) > 180))
    return { feasible: false, points: [], reason: "Coordonnées géographiques invalides." };
  if (obstacles.some(o => !Number.isFinite(o.radiusM) || o.radiusM < 0))
    return { feasible: false, points: [], reason: "Rayon d’obstacle invalide." };
  const origin = { lat: route.reduce((s, p) => s + p.lat, 0) / route.length, lng: route.reduce((s, p) => s + p.lng, 0) / route.length };
  const waypoints = route.map(p => toXY(p, origin));
  const circles: Circle[] = obstacles.map(o => ({ ...toXY(o, origin), radius: o.radiusM + clearance }));
  for (let i = 0; i < waypoints.length; i++) {
    if (circles.some(c => distance(waypoints[i], c) <= c.radius + EPS))
      return { feasible: false, points: [], reason: `Le waypoint ${i + 1} se trouve dans un obstacle ou sa marge de sécurité.` };
  }

  const optimized: XY[] = [waypoints[0]];
  for (let segment = 0; segment < waypoints.length - 1; segment++) {
    const start = waypoints[segment], end = waypoints[segment + 1];
    const blocking = circles.some(c => segmentDistance(c, start, end) < c.radius - EPS);
    if (!blocking) { optimized.push(end); continue; }
    // Circumscribed regular polygons contain the inflated circles, so polygon routing remains safe.
    const nodes: XY[] = [start, end];
    for (const c of circles) {
      const polygonRadius = c.radius / Math.cos(Math.PI / BOUNDARY_SIDES) + 1e-5;
      for (let i = 0; i < BOUNDARY_SIDES; i++) {
        const angle = TAU * i / BOUNDARY_SIDES;
        nodes.push({ x: c.x + polygonRadius * Math.cos(angle), y: c.y + polygonRadius * Math.sin(angle) });
      }
    }
    const visible = (a: XY, b: XY) => circles.every(c => segmentDistance(c, a, b) >= c.radius - EPS);
    const n = nodes.length, dist = Array(n).fill(Infinity) as number[], prev = Array(n).fill(-1) as number[], used = Array(n).fill(false) as boolean[];
    dist[0] = 0;
    for (let step = 0; step < n; step++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!used[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || !Number.isFinite(dist[u])) break;
      if (u === 1) break;
      used[u] = true;
      for (let v = 0; v < n; v++) {
        if (used[v] || v === u) continue;
        const edge = distance(nodes[u], nodes[v]);
        if (dist[u] + edge < dist[v] - EPS && visible(nodes[u], nodes[v])) { dist[v] = dist[u] + edge; prev[v] = u; }
      }
    }
    if (!Number.isFinite(dist[1])) return { feasible: false, points: [], reason: `Aucun détour sûr n’est disponible entre les waypoints ${segment + 1} et ${segment + 2}.` };
    const path: XY[] = [];
    for (let at = 1; at !== 0; at = prev[at]) {
      if (at < 0 || prev[at] < 0) return { feasible: false, points: [], reason: "Le graphe de visibilité n’a pas produit de chemin valide." };
      path.push(nodes[at]);
    }
    path.reverse();
    optimized.push(...path);
  }
  const points = optimized.map(p => toGeo(p, origin));
  return { feasible: true, points, detourCount: Math.max(0, points.length - route.length), totalDistanceM: optimized.slice(1).reduce((sum, p, i) => sum + distance(optimized[i], p), 0) };
}
