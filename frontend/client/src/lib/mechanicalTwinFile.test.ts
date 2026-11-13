import { describe, expect, it } from "vitest";
import { defaultConcept } from "./aeroEngine";
import {
  applyMechanicalTwinDocument,
  mechanicalDraftKey,
  parseMechanicalTwin,
  serializeMechanicalTwin,
} from "./mechanicalTwinFile";
import type { MechanicalTwinConfig } from "./mechanicalTwinGeometry";
const settings: MechanicalTwinConfig = {
  designId: "strata-01",
  finish: "titanium",
  edits: {
    fuselage: {
      name: "Cellule modifiée",
      offset: [0.1, 0, 0],
      scale: [1.4, 1, 1],
      hidden: false,
    },
  },
};
describe("Brouillons mécaniques manuels", () => {
  it("exporte et restaure les éditions d’une cellule sans données de session ni création de projet", () => {
    const file = serializeMechanicalTwin(
      "strata-01",
      { ...defaultConcept, wingspan: 4.2 },
      settings,
    );
    const restored = applyMechanicalTwinDocument(
      defaultConcept,
      file,
      "strata-01",
    );
    expect(restored.wingspan).toBe(4.2);
    expect(restored.mechanicalTwin).toEqual(settings);
    expect(restored.mechanicalTwins?.["strata-01"]).toEqual(settings);
    expect(restored.batteryWh).toBe(defaultConcept.batteryWh);
    expect(file).not.toContain("session");
  });
  it("refuse les paramètres d’un autre drone et les fichiers invalides", () => {
    const file = serializeMechanicalTwin("strata-01", defaultConcept, settings);
    expect(() => parseMechanicalTwin(file, "nimbus-01")).toThrow(
      "autre cellule",
    );
    expect(() => parseMechanicalTwin("{}", "strata-01")).toThrow("conforme");
    expect(() => parseMechanicalTwin("pas json", "strata-01")).toThrow(
      "illisible",
    );
    expect(() =>
      parseMechanicalTwin(
        file.replace('"wingspan": 2.8', '"wingspan": -1'),
        "strata-01",
      ),
    ).toThrow();
    expect(() =>
      parseMechanicalTwin("x".repeat(2_000_001), "strata-01"),
    ).toThrow("2 Mo");
  });
  it("préserve les données métier et les éditions d’une autre cellule", () => {
    const other: MechanicalTwinConfig = {
      designId: "nimbus-01",
      finish: "carbon",
    };
    const current = {
      ...defaultConcept,
      batteryWh: 2700,
      mechanicalTwins: { "nimbus-01": other },
    };
    const restored = applyMechanicalTwinDocument(
      current,
      serializeMechanicalTwin("strata-01", defaultConcept, settings),
      "strata-01",
    );
    expect(restored.batteryWh).toBe(2700);
    expect(restored.mechanicalTwins?.["nimbus-01"]).toEqual(other);
    expect(mechanicalDraftKey("strata-01")).not.toEqual(
      mechanicalDraftKey("nimbus-01"),
    );
  });
});
