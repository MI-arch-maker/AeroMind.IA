import { describe, expect, it } from "vitest";
import {
  defaultConcept,
  type SimulationResult as AeroMindSimulation,
} from "../aeroEngine";
import { adaptProjectToLab } from "./adapter";
import { simulate, validateConfig } from "./simulation";

const baselineSimulation: AeroMindSimulation = {
  runId: "AM-BASELINE",
  generatedAt: "2026-10-21T00:00:00.000Z",
  method: "test fixture",
  totalMassKg: 4.4,
  energyUsableWh: 760,
  estimatedPowerW: 520,
  enduranceH: 1.46,
  rangeKm: 75,
  wingAreaM2: 0.9,
  wingLoadingKgM2: 4.9,
  energyMarginH: 0.7,
  windMarginPercent: 35,
  massBreakdown: {
    structure: 2.4,
    battery: 0.5,
    propulsion: 0.4,
    avionics: 0.3,
    payload: 0.8,
  },
  metrics: [],
  risks: [],
  confidence: "moderate",
  engineVersion: "test",
  modules: [],
  assumptions: [],
  limits: [],
};

describe("adaptProjectToLab", () => {
  it("reprend les paramètres actifs de conception dans le modèle local", () => {
    const project = {
      ...defaultConcept,
      batteryWh: 900,
      payloadKg: 0.8,
      maxTakeoffKg: 8.4,
      cruiseSpeedKmh: 54,
      windSpeedKmh: 18,
      reserveFraction: 0.2,
      altitudeM: 140,
      missionEnvironment: { ambientC: 12, windKmh: 25, emiLevel: 0 },
      missionTarget: {
        name: "Cartographie civile",
        brief: "Cartographier une zone de service.",
      },
    };
    const result = adaptProjectToLab(
      project,
      baselineSimulation,
      "Objectif de test.",
    );

    expect(result.drone.profile).toBe("ATLAS / configuration 03");
    expect(result.drone.emptyMassKg).toBeCloseTo(3.6);
    expect(result.drone.payloadLimitKg).toBeCloseTo(4.8);
    expect(result.drone.batteryWh).toBe(900);
    expect(result.drone.cruiseSpeedMps).toBe(15);
    expect(result.mission.kind).toBe("mapping");
    expect(result.conditions.payloadKg).toBe(0.8);
    expect(result.conditions.windMps).toBeCloseTo(25 / 3.6);
    expect(result.conditions.temperatureC).toBe(12);
    expect(result.conditions.reservePct).toBe(20);
    expect(validateConfig(result)).toEqual([]);
    expect(simulate(result).powerDrawW).toBe(520);
  });

  it("uses the locally declared mission route and preserves the project object", () => {
    const project = {
      ...defaultConcept,
      missionPlan: {
        operationName: "Inspection des infrastructures",
        radiusKm: 1,
        returnAltitudeM: 90,
        lostLinkAction: "return" as const,
        homeX: 0,
        homeY: 0,
        waypoints: [
          {
            id: "WP-01",
            name: "Inspection",
            x: 100,
            y: 0,
            altitudeM: 90,
            speedKmh: 50,
            action: "inspection" as const,
          },
        ],
      },
    };
    const before = structuredClone(project);
    const result = adaptProjectToLab(
      project,
      baselineSimulation,
      "Objectif de test.",
    );

    expect(result.mission.kind).toBe("inspection");
    expect(result.conditions.distanceKm).toBeGreaterThan(0.1);
    expect(result.conditions.distanceKm).toBeLessThan(100);
    expect(project).toEqual(before);
  });

  it("converts a 550 km/h concept target accurately and keeps the simulation out of PASS", () => {
    const project = { ...defaultConcept, cruiseSpeedKmh: 550 };
    const labConfig = adaptProjectToLab(
      project,
      baselineSimulation,
      "Objectif de test.",
    );
    expect(labConfig.drone.cruiseSpeedMps).toBeCloseTo(550 / 3.6, 5);
    expect(validateConfig(labConfig)).toEqual([]);
    expect(simulate(labConfig).verdict).not.toBe("PASS");
  });
});
