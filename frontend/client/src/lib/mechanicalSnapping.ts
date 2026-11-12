import type { MechanicalModel, MechanicalPart, Vec3 } from "./mechanicalTwinGeometry";

export type SnapMode = "grid" | "axis" | "component";
export type SnapOptions = {
  enabled?: boolean;
  mode?: SnapMode;
  increment?: number;
  tolerance?: number;
};

const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
const roundTo = (value: number, increment: number) => Math.round(value / increment) * increment;
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Returns the actual delta to persist after applying deterministic CAD-style
 * snapping. All coordinates are metres and the input delta is world-space.
 */
export function snapPartDelta(model: MechanicalModel, part: MechanicalPart, delta: Vec3, options: SnapOptions = {}): Vec3 {
  if (options.enabled === false) return delta;
  const mode = options.mode ?? "component";
  const increment = Math.max(0.0001, finite(options.increment ?? 0.01, 0.01));
  const tolerance = Math.max(increment * 0.75, finite(options.tolerance ?? increment * 1.5, increment * 1.5));
  const start = part.position;
  let target: Vec3 = [start[0] + delta[0], start[1] + delta[1], start[2] + delta[2]];

  if (mode === "grid" || mode === "component") {
    target = [roundTo(target[0], increment), roundTo(target[1], increment), roundTo(target[2], increment)];
  }

  if (mode === "axis" || mode === "component") {
    const neighbours = model.parts.filter(candidate => !candidate.hidden && candidate.id !== part.id);
    let best: { position: Vec3; distance: number } | undefined;
    for (const neighbour of neighbours) {
      const candidate: Vec3 = [neighbour.position[0], neighbour.position[1], neighbour.position[2]];
      const alignedAxes = [0, 1, 2].filter(axis => Math.abs(target[axis] - candidate[axis]) <= tolerance).length;
      if (alignedAxes === 0) continue;
      const candidateDistance = distance(target, candidate) - alignedAxes * tolerance * 0.01;
      if (!best || candidateDistance < best.distance) best = { position: candidate, distance: candidateDistance };
    }
    if (best) {
      target = target.map((value, axis) => Math.abs(value - best!.position[axis]) <= tolerance ? best!.position[axis] : value) as Vec3;
    }
  }

  return [target[0] - start[0], target[1] - start[1], target[2] - start[2]];
}
