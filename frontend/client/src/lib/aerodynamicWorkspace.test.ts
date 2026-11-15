import { describe, expect, it } from "vitest";
import {
  calculateAirDensity, createLocalRun, defaultAerodynamicParameters,
  estimateAerodynamicPerformance, estimateMeshWork, makeOpenFoamHandoff, reportMarkdown,
  type AerodynamicParameters,
} from "./aerodynamicWorkspace";
import {
  aerodynamicNumericKeys, createUserScenario, decodeUserParameters, readUserScenarios,
  removeLegacyAnalyticHistory, USER_SCENARIO_PROVENANCE, USER_SCENARIO_SCHEMA_VERSION,
} from "./aerodynamicUserData";

// Explicit unit-test fixture for shared analytical helpers, never application defaults.
const analyticalFixture: AerodynamicParameters = {
  speedMps: 22, flowDirectionDeg: 0, altitudeM: 0, temperatureC: 15,
  pressurePa: 101325, pressureMode: "manual", massKg: 8.4, wingspanM: 2.4,
  chordM: 0.34, taperRatio: 0.65, angleOfAttackDeg: 3, bankDeg: 0,
  cd0: 0.04, oswaldEfficiency: 0.8, clMax: 1.2, viscosityPaS: 1.81e-5,
  turbulenceModel: "k-omega-sst", calculationType: "steady-incompressible",
  rotorCount: 4, rotorDiameterM: 0.36, meshCellSizeMm: 12,
  meshRefinement: "standard", inletBoundary: "Test inlet", outletBoundary: "Test outlet",
};
const enteredScenario = () => createUserScenario({ name: "Essai utilisateur", airframe: "",
  parameters: { ...defaultAerodynamicParameters({}).parameters, speedMps: 17.3, temperatureC: 0 } })!;
const persisted = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("aerodynamic user preparation without synthetic data", () => {
  it("starts with every numeric field empty and no assumed architecture, boundary or solver option", () => {
    const initial = defaultAerodynamicParameters({});
    expect(initial.airframe).toBe("");
    expect(initial.isDemonstration).toBe(false);
    for (const key of aerodynamicNumericKeys) expect(Number.isNaN(initial.parameters[key])).toBe(true);
    for (const value of Object.values(initial.parameters)) if (typeof value === "string") expect(value).toBe("");
  });

  it("does not silently reuse even a fully populated cockpit profile", () => {
    const initial = defaultAerodynamicParameters({ airframe: "fixed-wing", cruiseSpeedKmh: 79.2,
      wingspan: 2.4, chord: 0.34, maxTakeoffKg: 8.4, altitudeM: 2500, motorCount: 4, propDiameter: 0.36 });
    expect(initial.airframe).toBe("");
    for (const key of aerodynamicNumericKeys) expect(Number.isNaN(initial.parameters[key])).toBe(true);
  });

  it("saves only explicitly entered data with strict v2 provenance", () => {
    const record = enteredScenario();
    expect(record.provenance).toBe(USER_SCENARIO_PROVENANCE);
    expect(record.schemaVersion).toBe(USER_SCENARIO_SCHEMA_VERSION);
    expect(record.parameters.speedMps).toBe(17.3);
    expect(record.airframe).toBe("");
    expect(Number.isNaN(record.parameters.pressurePa)).toBe(true);
    expect(record).not.toHaveProperty("performance");
  });

  it("revives JSON null to NaN across every empty numeric field and preserves real zero", () => {
    const record = enteredScenario();
    const jsonRecord = persisted(record);
    expect(jsonRecord.parameters.pressurePa).toBeNull();
    const [restored] = readUserScenarios([jsonRecord]);
    expect(restored.parameters.speedMps).toBe(17.3);
    expect(restored.parameters.temperatureC).toBe(0);
    for (const key of aerodynamicNumericKeys) if (!["speedMps", "temperatureC"].includes(key)) {
      expect(Number.isNaN(restored.parameters[key])).toBe(true);
    }
    expect(restored.parameters.pressureMode).toBe("");
  });

  it("purges ambiguous v1 scenarios and rejects wrong/missing versions or provenance", () => {
    const explicit = persisted(enteredScenario());
    const legacy = { ...explicit, id: "legacy", parameters: analyticalFixture, provenance: "local-user-scenario" };
    delete legacy.schemaVersion;
    expect(readUserScenarios([legacy, { ...explicit, schemaVersion: "2" },
      { ...explicit, provenance: "local-user-scenario" }, explicit])).toHaveLength(1);
    expect(readUserScenarios([legacy])).toEqual([]);
    expect(readUserScenarios({ scenarios: [explicit] })).toEqual([]);
  });

  it("rejects missing parameters, coercion, unsupported enums, infinite values and malformed records", () => {
    const record = persisted(enteredScenario());
    const missing = { ...record.parameters };
    delete missing.pressurePa;
    for (const parameters of [missing, { ...record.parameters, massKg: "8.4" },
      { ...record.parameters, speedMps: Infinity }, { ...record.parameters, turbulenceModel: "demo" }]) {
      expect(readUserScenarios([{ ...record, parameters }])).toEqual([]);
    }
    expect(readUserScenarios([null, {}, 5, { ...record, createdAt: "not-a-date" },
      { ...record, airframe: "quadcopter" }, { ...record, name: " " }])).toEqual([]);
    expect(decodeUserParameters(null)).toBeNull();
    expect(readUserScenarios([record, record])).toHaveLength(1);
  });

  it("does not create an empty/named-only scenario or accept malformed input", () => {
    const parameters = defaultAerodynamicParameters({}).parameters;
    expect(createUserScenario({ name: "Nom seul", airframe: "", parameters })).toBeNull();
    expect(createUserScenario({ name: " ", airframe: "fixed-wing", parameters })).toBeNull();
    expect(createUserScenario({ name: "Architecture saisie", airframe: "fixed-wing", parameters })).not.toBeNull();
    expect(createUserScenario({ name: "Invalide", airframe: "", parameters: { ...parameters, speedMps: Infinity } })).toBeNull();
  });

  it("preserves every explicitly entered v2 scenario, without silent 30-item truncation", () => {
    const scenarios = Array.from({ length: 35 }, (_, index) => ({ ...persisted(enteredScenario()), id: `user-${index}` }));
    expect(readUserScenarios(scenarios)).toHaveLength(35);
  });

  it("purges known legacy analytical history, but never deletes non-analytical records", () => {
    const real = { id: "external-cfd-1", status: "CONVERGED", solver: "OpenFOAM",
      provenance: { source: "user-file", sha256: "source-checksum" }, fields: { pressure: [1, 2] } };
    const unknown = { id: "external-unverified", originalData: "kept for recovery" };
    const filtered = removeLegacyAnalyticHistory([
      { status: "ANALYTIC ESTIMATE" }, { solver: "ANALYTIC MODEL — NO CFD SOLVER" },
      { id: "AERO-EST-OLD" }, { performance: { sourceLabel: "MODÈLE ANALYTIQUE SIMPLIFIÉ" } }, real, unknown,
    ]);
    expect(filtered).toEqual([real, unknown]);
    expect(filtered[0]).toBe(real);
    expect(removeLegacyAnalyticHistory(null)).toEqual([]);
  });

  it("exports only documentary entries, with null for missing values and no derived density", () => {
    const parameters = { ...defaultAerodynamicParameters({}).parameters, speedMps: 17.3 };
    const handoff = makeOpenFoamHandoff({ modelName: "", modelVersion: "", airframe: "", parameters });
    expect(handoff.schemaVersion).toBe(2);
    expect(handoff.state).toBe("PREPARATION_ONLY_SOLVER_NOT_CONNECTED");
    expect(handoff.requestedCase.speedMps).toBe(17.3);
    expect(handoff.requestedCase.pressurePa).toBeNull();
    expect(handoff.requestedCase.altitudeM).toBeNull();
    expect(handoff.requestedCase.airframe).toBeNull();
    expect(handoff.requestedCase.turbulenceModel).toBeNull();
    expect(handoff.requestedCase).not.toHaveProperty("densityKgM3");
    expect(handoff.result).toBeNull();
    expect(handoff.mesh).toBeNull();
    expect(handoff.convergence).toBeNull();
    expect(handoff.solver.executableDetected).toBe(false);
    expect(handoff.note).toContain("ne constitue pas un dossier de cas OpenFOAM exécutable");
  });
});

describe("shared analytical helpers remain available outside this UI", () => {
  it("computes ideal-gas density only for valid input", () => {
    expect(calculateAirDensity(101325, 15)).toBeCloseTo(1.225, 2);
    expect(calculateAirDensity(0, 15)).toBeNull();
    expect(calculateAirDensity(101325, -273.15)).toBeNull();
  });

  it("retains simplified analytical classification without calling it CFD", () => {
    const performance = estimateAerodynamicPerformance("fixed-wing", analyticalFixture);
    expect(performance.status).toBe("estimate");
    expect(performance.sourceLabel).toBe("MODÈLE ANALYTIQUE SIMPLIFIÉ");
    expect(performance.dragN).toBeGreaterThan(0);
    const run = createLocalRun({ modelName: "Unit test", modelVersion: "test-only", elapsedMs: 1.4,
      initialConditions: "Fixture, not UI data", performance, parameters: analyticalFixture });
    expect(run.status).toBe("ANALYTIC ESTIMATE");
    expect(reportMarkdown(run)).toContain("ne contient pas de simulation CFD");
    expect(removeLegacyAnalyticHistory([run])).toEqual([]);
  });

  it("does not calculate shared estimates from empty preparation fields", () => {
    const parameters = defaultAerodynamicParameters({}).parameters;
    expect(estimateAerodynamicPerformance("fixed-wing", parameters).status).toBe("invalid");
    expect(estimateMeshWork({ x: 1, y: 1, z: 1 }, parameters)).toBeNull();
    expect(estimateMeshWork({ x: 2.4, y: 0.35, z: 0.18 }, analyticalFixture)?.status).toContain("NON GÉNÉRÉ");
  });
});

describe("legacy scenarios quarantined without user data loss", () => {
  it("keeps ambiguous manually entered originals outside the active list", async () => {
    const { partitionUserScenarios } = await import("./aerodynamicUserData");
    const legacy = { id: "manual-v1", name: "Mon essai saisi", provenance: "local-user-scenario",
      airframe: "fixed-wing", parameters: { speedMps: 19.27, pressurePa: 99540 }, createdAt: "2026-11-01T12:00:00.000Z" };
    const explicit = persisted(enteredScenario());
    const result = partitionUserScenarios([legacy, explicit]);
    expect(result.active).toHaveLength(1);
    expect(result.quarantine).toEqual([legacy]);
    expect(result.quarantine[0]).toBe(legacy);
  });

  it("deletes only records with explicit synthetic markers, not user names or familiar numbers", async () => {
    const { partitionUserScenarios } = await import("./aerodynamicUserData");
    const ambiguous = { id: "v1", name: "Démo utilisateur", provenance: "local-user-scenario", parameters: analyticalFixture };
    const result = partitionUserScenarios([ambiguous, { ...ambiguous, isDemonstration: true },
      { ...ambiguous, demo: true }, { ...ambiguous, synthetic: true }, { ...ambiguous, provenance: "synthetic-demo" }]);
    expect(result.active).toEqual([]);
    expect(result.quarantine).toEqual([ambiguous]);
  });

  it("writes original quarantine first, keeps existing entries and is idempotent", async () => {
    const { AERODYNAMIC_LEGACY_REVIEW_KEY, quarantineLegacyUserScenarios } = await import("./aerodynamicUserData");
    const legacy = { id: "v1", provenance: "local-user-scenario", parameters: { speedMps: 0, pressurePa: null } };
    const old = { id: "older-review", original: "keep" };
    const store = new Map<string, string>([[AERODYNAMIC_LEGACY_REVIEW_KEY, JSON.stringify([old])]]);
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
    expect(quarantineLegacyUserScenarios(storage, [legacy])).toBe(1);
    quarantineLegacyUserScenarios(storage, [legacy]);
    expect(JSON.parse(store.get(AERODYNAMIC_LEGACY_REVIEW_KEY)!)).toEqual([old, legacy]);
  });

  it("throws before any active overwrite when quarantine storage fails or is corrupt", async () => {
    const { quarantineLegacyUserScenarios } = await import("./aerodynamicUserData");
    const legacy = { provenance: "local-user-scenario", name: "Keep me" };
    expect(() => quarantineLegacyUserScenarios({ getItem: () => null, setItem: () => { throw new Error("quota"); } }, [legacy])).toThrow("quota");
    expect(() => quarantineLegacyUserScenarios({ getItem: () => "invalid-json", setItem: () => { throw new Error("must not write"); } }, [legacy])).toThrow();
  });

  it("quarantines conflicting duplicates and malformed metadata instead of silently deleting payloads", async () => {
    const { partitionUserScenarios } = await import("./aerodynamicUserData");
    const record = persisted(enteredScenario());
    const other = { ...record, parameters: { ...record.parameters, speedMps: 35.4 } };
    const malformed = { ...record, schemaVersion: "2", original: "recoverable" };
    const result = partitionUserScenarios([record, other, malformed]);
    expect(result.active).toHaveLength(1);
    expect(result.quarantine).toEqual([other, malformed]);
  });
});
