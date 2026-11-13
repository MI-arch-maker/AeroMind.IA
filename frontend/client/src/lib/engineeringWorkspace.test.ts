import { describe, expect, it } from "vitest";
import {
  createDefaultEngineeringWorkspace,
  createEngineeringDocument,
  createEngineeringFolder,
  deleteEngineeringFolder,
  normalizeEngineeringWorkspace,
  renameEngineeringFolder,
  updateEngineeringDocument,
} from "./engineeringWorkspace";

describe("engineering workspace records", () => {
  it("creates nested folders and rejects duplicate sibling names", () => {
    const base = createDefaultEngineeringWorkspace();
    const nested = createEngineeringFolder(base, "Charges", "folder-design");
    const child = nested.folders.at(-1)!;
    expect(child.parentId).toBe("folder-design");
    expect(() => createEngineeringFolder(nested, "Charges", "folder-design")).toThrow("existe déjà");
  });

  it("renames folders and removes descendants with their documents", () => {
    let workspace = createDefaultEngineeringWorkspace();
    workspace = createEngineeringFolder(workspace, "Structures", "folder-design");
    const child = workspace.folders.at(-1)!;
    workspace = createEngineeringDocument(workspace, child.id, "work-instruction");
    const docId = workspace.documents[0].id;
    workspace = renameEngineeringFolder(workspace, child.id, "Structure primaire");
    expect(workspace.folders.find(item => item.id === child.id)?.name).toBe("Structure primaire");
    workspace = deleteEngineeringFolder(workspace, "folder-design");
    expect(workspace.folders.some(item => item.id === child.id || item.id === "folder-design")).toBe(false);
    expect(workspace.documents.some(item => item.id === docId)).toBe(false);
  });

  it("creates and edits a document in the selected project folder", () => {
    let workspace = createDefaultEngineeringWorkspace();
    workspace = createEngineeringDocument(workspace, "folder-manufacturing", "inspection");
    const created = workspace.documents[0];
    workspace = updateEngineeringDocument(workspace, created.id, { name: "Contrôle dimensionnel", body: "Valeurs à renseigner par l’ingénieur." });
    expect(workspace.documents[0]).toMatchObject({ name: "Contrôle dimensionnel", body: "Valeurs à renseigner par l’ingénieur.", kind: "inspection" });
    expect(() => createEngineeringDocument(workspace, "missing", "note")).toThrow("dossier valide");
  });

  it("sanitizes malformed and stale persisted workspace data", () => {
    const normalized = normalizeEngineeringWorkspace({
      folders: [{ id: "f", name: "\u0000Aéro ", parentId: "missing" }],
      documents: [{ id: "d", folderId: "missing", name: "orphan", body: "x" }],
      stations: [{ id: "s", name: "Poste", kind: "assembly", x: 300, y: -2 }],
      partStations: { p: "missing" },
      partStages: { p: "unknown" },
      partMaterials: { p: "carbon" },
    });
    expect(normalized.folders[0]).toMatchObject({ name: "Aéro", parentId: null });
    expect(normalized.documents).toHaveLength(0);
    expect(normalized.stations[0]).toMatchObject({ x: 96, y: 8 });
    expect(normalized.partStations).toEqual({});
    expect(normalized.partStages).toEqual({});
    expect(normalized.partMaterials).toEqual({ p: "carbon" });
  });
});
