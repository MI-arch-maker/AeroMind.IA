import { booleans, geometries, primitives, transforms } from "@jscad/modeling";
import type { ConceptConfig } from "./aeroEngine";
import {
  transformedPartVertices,
  type MechanicalExtraPart,
  type MechanicalPart,
  type MechanicalTwinConfig,
  type ParametricFeature,
  type ParametricFeatureKind,
  type Vec3,
} from "./mechanicalTwinGeometry";

type Geom3 = ReturnType<typeof geometries.geom3.create>;

export type FeatureOperation =
  | { kind: "extrusion"; depth: number; width: number; height: number; position: Vec3 }
  | { kind: "revolution"; radius: number; height: number; position: Vec3 }
  | { kind: "boolean"; operation: "union" | "subtract" | "intersect"; targetId: string; toolId: string }
  | { kind: "fillet" | "chamfer"; radius: number; targetId: string };

const finitePositive = (value: number, fallback: number) => Number.isFinite(value) ? Math.max(0.01, value) : fallback;

function rectangularPrism(width: number, height: number, depth: number) {
  const x = width / 2, y = height / 2, z = depth / 2;
  const vertices = [-x, -y, -z, x, -y, -z, x, y, -z, -x, y, -z, -x, -y, z, x, -y, z, x, y, z, -x, y, z];
  const indices = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 4, 0, 3, 4, 3, 7];
  return { vertices, indices };
}

export function createFeatureExtraPart(id: string, operation: Exclude<FeatureOperation, { kind: "boolean" | "fillet" | "chamfer" }>): MechanicalExtraPart {
  if (operation.kind === "extrusion") {
    const width = finitePositive(operation.width, 0.2), height = finitePositive(operation.height, 0.05), depth = finitePositive(operation.depth, 0.2);
    const mesh = rectangularPrism(width, height, depth);
    return { id, name: `Extrusion ${width.toFixed(2)} × ${height.toFixed(2)} × ${depth.toFixed(2)} m`, kind: "mesh", size: [width, height, depth], position: operation.position, color: "#f5a623", vertices: mesh.vertices, indices: mesh.indices };
  }
  const radius = finitePositive(operation.radius, 0.1), height = finitePositive(operation.height, 0.2);
  return { id, name: `Révolution Ø${(radius * 2).toFixed(2)} × ${height.toFixed(2)} m`, kind: "cylinder", size: [radius * 2, height, radius * 2], position: operation.position, color: "#8b5cf6" };
}

function validateMesh(vertices: number[], indices: number[]): void {
  if (vertices.length < 9 || vertices.length % 3 !== 0 || !vertices.every(Number.isFinite)) {
    throw new Error("Mesh vertices must be finite XYZ triplets with at least one triangle");
  }
  if (indices.length < 3 || indices.length % 3 !== 0) throw new Error("Mesh indices must contain complete triangles");
  const vertexCount = vertices.length / 3;
  if (!indices.every((index) => Number.isInteger(index) && index >= 0 && index < vertexCount)) {
    throw new Error("Mesh indices are outside the vertex array");
  }
}

function extraPartToSolid(part: MechanicalExtraPart): Geom3 {
  if (part.kind === "mesh") {
    if (!part.vertices || !part.indices) throw new Error("Mesh data is missing");
    validateMesh(part.vertices, part.indices);
    if (!part.position.every(Number.isFinite)) throw new Error("Mesh position must be finite");
    const polygons: Array<ReturnType<typeof geometries.poly3.fromPoints>> = [];
    for (let index = 0; index < part.indices.length; index += 3) {
      const points = [0, 1, 2].map((offset) => {
        const base = part.indices![index + offset] * 3;
        return [part.vertices![base], part.vertices![base + 1], part.vertices![base + 2]] as Vec3;
      });
      polygons.push(geometries.poly3.fromPoints(points));
    }
    // Extra mesh vertices are local; native meshes materialized by
    // transformedPartVertices already have position [0, 0, 0].
    return transforms.translate(part.position, geometries.geom3.create(polygons));
  }
  if (part.kind === "cylinder") return transforms.rotateX(Math.PI / 2, primitives.cylinder({ radius: Math.max(part.size[0], part.size[2]) / 2, height: part.size[1], center: part.position, segments: 32 }));
  return primitives.cuboid({ size: part.size, center: part.position });
}

function solidToExtraPart(id: string, name: string, color: string, solid: Geom3): MechanicalExtraPart {
  const vertices: number[] = [], indices: number[] = [];
  let min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const polygon of geometries.geom3.toPolygons(solid)) {
    const points = geometries.poly3.toPoints(polygon) as Vec3[];
    if (points.length < 3) continue;
    const base = vertices.length / 3;
    for (const point of points) {
      vertices.push(...point);
      min = [Math.min(min[0], point[0]), Math.min(min[1], point[1]), Math.min(min[2], point[2])];
      max = [Math.max(max[0], point[0]), Math.max(max[1], point[1]), Math.max(max[2], point[2])];
    }
    for (let index = 1; index < points.length - 1; index += 1) indices.push(base, base + index, base + index + 1);
  }
  validateMesh(vertices, indices);
  if (![...min, ...max].every(Number.isFinite)) throw new Error("CSG result has invalid bounds");
  return { id, name, kind: "mesh", size: [Math.max(0.01, max[0] - min[0]), Math.max(0.01, max[1] - min[1]), Math.max(0.01, max[2] - min[2])], position: [0, 0, 0], color, vertices, indices };
}

type FeatureWithDependencies = ParametricFeature & { dependsOn?: string[] };

export function createAppliedFeature(id: string, operation: FeatureOperation, targetPartId?: string): FeatureWithDependencies {
  let parameters: Record<string, number | string>, name: string;
  if (operation.kind === "extrusion") {
    parameters = { width: operation.width, height: operation.height, depth: operation.depth, x: operation.position[0], y: operation.position[1], z: operation.position[2] }; name = "Extrusion de profil rectangulaire";
  } else if (operation.kind === "revolution") {
    parameters = { radius: operation.radius, height: operation.height, x: operation.position[0], y: operation.position[1], z: operation.position[2] }; name = "Révolution de profil circulaire";
  } else if (operation.kind === "boolean") {
    parameters = { operation: operation.operation, targetId: operation.targetId, toolId: operation.toolId }; name = `Booléen ${operation.operation}`;
  } else {
    parameters = { radius: operation.radius, targetId: operation.targetId }; name = operation.kind === "fillet" ? "Congé CSG" : "Chanfrein CSG";
  }
  const dependsOn = operation.kind === "boolean" ? [operation.targetId, operation.toolId] : targetPartId ? [targetPartId] : undefined;
  return { id, kind: operation.kind, name, status: "applied", createdAt: new Date().toISOString(), targetPartId, parameters, ...(dependsOn ? { dependsOn } : {}) };
}

let featureIdSequence = 0;
function uniqueFeatureId(kind: FeatureOperation["kind"], base: MechanicalTwinConfig): string {
  const used = new Set([...(base.extraParts ?? []).map((part) => part.id), ...(base.featureHistory ?? []).map((feature) => feature.id)]);
  let id: string;
  do {
    featureIdSequence += 1;
    id = `feature-${kind}-${Date.now()}-${featureIdSequence}`;
  } while (used.has(id));
  return id;
}

export function appendFeatureOperation(config: ConceptConfig, designId: string, operation: FeatureOperation, targetPartId?: string): ConceptConfig {
  const current = config.mechanicalTwin?.designId === designId ? config.mechanicalTwin : config.mechanicalTwins?.[designId];
  const base: MechanicalTwinConfig = current ?? { designId, finish: "carbon" };
  const id = uniqueFeatureId(operation.kind, base);
  const existing = [...(base.extraParts ?? [])];
  let nextExtras = existing, feature = createAppliedFeature(id, operation, targetPartId);
  if (operation.kind === "boolean") {
    const target = existing.find((part) => part.id === operation.targetId), tool = existing.find((part) => part.id === operation.toolId);
    if (!target || !tool) feature = { ...feature, status: "unsupported" };
    else try {
      const targetSolid = extraPartToSolid(target), toolSolid = extraPartToSolid(tool);
      const solid = operation.operation === "union" ? booleans.union(targetSolid, toolSolid) : operation.operation === "subtract" ? booleans.subtract(targetSolid, toolSolid) : booleans.intersect(targetSolid, toolSolid);
      const result = solidToExtraPart(id, `Résultat booléen · ${operation.operation}`, "#ef7d62", solid);
      nextExtras = [...existing.filter((part) => part.id !== target.id && part.id !== tool.id), result];
    } catch { feature = { ...feature, status: "unsupported" }; }
  } else if (operation.kind === "fillet" || operation.kind === "chamfer") {
    // JSCAD expand is an offset, not an exact edge fillet/chamfer. Do not
    // materialize, hide, or replace target geometry for unsupported treatments.
    feature = { ...feature, status: "unsupported" };
  } else if (operation.kind === "extrusion" || operation.kind === "revolution") {
    nextExtras = [...existing, createFeatureExtraPart(id, operation)];
  }
  const next: MechanicalTwinConfig = { ...base, designId, extraParts: nextExtras, featureHistory: [...(base.featureHistory ?? []), feature] };
  return { ...config, mechanicalTwin: next, mechanicalTwins: { ...(config.mechanicalTwins ?? {}), [designId]: next } };
}

export const nativeCsgId = (partId: string) => `native-csg-${partId}`;

/** Convertit toute pièce native triangulée en solide CSG éditable et masque sa source. */
export function materializeNativePart(config: ConceptConfig, designId: string, part: MechanicalPart): ConceptConfig {
  const current = config.mechanicalTwin?.designId === designId ? config.mechanicalTwin : config.mechanicalTwins?.[designId];
  const base: MechanicalTwinConfig = current ?? { designId, finish: "carbon" };
  const id = nativeCsgId(part.id);
  if ((base.extraParts ?? []).some((extra) => extra.id === id)) return config;
  const vertices = transformedPartVertices(part);
  const extra: MechanicalExtraPart = { id, name: `CSG · ${part.name}`, kind: "mesh", size: part.size, position: [0, 0, 0], color: part.color, vertices, indices: [...part.indices] };
  const next: MechanicalTwinConfig = { ...base, edits: { ...(base.edits ?? {}), [part.id]: { ...(base.edits?.[part.id] ?? {}), hidden: true } }, extraParts: [...(base.extraParts ?? []), extra], featureHistory: [...(base.featureHistory ?? []), { id, kind: "conversion", name: `Conversion CSG · ${part.name}`, status: "applied", createdAt: new Date().toISOString(), targetPartId: part.id, parameters: { sourcePartId: part.id, sourceVisibility: part.hidden ? "hidden" : "visible", vertices: vertices.length / 3, triangles: part.indices.length / 3 } }] };
  return { ...config, mechanicalTwin: next, mechanicalTwins: { ...(config.mechanicalTwins ?? {}), [designId]: next } };
}

export function appendNativeEdgeTreatment(config: ConceptConfig, designId: string, part: MechanicalPart, treatment: "fillet" | "chamfer", radius: number): ConceptConfig {
  // The exact operation is unavailable; recording it must not materialize or hide the native part.
  return appendFeatureOperation(config, designId, { kind: treatment, radius, targetId: nativeCsgId(part.id) }, part.id);
}

export function featureHistoryFor(config: ConceptConfig, designId: string): ParametricFeature[] {
  const current = config.mechanicalTwin?.designId === designId ? config.mechanicalTwin : config.mechanicalTwins?.[designId];
  return current?.featureHistory ?? [];
}

export const supportedFeatureKinds: ParametricFeatureKind[] = ["conversion", "extrusion", "revolution", "boolean", "cut", "fillet", "chamfer"];
