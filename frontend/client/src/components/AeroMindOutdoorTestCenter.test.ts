import { describe, expect, it } from "vitest";
import { buildOutdoorFleet, buildOutdoorMissionPoints } from "./AeroMindOutdoorTestCenter";
import { droneCatalog } from "../lib/droneCatalog";

describe("AeroMind Outdoor Test Center", () => {
  it("construit une flotte multi-drones stable avec rôles distincts", () => {
    const fleet = buildOutdoorFleet(droneCatalog[0]);
    expect(fleet.length).toBeGreaterThanOrEqual(2);
    expect(new Set(fleet.map((unit) => unit.id)).size).toBe(fleet.length);
    expect(fleet[0].state).toBe("READY");
    expect(fleet.map((unit) => unit.role)).toContain("LEAD / NAVIGATION");
  });

  it("ne produit aucun point cartographique tant que l’opérateur n’a rien défini", () => {
    const points = buildOutdoorMissionPoints(buildOutdoorFleet(droneCatalog[0]));
    expect(points).toEqual([]);
  });
});
