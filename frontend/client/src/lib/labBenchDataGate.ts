import { hasDroneGeometry } from "./droneSketchGeometry";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function hasUsableId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value !== "unselected";
}

/**
 * LabBench may use a cell only when the shared workspace records a real
 * catalogue selection or contains user-authored drone geometry. A project ID,
 * a default airframe, annotations, or the `unselected` sentinel are not proof
 * that the operator integrated a cell.
 */
export function hasUserIntegratedDrone(config: unknown): boolean {
  const record = asRecord(config);
  if (!record) return false;

  const sketch = asRecord(record.customSketch);
  const strokes = Array.isArray(sketch?.strokes) ? sketch.strokes : [];
  if (hasDroneGeometry(strokes as Parameters<typeof hasDroneGeometry>[0])) return true;

  const selection = asRecord(record.engineeringSelection);
  if (selection) {
    return (
      (selection.source === "catalog" || selection.source === "industrial") &&
      hasUsableId(selection.droneId)
    );
  }

  // Backward compatibility for older saved catalogue configurations that
  // predate engineeringSelection. Do not infer a selection from `airframe`.
  return hasUsableId(record.platformProfile) && record.platformProfile !== "custom-sketch";
}

/** A restored selection is dormant until the operator integrates it this session. */
export function hasSessionIntegratedDrone(config: unknown, integratedThisSession: boolean): boolean {
  return integratedThisSession && hasUserIntegratedDrone(config);
}

/** No project-scoped LabBench queries run before an integrated session is ready. */
export function labBenchDataProjectId(
  selectedProjectId: string | null,
  integratedSurface: boolean,
  integratedThisSession: boolean,
): string | null {
  return integratedSurface && !integratedThisSession ? null : selectedProjectId;
}
