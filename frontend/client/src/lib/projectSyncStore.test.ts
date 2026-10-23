import { describe, expect, it } from "vitest";
import {
  createWorkspaceSnapshot,
  validateWorkspace,
} from "./projectSyncStore";

const config = {
  wingspan: 2.8,
  chord: 0.32,
  fuselageLength: 1.55,
  propDiameter: 0.42,
  batteryWh: 900,
  payloadKg: 1.5,
  cruiseSpeedKmh: 58,
  windSpeedKmh: 20,
  reserveFraction: 0.2,
  maxTakeoffKg: 10.5,
  altitudeM: 120,
  airframe: "quadcopter",
  motorCount: 4,
  studioLayers: ["Structure"],
  studioLayerSettings: { Structure: { visible: false, locked: true } },
  activeStudioLayer: "Structure",
  designEvolutionStage: 3,
};
const project = {
  name: "Projet test",
  mission: "Inspection civile",
  status: "Brouillon",
  version: "2.1.0",
  owner: "Test",
  lastUpdated: "Maintenant",
};

function validSnapshot() {
  return createWorkspaceSnapshot({
    id: "project-test",
    project,
    requirements: [],
    config,
    runId: "SIM-001",
    projects: [{ id: "project-test", project, requirements: [], config, runId: "SIM-001" }],
    activeProjectId: "project-test",
  });
}

describe("projectSyncStore", () => {
  it("valide un snapshot versionné et force la sortie physique à false", () => {
    const result = validateWorkspace(validSnapshot());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(2);
      expect(result.value.physicalOutputEnabled).toBe(false);
      expect(result.value.source).toBe("LOCAL");
    }
  });

  it("conserve les préférences de calques dans le workspace synchronisé", () => {
    const result = validateWorkspace(validSnapshot());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.config.studioLayerSettings?.Structure).toEqual({
        visible: false,
        locked: true,
      });
      expect(result.value.config.activeStudioLayer).toBe("Structure");
      expect(result.value.config.designEvolutionStage).toBe(3);
    }
  });

  it("conserve la sélection active, les matériaux et le dessin partagé", () => {
    const synchronizedConfig = {
      ...config,
      engineeringSelection: {
        source: "custom" as const,
        droneId: "custom-sketch",
        droneLabel: "Inspection personnalisée",
        materialId: "carbon-panel",
        materialLabel: "Panneau carbone",
        materialSource: "user",
        updatedAt: "2026-10-14T13:00:00.000Z",
      },
      installedMaterials: [{ id: "carbon-panel", label: "Panneau carbone", massKg: 0.4 }],
      customSketch: {
        version: 1 as const,
        modifiedAt: "2026-10-14T13:00:00.000Z",
        strokes: [{ id: "stroke-1", tool: "freehand" as const, color: "#75e2dc", width: 2, points: [{ x: 12, y: 18 }] }],
      },
    };
    const snapshot = createWorkspaceSnapshot({
      id: "project-test",
      project,
      requirements: [],
      config: synchronizedConfig,
      runId: "SIM-001",
      projects: [{ id: "project-test", project, requirements: [], config: synchronizedConfig, runId: "SIM-001" }],
      activeProjectId: "project-test",
    });
    const result = validateWorkspace(snapshot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.config.engineeringSelection?.materialLabel).toBe("Panneau carbone");
      expect(result.value.config.installedMaterials).toHaveLength(1);
      expect(result.value.config.customSketch?.strokes).toHaveLength(1);
    }
  });

  it("migre un snapshot v3 legacy sans perdre le projet", () => {
    const legacy = { ...validSnapshot() } as Record<string, unknown>;
    delete legacy.schemaVersion;
    delete legacy.updatedAt;
    delete legacy.source;
    delete legacy.syncStatus;
    delete legacy.physicalOutputEnabled;
    const result = validateWorkspace(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.migrated).toBe(true);
  });

  it("rejette une donnée corrompue au lieu de fabriquer un workspace vierge", () => {
    const result = validateWorkspace({ schemaVersion: 2, projects: [{ id: "broken" }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(" ")).toContain("config");
  });

  it("rejette toute tentative d'activation de sortie physique", () => {
    const result = validateWorkspace({
      ...validSnapshot(),
      physicalOutputEnabled: true,
    });
    expect(result.ok).toBe(false);
  });
});
