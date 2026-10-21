import { describe, expect, it } from "vitest";
import { interpolateMapRoutePosition } from "./OpenStreetMapView";

describe("interpolateMapRoutePosition", () => {
  const route = [{ lat: 0, lng: 0 }, { lat: 0, lng: 10 }];

  it("returns the local route start, midpoint and end for the requested progress", () => {
    expect(interpolateMapRoutePosition(route, 0, 5)).toEqual(route[0]);
    const midpoint = interpolateMapRoutePosition(route, 0.5, 5);
    expect(midpoint?.lat).toBeCloseTo(0, 5);
    expect(midpoint?.lng).toBeCloseTo(5, 3);
    expect(interpolateMapRoutePosition(route, 1, 5)).toEqual(route[1]);
  });

  it("clamps progress and rejects routes that cannot be played", () => {
    expect(interpolateMapRoutePosition(route, -1, 5)).toEqual(route[0]);
    expect(interpolateMapRoutePosition(route, 2, 5)).toEqual(route[1]);
    expect(interpolateMapRoutePosition([route[0]], 0.5, 5)).toBeNull();
    expect(interpolateMapRoutePosition(route, Number.NaN, 5)).toBeNull();
  });
});
