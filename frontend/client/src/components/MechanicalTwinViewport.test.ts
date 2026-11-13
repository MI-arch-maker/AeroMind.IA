import { describe, expect, it } from "vitest";
import { screenDeltaToWorld } from "./MechanicalTwinViewport";

describe("screenDeltaToWorld", () => {
  it("déplace vers la droite quand le geste écran va vers la droite en vue de dessus", () => {
    const [x, y, z] = screenDeltaToWorld("top", [0, 0], 1, 0);
    expect(x).toBeGreaterThan(0);
    expect(Math.abs(y)).toBeLessThan(1e-6);
    expect(Math.abs(z)).toBeLessThan(1e-3);
  });

  it("inverse uniquement le sens du geste, pas l’axe horizontal", () => {
    const right = screenDeltaToWorld("iso", [0, 0], 1, 0);
    const left = screenDeltaToWorld("iso", [0, 0], -1, 0);
    expect(left[0]).toBeCloseTo(-right[0]);
    expect(left[1]).toBeCloseTo(-right[1]);
    expect(left[2]).toBeCloseTo(-right[2]);
  });
});
