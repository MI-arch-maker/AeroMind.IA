import { useMemo, useState } from "react";
import { Box, Cable, Check, ChevronRight, CircleAlert, Copy, Eye, EyeOff, FileText, History, Layers3, Maximize2, Minus, Plus, Redo2, RotateCcw, Save, Search, ShieldCheck, SlidersHorizontal, Undo2, Wrench } from "lucide-react";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import type { ConceptConfig } from "../lib/aeroEngine";
import { buildMechanicalModel, type MechanicalPart } from "../lib/mechanicalTwinGeometry";
import { defaultMechanicalCenter, mergeMechanicalCenter, type MechanicalCenterConfig, type MechanicalCenterPart, type MechanicalCenterTab } from "../lib/mechanicalCenterModel";
import { MechanicalTwinViewport } from "./MechanicalTwinViewport";
import { MechanicalRoutingPanel } from "./MechanicalRoutingPanel";
import "./mechanical-workbench.css";
import "./mechanical-routing-panel.css";

type Props = { config: ConceptConfig; setConfig: React.Dispatch<React.SetStateAction<ConceptConfig>>; activeDroneLabel: string; activeProfile?: DroneCatalogDesign };
type InspectorTab = "identity" | "geometry" | "assembly" | "interfaces" | "maintenance";
type WorkbenchMode = "part" | "assembly" | "routing" | "maintenance";

type Snapshot = MechanicalCenterConfig;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const categoryLabel: Record<MechanicalCenterPart["category"], string> = { structure: "Structure", propulsion: "Propulsion", avionics: "Avionique", energy: "Énergie", payload: "Mission", hardware: "Fixation" };
const installLabel = { planned: "Planifié", installed: "Installé", inspected: "Inspecté" } as const;

export function MechanicalWorkbench({ config, setConfig, activeDroneLabel, activeProfile }: Props) {
  const model = useMemo(() => activeProfile ? buildMechanicalModel(activeProfile, config) : null, [activeProfile, config]);
  const center = useMemo(() => mergeMechanicalCenter(config.mechanicalCenter), [config.mechanicalCenter]);
  const [mode, setMode] = useState<WorkbenchMode>("part");
  const [selectedTwinId, setSelectedTwinId] = useState(model?.parts[0]?.id ?? "");
  const [selectedManualId, setSelectedManualId] = useState(center.selectedPartId ?? center.parts?.[0]?.id ?? "");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("identity");
  const [search, setSearch] = useState("");
  const [explosion, setExplosion] = useState(0);
  const [showTreePreview, setShowTreePreview] = useState(true);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [redo, setRedo] = useState<Snapshot[]>([]);
  const [notice, setNotice] = useState("État local · aucune sortie matérielle");
  const selectedTwin = model?.parts.find(part => part.id === selectedTwinId);
  const selectedManual = center.parts?.find(part => part.id === selectedManualId);
  const visibleParts = (model?.parts ?? []).filter(part => `${part.name} ${part.category} ${part.id}`.toLowerCase().includes(search.toLowerCase()));
  const selectedLabel = selectedManual?.label ?? selectedTwin?.name ?? "Aucune sélection";
  const treeGroups = [
    { id: "structure", label: "Assemblage principal", items: visibleParts.filter(part => part.category.toLowerCase().includes("airframe") || part.category.toLowerCase().includes("structure")) },
    { id: "systems", label: "Sous-ensembles mécaniques", items: visibleParts.filter(part => !part.category.toLowerCase().includes("airframe") && !part.category.toLowerCase().includes("structure")) },
  ];

  const updateCenter = (patch: Partial<MechanicalCenterConfig>, message: string) => {
    const current = mergeMechanicalCenter(config.mechanicalCenter);
    setHistory(items => [...items.slice(-19), clone(current)]);
    setRedo([]);
    setConfig(value => ({ ...value, mechanicalCenter: { ...current, ...patch, updatedAt: new Date().toISOString() } }));
    setNotice(message);
  };
  const updateManual = (id: string, patch: Partial<MechanicalCenterPart>) => updateCenter({ parts: center.parts?.map(part => part.id === id ? { ...part, ...patch } : part) }, "Pièce mécanique mise à jour · revue locale");
  const addManual = () => {
    const id = `manual-${Date.now()}`;
    const next: MechanicalCenterPart = { id, label: "Nouvelle pièce manuelle", category: "hardware", massKg: 0.05, interface: "À définir", installState: "planned", review: "draft", source: "user" };
    updateCenter({ parts: [...(center.parts ?? []), next], selectedPartId: id }, "Pièce manuelle créée · géométrie à définir");
    setSelectedManualId(id);
  };
  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory(items => items.slice(0, -1));
    setRedo(items => [...items, clone(center)]);
    setConfig(value => ({ ...value, mechanicalCenter: previous }));
    setNotice("Dernière modification mécanique annulée");
  };
  const redoAction = () => {
    const next = redo.at(-1);
    if (!next) return;
    setRedo(items => items.slice(0, -1));
    setHistory(items => [...items, clone(center)]);
    setConfig(value => ({ ...value, mechanicalCenter: next }));
    setNotice("Modification mécanique rétablie");
  };
  const saveLocal = () => { updateCenter({}, "Révision mécanique enregistrée dans le workspace"); };
  const selectTwin = (part: MechanicalPart) => { setSelectedTwinId(part.id); setSelectedManualId(""); setInspectorTab("identity"); setNotice(`Pièce sélectionnée : ${part.name}`); };
  const selectManual = (part: MechanicalCenterPart) => { setSelectedManualId(part.id); setSelectedTwinId(""); setInspectorTab("identity"); updateCenter({ selectedPartId: part.id }, `Pièce manuelle sélectionnée : ${part.label}`); };

  return <section className="mechanical-workbench" aria-label="AeroMind Mechanical Workbench">
    <header className="mwb-menubar"><div className="mwb-brand"><span className="mwb-mark">A</span><div><strong>AEROMIND</strong><small>MECHANICAL WORKBENCH</small></div></div><span className="mwb-design-name">{activeDroneLabel}</span><span className="mwb-spacer" /><span className="mwb-pill"><span className="mwb-live" /> VIRTUAL ONLY</span><span className="mwb-pill muted">{model ? "DESIGN SYNCHRONISÉ" : "APERÇU LOCAL"}</span></header>
    <nav className="mwb-toolbar" aria-label="Outils Mechanical Workbench"><button onClick={undo} disabled={!history.length}><Undo2 size={14} /> Annuler</button><button onClick={redoAction} disabled={!redo.length}><Redo2 size={14} /> Rétablir</button><button className="primary" onClick={saveLocal}><Save size={14} /> Enregistrer</button><span className="mwb-divider" /><button onClick={addManual}><Plus size={14} /> Pièce</button><button onClick={() => setExplosion(value => value ? 0 : 55)}><Box size={14} /> Vue éclatée</button><button onClick={() => setShowTreePreview(value => !value)}><Eye size={14} /> {showTreePreview ? "Surbrillance" : "Sans surbrillance"}</button><button onClick={() => setNotice("Mesure documentaire activée · métrique indicative")}><SlidersHorizontal size={14} /> Mesurer</button><button onClick={() => setNotice("Révision locale du dossier mécanique créée")}><Copy size={14} /> Variante</button><button title="Plein écran" onClick={() => document.querySelector<HTMLElement>(".mechanical-workbench")?.requestFullscreen?.()}><Maximize2 size={14} /></button><label className="mwb-search"><Search size={13} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher dans l’arbre…" /></label></nav>
    <div className="mwb-disclaimer"><ShieldCheck size={14} /> <span>Centre d’assemblage virtuel : toute géométrie, charge, fixation, filerie, couple et lubrification reste indicative jusqu’à validation humaine et source technique vérifiée.</span><b>MATÉRIEL DÉSACTIVÉ</b></div>
    <main className="mwb-main">
      <aside className="mwb-tree" aria-label="Arbre mécanique"><header><span>ARBRE D’ASSEMBLAGE</span><button onClick={() => setShowTreePreview(value => !value)}>{showTreePreview ? <Eye size={13} /> : <EyeOff size={13} />}</button></header><div className="mwb-root"><ChevronRight size={13} /> AEROMIND / {activeDroneLabel}</div>{treeGroups.map(group => <section key={group.id} className="mwb-tree-group"><div className="mwb-group-title"><ChevronRight size={12} /> {group.label}<em>{group.items.length}</em></div>{group.items.map(part => <button className={`mwb-tree-item ${selectedTwinId === part.id ? "selected" : ""}`} key={part.id} onClick={() => selectTwin(part)}><span className="mwb-tree-dot" /><span>{part.name}</span><small>{part.id}</small></button>)}</section>)}<section className="mwb-tree-group"><div className="mwb-group-title"><ChevronRight size={12} /> Pièces manuelles<em>{center.parts?.length ?? 0}</em></div>{(center.parts ?? []).map(part => <button className={`mwb-tree-item manual ${selectedManualId === part.id ? "selected" : ""}`} key={part.id} onClick={() => selectManual(part)}><span className="mwb-tree-dot manual" /><span>{part.label}</span><small>{installLabel[part.installState]}</small></button>)}</section><section className="mwb-tree-group"><div className="mwb-group-title"><History size={12} /> Révisions<em>{history.length}</em></div><div className="mwb-history-line">{history.length ? `${history.length} modification(s) locale(s)` : "Aucune modification non enregistrée"}</div></section></aside>
      <section className="mwb-center"><div className="mwb-center-tabs"><button className={mode === "part" ? "active" : ""} onClick={() => setMode("part")}>Part Studio mécanique</button><button className={mode === "assembly" ? "active" : ""} onClick={() => setMode("assembly")}>Assembly</button><button className={mode === "routing" ? "active" : ""} onClick={() => setMode("routing")}>Filerie & connectique</button><button className={mode === "maintenance" ? "active" : ""} onClick={() => setMode("maintenance")}>Maintenance</button></div>{mode === "routing" ? <MechanicalRoutingPanel config={config} setConfig={setConfig} onNotice={setNotice} /> : mode === "part" || mode === "assembly" ? <div className="mwb-viewport-wrap">{model ? <MechanicalTwinViewport model={model} selected={selectedTwinId} onSelect={id => { const part = model.parts.find(item => item.id === id); if (part) selectTwin(part); }} view="iso" mode="solid" explosion={explosion} resetKey={0} xrayCut={1} xrayOpacity={{}} previewPartId={showTreePreview ? selectedTwinId : undefined} previewEnabled={showTreePreview} /> : <div className="mwb-empty-viewport"><Box size={34} /><strong>AUCUN DESIGN MÉCANIQUE CHARGÉ</strong><span>Sélectionnez une cellule dans le catalogue pour alimenter le viewport 3D.</span></div>}<div className="mwb-viewport-overlay"><span>ISO · SOLID</span><span>{explosion ? `ÉCLATEMENT ${explosion}%` : "ASSEMBLÉ"}</span><label>Éclatement <input type="range" min="0" max="100" value={explosion} onChange={event => setExplosion(Number(event.target.value))} /></label></div></div> : <div className="mwb-module-placeholder"><Cable size={31} /><strong>PLAN DE MAINTENANCE</strong><span>Le module conserve les données de câbles, connecteurs, accès et opérations du Centre Mécanique.</span><button onClick={() => setMode("assembly")}>Ouvrir le viewport</button></div>}<div className="mwb-bottom-tabs"><button className="active"><Layers3 size={13} /> Propriétés</button><button><History size={13} /> Historique ({history.length})</button><button><CircleAlert size={13} /> Diagnostics</button><span className="mwb-bottom-status"><Check size={12} /> {notice}</span></div></section>
      <aside className="mwb-inspector" aria-label="Inspecteur mécanique"><header><div><span>INSPECTEUR</span><h3>{selectedLabel}</h3></div><Wrench size={15} /></header><nav className="mwb-inspector-tabs">{(["identity", "geometry", "assembly", "interfaces", "maintenance"] as InspectorTab[]).map(item => <button key={item} className={inspectorTab === item ? "active" : ""} onClick={() => setInspectorTab(item)}>{item === "identity" ? "Identité" : item === "geometry" ? "Géométrie" : item === "assembly" ? "Assemblage" : item === "interfaces" ? "Interfaces" : "Maintenance"}</button>)}</nav>{selectedManual ? <div className="mwb-inspector-body"><div className="mwb-id-line">ID stable <code>{selectedManual.id}</code></div>{inspectorTab === "identity" && <><label>Nom<input value={selectedManual.label} onChange={event => updateManual(selectedManual.id, { label: event.target.value })} /></label><label>Catégorie<select value={selectedManual.category} onChange={event => updateManual(selectedManual.id, { category: event.target.value as MechanicalCenterPart["category"] })}><option value="structure">Structure</option><option value="propulsion">Propulsion</option><option value="avionics">Avionique</option><option value="energy">Énergie</option><option value="hardware">Fixation</option></select></label><label>Source<select value={selectedManual.source} onChange={event => updateManual(selectedManual.id, { source: event.target.value as MechanicalCenterPart["source"] })}><option value="user">Utilisateur</option><option value="concept">Concept</option><option value="manufacturer">Constructeur</option></select></label></>}{inspectorTab === "geometry" && <><label>Masse indicative<input type="number" min="0" step="0.01" value={selectedManual.massKg} onChange={event => updateManual(selectedManual.id, { massKg: Number(event.target.value) })} /><small>kg · valeur de dossier</small></label><label>Interface<input value={selectedManual.interface} onChange={event => updateManual(selectedManual.id, { interface: event.target.value })} /></label></>}{inspectorTab === "assembly" && <><label>État d’installation<select value={selectedManual.installState} onChange={event => updateManual(selectedManual.id, { installState: event.target.value as MechanicalCenterPart["installState"] })}><option value="planned">Planifié</option><option value="installed">Installé</option><option value="inspected">Inspecté</option></select></label><label>Revue<select value={selectedManual.review} onChange={event => updateManual(selectedManual.id, { review: event.target.value as MechanicalCenterPart["review"] })}><option value="draft">Brouillon</option><option value="review">À revoir</option><option value="verified">Vérifié</option></select></label></>}{inspectorTab === "interfaces" && <div className="mwb-inspector-card"><Cable size={14} /><strong>Interfaces liées</strong><span>{center.wires?.filter(wire => wire.from.includes(selectedManual.label) || wire.to.includes(selectedManual.label)).length ?? 0} câble(s) · {center.connectors?.filter(connector => connector.sideA.includes(selectedManual.label) || connector.sideB.includes(selectedManual.label)).length ?? 0} connecteur(s)</span></div>}{inspectorTab === "maintenance" && <div className="mwb-inspector-card"><Wrench size={14} /><strong>Maintenance liée</strong><span>{center.maintenance?.filter(item => item.target.includes(selectedManual.label)).length ?? 0} opération(s) · {center.lubricationPoints?.filter(item => item.target.includes(selectedManual.label)).length ?? 0} point(s) de graissage</span></div>}<div className="mwb-inspector-note"><ShieldCheck size={13} /> Donnée locale, réversible et non certifiée.</div></div> : selectedTwin ? <div className="mwb-inspector-body"><div className="mwb-id-line">ID stable <code>{selectedTwin.id}</code></div><div className="mwb-stat"><span>Catégorie</span><strong>{selectedTwin.category}</strong></div><div className="mwb-stat"><span>Dimensions</span><strong>{selectedTwin.size.map(value => value.toFixed(3)).join(" × ")} m</strong></div><div className="mwb-stat"><span>Position</span><strong>{selectedTwin.position.map(value => value.toFixed(3)).join(" / ")} m</strong></div><div className="mwb-inspector-card"><Box size={14} /><strong>Source Mechanical Twin</strong><span>Géométrie synchronisée avec le design actif.</span></div></div> : <div className="mwb-empty-inspector">Sélectionnez une pièce dans l’arbre ou le viewport.</div>}</aside>
    </main>
    <footer className="mwb-footer"><span><span className="mwb-live" /> {notice}</span><span>Révision mécanique · locale</span><span>VIRTUAL ONLY · aucune commande physique</span></footer>
  </section>;
}

export default MechanicalWorkbench;
