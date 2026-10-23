import { describe, expect, it } from "vitest";
import { defaultConcept } from "./aeroEngine";
import { buildEngineeringReview } from "./engineeringReview";

describe("engineering review gate", () => {
  it("blocks an unconfigured empty project without inventing a design", () => {
    const checks = buildEngineeringReview({
      ...defaultConcept,
      airframe: undefined,
      wingspan: 0,
      chord: 0,
      fuselageLength: 0,
      propDiameter: 0,
      batteryWh: 0,
      maxTakeoffKg: 0,
    });
    expect(checks.find(check => check.id === "architecture")?.status).toBe(
      "block"
    );
    expect(checks.find(check => check.id === "geometry")?.status).toBe("block");
    expect(checks.find(check => check.id === "battery")?.status).toBe("block");
  });

  it("keeps absent certification evidence visible as review, not as a pass", () => {
    const checks = buildEngineeringReview({
      ...defaultConcept,
      airframe: "quadcopter",
    });
    for (const id of [
      "cg",
      "structure",
      "propulsion-evidence",
      "geospatial",
      "manufacturing",
      "hardware",
    ]) {
      expect(checks.find(check => check.id === id)?.status).toBe("review");
    }
  });

  it("blocks invalid installed-module masses", () => {
    const checks = buildEngineeringReview({
      ...defaultConcept,
      installedMaterials: [
        {
          id: "bad",
          label: "Module invalide",
          use: "Test",
          massKg: -1,
          geometry: "mount",
        },
      ],
    });
    expect(checks.find(check => check.id === "materials")?.status).toBe(
      "block"
    );
  });

  it("flags a component architecture mismatch for engineering review", () => {
    const checks = buildEngineeringReview({
      ...defaultConcept,
      airframe: "fixed-wing",
      installedMaterials: [
        {
          id: "quad-frame",
          label: "Cadre quadrirotor de test",
          use: "Architecture cible quadrirotor",
          massKg: 0.61,
          quantity: 1,
          geometry: "core",
          category: "airframe",
          compatibleAirframes: ["quadcopter"],
        },
      ],
    });
    const materials = checks.find(check => check.id === "materials");
    expect(materials?.status).toBe("review");
    expect(materials?.detail).toContain("Architecture déclarée incompatible");
  });

  it("does not mark architecture-specific parts as compatible while architecture is absent", () => {
    const checks = buildEngineeringReview({
      ...defaultConcept,
      airframe: undefined,
      installedMaterials: [
        {
          id: "rtk",
          label: "Récepteur RTK de test",
          use: "Installation aéronef à vérifier",
          massKg: 0.0214,
          quantity: 1,
          geometry: "mount",
          category: "avionics",
          compatibleAirframes: ["quadcopter", "fixed-wing", "vtol"],
        },
      ],
    });
    const materials = checks.find(check => check.id === "materials");
    expect(materials?.status).toBe("review");
    expect(materials?.detail).toContain("Déclarer l’architecture");
  });
});
