import type { MechanicalModel, MechanicalPart } from "./mechanicalTwinGeometry";
import { transformedPartVertices } from "./mechanicalTwinGeometry";

export type MechanicalGeometryReview = {
  partCount: number;
  visiblePartCount: number;
  hiddenPartCount: number;
  vertexCount: number;
  triangleCount: number;
  nonFiniteVertexCount: number;
  invalidIndexCount: number;
  degenerateTriangleCount: number;
  findings: string[];
  passed: boolean;
};

/** Contrôle local déterministe des maillages chargés; ne constitue pas une FEA ni une certification. */
export function analyzeMechanicalModel(model: MechanicalModel): MechanicalGeometryReview {
  let vertexCount = 0;
  let triangleCount = 0;
  let nonFiniteVertexCount = 0;
  let invalidIndexCount = 0;
  let degenerateTriangleCount = 0;
  const findings: string[] = [];

  for (const part of model.parts) {
    const vertices = part.vertices;
    const indices = part.indices;
    vertexCount += Math.floor(vertices.length / 3);
    triangleCount += Math.floor(indices.length / 3);
    for (const value of vertices) if (!Number.isFinite(value)) nonFiniteVertexCount += 1;
    for (const index of indices) {
      if (!Number.isInteger(index) || index < 0 || index >= vertices.length / 3) invalidIndexCount += 1;
    }
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const ia = indices[i] * 3;
      const ib = indices[i + 1] * 3;
      const ic = indices[i + 2] * 3;
      if (![ia, ib, ic].every(index => Number.isInteger(index) && index >= 0 && index + 2 < vertices.length)) continue;
      const ab = [vertices[ib] - vertices[ia], vertices[ib + 1] - vertices[ia + 1], vertices[ib + 2] - vertices[ia + 2]];
      const ac = [vertices[ic] - vertices[ia], vertices[ic + 1] - vertices[ia + 1], vertices[ic + 2] - vertices[ia + 2]];
      const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      if (cross.every(Number.isFinite) && Math.hypot(...cross) <= 1e-10) degenerateTriangleCount += 1;
    }
  }

  const visiblePartCount = model.parts.filter(part => !part.hidden).length;
  const hiddenPartCount = model.parts.length - visiblePartCount;
  if (model.parts.length === 0) findings.push("Aucune pièce dans le modèle.");
  if (visiblePartCount === 0 && model.parts.length > 0) findings.push("Toutes les pièces sont masquées.");
  if (nonFiniteVertexCount) findings.push(`${nonFiniteVertexCount} coordonnée(s) non finie(s).`);
  if (invalidIndexCount) findings.push(`${invalidIndexCount} index de triangle hors limites ou invalide(s).`);
  if (degenerateTriangleCount) findings.push(`${degenerateTriangleCount} triangle(s) dégénéré(s) détecté(s).`);
  if (!findings.length) findings.push("Maillage cohérent : sommets finis et indices de triangles dans les limites.");

  return {
    partCount: model.parts.length,
    visiblePartCount,
    hiddenPartCount,
    vertexCount,
    triangleCount,
    nonFiniteVertexCount,
    invalidIndexCount,
    degenerateTriangleCount,
    findings,
    passed: model.parts.length > 0 && visiblePartCount > 0 && nonFiniteVertexCount === 0 && invalidIndexCount === 0,
  };
}

/** Copie les sommets transformés puis les réfléchit sur le plan médian X=0; inverse l’ordre des faces. */
export function mirrorPartMeshAcrossX(part: MechanicalPart): { vertices: number[]; indices: number[] } {
  const vertices = transformedPartVertices(part);
  for (let index = 0; index < vertices.length; index += 3) vertices[index] = -vertices[index];
  const indices = [...part.indices];
  for (let index = 0; index + 2 < indices.length; index += 3) {
    [indices[index + 1], indices[index + 2]] = [indices[index + 2], indices[index + 1]];
  }
  return { vertices, indices };
}
