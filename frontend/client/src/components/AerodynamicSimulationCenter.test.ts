import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  applyAeroRenderPreset,
  createAeroDisplayModel,
  disposeAeroDisplayModel,
  switchAeroProjection,
} from "./AerodynamicSimulationCenter";

function boxAt(x: number, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
  mesh.position.set(x, y, z);
  return mesh;
}

describe("viewport aérodynamique", () => {
  it("centre et cadre une géométrie décalée sans modifier la source", () => {
    const source = boxAt(1500, -800, 250);
    const originalMaterial = source.material;
    const model = createAeroDisplayModel(source);
    const bounds = new THREE.Box3().setFromObject(model.object);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    expect(center.length()).toBeLessThan(1e-9);
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(3.2);
    expect(source.position.toArray()).toEqual([1500, -800, 250]);
    applyAeroRenderPreset(model, "clay");
    expect(source.material).toBe(originalMaterial);
    expect((model.meshes[0].material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xc9c3b6);
    disposeAeroDisplayModel(model);
  });

  it("applique les matériaux réels, puis les libère sans libérer la source", () => {
    const source = boxAt(0);
    const sourceDispose = vi.spyOn(source.material, "dispose");
    const model = createAeroDisplayModel(source);
    applyAeroRenderPreset(model, "npr");
    expect(model.meshes[0].material).toBeInstanceOf(THREE.MeshToonMaterial);
    const oldMaterial = model.materials[0];
    const oldDispose = vi.spyOn(oldMaterial, "dispose");
    applyAeroRenderPreset(model, "bionic");
    expect(oldDispose).toHaveBeenCalledOnce();
    expect((model.meshes[0].material as THREE.MeshStandardMaterial).wireframe).toBe(true);
    applyAeroRenderPreset(model, "crystal");
    const transparent = model.meshes[0].material as THREE.MeshStandardMaterial;
    expect(transparent.transparent).toBe(true);
    expect(transparent.opacity).toBeLessThan(1);
    expect(transparent.depthWrite).toBe(false);
    applyAeroRenderPreset(model, "lowpoly");
    expect((model.meshes[0].material as THREE.MeshStandardMaterial).flatShading).toBe(true);
    disposeAeroDisplayModel(model);
    expect(sourceDispose).not.toHaveBeenCalled();
  });

  it("n’éclate que des maillages distincts et restaure leurs positions, même sous rotation", () => {
    const source = new THREE.Group();
    const rotated = new THREE.Group();
    rotated.rotation.y = Math.PI / 3;
    rotated.scale.set(2, 1, 0.5);
    source.add(rotated);
    const left = boxAt(-3);
    const right = boxAt(3);
    rotated.add(left, right);
    const model = createAeroDisplayModel(source);
    expect(model.parts).toHaveLength(2);
    const initial = model.parts.map(part => part.mesh.getWorldPosition(new THREE.Vector3()));
    applyAeroRenderPreset(model, "exploded");
    for (let i = 0; i < model.parts.length; i++) {
      expect(model.parts[i].mesh.getWorldPosition(new THREE.Vector3()).distanceTo(initial[i])).toBeCloseTo(0.65);
    }
    expect(left.position.x).toBe(-3);
    expect(right.position.x).toBe(3);
    applyAeroRenderPreset(model, "mechanical");
    for (let i = 0; i < model.parts.length; i++) {
      expect(model.parts[i].mesh.getWorldPosition(new THREE.Vector3()).distanceTo(initial[i])).toBeLessThan(1e-9);
    }
    disposeAeroDisplayModel(model);

    const single = createAeroDisplayModel(boxAt(0));
    const before = single.parts[0].mesh.position.clone();
    applyAeroRenderPreset(single, "exploded");
    expect(single.parts).toHaveLength(1);
    expect(single.parts[0].mesh.position.equals(before)).toBe(true);
    disposeAeroDisplayModel(single);
  });

  it("ne compte pas les sous-maillages d’un maillage parent comme pièces indépendantes", () => {
    const parent = boxAt(0);
    parent.add(boxAt(1));
    const model = createAeroDisplayModel(parent);
    expect(model.parts).toHaveLength(1);
    disposeAeroDisplayModel(model);
  });

  it("ne considère pas un maillage masqué comme une pièce explosable", () => {
    const source = new THREE.Group();
    const hiddenGroup = new THREE.Group();
    hiddenGroup.visible = false;
    hiddenGroup.add(boxAt(3));
    source.add(boxAt(-3), hiddenGroup);
    const model = createAeroDisplayModel(source);
    expect(model.parts).toHaveLength(1);
    disposeAeroDisplayModel(model);
  });

  it("crée des normales locales si nécessaire sans modifier ou libérer la géométrie source", () => {
    const source = boxAt(0);
    source.geometry.deleteAttribute("normal");
    const sourceDispose = vi.spyOn(source.geometry, "dispose");
    const model = createAeroDisplayModel(source);
    expect(source.geometry.getAttribute("normal")).toBeUndefined();
    expect(model.meshes[0].geometry.getAttribute("normal")).toBeDefined();
    expect(model.meshes[0].geometry).not.toBe(source.geometry);
    const cloneDispose = vi.spyOn(model.meshes[0].geometry, "dispose");
    disposeAeroDisplayModel(model);
    expect(cloneDispose).toHaveBeenCalledOnce();
    expect(sourceDispose).not.toHaveBeenCalled();
  });

  it("permet la sélection de faces après bascule de projection", () => {
    const model = createAeroDisplayModel(boxAt(0));
    applyAeroRenderPreset(model, "mechanical");
    const perspective = new THREE.PerspectiveCamera(42, 1, 0.01, 10000);
    const ortho = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.01, 10000);
    const target = new THREE.Vector3();
    perspective.position.set(0, 0, 8);
    perspective.lookAt(target);
    perspective.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), perspective);
    expect(ray.intersectObject(model.object, true).length).toBeGreaterThan(0);
    const camera = switchAeroProjection(perspective, perspective, ortho, target, 1, "orthographic");
    camera.lookAt(target);
    camera.updateMatrixWorld();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    expect(ray.intersectObject(model.object, true).length).toBeGreaterThan(0);
    disposeAeroDisplayModel(model);
  });

  it("bascule réellement entre perspective et orthographique en gardant l’échelle au point visé", () => {
    const perspective = new THREE.PerspectiveCamera(42, 1.5, 0.01, 10000);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10000);
    const target = new THREE.Vector3(1, 2, 3);
    perspective.position.set(5, 6, 9);
    const distance = perspective.position.distanceTo(target);
    const expectedHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(21));
    const next = switchAeroProjection(perspective, perspective, ortho, target, 1.5, "orthographic");
    expect(next).toBe(ortho);
    expect(ortho.top - ortho.bottom).toBeCloseTo(expectedHeight);
    expect(ortho.right - ortho.left).toBeCloseTo(expectedHeight * 1.5);
    const back = switchAeroProjection(ortho, perspective, ortho, target, 1.5, "perspective");
    expect(back).toBe(perspective);
    expect(back.position.distanceTo(target)).toBeCloseTo(distance);
    const iso = switchAeroProjection(back, perspective, ortho, target, 1.5, "axonometric");
    const direction = iso.position.clone().sub(target).normalize();
    expect(direction.x).toBeCloseTo(direction.y);
    expect(direction.y).toBeCloseTo(direction.z);
  });
});

// Data-boundary tests complement the independent viewport tests above.
describe("centre aérodynamique sans données synthétiques", () => {
  it("ouvre un tableau de bord vide malgré une configuration cockpit préremplie", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { AerodynamicSimulationCenter } = await import("./AerodynamicSimulationCenter");
    vi.stubGlobal("window", { localStorage: { getItem: vi.fn(() => null) } });
    try {
      const html = renderToStaticMarkup(createElement(AerodynamicSimulationCenter, {
        config: { airframe: "fixed-wing", cruiseSpeedKmh: 79.2, wingspan: 2.4,
          chord: 0.34, maxTakeoffKg: 8.4, altitudeM: 0, designName: "Cockpit démo" } as any,
        projectName: "Projet utilisateur", onNavigate: vi.fn(),
      }));
      expect(html).toContain("Non renseignée");
      expect(html).toContain("Aucun résultat aérodynamique disponible");
      expect(html).toContain("CFD SOLVER NOT CONNECTED");
      expect(html).toContain("Calcul indisponible");
      expect(html).toContain("disabled");
      expect(html).not.toContain("Cockpit démo");
      expect(html).not.toContain("22,0");
      expect(html).not.toContain("1,225");
      expect(html).not.toContain("9,56");
      expect(html).not.toContain("82,38");
      expect(html).not.toContain("Créer une estimation analytique");
    } finally { vi.unstubAllGlobals(); }
  });

  it("ne rend pas les historiques analytiques hérités ni les scénarios ambigus", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { AerodynamicSimulationCenter } = await import("./AerodynamicSimulationCenter");
    vi.stubGlobal("window", { localStorage: { getItem: vi.fn(() => JSON.stringify([
      { name: "Legacy fake record", status: "ANALYTIC ESTIMATE", provenance: "local-user-scenario" },
    ])) } });
    try {
      const html = renderToStaticMarkup(createElement(AerodynamicSimulationCenter, {
        config: {} as any, projectName: "Projet", onNavigate: vi.fn(),
      }));
      expect(html).not.toContain("Legacy fake record");
      expect(html).not.toContain("ANALYTIC ESTIMATE");
      expect(html).toContain("Aucun résultat aérodynamique disponible");
    } finally { vi.unstubAllGlobals(); }
  });

  it("conserve les 14 rubriques et les parseurs tout en supprimant tous les chemins de calcul/export artificiels", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./AerodynamicSimulationCenter.tsx", import.meta.url), "utf8");
    const sectionNames = ["dashboard", "importer", "setup", "mesh", "cfd", "airflow", "pressure", "rotor",
      "comparison", "optimization", "history", "reports", "solver", "settings"];
    for (const name of sectionNames) expect(source).toContain(`section === "${name}"`);
    for (const parser of ["new STLLoader().parse", "new OBJLoader().parse", "new ThreeMFLoader().parse"]) expect(source).toContain(parser);
    for (const removed of ["estimateAerodynamicPerformance", "createLocalRun", "estimateMeshWork", "reportMarkdown",
      "calculateAirDensity", "standardAtmospherePressurePa", "runEstimate", "exportHistoryCsv", "setLatestRun", "demoValues"])
      expect(source).not.toContain(removed);
    expect(source).toContain('onNavigate("parametric-center")');
    expect(source).toContain('onNavigate("mechanical-center")');
    expect(source).toContain("createUserScenario");
    expect(source).toContain("readUserScenarios");
    expect(source).toContain("removeLegacyAnalyticHistory");
    const dataActions = source.slice(source.indexOf("export function AerodynamicSimulationCenter("));
    expect(dataActions).not.toContain("setTimeout(() => {");
  });
});
