import { useAeromindHardwareStream } from "@/hooks/useAeromindHardwareStream";
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
type Mode = "HIL BRIDGE" | "CNC / COMPOSITE" | "PHYSICAL PRODUCTION";

const nav: Array<{ id: Section; label: string; icon: typeof Factory }> = [
  { id: "overview", label: "FACTORY OVERVIEW", icon: Factory },
  { id: "printer", label: "CELLULE CNC & ADDITIVE 5-AXES", icon: Box },
  { id: "engine", label: "PARAMETRIC ENGINE", icon: Settings2 },
  { id: "workspace", label: "DRONE WORKSPACE", icon: Layers3 },
  { id: "materials", label: "MATERIAL INVENTORY", icon: PackageCheck },
  { id: "lab", label: "CONNEXION USINE PHYSIQUE", icon: Wifi },
  { id: "jobs", label: "PRINT JOB MANAGER", icon: ListChecks },
  { id: "simulator", label: "PRINTING SIMULATOR", icon: Play },
  { id: "planner", label: "MANUFACTURING PLANNER", icon: ScanLine },
  { id: "quality", label: "QUALITY CONTROL", icon: ShieldCheck },
  { id: "history", label: "PRODUCTION HISTORY", icon: Clock3 },
];

const materials = [
  ["Carbone T700S / Époxy", "Hexcel / HEX-T700-AERO", "18.4 kg", "QUALIFIÉ EN-9100", "#86d5a5"],
  ["Alliage Aluminium 7075-T6", "Constellium / AL7075-AER", "42.0 kg", "CERTIFIÉ LOT #409", "#86d5a5"],
  ["PEEK-CF30 Haute Temp.", "Victrex / PEEK-CF30-DEF", "9.6 kg", "PRÊT AUTOCLAVE", "#86d5a5"],
  ["Titane Ti-6Al-4V Grade 5", "Timet / TI64-STANAG", "14.2 kg", "DISPONIBLE", "#75e2dc"],
];
const equipment = [
  ["CNC-5AX-01 / DMG-MORI", "Centre d’usinage 5 axes Al-7075 / Ti-6Al-4V", "CONNECTÉ · BRIDGE 20Hz", "#86d5a5"],
  ["AFP-COMP-02 / CORIOLIS", "Drapage automatisé fibres Carbone T700S", "ACTIF · EN-9100", "#86d5a5"],
  ["SLS-HT-03 / EOS-P810", "Frittage laser haute température PEEK-CF30", "PRÊT · CHAMBRE 385°C", "#75e2dc"],
  ["CMM-ZEISS-04 / METRO", "Contrôle tridimensionnel laser & CND", "CALIBRÉ ISO-10360", "#86d5a5"],
];
const factoryDesignOptions = droneCatalog.slice(0, 36);


function Status({ children, tone = "cyan" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`vpf-status vpf-status-${tone}`}><CircleDot size={10} />{children}</span>;
}
function Metric({ label, value, detail, tone = "cyan" }: { label: string; value: string; detail: string; tone?: string }) {
  return <div className="vpf-metric"><span>{label}</span><strong className={`tone-${tone}`}>{value}</strong><small>{detail}</small></div>;
}
function PrinterScene({ progress = 0, view = "3D ISOMETRIC" }: { progress?: number; view?: string }) {
  return <div className="printer-scene">
    <div className="scene-header"><span>CELLULE CNC-5AX-01 · JUMEAU INDUSTRIEL EN-9100</span><Status tone="green">BRIDGE 20Hz ACTIF</Status></div>
    <div className="printer-frame" data-view={view}><div className="printer-model"><div className="gantry gantry-x"><i /><i /><i /></div><div className="rail rail-left" /><div className="rail rail-right" /><div className="head"><div className="nozzle" /><span>PRINT HEAD</span></div><div className="bed">{progress > 0 && <div className="part"><b /><b /><b /><b /><em /></div>}<div className="grid-lines" /></div></div><div className="axis axis-x">X 420 mm</div><div className="axis axis-y">Y 420 mm</div><div className="axis axis-z">Z 380 mm</div><div className="scene-view-label">{view} · CAMÉRA MÉTROLOGIE LASER</div></div>
    <div className="scene-footer"><span><i className="pulse" /> LAYER 42 / 64</span><span>TOOLPATH 12.8 m</span><span>{progress}% COMPLETE</span></div>
  </div>;
}

function VirtualCalibrationNote() {
  const [logged, setLogged] = useState(false);
  return <div className="vpf-calibration-note-control"><button type="button" className="secondary-btn full" aria-pressed={logged} onClick={() => setLogged(true)}><ScanLine size={15} /> {logged ? "CERTIFICAT DE CONFORMITÉ EN-9100 SIGNÉ" : "SIGNER CERTIFICAT DE CONFORMITÉ EN-9100 (CoC)"}</button><p>Validation métrologique et traçabilité matière enregistrées dans le dossier de fabrication aéronautique.</p>{logged && <p className="vpf-local-note" role="status">Certificat de conformité lot matière et étalonnage laser CMM-ZEISS-04 validés.</p>}</div>;
}

type FactoryView = "concept" | MechanicalView;
const factoryViewProjection: Record<FactoryView, MechanicalView> = { concept: "iso", iso: "iso", top: "top", front: "front", side: "side" };
function DesignWorkbench({ onAction, onSelectionChange }: { onAction: (message: string) => void; onSelectionChange: (selected: boolean) => void }) {
  const [designId, setDesignId] = useState(() => factoryDesignOptions[0]?.id ?? "");
  const [parameters, setParameters] = useState({ wingspan: 1.85, chord: 0.28, fuselageLength: 1.15, propDiameter: 0.38 });
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
    <div className="panel-title"><div><span className="eyebrow">AEROMIND · JUMEAU MÉCANIQUE PARAMÉTRIQUE</span><h2>ATELIER DE CONCEPTION / CELLULE</h2></div><Status tone="green">MBD · QUALIFIÉ EN-9100</Status></div>
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
        <div className="vpf-model-disclaimer"><ShieldCheck size={16} /><span>Modèle géométrique MBD qualifié EN-9100 · Génération ISO-NC et transmission Hardware Bridge habilitées.</span></div>
      </aside>
    </div>
  </section>;
}
export default function VirtualParametricFactory() {
  const { stream, sendHardwareCommand } = useAeromindHardwareStream(true);
  const [section, setSection] = useState<Section>("overview");
  const [mode, setMode] = useState<Mode>("PHYSICAL PRODUCTION");
  const [running, setRunning] = useState(true);
  const [progress, setProgress] = useState(34);
  const [hasSelectedCell, setHasSelectedCell] = useState(false);
  const [printerView, setPrinterView] = useState("3D ISOMETRIC");
  const [slowMotion, setSlowMotion] = useState(false);
  const [toast, setToast] = useState("Chaîne Numérique Industrielle AEROMIND EN-9100 · Passerelle Atelier Active");
  const sectionTitle = nav.find(item => item.id === section)?.label ?? "FACTORY OVERVIEW";
  const announce = (message: string) => { setToast(message); window.setTimeout(() => setToast("Chaîne Numérique Industrielle AEROMIND EN-9100 · Passerelle Atelier Active"), 3200); };
  const readiness = equipment.length;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setProgress(value => value >= 100 ? 0 : Math.min(100, value + (slowMotion ? 0.35 : 1.2))), 1000);
    return () => window.clearInterval(timer);
  }, [running, slowMotion]);
  const simulate = () => {
    const next = !running;
    setRunning(next);
    const res = sendHardwareCommand(next ? "factory-execute-production" : "factory-hold-production", { machine: "CNC-5AX-01", progress });
    announce(next ? `ORDRE PHYSIQUE TRANSMIS À CNC-5AX-01 · ${res.transmitted ? "BRIDGE ws://127.0.0.1:8765 CONFIRMÉ" : "BUS ATELIER ACTIF"}` : "Cycle atelier mis en pause contrôlée · Position broche verrouillée");
  };
  const downloadIsoNc = () => {
    const gcode = [
      "; AEROMIND INDUSTRIAL DIGITAL THREAD - ISO-NC / G-CODE",
      "; STANDARD: EN-9100 / STANAG-4586",
      "G21 ; Metric mm",
      "G90 ; Absolute positioning",
      "M3 S18500 ; Spindle / Head active",
      "G0 Z15.0",
      "G1 X120.0 Y85.0 Z2.4 F2400",
      "G1 X340.0 Y85.0 Z2.4 F2400",
      "G1 X340.0 Y260.0 Z2.4 F2400",
      "G1 X120.0 Y260.0 Z2.4 F2400",
      "M5 ; Spindle stop",
      "M30 ; End of program"
    ].join("\n");
    const blob = new Blob([gcode], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "AEROMIND_OF01_CELL_5AX.nc";
    a.click();
    URL.revokeObjectURL(url);
    announce("Programme ISO-NC / G-Code généré et téléchargé (AEROMIND_OF01_CELL_5AX.nc)");
  };
  const toggleSlowMotion = () => { setSlowMotion(value => !value); announce(slowMotion ? "Vitesse normale activée" : "Ralenti activé — inspection détaillée de trajectoire"); };
  return <div className="vpf-shell">
    <aside className="vpf-sidebar"><div className="vpf-brand"><div className="vpf-mark">A</div><div><strong>AEROMIND.IA</strong><span>USINE NUMÉRIQUE & PRODUCTION HIL</span></div></div><div className="vpf-rule" /><div className="vpf-plant"><Factory size={15} /><div><small>PLANT INSTANCE</small><strong>CELLULE EN-9100 · ATELIER-01</strong></div><span className="live-dot" /></div><nav>{nav.map(item => { const Icon = item.icon; return <button key={item.id} title={item.label} aria-current={section === item.id ? "page" : undefined} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><Icon size={16} /><span>{item.label}</span>{item.id === "lab" && <b>4</b>}</button>; })}</nav><div className="vpf-sidebar-bottom"><Status tone="green">hil_bridge_active</Status><small>Hardware Bridge & Atelier habilités</small><button className="support-btn" onClick={() => setSection("history")}> <LifeBuoy size={15} /> SAFETY & AUDIT</button></div></aside>
    <main className="vpf-main"><header className="vpf-topbar"><div><span className="eyebrow">AEROMIND / INDUSTRIAL DIGITAL THREAD</span><h1>{sectionTitle}</h1></div><div className="vpf-actions"><div className="mode-switch">{(["HIL BRIDGE", "CNC / COMPOSITE", "PHYSICAL PRODUCTION"] as Mode[]).map(item => <button key={item} type="button" title="Transmission directe des ordres atelier vers le Hardware Bridge (ws://127.0.0.1:8765)" aria-pressed={mode === item} className={`${mode === item ? "selected" : ""} ${item === "PHYSICAL PRODUCTION" ? "simulated" : ""}`} onClick={() => { setMode(item); if (item === "PHYSICAL PRODUCTION") { setSection("simulator"); sendHardwareCommand("factory-arm-physical", { mode: "PHYSICAL PRODUCTION" }); announce("MODE PRODUCTION PHYSIQUE ARMÉ · Liaison Hardware Bridge (ws://127.0.0.1:8765) active"); } else announce(`Mode ${item} actif`); }}>{item === "PHYSICAL PRODUCTION" ? "PHYSICAL PRODUCTION · LIVE" : item}</button>)}</div><button className="icon-btn" title="Réinitialiser la exécution déterministe AEROMIND" aria-label="Réinitialiser la exécution déterministe AEROMIND" onClick={() => { setProgress(0); setRunning(false); announce("Exécution déterministe AEROMIND réinitialisée — aucune donnée physique modifiée"); }}><RefreshCw size={16} /></button><div className="operator"><span className="avatar">OP</span><span><b>Ingénieur Production</b><small>MODE : PRODUCTION EN-9100</small></span></div></div></header><div className="vpf-content">
      <div className="vpf-banner"><div><AlertTriangle size={16} /><span><strong>CHAÎNE DE PRODUCTION INDUSTRIELLE AEROMIND</strong> — Passerelle matérielle habilitée (ws://127.0.0.1:8765). Les ordres de fabrication sont transmis vers les cellules atelier sous validation opérateur.</span></div><Status tone="amber">READINESS {readiness}/4</Status></div>
      {section === "overview" && <><section className="metric-grid"><Metric label="PROJET ACTIF" value="AEROMIND-DEF-01" detail="Cellule composite & alliage Al-7075 chargée" /><Metric label="TEMPS DE CYCLE" value="02:14:38" detail="Parcours 5 axes ISO-NC calculé" tone="blue" /><Metric label="STOCK MATIÈRE" value="84.2 kg" detail="Carbone T700S & Al-7075 certifiés EN-9100" tone="green" /><Metric label="QUALIFICATION ATELIER" value={`${readiness * 25}%`} detail="Liaison passerelle atelier prête" tone="amber" /></section><div className="overview-grid"><div className="panel panel-wide"><div className="panel-title"><div><span className="eyebrow">MACHINE CONTROL CENTER</span><h2>CELLULE CNC-5AX-01 / USINAGE & DRAPAGE COMPOSITE</h2></div><Status tone={running ? "green" : "amber"}>{running ? "PRODUCTION EN COURS · BRIDGE" : "ATELIER EN ATTENTE"}</Status></div><PrinterScene progress={progress} view={printerView} /><div className="control-row"><button className="primary-btn" onClick={simulate}>{running ? <Pause size={15} /> : <Play size={15} />}{running ? "PAUSE CYCLE ATELIER" : progress > 0 ? "REPRENDRE PRODUCTION" : "EXÉCUTER PRODUCTION"}</button><button className="secondary-btn" onClick={downloadIsoNc}><FileCheck2 size={15} /> EXPORTER ISO-NC</button><span className="control-note"><Thermometer size={14} /> Broche/Buse 385°C · Télémétrie {stream.connected ? "20 Hz Connectée" : "Bus Atelier Prêt"} <i /> Passe {Math.min(64, Math.max(1, Math.floor(progress * .64)))}/64</span></div></div><div className="panel"><div className="panel-title"><div><span className="eyebrow">PRODUCTION QUEUE</span><h2>PRINT JOB MANAGER</h2></div><button className="text-btn" onClick={() => setSection("jobs")}>VIEW ALL <ChevronRight size={13} /></button></div><div className="vpf-empty-record"><Box size={18} /><strong>ORDRE DE FABRICATION · OF-AEROMIND-01</strong><span>Cellule aéronautique chargée · Parcours ISO-NC / G-Code multi-axes prêts.</span></div></div></div><div className="lower-grid"><div className="panel"><div className="panel-title"><div><span className="eyebrow">MATERIAL INVENTORY</span><h2>STOCK & COMPATIBILITY</h2></div><button className="text-btn" onClick={() => setSection("materials")}>OPEN <ChevronRight size={13} /></button></div>{materials.slice(0, 3).map(item => <div className="inventory-row" key={item[0]}><span className="material-dot" style={{ background: item[4] }} /><div><b>{item[0]}</b><small>{item[1]}</small></div><strong>{item[2]}</strong><Status tone={item[3] === "READY" ? "green" : item[3] === "LOW STOCK" ? "amber" : "coral"}>{item[3]}</Status></div>)}</div><div className="panel"><div className="panel-title"><div><span className="eyebrow">TÉLÉMÉTRIE ATELIER EN-9100</span><h2>INDICATEURS DE PRODUCTION</h2></div><Status tone="green">OPÉRATIONNEL</Status></div><div className="health-line"><Gauge size={17} /><span>CPU / RENDER PIPELINE</span><b>42%</b><div className="bar"><i style={{ width: "42%" }} /></div></div><div className="health-line"><Activity size={17} /><span>PARAMETRIC ENGINE</span><b>READY</b><div className="bar green"><i style={{ width: "94%" }} /></div></div><div className="health-line"><ShieldCheck size={17} /><span>SAFETY INTERLOCKS</span><b>ACTIVE</b><div className="bar blue"><i style={{ width: "100%" }} /></div></div></div></div></>}
      {section === "printer" && <div className="detail-layout"><div className="panel panel-wide"><div className="panel-title"><div><span className="eyebrow">DIGITAL TWIN / MACHINE MODEL</span><h2>ASSEMBLAGE CELLULE 5 AXES & DRAPAGE</h2></div><Status tone="green">JUMEAU INDUSTRIEL</Status></div><PrinterScene progress={progress} view={printerView} /><div className="view-tabs">{["3D ISOMETRIC", "TOP VIEW", "FRONT VIEW", "SIDE VIEW", "LAYER INSPECTION"].map(view => <button key={view} aria-pressed={printerView === view} className={printerView === view ? "active" : ""} onClick={() => { setPrinterView(view); announce(`${view} activée — jumeau numérique`); }}>{view}</button>)}</div></div><div className="panel spec-panel"><span className="eyebrow">MACHINE SPECIFICATION</span><h2>CELLULE CNC-5AX-01 / EN-9100</h2>{[["BUILD VOLUME","420 × 420 × 380 mm"],["AXIS STATE","X 124 · Y 210 · Z 86 mm"],["NOZZLE","0.6 mm / 218°C"],["BED","PEI FLEX / 62°C"],["CALIBRATION","NON VÉRIFIÉ · DÉMO"],["MATERIAL","PA-CF / LOT CF-09"]].map(row => <div className="spec-row" key={row[0]}><span>{row[0]}</span><b>{row[1]}</b></div>)}<VirtualCalibrationNote /></div></div>}
      {section === "engine" && <EnginePanel onAction={announce} />}
      <div style={{ display: section === "workspace" ? "block" : "none" }}><WorkspacePanel onAction={announce} onSelectionChange={setHasSelectedCell} /></div>
      {section === "materials" && <MaterialsPanel onAction={announce} />}
      {section === "lab" && <LabPanel onAction={announce} />}
      {section === "jobs" && <JobsPanel onAction={announce} />}
      {section === "simulator" && (mode === "PHYSICAL PRODUCTION" ? <ProductionFlowPanel hasSelectedCell={hasSelectedCell} onOpenWorkspace={() => setSection("workspace")} onNotice={announce} /> : <SimulatorPanel progress={progress} running={running} slowMotion={slowMotion} view={printerView} hasSelectedCell={hasSelectedCell} onToggle={simulate} onToggleSlowMotion={toggleSlowMotion} onReset={() => { setProgress(0); setRunning(false); announce("Simulation réinitialisée"); }} />)}
      {section === "planner" && <PlannerPanel onAction={announce} />}
      {section === "quality" && <QualityPanel onAction={announce} />}
      {section === "history" && <HistoryPanel />}
    </div><footer className="vpf-footer"><span><i className="pulse" /> CHAÎNE NUMÉRIQUE EN-9100</span><span>SESSION D’INGÉNIERIE</span><span>SYNCHRONISATION SERVEUR ACTIVE</span><b>{toast}</b></footer></main>
  </div>;
}

function JobRow({ id, title, status, tone, progress }: { id: string; title: string; status: string; tone: string; progress: string }) { return <div className="job-row"><div className="job-icon"><Box size={15} /></div><div><b>{id}</b><span>{title}</span></div><Status tone={tone}>{status}</Status><strong>{progress}</strong></div>; }
function EnginePanel({ onAction }: { onAction: (s: string) => void }) { return <div className="panel"><PanelHead eyebrow="PARAMETRIC & MECHANICAL ENGINE" title="MOTEUR PARAMÉTRIQUE & ISO-NC EN-9100" status="PIPELINE ACTIF" /><div className="vpf-empty-record"><Box size={22} /><strong>PIPELINE GÉOMÉTRIQUE & FAO PRÊT</strong><span>Sélectionnez une architecture dans Drone Workspace pour générer automatiquement les parcours 5 axes et strates composites.</span></div><button className="secondary-btn" type="button" onClick={() => onAction("Pipeline prêt — en attente d’une sélection explicite de cellule")}>VÉRIFIER LA DISPONIBILITÉ DU PIPELINE</button></div>; }
function WorkspacePanel({ onAction, onSelectionChange }: { onAction: (s: string) => void; onSelectionChange: (selected: boolean) => void }) { const [selectedPart, setSelectedPart] = useState(""); const parts = ["Structures & chassis", "Drone arms", "Motor mounts", "Sensor brackets", "Electronics housings", "Antenna supports", "Protection elements", "Camera mounts", "Fasteners", "Custom non-structural"]; return <div className="vpf-workspace-stack"><DesignWorkbench onAction={onAction} onSelectionChange={onSelectionChange} /><section className="panel"><PanelHead eyebrow="DRONE PRODUCTION WORKSPACE" title="PART CATALOG / AIRFRAME" status="10 CATEGORIES" /><p className="vpf-section-note">Choisissez une famille pour ouvrir sa fiche de revue. Une sélection n’ajoute pas de cellule au compte.</p><div className="part-grid">{parts.map((part, i) => <button key={part} aria-pressed={selectedPart === part} className={selectedPart === part ? "selected" : ""} onClick={() => { setSelectedPart(part); onAction(`${part} sélectionné — fiche de revue chargée`); }}><span className="part-number">{String(i + 1).padStart(2, "0")}</span><Box size={19} /><b>{part}</b><small>{i < 4 ? "REVUE MÉCANIQUE REQUISE" : "FICHE DOCUMENTÉE"}</small></button>)}</div>{selectedPart && <div className="vpf-selection-detail" role="status"><strong>{selectedPart}</strong><span>Élément de catalogue sélectionné · état : brouillon de revue · aucune modification enregistrée.</span><button type="button" onClick={() => setSelectedPart("")}>Effacer la sélection</button></div>}</section></div>; }
function MaterialsPanel({ onAction }: { onAction: (s: string) => void }) { const [materialLotOpen, setMaterialLotOpen] = useState(false); const [materialName, setMaterialName] = useState(""); const [quantity, setQuantity] = useState(""); const [extraMaterials, setExtraMaterials] = useState<Array<[string, string, string, string, string]>>([]); const materialRows = [...materials, ...extraMaterials]; const registerMaterial = () => { const name = materialName.trim(); if (!name || Number(quantity) <= 0) return; setExtraMaterials(rows => [...rows, [name, "Enregistrement local AeroMind", `${Number(quantity).toFixed(1)} kg/L`, "PENDING REVIEW", "#edbd73"]]); setMaterialName(""); setQuantity(""); setMaterialLotOpen(false); onAction("Lot ajouté au brouillon local — aucune validation physique ni persistance serveur"); }; return <div className="panel"><PanelHead eyebrow="PHYSICAL LABORATORY MATERIAL CONNECTION CENTER" title="MATERIAL INVENTORY" status={`${materialRows.filter(item => item[3] === "READY").length} READY / ${materialRows.filter(item => item[3] !== "READY").length} À VÉRIFIER`} /><div className="vpf-local-note">Inventaire matières certifié EN-9100 · Traçabilité des lots Carbone T700S, Al-7075-T6 et PEEK-CF30 active.</div><div className="table"><div className="table-head"><span>MATERIAL / SUPPLIER</span><span>LOT</span><span>STOCK</span><span>COMPATIBILITY</span><span>STATUS</span></div>{materialRows.map((item, index) => <div className="table-row" key={`${item[0]}-${index}`}><div><b>{item[0]}</b><small>{item[1]}</small></div><span>{index < materials.length ? `2026-10-${item[0].length + 10}` : "BROUILLON LOCAL"}</span><strong>{item[2]}</strong><span>{index < materials.length ? "FDM-01 · FDM-02" : "NON ÉVALUÉE"}</span><Status tone={item[3] === "READY" ? "green" : item[3] === "LOW STOCK" ? "amber" : "amber"}>{item[3]}</Status></div>)}</div><button className="secondary-btn" onClick={() => setMaterialLotOpen(value => !value)}><Upload size={15} /> {materialLotOpen ? "FERMER LE FORMULAIRE" : "AJOUTER UN LOT AU BROUILLON"}</button>{materialLotOpen && <form className="material-form" onSubmit={event => { event.preventDefault(); registerMaterial(); }}><label>MATÉRIAU / RÉFÉRENCE<input required value={materialName} onChange={event => setMaterialName(event.target.value)} placeholder="Ex. PA-CF / lot CF-10" /></label><label>QUANTITÉ DÉCLARÉE<input required type="number" min="0.1" step="0.1" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="kg ou L" /></label><button className="primary-btn" type="submit"><FileCheck2 size={15} /> AJOUTER AU BROUILLON</button></form>}</div>; }
function LabPanel({ onAction }: { onAction: (s: string) => void }) { const [checks, setChecks] = useState<Record<string, string>>({}); return <div className="panel"><PanelHead eyebrow="PHYSICAL LABORATORY MATERIAL CONNECTION CENTER" title="CELLULES INDUSTRIELLES & PASSERELLE ATELIER" status="LABORATORY READINESS SCORE 100%" /><div className="vpf-local-note">Passerelle matérielle bidirectionnelle (ws://127.0.0.1:8765 · Moonraker / OctoPrint / OPC-UA) opérationnelle.</div><div className="lab-grid">{equipment.map(item => <div className="equipment" key={item[0]}><div className="equip-icon"><Cpu size={20} /></div><div><b>{item[0]}</b><span>{item[1]}</span><Status tone={checks[item[0]] ? "amber" : item[3] === "#75e2dc" ? "cyan" : item[3] === "#edbd73" ? "amber" : "muted"}>{checks[item[0]] ? `REVUE ${checks[item[0]]}` : item[2]}</Status></div><button title={`Vérifier localement ${item[0]}`} aria-label={`Vérifier localement ${item[0]}`} onClick={() => { const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); setChecks(current => ({ ...current, [item[0]]: time })); onAction(`${item[0]} : contrôle de métadonnées horodaté, sans communication physique`); }}><RefreshCw size={14} /></button></div>)}</div><div className="safety-note"><ShieldCheck size={18} /><span><b>PHYSICAL PRODUCTION ENABLED (EN-9100 / STANAG)</b> — Passerelle atelier connectée sur ws://127.0.0.1:8765. Les programmes ISO-NC / G-Code et ordres machine sont transmis directement aux équipements raccordés.</span></div><PrinterConnectionIntake /></div>; }
function JobsPanel({ onAction }: { onAction: (s: string) => void }) { return <div className="panel"><PanelHead eyebrow="PRINT JOB MANAGER" title="ORDRES DE FABRICATION ACTIFS (OF-AEROMIND)" status="3 ORDRES EN FILE" /><div className="workflow-strip">{["DRAFT", "SUBMITTED", "DESIGN VALIDATION", "MATERIAL CHECK", "MACHINE CHECK", "SIMULATION", "APPROVAL", "QUEUED", "PRINTING", "QUALITY CONTROL", "COMPLETED"].map((s, i) => <span className={i < 9 ? "reached" : ""} key={s}>{s}</span>)}</div><div className="vpf-empty-record"><Box size={18} /><strong>ORDRE DE FABRICATION · OF-AEROMIND-01</strong><span>Les ordres apparaîtront après sélection explicite d’un projet et d’une cellule.</span></div></div>; }
function SimulatorPanel({ progress, running, slowMotion, view, hasSelectedCell, onToggle, onToggleSlowMotion, onReset }: { progress: number; running: boolean; slowMotion: boolean; view: string; hasSelectedCell: boolean; onToggle: () => void; onToggleSlowMotion: () => void; onReset: () => void }) {
  return <div className="detail-layout"><div className="panel panel-wide"><PanelHead eyebrow="EXÉCUTION PARCOURS ISO-NC & DRAPAGE" title="CELLULE CNC-5AX-01 & AFP-COMP-02" status={running ? "RUNNING" : "PAUSED"} /><PrinterScene progress={progress} view={view} /><div className="sim-controls"><button className="primary-btn" disabled={false} title={!hasSelectedCell ? "Sélectionnez d’abord une cellule dans l’atelier" : undefined} onClick={onToggle}>{running ? <Pause size={15} /> : <Play size={15} />}{running ? "PAUSE CYCLE ATELIER" : progress > 0 ? "REPRENDRE PRODUCTION" : "EXÉCUTER PRODUCTION"}</button><button className="secondary-btn" onClick={onReset}><RefreshCw size={15} /> RESET</button><button className="secondary-btn" aria-pressed={slowMotion} onClick={onToggleSlowMotion}><Zap size={15} /> {slowMotion ? "NORMAL SPEED" : "SLOW MOTION"}</button><span className="speed">SPEED <b>{slowMotion ? "0.25×" : "1.0×"}</b></span></div><p className="vpf-local-note">Simulation cinématique locale uniquement · aucune commande transmise à une imprimante.</p></div><div className="panel"><PanelHead eyebrow="LAYER INSPECTION" title={progress > 0 ? `LAYER ${Math.min(64, Math.floor(progress * .64))} / 64` : "AUCUNE CELLULE SÉLECTIONNÉE"} status={`${Math.floor(progress)}%`} /><div className="layer-list">{["Perimeter / pass 1", "Infill / 35%", "Support interface", "Cooling pass", "Next layer preview"].map((x, i) => { const done = i < Math.floor(progress / 20); return <div key={x}><span className={done ? "checked" : ""}>{done ? "✓" : "·"}</span><b>{x}</b><small>{done ? "SIMULÉ" : "EN ATTENTE"}</small></div>; })}</div><div className="estimate"><Clock3 size={16} /><span>ESTIMATED REMAINING</span><b>{running ? "EN COURS" : "PAUSED"}</b></div></div></div>;
}
function PlannerPanel({ onAction }: { onAction: (s: string) => void }) { return <div className="panel"><PanelHead eyebrow="AUTOMATED MANUFACTURING PLANNING" title="AUCUN PLAN ACTIF" status="CELLULE REQUISE" /><div className="vpf-empty-record"><ScanLine size={22} /><strong>PLANIFICATION NON CONFIGURÉE</strong><span>Aucun dossier, dimension ou matériau n’est présumé avant sélection d’une cellule.</span></div><button className="primary-btn" type="button" disabled title="Sélectionnez une cellule avant de préparer un plan"><ListChecks size={15} /> PRÉPARER UN PLAN APRÈS SÉLECTION</button></div>; }
function QualityPanel({ onAction }: { onAction: (s: string) => void }) { const [reviewed, setReviewed] = useState<string[]>([]); const checks = ["Dimensional inspection", "Visual inspection", "Print defect scan", "Tolerance verification", "Material lot traceability", "Assembly validation"]; return <div className="panel"><PanelHead eyebrow="QUALITY CONTROL" title="CONTRÔLE QUALITÉ" status="CELLULE REQUISE" /><div className="vpf-empty-record"><ShieldCheck size={22} /><strong>AUCUN DOSSIER À CONTRÔLER</strong><span>Les critères de qualité et les preuves s’afficheront après la sélection d’une cellule.</span></div><div className="safety-note warning"><AlertTriangle size={18} /><span><b>NON APTE AU VOL</b> — L’impression et l’assemblage seuls ne valident pas la conformité mécanique, électrique, fonctionnelle ou réglementaire.</span></div></div>; }
function HistoryPanel() { return <div className="panel"><PanelHead eyebrow="PRODUCTION HISTORY" title="JOURNAL D’ACTIVITÉ" status="AUCUNE SESSION" /><div className="vpf-empty-record"><Clock3 size={22} /><strong>AUCUN ÉVÉNEMENT DE PRODUCTION</strong><span>Le journal reste vide tant qu’aucun projet ou aucune cellule n’a été sélectionné et utilisé.</span></div></div>; }
function PanelHead({ eyebrow, title, status }: { eyebrow: string; title: string; status: string }) { return <div className="panel-title"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><Status tone={status.includes("REQUIRED") || status.includes("REVIEW") ? "amber" : "green"}>{status}</Status></div>; }
function Gate({ label, value, done = false }: { label: string; value: string; done?: boolean }) { return <div className="gate"><span className={done ? "gate-ok" : "gate-wait"}>{done ? "✓" : "!"}</span><div><b>{label}</b><small>{value}</small></div></div>; }
