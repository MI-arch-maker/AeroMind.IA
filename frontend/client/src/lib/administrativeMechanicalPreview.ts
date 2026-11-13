import type { ConceptConfig } from "./aeroEngine";
import { droneCatalog, type DroneCatalogDesign } from "./droneCatalog";
import { buildMechanicalModel, type MechanicalModel } from "./mechanicalTwinGeometry";

type RecordValue = Record<string, unknown>;

export type AdministrativeMechanicalResolution = {
  design: DroneCatalogDesign;
  model: MechanicalModel;
  displayName: string;
};

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Resolve only an explicit persisted design/configuration. No catalogue-first or
 * fallback model is allowed when project identity or geometry is incomplete.
 */
export function resolveAdministrativeMechanicalPreview(
  rawConfiguration: unknown,
): AdministrativeMechanicalResolution | null {
  if (!isRecord(rawConfiguration)) return null;

  const configuration = rawConfiguration;
  const twin = isRecord(configuration.mechanicalTwin)
    ? configuration.mechanicalTwin
    : null;
  const explicitDesignId = [configuration.designId, configuration.platformProfile, twin?.designId]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)
    ?.trim();
  const airframe = typeof configuration.airframe === "string"
    ? configuration.airframe
    : undefined;
  const modelType = typeof configuration.modelType === "string"
    ? configuration.modelType
    : undefined;

  const architectureMatches = airframe && modelType
    ? droneCatalog.filter((candidate) => candidate.key === airframe && candidate.modelType === modelType)
    : [];
  const design = explicitDesignId
    ? droneCatalog.find((candidate) => candidate.id === explicitDesignId)
    : architectureMatches.length === 1 ? architectureMatches[0] : undefined;
  if (!design) return null;
  if (airframe && design.key !== airframe) return null;
  if (modelType && design.modelType !== modelType) return null;

  // The mechanical builder has useful catalogue defaults for the engineering
  // studio, but an administrative preview must not invent missing dimensions.
  if (![configuration.wingspan, configuration.chord, configuration.fuselageLength].every(positiveFinite)) {
    return null;
  }

  const model = buildMechanicalModel(design, configuration as unknown as ConceptConfig);
  const requestedName = typeof configuration.designName === "string"
    ? configuration.designName.trim().slice(0, 100)
    : "";
  return {
    design,
    model,
    displayName: requestedName || design.label,
  };
}
