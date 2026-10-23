import { describe, expect, it } from "vitest";
import type { DroneSketchStroke } from "./aeroEngine";
import { getDroneGeometryStrokes, hasDroneGeometry } from "./droneSketchGeometry";

const stroke = (tool: DroneSketchStroke["tool"], points: DroneSketchStroke["points"]): DroneSketchStroke => ({
  id: `${tool}-1`, tool, points, color: "#65e5d7", width: 2, component: "freeform",
});

describe("drone sketch geometry", () => {
  it("does not treat an empty sketch, annotation, or dimension as an aircraft source", () => {
    expect(hasDroneGeometry([])).toBe(false);
    expect(hasDroneGeometry([stroke("annotation", [{ x: 10, y: 10 }])])).toBe(false);
    expect(hasDroneGeometry([stroke("measure", [{ x: 10, y: 10 }, { x: 80, y: 10 }])])).toBe(false);
  });

  it("recognizes and returns only actual shape strokes", () => {
    const line = stroke("line", [{ x: 10, y: 10 }, { x: 80, y: 10 }]);
    const note = stroke("annotation", [{ x: 20, y: 20 }]);
    expect(hasDroneGeometry([note, line])).toBe(true);
    expect(getDroneGeometryStrokes([note, line])).toEqual([line]);
  });
});
