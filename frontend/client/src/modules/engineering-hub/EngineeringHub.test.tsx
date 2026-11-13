import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ConceptConfig } from "../../lib/aeroEngine";
import EngineeringHub from "./EngineeringHub";

describe("EngineeringHub · état neutre de la cellule", () => {
  it("n’affiche aucun modèle, pièce ni canvas tant que le profil n’a pas chargé une cellule", () => {
    const html = renderToStaticMarkup(React.createElement(EngineeringHub, {
      projectName: "Projet vierge",
      cellName: "Aucun drone sélectionné",
      runId: "Aucun run",
      serverPersisted: false,
      saveState: "saved",
      config: {} as ConceptConfig,
      setConfig: vi.fn(),
      t: (text: string) => text,
      onLoadDrone: vi.fn(),
      onOpen: vi.fn(),
    }));

    expect(html).toContain("Aucune cellule sélectionnée");
    expect(html).toContain("Aucun drone n’est généré ou affiché par défaut");
    expect(html).toContain("Sélectionner un profil…");
    expect(html).toContain("0 modèle · 0 pièce · aucun mesh");
    expect(html).not.toContain("APERÇU DE PROFIL");
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("COMPONENTS DU PROFIL D’APERÇU");
  });
});
