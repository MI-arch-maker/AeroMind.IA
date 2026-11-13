import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MechanicalModel, MechanicalPart } from "../lib/mechanicalTwinGeometry";
import { resolveRenderPlan } from "../lib/renderEngines";
import { clipPolygonAtZ, xrayCutPosition } from "../lib/technicalRenderingPipeline";
import { MechanicalTwinViewport, MechanicalVectorView } from "./MechanicalTwinViewport";

const part = (id: string, z: number, category = "airframe"): MechanicalPart => ({
  id, name: id, category,
  vertices: [-1, 0, 0, 1, 0, 0, 0, 1, 0],
  indices: [0, 1, 2],
  position: [0, 0, z], rotation: [0, 0, 0], scale: [1, 1, 1],
  color: id === "rear" ? "#ff0000" : "#0000ff", metalness: 0.2, roughness: 0.6,
  hidden: false, size: [2, 1, 0.1],
});
const model: MechanicalModel = {
  designId: "test-active", name: "Drone actif", modelType: "test", span: 2, length: 2, extent: 2,
  settings: { designId: "test-active" },
  parts: [part("rear", -1), part("front", 1, "payload")],
};

type Overrides = Partial<Parameters<typeof MechanicalVectorView>[0]>;
function svg(overrides: Overrides = {}) {
  return renderToStaticMarkup(<MechanicalVectorView
    model={model} selected="" onSelect={() => {}} view="front" mode="solid" explosion={0}
    xrayCut={1} xrayOpacity={{}} {...overrides} />);
}
function polygon(markup: string, id: string): string {
  return markup.match(new RegExp(`<polygon[^>]*data-part="${id}"[^>]*>`))?.[0] ?? "";
}
function coords(markup: string, id: string): string {
  return polygon(markup, id).match(/points="([^"]+)"/)?.[1] ?? "";
}

describe("résolution des rendus du jumeau actif", () => {
  it("résout chaque preset technique et fait prévaloir un preset explicite sur l'ancien mode", () => {
    for (const [preset, id, mode] of [
      ["solid", "solid", "solid"], ["wireframe", "mesh-wire", "wireframe"],
      ["xray", "xray", "xray"], ["monochrome", "clay", "solid"],
      ["blueprint", "blueprint", "solid"], ["exploded", "exploded", "solid"],
    ] as const) {
      const plan = resolveRenderPlan(preset, "xray", 0);
      expect([plan.engine.id, plan.mode]).toEqual([id, mode]);
    }
    expect(resolveRenderPlan("mechanical", "wireframe", 0).mode).toBe("wireframe");
    expect(resolveRenderPlan("mechanical", "xray", 0).mode).toBe("xray");
    expect(resolveRenderPlan("mechanical", "solid", 0).mode).toBe("solid");
  });

  it("sépare les pièces sans superposer la valeur par défaut au curseur et sans imposer X-ray", () => {
    expect(resolveRenderPlan("exploded", "xray", 0).explosion).toBe(0.55);
    expect(resolveRenderPlan("exploded", "xray", 0.9).explosion).toBe(0.9);
    expect(resolveRenderPlan("exploded", "xray", 0.9).mode).toBe("solid");
    expect(resolveRenderPlan("solid", "solid", 0.9).explosion).toBe(0.9);
  });

  it("distingue les projections parallèles et perspective", () => {
    for (const id of ["axonometric", "orthographic", "blueprint"]) expect(resolveRenderPlan(id, "solid", 0).projection).toBe("orthographic");
    expect(resolveRenderPlan("perspective", "solid", 0).projection).toBe("perspective");
    const ortho = svg({ renderPreset: "orthographic" });
    const perspective = svg({ renderPreset: "perspective" });
    expect(ortho).toContain('data-vector-projection="orthographic"');
    expect(perspective).toContain('data-vector-projection="perspective"');
    expect(coords(ortho, "front")).not.toBe(coords(perspective, "front"));
    expect(coords(ortho, "rear")).not.toBe(coords(perspective, "rear"));
  });

  it("calcule une coupe Z globale sur les sommets transformés, puis découpe les faces traversées", () => {
    expect(xrayCutPosition(model, 0, 1)).toBeUndefined();
    expect(xrayCutPosition(model, 0, 0.5)).toBeCloseTo(0);
    expect(xrayCutPosition({ ...model, parts: [...model.parts, { ...part("hidden", 100), hidden: true }] }, 0, 0.5)).toBeCloseTo(0);
    const clipped = clipPolygonAtZ([[0, 0, -1], [2, 0, 1], [0, 2, 1]], 0);
    expect(clipped).toHaveLength(3);
    expect(clipped.every(point => point[2] <= 0)).toBe(true);
    expect(clipped).toContainEqual([1, 0, 0]);
    expect(clipped).toContainEqual([0, 1, 0]);
  });

  it("applique la coupe et l’isolation uniquement à X-ray, pas à la vue éclatée", () => {
    const cut = svg({ renderPreset: "xray", xrayCut: 0.5 });
    expect(polygon(cut, "rear")).not.toBe("");
    expect(polygon(cut, "front")).toBe("");
    const isolated = svg({ renderPreset: "xray", xrayIsolatedLayer: "payload" });
    expect(polygon(isolated, "rear")).toBe("");
    expect(polygon(isolated, "front")).not.toBe("");
    const exploded = svg({ renderPreset: "exploded", xrayCut: 0, xrayIsolatedLayer: "payload" });
    expect(polygon(exploded, "rear")).not.toBe("");
    expect(polygon(exploded, "front")).not.toBe("");
    expect(coords(exploded, "front")).not.toBe(coords(svg({ renderPreset: "solid" }), "front"));
  });

  it("découpe partiellement une face au lieu de masquer toute la pièce", () => {
    const crossing = { ...part("crossing", 0), vertices: [-1, 0, -1, 1, 0, 1, 0, 1, -1] };
    const crossingModel = { ...model, parts: [crossing] };
    const markup = svg({ model: crossingModel, renderPreset: "xray", xrayCut: 0.5 });
    expect(coords(markup, "crossing").split(" ")).toHaveLength(4);
    expect(polygon(markup, "crossing")).toContain('data-part="crossing"');
  });

  it("affiche le preset et le moteur effectifs dans le viewport, avec un secours signalé", () => {
    const markup = renderToStaticMarkup(<MechanicalTwinViewport model={model} selected="" onSelect={() => {}}
      view="front" mode="wireframe" explosion={0} resetKey={0} forceVector xrayCut={1} xrayOpacity={{}}
      renderPreset="monochrome" />);
    expect(markup).toContain('data-render-preset="monochrome"');
    expect(markup).toContain('data-render-engine="clay"');
    expect(markup).toContain('data-render-mode="solid"');
    expect(markup).toContain('<option value="monochrome" selected="">');
    expect(markup).toContain("Projection vectorielle de secours");
    expect(markup).toContain('data-vector-engine="clay"');
  });

  it("représente réellement le filaire, le blueprint, le monochrome et les états de sélection", () => {
    const wire = svg({ renderPreset: "wireframe" });
    expect(wire).toContain('data-vector-engine="mesh-wire"');
    expect(polygon(wire, "rear")).toContain('fill="none"');
    const blueprint = svg({ renderPreset: "blueprint" });
    expect(polygon(blueprint, "rear")).toContain('fill="none"');
    expect(blueprint).toContain('data-vector-projection="orthographic"');
    const mono = svg({ renderPreset: "monochrome" });
    expect(mono).toContain('data-vector-engine="clay"');
    expect(polygon(mono, "rear").match(/fill="([^"]+)"/)?.[1]).toEqual(polygon(mono, "front").match(/fill="([^"]+)"/)?.[1]);
    expect(polygon(svg({ selected: "front", renderPreset: "solid" }), "front")).toContain('stroke="#cafff2"');
    expect(polygon(svg({ previewPartId: "front", previewEnabled: true }), "front")).toContain('fill-opacity="0.48"');
  });

  it("conserve la transparence du calque, la géométrie masquée et les données du modèle", () => {
    const before = JSON.stringify(model);
    const xray = svg({ renderPreset: "xray", xrayOpacity: { payload: 40 } });
    expect(polygon(xray, "front")).toContain('fill-opacity="0.1"');
    const hiddenModel = { ...model, parts: [model.parts[0], { ...model.parts[1], hidden: true }] };
    expect(polygon(svg({ model: hiddenModel }), "front")).toBe("");
    expect(JSON.stringify(model)).toBe(before);
  });
});
