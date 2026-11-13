import { describe, expect, it } from "vitest";
import type { DroneSketchStroke } from "./aeroEngine";
import {
  groupTwinSketchByUserLayer,
  loadTwinPresentationPreference,
  saveTwinPresentationPreference,
  TWIN_PRESENTATION_STORAGE_KEY,
} from "./digitalTwinPresentation";

function makeStorage(initial?: Record<string, string>) {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

function stroke(tool: DroneSketchStroke["tool"], layer?: string): DroneSketchStroke {
  return {
    id: `${tool}-${layer ?? "none"}`,
    tool,
    color: "#65e5d7",
    width: 2,
    layer,
    component: "freeform",
    points: [{ x: 12, y: 20 }, { x: 80, y: 65 }],
  };
}

describe("digital twin presentation preference", () => {
  it("defaults safely and persists the selected mode in local storage only", () => {
    const storage = makeStorage();
    expect(loadTwinPresentationPreference(storage)).toBe("horizon");
    saveTwinPresentationPreference("exploded", storage);
    expect(storage.getItem(TWIN_PRESENTATION_STORAGE_KEY)).toBe("exploded");
    expect(loadTwinPresentationPreference(storage)).toBe("exploded");
    saveTwinPresentationPreference("horizon", storage);
    expect(loadTwinPresentationPreference(storage)).toBe("horizon");
  });

  it("falls back to Horizon for an invalid saved value", () => {
    const storage = makeStorage({ [TWIN_PRESENTATION_STORAGE_KEY]: "unknown" });
    expect(loadTwinPresentationPreference(storage)).toBe("horizon");
  });

  it("groups geometry by existing user layers and never makes a layer from an annotation or stale label", () => {
    const source = [
      stroke("line", "Voilure"),
      stroke("ellipse", "Structure systeme"),
      stroke("rectangle"),
      stroke("annotation", "Voilure"),
      stroke("measure", "Voilure"),
    ];
    const groups = groupTwinSketchByUserLayer(source, ["Voilure"]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ label: "Voilure", assigned: true });
    expect(groups[0].strokes.map(item => item.tool)).toEqual(["line"]);
    expect(groups[1]).toMatchObject({ label: "Non affecté", assigned: false });
    expect(groups[1].strokes.map(item => item.tool)).toEqual(["ellipse", "rectangle"]);
  });
});
