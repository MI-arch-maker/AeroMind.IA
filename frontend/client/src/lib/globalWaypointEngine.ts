import type { LocalMissionPlan, MissionWaypoint } from "./aeroEngine";

export type WaypointEnvironment = "simulation" | "physical";
export type AltitudeReference = "MSL" | "AGL" | "ELLIPSOID" | "UNKNOWN";

export type UniversalWaypoint = {
  waypoint_id: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number;
  altitude_reference: AltitudeReference;
  name: string;
  description: string;
  sequence_order: number;
  source: "map" | "manual" | "search" | "import" | "legacy-local";
  environment: WaypointEnvironment;
  mission_id: string;
  created_at: string;
  updated_at: string;
};

export type WaypointMission = {
  mission_id: string;
  environment: WaypointEnvironment;
  waypoints: UniversalWaypoint[];
  updated_at: string;
};

export type WaypointValidation = { valid: true } | { valid: false; errors: string[] };
export type WaypointHistoryEntry = { at: string; action: "create" | "update" | "delete" | "reorder" | "import"; waypoint_ids: string[] };

const now = () => new Date().toISOString();
const id = () => `WP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const EMPTY_WAYPOINT_MISSION = (missionId = "mission-draft", environment: WaypointEnvironment = "simulation"): WaypointMission => ({ mission_id: missionId, environment, waypoints: [], updated_at: now() });

export function validateUniversalWaypoint(waypoint: Pick<UniversalWaypoint, "latitude" | "longitude" | "altitude">): WaypointValidation {
  const errors: string[] = [];
  if (waypoint.latitude === null || waypoint.longitude === null) errors.push("Latitude et longitude requises.");
  else {
    if (!Number.isFinite(waypoint.latitude) || waypoint.latitude < -90 || waypoint.latitude > 90) errors.push("La latitude doit être comprise entre -90° et 90°.");
    if (!Number.isFinite(waypoint.longitude) || waypoint.longitude < -180 || waypoint.longitude > 180) errors.push("La longitude doit être comprise entre -180° et 180°.");
  }
  if (!Number.isFinite(waypoint.altitude) || waypoint.altitude < 0) errors.push("L’altitude doit être un nombre positif.");
  return errors.length ? { valid: false, errors } : { valid: true };
}

export function createUniversalWaypoint(input: { mission_id: string; environment: WaypointEnvironment; latitude: number; longitude: number; altitude?: number; altitude_reference?: AltitudeReference; name?: string; description?: string; source?: UniversalWaypoint["source"] }): UniversalWaypoint {
  const waypoint = { latitude: input.latitude, longitude: input.longitude, altitude: input.altitude ?? 0 };
  const validation = validateUniversalWaypoint(waypoint);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  const timestamp = now();
  return { waypoint_id: id(), latitude: input.latitude, longitude: input.longitude, altitude: input.altitude ?? 0, altitude_reference: input.altitude_reference ?? "MSL", name: input.name?.trim() || "Waypoint", description: input.description?.trim() || "", sequence_order: 0, source: input.source ?? "manual", environment: input.environment, mission_id: input.mission_id, created_at: timestamp, updated_at: timestamp };
}

export function normalizeWaypointOrder(waypoints: UniversalWaypoint[]): UniversalWaypoint[] { return waypoints.map((waypoint, index) => ({ ...waypoint, sequence_order: index + 1 })); }
export function addUniversalWaypoint(mission: WaypointMission, waypoint: UniversalWaypoint): WaypointMission { return { ...mission, waypoints: normalizeWaypointOrder([...mission.waypoints, { ...waypoint, mission_id: mission.mission_id, environment: mission.environment }]), updated_at: now() }; }
export function updateUniversalWaypoint(mission: WaypointMission, waypointId: string, patch: Partial<Omit<UniversalWaypoint, "waypoint_id" | "mission_id" | "environment" | "created_at">>): WaypointMission { const next = mission.waypoints.map((waypoint) => waypoint.waypoint_id === waypointId ? { ...waypoint, ...patch, updated_at: now() } : waypoint); return { ...mission, waypoints: normalizeWaypointOrder(next), updated_at: now() }; }
export function deleteUniversalWaypoint(mission: WaypointMission, waypointId: string): WaypointMission { return { ...mission, waypoints: normalizeWaypointOrder(mission.waypoints.filter((waypoint) => waypoint.waypoint_id !== waypointId)), updated_at: now() }; }
export function reorderUniversalWaypoint(mission: WaypointMission, waypointId: string, direction: -1 | 1): WaypointMission { const index = mission.waypoints.findIndex((waypoint) => waypoint.waypoint_id === waypointId); const destination = index + direction; if (index < 0 || destination < 0 || destination >= mission.waypoints.length) return mission; const waypoints = [...mission.waypoints]; [waypoints[index], waypoints[destination]] = [waypoints[destination], waypoints[index]]; return { ...mission, waypoints: normalizeWaypointOrder(waypoints), updated_at: now() }; }

export function universalWaypointsToGeoJson(waypoints: UniversalWaypoint[]): string { return JSON.stringify({ type: "FeatureCollection", features: waypoints.filter((waypoint) => waypoint.latitude !== null && waypoint.longitude !== null).map((waypoint) => ({ type: "Feature", geometry: { type: "Point", coordinates: [waypoint.longitude, waypoint.latitude, waypoint.altitude] }, properties: { waypoint_id: waypoint.waypoint_id, name: waypoint.name, description: waypoint.description, sequence_order: waypoint.sequence_order, altitude_reference: waypoint.altitude_reference, environment: waypoint.environment } })) }, null, 2); }

export function parseWaypointImport(text: string, format: "geojson" | "csv" | "gpx" | "kml", missionId: string, environment: WaypointEnvironment): UniversalWaypoint[] {
  if (format === "csv") { const rows = text.trim().split(/\r?\n/).filter(Boolean); const header = rows.shift()?.split(",").map((value) => value.trim().toLowerCase()) ?? []; const latIndex = header.findIndex((value) => ["lat", "latitude"].includes(value)); const lonIndex = header.findIndex((value) => ["lon", "lng", "longitude"].includes(value)); if (latIndex < 0 || lonIndex < 0) throw new Error("CSV attendu avec les colonnes latitude et longitude."); return rows.map((row, index) => { const values = row.split(","); return createUniversalWaypoint({ mission_id: missionId, environment, latitude: Number(values[latIndex]), longitude: Number(values[lonIndex]), altitude: Number(values[header.findIndex((value) => ["alt", "altitude"].includes(value))] || 0), name: values[header.findIndex((value) => ["name", "nom"].includes(value))] || `Import ${index + 1}`, source: "import" }); }); }
  if (format === "geojson") { const parsed = JSON.parse(text) as { features?: Array<{ geometry?: { coordinates?: number[] }; properties?: { name?: string; description?: string } }> }; return (parsed.features ?? []).map((feature, index) => { const coordinates = feature.geometry?.coordinates ?? []; return createUniversalWaypoint({ mission_id: missionId, environment, longitude: Number(coordinates[0]), latitude: Number(coordinates[1]), altitude: Number(coordinates[2] ?? 0), name: feature.properties?.name ?? `Import ${index + 1}`, description: feature.properties?.description, source: "import" }); }); }
  if (format === "gpx") { return [...text.matchAll(/<wpt[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/wpt>/gi)].map((match, index) => createUniversalWaypoint({ mission_id: missionId, environment, latitude: Number(match[1]), longitude: Number(match[2]), name: match[3].match(/<name>([^<]+)<\/name>/i)?.[1] ?? `Import ${index + 1}`, source: "import" })); }
  return [...text.matchAll(/<coordinates>\s*([\d.-]+),([\d.-]+)(?:,([\d.-]+))?/gi)].map((match, index) => createUniversalWaypoint({ mission_id: missionId, environment, longitude: Number(match[1]), latitude: Number(match[2]), altitude: Number(match[3] ?? 0), name: `Import ${index + 1}`, source: "import" }));
}

export function migrateLegacyMissionPlan(plan: LocalMissionPlan | undefined, missionId: string, environment: WaypointEnvironment): WaypointMission {
  const waypoints = (plan?.waypoints ?? []).map((point, index) => ({ waypoint_id: point.id, latitude: point.latitude ?? null, longitude: point.longitude ?? null, altitude: point.altitudeM, altitude_reference: "MSL" as const, name: point.name, description: point.latitude == null || point.longitude == null ? "Coordonnée géographique à confirmer; ancien canevas local." : "", sequence_order: index + 1, source: point.latitude == null || point.longitude == null ? "legacy-local" as const : "manual" as const, environment, mission_id: missionId, created_at: now(), updated_at: now() }));
  return { mission_id: missionId, environment, waypoints, updated_at: now() };
}

export function toLegacyMissionPlan(mission: WaypointMission): LocalMissionPlan {
  return { operationName: "Mission universelle", radiusKm: 0, returnAltitudeM: 0, lostLinkAction: "return", homeX: 0, homeY: 0, waypoints: mission.waypoints.map((waypoint, index): MissionWaypoint => ({ id: waypoint.waypoint_id, name: waypoint.name, x: waypoint.longitude === null ? 0 : (waypoint.longitude + 180) / 3.6, y: waypoint.latitude === null ? 0 : (90 - waypoint.latitude) / 1.8, latitude: waypoint.latitude ?? undefined, longitude: waypoint.longitude ?? undefined, altitudeM: waypoint.altitude, speedKmh: 0, action: index === mission.waypoints.length - 1 ? "return" : "inspection" })) };
}
