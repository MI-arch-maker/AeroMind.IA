import { describe, expect, it } from "vitest";
import { materialCatalogUrl } from "./MaterialLibraryView";

describe("materialCatalogUrl", () => {
  it("preserves the catalog endpoint when no filters are selected", () => {
    expect(materialCatalogUrl(null, "   ", "https://aeromind.test"))
      .toBe("https://aeromind.test/api/materials/catalog");
  });

  it("encodes category and trims the debounced search value", () => {
    const url = new URL(materialCatalogUrl("payload & safety", "  Pixhawk  ", "https://aeromind.test"));
    expect(url.pathname).toBe("/api/materials/catalog");
    expect(url.searchParams.get("category")).toBe("payload & safety");
    expect(url.searchParams.get("q")).toBe("Pixhawk");
  });
});
