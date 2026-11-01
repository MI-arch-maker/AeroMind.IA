import { describe, expect, it } from "vitest";
import { defaultConcept } from "./aeroEngine";
import { droneCatalog } from "./droneCatalog";
import { buildMechanicalModel, exportMechanicalOBJ } from "./mechanicalTwinGeometry";
import { analyzeMechanicalModel, mirrorPartMeshAcrossX } from "./mechanicalTwinReview";

describe("mechanicalTwinReview", () => {
  const design = droneCatalog.find(item => item.modelType === "voilure-conventionnelle")!;
  const model = buildMechanicalModel(design, { ...defaultConcept, ...design.configuration, airframe: design.key, modelType: design.modelType });

  it("contrôle les sommets et indices du modèle procédural", () => {
    const review = analyzeMechanicalModel(model);
    expect(review.partCount).toBeGreaterThan(0);
    expect(review.visiblePartCount).toBeGreaterThan(0);
    expect(review.vertexCount).toBeGreaterThan(0);
    expect(review.triangleCount).toBeGreaterThan(0);
    expect(review.nonFiniteVertexCount).toBe(0);
    expect(review.invalidIndexCount).toBe(0);
    expect(review.passed).toBe(true);
  });

  it("réfléchit les sommets au plan X=0 et renverse l’ordre des triangles", () => {
    const part = model.parts.find(item => item.id === "wing-main-port")!;
    const mirrored = mirrorPartMeshAcrossX(part);
    expect(mirrored.vertices).toHaveLength(part.vertices.length);
    expect(mirrored.vertices[0]).toBeCloseTo(-part.vertices[0] * part.scale[0] - part.position[0]);
    expect(mirrored.indices[0]).toBe(part.indices[0]);
    expect(mirrored.indices[1]).toBe(part.indices[2]);
    expect(mirrored.indices[2]).toBe(part.indices[1]);
  });

  it("signale une géométrie invalide plutôt que de la déclarer conforme", () => {
    const invalid = {
      ...model,
      parts: [{ ...model.parts[0], vertices: [0, 0, 0, Number.NaN, 0, 0], indices: [0, 1, 9] }],
    };
    const review = analyzeMechanicalModel(invalid);
    expect(review.passed).toBe(false);
    expect(review.nonFiniteVertexCount).toBe(1);
    expect(review.invalidIndexCount).toBe(1);
  });

  it("reconstruit et exporte une pièce miroir utilisateur persistée", () => {
    const reflected = buildMechanicalModel(design, {
      ...defaultConcept,
      ...design.configuration,
      airframe: design.key,
      modelType: design.modelType,
      mechanicalTwin: {
        designId: design.id,
        extraParts: [{
          id: "mirror-test",
          name: "Miroir de test",
          kind: "mesh",
          size: [1, 1, 1],
          position: [0, 0, 0],
          color: "#33ccbb",
          vertices: [-1, 0, 0, -2, 0, 0, -1, 1, 0],
          indices: [0, 1, 2],
        }],
      },
    });
    const mirror = reflected.parts.find(part => part.id === "mirror-test");
    expect(mirror?.vertices).toEqual([-1, 0, 0, -2, 0, 0, -1, 1, 0]);
    expect(exportMechanicalOBJ(reflected)).toContain("o mirror-test");
  });

  it("génère une vraie géométrie arrondie pour un module à congé", () => {
    const settings = {
      designId: design.id,
      extraParts: [{ id: "rounded-test", name: "Module arrondi", kind: "roundedBox" as const, size: [0.3, 0.2, 0.1] as [number, number, number], position: [0, 0, 0] as [number, number, number], color: "#ffffff", radius: 0.02 }],
    };
    const rounded = buildMechanicalModel(design, { ...defaultConcept, ...design.configuration, airframe: design.key, modelType: design.modelType, mechanicalTwin: settings }).parts.find(part => part.id === "rounded-test")!;
    const box = buildMechanicalModel(design, { ...defaultConcept, ...design.configuration, airframe: design.key, modelType: design.modelType, mechanicalTwin: { ...settings, extraParts: [{ ...settings.extraParts[0], kind: "box" }] } }).parts.find(part => part.id === "rounded-test")!;
    expect(rounded.vertices.length).toBeGreaterThan(box.vertices.length);
    expect(rounded.vertices.every(Number.isFinite)).toBe(true);
    expect(rounded.size[0]).toBeCloseTo(0.3);
  });
});
