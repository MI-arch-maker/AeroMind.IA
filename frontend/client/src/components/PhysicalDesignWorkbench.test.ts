import { describe, expect, it } from "vitest";
import type { ConceptConfig } from "../lib/aeroEngine";
import { CHECKLIST_STORAGE_VERSION, checklistStorageKey, persistLoadedChecklist, readChecklist, writeChecklist } from "./PhysicalDesignWorkbench";

describe("PhysicalDesignWorkbench checklist persistence", () => {
  it("restores checked items after state reset using the same stable design identity", () => {
    const config = { designName: "Prototype A", modelType: "multirotor", wingspan: 1.2, chord: 0.3, fuselageLength: 0.8, propDiameter: 0.25, motorCount: 4 } as ConceptConfig;
    const key = checklistStorageKey(config);
    const values = new Map<string, string>();
    const storage = {
      getItem: (item: string) => values.get(item) ?? null,
      setItem: (item: string, value: string) => { values.set(item, value); },
    };
    const checklist = { "Dimensions et tolérances vérifiées": true, "Masse et équilibrage contrôlés": false };

    writeChecklist(storage, key, checklist);
    const remountedChecklist = readChecklist(storage, checklistStorageKey({ ...config }));

    expect(remountedChecklist).toEqual(checklist);
    expect(JSON.parse(values.get(key) ?? "{}").version).toBe(CHECKLIST_STORAGE_VERSION);
    expect(checklistStorageKey({ ...config, designName: "Prototype B" })).not.toBe(key);
  });

  it("ignores invalid or obsolete stored payloads without throwing", () => {
    const storage = { getItem: () => JSON.stringify({ version: CHECKLIST_STORAGE_VERSION - 1, checks: { stale: true } }) };
    expect(readChecklist(storage, "key")).toEqual({});
    expect(readChecklist({ getItem: () => "not-json" }, "key")).toEqual({});
  });

  it("does not overwrite the next design until its saved checklist has been loaded", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const saved = { "Essais statiques et électriques planifiés": true };
    writeChecklist(storage, "design-b", saved);
    expect(persistLoadedChecklist(storage, "design-b", "design-a", { "Essais statiques et électriques planifiés": false })).toBe(false);
    expect(readChecklist(storage, "design-b")).toEqual(saved);
    expect(persistLoadedChecklist(storage, "design-b", "design-b", saved)).toBe(true);
  });
});
