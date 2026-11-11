import { describe, expect, it } from "vitest";
import { GOVERNANCE_CAPABILITIES, meetsCapabilityThreshold } from "./GovernanceCapabilityMatrix";

describe("governance capability matrix", () => {
  it("keeps the displayed thresholds aligned to the L1–L5 policy", () => {
    expect(GOVERNANCE_CAPABILITIES.map(({ id, minimum }) => [id, minimum])).toEqual([
      ["basic", 1],
      ["engineering", 2],
      ["advanced", 3],
      ["admin", 4],
      ["physical", 4],
      ["global", 5],
    ]);
  });

  it("never marks a tier below the minimum as qualified", () => {
    for (const capability of GOVERNANCE_CAPABILITIES) {
      for (let level = 1; level <= 5; level += 1) {
        expect(meetsCapabilityThreshold(level, capability.minimum)).toBe(level >= capability.minimum);
      }
    }
  });

  it("shows global operations only at L5 and keeps physical controls at L4+ with additional gates", () => {
    const global = GOVERNANCE_CAPABILITIES.find(({ id }) => id === "global");
    const physical = GOVERNANCE_CAPABILITIES.find(({ id }) => id === "physical");
    expect(global?.minimum).toBe(5);
    expect(physical).toMatchObject({ minimum: 4, physical: true });
    expect(meetsCapabilityThreshold(4, global!.minimum)).toBe(false);
    expect(meetsCapabilityThreshold(3, physical!.minimum)).toBe(false);
  });
});
