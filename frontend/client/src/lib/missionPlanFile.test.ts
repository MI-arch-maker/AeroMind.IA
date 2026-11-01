import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultConcept } from "./aeroEngine";
import {
  estimateLocalMissionDistanceKm,
  validateLocalMission,
} from "./flightEngineering";
import { parseLocalMissionPlanJson } from "./missionPlanFile";

const samplePlan = {
  profileId: "area-grid",
  radiusKm: 1,
  returnAltitudeM: 60,
  lostLinkAction: "return",
  homeX: 50,
  homeY: 90,
  waypoints: [
    {
      id: "WP-01",
      name: "Entrée de zone",
      x: 30,
      y: 78,
      altitudeM: 40,
      speedKmh: 28,
      action: "inspection",
    },
    {
      id: "WP-02",
      name: "Bande de contrôle",
      x: 70,
      y: 78,
      altitudeM: 40,
      speedKmh: 28,
      action: "return",
    },
  ],
};

describe("parseLocalMissionPlanJson", () => {
  it("accepte le JSON LocalMissionPlan brut exporté par AeroMind", () => {
    expect(parseLocalMissionPlanJson(JSON.stringify(samplePlan))).toEqual(samplePlan);
  });

  it("accepte l’enveloppe versionnée du parcours d’exemple", () => {
    const envelope = {
      schema: "aeromind-local-mission-plan-v1",
      title: "Exemple local",
      disclaimer: "Données fictives",
      missionPlan: samplePlan,
    };
    expect(parseLocalMissionPlanJson(JSON.stringify(envelope))).toEqual(samplePlan);
  });

  it("ignore les métadonnées non opérationnelles et retire les champs inconnus des points", () => {
    const withExtra = {
      ...samplePlan,
      title: "Ne doit pas devenir un champ de mission",
      waypoints: samplePlan.waypoints.map(point => ({ ...point, note: "fiche" })),
    };
    const result = parseLocalMissionPlanJson(JSON.stringify(withExtra));
    expect(result).not.toHaveProperty("title");
    expect(result.waypoints[0]).not.toHaveProperty("note");
  });

  it("refuse une version inconnue, des coordonnées hors canevas et des identifiants dupliqués", () => {
    expect(() =>
      parseLocalMissionPlanJson(
        JSON.stringify({ schema: "future-v9", missionPlan: samplePlan })
      )
    ).toThrow("Version de schéma");
    const outside = {
      ...samplePlan,
      waypoints: [{ ...samplePlan.waypoints[0], x: 101 }, samplePlan.waypoints[1]],
    };
    expect(() => parseLocalMissionPlanJson(JSON.stringify(outside))).toThrow("x doit être");
    const duplicated = {
      ...samplePlan,
      waypoints: [samplePlan.waypoints[0], { ...samplePlan.waypoints[1], id: "WP-01" }],
    };
    expect(() => parseLocalMissionPlanJson(JSON.stringify(duplicated))).toThrow("dupliqué");
  });

  it("refuse les fichiers trop grands et les séquences de points invalides", () => {
    expect(() => parseLocalMissionPlanJson(" ".repeat(128_001))).toThrow("128 ko");
    const tooFew = { ...samplePlan, waypoints: [samplePlan.waypoints[0]] };
    expect(() => parseLocalMissionPlanJson(JSON.stringify(tooFew))).toThrow("de 2 à 64");
  });

  it("charge le fichier-exemple livré et le valide sur le concept par défaut", () => {
    const file = new URL(
      "../../../examples/exemple-parcours-inspection-solaire-local.json",
      import.meta.url
    );
    const plan = parseLocalMissionPlanJson(readFileSync(file, "utf8"));
    const checks = validateLocalMission(defaultConcept, plan);
    expect(plan.waypoints).toHaveLength(6);
    expect(estimateLocalMissionDistanceKm(plan)).toBeGreaterThan(0);
    expect(checks.some(check => check.severity === "block")).toBe(false);
  });
});
