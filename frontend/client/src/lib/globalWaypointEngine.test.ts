import { describe, expect, it } from "vitest";
import { addUniversalWaypoint, createUniversalWaypoint, deleteUniversalWaypoint, EMPTY_WAYPOINT_MISSION, parseWaypointImport, reorderUniversalWaypoint, updateUniversalWaypoint, validateUniversalWaypoint } from "./globalWaypointEngine";

describe("AEROMIND GLOBAL WAYPOINT ENGINE", () => {
  it("refuse les coordonnées hors limites sans les tronquer", () => {
    expect(validateUniversalWaypoint({ latitude: 91, longitude: 0, altitude: 10 })).toEqual({ valid: false, errors: ["La latitude doit être comprise entre -90° et 90°."] });
    expect(validateUniversalWaypoint({ latitude: 0, longitude: 181, altitude: 10 }).valid).toBe(false);
  });
  it("crée, modifie, réordonne et supprime sans perdre l’ordre", () => {
    let mission = EMPTY_WAYPOINT_MISSION("acceptance", "simulation");
    const first = createUniversalWaypoint({ mission_id: "acceptance", environment: "simulation", latitude: 1, longitude: 2, name: "Singapour" });
    const second = createUniversalWaypoint({ mission_id: "acceptance", environment: "simulation", latitude: 35, longitude: 139, name: "Japon" });
    mission = addUniversalWaypoint(addUniversalWaypoint(mission, first), second);
    expect(mission.waypoints.map((item) => item.sequence_order)).toEqual([1, 2]);
    mission = updateUniversalWaypoint(mission, first.waypoint_id, { name: "Point modifié", latitude: -23.55, longitude: -46.63 });
    mission = reorderUniversalWaypoint(mission, first.waypoint_id, 1);
    expect(mission.waypoints[0].name).toBe("Japon");
    mission = deleteUniversalWaypoint(mission, first.waypoint_id);
    expect(mission.waypoints).toHaveLength(1);
    expect(mission.waypoints[0].sequence_order).toBe(1);
  });
  it("importe GeoJSON et CSV avec validation WGS84", () => {
    const geojson = parseWaypointImport(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [139.6917, 35.6895, 40] }, properties: { name: "Tokyo" } }] }), "geojson", "geo", "simulation");
    const csv = parseWaypointImport("name,latitude,longitude,altitude\nSydney,-33.8688,151.2093,20", "csv", "csv", "physical");
    expect(geojson[0]).toMatchObject({ latitude: 35.6895, longitude: 139.6917, name: "Tokyo", environment: "simulation" });
    expect(csv[0]).toMatchObject({ latitude: -33.8688, longitude: 151.2093, environment: "physical" });
  });
});
