import type { DroneSketchStroke } from "./aeroEngine";
import { getDroneGeometryStrokes } from "./droneSketchGeometry";

export type TwinPresentationMode = "horizon" | "exploded";

export const TWIN_PRESENTATION_STORAGE_KEY = "aeromind.digital-twin.presentation";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadTwinPresentationPreference(storage: StorageLike | undefined = browserStorage()): TwinPresentationMode {
  try {
    return storage?.getItem(TWIN_PRESENTATION_STORAGE_KEY) === "exploded" ? "exploded" : "horizon";
  } catch {
    return "horizon";
  }
}

export function saveTwinPresentationPreference(mode: TwinPresentationMode, storage: StorageLike | undefined = browserStorage()): void {
  try {
    storage?.setItem(TWIN_PRESENTATION_STORAGE_KEY, mode);
  } catch {
    // Si le navigateur interdit le stockage local, le choix reste actif pour cette session.
  }
}

export type TwinSketchLayerGroup = {
  key: string;
  label: string;
  assigned: boolean;
  strokes: DroneSketchStroke[];
};

/** Regroupe uniquement les entités géométriques affectées à un calque existant du document. */
export function groupTwinSketchByUserLayer(
  strokes: readonly DroneSketchStroke[] | null | undefined,
  userLayerNames: readonly string[] = [],
): TwinSketchLayerGroup[] {
  const allowedLayers = new Set(userLayerNames.map(name => name.trim()).filter(Boolean));
  const groups = new Map<string, TwinSketchLayerGroup>();

  for (const stroke of getDroneGeometryStrokes(strokes)) {
    const candidate = stroke.layer?.trim() ?? "";
    const layer = candidate && allowedLayers.has(candidate) ? candidate : "";
    const key = layer || "__unassigned__";
    const group = groups.get(key) ?? {
      key,
      label: layer || "Non affecté",
      assigned: Boolean(layer),
      strokes: [],
    };
    group.strokes.push(stroke);
    groups.set(key, group);
  }

  return [...groups.values()];
}
