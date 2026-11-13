import { describe, expect, it } from "vitest";
import { canPersistDesignState, reviewVariantDifferences, type ReviewVariant } from "./MechanicalTwinIntegrationDock";

describe("revue CAO · comparaison de variantes", () => {
  const variant = (overrides: Partial<ReviewVariant> = {}): ReviewVariant => ({
    id: "a", label: "A", createdAt: "2026-01-01T00:00:00Z", span: 4, length: 2, motorCount: 2, tolerance: 0.5, ...overrides,
  });
  it("compare les seuls champs effectivement enregistrés, tolérance incluse", () => {
    const rows = reviewVariantDifferences(variant(), variant({ id: "b", span: 5, length: 2.5, motorCount: 4, tolerance: 0.8 }));
    expect(rows.map(({ a, b }) => [a, b])).toEqual([[4, 5], [2, 2.5], [2, 4], [0.5, 0.8]]);
  });
  it("accepte les variantes historiques sans tolérance enregistrée", () => {
    const [row] = reviewVariantDifferences(variant({ tolerance: undefined }), variant({ id: "b" }));
    expect(row).toMatchObject({ label: "Envergure", a: 4, b: 4 });
    expect(reviewVariantDifferences(variant({ tolerance: undefined }), variant({ id: "b", tolerance: undefined }))[3]).toMatchObject({ a: undefined, b: undefined });
  });
});

describe("persistance du dock par design", () => {
  it("ne permet l’écriture qu’après hydratation de la même identité", () => {
    expect(canPersistDesignState("design-b", null)).toBe(false);
    expect(canPersistDesignState("design-b", "design-a")).toBe(false);
    expect(canPersistDesignState("design-b", "design-b")).toBe(true);
  });
});
