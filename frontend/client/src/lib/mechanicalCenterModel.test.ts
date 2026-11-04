import { describe, expect, it } from "vitest";
import { defaultMechanicalCenter, mergeMechanicalCenter } from "./mechanicalCenterModel";

describe("mechanical center model", () => {
  it("provides documentary defaults without physical transport fields", () => {
    expect(defaultMechanicalCenter.parts?.length).toBeGreaterThan(0);
    expect(defaultMechanicalCenter.wires?.every(wire => wire.lengthM >= 0)).toBe(true);
    expect(defaultMechanicalCenter.connectors?.every(connector => connector.locked !== undefined)).toBe(true);
  });

  it("preserves defaults while merging project edits", () => {
    const merged = mergeMechanicalCenter({ parts: [{ ...defaultMechanicalCenter.parts![0], label: "Cellule revue" }] });
    expect(merged.parts?.[0].label).toBe("Cellule revue");
    expect(merged.wires?.length).toBe(defaultMechanicalCenter.wires?.length);
    expect(merged.connectors?.length).toBe(defaultMechanicalCenter.connectors?.length);
  });
});
