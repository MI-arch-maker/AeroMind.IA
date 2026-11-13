import { describe, expect, it } from "vitest";
import {
  calculateAirDensity,
  createLocalRun,
  defaultAerodynamicParameters,
  estimateAerodynamicPerformance,
  estimateMeshWork,
  makeOpenFoamHandoff,
  reportMarkdown,
} from "./aerodynamicWorkspace";

describe("aerodynamic workspace scientific boundaries", () => {
  const { airframe, parameters } = defaultAerodynamicParameters({
    airframe: "fixed-wing",
    cruiseSpeedKmh: 79.2,
    wingspan: 2.4,
    chord: 0.34,
    maxTakeoffKg: 8.4,
  });

  it("computes ideal-gas density only for valid pressure and temperature", () => {
    expect(calculateAirDensity(101325, 15)).toBeCloseTo(1.225, 2);
    expect(calculateAirDensity(0, 15)).toBeNull();
    expect(calculateAirDensity(101325, -273.15)).toBeNull();
  });

  it("derives default ISA pressure from altitude and preserves explicit manual pressure", () => {
    const seaLevel = defaultAerodynamicParameters({ altitudeM: 0 }).parameters;
    const highAltitude = defaultAerodynamicParameters({ altitudeM: 2500 }).parameters;
    expect(seaLevel.pressureMode).toBe("isa");
    expect(highAltitude.pressureMode).toBe("isa");
    expect(highAltitude.pressurePa).toBeLessThan(seaLevel.pressurePa);
    const manual = { ...highAltitude, pressureMode: "manual" as const, pressurePa: 101325 };
    const estimate = estimateAerodynamicPerformance("fixed-wing", manual);
    expect(estimate.densityKgM3).toBeCloseTo(calculateAirDensity(101325, manual.temperatureC)!, 8);
    expect(estimate.fixedWing?.assumptions.join(" ")).toContain("pression statique saisie");
  });

  it("labels fixed-wing outputs as a simplified analytical estimate", () => {
    const result = estimateAerodynamicPerformance(airframe, parameters);
    expect(result.status).toBe("estimate");
    expect(result.sourceLabel).toBe("MODÈLE ANALYTIQUE SIMPLIFIÉ");
    expect(result.dragN).toBeGreaterThan(0);
    expect(result.fixedWing?.assumptions.join(" ").toLowerCase()).toContain("coefficients");
  });

  it("does not invent CFD solver, mesh, or convergence results", () => {
    const run = createLocalRun({
      modelName: "Unit test",
      modelVersion: "local",
      elapsedMs: 1.4,
      initialConditions: "Test analytique",
      performance: estimateAerodynamicPerformance(airframe, parameters),
      parameters,
    });
    expect(run.status).toBe("ANALYTIC ESTIMATE");
    expect(run.solver).toContain("NO CFD SOLVER");
    expect(run.mesh).toContain("NOT GENERATED");
    expect(run.convergence).toContain("NOT APPLICABLE");
    expect(reportMarkdown(run)).toContain("ne contient pas de simulation CFD");
  });

  it("exports a preparation manifest, never a runnable or completed CFD case", () => {
    const handoff = makeOpenFoamHandoff({
      modelName: "Unit test",
      modelVersion: "v1",
      airframe,
      parameters,
    });
    expect(handoff.state).toBe("PREPARATION_ONLY_SOLVER_NOT_CONNECTED");
    expect(handoff.solver.executableDetected).toBe(false);
    expect(handoff.result).toBeNull();
    expect(handoff.mesh).toBeNull();
    expect(handoff.note).toContain("ne constitue pas un dossier de cas OpenFOAM exécutable");
  });

  it("labels mesh sizing as estimate and rejects missing model bounds", () => {
    const estimate = estimateMeshWork({ x: 2.4, y: 0.35, z: 0.18 }, parameters);
    expect(estimate?.estimatedCells).toBeGreaterThan(0);
    expect(estimate?.status).toContain("NON GÉNÉRÉ");
    expect(estimateMeshWork({ x: 0, y: 1, z: 1 }, parameters)).toBeNull();
  });
});
