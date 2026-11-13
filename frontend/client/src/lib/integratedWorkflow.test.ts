import { describe, expect, it } from "vitest";
import { defaultConcept } from "./aeroEngine";
import { demoScenario, localWorkflowEvidence, toCanonicalConfig, workflowScenarioSchema } from "./integratedWorkflow";

describe("integrated workflow contract", () => {
  it("converts cockpit speed from km/h to canonical m/s", () => {
    const config = toCanonicalConfig({ ...defaultConcept, cruiseSpeedKmh: 36, windSpeedKmh: 18 });
    expect(config.cruise_speed_mps).toBe(10);
    expect(config.wind_speed_mps).toBe(5);
  });
  it("uses SI units and a declared coordinate frame for the demo scenario", () => {
    const scenario = demoScenario();
    expect(workflowScenarioSchema.parse(scenario).coordinate_frame).toBe("ENU");
    expect(scenario.altitude_unit).toBe("m");
    expect(scenario.speed_unit).toBe("m/s");
  });
  it("never labels local output as a physical solver result", () => {
    const evidence = localWorkflowEvidence({ ...({ engineVersion: "local-test" } as any) });
    expect(evidence.evidence_level).toBe("synthetic_demo");
    expect(evidence.physical_solver_connected).toBe(false);
  });
});
