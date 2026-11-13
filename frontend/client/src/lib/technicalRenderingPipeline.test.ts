import { describe, expect, it } from "vitest";
import {
  createTechnicalRenderContext,
  technicalPresetToEngineId,
  technicalRenderPresetOptions,
} from "./technicalRenderingPipeline";
import type { MechanicalModel } from "./mechanicalTwinGeometry";

const model: MechanicalModel = {
  designId: "atlas-01",
  name: "Atlas 01",
  modelType: "catalog-parametric",
  span: 2.4,
  length: 1.8,
  extent: 1.6,
  settings: { designId: "atlas-01" },
  parts: [{
    id: "fuselage",
    name: "Fuselage",
    category: "airframe",
    vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 2],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: "#234",
    metalness: 0.2,
    roughness: 0.7,
    hidden: false,
    size: [1, 1, 1],
  }],
};

describe("technical rendering pipeline", () => {
  it("exposes the six required review presets with stable engine mappings", () => {
    expect(technicalRenderPresetOptions.map((option) => option.id)).toEqual([
      "solid", "blueprint", "wireframe", "xray", "exploded", "monochrome",
    ]);
    expect(technicalPresetToEngineId("wireframe")).toBe("mesh-wire");
    expect(technicalPresetToEngineId("monochrome")).toBe("clay");
  });

  it("binds provenance and parameters to the actually selected model", () => {
    const context = createTechnicalRenderContext(model, {
      droneId: "atlas-01",
      modelVersion: "catalog-v3",
      centreContext: "Centre Mécanique",
    });
    expect(context.syncStatus).toBe("ready");
    expect(context.source).toBe("catalog");
    expect(context.droneId).toBe("atlas-01");
    expect(context.modelVersion).toBe("catalog-v3");
    expect(context.activeParameters.componentCount).toBe(1);
  });

  it("returns an explicit unavailable state for an empty technical model", () => {
    const context = createTechnicalRenderContext({ ...model, parts: [] });
    expect(context.syncStatus).toBe("unavailable");
    expect(context.statusLabel).toMatch(/indisponible/i);
    expect(context.statusMessage).toMatch(/géométrie/i);
  });
});
