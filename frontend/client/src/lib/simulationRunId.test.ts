import { describe, expect, it } from "vitest";
import { nextLocalSimulationRunId } from "./simulationRunId";

describe("nextLocalSimulationRunId", () => {
  it("incrémente un identifiant SIM numérique", () => {
    expect(nextLocalSimulationRunId("SIM-000")).toBe("SIM-001");
    expect(nextLocalSimulationRunId("SIM-009")).toBe("SIM-010");
    expect(nextLocalSimulationRunId("SIM-1234")).toBe("SIM-1235");
  });

  it("redémarre proprement depuis un état vierge ou mal formé", () => {
    expect(nextLocalSimulationRunId("—")).toBe("SIM-001");
    expect(nextLocalSimulationRunId("SIM-NaN")).toBe("SIM-001");
    expect(nextLocalSimulationRunId("WORKFLOW-abc123")).toBe("SIM-001");
  });
});
