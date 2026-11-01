import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  AlignCenterHorizontal,
  Box,
  Boxes,
  Camera,
  Check,
  Copy,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  Grid3X3,
  Hand,
  Layers3,
  Lock,
  Maximize2,
  MousePointer2,
  Move3d,
  PenLine,
  Plus,
  Redo2,
  Ruler,
  ScanSearch,
  Scissors,
  Search,
  ShieldCheck,
  Settings2,
  Sparkles,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Pencil,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
  Wrench,
} from "lucide-react";
import type { ConceptConfig, DroneSketchStroke, InstalledMaterial } from "../lib/aeroEngine";
import { useLanguage } from "../contexts/LanguageContext";
import { createStudioLayer, deleteStudioLayer, renameStudioLayer, reorderStudioLayer } from "../lib/studioLayerCommands";
import {
  buildBillOfMaterialsCsv,
  buildEngineeringJson,
  buildOpenScadModel,
  safeEngineeringFilename,
} from "../lib/engineeringExports";
import { droneCatalog, type DroneCatalogDesign } from "../lib/droneCatalog";
import { dronePartCatalog, type DronePartDefinition } from "../lib/droneParts";
import { manufacturerPartCatalog } from "../lib/manufacturerParts";
import { hasDroneGeometry } from "../lib/droneSketchGeometry";
import { ParametricDronePreview } from "./ParametricDronePreview";
import { PhysicalDroneModel } from "./PhysicalDroneModel";
import { IDDSTwinAssemblyEditor } from "./IDDSTwinAssemblyEditor";
import { DroneBehaviorPanel } from "./DroneBehaviorPanel";
import { PayloadMissionWorkbench } from "./PayloadMissionWorkbench";
import { DroneSketchProWorkbench } from "./DroneSketchProWorkbench";
import { VirtualAssemblyWorkshop } from "./VirtualAssemblyWorkshop";
import { StudioCommandDeck, type StudioSection } from "./StudioCommandDeck";
import { EngineeringCadWorkbench } from "./EngineeringCadWorkbench";
import "./design-studio-physical.css";

type Tool = "select" | "pan" | "measure" | "annotate" | "cut";
type ViewMode = "top" | "side" | "front";
type RenderMode = "assembly" | "internals" | "kinematics" | "simulation" | "variants";
const renderModes: Array<{ id: RenderMode; label: string; short: string }> = [
  { id: "assembly", label: "Assemblage mécanique complet", short: "Assemblage complet" },
  { id: "internals", label: "Détails mécaniques internes", short: "Détails internes" },
  { id: "kinematics", label: "Cinématique et mouvements", short: "Cinématique" },
  { id: "simulation", label: "Simulation paramétrique", short: "Simulation" },
  { id: "variants", label: "Générateur de variantes paramétriques", short: "Variantes" },
];
type PartKind =
  | "body"
  | "wing"
  | "payload"
  | "motor"
  | "avionics"
  | "landing-gear";
type Constraint = "free" | "center-x" | "center-y" | "symmetric";
type EngineeringDiscipline = "mechanical" | "physical" | "structural" | "schematic" | "chemical" | "mathematical";
type StudioPart = {
  id: string;
  label: string;
  kind: PartKind;
  layer: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  massKg: number;
  locked: boolean;
  visible: boolean;
  constraint: Constraint;
  manufacturer?: string;
  partNumber?: string;
  dimensions?: string;
  interfaces?: string;
  catalogSource?: string;
  manufacturerDataStatus?: string;
  dragAreaM2?: number;
  powerDrawW?: number;
  connectedTo?: string;
  materialFamily?: string;
  chemicalComposition?: string;
  densityKgM3?: number;
  youngModulusGPa?: number;
  volumeM3?: number;
  modelEquation?: string;
};
type Annotation = { id: string; x: number; y: number; text: string };
type Snapshot = {
  parts: StudioPart[];
  annotations: Annotation[];
  zoom: number;
  view: ViewMode;
  message: string;
};

const engineeringDisciplineItems: Array<{ id: EngineeringDiscipline; label: string }> = [
  { id: "mechanical", label: "Mécanique" },
  { id: "physical", label: "Physique" },
  { id: "structural", label: "Structure" },
  { id: "schematic", label: "Schéma" },
  { id: "chemical", label: "Chimie" },
  { id: "mathematical", label: "Maths" },
];
const manualPartTemplates: Array<{
  kind: PartKind;
  label: string;
  width: number;
  height: number;
  massKg: number;
}> = [
  { kind: "body", label: "Fuselage", width: 190, height: 54, massKg: 0.45 },
  {
    kind: "wing",
    label: "Aile / plan porteur",
    width: 230,
    height: 44,
    massKg: 0.28,
  },
  {
    kind: "motor",
    label: "Moteur / rotor",
    width: 74,
    height: 52,
    massKg: 0.16,
  },
  {
    kind: "avionics",
    label: "Avionique / contrôleur",
    width: 76,
    height: 46,
    massKg: 0.12,
  },
  {
    kind: "payload",
    label: "Capteur / charge utile",
    width: 88,
    height: 56,
    massKg: 0.25,
  },
  {
    kind: "landing-gear",
    label: "Train / support",
    width: 94,
    height: 38,
    massKg: 0.1,
  },
];
const kindLabels: Record<PartKind, string> = {
  body: "Structure",
  wing: "Voilure",
  payload: "Charge utile",
  motor: "Propulsion",
  avionics: "Avionique",
  "landing-gear": "Train",
};
const estimatedDragArea = (kind: PartKind) => ({ body: 0.012, wing: 0.035, payload: 0.014, motor: 0.006, avionics: 0.003, "landing-gear": 0.01 })[kind];
const estimatedAuxPower = (kind: PartKind) => ({ body: 0, wing: 0, payload: 8, motor: 0, avionics: 4, "landing-gear": 0 })[kind];
const defaultBus = (kind: PartKind) => kind === "payload" ? "BUS-PAYLOAD" : kind === "avionics" ? "BUS-DATA" : kind === "motor" ? "BUS-POWER" : "FRAME";
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
function starterPartsFor(
  config: ConceptConfig,
  profile?: DroneCatalogDesign
): StudioPart[] {
  const motorCount = Math.max(
    1,
    Math.round(config.motorCount ?? profile?.configuration.motorCount ?? 1)
  );
  const architecture =
    profile?.family ??
    config.modelType ??
    config.airframe ??
    "Architecture à configurer";
  const fixedWing =
    config.airframe === "fixed-wing" || config.airframe === "vtol";
  return [
    {
      id: "studio-fuselage",
      label: `${architecture} · fuselage`,
      kind: "body",
      layer: "",
      x: 50,
      y: 52,
      width: 220,
      height: 58,
      rotation: 0,
      scale: 1,
      massKg: Math.max(0.4, config.fuselageLength * 0.45),
      locked: false,
      visible: true,
      constraint: "center-x",
    },
    ...(fixedWing
      ? [
          {
            id: "studio-wing",
            label: "Voilure principale",
            kind: "wing" as PartKind,
            layer: "",
            x: 50,
            y: 43,
            width: 360,
            height: 32,
            rotation: 0,
            scale: 1,
            massKg: Math.max(0.25, config.wingspan * 0.22),
            locked: false,
            visible: true,
            constraint: "center-x" as Constraint,
          },
        ]
      : []),
    {
      id: "studio-propulsion",
      label: `${motorCount} moteur(s) · propulsion`,
      kind: "motor",
      layer: "",
      x: 50,
      y: fixedWing ? 57 : 50,
      width: 100,
      height: 42,
      rotation: 0,
      scale: 1,
      massKg: Math.max(0.15, motorCount * 0.12),
      locked: false,
      visible: true,
      constraint: "free",
    },
    {
      id: "studio-avionics",
      label: "Avionique de bord",
      kind: "avionics",
      layer: "",
      x: 50,
      y: 67,
      width: 86,
      height: 38,
      rotation: 0,
      scale: 1,
      massKg: 0.18,
      locked: false,
      visible: true,
      constraint: "free",
    },
    {
      id: "studio-payload",
      label: "Charge utile",
      kind: "payload",
      layer: "",
      x: 50,
      y: 76,
      width: 76,
      height: 42,
      rotation: 0,
      scale: 1,
      massKg: Math.max(0.1, config.payloadKg),
      locked: false,
      visible: true,
      constraint: "free",
    },
  ];
}
function kindForCategory(category?: InstalledMaterial["category"]): PartKind {
  return category === "payload"
    ? "payload"
    : category === "propulsion"
      ? "motor"
      : category === "avionics"
        ? "avionics"
        : category === "landing-gear" || category === "safety"
          ? "landing-gear"
          : category === "airframe"
            ? "body"
            : "body";
}
function materialToPart(
  material: InstalledMaterial,
  index: number
): StudioPart {
  const kind: PartKind = kindForCategory(material.category);
  return {
    id: material.id,
    label: material.label,
    kind,
    layer: material.layer ?? "",
    x: material.offsetX === undefined ? 50 + index * 5 : 50 + material.offsetX,
    y: material.offsetY === undefined ? 50 : 50 + material.offsetY,
    width: material.iddsWidth ?? (kind === "payload" ? 70 : 150),
    height: material.iddsHeight ?? (kind === "payload" ? 42 : 54),
    rotation: material.iddsRotation ?? 0,
    scale: material.scale ?? 1,
    massKg: material.massKg,
    locked: false,
    visible: material.iddsVisible ?? true,
    constraint: (material.iddsConstraint as Constraint | undefined) ?? "free",
    manufacturer: material.manufacturer,
    partNumber: material.partNumber,
    dimensions: material.dimensions,
    interfaces: material.interfaces,
    catalogSource: material.catalogSource,
    manufacturerDataStatus: material.manufacturerDataStatus,
    dragAreaM2: material.dragAreaM2 ?? estimatedDragArea(kind),
    powerDrawW: material.powerDrawW ?? estimatedAuxPower(kind),
    connectedTo: material.connectedTo ?? defaultBus(kind),
    materialFamily: material.iddsMaterial,
    chemicalComposition: material.iddsChemistry,
    densityKgM3: material.iddsDensityKgM3,
    youngModulusGPa: material.iddsYoungModulusGPa,
    volumeM3: material.iddsVolumeM3,
    modelEquation: material.iddsEquation,
  };
}
function partsFromSketch(strokes: DroneSketchStroke[]): StudioPart[] {
  return strokes.filter(stroke => stroke.tool !== "annotation" && stroke.tool !== "measure" && stroke.points.length > 0).map((stroke, index) => {
    const xs = stroke.points.map(point => point.x);
    const ys = stroke.points.map(point => point.y);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    const text = `${stroke.label ?? ""} ${stroke.layer ?? ""} ${stroke.tool}`.toLowerCase();
    const kind: PartKind = stroke.tool === "payload" || text.includes("charge") || text.includes("capteur") ? "payload" : stroke.tool === "wing" || stroke.tool === "tail" || text.includes("voilure") || text.includes("aile") ? "wing" : text.includes("moteur") || text.includes("rotor") || text.includes("propulsion") ? "motor" : text.includes("avionique") || text.includes("contrôleur") ? "avionics" : text.includes("train") || text.includes("support") ? "landing-gear" : "body";
    const width = Math.max(12, right - left), height = Math.max(12, bottom - top);
    return {
      id: `sketch-${stroke.id}`, label: stroke.label ?? `${kindLabels[kind]} · dessin ${index + 1}`, kind, layer: stroke.layer ?? "",
      x: clamp((left + right) / 20, 0, 100), y: clamp((top + bottom) / 12, 0, 100), width, height,
      rotation: stroke.rotation ?? 0, scale: stroke.scale ?? 1, massKg: Math.max(0.01, width * height / 200000),
      locked: false, visible: true, constraint: "free", catalogSource: "user", dimensions: stroke.parameters ? JSON.stringify(stroke.parameters) : undefined,
    };
  });
}
function partsForConfig(config: ConceptConfig, profile?: DroneCatalogDesign, preserveSavedSketchParts = true): StudioPart[] {
  if (hasDroneGeometry(config.customSketch?.strokes)) {
    const generated = partsFromSketch(config.customSketch?.strokes ?? []);
    const saved = config.installedMaterials ?? [];
    const persistedSketchMatches = preserveSavedSketchParts && generated.length > 0 && saved.length === generated.length && generated.every(part => saved.some(item => item.id === part.id && item.iddsWidth !== undefined));
    return persistedSketchMatches ? saved.map(materialToPart) : generated;
  }
  return config.installedMaterials?.length ? config.installedMaterials.map(materialToPart) : profile || config.platformProfile || config.airframe ? starterPartsFor(config, profile) : [];
}
function materialsSignature(materials?: InstalledMaterial[]) {
  return JSON.stringify(
    (materials ?? []).map(item => ({
      id: item.id,
      label: item.label,
      massKg: item.massKg,
      quantity: item.quantity ?? 1,
      category: item.category,
      layer: item.layer,
      offsetX: item.offsetX ?? 0,
      offsetY: item.offsetY ?? 0,
      scale: item.scale ?? 1,
      manufacturer: item.manufacturer,
      partNumber: item.partNumber,
      dragAreaM2: item.dragAreaM2 ?? null,
      powerDrawW: item.powerDrawW ?? null,
      connectedTo: item.connectedTo ?? null,
      iddsMaterial: item.iddsMaterial ?? null,
      iddsChemistry: item.iddsChemistry ?? null,
      iddsDensityKgM3: item.iddsDensityKgM3 ?? null,
      iddsYoungModulusGPa: item.iddsYoungModulusGPa ?? null,
      iddsVolumeM3: item.iddsVolumeM3 ?? null,
      iddsEquation: item.iddsEquation ?? null,
      iddsWidth: item.iddsWidth ?? null,
      iddsHeight: item.iddsHeight ?? null,
      iddsRotation: item.iddsRotation ?? null,
      iddsConstraint: item.iddsConstraint ?? null,
      iddsVisible: item.iddsVisible ?? null,
    }))
  );
}
function geometrySignature(config: ConceptConfig) {
  return JSON.stringify({
    wingspan: config.wingspan,
    fuselageLength: config.fuselageLength,
    payloadKg: config.payloadKg,
    motorCount: config.motorCount,
    propDiameter: config.propDiameter,
  });
}
function partsToMaterials(parts: StudioPart[]): InstalledMaterial[] {
  return parts.map(part => ({
    id: part.id,
    label: part.label,
    layer: part.layer,
    use: "Objet constructible dans la nomenclature",
    massKg: part.massKg,
    quantity: 1,
    geometry:
      part.kind === "wing"
        ? "skin"
        : part.kind === "payload"
          ? "mount"
          : "core",
    category:
      part.kind === "payload"
        ? "payload"
        : part.kind === "motor"
          ? "propulsion"
          : part.kind === "avionics"
            ? "avionics"
            : "airframe",
    manufacturer: part.manufacturer,
    partNumber: part.partNumber,
    dimensions: part.dimensions,
    interfaces: part.interfaces,
    catalogSource:
      part.catalogSource === "manufacturer"
        ? "manufacturer"
        : part.catalogSource === "user"
          ? "user"
          : "concept",
    manufacturerDataStatus:
      part.manufacturerDataStatus === "verified" ? "verified" : "estimate",
    dragAreaM2: part.dragAreaM2 ?? estimatedDragArea(part.kind),
    powerDrawW: part.powerDrawW ?? estimatedAuxPower(part.kind),
    connectedTo: part.connectedTo ?? defaultBus(part.kind),
    iddsMaterial: part.materialFamily,
    iddsChemistry: part.chemicalComposition,
    iddsDensityKgM3: part.densityKgM3,
    iddsYoungModulusGPa: part.youngModulusGPa,
    iddsVolumeM3: part.volumeM3,
    iddsEquation: part.modelEquation,
    iddsWidth: part.width,
    iddsHeight: part.height,
    iddsRotation: part.rotation,
    iddsConstraint: part.constraint,
    iddsVisible: part.visible,
    offsetX: Number((part.x - 50).toFixed(2)),
    offsetY: Number((part.y - 50).toFixed(2)),
    scale: part.scale,
  }));
}
function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 800);
}

function IDDSParametricScene({ parts, selectedId, onSelectPart, strokes = [], view = "top", zoom = 1, design, config, renderMode = "assembly", kinematicsPlaying = false, svgRef, editable = false, onStagePointerDown, onStagePointerMove, onStagePointerUp, onPartPointerDown }: { parts: StudioPart[]; selectedId: string; onSelectPart: (id: string) => void; strokes?: DroneSketchStroke[]; view?: ViewMode; zoom?: number; design?: DroneCatalogDesign; config: ConceptConfig; renderMode?: RenderMode; kinematicsPlaying?: boolean; svgRef?: React.Ref<SVGSVGElement>; editable?: boolean; onStagePointerDown?: (event: ReactPointerEvent<SVGSVGElement>) => void; onStagePointerMove?: (event: ReactPointerEvent<SVGSVGElement>) => void; onStagePointerUp?: () => void; onPartPointerDown?: (event: ReactPointerEvent<SVGGElement>, part: StudioPart) => void }) {
  const palette: Record<PartKind, string> = { body: "#75d9d3", wing: "#56bdbb", payload: "#86d9a4", motor: "#edbd73", avionics: "#b5a2ff", "landing-gear": "#aabec2" };
  const modelType = design?.modelType ?? config.modelType ?? "";
  const isVtol = design?.key === "vtol" || ["tiltrotor", "tilt-wing", "tail-sitter"].includes(modelType);
  const fixedTypes = ["aile-volante", "voilure-conventionnelle", "planeur", "biplan", "tandem-wing", "canard", "hale-voilure", "male-voilure", "stealth-wing", "blended-pusher", "double-poutre", "effet-de-sol"];
  const isFixedWing = !isVtol && (design?.key === "fixed-wing" || fixedTypes.includes(modelType));
  const isMultirotor = !isFixedWing && !isVtol && (design?.key === "quadcopter" || ["multirotor", "tricoptère", "hexacoptère", "octocoptère", "coaxial-x8", "ducted-fan"].includes(modelType));
  const motorCount = Math.max(1, Math.min(12, Math.round(config.motorCount ?? design?.configuration.motorCount ?? (isFixedWing ? 1 : 4))));
  const variant = modelType || design?.key || "multirotor";
  return <svg ref={svgRef} className={`idds-parametric-scene ${editable ? "is-editable" : ""}`} style={{ transform: `scale(${zoom})`, transformOrigin: "center" }} viewBox="0 0 1000 560" role="img" aria-label={`Géométrie paramétrique modifiable · vue ${view}`} onPointerDown={onStagePointerDown} onPointerMove={onStagePointerMove} onPointerUp={onStagePointerUp} onPointerCancel={onStagePointerUp}>
    <defs><pattern id="idds-parametric-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#71c1c2" strokeOpacity=".11"/></pattern><linearGradient id="idds-part-face" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#baf4e8" stopOpacity=".93"/><stop offset="1" stopColor="#2c8791" stopOpacity=".84"/></linearGradient></defs>
    <rect width="1000" height="560" fill="#06131a"/><rect width="1000" height="560" fill="url(#idds-parametric-grid)"/>
    <path d="M500 48V512M80 280H920" stroke="#78aeb5" strokeOpacity=".18" strokeDasharray="5 8"/>
    {view !== "top" && <g transform={`translate(${view === "side" ? 22 : -18} ${view === "front" ? 16 : -8})`} opacity=".24">{parts.map(part => <rect key={`depth-${part.id}`} x={part.x * 10 - part.width / 2 + 9} y={part.y * 5.6 - part.height / 2 + 9} width={part.width} height={part.height} rx={part.kind === "body" ? part.height / 2 : 8} fill={palette[part.kind]}/>)}</g>}
    {design && <g className="idds-library-canonical-design" aria-label={`Architecture mécanique ${design.label}`}>
      {isFixedWing && <g>
        <path d={`M500 170 C480 205 476 315 500 412 C524 315 520 205 500 170Z`} fill="#baf4e8" fillOpacity=".62" stroke="#d4fff6" strokeWidth="3"/>
        {variant === "aile-volante" || variant === "stealth-wing" ?
          <path d="M500 188 L140 270 L175 348 L500 326 L825 348 L860 270 Z" fill="#57bdbb" fillOpacity=".28" stroke="#baf4e8" strokeWidth="3"/> :
        variant === "tandem-wing" ? <><path d="M500 220 L275 180 L245 225 L500 270 L755 225 L725 180 Z" fill="#57bdbb" fillOpacity=".24" stroke="#baf4e8" strokeWidth="3"/><path d="M500 294 L120 270 L145 337 L500 350 L855 337 L880 270 Z" fill="#57bdbb" fillOpacity=".28" stroke="#baf4e8" strokeWidth="3"/></> :
        variant === "canard" ? <><path d="M500 218 L390 195 L375 226 L500 250 L625 226 L610 195 Z" fill="#57bdbb" fillOpacity=".22" stroke="#baf4e8" strokeWidth="3"/><path d="M500 275 L125 230 L155 316 L500 342 L845 316 L875 230 Z" fill="#57bdbb" fillOpacity=".28" stroke="#baf4e8" strokeWidth="3"/><path d="M500 370 L375 350 L390 385 L500 402 L610 385 L625 350 Z" fill="#57bdbb" fillOpacity=".16" stroke="#baf4e8"/></> :
        <><path d={`M500 250 L${500-380} 178 L${500-345} 308 L500 340 L${500+345} 308 L${500+380} 178 Z`} fill="#57bdbb" fillOpacity=".27" stroke="#baf4e8" strokeWidth="3"/>
        {variant === "biplan" && <path d="M500 338 L155 322 L180 365 L500 375 L820 365 L845 322 Z" fill="#57bdbb" fillOpacity=".17" stroke="#baf4e8" strokeWidth="2"/>}
        {variant === "double-poutre" && <path d="M335 280 L365 405 M665 280 L635 405 M365 405 H635" fill="none" stroke="#baf4e8" strokeWidth="8"/>}
        {!["aile-volante", "stealth-wing"].includes(String(variant)) && <path d="M500 366 L380 425 L500 398 L620 425 Z" fill="#57bdbb" fillOpacity=".18" stroke="#baf4e8" strokeWidth="2"/>}</>}
        <rect x="478" y="270" width="44" height="85" rx="10" fill="#0b2731" stroke="#edbd73" strokeWidth="3"/>
        {motorCount > 1 ? Array.from({length: motorCount}, (_,i) => { const side=i%2===0?-1:1, row=Math.floor(i/2), pairs=Math.ceil(motorCount/2), x=500+side*(pairs===1?235:155+row*105); return <g key={`fixed-motor-${i}`} className={renderMode === "kinematics" ? `idds-rotor ${kinematicsPlaying ? "is-playing" : ""}` : ""}><path d={`M${500+side*90} 265L${x} 250`} stroke="#d4fff6" strokeWidth="3"/><circle cx={x} cy="250" r="20" fill="#0b2731" stroke="#edbd73" strokeWidth="3"/><path d={`M${x-17} 250H${x+17}M${x} 233V267`} stroke="#ffe0a1" strokeWidth="2"/></g>; }) : <g><circle cx="500" cy={variant === "blended-pusher" ? 408 : 190} r="15" fill="#0b2731" stroke="#edbd73" strokeWidth="3"/><path d={`M485 ${variant === "blended-pusher" ? 408 : 190}H515`} stroke="#ffe0a1" strokeWidth="3"/></g>}
      </g>}
      {isVtol && <g>
        <path d="M500 170 C455 210 445 255 450 318 L472 395 L528 395 L550 318 C555 255 545 210 500 170Z" fill="#baf4e8" fillOpacity=".62" stroke="#d4fff6" strokeWidth="3"/>
        <path d="M465 245 L180 188 L145 232 L440 320 M535 245 L820 188 L855 232 L560 320" fill="#57bdbb" fillOpacity=".3" stroke="#baf4e8" strokeWidth="3"/>
        <path d="M478 382 L415 432 M522 382 L585 432" stroke="#79e8df" strokeWidth="7" strokeLinecap="round"/>
        {Array.from({length:motorCount},(_,i)=>{const side=i%2===0?-1:1,row=Math.floor(i/2),pairs=Math.ceil(motorCount/2),x=500+side*(pairs===1?300:175+row*(240/Math.max(1,pairs-1))),y=205+row*28;return <g key={`vtol-${i}`} className={renderMode === "kinematics" ? `idds-rotor ${kinematicsPlaying ? "is-playing" : ""}` : ""}><path d={`M${500+side*150} ${268+row*12}L${x} ${y}`} stroke="#baf4e8" strokeWidth="4"/><circle cx={x} cy={y} r="22" fill="#0b2731" stroke="#edbd73" strokeWidth="3"/><path d={`M${x-18} ${y}Q${x} ${y-8} ${x+18} ${y}Q${x} ${y+8} ${x-18} ${y}M${x} ${y-18}Q${x+8} ${y} ${x} ${y+18}Q${x-8} ${y} ${x} ${y-18}`} fill="none" stroke="#ffe0a1" strokeWidth="2"/></g>})}
        <path d="M500 392V452M475 452Q500 469 525 452" fill="none" stroke="#edbd73" strokeWidth="4"/>
      </g>}
      {isMultirotor && <g>
        <path d="M500 205 C465 220 445 255 448 310 C451 360 470 395 500 410 C530 395 549 360 552 310 C555 255 535 220 500 205Z" fill="#baf4e8" fillOpacity=".62" stroke="#d4fff6" strokeWidth="3"/>
        {Array.from({length:motorCount},(_,i)=>{const angle=-Math.PI/2+i/motorCount*Math.PI*2,x=500+Math.cos(angle)*245,y=305+Math.sin(angle)*150,tx=500+Math.cos(angle)*95,ty=305+Math.sin(angle)*62;return <g key={`multi-${i}`} className={renderMode === "kinematics" ? `idds-rotor ${kinematicsPlaying ? "is-playing" : ""}` : ""}><path d={`M${tx} ${ty}L${x} ${y}`} stroke="#57bdbb" strokeWidth="15" strokeLinecap="round"/><circle cx={x} cy={y} r="25" fill="#0b2731" stroke="#edbd73" strokeWidth="3"/><path d={`M${x-21} ${y}H${x+21}M${x} ${y-21}V${y+21}`} stroke="#ffe0a1" strokeWidth="2"/>{variant === "ducted-fan"&&<circle cx={x} cy={y} r="19" fill="none" stroke="#a6e8df" strokeWidth="4"/>}</g>})}
        <rect x="478" y="278" width="44" height="68" rx="10" fill="#0b2731" stroke="#86d9a4" strokeWidth="3"/>
      </g>}
      {!isFixedWing && !isVtol && !isMultirotor && <g>
        {variant === "aérostat" ? <><ellipse cx="500" cy="270" rx="140" ry="95" fill="#57bdbb" fillOpacity=".22" stroke="#baf4e8" strokeWidth="3"/><path d="M460 360L470 392H530L540 360M500 360V420" fill="none" stroke="#edbd73" strokeWidth="4"/></> :
        variant === "parapente" ? <><path d="M145 220Q500 90 855 220Q500 160 145 220Z" fill="#57bdbb" fillOpacity=".22" stroke="#baf4e8" strokeWidth="3"/><path d="M180 218L480 390M340 190L492 390M500 175V395M660 190L508 390M820 218L520 390" stroke="#baf4e8" strokeWidth="2"/><path d="M482 390L500 420L518 390Z" fill="#edbd73"/></> :
        variant === "ornithoptère" ? <><path d="M500 210Q420 140 200 170Q300 265 480 305L500 385L520 305Q700 265 800 170Q580 140 500 210Z" fill="#57bdbb" fillOpacity=".25" stroke="#baf4e8" strokeWidth="3"/><path d="M500 210V410M265 185L485 300M735 185L515 300" stroke="#baf4e8" strokeWidth="3"/></> : <><path d="M500 195Q430 235 450 320L500 402L550 320Q570 235 500 195Z" fill="#57bdbb" fillOpacity=".28" stroke="#baf4e8" strokeWidth="3"/><ellipse cx="380" cy="292" rx="42" ry="94" fill="none" stroke="#edbd73" strokeWidth="7"/><ellipse cx="620" cy="292" rx="42" ry="94" fill="none" stroke="#edbd73" strokeWidth="7"/><path d="M422 292H460M540 292H578" stroke="#baf4e8" strokeWidth="12"/></>}
      </g>}
      <text x="500" y="70" textAnchor="middle" fill="#9cefe5" fontSize="13" letterSpacing="2">SOURCE CATALOGUE · {design.label.toUpperCase()} · {variant.toUpperCase()}</text>
    </g>}
    {strokes.map(stroke => { const first = stroke.points[0]; if (!first) return null; if (stroke.tool === "ellipse" && stroke.points[1]) { const second = stroke.points[1]; return <ellipse key={`source-${stroke.id}`} cx={(first.x + second.x) / 2} cy={(first.y + second.y) / 2} rx={Math.abs(first.x - second.x) / 2} ry={Math.abs(first.y - second.y) / 2} fill={stroke.fill ?? "none"} stroke={stroke.color} strokeWidth={stroke.width} opacity={stroke.opacity ?? 1}/>; } if (stroke.tool === "rectangle" && stroke.points[1]) { const second = stroke.points[1]; return <rect key={`source-${stroke.id}`} x={Math.min(first.x, second.x)} y={Math.min(first.y, second.y)} width={Math.abs(first.x - second.x)} height={Math.abs(first.y - second.y)} fill={stroke.fill ?? "none"} stroke={stroke.color} strokeWidth={stroke.width} opacity={stroke.opacity ?? 1}/>; } if (stroke.tool === "annotation") return <text key={`source-${stroke.id}`} x={first.x} y={first.y} fill={stroke.color} fontSize="15">{stroke.label ?? "Repère"}</text>; return <path key={`source-${stroke.id}`} d={stroke.points.map((point, i) => `${i ? "L" : "M"}${point.x} ${point.y}`).join(" ")} fill={stroke.fill ?? "none"} stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" opacity={stroke.opacity ?? 1}/>; })}
    {parts.map(part => { const color = palette[part.kind]; const selected = selectedId === part.id; const transform = `translate(${part.x * 10} ${part.y * 5.6}) rotate(${part.rotation}) scale(${part.scale})`; return <g key={part.id} opacity={design ? (selected ? 1 : 0.58) : 1} className={`idds-parametric-part ${selected ? "is-selected" : ""}`} transform={transform} onPointerDown={event => onPartPointerDown?.(event, part)} onClick={() => onSelectPart(part.id)} tabIndex={0} role="button" aria-label={`${editable ? "Sélectionner ou déplacer" : "Sélectionner"} ${part.label}`} style={{ cursor: editable ? (part.locked ? "not-allowed" : "grab") : "pointer" }}>
      <rect x={-part.width / 2 + 6} y={-part.height / 2 + 9} width={part.width} height={part.height} rx={part.kind === "body" ? part.height / 2 : 8} fill="#041015" stroke={color} strokeOpacity=".38"/>
      {part.kind === "wing" ? <path d={`M${-part.width/2} 0 L${-part.width*.28} ${-part.height/2} L${part.width/2} ${-part.height*.32} L${part.width*.38} 0 L${part.width/2} ${part.height*.32} L${-part.width*.28} ${part.height/2}Z`} fill="url(#idds-part-face)" stroke={color} strokeWidth={selected ? 3 : 1.6}/> : part.kind === "motor" ? <g><ellipse rx={part.width/2} ry={part.height/2} fill="url(#idds-part-face)" stroke={color} strokeWidth={selected ? 3 : 1.6}/><circle r={Math.max(5,Math.min(part.width,part.height)*.18)} fill="#08252d" stroke={color}/><path d={`M${-part.width*.42} 0H${part.width*.42}`} stroke="#ffe0a1" strokeWidth="2"/></g> : <rect x={-part.width/2} y={-part.height/2} width={part.width} height={part.height} rx={part.kind === "body" ? part.height/2 : 8} fill="url(#idds-part-face)" stroke={color} strokeWidth={selected ? 3 : 1.6}/>}
      {(!design || selected) && <><text x="0" y="4" textAnchor="middle" fill="#082027" fontSize="10" fontWeight="700">{part.label}</text><text x={part.width/2} y={-part.height/2-7} textAnchor="end" fill={color} fontSize="8">{part.massKg.toFixed(2)} kg</text></>}
    </g>; })}
    {renderMode === "internals" && <g className="idds-internal-overlay" pointerEvents="none">
      <path d="M500 158V414" stroke="#ffcf82" strokeWidth="2" strokeDasharray="7 5" opacity=".8"/>
      <path d="M470 270H530M470 290H530M470 310H530M470 330H530" stroke="#8de4dc" strokeWidth="2" opacity=".85"/>
      <rect x="460" y="270" width="80" height="72" rx="8" fill="#06131a" fillOpacity=".7" stroke="#f1c276" strokeDasharray="4 3"/>
      <text x="500" y="300" textAnchor="middle" fill="#fff0cf" fontSize="10">BUS / AVIONIQUE</text>
      <text x="500" y="316" textAnchor="middle" fill="#a9dcd6" fontSize="9">COUPE CONCEPTUELLE</text>
      {parts.slice(0, 8).map((part, index) => { const x = 90 + (index % 4) * 245; const y = 475 + Math.floor(index / 4) * 25; return <g key={`internal-${part.id}`}><path d={`M${x} ${y-12}L${Math.max(80, Math.min(920, part.x * 10))} ${Math.max(65, Math.min(440, part.y * 5.6))}`} stroke="#81d7cf" strokeOpacity=".55" strokeDasharray="3 4"/><circle cx={x} cy={y} r="3" fill="#edbd73"/><text x={x+8} y={y+3} fill="#d5e9e7" fontSize="9">{part.label}</text></g>; })}
    </g>}
    {renderMode === "kinematics" && <g pointerEvents="none" opacity=".8"><path d="M430 245Q500 165 570 245" fill="none" stroke="#f0c77e" strokeWidth="2" strokeDasharray="5 5"/><path d="M560 235l12 10-15 4" fill="none" stroke="#f0c77e" strokeWidth="2"/><text x="500" y="145" textAnchor="middle" fill="#ffe4ab" fontSize="11">MOUVEMENT CINÉMATIQUE · ROTORS / ARTICULATIONS</text></g>}
    <text x="18" y="24" fill="#7fcac6" fontSize="10" letterSpacing="2">IDDS · {renderModes.find(mode => mode.id === renderMode)?.label.toUpperCase()} · MODÈLE ÉDITABLE</text>
    <text x="18" y="544" fill="#78959c" fontSize="9">Les contours et paramètres sont des représentations de conception, à vérifier avant fabrication.</text>
  </svg>;
}

export function DesignStudioView({
  config,
  setConfig,
  activeProfile,
  onSelectProfile,
  onOpenLibrary,
  onUserIntegration,
}: {
  config: ConceptConfig;
  setConfig: Dispatch<SetStateAction<ConceptConfig>>;
  activeProfile?: DroneCatalogDesign;
  onSelectProfile?: (design: DroneCatalogDesign) => void;
  onOpenLibrary?: () => void;
  onUserIntegration?: () => void;
}) {
  const { language } = useLanguage();
  const initialParts = useMemo(() => partsForConfig(config, activeProfile), [config, activeProfile]);
  const [parts, setParts] = useState<StudioPart[]>(initialParts);
  const partsRef = useRef<StudioPart[]>(initialParts);
  const [architectureQuery, setArchitectureQuery] = useState("");
  const [partQuery, setPartQuery] = useState("");
  const [activeStudioSection, setActiveStudioSection] = useState<StudioSection>("concept");
  const profileRef = useRef(`${config.engineeringSelection?.source ?? ""}:${config.platformProfile ?? config.airframe ?? ""}:${activeProfile?.id ?? activeProfile?.key ?? ""}`);
  const publishedSketchRef = useRef(config.customSketch?.modifiedAt ?? "");
  const publishedMaterialsRef = useRef(
    materialsSignature(config.installedMaterials)
  );
  const publishedGeometryRef = useRef(geometrySignature(config));
  const publishedLayersRef = useRef(JSON.stringify(config.studioLayers ?? []));
  const [selectedId, setSelectedId] = useState(initialParts[0]?.id ?? "body");
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((config.studioLayers ?? []).map(label => [label, config.studioLayerSettings?.[label]?.visible ?? true]))
  );
  const [customLayers, setCustomLayers] = useState<string[]>(() => [...new Set(config.studioLayers ?? [])]);
  const [layerLocks, setLayerLocks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(Object.entries(config.studioLayerSettings ?? {}).map(([label, value]) => [label, value.locked]))
  );
  const publishedLayerSettingsRef = useRef(JSON.stringify(config.studioLayerSettings ?? {}));
  const publishedActiveLayerRef = useRef((config.studioLayers ?? []).includes(config.activeStudioLayer ?? "") ? config.activeStudioLayer ?? "" : "");
  const [layerNameDraft, setLayerNameDraft] = useState("");
  const [addingLayer, setAddingLayer] = useState(false);
  const [renamingLayer, setRenamingLayer] = useState("");
  const [renamedLayerDraft, setRenamedLayerDraft] = useState("");
  const [draggedLayer, setDraggedLayer] = useState<string | null>(null);
  const documentLayers = [...customLayers];
  const publishLayerState = (visibility: Record<string, boolean>, locks: Record<string, boolean>, active: string, names = documentLayers) => {
    const settings = Object.fromEntries(names.map(label => [label, {
      visible: visibility[label] !== false,
      locked: locks[label] === true,
    }]));
    publishedLayerSettingsRef.current = JSON.stringify(settings);
    publishedActiveLayerRef.current = active;
    setConfig(current => ({ ...current, studioLayerSettings: settings, activeStudioLayer: active }));
  };
  const updateLayerVisibility = (label: string, visible: boolean) => {
    const next = { ...layerVisibility, [label]: visible };
    setLayerVisibility(next);
    publishLayerState(next, layerLocks, activeLayer);
  };
  const updateLayerLock = (label: string, locked: boolean) => {
    const next = { ...layerLocks, [label]: locked };
    setLayerLocks(next);
    publishLayerState(layerVisibility, next, activeLayer);
  };
  const activateLayer = (label: string) => {
    setActiveLayer(label);
    publishLayerState(layerVisibility, layerLocks, label);
  };
  useEffect(() => {
    const incomingSettings = config.studioLayerSettings ?? {};
    const signature = JSON.stringify(incomingSettings);
    if (signature !== publishedLayerSettingsRef.current) {
      publishedLayerSettingsRef.current = signature;
      setLayerVisibility(Object.fromEntries(customLayers.map(label => [label, incomingSettings[label]?.visible ?? true])));
      setLayerLocks(Object.fromEntries(Object.entries(incomingSettings).map(([label, value]) => [label, value.locked])));
    }
    const incomingActive = config.activeStudioLayer ?? "";
    if (incomingActive !== publishedActiveLayerRef.current) {
      publishedActiveLayerRef.current = incomingActive;
      setActiveLayer(customLayers.includes(incomingActive) ? incomingActive : "");
    }
  }, [config.studioLayerSettings, config.activeStudioLayer, customLayers]);
  const [tool, setTool] = useState<Tool>("select");
  const [view, setView] = useState<ViewMode>("top");
  const [renderMode, setRenderMode] = useState<RenderMode>("assembly");
  const [kinematicsPlaying, setKinematicsPlaying] = useState(false);
  const [mechanicalExploded, setMechanicalExploded] = useState(false);
  const [generatedVariants, setGeneratedVariants] = useState<Array<{ name: string; wingspan: number; fuselageLength: number; motorCount: number }>>([]);
  const [engineeringDiscipline, setEngineeringDiscipline] = useState<EngineeringDiscipline>("mechanical");
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const [gridSize, setGridSize] = useState(5);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [drag, setDrag] = useState<{
    id: string;
    dx: number;
    dy: number;
  } | null>(null);
  const [measureStart, setMeasureStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [measure, setMeasure] = useState("");
  const [activeLayer, setActiveLayer] = useState((config.studioLayers ?? []).includes(config.activeStudioLayer ?? "") ? config.activeStudioLayer ?? "" : "");
  const stageRef = useRef<SVGSVGElement | null>(null);
  const panOrigin = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const navigateStudioSection = useCallback((section: StudioSection) => {
    setActiveStudioSection(section);
    if (section === "materials") setPartQuery("");
    if (section === "electronics") setPartQuery("avionique");
    const targetId: Record<StudioSection, string> = {
      concept: "studio-concept-overview",
      physical: "studio-physical-design",
      cad: "studio-cad-workbench",
      simulation: "studio-analysis-results",
      materials: "studio-assembly-workbench",
      electronics: "studio-electronics-workbench",
      assembly: "studio-assembly-workbench",
      tests: "studio-analysis-results",
      reports: "studio-export-panel",
    };
    window.requestAnimationFrame(() => {
      document.getElementById(targetId[section])?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);
  const announce = useCallback(
    (message: string) =>
      setHistory(current =>
        [
          `${new Date().toLocaleTimeString("fr-FR")} · ${message}`,
          ...current,
        ].slice(0, 12)
      ),
    []
  );
  const fileRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    partsRef.current = parts;
  }, [parts]);
  useEffect(() => {
    const profile = `${config.engineeringSelection?.source ?? ""}:${config.platformProfile ?? config.airframe ?? ""}:${activeProfile?.id ?? activeProfile?.key ?? ""}`;
    const profileChanged = profileRef.current !== profile;
    const incomingSignature = materialsSignature(config.installedMaterials);
    const incomingLayersSignature = JSON.stringify(config.studioLayers ?? []);
    const incomingGeometrySignature = geometrySignature(config);
    const incomingSketchSignature = config.customSketch?.modifiedAt ?? "";
    const externalLayersChanged =
      incomingLayersSignature !== publishedLayersRef.current;
    const externalSketchChanged = incomingSketchSignature !== publishedSketchRef.current;
    const currentSignature = materialsSignature(partsToMaterials(parts));
    const externalMaterialsChanged =
      incomingSignature !== publishedMaterialsRef.current &&
      incomingSignature !== currentSignature;
    if (profileChanged || externalMaterialsChanged || externalLayersChanged || externalSketchChanged) {
      profileRef.current = profile;
      const next = partsForConfig(config, activeProfile, !externalSketchChanged);
      publishedMaterialsRef.current = incomingSignature;
      publishedLayersRef.current = incomingLayersSignature;
      publishedSketchRef.current = incomingSketchSignature;
      const nextCustomLayers = [...new Set(config.studioLayers ?? [])];
      setCustomLayers(nextCustomLayers);
      setLayerVisibility(current => ({
        ...current,
        ...Object.fromEntries(nextCustomLayers.map(label => [label, config.studioLayerSettings?.[label]?.visible ?? true])),
      }));
      setLayerLocks(current => ({
        ...current,
        ...Object.fromEntries(nextCustomLayers.map(label => [label, config.studioLayerSettings?.[label]?.locked ?? false])),
      }));
      setParts(next);
      setSelectedId(next[0]?.id ?? "");
      setAnnotations([]);
      setPast([]);
      setFuture([]);
      announce(
        profileChanged
          ? "Profil de conception actualisé depuis l’espace de travail"
          : "Nomenclature actualisée depuis l’espace de travail"
      );
    }
    if (
      incomingGeometrySignature !== publishedGeometryRef.current &&
      !profileChanged &&
      !externalMaterialsChanged
    ) {
      publishedGeometryRef.current = incomingGeometrySignature;
      const next = parts.map(part => {
        if (part.kind === "body") {
          return {
            ...part,
            width: clamp(140 + config.fuselageLength * 18, 140, 320),
            massKg: Math.max(0.4, config.fuselageLength * 0.45),
          };
        }
        if (part.kind === "wing") {
          return {
            ...part,
            width: clamp(config.wingspan * 30, 160, 440),
            massKg: Math.max(0.25, config.wingspan * 0.22),
          };
        }
        if (part.kind === "motor") {
          const count = Math.max(1, Math.round(config.motorCount ?? 1));
          return {
            ...part,
            label: `${count} moteur(s) · propulsion`,
            massKg: Math.max(0.15, count * 0.12),
            width: clamp(70 + count * 7, 70, 150),
          };
        }
        if (part.kind === "payload") {
          return { ...part, massKg: Math.max(0.1, config.payloadKg) };
        }
        return part;
      });
      setParts(next);
      publishedMaterialsRef.current = materialsSignature(partsToMaterials(next));
      announce("Géométrie recalculée · paramètres de l’inspecteur appliqués visuellement");
    }
  }, [
    config.platformProfile,
    config.airframe,
    config.engineeringSelection?.source,
    config.customSketch?.modifiedAt,
    config.installedMaterials,
    config.studioLayers,
    config.wingspan,
    config.fuselageLength,
    config.payloadKg,
    config.motorCount,
    config.propDiameter,
    activeProfile,
    parts,
    announce,
  ]);
  const selected = parts.find(part => part.id === selectedId) ?? parts[0];
  const visibleParts = parts
    .filter(part => part.visible && layerVisibility[part.layer] !== false)
    .sort((a, b) => documentLayers.indexOf(b.layer) - documentLayers.indexOf(a.layer));
  const totalMass = parts.reduce(
    (sum, part) => sum + part.massKg * part.scale ** 3,
    0
  );
  const realPartCatalog = useMemo(
    () => [...manufacturerPartCatalog, ...dronePartCatalog],
    []
  );
  const filteredParts = useMemo(() => {
    const query = partQuery.trim().toLocaleLowerCase("fr-FR");
    if (!query) return realPartCatalog;
    return realPartCatalog.filter(item => {
      const localizedCategory = item.category === "avionics" ? "avionique" : item.category;
      return [
        item.label,
        item.manufacturer,
        item.partNumber,
        item.category,
        localizedCategory,
        item.use,
        item.dimensions,
      ].some(value => value?.toLocaleLowerCase("fr-FR").includes(query));
    });
  }, [partQuery, realPartCatalog]);
  const filteredArchitectures = useMemo(() => {
    const query = architectureQuery.trim().toLocaleLowerCase("fr-FR");
    if (!query) return droneCatalog;
    return droneCatalog.filter(item =>
      [item.label, item.family, item.modelType, item.mission, item.id].some(
        value => value?.toLocaleLowerCase("fr-FR").includes(query)
      )
    );
  }, [architectureQuery]);
  const snapshot = useCallback(
    (message: string): Snapshot => ({
      parts,
      annotations,
      zoom,
      view,
      message,
    }),
    [annotations, parts, view, zoom]
  );
  const syncConfig = useCallback(
    (next: StudioPart[]) => {
      const materials = partsToMaterials(next);
      publishedMaterialsRef.current = materialsSignature(materials);
      setConfig(current => ({
        ...current,
        studioLayers: customLayers,
        installedMaterials: materials,
        constructionMassKg: next.reduce(
          (sum, part) => sum + part.massKg * part.scale ** 3,
          0
        ),
      }));
    },
    [config, customLayers, setConfig]
  );
  const commit = useCallback(
    (next: StudioPart[], message: string, nextAnnotations = annotations) => {
      setPast(current => [...current.slice(-39), snapshot(message)]);
      setFuture([]);
      setParts(next);
      setAnnotations(nextAnnotations);
      syncConfig(next);
      announce(message);
    },
    [announce, annotations, snapshot, syncConfig]
  );
  const undo = useCallback(() => {
    const previous = past[past.length - 1];
    if (!previous) return;
    setFuture(current => [...current, snapshot("Rétablissement")]);
    setPast(current => current.slice(0, -1));
    setParts(previous.parts);
    setAnnotations(previous.annotations);
    setZoom(previous.zoom);
    setView(previous.view);
    syncConfig(previous.parts);
    announce(`Annulation · ${previous.message}`);
  }, [announce, past, snapshot, syncConfig]);
  const redo = useCallback(() => {
    const next = future[future.length - 1];
    if (!next) return;
    setPast(current => [...current, snapshot("Annulation")]);
    setFuture(current => current.slice(0, -1));
    setParts(next.parts);
    setAnnotations(next.annotations);
    setZoom(next.zoom);
    setView(next.view);
    syncConfig(next.parts);
    announce(`Rétablissement · ${next.message}`);
  }, [announce, future, snapshot, syncConfig]);
  const pointFromEvent = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect =
      stageRef.current?.getBoundingClientRect() ??
      event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  };
  const snapPoint = (value: number) =>
    snap ? Math.round(value / gridSize) * gridSize : Number(value.toFixed(1));
  const onStagePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (tool === "pan") {
      panOrigin.current = {
        x: event.clientX,
        y: event.clientY,
        ox: panOffset.x,
        oy: panOffset.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const point = pointFromEvent(event);
    if (tool === "annotate") {
      const text = window.prompt("Texte de l’annotation", "Point à vérifier");
      if (text) {
        const next = [
          ...annotations,
          { id: String(Date.now()), ...point, text },
        ];
        setPast(current => [
          ...current.slice(-39),
          snapshot("Annotation précédente"),
        ]);
        setAnnotations(next);
        announce(`Annotation ajoutée · ${text}`);
      }
      return;
    }
    if (tool === "measure") {
      if (!measureStart) setMeasureStart(point);
      else {
        const distance = Math.hypot(
          point.x - measureStart.x,
          point.y - measureStart.y
        );
        setMeasure(
          `${distance.toFixed(1)} unités écran · ${((distance / 100) * Math.max(config.wingspan, 1)).toFixed(2)} m estimés`
        );
        setMeasureStart(null);
        announce(`Mesure créée · ${distance.toFixed(1)} unités écran`);
      }
    }
  };
  const onPartPointerDown = (
    event: ReactPointerEvent<SVGGElement>,
    part: StudioPart
  ) => {
    event.stopPropagation();
    setSelectedId(part.id);
    if (part.locked || layerLocks[part.layer]) return;
    if (tool === "cut") {
      if (parts.length > 1)
        commit(
          parts.filter(item => item.id !== part.id),
          `Élément retiré · ${part.label}`
        );
      return;
    }
    if (tool !== "select") return;
    const point = pointFromEvent(
      event as unknown as ReactPointerEvent<SVGSVGElement>
    );
    setDrag({ id: part.id, dx: point.x - part.x, dy: point.y - part.y });
    (event.currentTarget as SVGGElement).setPointerCapture(event.pointerId);
  };
  const onStagePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (panOrigin.current) {
      setPanOffset({
        x: panOrigin.current.ox + event.clientX - panOrigin.current.x,
        y: panOrigin.current.oy + event.clientY - panOrigin.current.y,
      });
      return;
    }
    if (!drag) return;
    const point = pointFromEvent(event);
    const next = parts.map(part =>
      part.id === drag.id
        ? {
            ...part,
            x: clamp(snapPoint(point.x - drag.dx), 5, 95),
            y: clamp(snapPoint(point.y - drag.dy), 8, 92),
          }
        : part
    );
    partsRef.current = next;
    setParts(next);
  };
  const onStagePointerUp = () => {
    if (panOrigin.current) {
      panOrigin.current = null;
      return;
    }
    if (drag) {
      syncConfig(partsRef.current);
      setPast(current => [
        ...current.slice(-39),
        snapshot("Position précédente"),
      ]);
      setFuture([]);
      announce("Pièce repositionnée avec accrochage");
    }
    setDrag(null);
  };
  const createParametricVariant = () => {
    const index = generatedVariants.length;
    const baseSpan = Math.max(0.2, Number(config.wingspan) || 1);
    const baseLength = Math.max(0.1, Number(config.fuselageLength) || 0.5);
    const baseMotors = Math.max(1, Math.round(Number(config.motorCount) || 4));
    const variant = {
      name: `Variante ${String.fromCharCode(65 + (index % 26))}`,
      wingspan: Number((baseSpan * (index % 2 === 0 ? 1.08 : 0.92)).toFixed(2)),
      fuselageLength: Number((baseLength * (index % 2 === 0 ? 1 : 1.06)).toFixed(2)),
      motorCount: Math.max(1, Math.min(12, baseMotors + (index % 2 === 0 ? 1 : -1))),
    };
    setGeneratedVariants(current => [...current, variant]);
    setConfig(current => ({ ...current, wingspan: variant.wingspan, fuselageLength: variant.fuselageLength, motorCount: variant.motorCount }));
    announce(`${variant.name} créée et appliquée au modèle actif · paramètres modifiables`);
  };
  const applyParametricVariant = (variant: { name: string; wingspan: number; fuselageLength: number; motorCount: number }) => {
    setConfig(current => ({ ...current, wingspan: variant.wingspan, fuselageLength: variant.fuselageLength, motorCount: variant.motorCount }));
    announce(`${variant.name} appliquée au modèle actif · géométrie et nomenclature synchronisées`);
  };
  const changeSelected = (patch: Partial<StudioPart>, message: string) => {
    if (!selected) return;
    commit(
      parts.map(part =>
        part.id === selected.id ? { ...part, ...patch } : part
      ),
      message
    );
  };
  const addCatalogPart = (item: DronePartDefinition) => {
    const kind = kindForCategory(item.category);
    const index = parts.length;
    const part: StudioPart = {
      id: `${item.id}-${Date.now()}`,
      label: item.label,
      kind,
      layer: "",
      x: clamp(50 + ((index % 3) - 1) * 12, 5, 95),
      y: clamp(32 + ((index * 9) % 55), 8, 92),
      width:
        kind === "body"
          ? 170
          : kind === "payload"
            ? 92
            : kind === "motor"
              ? 84
              : 110,
      height: kind === "body" ? 58 : kind === "motor" ? 46 : 42,
      rotation: 0,
      scale: 1,
      massKg: item.massKg,
      locked: false,
      visible: true,
      constraint: kind === "body" ? "center-x" : "free",
      manufacturer: item.manufacturer,
      partNumber: item.partNumber,
      dimensions: item.dimensions,
      interfaces: item.interfaces,
      catalogSource: item.catalogSource ?? "concept",
      manufacturerDataStatus: item.manufacturerDataStatus ?? "estimate",
    };
    commit([...parts, part], `Référence ajoutée · ${item.label}`);
    setSelectedId(part.id);
  };
  const addManualPart = (template: (typeof manualPartTemplates)[number]) => {
    if (!activeLayer) {
      announce("Créez puis sélectionnez un calque avant d’ajouter une pièce de construction");
      return;
    }
    if (layerLocks[activeLayer]) {
      announce(`Ajout refusé · le calque ${activeLayer} est verrouillé`);
      return;
    }
    const ordinal =
      parts.filter(part => part.kind === template.kind).length + 1;
    const part: StudioPart = {
      id: `user-${template.kind}-${Date.now()}`,
      label: `${template.label} ${ordinal}`,
      kind: template.kind,
      layer: activeLayer,
      x: 50,
      y: clamp(37 + ((parts.length * 11) % 45), 8, 92),
      width: template.width,
      height: template.height,
      rotation: 0,
      scale: 1,
      massKg: template.massKg,
      locked: false,
      visible: true,
      constraint:
        template.kind === "body" || template.kind === "wing"
          ? "center-x"
          : "free",
      catalogSource: "user",
      manufacturerDataStatus: "estimate",
    };
    commit(
      [...parts, part],
      `Composant manuel ajouté · ${part.label} · masse à qualifier`
    );
    setSelectedId(part.id);
  };
  const createCustomLayer = () => {
    const name = layerNameDraft.trim();
    const next = createStudioLayer(config, name);
    if (!next) { announce(`Calque non créé · « ${name || "sans nom"} » est vide ou déjà utilisé`); return; }
    const nextLayers = next.studioLayers ?? [];
    setCustomLayers(nextLayers);
    setLayerVisibility(current => ({ ...current, [name]: true }));
    setLayerLocks(current => ({ ...current, [name]: false }));
    setActiveLayer(name);
    publishedLayersRef.current = JSON.stringify(nextLayers);
    publishedLayerSettingsRef.current = JSON.stringify(next.studioLayerSettings ?? {});
    publishedActiveLayerRef.current = name;
    setConfig(current => createStudioLayer(current, name) ?? current);
    setLayerNameDraft(""); setAddingLayer(false);
    announce(`Calque créé par l’utilisateur · ${name}`);
  };
  const renameCustomLayer = (oldLabel: string) => {
    const newLabel = renamedLayerDraft.trim();
    const next = renameStudioLayer(config, oldLabel, newLabel);
    if (!next) { announce(`Renommage refusé · nom vide ou déjà utilisé`); return; }
    const nextLayers = next.studioLayers ?? [];
    const nextParts = parts.map(part => part.layer === oldLabel ? { ...part, layer: newLabel } : part);
    setCustomLayers(nextLayers); setParts(nextParts); partsRef.current = nextParts;
    setLayerVisibility(Object.fromEntries(nextLayers.map(label => [label, next.studioLayerSettings?.[label]?.visible ?? true])));
    setLayerLocks(Object.fromEntries(nextLayers.map(label => [label, next.studioLayerSettings?.[label]?.locked ?? false])));
    setActiveLayer(next.activeStudioLayer ?? "");
    publishedLayersRef.current = JSON.stringify(nextLayers);
    publishedMaterialsRef.current = materialsSignature(partsToMaterials(nextParts));
    publishedLayerSettingsRef.current = JSON.stringify(next.studioLayerSettings ?? {});
    publishedActiveLayerRef.current = next.activeStudioLayer ?? "";
    setConfig(current => renameStudioLayer(current, oldLabel, newLabel) ?? current);
    setRenamingLayer(""); setRenamedLayerDraft("");
    announce(`Calque renommé · ${oldLabel} → ${newLabel}; pièces et traits conservés`);
  };
  const deleteCustomLayer = (label: string) => {
    const next = deleteStudioLayer(config, label);
    if (!next) return;
    const nextLayers = next.studioLayers ?? [];
    const nextParts = parts.map(part => part.layer === label ? { ...part, layer: "" } : part);
    setCustomLayers(nextLayers); setParts(nextParts); partsRef.current = nextParts;
    setLayerVisibility(Object.fromEntries(nextLayers.map(name => [name, next.studioLayerSettings?.[name]?.visible ?? true])));
    setLayerLocks(Object.fromEntries(nextLayers.map(name => [name, next.studioLayerSettings?.[name]?.locked ?? false])));
    if (activeLayer === label) setActiveLayer("");
    publishedLayersRef.current = JSON.stringify(nextLayers);
    publishedMaterialsRef.current = materialsSignature(partsToMaterials(nextParts));
    publishedLayerSettingsRef.current = JSON.stringify(next.studioLayerSettings ?? {});
    publishedActiveLayerRef.current = next.activeStudioLayer ?? "";
    setConfig(current => {
      const result = deleteStudioLayer(current, label);
      return result ? { ...result, installedMaterials: partsToMaterials(nextParts), constructionMassKg: nextParts.reduce((sum, part) => sum + part.massKg * part.scale ** 3, 0) } : current;
    });
    announce(`Calque supprimé · ses pièces et traits restent dans le document, sans affectation`);
  };
  const moveCustomLayer = (from: number, to: number) => {
    const next = reorderStudioLayer(config, from, to);
    setCustomLayers(next.studioLayers ?? []);
    publishedLayersRef.current = JSON.stringify(next.studioLayers ?? []);
    setConfig(current => reorderStudioLayer(current, from, to));
  };
  const duplicateSelected = () => {
    if (!selected) return;
    const copy = {
      ...selected,
      id: `${selected.id}-copy-${Date.now()}`,
      label: `${selected.label} copie`,
      x: clamp(selected.x + gridSize, 5, 95),
      y: clamp(selected.y + gridSize, 8, 92),
      locked: false,
    };
    commit([...parts, copy], `Pièce dupliquée · ${selected.label}`);
    setSelectedId(copy.id);
  };
  const deleteSelected = () => {
    if (!selected || parts.length <= 1) return;
    const next = parts.filter(part => part.id !== selected.id);
    commit(next, `Pièce supprimée · ${selected.label}`);
    setSelectedId(next[0].id);
  };
  const exportStudio = () => {
    download(
      "aeromind-studio-design.json",
      JSON.stringify(
        {
          schema: "aeromind-studio-v3",
          config,
          parts,
          annotations,
          view,
          customLayers,
          exportedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      "application/json"
    );
    announce("Document paramétrique exporté");
  };
  const exportBom = () => {
    download(
      "aeromind-studio-bom.csv",
      buildBillOfMaterialsCsv(config, partsToMaterials(parts)),
      "text/csv;charset=utf-8"
    );
    announce("Nomenclature CSV exportée");
  };
  const exportOpenScad = () => {
    const name = safeEngineeringFilename(config.designName ?? activeProfile?.label ?? "aeromind_concept");
    download(`${name}.scad`, buildOpenScadModel(config), "text/plain;charset=utf-8");
    announce("Modèle OpenSCAD préliminaire exporté");
  };
  const exportEngineeringJson = () => {
    const name = safeEngineeringFilename(config.designName ?? activeProfile?.label ?? "aeromind_concept");
    download(`${name}-engineering.json`, buildEngineeringJson(config), "application/json");
    announce("Dossier d’ingénierie préliminaire exporté");
  };
  const harmonizeAssembly = () => {
    if (!parts.length) {
      announce("Harmonisation impossible · aucune pièce dans le document");
      return;
    }
    const next = parts.map((part, index) => ({
      ...part,
      x: 50,
      y: clamp(34 + index * 10, 8, 92),
      constraint:
        part.kind === "body" || part.kind === "wing"
          ? ("center-x" as Constraint)
          : part.constraint,
    }));
    commit(next, "Assemblage harmonisé · axes et espacement recalculés");
  };
  const assemblyReview = () => {
    const findings: string[] = [];
    const unassigned = parts.filter(part => !part.layer || !documentLayers.includes(part.layer));
    const invalidMass = parts.filter(part => !Number.isFinite(part.massKg) || part.massKg <= 0);
    const undeclaredInterfaces = parts.filter(part => !part.interfaces?.trim());
    const unverifiedManufacturer = parts.filter(part => part.catalogSource === "manufacturer" && !/^(verified|confirmed|approved)$/i.test(part.manufacturerDataStatus ?? ""));
    const emptyLayers = documentLayers.filter(label => !parts.some(part => part.layer === label));
    if (unassigned.length) findings.push(`${unassigned.length} pièce(s) sans calque valide`);
    if (invalidMass.length) findings.push(`${invalidMass.length} masse(s) absente(s) ou non positive(s)`);
    if (undeclaredInterfaces.length) findings.push(`${undeclaredInterfaces.length} interface(s) à documenter`);
    if (unverifiedManufacturer.length) findings.push(`${unverifiedManufacturer.length} référence(s) fabricant non vérifiée(s)`);
    if (emptyLayers.length) findings.push(`${emptyLayers.length} calque(s) vide(s)`);
    announce(
      `Audit de construction · ${parts.length} pièce(s) · ${findings.length} point(s) à qualifier${findings.length ? ` · ${findings.join(" ; ")}` : " · aucune anomalie logique détectée"} · validation humaine requise`
    );
  };
  const centerSelected = () => {
    if (!selected) {
      announce("Centrage impossible · aucune pièce sélectionnée");
      return;
    }
    changeSelected({ x: 50, y: 50 }, `Pièce centrée · ${selected.label}`);
  };
  const fitAssembly = () => {
    setZoom(1);
    setView("top");
    announce("Vue ajustée · assemblage complet");
  };
  // CAHIER DES CHARGES 2026-10-30 : captures IDDS + croquis drone pour le Rapport.
  // On sérialise la scène SVG (IDDSParametricScene) en data URL et on dispatche
  // un CustomEvent écouté par Home.tsx pour alimenter ReportView.
  const captureIddsConstruction = () => {
    try {
      const svg = stageRef.current ?? document.querySelector<SVGSVGElement>(".idds-parametric-scene");
      if (!svg) { announce("Aucune construction IDDS à capturer."); return; }
      const serialized = new XMLSerializer().serializeToString(svg);
      const image = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
      const payload = JSON.stringify({
        image,
        capturedAt: new Date().toISOString(),
        partsCount: parts.length,
        totalMass: totalMass.toFixed(2),
        renderMode,
        zoom,
      });
      localStorage.setItem("aeromind-idds-capture", payload);
      window.dispatchEvent(new CustomEvent("aeromind-idds-capture", { detail: payload }));
      announce("Capture IDDS enregistrée · ajoutée au rapport.");
    } catch { announce("Capture IDDS impossible."); }
  };
  const captureDroneSketch = () => {
    try {
      const sketchSvg = document.querySelector<SVGSVGElement>(".drone-sketch-workbench svg, .drone-sketch-pro-workbench svg");
      if (!sketchSvg) { announce("Aucun croquis de drone à capturer."); return; }
      const serialized = new XMLSerializer().serializeToString(sketchSvg);
      const image = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
      const payload = JSON.stringify({
        image,
        capturedAt: new Date().toISOString(),
        strokes: (iddsSketch ?? []).length,
      });
      localStorage.setItem("aeromind-sketch-capture", payload);
      window.dispatchEvent(new CustomEvent("aeromind-sketch-capture", { detail: payload }));
      announce("Croquis de drone capturé · ajouté au rapport.");
    } catch { announce("Croquis impossible à capturer."); }
  };
  const toggleAllParts = () => {
    const nextVisible = parts.some(
      part => !part.visible || layerVisibility[part.layer] === false
    );
    const next = parts.map(part => ({ ...part, visible: nextVisible }));
    partsRef.current = next;
    setParts(next);
    syncConfig(next);
    const nextVisibility = Object.fromEntries(documentLayers.map(label => [label, true]));
    setLayerVisibility(nextVisibility);
    publishLayerState(nextVisibility, layerLocks, activeLayer);
    announce(
      nextVisible ? "Toutes les pièces affichées" : "Toutes les pièces masquées"
    );
  };
  const importStudio = async (file?: File) => {
    if (!file) {
      announce("Import annulé");
      return;
    }
    try {
      const payload = JSON.parse(await file.text()) as {
        parts?: StudioPart[];
        annotations?: Annotation[];
        config?: ConceptConfig;
        zoom?: number;
        view?: ViewMode;
        customLayers?: string[];
      };
      const importedParts = payload.parts;
      if (!Array.isArray(importedParts)) throw new Error("parts absent");
      const importedLayers = payload.customLayers ?? [];
      const safeImportedParts = importedParts.map(part => importedLayers.includes(part.layer) ? part : { ...part, layer: "" });
      setParts(safeImportedParts);
      setAnnotations(payload.annotations ?? []);
      setZoom(payload.zoom ?? 1);
      setView(payload.view ?? "top");
      setCustomLayers(importedLayers);
      setLayerVisibility(Object.fromEntries(importedLayers.map(label => [label, payload.config?.studioLayerSettings?.[label]?.visible ?? true])));
      setLayerLocks(Object.fromEntries(importedLayers.map(label => [label, payload.config?.studioLayerSettings?.[label]?.locked ?? false])));
      const importedMaterials = partsToMaterials(safeImportedParts);
      publishedMaterialsRef.current = materialsSignature(importedMaterials);
      setConfig(current => ({
        ...current,
        ...(payload.config ?? {}),
        installedMaterials: importedMaterials,
        studioLayers: importedLayers,
        studioLayerSettings: Object.fromEntries(importedLayers.map(label => [label, payload.config?.studioLayerSettings?.[label] ?? { visible: true, locked: false }])),
        activeStudioLayer: importedLayers.includes(payload.config?.activeStudioLayer ?? "") ? payload.config?.activeStudioLayer ?? "" : "",
        constructionMassKg: safeImportedParts.reduce(
          (sum, part) => sum + part.massKg * part.scale ** 3,
          0
        ),
      }));
      setPast([]);
      setFuture([]);
      announce(`Document chargé · ${file.name}`);
    } catch {
      announce("Import refusé · document Studio non conforme");
    }
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.tagName === "INPUT") return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        redo();
      } else if (event.key === "Delete") deleteSelected();
      else if (event.key === "Escape") setDrag(null);
      else if (event.key.toLowerCase() === "g") setSnap(current => !current);
      else if (event.key.toLowerCase() === "r" && selected)
        changeSelected({ rotation: selected.rotation + 15 }, "Rotation +15°");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const tools: Array<{ id: Tool; label: string; icon: typeof MousePointer2 }> =
    [
      { id: "select", label: "Sélection", icon: MousePointer2 },
      { id: "pan", label: "Pan", icon: Hand },
      { id: "measure", label: "Mesurer", icon: Ruler },
      { id: "annotate", label: "Annoter", icon: PenLine },
      { id: "cut", label: "Section", icon: Scissors },
    ];
  const dimensions = [
    { label: "Envergure", value: config.wingspan, field: "wingspan" as const },
    {
      label: "Fuselage",
      value: config.fuselageLength,
      field: "fuselageLength" as const,
    },
    { label: "Corde", value: config.chord, field: "chord" as const },
    {
      label: "Hélice",
      value: config.propDiameter,
      field: "propDiameter" as const,
    },
  ];
  const iddsSketch = config.customSketch?.strokes ?? [];
  const iddsUsesSketch = hasDroneGeometry(iddsSketch);
  const iddsProfile = iddsUsesSketch ? undefined : activeProfile;
  const hasStudioSource = Boolean(iddsProfile || iddsUsesSketch);
  const iddsSourceLabel = iddsProfile?.label ?? (iddsUsesSketch ? config.engineeringSelection?.droneLabel ?? config.designName ?? "Dessin utilisateur" : "Aucune source sélectionnée");
  const renderIddsStroke = (stroke: DroneSketchStroke) => {
    const first = stroke.points[0];
    if (!first) return null;
    if (stroke.tool === "annotation") return <text key={stroke.id} x={first.x} y={first.y} fill={stroke.color} fontSize="18">{stroke.label ?? "Repère"}</text>;
    if (stroke.tool === "ellipse" && stroke.points[1]) {
      const second = stroke.points[1];
      return <ellipse key={stroke.id} cx={(first.x + second.x) / 2} cy={(first.y + second.y) / 2} rx={Math.abs(first.x - second.x) / 2} ry={Math.abs(first.y - second.y) / 2} fill={stroke.fill ?? "none"} stroke={stroke.color} strokeWidth={stroke.width} opacity={stroke.opacity ?? 1} />;
    }
    if (stroke.tool === "rectangle" && stroke.points[1]) {
      const second = stroke.points[1];
      return <rect key={stroke.id} x={Math.min(first.x, second.x)} y={Math.min(first.y, second.y)} width={Math.abs(first.x - second.x)} height={Math.abs(first.y - second.y)} fill={stroke.fill ?? "none"} stroke={stroke.color} strokeWidth={stroke.width} opacity={stroke.opacity ?? 1} />;
    }
    const d = stroke.points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
    return <path key={stroke.id} d={d} fill={stroke.fill ?? "none"} stroke={stroke.color} strokeWidth={stroke.width} opacity={stroke.opacity ?? 1} strokeLinecap="round" strokeLinejoin="round" />;
  };
  if (Boolean(iddsProfile)) {
    const integratedProfile = iddsProfile as DroneCatalogDesign;
    const openCatalog = () => onOpenLibrary
      ? onOpenLibrary()
      : document.getElementById("studio-command-deck")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return <div className="view-stack design-studio-view is-integrated-mechanical">
      <StudioCommandDeck
        config={config}
        setConfig={setConfig}
        activeProfile={integratedProfile}
        onSelectProfile={design => onSelectProfile?.(design)}
        partsCount={parts.length}
        totalMassKg={totalMass}
        activeSection={activeStudioSection}
        onNavigate={navigateStudioSection}
        onExportStudio={exportStudio}
        onExportBom={exportBom}
        onExportOpenScad={exportOpenScad}
        onExportEngineeringJson={exportEngineeringJson}
      />
      <section id="studio-physical-design" className="idds-integrated-render-panel" aria-label="Modes de rendu du maillage mécanique IDDS">
        <header><div><span>ASSEMBLAGE NUMÉRIQUE · JUMEAU MÉCANIQUE</span><strong>{integratedProfile.label} · maillage paramétrique éditable</strong></div><small>Une seule géométrie pilote les rendus, les calques et l’inspecteur.</small></header>
        <nav className="idds-render-modes" role="toolbar" aria-label="Modes de rendu synchronisés du Studio IDDS">
          {renderModes.map(mode => <button key={mode.id} type="button" className={renderMode === mode.id ? "is-active" : ""} aria-pressed={renderMode === mode.id} title={mode.label} onClick={() => { setRenderMode(mode.id); if (mode.id !== "kinematics") setKinematicsPlaying(false); }}><span>{mode.label}</span></button>)}
        </nav>
        <div className="idds-render-controls" aria-live="polite">
          {renderMode === "simulation" && <>
            <div className="idds-render-control-heading"><strong>Simulation paramétrique en direct</strong><span>Ces cotes reconstruisent le même modèle 3D et restent liées à l’inspecteur mécanique.</span></div>
            <label>Envergure <output>{Number(config.wingspan || 0).toFixed(2)} m</output><input type="range" min="0.2" max="15" step="0.05" value={Math.max(.2, Math.min(15, Number(config.wingspan) || .2))} onChange={event => setConfig(current => ({ ...current, wingspan: Number(event.target.value) }))}/></label>
            <label>Longueur fuselage <output>{Number(config.fuselageLength || 0).toFixed(2)} m</output><input type="range" min="0.1" max="5" step="0.05" value={Math.max(.1, Math.min(5, Number(config.fuselageLength) || .1))} onChange={event => setConfig(current => ({ ...current, fuselageLength: Number(event.target.value) }))}/></label>
            <label>Motorisations <output>{Math.max(1, Math.round(Number(config.motorCount) || 1))}</output><input type="range" min="1" max="12" step="1" value={Math.max(1, Math.min(12, Math.round(Number(config.motorCount) || 1)))} onChange={event => setConfig(current => ({ ...current, motorCount: Number(event.target.value) }))}/></label>
            <span className="idds-sim-readout">Masse déclarée du modèle : {totalMass.toFixed(2)} kg · estimation indicative</span>
          </>}
          {renderMode === "kinematics" && <><div className="idds-render-control-heading"><strong>Cinématique des hélices du maillage</strong><span>La géométrie des hélices tourne autour de leur propre axe ; le reste du modèle reste sélectionnable.</span></div><button type="button" className="idds-render-action" aria-pressed={kinematicsPlaying} onClick={() => setKinematicsPlaying(value => !value)}>{kinematicsPlaying ? "Mettre en pause" : "Lancer le mouvement"}</button></>}
          {renderMode === "variants" && <><div className="idds-render-control-heading"><strong>Générateur de variantes paramétriques</strong><span>Les variantes modifient les paramètres du même maillage mécanique.</span></div><button type="button" className="idds-render-action" onClick={createParametricVariant}>Générer une variante</button><div className="idds-variant-list">{generatedVariants.map(variant => <button type="button" key={variant.name} onClick={() => applyParametricVariant(variant)}><strong>{variant.name}</strong><span>{variant.wingspan.toFixed(2)} m · {variant.fuselageLength.toFixed(2)} m · {variant.motorCount} moteurs</span></button>)}{!generatedVariants.length && <span>Aucune variante générée dans cette session.</span>}</div></>}
          {renderMode === "internals" && <><div className="idds-render-control-heading"><strong>Détails mécaniques internes</strong><span>Le mode X-ray intégré inspecte les calques réels du jumeau numérique.</span></div><span>Utilisez les commandes de coupe et d’opacité des calques dans l’éditeur.</span></>}
          {renderMode === "assembly" && <><div className="idds-render-control-heading"><strong>Assemblage mécanique complet</strong><span>Maillage généré depuis la cellule sélectionnée ; toutes les pièces et leurs calques sont éditables.</span></div><span>{parts.length} éléments de nomenclature · {totalMass.toFixed(2)} kg déclarés</span></>}
        </div>
      </section>
      <div id="studio-assembly-workbench" className="studio-subsystem-anchor">
        <IDDSTwinAssemblyEditor
          design={integratedProfile}
          config={config}
          language={language}
          setConfig={setConfig}
          renderMode={renderMode}
          kinematicsPlaying={renderMode === "kinematics" && kinematicsPlaying}
          exploded={mechanicalExploded}
          onPresentation={presentation => setMechanicalExploded(presentation === "exploded")}
          onOpenCatalog={openCatalog}
        />
      </div>
      <div id="studio-sketch-workbench" className="studio-subsystem-anchor"><DroneSketchProWorkbench config={config} setConfig={setConfig} activeProfile={integratedProfile} parts={config.installedMaterials ?? []} context="studio" onUserIntegration={onUserIntegration} /></div>
      <div id="studio-cad-workbench" className="studio-subsystem-anchor"><EngineeringCadWorkbench config={config} setConfig={setConfig} activeProfile={integratedProfile} onOpenLibrary={onOpenLibrary} /></div>
      <div id="studio-electronics-workbench" className="studio-subsystem-anchor"><DroneBehaviorPanel configuration={config} context="studio" state="IDDS · CONCEPTION INTÉGRÉE" /></div>
    </div>;
  }
  return (
    <div className="view-stack design-studio-view">
      <StudioCommandDeck
        config={config}
        setConfig={setConfig}
        activeProfile={iddsProfile}
        onSelectProfile={design => onSelectProfile?.(design)}
        partsCount={parts.length}
        totalMassKg={totalMass}
        activeSection={activeStudioSection}
        onNavigate={navigateStudioSection}
        onExportStudio={exportStudio}
        onExportBom={exportBom}
        onExportOpenScad={exportOpenScad}
        onExportEngineeringJson={exportEngineeringJson}
      />
      <div id="studio-sketch-workbench" className="studio-subsystem-anchor">
        <DroneSketchProWorkbench config={config} setConfig={setConfig} activeProfile={iddsProfile} parts={config.installedMaterials ?? []} context="studio" onUserIntegration={onUserIntegration} />
      </div>
      <div id="studio-assembly-workbench" className="studio-subsystem-anchor">
        <VirtualAssemblyWorkshop config={config} setConfig={setConfig} activeProfile={iddsProfile} parts={config.installedMaterials ?? []} context="studio" />
      </div>
      <EngineeringCadWorkbench config={config} setConfig={setConfig} activeProfile={iddsProfile} onOpenLibrary={onOpenLibrary} />
      <div className="studio-header">
        <div>
          <p className="eyebrow">IDDS / POSTE D’INGÉNIERIE MULTIDISCIPLINAIRE</p>
          <h2>Integrated Drone Design Studio — IDDS</h2>
          <p className="section-description">
            Conception mécanique, physique, structurelle, schématique, chimique et mathématique liée à la référence sélectionnée ou au dessin utilisateur.
          </p>
        </div>
        <div className="studio-header-actions">
          <button
            className="secondary-button"
            onClick={() => fileRef.current?.click()}
          >
            <Box size={14} /> Importer document
          </button>
          <button className="secondary-button" onClick={exportBom}>
            <Download size={14} /> BOM CSV
          </button>
          <button className="primary-button" onClick={exportStudio}>
            <Download size={14} /> Export document
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={event => void importStudio(event.target.files?.[0])}
          />
        </div>
      </div>
      <section className="construction-command-panel" aria-label="Console de contrôle de construction">
        <div className="construction-command-heading">
          <div><p className="eyebrow">INDUSTRIAL BUILD AUTHORITY / READINESS</p><h3>Tableau de maîtrise de la configuration</h3><span>La décision reste humaine · aucune pièce n’est certifiée automatiquement</span></div>
          <div className={`construction-command-state ${hasStudioSource ? "is-live" : "is-waiting"}`}><i />{hasStudioSource ? "IDDS · SOURCE ACTIVE" : "EN ATTENTE D’UNE SOURCE"}</div>
        </div>
        <div className="construction-command-kpis">
          <div><small>RÉFÉRENCE CELLULE</small><strong>{iddsProfile?.id ?? (iddsUsesSketch ? "DESSIN" : "—")}</strong><span>{iddsProfile?.family ?? (iddsUsesSketch ? "Géométrie utilisateur" : "Sélection requise")}</span></div>
          <div><small>NOMENCLATURE</small><strong>{String(parts.length).padStart(2, "0")}</strong><span>{totalMass.toFixed(2)} kg déclarés</span></div>
          <div><small>SOURCES FABRICANT</small><strong>{parts.filter(part => part.catalogSource === "manufacturer").length}/{parts.length || 0}</strong><span>références vérifiables</span></div>
          <div><small>ÉTAT DE REVUE</small><strong>{parts.length && hasStudioSource ? "REVIEW" : "LOCKED"}</strong><span>validation humaine requise</span></div>
        </div>
        <div className="construction-control-rail"><span><b>01</b> CELLULE</span><i /><span><b>02</b> PIÈCES</span><i /><span><b>03</b> INTERFACES</span><i /><span><b>04</b> PREUVES</span><i /><span><b>05</b> REVUE</span></div>
      </section>
      <div className="studio-engineering-reference">
        <div className="studio-reference-glyph" aria-hidden="true">
          <span />
          <i />
          <b />
        </div>
        <div>
          <p className="eyebrow">RÉFÉRENCE D’INGÉNIERIE INTERNE</p>
          <strong>
            {iddsProfile?.label ?? (iddsUsesSketch ? config.engineeringSelection?.droneLabel ?? config.designName ?? "Dessin utilisateur" : "Aucune source active")} · workspace IDDS synchronisé
          </strong>
          <small>
            La même source active alimente le dessin, le CAO, les paramètres et la nomenclature.
          </small>
        </div>
        <div className="studio-reference-specs">
          <span>
            {iddsProfile?.family ??
              (iddsUsesSketch ? "DESSIN UTILISATEUR" : hasStudioSource ? config.modelType?.toUpperCase() ?? "NON CONFIGURÉ" : "NON CONFIGURÉ")}
          </span>
          <span>{hasStudioSource && (config.motorCount ?? 0) > 0 ? `${config.motorCount} moteur(s)` : "Moteurs · —"}</span>
          <span>{hasStudioSource && config.wingspan > 0 ? `${config.wingspan.toFixed(2)} m d’envergure` : "Envergure · —"}</span>
        </div>
      </div>
      <PayloadMissionWorkbench
        installed={partsToMaterials(parts.filter(part => part.kind === "payload"))}
        profiles={config.payloadCalibrationProfiles}
        onProfileChange={(id, profile) => setConfig(current => ({
          ...current,
          payloadCalibrationProfiles: { ...(current.payloadCalibrationProfiles ?? {}), [id]: profile },
        }))}
        onInstall={id => {
          const item = dronePartCatalog.find(part => part.id === id);
          if (item) addCatalogPart(item);
        }}
      />
      <section className="studio-guide-console idds-console" aria-label="Integrated Drone Design Studio — IDDS">
        <header className="idds-header">
          <div><span className="idds-eyebrow"><Layers3 size={14} /> INTEGRATED DRONE DESIGN STUDIO — IDDS</span><h2>Studio intégré de conception mécanique, architecturale et paramétrique de drones</h2><p>Un espace de travail synchronisé avec le drone choisi dans la bibliothèque ou le dessin réalisé par l’utilisateur.</p></div>
          <span className={`idds-source-badge ${iddsProfile || iddsUsesSketch ? "is-active" : "is-empty"}`}>{iddsProfile ? "SOURCE · BIBLIOTHÈQUE" : iddsUsesSketch ? "SOURCE · DESSIN UTILISATEUR" : "EN ATTENTE DE SOURCE"}</span>
        </header>
        <div className="idds-workspace">
          <div className="idds-preview-frame">
            {hasStudioSource ? <IDDSParametricScene parts={visibleParts} selectedId={selectedId} onSelectPart={setSelectedId} strokes={iddsUsesSketch ? iddsSketch : []} view="top" zoom={zoom} design={iddsProfile} config={config} renderMode={renderMode} kinematicsPlaying={kinematicsPlaying} /> : <div className="idds-empty-preview"><Crosshair size={29}/><strong>AUCUN MODÈLE AFFICHÉ</strong><span>Le visuel apparaîtra après une sélection catalogue ou un dessin utilisateur.</span></div>}
            {(iddsProfile || iddsUsesSketch) && <span className="idds-preview-label">{iddsSourceLabel} · APERÇU CONCEPTUEL</span>}
          </div>
          <aside className="idds-source-panel"><div className="idds-source-title"><span className="idds-status-dot"/><div><small>DOCUMENT / SOURCE ACTIVE</small><strong>{iddsSourceLabel}</strong></div></div>
            {iddsProfile || iddsUsesSketch ? <div className="idds-metrics"><span>ENVERGURE<strong>{config.wingspan > 0 ? `${config.wingspan.toFixed(2)} m` : "—"}</strong></span><span>MOTEURS<strong>{config.motorCount && config.motorCount > 0 ? config.motorCount : "—"}</strong></span><span>OBJETS<strong>{iddsUsesSketch ? iddsSketch.length : parts.length}</strong></span></div> : <p className="idds-source-hint">Aucune architecture ni cote n’est préchargée. Choisissez une source pour commencer.</p>}
            <div className="idds-actions"><button type="button" onClick={() => onOpenLibrary ? onOpenLibrary() : document.getElementById("studio-command-deck")?.scrollIntoView({ behavior: "smooth" })}><Boxes size={14}/> Bibliothèque de drones</button><button type="button" onClick={() => document.getElementById("studio-sketch-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" })}><PenLine size={14}/> Interface Dessin</button></div>
            <small className="idds-safety-note"><Wrench size={12}/> Données de conception préliminaires · validation humaine requise</small>
          </aside>
        </div>
        <nav className="idds-module-rail" aria-label="Modules de conception IDDS"><span>MODULES IDDS</span><button type="button" onClick={() => document.getElementById("studio-sketch-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" })}><PenLine size={13}/> MÉCANIQUE / DESSIN</button><button type="button" onClick={() => document.getElementById("studio-cad-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" })}><Box size={13}/> ARCHITECTURE / CAO</button><button type="button" onClick={() => document.getElementById("studio-assembly-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" })}><Settings2 size={13}/> PARAMÉTRIQUE / ASSEMBLAGE</button><small>Le contenu reflète la source active du projet ; aucune maquette automatique.</small></nav>
      </section>
      <div className="studio-toolbar">
        <div className="studio-tool-group">
          {tools.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`studio-tool ${tool === item.id ? "is-active" : ""}`}
                onClick={() => setTool(item.id)}
              >
                <Icon size={15} />
                {item.label}
              </button>
            );
          })}
          <button
            className={`studio-tool ${snap ? "is-active" : ""}`}
            onClick={() => setSnap(value => !value)}
          >
            <Grid3X3 size={15} /> Grille {snap ? "ON" : "OFF"}
          </button>
        </div>
        <div className="studio-tool-group">
          <button className="studio-tool" onClick={harmonizeAssembly}>
            <Check size={15} /> Harmoniser
          </button>
          <button className="studio-tool" onClick={centerSelected}>
            <AlignCenterHorizontal size={15} /> Centrer
          </button>
          <button className="studio-tool" onClick={fitAssembly}>
            <ScanSearch size={15} /> Ajuster vue
          </button>
          <button className="studio-tool" onClick={toggleAllParts}>
            <Eye size={15} /> Tout afficher
          </button>
          <button className="studio-tool" onClick={assemblyReview}>
            <Box size={15} /> Auditer construction
          </button>
          <button className="studio-tool studio-tool-capture" onClick={captureIddsConstruction} title="Capturer la construction IDDS pour le rapport">
            <Camera size={15} /> Capturer IDDS
          </button>
          <button className="studio-tool studio-tool-capture" onClick={captureDroneSketch} title="Capturer le croquis de drone pour le rapport">
            <Pencil size={15} /> Capturer croquis
          </button>
          <button
            className="studio-tool"
            onClick={undo}
            disabled={!past.length}
          >
            <Undo2 size={15} /> Annuler
          </button>
          <button
            className="studio-tool"
            onClick={redo}
            disabled={!future.length}
          >
            <Redo2 size={15} /> Rétablir
          </button>
          <button className="studio-tool" onClick={duplicateSelected}>
            <Copy size={15} /> Dupliquer
          </button>
          <button className="studio-tool" onClick={deleteSelected}>
            <Trash2 size={15} /> Supprimer
          </button>
          <button
            className="studio-tool"
            onClick={() => setZoom(value => Math.max(0.5, value - 0.1))}
            aria-label="Réduire le modèle"
          >
            <ZoomOut size={15} />
          </button>
          <span className="studio-readout">{Math.round(zoom * 100)}%</span>
          <input
            className="studio-zoom-slider"
            type="range"
            min="0.5"
            max="2.5"
            step="0.05"
            value={zoom}
            onChange={event => setZoom(Number(event.target.value))}
            aria-label="Agrandissement du modèle dans le panneau de construction"
          />
          <button
            className="studio-tool"
            onClick={() => setZoom(value => Math.min(2.5, value + 0.1))}
            aria-label="Agrandir le modèle"
          >
            <ZoomIn size={15} />
          </button>
        </div>
      </div>
      <div className="studio-subtoolbar" aria-label="Integrated Drone Design Studio — IDDS">
        <div className="idds-workbench-title"><small>INTEGRATED DRONE DESIGN STUDIO — IDDS</small><strong>Studio intégré de conception mécanique, architecturale et paramétrique de drones</strong></div>
        <div className="idds-render-modes" role="toolbar" aria-label="Modes de rendu synchronisés du Studio IDDS">
          {renderModes.map(mode => <button key={mode.id} type="button" className={renderMode === mode.id ? "is-active" : ""} aria-pressed={renderMode === mode.id} title={mode.label} onClick={() => { setRenderMode(mode.id); if (mode.id !== "kinematics") setKinematicsPlaying(false); }}><span>{mode.label}</span></button>)}
        </div>
        <label>
          Pas grille{" "}
          <select
            value={gridSize}
            onChange={event => setGridSize(Number(event.target.value))}
          >
            <option value={2.5}>2,5%</option>
            <option value={5}>5%</option>
            <option value={10}>10%</option>
          </select>
        </label>
        <span className="studio-status">
          <Check size={13} /> {past.length} versions · {parts.length} éléments
          choisis · {totalMass.toFixed(2)} kg estimés
        </span>
      </div>
      <div className="studio-workspace studio-workspace-advanced" id="studio-cad-workbench">
        <aside className="studio-layer-panel panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">DOCUMENT DE CONSTRUCTION</p>
              <h3>Calques &amp; pièces</h3>
            </div>
            <button
              type="button"
              className="studio-layer-add-button"
              onClick={() => setAddingLayer(value => !value)}
              aria-label="Créer un calque personnalisé"
              title="Créer un calque personnalisé"
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="studio-layer-stack">
            {documentLayers.length ? documentLayers.map((label, index) => {
              const visible = layerVisibility[label] !== false;
              const locked = layerLocks[label] === true;
              return (
                <div
                  key={label}
                  className={`studio-layer-item ${activeLayer === label ? "is-active" : ""}`}
                  draggable
                  onDragStart={() => setDraggedLayer(label)}
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => { event.preventDefault(); const from = documentLayers.indexOf(draggedLayer ?? ""); if (from >= 0 && from !== index) moveCustomLayer(from, index); setDraggedLayer(null); }}
                  onDragEnd={() => setDraggedLayer(null)}
                >
                  <button
                    type="button"
                    className="studio-layer-row"
                    onClick={() => activateLayer(label)}
                    aria-pressed={activeLayer === label}
                    title={`Rendre actif le calque ${label}`}
                  >
                    <span className="studio-layer-icon">
                      <Layers3 size={13} />
                    </span>
                    <span className="studio-layer-name">
                      <strong>{label}</strong>
                      <small>
                        {parts.filter(part => part.layer === label).length}{" "}
                        objets
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="studio-layer-quick-button"
                    aria-label={`${visible ? "Masquer" : "Afficher"} ${label}`}
                    title={`${visible ? "Masquer" : "Afficher"} ${label}`}
                    onClick={() => updateLayerVisibility(label, !visible)}
                  >
                    {visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button
                    type="button"
                    className={`studio-layer-quick-button ${locked ? "is-locked" : ""}`}
                    aria-label={`${locked ? "Déverrouiller" : "Verrouiller"} ${label}`}
                    title={`${locked ? "Déverrouiller" : "Verrouiller"} ${label}`}
                    onClick={() => updateLayerLock(label, !locked)}
                  >
                    <Lock size={13} />
                  </button>
                  <button type="button" className="studio-layer-quick-button" title="Renommer le calque" aria-label={`Renommer ${label}`} onClick={() => { setRenamingLayer(label); setRenamedLayerDraft(label); }}><Pencil size={12}/></button>
                  <button type="button" className="studio-layer-quick-button" title="Monter dans la pile" aria-label={`Monter ${label}`} disabled={index === 0} onClick={() => moveCustomLayer(index, index - 1)}><ArrowUp size={12}/></button>
                  <button type="button" className="studio-layer-quick-button" title="Descendre dans la pile" aria-label={`Descendre ${label}`} disabled={index === documentLayers.length - 1} onClick={() => moveCustomLayer(index, index + 1)}><ArrowDown size={12}/></button>
                  <button type="button" className="studio-layer-quick-button is-layer-delete" title="Supprimer sans supprimer les pièces ou traits" aria-label={`Supprimer le calque ${label}`} onClick={() => deleteCustomLayer(label)}><Trash2 size={12}/></button>
                </div>
              );
            }) : <div className="studio-layer-empty"><Layers3 size={17}/><strong>Aucun calque créé</strong><span>Les calques ne sont jamais ajoutés automatiquement. Créez un calque pour organiser vos pièces.</span><button type="button" onClick={() => setAddingLayer(true)}><Plus size={12}/> Créer le premier calque</button></div>}
          </div>
          {addingLayer && (
            <form
              className="studio-layer-create"
              onSubmit={event => {
                event.preventDefault();
                createCustomLayer();
              }}
            >
              <input
                autoFocus
                value={layerNameDraft}
                onChange={event => setLayerNameDraft(event.target.value)}
                placeholder="Ex. Câblage, composites…"
                aria-label="Nom du nouveau calque"
              />
              <button type="submit" disabled={!layerNameDraft.trim()}>
                <Plus size={13} /> Ajouter
              </button>
            </form>
          )}
          {renamingLayer && <form className="studio-layer-rename-form" onSubmit={event => { event.preventDefault(); renameCustomLayer(renamingLayer); }}><label>RENOMMER « {renamingLayer} »</label><input autoFocus value={renamedLayerDraft} onChange={event => setRenamedLayerDraft(event.target.value)}/><button type="submit" disabled={!renamedLayerDraft.trim()}><Check size={12}/> Valider</button><button type="button" onClick={() => { setRenamingLayer(""); setRenamedLayerDraft(""); }}>Annuler</button></form>}
          <div className="studio-layer-note">
            Calque actif : <strong>{activeLayer || "aucun"}</strong>
            <br />
            {!activeLayer
              ? "Créez puis sélectionnez un calque pour ajouter et déplacer des pièces."
              : layerLocks[activeLayer]
              ? "Verrouillé · déverrouillez-le pour ajouter ou déplacer une pièce."
              : "Les pièces masquées restent incluses dans la nomenclature."}
          </div>
          <section className="studio-construction-palette">
            <div className="studio-palette-header">
              <p className="eyebrow">OUTILS DE CONSTRUCTION</p>
              <span>MANUEL</span>
            </div>
            <p>
              Créer une géométrie de travail dans le calque actif, puis la
              déplacer et l’ajuster.
            </p>
            <div className="studio-manual-part-grid">
              {manualPartTemplates.map(template => (
                <button
                  key={template.kind}
                  type="button"
                  disabled={!activeLayer || Boolean(layerLocks[activeLayer])}
                  onClick={() => addManualPart(template)}
                  title={`Ajouter ${template.label} au calque ${activeLayer}`}
                >
                  <Plus size={12} />
                  <span>{template.label}</span>
                </button>
              ))}
            </div>
            <small>
              Géométries utilisateur · masses initiales indicatives · à
              qualifier avant fabrication.
            </small>
          </section>
          <section className="studio-montage-tools" aria-label="Outils de montage et d’alignement">
            <div className="studio-palette-header"><p className="eyebrow">MONTAGE / ALIGNEMENT</p><span>{parts.length} PIÈCES</span></div>
            <div className="studio-montage-grid">
              <button type="button" onClick={centerSelected} disabled={!selected}><AlignCenterHorizontal size={13}/> Centrer la pièce</button>
              <button type="button" onClick={duplicateSelected} disabled={!selected}><Copy size={13}/> Dupliquer</button>
              <button type="button" onClick={harmonizeAssembly} disabled={!parts.length}><Check size={13}/> Harmoniser l’ensemble</button>
              <button type="button" onClick={assemblyReview} disabled={!parts.length} title="Contrôle local des affectations, masses, déclarations d’interfaces et sources"><ShieldCheck size={13}/> Auditer la construction</button>
            </div>
            <small>Les actions modifient le document actif; annulation disponible dans la barre d’outils.</small>
          </section>
        </aside>
        <section className="panel studio-canvas-panel" aria-label="IDDS · espace de conception actif">
          {!hasStudioSource ? (
            <div className="studio-unselected-state" role="status"><Box size={30} /><strong>Aucune source chargée dans l’IDDS</strong><span>Sélectionnez une référence de la bibliothèque ou réalisez un dessin utilisateur. Aucun modèle ni aucune cote ne sont générés par défaut.</span><em>USER ACTION REQUIRED · NO MODEL LOADED</em></div>
          ) : (
            <>
            <div className="idds-render-controls" aria-live="polite">
              {renderMode === "simulation" && <>
                <div className="idds-render-control-heading"><strong>Simulation paramétrique en direct</strong><span>Les paramètres ci-dessous modifient le drone actif et ses vues synchronisées.</span></div>
                <label>Envergure <output>{Number(config.wingspan || 0).toFixed(2)} m</output><input type="range" min="0.2" max="15" step="0.05" value={Math.max(.2, Math.min(15, Number(config.wingspan) || .2))} onChange={event => setConfig(current => ({ ...current, wingspan: Number(event.target.value) }))}/></label>
                <label>Longueur fuselage <output>{Number(config.fuselageLength || 0).toFixed(2)} m</output><input type="range" min="0.1" max="5" step="0.05" value={Math.max(.1, Math.min(5, Number(config.fuselageLength) || .1))} onChange={event => setConfig(current => ({ ...current, fuselageLength: Number(event.target.value) }))}/></label>
                <label>Motorisations <output>{Math.max(1, Math.round(Number(config.motorCount) || 1))}</output><input type="range" min="1" max="12" step="1" value={Math.max(1, Math.min(12, Math.round(Number(config.motorCount) || 1)))} onChange={event => setConfig(current => ({ ...current, motorCount: Number(event.target.value) }))}/></label>
                <span className="idds-sim-readout">Masse déclarée du modèle : {totalMass.toFixed(2)} kg · estimation indicative</span>
              </>}
              {renderMode === "kinematics" && <><div className="idds-render-control-heading"><strong>Animation cinématique</strong><span>Lecture visuelle des rotations ; aucune action sur le matériel.</span></div><button type="button" className="idds-render-action" aria-pressed={kinematicsPlaying} onClick={() => setKinematicsPlaying(value => !value)}>{kinematicsPlaying ? "Mettre en pause" : "Lancer le mouvement"}</button><span>{visibleParts.filter(part => part.kind === "motor").length} groupe(s) moteur visible(s) · sélection et édition conservées</span></>}
              {renderMode === "variants" && <><div className="idds-render-control-heading"><strong>Générateur de variantes paramétriques</strong><span>Chaque variante est appliquée au même document et reste modifiable dans l’inspecteur.</span></div><button type="button" className="idds-render-action" onClick={createParametricVariant}>Générer une variante</button><div className="idds-variant-list">{generatedVariants.map(variant => <button type="button" key={variant.name} onClick={() => applyParametricVariant(variant)}><strong>{variant.name}</strong><span>{variant.wingspan.toFixed(2)} m · {variant.fuselageLength.toFixed(2)} m · {variant.motorCount} moteurs</span></button>)}{!generatedVariants.length && <span>Aucune variante générée dans cette session.</span>}</div></>}
              {renderMode === "internals" && <><div className="idds-render-control-heading"><strong>Détails mécaniques internes</strong><span>Coupe conceptuelle et repères issus des pièces visibles du document.</span></div><span>{visibleParts.length} éléments repérés · cliquez une pièce dans la vue pour ouvrir son inspecteur.</span></>}
              {renderMode === "assembly" && <><div className="idds-render-control-heading"><strong>Assemblage mécanique complet</strong><span>Vue synchronisée du modèle actif ; sélectionnez, déplacez et modifiez ses composants.</span></div><span>{visibleParts.length} pièces visibles · {totalMass.toFixed(2)} kg déclarés</span></>}
            </div>
            <div className="studio-physical-stage">
              <div className="studio-physical-stage-hud"><span>{iddsProfile ? "IDDS · MODÈLE PARAMÉTRIQUE / ARCHITECTURE" : "IDDS · GÉOMÉTRIE UTILISATEUR"}</span><small>{visibleParts.length} pièces visibles · masse estimée {totalMass.toFixed(2)} kg · faites glisser une pièce pour la déplacer</small></div>
              <IDDSParametricScene parts={visibleParts} selectedId={selectedId} onSelectPart={setSelectedId} strokes={iddsUsesSketch ? iddsSketch : []} view="top" zoom={zoom} design={iddsProfile} config={config} renderMode={renderMode} kinematicsPlaying={kinematicsPlaying} svgRef={stageRef} editable onStagePointerDown={onStagePointerDown} onStagePointerMove={onStagePointerMove} onStagePointerUp={onStagePointerUp} onPartPointerDown={onPartPointerDown} />
              <div className="studio-3d-selection-list" aria-label="Sélectionner une pièce pour la configurer">
                {visibleParts.map(part => <button key={part.id} className={selectedId === part.id ? "is-active" : ""} onClick={() => setSelectedId(part.id)}><span>{part.label}</span><small>{part.massKg.toFixed(2)} kg · {part.connectedTo ?? defaultBus(part.kind)}</small></button>)}
                {!visibleParts.length && <small>Ajoutez une pièce depuis les outils de conception pour commencer la construction.</small>}
              </div>
            </div>
            </>
          )}
          <DroneBehaviorPanel configuration={config} context="studio" state="IDDS · CONCEPTION INTÉGRÉE" />
          <div className="studio-canvas-footer">
            <span>
              Mode : <strong>{renderModes.find(mode => mode.id === renderMode)?.label}</strong>
            </span>
            <span>
              Objet : <strong>{selected?.label ?? "aucun"}</strong>
            </span>
            <span>
              Raccourcis : G grille · R rotation · Del supprimer · Ctrl+Z
              annuler
            </span>
          </div>
        </section>
        <aside className="studio-inspector panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">INSPECTEUR PARAMÉTRIQUE</p>
              <h3>{selected?.label ?? "Aucune sélection"}</h3>
            </div>
            <Settings2 size={16} />
          </div>
          {selected && (
            <>
              <div className="studio-inspector-actions">
                <button
                  onClick={() =>
                    changeSelected(
                      { locked: !selected.locked },
                      selected.locked
                        ? "Pièce déverrouillée"
                        : "Pièce verrouillée"
                    )
                  }
                >
                  {selected.locked ? <Lock size={14} /> : <Lock size={14} />}{" "}
                  {selected.locked ? "Déverrouiller" : "Verrouiller"}
                </button>
                <button
                  onClick={() =>
                    changeSelected(
                      { visible: !selected.visible },
                      selected.visible ? "Pièce masquée" : "Pièce affichée"
                    )
                  }
                >
                  {selected.visible ? <EyeOff size={14} /> : <Eye size={14} />}{" "}
                  {selected.visible ? "Masquer" : "Afficher"}
                </button>
              </div>
              <label className="studio-field">
                Nom
                <input
                  value={selected.label}
                  onChange={event =>
                    changeSelected({ label: event.target.value }, "Nom modifié")
                  }
                />
              </label>
              <label className="studio-field">
                Calque de construction
                <select
                  value={selected.layer ?? ""}
                  onChange={event => {
                    const nextLayer = event.target.value;
                    if (layerLocks[nextLayer]) {
                      announce(
                        `Déplacement refusé · le calque ${nextLayer} est verrouillé`
                      );
                      return;
                    }
                    changeSelected(
                      { layer: nextLayer },
                      `Calque affecté · ${nextLayer}`
                    );
                  }}
                >
                  <option value="">Sans calque / non affecté</option>
                  {documentLayers.map(label => (
                    <option
                      key={label}
                      value={label}
                      disabled={layerLocks[label]}
                    >
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="studio-property-grid">
                <label>
                  X %
                  <input
                    type="number"
                    value={selected.x.toFixed(1)}
                    onChange={event =>
                      changeSelected(
                        { x: clamp(Number(event.target.value), 0, 100) },
                        "Position X modifiée"
                      )
                    }
                  />
                </label>
                <label>
                  Y %
                  <input
                    type="number"
                    value={selected.y.toFixed(1)}
                    onChange={event =>
                      changeSelected(
                        { y: clamp(Number(event.target.value), 0, 100) },
                        "Position Y modifiée"
                      )
                    }
                  />
                </label>
                <label>
                  Largeur visuelle · u.d.
                  <input
                    type="number"
                    min="12"
                    max="520"
                    step="4"
                    value={Math.round(selected.width)}
                    onChange={event =>
                      changeSelected(
                        { width: clamp(Number(event.target.value), 12, 520) },
                        "Largeur graphique modifiée"
                      )
                    }
                  />
                </label>
                <label>
                  Hauteur visuelle · u.d.
                  <input
                    type="number"
                    min="12"
                    max="260"
                    step="4"
                    value={Math.round(selected.height)}
                    onChange={event =>
                      changeSelected(
                        { height: clamp(Number(event.target.value), 12, 260) },
                        "Hauteur graphique modifiée"
                      )
                    }
                  />
                </label>
                <label>
                  Échelle
                  <input
                    type="number"
                    min=".5"
                    max="2"
                    step=".05"
                    value={selected.scale}
                    onChange={event =>
                      changeSelected(
                        { scale: clamp(Number(event.target.value), 0.5, 2) },
                        "Échelle modifiée"
                      )
                    }
                  />
                </label>
                <label>
                  Rotation°
                  <input
                    type="number"
                    value={selected.rotation}
                    onChange={event =>
                      changeSelected(
                        { rotation: Number(event.target.value) },
                        "Rotation modifiée"
                      )
                    }
                  />
                </label>
                <label>
                  Masse kg
                  <input
                    type="number"
                    min="0"
                    step=".01"
                    value={selected.massKg}
                    onChange={event =>
                      changeSelected(
                        { massKg: Math.max(0, Number(event.target.value)) },
                        "Masse modifiée"
                      )
                    }
                  />
                </label>
                <label>
                  Contrainte
                  <select
                    value={selected.constraint}
                    onChange={event =>
                      changeSelected(
                        { constraint: event.target.value as Constraint },
                        "Contrainte modifiée"
                      )
                    }
                  >
                    <option value="free">Libre</option>
                    <option value="center-x">Centré X</option>
                    <option value="center-y">Centré Y</option>
                    <option value="symmetric">Symétrique</option>
                  </select>
                </label>
              </div>
              <section className="studio-parametric-controls" aria-label="Réglages continus de la pièce sélectionnée">
                <div className="studio-parametric-controls-head"><span>TRANSFORMATIONS / TEMPS RÉEL</span><small>U.D. · CONCEPTUEL</small></div>
                <label>Rotation <output>{selected.rotation}°</output><input type="range" min="-180" max="180" step="1" value={((selected.rotation + 540) % 360) - 180} disabled={selected.locked} onChange={event => changeSelected({ rotation: Number(event.target.value) }, "Rotation paramétrique mise à jour")} /></label>
                <label>Échelle <output>{selected.scale.toFixed(2)}×</output><input type="range" min=".5" max="2" step=".01" value={selected.scale} disabled={selected.locked} onChange={event => changeSelected({ scale: Number(event.target.value) }, "Échelle paramétrique mise à jour")} /></label>
                <label>Masse de maquette <output>{selected.massKg.toFixed(2)} kg</output><input type="range" min="0" max={Math.min(1000, Math.max(2, Math.ceil(selected.massKg * 1.5 * 100) / 100))} step=".01" value={selected.massKg} disabled={selected.locked} onChange={event => changeSelected({ massKg: Number(event.target.value) }, "Masse de maquette mise à jour")} /></label>
              </section>
              <label className="studio-field">
                Aire de traînée équivalente estimée · m²
                <input type="number" min="0" step="0.001" value={selected.dragAreaM2 ?? estimatedDragArea(selected.kind)} onChange={event => changeSelected({ dragAreaM2: Math.max(0, Number(event.target.value)) }, "Aire de traînée mise à jour · estimation locale")} />
              </label>
              <label className="studio-field">
                Puissance auxiliaire estimée · W
                <input type="number" min="0" step="0.5" value={selected.powerDrawW ?? estimatedAuxPower(selected.kind)} onChange={event => changeSelected({ powerDrawW: Math.max(0, Number(event.target.value)) }, "Consommation auxiliaire mise à jour · estimation locale")} />
              </label>
              <label className="studio-field">
                Bus logique simulé
                <select value={selected.connectedTo ?? defaultBus(selected.kind)} onChange={event => changeSelected({ connectedTo: event.target.value }, "Connexion logique simulée mise à jour")}>
                  <option value="FRAME">FRAME · structure</option>
                  <option value="BUS-POWER">BUS-POWER · alimentation</option>
                  <option value="BUS-DATA">BUS-DATA · avionique</option>
                  <option value="BUS-PAYLOAD">BUS-PAYLOAD · équipement</option>
                  <option value="ISOLATED">ISOLÉ · non connecté</option>
                </select>
              </label>
              <div className="idds-discipline-switcher" role="tablist" aria-label="Domaines d’ingénierie IDDS">
                {engineeringDisciplineItems.map(item => <button key={item.id} type="button" role="tab" aria-selected={engineeringDiscipline === item.id} className={engineeringDiscipline === item.id ? "is-active" : ""} onClick={() => setEngineeringDiscipline(item.id)}>{item.label}</button>)}
              </div>
              <section className="idds-discipline-panel" aria-label={`Paramètres ${engineeringDisciplineItems.find(item => item.id === engineeringDiscipline)?.label}`}>
                <div className="idds-discipline-heading"><strong>{engineeringDisciplineItems.find(item => item.id === engineeringDiscipline)?.label} / PARAMÈTRES</strong><small>PIÈCE · {selected.label}</small></div>
                {engineeringDiscipline === "mechanical" && <p>Géométrie, position, rotation et échelle se règlent dans les champs de cette pièce ci-dessus ou par déplacement dans le plan. Les unités de dessin restent des unités de représentation.</p>}
                {engineeringDiscipline === "physical" && <div className="idds-discipline-fields"><label>Masse estimée · kg<input type="number" min="0" step=".01" value={selected.massKg} onChange={event => changeSelected({ massKg: Math.max(0, Number(event.target.value)) }, "Masse physique mise à jour")} /></label><label>Traînée équivalente · m²<input type="number" min="0" step=".001" value={selected.dragAreaM2 ?? estimatedDragArea(selected.kind)} onChange={event => changeSelected({ dragAreaM2: Math.max(0, Number(event.target.value)) }, "Paramètre physique mis à jour")} /></label></div>}
                {engineeringDiscipline === "structural" && <div className="idds-discipline-fields"><label>Dimension / section de référence<input value={selected.dimensions ?? ""} placeholder="À renseigner · ex. 120 × 40 × 2 mm" onChange={event => changeSelected({ dimensions: event.target.value }, "Dimension structurelle mise à jour")} /></label><p>Calque et contraintes structurelles se règlent dans les contrôles de pièce ci-dessus.</p></div>}
                {engineeringDiscipline === "schematic" && <div className="idds-discipline-fields"><label>Interfaces / connexions<input value={selected.interfaces ?? ""} placeholder="À renseigner · connecteurs, fixation…" onChange={event => changeSelected({ interfaces: event.target.value }, "Interface schématique mise à jour")} /></label><p>Le bus logique sélectionné plus haut est une représentation de conception, pas un câblage réel.</p></div>}
                {engineeringDiscipline === "chemical" && <div className="idds-discipline-fields"><label>Famille matière<input value={selected.materialFamily ?? ""} placeholder="Ex. composite carbone/époxy" onChange={event => changeSelected({ materialFamily: event.target.value }, "Famille matière mise à jour")} /></label><label>Composition / formulation<textarea value={selected.chemicalComposition ?? ""} placeholder="Saisir composition, nuance ou référence matière" onChange={event => changeSelected({ chemicalComposition: event.target.value }, "Composition matière mise à jour")} /></label><label>Densité · kg/m³<input type="number" min="0" step="1" value={selected.densityKgM3 ?? ""} onChange={event => { const density = Math.max(0, Number(event.target.value)); const volume = selected.volumeM3 ?? (selected.densityKgM3 ? selected.massKg / selected.densityKgM3 : 0); changeSelected({ densityKgM3: density, volumeM3: volume || undefined, massKg: volume > 0 ? density * volume : selected.massKg }, "Densité matière mise à jour"); }} /></label><label>Module d’Young indicatif · GPa<input type="number" min="0" step=".1" value={selected.youngModulusGPa ?? ""} onChange={event => changeSelected({ youngModulusGPa: Math.max(0, Number(event.target.value)) }, "Module matériau mis à jour")} /></label><small>Composition, densité et propriétés à vérifier selon la fiche matière et le procédé réel.</small></div>}
                {engineeringDiscipline === "mathematical" && <div className="idds-discipline-fields"><label>Équation / modèle<input value={selected.modelEquation ?? "m = ρ × V"} onChange={event => changeSelected({ modelEquation: event.target.value }, "Modèle mathématique mis à jour")} /></label><label>Volume matière · m³<input type="number" min="0" step=".000001" value={selected.volumeM3 ?? (selected.densityKgM3 ? selected.massKg / selected.densityKgM3 : 0)} onChange={event => { const volume = Math.max(0, Number(event.target.value)); changeSelected({ volumeM3: volume, massKg: selected.densityKgM3 ? volume * selected.densityKgM3 : selected.massKg }, "Volume et masse recalculés selon le modèle"); }} /></label><div className="idds-calculation-result"><span>m = ρ × V</span><strong>{selected.densityKgM3 && selected.volumeM3 ? `${(selected.densityKgM3 * selected.volumeM3).toFixed(3)} kg calculés` : "Renseignez densité et volume"}</strong></div><small>Calcul scalaire indicatif, sans solveur FEM/CFD ni validation expérimentale.</small></div>}
              </section>
              <div
                className={`studio-part-provenance ${selected.catalogSource === "manufacturer" ? "is-catalog" : selected.catalogSource === "user" ? "is-user" : "is-concept"}`}
              >
                {selected.catalogSource === "manufacturer"
                  ? "RÉFÉRENCE FABRICANT · métadonnées produit distinctes de l’échelle graphique."
                  : selected.catalogSource === "user"
                    ? "GÉOMÉTRIE UTILISATEUR · dessin et masse à qualifier, non validés fabrication."
                    : "CONCEPT · paramètres préliminaires, non validés fabrication."}
              </div>
            </>
          )}
          <div className="studio-dimension-list">
            {dimensions.map(item => (
              <div className="studio-dimension" key={item.field}>
                <span>{item.label}</span>
                <strong>
                  {item.value > 0
                    ? `${item.value.toFixed(2)} m`
                    : "À renseigner"}
                </strong>
                <div>
                  <button
                    onClick={() =>
                      setConfig({
                        ...config,
                        [item.field]: Math.max(
                          0,
                          Number((item.value - 0.05).toFixed(2))
                        ),
                      })
                    }
                  >
                    −
                  </button>
                  <button
                    onClick={() =>
                      setConfig({
                        ...config,
                        [item.field]: Number((item.value + 0.05).toFixed(2)),
                      })
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="studio-actions">
            <button
              className="secondary-button"
              onClick={() => announce("Instantané versionné créé")}
            >
              <Maximize2 size={14} /> Instantané
            </button>
            <button
              className="secondary-button"
              onClick={undo}
              disabled={!past.length}
            >
              <Undo2 size={14} /> Annuler
            </button>
            <button
              className="secondary-button"
              onClick={redo}
              disabled={!future.length}
            >
              <Redo2 size={14} /> Rétablir
            </button>
          </div>
          <div className="studio-history">
            <p className="eyebrow">JOURNAL / {history.length}</p>
            {history.length ? (
              history.map(item => <span key={item}>{item}</span>)
            ) : (
              <span>Aucune action récente</span>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
