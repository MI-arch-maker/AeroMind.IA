import { describe, expect, it } from "vitest";
import {
  estimateFlightTestBatteryPercent,
  hasSynchronizedMissionRoute,
  projectFlightTestPoint,
} from "./flightTestSync";

describe("synchronisation de la station d’ingénierie de vol", () => {
  it("ne signale un plan mission synchronisé qu’avec au moins deux waypoints", () => {
    expect(hasSynchronizedMissionRoute(undefined)).toBe(false);
    expect(hasSynchronizedMissionRoute([])).toBe(false);
    expect(hasSynchronizedMissionRoute([{}])).toBe(false);
    expect(hasSynchronizedMissionRoute([{}, {}])).toBe(true);
  });

  it("projette fidèlement les axes normalisés et fait varier la coordonnée Z avec l’altitude", () => {
    const low = projectFlightTestPoint({ x: 20, y: 30, altitudeM: 25 }, 100);
    const high = projectFlightTestPoint({ x: 20, y: 30, altitudeM: 75 }, 100);
    expect(low.x).toBe(high.x);
    expect(low.y - high.y).toBeCloseTo(9);
    expect(projectFlightTestPoint({ x: 20, y: 30, altitudeM: 0 }, 100)).toEqual({ x: 28.2, y: 70.6 });
  });

  it("ne présente pas une capacité absente comme une batterie vide", () => {
    expect(estimateFlightTestBatteryPercent(0, 0, 0.5)).toBeNull();
    expect(estimateFlightTestBatteryPercent(80, 100, 0)).toBe(80);
    expect(estimateFlightTestBatteryPercent(80, 100, 1)).toBe(62);
    expect(estimateFlightTestBatteryPercent(150, 100, 0)).toBe(100);
  });
});
