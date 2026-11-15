import { describe, expect, it } from "vitest";
import { cadGdtSymbol, cadPmiTolerance, validatePmiInput, type CadPmi } from "./solidCad";

const pmi: CadPmi = { id: "pmi", part_id: "part", face_id: "face", anchor_mm: [0, 0, 0], kind: "dimension", text: "Thickness", nominal_mm: 10, tolerance_um: 8, source: "xde" };

describe("Fidélité de présentation des PMI sémantiques", () => {
  it("conserve +8/-5 µm sans inventer une tolérance symétrique", () => {
    expect(cadPmiTolerance({ ...pmi, upper_tolerance_um: 8, lower_tolerance_um: 5 })).toBe("+8 / −5 µm");
  });
  it("distingue la zone de parallélisme de la déviation dimensionnelle", () => {
    expect(cadPmiTolerance({ ...pmi, kind: "parallelism", datum: "A" })).toBe("8 µm");
    expect(cadPmiTolerance(pmi)).toBe("± 8 µm");
    expect(cadGdtSymbol({ ...pmi, kind: "parallelism" })).toBe("∥");
  });
  it("conserve les bornes dimensionnelles plutôt que leur maximum", () => {
    expect(cadPmiTolerance({ ...pmi, lower_bound_mm: 9.995, upper_bound_mm: 10.008 })).toBe("9,995 … 10,008 mm");
  });
  it("ne substitue aucun symbole à un GD&T non interprété", () => {
    expect(cadGdtSymbol({ ...pmi, kind: "profile", unsupported_gdt_symbol: true })).toBe("GD&T non interprété");
  });
  it("autorise une spécification matériau sans nominal ni tolérance inventés", () => {
    const input = { part_id: "part", face_id: "face", kind: "material", nominal_mm: null, tolerance_um: null, datum: "", text: "Ti-6Al-4V ; lot à confirmer" };
    expect(validatePmiInput(input).tolerance_um).toBeNull();
    expect(() => validatePmiInput({ ...input, kind: "flatness" })).toThrow(/tolérance/);
  });
});
