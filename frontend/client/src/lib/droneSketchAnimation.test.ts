import { describe, expect, it } from "vitest";
import { evaluateDroneSketchAnimation, IDENTITY_TRANSFORM } from "./droneSketchAnimation";
import type { DroneSketchKeyframe } from "./aeroEngine";

const keys: DroneSketchKeyframe[] = [
  { time: 2, x: 100, y: -20, rotation: 30, scale: 2, opacity: 0.5 },
  { time: 6, x: 300, y: 20, rotation: 90, scale: 1, opacity: 1 },
];

describe("droneSketchAnimation", () => {
  it("uses an identity transform when no animation is present", () => {
    expect(evaluateDroneSketchAnimation(undefined, 3)).toEqual(IDENTITY_TRANSFORM);
  });

  it("interpolates values between keys and remains neutral before the first key", () => {
    expect(evaluateDroneSketchAnimation(keys, 1)).toEqual({ x: 50, y: -10, rotation: 15, scale: 1.5, opacity: 0.75 });
    expect(evaluateDroneSketchAnimation(keys, 4)).toEqual({ x: 200, y: 0, rotation: 60, scale: 1.5, opacity: 0.75 });
  });

  it("holds the last key after the animation ends and sorts input keys", () => {
    expect(evaluateDroneSketchAnimation([...keys].reverse(), 9)).toEqual(keys[1]);
  });
});
