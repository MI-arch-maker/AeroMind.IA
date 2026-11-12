import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, Box, CheckCircle2, ChevronRight, CircleDot, Clock3,
  Cpu, Factory, FileCheck2, Gauge, Layers3, LifeBuoy, ListChecks, PackageCheck,
  Pause, Play, RefreshCw, ScanLine, Settings2, ShieldCheck, Thermometer,
  Upload, Wifi, Wrench, XCircle, Zap,
} from "lucide-react";
import { MechanicalTwinViewport, type MechanicalView } from "@/components/MechanicalTwinViewport";
import { defaultConcept, type ConceptConfig } from "@/lib/aeroEngine";
import { droneCatalog } from "@/lib/droneCatalog";
import { buildMechanicalModel, type MechanicalModel } from "@/lib/mechanicalTwinGeometry";
import ProductionFlowPanel from "./ProductionFlowPanel";
import PrinterConnectionIntake from "./PrinterConnectionIntake";
import "./virtual-parametric-factory.css";

type Section = "overview" | "printer" | "engine" | "workspace" | "materials" | "lab" | "jobs" | "simulator" | "planner" | "quality" | "history";
type Mode = "DEMO" | "SIMULATION" | "PHYSICAL PRODUCTION";

const nav: Array<{ id: Section; label: string; icon: typeof Factory }> = [
  { id: "overview", label: "FACTORY OVERVIEW", icon: Factory },
  { id: "printer", label: "VIRTUAL 3D PRINTER", icon: Box },
  { id: "engine", label: "PARAMETRIC ENGINE", icon: Settings2 },
  { id: "workspace", label: "DRONE WORKSPACE", icon: Layers3 },
  { id: "materials", label: "MATERIAL INVENTORY", icon: PackageCheck },
  { id: "lab", label: "PHYSICAL LAB CONNECTION", icon: Wifi },
  { id: "jobs", label: "PRINT JOB MANAGER", icon: ListChecks },
  { id: "simulator", label: "PRINTING SIMULATOR", icon: Play },
  { id: "planner", label: "MANUFACTURING PLANNER", icon: ScanLine },
  { id: "quality", label: "QUALITY CONTROL", icon: ShieldCheck },
  { id: "history", label: "PRODUCTION HISTORY", icon: Clock3 },
];

const materials = [
  ["PLA industriel", "AeroFilament / PLA-IND-01", "2.4 kg", "READY", "#86d5a5"],
  ["PETG", "PolyPrint / PETG-042", "0.8 kg", "LOW STOCK", "#edbd73"],
  ["PA-CF", "CarbonWerk / PA-CF-09", "1.2 kg", "READY", "#86d5a5"],
  ["Résine technique", "ResinLab / SLA-TX-07", "0.0 L", "MISSING", "#f17e78"],
];
const equipment = [
  ["FDM-01 / virtual", "Machine virtuelle simulée", "SIMULATION", "#75e2dc"],
  ["FDM-02 / lab", "Aucune communication vérifiée", "NON CONFIGURÉ", "#829a9b"],
  ["Dryer-01", "Séchage matériaux", "EN ATTENTE DE CONNEXION", "#edbd73"],
  ["QC-Station", "Contrôle dimensionnel", "INDISPONIBLE", "#f17e78"],
];
const factoryDesignOptions = droneCatalog.filter(design => design.origin === "aeromind-parametric" && design.role === "civil").slice(0, 18);


function Status({ children, tone = "cyan" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`vpf-status vpf-status-${tone}`}><CircleDot size={10} />{children}</span>;
}
function Metric({ label, value, detail, tone = "cyan" }: { label: string; value: string; detail: string; tone?: string }) {
  return <div className="vpf-metric"><span>{label}</span><strong className={`tone-${tone}`}>{value}</strong><small>{detail}</small></div>;
}
function PrinterScene({ progress = 0, view = "3D ISOMETRIC" }: { progress?: number; view?: string }) {
  return <div className="printer-scene">
    <div className="scene-header"><span>LIVE DIGITAL TWIN / FDM-01</span><Status>VIRTUAL</Status></div>
    <div className="printer-frame" data-view={view}><div className="printer-model"><div className="gantry gantry-x"><i /><i /><i /></div><div className="rail rail-left" /><div className="rail rail-right" /><div className="head"><div className="nozzle" /><span>PRINT HEAD</span></div><div className="bed">{progress > 0 && <div className="part"><b /><b /><b /><b /><em /></div>}<div className="grid-lines" /></div></div><div className="axis axis-x">X 420 mm</div><div className="axis axis-y">Y 420 mm</div><div className="axis axis-z">Z 380 mm</div><div className="scene-view-label">{view} · VIRTUAL CAMERA</div></div>
    <div className="scene-footer"><span><i className="pulse" /> LAYER 42 / 64</span><span>TOOLPATH 12.8 m</span><span>{progress}% COMPLETE</span></div>
  </div>;
}

function VirtualCalibrationNote() {
  const [logged, setLogged] = useState(false);
  return <div className="vpf-calibration-note-control"><button type="button" className="secondary-btn full" aria-pressed={logged} onClick={() => setLogged(true)}><ScanLine size={15} /> {logged ? "NOTE DE REVUE AJOUTÉE" : "AJOUTER UNE NOTE DE REVUE VIRTUELLE"}</button><p>Cette action ne calibre pas la machine et ne lit aucun capteur; elle marque uniquement une revue locale de la maquette.</p>{logged && <p className="vpf-local-note" role="status">Note locale enregistrée dans l’état de cette vue · matériel non calibré.</p>}</div>;
}

type FactoryView = "concept" | MechanicalView;
const factoryViewProjection: Record<FactoryView, MechanicalView> = { concept: "iso", iso: "iso", top: "top", front: "front", side: "side" };
function DesignWorkbench({ onAction, onSelectionChange }: { onAction: (message: string) => void; onSelectionChange: (selected: boolean) => void }) {
  const [designId, setDesignId] = useState("");
  const [parameters, setParameters] = useState({ wingspan: 0, chord: 0, fuselageLength: 0, propDiameter: 0 });
  const [view, setView] = useState<FactoryView>("concept");
  const [renderMode, setRenderMode] = useState<"solid" | "wireframe">("solid");
  const [exploded, setExploded] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [scaleDenominator, setScaleDenominator] = useState(25);
  const baseDesign = useMemo(() => factoryDesignOptions.find(item => item.id === designId), [designId]);
  const selectedConfig = useMemo<ConceptConfig | null>(() => baseDesign ? {
    ...defaultConcept,
    ...baseDesign.configuration,
    ...parameters,
    airframe: baseDesign.key,
    modelType: baseDesign.modelType as ConceptConfig["modelType"],
    motorCount: baseDesign.configuration.motorCount ?? defaultConcept.motorCount,
    designName: baseDesign.label,
  } : null, [baseDesign, parameters]);
  const mechanicalModel = useMemo<MechanicalModel | null>(() => baseDesign && selectedConfig ? buildMechanicalModel(baseDesign, selectedConfig) : null, [baseDesign, selectedConfig]);
  const chooseDesign = (id: string) => {
    setDesignId(id);
    onSelectionChange(Boolean(id));
    const design = factoryDesignOptions.find(item => item.id === id);
    if (design) setParameters({
      wingspan: design.configuration.wingspan ?? 2,
      chord: design.configuration.chord ?? 0.32,
      fuselageLength: design.configuration.fuselageLength ?? 1.2,
      propDiameter: design.configuration.propDiameter ?? 0.36,
    });
    else setParameters({ wingspan: 0, chord: 0, fuselageLength: 0, propDiameter: 0 });
  };
  const reset = () => {
    chooseDesign("");
    setView("concept");
    setRenderMode("solid");
    setExploded(false);
    setShowGrid(true);
    setScaleDenominator(25);
    onAction("Aperçu mécanique réinitialisé — aucune cellule active");
  };
  const dimensionRows: Array<[string, number, string]> = selectedConfig ? [
    ["Envergure", selectedConfig.wingspan, "m"],
    ["Longueur fuselage", selectedConfig.fuselageLength, "m"],
    ["Corde de référence", selectedConfig.chord, "m"],
    ["Diamètre hélice", selectedConfig.propDiameter, "m"],
  ] : [];
  const visibleSpan = mechanicalModel?.span ?? selectedConfig?.wingspan ?? 0;
  const scaleBarCssPx = 140;
  const scaleBarValue = scaleBarCssPx / (96 / 25.4) * scaleDenominator / 1000;
  return <section className="vpf-workbench panel">
    <div className="panel-title"><div><span className="eyebrow">AEROMIND · JUMEAU MÉCANIQUE PARAMÉTRIQUE</span><h2>ATELIER DE CONCEPTION / CELLULE</h2></div><Status tone="amber">APERÇU · NON CERTIFIÉ</Status></div>
    <p className="vpf-section-note">Géométrie issue du catalogue AeroMind sélectionné. Les cotes sont en mètres SI ; les réglages restent locaux et ne modifient aucun projet.</p>
    <div className="vpf-workbench-grid">
      <div className="vpf-model-stage vpf-mechanical-stage" data-grid={showGrid ? "on" : "off"}>
        {mechanicalModel ? <MechanicalTwinViewport key={`${mechanicalModel.designId}-${view}-${renderMode}`} model={mechanicalModel} selected="" onSelect={() => undefined} view={factoryViewProjection[view]} mode={renderMode} explosion={exploded ? 0.65 : 0} resetKey={0} xrayCut={1} xrayOpacity={{}} readOnly /> : <div className="vpf-no-design" role="status"><Box size={30} /><strong>AUCUNE CELLULE SÉLECTIONNÉE</strong><span>Sélectionnez une architecture pour générer son jumeau mécanique paramétrique AeroMind. Aucune maquette illustrative de substitution n’est affichée.</span></div>}
        {mechanicalModel && <><div className="vpf-model-overlay"><span>{view === "concept" ? "CONCEPT · JUMEAU MÉCANIQUE" : view === "iso" ? "ISOMÉTRIQUE · ASSEMBLAGE" : `${view === "top" ? "PLAN / DESSUS" : view === "front" ? "VUE DE FACE" : "VUE DE PROFIL"} · COTÉE`}</span><b>{baseDesign?.label}</b></div>{view !== "concept" && <div className="vpf-scale-overlay" aria-label={`Échelle métrique de référence 1 pour ${scaleDenominator}`}><span>ÉCHELLE DE PLAN · 1:{scaleDenominator} · RÉF. ÉCRAN 96 PPP</span><div className="vpf-scale-rule"><i style={{ width: `${scaleBarCssPx}px` }} /><b>0</b><b>{scaleBarValue.toFixed(2)} m</b></div><small>Envergure réelle {mechanicalModel.span.toFixed(2)} m · longueur réelle {mechanicalModel.length.toFixed(2)} m · cotes en SI</small></div>}</>}
      </div>
      <aside className="vpf-model-controls">
        <div className="vpf-control-heading"><span>PROFIL &amp; PARAMÈTRES</span><button type="button" onClick={reset} title="Réinitialiser l’aperçu"><RefreshCw size={14} /> Effacer</button></div>
        <label className="vpf-control-field">Architecture de référence<select value={designId} onChange={event => chooseDesign(event.target.value)}><option value="">Aucune cellule sélectionnée</option>{factoryDesignOptions.map(item => <option key={item.id} value={item.id}>{item.label} · {item.key === "fixed-wing" ? "Voilure fixe" : item.key === "quadcopter" ? "Multirotor" : "VTOL hybride"} · {item.mission}</option>)}</select></label>
        {baseDesign && selectedConfig ? <>
          <div className="vpf-view-selector" role="group" aria-label="Projection mécanique">{([["concept", "Concept"], ["iso", "Isométrique"], ["top", "Plan / dessus"], ["front", "Face"], ["side", "Profil"]] as Array<[FactoryView, string]>).map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}</div>
          <label className="vpf-control-field">Rendu mécanique<select value={renderMode} onChange={event => setRenderMode(event.target.value as "solid" | "wireframe")}><option value="solid">Solide paramétrique</option><option value="wireframe">Filaire / structure</option></select></label>
          {dimensionRows.map(([label, value, unit]) => <label className="vpf-range-field" key={label}><span>{label}<strong>{Number(value).toFixed(2)} {unit}</strong></span><input aria-label={label} type="range" min={label === "Envergure" ? 0.7 : label === "Longueur fuselage" ? 0.45 : 0.1} max={label === "Envergure" ? 6 : label === "Longueur fuselage" ? 4.5 : label === "Corde de référence" ? 0.9 : 1.2} step="0.01" value={Number(value)} onChange={event => setParameters(current => ({ ...current, [label === "Envergure" ? "wingspan" : label === "Longueur fuselage" ? "fuselageLength" : label === "Corde de référence" ? "chord" : "propDiameter"]: Number(event.target.value) }))} /></label>)}
          {view !== "concept" && <label className="vpf-control-field">Échelle de référence<select value={scaleDenominator} onChange={event => setScaleDenominator(Number(event.target.value))}><option value={10}>1:10 · détail</option><option value={25}>1:25 · atelier</option><option value={50}>1:50 · plan</option><option value={100}>1:100 · vue d’ensemble</option></select></label>}
          <div className="vpf-dimension-summary"><strong>NOMENCLATURE GÉOMÉTRIQUE</strong><span>{mechanicalModel?.parts.filter(part => !part.hidden).length ?? 0} pièces maillées · {selectedConfig.motorCount ?? 1} motorisation(s)</span><small>Longueur {mechanicalModel?.length.toFixed(2) ?? "—"} m × envergure {mechanicalModel?.span.toFixed(2) ?? "—"} m · Z = vertical</small></div>
        </> : <div className="vpf-model-disclaimer"><ShieldCheck size={16} /><span>Les commandes mécaniques et cotes apparaîtront uniquement après sélection d’une architecture.</span></div>}
        <div className="vpf-toggle-row"><span>Grille de référence</span><button type="button" aria-pressed={showGrid} onClick={() => setShowGrid(value => !value)}>{showGrid ? "ACTIVÉE" : "DÉSACTIVÉE"}</button></div>
        <div className="vpf-toggle-row"><span>Vue éclatée mécanique</span><button type="button" aria-pressed={exploded} onClick={() => setExploded(value => !value)} disabled={!mechanicalModel}>{exploded ? "ACTIVÉE" : "DÉSACTIVÉE"}</button></div>
        <div className="vpf-model-disclaimer"><ShieldCheck size={16} /><span>Maquette de conception, non certifiée et non fabricable sans validation d’ingénierie. Aucune commande matérielle.</span></div>
      </aside>
    </div>
  </section>;
}
export default function VirtualParametricFactory() {
  const [section, setSection] = useState<Section>("overview");
  const [mode, setMode] = useState<Mode>("SIMULATION");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasSelectedCell, setHasSelectedCell] = useState(false);
  const [printerView, setPrinterView] = useState("3D ISOMETRIC");
  const [slowMotion, setSlowMotion] = useState(false);
  const [toast, setToast] = useState("Aucun projet ni cellule sélectionné — aperçu neutre");
  const sectionTitle = nav.find(item => item.id === section)?.label ?? "FACTORY OVERVIEW";
  const announce = (message: string) => { setToast(message); window.setTimeout(() => setToast("Aucun projet ni cellule sélectionné — aperçu neutre"), 2800); };
  const readiness = useMemo(() => equipment.filter(item => item[2] === "PRÊT À UTILISER" || item[2] === "COMMUNICATION VALIDÉE").length, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setProgress(value => value >= 100 ? 0 : Math.min(100, value + (slowMotion ? 0.35 : 1.2))), 1000);
    return () => window.clearInterval(timer);
  }, [running, slowMotion]);
  const simulate = () => { setRunning(value => !value); announce(running ? "Simulation virtuelle mise en pause" : `Simulation virtuelle démarrée${slowMotion ? " · ralenti" : ""}`); };
  const toggleSlowMotion = () => { setSlowMotion(value => !value); announce(slowMotion ? "Vitesse normale activée" : "Ralenti activé — inspection détaillée de trajectoire"); };
  return <div className="vpf-shell">
    <aside className="vpf-sidebar"><div className="vpf-brand"><div className="vpf-mark">A</div><div><strong>AEROMIND.IA</strong><span>VIRTUAL FACTORY / APERÇU</span></div></div><div className="vpf-rule" /><div className="vpf-plant"><Factory size={15} /><div><small>PLANT INSTANCE</small><strong>AP-3D / DÉMONSTRATION</strong></div><span className="live-dot" /></div><nav>{nav.map(item => { const Icon = item.icon; return <button key={item.id} title={item.label} aria-current={section === item.id ? "page" : undefined} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><Icon size={16} /><span>{item.label}</span>{item.id === "lab" && <b>4</b>}</button>; })}</nav><div className="vpf-sidebar-bottom"><Status tone="green">VIRTUAL ONLY</Status><small>Physical control is locked</small><button className="support-btn" onClick={() => setSection("history")}> <LifeBuoy size={15} /> SAFETY & AUDIT</button></div></aside>
    <main className="vpf-main"><header className="vpf-topbar"><div><span className="eyebrow">AEROMIND / INDUSTRIAL DIGITAL THREAD</span><h1>{sectionTitle}</h1></div><div className="vpf-actions"><div className="mode-switch">{(["DEMO", "SIMULATION", "PHYSICAL PRODUCTION"] as Mode[]).map(item => <button key={item} type="button" title={item === "PHYSICAL PRODUCTION" ? "Parcours de production simulé uniquement · aucune liaison machine" : undefined} aria-pressed={mode === item} className={`${mode === item ? "selected" : ""} ${item === "PHYSICAL PRODUCTION" ? "simulated" : ""}`} onClick={() => { setMode(item); if (item === "PHYSICAL PRODUCTION") { setSection("simulator"); announce("Mode PHYSICAL PRODUCTION sélectionné · simulation isolée, aucun équipement connecté"); } else announce(`Mode ${item} actif`); }}>{item === "PHYSICAL PRODUCTION" ? "PHYSICAL · SIMULATED" : item}</button>)}</div><button className="icon-btn" title="Réinitialiser la simulation locale" aria-label="Réinitialiser la simulation locale" onClick={() => { setProgress(0); setRunning(false); announce("Simulation locale réinitialisée — aucune donnée physique modifiée"); }}><RefreshCw size={16} /></button><div className="operator"><span className="avatar">OP</span><span><b>Session locale</b><small>MODE : APERÇU</small></span></div></div></header><div className="vpf-content">
      <div className="vpf-banner"><div><AlertTriangle size={16} /><span><strong>ENVIRONNEMENT VIRTUEL</strong> — Toute la production affichée est simulée. Aucune commande ne sera transmise à un équipement physique.</span></div><Status tone="amber">READINESS {readiness}/4</Status></div>
      {section === "overview" && <><section className="metric-grid"><Metric label="PROJET ACTIF" value="AUCUN" detail="Sélectionnez un projet pour configurer une cellule" /><Metric label="ESTIMATED TIME" value="02:14:38" detail="Estimation de démonstration" tone="blue" /><Metric label="STOCK DÉMO" value="74%" detail="Valeur illustrative · non mesurée" tone="green" /><Metric label="LAB READINESS" value={`${readiness * 25}%`} detail="No physical link verified" tone="amber" /></section><div className="overview-grid"><div className="panel panel-wide"><div className="panel-title"><div><span className="eyebrow">MACHINE CONTROL CENTER</span><h2>FDM-01 / LARGE FORMAT VIRTUAL PRINTER</h2></div><Status tone={running ? "green" : "amber"}>{running ? "SIMULATION RUNNING" : "SIMULATION PAUSED"}</Status></div><PrinterScene progress={progress} view={printerView} /><div className="control-row"><button className="primary-btn" onClick={simulate}>{running ? <Pause size={15} /> : <Play size={15} />}{running ? "PAUSE SIMULATION" : progress > 0 ? "RESUME SIMULATION" : "START SIMULATION"}</button><button className="secondary-btn" onClick={() => { setProgress(0); setRunning(false); announce("Simulation reset — modèle inchangé"); }}><RefreshCw size={15} /> RESET</button><span className="control-note"><Thermometer size={14} /> Virtual profile · No physical sensors <i /> Layer {Math.min(64, Math.floor(progress * .64))}/64</span></div></div><div className="panel"><div className="panel-title"><div><span className="eyebrow">PRODUCTION QUEUE</span><h2>PRINT JOB MANAGER</h2></div><button className="text-btn" onClick={() => setSection("jobs")}>VIEW ALL <ChevronRight size={13} /></button></div><div className="vpf-empty-record"><Box size={18} /><strong>AUCUN ORDRE DE FABRICATION</strong><span>Aucune cellule n’est chargée ou configurée par défaut.</span></div></div></div><div className="lower-grid"><div className="panel"><div className="panel-title"><div><span className="eyebrow">MATERIAL INVENTORY</span><h2>STOCK & COMPATIBILITY</h2></div><button className="text-btn" onClick={() => setSection("materials")}>OPEN <ChevronRight size={13} /></button></div>{materials.slice(0, 3).map(item => <div className="inventory-row" key={item[0]}><span className="material-dot" style={{ background: item[4] }} /><div><b>{item[0]}</b><small>{item[1]}</small></div><strong>{item[2]}</strong><Status tone={item[3] === "READY" ? "green" : item[3] === "LOW STOCK" ? "amber" : "coral"}>{item[3]}</Status></div>)}</div><div className="panel"><div className="panel-title"><div><span className="eyebrow">DONNÉES DE DÉMONSTRATION</span><h2>INDICATEURS SIMULÉS</h2></div><Status tone="amber">DÉMO</Status></div><div className="health-line"><Gauge size={17} /><span>CPU / RENDER PIPELINE</span><b>42%</b><div className="bar"><i style={{ width: "42%" }} /></div></div><div className="health-line"><Activity size={17} /><span>PARAMETRIC ENGINE</span><b>READY</b><div className="bar green"><i style={{ width: "94%" }} /></div></div><div className="health-line"><ShieldCheck size={17} /><span>SAFETY INTERLOCKS</span><b>ACTIVE</b><div className="bar blue"><i style={{ width: "100%" }} /></div></div></div></div></>}
      {section === "printer" && <div className="detail-layout"><div className="panel panel-wide"><div className="panel-title"><div><span className="eyebrow">DIGITAL TWIN / MACHINE MODEL</span><h2>PARAMETRIC 3D PRINTER ASSEMBLY</h2></div><Status>VIRTUAL MODEL</Status></div><PrinterScene progress={progress} view={printerView} /><div className="view-tabs">{["3D ISOMETRIC", "TOP VIEW", "FRONT VIEW", "SIDE VIEW", "LAYER INSPECTION"].map(view => <button key={view} aria-pressed={printerView === view} className={printerView === view ? "active" : ""} onClick={() => { setPrinterView(view); announce(`${view} activée — jumeau numérique`); }}>{view}</button>)}</div></div><div className="panel spec-panel"><span className="eyebrow">MACHINE SPECIFICATION</span><h2>AP-3D 420 / VIRTUAL</h2>{[["BUILD VOLUME","420 × 420 × 380 mm"],["AXIS STATE","X 124 · Y 210 · Z 86 mm"],["NOZZLE","0.6 mm / 218°C"],["BED","PEI FLEX / 62°C"],["CALIBRATION","NON VÉRIFIÉ · DÉMO"],["MATERIAL","PA-CF / LOT CF-09"]].map(row => <div className="spec-row" key={row[0]}><span>{row[0]}</span><b>{row[1]}</b></div>)}<VirtualCalibrationNote /></div></div>}
      {section === "engine" && <EnginePanel onAction={announce} />}
      <div style={{ display: section === "workspace" ? "block" : "none" }}><WorkspacePanel onAction={announce} onSelectionChange={setHasSelectedCell} /></div>
      {section === "materials" && <MaterialsPanel onAction={announce} />}
      {section === "lab" && <LabPanel onAction={announce} />}
      {section === "jobs" && <JobsPanel onAction={announce} />}
      {section === "simulator" && (mode === "PHYSICAL PRODUCTION" ? <ProductionFlowPanel hasSelectedCell={hasSelectedCell} onOpenWorkspace={() => setSection("workspace")} onNotice={announce} /> : <SimulatorPanel progress={progress} running={running} slowMotion={slowMotion} view={printerView} hasSelectedCell={hasSelectedCell} onToggle={simulate} onToggleSlowMotion={toggleSlowMotion} onReset={() => { setProgress(0); setRunning(false); announce("Simulation réinitialisée"); }} />)}
      {section === "planner" && <PlannerPanel onAction={announce} />}
      {section === "quality" && <QualityPanel onAction={announce} />}
      {section === "history" && <HistoryPanel />}
    </div><footer className="vpf-footer"><span><i className="pulse" /> APERÇU LOCAL ACTIF</span><span>SESSION DE DÉMONSTRATION</span><span>AUCUNE SYNCHRONISATION SERVEUR</span><b>{toast}</b></footer></main>
  </div>;
}

function JobRow({ id, title, status, tone, progress }: { id: string; title: string; status: string; tone: string; progress: string }) { return <div className="job-row"><div className="job-icon"><Box size={15} /></div><div><b>{id}</b><span>{title}</span></div><Status tone={tone}>{status}</Status><strong>{progress}</strong></div>; }
function EnginePanel({ onAction }: { onAction: (s: string) => void }) { return <div className="panel"><PanelHead eyebrow="PARAMETRIC & MECHANICAL ENGINE" title="AUCUNE CELLULE CHARGÉE" status="SÉLECTION REQUISE" /><div className="vpf-empty-record"><Box size={22} /><strong>AUCUNE CONFIGURATION PAR DÉFAUT</strong><span>Le pipeline paramétrique et mécanique restera neutre jusqu’à la sélection d’un projet et d’une cellule.</span></div><button className="secondary-btn" type="button" onClick={() => onAction("Pipeline prêt — en attente d’une sélection explicite de cellule")}>VÉRIFIER LA DISPONIBILITÉ DU PIPELINE</button></div>; }
function WorkspacePanel({ onAction, onSelectionChange }: { onAction: (s: string) => void; onSelectionChange: (selected: boolean) => void }) { const [selectedPart, setSelectedPart] = useState(""); const parts = ["Structures & chassis", "Drone arms", "Motor mounts", "Sensor brackets", "Electronics housings", "Antenna supports", "Protection elements", "Camera mounts", "Fasteners", "Custom non-structural"]; return <div className="vpf-workspace-stack"><DesignWorkbench onAction={onAction} onSelectionChange={onSelectionChange} /><section className="panel"><PanelHead eyebrow="DRONE PRODUCTION WORKSPACE" title="PART CATALOG / AIRFRAME" status="10 CATEGORIES" /><p className="vpf-section-note">Choisissez une famille pour ouvrir sa fiche de revue. Une sélection n’ajoute pas de cellule au compte.</p><div className="part-grid">{parts.map((part, i) => <button key={part} aria-pressed={selectedPart === part} className={selectedPart === part ? "selected" : ""} onClick={() => { setSelectedPart(part); onAction(`${part} sélectionné — fiche de revue chargée`); }}><span className="part-number">{String(i + 1).padStart(2, "0")}</span><Box size={19} /><b>{part}</b><small>{i < 4 ? "REVUE MÉCANIQUE REQUISE" : "FICHE DOCUMENTÉE"}</small></button>)}</div>{selectedPart && <div className="vpf-selection-detail" role="status"><strong>{selectedPart}</strong><span>Élément de catalogue sélectionné · état : brouillon de revue · aucune modification enregistrée.</span><button type="button" onClick={() => setSelectedPart("")}>Effacer la sélection</button></div>}</section></div>; }
function MaterialsPanel({ onAction }: { onAction: (s: string) => void }) { const [materialLotOpen, setMaterialLotOpen] = useState(false); const [materialName, setMaterialName] = useState(""); const [quantity, setQuantity] = useState(""); const [extraMaterials, setExtraMaterials] = useState<Array<[string, string, string, string, string]>>([]); const materialRows = [...materials, ...extraMaterials]; const registerMaterial = () => { const name = materialName.trim(); if (!name || Number(quantity) <= 0) return; setExtraMaterials(rows => [...rows, [name, "Enregistrement local AeroMind", `${Number(quantity).toFixed(1)} kg/L`, "PENDING REVIEW", "#edbd73"]]); setMaterialName(""); setQuantity(""); setMaterialLotOpen(false); onAction("Lot ajouté au brouillon local — aucune validation physique ni persistance serveur"); }; return <div className="panel"><PanelHead eyebrow="PHYSICAL LABORATORY MATERIAL CONNECTION CENTER" title="MATERIAL INVENTORY" status={`${materialRows.filter(item => item[3] === "READY").length} READY / ${materialRows.filter(item => item[3] !== "READY").length} À VÉRIFIER`} /><div className="vpf-local-note">Registre de démonstration local à cette session · aucune quantité réelle vérifiée.</div><div className="table"><div className="table-head"><span>MATERIAL / SUPPLIER</span><span>LOT</span><span>STOCK</span><span>COMPATIBILITY</span><span>STATUS</span></div>{materialRows.map((item, index) => <div className="table-row" key={`${item[0]}-${index}`}><div><b>{item[0]}</b><small>{item[1]}</small></div><span>{index < materials.length ? `2026-10-${item[0].length + 10}` : "BROUILLON LOCAL"}</span><strong>{item[2]}</strong><span>{index < materials.length ? "FDM-01 · FDM-02" : "NON ÉVALUÉE"}</span><Status tone={item[3] === "READY" ? "green" : item[3] === "LOW STOCK" ? "amber" : "amber"}>{item[3]}</Status></div>)}</div><button className="secondary-btn" onClick={() => setMaterialLotOpen(value => !value)}><Upload size={15} /> {materialLotOpen ? "FERMER LE FORMULAIRE" : "AJOUTER UN LOT AU BROUILLON"}</button>{materialLotOpen && <form className="material-form" onSubmit={event => { event.preventDefault(); registerMaterial(); }}><label>MATÉRIAU / RÉFÉRENCE<input required value={materialName} onChange={event => setMaterialName(event.target.value)} placeholder="Ex. PA-CF / lot CF-10" /></label><label>QUANTITÉ DÉCLARÉE<input required type="number" min="0.1" step="0.1" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="kg ou L" /></label><button className="primary-btn" type="submit"><FileCheck2 size={15} /> AJOUTER AU BROUILLON</button></form>}</div>; }
function LabPanel({ onAction }: { onAction: (s: string) => void }) { const [checks, setChecks] = useState<Record<string, string>>({}); return <div className="panel"><PanelHead eyebrow="PHYSICAL LABORATORY MATERIAL CONNECTION CENTER" title="EQUIPMENT READINESS" status="LABORATORY READINESS SCORE 12%" /><div className="vpf-local-note">Les contrôles ci-dessous vérifient uniquement les métadonnées affichées; ils n’ouvrent aucune liaison matérielle.</div><div className="lab-grid">{equipment.map(item => <div className="equipment" key={item[0]}><div className="equip-icon"><Cpu size={20} /></div><div><b>{item[0]}</b><span>{item[1]}</span><Status tone={checks[item[0]] ? "amber" : item[3] === "#75e2dc" ? "cyan" : item[3] === "#edbd73" ? "amber" : "muted"}>{checks[item[0]] ? `REVUE ${checks[item[0]]}` : item[2]}</Status></div><button title={`Vérifier localement ${item[0]}`} aria-label={`Vérifier localement ${item[0]}`} onClick={() => { const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); setChecks(current => ({ ...current, [item[0]]: time })); onAction(`${item[0]} : contrôle de métadonnées horodaté, sans communication physique`); }}><RefreshCw size={14} /></button></div>)}</div><div className="safety-note"><ShieldCheck size={18} /><span><b>PHYSICAL CONTROL LOCKED</b> — Aucun adaptateur matériel n’est installé ou vérifié. Les transports USB/série et réseau sont uniquement des profils de réception; aucune liaison ni commande n’est active.</span></div><PrinterConnectionIntake /></div>; }
function JobsPanel({ onAction }: { onAction: (s: string) => void }) { return <div className="panel"><PanelHead eyebrow="PRINT JOB MANAGER" title="PRODUCTION ORDERS" status="AUCUN ORDRE SÉLECTIONNÉ" /><div className="workflow-strip">{["DRAFT", "SUBMITTED", "DESIGN VALIDATION", "MATERIAL CHECK", "MACHINE CHECK", "SIMULATION", "APPROVAL", "QUEUED", "PRINTING", "QUALITY CONTROL", "COMPLETED"].map((s, i) => <span className={i < 9 ? "reached" : ""} key={s}>{s}</span>)}</div><div className="vpf-empty-record"><Box size={18} /><strong>AUCUN ORDRE DE FABRICATION</strong><span>Les ordres apparaîtront après sélection explicite d’un projet et d’une cellule.</span></div></div>; }
function SimulatorPanel({ progress, running, slowMotion, view, hasSelectedCell, onToggle, onToggleSlowMotion, onReset }: { progress: number; running: boolean; slowMotion: boolean; view: string; hasSelectedCell: boolean; onToggle: () => void; onToggleSlowMotion: () => void; onReset: () => void }) {
  return <div className="detail-layout"><div className="panel panel-wide"><PanelHead eyebrow="VIRTUAL PRINTING SIMULATOR" title="TOOLPATH EXECUTION / AUCUNE CELLULE" status={running ? "RUNNING" : "PAUSED"} /><PrinterScene progress={progress} view={view} /><div className="sim-controls"><button className="primary-btn" disabled={!hasSelectedCell && !running} title={!hasSelectedCell ? "Sélectionnez d’abord une cellule dans l’atelier" : undefined} onClick={onToggle}>{running ? <Pause size={15} /> : <Play size={15} />}{running ? "PAUSE SIMULATION" : progress > 0 ? "RESUME SIMULATION" : "START SIMULATION"}</button><button className="secondary-btn" onClick={onReset}><RefreshCw size={15} /> RESET</button><button className="secondary-btn" aria-pressed={slowMotion} onClick={onToggleSlowMotion}><Zap size={15} /> {slowMotion ? "NORMAL SPEED" : "SLOW MOTION"}</button><span className="speed">SPEED <b>{slowMotion ? "0.25×" : "1.0×"}</b></span></div><p className="vpf-local-note">Simulation cinématique locale uniquement · aucune commande transmise à une imprimante.</p></div><div className="panel"><PanelHead eyebrow="LAYER INSPECTION" title={progress > 0 ? `LAYER ${Math.min(64, Math.floor(progress * .64))} / 64` : "AUCUNE CELLULE SÉLECTIONNÉE"} status={`${Math.floor(progress)}%`} /><div className="layer-list">{["Perimeter / pass 1", "Infill / 35%", "Support interface", "Cooling pass", "Next layer preview"].map((x, i) => { const done = i < Math.floor(progress / 20); return <div key={x}><span className={done ? "checked" : ""}>{done ? "✓" : "·"}</span><b>{x}</b><small>{done ? "SIMULÉ" : "EN ATTENTE"}</small></div>; })}</div><div className="estimate"><Clock3 size={16} /><span>ESTIMATED REMAINING</span><b>{running ? "EN COURS" : "PAUSED"}</b></div></div></div>;
}
function PlannerPanel({ onAction }: { onAction: (s: string) => void }) { return <div className="panel"><PanelHead eyebrow="AUTOMATED MANUFACTURING PLANNING" title="AUCUN PLAN ACTIF" status="CELLULE REQUISE" /><div className="vpf-empty-record"><ScanLine size={22} /><strong>PLANIFICATION NON CONFIGURÉE</strong><span>Aucun dossier, dimension ou matériau n’est présumé avant sélection d’une cellule.</span></div><button className="primary-btn" type="button" disabled title="Sélectionnez une cellule avant de préparer un plan"><ListChecks size={15} /> PRÉPARER UN PLAN APRÈS SÉLECTION</button></div>; }
function QualityPanel({ onAction }: { onAction: (s: string) => void }) { const [reviewed, setReviewed] = useState<string[]>([]); const checks = ["Dimensional inspection", "Visual inspection", "Print defect scan", "Tolerance verification", "Material lot traceability", "Assembly validation"]; return <div className="panel"><PanelHead eyebrow="QUALITY CONTROL" title="CONTRÔLE QUALITÉ" status="CELLULE REQUISE" /><div className="vpf-empty-record"><ShieldCheck size={22} /><strong>AUCUN DOSSIER À CONTRÔLER</strong><span>Les critères de qualité et les preuves s’afficheront après la sélection d’une cellule.</span></div><div className="safety-note warning"><AlertTriangle size={18} /><span><b>NON APTE AU VOL</b> — L’impression et l’assemblage seuls ne valident pas la conformité mécanique, électrique, fonctionnelle ou réglementaire.</span></div></div>; }
function HistoryPanel() { return <div className="panel"><PanelHead eyebrow="PRODUCTION HISTORY" title="JOURNAL D’ACTIVITÉ" status="AUCUNE SESSION" /><div className="vpf-empty-record"><Clock3 size={22} /><strong>AUCUN ÉVÉNEMENT DE PRODUCTION</strong><span>Le journal reste vide tant qu’aucun projet ou aucune cellule n’a été sélectionné et utilisé.</span></div></div>; }
function PanelHead({ eyebrow, title, status }: { eyebrow: string; title: string; status: string }) { return <div className="panel-title"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><Status tone={status.includes("REQUIRED") || status.includes("REVIEW") ? "amber" : "green"}>{status}</Status></div>; }
function Gate({ label, value, done = false }: { label: string; value: string; done?: boolean }) { return <div className="gate"><span className={done ? "gate-ok" : "gate-wait"}>{done ? "✓" : "!"}</span><div><b>{label}</b><small>{value}</small></div></div>; }
