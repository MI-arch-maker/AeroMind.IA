import { describe, expect, it } from "vitest";
import { materialCatalog, materialLibrarySummary, searchMaterialCatalog } from "./materialLibrary";

describe("material library", () => {
  it("unifies manufacturer, concept and source metadata without duplicate IDs", () => {
    expect(materialCatalog.length).toBeGreaterThan(30);
    expect(new Set(materialCatalog.map(item => item.id)).size).toBe(materialCatalog.length);
    expect(materialLibrarySummary.manufacturer).toBeGreaterThanOrEqual(9);
    expect(materialLibrarySummary.total).toBe(materialCatalog.length);
  });

  it("searches technical fields and can restrict a category", () => {
    expect(searchMaterialCatalog("Pixhawk").some(item => item.id === "holybro-pixhawk-6c-aluminum")).toBe(true);
    expect(searchMaterialCatalog("moteur", "propulsion").every(item => item.category === "propulsion")).toBe(true);
    expect(searchMaterialCatalog("terme-inexistant")).toHaveLength(0);
  });

  it("keeps manufacturer records traceable and non-physical by default", () => {
    const sourced = materialCatalog.filter(item => item.catalogSource === "manufacturer");
    expect(sourced.every(item => item.productUrl?.startsWith("https://"))).toBe(true);
    expect(sourced.every(item => item.massSourceUrl?.startsWith("https://"))).toBe(true);
    expect(sourced.every(item => item.physicalStatus !== "inspected")).toBe(true);
  });
});
