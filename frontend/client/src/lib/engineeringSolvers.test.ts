import { describe, expect, it } from "vitest";
import { runEngineeringSolver, solveCfdSurface, solveFeaCantilever } from "./engineeringSolvers";

const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
const indices = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3];

const technicalModes = ["cfd", "fea", "energyflow", "exploded", "bionic", "carbon", "crystal", "archviz", "mesh-wire", "blueprint"] as const;

describe("AeroMind engineering solver registry", () => {
  it("computes a finite CFD field and converges the neighbour relaxation", () => {
    const result = solveCfdSurface(positions, indices, { airspeedMps: 20, iterations: 6 });
    expect(result.solverId).toBe("surface-panel-cfd-v2");
    expect(result.values?.every(Number.isFinite)).toBe(true);
    expect(result.max).toBeGreaterThan(result.min ?? 0);
    expect(result.iterations).toBe(6);
    expect(result.residual).toBeGreaterThanOrEqual(0);
    expect(result.velocityVectors?.length).toBe(positions.length);
    expect(result.streamlines?.length).toBeGreaterThan(0);
  });

  it("returns a finite Von Mises field with the highest load near the root", () => {
    const result = solveFeaCantilever(new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0]), { youngModulusGPa: 70, loadN: 120 });
    expect(result.solverId).toBe("euler-bernoulli-fea-v2");
    expect(result.values?.[0]).toBeGreaterThan(0);
    expect(result.values?.[1]).toBeGreaterThan(result.values?.[3] ?? 0);
    expect(result.vonMises?.every(Number.isFinite)).toBe(true);
    expect(result.strainGradient?.length).toBe(4);
    expect(result.loadZones?.length).toBe(4);
  });

  it("routes every technical menu mode to a declared solver", () => {
    for (const mode of technicalModes) {
      const result = runEngineeringSolver(mode, positions, indices);
      expect(result.solverId).toMatch(/-v2$/);
      expect(result.mode).toBe(mode);
      expect(result.status).toBe("computed");
    }
  });

  it("produces particle transport and a stress-guided lattice", () => {
    const flow = runEngineeringSolver("energyflow", positions, indices);
    const lattice = runEngineeringSolver("bionic", positions, indices);
    expect(flow.particles?.length).toBeGreaterThan(0);
    expect(flow.particleEnergy?.length).toBeGreaterThan(0);
    expect(lattice.latticeNodes?.length).toBeGreaterThan(0);
    expect(lattice.latticeEdges?.length).toBeGreaterThan(0);
  });
});
