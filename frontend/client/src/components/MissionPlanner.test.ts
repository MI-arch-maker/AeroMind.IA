import { describe, expect, it } from "vitest";
import { missionHttpError } from "./MissionPlanner";

describe("messages d’erreur du Mission Planner", () => {
  it("extrait les détails de réponse utilisés par les API FastAPI et enveloppées", () => {
    expect(missionHttpError(422, { detail: "waypoint invalide" })).toBe("waypoint invalide");
    expect(missionHttpError(403, { error: { message: "accès refusé" } })).toBe("accès refusé");
  });

  it("retombe sur le statut HTTP si le corps ne donne aucun message", () => {
    expect(missionHttpError(503, null)).toBe("HTTP 503");
    expect(missionHttpError(500, { detail: { code: "internal" } })).toBe("HTTP 500");
  });
});
