import { describe, expect, it } from "vitest";
import { cadModelIsInstalled, type CadDocument } from "./solidCad";

const source = (id: string) => ({ model_id: id } as CadDocument);

describe("Transitions de projets lors d’un chargement CAO interrompu", () => {
  it("ne conserve pas busy lorsque A en chargement est remplacé par un projet sans modèle", () => {
    expect(cadModelIsInstalled(null, null, null)).toBe(false);
  });
  it("recharge A si sa source a été effacée par un chargement B abandonné", () => {
    expect(cadModelIsInstalled(null, "A", "A")).toBe(false);
  });
  it("ne court-circuite que le modèle réellement présent", () => {
    expect(cadModelIsInstalled(source("A"), "A", "A")).toBe(true);
    expect(cadModelIsInstalled(source("B"), "A", "A")).toBe(false);
    expect(cadModelIsInstalled(source("A"), "A", "B")).toBe(false);
    expect(cadModelIsInstalled(source("demo"), null, null)).toBe(true);
  });
});
