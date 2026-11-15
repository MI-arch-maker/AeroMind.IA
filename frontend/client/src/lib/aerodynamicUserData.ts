import {
  defaultAerodynamicParameters,
  type AerodynamicParameters,
  type LocalScenario,
} from "./aerodynamicWorkspace";

export const USER_SCENARIO_SCHEMA_VERSION = 2 as const;
export const USER_SCENARIO_PROVENANCE =
  "aeromind-aerodynamics-explicit-user-input" as const;
export const aerodynamicNumericKeys = [
  "speedMps",
  "flowDirectionDeg",
  "altitudeM",
  "temperatureC",
  "pressurePa",
  "massKg",
  "wingspanM",
  "chordM",
  "taperRatio",
  "angleOfAttackDeg",
  "bankDeg",
  "cd0",
  "oswaldEfficiency",
  "clMax",
  "viscosityPaS",
  "rotorCount",
  "rotorDiameterM",
  "meshCellSizeMm",
] as const satisfies readonly (keyof AerodynamicParameters)[];

const enumValues = {
  pressureMode: ["", "isa", "manual"],
  turbulenceModel: ["", "laminar", "k-epsilon", "k-omega-sst"],
  calculationType: ["", "steady-incompressible", "transient-incompressible"],
  meshRefinement: ["", "coarse", "standard", "fine"],
} as const;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max;

/** JSON serializes empty numeric inputs (NaN) to null; revive them, never to zero. */
export function decodeUserParameters(
  value: unknown,
): AerodynamicParameters | null {
  if (!isRecord(value)) return null;
  const parameters = defaultAerodynamicParameters({}).parameters;
  const expectedKeys = Object.keys(parameters);
  if (
    Object.keys(value).length !== expectedKeys.length ||
    expectedKeys.some((key) => !(key in value))
  )
    return null;
  for (const key of aerodynamicNumericKeys) {
    const number = value[key];
    if (
      number !== null &&
      (typeof number !== "number" ||
        (!Number.isFinite(number) && !Number.isNaN(number)))
    )
      return null;
    parameters[key] = number === null ? Number.NaN : (number as number);
  }
  for (const key of Object.keys(enumValues) as (keyof typeof enumValues)[]) {
    const entry = value[key];
    if (
      typeof entry !== "string" ||
      !(enumValues[key] as readonly string[]).includes(entry)
    )
      return null;
    Object.assign(parameters, { [key]: entry });
  }
  for (const key of ["inletBoundary", "outletBoundary"] as const) {
    if (!isString(value[key], 2000)) return null;
    parameters[key] = value[key];
  }
  return parameters;
}

/** Old provenance does not distinguish cockpit/demo defaults from entered data. Do not migrate it. */
export function readUserScenarios(value: unknown): LocalScenario[] {
  if (!Array.isArray(value)) return [];
  const accepted: LocalScenario[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    if (isExplicitlySyntheticScenario(candidate)) continue;
    if (
      !isRecord(candidate) ||
      candidate.schemaVersion !== USER_SCENARIO_SCHEMA_VERSION ||
      candidate.provenance !== USER_SCENARIO_PROVENANCE
    )
      continue;
    if (
      !isString(candidate.id, 200) ||
      !candidate.id.trim() ||
      ids.has(candidate.id)
    )
      continue;
    if (!isString(candidate.name, 60) || !candidate.name.trim()) continue;
    if (
      !isString(candidate.createdAt, 40) ||
      !Number.isFinite(Date.parse(candidate.createdAt))
    )
      continue;
    if (
      !["", "fixed-wing", "multirotor", "vtol"].includes(
        candidate.airframe as string,
      )
    )
      continue;
    const parameters = decodeUserParameters(candidate.parameters);
    if (
      !parameters ||
      !hasUserInputs(
        candidate.airframe as LocalScenario["airframe"],
        parameters,
      )
    )
      continue;
    accepted.push({
      id: candidate.id,
      name: candidate.name,
      createdAt: candidate.createdAt,
      airframe: candidate.airframe as LocalScenario["airframe"],
      parameters,
      schemaVersion: USER_SCENARIO_SCHEMA_VERSION,
      provenance: USER_SCENARIO_PROVENANCE,
    });
    ids.add(candidate.id);
  }
  return accepted;
}

export function hasUserInputs(
  airframe: LocalScenario["airframe"],
  parameters: AerodynamicParameters,
): boolean {
  return (
    airframe !== "" ||
    Object.values(parameters).some((value) =>
      typeof value === "number" ? Number.isFinite(value) : value !== "",
    )
  );
}

export function createUserScenario(input: {
  name: string;
  airframe: LocalScenario["airframe"];
  parameters: AerodynamicParameters;
}): LocalScenario | null {
  const name = input.name.trim().slice(0, 60);
  const parameters = decodeUserParameters(input.parameters);
  if (
    !name ||
    !parameters ||
    !["", "fixed-wing", "multirotor", "vtol"].includes(input.airframe) ||
    !hasUserInputs(input.airframe, parameters)
  )
    return null;
  return {
    id: `scenario-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`,
    name,
    airframe: input.airframe,
    parameters,
    createdAt: new Date().toISOString(),
    schemaVersion: USER_SCENARIO_SCHEMA_VERSION,
    provenance: USER_SCENARIO_PROVENANCE,
  };
}

/** Purge known synthetic analytical history only. Other records stay untouched in storage,
 * but are not displayed/exported: this workspace has no verified CFD ingestion contract.
 */
export function removeLegacyAnalyticHistory(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.filter((record) => {
    if (!isRecord(record)) return true;
    const performance = isRecord(record.performance)
      ? record.performance
      : null;
    return (
      record.status !== "ANALYTIC ESTIMATE" &&
      !(
        typeof record.solver === "string" &&
        record.solver.startsWith("ANALYTIC MODEL")
      ) &&
      !(typeof record.id === "string" && record.id.startsWith("AERO-EST-")) &&
      performance?.sourceLabel !== "MODÈLE ANALYTIQUE SIMPLIFIÉ"
    );
  });
}

export const AERODYNAMIC_LEGACY_REVIEW_KEY =
  "aeromind-legacy-user-scenarios-review-v1";

/** Only explicit metadata proves a legacy scenario synthetic; a name or numeric value does not. */
export function isExplicitlySyntheticScenario(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    value.isDemonstration === true ||
    value.demo === true ||
    value.synthetic === true
  )
    return true;
  return [value.provenance, value.sourceType, value.origin].some(
    (marker) =>
      typeof marker === "string" &&
      /(^|[-_\s])(demo|demonstration|synthetic)([-_\s]|$)/i.test(marker),
  );
}

/** Preserve original payloads for review, not as active scenarios or verified data. */
export function partitionUserScenarios(value: unknown): {
  active: LocalScenario[];
  quarantine: unknown[];
} {
  const entries = Array.isArray(value) ? value : value == null ? [] : [value];
  const active: LocalScenario[] = [];
  const quarantine: unknown[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    if (isExplicitlySyntheticScenario(entry)) continue;
    const [accepted] = readUserScenarios([entry]);
    if (accepted && !ids.has(accepted.id)) {
      active.push(accepted);
      ids.add(accepted.id);
    } else quarantine.push(entry);
  }
  return { active, quarantine };
}

/** The caller must invoke this successfully BEFORE replacing the active storage key.
 * If storage is full/unavailable or the old quarantine is corrupt, throw and do not overwrite.
 */
export function quarantineLegacyUserScenarios(
  storage: Pick<Storage, "getItem" | "setItem">,
  source: unknown,
): number {
  const { quarantine } = partitionUserScenarios(source);
  if (!quarantine.length) return 0;
  const existingRaw = storage.getItem(AERODYNAMIC_LEGACY_REVIEW_KEY);
  const existing: unknown = existingRaw === null ? [] : JSON.parse(existingRaw);
  if (!Array.isArray(existing))
    throw new Error(
      "Quarantaine locale illisible; données actives conservées.",
    );
  const retained = [...existing];
  const fingerprints = new Set(retained.map((entry) => JSON.stringify(entry)));
  for (const entry of quarantine) {
    const fingerprint = JSON.stringify(entry);
    if (!fingerprints.has(fingerprint)) {
      retained.push(entry);
      fingerprints.add(fingerprint);
    }
  }
  storage.setItem(AERODYNAMIC_LEGACY_REVIEW_KEY, JSON.stringify(retained));
  return quarantine.length;
}
