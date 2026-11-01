import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import { ParametricDronePreview } from "./ParametricDronePreview";

function design(overrides: Partial<DroneCatalogDesign> = {}): DroneCatalogDesign {
  return {
    key: "fixed-wing",
    modelType: "voilure-conventionnelle",
    id: "profile-test",
    label: "Profil test",
    family: "Aile fixe",
    mission: "Inspection",
    specs: "4 m",
    disciplines: "Architecture",
    tone: "cyan",
    configuration: { wingspan: 4, fuselageLength: 1.8, motorCount: 1 },
    role: "civil",
    defenseUse: "Usage de test",
    origin: "aeromind-parametric",
    ...overrides,
  };
}

function svgFor(profile: DroneCatalogDesign) {
  return renderToStaticMarkup(React.createElement(ParametricDronePreview, { design: profile }));
}

describe("ParametricDronePreview · variantes de conception", () => {
  it("différencie les morphologies catalogue d’une même famille d’aile fixe", () => {
    const long = svgFor(design({ id: "fixed-long", silhouette: "long" }));
    const flat = svgFor(design({ id: "fixed-flat", silhouette: "flat" }));
    expect(long).toContain("M0 -43L-154 -28");
    expect(flat).toContain("M0 -46L-136 -39");
    expect(long).not.toBe(flat);
  });

  it("différencie les morphologies de multirotors même à nombre de moteurs égal", () => {
    const common = { key: "quadcopter" as const, modelType: "multirotor" as const, configuration: { wingspan: 1.4, fuselageLength: 0.7, motorCount: 4 } };
    const flat = svgFor(design({ ...common, id: "quad-flat", silhouette: "flat" }));
    const surveillance = svgFor(design({ ...common, id: "quad-surveillance", silhouette: "surveillance" }));
    expect(flat).toContain("M0 -27Q-24 -18");
    expect(surveillance).toContain("M0 -42Q-15 -24");
    expect(flat).not.toBe(surveillance);
  });

  it("expose la rotation interactive et ses commandes clavier dans le SVG catalogue", () => {
    const markup = svgFor(design());
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain("rotate(0.0)");
    expect(markup).toContain("ROTATION");
    expect(markup).toContain("flèches gauche/droite");
    expect(markup).toContain("Home réinitialise");
  });
});
