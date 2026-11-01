import { describe, expect, it } from "vitest";
import { missionHttpError } from "./MissionPlanner";
import { buildMissionPlannerSnapshot } from "./MissionPlannerView";

describe("messages d’erreur du Mission Planner", () => {
  it("extrait les détails de réponse utilisés par les API FastAPI et enveloppées", () => {
    expect(missionHttpError(422, { detail: "waypoint invalide" })).toBe("waypoint invalide");
    expect(missionHttpError(403, { error: { message: "accès refusé" } })).toBe("accès refusé");
  });

  it("retombe sur le statut HTTP si le corps ne donne aucun message", () => {
    expect(missionHttpError(503, null)).toBe("HTTP 503");
    expect(missionHttpError(500, { detail: { code: "internal" } })).toBe("HTTP 500");
  });

  it("construit un export local complet sans action matérielle", () => {
    const snapshot = buildMissionPlannerSnapshot(
      { designName: "Essai local", platformProfile: "demo" } as never,
      [{ id: "wp-1", type: "waypoint", name: "WP 1", lat: 45, lng: 3, alt: 120, speed: 30, action: "inspection" }],
      [{ id: "f-1", name: "Limite 1", lat: 45, lng: 3, approximate: false }],
      [],
      { altitude: 120, spacing: 70 },
    );
    expect(snapshot.format).toBe("aeromind-mission-planner/local-v1");
    expect(snapshot.activeDrone).toBe("Essai local");
    expect(snapshot.missionItems[0]).toMatchObject({ latitude: 45, longitude: 3, altitudeM: 120 });
    expect(snapshot.geofence).toHaveLength(1);
  });
});
