import { describe, expect, it } from "vitest";
import { dronePartCatalog, dronePartCategories } from "./droneParts";

describe("drone assembly parts library", () => {
  it("covers structure, propulsion, energy, avionics, mission and safety systems", () => {
    const categories = new Set(dronePartCatalog.map(part => part.category));
    for (const category of dronePartCategories) {
      expect(categories.has(category.id)).toBe(true);
    }
    expect(dronePartCatalog.length).toBeGreaterThanOrEqual(25);
  });

  it("uses unique identifiers and finite non-negative starter masses", () => {
    expect(new Set(dronePartCatalog.map(part => part.id)).size).toBe(
      dronePartCatalog.length
    );
    expect(
      dronePartCatalog.every(
        part => Number.isFinite(part.massKg) && part.massKg >= 0
      )
    ).toBe(true);
  });
});
