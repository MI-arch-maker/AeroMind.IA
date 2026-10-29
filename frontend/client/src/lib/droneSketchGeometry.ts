import type { DroneSketchStroke } from "./aeroEngine";

/** Une cellule n’est une source de géométrie que si elle contient une forme à au moins deux points. */
export function getDroneGeometryStrokes(strokes: readonly DroneSketchStroke[] | null | undefined): DroneSketchStroke[] {
  return (strokes ?? []).filter(stroke => stroke.points.length > 1 && stroke.tool !== "annotation" && stroke.tool !== "measure");
}

export function hasDroneGeometry(strokes: readonly DroneSketchStroke[] | null | undefined): boolean {
  return getDroneGeometryStrokes(strokes).length > 0;
}

/** P2-07 fix — validate sketch dimensions against the loaded 3D model bounds.
 *
 * Compares the bounding box of the 2D sketch strokes to the model's
 * wingspan/fuselageLength. Returns dimensional errors for strokes whose
 * extents exceed the model bounds by more than 10% (tolerance for hand-drawn
 * sketches). Prevents an operator from drawing a 4m wing on a 0.72m cellule
 * without a visible warning.
 */
export type DimensionalError = {
  strokeIndex: number;
  measuredMm: number;
  modelBoundMm: number;
  axis: "wingspan" | "fuselage";
  overshootPct: number;
};

export function validateSketchAgainstModel(
  strokes: readonly DroneSketchStroke[] | null | undefined,
  model: { wingspanMm?: number; fuselageLengthMm?: number },
): DimensionalError[] {
  const geo = getDroneGeometryStrokes(strokes);
  const errors: DimensionalError[] = [];
  const wingspanMm = model.wingspanMm ?? 0;
  const fuselageLengthMm = model.fuselageLengthMm ?? 0;
  const TOLERANCE = 1.10; // 10% overshoot allowed for hand-drawn sketches

  geo.forEach((stroke, idx) => {
    if (stroke.points.length < 2) return;
    const xs = stroke.points.map(p => p[0]);
    const ys = stroke.points.map(p => p[1]);
    const widthMm = Math.max(...xs) - Math.min(...xs);
    const heightMm = Math.max(...ys) - Math.min(...ys);

    if (wingspanMm > 0 && widthMm > wingspanMm * TOLERANCE) {
      errors.push({
        strokeIndex: idx,
        measuredMm: Math.round(widthMm),
        modelBoundMm: Math.round(wingspanMm),
        axis: "wingspan",
        overshootPct: Math.round((widthMm / wingspanMm - 1) * 100),
      });
    }
    if (fuselageLengthMm > 0 && heightMm > fuselageLengthMm * TOLERANCE) {
      errors.push({
        strokeIndex: idx,
        measuredMm: Math.round(heightMm),
        modelBoundMm: Math.round(fuselageLengthMm),
        axis: "fuselage",
        overshootPct: Math.round((heightMm / fuselageLengthMm - 1) * 100),
      });
    }
  });
  return errors;
}
