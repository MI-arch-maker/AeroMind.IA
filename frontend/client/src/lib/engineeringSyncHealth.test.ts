import { describe, expect, it } from "vitest";
import {
  defaultConcept,
  defaultRequirements,
  type DroneSketchStroke,
} from "./aeroEngine";
import { evaluateEngineeringSync } from "./engineeringSyncHealth";

describe("engineering synchronization health", () => {
  it("does not select a drone without explicit human action", () => {
    const health = evaluateEngineeringSync({
      projectId: "project-1",
      config: { ...defaultConcept, platformProfile: undefined },
      requirements: [],
      runId: "—",
      hasWorkflowRun: false,
    });
    expect(health.selectedProfileId).toBeNull();
    expect(
      health.issues.some((issue) => issue.code === "HUMAN_SELECTION_REQUIRED"),
    ).toBe(true);
    expect(health.security.physicalOutputEnabled).toBe(false);
  });
  it("marks the shared engineering stream partial until a workflow run exists", () => {
    const health = evaluateEngineeringSync({
      projectId: "project-1",
      config: {
        ...defaultConcept,
        platformProfile: "atlas-01",
        installedMaterials: [
          {
            id: "part-1",
            label: "Cellule",
            category: "airframe",
            use: "structure",
            massKg: 1,
            geometry: "core",
          },
        ],
      },
      requirements: defaultRequirements,
      runId: "SIM-000",
      hasWorkflowRun: false,
    });
    expect(health.status).toBe("PARTIAL");
    expect(health.modules["Simulation"]).toBe("partial");
    expect(health.modules["Studio de conception"]).toBe("linked");
    expect(health.tree[0].children?.map((node) => node.label)).toEqual([
      "Cellule / configuration",
      "Exigences & conformité",
      "Conception & version prototype",
      "Vérification & preuves",
      "Audit & traçabilité",
    ]);
    expect(health.tree[0].state).toBe("partial");
    expect(health.security.physicalOutputEnabled).toBe(false);
  });
  it("prioritizes a real custom drawing over a stale catalog profile", () => {
    const sketchStroke: DroneSketchStroke = {
      id: "wing-1",
      tool: "wing",
      points: [
        { x: 10, y: 20 },
        { x: 90, y: 40 },
      ],
      color: "#65e5d7",
      width: 2,
      component: "freeform",
    };
    const health = evaluateEngineeringSync({
      projectId: "project-1",
      config: {
        ...defaultConcept,
        platformProfile: "stale-profile",
        engineeringSelection: {
          source: "custom",
          droneId: "custom-sketch",
          droneLabel: "Mon dessin",
          updatedAt: "2026-10-15T00:00:00Z",
        },
        customSketch: {
          version: 1,
          modifiedAt: "2026-10-15T00:00:00Z",
          strokes: [sketchStroke],
        },
      },
      requirements: defaultRequirements,
      runId: "SIM-000",
      hasWorkflowRun: false,
    });
    expect(health.selectedProfileId).toBe("custom-sketch");
    expect(
      health.issues.some((issue) => issue.code === "HUMAN_SELECTION_REQUIRED"),
    ).toBe(false);
  });
  it("does not treat an annotation-only custom sketch as a selected drone", () => {
    const note: DroneSketchStroke = {
      id: "note-1",
      tool: "annotation",
      points: [{ x: 10, y: 20 }],
      color: "#65e5d7",
      width: 2,
      component: "freeform",
    };
    const health = evaluateEngineeringSync({
      projectId: "project-1",
      config: {
        ...defaultConcept,
        platformProfile: undefined,
        engineeringSelection: {
          source: "custom",
          droneId: "custom-sketch",
          droneLabel: "Dessin annoté",
          updatedAt: "2026-10-15T00:00:00Z",
        },
        customSketch: {
          version: 1,
          modifiedAt: "2026-10-15T00:00:00Z",
          strokes: [note],
        },
      },
      requirements: [],
      runId: "—",
      hasWorkflowRun: false,
    });
    expect(health.selectedProfileId).toBeNull();
    expect(
      health.issues.some((issue) => issue.code === "HUMAN_SELECTION_REQUIRED"),
    ).toBe(true);
  });
});
