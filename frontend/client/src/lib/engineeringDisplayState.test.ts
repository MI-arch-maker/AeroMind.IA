import { describe, expect, it } from "vitest";
import type { ConceptConfig } from "./aeroEngine";
import {
  calculateParametricMetrics,
  hasSimulationSource,
  PARAMETRIC_PREVIEW_DEFAULTS,
  resolveParametricVariables,
} from "./engineeringDisplayState";

const emptyConfig = {
  wingspan: 0,
  chord: 0,
  fuselageLength: 0,
  batteryWh: 0,
  airframe: undefined,
  motorCount: undefined,
  cruiseSpeedKmh: 0,
  altitudeM: 0,
} as ConceptConfig;

describe("engineering display state", () => {
  it("uses a local CAD preview without creating or hydrating a project", () => {
    const variables = resolveParametricVariables(emptyConfig, false);
    expect(variables).toEqual(PARAMETRIC_PREVIEW_DEFAULTS);
    expect(calculateParametricMetrics(variables)).toEqual({
      wingArea: 45,
      aspectRatio: 5,
      emptyMassKg: 225,
    });
  });

  it("keeps metrics finite when an active project has zero geometry", () => {
    const metrics = calculateParametricMetrics({ wingspan: 0, chord: 0, length: 0, max_thickness: 0 });
    expect(metrics.wingArea).toBeNull();
    expect(metrics.aspectRatio).toBeNull();
    expect(metrics.emptyMassKg).toBeNull();
    expect(JSON.stringify(metrics)).not.toContain("NaN");
  });

  it("hydrates only valid, in-range project parameters", () => {
    const config = {
      ...emptyConfig,
      wingspan: 12,
      fuselageLength: 8,
      motorCount: 6,
      cruiseSpeedKmh: 550,
      altitudeM: 1200,
    } as ConceptConfig;
    const variables = resolveParametricVariables(config, true);
    expect(variables.wingspan).toBe(12);
    expect(variables.length).toBe(8);
    expect(variables.motor_count).toBe(6);
    expect(variables.cruise_speed).toBe(550);
    expect(variables.altitude).toBe(1200);
    expect(variables.chord).toBe(PARAMETRIC_PREVIEW_DEFAULTS.chord);
  });

  it("does not expose simulation results without a configured project source", () => {
    expect(hasSimulationSource(emptyConfig, false)).toBe(false);
    expect(hasSimulationSource(emptyConfig, true)).toBe(false);
    const configured = {
      ...emptyConfig,
      airframe: "multirotor",
      motorCount: 4,
      batteryWh: 1200,
      wingspan: 2.4,
      chord: 0.5,
      fuselageLength: 1.2,
    } as ConceptConfig;
    expect(hasSimulationSource(configured, true)).toBe(true);
    expect(hasSimulationSource(configured, false)).toBe(false);
  });
});
