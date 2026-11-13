import { describe, expect, it } from "vitest";
import {
  GATE_DEFS,
  MODE_ITEMS,
  ZONE_GROUPS,
  initialLocalGateState,
  resolveGates,
  resolveZoneProgress,
} from "./labBenchArchitecture";

describe("LABBENCH architecture contract", () => {
  it("keeps the five sequential gates and five navigation zones", () => {
    expect(GATE_DEFS.map((gate) => gate.code)).toEqual(["N1", "N2", "N3-READY", "N3-ARMED", "N4"]);
    expect(ZONE_GROUPS).toHaveLength(5);
    expect(initialLocalGateState.currentGate).toBe("N1");
  });

  it("does not unlock a later gate when an earlier condition is missing", () => {
    const gates = resolveGates({ registry_initialized: true, n2_run_archived: true });
    expect(gates[0].state).toBe("passed");
    expect(gates[1].state).toBe("passed");
    expect(gates[2].state).toBe("open");
    expect(gates[3].state).toBe("pending");
    expect(gates[4].state).toBe("pending");
    expect(resolveZoneProgress(gates).find((zone) => zone.zone === "simulation")?.passed).toBe(true);
  });

  it("keeps all operating modes explicitly software-scoped", () => {
    expect(MODE_ITEMS).toHaveLength(3);
    expect(MODE_ITEMS.every((mode) => /virtuel|synthétiques|simulée/i.test(`${mode.label} ${mode.detail}`))).toBe(true);
  });
});
