import { describe, expect, it } from "vitest";
import { industrialDroneRegistry, industrialFormats } from "./industrialDroneRegistry";

describe("AeroMind industrial drone registry", () => {
  it("keeps real manufacturer references distinct from internal concepts", () => {
    expect(industrialDroneRegistry).toHaveLength(4);
    expect(new Set(industrialDroneRegistry.map(item => item.id)).size).toBe(4);
    expect(industrialDroneRegistry.every(item => item.sourceUrl.startsWith("https://"))).toBe(true);
    expect(industrialDroneRegistry.every(item => item.physicalMockups.length >= 2)).toBe(true);
  });

  it("tracks every requested engineering format without inventing availability", () => {
    for (const model of industrialDroneRegistry) {
      expect(Object.keys(model.formats).sort()).toEqual([...industrialFormats].sort());
      expect(Object.values(model.formats).every(status => ["source", "conversion", "workflow", "unverified"].includes(status))).toBe(true);
    }
  });
});
