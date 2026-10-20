import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Box,
  Camera,
  ChevronDown,
  CircleDot,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
  EyeOff,
  Focus,
  Layers3,
  Lock,
  MessageSquarePlus,
  MousePointer2,
  Move3d,
  Plus,
  PenTool,
  Play,
  Redo2,
  Ruler,
  RotateCcw,
  Rotate3d,
  Save,
  Scissors,
  Search,
  Settings2,
  SlidersHorizontal,
  SquareDashed,
  ScanLine,
  Trash2,
  Undo2,
  Unlock,
  Upload,
} from "lucide-react";
import { defaultRequirements, runSimulation, type ConceptConfig, type SimulationResult } from "../lib/aeroEngine";
import type { AppLanguage } from "../lib/language";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import {
  applyMechanicalTwinDocument,
  mechanicalDraftKey,
  parseMechanicalTwin,
  serializeMechanicalTwin,
} from "../lib/mechanicalTwinFile";
import {
  buildMechanicalModel,
  exportMechanicalOBJ,
  exportMechanicalSTL,
  type MechanicalExtraPart,
  type MechanicalPartEdit,
  type MechanicalTwinConfig,
  type Vec3,
} from "../lib/mechanicalTwinGeometry";
import { analyzeMechanicalModel, mirrorPartMeshAcrossX, type MechanicalGeometryReview } from "../lib/mechanicalTwinReview";
import {
  MechanicalTwinViewport,
  type MechanicalRender,
  type MechanicalView,
  type XrayLayerState,
} from "./MechanicalTwinViewport";
import "./mechanical-twin.css";
import "./mechanical-twin-integration.css";

type Props = {
  design: DroneCatalogDesign;
  config: ConceptConfig;
  language: AppLanguage;
  setConfig: Dispatch<SetStateAction<ConceptConfig>>;
  exploded: boolean;
  hasProject: boolean;
  onOpenCatalog: () => void;
  onPresentation: (mode: "horizon" | "exploded") => void;
  studioRenderMode?: "assembly" | "internals" | "kinematics" | "simulation" | "variants";
  onStudioRenderModeChange?: (mode: "assembly" | "internals" | "kinematics" | "simulation" | "variants") => void;
  kinematicsPlaying?: boolean;
};
const geometryKeys = [
  "wingspan",
  "fuselageLength",
  "chord",
  "propDiameter",
  "motorCount",
  "mechanicalTwin",
  "mechanicalTwins",
] as const;
type GeometrySnapshot = Pick<ConceptConfig, (typeof geometryKeys)[number]>;
type MechanicalRevision = { id: string; label: string; createdAt: string; snapshot: GeometrySnapshot };
type TwinNavSection = "Mechanical Twin" | "Conception" | "Simulation" | "Analyse" | "Fabrication" | "Données" | "Collaboration";
const revisionKey = (designId: string) => `aeromind-mechanical-revisions-v1:${designId}`;
function snapshot(c: ConceptConfig): GeometrySnapshot {
  return structuredClone(
    Object.fromEntries(geometryKeys.map((k) => [k, c[k]])),
  ) as GeometrySnapshot;
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function NumberField({
  label,
  value,
  min = 0.01,
  max = 30,
  step = 0.01,
  unit = "m",
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mt-number-field">
      <span>
        {label}
        <small>{unit}</small>
      </span>
      <input
        aria-label={label}
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : min}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
      />
    </label>
  );
}
export function MechanicalTwinEditor({
  design,
  config,
  language,
  setConfig,
  exploded,
  hasProject,
  onOpenCatalog,
  onPresentation,
  studioRenderMode,
  onStudioRenderModeChange,
  kinematicsPlaying = false,
}: Props) {
  const [selected, setSelected] = useState("fuselage");
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<MechanicalView>("iso");
  const [mode, setMode] = useState<MechanicalRender>(studioRenderMode === "internals" ? "xray" : "solid");
  const [forceVector, setForceVector] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [separation, setSeparation] = useState(0.7);
  const [inspector, setInspector] = useState<"shape" | "part">("shape");
  const [undo, setUndo] = useState<GeometrySnapshot[]>([]);
  const [redo, setRedo] = useState<GeometrySnapshot[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [activeCadTool, setActiveCadTool] = useState("Sélection");
  const [activeTwinNav, setActiveTwinNav] = useState<TwinNavSection>("Mechanical Twin");
  const [revisions, setRevisions] = useState<MechanicalRevision[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState("");
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [geometryReview, setGeometryReview] = useState<MechanicalGeometryReview | null>(null);
  const [physicalWorkshopConfirmed, setPhysicalWorkshopConfirmed] = useState(false);
  const [xrayCut, setXrayCut] = useState(1);
  const [xrayOpacity, setXrayOpacity] = useState<XrayLayerState>({});
  const [xrayIsolatedLayer, setXrayIsolatedLayer] = useState("");
  const [xrayPresetName, setXrayPresetName] = useState("");
  const [xrayPresets, setXrayPresets] = useState<Record<string, { cut: number; opacity: XrayLayerState; isolated: string }>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const current = useRef(config);
  current.current = config;
  useEffect(() => {
    if (studioRenderMode) setMode(studioRenderMode === "internals" ? "xray" : "solid");
  }, [studioRenderMode]);
  const changeRenderMode = (next: MechanicalRender) => {
    if (studioRenderMode !== undefined) {
      onStudioRenderModeChange?.(next === "xray" ? "internals" : "assembly");
      return;
    }
    setMode(next);
  };
  const activeSettings =
    config.mechanicalTwin?.designId === design.id
      ? config.mechanicalTwin
      : config.mechanicalTwins?.[design.id];
  const effectiveConfig = useMemo(
    () => ({ ...config, mechanicalTwin: activeSettings }),
    [config, activeSettings],
  );
  const model = useMemo(
    () => buildMechanicalModel(design, effectiveConfig),
    [design, effectiveConfig],
  );
  const renderModel = useMemo(() => ({
    ...model,
    parts: model.parts.map((part) => {
      const layer = config.studioLayerAssignments?.[part.id];
      const settings = layer ? config.studioLayerSettings?.[layer] : undefined;
      const meta = layer ? config.studioLayerMeta?.[layer] : undefined;
      return {
        ...part,
        hidden: part.hidden || settings?.visible === false,
        color: meta?.color || part.color,
        opacity: Math.max(0, Math.min(1, (meta?.opacity ?? 100) / 100)),
      };
    }),
  }), [model, config.studioLayerAssignments, config.studioLayerSettings, config.studioLayerMeta]);
  const selectedPart = model.parts.find((p) => p.id === selected);
  const edit = model.settings.edits?.[selected] ?? {};
  const groups = useMemo(
    () => [...new Set(model.parts.map((p) => p.category))],
    [model],
  );
  useEffect(() => {
    setUndo([]);
    setRedo([]);
    setSelected("");
    setView("iso");
    setInspector("shape");
    setDraftMessage("");
    setResetKey((k) => k + 1);
  }, [design.id]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(revisionKey(design.id)) ?? "[]");
      setRevisions(Array.isArray(saved) ? saved.filter((item): item is MechanicalRevision => Boolean(item && typeof item.id === "string" && typeof item.label === "string" && item.snapshot && typeof item.snapshot === "object")) : []);
    } catch { setRevisions([]); }
    setSelectedRevisionId("");
  }, [design.id]);
  useEffect(() => {
    const key = `aeromind-xray-controls-v1:${design.id}`;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      if (saved && typeof saved === "object") {
        setXrayCut(typeof saved.cut === "number" ? saved.cut : 1);
        setXrayOpacity(saved.opacity ?? {});
        setXrayIsolatedLayer(typeof saved.isolated === "string" ? saved.isolated : "");
        setXrayPresets(saved.presets ?? {});
      }
    } catch { /* local storage is optional */ }
  }, [design.id]);
  useEffect(() => {
    try {
      localStorage.setItem(`aeromind-xray-controls-v1:${design.id}`, JSON.stringify({ cut: xrayCut, opacity: xrayOpacity, isolated: xrayIsolatedLayer, presets: xrayPresets }));
    } catch { /* local storage is optional */ }
  }, [design.id, xrayCut, xrayOpacity, xrayIsolatedLayer, xrayPresets]);
  const resetXray = () => {
    setXrayCut(1);
    setXrayOpacity({});
    setXrayIsolatedLayer("");
  };
  const saveXrayPreset = () => {
    const name = xrayPresetName.trim();
    if (!name) return;
    setXrayPresets((current) => ({ ...current, [name]: { cut: xrayCut, opacity: xrayOpacity, isolated: xrayIsolatedLayer } }));
    setXrayPresetName("");
  };
  const loadXrayPreset = (name: string) => {
    const preset = xrayPresets[name];
    if (!preset) return;
    setXrayCut(preset.cut);
    setXrayOpacity(preset.opacity);
    setXrayIsolatedLayer(preset.isolated);
  };
  const apply = (mutate: (c: ConceptConfig) => ConceptConfig) => {
    setUndo((u) => [...u, snapshot(current.current)].slice(-50));
    setRedo([]);
    setConfig(mutate);
  };
  const updateSettings = (
    mutate: (s: MechanicalTwinConfig) => MechanicalTwinConfig,
  ) =>
    apply((c) => {
      const source =
        c.mechanicalTwin?.designId === design.id
          ? c.mechanicalTwin
          : (c.mechanicalTwins?.[design.id] ?? model.settings);
      const next = mutate(structuredClone(source));
      return {
        ...c,
        mechanicalTwin: next,
        mechanicalTwins: { ...c.mechanicalTwins, [design.id]: next },
      };
    });
  const updatePart = (patch: MechanicalPartEdit) =>
    updateSettings((s) => ({
      ...s,
      edits: { ...s.edits, [selected]: { ...s.edits?.[selected], ...patch } },
    }));
  const changeGlobal = (
    key:
      | "wingspan"
      | "fuselageLength"
      | "chord"
      | "propDiameter"
      | "motorCount",
    value: number,
  ) =>
    apply((c) => ({
      ...c,
      [key]: key === "motorCount" ? Math.round(value) : value,
      ...(key === "wingspan"
        ? {
            propDiameter: Math.min(c.propDiameter, Math.max(0.1, value * 0.65)),
          }
        : {}),
    }));
  const choosePart = (id: string) => {
    setSelected(id);
    setInspector("part");
  };
  const captureWorkbench = () => {
    const canvas = document.querySelector<HTMLCanvasElement>(".mechanical-twin canvas");
    try {
      const vectorView = document.querySelector<SVGSVGElement>(".mt-viewport svg");
      const image = canvas
        ? canvas.toDataURL("image/jpeg", 0.78)
        : vectorView
          ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(vectorView))}`
          : "";
      if (!image) { setDraftMessage("Aucune vue du jumeau mécanique disponible à capturer."); return; }
      localStorage.setItem("aeromind-workbench-capture", image);
      window.dispatchEvent(new CustomEvent("aeromind-workbench-capture", { detail: image }));
      setDraftMessage("Capture du poste enregistrée dans ce navigateur et ajoutée au rapport révisable.");
    } catch { setDraftMessage("Capture impossible (canvas indisponible ou stockage local saturé). Essayez la capture d’écran du navigateur."); }
  };
  const preparePhysicalInspection = () => {
    if (!physicalWorkshopConfirmed) return;
    setDraftMessage(language === "en"
      ? "Inspection dossier prepared · qualified operator, approved equipment and local radiation-safety controls remain mandatory."
      : "Dossier d’inspection préparé · opérateur qualifié, équipement homologué et contrôles locaux de radioprotection restent obligatoires.");
  };
  const history = (direction: "undo" | "redo") => {
    const stack = direction === "undo" ? undo : redo;
    const previous = stack.at(-1);
    if (!previous) return;
    const now = snapshot(current.current);
    if (direction === "undo") {
      setUndo((u) => u.slice(0, -1));
      setRedo((r) => [...r, now]);
    } else {
      setRedo((r) => r.slice(0, -1));
      setUndo((u) => [...u, now]);
    }
    setConfig((c) => ({ ...c, ...previous }));
  };
  const addPart = (kind: "box" | "cylinder") => {
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    updateSettings((s) => ({
      ...s,
      extraParts: [
        ...(s.extraParts ?? []),
        {
          id,
          name: kind === "box" ? "Module personnalisé" : "Support cylindrique",
          kind,
          size: [0.16, 0.12, 0.22] as Vec3,
          position: [0, 0.3, 0] as Vec3,
          color: "#bbcbd2",
        },
      ],
    }));
    choosePart(id);
  };
  const createLayerFromSelected = () => {
    if (!selectedPart) {
      setDraftMessage("Sélectionnez une pièce du drone ou un matériel installé avant de créer un calque.");
      return;
    }
    const suggested = `${selectedPart.name} · calque`;
    const requested = window.prompt("Nom du calque créé depuis la pièce sélectionnée", suggested);
    if (!requested?.trim()) return;
    const base = requested.trim();
    const existing = config.studioLayers ?? [];
    const name = existing.includes(base) ? `${base} ${existing.length + 1}` : base;
    apply((current) => ({
      ...current,
      studioLayers: [...(current.studioLayers ?? []), name],
      activeStudioLayer: name,
      studioLayerSettings: { ...current.studioLayerSettings, [name]: { visible: true, locked: false } },
      studioLayerAssignments: { ...current.studioLayerAssignments, [selectedPart.id]: name },
    }));
    setDraftMessage(`Calque « ${name} » créé et affecté à « ${selectedPart.name} ».`);
  };
  const resetModel = () => {
    apply((c) => {
      const saved = { ...c.mechanicalTwins };
      delete saved[design.id];
      return {
        ...c,
        wingspan: design.configuration.wingspan ?? c.wingspan,
        fuselageLength: design.configuration.fuselageLength ?? c.fuselageLength,
        chord: design.configuration.chord ?? c.chord,
        propDiameter: design.configuration.propDiameter ?? c.propDiameter,
        motorCount: design.configuration.motorCount ?? c.motorCount,
        mechanicalTwin: undefined,
        mechanicalTwins: saved,
      };
    });
    setResetKey((k) => k + 1);
  };
  const changeVector = (
    field: "offset" | "rotation" | "scale",
    axis: number,
    value: number,
  ) => {
    const vec: Vec3 = [
      ...(edit[field] ?? (field === "scale" ? [1, 1, 1] : [0, 0, 0])),
    ] as Vec3;
    vec[axis] = value;
    updatePart({ [field]: vec });
  };
  const restoreDocument = (text: string) => {
    try {
      parseMechanicalTwin(text, design.id);
      apply((c) => applyMechanicalTwinDocument(c, text, design.id));
      setDraftMessage(
        "Brouillon restauré · modifications locales, aucune écriture serveur.",
      );
      setResetKey((k) => k + 1);
    } catch (cause) {
      setDraftMessage(
        cause instanceof Error ? cause.message : "Restauration impossible.",
      );
    }
  };
  const saveDraft = () => {
    try {
      localStorage.setItem(
        mechanicalDraftKey(design.id),
        serializeMechanicalTwin(design.id, effectiveConfig, model.settings),
      );
      setDraftMessage(
        "Brouillon mécanique enregistré sur ce navigateur · restauration manuelle disponible pour cette cellule.",
      );
    } catch {
      setDraftMessage(
        "Stockage local indisponible ou plein. Exportez la configuration JSON pour la conserver.",
      );
    }
  };
  const loadDraft = () => {
    try {
      const text = localStorage.getItem(mechanicalDraftKey(design.id));
      if (text) restoreDocument(text);
      else
        setDraftMessage(
          "Aucun brouillon enregistré pour cette cellule sur ce navigateur.",
        );
    } catch {
      setDraftMessage("Le stockage local est indisponible.");
    }
  };
  const openDockTab = (tab: "assembly" | "cad" | "layers") => {
    window.dispatchEvent(new CustomEvent("aeromind-twin-dock", { detail: tab }));
  };
  const runTwinSimulation = () => {
    const result = runSimulation(config, defaultRequirements, `SIM-TWIN-${Date.now()}`);
    setSimulationResult(result);
    setGeometryReview(null);
    setActiveTwinNav("Simulation");
    setDraftMessage(`Calcul local ${result.runId} terminé · autonomie indicative ${result.enduranceH.toFixed(2)} h · aucune commande matérielle.`);
  };
  const runGeometryReview = () => {
    const result = analyzeMechanicalModel(model);
    setGeometryReview(result);
    setSimulationResult(null);
    setActiveTwinNav("Analyse");
    setDraftMessage(`Diagnostic géométrique terminé · ${result.findings.length} constat(s) · contrôle local du maillage uniquement.`);
  };
  const saveRevision = () => {
    const createdAt = new Date().toISOString();
    const revision: MechanicalRevision = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: `V${revisions.length + 1} · ${new Date(createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`,
      createdAt,
      snapshot: snapshot(current.current),
    };
    const next = [...revisions, revision].slice(-30);
    setRevisions(next);
    setSelectedRevisionId(revision.id);
    try {
      localStorage.setItem(revisionKey(design.id), JSON.stringify(next));
      setDraftMessage(`Révision ${revision.label} enregistrée localement pour ${design.label}.`);
    } catch { setDraftMessage("Historique non enregistré · stockage du navigateur indisponible."); }
  };
  const restoreRevision = (id: string) => {
    const revision = revisions.find(item => item.id === id);
    if (!revision) return;
    apply(c => ({ ...c, ...structuredClone(revision.snapshot) }));
    setSimulationResult(null);
    setGeometryReview(null);
    setDraftMessage(`Révision ${revision.label} restaurée · annulation disponible dans la barre d’outils.`);
  };
  const compareRevision = () => {
    const revision = revisions.find(item => item.id === selectedRevisionId);
    if (!revision) { setDraftMessage("Sélectionnez une révision enregistrée avant de comparer."); return; }
    const old = revision.snapshot;
    const now = snapshot(current.current);
    const dimensions: Array<[keyof GeometrySnapshot, string]> = [["wingspan", "envergure"], ["fuselageLength", "longueur fuselage"], ["chord", "corde"], ["propDiameter", "diamètre hélice"], ["motorCount", "nombre de moteurs"]];
    const changed = dimensions.filter(([key]) => old[key] !== now[key]).map(([key, label]) => `${label}: ${String(old[key])} → ${String(now[key])}`);
    if (JSON.stringify(old.mechanicalTwin) !== JSON.stringify(now.mechanicalTwin)) changed.push("paramètres et pièces mécaniques modifiés");
    setDraftMessage(changed.length ? `Comparaison ${revision.label} → état actuel · ${changed.join(" ; ")}` : `Comparaison ${revision.label} → état actuel · aucun écart géométrique détecté.`);
  };
  const applyFillet = () => {
    const extra = model.settings.extraParts?.find(part => part.id === selected);
    if (!selectedPart || !extra || !["box", "roundedBox"].includes(extra.kind)) {
      setDraftMessage("Congé non appliqué · cette opération géométrique est disponible uniquement sur un module cubique personnalisé.");
      return;
    }
    const minDimension = Math.min(...extra.size);
    const maxRadius = Math.max(0.001, minDimension / 2 - 0.0001);
    const radius = extra.kind === "roundedBox" ? Math.min(maxRadius, (extra.radius ?? minDimension * 0.08) * 1.5) : Math.min(maxRadius, minDimension * 0.08);
    updateSettings(settings => ({ ...settings, extraParts: settings.extraParts?.map(part => part.id === extra.id ? { ...part, kind: "roundedBox", radius } : part) }));
    setDraftMessage(`Congé géométrique réellement construit sur « ${extra.name} » · rayon ${radius.toFixed(3)} m.`);
  };
  const mirrorSelected = () => {
    if (!selectedPart) { setDraftMessage("Symétrie impossible · sélectionnez une pièce dans l’arborescence ou la scène."); return; }
    const mesh = mirrorPartMeshAcrossX(selectedPart);
    const xs = mesh.vertices.filter((_, index) => index % 3 === 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const width = maxX - minX;
    if (width <= 1e-8 || Math.abs((minX + maxX) / 2) <= width * 0.05) {
      setDraftMessage(`Symétrie non créée · « ${selectedPart.name} » est déjà centré sur le plan médian X=0.`);
      return;
    }
    const ys = mesh.vertices.filter((_, index) => index % 3 === 1);
    const zs = mesh.vertices.filter((_, index) => index % 3 === 2);
    const mirrored: MechanicalExtraPart = {
      id: `mirror-${selectedPart.id}-${Date.now()}`,
      name: `Miroir de ${selectedPart.name}`,
      kind: "mesh",
      size: [width, Math.max(...ys) - Math.min(...ys), Math.max(...zs) - Math.min(...zs)],
      position: [0, 0, 0],
      color: selectedPart.color,
      vertices: mesh.vertices,
      indices: mesh.indices,
    };
    updateSettings(settings => ({ ...settings, extraParts: [...(settings.extraParts ?? []), mirrored] }));
    setSelected(mirrored.id);
    setDraftMessage(`Copie miroir exacte de « ${selectedPart.name} » créée au plan X=0 · géométrie exportable en OBJ.`);
  };
  const runNavigationAction = (section: TwinNavSection) => {
    setActiveTwinNav(section);
    if (section === "Mechanical Twin" || section === "Conception") {
      setInspector(section === "Conception" ? "shape" : inspector);
      document.querySelector(".mt-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (section === "Simulation") runTwinSimulation();
    else if (section === "Analyse") runGeometryReview();
    else if (section === "Fabrication") {
      download(`${design.id}-mecanique.stl`, exportMechanicalSTL(model), "model/stl;charset=utf-8");
      setDraftMessage("Maillage triangulé STL ASCII exporté en mètres · modèle conceptuel non qualifié pour fabrication.");
    } else if (section === "Données") {
      download(`${design.id}-twin-parametrique.json`, serializeMechanicalTwin(design.id, effectiveConfig, model.settings), "application/json");
      setDraftMessage("Configuration mécanique JSON exportée pour échange ou archivage.");
    } else if (section === "Collaboration") {
      const payload = serializeMechanicalTwin(design.id, effectiveConfig, model.settings);
      void navigator.clipboard?.writeText(payload).then(() => setDraftMessage("Configuration JSON copiée · partage manuel possible; aucun service collaboratif distant n’est connecté.")).catch(() => {
        download(`${design.id}-twin-a-partager.json`, payload, "application/json");
        setDraftMessage("Presse-papiers indisponible · fichier JSON de partage téléchargé; aucun service collaboratif distant n’est connecté.");
      });
    }
  };
  const runCadTool = (label: string) => {
    setActiveCadTool(label);
    if (label === "Nouveau") resetModel();
    else if (label === "Extrusion") addPart("box");
    else if (label === "Révolution") addPart("cylinder");
    else if (label === "Esquisse") { setInspector("part"); setDraftMessage("L’esquisse 2D s’édite dans le module Dessin du Studio IDDS; ici, utilisez les modules pour ajouter une géométrie 3D."); }
    else if (label === "Congé") applyFillet();
    else if (label === "Symétrie") mirrorSelected();
    else if (label === "Plan") setView("top");
    else if (label === "Axe") setView("front");
    else if (label === "Vue en coupe") changeRenderMode("xray");
    else if (label === "Explosion") onPresentation(exploded ? "horizon" : "exploded");
    else if (label === "Nomenclature") openDockTab("assembly");
    else if (label === "Mesurer" || label === "Cotes" || label === "Tolérances") openDockTab("cad");
    else if (label === "Exporter") runNavigationAction("Données");
  };
  const runRailTool = (label: string) => {
    setActiveCadTool(label);
    if (label === "Sélection") setInspector("part");
    else if (label === "Transformation") setInspector("part");
    else if (label === "Caméra") setResetKey((key) => key + 1);
    else if (label === "Dessin") { if (studioRenderMode !== undefined) document.getElementById("studio-sketch-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" }); else setMode("wireframe"); setDraftMessage("L’esquisse éditable est disponible dans le module Dessin du Studio IDDS."); }
    else if (label === "Mesure") openDockTab("cad");
    else if (label === "Annotation") openDockTab("layers");
    else if (label === "Simulation") runTwinSimulation();
    else if (label === "Rendu") changeRenderMode("solid");
  };
  return (
    <section
      className={`mechanical-twin mt-forge ${studioRenderMode !== undefined ? "has-external-render-mode" : ""}`}
      aria-label="Atelier mécanique paramétrique du drone sélectionné"
    >
      <header className="mt-header">
        <div className="mt-monogram">
          <Box size={21} />
        </div>
        <div>
          <span>AEROMIND / DIGITAL TWIN EXPLORER</span>
          <h2>
            FORGE<span>ATELIER MÉCANIQUE PARAMÉTRIQUE</span>
          </h2>
        </div>
        <div className="mt-local">
          <i /> ÉDITABLE · LOCAL
        </div>
        <button className="mt-tool" onClick={onOpenCatalog}>
          <Box size={13} /> Changer de cellule
        </button>
        <nav className="mt-forge-toolbar" aria-label="Outils FORGE">
          <button type="button" className={activeCadTool === "Sélection" ? "active" : ""} onClick={() => { setActiveCadTool("Sélection"); setInspector("part"); }}><MousePointer2 size={14} /> Sélection</button>
          <button type="button" className={activeCadTool === "Dessin" ? "active" : ""} onClick={() => runRailTool("Dessin")}><PenTool size={14} /> Dessin</button>
          <button type="button" className={activeCadTool === "Transformation" ? "active" : ""} onClick={() => { runRailTool("Transformation"); document.querySelector(".mt-inspector")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }}><Move3d size={14} /> Déplacer</button>
          <button type="button" className={activeCadTool === "Correction" ? "active" : ""} onClick={() => { setActiveCadTool("Correction"); setInspector("part"); if (selectedPart) applyFillet(); else setDraftMessage("Sélectionnez un module pour accéder aux corrections géométriques."); }}><Settings2 size={14} /> Correction</button>
          <button type="button" className={activeCadTool === "Créer" ? "active" : ""} onClick={() => { setActiveCadTool("Créer"); addPart("box"); }}><Plus size={14} /> Créer</button>
          <select aria-label="Projection du modèle" value={view} onChange={(event) => setView(event.target.value as MechanicalView)}><option value="iso">Perspective</option><option value="top">Dessus</option><option value="front">Face</option><option value="side">Profil</option></select>
          {studioRenderMode === undefined && <select aria-label="Style de rendu" value={mode} onChange={(event) => changeRenderMode(event.target.value as MechanicalRender)}><option value="solid">Solide</option><option value="wireframe">Filaire</option><option value="xray">X-ray</option></select>}
          <button type="button" disabled={!undo.length} title="Annuler" aria-label="Annuler" onClick={() => history("undo")}><Undo2 size={14} /></button>
          <button type="button" disabled={!redo.length} title="Rétablir" aria-label="Rétablir" onClick={() => history("redo")}><Redo2 size={14} /></button>
          <select aria-label="Analyse et exports" value="" onChange={(event) => { if (event.target.value) runNavigationAction(event.target.value as TwinNavSection); }}><option value="">Plus d’outils…</option><option value="Simulation">Simulation</option><option value="Analyse">Analyse géométrique</option><option value="Fabrication">Exporter STL</option><option value="Données">Exporter les données</option><option value="Collaboration">Partager JSON</option></select>
        </nav>
      </header>
      <div className="mt-proposal-nav" aria-label="Navigation atelier professionnel">
        <strong>AeroMind</strong>{(["Mechanical Twin", "Conception", "Simulation", "Analyse", "Fabrication", "Données", "Collaboration"] as TwinNavSection[]).map(section => <button type="button" key={section} className={activeTwinNav === section ? "active" : ""} aria-current={activeTwinNav === section ? "page" : undefined} onClick={() => runNavigationAction(section)}>{section}</button>)}<em>Projet local · v1.4</em>
      </div>
      {simulationResult && <section className="mt-action-report" aria-label="Résultats du calcul de performance"><header><strong>SIMULATION DE PERFORMANCE · ESTIMATION LOCALE</strong><button type="button" onClick={() => setSimulationResult(null)}>Fermer</button></header><div className="mt-action-report-grid"><span>Masse calculée<strong>{simulationResult.totalMassKg.toFixed(2)} kg</strong></span><span>Puissance estimée<strong>{simulationResult.estimatedPowerW.toFixed(0)} W</strong></span><span>Endurance estimée<strong>{simulationResult.enduranceH.toFixed(2)} h</strong></span><span>Portée estimée<strong>{simulationResult.rangeKm.toFixed(1)} km</strong></span></div><small>{simulationResult.method} · confiance {simulationResult.confidence} · pas de calcul CFD/FEA ni commande matérielle.</small></section>}
      {geometryReview && <section className="mt-action-report" aria-label="Rapport de contrôle du maillage"><header><strong>ANALYSE DU MAILLAGE · {geometryReview.passed ? "CONTRÔLE DE COHÉRENCE PASSÉ" : "ANOMALIES DÉTECTÉES"}</strong><button type="button" onClick={() => setGeometryReview(null)}>Fermer</button></header><div className="mt-action-report-grid"><span>Pièces visibles<strong>{geometryReview.visiblePartCount}/{geometryReview.partCount}</strong></span><span>Sommets<strong>{geometryReview.vertexCount.toLocaleString("fr-FR")}</strong></span><span>Triangles<strong>{geometryReview.triangleCount.toLocaleString("fr-FR")}</strong></span><span>Index invalides<strong>{geometryReview.invalidIndexCount}</strong></span></div><ul>{geometryReview.findings.map((finding, index) => <li key={`${index}-${finding}`}>{finding}</li>)}</ul><small>Contrôle structurel du fichier maillé uniquement · aucune analyse de contraintes, résistance ou sécurité de vol.</small></section>}
      <div className="mt-cad-command-bar" aria-label="Commandes CAO et assemblage">
        {[["Nouveau", Plus], ["Esquisse", PenTool], ["Extrusion", Box], ["Révolution", Rotate3d], ["Congé", CircleDot], ["Symétrie", Copy], ["Plan", SquareDashed], ["Axe", Move3d], ["Vue en coupe", Scissors], ["Explosion", Layers3], ["Nomenclature", ClipboardCheck], ["Mesurer", Ruler], ["Cotes", Ruler], ["Tolérances", SlidersHorizontal]].map(([label, Icon]) => <button key={String(label)} type="button" title={String(label)} className={activeCadTool === String(label) ? "active" : ""} onClick={() => runCadTool(String(label))}><Icon size={14} /><small>{String(label)}</small></button>)}
        <button className="mt-command-primary" type="button" onClick={() => runCadTool("Exporter")}><Download size={14} /><small>Exporter</small></button>
      </div>
      <div className="mt-toolbar">
        <div
          className="mt-view-tabs"
          role="group"
          aria-label="Projection mécanique"
        >
          {(["iso", "top", "front", "side"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={view === v ? "active" : ""}
            >
              {{ iso: "ISO", top: "DESSUS", front: "FACE", side: "PROFIL" }[v]}
            </button>
          ))}
        </div>
        {studioRenderMode === undefined && <select
          aria-label="Style de rendu"
          value={mode}
          onChange={(e) => changeRenderMode(e.target.value as MechanicalRender)}
        >
          <option value="solid">Solide / matériaux</option>
          <option value="wireframe">Filaire technique</option>
          <option value="xray">{language === "en" ? "X-ray transparency" : "Transparence X-ray"}</option>
        </select>}
        <button className="mt-tool" type="button" onClick={captureWorkbench} title={language === "en" ? "Save a capture of the mechanical view in the report" : "Enregistrer une capture de la vue mécanique dans le rapport"}><Camera size={13} /> {language === "en" ? "Capture view" : "Capturer la vue"}</button>
        <button
          className={forceVector ? "mt-tool active" : "mt-tool"}
          aria-label="Mode de compatibilité mécanique"
          aria-pressed={forceVector}
          title="Même géométrie éditable, projetée sans WebGL"
          onClick={() => setForceVector((v) => !v)}
        >
          <Box size={13} /> Compatibilité
        </button>
        <button
          className={exploded ? "mt-tool active" : "mt-tool"}
          aria-pressed={exploded}
          onClick={() => onPresentation(exploded ? "horizon" : "exploded")}
        >
          <Layers3 size={14} /> Éclaté
        </button>
        <span className="mt-toolbar-spacer" />
        <button
          className="mt-icon"
          title="Annuler la modification"
          aria-label="Annuler la modification"
          disabled={!undo.length}
          onClick={() => history("undo")}
        >
          <Undo2 size={15} />
        </button>
        <button
          className="mt-icon"
          title="Rétablir la modification"
          aria-label="Rétablir la modification"
          disabled={!redo.length}
          onClick={() => history("redo")}
        >
          <Redo2 size={15} />
        </button>
        <button
          className="mt-icon"
          title="Recentrer la caméra"
          aria-label="Recentrer la caméra"
          onClick={() => setResetKey((k) => k + 1)}
        >
          <Focus size={15} />
        </button>
        <button
          className="mt-icon"
          title="Revenir aux paramètres de la cellule (annulable)"
          aria-label="Réinitialiser le modèle"
          onClick={resetModel}
        >
          <RotateCcw size={15} />
        </button>
      </div>
      {mode === "xray" && <div className="mt-xray-note" role="note"><strong>{language === "en" ? "X-RAY VIEW · DIGITAL MODEL" : "VISUALISATION X-RAY · MODÈLE NUMÉRIQUE"}</strong><span>{language === "en" ? "This render is not a real radiograph and does not reveal hidden parts in physical hardware. It only inspects layers of the digital twin. For non-destructive inspection of a real drone, use a qualified operator and approved equipment, following local radiation-safety rules." : "Ce rendu ne produit pas de radiographie réelle et ne révèle aucune pièce cachée du matériel physique. Il sert uniquement à inspecter les couches du jumeau numérique. Pour une inspection non destructive d’un drone réel, faire appel à un opérateur qualifié et à un équipement homologué ; suivre les règles locales de radioprotection."}</span></div>}
      {mode === "xray" && <section className="mt-xray-controls" aria-label={language === "en" ? "Manual X-ray layer control" : "Contrôle manuel des couches X-ray"}>
        <div className="mt-xray-control-heading"><strong>{language === "en" ? "MODULE 1 · MANUAL LAYER CONTROL" : "MODULE 1 · CONTRÔLE MANUEL PAR COUCHES"}</strong><button type="button" className="mt-tool" onClick={resetXray}><RotateCcw size={12} /> {language === "en" ? "Reset" : "Réinitialiser"}</button></div>
        <label className="mt-xray-cut"><span>{language === "en" ? "Cutting-plane depth" : "Profondeur du plan de coupe"}<b>{Math.round(xrayCut * 100)} %</b></span><input aria-label={language === "en" ? "Cutting-plane depth" : "Profondeur du plan de coupe"} type="range" min="0" max="1" step="0.01" value={xrayCut} onChange={(event) => setXrayCut(Number(event.target.value))} /></label>
        <div className="mt-xray-layers">{groups.map((group) => <div className="mt-xray-layer" key={group}><button type="button" className={xrayIsolatedLayer === group ? "active" : ""} onClick={() => setXrayIsolatedLayer(xrayIsolatedLayer === group ? "" : group)} title={language === "en" ? "Isolate this layer" : "Isoler cette couche"}><Layers3 size={12} /><span>{group}</span></button><input aria-label={`${language === "en" ? "Opacity" : "Opacité"} ${group}`} type="range" min="0" max="100" step="1" value={xrayOpacity[group] ?? 100} onChange={(event) => setXrayOpacity((current) => ({ ...current, [group]: Number(event.target.value) }))} /><b>{xrayOpacity[group] ?? 100}%</b></div>)}</div>
        <div className="mt-xray-presets"><input aria-label={language === "en" ? "Preset name" : "Nom du préréglage"} placeholder={language === "en" ? "Preset name" : "Nom du préréglage"} value={xrayPresetName} onChange={(event) => setXrayPresetName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveXrayPreset(); }} /><button type="button" className="mt-tool" onClick={saveXrayPreset} disabled={!xrayPresetName.trim()}><Save size={12} /> {language === "en" ? "Save preset" : "Enregistrer"}</button><select aria-label={language === "en" ? "Load X-ray preset" : "Charger un préréglage X-ray"} value="" onChange={(event) => loadXrayPreset(event.target.value)}><option value="">{language === "en" ? "Load preset…" : "Charger…"}</option>{Object.keys(xrayPresets).map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
        <small>{language === "en" ? "Touch-friendly controls · presets are stored locally for this airframe." : "Commandes tactiles · les préréglages sont conservés localement pour cette cellule."}</small>
      </section>}
      {mode === "xray" && <section className="mt-xray-workshop" aria-label={language === "en" ? "Physical workshop X-ray inspection" : "Inspection X-ray en atelier physique"}>
        <div><strong>{language === "en" ? "BUILD IN THE PHYSICAL WORKSHOP" : "CONSTRUIRE DANS L’ATELIER PHYSIQUE"}</strong><span>{language === "en" ? "Prepare a controlled, non-destructive inspection dossier for the engineer on site." : "Préparez un dossier d’inspection non destructive contrôlé pour l’ingénieur sur site."}</span></div>
        <label><input type="checkbox" checked={physicalWorkshopConfirmed} onChange={(event) => setPhysicalWorkshopConfirmed(event.target.checked)} /> {language === "en" ? "Authorized physical workshop / laboratory" : "Atelier / laboratoire physique autorisé"}</label>
        <button className="mt-tool" type="button" disabled={!physicalWorkshopConfirmed} onClick={preparePhysicalInspection}><Camera size={13} /> {language === "en" ? "Prepare inspection dossier" : "Préparer le dossier d’inspection"}</button>
        <small>{language === "en" ? "Digital planning only: no radiation is generated and no real device is controlled." : "Planification numérique uniquement : aucun rayonnement n’est produit et aucun appareil réel n’est commandé."}</small>
      </section>}
      <div className="mt-workspace">
        <aside className="mt-compositing-rail" aria-label="Outils de compositing">{[["Sélection", MousePointer2], ["Transformation", Move3d], ["Caméra", Camera], ["Dessin", PenTool], ["Mesure", Ruler], ["Annotation", MessageSquarePlus], ["Simulation", Play], ["Rendu", ScanLine]].map(([label, Icon]) => <button key={String(label)} className={activeCadTool === String(label) ? "active" : ""} title={String(label)} onClick={() => runRailTool(String(label))}><Icon size={16} /></button>)}</aside>
        <aside className="mt-tree">
          <div className="mt-panel-heading">
            <span>ASSEMBLAGE MÉCANIQUE</span>
            <small>{model.parts.length.toString().padStart(2, "0")}</small>
          </div>
          <label className="mt-search">
            <Search size={12} />
            <input
              aria-label="Rechercher une pièce mécanique"
              placeholder="Rechercher une pièce…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <div className="mt-tree-scroll">
            {groups.map((group) => (
              <div key={group} className="mt-part-group">
                <h3>
                  <ChevronDown size={12} />
                  {group}
                </h3>
                {model.parts
                  .filter(
                    (p) =>
                      p.category === group &&
                      p.name
                        .toLocaleLowerCase("fr")
                        .includes(filter.toLocaleLowerCase("fr")),
                  )
                  .map((part) => (
                    <button
                      key={part.id}
                      data-part-id={part.id}
                      className={`mt-part-row ${selected === part.id ? "active" : ""} ${part.hidden ? "hidden-part" : ""}`}
                      onClick={() => choosePart(part.id)}
                    >
                      <Box size={11} />
                      <span>{part.name}</span>
                      {part.hidden ? (
                        <EyeOff size={11} />
                      ) : (
                        <i style={{ background: part.color }} />
                      )}
                    </button>
                  ))}
              </div>
            ))}
          </div>
          <div className="mt-add-buttons">
            <button onClick={() => addPart("box")}>
              <Plus size={12} /> Module
            </button>
            <button onClick={() => addPart("cylinder")}>
              <Plus size={12} /> Cylindre
            </button>
          </div>
          <section className="mt-forge-layers" aria-label="Calques du document">
            <header><strong><Layers3 size={13} /> Calques</strong><button type="button" disabled={!selectedPart} onClick={createLayerFromSelected} title="Créer un calque à partir de la pièce sélectionnée"><Plus size={14} /></button></header>
            {(config.studioLayers ?? []).map((layer) => {
              const settings = config.studioLayerSettings?.[layer] ?? { visible: true, locked: false };
              const assignedCount = Object.values(config.studioLayerAssignments ?? {}).filter((value) => value === layer).length;
              return <div className={`mt-forge-layer ${config.activeStudioLayer === layer ? "active" : ""}`} key={layer}>
                <button type="button" className="mt-forge-layer-name" onClick={() => setConfig((current) => ({ ...current, activeStudioLayer: layer }))}><Layers3 size={11} /><span>{layer}</span><small>{assignedCount} objet(s)</small></button>
                <button type="button" aria-label={`${settings.visible ? "Masquer" : "Afficher"} ${layer}`} onClick={() => setConfig((current) => ({ ...current, studioLayerSettings: { ...current.studioLayerSettings, [layer]: { ...settings, visible: !settings.visible } } }))}>{settings.visible ? <Eye size={12} /> : <EyeOff size={12} />}</button>
                <button type="button" aria-label={`${settings.locked ? "Déverrouiller" : "Verrouiller"} ${layer}`} onClick={() => setConfig((current) => ({ ...current, studioLayerSettings: { ...current.studioLayerSettings, [layer]: { ...settings, locked: !settings.locked } } }))}>{settings.locked ? <Unlock size={12} /> : <Lock size={12} />}</button>
              </div>;
            })}
            {!(config.studioLayers ?? []).length && <small className="mt-forge-empty-layer">Choisissez une pièce, puis créez son calque.</small>}
            <button className="mt-forge-create-layer" type="button" disabled={!selectedPart} onClick={createLayerFromSelected}>Créer un calque depuis la sélection</button>
          </section>
          <small className="mt-tree-note">
            Pièces du maillage conceptuel · distinctes de la nomenclature
            installée.
          </small>
        </aside>
        <div className="mt-scene">
          <MechanicalTwinViewport
            model={renderModel}
            selected={selected}
            onSelect={choosePart}
            view={view}
            mode={mode}
            explosion={exploded ? separation : 0}
            resetKey={resetKey}
            forceVector={forceVector}
            xrayCut={xrayCut}
            xrayOpacity={xrayOpacity}
            xrayIsolatedLayer={xrayIsolatedLayer}
            kinematicsPlaying={kinematicsPlaying}
          />
          {exploded && (
            <label className="mt-separation">
              ESPACEMENT ÉCLATÉ
              <input
                aria-label="Espacement de l’assemblage éclaté"
                type="range"
                min="0"
                max="2"
                step=".05"
                value={separation}
                onChange={(e) => setSeparation(Number(e.target.value))}
              />
              <span>{separation.toFixed(2)}×</span>
            </label>
          )}
          <div className="mt-scene-footer">
            <span>
              <i /> {model.parts.filter((p) => !p.hidden).length} PIÈCES
              VISIBLES
            </span>
            <span>UNITÉS / MÈTRES</span>
            <span>ROTATION AUTO / OFF</span>
          </div>
        </div>
        <aside className="mt-inspector">
          <div className="mt-panel-heading">
            <span>INSPECTEUR PARAMÉTRIQUE</span>
            <Settings2 size={13} />
          </div>
          <div className="mt-inspector-tabs">
            <button
              className={inspector === "shape" ? "active" : ""}
              onClick={() => setInspector("shape")}
            >
              <SlidersHorizontal size={12} /> Cellule
            </button>
            <button
              className={inspector === "part" ? "active" : ""}
              onClick={() => setInspector("part")}
            >
              <Box size={12} /> Pièce
            </button>
          </div>
          {inspector === "shape" ? (
            <div className="mt-inspector-content">
              <div className="mt-inspector-title">
                <span>GÉOMÉTRIE ACTIVE</span>
                <strong>{design.label}</strong>
                <small>{model.modelType} · régénération immédiate</small>
              </div>
              <div className="mt-global-fields">
                <NumberField
                  label="Envergure"
                  value={config.wingspan}
                  min={0.2}
                  max={40}
                  onChange={(v) => changeGlobal("wingspan", v)}
                />
                <NumberField
                  label="Longueur fuselage"
                  value={config.fuselageLength}
                  min={0.16}
                  onChange={(v) => changeGlobal("fuselageLength", v)}
                />
                <NumberField
                  label="Corde alaire"
                  value={config.chord}
                  min={0.05}
                  onChange={(v) => changeGlobal("chord", v)}
                />
                <NumberField
                  label="Diamètre hélices"
                  value={config.propDiameter}
                  min={0.08}
                  max={Math.max(0.1, config.wingspan * 0.65)}
                  onChange={(v) => changeGlobal("propDiameter", v)}
                />
                <NumberField
                  label="Motorisations"
                  value={config.motorCount ?? 1}
                  unit="unités"
                  min={1}
                  max={12}
                  step={1}
                  onChange={(v) => changeGlobal("motorCount", v)}
                />
                <NumberField
                  label="Largeur fuselage"
                  value={model.settings.fuselageWidth ?? 0.2}
                  onChange={(v) =>
                    updateSettings((s) => ({ ...s, fuselageWidth: v }))
                  }
                />
                <NumberField
                  label="Hauteur fuselage"
                  value={model.settings.fuselageHeight ?? 0.16}
                  onChange={(v) =>
                    updateSettings((s) => ({ ...s, fuselageHeight: v }))
                  }
                />
                <NumberField
                  label="Flèche alaire"
                  value={model.settings.sweepDeg ?? 8}
                  unit="°"
                  min={-20}
                  max={65}
                  step={1}
                  onChange={(v) =>
                    updateSettings((s) => ({ ...s, sweepDeg: v }))
                  }
                />
                <NumberField
                  label="Dièdre"
                  value={model.settings.dihedralDeg ?? 3}
                  unit="°"
                  min={-15}
                  max={35}
                  step={1}
                  onChange={(v) =>
                    updateSettings((s) => ({ ...s, dihedralDeg: v }))
                  }
                />
                <NumberField
                  label="Hauteur train"
                  value={model.settings.gearHeight ?? 0.2}
                  onChange={(v) =>
                    updateSettings((s) => ({ ...s, gearHeight: v }))
                  }
                />
              </div>
              <h4>FINITION & MATÉRIAUX VISUELS</h4>
              <label className="mt-select-field">
                Finition
                <select
                  aria-label="Finition mécanique"
                  value={model.settings.finish ?? "titanium"}
                  onChange={(e) =>
                    updateSettings((s) => ({
                      ...s,
                      finish: e.target.value as MechanicalTwinConfig["finish"],
                    }))
                  }
                >
                  <option value="titanium">Titane / métal brossé</option>
                  <option value="carbon">Carbone / graphite</option>
                  <option value="ceramic">Céramique / blanc arctique</option>
                </select>
              </label>
              <label className="mt-color-field">
                Couleur de la cellule
                <input
                  aria-label="Couleur de la cellule"
                  type="color"
                  value={model.settings.shellColor ?? "#b9c8cf"}
                  onChange={(e) =>
                    updateSettings((s) => ({
                      ...s,
                      shellColor: e.target.value,
                    }))
                  }
                />
              </label>
              <p className="mt-hint">
                Ces réglages modifient le maillage. Ils ne remplacent pas les
                propriétés physiques ni les données certifiées du fabricant.
              </p>
            </div>
          ) : (
            <div className="mt-inspector-content">
              {selectedPart ? (
                <>
                  <div className="mt-inspector-title">
                    <span>PIÈCE SÉLECTIONNÉE</span>
                    <strong>{selectedPart.name}</strong>
                    <small>{selectedPart.category}</small>
                  </div>
                  <label className="mt-select-field">
                    Nom de la pièce
                    <input
                      aria-label="Nom de la pièce"
                      value={selectedPart.name}
                      onChange={(e) => updatePart({ name: e.target.value })}
                    />
                  </label>
                  <label className="mt-color-field">
                    Couleur
                    <input
                      aria-label="Couleur de la pièce"
                      type="color"
                      value={selectedPart.color}
                      onChange={(e) => updatePart({ color: e.target.value })}
                    />
                  </label>
                  <button
                    className="mt-visibility"
                    onClick={() => updatePart({ hidden: !selectedPart.hidden })}
                  >
                    {selectedPart.hidden ? (
                      <EyeOff size={13} />
                    ) : (
                      <Eye size={13} />
                    )}{" "}
                    {selectedPart.hidden
                      ? "Afficher cette pièce"
                      : "Masquer cette pièce"}
                  </button>
                  <h4>DIMENSIONS LOCALES · M</h4>
                  <div className="mt-axis-fields">
                    {["X", "Y", "Z"].map((axis, i) => (
                      <NumberField
                        key={axis}
                        label={`Dimension ${axis}`}
                        value={selectedPart.size[i] * selectedPart.scale[i]}
                        min={0.001}
                        max={40}
                        onChange={(v) =>
                          changeVector(
                            "scale",
                            i,
                            v /
                              Math.max(
                                0.001,
                                (selectedPart.size[i] * selectedPart.scale[i]) /
                                  (edit.scale?.[i] ?? 1),
                              ),
                          )
                        }
                      />
                    ))}
                  </div>
                  <h4>DÉPLACEMENT · M</h4>
                  <div className="mt-axis-fields">
                    {["X", "Y", "Z"].map((axis, i) => (
                      <NumberField
                        key={axis}
                        label={`Décalage ${axis}`}
                        value={edit.offset?.[i] ?? 0}
                        min={-20}
                        max={20}
                        onChange={(v) => changeVector("offset", i, v)}
                      />
                    ))}
                  </div>
                  <h4>ROTATION · DEGRÉS</h4>
                  <div className="mt-axis-fields">
                    {["X", "Y", "Z"].map((axis, i) => (
                      <NumberField
                        key={axis}
                        label={`Rotation ${axis}`}
                        value={edit.rotation?.[i] ?? 0}
                        unit="°"
                        min={-360}
                        max={360}
                        step={1}
                        onChange={(v) => changeVector("rotation", i, v)}
                      />
                    ))}
                  </div>
                  <h4>ÉCHELLE PAR AXE</h4>
                  <div className="mt-axis-fields">
                    {["X", "Y", "Z"].map((axis, i) => (
                      <NumberField
                        key={axis}
                        label={`Échelle ${axis}`}
                        value={edit.scale?.[i] ?? 1}
                        unit="×"
                        min={0.05}
                        max={20}
                        onChange={(v) => changeVector("scale", i, v)}
                      />
                    ))}
                  </div>
                  <button
                    className="mt-visibility"
                    onClick={() =>
                      updateSettings((s) => {
                        const edits = { ...s.edits };
                        delete edits[selected];
                        return { ...s, edits };
                      })
                    }
                  >
                    <RotateCcw size={12} /> Réinitialiser cette pièce
                  </button>
                  {model.settings.extraParts?.some(
                    (p) => p.id === selected,
                  ) && (
                    <button
                      className="mt-delete"
                      onClick={() => {
                        updateSettings((s) => ({
                          ...s,
                          extraParts: s.extraParts?.filter(
                            (p) => p.id !== selected,
                          ),
                        }));
                        setSelected("");
                      }}
                    >
                      <Trash2 size={12} /> Supprimer le module
                    </button>
                  )}
                  <p className="mt-hint">
                    Éditions indépendantes de cette pièce. Masquer une géométrie
                    ne supprime aucun équipement de la nomenclature.
                  </p>
                </>
              ) : (
                <div className="mt-no-part">
                  <Box size={28} />
                  <strong>Sélectionnez une pièce</strong>
                  <span>
                    Dans la scène ou l’arborescence pour modifier sa géométrie,
                    son implantation et sa finition.
                  </span>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
      <section className="mt-proposal-bottom" aria-label="Historique et séquence du projet">
        <div className="mt-revision-strip"><div className="mt-bottom-title"><span>HISTORIQUE RÉEL · LOCAL</span><strong>{design.label}</strong></div>{revisions.map((revision, index) => <button type="button" key={revision.id} className={selectedRevisionId === revision.id ? "active" : ""} onClick={() => setSelectedRevisionId(revision.id)} title={`Sélectionner ${revision.label}`}><b>V{index + 1}</b><small>{new Date(revision.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</small></button>)}{!revisions.length && <span className="mt-empty-line">Aucune révision enregistrée.</span>}<button type="button" className="mt-bottom-action" onClick={saveRevision}><Save size={12}/> Enregistrer</button><button type="button" className="mt-bottom-action" disabled={!selectedRevisionId} onClick={compareRevision}>Comparer</button><button type="button" className="mt-bottom-action" disabled={!selectedRevisionId} onClick={() => restoreRevision(selectedRevisionId)}>Restaurer</button></div>
        <div className="mt-forge-impact"><div className="mt-bottom-title"><span>STUDIO / ASSEMBLAGE NUMÉRIQUE</span><strong>Impact des modifications</strong></div><article><small>01 · CONFIGURATION</small><b>{design.label} / variante de travail</b><span>{model.modelType} · {Math.round(config.motorCount ?? 0)} moteur(s)</span></article><i>→</i><article><small>02 · CONDITIONS</small><b>{(config.wingspan ?? model.span).toFixed(2)} m · {(config.constructionMassKg ?? 0).toFixed(2)} kg</b><span>{Math.round(config.batteryWh ?? 0)} Wh · vent {Math.round(config.windSpeedKmh ?? 0)} km/h</span></article><i>→</i><article><small>03 · EFFET À CONTRÔLER</small><b>{selectedPart ? selectedPart.name : "Sélectionnez une pièce"}</b><span>{selectedPart ? `${selectedPart.size.map(value => value.toFixed(2)).join(" × ")} m · ${selectedPart.category}` : "Les couches, interfaces et masses structurent la maquette d’assemblage."}</span></article></div>
      </section>
      {draftMessage && (
        <div className="mt-draft-status" role="status">
          {draftMessage}
        </div>
      )}
      <footer className="mt-export-bar">
        <div>
          <strong>VOTRE GÉOMÉTRIE. VOS PARAMÈTRES.</strong>
          <span>
            {hasProject
              ? "Éditions intégrées au workspace local actif"
              : "Sans projet actif : sauvegardez un brouillon local ou exportez le JSON pour conserver les éditions"}{" "}
            · modèle conceptuel, non certifié
          </span>
        </div>
        <button onClick={saveDraft}>
          <Save size={13} /> Sauver brouillon
        </button>
        <button onClick={loadDraft}>
          <RotateCcw size={13} /> Charger brouillon
        </button>
        <button onClick={() => fileInput.current?.click()}>
          <Upload size={13} /> Importer JSON
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          aria-label="Importer une configuration mécanique JSON"
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              try {
                restoreDocument(await file.text());
              } catch {
                setDraftMessage("Lecture du fichier impossible.");
              }
            }
            e.target.value = "";
          }}
        />
        <button
          onClick={() =>
            download(
              `${design.id}-twin-parametrique.json`,
              serializeMechanicalTwin(
                design.id,
                effectiveConfig,
                model.settings,
              ),
              "application/json",
            )
          }
        >
          <Download size={13} /> Configuration JSON
        </button>
        <button
          className="mt-primary"
          onClick={() =>
            download(
              `${design.id}-mecanique.obj`,
              exportMechanicalOBJ(model),
              "text/plain",
            )
          }
        >
          <Download size={13} /> Maillage OBJ
        </button>
      </footer>
    </section>
  );
}
