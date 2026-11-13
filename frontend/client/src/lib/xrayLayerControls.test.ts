import { describe, expect, it } from "vitest";
import { clampXrayCut, clampXrayOpacity, isXrayPartVisible, resetXrayPreset } from "./xrayLayerControls";

describe("Module 1 · contrôle manuel X-ray", () => {
  const part = { category: "propulsion", position: [0, 0, 0.2] as [number, number, number], size: [1, 1, 1] as [number, number, number] };
  it("borne le plan de coupe et les opacités", () => {
    expect(clampXrayCut(-1)).toBe(0);
    expect(clampXrayCut(2)).toBe(1);
    expect(clampXrayOpacity(-5)).toBe(0);
    expect(clampXrayOpacity(140)).toBe(100);
  });
  it("révèle progressivement une pièce et isole une couche", () => {
    expect(isXrayPartVisible(part, 0)).toBe(false);
    expect(isXrayPartVisible(part, 1)).toBe(true);
    expect(isXrayPartVisible(part, 1, "airframe")).toBe(false);
    expect(isXrayPartVisible(part, 1, "propulsion")).toBe(true);
  });
  it("fournit un état réinitialisable pour les préréglages", () => {
    expect(resetXrayPreset()).toEqual({ cut: 1, opacity: {}, isolated: "" });
  });
});
