import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { droneCatalog, type DroneCatalogDesign } from "../lib/droneCatalog";
import { buildMechanicalModel, type MechanicalModel, type MechanicalPart } from "../lib/mechanicalTwinGeometry";
import { adaptExternalDroneToCatalog } from "../lib/externalDroneImport";
import type { ConceptConfig } from "../lib/aeroEngine";
import { ParametricDronePreview, prepareMechanicalPreview, previewOrbitFromDrag, previewOrbitFromKey, projectMechanicalPreview, provenanceForModel } from "./ParametricDronePreview";

function design(overrides: Partial<DroneCatalogDesign> = {}): DroneCatalogDesign {
  return {
    key: "fixed-wing", modelType: "voilure-conventionnelle", id: "profile-test", label: "Profil test",
    family: "Aile fixe", mission: "Inspection", specs: "4 m", disciplines: "Architecture", tone: "cyan",
    configuration: { wingspan: 4, chord: 0.4, fuselageLength: 1.8, motorCount: 1 }, role: "civil",
    defenseUse: "Usage de test", origin: "aeromind-parametric", ...overrides,
  };
}

const render = (profile: DroneCatalogDesign, props: { zoom?: number; construction?: { parts: number; massKg: number } } = {}) =>
  renderToStaticMarkup(<ParametricDronePreview design={profile} {...props} />);
const pathsOf = (html: string) => html.match(/<g class="legacy-svg-body"[^>]*>(.*?)<\/g>/)?.[1] ?? "";

function triangle(overrides: Partial<MechanicalPart> = {}): MechanicalPart {
  return {
    id: "triangle", name: "Triangle", category: "airframe", vertices: [0, 0, 0, 2, 0, 0, 0, 1, 0], indices: [0, 1, 2],
    position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#25313a", metalness: 0,
    roughness: 1, hidden: false, size: [2, 1, 0], ...overrides,
  };
}
function model(parts: MechanicalPart[]): MechanicalModel {
  return { designId: "test", name: "Test", modelType: "test", parts, span: 2, length: 1, extent: 2, settings: { designId: "test" } };
}
function coordinates(path: string): number[] {
  return (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

describe("ParametricDronePreview · maillage et projection", () => {
  it("conserve le vectoriel et expose des projections additives sur le même maillage", () => {
    const profile = design();
    const prepared = prepareMechanicalPreview(buildMechanicalModel(profile, profile.configuration as ConceptConfig));
    const vector = projectMechanicalPreview(prepared, { yaw: 35, pitch: 32 }, "vector");
    const orthographic = projectMechanicalPreview(prepared, { yaw: 35, pitch: 32 }, "orthographic");
    const perspective = projectMechanicalPreview(prepared, { yaw: 35, pitch: 32 }, "perspective");
    const wireframe = projectMechanicalPreview(prepared, { yaw: 35, pitch: 32 }, "wireframe");
    const blueprint = projectMechanicalPreview(prepared, { yaw: 35, pitch: 32 }, "blueprint");
    expect(vector).toHaveLength(orthographic.length);
    expect(perspective).toHaveLength(vector.length);
    expect(wireframe.every(path => !path.d.endsWith("Z"))).toBe(true);
    expect(blueprint.every(path => !path.d.endsWith("Z"))).toBe(true);
    expect(perspective.map(path => path.d)).not.toEqual(vector.map(path => path.d));
  });

  it("utilise les faces réelles du constructeur pour le modèle et les dimensions sélectionnés", () => {
    const fixed = design();
    const quad = design({ id: "quad", key: "quadcopter", modelType: "multirotor", configuration: { wingspan: 1.4, chord: 0.3, fuselageLength: 0.7, motorCount: 4 } });
    const fixedModel = buildMechanicalModel(fixed, fixed.configuration as ConceptConfig);
    const expected = prepareMechanicalPreview(fixedModel);
    const markup = render(fixed);
    expect(markup).toContain(`data-preview-faces="${expected.faceCount}"`);
    const firstPath = projectMechanicalPreview(expected, { yaw: 35, pitch: 32 })[0];
    expect(pathsOf(markup)).toContain(`d="${firstPath.d}"`);
    expect(pathsOf(markup)).not.toEqual(pathsOf(render(quad)));
    expect(pathsOf(render(design({ configuration: { ...fixed.configuration, fuselageLength: 3 } })))).not.toEqual(pathsOf(markup));
  });

  it("recalcule le cache lorsque la configuration d’une conception est remplacée", () => {
    const profile = design();
    const first = pathsOf(render(profile));
    profile.configuration = { ...profile.configuration, fuselageLength: 3 };
    expect(pathsOf(render(profile))).not.toEqual(first);
  });

  it("applique échelle, rotation et position des pièces, exclut les pièces masquées et les triangles invalides", () => {
    const part = triangle({ position: [3, 4, 5], rotation: [0, 0, Math.PI / 2], scale: [2, 1, 1], indices: [0, 1, 2, 0, 1, 10, 0, 0, 0] });
    const hidden = triangle({ id: "hidden", position: [1000, 1000, 1000], hidden: true });
    const prepared = prepareMechanicalPreview(model([part, hidden]));
    expect(prepared.parts).toHaveLength(1);
    expect(prepared.faceCount).toBe(1);
    expect(prepared.center[0]).toBeCloseTo(2.5);
    expect(prepared.center[1]).toBeCloseTo(6);
    expect(prepared.center[2]).toBeCloseTo(5);
    expect(projectMechanicalPreview(prepared, { yaw: 20, pitch: 20 })).toHaveLength(1);
  });

  it("change la projection 3D et raccourcit une face de moitié à 60° de lacet, au lieu de tourner un dessin plat", () => {
    const prepared = prepareMechanicalPreview(model([triangle()]));
    const front = coordinates(projectMechanicalPreview(prepared, { yaw: 0, pitch: 0 })[0].d);
    const angled = coordinates(projectMechanicalPreview(prepared, { yaw: 60, pitch: 0 })[0].d);
    const frontWidth = Math.abs(front[2] - front[0]);
    const angledWidth = Math.abs(angled[2] - angled[0]);
    expect(angledWidth / frontWidth).toBeCloseTo(0.5, 2);
    expect(Math.abs(angled[5] - angled[1])).toBeCloseTo(Math.abs(front[5] - front[1]));
    expect(projectMechanicalPreview(prepared, { yaw: 0, pitch: 45 })[0].d).not.toBe(projectMechanicalPreview(prepared, { yaw: 0, pitch: 0 })[0].d);
  });

  it("ne crée pas de trou lorsque deux faces superposées ont des sens opposés", () => {
    const part = triangle({ indices: [0, 1, 2, 0, 2, 1] });
    const paths = projectMechanicalPreview(prepareMechanicalPreview(model([part])), { yaw: 0, pitch: 0 });
    expect(paths).toHaveLength(1);
    const faces = paths[0].d.match(/M[^Z]+Z/g) ?? [];
    expect(faces).toHaveLength(2);
    expect(faces[0]).toBe(faces[1]);
  });

  it("cadre un modèle même très allongé et ne produit pas de NaN pour une géométrie vide", () => {
    const prepared = prepareMechanicalPreview(model([triangle({ scale: [100, 0.1, 1] })]));
    for (const orbit of [{ yaw: 10, pitch: 30 }, { yaw: 85, pitch: 75 }, { yaw: -110, pitch: -45 }]) {
      const points = coordinates(projectMechanicalPreview(prepared, orbit)[0].d);
      points.forEach((n, i) => expect(n).toBeGreaterThanOrEqual(i % 2 ? 31 : 27));
      points.forEach((n, i) => expect(n).toBeLessThanOrEqual(i % 2 ? 137 : 293));
    }
    expect(projectMechanicalPreview(prepareMechanicalPreview(model([])), { yaw: 0, pitch: 0 })).toEqual([]);
  });

  it("ignore les sommets isolés qui ne sont référencés par aucune face", () => {
    const baseline = prepareMechanicalPreview(model([triangle()]));
    const extra = prepareMechanicalPreview(model([triangle({ vertices: [...triangle().vertices, 1000, 1000, 1000] })]));
    expect(extra.center).toEqual(baseline.center);
    expect(projectMechanicalPreview(extra, { yaw: 20, pitch: 30 })).toEqual(projectMechanicalPreview(baseline, { yaw: 20, pitch: 30 }));
  });
});

describe("ParametricDronePreview · interactions et provenance", () => {
  it("gère lacet, élévation et réinitialisation au clavier et au pointeur", () => {
    const start = { yaw: 35, pitch: 32 };
    expect(previewOrbitFromKey(start, "ArrowLeft")).toEqual({ yaw: 20, pitch: 32 });
    expect(previewOrbitFromKey(start, "ArrowRight")).toEqual({ yaw: 50, pitch: 32 });
    expect(previewOrbitFromKey(start, "ArrowUp")).toEqual({ yaw: 35, pitch: 42 });
    expect(previewOrbitFromKey(start, "ArrowDown")).toEqual({ yaw: 35, pitch: 22 });
    expect(previewOrbitFromKey({ yaw: 100, pitch: -80 }, "Home")).toEqual(start);
    expect(previewOrbitFromKey(start, "Escape")).toBeNull();
    expect(previewOrbitFromDrag(start, 20, -200)).toEqual({ yaw: 51, pitch: -68 });
    expect(previewOrbitFromDrag(start, 0, 1000).pitch).toBe(80);
    const markup = render(design());
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain("flèches gauche/droite et haut/bas");
    expect(markup).toContain("Home réinitialise");
    expect(markup).not.toContain("<canvas");
    expect(markup).not.toContain("rotate(");
  });

  it("qualifie la reconstruction sans prétendre charger l’OBJ des liens, conserve les liens et le zoom", () => {
    const canonical = droneCatalog.find(item => item.engineeringAssets)!;
    const assets = canonical.engineeringAssets!;
    const markup = render({ ...canonical, engineeringAssets: { ...assets } }, { zoom: 1.4, construction: { parts: 12, massKg: 2.5 } });
    expect(markup).toContain("RECONSTRUCTION PARAMÉTRIQUE · NON CERTIFIÉE");
    for (const path of [assets.hudSvg, assets.obj, assets.stl, assets.openScad]) expect(markup).toContain(`href="${path}"`);
    expect(markup).toContain("scale(calc(1.4 * var(--workspace-drone-scale, 1)))");
    expect(markup).toContain("STUDIO · 12 PIÈCES · 2.50 KG");
    expect(render(design(), { zoom: 5 })).toContain("scale(calc(1.8 * var(--workspace-drone-scale, 1)))");
  });

  it("n’attribue les fichiers qu’aux références canoniques dont tous les actifs correspondent", () => {
    const references = droneCatalog.filter(item => item.engineeringAssets);
    expect(references).toHaveLength(8);
    for (const reference of references) {
      const assets = reference.engineeringAssets!;
      const canonical = render(reference);
      for (const path of [assets.hudSvg, assets.obj, assets.stl, assets.openScad]) expect(canonical).toContain(`href="${path}"`);
      const imported = render({ ...reference, id: `import-${reference.id}`, label: "Profil importé" });
      expect(imported).not.toContain("parametric-cad-links");
      expect(imported).toContain("RECONSTRUCTION PARAMÉTRIQUE · NON CERTIFIÉE");
    }

    const [reference, other] = references;
    const assets = reference.engineeringAssets!;
    expect(render({ ...reference, engineeringAssets: other.engineeringAssets })).not.toContain("parametric-cad-links");
    for (const key of Object.keys(assets) as Array<keyof typeof assets>) {
      const modified = { ...assets, [key]: `/foreign-${key}` };
      const missing = { ...assets, [key]: undefined };
      expect(render({ ...reference, engineeringAssets: modified })).not.toContain("parametric-cad-links");
      expect(render({ ...reference, engineeringAssets: missing as typeof assets })).not.toContain("parametric-cad-links");
    }
    const withoutAssets = droneCatalog.find(item => !item.engineeringAssets)!;
    expect(render({ ...withoutAssets, engineeringAssets: assets })).not.toContain("parametric-cad-links");
    expect(render({ ...reference, engineeringAssets: undefined })).not.toContain("parametric-cad-links");
    expect(render({ ...reference, label: "Référence renommée", engineeringAssets: { ...assets } })).toContain(`href="${assets.obj}"`);
  });

  it("masque les actifs hérités du profil rapproché par l’importeur", () => {
    const reference = droneCatalog.find(item => item.engineeringAssets)!;
    const imported = adaptExternalDroneToCatalog("drone.obj", { min: [0, 0, 0], max: [0.72, 0.39, 0.1], vertexCount: 3 }, 1, [reference]).design;
    expect(imported.id).toMatch(/^import-/);
    expect(imported.engineeringAssets).toEqual(reference.engineeringAssets);
    const markup = render(imported);
    expect(markup).not.toContain("parametric-cad-links");
    expect(markup).toContain("RECONSTRUCTION PARAMÉTRIQUE · NON CERTIFIÉE");
  });

  it("reconnaît les sources explicites et les traits utilisateur", () => {
    const base = model([triangle()]);
    expect(provenanceForModel(base)).toContain("RECONSTRUCTION PARAMÉTRIQUE");
    expect(provenanceForModel({ ...base, modelType: "dessin-utilisateur · géométrie issue des traits" })).toContain("GÉOMÉTRIE DES TRAITS");
    expect(provenanceForModel({ ...base, geometrySource: "obj" } as MechanicalModel)).toContain("MAQUETTE OBJ");
  });

  it("regroupe les faces en un nombre limité de chemins SVG pour une fiche compacte", () => {
    const markup = render(design({ key: "quadcopter", modelType: "octocoptère", configuration: { wingspan: 2.2, chord: 0.34, fuselageLength: 0.92, motorCount: 8 } }));
    const faceCount = Number(markup.match(/data-preview-faces="(\d+)"/)?.[1]);
    const pathCount = (pathsOf(markup).match(/<path /g) ?? []).length;
    expect(faceCount).toBeGreaterThan(500);
    expect(pathCount).toBeLessThan(faceCount / 2);
  });
});
