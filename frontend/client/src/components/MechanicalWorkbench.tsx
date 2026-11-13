import { useEffect, useMemo, useState } from "react";
import { Box, Cable, Check, ChevronRight, CircleAlert, Copy, Eye, EyeOff, FileText, History, Layers3, Maximize2, Minus, Plus, Redo2, RotateCcw, Save, Search, ShieldCheck, SlidersHorizontal, Undo2, Wrench, Move3d, Camera } from "lucide-react";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import type { ConceptConfig } from "../lib/aeroEngine";
import { hasDroneGeometry } from "../lib/droneSketchGeometry";
import { buildMechanicalModel, mechanicalSettings, type MechanicalPart, type Vec3 } from "../lib/mechanicalTwinGeometry";
import { defaultMechanicalCenter, mergeMechanicalCenter, type MechanicalCenterConfig, type MechanicalCenterPart, type MechanicalCenterTab } from "../lib/mechanicalCenterModel";
import { MechanicalTwinViewport, type MechanicalRender, type MechanicalView } from "./MechanicalTwinViewport";
import { MechanicalCenter } from "./MechanicalCenter";
import { MechanicalRoutingPanel } from "./MechanicalRoutingPanel";
import MechanicalBuildDossierPanel from "./MechanicalBuildDossierPanel";
import "./mechanical-build-dossier.css";
import "./mechanical-workbench.css";
import "./mechanical-routing-panel.css";

type Props = { config: ConceptConfig; setConfig: React.Dispatch<React.SetStateAction<ConceptConfig>>; activeDroneLabel: string; activeProfile?: DroneCatalogDesign };
type InspectorTab = "identity" | "geometry" | "assembly" | "interfaces" | "maintenance";
type WorkbenchMode = "part" | "assembly" | "routing" | "maintenance" | "dossier" | "modules";

type Snapshot = MechanicalCenterConfig;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const categoryLabel: Record<MechanicalCenterPart["category"], string> = { structure: "Structure", propulsion: "Propulsion", avionics: "Avionique", energy: "Énergie", payload: "Mission", hardware: "Fixation" };
const installLabel = { planned: "Planifié", installed: "Installé", inspected: "Inspecté" } as const;

export function MechanicalWorkbench({ config, setConfig, activeDroneLabel, activeProfile }: Props) {
  // Use the same drawing identity as DigitalTwinExplorer so all views address
  // the same per-design edits. No geometry or selection means no substitute.
  const resolvedProfile = useMemo<DroneCatalogDesign | undefined>(() => {
    if (config.engineeringSelection?.source !== "custom") return activeProfile;
    const selection = config.engineeringSelection;
    if (!selection.droneId?.trim() || !hasDroneGeometry(config.customSketch?.strokes)) return undefined;
    return {
      key: config.airframe ?? "quadcopter",
      modelType: config.modelType as DroneCatalogDesign["modelType"],
      id: `custom-sketch-${selection.droneId}`,
      label: selection.droneLabel || config.designName || "Dessin personnalisé",
      family: "Jumeau mécanique · source dessin utilisateur",
      mission: "Projection de travail issue des traits du croquis utilisateur.",
      specs: "Projection indicative",
      disciplines: "Géométrie de dessin",
      tone: "cyan",
      configuration: { ...config },
      role: "civil",
      defenseUse: "Prototype conceptuel non armé; revue humaine et validation technique requises.",
      origin: "aeromind-parametric",
    };
  }, [activeProfile, config]);
  const customSource = config.engineeringSelection?.source === "custom" && Boolean(resolvedProfile);
  const displayDroneLabel = customSource ? resolvedProfile!.label : activeDroneLabel;
  const model = useMemo(() => resolvedProfile ? buildMechanicalModel(resolvedProfile, config) : null, [resolvedProfile, config]);
  const center = useMemo(() => mergeMechanicalCenter(config.mechanicalCenter), [config.mechanicalCenter]);
  const [mode, setMode] = useState<WorkbenchMode>("part");
  const [selectedTwinId, setSelectedTwinId] = useState(model?.parts[0]?.id ?? "");
  const [selectedManualId, setSelectedManualId] = useState(model?.parts.length ? "" : center.selectedPartId ?? center.parts?.[0]?.id ?? "");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("identity");
  const [lowerPanelTab, setLowerPanelTab] = useState<"properties" | "history" | "diagnostics">("properties");
  const [search, setSearch] = useState("");
  const [explosion, setExplosion] = useState(0);
  const [view, setView] = useState<MechanicalView>("iso");
  const [renderMode, setRenderMode] = useState<MechanicalRender>("solid");
  const [renderPreset, setRenderPreset] = useState("mechanical");
  const [transformEnabled, setTransformEnabled] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [showTreePreview, setShowTreePreview] = useState(true);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [redo, setRedo] = useState<Snapshot[]>([]);
  const [notice, setNotice] = useState("État local · aucune sortie matérielle");
  const setAssemblyExplosion = (amount: number) => {
    setExplosion(amount);
    if (amount === 0) setRenderPreset(preset => preset === "exploded" ? "mechanical" : preset);
  };
  const selectedTwin = model?.parts.find(part => part.id === selectedTwinId);
  useEffect(() => {
    const firstPart = model?.parts[0];
    setSelectedTwinId(firstPart?.id ?? "");
    setSelectedManualId(firstPart ? "" : center.selectedPartId ?? center.parts?.[0]?.id ?? "");
    setAssemblyExplosion(0);
    setTransformEnabled(false);
  }, [resolvedProfile?.id]);
  useEffect(() => {
    // A source drawing can lose or replace individual segments without changing
    // its design ID. Keep the current manual selection, but never a stale twin ID.
    if (selectedTwinId && !model?.parts.some(part => part.id === selectedTwinId)) {
      setSelectedTwinId(model?.parts[0]?.id ?? "");
    }
  }, [model, selectedTwinId]);
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
  const translateTwinPart = (id: string, delta: Vec3) => {
    const profile = resolvedProfile;
    if (!profile || delta.some(value => !Number.isFinite(value))) return;
    setConfig(current => {
      const settings = mechanicalSettings(profile, current);
      // mechanicalSettings normalizes the geometry subset only. Retain the raw
      // matching twin as well, including sketches, variables and deflections.
      const stored = current.mechanicalTwins?.[profile.id] ?? (current.mechanicalTwin?.designId === profile.id ? current.mechanicalTwin : undefined);
      const preserved = stored?.designId === profile.id ? stored : undefined;
      const previous = preserved?.edits?.[id]?.offset ?? settings.edits?.[id]?.offset ?? [0, 0, 0];
      const nextSettings = {
        ...settings,
        ...preserved,
        edits: {
          ...settings.edits, ...preserved?.edits,
          [id]: {
            ...settings.edits?.[id], ...preserved?.edits?.[id],
            offset: [previous[0] + delta[0], previous[1] + delta[1], previous[2] + delta[2]] as Vec3,
          },
        },
      };
      return {
        ...current,
        mechanicalTwin: nextSettings,
        mechanicalTwins: { ...current.mechanicalTwins, [profile.id]: nextSettings },
      };
    });
    setNotice(`Translation locale enregistrée · ${model?.parts.find(part => part.id === id)?.name ?? id}`);
  };
  const setTwinPositionAxis = (part: MechanicalPart, axis: number, value: number) => {
    if (!Number.isFinite(value)) return;
    const delta: Vec3 = [0, 0, 0];
    delta[axis] = value - part.position[axis];
    translateTwinPart(part.id, delta);
  };
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
  const saveLocal = () => { updateCenter({}, "Révision mécanique mise à jour dans le workspace · persistance non confirmée"); };
  const selectTwin = (part: MechanicalPart) => { setSelectedTwinId(part.id); setSelectedManualId(""); setInspectorTab("identity"); setNotice(`Pièce sélectionnée : ${part.name}`); };
  const selectManual = (part: MechanicalCenterPart) => { setSelectedManualId(part.id); setSelectedTwinId(""); setInspectorTab("identity"); updateCenter({ selectedPartId: part.id }, `Pièce manuelle sélectionnée : ${part.label}`); };
  const measureSelected = () => {
    setLowerPanelTab("properties");
    if (selectedTwin) setNotice(`Mesure indicative affichée · ${selectedTwin.name} · ${selectedTwin.size.map(value => value.toFixed(3)).join(" × ")} m`);
    else if (selectedManual) setNotice(`Mesure documentaire affichée · ${selectedManual.label} · masse déclarée ${selectedManual.massKg.toFixed(2)} kg`);
    else setNotice("Sélectionnez une pièce avant de consulter ses propriétés indicatives");
  };
  const createVariant = () => {
    const source = selectedManual ?? (selectedTwin ? { id: selectedTwin.id, label: selectedTwin.name, category: "hardware" as const, massKg: 0.05, interface: "À définir", installState: "planned" as const, review: "draft" as const, source: "user" as const } : null);
    if (!source) { setNotice("Sélectionnez une pièce pour créer une variante locale"); return; }
    const variant: MechanicalCenterPart = { ...source, id: `variant-${Date.now()}`, label: `${source.label} · Variante`, source: "user", review: "draft", installState: "planned" };
    updateCenter({ parts: [...(center.parts ?? []), variant], selectedPartId: variant.id }, `Variante locale créée à partir de ${source.label} · aucune géométrie industrielle générée`);
    setSelectedManualId(variant.id);
    setSelectedTwinId("");
    setLowerPanelTab("properties");
  };

  return <section className="mechanical-workbench" aria-label="AeroMind Mechanical Workbench">
    <header className="mwb-menubar"><div className="mwb-brand"><span className="mwb-mark">A</span><div><strong>AEROMIND</strong><small>MECHANICAL WORKBENCH</small></div></div><span className="mwb-design-name">{displayDroneLabel}</span><span className="mwb-spacer" /><span className="mwb-pill"><span className="mwb-live" /> VIRTUAL ONLY</span><span className="mwb-pill muted">{customSource ? "PROJECTION DU DESSIN" : model ? "DESIGN SYNCHRONISÉ" : "APERÇU LOCAL"}</span></header>
    <nav className="mwb-toolbar" aria-label="Outils Mechanical Workbench"><button onClick={undo} disabled={!history.length}><Undo2 size={14} /> Annuler</button><button onClick={redoAction} disabled={!redo.length}><Redo2 size={14} /> Rétablir</button><button className="primary" onClick={saveLocal}><Save size={14} /> Enregistrer</button><span className="mwb-divider" /><button onClick={addManual}><Plus size={14} /> Pièce</button><button className={explosion > 0 ? "primary" : ""} disabled={!model} aria-pressed={explosion > 0} onClick={() => setAssemblyExplosion(explosion ? 0 : 0.85)}><Box size={14} /> Vue éclatée</button><button className={transformEnabled ? "primary" : ""} disabled={!selectedTwin} aria-pressed={transformEnabled} title="Sélectionnez une pièce puis glissez les axes du manipulateur 3D" onClick={() => { if (!transformEnabled && explosion > 0) setAssemblyExplosion(0); setTransformEnabled(value => !value); }}><Move3d size={14} /> {transformEnabled ? "Déplacement actif" : "Déplacer"}</button><label className="mwb-camera-select"><Camera size={13} /><select aria-label="Vue caméra du modèle 3D" value={view} onChange={event => setView(event.target.value as MechanicalView)}><option value="iso">Isométrique</option><option value="top">Dessus</option><option value="front">Face</option><option value="side">Côté</option></select></label><button title="Réinitialiser la caméra" disabled={!model} onClick={() => setResetKey(value => value + 1)}><RotateCcw size={14} /> Vue initiale</button><button onClick={() => setShowTreePreview(value => !value)}><Eye size={14} /> {showTreePreview ? "Surbrillance" : "Sans surbrillance"}</button><button onClick={measureSelected}><SlidersHorizontal size={14} /> Mesurer</button><button onClick={createVariant}><Copy size={14} /> Variante locale</button><button title="Plein écran" onClick={() => document.querySelector<HTMLElement>(".mechanical-workbench")?.requestFullscreen?.()}><Maximize2 size={14} /></button><label className="mwb-search"><Search size={13} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher dans l’arbre…" /></label></nav>
    <div className="mwb-disclaimer"><ShieldCheck size={14} /> <span>Centre d’assemblage virtuel : toute géométrie, charge, fixation, filerie, couple et lubrification reste indicative jusqu’à validation humaine et source technique vérifiée. {customSource && "Projection des traits 2D aux dimensions du projet, sans reconstruction volumique fidèle. Triangles, hexagones, engrenages et hélices simplifiés aux segments entre points stockés et certains contours restent ouverts ; annotations et mesures exclues ; visibilité des calques et animations non appliquées ; les éditions du jumeau ne modifient pas le dessin source."}</span><b>MATÉRIEL DÉSACTIVÉ</b></div>
    <main className="mwb-main">
      <aside className="mwb-tree" aria-label="Arbre mécanique"><header><span>ARBRE D’ASSEMBLAGE</span><button onClick={() => setShowTreePreview(value => !value)}>{showTreePreview ? <Eye size={13} /> : <EyeOff size={13} />}</button></header><div className="mwb-root"><ChevronRight size={13} /> AEROMIND / {displayDroneLabel}</div>{treeGroups.map(group => <section key={group.id} className="mwb-tree-group"><div className="mwb-group-title"><ChevronRight size={12} /> {group.label}<em>{group.items.length}</em></div>{group.items.map(part => <button className={`mwb-tree-item ${selectedTwinId === part.id ? "selected" : ""}`} key={part.id} onClick={() => selectTwin(part)}><span className="mwb-tree-dot" /><span>{part.name}</span><small>{part.id}</small></button>)}</section>)}<section className="mwb-tree-group"><div className="mwb-group-title"><ChevronRight size={12} /> Pièces manuelles<em>{center.parts?.length ?? 0}</em></div>{(center.parts ?? []).map(part => <button className={`mwb-tree-item manual ${selectedManualId === part.id ? "selected" : ""}`} key={part.id} onClick={() => selectManual(part)}><span className="mwb-tree-dot manual" /><span>{part.label}</span><small>{installLabel[part.installState]}</small></button>)}</section><section className="mwb-tree-group"><div className="mwb-group-title"><History size={12} /> Révisions<em>{history.length}</em></div><div className="mwb-history-line">{history.length ? `${history.length} modification(s) locale(s)` : "Aucune modification non enregistrée"}</div></section></aside>
      <section className="mwb-center"><div className="mwb-center-tabs"><button className={mode === "part" ? "active" : ""} onClick={() => setMode("part")}>Part Studio mécanique</button><button className={mode === "assembly" ? "active" : ""} onClick={() => setMode("assembly")}>Assembly</button><button className={mode === "routing" ? "active" : ""} onClick={() => setMode("routing")}>Filerie & connectique</button><button className={mode === "maintenance" ? "active" : ""} onClick={() => setMode("maintenance")}>Maintenance</button><button className={mode === "dossier" ? "active" : ""} onClick={() => setMode("dossier")}>Construction & rapport</button><button className={mode === "modules" ? "active" : ""} onClick={() => setMode("modules")}>Modules historiques</button></div>{mode === "modules" ? <div className="mwb-legacy-center"><MechanicalCenter config={config} setConfig={setConfig} activeDroneLabel={displayDroneLabel} /></div> : mode === "dossier" ? <MechanicalBuildDossierPanel config={config} setConfig={setConfig} activeDroneLabel={displayDroneLabel} activeProfile={resolvedProfile} model={model} /> : mode === "routing" ? <MechanicalRoutingPanel config={config} setConfig={setConfig} onNotice={setNotice} /> : mode === "part" || mode === "assembly" ? <div className="mwb-viewport-wrap">{model ? <MechanicalTwinViewport model={model} selected={selectedTwinId} onSelect={id => { const part = model.parts.find(item => item.id === id); if (part) selectTwin(part); }} view={view} mode={renderMode} explosion={explosion} resetKey={resetKey} xrayCut={1} xrayOpacity={{}} previewPartId={showTreePreview ? selectedTwinId : undefined} previewEnabled={showTreePreview} transformEnabled={transformEnabled} onPartTransform={translateTwinPart} renderPreset={renderPreset} onRenderPresetChange={preset => { setRenderPreset(preset); setRenderMode(preset === "wireframe" || preset === "xray" ? preset : "solid"); if (preset === "exploded") setExplosion(value => value || 0.55); }} /> : <div className="mwb-empty-viewport"><Box size={34} /><strong>AUCUN DESIGN MÉCANIQUE CHARGÉ</strong><span>Sélectionnez une cellule ou un dessin comportant des traits géométriques pour alimenter le viewport 3D.</span></div>}<div className="mwb-viewport-overlay"><span>{view.toUpperCase()} · {renderPreset.toUpperCase()}</span><span>{explosion ? `ÉCLATEMENT ${explosion.toFixed(2)}×` : "ASSEMBLÉ"}</span><label>Dispersion <input aria-label="Dispersion de l’assemblage éclaté" type="range" min="0" max="2" step="0.05" disabled={!model} value={explosion} onChange={event => setAssemblyExplosion(Number(event.target.value))} /><button type="button" title="Réassembler le drone" disabled={!model} onClick={() => setAssemblyExplosion(0)}>Réinitialiser</button></label></div></div> : <div className="mwb-module-placeholder"><Cable size={31} /><strong>PLAN DE MAINTENANCE</strong><span>Le module conserve les données de câbles, connecteurs, accès et opérations du Centre Mécanique.</span><button onClick={() => setMode("assembly")}>Ouvrir le viewport</button></div>}<nav className="mwb-bottom-tabs" role="tablist" aria-label="Panneaux d’information mécanique"><button type="button" role="tab" aria-selected={lowerPanelTab === "properties"} className={lowerPanelTab === "properties" ? "active" : ""} onClick={() => setLowerPanelTab("properties")}><Layers3 size={13} /> Propriétés</button><button type="button" role="tab" aria-selected={lowerPanelTab === "history"} className={lowerPanelTab === "history" ? "active" : ""} onClick={() => setLowerPanelTab("history")}><History size={13} /> Historique ({history.length})</button><button type="button" role="tab" aria-selected={lowerPanelTab === "diagnostics"} className={lowerPanelTab === "diagnostics" ? "active" : ""} onClick={() => setLowerPanelTab("diagnostics")}><CircleAlert size={13} /> Diagnostics</button><span className="mwb-bottom-status"><Check size={12} /> {notice}</span></nav><section className="mwb-bottom-panel" role="tabpanel">
        {lowerPanelTab === "properties" && <div className="mwb-bottom-properties">{selectedManual ? <><strong>{selectedManual.label}</strong><span>{categoryLabel[selectedManual.category]} · {selectedManual.massKg.toFixed(2)} kg (déclaré) · {selectedManual.installState} · revue {selectedManual.review}</span><small>Interface : {selectedManual.interface || "À définir"} · donnée locale non vérifiée.</small></> : selectedTwin ? <><strong>{selectedTwin.name}</strong><span>{selectedTwin.category} · dimensions indicatives {selectedTwin.size.map(value => value.toFixed(3)).join(" × ")} m</span><small>Position locale {selectedTwin.position.map(value => value.toFixed(3)).join(" / ")} m · géométrie du jumeau numérique.</small></> : <span>Sélectionnez une pièce dans l’arbre pour afficher ses propriétés.</span>}</div>}
        {lowerPanelTab === "history" && <div className="mwb-bottom-history">{history.length ? history.slice().reverse().slice(0, 8).map((snapshot,index) => <article key={`${snapshot.updatedAt ?? "local"}-${index}`}><History size={13}/><span><strong>Révision locale {history.length-index}</strong><small>{snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleString("fr-FR") : "Horodatage non disponible"} · {snapshot.parts?.length ?? 0} pièce(s) au dossier</small></span></article>) : <span>Aucune modification enregistrée dans l’historique local de cette session.</span>}</div>}
        {lowerPanelTab === "diagnostics" && <div className="mwb-bottom-diagnostics"><article><Check size={14}/><span>{customSource ? "Projection du dessin actif chargée" : model ? "Jumeau mécanique chargé depuis le profil actif" : "Aucun profil mécanique actif"}</span></article><article>{selectedManual || selectedTwin ? <Check size={14}/> : <CircleAlert size={14}/>}<span>{selectedManual || selectedTwin ? `Sélection courante : ${selectedLabel}` : "Aucune pièce sélectionnée"}</span></article><article><ShieldCheck size={14}/><span>Sortie matérielle désactivée · aucune commande machine · contrôles certifiés non exécutés</span></article></div>}
      </section></section>
      <aside className="mwb-inspector" aria-label="Inspecteur mécanique"><header><div><span>INSPECTEUR</span><h3>{selectedLabel}</h3></div><Wrench size={15} /></header><nav className="mwb-inspector-tabs">{(["identity", "geometry", "assembly", "interfaces", "maintenance"] as InspectorTab[]).map(item => <button key={item} className={inspectorTab === item ? "active" : ""} onClick={() => setInspectorTab(item)}>{item === "identity" ? "Identité" : item === "geometry" ? "Géométrie" : item === "assembly" ? "Assemblage" : item === "interfaces" ? "Interfaces" : "Maintenance"}</button>)}</nav>{selectedManual ? <div className="mwb-inspector-body"><div className="mwb-id-line">ID stable <code>{selectedManual.id}</code></div>{inspectorTab === "identity" && <><label>Nom<input value={selectedManual.label} onChange={event => updateManual(selectedManual.id, { label: event.target.value })} /></label><label>Catégorie<select value={selectedManual.category} onChange={event => updateManual(selectedManual.id, { category: event.target.value as MechanicalCenterPart["category"] })}><option value="structure">Structure</option><option value="propulsion">Propulsion</option><option value="avionics">Avionique</option><option value="energy">Énergie</option><option value="hardware">Fixation</option></select></label><label>Source<select value={selectedManual.source} onChange={event => updateManual(selectedManual.id, { source: event.target.value as MechanicalCenterPart["source"] })}><option value="user">Utilisateur</option><option value="concept">Concept</option><option value="manufacturer">Constructeur</option></select></label></>}{inspectorTab === "geometry" && <><label>Masse indicative<input type="number" min="0" step="0.01" value={selectedManual.massKg} onChange={event => updateManual(selectedManual.id, { massKg: Number(event.target.value) })} /><small>kg · valeur de dossier</small></label><label>Interface<input value={selectedManual.interface} onChange={event => updateManual(selectedManual.id, { interface: event.target.value })} /></label></>}{inspectorTab === "assembly" && <><label>État d’installation<select value={selectedManual.installState} onChange={event => updateManual(selectedManual.id, { installState: event.target.value as MechanicalCenterPart["installState"] })}><option value="planned">Planifié</option><option value="installed">Installé</option><option value="inspected">Inspecté</option></select></label><label>Revue<select value={selectedManual.review} onChange={event => updateManual(selectedManual.id, { review: event.target.value as MechanicalCenterPart["review"] })}><option value="draft">Brouillon</option><option value="review">À revoir</option><option value="verified">Vérifié</option></select></label></>}{inspectorTab === "interfaces" && <div className="mwb-inspector-card"><Cable size={14} /><strong>Interfaces liées</strong><span>{center.wires?.filter(wire => wire.from.includes(selectedManual.label) || wire.to.includes(selectedManual.label)).length ?? 0} câble(s) · {center.connectors?.filter(connector => connector.sideA.includes(selectedManual.label) || connector.sideB.includes(selectedManual.label)).length ?? 0} connecteur(s)</span></div>}{inspectorTab === "maintenance" && <div className="mwb-inspector-card"><Wrench size={14} /><strong>Maintenance liée</strong><span>{center.maintenance?.filter(item => item.target.includes(selectedManual.label)).length ?? 0} opération(s) · {center.lubricationPoints?.filter(item => item.target.includes(selectedManual.label)).length ?? 0} point(s) de graissage</span></div>}<div className="mwb-inspector-note"><ShieldCheck size={13} /> Donnée locale, réversible et non certifiée.</div></div> : selectedTwin ? <div className="mwb-inspector-body"><div className="mwb-id-line">ID stable <code>{selectedTwin.id}</code></div><div className="mwb-stat"><span>Catégorie</span><strong>{selectedTwin.category}</strong></div><div className="mwb-stat"><span>Dimensions</span><strong>{selectedTwin.size.map(value => value.toFixed(3)).join(" × ")} m</strong></div><div className="mwb-stat"><span>Position</span><strong>{selectedTwin.position.map(value => value.toFixed(3)).join(" / ")} m</strong></div><div className="mwb-position-editor"><strong>POSITION · M</strong><div>{(["X", "Y", "Z"] as const).map((axis, index) => <label key={axis}>{axis}<input aria-label={`Position ${axis} de ${selectedTwin.name}`} type="number" step="0.01" value={Number(selectedTwin.position[index].toFixed(3))} onChange={event => setTwinPositionAxis(selectedTwin, index, Number(event.target.value))} /></label>)}</div></div><div className="mwb-inspector-card"><Box size={14} /><strong>Source Mechanical Twin</strong><span>{customSource ? "Projection des traits du dessin actif ; les déplacements modifient le jumeau, pas le croquis source." : "Géométrie synchronisée avec le design actif."} Les pièces manuelles du dossier n’ont pas de mesh 3D à déplacer.</span></div></div> : <div className="mwb-empty-inspector">Sélectionnez une pièce dans l’arbre ou le viewport.</div>}</aside>
    </main>
    <footer className="mwb-footer"><span><span className="mwb-live" /> {notice}</span><span>Révision mécanique · locale</span><span>VIRTUAL ONLY · aucune commande physique</span></footer>
  </section>;
}

export default MechanicalWorkbench;
