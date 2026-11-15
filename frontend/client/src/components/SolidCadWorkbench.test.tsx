import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultConcept } from "../lib/aeroEngine";

// SSR tests exercise initial accessible states without starting a browser or GPU.
vi.mock("@react-three/fiber", () => ({ Canvas: () => null, useThree: () => ({}) }));
vi.mock("@react-three/drei", () => ({ Environment: () => null, Html: () => null, Lightformer: () => null, Line: () => null, OrbitControls: () => null }));
import SolidCadWorkbench, { CadValidationPage } from "./SolidCadWorkbench";
import MechanicalCenter from "./MechanicalCenter";

const render = (props: React.ComponentProps<typeof SolidCadWorkbench> = {}) => renderToStaticMarkup(React.createElement(SolidCadWorkbench, props));

describe("Atelier CAO natif : états initiaux accessibles", () => {
  it("n’affiche aucune fausse géométrie avant la réponse du noyau", () => {
    const html = render();
    expect(html).toContain("Une source réelle, ou rien.");
    expect(html).toContain("uniquement après une réponse valide du noyau B-Rep");
    expect(html).not.toContain("<canvas");
    expect(html).toContain("EN ATTENTE DU NOYAU");
    expect(html).toContain("Aucune source native");
  });
  it("la route publique fixe ne propose jamais l’upload même si un modelId privé est passé", () => {
    const html = render({ publicDemoOnly: true, modelId: "private-id-from-url" });
    expect(html).toContain("assemblage fixe, calculé par le noyau");
    expect(html).toContain("Charger la démo du noyau");
    expect(html).toContain("DÉMO · PMI EN LECTURE SEULE");
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("private-id-from-url");
    expect(html).not.toContain("Importer STEP / BREP");
  });
  it("l’import projet utilise une entrée native explicite et conserve les contrôles de coupe au clavier", () => {
    const html = render({ projectLabel: "Projet aéromécanique", modelId: "owned-id" });
    expect(html).toContain('accept=".step,.stp,.brep"');
    expect(html).toContain("Importer un fichier STEP ou BREP authentifié");
    expect(html).toContain("Projet aéromécanique");
    expect(html).toContain("Position du plan de coupe en millimètres");
    expect(html).toContain("Rétablir le volume");
    expect(html).toContain("aucun mouvement automatique");
    expect(html).toContain("pas un simple clipping");
  });
  it("expose la limitation PBR nominal et la navigation vers le centre existant", () => {
    const html = renderToStaticMarkup(React.createElement(CadValidationPage));
    expect(html).toContain('href="/"');
    expect(html).toContain("aucune calibration BRDF mesurée");
    expect(html).toContain("conformité GD&amp;T automatique");
    expect(html).toContain("/api/cad/demo/step");
  });
  it("ajoute une entrée proéminente sans supprimer les onglets documentaires", () => {
    const html = renderToStaticMarkup(React.createElement(MechanicalCenter, { config: defaultConcept, setConfig: () => {}, activeDroneLabel: "Projet test" }));
    for (const label of ["Vue système", "CAO volumique / MBD", "Atelier manuel", "Assemblage", "Pièces &amp; installation", "Filerie &amp; câbles", "Connecteurs", "Visserie", "Graissage", "Maintenance"]) expect(html).toContain(label);
    expect(html).toContain("Ouvrir l’atelier natif");
    expect(html).toContain('href="/cad-validation"');
    expect(html).toContain("Modules documentaires : données indicatives");
    expect(html).toContain("volumes et COG calculés sur les solides B-Rep");
  });
});
