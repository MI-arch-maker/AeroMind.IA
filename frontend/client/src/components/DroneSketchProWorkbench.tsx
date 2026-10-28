import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Circle,
  Copy,
  Eraser,
  Eye,
  EyeOff,
  FlipHorizontal2,
  Grid3X3,
  Hand,
  Layers3,
  Minus,
  MousePointer2,
  Move,
  PaintBucket,
  PenLine,
  Pipette,
  Plus,
  RectangleHorizontal,
  Redo2,
  RotateCcw,
  RotateCw,
  Ruler,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  WandSparkles,
  Lock,
  Unlock,
  Pencil,
  Play,
  Pause,
  KeyRound,
  SlidersHorizontal,
} from "lucide-react";
import type {
  ConceptConfig,
  DroneSketchKeyframe,
  DroneSketchStroke,
  InstalledMaterial,
} from "../lib/aeroEngine";
import { evaluateDroneSketchAnimation } from "../lib/droneSketchAnimation";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import {
  createStudioLayer,
  deleteStudioLayer,
  renameStudioLayer,
  reorderStudioLayer,
  updateStudioLayerSettings,
} from "../lib/studioLayerCommands";
import "./drone-sketch-workbench.css";
import "./drone-sketch-motion.css";

type Tool =
  | "select"
  | "freehand"
  | "line"
  | "rectangle"
  | "ellipse"
  | "wing"
  | "fuselage"
  | "tail"
  | "payload"
  | "measure"
  | "annotation"
  | "triangle"
  | "hexagon"
  | "gear"
  | "propeller"
  | "erase"
  | "pan"
  | "eyedropper"
  | "fill";
type DrawTool = Exclude<
  Tool,
  "select" | "erase" | "pan" | "eyedropper" | "fill"
>;
type ComponentKind = "wing" | "fuselage" | "motor" | "payload" | "sensor";
type Props = {
  config: ConceptConfig;
  setConfig: Dispatch<SetStateAction<ConceptConfig>>;
  activeProfile?: DroneCatalogDesign;
  parts?: InstalledMaterial[];
  context: "studio" | "construction";
  onUserIntegration?: () => void;
};
type Point = { x: number; y: number };
const W = 1000;
const H = 560;
const toolItems: Array<{
  id: Tool;
  label: string;
  shortcut?: string;
  group: string;
}> = [
  {
    id: "select",
    label: "Sélectionner et déplacer",
    shortcut: "V",
    group: "NAVIGATION",
  },
  { id: "pan", label: "Déplacer la vue", shortcut: "H", group: "NAVIGATION" },
  {
    id: "freehand",
    label: "Crayon / tracé libre",
    shortcut: "B",
    group: "DESSIN",
  },
  { id: "line", label: "Ligne", shortcut: "L", group: "DESSIN" },
  { id: "rectangle", label: "Rectangle", shortcut: "R", group: "FORMES" },
  { id: "ellipse", label: "Ellipse", shortcut: "E", group: "FORMES" },
  { id: "triangle", label: "Triangle vectoriel", group: "FORMES" },
  { id: "hexagon", label: "Hexagone vectoriel", group: "FORMES" },
  { id: "gear", label: "Engrenage mécanique", group: "MÉCANIQUE" },
  { id: "propeller", label: "Hélice / rotor mécanique", group: "MÉCANIQUE" },
  { id: "wing", label: "Aile", shortcut: "W", group: "CELLULE" },
  { id: "fuselage", label: "Fuselage", shortcut: "F", group: "CELLULE" },
  { id: "tail", label: "Empennage", shortcut: "Y", group: "CELLULE" },
  { id: "payload", label: "Charge utile", shortcut: "P", group: "CELLULE" },
  { id: "measure", label: "Cotation", shortcut: "M", group: "ANNOTATION" },
  { id: "annotation", label: "Texte", shortcut: "T", group: "ANNOTATION" },
  {
    id: "eyedropper",
    label: "Pipette · échantillonner la couleur d’un objet",
    shortcut: "I",
    group: "STYLE",
  },
  {
    id: "fill",
    label: "Remplir la forme sélectionnée",
    shortcut: "K",
    group: "STYLE",
  },
  { id: "erase", label: "Gomme", shortcut: "X", group: "STYLE" },
];
const paletteGroups = [...new Set(toolItems.map((item) => item.group))];
const toolIcon = (id: Tool) =>
  id === "select" ? (
    <MousePointer2 size={17} />
  ) : id === "pan" ? (
    <Hand size={17} />
  ) : id === "freehand" ? (
    <PenLine size={17} />
  ) : id === "line" ? (
    <Minus size={17} />
  ) : id === "rectangle" ? (
    <RectangleHorizontal size={17} />
  ) : id === "ellipse" ? (
    <Circle size={17} />
  ) : id === "measure" ? (
    <Ruler size={17} />
  ) : id === "annotation" ? (
    <Type size={17} />
  ) : id === "erase" ? (
    <Eraser size={17} />
  ) : id === "eyedropper" ? (
    <Pipette size={17} />
  ) : id === "fill" ? (
    <PaintBucket size={17} />
  ) : (
    <span className={`sketch-tool-dot sketch-tool-${id}`} />
  );

const colors: Record<DrawTool, string> = {
  triangle: "#80d8c3",
  hexagon: "#83b5ee",
  gear: "#f1c76b",
  propeller: "#f19b79",
  freehand: "#8de8df",
  line: "#a9d7ff",
  rectangle: "#8fd3ff",
  ellipse: "#b9a5ff",
  wing: "#f1c76b",
  fuselage: "#71b7d1",
  tail: "#d99aee",
  payload: "#ff9c7d",
  measure: "#ff8f78",
  annotation: "#d5e7a0",
};
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const pathOf = (points: Point[], close = false) =>
  `${points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")}${close ? " Z" : ""}`;
const snap = (n: number, enabled: boolean) =>
  enabled ? Math.round(n / 20) * 20 : n;
const isGeometry = (stroke: DroneSketchStroke) =>
  !["annotation", "measure"].includes(stroke.tool) && stroke.points.length > 1;
const closedTools = [
  "rectangle",
  "ellipse",
  "wing",
  "fuselage",
  "tail",
  "payload",
  "triangle",
  "hexagon",
  "gear",
];
function vectorPath(tool: Tool, first: Point, second: Point) {
  const left = Math.min(first.x, second.x),
    right = Math.max(first.x, second.x);
  const top = Math.min(first.y, second.y),
    bottom = Math.max(first.y, second.y);
  const cx = (left + right) / 2,
    cy = (top + bottom) / 2;
  const rx = Math.max(2, (right - left) / 2),
    ry = Math.max(2, (bottom - top) / 2);
  if (tool === "triangle")
    return `M${cx} ${top} L${right} ${bottom} L${left} ${bottom} Z`;
  if (tool === "hexagon")
    return `M${cx - rx} ${cy} L${cx - rx / 2} ${top} L${cx + rx / 2} ${top} L${cx + rx} ${cy} L${cx + rx / 2} ${bottom} L${cx - rx / 2} ${bottom} Z`;
  if (tool === "gear") {
    const pts = Array.from({ length: 24 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 12;
      const r = i % 2 ? 0.82 : 1;
      return { x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r };
    });
    return `${pathOf(pts, true)} M${cx - rx * 0.28} ${cy} a${rx * 0.28} ${ry * 0.28} 0 1 0 ${rx * 0.56} 0 a${rx * 0.28} ${ry * 0.28} 0 1 0 ${-rx * 0.56} 0`;
  }
  if (tool === "propeller") {
    return `M${cx} ${cy} C${cx - rx * 0.2} ${cy - ry * 0.25} ${cx - rx * 0.9} ${top} ${cx - rx * 0.55} ${top + ry * 0.08} C${cx - rx * 0.2} ${cy - ry * 0.1} ${cx - rx * 0.12} ${cy - ry * 0.05} ${cx} ${cy} Z M${cx} ${cy} C${cx + rx * 0.22} ${cy - rx * 0.05} ${right} ${cy - ry * 0.5} ${right - rx * 0.08} ${cy - ry * 0.18} C${cx + rx * 0.12} ${cy - ry * 0.1} ${cx + rx * 0.08} ${cy + ry * 0.05} ${cx} ${cy} Z M${cx} ${cy} C${cx + rx * 0.05} ${cy + ry * 0.2} ${cx + rx * 0.3} ${bottom} ${cx + rx * 0.08} ${bottom - ry * 0.04} C${cx - rx * 0.12} ${cy + ry * 0.16} ${cx - rx * 0.1} ${cy + ry * 0.08} ${cx} ${cy} Z`;
  }
  return "";
}

export function DroneSketchProWorkbench({
  config,
  setConfig,
  activeProfile,
  parts = [],
  context,
  onUserIntegration,
}: Props) {
  const customSelected = config.engineeringSelection?.source === "custom";
  const profile = customSelected ? undefined : activeProfile;
  const [strokes, setStrokes] = useState<DroneSketchStroke[]>(
    config.customSketch?.strokes ?? [],
  );
  const [tool, setTool] = useState<Tool>("select");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [grid, setGrid] = useState(true);
  const [snapOn, setSnapOn] = useState(true);
  const [objectSnap, setObjectSnap] = useState(true);
  const [ortho, setOrtho] = useState(false);
  const [symmetry, setSymmetry] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [primary, setPrimary] = useState("#4cc9c0");
  const [secondary, setSecondary] = useState("#e8b85c");
  const [gradient, setGradient] = useState(true);
  const [brushStyle, setBrushStyle] =
    useState<NonNullable<DroneSketchStroke["brushStyle"]>>("pencil");
  const [opacity, setOpacity] = useState(0.88);
  const [animationTime, setAnimationTime] = useState(0);
  const [animationPlaying, setAnimationPlaying] = useState(false);
  const [animationValues, setAnimationValues] = useState({
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    opacity: 1,
  });
  const [component, setComponent] = useState<ComponentKind>("wing");
  const [componentSpan, setComponentSpan] = useState(320);
  const [componentLength, setComponentLength] = useState(360);
  const [componentDiameter, setComponentDiameter] = useState(52);
  const [geometryX, setGeometryX] = useState(0);
  const [geometryY, setGeometryY] = useState(0);
  const [geometryWidth, setGeometryWidth] = useState(0);
  const [geometryHeight, setGeometryHeight] = useState(0);
  const [annotation, setAnnotation] = useState("Point de contrôle");
  const [layerDraft, setLayerDraft] = useState("");
  const [renamingLayer, setRenamingLayer] = useState("");
  const [renamedLayerDraft, setRenamedLayerDraft] = useState("");
  const [notice, setNotice] = useState("");
  const drawing = useRef(false);
  const dragging = useRef(false);
  const start = useRef<Point | null>(null);
  const last = useRef<Point | null>(null);
  const panStart = useRef<{ x: number; y: number; origin: Point } | null>(null);
  const activeId = useRef<string | null>(null);
  const operationStart = useRef<DroneSketchStroke[] | null>(null);
  const strokesRef = useRef(strokes);
  const pastRef = useRef<DroneSketchStroke[][]>([]);
  const futureRef = useRef<DroneSketchStroke[][]>([]);
  const publishedAt = useRef(config.customSketch?.modifiedAt ?? "");
  const layers = config.studioLayers ?? [];
  const activeLayer = layers.includes(config.activeStudioLayer ?? "")
    ? (config.activeStudioLayer ?? "")
    : "";
  const layerSettings = config.studioLayerSettings ?? {};
  const activeLayerLocked = Boolean(
    activeLayer && layerSettings[activeLayer]?.locked,
  );
  const settingsForLayer = (label: string) => ({
    visible: layerSettings[label]?.visible ?? true,
    locked: layerSettings[label]?.locked ?? false,
    opacity: layerSettings[label]?.opacity ?? 100,
    blendMode: layerSettings[label]?.blendMode ?? ("normal" as const),
    exposureEV: layerSettings[label]?.exposureEV ?? 0,
    contrast: layerSettings[label]?.contrast ?? 100,
    saturation: layerSettings[label]?.saturation ?? 100,
    whiteBalance: layerSettings[label]?.whiteBalance ?? 0,
    blackLevel: layerSettings[label]?.blackLevel ?? 0,
    whiteLevel: layerSettings[label]?.whiteLevel ?? 100,
  });
  const customGeometry = strokes.some(isGeometry);
  const activated = Boolean(profile || (customSelected && customGeometry));
  const selected = strokes.filter((stroke) => selectedIds.includes(stroke.id));
  const selectedMutable = selected.every(
    (stroke) => !stroke.layer || !layerSettings[stroke.layer]?.locked,
  );
  const visibleStrokes = useMemo(
    () =>
      strokes
        .filter(
          (stroke) =>
            !stroke.layer || layerSettings[stroke.layer]?.visible !== false,
        )
        .sort((a, b) => {
          const aIndex = layers.indexOf(a.layer ?? "");
          const bIndex = layers.indexOf(b.layer ?? "");
          return bIndex - aIndex;
        }),
    [strokes, layerSettings, layers],
  );
  const sourceLabel =
    profile?.label ??
    (customSelected
      ? (config.engineeringSelection?.droneLabel ??
        config.designName ??
        "Drone personnalisé")
      : "Dessin vierge");
  const currentTool =
    toolItems.find((item) => item.id === tool)?.label ?? "Sélection";

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);
  useEffect(() => {
    if (!animationPlaying) return;
    const timer = window.setInterval(
      () =>
        setAnimationTime((time) =>
          time >= 10 ? 0 : Number((time + 0.1).toFixed(1)),
        ),
      100,
    );
    return () => window.clearInterval(timer);
  }, [animationPlaying]);
  useEffect(() => {
    if (selected.length === 1 && selected[0].tool === "annotation")
      setAnnotation(selected[0].label ?? "");
  }, [selected[0]?.id]);
  useEffect(() => {
    const stroke = selected[0];
    if (!stroke?.points.length) return;
    const xs = stroke.points.map((point) => point.x);
    const ys = stroke.points.map((point) => point.y);
    setGeometryX((Math.min(...xs) + Math.max(...xs)) / 2);
    setGeometryY((Math.min(...ys) + Math.max(...ys)) / 2);
    setGeometryWidth(Math.max(1, Math.max(...xs) - Math.min(...xs)));
    setGeometryHeight(Math.max(1, Math.max(...ys) - Math.min(...ys)));
  }, [selected[0]?.id]);
  useEffect(() => {
    const values = evaluateDroneSketchAnimation(
      selected[0]?.keyframes,
      animationTime,
    );
    setAnimationValues(values);
  }, [selected[0]?.id, selected[0]?.keyframes, animationTime]);
  useEffect(() => {
    const incoming = config.customSketch?.modifiedAt ?? "";
    if (incoming === publishedAt.current) return;
    publishedAt.current = incoming;
    const next = config.customSketch?.strokes ?? [];
    strokesRef.current = next;
    setStrokes(next);
    setSelectedIds([]);
    pastRef.current = [];
    futureRef.current = [];
  }, [config.customSketch?.modifiedAt, config.customSketch?.strokes]);

  const writeDocument = (
    next: DroneSketchStroke[],
    previous = strokesRef.current,
  ) => {
    pastRef.current = [...pastRef.current.slice(-39), previous];
    futureRef.current = [];
    strokesRef.current = next;
    setStrokes(next);
    const modifiedAt = new Date().toISOString();
    publishedAt.current = modifiedAt;
    setConfig((current) => {
      if (next.length) {
        const droneLabel =
          current.designName && !current.designName.startsWith("Projet vierge")
            ? current.designName
            : (profile?.label ?? "Drone personnalisé");
        return {
          ...current,
          designName: droneLabel,
          platformProfile:
            current.platformProfile ?? profile?.id ?? "custom-sketch",
          customSketch: { version: 1, strokes: next, modifiedAt },
          engineeringSelection: {
            ...current.engineeringSelection,
            source: "custom",
            droneId: current.platformProfile ?? profile?.id ?? "custom-sketch",
            droneLabel,
            updatedAt: modifiedAt,
          },
        };
      }
      const base = { ...current, customSketch: undefined };
      if (current.engineeringSelection?.source === "custom")
        return {
          ...base,
          platformProfile: undefined,
          engineeringSelection: undefined,
        };
      return base;
    });
    if (next.some(isGeometry)) onUserIntegration?.();
  };
  const applyExternalStrokes = (next: DroneSketchStroke[]) => {
    strokesRef.current = next;
    setStrokes(next);
    const modifiedAt = new Date().toISOString();
    publishedAt.current = modifiedAt;
    setConfig((current) =>
      next.length
        ? {
            ...current,
            customSketch: { version: 1, strokes: next, modifiedAt },
            engineeringSelection: {
              ...current.engineeringSelection,
              source: "custom",
              droneId:
                current.platformProfile ?? profile?.id ?? "custom-sketch",
              droneLabel:
                current.engineeringSelection?.droneLabel ??
                profile?.label ??
                "Drone personnalisé",
              updatedAt: modifiedAt,
            },
          }
        : current.engineeringSelection?.source === "custom"
          ? {
              ...current,
              customSketch: undefined,
              platformProfile: undefined,
              engineeringSelection: undefined,
            }
          : { ...current, customSketch: undefined },
    );
    if (next.some(isGeometry)) onUserIntegration?.();
  };
  const undo = () => {
    const previous = pastRef.current.pop();
    if (!previous) return;
    futureRef.current = [...futureRef.current, strokesRef.current];
    applyExternalStrokes(previous);
  };
  const redo = () => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current = [...pastRef.current, strokesRef.current];
    applyExternalStrokes(next);
  };
  const point = (event: ReactPointerEvent<SVGElement>): Point => {
    const svg =
      event.currentTarget instanceof SVGSVGElement
        ? event.currentTarget
        : event.currentTarget.ownerSVGElement;
    const rect = svg?.getBoundingClientRect();
    if (!rect) return { x: W / 2, y: H / 2 };
    let position = {
      x: snap(
        clamp(((event.clientX - rect.left) / rect.width) * W, 0, W),
        snapOn,
      ),
      y: snap(
        clamp(((event.clientY - rect.top) / rect.height) * H, 0, H),
        snapOn,
      ),
    };
    if (ortho && drawing.current && start.current) {
      const dx = position.x - start.current.x;
      const dy = position.y - start.current.y;
      const angle =
        Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const length = Math.hypot(dx, dy);
      position = {
        x: clamp(start.current.x + Math.cos(angle) * length, 0, W),
        y: clamp(start.current.y + Math.sin(angle) * length, 0, H),
      };
    }
    if (objectSnap) {
      const candidates = visibleStrokes.flatMap((stroke) => [
        ...stroke.points,
        ...stroke.points.slice(1).map((current, index) => ({
          x: (stroke.points[index].x + current.x) / 2,
          y: (stroke.points[index].y + current.y) / 2,
        })),
      ]);
      const closest = candidates.reduce<{
        point: Point;
        distance: number;
      } | null>((best, candidate) => {
        const distance = Math.hypot(
          candidate.x - position.x,
          candidate.y - position.y,
        );
        return distance < (best?.distance ?? 13)
          ? { point: candidate, distance }
          : best;
      }, null);
      if (closest) position = closest.point;
    }
    return position;
  };
  const canEditLayer = (name: string) => !name || !layerSettings[name]?.locked;
  const updateSelected = (
    fn: (stroke: DroneSketchStroke) => DroneSketchStroke,
  ) => {
    if (!selected.length || !selectedMutable) return;
    writeDocument(
      strokesRef.current.map((stroke) =>
        selectedIds.includes(stroke.id) ? fn(stroke) : stroke,
      ),
    );
  };
  const createAnnotationAt = (position: Point) => {
    if (!activeLayer) {
      setNotice("Créez puis sélectionnez un calque avant de placer du texte.");
      return;
    }
    if (activeLayerLocked) {
      setNotice(`Le calque « ${activeLayer} » est verrouillé.`);
      return;
    }
    const text = annotation.trim();
    if (!text) {
      setNotice("Saisissez le texte à placer dans le panneau Texte.");
      return;
    }
    const stroke: DroneSketchStroke = {
      id: `text-${Date.now()}`,
      tool: "annotation",
      color: primary,
      width: 1,
      opacity,
      layer: activeLayer,
      label: text,
      component: "freeform",
      points: [position],
    };
    writeDocument([...strokesRef.current, stroke]);
    setSelectedIds([stroke.id]);
    setNotice(
      `Texte placé sur le calque « ${activeLayer} ». Vous pouvez encore le modifier dans l’inspecteur.`,
    );
  };
  const selectObject = (event: ReactPointerEvent<SVGElement>, id: string) => {
    event.stopPropagation();
    if (tool === "pan") {
      const svg =
        event.currentTarget instanceof SVGSVGElement
          ? event.currentTarget
          : event.currentTarget.ownerSVGElement;
      svg?.setPointerCapture(event.pointerId);
      panStart.current = {
        x: event.clientX,
        y: event.clientY,
        origin: canvasPan,
      };
      return;
    }
    const hit = strokesRef.current.find((stroke) => stroke.id === id);
    if (tool === "eyedropper") {
      if (hit) {
        setPrimary(hit.color);
        setNotice(
          `Couleur ${hit.color} prélevée sur « ${hit.label ?? hit.tool} ».`,
        );
        setTool("select");
      }
      return;
    }
    if (tool === "fill") {
      if (
        !hit ||
        ![
          "rectangle",
          "ellipse",
          "wing",
          "fuselage",
          "tail",
          "payload",
        ].includes(hit.tool)
      ) {
        setNotice(
          "Le remplissage s’applique aux formes fermées et aux pièces de cellule.",
        );
        return;
      }
      if (!canEditLayer(hit.layer ?? "")) {
        setNotice(
          `Le calque « ${hit.layer ?? ""} » est verrouillé et ne peut pas être modifié.`,
        );
        return;
      }
      setSelectedIds([id]);
      writeDocument(
        strokesRef.current.map((stroke) =>
          stroke.id === id
            ? { ...stroke, fill: primary, fillSecondary: undefined }
            : stroke,
        ),
      );
      setNotice(
        `Remplissage ${primary} appliqué à « ${hit.label ?? hit.tool} ».`,
      );
      return;
    }
    if (tool === "annotation" && hit?.tool !== "annotation") {
      createAnnotationAt(point(event));
      return;
    }
    const multi = event.shiftKey;
    const nextIds = multi
      ? selectedIds.includes(id)
        ? selectedIds.filter((item) => item !== id)
        : [...selectedIds, id]
      : [id];
    if (tool === "erase") {
      if (!hit || !canEditLayer(hit.layer ?? "")) {
        setNotice(
          `Le trait est sur le calque verrouillé « ${hit?.layer ?? ""} » et ne peut pas être effacé.`,
        );
        return;
      }
      writeDocument(strokesRef.current.filter((stroke) => stroke.id !== id));
      setSelectedIds([]);
      return;
    }
    setSelectedIds(nextIds);
    if (tool === "select" && hit && canEditLayer(hit.layer ?? "")) {
      dragging.current = true;
      operationStart.current = strokesRef.current;
      activeId.current = id;
      last.current = point(event);
    }
  };
  const begin = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (tool === "pan") {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panStart.current = {
        x: event.clientX,
        y: event.clientY,
        origin: canvasPan,
      };
      return;
    }
    if (tool === "eyedropper" || tool === "fill") {
      setNotice(
        tool === "fill"
          ? "Cliquez sur une forme fermée pour lui appliquer la couleur active."
          : "Cliquez sur un objet pour prélever sa couleur.",
      );
      return;
    }
    if (tool === "select") {
      setSelectedIds([]);
      return;
    }
    if (tool === "erase") return;
    if (!activeLayer) {
      setNotice("Créez puis sélectionnez un calque avant de dessiner.");
      return;
    }
    if (activeLayerLocked) {
      setNotice(`Le calque « ${activeLayer} » est verrouillé.`);
      return;
    }
    const position = point(event);
    if (tool === "annotation") {
      createAnnotationAt(position);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    start.current = position;
    operationStart.current = strokesRef.current;
    const closed = closedTools.includes(tool);
    const brushWidth =
      brushStyle === "calligraphy"
        ? 8
        : brushStyle === "marker"
          ? 12
          : brushStyle === "airbrush"
            ? 18
            : 4;
    const stroke: DroneSketchStroke = {
      id: `sketch-${Date.now()}`,
      tool: tool as DrawTool,
      color: colors[tool as DrawTool],
      width: tool === "freehand" ? brushWidth : tool === "measure" ? 2 : 6,
      opacity:
        brushStyle === "marker"
          ? 0.42
          : brushStyle === "airbrush"
            ? 0.2
            : opacity,
      brushStyle: tool === "freehand" ? brushStyle : undefined,
      fill: closed ? primary : undefined,
      fillSecondary: closed && gradient ? secondary : undefined,
      layer: activeLayer,
      component: "freeform",
      points: [position],
    };
    activeId.current = stroke.id;
    setSelectedIds([stroke.id]);
    const next = [...strokesRef.current, stroke];
    strokesRef.current = next;
    setStrokes(next);
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (panStart.current) {
      setCanvasPan({
        x: panStart.current.origin.x + event.clientX - panStart.current.x,
        y: panStart.current.origin.y + event.clientY - panStart.current.y,
      });
      return;
    }
    const position = point(event);
    if (dragging.current && last.current && selectedIds.length) {
      const dx = position.x - last.current.x;
      const dy = position.y - last.current.y;
      const next = strokesRef.current.map((stroke) =>
        selectedIds.includes(stroke.id)
          ? {
              ...stroke,
              points: stroke.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
            }
          : stroke,
      );
      strokesRef.current = next;
      setStrokes(next);
      last.current = position;
      return;
    }
    if (!drawing.current || !activeId.current || !start.current) return;
    const next = strokesRef.current.map((stroke) =>
      stroke.id !== activeId.current
        ? stroke
        : ["freehand", "wing", "fuselage", "tail", "payload"].includes(
              stroke.tool,
            )
          ? { ...stroke, points: [...stroke.points, position] }
          : { ...stroke, points: [start.current!, position] },
    );
    strokesRef.current = next;
    setStrokes(next);
  };
  const end = () => {
    if (panStart.current) {
      panStart.current = null;
      return;
    }
    if (dragging.current) {
      dragging.current = false;
      writeDocument(
        strokesRef.current,
        operationStart.current ?? strokesRef.current,
      );
      operationStart.current = null;
      return;
    }
    if (!drawing.current) return;
    drawing.current = false;
    const clean = strokesRef.current.filter(
      (stroke) => stroke.points.length > 1 || stroke.tool === "annotation",
    );
    const current = clean.find((stroke) => stroke.id === activeId.current);
    const next =
      symmetry && current && !["measure", "annotation"].includes(current.tool)
        ? [
            ...clean,
            {
              ...current,
              id: `${current.id}-mirror`,
              points: current.points.map((p) => ({ ...p, x: W - p.x })),
            },
          ]
        : clean;
    writeDocument(next, operationStart.current ?? strokesRef.current);
    operationStart.current = null;
    start.current = null;
  };
  const createComponent = () => {
    if (!activeLayer || activeLayerLocked) {
      setNotice(
        "Créez et sélectionnez un calque déverrouillé avant d’ajouter un composant.",
      );
      return;
    }
    const cx = W / 2;
    const cy = H / 2;
    const id = `component-${Date.now()}`;
    const span = clamp(componentSpan, 60, 440);
    const length = clamp(componentLength, 80, 760);
    const diameter = clamp(componentDiameter, 12, 130);
    const common = {
      id,
      color: primary,
      fill: primary,
      fillSecondary: gradient ? secondary : undefined,
      opacity,
      width: 5,
      layer: activeLayer,
      component: "parametric" as const,
      parameters: { span, length, diameter },
    };
    const shapes: Record<ComponentKind, DroneSketchStroke> = {
      wing: {
        ...common,
        tool: "wing",
        label: "Aile paramétrique",
        points: [
          { x: cx, y: cy },
          { x: cx - span, y: cy - diameter * 0.7 },
          { x: cx - span * 0.88, y: cy - diameter * 0.7 },
          { x: cx + span * 0.1, y: cy + diameter * 0.08 },
          { x: cx + span * 0.88, y: cy + diameter * 0.7 },
          { x: cx - span * 0.88, y: cy + diameter * 0.7 },
          { x: cx, y: cy },
        ],
      },
      fuselage: {
        ...common,
        tool: "fuselage",
        label: "Fuselage paramétrique",
        points: [
          { x: cx - length / 2, y: cy },
          { x: cx - length * 0.3, y: cy - diameter / 2 },
          { x: cx + length / 2, y: cy },
          { x: cx - length * 0.3, y: cy + diameter / 2 },
          { x: cx - length / 2, y: cy },
        ],
      },
      motor: {
        ...common,
        tool: "ellipse",
        label: "Motorisation",
        points: [
          { x: cx + length * 0.32, y: cy - diameter / 2 },
          { x: cx + length * 0.32 + diameter, y: cy + diameter / 2 },
        ],
      },
      payload: {
        ...common,
        tool: "rectangle",
        label: "Baie de charge utile",
        points: [
          { x: cx - diameter, y: cy - diameter * 0.7 },
          { x: cx + diameter, y: cy + diameter * 0.7 },
        ],
      },
      sensor: {
        ...common,
        tool: "ellipse",
        label: "Capteur",
        points: [
          { x: cx - diameter / 2, y: cy - diameter / 2 },
          { x: cx + diameter / 2, y: cy + diameter / 2 },
        ],
      },
    };
    const stroke = shapes[component];
    writeDocument([...strokesRef.current, stroke]);
    setSelectedIds([stroke.id]);
    setNotice(`${stroke.label} ajouté au calque « ${activeLayer} ».`);
  };
  const transform = (scaleFactor: number, angle: number) => {
    const points = selected.flatMap((stroke) => stroke.points);
    if (!points.length || !selectedMutable) return;
    const center = {
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
    };
    const radians = (angle * Math.PI) / 180;
    updateSelected((stroke) => ({
      ...stroke,
      rotation: (stroke.rotation ?? 0) + angle,
      scale: clamp((stroke.scale ?? 1) * scaleFactor, 0.1, 8),
      points: stroke.points.map((p) => {
        const x = center.x + (p.x - center.x) * scaleFactor;
        const y = center.y + (p.y - center.y) * scaleFactor;
        return {
          x:
            center.x +
            (x - center.x) * Math.cos(radians) -
            (y - center.y) * Math.sin(radians),
          y:
            center.y +
            (x - center.x) * Math.sin(radians) +
            (y - center.y) * Math.cos(radians),
        };
      }),
    }));
  };
  const duplicate = () => {
    if (!selected.length || !selectedMutable) return;
    const copies = selected.map((stroke) => ({
      ...stroke,
      id: `copy-${Date.now()}-${stroke.id}`,
      points: stroke.points.map((p) => ({ x: p.x + 28, y: p.y + 28 })),
    }));
    writeDocument([...strokesRef.current, ...copies]);
    setSelectedIds(copies.map((stroke) => stroke.id));
  };
  const mirrorSelected = () => {
    if (!selected.length || !selectedMutable) return;
    const copies = selected.map((stroke) => ({
      ...stroke,
      id: `mirror-${Date.now()}-${stroke.id}`,
      points: stroke.points.map((point) => ({ x: W - point.x, y: point.y })),
    }));
    writeDocument([...strokesRef.current, ...copies]);
    setSelectedIds(copies.map((stroke) => stroke.id));
    setNotice(
      `${copies.length} objet(s) miroir(s) créé(s) sur le plan médian.`,
    );
  };
  const linearArray = () => {
    if (!selected.length || !selectedMutable) return;
    const bounds = selected.flatMap((stroke) => stroke.points);
    const span = Math.max(
      40,
      Math.max(...bounds.map((p) => p.x)) - Math.min(...bounds.map((p) => p.x)),
    );
    const copies = [1, 2, 3].flatMap((index) =>
      selected.map((stroke) => ({
        ...stroke,
        id: `array-${Date.now()}-${index}-${stroke.id}`,
        points: stroke.points.map((point) => ({
          x: point.x + index * (span + 20),
          y: point.y,
        })),
      })),
    );
    writeDocument([...strokesRef.current, ...copies]);
    setSelectedIds(copies.map((stroke) => stroke.id));
    setNotice(`${copies.length} copie(s) créée(s) dans un réseau linéaire X.`);
  };
  const applyExactGeometry = () => {
    if (selected.length !== 1 || !selectedMutable) return;
    const stroke = selected[0];
    const xs = stroke.points.map((point) => point.x);
    const ys = stroke.points.map((point) => point.y);
    const oldX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const oldY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const oldWidth = Math.max(1, Math.max(...xs) - Math.min(...xs));
    const oldHeight = Math.max(1, Math.max(...ys) - Math.min(...ys));
    const width = clamp(Number(geometryWidth), 1, W * 2);
    const height = clamp(Number(geometryHeight), 1, H * 2);
    const x = clamp(Number(geometryX), -W, W * 2);
    const y = clamp(Number(geometryY), -H, H * 2);
    if (![width, height, x, y].every(Number.isFinite)) return;
    updateSelected((item) => ({
      ...item,
      points: item.points.map((point) => ({
        x: x + ((point.x - oldX) / oldWidth) * width,
        y: y + ((point.y - oldY) / oldHeight) * height,
      })),
    }));
    setNotice("Position et encombrement appliqués aux unités de dessin.");
  };
  const clearDrawing = () => {
    const before = strokesRef.current;
    const locked = before.filter(
      (stroke) => stroke.layer && layerSettings[stroke.layer]?.locked,
    );
    if (locked.length === before.length) {
      setNotice("Tous les objets présents sont sur des calques verrouillés.");
      return;
    }
    writeDocument(locked);
    setSelectedIds([]);
    setNotice(
      locked.length
        ? `${before.length - locked.length} objet(s) effacé(s); ${locked.length} objet(s) verrouillé(s) conservé(s).`
        : "Le dessin personnalisé a été effacé; aucun drone n’a été généré en remplacement.",
    );
  };
  const createLayer = (event: React.FormEvent) => {
    event.preventDefault();
    const next = createStudioLayer(config, layerDraft);
    if (!next) {
      setNotice("Nom vide ou déjà utilisé : le calque n’a pas été créé.");
      return;
    }
    setConfig((current) => createStudioLayer(current, layerDraft) ?? current);
    setLayerDraft("");
    setNotice(`Calque « ${layerDraft.trim()} » créé par l’utilisateur.`);
  };
  const renameLayer = (oldLabel: string) => {
    const next = renameStudioLayer(config, oldLabel, renamedLayerDraft);
    if (!next) {
      setNotice("Nouveau nom vide ou déjà utilisé.");
      return;
    }
    setConfig(
      (current) =>
        renameStudioLayer(current, oldLabel, renamedLayerDraft) ?? current,
    );
    setRenamingLayer("");
    setRenamedLayerDraft("");
    setNotice(`Calque renommé · ${oldLabel} → ${renamedLayerDraft.trim()}.`);
  };
  const removeLayer = (label: string) => {
    setConfig((current) => deleteStudioLayer(current, label) ?? current);
    if (activeLayer === label) setSelectedIds([]);
    setNotice(
      `Calque « ${label} » supprimé; ses traits sont conservés sans affectation.`,
    );
  };
  const moveLayer = (index: number, to: number) =>
    setConfig((current) => reorderStudioLayer(current, index, to));
  const visibleLayer = (label: string, visible: boolean) =>
    setConfig((current) =>
      updateStudioLayerSettings(current, label, { visible }),
    );
  const lockLayer = (label: string, locked: boolean) =>
    setConfig((current) =>
      updateStudioLayerSettings(current, label, { locked }),
    );
  const setActiveLayer = (label: string) => {
    setConfig((current) => ({ ...current, activeStudioLayer: label }));
    const layerColor =
      config.studioLayerMeta?.[label]?.color ??
      strokes.find((stroke) => stroke.layer === label)?.color;
    if (layerColor) setPrimary(layerColor);
  };
  const changeLayerSettings = (
    label: string,
    changes: Partial<NonNullable<ConceptConfig["studioLayerSettings"]>[string]>,
  ) =>
    setConfig((current) => updateStudioLayerSettings(current, label, changes));
  const saveKeyframe = () => {
    if (!selected.length || !selectedMutable) return;
    const time = Number(animationTime.toFixed(1));
    const frame: DroneSketchKeyframe = {
      time,
      x: animationValues.x,
      y: animationValues.y,
      rotation: animationValues.rotation,
      scale: animationValues.scale,
      opacity: animationValues.opacity,
    };
    updateSelected((stroke) => ({
      ...stroke,
      keyframes: [
        ...(stroke.keyframes ?? []).filter(
          (key) => Math.abs(key.time - time) > 0.05,
        ),
        frame,
      ].sort((a, b) => a.time - b.time),
    }));
    setNotice(`Image-clé enregistrée à ${time.toFixed(1)} s.`);
  };
  const removeKeyframeAtTime = () => {
    if (!selected.length || !selectedMutable) return;
    updateSelected((stroke) => {
      const keyframes = (stroke.keyframes ?? []).filter(
        (key) => Math.abs(key.time - animationTime) > 0.05,
      );
      return { ...stroke, keyframes: keyframes.length ? keyframes : undefined };
    });
  };
  const smartSelect = () => {
    setSelectedIds(
      visibleStrokes
        .filter((stroke) => stroke.layer === activeLayer)
        .map((stroke) => stroke.id),
    );
  };
  const removeSelected = () => {
    if (!selected.length || !selectedMutable) return;
    writeDocument(
      strokesRef.current.filter((stroke) => !selectedIds.includes(stroke.id)),
    );
    setSelectedIds([]);
  };
  const renderStroke = (stroke: DroneSketchStroke) => {
    const isSelected = selectedIds.includes(stroke.id);
    const fill = stroke.fillSecondary
      ? `url(#gradient-${context}-${stroke.id})`
      : (stroke.fill ?? "none");
    const style = { opacity: stroke.opacity ?? 1, fill };
    const handler = (event: ReactPointerEvent<SVGElement>) =>
      selectObject(event, stroke.id);
    if (stroke.tool === "annotation")
      return (
        <text
          key={stroke.id}
          x={stroke.points[0].x}
          y={stroke.points[0].y}
          style={{ fill: stroke.color, opacity: stroke.opacity ?? 1 }}
          className={`sketch-annotation ${isSelected ? "is-selected" : ""}`}
          onPointerDown={handler}
        >
          {(stroke.label ?? "Annotation").split(/\r?\n/).map((line, index) => (
            <tspan key={index} x={stroke.points[0].x} dy={index ? "1.2em" : 0}>
              {line}
            </tspan>
          ))}
        </text>
      );
    if (stroke.tool === "rectangle" && stroke.points[1]) {
      const [a, b] = stroke.points;
      return (
        <rect
          key={stroke.id}
          x={Math.min(a.x, b.x)}
          y={Math.min(a.y, b.y)}
          width={Math.abs(a.x - b.x)}
          height={Math.abs(a.y - b.y)}
          style={style}
          stroke={stroke.color}
          strokeWidth={stroke.width}
          className={`sketch-stroke ${isSelected ? "is-selected" : ""}`}
          onPointerDown={handler}
        />
      );
    }
    if (stroke.tool === "ellipse" && stroke.points[1]) {
      const [a, b] = stroke.points;
      return (
        <ellipse
          key={stroke.id}
          cx={(a.x + b.x) / 2}
          cy={(a.y + b.y) / 2}
          rx={Math.abs(a.x - b.x) / 2}
          ry={Math.abs(a.y - b.y) / 2}
          style={style}
          stroke={stroke.color}
          strokeWidth={stroke.width}
          className={`sketch-stroke ${isSelected ? "is-selected" : ""}`}
          onPointerDown={handler}
        />
      );
    }
    return (
      <path
        key={stroke.id}
        d={
          stroke.points.length > 1 &&
          ["triangle", "hexagon", "gear", "propeller"].includes(stroke.tool)
            ? vectorPath(stroke.tool, stroke.points[0], stroke.points[1])
            : pathOf(stroke.points, closedTools.includes(stroke.tool))
        }
        style={style}
        stroke={stroke.color}
        strokeWidth={stroke.width}
        strokeLinecap={stroke.brushStyle === "calligraphy" ? "butt" : "round"}
        className={`sketch-stroke ${isSelected ? "is-selected" : ""}`}
        onPointerDown={handler}
      />
    );
  };
  const renderAnimatedStroke = (stroke: DroneSketchStroke) => {
    const frame = evaluateDroneSketchAnimation(stroke.keyframes, animationTime);
    const cx =
      stroke.points.reduce((sum, point) => sum + point.x, 0) /
      Math.max(1, stroke.points.length);
    const cy =
      stroke.points.reduce((sum, point) => sum + point.y, 0) /
      Math.max(1, stroke.points.length);
    const transform = `translate(${frame.x} ${frame.y}) translate(${cx} ${cy}) rotate(${frame.rotation}) scale(${frame.scale}) translate(${-cx} ${-cy})`;
    return (
      <g
        key={`animated-${stroke.id}`}
        transform={transform}
        opacity={frame.opacity}
      >
        {renderStroke(stroke)}
      </g>
    );
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement)?.matches(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if ((event.ctrlKey || event.metaKey) && key === "y") {
        event.preventDefault();
        redo();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        key === "d" &&
        selected.length
      ) {
        event.preventDefault();
        duplicate();
      } else if (event.key === "Delete") removeSelected();
      else if (event.key === "Escape") setSelectedIds([]);
      else if (!event.ctrlKey && !event.metaKey) {
        const found = toolItems.find(
          (item) => item.shortcut?.toLowerCase() === key,
        );
        if (found) setTool(found.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section
      className={`drone-sketch-workbench sketch-context-${context}`}
      aria-label="Atelier professionnel de dessin du drone"
    >
      <header className="sketch-header">
        <div>
          <p className="eyebrow">
            AEROMIND / AIRFRAME EDITOR ·{" "}
            {context === "studio"
              ? "STUDIO DE CONCEPTION"
              : "DOCUMENT DE CONSTRUCTION"}
          </p>
          <h3>Dessiner le drone</h3>
          <small>
            {sourceLabel} · {strokes.length} objets · {parts.length} composants
            liés
            {activeLayer
              ? ` · calque ${activeLayer}`
              : " · aucun calque sélectionné"}
          </small>
        </div>
        <div className="sketch-header-metrics">
          <span>
            <i />
            {customGeometry
              ? "CROQUIS PARTAGÉ"
              : profile
                ? "RÉFÉRENCE · NON MODIFIABLE"
                : "DOCUMENT LOCAL"}
          </span>
          <b>{pastRef.current.length} actions annulables</b>
        </div>
      </header>
      <div className="sketch-command-bar">
        <div className="sketch-command-actions">
          <div className="sketch-action-cluster">
            <button
              type="button"
              className={grid ? "is-active" : ""}
              onClick={() => setGrid((value) => !value)}
              title="Afficher/masquer la grille"
            >
              <Grid3X3 size={14} /> Grille
            </button>
            <button
              type="button"
              className={snapOn ? "is-active" : ""}
              onClick={() => setSnapOn((value) => !value)}
              title="Accrochage à la grille de 20 unités"
            >
              <span className="sketch-snap-icon">⌖</span> Snap
            </button>
            <button
              type="button"
              className={objectSnap ? "is-active" : ""}
              onClick={() => setObjectSnap((value) => !value)}
              title="Accrochage aux sommets et milieux des arêtes visibles"
            >
              <Layers3 size={14} /> Objet
            </button>
            <button
              type="button"
              className={ortho ? "is-active" : ""}
              onClick={() => setOrtho((value) => !value)}
              title="Contraindre le trait à 0°, 45° ou 90°"
            >
              ORTHO
            </button>
            <button
              type="button"
              className={symmetry ? "is-active" : ""}
              onClick={() => setSymmetry((value) => !value)}
              title="Symétrie"
            >
              <FlipHorizontal2 size={14} /> Symétrie
            </button>
          </div>
          <div className="sketch-action-cluster">
            <button
              type="button"
              disabled={!pastRef.current.length}
              onClick={undo}
              title="Annuler (Ctrl/Cmd+Z)"
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              disabled={!futureRef.current.length}
              onClick={redo}
              title="Rétablir (Ctrl/Cmd+Shift+Z)"
            >
              <Redo2 size={14} />
            </button>
            <button
              type="button"
              onClick={duplicate}
              disabled={!selected.length || !selectedMutable}
              title="Dupliquer (Ctrl/Cmd+D)"
            >
              <Copy size={14} />
            </button>
            <button
              type="button"
              onClick={mirrorSelected}
              disabled={!selected.length || !selectedMutable}
              title="Créer une copie miroir par rapport à l’axe central"
            >
              <FlipHorizontal2 size={14} />
            </button>
            <button
              type="button"
              onClick={linearArray}
              disabled={!selected.length || !selectedMutable}
              title="Créer un réseau linéaire de trois copies"
            >
              <Copy size={14} />
              ×3
            </button>
            <button
              type="button"
              className="sketch-danger"
              onClick={clearDrawing}
              disabled={!strokes.length}
              title="Effacer le croquis"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="sketch-zoom-controls">
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(0.55, value - 0.1))}
              aria-label="Réduire le zoom"
            >
              −
            </button>
            <b>{Math.round(zoom * 100)}%</b>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(2, value + 0.1))}
              aria-label="Agrandir le zoom"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setCanvasPan({ x: 0, y: 0 });
              }}
              title="Centrer la vue et réinitialiser le zoom"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>
      </div>
      <div className="sketch-main-layout">
        <aside className="sketch-layer-sidebar">
          <div className="sketch-sidebar-title">
            <span>
              <Layers3 size={14} /> CALQUES
            </span>
            <small>{layers.length} manuel(s)</small>
          </div>
          <form className="sketch-layer-create" onSubmit={createLayer}>
            <input
              value={layerDraft}
              onChange={(event) => setLayerDraft(event.target.value)}
              placeholder="Nouveau calque…"
              aria-label="Nom du calque à créer"
            />
            <button
              type="submit"
              disabled={!layerDraft.trim()}
              aria-label="Créer le calque"
            >
              <Plus size={14} />
            </button>
          </form>
          {layers.length ? (
            <div className="sketch-layer-list">
              {layers.map((label, index) => {
                const visible = layerSettings[label]?.visible !== false;
                const locked = layerSettings[label]?.locked === true;
                const count = strokes.filter(
                  (stroke) => stroke.layer === label,
                ).length;
                return (
                  <div
                    className={`sketch-layer-row ${activeLayer === label ? "is-active" : ""} ${!visible ? "is-hidden" : ""}`}
                    key={label}
                  >
                    {renamingLayer === label ? (
                      <form
                        className="sketch-layer-rename"
                        onSubmit={(event) => {
                          event.preventDefault();
                          renameLayer(label);
                        }}
                      >
                        <input
                          autoFocus
                          value={renamedLayerDraft}
                          onChange={(event) =>
                            setRenamedLayerDraft(event.target.value)
                          }
                        />
                        <button type="submit" aria-label="Valider le renommage">
                          <Pencil size={12} />
                        </button>
                      </form>
                    ) : (
                      <button
                        className="sketch-layer-select"
                        type="button"
                        onClick={() => setActiveLayer(label)}
                        aria-pressed={activeLayer === label}
                      >
                        <i />
                        <span>
                          {label}
                          <small>{count} objets</small>
                        </span>
                      </button>
                    )}
                    <div className="sketch-layer-actions">
                      <button
                        type="button"
                        onClick={() => visibleLayer(label, !visible)}
                        title={visible ? "Masquer" : "Afficher"}
                        aria-label={`${visible ? "Masquer" : "Afficher"} ${label}`}
                      >
                        {visible ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => lockLayer(label, !locked)}
                        title={locked ? "Déverrouiller" : "Verrouiller"}
                        aria-label={`${locked ? "Déverrouiller" : "Verrouiller"} ${label}`}
                      >
                        {locked ? <Lock size={12} /> : <Unlock size={12} />}
                      </button>
                    </div>
                    {activeLayer === label && (
                      <details className="sketch-layer-adjustments" open>
                        <summary>
                          <SlidersHorizontal size={11} /> Réglages du calque
                        </summary>
                        <div className="sketch-layer-management">
                          <span>Organisation</span>
                          <div>
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingLayer(label);
                                setRenamedLayerDraft(label);
                              }}
                              title="Renommer le calque"
                              aria-label={`Renommer ${label}`}
                            >
                              <Pencil size={12} /> Nom
                            </button>
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => moveLayer(index, index - 1)}
                              title="Monter le calque"
                              aria-label={`Monter ${label}`}
                            >
                              <ArrowUp size={12} />
                            </button>
                            <button
                              type="button"
                              disabled={index === layers.length - 1}
                              onClick={() => moveLayer(index, index + 1)}
                              title="Descendre le calque"
                              aria-label={`Descendre ${label}`}
                            >
                              <ArrowDown size={12} />
                            </button>
                            <button
                              type="button"
                              className="is-danger"
                              onClick={() => removeLayer(label)}
                              title="Supprimer le calque, conserver ses objets"
                              aria-label={`Supprimer ${label}`}
                            >
                              <Trash2 size={12} /> Supprimer
                            </button>
                          </div>
                        </div>
                        <label>
                          Opacité{" "}
                          <output>{settingsForLayer(label).opacity}%</output>
                          <input
                            aria-label={`Opacité du calque ${label}`}
                            type="range"
                            min="0"
                            max="100"
                            value={settingsForLayer(label).opacity}
                            onChange={(event) =>
                              changeLayerSettings(label, {
                                opacity: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Fusion
                          <select
                            aria-label={`Mode de fusion du calque ${label}`}
                            value={settingsForLayer(label).blendMode}
                            onChange={(event) =>
                              changeLayerSettings(label, {
                                blendMode: event.target.value as NonNullable<
                                  ConceptConfig["studioLayerSettings"]
                                >[string]["blendMode"],
                              })
                            }
                          >
                            <option value="normal">Normal</option>
                            <option value="multiply">Produit</option>
                            <option value="screen">Écran</option>
                            <option value="overlay">Incrustation</option>
                            <option value="darken">Assombrir</option>
                            <option value="lighten">Éclaircir</option>
                          </select>
                        </label>
                        <label>
                          Exposition{" "}
                          <output>
                            {settingsForLayer(label).exposureEV!.toFixed(1)} EV
                          </output>
                          <input
                            aria-label={`Exposition du calque ${label}`}
                            type="range"
                            min="-3"
                            max="3"
                            step="0.1"
                            value={settingsForLayer(label).exposureEV}
                            onChange={(event) =>
                              changeLayerSettings(label, {
                                exposureEV: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Contraste{" "}
                          <output>{settingsForLayer(label).contrast}%</output>
                          <input
                            aria-label={`Contraste du calque ${label}`}
                            type="range"
                            min="0"
                            max="200"
                            value={settingsForLayer(label).contrast}
                            onChange={(event) =>
                              changeLayerSettings(label, {
                                contrast: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Saturation{" "}
                          <output>{settingsForLayer(label).saturation}%</output>
                          <input
                            aria-label={`Saturation du calque ${label}`}
                            type="range"
                            min="0"
                            max="200"
                            value={settingsForLayer(label).saturation}
                            onChange={(event) =>
                              changeLayerSettings(label, {
                                saturation: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Balance des blancs{" "}
                          <output>
                            {settingsForLayer(label).whiteBalance! > 0
                              ? "Chaud"
                              : settingsForLayer(label).whiteBalance! < 0
                                ? "Froid"
                                : "Neutre"}
                          </output>
                          <input
                            aria-label={`Balance des blancs du calque ${label}`}
                            type="range"
                            min="-100"
                            max="100"
                            value={settingsForLayer(label).whiteBalance}
                            onChange={(event) =>
                              changeLayerSettings(label, {
                                whiteBalance: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Niveau des noirs{" "}
                          <output>{settingsForLayer(label).blackLevel}%</output>
                          <input
                            aria-label={`Niveau des noirs du calque ${label}`}
                            type="range"
                            min="0"
                            max="40"
                            value={settingsForLayer(label).blackLevel}
                            onChange={(event) =>
                              changeLayerSettings(label, {
                                blackLevel: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Niveau des blancs{" "}
                          <output>{settingsForLayer(label).whiteLevel}%</output>
                          <input
                            aria-label={`Niveau des blancs du calque ${label}`}
                            type="range"
                            min="60"
                            max="100"
                            value={settingsForLayer(label).whiteLevel}
                            onChange={(event) =>
                              changeLayerSettings(label, {
                                whiteLevel: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="sketch-no-layers">
              <Layers3 size={18} />
              <strong>Aucun calque</strong>
              <small>
                Créez votre premier calque; rien n’est ajouté automatiquement.
              </small>
            </div>
          )}
          <small className="sketch-layer-foot">
            Les calques sont partagés avec le Document de construction.
          </small>
        </aside>
        <main className="sketch-editor-center">
          <aside className="sketch-tool-dock" aria-label="Palette d’outils">
            {paletteGroups.map((group) => (
              <div className="sketch-tool-group" key={group}>
                <span>{group}</span>
                {toolItems
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={tool === item.id ? "is-active" : ""}
                      onClick={() => setTool(item.id)}
                      title={`${item.label}${item.shortcut ? ` · ${item.shortcut}` : ""}`}
                      aria-label={`${item.label}${item.shortcut ? `, raccourci ${item.shortcut}` : ""}`}
                      aria-pressed={tool === item.id}
                    >
                      {toolIcon(item.id)}
                      <small>{item.shortcut}</small>
                    </button>
                  ))}
              </div>
            ))}
          </aside>
          <div className="sketch-canvas-column">
            <div className="sketch-artboard-top">
              <span>
                <i /> ARTBOARD · {grid ? "GRILLE ACTIVE" : "GRILLE MASQUÉE"}
              </span>
              <span>
                {activeLayer
                  ? `CALQUE ACTIF · ${activeLayer}`
                  : "SÉLECTIONNEZ UN CALQUE POUR DESSINER"}
              </span>
              <button
                type="button"
                onClick={smartSelect}
                disabled={!activeLayer}
              >
                <WandSparkles size={13} /> Tout sélectionner ici
              </button>
            </div>
            <div className="sketch-canvas-shell">
              <div
                className="sketch-canvas-wrap"
                style={{
                  transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${zoom})`,
                }}
              >
                <svg
                  className={`sketch-canvas ${tool === "select" ? "tool-select" : ""} ${tool === "pan" ? "tool-pan" : ""}`}
                  viewBox={`0 0 ${W} ${H}`}
                  onPointerDown={begin}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                  role="img"
                  aria-label="Zone de dessin du drone personnalisé"
                >
                  <defs>
                    <pattern
                      id={`grid-${context}`}
                      width="40"
                      height="40"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M40 0H0V40"
                        fill="none"
                        stroke="rgba(141,232,223,.12)"
                      />
                    </pattern>
                    {strokes.map((stroke) => (
                      <linearGradient
                        id={`gradient-${context}-${stroke.id}`}
                        key={stroke.id}
                        x1="0"
                        x2="1"
                      >
                        <stop stopColor={stroke.fill ?? stroke.color} />
                        <stop
                          offset="1"
                          stopColor={stroke.fillSecondary ?? stroke.color}
                        />
                      </linearGradient>
                    ))}
                  </defs>
                  <rect width={W} height={H} fill="#061118" />
                  {grid && (
                    <rect width={W} height={H} fill={`url(#grid-${context})`} />
                  )}
                  <line
                    x1="500"
                    y1="0"
                    x2="500"
                    y2={H}
                    className="sketch-axis"
                  />
                  {symmetry && (
                    <line
                      x1="500"
                      y1="0"
                      x2="500"
                      y2={H}
                      className="sketch-symmetry-line"
                    />
                  )}
                  <g>
                    {visibleStrokes
                      .filter((stroke) => !stroke.layer)
                      .map(renderAnimatedStroke)}
                    {[...layers].reverse().map((label) => {
                      const settings = settingsForLayer(label);
                      const warmth = settings.whiteBalance ?? 0;
                      const filter = `brightness(${Math.pow(2, settings.exposureEV ?? 0) * (1 + (settings.whiteLevel! - 100) / 180 + settings.blackLevel! / 160)}) contrast(${((settings.contrast ?? 100) / 100) * (1 + (settings.whiteLevel! - 100 + settings.blackLevel!) / 160)}) saturate(${(settings.saturation ?? 100) / 100}) sepia(${Math.abs(warmth) / 240}) hue-rotate(${warmth < 0 ? 180 : 0}deg)`;
                      return (
                        <g
                          key={`layer-render-${label}`}
                          opacity={(settings.opacity ?? 100) / 100}
                          style={{
                            mixBlendMode: settings.blendMode ?? "normal",
                            filter,
                          }}
                        >
                          {visibleStrokes
                            .filter((stroke) => stroke.layer === label)
                            .map(renderAnimatedStroke)}
                        </g>
                      );
                    })}
                  </g>
                  {!visibleStrokes.length && (
                    <g className="sketch-empty-prompt">
                      <text x="500" y="250" textAnchor="middle">
                        {profile
                          ? `Référence active · ${profile.label}`
                          : "ARTBOARD VIDE · AUCUN DRONE PRÉCHARGÉ"}
                      </text>
                      <text x="500" y="276" textAnchor="middle">
                        {activeLayer
                          ? "Choisissez un outil puis dessinez votre cellule"
                          : "Créez un calque utilisateur pour commencer"}
                      </text>
                    </g>
                  )}
                  <text x="24" y="30" className="sketch-label">
                    {sourceLabel.toUpperCase()} · {currentTool.toUpperCase()}
                  </text>
                  <text
                    x="976"
                    y="538"
                    textAnchor="end"
                    className="sketch-coordinate-label"
                  >
                    {activeLayer || "SANS CALQUE"} · {Math.round(zoom * 100)}%
                  </text>
                </svg>
              </div>
              {notice && (
                <div className="sketch-notice" role="status">
                  {notice}
                  <button type="button" onClick={() => setNotice("")}>
                    ×
                  </button>
                </div>
              )}
            </div>
            <div className="sketch-object-timeline">
              <div>
                <span>
                  <Layers3 size={13} /> OBJETS
                </span>
                <small>
                  {visibleStrokes.length} visibles · {strokes.length} total
                </small>
              </div>
              <div className="sketch-object-strip">
                {visibleStrokes.length ? (
                  visibleStrokes.map((stroke, index) => (
                    <button
                      key={stroke.id}
                      type="button"
                      className={
                        selectedIds.includes(stroke.id) ? "is-selected" : ""
                      }
                      onClick={() => setSelectedIds([stroke.id])}
                    >
                      <i style={{ backgroundColor: stroke.color }} />
                      <span>
                        {stroke.label ??
                          `${stroke.tool} ${String(index + 1).padStart(2, "0")}`}
                      </span>
                      <small>{stroke.layer || "Non assigné"}</small>
                    </button>
                  ))
                ) : (
                  <small>
                    Les objets créés apparaîtront ici; aucun calque ni objet
                    n’est généré automatiquement.
                  </small>
                )}
              </div>
            </div>
          </div>
        </main>
        <aside className="sketch-inspector">
          <div className="sketch-inspector-heading">
            <div>
              <span>INSPECTEUR</span>
              <strong>
                {selected.length ? `${selected.length} objet(s)` : currentTool}
              </strong>
            </div>
            <span className="inspector-badge">
              {activated ? "SOURCE ACTIVE" : "EN ATTENTE"}
            </span>
          </div>
          {tool === "annotation" && (
            <div className="sketch-annotation-tool-box">
              <div className="mini-heading">
                <Type size={13} />
                <strong>OUTIL TEXTE · T</strong>
              </div>
              <label>
                Texte à placer
                <textarea
                  rows={3}
                  value={annotation}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAnnotation(value);
                    if (
                      selected.length === 1 &&
                      selected[0].tool === "annotation" &&
                      selectedMutable
                    )
                      updateSelected((stroke) => ({ ...stroke, label: value }));
                  }}
                  placeholder="Saisissez votre annotation…"
                  aria-label="Texte à placer sur l’artboard"
                />
              </label>
              <small>
                Cliquez dans l’artboard pour placer le texte. Cliquez un objet
                texte existant pour le modifier ici.
              </small>
            </div>
          )}
          <div className="sketch-quick-tools">
            <div className="mini-heading">
              <Sparkles size={13} />
              <strong>COMPOSANT PARAMÉTRIQUE</strong>
            </div>
            <select
              value={component}
              onChange={(event) =>
                setComponent(event.target.value as ComponentKind)
              }
            >
              <option value="wing">Aile paramétrique</option>
              <option value="fuselage">Fuselage</option>
              <option value="motor">Motorisation</option>
              <option value="payload">Baie de charge utile</option>
              <option value="sensor">Capteur</option>
            </select>
            <label className="sketch-dimension-field">
              Envergure de pièce <output>{componentSpan} u.d.</output>
              <input
                type="range"
                min="60"
                max="440"
                step="10"
                value={componentSpan}
                onChange={(event) =>
                  setComponentSpan(Number(event.target.value))
                }
              />
            </label>
            <label className="sketch-dimension-field">
              Longueur de pièce <output>{componentLength} u.d.</output>
              <input
                type="range"
                min="80"
                max="760"
                step="10"
                value={componentLength}
                onChange={(event) =>
                  setComponentLength(Number(event.target.value))
                }
              />
            </label>
            <label className="sketch-dimension-field">
              Diamètre / corde <output>{componentDiameter} u.d.</output>
              <input
                type="range"
                min="12"
                max="130"
                step="2"
                value={componentDiameter}
                onChange={(event) =>
                  setComponentDiameter(Number(event.target.value))
                }
              />
            </label>
            <button
              type="button"
              onClick={createComponent}
              disabled={!activeLayer || activeLayerLocked}
            >
              <Plus size={13} /> Créer la pièce sur l’artboard
            </button>
            <small className="sketch-geometry-caveat">
              Dimensions de représentation · non certifiées pour fabrication
            </small>
          </div>
          <div className="sketch-style-box">
            <div className="mini-heading">
              <PenLine size={13} />
              <strong>STYLE &amp; APPARENCE</strong>
            </div>
            <label>
              Pinceau
              <select
                value={brushStyle}
                onChange={(event) =>
                  setBrushStyle(
                    event.target.value as NonNullable<
                      DroneSketchStroke["brushStyle"]
                    >,
                  )
                }
              >
                <option value="pencil">Crayon fin</option>
                <option value="marker">Marqueur large</option>
                <option value="calligraphy">Calligraphie biseautée</option>
                <option value="airbrush">Aérographe léger</option>
              </select>
            </label>
            <label>
              Couleur
              <input
                type="color"
                value={primary}
                onChange={(event) => setPrimary(event.target.value)}
              />
            </label>
            <label>
              Remplissage
              <input
                type="color"
                value={secondary}
                onChange={(event) => setSecondary(event.target.value)}
              />
            </label>
            <label>
              Opacité
              <input
                type="range"
                min=".2"
                max="1"
                step=".05"
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
              />
            </label>
            <label className="sketch-check">
              <input
                type="checkbox"
                checked={gradient}
                onChange={(event) => setGradient(event.target.checked)}
              />{" "}
              Dégradé pour les prochains objets
            </label>
            <button
              type="button"
              onClick={() =>
                updateSelected((stroke) => ({
                  ...stroke,
                  color: primary,
                  fill: gradient ? primary : stroke.fill,
                  fillSecondary: gradient ? secondary : undefined,
                  opacity,
                }))
              }
              disabled={!selected.length || !selectedMutable}
            >
              Appliquer au choix
            </button>
          </div>
          <div className="sketch-transform-box">
            <div className="mini-heading">
              <Move size={13} />
              <strong>TRANSFORMATION</strong>
            </div>
            <div className="sketch-transform-actions">
              <button
                type="button"
                onClick={() => transform(1.1, 0)}
                disabled={!selected.length || !selectedMutable}
              >
                Échelle +
              </button>
              <button
                type="button"
                onClick={() => transform(0.9, 0)}
                disabled={!selected.length || !selectedMutable}
              >
                Échelle −
              </button>
              <button
                type="button"
                onClick={() => transform(1, 15)}
                disabled={!selected.length || !selectedMutable}
              >
                <RotateCw size={12} /> 15°
              </button>
              <button
                type="button"
                onClick={duplicate}
                disabled={!selected.length || !selectedMutable}
              >
                <Copy size={12} /> Dupliquer
              </button>
            </div>
            <div className="sketch-property-pair cad-exact-fields">
              <label>
                Centre X (u.d.)
                <input
                  type="number"
                  step="1"
                  value={geometryX}
                  disabled={selected.length !== 1 || !selectedMutable}
                  onChange={(event) => setGeometryX(Number(event.target.value))}
                />
              </label>
              <label>
                Centre Y (u.d.)
                <input
                  type="number"
                  step="1"
                  value={geometryY}
                  disabled={selected.length !== 1 || !selectedMutable}
                  onChange={(event) => setGeometryY(Number(event.target.value))}
                />
              </label>
              <label>
                Largeur (u.d.)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={geometryWidth}
                  disabled={selected.length !== 1 || !selectedMutable}
                  onChange={(event) =>
                    setGeometryWidth(Number(event.target.value))
                  }
                />
              </label>
              <label>
                Hauteur (u.d.)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={geometryHeight}
                  disabled={selected.length !== 1 || !selectedMutable}
                  onChange={(event) =>
                    setGeometryHeight(Number(event.target.value))
                  }
                />
              </label>
              <button
                type="button"
                disabled={selected.length !== 1 || !selectedMutable}
                onClick={applyExactGeometry}
              >
                Appliquer les cotes
              </button>
            </div>
            <label>
              Calque
              <select
                value={selected[0]?.layer ?? ""}
                disabled={!selected.length || !selectedMutable}
                onChange={(event) =>
                  updateSelected((stroke) => ({
                    ...stroke,
                    layer: event.target.value,
                  }))
                }
              >
                <option value="">Sans calque</option>
                {layers.map((label) => (
                  <option
                    key={label}
                    value={label}
                    disabled={layerSettings[label]?.locked}
                  >
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="sketch-animation-box">
            <div className="mini-heading">
              <KeyRound size={13} />
              <strong>ANIMATION · IMAGES-CLÉS</strong>
              <button
                type="button"
                aria-label={
                  animationPlaying ? "Mettre en pause" : "Lire l’animation"
                }
                disabled={!selected[0]?.keyframes?.length}
                onClick={() => setAnimationPlaying((value) => !value)}
              >
                {animationPlaying ? <Pause size={12} /> : <Play size={12} />}
              </button>
            </div>
            <div className="sketch-time-readout">
              <span>Temps de lecture</span>
              <output>{animationTime.toFixed(1)} s / 10 s</output>
            </div>
            <input
              className="sketch-playhead"
              aria-label="Curseur temporel de l’animation"
              type="range"
              min="0"
              max="10"
              step="0.1"
              value={animationTime}
              onChange={(event) => {
                setAnimationPlaying(false);
                setAnimationTime(Number(event.target.value));
              }}
            />
            <div className="sketch-keyframe-track">
              {selected[0]?.keyframes?.map((frame) => (
                <button
                  key={frame.time}
                  type="button"
                  style={{ left: `${frame.time * 10}%` }}
                  title={`Aller à ${frame.time.toFixed(1)} s`}
                  aria-label={`Image-clé à ${frame.time.toFixed(1)} secondes`}
                  onClick={() => setAnimationTime(frame.time)}
                >
                  <i />
                </button>
              ))}
            </div>
            <div className="sketch-animation-fields">
              <label>
                Δ X
                <input
                  type="number"
                  min="-500"
                  max="500"
                  value={animationValues.x}
                  disabled={!selected.length || !selectedMutable}
                  onChange={(event) =>
                    setAnimationValues((values) => ({
                      ...values,
                      x: clamp(Number(event.target.value), -500, 500),
                    }))
                  }
                />
              </label>
              <label>
                Δ Y
                <input
                  type="number"
                  min="-300"
                  max="300"
                  value={animationValues.y}
                  disabled={!selected.length || !selectedMutable}
                  onChange={(event) =>
                    setAnimationValues((values) => ({
                      ...values,
                      y: clamp(Number(event.target.value), -300, 300),
                    }))
                  }
                />
              </label>
              <label>
                Rotation °
                <input
                  type="number"
                  min="-360"
                  max="360"
                  value={animationValues.rotation}
                  disabled={!selected.length || !selectedMutable}
                  onChange={(event) =>
                    setAnimationValues((values) => ({
                      ...values,
                      rotation: clamp(Number(event.target.value), -360, 360),
                    }))
                  }
                />
              </label>
              <label>
                Échelle
                <input
                  type="number"
                  min="0.1"
                  max="5"
                  step="0.1"
                  value={animationValues.scale}
                  disabled={!selected.length || !selectedMutable}
                  onChange={(event) =>
                    setAnimationValues((values) => ({
                      ...values,
                      scale: clamp(Number(event.target.value), 0.1, 5),
                    }))
                  }
                />
              </label>
              <label>
                Opacité %
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={Math.round(animationValues.opacity * 100)}
                  disabled={!selected.length || !selectedMutable}
                  onChange={(event) =>
                    setAnimationValues((values) => ({
                      ...values,
                      opacity: clamp(Number(event.target.value), 0, 100) / 100,
                    }))
                  }
                />
              </label>
            </div>
            <div className="sketch-animation-actions">
              <button
                type="button"
                onClick={saveKeyframe}
                disabled={!selected.length || !selectedMutable}
              >
                <KeyRound size={12} /> Poser une clé à{" "}
                {animationTime.toFixed(1)} s
              </button>
              <button
                type="button"
                onClick={removeKeyframeAtTime}
                disabled={
                  !selected[0]?.keyframes?.some(
                    (frame) => Math.abs(frame.time - animationTime) < 0.05,
                  )
                }
              >
                Supprimer la clé
              </button>
              <small>
                {selected[0]?.keyframes?.length ?? 0} clé(s) sur l’objet
                sélectionné
              </small>
            </div>
            <small className="sketch-geometry-caveat">
              Aperçu de mouvement 2D; aucune simulation mécanique ou trajectoire
              de vol.
            </small>
          </div>
          <div className="sketch-object-properties">
            <div className="mini-heading">
              <Settings2Icon />
              <strong>OBJET SÉLECTIONNÉ</strong>
            </div>
            {selected[0] ? (
              <>
                <label>
                  {selected[0].tool === "annotation" ? "Texte affiché" : "Nom"}
                  {selected[0].tool === "annotation" ? (
                    <textarea
                      rows={3}
                      value={selected[0].label ?? ""}
                      placeholder="Saisissez le texte"
                      disabled={!selectedMutable}
                      onChange={(event) =>
                        updateSelected((stroke) => ({
                          ...stroke,
                          label: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <input
                      value={selected[0].label ?? ""}
                      placeholder={selected[0].tool}
                      disabled={!selectedMutable}
                      onChange={(event) =>
                        updateSelected((stroke) => ({
                          ...stroke,
                          label: event.target.value,
                        }))
                      }
                    />
                  )}
                </label>
                <div className="sketch-property-pair">
                  <label>
                    Épaisseur
                    <input
                      type="number"
                      min=".5"
                      max="40"
                      step=".5"
                      value={selected[0].width}
                      disabled={!selectedMutable}
                      onChange={(event) =>
                        updateSelected((stroke) => ({
                          ...stroke,
                          width: clamp(Number(event.target.value), 0.5, 40),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Rotation°
                    <input
                      type="number"
                      value={selected[0].rotation ?? 0}
                      disabled={!selectedMutable}
                      onChange={(event) =>
                        transform(
                          1,
                          Number(event.target.value) -
                            (selected[0].rotation ?? 0),
                        )
                      }
                    />
                  </label>
                </div>
                <div className="sketch-inspector-buttons">
                  <button type="button" onClick={() => setSelectedIds([])}>
                    Désélectionner
                  </button>
                  <button
                    type="button"
                    className="sketch-danger"
                    onClick={removeSelected}
                    disabled={!selectedMutable}
                  >
                    <Trash2 size={12} /> Supprimer
                  </button>
                </div>
              </>
            ) : (
              <small>
                Sélectionnez une entité sur l’artboard ou dans la liste des
                objets pour modifier ses propriétés.
              </small>
            )}
          </div>
          <div className="sketch-reference-info">
            <span>SOURCE LIÉE</span>
            <strong>{sourceLabel}</strong>
            <small>
              {profile
                ? "Le profil de bibliothèque reste la référence; les modifications du croquis sont explicites."
                : "Le dessin et les calques sont partagés avec le CAO et le Document de construction."}
            </small>
          </div>
        </aside>
      </div>
      <footer className="sketch-editor-footer">
        <span>
          <i />{" "}
          {customGeometry
            ? "CROQUIS SYNCHRONISÉ AU PROJET"
            : "ÉDITEUR PRÊT · ACTION UTILISATEUR REQUISE"}
        </span>
        <span>
          {selected.length
            ? `${selected.length} sélectionné(s)`
            : "Aucune sélection"}{" "}
          · {parts.length} pièce(s) liées
        </span>
        <span>
          Ctrl/Cmd+Z annuler · Shift+Z rétablir · Suppr effacer · glisser
          déplacer
        </span>
      </footer>
    </section>
  );
}

function Settings2Icon() {
  return (
    <span className="sketch-settings-glyph" aria-hidden="true">
      ⌘
    </span>
  );
}
