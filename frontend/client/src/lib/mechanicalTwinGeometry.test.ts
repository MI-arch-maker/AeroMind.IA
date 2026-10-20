import { describe, expect, it } from "vitest";
import { defaultConcept, type ConceptConfig } from "./aeroEngine";
import { droneCatalog, type DroneCatalogDesign } from "./droneCatalog";
import {
  buildMechanicalModel,
  exportMechanicalOBJ,
  exportMechanicalSTL,
  mechanicalSettings,
  transformedPartVertices,
  type MechanicalTwinConfig,
} from "./mechanicalTwinGeometry";

function configurationFor(design: DroneCatalogDesign, patch: Partial<ConceptConfig> = {}): ConceptConfig {
  return {
    ...defaultConcept,
    ...design.configuration,
    airframe: design.key,
    modelType: design.modelType,
    ...patch,
  };
}

function modelFor(design: DroneCatalogDesign, patch: Partial<ConceptConfig> = {}) {
  return buildMechanicalModel(design, configurationFor(design, patch));
}

describe("mechanicalTwinGeometry", () => {
  it("construit pour chaque drone catalogue des triangles finis, indexés et des IDs stables", () => {
    expect(droneCatalog.length).toBeGreaterThan(20);
    for (const design of droneCatalog) {
      const model = modelFor(design);
      expect(model.parts.length, design.id).toBeGreaterThan(8);
      expect(new Set(model.parts.map(part => part.id)).size, design.id).toBe(model.parts.length);
      expect(model.span, design.id).toBeCloseTo(configurationFor(design).wingspan);
      expect(model.length, design.id).toBeCloseTo(configurationFor(design).fuselageLength);
      expect(model.extent, design.id).toBeGreaterThanOrEqual(model.span);
      for (const part of model.parts) {
        expect(part.vertices.length, `${design.id}/${part.id}`).toBeGreaterThan(0);
        expect(part.vertices.length % 3, `${design.id}/${part.id}`).toBe(0);
        expect(part.indices.length % 3, `${design.id}/${part.id}`).toBe(0);
        expect(part.vertices.every(Number.isFinite), `${design.id}/${part.id}`).toBe(true);
        expect(part.indices.every(index => Number.isInteger(index) && index >= 0 && index < part.vertices.length / 3), `${design.id}/${part.id}`).toBe(true);
      }
    }
  });

  it("donne une signature mécanique propre à chaque modelType catalogué", () => {
    const examples = new Map<string, DroneCatalogDesign>();
    for (const design of droneCatalog) if (design.modelType && !examples.has(design.modelType)) examples.set(design.modelType, design);
    // Le catalogue public courant exclut quelques profils spécialisés hérités,
    // mais expose 21 familles distinctes à couvrir intégralement.
    expect(examples.size).toBeGreaterThanOrEqual(21);
    const signatures = new Map<string, string>();
    for (const [modelType, design] of examples) {
      const ids = modelFor(design).parts.map(part => part.id).sort().join("|");
      expect(ids, modelType).not.toBe("");
      expect(signatures.has(ids), `${modelType} must not duplicate ${signatures.get(ids)}`).toBe(false);
      signatures.set(ids, modelType);
    }
    const clues: Record<string, string> = {
      "aile-volante": "wing-center-fairing",
      "tilt-wing": "tilt-wing-hinge",
      "tail-sitter": "tailsitter-pod",
      "coaxial-x8": "coaxial-distribution",
      "ducted-fan": "duct-01",
      "aérostat": "aerostat-envelope",
      "effet-de-sol": "sponson-port",
      "tandem-wing": "tandem-front-wing-port",
      canard: "canard-plane-port",
      biplan: "biplane-upper-port",
      "double-poutre": "boom-port",
      parapente: "suspension-01",
      ornithoptère: "ornitho-joint-port",
      cyclocoptère: "cyclo-cage-01",
      planeur: "glider-fuselage",
      "blended-pusher": "vee-fin-port",
    };
    for (const [type, clue] of Object.entries(clues)) {
      const design = examples.get(type);
      expect(design, type).toBeDefined();
      expect(modelFor(design!).parts.some(part => part.id === clue), `${type}/${clue}`).toBe(true);
    }
  });

  it("respecte envergure, longueur, corde et diamètre d’hélice configurés", () => {
    const design = droneCatalog.find(item => item.modelType === "voilure-conventionnelle")!;
    const small = modelFor(design, { wingspan: 2, chord: 0.22, fuselageLength: 1, propDiameter: 0.2, motorCount: 1 });
    const large = modelFor(design, { wingspan: 5, chord: 0.5, fuselageLength: 2.4, propDiameter: 0.6, motorCount: 1 });
    expect(large.span).toBeGreaterThan(small.span);
    expect(large.length).toBeGreaterThan(small.length);
    expect(large.parts.find(part => part.id === "fuselage-shell")!.size[2]).toBeGreaterThan(small.parts.find(part => part.id === "fuselage-shell")!.size[2]);
    expect(large.parts.find(part => part.id === "propeller-01")!.size[0]).toBeGreaterThan(small.parts.find(part => part.id === "propeller-01")!.size[0]);
    expect(large.parts.find(part => part.id === "wing-main-port")!.size[0]).toBeGreaterThan(small.parts.find(part => part.id === "wing-main-port")!.size[0]);
  });

  it("paramètre les motoréducteurs ornithoptère et les cages cycliques selon motorCount", () => {
    const ornithopter = droneCatalog.find(item => item.modelType === "ornithoptère")!;
    const cyclocopter = droneCatalog.find(item => item.modelType === "cyclocoptère")!;
    for (const motorCount of [1, 3, 12]) {
      const ornitho = modelFor(ornithopter, { motorCount });
      const cyclo = modelFor(cyclocopter, { motorCount });
      const count = (model: typeof ornitho, prefix: string) => model.parts.filter(part => part.id.startsWith(prefix));
      expect(count(ornitho, "ornitho-motor-")).toHaveLength(motorCount);
      expect(count(ornitho, "ornitho-reducer-")).toHaveLength(motorCount);
      expect(count(ornitho, "ornitho-drive-link-")).toHaveLength(motorCount);
      expect(count(ornitho, "ornitho-drive-mount-")).toHaveLength(motorCount);
      expect(count(cyclo, "cyclo-cage-")).toHaveLength(motorCount);
      expect(count(cyclo, "cyclo-station-")).toHaveLength(motorCount);
      expect(count(cyclo, "cyclo-hub-")).toHaveLength(motorCount);
      expect(count(cyclo, "cyclo-support-")).toHaveLength(motorCount * 2);
      expect(count(cyclo, "cyclo-blade-")).toHaveLength(motorCount * 3);
      expect(count(cyclo, "cyclo-cage-").every(part => part.category === "propulsion" && part.indices.length % 3 === 0)).toBe(true);
    }
    const stable = modelFor(cyclocopter, { motorCount: 4 }).parts.filter(part => part.id.startsWith("cyclo-cage-")).map(part => part.id);
    expect(stable).toEqual(["cyclo-cage-01", "cyclo-cage-02", "cyclo-cage-03", "cyclo-cage-04"]);
  });

  it("retombe sur un multirotor industriel ouvert lorsque les modelType sont absents", () => {
    const source = droneCatalog.find(item => item.modelType === "hexacoptère")!;
    const industrial: DroneCatalogDesign = { ...source, id: "industrial-open-no-type", modelType: undefined };
    const config = configurationFor(industrial, { modelType: undefined, motorCount: 6 });
    const model = buildMechanicalModel(industrial, config);
    expect(config.modelType).toBeUndefined();
    expect(model.modelType).toBe("multirotor");
    expect(model.parts.filter(part => part.id.startsWith("arm-"))).toHaveLength(6);
    expect(model.parts.filter(part => part.id.startsWith("motor-"))).toHaveLength(6);
    expect(model.parts.some(part => part.id.startsWith("duct-"))).toBe(false);
  });

  it("applique les éditions aux pièces sans modifier size nominale, et transforme en monde", () => {
    const design = droneCatalog.find(item => item.modelType === "voilure-conventionnelle")!;
    const edits: MechanicalTwinConfig = {
      designId: design.id,
      shellColor: "#112233",
      finish: "titanium",
      edits: {
        "fuselage-shell": {
          name: "Corps personnalisé",
          color: "#ff8800",
          hidden: true,
          offset: [0.2, -0.1, 0.3],
          rotation: [0, 90, 0],
          scale: [1.5, 0.75, 2],
        },
      },
      extraParts: [{ id: "user-module-1", name: "Module opérateur", kind: "box", size: [0.2, 0.1, 0.3], position: [0.1, 0.2, 0.3], color: "#00aacc" }],
    };
    const base = modelFor(design);
    const edited = modelFor(design, { mechanicalTwin: edits });
    const baseFuselage = base.parts.find(part => part.id === "fuselage-shell")!;
    const fuselage = edited.parts.find(part => part.id === "fuselage-shell")!;
    expect(fuselage.name).toBe("Corps personnalisé");
    expect(fuselage.color).toBe("#ff8800");
    expect(fuselage.hidden).toBe(true);
    expect(fuselage.size).toEqual(baseFuselage.size);
    expect(fuselage.scale).toEqual([1.5, 0.75, 2]);
    expect(fuselage.position).toEqual([0.2, -0.1, 0.3]);
    expect(fuselage.rotation[1]).toBeCloseTo(Math.PI / 2);
    expect(transformedPartVertices(fuselage)).not.toEqual(fuselage.vertices);
    expect(transformedPartVertices(fuselage, 1).every(Number.isFinite)).toBe(true);
    const extra = edited.parts.find(part => part.id === "user-module-1");
    expect(extra?.size).toEqual([0.2, 0.1, 0.3]);
  });

  it("isole les réglages par design et charge les modules installed avec leur ID stable", () => {
    const first = droneCatalog[0];
    const second = droneCatalog[1];
    const mismatched: MechanicalTwinConfig = {
      designId: second.id,
      edits: { "fuselage-shell": { hidden: true } },
      extraParts: [{ id: "user-other", name: "Autre", kind: "box", size: [1, 1, 1], position: [0, 0, 0], color: "#fff" }],
    };
    const config = configurationFor(first, {
      mechanicalTwin: mismatched,
      installedMaterials: [{ id: "camera-01", label: "Caméra installée", use: "inspection", massKg: 0.2, geometry: "mount", scale: 1.4, offsetX: 10, offsetY: -15, iddsWidth: 0.16, iddsHeight: 0.08 }],
    });
    const settings = mechanicalSettings(first, config);
    expect(settings.designId).toBe(first.id);
    expect(settings.edits).toBeUndefined();
    const model = buildMechanicalModel(first, config);
    expect(model.parts.some(part => part.id === "user-other")).toBe(false);
    const installed = model.parts.find(part => part.id === "installed:camera-01")!;
    expect(installed).toBeDefined();
    expect(installed.scale).toEqual([1.4, 1.4, 1.4]);
    expect(installed.size[0]).toBeCloseTo(0.16);
    expect(installed.size[1]).toBeCloseTo(0.08);
    const obj = exportMechanicalOBJ(model);
    expect(obj).toContain("o installed_camera-01");
    expect(obj).toContain("g Cam_ra_install_e");
  });

  it("construit le Mechanical Twin depuis les tracés utilisateur sans substituer une silhouette catalogue", () => {
    const base = droneCatalog[0];
    const custom = { ...base, id: "custom-sketch-regression", label: "Mon drone dessiné" };
    const config = configurationFor(custom, {
      customSketch: { version: 1, modifiedAt: "test", strokes: [
        { id: "outline-wing", tool: "line", color: "#22ccdd", width: 3, points: [{ x: 10, y: 20 }, { x: 100, y: 80 }] },
        { id: "body-box", tool: "rectangle", color: "#fff", width: 2, points: [{ x: 40, y: 30 }, { x: 70, y: 70 }] },
        { id: "label", tool: "annotation", color: "#fff", width: 1, points: [{ x: 50, y: 50 }] },
      ] },
    });
    const model = buildMechanicalModel(custom, config);
    expect(model.modelType).toContain("dessin-utilisateur");
    expect(model.parts.some(part => part.id.startsWith("sketch-outline-wing"))).toBe(true);
    expect(model.parts.some(part => part.id.startsWith("sketch-body-box"))).toBe(true);
    expect(model.parts.some(part => part.id === "wing-main-port" || part.id === "fuselage-shell")).toBe(false);
    expect(model.parts.some(part => part.id.includes("label"))).toBe(false);
    expect(model.parts.every(part => part.vertices.every(Number.isFinite))).toBe(true);
  });

  it("exporte uniquement la géométrie visible, éditée et triangulée en OBJ", () => {
    const design = droneCatalog.find(item => item.modelType === "voilure-conventionnelle")!;
    const model = modelFor(design, {
      mechanicalTwin: {
        designId: design.id,
        edits: {
          "fuselage-shell": { hidden: true },
          "wing-main-port": { name: "Aile visible OBJ", offset: [-0.25, 0, 0] },
        },
      },
    });
    const obj = exportMechanicalOBJ(model);
    expect(obj).toContain("o wing-main-port");
    expect(obj).toContain("g Aile_visible_OBJ");
    expect(obj).not.toContain("o fuselage-shell");
    expect(obj.split("\n").some(line => line.startsWith("v "))).toBe(true);
    expect(obj.split("\n").some(line => line.startsWith("f "))).toBe(true);
  });

  it("exporte un STL ASCII triangulé en mètres sans inclure les pièces masquées", () => {
    const design = droneCatalog.find(item => item.modelType === "voilure-conventionnelle")!;
    const model = modelFor(design, { mechanicalTwin: { designId: design.id, edits: { "fuselage-shell": { hidden: true, offset: [0.25, 0, 0] } } } });
    const stl = exportMechanicalSTL(model);
    expect(stl).toContain("solid ");
    expect(stl).toContain("unités : mètres");
    expect(stl).toContain("facet normal");
    expect(stl).toContain("vertex ");
    expect(stl).toContain("endsolid");
    expect(stl).not.toContain("NaN");
    expect((stl.match(/facet normal/g) ?? []).length).toBeGreaterThan(0);
  });
});
