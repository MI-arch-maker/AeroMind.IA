import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import {
  Box,
  Camera,
  CircleDot,
  Copy,
  Download,
  Eye,
  EyeOff,
  Grid3X3,
  ImagePlus,
  Layers3,
  Lock,
  Move3d,
  PenLine,
  Plus,
  Redo2,
  Rotate3d,
  RotateCcw,
  Ruler,
  ScanLine,
  Search,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Unlock,
} from "lucide-react";
import type { ConceptConfig } from "../lib/aeroEngine";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import {
  buildMechanicalModel,
  exportMechanicalOBJ,
  exportMechanicalSTL,
  transformedPartVertices,
  type MechanicalExtraPart,
  type MechanicalPartEdit,
  type MechanicalTwinConfig,
  type Vec3,
} from "../lib/mechanicalTwinGeometry";
import type { AppLanguage } from "../lib/language";
import {
  MechanicalTwinViewport,
  type MechanicalRender,
  type MechanicalView,
  type XrayLayerState,
} from "./MechanicalTwinViewport";
import "./idds-mechanical-assembly.css";

type RenderMode =
  | "assembly"
  | "internals"
  | "kinematics"
  | "simulation"
  | "variants";
type ToolMode = "select" | "move" | "rotate" | "scale" | "measure";
type InspectorTab = "part" | "cell";
type Props = {
  design: DroneCatalogDesign;
  config: ConceptConfig;
  setConfig: Dispatch<SetStateAction<ConceptConfig>>;
  language: AppLanguage;
  renderMode: RenderMode;
  kinematicsPlaying: boolean;
  exploded: boolean;
  onPresentation: (mode: "horizon" | "exploded") => void;
  onOpenCatalog: () => void;
};
const words = {
  fr: {
    heading: "IDDS / Atelier d’assemblage",
    workspaceLabel: "ESPACE / 01",
    grid1mm: "1 mm",
    grid1cm: "1 cm",
    grid5cm: "5 cm",
    grid10cm: "10 cm",
    meters: "m",
    subtitle:
      "CAO paramétrique · composition de calques · modifications locales réversibles",
    cell: "Cellule active",
    change: "Changer de cellule",
    conceptual: "MAQUETTE CONCEPTUELLE · NON CERTIFIÉE",
    tools: "OUTILS",
    select: "Sélection",
    move: "Déplacer",
    rotate: "Rotation",
    scale: "Échelle",
    measure: "Mesurer",
    create: "CRÉER",
    box: "Ajouter un bloc",
    cylinder: "Ajouter un cylindre",
    roundBox: "Ajouter un carénage",
    duplicate: "Dupliquer la pièce",
    remove: "Supprimer la pièce utilisateur",
    history: "HISTORIQUE",
    undo: "Annuler",
    redo: "Rétablir",
    transform: "TRANSFORMER",
    view: "VUE",
    grid: "Grille",
    snap: "Accrochage",
    step: "Pas",
    importImage: "Image de référence",
    clearImage: "Retirer l’image",
    imageVisible: "Image visible",
    opacity: "Opacité",
    imageScale: "Échelle image",
    imageRotation: "Rotation image",
    export: "EXPORT CONCEPTUEL",
    obj: "Exporter OBJ",
    stl: "Exporter STL",
    capture: "Capturer la vue",
    tree: "Arbre d’assemblage",
    search: "Rechercher une pièce…",
    layers: "Calques",
    addLayer: "Créer un calque",
    noLayers: "Aucun calque. Créez-en un depuis une pièce sélectionnée.",
    lock: "Verrouiller le calque",
    unlock: "Déverrouiller le calque",
    show: "Afficher le calque",
    hide: "Masquer le calque",
    layerColor: "Couleur du calque",
    layerNote: "Note de calque",
    inspector: "Inspecteur",
    part: "Pièce",
    cellTab: "Cellule",
    none: "Sélectionnez une pièce dans l’arbre ou dans la vue 3D.",
    locked:
      "Pièce verrouillée par son calque. Déverrouillez le calque pour la modifier.",
    name: "Nom",
    assign: "Affecter au calque",
    noLayer: "Sans calque",
    color: "Couleur",
    visible: "Visible",
    hidden: "Masquée",
    offset: "Translation (m)",
    rotation: "Rotation (°)",
    scaleValue: "Échelle XYZ",
    resetTransform: "Réinitialiser la transformation",
    dimensions: "Dimensions dérivées",
    width: "Envergure",
    chord: "Corde",
    length: "Longueur fuselage",
    prop: "Diamètre hélice",
    motors: "Motorisations",
    advanced: "Structure et finition",
    fuselageWidth: "Largeur fuselage",
    fuselageHeight: "Hauteur fuselage",
    sweep: "Flèche (°)",
    dihedral: "Dièdre (°)",
    gear: "Hauteur train",
    finish: "Finition",
    shell: "Couleur de coque",
    carbon: "Carbone",
    titanium: "Titane",
    ceramic: "Céramique",
    projection: "Projection",
    iso: "Iso",
    top: "Dessus",
    front: "Face",
    side: "Profil",
    exploded: "Éclater",
    assembled: "Réassembler",
    resetCamera: "Réinitialiser caméra",
    xrayCut: "Coupe X-ray",
    isolate: "Isoler catégorie",
    all: "Toutes",
    activeTool: "Outil actif",
    dimensionsHelp: "Cotes du modèle — estimations conceptuelles",
    selected: "sélectionnée",
    items: "pièces",
    reference: "Guide image local · jamais transmis au serveur",
    imageHint:
      "Formats image courants · le calque est une référence visuelle, pas une surface CAO.",
    statusReady: "Prêt · modifications rattachées à la cellule active.",
    measureSummary: "Enveloppe globale",
    extent: "Étendue",
    referenceLayer: "Calque image de référence",
    selectPart: "Choisir une pièce pour modifier sa géométrie.",
    customOnly:
      "Les pièces natives ne sont pas supprimées; masquez-les ou créez une copie.",
    addNote: "Ajouter une note au calque",
    statusImage: "Image de référence chargée localement.",
    statusUndo: "Modification annulée.",
    statusRedo: "Modification rétablie.",
    statusLocked:
      "Modification refusée : le calque de cette pièce est verrouillé.",
    statusCreated: "Pièce ajoutée à l’assemblage.",
    statusCopied: "Géométrie copiée dans une nouvelle pièce utilisateur.",
    statusDeleted: "Pièce utilisateur supprimée.",
    statusExport: "Fichier conceptuel exporté.",
    statusCapture: "Capture créée.",
    statusNoCapture: "Capture indisponible dans ce moteur graphique.",
    statusLayer: "Calque mis à jour.",
    statusTransform: "Transformation paramétrique mise à jour.",
    cutNote:
      "La coupe et l’opacité affectent le rendu, pas le maillage source.",
    searchNoResults: "Aucune pièce trouvée.",
    manual: "Atelier IDDS",
    keyboard:
      "Ctrl/Cmd+Z annuler · Ctrl/Cmd+Y rétablir · Suppr retirer une pièce utilisateur",
  },
  en: {
    heading: "IDDS / Assembly workshop",
    workspaceLabel: "WORKSPACE / 01",
    grid1mm: "1 mm",
    grid1cm: "1 cm",
    grid5cm: "5 cm",
    grid10cm: "10 cm",
    meters: "m",
    subtitle: "Parametric CAD · layer compositing · reversible local edits",
    cell: "Active airframe",
    change: "Change cell",
    conceptual: "CONCEPTUAL MODEL · NOT CERTIFIED",
    tools: "TOOLS",
    select: "Select",
    move: "Move",
    rotate: "Rotate",
    scale: "Scale",
    measure: "Measure",
    create: "CREATE",
    box: "Add block",
    cylinder: "Add cylinder",
    roundBox: "Add fairing",
    duplicate: "Duplicate part",
    remove: "Delete user part",
    history: "HISTORY",
    undo: "Undo",
    redo: "Redo",
    transform: "TRANSFORM",
    view: "VIEW",
    grid: "Grid",
    snap: "Snap",
    step: "Step",
    importImage: "Reference image",
    clearImage: "Remove image",
    imageVisible: "Image visible",
    opacity: "Opacity",
    imageScale: "Image scale",
    imageRotation: "Image rotation",
    export: "CONCEPT EXPORT",
    obj: "Export OBJ",
    stl: "Export STL",
    capture: "Capture view",
    tree: "Assembly tree",
    search: "Find a component…",
    layers: "Layers",
    addLayer: "Create layer",
    noLayers: "No layers. Create one from a selected part.",
    lock: "Lock layer",
    unlock: "Unlock layer",
    show: "Show layer",
    hide: "Hide layer",
    layerColor: "Layer color",
    layerNote: "Layer note",
    inspector: "Inspector",
    part: "Part",
    cellTab: "Airframe",
    none: "Select a part in the tree or 3D view.",
    locked: "Part is locked by its layer. Unlock the layer to edit it.",
    name: "Name",
    assign: "Assign to layer",
    noLayer: "Unassigned",
    color: "Color",
    visible: "Visible",
    hidden: "Hidden",
    offset: "Translation (m)",
    rotation: "Rotation (°)",
    scaleValue: "Scale XYZ",
    resetTransform: "Reset transform",
    dimensions: "Derived dimensions",
    width: "Wingspan",
    chord: "Chord",
    length: "Fuselage length",
    prop: "Prop diameter",
    motors: "Motors",
    advanced: "Structure & finish",
    fuselageWidth: "Fuselage width",
    fuselageHeight: "Fuselage height",
    sweep: "Sweep (°)",
    dihedral: "Dihedral (°)",
    gear: "Gear height",
    finish: "Finish",
    shell: "Shell color",
    carbon: "Carbon",
    titanium: "Titanium",
    ceramic: "Ceramic",
    projection: "Projection",
    iso: "Iso",
    top: "Top",
    front: "Front",
    side: "Side",
    exploded: "Explode",
    assembled: "Reassemble",
    resetCamera: "Reset camera",
    xrayCut: "X-ray cut",
    isolate: "Isolate category",
    all: "All",
    activeTool: "Active tool",
    dimensionsHelp: "Model dimensions — conceptual estimates",
    selected: "selected",
    items: "parts",
    reference: "Local image guide · never uploaded to the server",
    imageHint: "Common image formats · reference layer only, not CAD geometry.",
    statusReady: "Ready · edits belong to the active airframe.",
    measureSummary: "Overall envelope",
    extent: "Extent",
    referenceLayer: "Image reference layer",
    selectPart: "Select a part to edit its geometry.",
    customOnly: "Native parts are not deleted; hide them or create a copy.",
    addNote: "Add layer note",
    statusImage: "Reference image loaded locally.",
    statusUndo: "Edit undone.",
    statusRedo: "Edit restored.",
    statusLocked: "Edit rejected: this part’s layer is locked.",
    statusCreated: "Part added to assembly.",
    statusCopied: "Geometry copied into a new user part.",
    statusDeleted: "User part deleted.",
    statusExport: "Concept file exported.",
    statusCapture: "Capture created.",
    statusNoCapture: "Capture unavailable in this graphics engine.",
    statusLayer: "Layer updated.",
    statusTransform: "Parametric transform updated.",
    cutNote: "Section and opacity affect the render, not the source mesh.",
    searchNoResults: "No parts found.",
    manual: "IDDS workshop",
    keyboard: "Ctrl/Cmd+Z undo · Ctrl/Cmd+Y redo · Delete removes a user part",
  },
} as const;
const toolIcons = {
  select: PenLine,
  move: Move3d,
  rotate: Rotate3d,
  scale: ScanLine,
  measure: Ruler,
} as const;
const toolKeys: ToolMode[] = ["select", "move", "rotate", "scale", "measure"];
const vecFields = ["offset", "rotation", "scale"] as const;
const axisNames = ["X", "Y", "Z"] as const;

function downloadFile(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function IDDSTwinAssemblyEditor({
  design,
  config,
  setConfig,
  language,
  renderMode,
  kinematicsPlaying,
  exploded,
  onPresentation,
  onOpenCatalog,
}: Props) {
  const t = words[language === "en" ? "en" : "fr"];
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("part");
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<MechanicalView>("iso");
  const [resetKey, setResetKey] = useState(0);
  const [xrayCut, setXrayCut] = useState(1);
  const [xrayOpacity, setXrayOpacity] = useState<XrayLayerState>({});
  const [isolatedLayer, setIsolatedLayer] = useState("");
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapStep, setSnapStep] = useState(0.01);
  const [status, setStatus] = useState("");
  const [undoStack, setUndoStack] = useState<ConceptConfig[]>([]);
  const [redoStack, setRedoStack] = useState<ConceptConfig[]>([]);
  const currentConfig = useRef(config);
  const imageInput = useRef<HTMLInputElement>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceVisible, setReferenceVisible] = useState(true);
  const [referenceOpacity, setReferenceOpacity] = useState(0.28);
  const [referenceScale, setReferenceScale] = useState(72);
  const [referenceRotation, setReferenceRotation] = useState(0);

  useEffect(() => {
    currentConfig.current = config;
  }, [config]);
  useEffect(() => {
    if (!referenceFile) {
      setReferenceUrl("");
      return;
    }
    const url = URL.createObjectURL(referenceFile);
    setReferenceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [referenceFile]);

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
  const visibleModel = useMemo(
    () => ({
      ...model,
      parts: model.parts.map((part) => {
        const layer = config.studioLayerAssignments?.[part.id];
        const layerSettings = layer
          ? config.studioLayerSettings?.[layer]
          : undefined;
        const layerMeta = layer ? config.studioLayerMeta?.[layer] : undefined;
        return {
          ...part,
          hidden: part.hidden || layerSettings?.visible === false,
          color:
            model.settings.edits?.[part.id]?.color ||
            layerMeta?.color ||
            part.color,
          opacity: Math.max(0, Math.min(1, (layerMeta?.opacity ?? 100) / 100)),
        };
      }),
    }),
    [
      model,
      config.studioLayerAssignments,
      config.studioLayerSettings,
      config.studioLayerMeta,
    ],
  );
  const selectedPart = model.parts.find((part) => part.id === selected);
  const selectedLayerName = selected
    ? (config.studioLayerAssignments?.[selected] ?? "")
    : "";
  const selectedLayer = selectedLayerName
    ? config.studioLayerSettings?.[selectedLayerName]
    : undefined;
  const isLocked = Boolean(selectedLayer?.locked);
  const partEdit = model.settings.edits?.[selected] ?? {};
  const extraParts = model.settings.extraParts ?? [];
  const selectedIsCustom = extraParts.some((part) => part.id === selected);
  const layerNames = config.studioLayers ?? [];
  const groups = useMemo(
    () => [...new Set(model.parts.map((part) => part.category))],
    [model],
  );
  const filteredParts = model.parts.filter((part) =>
    part.name
      .toLocaleLowerCase(language === "en" ? "en" : "fr")
      .includes(query.toLocaleLowerCase(language === "en" ? "en" : "fr")),
  );
  const meshMode: MechanicalRender =
    renderMode === "internals"
      ? "xray"
      : renderMode === "simulation"
        ? "wireframe"
        : "solid";
  const dimensions = {
    wingspan: Number(config.wingspan) || design.configuration.wingspan || 0.2,
    chord: Number(config.chord) || design.configuration.chord || 0.06,
    fuselageLength:
      Number(config.fuselageLength) ||
      design.configuration.fuselageLength ||
      0.1,
    propDiameter:
      Number(config.propDiameter) || design.configuration.propDiameter || 0.08,
    motorCount:
      Number(config.motorCount) || design.configuration.motorCount || 1,
  };

  useEffect(() => {
    if (selected && !model.parts.some((part) => part.id === selected))
      setSelected("");
  }, [model.parts, selected]);
  const commitConfig = (mutate: (current: ConceptConfig) => ConceptConfig) => {
    const previous = currentConfig.current;
    const next = mutate(previous);
    if (next === previous) return;
    setUndoStack((stack) => [...stack, structuredClone(previous)].slice(-60));
    setRedoStack([]);
    currentConfig.current = next;
    setConfig(next);
  };
  const updateSettings = (
    mutate: (settings: MechanicalTwinConfig) => MechanicalTwinConfig,
  ) =>
    commitConfig((current) => {
      const source =
        current.mechanicalTwin?.designId === design.id
          ? current.mechanicalTwin
          : (current.mechanicalTwins?.[design.id] ?? model.settings);
      const nextSettings = mutate(structuredClone(source));
      return {
        ...current,
        mechanicalTwin: nextSettings,
        mechanicalTwins: {
          ...current.mechanicalTwins,
          [design.id]: nextSettings,
        },
      };
    });
  const updatePart = (patch: MechanicalPartEdit) => {
    if (isLocked) {
      setStatus(t.statusLocked);
      return;
    }
    updateSettings((settings) => ({
      ...settings,
      edits: {
        ...settings.edits,
        [selected]: { ...settings.edits?.[selected], ...patch },
      },
    }));
    setStatus(t.statusTransform);
  };
  const updateVector = (
    field: (typeof vecFields)[number],
    axis: number,
    rawValue: number,
  ) => {
    const initial = field === "scale" ? [1, 1, 1] : [0, 0, 0];
    const vector: Vec3 = [...(partEdit[field] ?? initial)] as Vec3;
    const snapped = snapEnabled
      ? Math.round(rawValue / snapStep) * snapStep
      : rawValue;
    vector[axis] = field === "scale" ? Math.max(0.01, snapped) : snapped;
    updatePart({ [field]: vector });
  };
  const updateGlobal = (
    key:
      | "wingspan"
      | "chord"
      | "fuselageLength"
      | "propDiameter"
      | "motorCount",
    value: number,
  ) =>
    commitConfig((current) => ({
      ...current,
      [key]:
        key === "motorCount"
          ? Math.max(1, Math.min(12, Math.round(value)))
          : value,
    }));
  const updateAdvanced = (
    key: keyof MechanicalTwinConfig,
    value: number | string,
  ) => updateSettings((settings) => ({ ...settings, [key]: value }));

  const createPart = (kind: MechanicalExtraPart["kind"]) => {
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const size: Vec3 =
      kind === "cylinder"
        ? [0.12, 0.2, 0.12]
        : kind === "roundedBox"
          ? [0.22, 0.12, 0.32]
          : [0.18, 0.12, 0.22];
    const newPart: MechanicalExtraPart = {
      id,
      name:
        kind === "cylinder"
          ? "Support cylindrique"
          : kind === "roundedBox"
            ? "Carénage utilisateur"
            : "Module personnalisé",
      kind,
      size,
      position: [0, 0.25, 0],
      color: "#72d9cf",
    };
    updateSettings((settings) => ({
      ...settings,
      extraParts: [...(settings.extraParts ?? []), newPart],
    }));
    setSelected(id);
    setInspectorTab("part");
    setToolMode("select");
    setStatus(t.statusCreated);
  };
  const duplicateSelected = () => {
    if (!selectedPart) return;
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const clone: MechanicalExtraPart = {
      id,
      name: `${selectedPart.name} · copie`,
      kind: "mesh",
      size: [...selectedPart.size] as Vec3,
      position: [0.18, 0, 0],
      color: selectedPart.color,
      vertices: transformedPartVertices(selectedPart, 0),
      indices: [...selectedPart.indices],
    };
    updateSettings((settings) => ({
      ...settings,
      extraParts: [...(settings.extraParts ?? []), clone],
    }));
    setSelected(id);
    setStatus(t.statusCopied);
  };
  const deleteSelected = () => {
    if (!selectedIsCustom) {
      setStatus(t.customOnly);
      return;
    }
    updateSettings((settings) => ({
      ...settings,
      extraParts: (settings.extraParts ?? []).filter(
        (part) => part.id !== selected,
      ),
    }));
    commitConfig((current) => {
      const assignments = { ...current.studioLayerAssignments };
      delete assignments[selected];
      return { ...current, studioLayerAssignments: assignments };
    });
    setSelected("");
    setStatus(t.statusDeleted);
  };
  const toggleSelectedVisibility = () =>
    updatePart({ hidden: !partEdit.hidden });
  const resetTransform = () =>
    updatePart({ offset: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
  const createLayer = () => {
    const requested = window.prompt(
      t.addLayer,
      selectedPart ? `${selectedPart.name} · calque` : "Calque IDDS",
    );
    if (!requested?.trim()) return;
    commitConfig((current) => {
      const base = requested.trim();
      const existing = current.studioLayers ?? [];
      const name = existing.includes(base)
        ? `${base} ${existing.length + 1}`
        : base;
      const assignments = { ...current.studioLayerAssignments };
      if (selectedPart) assignments[selectedPart.id] = name;
      return {
        ...current,
        studioLayers: [...existing, name],
        activeStudioLayer: name,
        studioLayerSettings: {
          ...current.studioLayerSettings,
          [name]: { visible: true, locked: false },
        },
        studioLayerMeta: {
          ...current.studioLayerMeta,
          [name]: { color: "#57d5c7", opacity: 100, note: "" },
        },
        studioLayerAssignments: assignments,
      };
    });
    setStatus(t.statusLayer);
  };
  const assignLayer = (name: string) =>
    commitConfig((current) => {
      const assignments = { ...current.studioLayerAssignments };
      if (name) assignments[selected] = name;
      else delete assignments[selected];
      return {
        ...current,
        studioLayerAssignments: assignments,
        activeStudioLayer: name || current.activeStudioLayer,
      };
    });
  const setLayerVisibility = (name: string, visible: boolean) =>
    commitConfig((current) => ({
      ...current,
      studioLayerSettings: {
        ...current.studioLayerSettings,
        [name]: {
          ...(current.studioLayerSettings?.[name] ?? {
            visible: true,
            locked: false,
          }),
          visible,
        },
      },
    }));
  const setLayerLocked = (name: string, locked: boolean) =>
    commitConfig((current) => ({
      ...current,
      studioLayerSettings: {
        ...current.studioLayerSettings,
        [name]: {
          ...(current.studioLayerSettings?.[name] ?? {
            visible: true,
            locked: false,
          }),
          locked,
        },
      },
    }));
  const updateLayerMeta = (
    name: string,
    patch: { color?: string; opacity?: number; note?: string },
  ) =>
    commitConfig((current) => ({
      ...current,
      studioLayerMeta: {
        ...current.studioLayerMeta,
        [name]: {
          color: current.studioLayerMeta?.[name]?.color ?? "#57d5c7",
          opacity: current.studioLayerMeta?.[name]?.opacity ?? 100,
          ...current.studioLayerMeta?.[name],
          ...patch,
        },
      },
    }));
  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) =>
      [...stack, structuredClone(currentConfig.current)].slice(-60),
    );
    currentConfig.current = previous;
    setConfig(previous);
    setStatus(t.statusUndo);
  };
  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) =>
      [...stack, structuredClone(currentConfig.current)].slice(-60),
    );
    currentConfig.current = next;
    setConfig(next);
    setStatus(t.statusRedo);
  };
  const exportModel = (kind: "obj" | "stl") => {
    const contents =
      kind === "obj"
        ? exportMechanicalOBJ(visibleModel)
        : exportMechanicalSTL(visibleModel);
    downloadFile(
      `${design.id}-idds-concept.${kind}`,
      contents,
      kind === "obj" ? "text/plain" : "model/stl",
    );
    setStatus(t.statusExport);
  };
  const captureView = () => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".idds-ma-stage .mt-viewport canvas",
    );
    try {
      const data = canvas?.toDataURL("image/png");
      if (!data) {
        setStatus(t.statusNoCapture);
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = data;
      anchor.download = `${design.id}-idds-view.png`;
      anchor.click();
      setStatus(t.statusCapture);
    } catch {
      setStatus(t.statusNoCapture);
    }
  };
  const addLayerNote = () => {
    if (!selectedLayerName) {
      setStatus(t.noLayers);
      return;
    }
    const note = window.prompt(
      t.layerNote,
      config.studioLayerMeta?.[selectedLayerName]?.note ?? "",
    );
    if (note !== null) updateLayerMeta(selectedLayerName, { note });
  };
  const onShortcut = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    if (event.key === "Delete" && selected && selectedIsCustom && !isLocked) {
      event.preventDefault();
      deleteSelected();
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    }
    if (event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    }
  };
  const handleReferenceImage = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    setReferenceFile(file);
    setReferenceVisible(true);
    setStatus(t.statusImage);
  };
  const activeToolLabel = t[toolMode];
  const viewLabels: Record<MechanicalView, string> = {
    iso: t.iso,
    top: t.top,
    front: t.front,
    side: t.side,
  };
  const selectedSize = selectedPart?.size ?? [0, 0, 0];

  return (
    <section
      className="idds-mechanical-assembly"
      aria-label={t.heading}
      tabIndex={0}
      onKeyDown={onShortcut}
    >
      <header className="idds-ma-header">
        <div>
          <span>
            {t.manual}
            {` · ${t.workspaceLabel}`}
          </span>
          <h2>
            {t.heading} <em>— {design.label}</em>
          </h2>
          <p>{t.subtitle}</p>
        </div>
        <div className="idds-ma-header-actions">
          <span className="idds-ma-concept-badge">{t.conceptual}</span>
          <button type="button" onClick={onOpenCatalog}>
            {t.change}
          </button>
        </div>
      </header>

      <nav className="idds-ma-ribbon" aria-label={t.tools}>
        <div className="idds-ma-ribbon-group">
          <small>{t.tools}</small>
          <div>
            {toolKeys.map((key) => {
              const Icon = toolIcons[key];
              return (
                <button
                  key={key}
                  type="button"
                  className={toolMode === key ? "is-active" : ""}
                  title={t[key]}
                  aria-pressed={toolMode === key}
                  onClick={() => setToolMode(key)}
                >
                  <Icon size={15} />
                  <span>{t[key]}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="idds-ma-ribbon-group">
          <small>{t.create}</small>
          <div>
            <button
              type="button"
              title={t.box}
              onClick={() => createPart("box")}
            >
              <Box size={15} />
              <span>{t.box}</span>
            </button>
            <button
              type="button"
              title={t.cylinder}
              onClick={() => createPart("cylinder")}
            >
              <CircleDot size={15} />
              <span>{t.cylinder}</span>
            </button>
            <button
              type="button"
              title={t.roundBox}
              onClick={() => createPart("roundedBox")}
            >
              <Plus size={15} />
              <span>{t.roundBox}</span>
            </button>
          </div>
        </div>
        <div className="idds-ma-ribbon-group">
          <small>{t.transform}</small>
          <div>
            <button
              type="button"
              disabled={!selectedPart}
              onClick={duplicateSelected}
            >
              <Copy size={15} />
              <span>{t.duplicate}</span>
            </button>
            <button
              type="button"
              disabled={!selectedPart || !selectedIsCustom}
              onClick={deleteSelected}
            >
              <Trash2 size={15} />
              <span>{t.remove}</span>
            </button>
            <button
              type="button"
              disabled={!selectedPart || isLocked}
              onClick={toggleSelectedVisibility}
            >
              {partEdit.hidden ? <Eye size={15} /> : <EyeOff size={15} />}
              <span>{partEdit.hidden ? t.visible : t.hide}</span>
            </button>
          </div>
        </div>
        <div className="idds-ma-ribbon-group">
          <small>{t.history}</small>
          <div>
            <button
              type="button"
              disabled={!undoStack.length}
              onClick={undo}
              title="Ctrl/Cmd+Z"
            >
              <Undo2 size={15} />
              <span>{t.undo}</span>
            </button>
            <button
              type="button"
              disabled={!redoStack.length}
              onClick={redo}
              title="Ctrl/Cmd+Y"
            >
              <Redo2 size={15} />
              <span>{t.redo}</span>
            </button>
          </div>
        </div>
        <div className="idds-ma-ribbon-group">
          <small>{t.importImage}</small>
          <div>
            <input
              ref={imageInput}
              hidden
              type="file"
              accept="image/*"
              onChange={(event) =>
                handleReferenceImage(event.target.files?.[0])
              }
            />
            <button type="button" onClick={() => imageInput.current?.click()}>
              <ImagePlus size={15} />
              <span>{t.importImage}</span>
            </button>
            {referenceFile && (
              <button
                type="button"
                onClick={() => {
                  setReferenceFile(null);
                  setReferenceVisible(false);
                }}
              >
                {t.clearImage}
              </button>
            )}
          </div>
        </div>
        <div className="idds-ma-ribbon-group">
          <small>{t.export}</small>
          <div>
            <button type="button" onClick={() => exportModel("obj")}>
              <Download size={15} />
              <span>{t.obj}</span>
            </button>
            <button type="button" onClick={() => exportModel("stl")}>
              <Download size={15} />
              <span>{t.stl}</span>
            </button>
            <button type="button" onClick={captureView}>
              <Camera size={15} />
              <span>{t.capture}</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="idds-ma-subtoolbar">
        <div className="idds-ma-subgroup">
          <strong>{t.projection}</strong>
          {(["iso", "top", "front", "side"] as MechanicalView[]).map((item) => (
            <button
              key={item}
              type="button"
              className={view === item ? "is-active" : ""}
              onClick={() => {
                setView(item);
                setResetKey((value) => value + 1);
              }}
            >
              {viewLabels[item]}
            </button>
          ))}
        </div>
        <div className="idds-ma-subgroup">
          <label>
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(event) => setShowGrid(event.target.checked)}
            />
            <Grid3X3 size={13} />
            {t.grid}
          </label>
          <label>
            <input
              type="checkbox"
              checked={snapEnabled}
              onChange={(event) => setSnapEnabled(event.target.checked)}
            />
            {t.snap}
          </label>
          <label>
            {t.step}
            <select
              value={snapStep}
              onChange={(event) => setSnapStep(Number(event.target.value))}
            >
              <option value={0.001}>{t.grid1mm}</option>
              <option value={0.01}>{t.grid1cm}</option>
              <option value={0.05}>{t.grid5cm}</option>
              <option value={0.1}>{t.grid10cm}</option>
            </select>
          </label>
        </div>
        <div className="idds-ma-subgroup">
          <button
            type="button"
            onClick={() => onPresentation(exploded ? "horizon" : "exploded")}
          >
            {exploded ? t.assembled : t.exploded}
          </button>
          <button
            type="button"
            onClick={() => setResetKey((value) => value + 1)}
          >
            <RotateCcw size={13} />
            {t.resetCamera}
          </button>
        </div>
        <span className="idds-ma-active-tool">
          <i />
          {t.activeTool}: <b>{activeToolLabel}</b>
        </span>
      </div>

      <div className="idds-ma-layout">
        <aside className="idds-ma-tree">
          <header>
            <strong>{t.tree}</strong>
            <small>
              {model.parts.length} {t.items}
            </small>
          </header>
          <label className="idds-ma-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.search}
            />
          </label>
          <div className="idds-ma-tree-scroll">
            {groups.map((group) => (
              <section key={group}>
                <h3>{group}</h3>
                {filteredParts
                  .filter((part) => part.category === group)
                  .map((part) => (
                    <button
                      key={part.id}
                      type="button"
                      className={`${selected === part.id ? "is-active" : ""} ${part.hidden ? "is-hidden" : ""}`}
                      onClick={() => {
                        setSelected(part.id);
                        setInspectorTab("part");
                      }}
                    >
                      <span
                        className="idds-ma-tree-swatch"
                        style={{ background: part.color }}
                      />
                      <span className="idds-ma-tree-name">{part.name}</span>
                      {config.studioLayerSettings?.[
                        config.studioLayerAssignments?.[part.id] ?? ""
                      ]?.locked && <Lock size={11} />}
                    </button>
                  ))}
              </section>
            ))}
            {!filteredParts.length && (
              <small className="idds-ma-empty">{t.searchNoResults}</small>
            )}
          </div>
          <section className="idds-ma-layers">
            <header>
              <h3>
                <Layers3 size={13} />
                {t.layers}
              </h3>
              <button type="button" onClick={createLayer} title={t.addLayer}>
                <Plus size={13} />
              </button>
            </header>
            {layerNames.map((layer) => {
              const setting = config.studioLayerSettings?.[layer] ?? {
                visible: true,
                locked: false,
              };
              const meta = config.studioLayerMeta?.[layer] ?? {
                color: "#57d5c7",
                opacity: 100,
                note: "",
              };
              return (
                <article
                  key={layer}
                  className={`idds-ma-layer-row ${selectedLayerName === layer ? "is-current" : ""}`}
                >
                  <div className="idds-ma-layer-head">
                    <button
                      type="button"
                      className="idds-ma-layer-select"
                      onClick={() =>
                        commitConfig((current) => ({
                          ...current,
                          activeStudioLayer: layer,
                        }))
                      }
                    >
                      <span>{layer}</span>
                      <small>
                        {
                          model.parts.filter(
                            (part) =>
                              config.studioLayerAssignments?.[part.id] ===
                              layer,
                          ).length
                        }
                      </small>
                    </button>
                    <button
                      type="button"
                      title={setting.visible ? t.hide : t.show}
                      onClick={() =>
                        setLayerVisibility(layer, !setting.visible)
                      }
                    >
                      {setting.visible ? (
                        <Eye size={12} />
                      ) : (
                        <EyeOff size={12} />
                      )}
                    </button>
                    <button
                      type="button"
                      title={setting.locked ? t.unlock : t.lock}
                      onClick={() => setLayerLocked(layer, !setting.locked)}
                    >
                      {setting.locked ? (
                        <Lock size={12} />
                      ) : (
                        <Unlock size={12} />
                      )}
                    </button>
                  </div>
                  <div className="idds-ma-layer-controls">
                    <input
                      aria-label={t.layerColor}
                      type="color"
                      value={meta.color}
                      onChange={(event) =>
                        updateLayerMeta(layer, { color: event.target.value })
                      }
                    />
                    <input
                      aria-label={`${t.opacity} ${layer}`}
                      type="range"
                      min="0"
                      max="100"
                      value={meta.opacity}
                      onChange={(event) =>
                        updateLayerMeta(layer, {
                          opacity: Number(event.target.value),
                        })
                      }
                    />
                    <small>{meta.opacity}%</small>
                  </div>
                  {meta.note && (
                    <small className="idds-ma-layer-note">{meta.note}</small>
                  )}
                </article>
              );
            })}
            {!layerNames.length && (
              <small className="idds-ma-empty">{t.noLayers}</small>
            )}
            {selectedLayerName && (
              <button
                type="button"
                className="idds-ma-note-button"
                onClick={addLayerNote}
              >
                <PenLine size={12} />
                {t.addNote}
              </button>
            )}
          </section>
        </aside>

        <main className={`idds-ma-stage ${showGrid ? "has-grid" : "no-grid"}`}>
          <div className="idds-ma-stage-caption">
            <div>
              <strong>{design.label}</strong>
              <span>
                {model.name} · {model.parts.length} {t.items}
              </span>
            </div>
            <span>
              {selectedPart
                ? `${selectedPart.name} ${t.selected}`
                : t.selectPart}
            </span>
          </div>
          <div
            className={`idds-ma-viewport-shell ${showGrid ? "has-grid" : "no-grid"}`}
          >
            <MechanicalTwinViewport
              model={visibleModel}
              selected={selected}
              onSelect={(id) => {
                setSelected(id);
                setInspectorTab("part");
              }}
              view={view}
              mode={meshMode}
              explosion={exploded ? 0.62 : 0}
              resetKey={resetKey}
              xrayCut={xrayCut}
              xrayOpacity={xrayOpacity}
              xrayIsolatedLayer={isolatedLayer || undefined}
              kinematicsPlaying={kinematicsPlaying}
            />
            {referenceUrl && referenceVisible && (
              <div
                className="idds-ma-image-overlay"
                style={{
                  width: `${referenceScale}%`,
                  opacity: referenceOpacity,
                  transform: `translate(-50%,-50%) rotate(${referenceRotation}deg)`,
                }}
              >
                <img src={referenceUrl} alt={t.referenceLayer} />
                <span>{t.referenceLayer}</span>
              </div>
            )}
            {renderMode === "internals" && (
              <div className="idds-ma-xray-controls">
                <label>
                  {t.xrayCut}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={xrayCut}
                    onChange={(event) => setXrayCut(Number(event.target.value))}
                  />
                </label>
                <label>
                  {t.isolate}
                  <select
                    value={isolatedLayer}
                    onChange={(event) => setIsolatedLayer(event.target.value)}
                  >
                    <option value="">{t.all}</option>
                    {groups.map((group) => (
                      <option value={group} key={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                </label>
                {groups.map((group) => (
                  <label key={group}>
                    {group}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={xrayOpacity[group] ?? 100}
                      onChange={(event) =>
                        setXrayOpacity((current) => ({
                          ...current,
                          [group]: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
                <small>{t.cutNote}</small>
              </div>
            )}
            {toolMode === "measure" && (
              <div className="idds-ma-measure-panel">
                <Ruler size={14} />
                <strong>{t.measureSummary}</strong>
                <span>
                  {t.extent}: {model.span.toFixed(2)} ×{" "}
                  {model.length.toFixed(2)} m
                </span>
                {selectedPart && (
                  <span>
                    {selectedPart.name}: {selectedSize[0].toFixed(3)} ×{" "}
                    {selectedSize[1].toFixed(3)} × {selectedSize[2].toFixed(3)}{" "}
                    m
                  </span>
                )}
              </div>
            )}
          </div>
          {referenceFile && (
            <div className="idds-ma-reference-controls">
              <strong>{t.reference}</strong>
              <label>
                <input
                  type="checkbox"
                  checked={referenceVisible}
                  onChange={(event) =>
                    setReferenceVisible(event.target.checked)
                  }
                />
                {t.imageVisible}
              </label>
              <label>
                {t.opacity}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={referenceOpacity}
                  onChange={(event) =>
                    setReferenceOpacity(Number(event.target.value))
                  }
                />
              </label>
              <label>
                {t.imageScale}
                <input
                  type="range"
                  min="20"
                  max="150"
                  step="1"
                  value={referenceScale}
                  onChange={(event) =>
                    setReferenceScale(Number(event.target.value))
                  }
                />
              </label>
              <label>
                {t.imageRotation}
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={referenceRotation}
                  onChange={(event) =>
                    setReferenceRotation(Number(event.target.value))
                  }
                />
              </label>
              <small>{t.imageHint}</small>
            </div>
          )}
          {renderMode === "simulation" && (
            <div className="idds-ma-dimensions-strip">
              <strong>{t.dimensionsHelp}</strong>
              {(
                [
                  "wingspan",
                  "chord",
                  "fuselageLength",
                  "propDiameter",
                  "motorCount",
                ] as const
              ).map((key) => (
                <label key={key}>
                  {key === "wingspan"
                    ? t.width
                    : key === "chord"
                      ? t.chord
                      : key === "fuselageLength"
                        ? t.length
                        : key === "propDiameter"
                          ? t.prop
                          : t.motors}
                  <output>
                    {key === "motorCount"
                      ? Math.round(dimensions[key])
                      : `${dimensions[key].toFixed(2)} m`}
                  </output>
                  <input
                    type="range"
                    min={key === "motorCount" ? 1 : 0.05}
                    max={
                      key === "wingspan"
                        ? 15
                        : key === "fuselageLength"
                          ? 5
                          : key === "motorCount"
                            ? 12
                            : 2
                    }
                    step={key === "motorCount" ? 1 : 0.01}
                    value={dimensions[key]}
                    onChange={(event) =>
                      updateGlobal(key, Number(event.target.value))
                    }
                  />
                </label>
              ))}
            </div>
          )}
        </main>

        <aside className="idds-ma-inspector">
          <header className="idds-ma-inspector-top">
            <SlidersHorizontal size={14} />
            <strong>{t.inspector}</strong>
            <small>{selectedPart?.category ?? t.cell}</small>
          </header>
          <div className="idds-ma-inspector-tabs">
            <button
              type="button"
              className={inspectorTab === "part" ? "is-active" : ""}
              onClick={() => setInspectorTab("part")}
            >
              {t.part}
            </button>
            <button
              type="button"
              className={inspectorTab === "cell" ? "is-active" : ""}
              onClick={() => setInspectorTab("cell")}
            >
              {t.cellTab}
            </button>
          </div>
          {inspectorTab === "part" ? (
            selectedPart ? (
              <div className="idds-ma-inspector-body">
                {isLocked && (
                  <p className="idds-ma-locked-notice">
                    <Lock size={13} />
                    {t.locked}
                  </p>
                )}
                <p className="idds-ma-part-name">{selectedPart.name}</p>
                <label>
                  {t.name}
                  <input
                    disabled={isLocked}
                    value={partEdit.name ?? selectedPart.name}
                    onChange={(event) =>
                      updatePart({ name: event.target.value })
                    }
                  />
                </label>
                <label>
                  {t.assign}
                  <select
                    disabled={isLocked}
                    value={selectedLayerName}
                    onChange={(event) => assignLayer(event.target.value)}
                  >
                    <option value="">{t.noLayer}</option>
                    {layerNames.map((layer) => (
                      <option key={layer}>{layer}</option>
                    ))}
                  </select>
                </label>
                <label className="idds-ma-color-field">
                  {t.color}
                  <input
                    disabled={isLocked}
                    type="color"
                    value={partEdit.color ?? selectedPart.color}
                    onChange={(event) =>
                      updatePart({ color: event.target.value })
                    }
                  />
                </label>
                <label className="idds-ma-check-field">
                  <input
                    disabled={isLocked}
                    type="checkbox"
                    checked={!partEdit.hidden}
                    onChange={toggleSelectedVisibility}
                  />
                  {partEdit.hidden ? t.hidden : t.visible}
                </label>
                {toolMode === "measure" ? (
                  <div className="idds-ma-measure-readout">
                    <strong>{t.dimensions}</strong>
                    {axisNames.map((axis, index) => (
                      <span key={axis}>
                        {axis}: {selectedSize[index].toFixed(3)} m
                      </span>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="idds-ma-transform-heading">
                      <strong>
                        {toolMode === "move"
                          ? t.move
                          : toolMode === "rotate"
                            ? t.rotate
                            : toolMode === "scale"
                              ? t.scale
                              : t.transform}
                      </strong>
                      <button
                        type="button"
                        disabled={isLocked}
                        onClick={resetTransform}
                      >
                        {t.resetTransform}
                      </button>
                    </div>
                    {vecFields.map((field) => (
                      <fieldset
                        key={field}
                        className={`idds-ma-vector-group ${toolMode === (field === "offset" ? "move" : field === "rotation" ? "rotate" : "scale") ? "is-current" : ""}`}
                      >
                        <legend>
                          {field === "offset"
                            ? t.offset
                            : field === "rotation"
                              ? t.rotation
                              : t.scaleValue}
                        </legend>
                        <div>
                          {axisNames.map((axis, index) => {
                            const base: number[] =
                              field === "scale" ? [1, 1, 1] : [0, 0, 0];
                            const val = partEdit[field]?.[index] ?? base[index];
                            return (
                              <label key={axis}>
                                <span>{axis}</span>
                                <input
                                  disabled={isLocked}
                                  type="number"
                                  min={
                                    field === "scale"
                                      ? 0.01
                                      : field === "rotation"
                                        ? -360
                                        : -5
                                  }
                                  max={
                                    field === "scale"
                                      ? 5
                                      : field === "rotation"
                                        ? 360
                                        : 5
                                  }
                                  step={
                                    field === "scale"
                                      ? 0.01
                                      : field === "rotation"
                                        ? 1
                                        : snapEnabled
                                          ? snapStep
                                          : 0.01
                                  }
                                  value={Number(val.toFixed(3))}
                                  onChange={(event) =>
                                    updateVector(
                                      field,
                                      index,
                                      Number(event.target.value),
                                    )
                                  }
                                />
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    ))}
                  </>
                )}
                <div className="idds-ma-measure-readout">
                  <strong>{t.dimensions}</strong>
                  {axisNames.map((axis, index) => (
                    <span key={axis}>
                      {axis}: {selectedSize[index].toFixed(3)} m
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="idds-ma-empty">{t.none}</p>
            )
          ) : (
            <div className="idds-ma-inspector-body">
              <h3>{t.dimensions}</h3>
              {(
                [
                  "wingspan",
                  "chord",
                  "fuselageLength",
                  "propDiameter",
                  "motorCount",
                ] as const
              ).map((key) => (
                <label key={key}>
                  {key === "wingspan"
                    ? t.width
                    : key === "chord"
                      ? t.chord
                      : key === "fuselageLength"
                        ? t.length
                        : key === "propDiameter"
                          ? t.prop
                          : t.motors}
                  <input
                    type="number"
                    min={key === "motorCount" ? 1 : 0.05}
                    max={key === "motorCount" ? 12 : 30}
                    step={key === "motorCount" ? 1 : 0.01}
                    value={dimensions[key]}
                    onChange={(event) =>
                      updateGlobal(key, Number(event.target.value))
                    }
                  />
                </label>
              ))}
              <details className="idds-ma-advanced" open>
                <summary>{t.advanced}</summary>
                {(
                  [
                    "fuselageWidth",
                    "fuselageHeight",
                    "sweepDeg",
                    "dihedralDeg",
                    "gearHeight",
                  ] as const
                ).map((key, index) => {
                  const defaults = [0.22, 0.16, 9, 3, 0.12];
                  const value = Number(model.settings[key] ?? defaults[index]);
                  const labels = [
                    t.fuselageWidth,
                    t.fuselageHeight,
                    t.sweep,
                    t.dihedral,
                    t.gear,
                  ];
                  return (
                    <label key={key}>
                      {labels[index]}
                      <input
                        type="number"
                        min={index < 2 || index === 4 ? 0.01 : -45}
                        max={index < 2 || index === 4 ? 2 : 45}
                        step={0.01}
                        value={value}
                        onChange={(event) =>
                          updateAdvanced(key, Number(event.target.value))
                        }
                      />
                    </label>
                  );
                })}
                <label>
                  {t.finish}
                  <select
                    value={model.settings.finish ?? "carbon"}
                    onChange={(event) =>
                      updateAdvanced("finish", event.target.value)
                    }
                  >
                    <option value="carbon">{t.carbon}</option>
                    <option value="titanium">{t.titanium}</option>
                    <option value="ceramic">{t.ceramic}</option>
                  </select>
                </label>
                <label className="idds-ma-color-field">
                  {t.shell}
                  <input
                    type="color"
                    value={model.settings.shellColor ?? "#17212a"}
                    onChange={(event) =>
                      updateAdvanced("shellColor", event.target.value)
                    }
                  />
                </label>
              </details>
              <div className="idds-ma-measure-readout">
                <strong>{t.measureSummary}</strong>
                <span>
                  {model.span.toFixed(2)}
                  {` ${t.meters} × `}
                  {model.length.toFixed(2)}
                  {` ${t.meters} · `} {model.parts.length} {t.items}
                </span>
              </div>
            </div>
          )}
        </aside>
      </div>
      <footer className="idds-ma-footer">
        <span className="idds-ma-live-dot" />
        {status || t.statusReady}
        <small>{t.keyboard}</small>
      </footer>
    </section>
  );
}
