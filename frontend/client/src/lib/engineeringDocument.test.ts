import { describe, expect, it } from "vitest";
import { defaultConcept } from "./aeroEngine";
import { engineeringDocumentFromConfig, engineeringDocumentSchema } from "./engineeringDocument";

describe("engineering document v1", () => {
  it("converts a concept configuration into SI geometry and BOM", () => {
    const document = engineeringDocumentFromConfig({ ...defaultConcept, installedMaterials: [{ id: "motor-1", label: "Moteur", category: "propulsion", use: "propulsion", massKg: 0.2, quantity: 2, geometry: "mount", catalogSource: "concept", manufacturerDataStatus: "estimate" }] }, "project-1", "version-1");
    expect(document.units).toBe("SI");
    expect(document.component_instances[0].quantity).toBe(2);
    expect(document.bom[0].total_mass_kg).toBeCloseTo(0.4);
    expect(document.missing_data).toContain("motor-1: données source estimate");
  });

  it("rejects duplicate component identifiers at the contract boundary", () => {
    const base = engineeringDocumentFromConfig(defaultConcept, "project-1", "version-1");
    const duplicate = { ...base, component_instances: [{ ...base.component_instances[0], id: "same" }, { ...base.component_instances[0], id: "same" }] };
    expect(() => engineeringDocumentSchema.parse(duplicate)).toThrow();
  });
});
