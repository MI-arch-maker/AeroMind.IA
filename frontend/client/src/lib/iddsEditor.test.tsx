import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConcept, type ConceptConfig } from "./aeroEngine";
import { droneCatalog } from "./droneCatalog";
import type { MechanicalModel, Vec3 } from "./mechanicalTwinGeometry";
import { IDDSTwinAssemblyEditor } from "../components/IDDSTwinAssemblyEditor";

const captured = vi.hoisted(() => ({ viewports: [] as Array<{ model: MechanicalModel; mode: string; explosion: number; kinematicsPlaying: boolean; onPartTransform: (id: string, delta: Vec3) => void }> }));
vi.mock("../components/MechanicalTwinViewport", () => ({
  MechanicalTwinViewport: (props: (typeof captured.viewports)[number]) => {
    captured.viewports.push(props);
    return React.createElement("div", { "data-test-viewport": props.model.designId });
  },
}));

beforeEach(() => { captured.viewports.length = 0; });
const withConfig = (design: typeof droneCatalog[number]): ConceptConfig => ({ ...defaultConcept, ...design.configuration, airframe: design.key, modelType: design.modelType });
const renderEditor = (design: typeof droneCatalog[number], config: ConceptConfig, mode: "assembly" | "internals" | "kinematics" | "simulation" | "variants", setConfig: React.Dispatch<React.SetStateAction<ConceptConfig>> = () => {}) => renderToStaticMarkup(<IDDSTwinAssemblyEditor design={design} config={config} setConfig={setConfig} language="fr" renderMode={mode} kinematicsPlaying={true} exploded={true} onPresentation={() => {}} onOpenCatalog={() => {}} />);

describe("IDDSTwinAssemblyEditor source and mode wiring", () => {
  it("never substitutes a generated mesh while the selected OBJ is still loading", () => {
    const design = droneCatalog.find(item => item.engineeringAssets?.obj)!;
    const output = renderEditor(design, withConfig(design), "internals");
    expect(output).toContain("OBJ RECONSTRUIT DEPUIS LA 2D");
    expect(output).toContain("Chargement de la reconstruction OBJ");
    expect(captured.viewports[0].model.designId).toBe(design.id);
    expect(captured.viewports[0].model.parts).toEqual([]);
    expect(captured.viewports[0].mode).toBe("xray");
    expect(captured.viewports[0].kinematicsPlaying).toBe(false);
    expect(captured.viewports[0].explosion).toBeGreaterThan(0);
  });

  it("uses the active parametric model and wires simulation and illustrative kinematics", () => {
    const design = droneCatalog.find(item => !item.engineeringAssets?.obj)!;
    const config = withConfig(design);
    const output = renderEditor(design, config, "simulation");
    expect(output).toContain("MAQUETTE PARAMÉTRIQUE GÉNÉRIQUE");
    expect(captured.viewports[0].model.designId).toBe(design.id);
    expect(captured.viewports[0].model.parts.length).toBeGreaterThan(0);
    expect(captured.viewports[0].mode).toBe("wireframe");
    expect(captured.viewports[0].kinematicsPlaying).toBe(false);
    renderEditor(design, config, "kinematics");
    expect(captured.viewports[1].kinematicsPlaying).toBe(true);
  });

  it("persists a moved part for the active identity without losing other settings", () => {
    const design = droneCatalog.find(item => !item.engineeringAssets?.obj)!;
    const twin = { designId: design.id, edits: { "fuselage-shell": { offset: [0.1, 0, 0] as Vec3, color: "#123456" } }, controlDeflections: { aileron: 1, flap: 2, elevator: 3, rudder: 4 } };
    let current = { ...withConfig(design), mechanicalTwin: twin };
    const setConfig: React.Dispatch<React.SetStateAction<ConceptConfig>> = value => { current = (typeof value === "function" ? value(current) : value) as typeof current; };
    renderEditor(design, current, "assembly", setConfig);
    captured.viewports[0].onPartTransform("fuselage-shell", [0.2, 0.3, 0]);
    expect(current.mechanicalTwin.edits?.["fuselage-shell"].offset).toEqual([0.1 + 0.2, 0.3, 0]);
    expect(current.mechanicalTwin.edits?.["fuselage-shell"].color).toBe("#123456");
    expect(current.mechanicalTwin.controlDeflections).toEqual(twin.controlDeflections);
    expect(current.mechanicalTwins?.[design.id]).toEqual(current.mechanicalTwin);
  });
});
