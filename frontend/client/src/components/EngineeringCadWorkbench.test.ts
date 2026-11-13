import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultConcept, type ConceptConfig, type InstalledMaterial } from "../lib/aeroEngine";
import { droneCatalog, type DroneCatalogDesign } from "../lib/droneCatalog";
import { buildMechanicalModel, type MechanicalModel, type MechanicalPart } from "../lib/mechanicalTwinGeometry";
import { EngineeringCadWorkbench, ParametricProfileGeometry, projectCadModel } from "./EngineeringCadWorkbench";

const material: InstalledMaterial = { id: "capteur", label: "Capteur", use: "Mission", massKg: 0.2, geometry: "core", layer: "Mission", offsetX: 20 };
const configFor = (design: DroneCatalogDesign, patch: Partial<ConceptConfig> = {}): ConceptConfig => ({ ...defaultConcept, ...design.configuration, modelType: design.modelType, ...patch });
const getDesign = (id: string) => {
  const design = droneCatalog.find(item => item.id === id);
  if (!design) throw new Error(`Profil ${id} absent`);
  return design;
};

const triangle: MechanicalPart = {
  id: "triangle", name: "Triangle", category: "airframe", vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2],
  position: [1, 2, 3], rotation: [0, 0, Math.PI / 2], scale: [2, 3, 1], color: "#123456", metalness: 0, roughness: 1, hidden: false, size: [1, 1, 0],
};
const simpleModel: MechanicalModel = { designId: "test", name: "Test", modelType: "test", parts: [triangle], span: 2, length: 1, extent: 2, settings: { designId: "test" } };

describe("projection CAO du jumeau mécanique", () => {
  it("projette les vrais sommets après échelle, rotation et translation en conservant les faces", () => {
    const projection = projectCadModel(simpleModel, "front", false, [], {});
    expect(projection.pixelsPerMeter).toBeCloseTo(180);
    expect(projection.parts[0].wirePath).toBe("M770 470L770 110L230 470Z");
    expect((770 - 230) / projection.pixelsPerMeter).toBeCloseTo(3);
    expect(projection.parts[0].faces.map(face => face.path).join("")).toBe(projection.parts[0].wirePath);
    expect(projectCadModel(simpleModel, "side", false, [], {}).parts[0].wirePath).not.toBe(projection.parts[0].wirePath);
    expect(projectCadModel(simpleModel, "iso", false, [], {}).parts[0].wirePath).not.toBe(projection.parts[0].wirePath);
  });

  it("utilise les faces et la morphologie spécifiques à la référence et aux paramètres actifs", () => {
    const wing = getDesign("wing-01"), tilt = getDesign("tiltwing-01");
    const wingModel = buildMechanicalModel(wing, configFor(wing));
    const tiltModel = buildMechanicalModel(tilt, configFor(tilt));
    const wingProjection = projectCadModel(wingModel, "iso", false, [], {});
    const tiltProjection = projectCadModel(tiltModel, "iso", false, [], {});
    expect(wingProjection.parts.some(item => item.part.id === "wing-center-fairing")).toBe(true);
    expect(tiltProjection.parts.some(item => item.part.id === "tilt-wing-hinge")).toBe(true);
    expect(tiltProjection.parts.some(item => item.part.id === "wing-center-fairing")).toBe(false);
    for (const item of wingProjection.parts) expect((item.wirePath.match(/Z/g) ?? []).length).toBe(item.part.indices.length / 3);
    const edited = buildMechanicalModel(wing, configFor(wing, { chord: 0.8 }));
    expect(projectCadModel(edited, "iso", false, [], {}).parts.map(item => item.wirePath).join("|")).not.toBe(wingProjection.parts.map(item => item.wirePath).join("|"));
  });

  it("respecte les pièces cachées, les calques, la position et l’éclaté sans altérer la source", () => {
    const design = getDesign("nimbus-01");
    const model = buildMechanicalModel(design, configFor(design, { installedMaterials: [material] }));
    const before = JSON.stringify(model);
    const assembled = projectCadModel(model, "iso", false, [material], { Mission: true });
    const hiddenLayer = projectCadModel(model, "iso", false, [material], { Mission: false });
    const exploded = projectCadModel(model, "iso", true, [material], { Mission: true });
    const mesh = assembled.parts.find(item => item.part.id === "installed:capteur");
    expect(mesh?.material?.id).toBe("capteur");
    expect(hiddenLayer.parts.some(item => item.part.id === "installed:capteur")).toBe(false);
    expect(hiddenLayer.pixelsPerMeter).toBe(assembled.pixelsPerMeter);
    expect(exploded.parts.find(item => item.part.id === "installed:capteur")?.wirePath).not.toBe(mesh?.wirePath);
    const relocated = buildMechanicalModel(design, configFor(design, { installedMaterials: [{ ...material, offsetX: -20 }] }));
    expect(projectCadModel(relocated, "iso", false, [{ ...material, offsetX: -20 }], {}).parts.find(item => item.part.id === "installed:capteur")?.wirePath).not.toBe(mesh?.wirePath);
    expect(projectCadModel(model, "iso", false, [{ ...material, iddsVisible: false }], {}).parts.some(item => item.part.id === "installed:capteur")).toBe(false);
    expect(projectCadModel({ ...simpleModel, parts: [{ ...triangle, hidden: true }] }, "iso", false, [], {}).parts).toEqual([]);
    expect(JSON.stringify(model)).toBe(before);
  });
});

describe("interaction avec les maillages installés", () => {
  it("sélectionne et retire le bon module à la souris ou au clavier et garde les deux rendus", () => {
    const design = getDesign("nimbus-01");
    const model = buildMechanicalModel(design, configFor(design, { installedMaterials: [material] }));
    const projection = projectCadModel(model, "iso", false, [material], {});
    const select = vi.fn(), cut = vi.fn();
    const meshFor = (tool: "select" | "cut" | "measure", wireframe: boolean) => {
      const root = ParametricProfileGeometry({ projection, wireframe, selectedId: null, tool, onSelectPart: select, onCutPart: cut });
      return root.props.children.find((child: any) => child.props["data-part-id"] === "installed:capteur");
    };
    const wire = meshFor("select", true);
    expect(wire.props.children[0].props.className).toBe("cad-mesh-wire");
    wire.props.onClick({ stopPropagation: vi.fn() });
    wire.props.onKeyDown({ key: "Enter", preventDefault: vi.fn() });
    expect(select).toHaveBeenCalledTimes(2);
    expect(select).toHaveBeenCalledWith("capteur");
    const solid = meshFor("cut", false);
    expect(solid.props.children[0][0].props.className).toBe("cad-mesh-face");
    solid.props.onClick({ stopPropagation: vi.fn() });
    expect(cut).toHaveBeenCalledWith("capteur");
    meshFor("measure", true).props.onClick({ stopPropagation: vi.fn() });
    expect(select).toHaveBeenCalledTimes(2);
    expect(cut).toHaveBeenCalledTimes(1);
  });
});

describe("poste CAO : source et état vide", () => {
  const render = (config: ConceptConfig, activeProfile?: DroneCatalogDesign) => renderToStaticMarkup(createElement(EngineeringCadWorkbench, { config, activeProfile, setConfig: () => {} }));

  it("affiche le modèle projeté et annonce sa provenance paramétrique même avec un actif CAO au catalogue", () => {
    const profile = getDesign("pdf-07-quad-duct");
    const html = render(configFor(profile, { installedMaterials: [material] }), profile);
    expect(html).toContain('data-geometry-source="mechanical-twin"');
    expect(html).toContain('data-part-id="duct-01"');
    expect(html).toContain('data-part-id="installed:capteur"');
    expect(html).toContain('aria-label="Sélectionner Capteur"');
    expect(html).toContain("MAQUETTE PARAMÉTRIQUE · NON EXACTE");
    expect(html).toContain("pas une reconstruction exacte ni un fichier CAO source");
  });

  it("respecte dès le premier rendu la visibilité persistée d’un calque", () => {
    const profile = getDesign("nimbus-01");
    const html = render(configFor(profile, { installedMaterials: [material], studioLayers: ["Mission"], studioLayerSettings: { Mission: { visible: false, locked: false } } }), profile);
    expect(html).not.toContain('data-part-id="installed:capteur"');
    expect(html).toContain("Capteur"); // La ligne documentaire reste présente dans la nomenclature.
  });

  it("ne crée aucun modèle sans source et maintient le croquis utilisateur", () => {
    const empty = render({ ...defaultConcept, installedMaterials: [], customSketch: undefined });
    expect(empty).toContain("Aucun drone chargé");
    expect(empty).not.toContain('data-geometry-source="mechanical-twin"');
    const drawing = render({ ...defaultConcept, customSketch: { version: 1, modifiedAt: "2026-01-01", strokes: [{ id: "trait", tool: "line", points: [{ x: 10, y: 20 }, { x: 70, y: 80 }], color: "#fff", width: 2 }] } });
    expect(drawing).toContain("DESSIN UTILISATEUR");
    expect(drawing).toContain('d="M10 20 L70 80"');
    expect(drawing).not.toContain('data-geometry-source="mechanical-twin"');
  });
});
