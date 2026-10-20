import type { ConceptConfig } from "./aeroEngine";

type LayerSettings = NonNullable<ConceptConfig["studioLayerSettings"]>[string];
const legacySystemLabels = ["Structure", "Voilure", "Propulsion", "Avionique", "Charge utile", "Train"];

export function createStudioLayer(config: ConceptConfig, rawLabel: string): ConceptConfig | null {
  const label = rawLabel.trim();
  const layers = config.studioLayers ?? [];
  if (!label || layers.some(item => item.toLocaleLowerCase("fr-FR") === label.toLocaleLowerCase("fr-FR"))) return null;
  return {
    ...config,
    studioLayers: [...layers, label],
    studioLayerSettings: { ...(config.studioLayerSettings ?? {}), [label]: { visible: true, locked: false, opacity: 100, blendMode: "normal", exposureEV: 0, contrast: 100, saturation: 100 } },
    activeStudioLayer: label,
  };
}

export function renameStudioLayer(config: ConceptConfig, oldLabel: string, rawNewLabel: string): ConceptConfig | null {
  const newLabel = rawNewLabel.trim();
  const layers = config.studioLayers ?? [];
  if (!newLabel || !layers.includes(oldLabel)) return null;
  if (oldLabel === newLabel) return config;
  if (layers.some(item => item !== oldLabel && item.toLocaleLowerCase("fr-FR") === newLabel.toLocaleLowerCase("fr-FR"))) return null;
  const settings = { ...(config.studioLayerSettings ?? {}) };
  if (settings[oldLabel]) settings[newLabel] = settings[oldLabel];
  delete settings[oldLabel];
  const now = new Date().toISOString();
  return {
    ...config,
    studioLayers: layers.map(item => item === oldLabel ? newLabel : item),
    studioLayerSettings: settings,
    activeStudioLayer: config.activeStudioLayer === oldLabel ? newLabel : config.activeStudioLayer,
    installedMaterials: config.installedMaterials?.map(item => item.layer === oldLabel ? { ...item, layer: newLabel } : item),
    customSketch: config.customSketch ? { ...config.customSketch, modifiedAt: now, strokes: config.customSketch.strokes.map(stroke => stroke.layer === oldLabel ? { ...stroke, layer: newLabel } : stroke) } : undefined,
  };
}

export function deleteStudioLayer(config: ConceptConfig, label: string): ConceptConfig | null {
  const layers = config.studioLayers ?? [];
  if (!layers.includes(label)) return null;
  const settings = { ...(config.studioLayerSettings ?? {}) };
  delete settings[label];
  return {
    ...config,
    studioLayers: layers.filter(item => item !== label),
    studioLayerSettings: settings,
    activeStudioLayer: config.activeStudioLayer === label ? "" : config.activeStudioLayer,
    installedMaterials: config.installedMaterials?.map(item => item.layer === label ? { ...item, layer: "" } : item),
    customSketch: config.customSketch ? { ...config.customSketch, modifiedAt: new Date().toISOString(), strokes: config.customSketch.strokes.map(stroke => stroke.layer === label ? { ...stroke, layer: "" } : stroke) } : undefined,
  };
}

export function reorderStudioLayer(config: ConceptConfig, from: number, to: number): ConceptConfig {
  const layers = [...(config.studioLayers ?? [])];
  if (from < 0 || from >= layers.length || to < 0 || to >= layers.length || from === to) return config;
  const [item] = layers.splice(from, 1);
  layers.splice(to, 0, item);
  return { ...config, studioLayers: layers };
}

export function updateStudioLayerSettings(config: ConceptConfig, label: string, changes: Partial<LayerSettings>): ConceptConfig {
  if (!(config.studioLayers ?? []).includes(label)) return config;
  const previous = config.studioLayerSettings?.[label] ?? { visible: true, locked: false, opacity: 100, blendMode: "normal" as const, exposureEV: 0, contrast: 100, saturation: 100 };
  return { ...config, studioLayerSettings: { ...(config.studioLayerSettings ?? {}), [label]: { ...previous, ...changes } } };
}

/** Retire les étiquettes des anciens calques automatiques sans supprimer ni modifier les objets. */
export function normalizeLegacyStudioLayers(config: ConceptConfig): ConceptConfig {
  const userLayers = new Set(config.studioLayers ?? []);
  const legacy = new Set(legacySystemLabels.filter(label => !userLayers.has(label)));
  const materials = config.installedMaterials;
  const strokes = config.customSketch?.strokes;
  const hasLegacyReferences = Boolean(
    materials?.some(item => legacy.has(item.layer ?? "")) ||
    strokes?.some(stroke => legacy.has(stroke.layer ?? "")) ||
    Object.keys(config.studioLayerSettings ?? {}).some(label => legacy.has(label)) ||
    legacy.has(config.activeStudioLayer ?? ""),
  );
  if (!hasLegacyReferences) return config;
  const settings = Object.fromEntries(Object.entries(config.studioLayerSettings ?? {}).filter(([label]) => !legacy.has(label)));
  const hasChangedStrokes = Boolean(strokes?.some(stroke => legacy.has(stroke.layer ?? "")));
  return {
    ...config,
    studioLayerSettings: settings,
    activeStudioLayer: legacy.has(config.activeStudioLayer ?? "") ? "" : config.activeStudioLayer,
    installedMaterials: materials?.map(item => legacy.has(item.layer ?? "") ? { ...item, layer: "" } : item),
    customSketch: config.customSketch ? {
      ...config.customSketch,
      modifiedAt: hasChangedStrokes ? new Date().toISOString() : config.customSketch.modifiedAt,
      strokes: config.customSketch.strokes.map(stroke => legacy.has(stroke.layer ?? "") ? { ...stroke, layer: "" } : stroke),
    } : undefined,
  };
}
