import { describe, expect, it } from "vitest";
import { droneCatalog } from "./droneCatalog";
import {
  buildLongRangePreparationNote,
  findLongRangeVector,
  LONG_RANGE_CATEGORY_CLASSIFICATION,
  LONG_RANGE_CATEGORY_LABEL,
  longRangeObservationSummary,
  longRangeObservationVectors,
} from "./longRangeObservation";
import { getCalculationProfile, runSimulation, defaultConcept, defaultRequirements } from "./aeroEngine";

describe("long range observation vectors", () => {
  it("declares a dedicated HALE / MALE category", () => {
    expect(LONG_RANGE_CATEGORY_LABEL).toMatch(/HALE \/ MALE/);
    expect(LONG_RANGE_CATEGORY_CLASSIFICATION).toMatch(/Observation Longue Portée/i);
    expect(longRangeObservationVectors.length).toBeGreaterThanOrEqual(4);
    expect(new Set(longRangeObservationVectors.map(item => item.id)).size).toBe(
      longRangeObservationVectors.length
    );
  });

  it("covers both endurance classes with distinct long-endurance cells", () => {
    expect(longRangeObservationSummary.hale).toBeGreaterThanOrEqual(2);
    expect(longRangeObservationSummary.male).toBeGreaterThanOrEqual(2);
    expect(longRangeObservationSummary.maxEnduranceHours).toBeGreaterThanOrEqual(16);
    expect(longRangeObservationSummary.maxServiceCeilingM).toBeGreaterThanOrEqual(300);
    for (const vector of longRangeObservationVectors) {
      expect(vector.enduranceHours).toBeGreaterThanOrEqual(10);
      expect(vector.serviceCeilingM).toBeGreaterThanOrEqual(200);
      expect(vector.classification).toBe(LONG_RANGE_CATEGORY_CLASSIFICATION);
      expect(vector.key).toBe("fixed-wing");
      expect(vector.configuration.wingspan ?? 0).toBeGreaterThanOrEqual(8);
      expect(vector.configuration.batteryWh ?? 0).toBeGreaterThan(2000);
      expect(vector.environmentalConstraints.length).toBeGreaterThanOrEqual(3);
      expect(vector.sensorSuite.length).toBeGreaterThanOrEqual(3);
      expect(vector.engineeringWatchpoints.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("remains a sensor-only, non-offensive catalogue", () => {
    for (const vector of longRangeObservationVectors) {
      expect(vector.role).toBe("civil");
      expect(vector.defenseUse).toMatch(/non armée/i);
      expect(vector.defenseUse).toMatch(/aucune fonction offensive/i);
      expect(`${vector.mission} ${vector.sensorSuite.join(" ")}`).not.toMatch(
        /missile|roquette|charge militaire|armement|ciblage d/i
      );
    }
  });

  it("keeps the catalogue and its dedicated reference entry available", () => {
    expect(droneCatalog).toHaveLength(69);
    expect(droneCatalog.some(design => design.id === "aeromind-reference-multirotor-001")).toBe(true);
    expect(
      longRangeObservationVectors.some(item =>
        droneCatalog.some(design => design.id === item.id)
      )
    ).toBe(false);
  });

  it("feeds the calculation engine with long-endurance morphologies", () => {
    for (const vector of longRangeObservationVectors) {
      const config = {
        ...defaultConcept,
        ...vector.configuration,
        airframe: vector.key,
        modelType: vector.modelType,
      };
      const profile = getCalculationProfile(config);
      expect(profile.modelType).toBe(vector.modelType);
      const simulation = runSimulation(
        config,
        defaultRequirements,
        `LR-${vector.id}`
      );
      expect(simulation.estimatedPowerW).toBeGreaterThan(0);
      expect(simulation.enduranceH).toBeGreaterThan(0);
    }
  });

  it("builds a preparation note that stays a documentary aid", () => {
    const vector = findLongRangeVector("sentinel-hale-01");
    expect(vector).toBeDefined();
    const note = buildLongRangePreparationNote(vector!);
    expect(note.length).toBeGreaterThanOrEqual(7);
    expect(note.join(" ")).toContain("hypothèse d’avant-projet");
    expect(note.join(" ")).toMatch(/aucune charge militaire/i);
    expect(findLongRangeVector("inconnu")).toBeUndefined();
  });
});
