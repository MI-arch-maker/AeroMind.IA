import type { DroneSketchKeyframe } from "./aeroEngine";

export type AnimatedTransform = Pick<DroneSketchKeyframe, "x" | "y" | "rotation" | "scale" | "opacity">;
export const IDENTITY_TRANSFORM: AnimatedTransform = { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 };

/** Interpolation linéaire déterministe; avant la première clé, l’objet reste à sa pose neutre. */
export function evaluateDroneSketchAnimation(keyframes: DroneSketchKeyframe[] | undefined, time: number): AnimatedTransform {
  const frames = [...(keyframes ?? [])].sort((a, b) => a.time - b.time);
  if (!frames.length) return IDENTITY_TRANSFORM;
  if (time <= frames[0].time) {
    if (frames[0].time <= 0) return frames[0];
    return interpolate(IDENTITY_TRANSFORM, frames[0], Math.max(0, time) / frames[0].time);
  }
  const last = frames[frames.length - 1];
  if (time >= last.time) return last;
  const rightIndex = frames.findIndex(frame => frame.time >= time);
  const left = frames[rightIndex - 1];
  const right = frames[rightIndex];
  return interpolate(left, right, (time - left.time) / Math.max(0.0001, right.time - left.time));
}

function interpolate(a: AnimatedTransform, b: AnimatedTransform, t: number): AnimatedTransform {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    rotation: a.rotation + (b.rotation - a.rotation) * t,
    scale: a.scale + (b.scale - a.scale) * t,
    opacity: a.opacity + (b.opacity - a.opacity) * t,
  };
}
