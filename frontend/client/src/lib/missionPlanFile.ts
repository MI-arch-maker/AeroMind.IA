import type { LocalMissionPlan, MissionWaypoint } from "./aeroEngine";

const MAX_WAYPOINTS = 64;
const MAX_ROUTE_FILE_CHARS = 128_000;
const ACTIONS = new Set<MissionWaypoint["action"]>([
  "inspection",
  "turn",
  "return",
]);
const LINK_ACTIONS = new Set<LocalMissionPlan["lostLinkAction"]>([
  "return",
  "hold",
  "land",
]);

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedNumber(
  value: unknown,
  label: string,
  min: number,
  max: number
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`${label} doit être un nombre entre ${min} et ${max}.`);
  }
  return value;
}

function shortText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`${label} doit contenir 1 à ${maxLength} caractères.`);
  }
  return value.trim();
}

/**
 * Parse un plan JSON local AeroMind.
 * Formats acceptés : LocalMissionPlan brut (format export actuel) ou enveloppe
 * aeromind-local-mission-plan-v1 contenant une propriété missionPlan.
 */
export function parseLocalMissionPlanJson(text: string): LocalMissionPlan {
  if (text.length > MAX_ROUTE_FILE_CHARS) {
    throw new Error("Le fichier dépasse la limite de 128 ko.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Le fichier n’est pas un JSON valide.");
  }
  if (!isRecord(parsed)) {
    throw new Error("Le JSON doit contenir un objet de parcours.");
  }

  let source: unknown = parsed;
  if (parsed.schema !== undefined) {
    if (parsed.schema !== "aeromind-local-mission-plan-v1") {
      throw new Error("Version de schéma de parcours non prise en charge.");
    }
    source = parsed.missionPlan;
  } else if (parsed.missionPlan !== undefined) {
    source = parsed.missionPlan;
  }
  if (!isRecord(source)) {
    throw new Error("La propriété missionPlan doit contenir un objet JSON.");
  }

  const radiusKm = boundedNumber(source.radiusKm, "radiusKm", 1, 80);
  const returnAltitudeM = boundedNumber(
    source.returnAltitudeM,
    "returnAltitudeM",
    0,
    10_000
  );
  if (
    typeof source.lostLinkAction !== "string" ||
    !LINK_ACTIONS.has(source.lostLinkAction as LocalMissionPlan["lostLinkAction"])
  ) {
    throw new Error("lostLinkAction doit valoir return, hold ou land.");
  }
  const homeX = boundedNumber(source.homeX, "homeX", 0, 100);
  const homeY = boundedNumber(source.homeY, "homeY", 0, 100);
  if (!Array.isArray(source.waypoints)) {
    throw new Error("waypoints doit être une liste de points de passage.");
  }
  if (source.waypoints.length < 2 || source.waypoints.length > MAX_WAYPOINTS) {
    throw new Error(`Le parcours doit contenir de 2 à ${MAX_WAYPOINTS} points.`);
  }

  const ids = new Set<string>();
  const waypoints = source.waypoints.map((entry, index): MissionWaypoint => {
    const label = `Point ${index + 1}`;
    if (!isRecord(entry)) {
      throw new Error(`${label} doit être un objet JSON.`);
    }
    const id = shortText(entry.id, `${label} · id`, 64);
    if (ids.has(id)) throw new Error(`L’identifiant ${id} est dupliqué.`);
    ids.add(id);
    if (
      typeof entry.action !== "string" ||
      !ACTIONS.has(entry.action as MissionWaypoint["action"])
    ) {
      throw new Error(`${label} · action doit valoir inspection, turn ou return.`);
    }
    return {
      id,
      name: shortText(entry.name, `${label} · name`, 100),
      x: boundedNumber(entry.x, `${label} · x`, 0, 100),
      y: boundedNumber(entry.y, `${label} · y`, 0, 100),
      altitudeM: boundedNumber(entry.altitudeM, `${label} · altitudeM`, 0, 10_000),
      speedKmh: boundedNumber(entry.speedKmh, `${label} · speedKmh`, 0.1, 300),
      action: entry.action as MissionWaypoint["action"],
    };
  });

  const profileId =
    source.profileId === undefined
      ? undefined
      : shortText(source.profileId, "profileId", 80);
  const operationName =
    source.operationName === undefined
      ? undefined
      : shortText(source.operationName, "operationName", 120);

  return {
    ...(operationName ? { operationName } : {}),
    ...(profileId ? { profileId } : {}),
    radiusKm,
    returnAltitudeM,
    lostLinkAction: source.lostLinkAction as LocalMissionPlan["lostLinkAction"],
    homeX,
    homeY,
    waypoints,
  };
}
