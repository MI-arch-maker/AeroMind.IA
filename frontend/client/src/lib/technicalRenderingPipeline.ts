import { transformedPartVertices, type MechanicalModel, type Vec3 } from "./mechanicalTwinGeometry";

export const technicalRenderPresets = [
  "solid",
  "blueprint",
  "wireframe",
  "xray",
  "exploded",
  "monochrome",
] as const;

export type TechnicalRenderPreset = (typeof technicalRenderPresets)[number];
export type TechnicalRenderSource = "catalog" | "mechanical-twin" | "design" | "unknown";
export type TechnicalRenderStatus = "ready" | "partial" | "unavailable" | "incomplete" | "unsynced";

export type TechnicalRenderPresetOption = {
  id: TechnicalRenderPreset;
  label: string;
  engineId: string;
  description: string;
};

export const technicalRenderPresetOptions: TechnicalRenderPresetOption[] = [
  { id: "solid", label: "Solide paramétrique", engineId: "solid", description: "Surfaces opaques classiques sur la géométrie active." },
  { id: "blueprint", label: "Blueprint", engineId: "blueprint", description: "Maillage filaire cyan sur grille et projection parallèle de la vue choisie." },
  { id: "wireframe", label: "Wireframe", engineId: "mesh-wire", description: "Arêtes du maillage indexé du modèle sélectionné." },
  { id: "xray", label: "X-Ray / structure interne", engineId: "xray", description: "Surfaces translucides et composants internes disponibles." },
  { id: "exploded", label: "Vue éclatée", engineId: "exploded", description: "Sous-ensembles espacés pour inspection, sans changer le modèle." },
  { id: "monochrome", label: "Vue technique monochrome", engineId: "clay", description: "Rendu de revue et d’impression technique." },
];

export type TechnicalRenderContext = {
  droneId: string;
  modelId: string;
  modelVersion: string;
  source: TechnicalRenderSource;
  syncStatus: TechnicalRenderStatus;
  statusLabel: string;
  statusMessage: string;
  centreContext: string;
  mechanicalModel: MechanicalModel;
  activeParameters: {
    spanM: number;
    lengthM: number;
    heightM: number;
    motorCount: number;
    componentCount: number;
  };
};

export type TechnicalRenderContextOverrides = Partial<Pick<
  TechnicalRenderContext,
  "droneId" | "modelId" | "modelVersion" | "source" | "syncStatus" | "centreContext"
>>;

function inferSource(model: MechanicalModel): TechnicalRenderSource {
  const value = `${model.modelType} ${model.designId}`.toLowerCase();
  if (value.includes("catalog")) return "catalog";
  if (value.includes("dessin") || value.includes("sketch") || value.includes("custom")) return "design";
  if (model.parts.length) return "mechanical-twin";
  return "unknown";
}

function detectStatus(model: MechanicalModel): TechnicalRenderStatus {
  if (!model.parts.length) return "unavailable";
  if (model.parts.some((part) => part.vertices.length < 9 || part.indices.length < 3)) return "partial";
  if (!model.designId || !model.name || !Number.isFinite(model.span) || !Number.isFinite(model.length)) return "incomplete";
  return "ready";
}

function statusCopy(status: TechnicalRenderStatus) {
  switch (status) {
    case "ready": return ["Modèle synchronisé", "Géométrie technique active et exploitable."] as const;
    case "partial": return ["Géométrie partielle", "Certains composants ne disposent pas d’un maillage complet."] as const;
    case "unavailable": return ["Modèle technique détaillé indisponible", "Aucune géométrie mécanique détaillée n’est disponible pour ce drone."] as const;
    case "incomplete": return ["Données paramétriques incomplètes", "Le rendu est limité tant que les identifiants ou dimensions requis ne sont pas résolus."] as const;
    case "unsynced": return ["Modèle non synchronisé", "La version affichée doit être réconciliée avec le projet avant une revue définitive."] as const;
  }
}

export function createTechnicalRenderContext(
  model: MechanicalModel,
  overrides: TechnicalRenderContextOverrides = {},
): TechnicalRenderContext {
  const detectedStatus = detectStatus(model);
  const syncStatus = overrides.syncStatus ?? detectedStatus;
  const [statusLabel, statusMessage] = statusCopy(syncStatus);
  const motorCount = model.parts.filter((part) => /motor|moteur|rotor|propeller|hélice/i.test(`${part.category} ${part.id} ${part.name}`)).length;
  return {
    droneId: overrides.droneId ?? model.designId,
    modelId: overrides.modelId ?? model.designId,
    modelVersion: overrides.modelVersion ?? "local-active",
    source: overrides.source ?? inferSource(model),
    syncStatus,
    statusLabel,
    statusMessage,
    centreContext: overrides.centreContext ?? "AeroMind",
    mechanicalModel: model,
    activeParameters: {
      spanM: model.span,
      lengthM: model.length,
      heightM: Math.max(...model.parts.flatMap((part) => part.size.map((value, index) => index === 1 ? value : 0)), 0),
      motorCount,
      componentCount: model.parts.length,
    },
  };
}

export function technicalPresetToEngineId(preset: TechnicalRenderPreset): string {
  return technicalRenderPresetOptions.find((option) => option.id === preset)?.engineId ?? "solid";
}

export function isTechnicalRenderPreset(value: string): value is TechnicalRenderPreset {
  return (technicalRenderPresets as readonly string[]).includes(value);
}

/** Coupe longitudinale unique pour l’assemblage affiché. 100 % signifie aucune coupe. */
export function xrayCutPosition(model: MechanicalModel, explosion: number, cut: number): number | undefined {
  const fraction = Number.isFinite(cut) ? Math.max(0, Math.min(1, cut)) : 1;
  if (fraction >= 1) return undefined;
  let min = Infinity;
  let max = -Infinity;
  for (const part of model.parts) {
    if (part.hidden) continue;
    const vertices = transformedPartVertices(part, explosion);
    for (let i = 2; i < vertices.length; i += 3) {
      if (Number.isFinite(vertices[i])) {
        min = Math.min(min, vertices[i]);
        max = Math.max(max, vertices[i]);
      }
    }
  }
  return Number.isFinite(min) && Number.isFinite(max) ? min + (max - min) * fraction : undefined;
}

/** Découpe un polygone sur le même demi-espace monde Z ≤ cutoff que WebGL. */
export function clipPolygonAtZ(vertices: Vec3[], cutoff: number | undefined): Vec3[] {
  if (cutoff === undefined || vertices.length === 0) return vertices;
  const result: Vec3[] = [];
  let previous = vertices[vertices.length - 1];
  let previousInside = previous[2] <= cutoff;
  for (const current of vertices) {
    const currentInside = current[2] <= cutoff;
    if (currentInside !== previousInside) {
      const t = (cutoff - previous[2]) / (current[2] - previous[2]);
      result.push([
        previous[0] + t * (current[0] - previous[0]),
        previous[1] + t * (current[1] - previous[1]),
        cutoff,
      ]);
    }
    if (currentInside) result.push(current);
    previous = current;
    previousInside = currentInside;
  }
  return result;
}

/**
 * Émet un événement local de traçabilité. Les interactions sans mutation restent
 * explicitement non persistantes ; les centres peuvent relayer cet événement vers
 * leur audit existant lorsqu’une politique de journalisation l’exige.
 */
export function emitTechnicalRenderAudit(
  event: "model_opened" | "preset_changed" | "component_selected" | "layer_changed" | "exploded_view_opened",
  context: Pick<TechnicalRenderContext, "droneId" | "modelId" | "modelVersion" | "centreContext">,
  details: Record<string, unknown> = {},
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("aeromind:technical-render-event", {
    detail: {
      event,
      ...context,
      ...details,
      persisted: false,
      timestamp: new Date().toISOString(),
    },
  }));
}
