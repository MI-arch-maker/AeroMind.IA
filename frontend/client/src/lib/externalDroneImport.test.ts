import { describe, expect, it } from "vitest";
import { adaptExternalDroneToCatalog, getMeshDimensions, initializeImportedDroneProfile, normalizeImportedDroneProfile, parseExternalDroneMesh, transitionImportedDroneProfile } from "./externalDroneImport";
import { droneCatalog } from "./droneCatalog";

describe("external drone mesh import", () => {
  it("reads OBJ vertices and infers a compatible fixed-wing catalogue profile", () => {
    const bounds = parseExternalDroneMesh("prototype.obj", "v -2 -0.5 -0.1\nv 2 0.5 0.1\nv 0 0 0");
    expect(bounds.vertexCount).toBe(3);
    const match = adaptExternalDroneToCatalog("prototype.obj", bounds, 1, droneCatalog, "fixed-wing");
    expect(match.design.key).toBe("fixed-wing");
    expect(match.design.configuration.wingspan).toBe(4);
    expect(match.design.id).toMatch(/^import-/);
    expect(match.architecture).toBe("fixed-wing");
    expect(match.sourceDimensions).toEqual([4, 1, 0.2]);
  });

  it("reads ASCII STL vertices and identifies a compact multirotor-like footprint", () => {
    const stl = "solid drone\n facet normal 0 0 1\n outer loop\n vertex -0.5 -0.5 0\n vertex 0.5 0.5 0.2\n vertex 0 0 0\n endloop\n endfacet\nendsolid";
    const bounds = parseExternalDroneMesh("quad.stl", stl);
    const match = adaptExternalDroneToCatalog("quad.stl", bounds, 1, droneCatalog, "quadcopter");
    expect(match.design.key).toBe("quadcopter");
    expect(match.design.configuration.fuselageLength).toBe(1);
  });

  it("maps user-selected axes and converts units without guessing orientation", () => {
    const bounds = parseExternalDroneMesh("axes.obj", "v 0 0 0\nv 2000 5000 300\nv 2000 0 0");
    expect(getMeshDimensions(bounds, 0.001, { span: "y", length: "x", height: "z" })).toEqual([5, 2, 0.3]);
    expect(() => getMeshDimensions(bounds, 0.001, { span: "x", length: "x", height: "z" })).toThrow("axe différent");
    expect(() => getMeshDimensions(bounds, 1, { span: "x", length: "y", height: "z" })).toThrow("30 m");
  });
  it("allows a user-selected VTOL profile rather than silently classifying it", () => {
    const bounds = parseExternalDroneMesh("hybrid.obj", "v -1 -0.5 -0.2\nv 1 0.5 0.2\nv 0 0 0");
    const match = adaptExternalDroneToCatalog("hybrid.obj", bounds, 1, droneCatalog, "vtol");
    expect(match.architecture).toBe("vtol");
    expect(match.design.key).toBe("vtol");
  });
  it("reads binary STL and rejects unsupported formats or empty geometry", () => {
    const buffer = new ArrayBuffer(134);
    const view = new DataView(buffer);
    view.setUint32(80, 1, true);
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]].forEach((point, index) => {
      const offset = 96 + index * 12;
      view.setFloat32(offset, point[0], true);
      view.setFloat32(offset + 4, point[1], true);
      view.setFloat32(offset + 8, point[2], true);
    });
    expect(parseExternalDroneMesh("mesh.stl", buffer).vertexCount).toBe(3);
    expect(() => parseExternalDroneMesh("mesh.step", buffer)).toThrow(".OBJ ou .STL");
    expect(() => parseExternalDroneMesh("empty.obj", "# no vertices")).toThrow("sans sommets valides");
  });
  it("places new imports in evaluation and only marks them retained after explicit acceptance", () => {
    const bounds = parseExternalDroneMesh("review.obj", "v -2 -0.5 -0.1\nv 2 0.5 0.1\nv 0 0 0");
    const design = adaptExternalDroneToCatalog("review.obj", bounds, 1, droneCatalog, "fixed-wing").design;
    const pending = initializeImportedDroneProfile(design, "2026-10-17T10:00:00.000Z");
    expect(pending.libraryWorkflow.status).toBe("evaluation");
    const accepted = transitionImportedDroneProfile(pending, "accepted", "2026-10-17T11:00:00.000Z");
    expect(accepted.libraryWorkflow.status).toBe("accepted");
    expect(accepted.libraryWorkflow.acceptedAt).toBe("2026-10-17T11:00:00.000Z");
    const returned = transitionImportedDroneProfile(accepted, "evaluation", "2026-10-17T12:00:00.000Z");
    expect(returned.libraryWorkflow.status).toBe("evaluation");
    expect(returned.libraryWorkflow.acceptedAt).toBeUndefined();
    expect(returned.libraryWorkflow.history).toHaveLength(3);
  });

  it("migrates legacy imported profiles to evaluation rather than assuming acceptance", () => {
    const design = adaptExternalDroneToCatalog("legacy.obj", parseExternalDroneMesh("legacy.obj", "v -2 -0.5 -0.1\nv 2 0.5 0.1\nv 0 0 0"), 1, droneCatalog).design;
    const normalized = normalizeImportedDroneProfile(design, "2026-10-17T12:00:00.000Z");
    expect(normalized?.libraryWorkflow.status).toBe("evaluation");
    expect(normalized?.libraryWorkflow.history[0].action).toBe("legacy-import-requires-review");
  });

});
