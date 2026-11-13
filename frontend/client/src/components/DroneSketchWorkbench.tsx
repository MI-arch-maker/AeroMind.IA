import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Circle, Eraser, FlipHorizontal2, Grid3X3, Layers3, Minus, MousePointer2, PenLine, Plus, RectangleHorizontal, Ruler, RotateCcw, Square, Trash2, Type, Undo2 } from "lucide-react";
import type { ConceptConfig, DroneSketchStroke, InstalledMaterial } from "../lib/aeroEngine";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import "./drone-sketch-workbench.css";

type SketchTool = "select" | "freehand" | "line" | "rectangle" | "ellipse" | "wing" | "fuselage" | "tail" | "payload" | "measure" | "annotation" | "erase";
type DrawingTool = Exclude<SketchTool, "select" | "erase">;
type Props = { config: ConceptConfig; setConfig: (next: ConceptConfig) => void; activeProfile?: DroneCatalogDesign; parts?: InstalledMaterial[]; context: "studio" | "construction" };

const VIEWBOX = { width: 1000, height: 560 };
const toolLabels: Record<SketchTool, string> = { select: "Sélection", freehand: "Crayon", line: "Ligne", rectangle: "Rectangle", ellipse: "Ellipse", wing: "Aile", fuselage: "Fuselage", tail: "Empennage", payload: "Charge utile", measure: "Cotation", annotation: "Annotation", erase: "Gomme" };
const toolColors: Record<DrawingTool, string> = { freehand: "#8de8df", line: "#a9d7ff", rectangle: "#8fd3ff", ellipse: "#b9a5ff", wing: "#f1c76b", fuselage: "#71b7d1", tail: "#d99aee", payload: "#ff9c7d", measure: "#ff8f78", annotation: "#d5e7a0" };
const toolGroups: Array<{ label: string; tools: SketchTool[] }> = [
  { label: "NAVIGATION", tools: ["select"] },
  { label: "GÉOMÉTRIE", tools: ["freehand", "line", "rectangle", "ellipse"] },
  { label: "CELLULE", tools: ["wing", "fuselage", "tail", "payload"] },
  { label: "INGÉNIERIE", tools: ["measure", "annotation", "erase"] },
];
const starterStrokes = (config: ConceptConfig): DroneSketchStroke[] => {
  const span = Math.min(360, Math.max(170, (config.wingspan || 4.2) * 55));
  const length = Math.min(420, Math.max(180, (config.fuselageLength || 1.8) * 105));
  const cx = VIEWBOX.width / 2; const cy = VIEWBOX.height / 2;
  return [
    { id: "starter-fuselage", tool: "fuselage", color: toolColors.fuselage, width: 7, layer: "Structure", points: [{ x: cx - length / 2, y: cy }, { x: cx - length / 4, y: cy - 18 }, { x: cx + length / 2, y: cy }, { x: cx - length / 4, y: cy + 18 }, { x: cx - length / 2, y: cy }] },
    { id: "starter-wing", tool: "wing", color: toolColors.wing, width: 6, layer: "Voilure", points: [{ x: cx - 18, y: cy }, { x: cx - span, y: cy - 105 }, { x: cx - span + 22, y: cy - 105 }, { x: cx + 12, y: cy + 4 }, { x: cx + span - 22, y: cy + 105 }, { x: cx - span, y: cy + 105 }, { x: cx - 18, y: cy }] },
  ];
};
const normalize = (value: number, max: number) => Math.max(0, Math.min(max, value));
const snap = (value: number, enabled: boolean, size = 20) => enabled ? Math.round(value / size) * size : value;
const pointsToPath = (points: Array<{ x: number; y: number }>, close = false) => `${points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ")}${close ? " Z" : ""}`;
const mirrored = (stroke: DroneSketchStroke): DroneSketchStroke => ({ ...stroke, id: `${stroke.id}-sym`, points: stroke.points.map(point => ({ ...point, x: VIEWBOX.width - point.x })) });

export function DroneSketchWorkbench({ config, setConfig, activeProfile, parts = [], context }: Props) {
  const [strokes, setStrokes] = useState<DroneSketchStroke[]>(config.customSketch?.strokes?.length ? config.customSketch.strokes : starterStrokes(config));
  const [tool, setTool] = useState<SketchTool>("select");
  const [activeStrokeId, setActiveStrokeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [gridVisible, setGridVisible] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [symmetry, setSymmetry] = useState(false);
  const [activeLayer, setActiveLayer] = useState("Structure");
  const [annotationText, setAnnotationText] = useState("Point de contrôle");
  const drawing = useRef(false);
  const startPoint = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { setStrokes(config.customSketch?.strokes?.length ? config.customSketch.strokes : starterStrokes(config)); }, [config.customSketch?.modifiedAt, activeProfile?.id]);
  const persist = (next: DroneSketchStroke[]) => { setStrokes(next); setConfig({ ...config, customSketch: { version: 1, strokes: next, modifiedAt: new Date().toISOString() } }); };
  const pointFromEvent = (event: ReactPointerEvent<SVGSVGElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: snap(normalize(((event.clientX - rect.left) / rect.width) * VIEWBOX.width, VIEWBOX.width), snapEnabled), y: snap(normalize(((event.clientY - rect.top) / rect.height) * VIEWBOX.height, VIEWBOX.height), snapEnabled) }; };
  const makeStroke = (point: { x: number; y: number }): DroneSketchStroke => ({ id: `sketch-${Date.now()}`, tool: tool as DrawingTool, color: toolColors[tool as DrawingTool], width: tool === "freehand" ? 4 : tool === "measure" ? 2 : 6, layer: activeLayer, points: [point], label: tool === "annotation" ? annotationText : undefined });
  const begin = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = pointFromEvent(event);
    if (tool === "select") { setActiveStrokeId(null); return; }
    if (tool === "erase") { const hit = strokes.find(stroke => stroke.points.some(item => Math.hypot(item.x - point.x, item.y - point.y) < 28)); if (hit) persist(strokes.filter(stroke => stroke.id !== hit.id)); return; }
    const stroke = makeStroke(point);
    if (tool === "annotation") { persist([...strokes, stroke]); setActiveStrokeId(stroke.id); return; }
    event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; startPoint.current = point; setActiveStrokeId(stroke.id); setStrokes(current => [...current, stroke]);
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing.current || !activeStrokeId || !startPoint.current) return;
    const point = pointFromEvent(event);
    setStrokes(current => current.map(stroke => { if (stroke.id !== activeStrokeId) return stroke; if (tool === "freehand" || tool === "wing" || tool === "fuselage" || tool === "tail" || tool === "payload") return { ...stroke, points: [...stroke.points, point] }; return { ...stroke, points: [startPoint.current!, point] }; }));
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setStrokes(current => { const cleaned = current.filter(stroke => stroke.points.length > 1); const active = cleaned.find(stroke => stroke.id === activeStrokeId); const next = symmetry && active && !["measure", "annotation"].includes(active.tool) ? [...cleaned, mirrored(active)] : cleaned; setConfig({ ...config, customSketch: { version: 1, strokes: next, modifiedAt: new Date().toISOString() } }); return next; });
    startPoint.current = null;
  };
  const undo = () => persist(strokes.slice(0, -1));
  const clear = () => persist([]);
  const reset = () => persist(starterStrokes(config));
  const selectStroke = (event: ReactPointerEvent<SVGPathElement | SVGRectElement | SVGEllipseElement | SVGTextElement>, id: string) => { event.stopPropagation(); if (tool === "erase") persist(strokes.filter(stroke => stroke.id !== id)); else setActiveStrokeId(id); };
  const renderStroke = (stroke: DroneSketchStroke) => {
    const selected = activeStrokeId === stroke.id;
    const common = { key: stroke.id, stroke: stroke.color, strokeWidth: stroke.width, className: `sketch-stroke ${selected ? "is-selected" : ""}`, onPointerDown: (event: ReactPointerEvent<SVGPathElement>) => selectStroke(event, stroke.id) };
    if (stroke.tool === "rectangle" && stroke.points[1]) { const a = stroke.points[0]; const b = stroke.points[1]; return <rect {...common} x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} fill="rgba(143,211,255,.12)" />; }
    if (stroke.tool === "ellipse" && stroke.points[1]) { const a = stroke.points[0]; const b = stroke.points[1]; return <ellipse {...common} cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} rx={Math.abs(b.x - a.x) / 2} ry={Math.abs(b.y - a.y) / 2} fill="rgba(185,165,255,.12)" />; }
    if (stroke.tool === "annotation") return <text key={stroke.id} x={stroke.points[0].x} y={stroke.points[0].y} className={`sketch-annotation ${selected ? "is-selected" : ""}`} onPointerDown={event => selectStroke(event, stroke.id)}>{stroke.label ?? "Annotation"}</text>;
    if (stroke.tool === "measure") return <g key={stroke.id} className={selected ? "is-selected" : ""} onPointerDown={event => { event.stopPropagation(); setActiveStrokeId(stroke.id); }}><path d={pointsToPath(stroke.points)} stroke={stroke.color} strokeWidth={stroke.width} className="sketch-stroke" /><text x={(stroke.points[0].x + stroke.points.at(-1)!.x) / 2} y={(stroke.points[0].y + stroke.points.at(-1)!.y) / 2 - 8} className="sketch-measure-label">{Math.hypot(stroke.points[0].x - stroke.points.at(-1)!.x, stroke.points[0].y - stroke.points.at(-1)!.y).toFixed(0)} u</text></g>;
    return <path {...common} d={pointsToPath(stroke.points, ["wing", "fuselage", "tail", "payload"].includes(stroke.tool))} />;
  };
  return <section className={`drone-sketch-workbench sketch-context-${context}`} aria-label="Atelier moderne de dessin du drone">
    <header className="sketch-header"><div><p className="eyebrow">{context === "studio" ? "STUDIO DE CONCEPTION" : "POSTE DE CONSTRUCTION"} / ATELIER DE CELLULE</p><h3>Dessiner le drone</h3><small>{activeProfile?.label ?? "Cellule libre"} · {strokes.length} objets · {parts.length} équipements liés · calque {activeLayer}</small></div><div className="sketch-header-metrics"><span><i /> AUTOSAVE LOCAL</span><b>SKETCH v2</b></div></header>
    <div className="sketch-command-bar"><div className="command-group"><strong>OUTILS</strong>{toolGroups.map(group => <div className="tool-cluster" key={group.label}><label>{group.label}</label>{group.tools.map(item => <button key={item} type="button" className={tool === item ? "is-active" : ""} onClick={() => setTool(item)} title={toolLabels[item]} aria-label={toolLabels[item]}>{item === "select" ? <MousePointer2 size={14} /> : item === "freehand" ? <PenLine size={14} /> : item === "line" ? <Minus size={14} /> : item === "rectangle" ? <RectangleHorizontal size={14} /> : item === "ellipse" ? <Circle size={14} /> : item === "measure" ? <Ruler size={14} /> : item === "annotation" ? <Type size={14} /> : item === "erase" ? <Eraser size={14} /> : <span className={`sketch-tool-dot sketch-tool-${item}`} />}</button>)}</div>)}</div><div className="command-group command-actions"><strong>VUE</strong><button type="button" className={gridVisible ? "is-active" : ""} onClick={() => setGridVisible(value => !value)} title="Afficher la grille"><Grid3X3 size={14} /> Grille</button><button type="button" className={snapEnabled ? "is-active" : ""} onClick={() => setSnapEnabled(value => !value)} title="Activer l’accrochage">Snap</button><button type="button" className={symmetry ? "is-active" : ""} onClick={() => setSymmetry(value => !value)} title="Activer la symétrie"><FlipHorizontal2 size={14} /> Symétrie</button><button type="button" onClick={() => setZoom(value => Math.max(.6, value - .1))}><Minus size={14} /></button><b>{Math.round(zoom * 100)}%</b><button type="button" onClick={() => setZoom(value => Math.min(1.8, value + .1))}><Plus size={14} /></button></div><div className="command-group command-history"><button type="button" onClick={undo} disabled={!strokes.length} title="Annuler"><Undo2 size={14} /></button><button type="button" onClick={reset} title="Réinitialiser"><RotateCcw size={14} /></button><button type="button" className="sketch-danger" onClick={clear} title="Effacer tout"><Trash2 size={14} /></button></div></div>
    <div className="sketch-secondary-bar"><div className="layer-picker"><Layers3 size={14} /><strong>CALQUE ACTIF</strong>{["Structure", "Voilure", "Propulsion", "Avionique", "Charge utile"].map(layer => <button key={layer} type="button" className={activeLayer === layer ? "is-active" : ""} onClick={() => setActiveLayer(layer)}>{layer}</button>)}</div><label className="annotation-input"><Type size={13} /><input value={annotationText} onChange={event => setAnnotationText(event.target.value)} aria-label="Texte de la prochaine annotation" /></label></div>
    <div className="sketch-layout"><div className="sketch-canvas-shell"><div className="sketch-canvas-wrap" style={{ transform: `scale(${zoom})` }}><svg className="sketch-canvas" viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} role="img" aria-label="Plan de dessin avancé du drone"><defs><pattern id={`sketch-grid-${context}`} width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(141,232,223,.1)" strokeWidth="1" /></pattern></defs><rect width="1000" height="560" fill="#07131a" />{gridVisible && <rect width="1000" height="560" fill={`url(#sketch-grid-${context})`} />}<line x1="500" y1="18" x2="500" y2="542" className="sketch-axis" /><line x1="18" y1="280" x2="982" y2="280" className="sketch-axis" />{symmetry && <line x1="500" y1="0" x2="500" y2="560" className="sketch-symmetry-line" />}{strokes.map(renderStroke)}{!strokes.length && <text x="500" y="280" textAnchor="middle" className="sketch-empty">Choisissez une géométrie puis dessinez votre drone ici</text>}<text x="30" y="30" className="sketch-label">PLAN DE CONSTRUCTION · {gridVisible ? "GRILLE ACTIVE" : "GRILLE MASQUÉE"}</text></svg></div></div><aside className="sketch-inspector"><div className="inspector-title"><div><p className="eyebrow">INSPECTEUR DE CELLULE</p><h4>{activeStrokeId ? "Objet sélectionné" : toolLabels[tool]}</h4></div><span className="inspector-badge">{strokes.length} OBJETS</span></div><p>{tool === "measure" ? "Tracez une cotation entre deux points pour obtenir une mesure de conception." : tool === "annotation" ? "Saisissez un libellé dans la barre secondaire puis cliquez sur le plan." : "Les outils écrivent des géométries locales, éditables et synchronisées dans le projet."}</p><div className="inspector-cards"><span>ENVERGURE<strong>{config.wingspan.toFixed(2)} m</strong></span><span>FUSELAGE<strong>{config.fuselageLength.toFixed(2)} m</strong></span><span>OBJETS<strong>{strokes.length}</strong></span><span>ÉQUIPEMENTS<strong>{parts.length}</strong></span></div><div className="tool-guide"><strong>RACCOURCIS</strong><small>G · grille / R · symétrie / Suppr · objet sélectionné</small></div><small className="sketch-disclaimer">Le dessin est une géométrie de conception locale. Il ne remplace ni une validation structurelle ni une certification.</small></aside></div>
  </section>;
}
