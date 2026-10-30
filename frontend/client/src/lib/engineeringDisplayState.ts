import type { ConceptConfig } from "./aeroEngine";

export type ParametricVariables = Record<string, number>;

export const PARAMETRIC_PREVIEW_DEFAULTS: ParametricVariables = {
  length: 10,
  wingspan: 15,
  sweep: 60,
  dihedral: 0,
  max_thickness: 0.3,
  chord: 3,
  thickness_ratio: 0.1,
  winglet_angle: 45,
  motor_count: 4,
  cruise_speed: 20,
  altitude: 100,
  fuse_sec3_top: 1.7,
};

function within(value: number | undefined, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;
}

/**
 * No-project mode is an explicitly local CAD preview, not a project or saved drone.
 * For an existing but incomplete project, invalid/missing dimensions use preview defaults
 * in the viewport until the user edits or commits them; no values are written implicitly.
 */
export function resolveParametricVariables(config: ConceptConfig, hasProject: boolean): ParametricVariables {
  const values = { ...PARAMETRIC_PREVIEW_DEFAULTS };
  if (!hasProject) return values;
  values.length = within(config.fuselageLength, 5, 15, values.length);
  values.wingspan = within(config.wingspan, 10, 15, values.wingspan);
  values.chord = within(config.chord, 1, 5, values.chord);
  values.motor_count = within(config.motorCount, 1, 8, values.motor_count);
  values.cruise_speed = within(config.cruiseSpeedKmh, 5, 650, values.cruise_speed);
  values.altitude = within(config.altitudeM, 10, 6000, values.altitude);
  return values;
}

export function calculateParametricMetrics(vars: ParametricVariables): {
  wingArea: number | null;
  aspectRatio: number | null;
  emptyMassKg: number | null;
} {
  const positive = (value: number | undefined) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  const span = positive(vars.wingspan);
  const chord = positive(vars.chord);
  const length = positive(vars.length);
  const thickness = positive(vars.max_thickness);
  const wingArea = span !== null && chord !== null ? span * chord : null;
  const aspectRatio = span !== null && wingArea !== null && wingArea > 0
    ? (span * span) / wingArea
    : null;
  const emptyMassKg = span !== null && length !== null && thickness !== null
    ? 0.5 * length * span * thickness * 10
    : null;
  return { wingArea, aspectRatio, emptyMassKg };
}

/** A simulation result is available only for a selected project with a defined cell and energy source. */
export function hasSimulationSource(config: ConceptConfig, hasProject: boolean): boolean {
  return hasProject
    && typeof config.airframe === "string"
    && config.airframe.length > 0
    && Number.isFinite(config.motorCount)
    && (config.motorCount ?? 0) > 0
    && Number.isFinite(config.batteryWh)
    && config.batteryWh > 0
    && Number.isFinite(config.wingspan)
    && config.wingspan > 0
    && Number.isFinite(config.chord)
    && config.chord > 0
    && Number.isFinite(config.fuselageLength)
    && config.fuselageLength > 0;
}
