import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  Activity, ArrowDownToLine, ArrowUpFromLine, Box, Camera, Check,
  Copy, Download, Eye, EyeOff, FileJson2, FileSpreadsheet, Maximize2, Plus,
  Redo2, RotateCcw, Save, Search, Undo2, Wrench,
} from "lucide-react";
import type { ConceptConfig } from "../lib/aeroEngine";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import { hasDroneGeometry } from "../lib/droneSketchGeometry";
import { calculateParametricMetrics } from "../lib/engineeringDisplayState";
import {
  buildMechanicalModel,
  transformedPartVertices,
  type ControlDeflections,
  type MechanicalModel,
  type MechanicalPart,
  type ParametricSketchProfile,
} from "../lib/mechanicalTwinGeometry";
import {
  appendFeatureOperation,
  appendNativeEdgeTreatment,
  featureHistoryFor,
  materializeNativePart,
  nativeCsgId,
  type FeatureOperation,
} from "../lib/parametricFeatureOperations";
import {
  addCustomVariable,
  collectVariableRows,
  getActiveMechanicalTwin,
  makeParametricSnapshot,
  parseParametricSnapshot,
  removeCustomVariable,
  setVariableValue,
  updateActiveMechanicalTwin,
  updateVariableDefinition,
  variablesFromCsv,
  variablesToCsv,
  type VariableRow,
} from "../lib/parametricStudioModel";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import { MechanicalTwinViewport } from "./MechanicalTwinViewport";
import "./mechanical-twin.css";
import "./parametric-drone-center.css";

type Props = {
  config: ConceptConfig;
  setConfig: Dispatch<SetStateAction<ConceptConfig>>;
  hasProject: boolean;
  activeProfile?: DroneCatalogDesign;
  activeDroneLabel?: string;
  onCommit?: () => Promise<{ scope: "LOCAL" | "SERVER-ACK" }>;
};

type StudioTab = "part" | "variable" | "assembly";
type MaterialId = "carbon" | "aluminum" | "kevlar";
const MATERIALS: Array<{ id: MaterialId; name: string; density: string; color: string }> = [
  { id: "carbon", name: "Carbone T700", density: "1,80 g/cm³ · réf.", color: "#3a3a3e" },
  { id: "aluminum", name: "Aluminium 7075", density: "2,81 g/cm³ · réf.", color: "#8c999e" },
  { id: "kevlar", name: "Kevlar 49", density: "1,44 g/cm³ · réf.", color: "#8a7a4a" },
];
const EMPTY_CONTROLS: ControlDeflections = { aileron: 15, flap: 20, elevator: 15, rudder: 15 };
const BINDINGS = [
  ["metadata", "Métadonnée uniquement"],
  ["fuselageLength", "Longueur fuselage"], ["wingspan", "Envergure"], ["chord", "Corde"],
  ["motorCount", "Nombre de moteurs"], ["cruiseSpeedKmh", "Vitesse cible"], ["altitudeM", "Altitude"],
  ["sweepDeg", "Flèche"], ["dihedralDeg", "Dièdre"], ["wingletAngleDeg", "Angle winglet"], ["fuselageHeight", "Hauteur section"], ["fuselageWidth", "Largeur section"],
] as const;
const DEFAULT_SKETCH: Omit<ParametricSketchProfile, "id" | "modifiedAt"> = { name: "Profil", kind: "rectangle", width: 0.24, height: 0.08 };

function makeId(prefix: string) {
  const id = globalThis.crypto?.randomUUID?.().replace(/-/g, "") ?? `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${id}`;
}

function downloadFile(content: string, mimeType: string, filename: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "") || "part";
}

function exportModelObj(model: MechanicalModel) {
  const lines = ["# AeroMind mesh export · unit: metre · triangulated visualization mesh"];
  let vertexOffset = 1;
  for (const part of model.parts) {
    if (part.hidden) continue;
    const vertices = transformedPartVertices(part);
    lines.push(`o ${safeName(part.name)}`);
    for (let index = 0; index < vertices.length; index += 3) lines.push(`v ${vertices[index]} ${vertices[index + 1]} ${vertices[index + 2]}`);
    for (let index = 0; index < part.indices.length; index += 3) {
      lines.push(`f ${part.indices[index] + vertexOffset} ${part.indices[index + 1] + vertexOffset} ${part.indices[index + 2] + vertexOffset}`);
    }
    vertexOffset += vertices.length / 3;
  }
  return lines.join("\n");
}

function exportModelStl(model: MechanicalModel) {
  const lines = [`solid aeromind_visualization_mesh`];
  for (const part of model.parts) {
    if (part.hidden) continue;
    const vertices = transformedPartVertices(part);
    for (let index = 0; index + 2 < part.indices.length; index += 3) {
      const points = [0, 1, 2].map(offset => {
        const base = part.indices[index + offset] * 3;
        return [vertices[base], vertices[base + 1], vertices[base + 2]] as [number, number, number];
      });
      const [a, b, c] = points;
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const magnitude = Math.hypot(...normal) || 1;
      lines.push(` facet normal ${normal.map(value => value / magnitude).join(" ")}`, "  outer loop");
      for (const point of points) lines.push(`   vertex ${point.join(" ")}`);
      lines.push("  endloop", " endfacet");
    }
  }
  lines.push("endsolid aeromind_visualization_mesh");
  return lines.join("\n");
}

function roundValue(value: number, step: number) {
  const precision = Math.min(8, Math.max(0, (String(step).split(".")[1] ?? "").length));
  return Number(value.toFixed(precision));
}

export function ParametricDroneCenter({ config, setConfig, hasProject, activeProfile, activeDroneLabel = "Aucun drone sélectionné", onCommit }: Props) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<StudioTab>("part");
  const [selectedMechanicalPart, setSelectedMechanicalPart] = useState("");
  const [selectedVariableId, setSelectedVariableId] = useState("wingspan");
  const [selectedSketchId, setSelectedSketchId] = useState("");
  const [booleanToolId, setBooleanToolId] = useState("");
  const [search, setSearch] = useState("");
  const [commandStatus, setCommandStatus] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "local" | "server" | "error">("idle");
  const [treePreviewEnabled, setTreePreviewEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rebuildRevision, setRebuildRevision] = useState(0);
  const [sketchWidth, setSketchWidth] = useState(DEFAULT_SKETCH.width);
  const [sketchHeight, setSketchHeight] = useState(DEFAULT_SKETCH.height);
  const [sketchKind, setSketchKind] = useState<"rectangle" | "ellipse">("rectangle");
  const undoStack = useRef<ConceptConfig[]>([]);
  const redoStack = useRef<ConceptConfig[]>([]);
  const configRef = useRef(config);
  const [, setHistoryTick] = useState(0);
  configRef.current = config;

  // Same identity contract as DigitalTwinExplorer: the geometry engine recognizes
  // this prefix and projects the actual strokes, not a catalogue silhouette.
  // Require an explicit custom selection and drawable strokes; otherwise do not
  // let a stale profile or a default airframe manufacture a selected model.
  const resolvedProfile = useMemo<DroneCatalogDesign | undefined>(() => {
    if (config.engineeringSelection?.source !== "custom") return activeProfile;
    const selection = config.engineeringSelection;
    if (!selection.droneId?.trim() || !hasDroneGeometry(config.customSketch?.strokes)) return undefined;
    return {
      key: config.airframe ?? "quadcopter",
      modelType: config.modelType as DroneCatalogDesign["modelType"],
      id: `custom-sketch-${selection.droneId}`,
      label: selection.droneLabel || config.designName || "Dessin personnalisé",
      family: "Jumeau mécanique · source dessin utilisateur",
      mission: "Projection de travail issue des traits du croquis utilisateur.",
      specs: "Projection indicative",
      disciplines: "Géométrie de dessin",
      tone: "cyan",
      configuration: { ...config },
      role: "civil",
      defenseUse: "Prototype conceptuel non armé; revue humaine et validation technique requises.",
      origin: "aeromind-parametric",
    };
  }, [activeProfile, config]);
  const customSource = config.engineeringSelection?.source === "custom" && Boolean(resolvedProfile);
  const mechanicalModel = useMemo<MechanicalModel | null>(() => resolvedProfile ? buildMechanicalModel(resolvedProfile, config) : null, [resolvedProfile, config]);
  const activeDesignId = resolvedProfile?.id;
  const activeTwin = getActiveMechanicalTwin(config, activeDesignId);
  const variableRows = useMemo(() => collectVariableRows(config, true, activeDesignId), [config, activeDesignId]);
  const metrics = useMemo(() => calculateParametricMetrics(Object.fromEntries(variableRows.map(variable => [variable.id, variable.value]))), [variableRows]);
  const featureHistory = useMemo(() => activeDesignId ? featureHistoryFor(config, activeDesignId) : [], [config, activeDesignId]);
  const selectedPart = mechanicalModel?.parts.find(part => part.id === selectedMechanicalPart);
  // Keep the select controlled by the actual user choice. Falling back to the
  // last sketch made the empty option impossible to select and could make an
  // operation target an unintended profile.
  const selectedSketch = activeTwin?.sketchProfiles?.find(sketch => sketch.id === selectedSketchId);
  const sketchProfiles = activeTwin?.sketchProfiles ?? [];
  const customVariableIds = useMemo(() => new Set(activeTwin?.customVariables?.map(variable => variable.id) ?? []), [activeTwin]);
  const treeGroups = useMemo(() => {
    if (!mechanicalModel) return [];
    const groups = new Map<string, MechanicalPart[]>();
    for (const part of mechanicalModel.parts) groups.set(part.category, [...(groups.get(part.category) ?? []), part]);
    return [...groups.entries()].map(([label, parts]) => ({ id: label, label, parts }));
  }, [mechanicalModel]);
  const searchableParts = useMemo(() => treeGroups.map(group => ({
    ...group,
    parts: group.parts.filter(part => !search || `${part.name} ${part.id} ${part.category}`.toLowerCase().includes(search.toLowerCase())),
  })).filter(group => group.parts.length > 0), [treeGroups, search]);
  const nativeParts = mechanicalModel?.parts.filter(part => !activeTwin?.extraParts?.some(extra => extra.id === part.id)) ?? [];
  const booleanChoices = [...(activeTwin?.extraParts ?? []), ...nativeParts.map(part => ({ id: part.id, name: part.name }))]
    .filter(part => part.id !== selectedMechanicalPart);
  const selectedMaterial = (selectedPart && activeTwin?.edits?.[selectedPart.id]?.materialId as MaterialId | undefined) ?? "carbon";
  const selectedFeature = selectedPart?.name ?? featureHistory.find(feature => feature.id === selectedMechanicalPart)?.name ?? "Aucune sélection";
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    setHistoryTick(value => value + 1);
    setSelectedMechanicalPart("");
    setSelectedSketchId("");
  }, [activeDesignId]);

  useEffect(() => {
    if (selectedSketchId && !sketchProfiles.some(sketch => sketch.id === selectedSketchId)) {
      setSelectedSketchId("");
    }
  }, [selectedSketchId, sketchProfiles]);

  useEffect(() => {
    if (!mechanicalModel) {
      setSelectedMechanicalPart("");
      return;
    }
    if (selectedMechanicalPart && mechanicalModel.parts.some(part => part.id === selectedMechanicalPart)) return;
    setSelectedMechanicalPart(mechanicalModel.parts.find(part => !part.hidden)?.id ?? mechanicalModel.parts[0]?.id ?? "");
    setRebuildRevision(revision => revision + 1);
  }, [mechanicalModel, selectedMechanicalPart]);

  useEffect(() => {
    if (!booleanChoices.some(part => part.id === booleanToolId)) setBooleanToolId(booleanChoices[0]?.id ?? "");
  }, [booleanChoices, booleanToolId]);

  useEffect(() => {
    const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  const commitConfig = (change: (current: ConceptConfig) => ConceptConfig) => {
    const previous = configRef.current;
    const next = change(previous);
    if (next === previous) return next;
    undoStack.current = [...undoStack.current.slice(-49), previous];
    redoStack.current = [];
    configRef.current = next;
    setConfig(next);
    setHistoryTick(value => value + 1);
    setSaveState("idle");
    return next;
  };

  const undo = () => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(configRef.current);
    configRef.current = previous;
    setConfig(previous);
    setHistoryTick(value => value + 1);
    setSaveState("idle");
    setCommandStatus("Dernière modification annulée.");
  };

  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(configRef.current);
    configRef.current = next;
    setConfig(next);
    setHistoryTick(value => value + 1);
    setSaveState("idle");
    setCommandStatus("Modification rétablie.");
  };

  const translateMechanicalPart = (id: string, delta: [number, number, number]) => {
    if (!activeDesignId || delta.some(value => !Number.isFinite(value))) return;
    commitConfig(current => updateActiveMechanicalTwin(current, activeDesignId, twin => {
      const previous = twin.edits?.[id]?.offset ?? [0, 0, 0];
      return { ...twin, edits: { ...twin.edits, [id]: { ...twin.edits?.[id], offset: [previous[0] + delta[0], previous[1] + delta[1], previous[2] + delta[2]] } } };
    }));
    const part = mechanicalModel?.parts.find(item => item.id === id);
    setCommandStatus(`Translation locale enregistrée · ${part?.name ?? id}`);
  };

  const handleSave = async () => {
    if (!hasProject) {
      toast.info("Aucun projet actif", { description: t("Les changements sont une prévisualisation locale et ne seront pas enregistrés dans un projet.") });
      return;
    }
    if (!onCommit) {
      setSaveState("error");
      toast.error(t("Enregistrement indisponible"), { description: t("Aucun service de sauvegarde n’a confirmé cette action.") });
      return;
    }
    if (variableRows.some(variable => variable.error)) {
      setSaveState("error");
      toast.error(t("Variables non valides"), { description: t("Corrigez les expressions et leurs plages avant l’enregistrement.") });
      return;
    }
    setSaveState("saving");
    try {
      const acknowledgement = await onCommit();
      setSaveState(acknowledgement.scope === "SERVER-ACK" ? "server" : "local");
      toast.success(acknowledgement.scope === "SERVER-ACK" ? "Synchronisation confirmée" : "Enregistré sur cet appareil", {
        description: acknowledgement.scope === "SERVER-ACK" ? "Le serveur a accusé réception du snapshot actif." : "Le snapshot du projet actif a été écrit dans le stockage local du navigateur.",
      });
    } catch (error) {
      setSaveState("error");
      toast.error("Enregistrement échoué", { description: error instanceof Error ? error.message : "Le stockage n’a pas confirmé l’opération." });
    }
  };

  const updateVariable = (variableId: string, value: number) => {
    const variable = variableRows.find(row => row.id === variableId);
    if (!variable || variable.expression || !Number.isFinite(value)) return;
    const normalized = Math.max(variable.min, Math.min(variable.max, roundValue(value, variable.step)));
    commitConfig(current => setVariableValue(current, activeDesignId, variable, normalized));
    setSelectedVariableId(variableId);
  };

  const updateVariableText = (variableId: string, patch: { name?: string; unit?: string; min?: number; max?: number; step?: number; description?: string; appliesTo?: string; expression?: string }) => {
    if (!activeDesignId || !customVariableIds.has(variableId)) return;
    const currentVariable = variableRows.find(variable => variable.id === variableId);
    if (!currentVariable) return;
    const safePatch = { ...patch };
    if (safePatch.name) safePatch.name = safePatch.name.startsWith("#") ? safePatch.name : `#${safePatch.name.replace(/^#+/, "")}`;
    const min = safePatch.min ?? currentVariable.min;
    const max = safePatch.max ?? currentVariable.max;
    const step = safePatch.step ?? currentVariable.step;
    if ((safePatch.name !== undefined && (safePatch.name.trim().length < 2 || safePatch.name.length > 80)) || (safePatch.unit !== undefined && safePatch.unit.length > 40) || (safePatch.description !== undefined && safePatch.description.length > 200) || (safePatch.expression !== undefined && safePatch.expression.length > 200) || !Number.isFinite(min) || !Number.isFinite(max) || min > max || !Number.isFinite(step) || step <= 0 || currentVariable.value < min || currentVariable.value > max) {
      toast.error(t("Définition de variable invalide"), { description: t("Nom, unité, plage, pas et valeur courante doivent respecter le contrat paramétrique.") });
      return;
    }
    commitConfig(current => {
      const updated = updateVariableDefinition(current, activeDesignId, variableId, safePatch);
      if (safePatch.expression !== undefined && safePatch.expression.trim()) {
        const derived = collectVariableRows(updated, true, activeDesignId).find(row => row.id === variableId);
        if (!derived?.error && derived) return setVariableValue(updated, activeDesignId, derived, derived.value);
      }
      return updated;
    });
  };

  const addVariable = (duplicate = false) => {
    if (!activeDesignId) {
      toast.info(t("Sélectionnez un design"), { description: t("Les variables utilisateur sont persistées dans le Mechanical Twin du design actif.") });
      return;
    }
    const source = duplicate ? variableRows.find(variable => variable.id === selectedVariableId) : undefined;
    const result = addCustomVariable(configRef.current, activeDesignId, source);
    commitConfig(() => result.config);
    setSelectedVariableId(result.variable.id);
    setActiveTab("variable");
    setCommandStatus(duplicate ? `Variable ${result.variable.name} dupliquée.` : `Variable ${result.variable.name} créée et enregistrée dans le design actif.`);
  };

  const deleteVariable = (variableId: string) => {
    if (!activeDesignId || !customVariableIds.has(variableId)) return;
    commitConfig(current => removeCustomVariable(current, activeDesignId, variableId));
    if (selectedVariableId === variableId) setSelectedVariableId("wingspan");
  };

  const updateSection = (section: "circular" | "elliptical" | "polygonal") => {
    if (!activeDesignId) return;
    commitConfig(current => updateActiveMechanicalTwin(current, activeDesignId, twin => ({ ...twin, fuselageSectionType: section })));
    setCommandStatus(`Section du design actif : ${section}.`);
  };

  const setMaterialForPart = (materialId: MaterialId) => {
    if (!activeDesignId || !selectedPart) {
      toast.info("Sélectionnez une pièce", { description: t("Le matériau est affecté à la pièce sélectionnée, pas à tous les designs.") });
      return;
    }
    const material = MATERIALS.find(item => item.id === materialId)!;
    commitConfig(current => updateActiveMechanicalTwin(current, activeDesignId, twin => ({
      ...twin,
      edits: { ...(twin.edits ?? {}), [selectedPart.id]: { ...(twin.edits?.[selectedPart.id] ?? {}), materialId, color: material.color } },
    })));
    setCommandStatus(`${material.name} affecté à « ${selectedPart.name} » (référence de matériau, non utilisée comme masse réelle).`);
  };

  const setControlDeflection = (key: keyof ControlDeflections, value: number) => {
    if (!activeDesignId) return;
    commitConfig(current => updateActiveMechanicalTwin(current, activeDesignId, twin => ({
      ...twin,
      controlDeflections: { ...EMPTY_CONTROLS, ...(twin.controlDeflections ?? {}), [key]: value },
    })));
  };

  const createSketch = () => {
    if (!activeDesignId) {
      toast.info(t("Sélectionnez un design"), { description: t("Une esquisse doit être associée au Mechanical Twin actif.") });
      return;
    }
    if (![sketchWidth, sketchHeight].every(value => Number.isFinite(value) && value > 0 && value <= 20)) {
      toast.error(t("Dimensions d’esquisse invalides"), { description: t("Les deux dimensions doivent être finies et comprises entre 0 et 20 m.") });
      return;
    }
    const profile: ParametricSketchProfile = {
      id: makeId("sketch"), name: `Profil ${sketchKind === "rectangle" ? "rectangulaire" : "elliptique"} ${new Date().toLocaleTimeString("fr-FR")}`,
      kind: sketchKind, width: sketchWidth, height: sketchHeight, modifiedAt: new Date().toISOString(),
    };
    commitConfig(current => updateActiveMechanicalTwin(current, activeDesignId, twin => ({
      ...twin,
      sketchProfiles: [...(twin.sketchProfiles ?? []), profile],
      featureHistory: [...(twin.featureHistory ?? []), {
        id: profile.id, kind: "sketch", name: profile.name, status: "applied", createdAt: profile.modifiedAt,
        dependsOn: [], parameters: { profileId: profile.id, profileKind: profile.kind, width: profile.width, height: profile.height },
      }],
    })));
    setSelectedSketchId(profile.id);
    setCommandStatus(`Esquisse ${profile.kind} ${profile.width.toFixed(3)} × ${profile.height.toFixed(3)} m enregistrée.`);
  };

  const selectSketchProfile = (value: string) => {
    if (value === "__create__") {
      createSketch();
      return;
    }
    setSelectedSketchId(value);
    setCommandStatus(value ? "Profil d’esquisse sélectionné pour les opérations locales." : "Aucun profil d’esquisse actif.");
  };

  const applyFeatureOperation = (operation: FeatureOperation) => {
    if (!activeDesignId || !resolvedProfile || !hasProject) {
      toast.info(t("Opération indisponible"), { description: t("Sélectionnez un design enregistré dans un projet actif avant de construire une feature.") });
      return;
    }
    const target = mechanicalModel?.parts.find(part => part.id === selectedMechanicalPart);
    let updatedConfig = configRef.current;
    let finalOperation: FeatureOperation = operation;
    let targetId = target?.id;
    if (operation.kind === "boolean") {
      const toolPart = mechanicalModel?.parts.find(part => part.id === operation.toolId);
      const targetPart = mechanicalModel?.parts.find(part => part.id === operation.targetId);
      if (!targetPart || !toolPart || targetPart.id === toolPart.id) {
        toast.error(t("Booléen impossible"), { description: t("Choisissez deux pièces distinctes et valides.") });
        return;
      }
      let targetOperationId = operation.targetId;
      let toolOperationId = operation.toolId;
      if (!(updatedConfig.mechanicalTwins?.[activeDesignId]?.extraParts ?? []).some(part => part.id === targetPart.id)) {
        updatedConfig = materializeNativePart(updatedConfig, activeDesignId, targetPart);
        targetOperationId = nativeCsgId(targetPart.id);
      }
      if (!(updatedConfig.mechanicalTwins?.[activeDesignId]?.extraParts ?? []).some(part => part.id === toolPart.id)) {
        updatedConfig = materializeNativePart(updatedConfig, activeDesignId, toolPart);
        toolOperationId = nativeCsgId(toolPart.id);
      }
      finalOperation = { kind: "boolean", operation: operation.operation, targetId: targetOperationId, toolId: toolOperationId };
      targetId = targetPart.id;
    }
    updatedConfig = appendFeatureOperation(updatedConfig, activeDesignId, finalOperation, targetId);
    const newHistory = featureHistoryFor(updatedConfig, activeDesignId);
    const feature = newHistory.at(-1);
    commitConfig(() => updatedConfig);
    if (feature?.status !== "applied") {
      toast.warning(t("Opération non appliquée"), { description: t("La géométrie source est conservée. Consultez l’historique pour le motif ou la limite de capacité.") });
      setCommandStatus(`${feature?.name ?? operation.kind} : indisponible ou géométrie non valide.`);
      return;
    }
    if (operation.kind === "boolean" || operation.kind === "extrusion" || operation.kind === "revolution") setSelectedMechanicalPart(feature.id);
    else if (feature.targetPartId) setSelectedMechanicalPart(feature.targetPartId);
    setRebuildRevision(revision => revision + 1);
    setCommandStatus(`${feature.name} appliquée et inscrite dans l’historique du design actif.`);
    toast.success(t("Géométrie reconstruite"), { description: feature.name });
  };

  const createExtrusion = () => {
    if (!selectedSketch) {
      toast.info(t("Aucune esquisse sélectionnée"), { description: t("Créez un profil puis sélectionnez-le avant l’extrusion.") });
      setActiveTab("part");
      return;
    }
    if (selectedSketch.kind !== "rectangle") {
      toast.info(t("Profil incompatible"), { description: t("Le moteur actuel n’extrude qu’un profil rectangulaire.") });
      return;
    }
    const position = selectedPart?.position ?? [0, 0, 0];
    applyFeatureOperation({ kind: "extrusion", width: selectedSketch.width, height: selectedSketch.height, depth: Math.max(0.05, selectedSketch.height), position });
  };

  const createRevolution = () => {
    if (!selectedSketch) {
      toast.info(t("Aucune esquisse sélectionnée"), { description: t("Créez un profil elliptique/circulaire avant cette opération.") });
      setActiveTab("part");
      return;
    }
    if (selectedSketch.kind !== "ellipse") {
      toast.info(t("Profil incompatible"), { description: t("Le moteur actuel n’accepte qu’un profil elliptique simplifié pour le cylindre.") });
      return;
    }
    const radius = selectedSketch.width / 2;
    applyFeatureOperation({ kind: "revolution", radius, height: selectedSketch.height, position: selectedPart?.position ?? [0, 0, 0] });
  };

  const createBoolean = (operation: "union" | "subtract" | "intersect") => {
    if (!selectedMechanicalPart || !booleanToolId || selectedMechanicalPart === booleanToolId) {
      toast.info(t("Deux pièces distinctes requises"), { description: t("Sélectionnez une pièce cible et une pièce outil dans la liste.") });
      return;
    }
    applyFeatureOperation({ kind: "boolean", operation, targetId: selectedMechanicalPart, toolId: booleanToolId });
  };

  const recordUnsupportedEdgeTreatment = (treatment: "fillet" | "chamfer") => {
    if (!activeDesignId || !selectedPart) return;
    const next = appendNativeEdgeTreatment(configRef.current, activeDesignId, selectedPart, treatment, Math.max(0.01, Math.min(...selectedPart.size) * 0.08));
    commitConfig(() => next);
    setCommandStatus(`${treatment === "fillet" ? "Congé" : "Chanfrein"} exact indisponible pour ce maillage; géométrie source conservée.`);
    toast.warning(t("Opération non disponible"), { description: t("Aucun congé/chanfrein d’arête exact n’est calculé par le noyau actuel.") });
  };

  const resetFeatures = () => {
    if (!activeDesignId) return;
    if (!window.confirm(t("Supprimer les features de ce design et restaurer les pièces sources ? Cette opération peut être annulée avec Annuler."))) return;
    const currentTwin = getActiveMechanicalTwin(configRef.current, activeDesignId);
    if (!currentTwin) return;
    const conversions = (currentTwin.featureHistory ?? []).filter(feature => feature.kind === "conversion");
    const edits = { ...(currentTwin.edits ?? {}) };
    for (const conversion of conversions) {
      const sourceId = conversion.targetPartId;
      if (!sourceId) continue;
      const oldEdit = edits[sourceId];
      if (!oldEdit) continue;
      const { hidden: _hidden, ...rest } = oldEdit;
      const wasHidden = conversion.parameters.sourceVisibility === "hidden";
      edits[sourceId] = wasHidden ? { ...rest, hidden: true } : rest;
      if (Object.keys(edits[sourceId]).length === 0) delete edits[sourceId];
    }
    commitConfig(current => updateActiveMechanicalTwin(current, activeDesignId, twin => ({ ...twin, extraParts: [], featureHistory: [], edits })));
    setSelectedMechanicalPart(mechanicalModel?.parts.find(part => !part.hidden)?.id ?? "");
    setCommandStatus("Features supprimées; visibilité source restaurée selon les conversions enregistrées.");
  };

  const handleImportFile = async (file?: File) => {
    if (!file) return;
    if (!activeDesignId) {
      toast.error(t("Import impossible"), { description: t("Sélectionnez un design actif avant de modifier ses variables.") });
      return;
    }
    try {
      const contents = await file.text();
      if (file.name.toLowerCase().endsWith(".csv")) {
        const imported = variablesFromCsv(contents);
        if (imported.length > 250) throw new Error("Le fichier dépasse 250 variables.");
        const defaultIds = new Set(["length", "wingspan", "sweep", "dihedral", "max_thickness", "chord", "thickness_ratio", "winglet_angle", "motor_count", "cruise_speed", "altitude", "fuse_sec3_top"]);
        commitConfig(current => {
          let next = current;
          for (const definition of imported) {
            const existing = collectVariableRows(next, true, activeDesignId).find(row => row.id === definition.id);
            if (existing) next = setVariableValue(next, activeDesignId, { ...existing, ...definition }, definition.value);
          }
          return updateActiveMechanicalTwin(next, activeDesignId, twin => {
            const custom = new Map((twin.customVariables ?? []).map(variable => [variable.id, variable]));
            for (const definition of imported) if (!defaultIds.has(definition.id)) custom.set(definition.id, definition);
            return { ...twin, customVariables: [...custom.values()] };
          });
        });
        toast.success(t("CSV importé"), { description: `${imported.length} variable(s) validée(s) et appliquée(s) au design actif.` });
      } else {
        const snapshot = parseParametricSnapshot(contents);
        if (snapshot.designId !== activeDesignId) throw new Error("Le fichier appartient à un autre design; sélectionnez son design avant l’import.");
        commitConfig(current => {
          let next = updateActiveMechanicalTwin(current, activeDesignId, twin => ({ ...twin, ...(snapshot.mechanicalTwin ?? {}) }));
          if (snapshot.concept) next = { ...next, ...snapshot.concept };
          for (const definition of snapshot.variables) {
            const existing = collectVariableRows(next, true, activeDesignId).find(row => row.id === definition.id);
            if (existing) next = setVariableValue(next, activeDesignId, { ...existing, ...definition }, definition.value);
          }
          return next;
        });
        toast.success(t("JSON importé"), { description: t("Le snapshot versionné du design actif a été validé puis appliqué.") });
      }
    } catch (error) {
      toast.error(t("Import refusé"), { description: error instanceof Error ? error.message : "Format ou données invalides." });
    }
  };

  const handleImport = (kind: "json" | "csv") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = kind === "json" ? ".json,application/json" : ".csv,text/csv";
    input.onchange = () => void handleImportFile(input.files?.[0]);
    input.click();
  };

  const handleExport = (kind: "json" | "csv" | "obj" | "stl") => {
    try {
      const filename = safeName(resolvedProfile?.id ?? "preview-local");
      if (kind === "json") {
        if (!activeDesignId) throw new Error("Sélectionnez un design actif pour un export versionné.");
        if (variableRows.some(variable => variable.error)) throw new Error("Corrigez les variables hors plage ou les expressions avant export.");
        const snapshot = makeParametricSnapshot(config, activeDesignId, variableRows);
        downloadFile(`${JSON.stringify(snapshot, null, 2)}\n`, "application/json", `aeromind-parametric-${filename}.json`);
      } else if (kind === "csv") {
        if (variableRows.some(variable => variable.error)) throw new Error("Corrigez les variables hors plage ou les expressions avant export.");
        downloadFile(variablesToCsv(variableRows), "text/csv;charset=utf-8", `aeromind-variables-${filename}.csv`);
      } else {
        if (!mechanicalModel) throw new Error("Un design mécanique est requis pour exporter un maillage.");
        const data = kind === "obj" ? exportModelObj(mechanicalModel) : exportModelStl(mechanicalModel);
        downloadFile(data, kind === "obj" ? "text/plain;charset=utf-8" : "model/stl", `aeromind-${filename}.${kind}`);
      }
      setCommandStatus(`Export ${kind.toUpperCase()} prêt (unités du maillage : m).`);
    } catch (error) {
      toast.error(t("Export indisponible"), { description: error instanceof Error ? error.message : "Une erreur de validation s’est produite." });
    }
  };

  const captureParametric = () => {
    try {
      const canvas = document.querySelector<HTMLCanvasElement>(".pdc-viewport canvas");
      const image = canvas?.toDataURL("image/jpeg", 0.78) ?? "";
      if (!image) throw new Error("Aucun canvas de viewport disponible.");
      const payload = JSON.stringify({ image, capturedAt: new Date().toISOString(), variables: Object.fromEntries(variableRows.map(variable => [variable.id, variable.value])), wingArea: metrics.wingArea });
      localStorage.setItem("aeromind-parametric-capture", payload);
      window.dispatchEvent(new CustomEvent("aeromind-parametric-capture", { detail: payload }));
      toast.success(t("Capture ajoutée au rapport révisable."));
    } catch (error) {
      toast.error(t("Capture impossible"), { description: error instanceof Error ? error.message : "Canvas non disponible." });
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.querySelector<HTMLElement>(".pdc-app")?.requestFullscreen();
    } catch { toast.error(t("Le plein écran n’est pas disponible dans ce navigateur.")); }
  };

  const activeControls = { ...EMPTY_CONTROLS, ...(activeTwin?.controlDeflections ?? {}) };
  const selectedFeatureDependencies = featureHistory.find(feature => feature.id === selectedMechanicalPart)?.dependsOn ?? [];

  return (
    <div className={`pdc-app ${isFullscreen ? "pdc-fullscreen" : ""}`}>
      <header className="pdc-menubar">
        <div className="pdc-logo"><span className="pdc-mark">A</span><div><div className="pdc-name">AEROMIND</div><div className="pdc-tag">{t("Centre Parametric")}</div></div></div>
        <span className="pdc-menu-item">{resolvedProfile?.label ?? "Aucun design actif"}</span>
        <div className="pdc-spacer" />
        <div className={`pdc-pill ${saveState === "server" ? "green" : saveState === "error" ? "amber" : "cyan"}`} role="status">
          {saveState === "saving" ? "Enregistrement…" : saveState === "server" ? "Synchronisation confirmée" : saveState === "local" ? "Enregistré sur cet appareil" : saveState === "error" ? "Enregistrement en échec" : hasProject ? "Modifications en attente" : "Prévisualisation locale"}
        </div>
        <div className="pdc-pill cyan" title={resolvedProfile?.mission}>{customSource ? resolvedProfile?.label : activeDroneLabel}</div>
      </header>

      <nav className="pdc-toolbar" aria-label={t("Outils du Centre Parametric")}>
        <button className="pdc-tb-btn" onClick={resetFeatures} disabled={!activeDesignId || !featureHistory.length} title={t("Supprimer les features du design actif et restaurer la visibilité source")}><RotateCcw size={14} /> {t("Réinitialiser features")}</button>
        <button className="pdc-tb-btn" onClick={undo} disabled={!canUndo} title={t("Annuler la dernière modification")}><Undo2 size={14} /> Annuler</button>
        <button className="pdc-tb-btn" onClick={redo} disabled={!canRedo} title="Rétablir"><Redo2 size={14} /> Rétablir</button>
        <button className="pdc-tb-btn pdc-tb-btn-primary" onClick={() => void handleSave()} disabled={!hasProject || saveState === "saving"}><Save size={14} /> Enregistrer</button>
        <span className="pdc-tb-sep" />
        <button className="pdc-tb-btn" onClick={createSketch} disabled={!activeDesignId}><Box size={14} /> {t("Enregistrer esquisse")}</button>
        <button className="pdc-tb-btn" onClick={createExtrusion} disabled={!activeDesignId || !selectedSketch}><ArrowUpFromLine size={14} /> {t("Extruder profil")}</button>
        <button className="pdc-tb-btn" onClick={createRevolution} disabled={!activeDesignId || !selectedSketch}><Activity size={14} /> {t("Révolution cylindrique")}</button>
        <span className="pdc-tb-sep" />
        <label className="pdc-inline-select">Outil<select aria-label={t("Pièce outil du booléen")} value={booleanToolId} onChange={event => setBooleanToolId(event.target.value)} disabled={!booleanChoices.length}><option value="">{t("Pièce outil…")}</option>{booleanChoices.map(part => <option key={part.id} value={part.id}>{part.name}</option>)}</select></label>
        <button className="pdc-tb-btn" onClick={() => createBoolean("union")} disabled={!selectedMechanicalPart || !booleanToolId}><Wrench size={13} /> Union</button>
        <button className="pdc-tb-btn" onClick={() => createBoolean("subtract")} disabled={!selectedMechanicalPart || !booleanToolId}><Wrench size={13} /> Soustraction</button>
        <button className="pdc-tb-btn" onClick={() => createBoolean("intersect")} disabled={!selectedMechanicalPart || !booleanToolId}><Wrench size={13} /> Intersection</button>
        <span className="pdc-tb-sep" />
        <button className="pdc-tb-btn" onClick={() => handleImport("json")}><ArrowDownToLine size={13} /> Import JSON</button>
        <button className="pdc-tb-btn" onClick={() => handleImport("csv")}><FileSpreadsheet size={13} /> {t("Import CSV")}</button>
        <button className="pdc-tb-btn" onClick={() => handleExport("json")} disabled={!activeDesignId}><FileJson2 size={13} /> JSON</button>
        <button className="pdc-tb-btn" onClick={() => handleExport("csv")}><Download size={13} /> CSV</button>
        <button className="pdc-tb-btn" onClick={() => handleExport("obj")} disabled={!mechanicalModel}>OBJ</button>
        <button className="pdc-tb-btn" onClick={() => handleExport("stl")} disabled={!mechanicalModel}>STL</button>
        <button className="pdc-tb-btn" onClick={() => void toggleFullscreen()} title="Plein écran"><Maximize2 size={14} /></button>
        <button className="pdc-tb-btn" onClick={captureParametric} title={t("Capturer la vue pour le rapport")}><Camera size={14} /></button>
        <label className="pdc-search"><Search size={13} /><input aria-label={t("Rechercher une pièce ou variable")} placeholder="Rechercher…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      </nav>

      <div className="pdc-preview-disclaimer" role="note">{!resolvedProfile ? "Prévisualisation locale non associée à un design : aucune pièce, analyse ou sauvegarde de projet n’est revendiquée. Sélectionnez un design ou un dessin avec des traits géométriques." : customSource ? `Dessin actif : projection indicative des traits 2D aux dimensions du projet, sans reconstruction volumique fidèle. Les triangles, hexagones, engrenages et hélices sont simplifiés aux segments entre points stockés et certains contours restent ouverts ; annotations et mesures sont exclues, la visibilité des calques et les animations ne sont pas appliquées. Les éditions du jumeau ne modifient pas le dessin source ; certains paramètres ne s’appliquent pas aux traits. ${hasProject ? "Les sauvegardes restent limitées au workspace." : "Les modifications ne seront pas enregistrées dans un projet."} Aucune commande matérielle.` : hasProject ? "Design actif : les opérations et sauvegardes sont limitées à ce workspace. Aucune commande matérielle ne sera déclenchée." : "Design sélectionné en mode local : les modifications ne seront pas enregistrées dans un projet."}</div>

      <main className="pdc-main">
        <aside className="pdc-left" aria-label={t("Arbre du modèle")}>
          <div className="pdc-left-header"><span>{t("Pièces du modèle")}</span><button className={`pdc-tree-preview-btn ${treePreviewEnabled ? "active" : ""}`} title={treePreviewEnabled ? "Désactiver la surbrillance de sélection" : "Activer la surbrillance de sélection"} onClick={() => setTreePreviewEnabled(value => !value)}>{treePreviewEnabled ? <Eye size={12} /> : <EyeOff size={12} />}</button></div>
          {!mechanicalModel && <div className="pdc-empty-state">{t("Aucun Mechanical Twin construit. Choisissez un design dans AeroMind.")}</div>}
          {searchableParts.map(group => (
            <section key={group.id} className="pdc-feature-group">
              <div className="pdc-group-header"><span className="pdc-chevron open">▸</span><span className="pdc-group-label">{group.label}</span><span className="pdc-group-count">{group.parts.length}</span></div>
              {group.parts.map(part => <button key={part.id} type="button" className={`pdc-feature-item ${part.id === selectedMechanicalPart ? "selected" : ""}`} onClick={() => { setSelectedMechanicalPart(part.id); setCommandStatus(`Pièce sélectionnée par ID : ${part.id}.`); }}>
                <span className={`pdc-dot ${part.hidden ? "warn" : part.id.startsWith("feature-") || part.id.startsWith("native-csg-") ? "cyan" : "ok"}`} /><span className="pdc-feature-name">{part.name}</span><span className="pdc-feature-meta">{part.id}</span>
              </button>)}
            </section>
          ))}
          <section className="pdc-feature-group">
            <div className="pdc-group-header"><span className="pdc-chevron open">▸</span><span className="pdc-group-label">{t("Historique paramétrique")}</span><span className="pdc-group-count">{featureHistory.length}</span></div>
            {!featureHistory.length ? <div className="pdc-feature-item pdc-history-empty">{t("Aucune feature construite")}</div> : featureHistory.map((feature, index) => <button key={feature.id} type="button" className={`pdc-feature-item mono ${feature.status === "unsupported" ? "pdc-feature-unsupported" : ""}`} onClick={() => { setSelectedMechanicalPart(mechanicalModel?.parts.some(part => part.id === feature.id) ? feature.id : feature.targetPartId ?? ""); setCommandStatus(`${feature.name} · dépendances : ${feature.dependsOn?.join(", ") || "aucune"}`); }}>
              <span className={`pdc-dot ${feature.status === "applied" ? "ok" : "warn"}`} /><span className="pdc-feature-name">{index + 1}. {feature.name}</span><span className="pdc-feature-meta">{feature.status === "applied" ? "appliquée" : "indisponible"}</span>
            </button>)}
          </section>
          <section className="pdc-feature-group">
            <div className="pdc-group-header"><span className="pdc-chevron open">▸</span><span className="pdc-group-label">{t("Variables actives")}</span><span className="pdc-group-count">{variableRows.length}</span></div>
            {variableRows.slice(0, 6).map(variable => <button key={variable.id} type="button" className="pdc-feature-item mono" onClick={() => { setSelectedVariableId(variable.id); setActiveTab("variable"); }}><span className={`pdc-dot ${variable.error ? "warn" : "cyan"}`} /><span className="pdc-feature-name">{variable.name} = {variable.value} {variable.unit}</span></button>)}
          </section>
        </aside>

        <section className={`pdc-center ${activeTab !== "part" ? "pdc-center-panel" : ""}`}>
          <div className="pdc-workspace-tabs" role="tablist" aria-label={t("Atelier paramétrique")}>
            <button role="tab" aria-selected={activeTab === "part"} className={`pdc-vp-tab ${activeTab === "part" ? "active" : ""}`} onClick={() => setActiveTab("part")}>{t("Part Studio")}</button>
            <button role="tab" aria-selected={activeTab === "variable"} className={`pdc-vp-tab ${activeTab === "variable" ? "active" : ""}`} onClick={() => setActiveTab("variable")}>{t("Variable Studio")}</button>
            <button role="tab" aria-selected={activeTab === "assembly"} className={`pdc-vp-tab ${activeTab === "assembly" ? "active" : ""}`} onClick={() => setActiveTab("assembly")}>Assemblage</button>
            <span className="pdc-spacer" />
            <label className="pdc-inline-select">Profil<select aria-label={t("Esquisse active")} value={selectedSketchId} onChange={event => selectSketchProfile(event.target.value)} disabled={!activeDesignId}><option value="">{t("Sélectionner un profil…")}</option>{!sketchProfiles.length && <option value="__create__">Créer le premier profil…</option>}{sketchProfiles.map(sketch => <option key={sketch.id} value={sketch.id}>{sketch.name} · {sketch.kind}</option>)}</select></label>
          </div>

          {activeTab === "part" && <>
            <div className="pdc-viewport">
              {mechanicalModel ? <MechanicalTwinViewport model={mechanicalModel} selected={selectedMechanicalPart} onSelect={id => { setSelectedMechanicalPart(id); setCommandStatus(`Sélection viewport synchronisée avec ${id}.`); }} view="iso" mode="solid" explosion={0} resetKey={rebuildRevision} xrayCut={1} xrayOpacity={{}} previewPartId={treePreviewEnabled ? selectedMechanicalPart : undefined} previewEnabled={treePreviewEnabled} transformEnabled={Boolean(activeDesignId)} onPartTransform={translateMechanicalPart} /> : <div className="pdc-viewport-fallback"><div><strong>{t("AUCUNE GÉOMÉTRIE CHARGÉE")}</strong><span>{t("Le viewport attend un design AeroMind sélectionné. Les dimensions ci-dessous restent un aperçu de paramètres, pas un drone généré.")}</span></div></div>}
              <div className="pdc-vp-bottom"><div className="pdc-readout">
                <span>Position X <b>{selectedPart?.position[0].toFixed(3) ?? "—"}</b></span><span>Y <b>{selectedPart?.position[1].toFixed(3) ?? "—"}</b></span><span>Z <b>{selectedPart?.position[2].toFixed(3) ?? "—"}</b></span><span>{t("Surface estimée")} <b>{metrics.wingArea?.toFixed(1) ?? "—"} m²</b></span>
              </div></div>
            </div>
            <div className="pdc-var-studio">
              <div className="pdc-vs-header"><button className="pdc-vs-tab active" onClick={() => setActiveTab("variable")}>{t("Variables ·")} {variableRows.length}</button><div className="pdc-vs-actions"><button className="pdc-vs-action" title={t("Créer une variable réelle")} onClick={() => addVariable(false)}><Plus size={13} /></button><button className="pdc-vs-action" title={t("Dupliquer la variable sélectionnée")} onClick={() => addVariable(true)}><Copy size={13} /></button></div></div>
              <div className="pdc-var-table"><table><thead><tr><th>Nom</th><th>Valeur</th><th>Unité</th><th>Plage</th><th>Curseur</th><th>{t("Type / liaison")}</th></tr></thead><tbody>
                {variableRows.slice(0, 8).map(variable => <tr key={variable.id} className={variable.id === selectedVariableId ? "pdc-selected-row" : ""} onClick={() => setSelectedVariableId(variable.id)}><td className="pdc-var-name">{variable.name}</td><td>{variable.value.toFixed(3)}</td><td className="pdc-var-unit">{variable.unit || "—"}</td><td className="pdc-var-range">{variable.min}–{variable.max}</td><td className="pdc-slider-cell"><input aria-label={`Valeur ${variable.name}`} type="range" min={variable.min} max={variable.max} step={variable.step} value={variable.value} disabled={Boolean(variable.expression || variable.error)} onChange={event => updateVariable(variable.id, Number(event.target.value))} /></td><td className="pdc-var-type">{variable.type} · {variable.appliesTo}</td></tr>)}
              </tbody></table></div>
            </div>
          </>}

          {activeTab === "variable" && <div className="pdc-variable-page">
            <div className="pdc-panel-heading"><div><span className="pdc-tag">{t("PARAMÈTRES · DESIGN ACTIF")}</span><h2>{t("Variable Studio")}</h2><p>{t("Les valeurs liées reconstruisent le design sélectionné. Les formules autorisent uniquement l’arithmétique sûre (+ − × ÷, parenthèses et références #variable).")}</p></div><div className="pdc-vs-actions"><button className="pdc-tb-btn" onClick={() => addVariable(false)}><Plus size={14} /> Ajouter</button><button className="pdc-tb-btn" onClick={() => addVariable(true)}><Copy size={14} /> Dupliquer</button></div></div>
            <div className="pdc-var-table pdc-variable-table-full"><table><thead><tr><th>Nom</th><th>Valeur</th><th>Unité</th><th>Min</th><th>Max</th><th>Pas</th><th>{t("Formule (optionnelle)")}</th><th>Liaison</th><th>Type</th><th /></tr></thead><tbody>
              {variableRows.filter(variable => !search || `${variable.id} ${variable.name} ${variable.description}`.toLowerCase().includes(search.toLowerCase())).map(variable => {
                const editable = customVariableIds.has(variable.id);
                return <tr key={variable.id} className={variable.id === selectedVariableId ? "pdc-selected-row" : ""} onClick={() => setSelectedVariableId(variable.id)}>
                  <td>{editable ? <input aria-label={`Nom ${variable.id}`} value={variable.name.replace(/^#/, "")} onChange={event => updateVariableText(variable.id, { name: event.target.value })} /> : <span className="pdc-var-name">{variable.name}</span>}</td>
                  <td><input className="pdc-number-input" aria-label={`Valeur ${variable.name}`} type="number" min={variable.min} max={variable.max} step={variable.step} value={variable.value} disabled={Boolean(variable.expression || variable.error)} onChange={event => updateVariable(variable.id, Number(event.target.value))} /></td>
                  <td>{editable ? <input aria-label={`Unité ${variable.id}`} value={variable.unit} onChange={event => updateVariableText(variable.id, { unit: event.target.value })} /> : variable.unit || "—"}</td>
                  <td>{editable ? <input className="pdc-number-input" aria-label={`Minimum ${variable.id}`} type="number" value={variable.min} onChange={event => updateVariableText(variable.id, { min: Number(event.target.value) })} /> : variable.min}</td>
                  <td>{editable ? <input className="pdc-number-input" aria-label={`Maximum ${variable.id}`} type="number" value={variable.max} onChange={event => updateVariableText(variable.id, { max: Number(event.target.value) })} /> : variable.max}</td>
                  <td>{editable ? <input className="pdc-number-input" aria-label={`Pas ${variable.id}`} type="number" min="0.000001" value={variable.step} onChange={event => updateVariableText(variable.id, { step: Number(event.target.value) })} /> : variable.step}</td>
                  <td>{editable ? <input aria-label={`Expression ${variable.id}`} placeholder={t("#wingspan * 0.1")} value={variable.expression ?? ""} onChange={event => updateVariableText(variable.id, { expression: event.target.value })} /> : "—"}{variable.error && <span className="pdc-variable-error" role="alert">{variable.error}</span>}</td>
                  <td>{editable ? <select aria-label={`Liaison ${variable.id}`} value={variable.appliesTo} onChange={event => updateVariableText(variable.id, { appliesTo: event.target.value })}>{BINDINGS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : variable.appliesTo === "metadata" ? "métadonnée" : variable.appliesTo}</td>
                  <td>{variable.type}</td>
                  <td>{editable && <button className="pdc-vs-action" aria-label={`Supprimer ${variable.name}`} title={t("Supprimer cette variable du design actif")} onClick={event => { event.stopPropagation(); deleteVariable(variable.id); }}>×</button>}</td>
                </tr>;
              })}
            </tbody></table></div>
            <div className="pdc-variable-footer"><span>{variableRows.length} variables</span><span>{t("Design :")} {resolvedProfile?.label ?? "aperçu local"}</span><span>{t("Les erreurs de formule bloquent l’enregistrement.")}</span></div>
          </div>}

          {activeTab === "assembly" && <div className="pdc-assembly-page">
            <div className="pdc-panel-heading"><div><span className="pdc-tag">{t("COMPOSANTS DU MODÈLE")}</span><h2>Assemblage</h2><p>{t("Vue de composants et transformations connues. Aucun solveur de contraintes, liaison cinématique ou vérification d’interférence n’est revendiqué.")}</p></div></div>
            {!mechanicalModel && <div className="pdc-empty-state">{t("Aucun modèle disponible. Sélectionnez un design AeroMind dans le projet.")}</div>}
            {mechanicalModel?.parts.map(part => <button key={part.id} type="button" className={`pdc-assembly-row ${selectedMechanicalPart === part.id ? "selected" : ""}`} onClick={() => setSelectedMechanicalPart(part.id)}>
              <span className={`pdc-dot ${part.hidden ? "warn" : "ok"}`} /><span className="pdc-assembly-name"><strong>{part.name}</strong><small>{part.category} · {part.id}</small></span><span className="pdc-assembly-dims">{part.size.map(value => value.toFixed(3)).join(" × ")} m</span><span className="pdc-assembly-pos">{part.position.map(value => value.toFixed(3)).join(", ")}</span>
            </button>)}
          </div>}
        </section>

        <aside className="pdc-right" aria-label={t("Inspecteur de propriété")}>
          <section className="pdc-section"><div className="pdc-section-header">{t("Inspecteur —")} {selectedFeature}</div><div className="pdc-section-body">
            {selectedPart ? <><div className="pdc-inspector-id">{t("ID stable :")} <code>{selectedPart.id}</code></div><div className="pdc-stat-grid"><div className="pdc-stat-card"><div className="pdc-label">{t("Dimensions mesh")}</div><div className="pdc-small-value">{selectedPart.size.map(value => value.toFixed(3)).join(" × ")} m</div></div><div className="pdc-stat-card"><div className="pdc-label">{t("Sommet / triangles")}</div><div className="pdc-small-value">{selectedPart.vertices.length / 3} / {selectedPart.indices.length / 3}</div></div></div></> : <p className="pdc-empty-state">{t("Sélectionnez une pièce réelle de l’arbre ou du viewport.")}</p>}
            {featureHistory.find(feature => feature.id === selectedMechanicalPart)?.status === "unsupported" && <div className="pdc-warning-note" role="note">{t("Opération indisponible : aucune modification géométrique appliquée.")}</div>}
            {selectedFeatureDependencies.length > 0 && <div className="pdc-field"><div className="pdc-field-label">{t("Dépendances de feature")}</div><div className="pdc-dependency-list">{selectedFeatureDependencies.map(dependency => <code key={dependency}>{dependency}</code>)}</div></div>}
          </div></section>

          <section className="pdc-section"><div className="pdc-section-header">{t("Section de fuselage")}</div><div className="pdc-section-body"><div className="pdc-toggle-group">{(["circular", "elliptical", "polygonal"] as const).map(section => <button key={section} className={`pdc-tg-btn ${(activeTwin?.fuselageSectionType ?? config.fuselageSectionType ?? "elliptical") === section ? "active" : ""}`} disabled={!activeDesignId} onClick={() => updateSection(section)}>{section === "circular" ? "Circulaire" : section === "elliptical" ? "Elliptique" : "Polygonale"}</button>)}</div></div></section>

          <section className="pdc-section"><div className="pdc-section-header">{t("Matériau de la pièce sélectionnée")}</div><div className="pdc-section-body"><div className="pdc-material-list">{MATERIALS.map(material => <button key={material.id} type="button" className={`pdc-material-item ${selectedMaterial === material.id ? "selected" : ""}`} disabled={!selectedPart || !activeDesignId} onClick={() => setMaterialForPart(material.id)}><span className="pdc-material-swatch" style={{ background: material.color }} /><span className="pdc-material-name">{material.name}</span><span className="pdc-material-density">{material.density}</span></button>)}</div><small className="pdc-note">{t("Affecte uniquement l’ID de pièce sélectionné. La densité affichée est une référence, pas une attribution matière certifiée ni un calcul de masse.")}</small></div></section>

          <section className="pdc-section"><div className="pdc-section-header">{t("Mesures de présélection")}</div><div className="pdc-section-body"><div className="pdc-stat-grid">
            <div className="pdc-stat-card"><div className="pdc-label">{t("Surface alaire · proxy")}</div><div className="pdc-value">{metrics.wingArea?.toFixed(2) ?? "—"}<span className="pdc-unit"> m²</span></div></div>
            <div className="pdc-stat-card"><div className="pdc-label">{t("Allongement · proxy")}</div><div className="pdc-value">{metrics.aspectRatio?.toFixed(2) ?? "—"}</div></div>
            <div className="pdc-stat-card"><div className="pdc-label">{t("Masse · proxy empirique")}</div><div className="pdc-value">{metrics.emptyMassKg === null ? "—" : `≈ ${metrics.emptyMassKg.toFixed(1)}`}<span className="pdc-unit"> {metrics.emptyMassKg === null ? "" : "kg"}</span></div></div>
            <div className="pdc-stat-card"><div className="pdc-label">{t("Centre de gravité")}</div><div className="pdc-value">{t("Non calculé")}</div></div>
            <div className="pdc-stat-card"><div className="pdc-label">{t("Cz / Cd / finesse")}</div><div className="pdc-value">{t("Non calculés")}</div></div>
            <div className="pdc-stat-card"><div className="pdc-label">{t("Inertie / CFD")}</div><div className="pdc-value">{t("Non calculées")}</div></div>
          </div><small className="pdc-note">{metrics.massExplanation} {metrics.wingAreaExplanation}</small></div></section>

          <section className="pdc-section"><div className="pdc-section-header">{t("Débattements cibles · non cinématiques")}</div><div className="pdc-section-body"><small className="pdc-note">{t("Valeurs enregistrées sur le design; la géométrie des gouvernes n’est pas animée et aucune vérification de commande n’est effectuée.")}</small>
            {([ ["aileron", "Aileron", 30], ["flap", "Volet", 40], ["elevator", "Profondeur", 25], ["rudder", "Direction", 30] ] as const).map(([key, label, maximum]) => <div className="pdc-field" key={key}><label className="pdc-field-label"><span>{label}</span><span className="pdc-unit">{activeControls[key]}°</span></label><div className="pdc-field-row"><input aria-label={`${label} en degrés`} type="range" min="0" max={maximum} step="1" value={activeControls[key]} disabled={!activeDesignId} onChange={event => setControlDeflection(key, Number(event.target.value))} className="pdc-field-slider" /></div></div>)}
          </div></section>

          <section className="pdc-section"><div className="pdc-section-header">{t("Esquisse — profil vérifié")}</div><div className="pdc-section-body">
            <label className="pdc-field-label">Type<select value={sketchKind} onChange={event => setSketchKind(event.target.value as "rectangle" | "ellipse")}><option value="rectangle">{t("Rectangle · extrusion prismatique")}</option><option value="ellipse">{t("Ellipse · révolution cylindrique simplifiée")}</option></select></label>
            <div className="pdc-field-row"><label>{t("Largeur (m)")}<input className="pdc-number-input" type="number" min="0.01" max="20" step="0.01" value={sketchWidth} onChange={event => setSketchWidth(Number(event.target.value))} /></label><label>{t("Hauteur (m)")}<input className="pdc-number-input" type="number" min="0.01" max="20" step="0.01" value={sketchHeight} onChange={event => setSketchHeight(Number(event.target.value))} /></label></div>
            <small className="pdc-note">{t("Le profil rectangulaire est extrudé en prisme; l’ellipse alimente un cylindre. Aucun sketcher contraint 2D n’est revendiqué.")}</small>
          </div></section>

          <section className="pdc-section"><div className="pdc-section-header">{t("Traitements d’arête indisponibles")}</div><div className="pdc-section-body"><p className="pdc-note">{t("Le noyau actuel ne réalise pas de congé ni de chanfrein d’arête exact. Une demande sera enregistrée comme non appliquée; elle ne remplace ni ne masque le maillage source.")}</p><div className="pdc-actions-row"><button className="pdc-tb-btn" disabled={!selectedPart} onClick={() => recordUnsupportedEdgeTreatment("fillet")}>{t("Demander congé")}</button><button className="pdc-tb-btn" disabled={!selectedPart} onClick={() => recordUnsupportedEdgeTreatment("chamfer")}>{t("Demander chanfrein")}</button></div></div></section>
        </aside>
      </main>

      <footer className="pdc-statusbar"><span className="pdc-command-status" role="status"><Check size={12} /> {commandStatus || "Prêt"}</span><span className="pdc-item"><span className="pdc-val">{mechanicalModel?.parts.length ?? 0} {t("pièces mesh")}</span></span><span className="pdc-item"><span className="pdc-val">{featureHistory.length} features</span></span><span className="pdc-item"><span className="pdc-val">{variableRows.length} variables</span></span><span className="pdc-spacer" /><span className="pdc-seg">{t("Unités SI · géométrie en mètres")}</span><span className="pdc-seg">{t("Précision industrielle non certifiée")}</span><span className="pdc-seg" style={{ color: saveState === "server" ? "var(--pdc-green)" : saveState === "error" ? "var(--pdc-red)" : "var(--pdc-amber)" }}>● {saveState === "server" ? "Accusé serveur" : saveState === "local" ? "Stockage local" : saveState === "error" ? "Échec de sauvegarde" : "Modifications non confirmées"}</span></footer>
    </div>
  );
}

export default ParametricDroneCenter;
