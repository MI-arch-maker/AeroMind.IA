import { useEffect, useMemo, useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from "react";
import { Box, ChevronDown, ChevronUp, CircleDot, Component, Copy, Eye, GitBranch, Layers3, Maximize2, Move3d, PackagePlus, RotateCcw, Search, Settings2, Sparkles, Wrench, ZoomIn, ZoomOut } from "lucide-react";
import type { ConceptConfig, InstalledMaterial } from "../lib/aeroEngine";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import type { DroneSketchStroke } from "../lib/aeroEngine";
import { hasDroneGeometry } from "../lib/droneSketchGeometry";
import { dronePartCatalog, dronePartCategories, type DronePartCategory } from "../lib/droneParts";
import { useLanguage } from "../contexts/LanguageContext";
import { MechanicalTwinEditor } from "./MechanicalTwinEditor";
import "./virtual-assembly-workshop.css";

type Props = { config: ConceptConfig; setConfig: Dispatch<SetStateAction<ConceptConfig>>; activeProfile?: DroneCatalogDesign; parts?: InstalledMaterial[]; context: "studio" | "construction"; onOpenLibrary?: () => void };
type ViewMode = "assembled" | "exploded" | "relations";
type PartVisual = { id: string; label: string; category: DronePartCategory | "structure"; x: number; y: number; w: number; h: number; color: string; z: number; rotation?: number };
const palette: Record<string, string> = { airframe: "#73ddd1", propulsion: "#edbb62", energy: "#a7d483", avionics: "#8dbcf4", payload: "#e99ab0", "landing-gear": "#ad9de5", safety: "#e49379", hardware: "#9eb5b7", structure: "#72c7da" };
const assemblySteps = [
  { title: "Structure", detail: "Fuselage, empennage et interfaces mécaniques.", target: ["body", "tail"], prerequisites: [] },
  { title: "Propulsion", detail: "Moteur(s), hélices et supports de propulsion.", target: ["motor-", "propulsion"], prerequisites: ["Structure"] },
  { title: "Voilure & interfaces", detail: "Aligner la voilure et contrôler ses interfaces.", target: ["main-wing", "airframe"], prerequisites: ["Structure", "Propulsion"] },
  { title: "Charge utile", detail: "Implanter et vérifier la charge utile sélectionnée.", target: ["payload"], prerequisites: ["Structure"] },
  { title: "Contrôle final", detail: "Revoir la configuration complète avant qualification humaine.", target: ["avionics", "body"], prerequisites: ["Structure", "Propulsion", "Voilure & interfaces", "Charge utile"] },
] as const;

function UserSketchAssemblyLayer({ strokes }: { strokes: DroneSketchStroke[] }) {
  return <svg className="vaw-source-sketch" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Tracé exact du drone réalisé par l’utilisateur">
    <defs><pattern id="vaw-source-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#79d9d0" strokeOpacity=".08"/></pattern></defs>
    <rect width="1000" height="560" fill="url(#vaw-source-grid)"/>
    {strokes.map(stroke => {
      const first = stroke.points[0]; if (!first) return null;
      if (stroke.tool === "annotation") return <text key={stroke.id} x={first.x} y={first.y} fill={stroke.color} fontSize="16">{stroke.label ?? "Repère"}</text>;
      if (stroke.tool === "ellipse" && stroke.points[1]) { const second = stroke.points[1]; return <ellipse key={stroke.id} cx={(first.x + second.x) / 2} cy={(first.y + second.y) / 2} rx={Math.abs(first.x - second.x) / 2} ry={Math.abs(first.y - second.y) / 2} fill={stroke.fill ?? "none"} stroke={stroke.color} strokeWidth={stroke.width} opacity={stroke.opacity ?? 1}/>; }
      if (stroke.tool === "rectangle" && stroke.points[1]) { const second = stroke.points[1]; return <rect key={stroke.id} x={Math.min(first.x, second.x)} y={Math.min(first.y, second.y)} width={Math.abs(first.x - second.x)} height={Math.abs(first.y - second.y)} fill={stroke.fill ?? "none"} stroke={stroke.color} strokeWidth={stroke.width} opacity={stroke.opacity ?? 1}/>; }
      const closed = ["wing", "fuselage", "tail", "payload"].includes(stroke.tool);
      const d = `${stroke.points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ")}${closed ? " Z" : ""}`;
      return <path key={stroke.id} d={d} fill={stroke.fill ?? "none"} stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" opacity={stroke.opacity ?? 1}/>;
    })}
  </svg>;
}

export function VirtualAssemblyWorkshop({ config, setConfig, activeProfile, parts = [], context, onOpenLibrary }: Props) {
  const { t, language } = useLanguage();
  const customGeometry = config.engineeringSelection?.source === "custom" && hasDroneGeometry(config.customSketch?.strokes);
  const activated = Boolean(activeProfile || (config.engineeringSelection?.source === "catalog" && (config.platformProfile || config.airframe)) || customGeometry);
  const sourceStrokes = customGeometry ? (config.customSketch?.strokes ?? []) : [];
  const modelType = (activeProfile?.modelType ?? config.modelType ?? "").toLocaleLowerCase("fr-FR");
  const architectureKey = (activeProfile?.key ?? config.airframe ?? "").toLocaleLowerCase("fr-FR");
  const architectureFamily = (activeProfile?.family ?? "").toLocaleLowerCase("fr-FR");
  const architectureDescriptor = `${modelType} ${architectureKey} ${architectureFamily}`;
  const isVtol = architectureKey === "vtol" || ["vtol", "tiltrotor", "tilt-wing", "tail-sitter"].some(key => architectureDescriptor.includes(key));
  const isFixedWing = !isVtol && (architectureKey === "fixed-wing" || ["aile-volante", "voilure", "planeur", "biplan", "canard", "fixed-wing", "tandem-wing", "wing"].some(key => architectureDescriptor.includes(key)));
  const isMultirotor = !isVtol && !isFixedWing && (architectureKey === "quadcopter" || ["multirotor", "tricopt", "hexacopt", "octocopt", "coaxial", "ducted-fan", "rotor"].some(key => architectureDescriptor.includes(key)));
  const motorCount = Math.max(1, Math.min(12, Math.round(config.motorCount ?? activeProfile?.configuration.motorCount ?? (isFixedWing ? 1 : 4))));
  const [mode, setMode] = useState<ViewMode>(context === "studio" ? "exploded" : "assembled"); const [mechanicalExploded, setMechanicalExploded] = useState(false); const [stageSize, setStageSize] = useState({ width: 0, height: 0 }); const [stageElement, setStageElement] = useState<HTMLDivElement | null>(null); const [selected, setSelected] = useState("body"); const [category, setCategory] = useState<DronePartCategory | "all">("all"); const [query, setQuery] = useState(""); const [componentQuery, setComponentQuery] = useState(""); const [zoom, setZoom] = useState(1); const [orbit, setOrbit] = useState(0); const [explode, setExplode] = useState(62); const [aiOpen, setAiOpen] = useState(context !== "studio"); const [showRelations, setShowRelations] = useState(true); const [activeStep, setActiveStep] = useState(0); const completedSteps = config.assemblyReviewSteps ?? []; const orbitDrag = useRef<{ startX: number; startOrbit: number } | null>(null);
  useEffect(() => { if (!stageElement || context !== "studio") return; const observer = new ResizeObserver(entries => { const entry = entries[0]; if (entry) setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }); }); observer.observe(stageElement); return () => observer.disconnect(); }, [stageElement, context]);
  const fitScale = context === "studio" && stageSize.width > 0 ? Math.min(1, (stageSize.width - 24) / 1010, (stageSize.height - 24) / 476) : 1;
  const installedParts = parts.length ? parts : config.installedMaterials ?? [];
  const catalog = useMemo(() => activated ? dronePartCatalog.filter(part => (category === "all" || part.category === category) && part.label.toLowerCase().includes(query.toLowerCase())).slice(0, 12) : [], [activated, category, query]);
  const visuals = useMemo<PartVisual[]>(() => [
    ...(activated && !customGeometry ? (() => {
      const core: PartVisual[] = [{ id: "body", label: isFixedWing ? "Fuselage / cellule" : "Cellule centrale", category: "structure", x: 410, y: 208, w: 190, h: 66, color: palette.structure, z: 4 }, { id: "avionics", label: "Avionique", category: "avionics", x: 458, y: 211, w: 94, h: 38, color: palette.avionics, z: 5 }, { id: "payload", label: "Charge utile", category: "payload", x: 470, y: 286, w: 70, h: 44, color: palette.payload, z: 3 }];
      if (isFixedWing || isVtol) {
        core.push({ id: "main-wing", label: "Voilure principale", category: "airframe", x: 175, y: 177, w: 660, h: 54, color: palette.airframe, z: 2 }, { id: "tail", label: "Empennage", category: "airframe", x: 458, y: 112, w: 95, h: 76, color: palette.airframe, z: 2 });
      }
      if (isMultirotor || isVtol) {
        const count = motorCount;
        const rotors: PartVisual[] = [];
        for (let i = 0; i < count; i++) {
          const angle = -Math.PI / 2 + i * Math.PI * 2 / count;
          const dx = Math.cos(angle) * (isVtol ? 300 : 265), dy = Math.sin(angle) * (isVtol ? 125 : 150);
          const rotorSize = count > 8 ? 46 : 56;
          rotors.push({ id: `motor-${i + 1}`, label: `Moteur / rotor ${String(i + 1).padStart(2, "0")}`, category: "propulsion", x: 505 + dx - rotorSize / 2, y: 238 + dy - rotorSize / 2, w: rotorSize, h: rotorSize, color: palette.propulsion, z: 6 });
          if (isMultirotor) rotors.push({ id: `arm-${i + 1}`, label: `Bras ${String(i + 1).padStart(2, "0")}`, category: "airframe", x: 505 + dx * .47 - 82, y: 238 + dy * .47 - 8, w: 164, h: 16, color: palette.airframe, z: 1, rotation: Math.atan2(dy, dx) * 180 / Math.PI });
        }
        core.push(...rotors);
      } else {
        const count = motorCount;
        if (count === 1) core.push({ id: "motor-1", label: "Moteur de propulsion", category: "propulsion", x: 480, y: 113, w: 50, h: 50, color: palette.propulsion, z: 6 });
        else for (let i = 0; i < count; i++) { const x = 150 + (i + .5) * (710 / count); core.push({ id: `motor-${i + 1}`, label: `Moteur ${String(i + 1).padStart(2, "0")}`, category: "propulsion", x: x - 24, y: 180, w: 48, h: 48, color: palette.propulsion, z: 6 }); }
      }
      return core;
    })() : []),
    ...(activated ? installedParts : []).map((part, index): PartVisual => ({
      id: part.id,
      label: part.label,
      category: (part.category ?? "structure") as PartVisual["category"],
      x: 70 + (index % 5) * 170 + (part.offsetX ?? 0) * 3,
      y: 340 + Math.floor(index / 5) * 44 + (part.offsetY ?? 0) * 3,
      w: 140 * (part.scale ?? 1),
      h: 32 * (part.scale ?? 1),
      color: palette[part.category ?? "structure"] ?? palette.structure,
      z: 6,
      rotation: part.iddsRotation ?? 0,
    })),
  ], [activated, customGeometry, isFixedWing, isMultirotor, isVtol, motorCount, installedParts]);
  useEffect(() => {
    const materialId = config.engineeringSelection?.materialId;
    if (materialId && installedParts.some(item => item.id === materialId)) setSelected(materialId);
  }, [config.engineeringSelection?.materialId, installedParts]);
  const selectedVisual = visuals.find(item => item.id === selected) ?? { id: "empty", label: "Aucune cellule sélectionnée", category: "structure" as const, x: 0, y: 0, w: 0, h: 0, color: palette.structure, z: 0 };
  const selectVisual = (item: PartVisual) => {
    setSelected(item.id);
    const material = installedParts.find(part => part.id === item.id);
    if (!material) return;
    setConfig(current => ({
      ...current,
      engineeringSelection: {
        ...current.engineeringSelection,
        source: current.engineeringSelection?.source ?? (current.platformProfile ? "catalog" : "custom"),
        droneId: current.engineeringSelection?.droneId ?? current.platformProfile ?? "custom-sketch",
        droneLabel: current.engineeringSelection?.droneLabel ?? current.designName ?? "Drone personnalisé",
        materialId: material.id,
        materialLabel: material.label,
        materialSource: material.catalogSource ?? "concept",
        updatedAt: new Date().toISOString(),
      },
    }));
  };
  const addPart = (part: typeof dronePartCatalog[number]) => { const installed: InstalledMaterial = { ...part, id: `${part.id}-${Date.now()}`, quantity: 1, physicalStatus: "not-verified", catalogSource: "concept" }; setSelected(installed.id); setConfig(current => { const next = [...(current.installedMaterials ?? []), installed]; return { ...current, installedMaterials: next, constructionMassKg: next.reduce((sum, item) => sum + item.massKg * (item.quantity ?? 1), 0), engineeringSelection: { ...current.engineeringSelection, source: current.engineeringSelection?.source ?? "custom", droneId: current.platformProfile ?? current.engineeringSelection?.droneId ?? "custom-sketch", droneLabel: current.engineeringSelection?.droneLabel ?? current.designName ?? "Drone personnalisé", materialId: installed.id, materialLabel: installed.label, materialSource: installed.catalogSource ?? "concept", updatedAt: new Date().toISOString() } }; }); };
  const updateSelectedPart = (patch: Partial<InstalledMaterial>) => {
    if (!installedParts.some(item => item.id === selectedVisual.id)) return;
    setConfig(current => {
      const next = (current.installedMaterials ?? []).map(item => item.id === selectedVisual.id ? { ...item, ...patch } : item);
      return {
        ...current,
        installedMaterials: next,
        constructionMassKg: next.reduce((sum, item) => sum + item.massKg * (item.quantity ?? 1) * (item.scale ?? 1) ** 3, 0),
      };
    });
  };
  const selectedMaterial = installedParts.find(item => item.id === selectedVisual.id);
  const setPartScale = (scale: number) => updateSelectedPart({ scale });
  const offsetFor = (item: PartVisual) => { if (mode !== "exploded") return { x: 0, y: 0 }; const centerX = 505; const centerY = 238; return { x: (item.x + item.w / 2 - centerX) * explode / 100, y: (item.y + item.h / 2 - centerY) * explode / 100 }; };
  const targetForStep = (index: number) => {
    const keys = assemblySteps[index]?.target ?? [];
    return renderedVisuals.find(item => keys.some(key => key === item.id || key === item.category || item.id.startsWith(key))) ?? renderedVisuals[0];
  };
  const chooseAssemblyStep = (index: number) => {
    const bounded = Math.max(0, Math.min(assemblySteps.length - 1, index));
    setActiveStep(bounded);
    setMode("exploded");
    const target = targetForStep(bounded);
    if (target) selectVisual(target);
  };
  const createLayerFromSelection = () => {
    if (!activated) return;
    const answer = window.prompt("Nom du calque créé depuis la sélection", `${selectedVisual.label} · calque`);
    if (!answer?.trim()) return;
    const base = answer.trim();
    const existing = config.studioLayers ?? [];
    const layer = existing.includes(base) ? `${base} ${existing.length + 1}` : base;
    setConfig(current => ({
      ...current,
      studioLayers: [...(current.studioLayers ?? []), layer],
      activeStudioLayer: layer,
      studioLayerSettings: { ...current.studioLayerSettings, [layer]: { visible: true, locked: false } },
      studioLayerAssignments: { ...current.studioLayerAssignments, [selectedVisual.id]: layer },
      installedMaterials: (current.installedMaterials ?? []).map(part => part.id === selectedVisual.id ? { ...part, layer } : part),
    }));
  };
  const layerSettings = (layer: string) => config.studioLayerSettings?.[layer] ?? { visible: true, locked: false };
  const componentGroups = [...new Set(visuals.map(item => item.category))];
  const renderedVisuals = visuals.filter(item => {
    const layer = config.studioLayerAssignments?.[item.id] ?? installedParts.find(part => part.id === item.id)?.layer;
    return !layer || layerSettings(layer).visible;
  });
  const canReviewStep = (index: number) => assemblySteps[index].prerequisites.every(title => completedSteps.includes(title));
  const toggleStepReview = (index: number) => {
    if (!canReviewStep(index)) return;
    const stepId = assemblySteps[index].title;
    setConfig(current => {
      const reviewed = new Set(current.assemblyReviewSteps ?? []);
      if (reviewed.has(stepId)) {
        reviewed.delete(stepId);
        let changed = true;
        while (changed) {
          changed = false;
          for (const step of assemblySteps) {
            if (reviewed.has(step.title) && !step.prerequisites.every(title => reviewed.has(title))) {
              reviewed.delete(step.title);
              changed = true;
            }
          }
        }
      } else {
        reviewed.add(stepId);
      }
      return { ...current, assemblyReviewSteps: assemblySteps.filter(step => reviewed.has(step.title)).map(step => step.title) };
    });
  };
  const updateOrbitDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!orbitDrag.current) return;
    const delta = (event.clientX - orbitDrag.current.startX) * .22;
    setOrbit(Math.max(-30, Math.min(30, orbitDrag.current.startOrbit + delta)));
  };
  if (context === "construction" && activeProfile) {
    return <div className="vaw-mechanical-twin-integration" data-render-source="editable-mechanical-mesh">
      <MechanicalTwinEditor
        design={activeProfile}
        config={config}
        language={language}
        setConfig={setConfig}
        exploded={mechanicalExploded}
        hasProject={false}
        onOpenCatalog={onOpenLibrary ?? (() => document.getElementById("studio-command-deck")?.scrollIntoView({ behavior: "smooth", block: "start" }))}
        onPresentation={presentation => setMechanicalExploded(presentation === "exploded")}
      />
    </div>;
  }
  return <section className={`vaw-shell vaw-${context}`} aria-label={t("Atelier virtuel d’assemblage et de prototypage")}><header className="vaw-header"><div><p className="vaw-kicker"><span /> {context === "studio" ? t("STUDIO DE CONCEPTION") : t("POSTE DE CONSTRUCTION")} / ATELIER D’ASSEMBLAGE</p><h3>{context === "studio" ? t("Studio intégré · conception mécanique & assemblage paramétrique") : t("Prototype Lab · Atelier virtuel 3D")}</h3><small>{customGeometry ? (config.engineeringSelection?.droneLabel ?? config.designName ?? "Dessin utilisateur") : activeProfile?.label ?? config.engineeringSelection?.droneLabel ?? "Aucune cellule sélectionnée"} · {customGeometry ? `${sourceStrokes.length} tracés utilisateur affichés fidèlement` : activated ? `${isVtol ? "VTOL" : isFixedWing ? "Aile fixe" : isMultirotor ? "Multirotor" : architectureKey || modelType} · ${motorCount} moteur(s) pris en compte` : "Scène vierge · sélection catalogue ou dessin requis"}</small></div><div className="vaw-state"><strong>{activated ? "ÉTAT : CONCEPTION" : "ÉTAT : EN ATTENTE"}</strong><span>{activated ? "Modèle numérique · non certifié" : "Sélection bibliothèque ou dessin personnalisé requis"}</span></div></header><div className="vaw-toolbar"><div className="vaw-modes"><strong>VUE</strong>{(["assembled", "exploded", "relations"] as ViewMode[]).map(item => <button key={item} className={mode === item ? "is-active" : ""} onClick={() => setMode(item)}>{item === "assembled" ? "Assemblée" : item === "exploded" ? "Éclatée" : "Relations"}</button>)}</div><div className="vaw-orbit"><Move3d size={14} /><span>ORBIT</span><input type="range" min="-30" max="30" value={orbit} onChange={e => setOrbit(Number(e.target.value))} /><button onClick={() => setZoom(v => Math.max(.7, v - .1))}><ZoomOut size={14} /></button><b>{Math.round(zoom * 100)}%</b><button onClick={() => setZoom(v => Math.min(1.5, v + .1))}><ZoomIn size={14} /></button><button onClick={() => { setOrbit(0); setZoom(1); }}><RotateCcw size={13} /></button></div></div><div className="vaw-body">{context === "studio" && <aside className="vaw-components"><div className="vaw-components-head"><strong>COMPOSANTS</strong><span>{visuals.length.toString().padStart(2, "0")}</span></div><label className="vaw-component-search"><Search size={13}/><input value={componentQuery} onChange={event => setComponentQuery(event.target.value)} placeholder="Rechercher une pièce…" aria-label="Rechercher une pièce"/></label><div className="vaw-component-tree">{componentGroups.map(group => <section key={group}><h5><ChevronDown size={11}/>{group}</h5>{visuals.filter(item => item.category === group && item.label.toLocaleLowerCase("fr").includes(componentQuery.toLocaleLowerCase("fr"))).map(item => <button key={item.id} className={selected === item.id ? "is-active" : ""} onClick={() => selectVisual(item)}><Component size={11}/><span>{item.label}</span>{selected === item.id && <CircleDot size={10}/>}</button>)}</section>)}</div><div className="vaw-layer-list"><header><strong><Layers3 size={12}/> CALQUES</strong><button type="button" onClick={createLayerFromSelection} disabled={!activated} title="Créer un calque à partir de la pièce sélectionnée"><PackagePlus size={13}/></button></header>{(config.studioLayers ?? []).map(layer => { const setting = layerSettings(layer); const count = Object.values(config.studioLayerAssignments ?? {}).filter(value => value === layer).length; return <div key={layer} className={config.activeStudioLayer === layer ? "is-active" : ""}><button className="vaw-layer-name" onClick={() => setConfig(current => ({ ...current, activeStudioLayer: layer }))}><Layers3 size={11}/><span>{layer}</span><small>{count}</small></button><button aria-label={`${setting.visible ? "Masquer" : "Afficher"} ${layer}`} onClick={() => setConfig(current => ({ ...current, studioLayerSettings: { ...current.studioLayerSettings, [layer]: { ...setting, visible: !setting.visible } } }))}>{setting.visible ? <Eye size={11}/> : <Eye size={11}/>}</button></div>})}{!(config.studioLayers ?? []).length && <small>Choisissez une pièce, puis créez son calque.</small>}<button className="vaw-create-layer" disabled={!activated} onClick={createLayerFromSelection}>Créer depuis la sélection</button></div><button className="vaw-open-library" onClick={() => setAiOpen(value => !value)}><PackagePlus size={12}/>{aiOpen ? "Masquer la bibliothèque" : "Ajouter depuis la bibliothèque"}</button></aside>}<div className="vaw-stage-panel"><div className="vaw-stage-top">{!activated && <em className="vaw-empty-state">SÉLECTION HUMAINE REQUISE · SCÈNE VIERGE</em>}<span><CircleDot size={13} /> {customGeometry ? "CROQUIS MAÎTRE · GÉOMÉTRIE EXACTE" : isVtol ? "ARCHITECTURE VTOL" : isFixedWing ? "ARCHITECTURE AILE FIXE" : isMultirotor ? `MULTIROTOR · ${motorCount} ROTORS` : activated ? "CELLULE PARAMÉTRIQUE" : "SOURCE REQUISE"} · {mode.toUpperCase()}</span><span>CAMÉRA {orbit > 0 ? "DROITE" : orbit < 0 ? "GAUCHE" : "CENTRE"}</span></div><div ref={setStageElement} className="vaw-stage" style={{ transform: `scale(${zoom}) rotateY(${orbit}deg)` }} onPointerDown={event => { if (event.button !== 0 || (event.target as HTMLElement).closest(".vaw-part,.vaw-step-pin")) return; orbitDrag.current = { startX: event.clientX, startOrbit: orbit }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={updateOrbitDrag} onPointerUp={() => { orbitDrag.current = null; }} onPointerCancel={() => { orbitDrag.current = null; }}><div className="vaw-floor" /><div className="vaw-axis axis-x" /><div className="vaw-axis axis-y" />{customGeometry && <UserSketchAssemblyLayer strokes={sourceStrokes}/>}<div className="vaw-drone-frame" style={context === "studio" ? { transform: `translate(-50%, -50%) scale(${fitScale})` } : undefined}>{showRelations && mode === "relations" && renderedVisuals.slice(1).map(item => <div key={`rel-${item.id}`} className="vaw-relation-line" style={{ left: `${item.x + item.w / 2}px`, top: `${item.y + item.h / 2}px`, width: `${Math.abs(505 - item.x - item.w / 2)}px`, transform: `rotate(${Math.atan2(238 - item.y - item.h / 2, 505 - item.x - item.w / 2) * 180 / Math.PI}deg)` }} />)}{renderedVisuals.map(item => { const offset = offsetFor(item); return <button key={item.id} className={`vaw-part vaw-part-${item.category} ${item.id.startsWith("arm-") ? "vaw-part-arm" : ""} ${selected === item.id ? "is-selected" : ""}`} style={{ left: item.x + offset.x, top: item.y + offset.y, width: item.w, height: item.h, zIndex: item.z, transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined }} onClick={() => selectVisual(item)} title={item.label}><span style={{ background: item.color }} />{item.category === "propulsion" ? <i className="vaw-rotor" /> : item.category === "structure" ? <i className="vaw-body-shape" /> : null}{!item.id.startsWith("arm-") && <em>{item.label}</em>}</button>; })}{context === "studio" && assemblySteps.map((step, index) => { const target = targetForStep(index); return target ? <button key={`step-${index}`} type="button" className={`vaw-step-pin ${activeStep === index ? "is-active" : ""} ${completedSteps.includes(step.title) ? "is-done" : ""}`} style={{ left: target.x + target.w / 2, top: target.y - 16 }} onClick={() => chooseAssemblyStep(index)} title={`${String(index + 1).padStart(2, "0")} · ${step.title}`}>{String(index + 1).padStart(2, "0")}</button> : null; })}</div>{!activated && <div className="vaw-empty-stage"><strong>SCÈNE VIERGE · SOURCE REQUISE</strong><span>Choisissez un profil de la bibliothèque ou créez votre propre géométrie. Aucun drone générique n’est substitué.</span>{context === "studio" && <div className="vaw-empty-actions"><button type="button" onClick={()=>document.getElementById("studio-command-deck")?.scrollIntoView({behavior:"smooth",block:"start"})}>Ouvrir la bibliothèque</button><button type="button" onClick={()=>document.getElementById("studio-sketch-workbench")?.scrollIntoView({behavior:"smooth",block:"start"})}>Dessiner une cellule</button></div>}</div>}<div className="vaw-stage-readout">ISO / {mode === "exploded" ? `ÉCLATEMENT ${explode}%` : "ASSEMBLAGE NOMINAL"}<small>DRAG CAMÉRA · SÉLECTION PIÈCE · ZOOM</small></div></div>{mode === "exploded" && <label className="vaw-explode-control">ÉCLATEMENT <strong>{explode}%</strong><input type="range" min="0" max="100" value={explode} onChange={e => setExplode(Number(e.target.value))} /></label>}<div className="vaw-stage-legend"><span><i style={{ background: palette.airframe }} /> Structure</span><span><i style={{ background: palette.propulsion }} /> Propulsion</span><span><i style={{ background: palette.avionics }} /> Avionique</span><span><i style={{ background: palette.payload }} /> Mission</span></div></div><aside className="vaw-inspector">{context === "studio" && <section className="vaw-step-detail"><div className="vaw-step-heading"><span>ÉTAPE {String(activeStep + 1).padStart(2, "0")} / {String(assemblySteps.length).padStart(2, "0")}</span><b className={completedSteps.includes(assemblySteps[activeStep].title) ? "is-done" : ""}>{completedSteps.includes(assemblySteps[activeStep].title) ? "TERMINÉE" : "À VÉRIFIER"}</b></div><h4>{assemblySteps[activeStep].title}</h4><p>{assemblySteps[activeStep].detail}</p><strong>PRÉREQUIS</strong>{assemblySteps[activeStep].prerequisites.length ? <ul>{assemblySteps[activeStep].prerequisites.map(item => <li key={item}>{item}</li>)}</ul> : <small>Étape de départ</small>}<button type="button" disabled={!canReviewStep(activeStep) && !completedSteps.includes(assemblySteps[activeStep].title)} onClick={() => toggleStepReview(activeStep)}>{completedSteps.includes(assemblySteps[activeStep].title) ? "Annuler le statut de l’étape" : canReviewStep(activeStep) ? "Marquer comme revue" : "Prérequis à revoir d’abord"}</button><small>État enregistré dans le projet · revue utilisateur, pas une certification technique.</small></section>}<div className="vaw-inspector-title"><div><p className="vaw-kicker">INSPECTEUR DE PIÈCE</p><h4>{selectedVisual.label}</h4></div><Settings2 size={16} /></div><div className="vaw-inspector-grid"><span>CALQUE<strong>{activated ? selectedVisual.category : "—"}</strong></span><span>ÉTAT<strong>{activated ? (selectedVisual.id === "body" ? "SOURCE" : "PRÉVISUALISÉ") : "EN ATTENTE"}</strong></span><span>MÉTRIQUE<strong>{activated ? `${config.wingspan.toFixed(2)} m` : "—"}</strong></span><span>VERSION<strong>{activated ? `v${config.renderSchemaVersion ?? 1}` : "—"}</strong></span></div><label className="vaw-dimension">Échelle géométrique <strong>{(selectedMaterial?.scale ?? 1).toFixed(2)}×</strong><input type="range" min=".5" max="1.5" step=".05" value={selectedMaterial?.scale ?? 1} disabled={!selectedMaterial} onChange={e => setPartScale(Number(e.target.value))} />{!selectedMaterial && <small>Disponible pour les composants installés dans la nomenclature; la cellule canonique reste en lecture seule.</small>}</label>{selectedMaterial && <div className="vaw-transform-controls" aria-label={t("Transformations IDDS de la pièce")}>
<label>{t("Position X")} <output>{selectedMaterial.offsetX ?? 0}</output><input type="range" min="-80" max="80" value={selectedMaterial.offsetX ?? 0} onChange={e => updateSelectedPart({ offsetX: Number(e.target.value) })} /></label>
<label>{t("Position Y")} <output>{selectedMaterial.offsetY ?? 0}</output><input type="range" min="-80" max="80" value={selectedMaterial.offsetY ?? 0} onChange={e => updateSelectedPart({ offsetY: Number(e.target.value) })} /></label>
<label>{t("Rotation")} <output>{selectedMaterial.iddsRotation ?? 0}°</output><input type="range" min="-180" max="180" value={selectedMaterial.iddsRotation ?? 0} onChange={e => updateSelectedPart({ iddsRotation: Number(e.target.value) })} /></label>
</div>}<div className="vaw-inspector-actions"><button onClick={() => setShowRelations(v => !v)}><GitBranch size={13} /> {showRelations ? "Masquer relations" : "Afficher relations"}</button><button onClick={() => setMode("exploded")}><Maximize2 size={13} /> Vue éclatée</button></div><div className="vaw-ai-advice"><Sparkles size={16} /><div><strong>Assistance IA de conception</strong><p>{activated ? "Analyse conceptuelle prête : vérifier les interfaces, la masse et la cohérence des composants avant toute qualification." : "Analyse indisponible : aucune donnée utilisateur activée."}</p><small>IA non connectée · recommandation heuristique locale</small></div></div></aside></div>{context === "studio" && <nav className="vaw-assembly-timeline" aria-label="Séquence d’assemblage"> <div className="vaw-timeline-heading"><div><p className="vaw-kicker">SÉQUENCE D’ASSEMBLAGE · {assemblySteps.length} ÉTAPES</p><strong>{completedSteps.length} / {assemblySteps.length} étapes revues</strong></div><div className="vaw-progress"><i style={{ width: `${completedSteps.filter(item => assemblySteps.some(step => step.title === item)).length / assemblySteps.length * 100}%` }}/></div></div>{assemblySteps.map((step, index) => <button key={step.title} type="button" className={`${activeStep === index ? "is-active" : ""} ${completedSteps.includes(step.title) ? "is-done" : ""}`} onClick={() => chooseAssemblyStep(index)}><b>{String(index + 1).padStart(2, "0")}{completedSteps.includes(step.title) ? " ✓" : ""}</b><span>{step.title}</span><small>{step.detail}</small></button>)}</nav>}{aiOpen && <div className="vaw-library"><div className="vaw-library-head"><div><p className="vaw-kicker">BIBLIOTHÈQUE NUMÉRIQUE</p><h4>Composants de prototypage</h4></div><span>{activated ? `${catalog.length} références visibles · ${parts.length} installées` : "Bibliothèque masquée jusqu’à activation"}</span></div><div className="vaw-library-controls"><label><Search size={13} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un châssis, moteur, capteur…" /></label><select value={category} onChange={e => setCategory(e.target.value as DronePartCategory | "all")}><option value="all">Toutes catégories</option>{dronePartCategories.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div><div className="vaw-library-grid">{catalog.map(part => <article key={part.id}><span className="vaw-library-icon" style={{ background: palette[part.category] }}><Component size={16} /></span><div><strong>{part.label}</strong><small>{part.use}</small><em>{part.massKg.toFixed(3)} kg · {part.catalogSource === "concept" ? "concept" : "catalogue"}</em></div><button onClick={() => addPart(part)} title="Ajouter au prototype"><PackagePlus size={14} /></button></article>)}</div></div>}<div className="vaw-footer"><span><Box size={14} /> Prévisualisation schématique 2,5D · composants édités rattachés au projet · catalogue indicatif</span><span><Wrench size={14} /> Aucune fabrication, commande réelle ou certification automatique</span></div></section>;
}
