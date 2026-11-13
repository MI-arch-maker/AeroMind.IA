import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultConcept, type ConceptConfig } from "./aeroEngine";
import { droneCatalog, type DroneCatalogDesign } from "./droneCatalog";
import { DesignStudioView } from "../components/DesignStudioView";

vi.mock("../contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "fr", t: (text: string) => text }) }));
vi.mock("../components/IDDSTwinAssemblyEditor", () => ({ IDDSTwinAssemblyEditor: ({ design }: { design: DroneCatalogDesign }) => <div data-idds-design={design.id}>Éditeur {design.label}</div> }));
vi.mock("../components/DroneSketchProWorkbench", () => ({ DroneSketchProWorkbench: () => <div /> }));
vi.mock("../components/EngineeringCadWorkbench", () => ({ EngineeringCadWorkbench: () => <div /> }));
vi.mock("../components/VirtualAssemblyWorkshop", () => ({ VirtualAssemblyWorkshop: () => <div /> }));
vi.mock("../components/StudioCommandDeck", () => ({ StudioCommandDeck: () => <div /> }));
vi.mock("../components/DroneBehaviorPanel", () => ({ DroneBehaviorPanel: () => <div /> }));
vi.mock("../components/PayloadMissionWorkbench", () => ({ PayloadMissionWorkbench: () => <div /> }));
vi.mock("../components/ParametricDronePreview", () => ({ ParametricDronePreview: () => <div /> }));
vi.mock("../components/PhysicalDroneModel", () => ({ PhysicalDroneModel: () => <div /> }));

const first = droneCatalog.find(item => item.engineeringAssets?.obj)!;
const second = droneCatalog.filter(item => item.engineeringAssets?.obj)[1];
const sketch = { version: 1 as const, modifiedAt: "test", strokes: [{ id: "trace", tool: "line" as const, color: "#fff", width: 1, points: [{ x: 10, y: 10 }, { x: 50, y: 50 }] }] };
const selection = (design: DroneCatalogDesign) => ({ source: "catalog" as const, droneId: design.id, droneLabel: design.label, updatedAt: "test" });
const render = (config: ConceptConfig, activeProfile?: DroneCatalogDesign) => renderToStaticMarkup(<DesignStudioView config={config} setConfig={() => {}} activeProfile={activeProfile} />);

describe("IDDS active source in the studio view", () => {
  it("selects the catalog identity even if an old profile and drawing are still passed", () => {
    const config: ConceptConfig = { ...defaultConcept, ...second.configuration, engineeringSelection: selection(second), customSketch: sketch };
    const output = render(config, first);
    expect(output).toContain(`data-idds-design=\"${second.id}\"`);
    expect(output).not.toContain(`data-idds-design=\"${first.id}\"`);
    expect(output).toContain("reconstruction OBJ éditable");
  });
  it("does not promote an old profile when a user drawing is the explicit source", () => {
    const config: ConceptConfig = { ...defaultConcept, customSketch: sketch, engineeringSelection: { source: "custom", droneId: "my-sketch", droneLabel: "Mon dessin", updatedAt: "test" } };
    const output = render(config, first);
    expect(output).not.toContain("data-idds-design=");
    expect(output).toContain("Mon dessin");
  });
});
