import { describe, expect, it } from "vitest";
import { hasSessionIntegratedDrone, hasUserIntegratedDrone, labBenchDataProjectId } from "./labBenchDataGate";

const drawnCell = {
  customSketch: {
    version: 1,
    strokes: [
      {
        id: "wing-1",
        tool: "wing",
        color: "#75e2dc",
        width: 2,
        points: [{ x: 0, y: 0 }, { x: 100, y: 10 }],
      },
    ],
  },
};

describe("LabBench explicit drone-data gate", () => {
  it("keeps a project with default values empty until the user integrates a cell", () => {
    expect(hasUserIntegratedDrone({ airframe: "quadcopter", motorCount: 4 })).toBe(false);
    expect(hasUserIntegratedDrone({ engineeringSelection: { source: "catalog", droneId: "unselected" } })).toBe(false);
    expect(hasUserIntegratedDrone({ engineeringSelection: { source: "custom", droneId: "custom-sketch" } })).toBe(false);
  });

  it("accepts an explicit catalogue or industrial-library selection", () => {
    expect(hasUserIntegratedDrone({
      engineeringSelection: { source: "catalog", droneId: "atlas-01", droneLabel: "Atlas 01" },
    })).toBe(true);
    expect(hasUserIntegratedDrone({
      engineeringSelection: { source: "industrial", droneId: "reference-01", droneLabel: "Reference 01" },
    })).toBe(true);
  });

  it("accepts actual drawn geometry but rejects notes and measurement marks", () => {
    expect(hasUserIntegratedDrone(drawnCell)).toBe(true);
    expect(hasUserIntegratedDrone({ customSketch: { strokes: [
      { tool: "annotation", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      { tool: "measure", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    ] } })).toBe(false);
  });

  it("supports legacy persisted catalogue selections without accepting a generic airframe", () => {
    expect(hasUserIntegratedDrone({ platformProfile: "atlas-01" })).toBe(true);
    expect(hasUserIntegratedDrone({ platformProfile: "custom-sketch" })).toBe(false);
  });

  it("keeps a previously saved cell dormant until an integration action in this session", () => {
    const restoredSelection = {
      engineeringSelection: { source: "catalog", droneId: "atlas-01" },
    };
    expect(hasSessionIntegratedDrone(restoredSelection, false)).toBe(false);
    expect(hasSessionIntegratedDrone(restoredSelection, true)).toBe(true);
  });

  it("does not enable project-scoped LabBench data queries before integration", () => {
    expect(labBenchDataProjectId("project-1", true, false)).toBeNull();
    expect(labBenchDataProjectId("project-1", true, true)).toBe("project-1");
    expect(labBenchDataProjectId("project-1", false, false)).toBe("project-1");
  });
});
