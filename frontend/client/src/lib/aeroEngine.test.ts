import { describe, expect, it } from "vitest";
import {
  defaultConcept,
  defaultRequirements,
  getCalculationProfile,
  runSimulation,
} from "./aeroEngine";

describe("AeroMind preliminary simulation engine", () => {
  it("is deterministic for identical inputs", () => {
    const first = runSimulation(
      defaultConcept,
      defaultRequirements,
      "SIM-TEST"
    );
    const second = runSimulation(
      defaultConcept,
      defaultRequirements,
      "SIM-TEST"
    );

    expect(first.totalMassKg).toBe(second.totalMassKg);
    expect(first.enduranceH).toBe(second.enduranceH);
    expect(first.metrics).toEqual(second.metrics);
    expect(first.risks).toEqual(second.risks);
  });

  it("computes a positive usable energy budget after reserve", () => {
    const result = runSimulation(
      defaultConcept,
      defaultRequirements,
      "SIM-ENERGY"
    );

    expect(result.energyUsableWh).toBeGreaterThan(0);
    expect(result.energyUsableWh).toBeLessThan(defaultConcept.batteryWh);
    expect(result.estimatedPowerW).toBeGreaterThan(0);
  });

  it("flags an aggressive mission when endurance is below target", () => {
    const result = runSimulation(
      { ...defaultConcept, batteryWh: 420 },
      defaultRequirements,
      "SIM-LOW-ENERGY"
    );
    const endurance = result.metrics.find(metric => metric.id === "energy");

    expect(endurance?.status).toBe("review");
    expect(
      result.risks.some(
        risk => risk.id === "energy-risk" && risk.status === "open"
      )
    ).toBe(true);
  });

  it("treats targets above 216 km/h as uncalibrated, not as operational performance", () => {
    const result = runSimulation(
      { ...defaultConcept, cruiseSpeedKmh: 550 },
      defaultRequirements,
      "SIM-HIGH-SPEED"
    );

    expect(result.metrics.find(metric => metric.id === "speed-domain")?.status).toBe("review");
    expect(result.metrics.find(metric => metric.id === "energy")?.status).toBe("review");
    expect(result.confidence).toBe("indicative");
    expect(result.risks.some(risk => risk.id === "speed-domain-risk" && risk.status === "open")).toBe(true);
  });

  it("flags an overweight configuration", () => {
    const result = runSimulation(
      { ...defaultConcept, payloadKg: 3.6, batteryWh: 1400 },
      defaultRequirements,
      "SIM-OVERWEIGHT"
    );
    const mass = result.metrics.find(metric => metric.id === "mass");

    expect(mass?.status).toBe("fail");
    expect(
      result.risks.some(
        risk => risk.id === "mass-risk" && risk.status === "open"
      )
    ).toBe(true);
  });

  it("includes installed construction material mass in structure and total mass", () => {
    const baseline = runSimulation(defaultConcept, defaultRequirements);
    const withMaterial = runSimulation(
      {
        ...defaultConcept,
        constructionMassKg: 0.18,
        installedMaterials: [
          {
            id: "test-module",
            label: "Module de test",
            use: "Vérification du bilan",
            massKg: 0.18,
            geometry: "reinforcement",
          },
        ],
      },
      defaultRequirements
    );

    expect(
      withMaterial.massBreakdown.structure - baseline.massBreakdown.structure
    ).toBeCloseTo(0.18);
    expect(withMaterial.totalMassKg - baseline.totalMassKg).toBeCloseTo(0.18);
  });

  it("multiplies a component unit mass by quantity in its own mass family", () => {
    const baseline = runSimulation(defaultConcept, defaultRequirements);
    const withMotors = runSimulation(
      {
        ...defaultConcept,
        installedMaterials: [
          {
            id: "motor-set",
            label: "Moteur fabricant",
            use: "Moteur par unité",
            massKg: 0.12,
            quantity: 4,
            geometry: "mount",
            category: "propulsion",
            manufacturer: "Fabricant de test",
            partNumber: "MOTOR-001",
            manufacturerDataStatus: "verified",
          },
        ],
      },
      defaultRequirements
    );

    expect(
      withMotors.massBreakdown.propulsion - baseline.massBreakdown.propulsion
    ).toBeCloseTo(0.48);
    expect(withMotors.totalMassKg - baseline.totalMassKg).toBeCloseTo(0.48);
  });

  it("uses component drag, auxiliary power, and degraded environment in endurance estimates", () => {
    const baseline = runSimulation(defaultConcept, defaultRequirements);
    const equipped = runSimulation({
      ...defaultConcept,
      installedMaterials: [{
        id: "thermal-payload",
        label: "Capteur thermique de test",
        use: "Module synthétique",
        massKg: 0.16,
        geometry: "mount",
        category: "payload",
        dragAreaM2: 0.03,
        powerDrawW: 18,
        connectedTo: "BUS-PAYLOAD",
      }],
    }, defaultRequirements);
    const stressed = runSimulation({
      ...defaultConcept,
      missionEnvironment: { ambientC: -10, windKmh: 55, emiLevel: 0.8 },
    }, defaultRequirements);

    expect(equipped.estimatedPowerW).toBeGreaterThan(baseline.estimatedPowerW);
    expect(equipped.enduranceH).toBeLessThan(baseline.enduranceH);
    expect(stressed.enduranceH).toBeLessThan(baseline.enduranceH);
    expect(stressed.energyUsableWh).toBeLessThan(baseline.energyUsableWh);
  });

  it("uses distinct calculation bases for specialized architectures", () => {
    const flyingWing = runSimulation({ ...defaultConcept, modelType: "aile-volante" }, defaultRequirements, "SIM-WING");
    const conventional = runSimulation({ ...defaultConcept, modelType: "voilure-conventionnelle" }, defaultRequirements, "SIM-CONVENTIONAL");
    const aerostat = runSimulation({ ...defaultConcept, modelType: "aérostat" }, defaultRequirements, "SIM-AEROSTAT");
    const octocopter = runSimulation({ ...defaultConcept, airframe: "quadcopter", motorCount: 8, modelType: "octocoptère" }, defaultRequirements, "SIM-OCTA");

    expect(getCalculationProfile({ ...defaultConcept, modelType: "aile-volante" }).modelType).toBe("aile-volante");
    expect(flyingWing.estimatedPowerW).toBeLessThan(conventional.estimatedPowerW);
    expect(aerostat.estimatedPowerW).toBeLessThan(octocopter.estimatedPowerW);
    expect(aerostat.assumptions.some(item => item.includes("aérostat"))).toBe(true);
  });
});
