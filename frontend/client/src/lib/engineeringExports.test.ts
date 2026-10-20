import { describe, expect, it } from "vitest";
import { defaultConcept } from "./aeroEngine";
import { buildBillOfMaterialsCsv } from "./engineeringExports";

describe("engineering bill of materials", () => {
  it("exports manufacturer traceability and quantity-weighted line mass", () => {
    const csv = buildBillOfMaterialsCsv(defaultConcept, [
      {
        id: "motor-test-set",
        label: "Moteur de test",
        use: "Moteur brushless",
        massKg: 0.12,
        quantity: 4,
        geometry: "mount",
        category: "propulsion",
        manufacturer: "T-MOTOR",
        partNumber: "MN4014-KV400",
        productUrl: "https://example.test/product/motor",
        massSourceUrl: "https://example.test/specs/motor-weight",
        catalogSource: "manufacturer",
        manufacturerDataStatus: "verified",
      },
    ]);

    expect(csv).toContain("Fabricant");
    expect(csv).toContain("Masse de ligne kg");
    expect(csv).toContain("T-MOTOR");
    expect(csv).toContain("MN4014-KV400");
    expect(csv).toContain("0.120");
    expect(csv).toContain("0.480");
    expect(csv).toContain("https://example.test/product/motor");
    expect(csv).toContain("https://example.test/specs/motor-weight");
    expect(csv).toContain("Source de masse");
    expect(csv).toContain("Fiche produit");
    expect(csv).toContain("Fiche fabricant — masse documentée");
  });
});
