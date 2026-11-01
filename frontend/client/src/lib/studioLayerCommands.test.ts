import { describe, expect, it } from "vitest";
import type { ConceptConfig } from "./aeroEngine";
import { createStudioLayer, deleteStudioLayer, normalizeLegacyStudioLayers, renameStudioLayer, reorderStudioLayer, updateStudioLayerSettings } from "./studioLayerCommands";

const baseConfig = {
  wingspan: 2.8, chord: 0.32, fuselageLength: 1.55, propDiameter: 0.42,
  batteryWh: 900, payloadKg: 1.5, cruiseSpeedKmh: 58, windSpeedKmh: 20,
  reserveFraction: 0.2, maxTakeoffKg: 10.5, altitudeM: 120,
} satisfies ConceptConfig;

const withObjects = (): ConceptConfig => ({
  ...baseConfig,
  studioLayers: ["Structure", "Câblage"],
  studioLayerSettings: { Structure: { visible: false, locked: true }, Câblage: { visible: true, locked: false } },
  activeStudioLayer: "Structure",
  installedMaterials: [{ id: "part-1", label: "Fuselage", massKg: 1, layer: "Structure" }],
  customSketch: { version: 1, modifiedAt: "2026-10-15T00:00:00.000Z", strokes: [{ id: "stroke-1", tool: "line", color: "#fff", width: 2, layer: "Structure", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }] },
});

describe("studioLayerCommands", () => {
  it("ne crée aucun calque implicite et ajoute seulement une demande explicite", () => {
    expect(baseConfig.studioLayers).toBeUndefined();
    expect(createStudioLayer(baseConfig, "  Structure  ")?.studioLayers).toEqual(["Structure"]);
    expect(createStudioLayer(baseConfig, "Structure")?.studioLayerSettings?.Structure).toMatchObject({ visible: true, locked: false, opacity: 100, blendMode: "normal", exposureEV: 0, contrast: 100, saturation: 100 });
    expect(createStudioLayer(withObjects(), " structure ")).toBeNull();
    expect(createStudioLayer(baseConfig, "   ")).toBeNull();
  });

  it("renomme atomiquement le calque et garde ses pièces et son dessin attachés", () => {
    const renamed = renameStudioLayer(withObjects(), "Structure", "Structure principale");
    expect(renamed?.studioLayers).toEqual(["Structure principale", "Câblage"]);
    expect(renamed?.activeStudioLayer).toBe("Structure principale");
    expect(renamed?.studioLayerSettings?.["Structure principale"]).toEqual({ visible: false, locked: true });
    expect(renamed?.installedMaterials?.[0].layer).toBe("Structure principale");
    expect(renamed?.customSketch?.strokes[0].layer).toBe("Structure principale");
    expect(renameStudioLayer(withObjects(), "Structure", "Câblage")).toBeNull();
  });

  it("supprime uniquement le calque et conserve ses objets non assignés", () => {
    const deleted = deleteStudioLayer(withObjects(), "Structure");
    expect(deleted?.studioLayers).toEqual(["Câblage"]);
    expect(deleted?.activeStudioLayer).toBe("");
    expect(deleted?.studioLayerSettings?.Structure).toBeUndefined();
    expect(deleted?.installedMaterials).toHaveLength(1);
    expect(deleted?.installedMaterials?.[0].layer).toBe("");
    expect(deleted?.customSketch?.strokes).toHaveLength(1);
    expect(deleted?.customSketch?.strokes[0].layer).toBe("");
  });

  it("réordonne les calques et applique visibilité/verrouillage sans en créer d’autres", () => {
    const ordered = reorderStudioLayer(withObjects(), 1, 0);
    const updated = updateStudioLayerSettings(ordered, "Câblage", { visible: false, locked: true });
    expect(updated.studioLayers).toEqual(["Câblage", "Structure"]);
    expect(updated.studioLayerSettings?.Câblage).toEqual({ visible: false, locked: true });
    expect(updateStudioLayerSettings(updated, "Absent", { visible: false })).toBe(updated);
  });

  it("persiste le mode de fusion, l’opacité et les réglages de développement", () => {
    const adjusted = updateStudioLayerSettings(withObjects(), "Câblage", { opacity: 62, blendMode: "screen", exposureEV: 1.2, contrast: 125, saturation: 80 });
    expect(adjusted.studioLayerSettings?.Câblage).toMatchObject({ visible: true, locked: false, opacity: 62, blendMode: "screen", exposureEV: 1.2, contrast: 125, saturation: 80 });
  });

  it("désactive les anciennes étiquettes système sans perdre matériaux ni traits", () => {
    const legacy: ConceptConfig = {
      ...baseConfig,
      installedMaterials: [{ id: "legacy-part", label: "Moteur", massKg: 0.3, layer: "Propulsion" }],
      studioLayerSettings: { Propulsion: { visible: false, locked: false }, Structure: { visible: true, locked: true } },
      activeStudioLayer: "Structure",
      customSketch: { version: 1, modifiedAt: "2026-10-15T00:00:00.000Z", strokes: [{ id: "legacy-stroke", tool: "line", color: "#fff", width: 1, layer: "Structure", points: [{ x: 0, y: 0 }, { x: 20, y: 20 }] }] },
    };
    const normalized = normalizeLegacyStudioLayers(legacy);
    expect(normalized.studioLayers).toBeUndefined();
    expect(normalized.studioLayerSettings).toEqual({});
    expect(normalized.activeStudioLayer).toBe("");
    expect(normalized.installedMaterials).toHaveLength(1);
    expect(normalized.installedMaterials?.[0].layer).toBe("");
    expect(normalized.customSketch?.strokes).toHaveLength(1);
    expect(normalized.customSketch?.strokes[0].layer).toBe("");
    expect(normalizeLegacyStudioLayers(normalized)).toBe(normalized);
  });
});
