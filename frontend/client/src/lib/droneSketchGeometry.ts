import type { DroneSketchStroke } from "./aeroEngine";

/** Une cellule n’est une source de géométrie que si elle contient une forme à au moins deux points. */
export function getDroneGeometryStrokes(strokes: readonly DroneSketchStroke[] | null | undefined): DroneSketchStroke[] {
  return (strokes ?? []).filter(stroke => stroke.points.length > 1 && stroke.tool !== "annotation" && stroke.tool !== "measure");
}

export function hasDroneGeometry(strokes: readonly DroneSketchStroke[] | null | undefined): boolean {
  return getDroneGeometryStrokes(strokes).length > 0;
}
