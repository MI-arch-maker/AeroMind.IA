import { describe, expect, it } from "vitest";
import type { MechanicalModel, MechanicalPart } from "./mechanicalTwinGeometry";
import { snapPartDelta } from "./mechanicalSnapping";

const part = (id: string, position: [number, number, number]): MechanicalPart => ({
  id, name: id, category: "hardware", vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2],
  position, rotation: [0, 0, 0], scale: [1, 1, 1], size: [1, 1, 1], color: "#fff", metalness: 0, roughness: 1, hidden: false, opacity: 1,
});
const model = { parts: [part("source", [0, 0, 0]), part("target", [1, 0, 0])] } as unknown as MechanicalModel;

describe("mechanical snapping", () => {
  it("rounds a world-space translation to the selected metric increment", () => {
    expect(snapPartDelta(model, model.parts[0], [0.013, 0.027, -0.016], { mode: "grid", increment: 0.01 })).toEqual([0.01, 0.03, -0.02]);
  });
  it("aligns a component to a neighbouring component when within tolerance", () => {
    expect(snapPartDelta(model, model.parts[0], [0.985, 0.004, 0], { mode: "component", increment: 0.01 })).toEqual([1, 0, 0]);
  });
  it("can be disabled without changing the requested delta", () => {
    expect(snapPartDelta(model, model.parts[0], [0.013, 0.027, -0.016], { enabled: false })).toEqual([0.013, 0.027, -0.016]);
  });
});
