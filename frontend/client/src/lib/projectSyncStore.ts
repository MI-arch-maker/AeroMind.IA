import { z } from "zod";

export const PROJECT_SCHEMA_VERSION = 2 as const;
export const PROJECT_STORAGE_KEY = "aeromind-blank-workspace-v3";

const jsonObject = z.record(z.string(), z.unknown());
const mechanicalVector = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
export const mechanicalSettingsSchema = z.object({
  designId: z.string().min(1),
  fuselageWidth: z.number().finite().positive().optional(),
  fuselageHeight: z.number().finite().positive().optional(),
  sweepDeg: z.number().finite().optional(),
  dihedralDeg: z.number().finite().optional(),
  gearHeight: z.number().finite().positive().optional(),
  shellColor: z.string().optional(),
  finish: z.enum(["titanium", "carbon", "ceramic"]).optional(),
  edits: z
    .record(
      z.string(),
      z.object({
        name: z.string().optional(),
        color: z.string().optional(),
        hidden: z.boolean().optional(),
        offset: mechanicalVector.optional(),
        rotation: mechanicalVector.optional(),
        scale: mechanicalVector.optional(),
      }),
    )
    .optional(),
  extraParts: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        kind: z.enum(["box", "cylinder"]),
        size: mechanicalVector,
        position: mechanicalVector,
        color: z.string(),
      }),
    )
    .optional(),
});
const conceptConfigSchema = z
  .object({
    wingspan: z.number().finite(),
    chord: z.number().finite(),
    fuselageLength: z.number().finite(),
    propDiameter: z.number().finite(),
    batteryWh: z.number().finite(),
    payloadKg: z.number().finite(),
    cruiseSpeedKmh: z.number().finite().max(650),
    windSpeedKmh: z.number().finite(),
    reserveFraction: z.number().finite(),
    maxTakeoffKg: z.number().finite(),
    altitudeM: z.number().finite(),
    airframe: z.string().optional(),
    modelType: z.string().optional(),
    motorCount: z.number().finite().optional(),
    designName: z.string().optional(),
    renderMode: z.enum(["R1", "R2", "R3", "R4", "R5", "R6"]).optional(),
    renderTheme: z.enum(["studio-pro", "avionics-hud", "blueprint"]).optional(),
    renderLayout: z.enum(["immersive", "cad", "operational"]).optional(),
    renderUpdatedAt: z.string().optional(),
    renderStatus: z.enum(["LOCAL", "SERVER-ACK", "ERROR"]).optional(),
    renderSchemaVersion: z.number().finite().optional(),
    renderVariants: z.array(jsonObject).optional(),
    constructionMassKg: z.number().finite().optional(),
    flightControls: jsonObject.optional(),
    missionPlan: jsonObject.optional(),
    missionEnvironment: jsonObject.optional(),
    designEvolutionStage: z.number().int().min(0).max(4).optional(),
    mechanicalTwin: mechanicalSettingsSchema.optional(),
    mechanicalTwins: z.record(z.string(), mechanicalSettingsSchema).optional(),
    installedMaterials: z.array(jsonObject).optional(),
    engineeringSelection: z
      .object({
        source: z.enum(["catalog", "industrial", "custom"]),
        droneId: z.string().min(1),
        droneLabel: z.string().min(1),
        materialId: z.string().optional(),
        materialLabel: z.string().optional(),
        materialSource: z.string().optional(),
        updatedAt: z.string().min(1),
      })
      .optional(),
    studioLayers: z.array(z.string()).optional(),
    studioLayerSettings: z
      .record(
        z.string(),
        z.object({
          visible: z.boolean(),
          locked: z.boolean(),
          opacity: z.number().finite().min(0).max(100).optional(),
          blendMode: z.enum(["normal", "multiply", "screen", "overlay", "darken", "lighten"]).optional(),
          exposureEV: z.number().finite().min(-3).max(3).optional(),
          contrast: z.number().finite().min(0).max(200).optional(),
          saturation: z.number().finite().min(0).max(200).optional(),
        }),
      )
      .optional(),
    activeStudioLayer: z.string().optional(),
    platformProfile: z.string().optional(),
    aeronauticalRole: z.string().optional(),
    integratedEquipmentIds: z.array(z.string()).optional(),
    materialFamily: z.string().optional(),
    jointType: z.string().optional(),
    payloadIntegration: z.string().optional(),
    motorPosition: z.string().optional(),
    symmetric: z.boolean().optional(),
    missionBrief: z.string().optional(),
    customSketch: z
      .object({
        version: z.literal(1),
        modifiedAt: z.string(),
        strokes: z.array(
          z.object({
            id: z.string().min(1),
            tool: z.enum([
              "freehand",
              "line",
              "rectangle",
              "ellipse",
              "wing",
              "fuselage",
              "tail",
              "payload",
              "measure",
              "annotation",
            ]),
            color: z.string().min(1),
            width: z.number().finite().positive(),
            layer: z.string().optional(),
            label: z.string().optional(),
            fill: z.string().optional(),
            fillSecondary: z.string().optional(),
            opacity: z.number().finite().min(0).max(1).optional(),
            rotation: z.number().finite().optional(),
            scale: z.number().finite().positive().optional(),
            component: z.enum(["parametric", "freeform"]).optional(),
            parameters: z
              .object({
                span: z.number().finite().optional(),
                length: z.number().finite().optional(),
                diameter: z.number().finite().optional(),
                thickness: z.number().finite().optional(),
              })
              .optional(),
            keyframes: z.array(z.object({
              time: z.number().finite().min(0).max(60),
              x: z.number().finite(),
              y: z.number().finite(),
              rotation: z.number().finite(),
              scale: z.number().finite().positive(),
              opacity: z.number().finite().min(0).max(1),
            })).optional(),
            points: z
              .array(
                z.object({ x: z.number().finite(), y: z.number().finite() }),
              )
              .min(1),
          }),
        ),
      })
      .optional(),
  })
  .passthrough();

const projectStateSchema = z
  .object({
    name: z.string(),
    mission: z.string(),
    status: z.string(),
    version: z.string(),
    owner: z.string(),
    lastUpdated: z.string(),
  })
  .passthrough();

export const projectRecordSchema = z.object({
  id: z.string().min(1),
  project: projectStateSchema,
  requirements: z.array(jsonObject),
  config: conceptConfigSchema,
  runId: z.string(),
});

export const projectWorkspaceSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
    updatedAt: z.string(),
    source: z.enum(["LOCAL", "SERVER-ACK"]),
    syncStatus: z.enum(["LOCAL", "SERVER-ACK", "PENDING SYNC", "ERROR"]),
    physicalOutputEnabled: z.literal(false),
    id: z.string().min(1),
    project: projectStateSchema,
    requirements: z.array(jsonObject),
    config: conceptConfigSchema,
    runId: z.string(),
    projects: z.array(projectRecordSchema),
    activeProjectId: z.string(),
  })
  .passthrough();

export type ProjectWorkspace = z.infer<typeof projectWorkspaceSchema>;

export type WorkspaceValidation =
  | { ok: true; value: ProjectWorkspace; migrated: boolean }
  | { ok: false; message: string; issues: string[] };

export function createWorkspaceSnapshot(input: {
  id: string;
  project: unknown;
  requirements: unknown;
  config: unknown;
  runId: string;
  projects: unknown;
  activeProjectId: string;
  source?: "LOCAL" | "SERVER-ACK";
  syncStatus?: "LOCAL" | "SERVER-ACK" | "PENDING SYNC" | "ERROR";
  updatedAt?: string;
}): ProjectWorkspace {
  const candidate = {
    ...input,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    source: input.source ?? "LOCAL",
    syncStatus: input.syncStatus ?? "LOCAL",
    physicalOutputEnabled: false as const,
  };
  return projectWorkspaceSchema.parse(candidate);
}

export function validateWorkspace(raw: unknown): WorkspaceValidation {
  const parsed = projectWorkspaceSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data, migrated: false };

  // Migration contrôlée de l’ancien snapshot v3 : on ajoute uniquement les
  // métadonnées de synchronisation, sans remplacer les données par du vide.
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const legacy = raw as Record<string, unknown>;
    if (
      Array.isArray(legacy.projects) &&
      typeof legacy.activeProjectId === "string" &&
      !("physicalOutputEnabled" in legacy)
    ) {
      const migrated = projectWorkspaceSchema.safeParse({
        ...legacy,
        schemaVersion: PROJECT_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        source: "LOCAL",
        syncStatus: "LOCAL",
        physicalOutputEnabled: false,
      });
      if (migrated.success)
        return { ok: true, value: migrated.data, migrated: true };
    }
  }

  const issues = parsed.error.issues.map(
    (issue) => `${issue.path.join(".") || "workspace"}: ${issue.message}`,
  );
  return {
    ok: false,
    message: "Données de workspace incompatibles avec le schéma AeroMind v2.",
    issues,
  };
}

export function readWorkspaceStorage(
  storage: Storage = window.localStorage,
): WorkspaceValidation | null {
  const raw = storage.getItem(PROJECT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return validateWorkspace(JSON.parse(raw));
  } catch {
    return {
      ok: false,
      message: "Le workspace local est illisible.",
      issues: ["JSON invalide"],
    };
  }
}

export function writeWorkspaceStorage(
  workspace: ProjectWorkspace,
  storage: Storage = window.localStorage,
): void {
  storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(workspace));
}
