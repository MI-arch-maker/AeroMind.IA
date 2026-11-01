import { useEffect, useMemo, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type ReactNode, type SetStateAction } from "react";
import { Activity, Box, Boxes, Crosshair, Eye, EyeOff, FileDown, Grid2X2, Layers3, Maximize2, MousePointer2, Move, Plus, RotateCcw, Ruler, ScanLine, Scissors, Settings2, ShieldCheck, Square, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import type { ConceptConfig, DroneSketchStroke, InstalledMaterial } from "../lib/aeroEngine";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import { dronePartCatalog } from "../lib/droneParts";
import { hasDroneGeometry } from "../lib/droneSketchGeometry";
import "./engineering-cad-workbench.css";

type Props = { config: ConceptConfig; setConfig: Dispatch<SetStateAction<ConceptConfig>>; activeProfile?: DroneCatalogDesign; onOpenLibrary?: () => void };
type ViewMode = "iso" | "front" | "side";
type Tool = "select" | "pan" | "measure" | "annotate" | "cut";
type CanvasPoint = { x: number; y: number };
type Layer = { id: string; label: string; count: number };
const views: Array<{ id: ViewMode; label: string }> = [{ id: "iso", label: "ISO" }, { id: "front", label: "FACE" }, { id: "side", label: "PROFIL" }];
const toolItems: Array<{ id: Tool; label: string; Icon: typeof MousePointer2 }> = [
  { id: "select", label: "Sélectionner", Icon: MousePointer2 }, { id: "pan", label: "Déplacer la vue", Icon: Move }, { id: "measure", label: "Mesurer", Icon: Ruler }, { id: "annotate", label: "Ajouter un repère", Icon: Crosshair }, { id: "cut", label: "Retirer une pièce", Icon: Scissors },
];
const palette = ["cyan", "blue", "amber", "violet", "green", "rose"];
const format = (value: number | undefined, digits = 2) => value !== undefined && Number.isFinite(value) && value > 0 ? value.toLocaleString("fr-FR", { maximumFractionDigits: digits }) : "—";
const layerFor = (part: InstalledMaterial) => part.layer?.trim() || "Sans calque";
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function renderSketchStroke(stroke: DroneSketchStroke): ReactNode {
  const [first, second] = [stroke.points[0], stroke.points[1]];
  if (!first) return null;
  const common = { fill: stroke.fill ?? "none", stroke: stroke.color, strokeWidth: stroke.width, opacity: stroke.opacity ?? 1, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (stroke.tool === "ellipse" && second) return <ellipse key={stroke.id} cx={(first.x + second.x) / 2} cy={(first.y + second.y) / 2} rx={Math.abs(second.x - first.x) / 2} ry={Math.abs(second.y - first.y) / 2} {...common} />;
  if (stroke.tool === "rectangle" && second) return <rect key={stroke.id} x={Math.min(first.x, second.x)} y={Math.min(first.y, second.y)} width={Math.abs(second.x - first.x)} height={Math.abs(second.y - first.y)} {...common} />;
  if (stroke.tool === "annotation") return <text key={stroke.id} x={first.x} y={first.y} fill={stroke.color} fontSize="18">{stroke.label ?? "Repère"}</text>;
  return <path key={stroke.id} d={stroke.points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ")} {...common} />;
}

function ParametricProfileGeometry({ profile, config, view, exploded, materials, visibleLayers, selectedId, tool, onSelectPart, onCutPart }: {
  profile: DroneCatalogDesign;
  config: ConceptConfig;
  view: ViewMode;
  exploded: boolean;
  materials: InstalledMaterial[];
  visibleLayers: Record<string, boolean>;
  selectedId: string | null;
  tool: Tool;
  onSelectPart: (id: string) => void;
  onCutPart: (id: string) => void;
}) {
  const type = `${profile.key} ${profile.modelType ?? ""}`.toLowerCase();
  const vtol = profile.key === "vtol" || type.includes("tiltrotor") || type.includes("tilt-wing") || type.includes("tail-sitter");
  const flyingWing = ["aile-volante", "stealth-wing", "blended-pusher", "hale-voilure", "male-voilure"].some(token => type.includes(token));
  const fixedWing = profile.key === "fixed-wing" || vtol || flyingWing || ["voilure-conventionnelle", "planeur", "tandem-wing", "canard", "biplan", "ornithoptère"].some(token => type.includes(token));
  const spanM = config.wingspan || profile.configuration.wingspan || 2.4;
  const lengthM = config.fuselageLength || profile.configuration.fuselageLength || 1.6;
  const span = clamp(spanM * 95, 210, 500);
  const length = clamp(lengthM * 68, 125, 300);
  const motorCount = clamp(Math.round(config.motorCount ?? profile.configuration.motorCount ?? (fixedWing ? 1 : 4)), 1, 8);
  const modelTransform = view === "iso" ? "translate(500 310) rotate(-30) skewX(-23) scale(1 .72) translate(-500 -310)" : undefined;
  const positions = Array.from({ length: motorCount }, (_, index) => {
    const angle = -Math.PI / 2 + (index / motorCount) * Math.PI * 2;
    return { x: 500 + Math.cos(angle) * span * 0.34, y: 310 + Math.sin(angle) * 185 };
  });
  const visibleMaterial = (part: InstalledMaterial) => part.iddsVisible !== false && (!part.layer || visibleLayers[part.layer] !== false);
  return <g transform={modelTransform} className={`cad-drone-geometry view-${view} ${exploded ? "is-exploded" : ""}`}>
    {fixedWing ? <g className="cad-layer-geometry">
      {flyingWing ? <path d={`M500 ${310 - length * .42}L${500 - span / 2} 276L${500 - span / 2 + 20} 344L500 ${310 + length * .42}L${500 + span / 2 - 20} 344L${500 + span / 2} 276Z`} className="cad-drone-outline cad-drone-fill"/> : <>
        <path d={`M500 ${310 - length / 2}Q478 300 484 ${310 + length / 2}L500 ${310 + length * .62}L516 ${310 + length / 2}Q522 300 500 ${310 - length / 2}Z`} className="cad-drone-outline cad-drone-fill"/>
        <path d={`M500 288L${500 - span / 2} 224L${500 - span / 2 + 18} 314L500 332L${500 + span / 2 - 18} 314L${500 + span / 2} 224L500 288Z`} className="cad-drone-outline cad-drone-fill"/>
        <path d={`M500 ${310 + length * .32}L${500 - span * .2} 396L500 ${310 + length * .52}L${500 + span * .2} 396Z`} className="cad-drone-outline cad-drone-fill"/>
      </>}
      {view !== "side" && <path d={`M500 ${310 - length * .42}V${310 + length * .52}`} className="cad-drone-detail"/>}
      {view === "side" && <path d={`M${500 - length / 2} 310Q500 276 ${500 + length / 2} 310L${500 + length / 3} 332H${500 - length / 3}Z`} className="cad-drone-outline cad-drone-fill"/>}
      {vtol && positions.slice(0, Math.min(4, motorCount)).map((point, index) => <g key={`vtol-${index}`} transform={`translate(${point.x} ${point.y})`} className="cad-motor-assembly"><circle r="15" className="cad-motor-ring"/><path d="M-22 0H22M0-22V22" className="cad-prop-line"/></g>)}
      {!vtol && <g className="cad-motor-assembly"><circle cx="500" cy={view === "side" ? 294 : 188} r="14" className="cad-motor-ring"/><path d={`M${view === "side" ? 478 : 474} ${view === "side" ? 294 : 188}H${view === "side" ? 522 : 526}`} className="cad-prop-line"/></g>}
    </g> : <g className="cad-layer-geometry">
      <path d={view === "side" ? `M${500 - length * .62} 310Q500 274 ${500 + length * .62} 310L${500 + length * .42} 337H${500 - length * .42}Z` : `M500 ${310 - length * .42}Q${500 - span * .14} 275 ${500 - span * .16} 310Q${500 - span * .14} 345 500 ${310 + length * .42}Q${500 + span * .14} 345 ${500 + span * .16} 310Q${500 + span * .14} 275 500 ${310 - length * .42}Z`} className="cad-drone-outline cad-drone-fill"/>
      {positions.map((point, index) => <g key={`arm-${index}`} className="cad-motor-assembly" transform={`translate(${point.x} ${point.y + (exploded ? (index % 2 ? -14 : 14) : 0)})`}><path d={`M${500 - point.x} ${310 - point.y}L0 0`} className="cad-drone-detail"/><circle r="19" className="cad-motor-ring"/><circle r="5" className="cad-motor-hub"/><path d="M-27 0H27M0-27V27" className="cad-prop-line"/><text y="34" textAnchor="middle" className="cad-small-label">M{index + 1}</text></g>)}
    </g>}
    {materials.filter(visibleMaterial).map((part, index) => {
      const x = clamp(500 + (part.offsetX ?? ((index % 3) - 1) * 8) * 4, 100, 900);
      const y = clamp(310 + (part.offsetY ?? 0) * 3.2, 100, 520);
      const color = part.category === "propulsion" ? "#efbd72" : part.category === "avionics" ? "#b5a1ff" : part.category === "payload" ? "#83dba1" : "#9fe5de";
      return <g key={part.id} className={`cad-component-marker ${selectedId === part.id ? "is-selected" : ""}`} transform={`translate(${x} ${y})`} onClick={event => { event.stopPropagation(); if (tool === "cut") onCutPart(part.id); else if (tool === "select") onSelectPart(part.id); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (tool === "cut") onCutPart(part.id); else if (tool === "select") onSelectPart(part.id); } }} role="button" tabIndex={0} aria-label={`Sélectionner ${part.label}`}><rect x="-13" y="-8" width="26" height="16" rx="3" fill={`${color}22`} stroke={color} strokeWidth="1.4"/><title>{part.label}</title></g>;
    })}
  </g>;
}

export function EngineeringCadWorkbench({ config, setConfig, activeProfile, onOpenLibrary }: Props) {
  const [view, setView] = useState<ViewMode>("iso");
  const [tool, setTool] = useState<Tool>("select");
  const [wireframe, setWireframe] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [exploded, setExploded] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [measureStart, setMeasureStart] = useState<CanvasPoint | null>(null);
  const [measurement, setMeasurement] = useState<{ from: CanvasPoint; to: CanvasPoint; units: number } | null>(null);
  const [annotations, setAnnotations] = useState<Array<{ id: string; point: CanvasPoint; text: string }>>([]);
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");
  const panOrigin = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const materials = config.installedMaterials ?? [];
  const customStrokes = config.customSketch?.strokes ?? [];
  const customSource = hasDroneGeometry(customStrokes) && (config.engineeringSelection?.source === "custom" || !activeProfile);
  const selectedProfile = customSource ? undefined : activeProfile;
  const isSketch = Boolean(customSource && customStrokes.length);
  const hasSelectedDesign = Boolean(selectedProfile || isSketch);
  const title = selectedProfile?.label ?? (isSketch ? config.engineeringSelection?.droneLabel ?? config.designName ?? "Drone dessiné" : "");
  const shapeConfig: ConceptConfig = { ...(selectedProfile?.configuration ?? {}), ...config } as ConceptConfig;
  const layers = useMemo<Layer[]>(() => (config.studioLayers ?? []).map((label, index) => ({ id: label, label, count: materials.filter(part => part.layer === label).reduce((sum, part) => sum + (part.quantity ?? 1), 0) + customStrokes.filter(stroke => stroke.layer === label).length })), [config.studioLayers, materials, customStrokes]);
  const selectedPart = materials.find(part => part.id === selectedId);
  const stageLabel = isSketch ? "DESSIN UTILISATEUR" : "RÉFÉRENCE BIBLIOTHÈQUE";
  const wingspan = shapeConfig.wingspan;
  const fuselageLength = shapeConfig.fuselageLength;
  const motorCount = shapeConfig.motorCount;

  useEffect(() => {
    setVisibleLayers(current => Object.fromEntries((config.studioLayers ?? []).map(label => [label, config.studioLayerSettings?.[label]?.visible ?? current[label] ?? true])));
  }, [config.studioLayers, config.studioLayerSettings]);
  useEffect(() => { if (selectedId && !materials.some(part => part.id === selectedId)) setSelectedId(null); }, [materials, selectedId]);
  useEffect(() => { setView("iso"); setPanOffset({ x: 0, y: 0 }); }, [isSketch, selectedProfile?.id]);
  const toggleLayer = (id: string) => {
    const visible = !(visibleLayers[id] ?? true);
    setVisibleLayers(current => ({ ...current, [id]: visible }));
    setConfig(current => ({ ...current, activeStudioLayer: id, studioLayerSettings: { ...(current.studioLayerSettings ?? {}), [id]: { ...(current.studioLayerSettings?.[id] ?? { visible: true, locked: false }), visible } } }));
  };
  const toggleAllLayers = () => {
    const next = Object.fromEntries(layers.map(layer => [layer.id, true]));
    setVisibleLayers(next);
    setConfig(current => ({ ...current, studioLayerSettings: Object.fromEntries((current.studioLayers ?? []).map(label => [label, { ...(current.studioLayerSettings?.[label] ?? { visible: true, locked: false }), visible: true }])) }));
  };
  const addCatalogPart = (catalogId: string) => {
    const definition = dronePartCatalog.find(part => part.id === catalogId);
    if (!definition) return;
    const material: InstalledMaterial = { ...definition, id: `${definition.id}-${Date.now()}`, quantity: 1, layer: "", physicalStatus: "not-verified", catalogSource: "concept" };
    setConfig(current => ({ ...current, installedMaterials: [...(current.installedMaterials ?? []), material], constructionMassKg: (current.constructionMassKg ?? 0) + material.massKg }));
    setSelectedId(material.id);
    setNotice(`${material.label} ajouté au document sans calque automatique.`);
  };
  const removePart = (id: string) => {
    const part = materials.find(item => item.id === id);
    if (!part) return;
    setConfig(current => ({ ...current, installedMaterials: (current.installedMaterials ?? []).filter(item => item.id !== id), constructionMassKg: Math.max(0, (current.constructionMassKg ?? 0) - part.massKg * (part.quantity ?? 1)) }));
    setNotice(`${part.label} retiré de la nomenclature locale.`);
    setSelectedId(null);
  };
  const removeSelected = () => { if (selectedPart) removePart(selectedPart.id); };
  const updateSelectedOffset = (key: "offsetX" | "offsetY", value: string) => {
    if (!selectedPart) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    setConfig(current => ({ ...current, installedMaterials: (current.installedMaterials ?? []).map(part => part.id === selectedPart.id ? { ...part, [key]: clamp(numeric, -100, 100) } : part) }));
  };
  const canvasPoint = (event: ReactPointerEvent<SVGSVGElement>): CanvasPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width * 1000, 0, 1000), y: clamp((event.clientY - rect.top) / rect.height * 620, 0, 620) };
  };
  const onCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!hasSelectedDesign) return;
    if (tool === "pan") {
      panOrigin.current = { x: event.clientX, y: event.clientY, offsetX: panOffset.x, offsetY: panOffset.y };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const point = canvasPoint(event);
    if (tool === "select" && !(event.target as Element).closest(".cad-component-marker")) setSelectedId(null);
    if (tool === "measure") {
      if (!measureStart) { setMeasureStart(point); setMeasurement(null); }
      else { setMeasurement({ from: measureStart, to: point, units: Math.hypot(point.x - measureStart.x, point.y - measureStart.y) }); setMeasureStart(null); }
    }
    if (tool === "annotate") {
      const text = window.prompt("Texte du repère local", "À vérifier");
      if (text?.trim()) setAnnotations(current => [...current, { id: `cad-note-${Date.now()}`, point, text: text.trim() }]);
    }
    if (tool === "cut") setNotice(isSketch ? "Les traits du croquis se modifient dans l’atelier Dessiner le drone." : "La découpe s’applique aux pièces de nomenclature; le contour source reste intact.");
  };
  const onCanvasPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (panOrigin.current) setPanOffset({ x: panOrigin.current.offsetX + event.clientX - panOrigin.current.x, y: panOrigin.current.offsetY + event.clientY - panOrigin.current.y });
  };
  const onCanvasPointerUp = () => { panOrigin.current = null; };
  const openSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const exportBill = () => {
    if (!materials.length) { setNotice("Aucune pièce sélectionnée à exporter."); return; }
    const csv = ["id;désignation;catégorie;calque;quantité;masse unitaire (kg);source", ...materials.map(part => [part.id, part.label, part.category ?? "", layerFor(part), part.quantity ?? 1, part.massKg, part.catalogSource ?? "concept"].map(value => `"${String(value).replaceAll('"', '""')}"`).join(";"))].join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `${(title || "drone").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-bom.csv`; link.click(); URL.revokeObjectURL(url); setNotice("Nomenclature CSV exportée.");
  };
  const visibleSketches = customStrokes.filter(stroke => !stroke.layer || visibleLayers[stroke.layer] !== false);
  const emptyState = !hasSelectedDesign;

  return <section className="engineering-cad-workbench" aria-label="Studio CAO de conception drone">
    <header className="cad-workbench-header">
      <div className="cad-title-block"><span className="cad-kicker"><ScanLine size={14} /> AEROMIND / CAO WORKSPACE <i>LOCAL</i></span><h2>Studio CAO de conception drone</h2><p>Géométrie liée à la source active · calques utilisateur · nomenclature</p></div>
      <div className={`cad-document-state ${hasSelectedDesign ? "is-active" : "is-empty"}`}><span className="cad-live-dot" />{hasSelectedDesign ? <><span>DOCUMENT ACTIF</span><strong>CAD-{selectedProfile?.id ?? "SKETCH"}</strong><small>CONCEPT · NON CERTIFIÉ</small></> : <><span>AUCUN DOCUMENT</span><strong>EN ATTENTE DE SOURCE</strong><small>SÉLECTION OU DESSIN REQUIS</small></>}</div>
    </header>

    <div className="cad-command-bar">
      <div className="cad-command-group cad-command-tools"><span className="cad-group-label">OUTILS</span>{toolItems.map(({ id, label, Icon }) => <button key={id} type="button" title={label} aria-label={label} disabled={emptyState} className={tool === id ? "is-active" : ""} onClick={() => { setTool(id); setNotice(`${label} activé.`); }}><Icon size={15} /><span>{label}</span></button>)}</div>
      <div className="cad-command-group cad-command-actions"><button type="button" disabled={emptyState} className={showGrid ? "is-active" : ""} onClick={() => setShowGrid(value => !value)} title="Afficher/masquer la grille"><Grid2X2 size={15}/><span>Grille</span></button><button type="button" disabled={emptyState} className={showDimensions ? "is-active" : ""} onClick={() => setShowDimensions(value => !value)} title="Afficher/masquer les cotations"><Ruler size={15}/><span>Cotations</span></button><button type="button" disabled={emptyState} className={wireframe ? "is-active" : ""} onClick={() => setWireframe(value => !value)} title="Basculer filaire / solide"><Box size={15}/><span>{wireframe ? "Filaire" : "Solide"}</span></button><button type="button" disabled={emptyState} className={exploded ? "is-active" : ""} onClick={() => setExploded(value => !value)} title="Vue éclatée"><Maximize2 size={15}/><span>Éclatée</span></button><button type="button" disabled={!materials.length} onClick={exportBill} title="Exporter la nomenclature"><FileDown size={15}/><span>Export BOM</span></button></div>
    </div>

    {emptyState ? <div className="cad-empty-workspace"><div className="cad-empty-surface"><div className="cad-empty-orbit"><div className="cad-empty-crosshair"><Crosshair size={34}/></div><span className="cad-empty-ring ring-one"/><span className="cad-empty-ring ring-two"/><span className="cad-empty-ring ring-three"/><small>ZONE DE TRAVAIL · VIDE</small></div><div className="cad-empty-copy"><span className="cad-empty-kicker"><ShieldCheck size={14}/> GARDE-FOU DE CONFIGURATION</span><h3>Aucun drone chargé dans l’espace CAO</h3><p>La scène reste vide tant qu’une référence n’est pas choisie ou qu’un croquis personnalisé n’existe pas. Aucun modèle n’est généré par défaut.</p><div className="cad-empty-actions"><button type="button" className="cad-primary-action" onClick={() => onOpenLibrary ? onOpenLibrary() : openSection("studio-concept-overview")}><Boxes size={16}/> Choisir dans la bibliothèque <span>01</span></button><button type="button" className="cad-secondary-action" onClick={() => openSection("studio-sketch-workbench")}><Square size={16}/> Créer depuis l’interface Dessin <span>02</span></button></div><small className="cad-empty-footnote">Aucune donnée de démonstration · aucune architecture présélectionnée</small></div></div></div> : <>
      <div className="cad-context-strip"><div><span className="cad-context-mark"><Activity size={14}/></span><span><small>SOURCE DE GÉOMÉTRIE</small><strong>{title}</strong></span></div><span className={`cad-context-type ${isSketch ? "is-sketch" : ""}`}>{stageLabel}</span><span className="cad-context-stats"><b>{format(wingspan)} <small>m · ENVERGURE</small></b><b>{motorCount && motorCount > 0 ? motorCount : "—"} <small>MOTEURS</small></b><b>{materials.length} <small>PIÈCES INSTALLÉES</small></b></span></div>
      <div className="cad-workspace-grid">
        <aside className="cad-left-rail"><div className="cad-rail-heading"><Layers3 size={14}/><span>CALQUES UTILISATEUR</span><button type="button" title="Afficher les calques existants" onClick={toggleAllLayers} disabled={!layers.length}><Eye size={13}/></button></div>
          <div className="cad-layer-list">{layers.length ? layers.map((layer, index) => <button key={layer.id} className={`cad-layer ${visibleLayers[layer.id] === false ? "is-hidden" : ""} ${selectedPart && layerFor(selectedPart) === layer.id ? "is-active" : ""}`} onClick={() => toggleLayer(layer.id)}><i className={`cad-layer-dot tone-${palette[index % palette.length]}`}/><span>{layer.label}</span><small>{String(layer.count).padStart(2, "0")}</small>{visibleLayers[layer.id] === false ? <EyeOff size={12}/> : <Eye size={12}/>}</button>) : <div className="cad-bom-empty">Aucun calque prédéfini.<br/>Créez vos calques dans le Document de construction.</div>}</div>
          <div className="cad-rail-divider"/><div className="cad-rail-heading"><Settings2 size={14}/><span>DOCUMENT</span></div><div className="cad-doc-meta"><span>Révision</span><strong>LOCAL · BROUILLON</strong><span>Unités</span><strong>{isSketch ? "unités dessin" : "m · kg · °"}</strong><span>Origine</span><strong>Repère local</strong><span>Géométrie</span><strong>{isSketch ? "Croquis synchronisé" : "Profil sélectionné"}</strong></div>
          <div className="cad-layer-create"><button type="button" onClick={() => openSection("studio-sketch-workbench")}><Plus size={14}/> Ouvrir l’atelier de dessin</button></div>
        </aside>

        <main className="cad-main-stage"><div className="cad-view-toolbar"><div className="cad-projections"><span>PROJECTION</span>{(isSketch ? [{ id: "iso" as const, label: "DESSIN" }] : views).map(item => <button key={item.id} type="button" className={view === item.id ? "is-active" : ""} onClick={() => setView(item.id)}>{item.label}</button>)}</div><div className="cad-canvas-tools"><span>{tool.toUpperCase()}</span><button type="button" title="Réduire le zoom" onClick={() => setZoom(value => Math.max(50, value - 10))}><ZoomOut size={15}/></button><b>{zoom}%</b><button type="button" title="Agrandir le zoom" onClick={() => setZoom(value => Math.min(160, value + 10))}><ZoomIn size={15}/></button><button type="button" title="Réinitialiser le cadrage" onClick={() => { setZoom(100); setView("iso"); setExploded(false); setPanOffset({ x: 0, y: 0 }); setMeasurement(null); setMeasureStart(null); }}><RotateCcw size={14}/></button></div></div>
          <div className={`cad-canvas-wrap ${showGrid ? "has-grid" : "no-grid"} ${tool === "pan" ? "tool-pan" : ""}`}><div className="cad-canvas-hud"><span><i/> {isSketch ? "DESSIN" : view.toUpperCase()} · {wireframe ? "WIREFRAME" : "SOLID"}</span><span>{isSketch ? "CROQUIS UTILISATEUR / LIEN PARTAGÉ" : "PROFIL CATALOGUE / PARAMÉTRIQUE"}</span><span>{isSketch ? "UNITÉS SVG · DESSIN NON CALIBRÉ" : "UNITÉS DÉCLARÉES · m"}</span></div>
            <svg className={`cad-canvas ${wireframe ? "is-wireframe" : "is-solid"}`} style={{ transform: `translate(${panOffset.x}px,${panOffset.y}px) scale(${zoom / 100})` }} viewBox="0 0 1000 620" role="img" aria-label={`Vue CAO ${title}`} onPointerDown={onCanvasPointerDown} onPointerMove={onCanvasPointerMove} onPointerUp={onCanvasPointerUp} onPointerCancel={onCanvasPointerUp}>
              <defs><pattern id="cad-grid-pattern" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#5c8292" strokeOpacity=".22" strokeWidth="1"/></pattern><linearGradient id="cad-surface" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#63e4dc" stopOpacity=".22"/><stop offset="1" stopColor="#7197ff" stopOpacity=".07"/></linearGradient><filter id="cad-glow"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
              {showGrid && <rect width="1000" height="620" fill="url(#cad-grid-pattern)"/>}<line x1="500" y1="34" x2="500" y2="586" className="cad-axis cad-axis-y"/><line x1="34" y1="310" x2="966" y2="310" className="cad-axis cad-axis-x"/><text x="944" y="300" className="cad-axis-label">X+</text><text x="510" y="52" className="cad-axis-label">Y+</text>
              {isSketch ? <><g transform={"translate(0 30)"} className="cad-sketch-geometry">{visibleSketches.map(renderSketchStroke)}</g>{materials.filter(part => part.iddsVisible !== false && (!part.layer || visibleLayers[part.layer] !== false)).map((part, index) => { const x = clamp(500 + (part.offsetX ?? ((index % 3) - 1) * 8) * 4, 100, 900); const y = clamp(310 + (part.offsetY ?? 0) * 3.2, 100, 520); return <g key={part.id} className={`cad-component-marker ${selectedId === part.id ? "is-selected" : ""}`} transform={`translate(${x} ${y})`} onClick={event => { event.stopPropagation(); if (tool === "cut") removePart(part.id); else if (tool === "select") setSelectedId(part.id); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (tool === "cut") removePart(part.id); else if (tool === "select") setSelectedId(part.id); } }} role="button" tabIndex={0} aria-label={`Sélectionner ${part.label}`}><rect x="-13" y="-8" width="26" height="16" rx="3" fill="#64d9ce22" stroke="#71ded5" strokeWidth="1.4"/><title>{part.label}</title></g>; })}</> : selectedProfile && <ParametricProfileGeometry profile={selectedProfile} config={shapeConfig} view={view} exploded={exploded} materials={materials} visibleLayers={visibleLayers} selectedId={selectedId} tool={tool} onSelectPart={setSelectedId} onCutPart={removePart}/>}
              {showDimensions && !isSketch && <g className="cad-dimension"><path d="M250 478H750M250 468V488M750 468V488"/><text x="500" y="502" textAnchor="middle">ENVERGURE {format(wingspan)} m</text><path d="M350 530H650M350 520V540M650 520V540"/><text x="500" y="558" textAnchor="middle">LONGUEUR {format(fuselageLength)} m</text></g>}
              {measurement && <g className="cad-measurement" pointerEvents="none"><path d={`M${measurement.from.x} ${measurement.from.y}L${measurement.to.x} ${measurement.to.y}`}/><circle cx={measurement.from.x} cy={measurement.from.y} r="4"/><circle cx={measurement.to.x} cy={measurement.to.y} r="4"/><text x={(measurement.from.x + measurement.to.x) / 2} y={(measurement.from.y + measurement.to.y) / 2 - 9} textAnchor="middle">{isSketch ? `${measurement.units.toFixed(0)} unités dessin` : `${(measurement.units / 1000 * (wingspan || 0)).toFixed(2)} m · ESTIMÉ`}</text></g>}{measureStart && <circle className="cad-measure-start" cx={measureStart.x} cy={measureStart.y} r="5" pointerEvents="none"/>}{annotations.map(note => <g key={note.id} className="cad-local-annotation" pointerEvents="none"><circle cx={note.point.x} cy={note.point.y} r="4"/><text x={note.point.x + 8} y={note.point.y - 8}>{note.text}</text></g>)}<g className="cad-axis-labels"><text x="24" y="30">{title.toUpperCase()} · {view.toUpperCase()}</text><text x="24" y="600">CONCEPT NUMÉRIQUE · REVUE HUMAINE REQUISE</text></g>
            </svg>
            <div className="cad-stage-compass"><Crosshair size={15}/><span>X</span><span>Y</span></div><div className="cad-stage-scale">{isSketch ? "UNITÉS SVG · NON CALIBRÉ" : `1:${Math.max(1, Math.round(1000 / zoom))} · m déclarés`}</div>{notice && <div className="cad-notice" role="status">{notice}<button type="button" onClick={() => setNotice("")}>×</button></div>}
          </div>
          <footer className="cad-stage-footer"><span><i className="tone-cyan"/>Géométrie source</span><span><i className="tone-amber"/>Composants</span><strong><ShieldCheck size={13}/> Aperçu conceptuel · non certifié</strong></footer>
          <div className="cad-component-dock"><div className="cad-dock-heading"><div><small>INSERTION RAPIDE</small><strong>Composants de concept</strong></div><span>Ajout explicite · sans calque automatique</span></div><div className="cad-component-list">{dronePartCatalog.slice(0, 5).map(part => <button key={part.id} type="button" onClick={() => addCatalogPart(part.id)}><Plus size={13}/><span>{part.label}</span><small>{part.massKg.toFixed(2)} kg*</small></button>)}</div></div>
        </main>

        <aside className="cad-right-rail"><div className="cad-rail-heading"><Ruler size={14}/><span>INSPECTEUR</span><span className="cad-rail-live">LIEN LOCAL</span></div><div className="cad-inspector-card"><small>SÉLECTION</small><strong>{selectedPart?.label ?? title}</strong><span>{selectedPart?.id ?? (isSketch ? `${customStrokes.length} entités dessinées` : selectedProfile?.family ?? "Profil de bibliothèque actif")}</span></div>
          {selectedPart && <div className="cad-part-edit-fields"><label>Décalage X<input type="number" step="0.5" value={selectedPart.offsetX ?? 0} onChange={event => updateSelectedOffset("offsetX", event.target.value)}/></label><label>Décalage Y<input type="number" step="0.5" value={selectedPart.offsetY ?? 0} onChange={event => updateSelectedOffset("offsetY", event.target.value)}/></label></div>}<div className="cad-spec-grid"><div><small>ENVERGURE</small><b>{format(wingspan)} <em>m</em></b></div><div><small>MOTEURS</small><b>{motorCount && motorCount > 0 ? motorCount : "—"}</b></div><div><small>FUSELAGE</small><b>{format(fuselageLength)} <em>m</em></b></div><div><small>CALQUES UTILISATEUR</small><b>{layers.length}</b></div></div>
          <div className="cad-bom-heading"><span>NOMENCLATURE / BOM</span><small>{materials.length} lignes</small></div><div className="cad-bom">{materials.length ? materials.map(item => <button key={item.id} type="button" className={selectedId === item.id ? "is-active" : ""} onClick={() => setSelectedId(item.id)}><i className="cad-layer-dot tone-cyan"/><b>{item.label}</b><span>{layerFor(item)} · Qté {item.quantity ?? 1}</span><small>{item.massKg.toFixed(3)} kg · {item.catalogSource === "manufacturer" ? "fabricant" : "concept"}</small></button>) : <div className="cad-bom-empty">Aucune pièce ajoutée.<br/>Ajoutez uniquement les composants choisis.</div>}</div>
          <button type="button" className="cad-remove-selected" disabled={!selectedPart} onClick={removeSelected}><Trash2 size={13}/> Retirer la pièce sélectionnée</button><div className="cad-review-note"><strong><ShieldCheck size={13}/> REVUE &amp; VALIDATION</strong><span>Les masses conceptuelles, interfaces et tolérances restent à vérifier. Cet aperçu ne produit ni certification ni garantie de fabricabilité.</span></div>
        </aside>
      </div>
    </>}
  </section>;
}
