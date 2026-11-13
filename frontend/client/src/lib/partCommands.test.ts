import { describe, expect, it } from "vitest";
import {
  installedPartMassKg,
  installedPartsMassKg,
  type InstalledMaterial,
} from "./aeroEngine";
import { applyPartCommand, describePartMass, summarizeParts } from "./partCommands";

const conceptPart: InstalledMaterial = {
  id: "p-wing",
  label: "Panneau d’aile",
  use: "Demi-aile",
  massKg: 0.5,
  quantity: 2,
  geometry: "skin",
  catalogSource: "concept",
};

const manufacturerPart: InstalledMaterial = {
  id: "p-servo",
  label: "Servo X",
  use: "Commande",
  massKg: 0.06,
  quantity: 4,
  geometry: "mount",
  catalogSource: "manufacturer",
  manufacturer: "Vendor",
  partNumber: "X-100",
  productUrl: "https://example.test/x100",
  manufacturerDataStatus: "verified",
  dimensions: "40 × 20 × 38 mm",
};

describe("masse efficace des pièces", () => {
  it("applique quantité puis échelle volumique pour une pièce de concept", () => {
    expect(installedPartMassKg(conceptPart)).toBeCloseTo(1, 5);
    expect(installedPartMassKg({ ...conceptPart, scale: 2 })).toBeCloseTo(8, 5);
  });

  it("conserve la masse documentée d’une référence constructeur malgré l’échelle", () => {
    expect(installedPartMassKg(manufacturerPart)).toBeCloseTo(0.24, 5);
    expect(installedPartMassKg({ ...manufacturerPart, scale: 1.8 })).toBeCloseTo(0.24, 5);
    expect(describePartMass({ ...manufacturerPart, scale: 1.8 }).estimated).toBe(false);
    expect(describePartMass({ ...manufacturerPart, scale: 1.8 }).detail).toContain(
      "Masse produit documentée conservée"
    );
  });

  it("somme le bilan de masse", () => {
    expect(installedPartsMassKg([conceptPart, manufacturerPart])).toBeCloseTo(1.24, 5);
  });
});

describe("applyPartCommand", () => {
  const parts = [conceptPart, manufacturerPart];

  it("déplace une pièce et borne le déplacement", () => {
    const moved = applyPartCommand(parts, { kind: "move", id: "p-wing", dx: 5, dy: -4 });
    const part = moved.parts[0];
    expect(part.offsetX).toBe(5);
    expect(part.offsetY).toBe(-4);

    const clamped = applyPartCommand(parts, { kind: "move", id: "p-wing", dx: 90, dy: 0 });
    expect(clamped.parts[0].offsetX).toBe(35);
    expect(clamped.warnings.join(" ")).toContain("Déplacement borné");
  });

  it("met à l’échelle une pièce de concept et recalcule la masse", () => {
    const scaled = applyPartCommand(parts, { kind: "scale", id: "p-wing", factor: 1.1 });
    expect(scaled.parts[0].scale).toBeCloseTo(1.1, 5);
    expect(scaled.message).toContain("échelle");
  });

  it("signale qu’une référence constructeur n’est pas altérée par l’échelle", () => {
    const scaled = applyPartCommand(parts, { kind: "scale", id: "p-servo", factor: 1.5 });
    expect(scaled.warnings.join(" ")).toContain("masse produit documentée");
  });

  it("ne modifie jamais les champs produit d’une référence constructeur", () => {
    const actions = [
      { kind: "move" as const, id: "p-servo", dx: 4, dy: 4 },
      { kind: "scale" as const, id: "p-servo", factor: 1.2 },
      { kind: "duplicate" as const, id: "p-servo" },
      { kind: "reset-transform" as const, id: "p-servo" },
    ];
    actions.forEach(action => {
      const outcome = applyPartCommand(parts, action, { nonce: 1 });
      outcome.parts
        .filter(part => part.partNumber === "X-100")
        .forEach(part => {
          expect(part.massKg).toBe(0.06);
          expect(part.manufacturer).toBe("Vendor");
          expect(part.productUrl).toBe("https://example.test/x100");
          expect(part.dimensions).toBe("40 × 20 × 38 mm");
          expect(part.manufacturerDataStatus).toBe("verified");
        });
    });
  });

  it("duplique une pièce en ajoutant une ligne et sa masse", () => {
    const duplicated = applyPartCommand(parts, { kind: "duplicate", id: "p-wing" }, { nonce: 42 });
    expect(duplicated.parts).toHaveLength(3);
    expect(duplicated.parts[1].id).not.toBe("p-wing");
    expect(duplicated.parts[1].quantity).toBe(1);
    expect(installedPartsMassKg(duplicated.parts)).toBeCloseTo(
      installedPartsMassKg(parts) + 0.5,
      5
    );
    expect(duplicated.parts[1].offsetX).toBe(3);
  });

  it("supprime une pièce et sort sa masse du bilan", () => {
    const removed = applyPartCommand(parts, { kind: "remove", id: "p-servo" });
    expect(removed.parts).toHaveLength(1);
    expect(installedPartsMassKg(removed.parts)).toBeCloseTo(1, 5);
  });

  it("change la quantité dans les bornes", () => {
    const quantity = applyPartCommand(parts, { kind: "quantity", id: "p-wing", quantity: 3 });
    expect(quantity.parts[0].quantity).toBe(3);
    expect(installedPartMassKg(quantity.parts[0])).toBeCloseTo(1.5, 5);
    const clamped = applyPartCommand(parts, { kind: "quantity", id: "p-wing", quantity: 0 });
    expect(clamped.parts[0].quantity).toBe(1);
  });

  it("réinitialise position et échelle", () => {
    const moved = applyPartCommand(parts, {
      kind: "reset-transform",
      id: "p-wing",
    });
    expect(moved.parts[0].offsetX).toBe(0);
    expect(moved.parts[0].scale).toBe(1);
    expect(moved.changed).toBe(false);
  });

  it("ignore une pièce inconnue sans échouer", () => {
    const outcome = applyPartCommand(parts, { kind: "remove", id: "absent" });
    expect(outcome.changed).toBe(false);
    expect(outcome.parts).toHaveLength(2);
  });
});

describe("summarizeParts", () => {
  it("résume lignes, références constructeur et pièces mises à l’échelle", () => {
    const summary = summarizeParts([{ ...conceptPart, scale: 1.4 }, manufacturerPart]);
    expect(summary.lineCount).toBe(2);
    expect(summary.manufacturerLines).toBe(1);
    expect(summary.scaledLines).toBe(1);
    expect(summary.note).toContain("masse estimée");
    // 0,5 kg × 2 unités × 1,4³ = 2,744 kg (échelle volumique) + 0,24 kg produit.
    expect(summary.totalMassKg).toBeCloseTo(2.744 + 0.24, 3);
  });
});
