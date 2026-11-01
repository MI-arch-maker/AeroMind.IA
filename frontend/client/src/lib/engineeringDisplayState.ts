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
  wingAreaBasis: "rectangular-planform-estimate" | "unavailable";
  wingAreaExplanation: string;
  aspectRatio: number | null;
  aspectRatioBasis: "simple-geometric-estimate" | "unavailable";
  aspectRatioExplanation: string;
  emptyMassKg: number | null;
  massBasis: "rough-preview-proxy" | "unavailable";
  massExplanation: string;
} {
  const positive = (value: number | undefined) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  const span = positive(vars.wingspan);
  const chord = positive(vars.chord);
  const length = positive(vars.length);
  const thickness = positive(vars.max_thickness);
  const rawWingArea = span !== null && chord !== null ? span * chord : null;
  const wingArea = rawWingArea !== null && Number.isFinite(rawWingArea) ? rawWingArea : null;
  const rawAspectRatio = span !== null && chord !== null ? span / chord : null;
  const aspectRatio = rawAspectRatio !== null && Number.isFinite(rawAspectRatio) ? rawAspectRatio : null;
  const rawEmptyMassKg = span !== null && length !== null && thickness !== null
    ? 0.5 * length * span * thickness * 10
    : null;
  const emptyMassKg = rawEmptyMassKg !== null && Number.isFinite(rawEmptyMassKg) ? rawEmptyMassKg : null;

  return {
    wingArea,
    wingAreaBasis: wingArea === null ? "unavailable" : "rectangular-planform-estimate",
    wingAreaExplanation: wingArea === null
      ? "Indisponible : span et chord doivent produire une valeur finie positive."
      : "Estimation du planform rectangulaire span × chord; ne modélise ni effilement, ni flèche, ni découpes.",
    aspectRatio,
    aspectRatioBasis: aspectRatio === null ? "unavailable" : "simple-geometric-estimate",
    aspectRatioExplanation: aspectRatio === null
      ? "Indisponible : span et chord doivent produire un rapport fini."
      : "Estimation géométrique simple span ÷ chord; ne tient pas compte de la forme réelle de l’aile.",
    emptyMassKg,
    massBasis: emptyMassKg === null ? "unavailable" : "rough-preview-proxy",
    massExplanation: emptyMassKg === null
      ? "Indisponible : length, span et max_thickness doivent produire une valeur finie positive."
      : "Proxy historique de prévisualisation : 0,5 × length × span × max_thickness × 10. Hypothèse empirique non validée, sans matériaux, équipements ni structure détaillée; valeur non mesurée.",
  };
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
