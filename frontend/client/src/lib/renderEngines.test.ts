import { describe, expect, it } from "vitest";
import { computeSurfaceField, fieldColors, getRenderEngine, renderEngineRegistry } from "./renderEngines";

const tetraPositions = new Float32Array([
  0, 0, 0,  1, 0, 0,  0, 1, 0,  0, 0, 1,
]);
const tetraIndices = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3];

describe("render engine registry and mesh-field proxies", () => {
  it("resolves technical presets to declared pipelines", () => {
    expect(getRenderEngine("cfd").pipeline).toBe("surface-field");
    expect(getRenderEngine("fea").fidelity).toBe("geometry-proxy");
    expect(getRenderEngine("mesh-wire").pipeline).toBe("indexed-wireframe");
    expect(getRenderEngine("blueprint").pipeline).toBe("transparent-cad");
    expect(getRenderEngine("unknown").id).toBe("solid");
    expect(Object.keys(renderEngineRegistry)).toContain("exploded");
  });

  it("computes finite, mesh-topology-dependent CFD pressure values", () => {
    const result = computeSurfaceField(tetraPositions, tetraIndices, "cfd", { airspeedMps: 20, airDensityKgM3: 1.225 });
    expect(result.values).toHaveLength(4);
    expect(result.values.every(Number.isFinite)).toBe(true);
    expect(result.max).toBeGreaterThan(result.min);
    expect(result.unit).toContain("Pa");
    expect(result.warning).toContain("Navier–Stokes");
    expect(result.solverId).toBe("surface-panel-cfd-v2");
    expect(result.streamlines?.length).toBeGreaterThan(0);
    expect(result.velocityVectors?.length).toBe(12);
    expect(fieldColors(result)).toHaveLength(12);
    const faster = computeSurfaceField(tetraPositions, tetraIndices, "cfd", { airspeedMps: 40, airDensityKgM3: 1.225 });
    expect(faster.max - faster.min).toBeGreaterThan(result.max - result.min);
  });

  it("uses the AeroMind longitudinal Z-axis as the incident flow direction", () => {
    const q = 0.5 * 1.225 * 20 * 20;
    const noseFacing = computeSurfaceField(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), [0, 1, 2], "cfd");
    const sideFacing = computeSurfaceField(new Float32Array([0, 0, 0, 0, 0, -1, 0, 1, 0]), [0, 1, 2], "cfd");
    expect(noseFacing.values[0]).toBeCloseTo(-q, 3);
    expect(sideFacing.values[0]).toBeCloseTo(q, 3);
  });

  it("computes a finite analytical flexural field and calls out absent 3D FEA", () => {
    const result = computeSurfaceField(tetraPositions, tetraIndices, "fea");
    expect(result.values).toHaveLength(4);
    expect(result.values.every(value => value >= 0)).toBe(true);
    expect(result.unit).toContain("Pa");
    expect(result.warning).toContain("maillage EF 3D");
    expect(result.solverId).toBe("euler-bernoulli-fea-v2");
  });

  it("returns safe finite output for empty and malformed triangle input", () => {
    const empty = computeSurfaceField(new Float32Array(), [], "cfd");
    expect(empty.min).toBe(0);
    expect(empty.max).toBe(0);
    const malformed = computeSurfaceField(tetraPositions, [0, 8, 2], "cfd");
    expect(malformed.values.every(Number.isFinite)).toBe(true);
  });
});
