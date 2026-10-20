import { describe, expect, it } from "vitest";
import { defaultConcept } from "./aeroEngine";
import { simulateFleet } from "./fleetSimulation";

describe("fleet simulation", () => {
  it("calculates payload and energy capacity for a non-armed fleet", () => {
    const result = simulateFleet(defaultConcept, { aircraftCount: 4, payloadKgPerAircraft: 2, missionKind: "search-rescue" });
    expect(result.aircraft).toHaveLength(4);
    expect(result.totalPayloadKg).toBe(8);
    expect(result.totalUsableEnergyWh).toBeGreaterThan(0);
    expect(result.assumptions.some(item => item.includes("hors périmètre"))).toBe(true);
  });

  it("flags a demanding load as review or failure", () => {
    const result = simulateFleet(defaultConcept, { aircraftCount: 2, payloadKgPerAircraft: 12, missionDistanceKm: 250, loiterMinutes: 180, windKmh: 60 });
    expect(["review", "fail"]).toContain(result.overallStatus);
    expect(result.aircraft.some(item => item.status !== "pass")).toBe(true);
    expect(result.risks.length).toBeGreaterThan(0);
  });

  it("bounds hostile or unsafe inputs without creating commands", () => {
    const result = simulateFleet(defaultConcept, { aircraftCount: 999, batteryAgingPct: 999, linkLossProbabilityPct: 999, returnOnLinkLoss: false });
    expect(result.scenario.aircraftCount).toBe(24);
    expect(result.scenario.batteryAgingPct).toBe(50);
    expect(result.scenario.linkLossProbabilityPct).toBe(100);
    expect(result.risks.some(item => item.includes("retour automatique"))).toBe(true);
  });
});
