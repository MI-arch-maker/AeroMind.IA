import { describe, expect, it } from "vitest";
import { optimizeMissionRoute, type GeoPoint } from "./missionRouteOptimizer";

const route: GeoPoint[] = [{ lat: 48.85, lng: 2.34 }, { lat: 48.85, lng: 2.36 }];
const obstacle = { lat: 48.85, lng: 2.35, radiusM: 100, label: "test" };

describe("optimizeMissionRoute", () => {
  it("keeps an unobstructed route unchanged", () => {
    const result = optimizeMissionRoute(route, []);
    expect(result.feasible).toBe(true);
    if (result.feasible) expect(result.points).toEqual(route);
  });
  it("routes around a circle with configured clearance", () => {
    const result = optimizeMissionRoute(route, [obstacle], { clearanceM: 25 });
    expect(result.feasible).toBe(true);
    if (result.feasible) {
      expect(result.points.length).toBeGreaterThan(2);
      expect(result.points[0]).toEqual(route[0]);
      expect(result.points.at(-1)).toEqual(route[1]);
      for (let i = 1; i < result.points.length; i++) {
        const a = result.points[i - 1], b = result.points[i];
        const x = (lng: number) => (lng - obstacle.lng) * 111_000 * Math.cos(obstacle.lat * Math.PI / 180);
        const y = (lat: number) => (lat - obstacle.lat) * 111_000;
        const ax = x(a.lng), ay = y(a.lat), bx = x(b.lng), by = y(b.lat);
        const t = Math.max(0, Math.min(1, (-(ax * (bx - ax) + ay * (by - ay)))/((bx - ax) ** 2 + (by - ay) ** 2)));
        expect(Math.hypot(ax + t * (bx - ax), ay + t * (by - ay))).toBeGreaterThanOrEqual(obstacle.radiusM + 25 - 0.5);
      }
    }
  });
  it("is deterministic", () => {
    expect(optimizeMissionRoute(route, [obstacle], { clearanceM: 25 })).toEqual(optimizeMissionRoute(route, [obstacle], { clearanceM: 25 }));
  });
  it("reports a waypoint inside an obstacle as infeasible", () => {
    expect(optimizeMissionRoute([route[0], obstacle, route[1]], [obstacle])).toMatchObject({ feasible: false, points: [] });
  });
  it("reports an infeasible segment when obstacles enclose the corridor", () => {
    const center = route[1];
    const ring = Array.from({ length: 12 }, (_, i) => {
      const angle = 2 * Math.PI * i / 12;
      return { lat: center.lat + Math.sin(angle) * 0.00135, lng: center.lng + Math.cos(angle) * 0.00135 / Math.cos(center.lat * Math.PI / 180), radiusM: 95 };
    });
    const result = optimizeMissionRoute(route, ring, { clearanceM: 5 });
    expect(result.feasible).toBe(false);
    if (!result.feasible) expect(result.reason).toMatch(/aucun détour sûr/i);
  });
  it("preserves the endpoints and order of all original route points", () => {
    const points = [route[0], { lat: 48.851, lng: 2.36 }, { lat: 48.849, lng: 2.37 }];
    const result = optimizeMissionRoute(points, [obstacle]);
    expect(result.feasible).toBe(true);
    if (result.feasible) {
      expect(result.points[0]).toEqual(points[0]);
      expect(result.points.at(-1)).toEqual(points.at(-1));
      let previous = -1;
      for (const original of points) {
        const index = result.points.findIndex((p, i) => i > previous && Math.abs(p.lat - original.lat) < 1e-9 && Math.abs(p.lng - original.lng) < 1e-9);
        expect(index).toBeGreaterThan(previous);
        previous = index;
      }
    }
  });
});
