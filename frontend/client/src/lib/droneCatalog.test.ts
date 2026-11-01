import { describe, expect, it } from "vitest";
import { droneCatalog } from "./droneCatalog";
import { defaultConcept, defaultRequirements, getCalculationProfile, runSimulation } from "./aeroEngine";

describe("AeroMind drone catalog profiles", () => {
  it("contains the editable civil, non-armed defense and reference profiles", () => {
    expect(droneCatalog).toHaveLength(69);
    expect(new Set(droneCatalog.map(design => design.id)).size).toBe(69);
    for (const design of droneCatalog) {
      expect(design.configuration.wingspan ?? 0).toBeGreaterThan(0);
      expect(design.configuration.fuselageLength ?? 0).toBeGreaterThan(0);
      expect(design.configuration.batteryWh ?? 0).toBeGreaterThan(0);
      expect(design.configuration.motorCount ?? 0).toBeGreaterThan(0);
      expect(design.configuration.payloadKg ?? -1).toBeGreaterThanOrEqual(0);
      expect(design.configuration.cruiseSpeedKmh ?? 0).toBeGreaterThan(0);
    }
  });

  it("covers base and specialized architectures with distinct starting configurations", () => {
    expect(droneCatalog.filter(design => design.key === "fixed-wing")).toHaveLength(33);
    expect(droneCatalog.filter(design => design.key === "quadcopter")).toHaveLength(20);
    expect(droneCatalog.filter(design => design.key === "vtol")).toHaveLength(16);
    expect(new Set(droneCatalog.map(design => design.modelType)).size).toBe(24);
    expect(new Set(droneCatalog.map(design => design.configuration.motorCount)).size).toBeGreaterThan(1);
  });

  it("keeps generic quadcopters as multirotors rather than misclassifying them as ducted fans", () => {
    expect(getCalculationProfile({ ...defaultConcept, airframe: "quadcopter" }).modelType).toBe("multirotor");
    expect(getCalculationProfile({ ...defaultConcept, airframe: "quadcopter" }).powerFactor).toBeLessThan(
      getCalculationProfile({ ...defaultConcept, modelType: "ducted-fan" }).powerFactor,
    );
  });

  it("propagates every catalog morphology into the calculation engine", () => {
    for (const design of droneCatalog) {
      const config = { ...defaultConcept, ...design.configuration, airframe: design.key, modelType: design.modelType };
      expect(getCalculationProfile(config).modelType).toBe(design.modelType);
      expect(runSimulation(config, defaultRequirements, `CAT-${design.id}`).estimatedPowerW).toBeGreaterThan(0);
    }
  });

  it("qualifies democratic-defense profiles without weapon payloads", () => {
    const defense = droneCatalog.filter(design => design.role === "défense-non-armée");
    expect(defense).toHaveLength(12);
    expect(defense.every(design => design.defenseUse?.length)).toBe(true);
    expect(defense.every(design => /sans|aucune|capteurs/i.test(design.defenseUse ?? ""))).toBe(true);
    expect(droneCatalog.filter(design => design.origin === "prototype-reference")).toHaveLength(2);
    expect(droneCatalog.find(design => design.id === "deluge-e")?.origin).toBe("prototype-reference");
    expect(droneCatalog.find(design => design.id === "aeromind-reference-multirotor-001")?.origin).toBe("prototype-reference");
  });

  it("publishes all eight PDF-derived cells as shared non-armed CAD profiles", () => {
    const pdfCells = droneCatalog.filter(design => design.id.startsWith("pdf-"));
    expect(pdfCells).toHaveLength(8);
    expect(pdfCells.every(design => design.role === "civil" && design.configuration.payloadKg === 0)).toBe(true);
    expect(pdfCells.every(design => design.referenceImage?.endsWith("-hud.svg"))).toBe(true);
    expect(pdfCells.every(design => design.engineeringAssets && Object.values(design.engineeringAssets).every(path => path.startsWith("/assets/aeromind-cell-library/")))).toBe(true);
    expect(new Set(pdfCells.map(design => design.modelType)).size).toBeGreaterThanOrEqual(6);
    expect(pdfCells.find(design => design.id === "pdf-08-aile-droite")?.referenceLabel).toMatch(/charges externes offensives exclues/i);
  });
});
