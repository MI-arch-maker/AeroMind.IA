import { describe, expect, it } from "vitest";
import { manufacturerPartCatalog } from "./manufacturerParts";

describe("manufacturer parts library", () => {
  it("contains real, source-linked, quantitatively massed product variants", () => {
    expect(manufacturerPartCatalog.length).toBeGreaterThanOrEqual(9);
    expect(new Set(manufacturerPartCatalog.map(part => part.id)).size).toBe(
      manufacturerPartCatalog.length
    );

    for (const part of manufacturerPartCatalog) {
      expect(part.catalogSource).toBe("manufacturer");
      expect(part.manufacturer).toBeTruthy();
      expect(part.partNumber).toBeTruthy();
      expect(part.productUrl).toMatch(/^https:\/\//);
      expect(part.massSourceUrl).toMatch(/^https:\/\//);
      expect(Number.isFinite(part.massKg)).toBe(true);
      expect(part.massKg).toBeGreaterThan(0);
      expect(part.quantity).toBe(1);
      expect(["verified", "partial"]).toContain(part.manufacturerDataStatus);
    }
  });

  it("keeps uncertain or conflicting mass evidence marked partial", () => {
    expect(
      manufacturerPartCatalog.find(part => part.id === "holybro-h-rtk-f9p-ultralight")
        ?.manufacturerDataStatus
    ).toBe("partial");
    expect(
      manufacturerPartCatalog.find(part => part.id === "siyi-a8-mini-gimbal")
        ?.manufacturerDataStatus
    ).toBe("partial");
  });

  it("keeps the bare X500 frame distinct from its motorized ARF kit", () => {
    const frame = manufacturerPartCatalog.find(
      part => part.id === "holybro-x500-v2-frame-sku30120"
    );
    expect(frame?.partNumber).toContain("SKU30120");
    expect(frame?.compatibleAirframes).toEqual(["quadcopter"]);
    expect(frame?.use.toLowerCase()).toContain("pas le kit arf");
  });
});
