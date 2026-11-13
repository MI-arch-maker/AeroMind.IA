import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConcept, type ConceptConfig, type DroneSketchStroke } from "../lib/aeroEngine";
import { droneCatalog } from "../lib/droneCatalog";
import type { MechanicalModel, Vec3 } from "../lib/mechanicalTwinGeometry";
import { createWorkspaceSnapshot, validateWorkspace } from "../lib/projectSyncStore";
import { collectVariableRows, makeParametricSnapshot, parseParametricSnapshot } from "../lib/parametricStudioModel";
import { ParametricDroneCenter } from "./ParametricDroneCenter";
import { MechanicalWorkbench } from "./MechanicalWorkbench";

const mocked = vi.hoisted(() => ({ viewports: [] as Array<{ model: MechanicalModel; onPartTransform: (id: string, delta: Vec3) => void }> }));
vi.mock("../contexts/LanguageContext", () => ({ useLanguage: () => ({ t: (text: string) => text }) }));
vi.mock("./MechanicalTwinViewport", () => ({
  MechanicalTwinViewport: (props: { model: MechanicalModel; onPartTransform: (id: string, delta: Vec3) => void }) => {
    mocked.viewports.push(props);
    return React.createElement("div", { "data-test-viewport": props.model.designId });
  },
}));

type SetConfig = React.Dispatch<React.SetStateAction<ConceptConfig>>;
const noop: SetConfig = () => {};
const strokes: DroneSketchStroke[] = [
  { id: "contour", tool: "line", color: "#22ccdd", width: 3, points: [{ x: 10, y: 20 }, { x: 40, y: 30 }, { x: 100, y: 80 }] },
  { id: "cabine", tool: "rectangle", color: "#ffffff", width: 2, points: [{ x: 40, y: 30 }, { x: 70, y: 70 }] },
  { id: "annotation", tool: "annotation", color: "#fff", width: 1, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
];
const selection = { source: "custom" as const, droneId: "mon-dessin", droneLabel: "Mon dessin", updatedAt: "2026-01-01T00:00:00Z" };
const configWithSketch = (): ConceptConfig => ({
  ...defaultConcept,
  engineeringSelection: selection,
  customSketch: { version: 1, modifiedAt: "2026-01-01T00:00:00Z", strokes },
});

function renderBoth(config: ConceptConfig, setConfig: SetConfig = noop, activeProfile?: typeof droneCatalog[number], hasProject = true) {
  mocked.viewports.length = 0;
  const parametric = renderToStaticMarkup(React.createElement(ParametricDroneCenter, {
    config, setConfig, hasProject, activeProfile, activeDroneLabel: "Aucun drone sélectionné",
  }));
  const workbench = renderToStaticMarkup(React.createElement(MechanicalWorkbench, {
    config, setConfig, activeProfile, activeDroneLabel: "Aucun drone sélectionné",
  }));
  return { parametric, workbench, viewports: [...mocked.viewports] };
}

beforeEach(() => { mocked.viewports.length = 0; });

describe("Centres paramétrique et mécanique · dessin sélectionné", () => {
  it("ne construit rien sans sélection explicite ou sans traits géométriques, même avec un profil périmé", () => {
    const blank = renderBoth(defaultConcept);
    expect(blank.viewports).toHaveLength(0);
    expect(blank.parametric).toContain("AUCUNE GÉOMÉTRIE CHARGÉE");
    expect(blank.workbench).toContain("AUCUN DESIGN MÉCANIQUE CHARGÉ");

    const orphan = renderBoth({ ...defaultConcept, customSketch: configWithSketch().customSketch });
    expect(orphan.viewports).toHaveLength(0);

    const onlyAnnotation = configWithSketch();
    onlyAnnotation.customSketch = { ...onlyAnnotation.customSketch!, strokes: [strokes[2]] };
    expect(renderBoth(onlyAnnotation, noop, droneCatalog[0]).viewports).toHaveLength(0);

    const noId = { ...configWithSketch(), engineeringSelection: { ...selection, droneId: "" } };
    expect(renderBoth(noId, noop, droneCatalog[0]).viewports).toHaveLength(0);
  });

  it("reconstruit les traits du dessin sélectionné et non une silhouette catalogue, même si un ancien profil subsiste", () => {
    const result = renderBoth(configWithSketch(), noop, droneCatalog[0]);
    expect(result.viewports).toHaveLength(2);
    for (const { model } of result.viewports) {
      expect(model.designId).toBe("custom-sketch-mon-dessin");
      expect(model.modelType).toContain("dessin-utilisateur");
      expect(model.parts.some(part => part.id === "sketch-contour-1")).toBe(true);
      expect(model.parts.some(part => part.id.startsWith("sketch-cabine-"))).toBe(true);
      expect(model.parts.some(part => part.id.includes("annotation"))).toBe(false);
      expect(model.parts.some(part => part.id === "fuselage-shell" || part.id === "wing-main-port")).toBe(false);
    }
    expect(result.parametric).toContain("Les éditions du jumeau ne modifient pas le dessin source");
    expect(result.workbench).toContain("les éditions du jumeau ne modifient pas le dessin source");
    expect(result.workbench).toContain("PROJECTION DU DESSIN");
    expect(result.workbench).toContain("Mon dessin");
  });

  it("conserve la restriction de sauvegarde sans projet actif", () => {
    const local = renderBoth(configWithSketch(), noop, undefined, false);
    expect(local.viewports).toHaveLength(2);
    expect(local.parametric).toContain("Les modifications ne seront pas enregistrées dans un projet.");
    const saveButton = local.parametric.match(/<button[^>]*>[\s\S]*?<\/button>/g)?.find(button => button.includes(" Enregistrer</button>"));
    expect(saveButton).toBeDefined();
    expect(saveButton).toContain("disabled=");
  });

  it("réagit à un changement de traits et bascule proprement sur une autre sélection puis sur le catalogue", () => {
    const initial = configWithSketch();
    const first = renderBoth(initial).viewports[0].model;
    const changed = { ...initial, customSketch: { ...initial.customSketch!, strokes: [{ ...strokes[0], points: [strokes[0].points[0], { x: 60, y: 50 }, strokes[0].points[2]] }, strokes[1]], modifiedAt: "later" } };
    const updated = renderBoth(changed).viewports;
    expect(updated).toHaveLength(2);
    expect(updated[0].model.parts.find(part => part.id === "sketch-contour-1")?.position).not.toEqual(first.parts.find(part => part.id === "sketch-contour-1")?.position);
    expect(updated[0].model.parts).toEqual(updated[1].model.parts);
    const another = renderBoth({ ...changed, engineeringSelection: { ...selection, droneId: "autre" } }).viewports;
    expect(another.map(viewport => viewport.model.designId)).toEqual(["custom-sketch-autre", "custom-sketch-autre"]);
    const catalog = renderBoth({ ...defaultConcept }, noop, droneCatalog[0]).viewports;
    expect(catalog.map(viewport => viewport.model.designId)).toEqual([droneCatalog[0].id, droneCatalog[0].id]);
    expect(catalog[0].model.modelType).not.toContain("dessin-utilisateur");
  });

  it("partage les translations par ID sans perdre les données paramétriques ou modifier le croquis source", () => {
    const designId = "custom-sketch-mon-dessin";
    const twin = {
      designId,
      edits: { "sketch-contour-1": { color: "#ffaa00", offset: [0.1, 0, 0] as Vec3 } },
      sketchProfiles: [{ id: "profil-1", name: "Profil", kind: "rectangle" as const, width: 0.24, height: 0.08, modifiedAt: "test" }],
      customVariables: [{ id: "v1", name: "#v1", value: 1, unit: "", min: 0, max: 5, step: 1, type: "custom", description: "Test", appliesTo: "metadata" }],
      controlDeflections: { aileron: 7, flap: 8, elevator: 9, rudder: 10 },
      featureHistory: [{ id: "historic", kind: "sketch" as const, name: "Historique", status: "applied" as const, createdAt: "2026-01-01T00:00:00Z", parameters: {} }],
    };
    let current: ConceptConfig = { ...configWithSketch(), mechanicalTwins: { [designId]: twin, other: { designId: "other", edits: { other: { hidden: true } } } } };
    const sourceSketch = JSON.stringify(current.customSketch);
    const setter: SetConfig = value => { current = typeof value === "function" ? value(current) : value; };
    const before = renderBoth(current, setter);
    before.viewports[1].onPartTransform("sketch-contour-1", [0.2, 0.3, 0]);
    expect(current.mechanicalTwins?.[designId]?.edits?.["sketch-contour-1"]?.offset).toEqual([0.1 + 0.2, 0.3, 0]);
    expect(current.mechanicalTwins?.[designId]?.sketchProfiles).toEqual(twin.sketchProfiles);
    expect(current.mechanicalTwins?.[designId]?.customVariables).toEqual(twin.customVariables);
    expect(current.mechanicalTwins?.[designId]?.controlDeflections).toEqual(twin.controlDeflections);
    expect(current.mechanicalTwins?.[designId]?.featureHistory).toEqual(twin.featureHistory);
    expect(current.mechanicalTwins?.other?.edits?.other?.hidden).toBe(true);
    expect(JSON.stringify(current.customSketch)).toBe(sourceSketch);
    const afterWorkbench = renderBoth(current, setter);
    expect(afterWorkbench.viewports[0].model.parts.find(part => part.id === "sketch-contour-1")?.position).toEqual(afterWorkbench.viewports[1].model.parts.find(part => part.id === "sketch-contour-1")?.position);
    afterWorkbench.viewports[0].onPartTransform("sketch-contour-1", [0, 0, 0.4]);
    expect(current.mechanicalTwins?.[designId]?.edits?.["sketch-contour-1"]?.offset).toEqual([0.1 + 0.2, 0.3, 0.4]);
    expect(current.mechanicalTwin).toEqual(current.mechanicalTwins?.[designId]);
    expect(current.mechanicalTwins?.[designId]?.sketchProfiles).toEqual(twin.sketchProfiles);
    expect(JSON.stringify(current.customSketch)).toBe(sourceSketch);
    const parametricSnapshot = makeParametricSnapshot(current, designId, collectVariableRows(current, true, designId));
    const parsedParametric = parseParametricSnapshot(JSON.stringify(parametricSnapshot));
    expect(parsedParametric.designId).toBe(designId);
    expect(parsedParametric.mechanicalTwin?.sketchProfiles).toEqual(twin.sketchProfiles);
    const project = { name: "Projet test", mission: "Inspection civile", status: "Brouillon", version: "2.1.0", owner: "Test", lastUpdated: "Maintenant" };
    const record = { id: "project-test", project, requirements: [], config: current, runId: "SIM-001" };
    const snapshot = createWorkspaceSnapshot({ ...record, projects: [record], activeProjectId: record.id });
    const validated = validateWorkspace(JSON.parse(JSON.stringify(snapshot)));
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error(validated.issues.join(", "));
    const restored = validated.value.config as ConceptConfig;
    expect(restored.customSketch).toEqual(current.customSketch);
    expect(restored.mechanicalTwins?.[designId]?.customVariables).toEqual(twin.customVariables);
    const afterRestore = renderBoth(restored);
    expect(afterRestore.viewports).toHaveLength(2);
    expect(afterRestore.viewports[0].model.parts.find(part => part.id === "sketch-contour-1")?.position).toEqual(afterRestore.viewports[1].model.parts.find(part => part.id === "sketch-contour-1")?.position);
  });
});
