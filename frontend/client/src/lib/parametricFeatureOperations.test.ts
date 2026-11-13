import { describe, expect, it } from "vitest";
import { droneCatalog } from "./droneCatalog";
import { buildMechanicalModel } from "./mechanicalTwinGeometry";
import { appendFeatureOperation, appendNativeEdgeTreatment, featureHistoryFor, nativeCsgId } from "./parametricFeatureOperations";
import type { ConceptConfig } from "./aeroEngine";
import type { MechanicalExtraPart } from "./mechanicalTwinGeometry";

const baseConfig: ConceptConfig = {
  wingspan: 3.2,
  chord: 0.42,
  fuselageLength: 1.4,
  propDiameter: 0.3,
  batteryWh: 900,
  payloadKg: 0.5,
  cruiseSpeedKmh: 55,
  windSpeedKmh: 15,
  reserveFraction: 0.2,
  maxTakeoffKg: 4,
  altitudeM: 300,
  motorCount: 1,
};

function cubePart(id: string, position: [number, number, number], side = 2): MechanicalExtraPart {
  const h = side / 2;
  const vertices = [-h, -h, -h, h, -h, -h, h, h, -h, -h, h, -h, -h, -h, h, h, -h, h, h, h, h, -h, h, h];
  const indices = [0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];
  return { id, name: id, kind: "mesh", size: [side, side, side], position, color: "#888888", vertices, indices };
}

function configWithParts(designId: string, extraParts: MechanicalExtraPart[]): ConceptConfig {
  return { ...baseConfig, mechanicalTwin: { designId, finish: "carbon", extraParts } };
}

function bounds(part: MechanicalExtraPart) {
  const vertices = part.vertices ?? [];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += 3) for (let axis = 0; axis < 3; axis += 1) {
    min[axis] = Math.min(min[axis], vertices[i + axis]);
    max[axis] = Math.max(max[axis], vertices[i + axis]);
  }
  return { min, max };
}

function meshVolume(part: MechanicalExtraPart): number {
  const vertices = part.vertices ?? [], indices = part.indices ?? [];
  let signedVolume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    signedVolume += (
      vertices[a] * (vertices[b + 1] * vertices[c + 2] - vertices[b + 2] * vertices[c + 1]) +
      vertices[a + 1] * (vertices[b + 2] * vertices[c] - vertices[b] * vertices[c + 2]) +
      vertices[a + 2] * (vertices[b] * vertices[c + 1] - vertices[b + 1] * vertices[c])
    ) / 6;
  }
  return Math.abs(signedVolume);
}

describe("parametric feature operations", () => {
  it("persists an extrusion and rebuilds it as a triangulated mechanical part", () => {
    const design = droneCatalog[0];
    const next = appendFeatureOperation(baseConfig, design.id, { kind: "extrusion", width: 0.3, height: 0.06, depth: 0.5, position: [0, 0.2, 0] });
    const history = featureHistoryFor(next, design.id);
    const model = buildMechanicalModel(design, next);
    expect(history).toHaveLength(1);
    expect(history[0].kind).toBe("extrusion");
    expect(history[0].status).toBe("applied");
    expect(model.parts.some((part) => part.id === history[0].id && part.indices.length > 0)).toBe(true);
  });

  it("preserves feature order and allocates distinct IDs for rapid additions", () => {
    const design = droneCatalog[0];
    const extrusion = appendFeatureOperation(baseConfig, design.id, { kind: "extrusion", width: 0.2, height: 0.05, depth: 0.2, position: [0, 0, 0] });
    const next = appendFeatureOperation(extrusion, design.id, { kind: "revolution", radius: 0.08, height: 0.18, position: [0.2, 0.1, 0] });
    const history = featureHistoryFor(next, design.id);
    expect(history.map((feature) => feature.kind)).toEqual(["extrusion", "revolution"]);
    expect(new Set(history.map((feature) => feature.id)).size).toBe(history.length);
  });

  it.each([
    { operation: "union" as const, expectedMinX: 9, expectedMaxX: 11.5, expectedVolume: 10 },
    { operation: "subtract" as const, expectedMinX: 9, expectedMaxX: 9.5, expectedVolume: 2 },
    { operation: "intersect" as const, expectedMinX: 9.5, expectedMaxX: 11, expectedVolume: 6 },
  ])("runs translated mesh $operation and validates its output geometry", ({ operation, expectedMinX, expectedMaxX, expectedVolume }) => {
    const designId = droneCatalog[0].id;
    const target = cubePart("target", [10, 0, 0]);
    const tool = cubePart("tool", [10.5, 0, 0]);
    const input = configWithParts(designId, [target, tool]);
    const result = appendFeatureOperation(input, designId, { kind: "boolean", operation, targetId: target.id, toolId: tool.id });
    const history = featureHistoryFor(result, designId).at(-1)!;
    const output = result.mechanicalTwin?.extraParts?.[0];
    expect(history.status).toBe("applied");
    expect((history as typeof history & { dependsOn?: string[] }).dependsOn).toEqual([target.id, tool.id]);
    expect(result.mechanicalTwin?.extraParts).toHaveLength(1);
    expect(output?.kind).toBe("mesh");
    expect(output?.vertices?.every(Number.isFinite)).toBe(true);
    expect(output?.indices?.length).toBeGreaterThan(0);
    expect(output?.indices?.every((index) => Number.isInteger(index) && index >= 0 && index < (output.vertices?.length ?? 0) / 3)).toBe(true);
    const outputBounds = bounds(output!);
    expect(outputBounds.min[0]).toBeCloseTo(expectedMinX, 5);
    expect(outputBounds.max[0]).toBeCloseTo(expectedMaxX, 5);
    expect(outputBounds.min[0]).toBeGreaterThan(8);
    expect(meshVolume(output!)).toBeCloseTo(expectedVolume, 4);
  });

  it("marks invalid mesh input unsupported and preserves both original parts", () => {
    const designId = droneCatalog[0].id;
    const valid = cubePart("valid", [0, 0, 0]);
    const invalid = { ...cubePart("invalid", [0, 0, 0]), indices: [0, 1, 999] };
    const input = configWithParts(designId, [valid, invalid]);
    const result = appendFeatureOperation(input, designId, { kind: "boolean", operation: "union", targetId: valid.id, toolId: invalid.id });
    expect(featureHistoryFor(result, designId).at(-1)?.status).toBe("unsupported");
    expect(result.mechanicalTwin?.extraParts).toEqual([valid, invalid]);
  });

  it("marks an empty boolean result unsupported and preserves target and tool", () => {
    const designId = droneCatalog[0].id;
    const target = cubePart("target", [0, 0, 0]);
    const tool = cubePart("distant-tool", [5, 0, 0]);
    const input = configWithParts(designId, [target, tool]);
    const result = appendFeatureOperation(input, designId, { kind: "boolean", operation: "intersect", targetId: target.id, toolId: tool.id });
    expect(featureHistoryFor(result, designId).at(-1)?.status).toBe("unsupported");
    expect(result.mechanicalTwin?.extraParts).toEqual([target, tool]);
  });

  it("records native fillet/chamfer as unsupported without hiding or changing native geometry", () => {
    const design = droneCatalog[0];
    const native = buildMechanicalModel(design, baseConfig).parts.find((part) => !part.hidden && part.indices.length > 0)!;
    const fillet = appendNativeEdgeTreatment(baseConfig, design.id, native, "fillet", 0.01);
    const chamfer = appendNativeEdgeTreatment(fillet, design.id, native, "chamfer", 0.01);
    const history = featureHistoryFor(chamfer, design.id);
    const afterNative = buildMechanicalModel(design, chamfer).parts.find((part) => part.id === native.id)!;
    expect(history.map((feature) => feature.status)).toEqual(["unsupported", "unsupported"]);
    expect(history.map((feature) => feature.kind)).toEqual(["fillet", "chamfer"]);
    expect((history[0] as typeof history[number] & { dependsOn?: string[] }).dependsOn).toEqual([native.id]);
    expect(chamfer.mechanicalTwin?.extraParts ?? []).toEqual([]);
    expect(chamfer.mechanicalTwin?.edits?.[native.id]?.hidden).not.toBe(true);
    expect(afterNative.hidden).toBe(native.hidden);
    expect(afterNative.vertices).toEqual(native.vertices);
    expect(afterNative.indices).toEqual(native.indices);
    expect(afterNative.position).toEqual(native.position);
    expect(nativeCsgId(native.id)).toContain(native.id);
  });
});
