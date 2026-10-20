import { describe, expect, it } from "vitest";
import { referenceScenarios, replayReferenceScenario } from "./referenceScenarios";

describe("AeroMind reference scenarios", () => {
  it("replays all ten industrial scenarios deterministically", () => {
    const first = referenceScenarios.map(replayReferenceScenario);
    const second = referenceScenarios.map(replayReferenceScenario);
    expect(first.map(item => item.passed)).toEqual(second.map(item => item.passed));
    expect(first).toHaveLength(10);
  });

  it("keeps safety-critical degraded battery and heavy payload risks visible", () => {
    for (const id of ["degraded-battery", "heavy-payload"]) {
      const result = replayReferenceScenario(referenceScenarios.find(item => item.id === id)!);
      expect(result.passed).toBe(true);
    }
  });
});
