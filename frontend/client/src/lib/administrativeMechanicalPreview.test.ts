import { describe, expect, it } from "vitest";
import { resolveAdministrativeMechanicalPreview } from "./administrativeMechanicalPreview";

describe("administrative mechanical preview", () => {
  it("refuse de générer un modèle en l’absence de configuration explicite", () => {
    expect(resolveAdministrativeMechanicalPreview(undefined)).toBeNull();
    expect(resolveAdministrativeMechanicalPreview({})).toBeNull();
    expect(resolveAdministrativeMechanicalPreview({ airframe: "quadcopter", modelType: "multirotor" })).toBeNull();
  });

  it("refuse une architecture non résolue ou des dimensions absentes", () => {
    expect(resolveAdministrativeMechanicalPreview({
      airframe: "unknown", modelType: "multirotor", wingspan: 2.4, chord: 0.3, fuselageLength: 0.8,
    })).toBeNull();
    expect(resolveAdministrativeMechanicalPreview({
      airframe: "quadcopter", modelType: "multirotor", wingspan: 2.4, chord: 0.3,
    })).toBeNull();
  });

  it("refuse les architectures ambiguës sans profil catalogue explicite", () => {
    expect(resolveAdministrativeMechanicalPreview({
      airframe: "quadcopter", modelType: "multirotor", wingspan: 1.5, chord: 0.7, fuselageLength: 0.28,
    })).toBeNull();
    expect(resolveAdministrativeMechanicalPreview({
      designId: "unknown-profile", airframe: "quadcopter", modelType: "multirotor",
      wingspan: 1.5, chord: 0.7, fuselageLength: 0.28,
    })).toBeNull();
  });

  it("construit le jumeau avec les dimensions du projet sélectionné", () => {
    const preview = resolveAdministrativeMechanicalPreview({
      airframe: "quadcopter",
      modelType: "multirotor",
      platformProfile: "nimbus-02",
      designName: "Configuration persistée",
      wingspan: 2.4,
      chord: 0.31,
      fuselageLength: 0.82,
      propDiameter: 0.24,
      motorCount: 4,
    });

    expect(preview).not.toBeNull();
    expect(preview?.displayName).toBe("Configuration persistée");
    expect(preview?.design.id).toBe("nimbus-02");
    expect(preview?.model.span).toBe(2.4);
    expect(preview?.model.length).toBe(0.82);
    expect(preview?.model.parts.length).toBeGreaterThan(0);
  });
});
