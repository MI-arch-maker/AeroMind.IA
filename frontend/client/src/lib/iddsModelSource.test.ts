import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConcept, type ConceptConfig } from "./aeroEngine";
import { droneCatalog } from "./droneCatalog";
import { buildMechanicalModel, exportMechanicalOBJ, transformedPartVertices } from "./mechanicalTwinGeometry";
import { buildIddsAssetModel, iddsCatalogAsset, parseIddsCatalogObj, resolveIddsSource } from "./iddsModelSource";

const pdf = droneCatalog.filter(item => item.engineeringAssets?.obj);
const configFor = (index: number): ConceptConfig => ({ ...defaultConcept, ...pdf[index].configuration, airframe: pdf[index].key, modelType: pdf[index].modelType });
const assetText = (index: number) => readFileSync(resolve(process.cwd(), "client", "public", pdf[index].engineeringAssets!.obj.slice(1)), "utf8");

describe("IDDS source identity and OBJ reconstruction", () => {
  it("reads the named source objects and finite triangles for all eight exact catalog assets", () => {
    expect(pdf).toHaveLength(8);
    for (let i = 0; i < pdf.length; i++) {
      const text = assetText(i);
      const parts = parseIddsCatalogObj(text);
      expect(iddsCatalogAsset(pdf[i])?.url).toBe(pdf[i].engineeringAssets?.obj);
      expect(parts.length).toBe(text.split(/\r?\n/).filter(line => /^o\s+/.test(line)).length);
      expect(new Set(parts.map(part => part.id)).size).toBe(parts.length);
      expect(parts.some(part => part.name === "main wing")).toBe(true);
      for (const part of parts) {
        expect(part.vertices.every(Number.isFinite)).toBe(true);
        expect(part.indices.length % 3).toBe(0);
        expect(part.indices.every(index => index >= 0 && index < part.vertices.length / 3)).toBe(true);
        expect(part.color).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("uses the explicitly selected identity, not stale profiles or drawings, and never borrows an imported asset", () => {
    const config = { ...configFor(0), engineeringSelection: { source: "catalog" as const, droneId: pdf[1].id, droneLabel: pdf[1].label, updatedAt: "now" }, customSketch: { version: 1 as const, modifiedAt: "now", strokes: [{ id: "s", tool: "line" as const, color: "#fff", width: 1, points: [{ x: 0, y: 0 }, { x: 50, y: 20 }] }] } };
    expect(resolveIddsSource(config, pdf[0])).toEqual({ profile: pdf[1], usesSketch: false });
    expect(resolveIddsSource({ ...config, engineeringSelection: { ...config.engineeringSelection, source: "custom" } }, pdf[0])).toEqual({ profile: undefined, usesSketch: true });
    expect(resolveIddsSource({ ...config, engineeringSelection: { ...config.engineeringSelection, droneId: "unknown" } }, pdf[0])).toEqual({ profile: undefined, usesSketch: false });
    expect(iddsCatalogAsset({ ...pdf[0], id: "import-foreign" })).toBeUndefined();
  });

  it("converts mm and axes, preserves source pieces, scales from canonical baseline, applies edits and exports", () => {
    const design = pdf[5], config = configFor(5);
    const source = parseIddsCatalogObj(assetText(5));
    const mesh = source.find(part => part.name === "main wing")!;
    expect(mesh.size[0]).toBeCloseTo(0.8, 3);
    expect(mesh.size[1]).toBeCloseTo(0.011, 3);
    expect(mesh.size[2]).toBeCloseTo(0.296, 3);
    expect(mesh.color).toBe("#a82933");
    const settings = { designId: design.id, edits: { [mesh.id]: { name: "Aile éditée", offset: [0.1, 0, 0] as [number, number, number], scale: [1, 2, 1] as [number, number, number] } } };
    const adjusted: ConceptConfig = { ...config, wingspan: config.wingspan * 2, fuselageLength: config.fuselageLength * 1.5, mechanicalTwin: settings, installedMaterials: [
      { id: `${design.id}-fuselage`, label: "Placeholder", use: "placeholder", massKg: 1, geometry: "core", catalogSource: "concept" },
      { id: "user-camera", label: "Camera", use: "user", massKg: 1, geometry: "mount", catalogSource: "user" },
    ] };
    // The activeProfile's configuration can contain current values; ratios must use the canonical source values instead.
    const passedProfile = { ...design, configuration: { ...design.configuration, ...adjusted } };
    const canonical = iddsCatalogAsset(passedProfile)!.design;
    const result = buildIddsAssetModel(buildMechanicalModel(passedProfile, adjusted), source, canonical, adjusted);
    const part = result.parts.find(item => item.id === mesh.id)!;
    expect(part.name).toBe("Aile éditée");
    expect(part.scale[0]).toBeCloseTo(2);
    expect(part.scale[1]).toBeCloseTo(2);
    expect(part.scale[2]).toBeCloseTo(1.5);
    expect(part.position[0]).toBeCloseTo(mesh.position[0] * 2 + 0.1);
    expect(transformedPartVertices(part)).not.toEqual(transformedPartVertices(mesh));
    expect(result.parts.some(item => item.id === `installed:${design.id}-fuselage`)).toBe(false);
    expect(result.parts.some(item => item.id === "installed:user-camera")).toBe(true);
    expect(result.parts.some(item => item.id === "fuselage-shell")).toBe(false);
    expect(exportMechanicalOBJ(result)).toContain(`o ${mesh.id}`);
  });

  it("never exposes a generated aircraft when the expected source mesh is unavailable", () => {
    const design = pdf[0], config = configFor(0);
    const result = buildIddsAssetModel(buildMechanicalModel(design, config), [], design, config);
    expect(result.parts).toEqual([]);
  });
});
