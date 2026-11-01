import { describe, expect, it } from "vitest";
import {
  createWorkspaceSnapshot,
  filterLegacyImplicitProjects,
  replaceExistingProjectSnapshot,
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
  it("ne crée pas de projet quand l’autosave reçoit un ID actif absent", () => {
    const projects = [{ id: "project-existing", value: "saved" }];
    expect(replaceExistingProjectSnapshot(projects, { id: "project-stale", value: "draft" })).toBeNull();
    expect(projects).toEqual([{ id: "project-existing", value: "saved" }]);
  });

  it("met à jour une entité existante sans changer son identité", () => {
    const projects = [{ id: "project-existing", value: "before" }];
    expect(replaceExistingProjectSnapshot(projects, { id: "project-existing", value: "after" })).toEqual([
      { id: "project-existing", value: "after" },
    ]);
  });

  it("ignore seulement les deux projets automatiques historiques, en conservant les projets utilisateur", () => {
    const projects = [
      { id: "project-local-1" },
      { id: "project-aeromind-inspection-demo" },
      { id: "project-user-saved" },
    ];
    expect(filterLegacyImplicitProjects(projects)).toEqual([{ id: "project-user-saved" }]);
    // Filtering is read-time only and must not mutate/delete the source data.
    expect(projects).toHaveLength(3);
  });

  it("refuse les propriétés mécaniques hors contrat sans remplacer le workspace", () => {
    const validMesh = { id: "mesh-1", name: "Mesh", kind: "mesh", size: [1, 1, 1], position: [0, 0, 0], color: "#ffffff", vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] };
    const invalidSettings = [
      { extraParts: [{ ...validMesh, indices: [0, 1, 3] }] },
      { customVariables: [{ id: "#span", name: "#span", value: 2, unit: "m", min: 0, max: 1, step: 0.1, type: "length", description: "Portée", appliesTo: "wingspan" }] },
      { controlDeflections: { aileron: 120, flap: 0, elevator: 0, rudder: 0 } },
    ];
    for (const setting of invalidSettings) {
      const snapshot = validSnapshot();
      const candidate = { ...snapshot, config: { ...config, mechanicalTwins: { "design-a": { designId: "design-a", ...setting } } } };
      const result = validateWorkspace(candidate);
      expect(result.ok).toBe(false);
    }
  });

  it("valide un snapshot versionné et force la sortie physique à false", () => {
    const result = validateWorkspace(validSnapshot());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(3);
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

  it("valide et conserve les meshes, l’historique et les autres données Mechanical Twin", () => {
    const mechanicalTwin = {
      designId: "design-test",
      extraParts: [{
        id: "mesh-1",
        name: "Nervure maillée",
        kind: "mesh" as const,
        size: [1, 2, 3] as [number, number, number],
        position: [0, 0.2, 0] as [number, number, number],
        color: "#aabbcc",
        vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 2],
      }],
      featureHistory: [{
        id: "feature-1",
        kind: "extrusion" as const,
        status: "applied" as const,
        name: "Extrusion profil",
        createdAt: "2026-10-31T12:00:00.000Z",
        targetPartId: "wing-root",
        dependsOn: ["feature-base"],
        parameters: { depth: 0.12, profile: "profile-1" },
      }],
      customVariables: [{
        id: "chord",
        name: "Corde",
        value: 0.3,
        unit: "m",
        min: 0.1,
        max: 1,
        step: 0.01,
        type: "number",
        description: "Corde de référence",
        appliesTo: "chord",
        expression: "#wingspan / 10",
      }],
      controlDeflections: { aileron: 12, flap: 20, elevator: 8, rudder: 10 },
      sketchProfiles: [{ id: "profile-1", name: "Profil", kind: "ellipse", width: 0.4, height: 0.1, modifiedAt: "2026-10-31T12:00:00.000Z" }],
      futureMechanicalOption: { retained: true },
    };
    const mechanicalConfig = { ...config, mechanicalTwin };
    const snapshot = createWorkspaceSnapshot({
      id: "project-test",
      project,
      requirements: [],
      config: mechanicalConfig,
      runId: "SIM-001",
      projects: [{ id: "project-test", project, requirements: [], config: mechanicalConfig, runId: "SIM-001" }],
      activeProjectId: "project-test",
    });

    const result = validateWorkspace(snapshot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const twin = result.value.config.mechanicalTwin!;
      expect(twin.extraParts?.[0]).toMatchObject({ kind: "mesh", vertices: mechanicalTwin.extraParts[0].vertices, indices: [0, 1, 2] });
      expect(twin.featureHistory?.[0]).toMatchObject({ id: "feature-1", kind: "extrusion", status: "applied", targetPartId: "wing-root", dependsOn: ["feature-base"] });
      expect(twin.customVariables?.[0].expression).toBe("#wingspan / 10");
      expect(twin.controlDeflections?.aileron).toBe(12);
      expect(twin.sketchProfiles?.[0].kind).toBe("ellipse");
      expect(twin.futureMechanicalOption).toEqual({ retained: true });
    }
  });

  it("rejette un index mesh hors plage", () => {
    const mesh = {
      id: "mesh-broken",
      name: "Mesh invalide",
      kind: "mesh",
      size: [1, 1, 1],
      position: [0, 0, 0],
      color: "#fff",
      vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 3],
    };
    const mechanicalConfig = { ...config, mechanicalTwin: { designId: "design-test", extraParts: [mesh] } };
    const snapshot = {
      ...validSnapshot(),
      config: mechanicalConfig,
      projects: [{ id: "project-test", project, requirements: [], config: mechanicalConfig, runId: "SIM-001" }],
    };
    expect(validateWorkspace(snapshot).ok).toBe(false);
  });

  it("migre un snapshot v2 en conservant géométrie et historique Mechanical Twin", () => {
    const mesh = {
      id: "mesh-v2",
      name: "Aile importée",
      kind: "mesh" as const,
      size: [1, 1, 1] as [number, number, number],
      position: [0, 0, 0] as [number, number, number],
      color: "#fff",
      vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
    };
    const feature = {
      id: "feature-v2",
      kind: "conversion" as const,
      status: "applied" as const,
      name: "Conversion CSG",
      createdAt: "2026-10-30T08:00:00.000Z",
      targetPartId: "source-part",
      dependsOn: ["feature-root"],
      parameters: { triangles: 1 },
    };
    const migratedConfig = { ...config, mechanicalTwin: { designId: "design-test", extraParts: [mesh], featureHistory: [feature] } };
    const legacy = {
      ...validSnapshot(),
      schemaVersion: 2,
      config: migratedConfig,
      projects: [{ id: "project-test", project, requirements: [], config: migratedConfig, runId: "SIM-001" }],
    };
    const result = validateWorkspace(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.migrated).toBe(true);
      expect(result.value.schemaVersion).toBe(3);
      expect(result.value.config.mechanicalTwin?.extraParts?.[0]).toMatchObject({ id: "mesh-v2", vertices: mesh.vertices, indices: mesh.indices });
      expect(result.value.config.mechanicalTwin?.featureHistory?.[0]).toMatchObject({ id: "feature-v2", targetPartId: "source-part", dependsOn: ["feature-root"] });
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

  it("ne migre pas un snapshot v2 déclarant une sortie physique active", () => {
    const result = validateWorkspace({ ...validSnapshot(), schemaVersion: 2, physicalOutputEnabled: true });
    expect(result.ok).toBe(false);
  });
});
