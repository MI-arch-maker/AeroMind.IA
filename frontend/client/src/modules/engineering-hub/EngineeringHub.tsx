import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  ArrowDownToLine, ArrowRight, BadgeCheck, Boxes, Building2, Check, ChevronDown,
  ChevronRight, CircleAlert, ClipboardCheck, FilePlus2, FileText, Folder, FolderOpen,
  FolderPlus, Gauge, Layers3, Orbit, PackageCheck, Pencil, Plus, Save, Search,
  ShieldAlert, Trash2, Wrench, X,
} from "lucide-react";
import type { ConceptConfig } from "../../lib/aeroEngine";
import { droneCatalog, type DroneCatalogDesign } from "../../lib/droneCatalog";
import { buildMechanicalModel, type MechanicalModel, type Vec3 } from "../../lib/mechanicalTwinGeometry";
import { materialCatalog } from "../../lib/materialLibrary";
import { getRenderEngine, renderEngineRegistry } from "../../lib/renderEngines";
import {
  createDefaultEngineeringWorkspace, createEngineeringDocument, createEngineeringFolder,
  deleteEngineeringFolder, normalizeEngineeringWorkspace, renameEngineeringFolder,
  updateEngineeringDocument, type EngineeringDocument, type EngineeringFolder,
  type EngineeringWorkspaceConfig, type FactoryStage, type FactoryStation,
} from "../../lib/engineeringWorkspace";
import { MechanicalTwinViewport, type MechanicalRender, type MechanicalView } from "../../components/MechanicalTwinViewport";
import EngineeringConnectorPanel from "./EngineeringConnectorPanel";
import "./engineering-hub.css";

export type EngineeringHubView = "overview" | "requirements" | "catalog" | "concept" | "design-studio" | "parametric-center" | "mechanical-center" | "digital-twin" | "materials" | "simulation" | "live" | "command-center" | "report" | "operations" | "aero-center";
type Props = {
  projectId?: string;
  projectName: string;
  cellName: string;
  runId: string;
  serverPersisted: boolean;
  saveState: "saved" | "saving" | "error";
  config: ConceptConfig;
  setConfig: Dispatch<SetStateAction<ConceptConfig>>;
  design?: DroneCatalogDesign;
  t: (frenchText: string) => string;
  onLoadDrone: (design: DroneCatalogDesign) => void;
  onOpen: (view: EngineeringHubView) => void;
};
type WorkbenchTab = "assembly" | "parts" | "factory" | "documents" | "modules";
type TreeNode = { folder: EngineeringFolder; children: TreeNode[] };
const stageOrder: FactoryStage[] = ["planned", "preparation", "assembly", "inspection", "complete"];
const stageLabels: Record<FactoryStage, string> = { planned: "À planifier", preparation: "Préparation", assembly: "Assemblage", inspection: "Inspection", complete: "Terminé" };
const stageTone: Record<FactoryStage, string> = { planned: "neutral", preparation: "cyan", assembly: "blue", inspection: "amber", complete: "green" };
const kindLabels: Record<string, string> = { receiving: "Réception", materials: "Matériaux", assembly: "Assemblage", integration: "Intégration", inspection: "Inspection", packaging: "Conditionnement", custom: "Poste libre" };
const departmentLinks: Array<{ label: string; view: EngineeringHubView; status: string }> = [
  { label: "Poste de construction / modernisation", view: "concept", status: "Configuration et préparation de cellule" },
  { label: "Centre paramétrique & CAO", view: "parametric-center", status: "Édition de la cellule" },
  { label: "Centre mécanique & assemblage", view: "mechanical-center", status: "Déplacement précis, pièces et revue" },
  { label: "Studio IDDS", view: "design-studio", status: "Croquis, couches et assemblage" },
  { label: "Jumeau numérique", view: "digital-twin", status: "Vue et simulation du modèle" },
  { label: "Matériaux & nomenclature", view: "materials", status: "Références et composants" },
  { label: "Aérodynamique / CFD", view: "aero-center", status: "Analyse conceptuelle" },
  { label: "Simulations", view: "simulation", status: "Runs AeroMind" },
  { label: "Essais & scénarios", view: "live", status: "Essais virtuels / revue" },
  { label: "Exigences système", view: "requirements", status: "Traçabilité des exigences" },
  { label: "Rapports & documentation", view: "report", status: "Dossier de revue" },
];
const safeDownload = (name: string, text: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
};
const makeStation = (name: string, kind: FactoryStation["kind"], index: number): FactoryStation => ({
  id: `station-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${index}`}`,
  name: name.trim() || "Nouveau poste virtuel", kind,
  x: Math.max(10, Math.min(90, 18 + (index % 4) * 21)),
  y: index % 2 ? 70 : 22,
  createdAt: new Date().toISOString(),
});
function buildTree(folders: EngineeringFolder[]): TreeNode[] {
  const byParent = new Map<string | null, EngineeringFolder[]>();
  for (const folder of folders) byParent.set(folder.parentId, [...(byParent.get(folder.parentId) ?? []), folder]);
  const build = (folder: EngineeringFolder, ancestors: Set<string>): TreeNode => {
    if (ancestors.has(folder.id)) return { folder: { ...folder, parentId: null }, children: [] };
    const next = new Set(ancestors); next.add(folder.id);
    return { folder, children: (byParent.get(folder.id) ?? []).map(child => build(child, next)) };
  };
  return (byParent.get(null) ?? []).map(folder => build(folder, new Set()));
}
export default function EngineeringHub({ projectId, projectName, cellName, runId, serverPersisted, saveState, config, setConfig, design, t, onLoadDrone, onOpen }: Props) {
  const workspace = useMemo(() => config.engineeringWorkspace ? normalizeEngineeringWorkspace(config.engineeringWorkspace) : createDefaultEngineeringWorkspace(), [config.engineeringWorkspace]);
  const [tab, setTab] = useState<WorkbenchTab>("assembly");
  const [selectedFolderId, setSelectedFolderId] = useState("folder-design");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "folder-design": true, "folder-assembly": true, "folder-manufacturing": true, "folder-validation": true });
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [addingStation, setAddingStation] = useState(false);
  const [newStationName, setNewStationName] = useState("");
  const [stationKind, setStationKind] = useState<FactoryStation["kind"]>("assembly");
  const [selectedStationId, setSelectedStationId] = useState(workspace.stations[0]?.id ?? "");
  const [draftDroneId, setDraftDroneId] = useState("");
  const [selectedPartId, setSelectedPartId] = useState("");
  const [partFilter, setPartFilter] = useState("");
  const [showProjectRail, setShowProjectRail] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [view, setView] = useState<MechanicalView>("iso");
  const [mode, setMode] = useState<MechanicalRender>("solid");
  const [renderPreset, setRenderPreset] = useState("mechanical");
  const [explosion, setExplosion] = useState(0);
  const [xrayCut, setXrayCut] = useState(0.55);
  const [message, setMessage] = useState("");
  const selectedFolder = workspace.folders.find(folder => folder.id === selectedFolderId) ?? workspace.folders[0];
  const selectedDocument = workspace.documents.find(document => document.id === selectedDocumentId);
  const catalogPreview = droneCatalog.find(item => item.id === draftDroneId);
  const hasDrawing = Boolean(config.customSketch?.strokes.some(stroke => stroke.points.length > 1 && !["annotation", "measure"].includes(stroke.tool)));
  const drawingDesign = useMemo<DroneCatalogDesign | undefined>(() => {
    if (!hasDrawing) return undefined;
    const base = droneCatalog.find(item => item.id === config.platformProfile) ?? droneCatalog[0];
    if (!base) return undefined;
    return { ...base, id: `custom-sketch-${config.engineeringSelection?.droneId || "workspace"}`, label: config.engineeringSelection?.droneLabel || config.designName || "Drone dessiné par l’ingénieur", origin: "aeromind-parametric", configuration: { ...base.configuration, ...config } };
  }, [hasDrawing, config]);
  const activeDesign = design ?? drawingDesign;
  const sceneDesign = activeDesign;
  const sceneConfig = useMemo(() => {
    if (!sceneDesign) return config;
    const activeTwin = config.mechanicalTwins?.[sceneDesign.id] ?? (config.mechanicalTwin?.designId === sceneDesign.id ? config.mechanicalTwin : undefined);
    return { ...sceneDesign.configuration, ...config, mechanicalTwin: activeTwin } as ConceptConfig;
  }, [sceneDesign, config]);
  const model = useMemo<MechanicalModel | undefined>(() => sceneDesign ? buildMechanicalModel(sceneDesign, sceneConfig) : undefined, [sceneDesign, sceneConfig]);
  const selectedPart = model?.parts.find(part => part.id === selectedPartId) ?? model?.parts[0];
  const selectedStation = workspace.stations.find(station => station.id === selectedStationId) ?? workspace.stations[0];
  const tree = useMemo(() => buildTree(workspace.folders), [workspace.folders]);
  const activeCell = Boolean(activeDesign);
  const cellLabel = activeDesign?.label ?? cellName;
  const syncStatus = saveState === "saving" ? "Enregistrement du projet…" : saveState === "error" ? "Enregistrement en échec — consultez l’état du workspace" : serverPersisted ? "Projet synchronisé / serveur" : projectId ? "Brouillon du projet dans ce navigateur" : "Aucun projet actif — données limitées à cette session";
  const updateWorkspace = (next: EngineeringWorkspaceConfig) => setConfig(current => ({ ...current, engineeringWorkspace: { ...next, updatedAt: new Date().toISOString() } }));
  const toggleFolder = (folderId: string) => setExpanded(current => ({ ...current, [folderId]: !current[folderId] }));
  const createFolder = () => {
    try {
      const next = createEngineeringFolder(workspace, newFolderName, selectedFolder?.id ?? null);
      const created = next.folders[next.folders.length - 1];
      updateWorkspace(next); setSelectedFolderId(created.id); setExpanded(current => ({ ...current, [created.parentId ?? "root"]: true, [created.id]: true }));
      setNewFolderName(""); setAddingFolder(false); setMessage("Dossier ajouté au projet.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const createDocument = (kind: EngineeringDocument["kind"]) => {
    if (!selectedFolder) { setMessage("Créez ou sélectionnez un dossier avant le document."); return; }
    try {
      const next = createEngineeringDocument(workspace, selectedFolder.id, kind);
      const created = next.documents[next.documents.length - 1];
      updateWorkspace(next); setSelectedDocumentId(created.id); setTab("documents"); setMessage("Document créé dans le dossier sélectionné.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const editDocument = (patch: Partial<Pick<EngineeringDocument, "name" | "body">>) => {
    if (!selectedDocument) return;
    try { updateWorkspace(updateEngineeringDocument(workspace, selectedDocument.id, patch)); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const chooseMaterial = (partId: string, materialId: string) => updateWorkspace({ ...workspace, partMaterials: { ...workspace.partMaterials, [partId]: materialId } });
  const setPartStage = (partId: string, stage: FactoryStage) => updateWorkspace({ ...workspace, partStages: { ...workspace.partStages, [partId]: stage } });
  const assignPartStation = (partId: string, stationId: string) => {
    const partStations = { ...workspace.partStations };
    if (stationId) partStations[partId] = stationId; else delete partStations[partId];
    updateWorkspace({ ...workspace, partStations });
  };
  const updateStation = (stationId: string, patch: Partial<FactoryStation>) => updateWorkspace({ ...workspace, stations: workspace.stations.map(station => station.id === stationId ? { ...station, ...patch } : station) });
  const deleteFolder = () => {
    if (!selectedFolder || !window.confirm(`Supprimer « ${selectedFolder.name} » et son contenu ? Cette action retire aussi ses sous-dossiers et documents du projet.`)) return;
    try {
      const deleted = selectedFolder.id;
      const next = deleteEngineeringFolder(workspace, deleted);
      updateWorkspace(next); setSelectedFolderId(next.folders[0]?.id ?? ""); setSelectedDocumentId(""); setMessage("Dossier et contenu supprimés du workspace.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const renameFolder = () => {
    if (!selectedFolder) return;
    const name = window.prompt("Nouveau nom du dossier", selectedFolder.name);
    if (name === null) return;
    try { updateWorkspace(renameEngineeringFolder(workspace, selectedFolder.id, name)); setMessage("Dossier renommé."); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const addStation = () => {
    const name = newStationName.trim();
    if (!name) { setMessage("Saisissez le nom du poste virtuel."); return; }
    const station = makeStation(name, stationKind, workspace.stations.length);
    const next = { ...workspace, stations: [...workspace.stations, station] };
    updateWorkspace(next); setSelectedStationId(station.id); setNewStationName(""); setAddingStation(false); setMessage("Poste virtuel ajouté au plan conceptuel.");
  };
  const removeStation = () => {
    if (!selectedStation || !window.confirm(`Retirer le poste virtuel « ${selectedStation.name} » du plan ?`)) return;
    const stations = workspace.stations.filter(station => station.id !== selectedStation.id);
    const partStations = Object.fromEntries(Object.entries(workspace.partStations).filter(([, stationId]) => stationId !== selectedStation.id));
    updateWorkspace({ ...workspace, stations, partStations }); setSelectedStationId(stations[0]?.id ?? ""); setMessage("Poste retiré; affectations associées nettoyées.");
  };
  const movePart = (partId: string, delta: Vec3) => {
    if (!sceneDesign) return;
    setConfig(current => {
      const previous = current.mechanicalTwins?.[sceneDesign.id] ?? (current.mechanicalTwin?.designId === sceneDesign.id ? current.mechanicalTwin : undefined);
      const old = previous?.edits?.[partId] ?? {};
      const offset = old.offset ?? [0, 0, 0];
      const edit = { ...old, offset: [offset[0] + delta[0], offset[1] + delta[1], offset[2] + delta[2]] as Vec3 };
      const nextTwin = { ...(previous ?? model?.settings ?? { designId: sceneDesign.id }), designId: sceneDesign.id, edits: { ...previous?.edits, [partId]: edit } };
      return { ...current, mechanicalTwin: nextTwin, mechanicalTwins: { ...current.mechanicalTwins, [sceneDesign.id]: nextTwin } };
    });
  };
  const exportBom = () => {
    if (!model) return;
    const rows = [["part_id", "nom", "catégorie", "sommets", "triangles", "matériau_de_référence", "poste_virtuel", "étape"]];
    for (const part of model.parts) {
      const material = materialCatalog.find(item => item.id === workspace.partMaterials[part.id]);
      const station = workspace.stations.find(item => item.id === workspace.partStations[part.id]);
      const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
      rows.push([part.id, part.name, part.category, Math.floor(part.vertices.length / 3), Math.floor(part.indices.length / 3), material?.label ?? "", station?.name ?? "", stageLabels[workspace.partStages[part.id] ?? "planned"]].map(quote));
    }
    safeDownload(`${(sceneDesign?.label ?? "drone").replace(/[^\p{L}\p{N}-]+/gu, "-")}-nomenclature.csv`, rows.map(row => row.join(",")).join("\n"), "text/csv;charset=utf-8");
  };
  const exportWorkspace = () => safeDownload(`${(projectName || "Aeromind").replace(/[^\p{L}\p{N}-]+/gu, "-")}-workspace-ingenierie.json`, JSON.stringify({ projectId: projectId ?? null, projectName, drone: activeDesign?.label ?? null, workspace }, null, 2), "application/json;charset=utf-8");
  const folderTree = (nodes: TreeNode[], depth = 0) => nodes.map(({ folder, children }) => {
    const open = expanded[folder.id] ?? depth < 1;
    const childDocs = workspace.documents.filter(document => document.folderId === folder.id);
    return <div key={folder.id} className="ew-tree-branch">
      <div className={`ew-tree-row ${selectedFolderId === folder.id ? "selected" : ""}`} style={{ paddingLeft: 8 + depth * 12 }}>
        <button className="ew-tree-toggle" aria-label={`${open ? "Replier" : "Déplier"} ${folder.name}`} aria-expanded={open} onClick={() => toggleFolder(folder.id)}>{children.length || childDocs.length ? open ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : <span className="ew-tree-dot" />}</button>
        <button className="ew-tree-label" onClick={() => { setSelectedFolderId(folder.id); setSelectedDocumentId(""); }}><>{selectedFolderId === folder.id || open ? <FolderOpen size={14} /> : <Folder size={14} />}<span>{folder.name}</span><small>{childDocs.length + children.length}</small></></button>
      </div>
      {open && <>
        {childDocs.map(document => <button key={document.id} className={`ew-tree-document ${selectedDocumentId === document.id ? "selected" : ""}`} style={{ paddingLeft: 28 + depth * 12 }} onClick={() => { setSelectedFolderId(folder.id); setSelectedDocumentId(document.id); setTab("documents"); }}><FileText size={12} /><span>{document.name}</span></button>)}
        {folderTree(children, depth + 1)}
      </>}
    </div>;
  });
  const filteredParts = (model?.parts ?? []).filter(part => `${part.name} ${part.category} ${part.id}`.toLocaleLowerCase("fr-FR").includes(partFilter.toLocaleLowerCase("fr-FR")));
  const renderView = () => {
    if (tab === "assembly" && !activeDesign) return <section className="ew-no-cell"><div className="ew-no-cell-mark"><Orbit size={26} /></div><span>ZONE CAO · ÉTAT NEUTRE</span><h2>Aucune cellule sélectionnée</h2><p>Aucun drone n’est généré ou affiché par défaut. La géométrie apparaîtra uniquement après la sélection explicite et le chargement d’un profil, ou après la création d’un dessin.</p><div className="ew-no-cell-actions"><label><span>Choisir un profil de référence</span><select aria-label="Profil drone à charger" value={draftDroneId} onChange={event => setDraftDroneId(event.target.value)}><option value="">Sélectionner un profil…</option>{droneCatalog.map(item => <option key={item.id} value={item.id}>{item.label} · {item.family}</option>)}</select></label><button className="ew-button primary" disabled={!catalogPreview} onClick={() => catalogPreview && onLoadDrone(catalogPreview)}><Check size={14} /> Charger dans le projet</button><button className="ew-button" onClick={() => onOpen("design-studio")}><Wrench size={14} /> Créer un dessin</button></div><small>Sans sélection ou dessin explicite : 0 modèle · 0 pièce · aucun mesh.</small></section>;
    if (tab === "assembly") return <section className="ew-scene-panel">
      <div className="ew-scene-toolbar">
        <div className="ew-scene-title"><span>{activeCell ? "CELLULE ACTIVE" : "APERÇU DE PROFIL — NON APPLIQUÉ"}</span><strong>{sceneDesign?.label ?? "Aucun drone chargé"}</strong><small>{model?.modelType ?? "Sélectionnez un profil pour générer l’assemblage"} · {model?.parts.length ?? 0} composants paramétriques · m</small></div>
        <div className="ew-view-controls">{(["iso", "top", "front", "side"] as MechanicalView[]).map(option => <button key={option} className={view === option ? "active" : ""} onClick={() => setView(option)}>{option === "iso" ? "Isométrique" : option === "top" ? "Dessus" : option === "front" ? "Face" : "Côté"}</button>)}</div>
      </div>
      <div className="ew-canvas-wrap">
        {model && <MechanicalTwinViewport model={model} selected={selectedPart?.id ?? ""} onSelect={setSelectedPartId} view={view} mode={mode} explosion={explosion} resetKey={0} xrayCut={xrayCut} xrayOpacity={{}} renderPreset={renderPreset} onRenderPresetChange={setRenderPreset} transformEnabled={activeCell} onPartTransform={movePart} />}
      </div>
      <div className="ew-scene-footer"><span>{model?.parts.filter(part => !part.hidden).length ?? 0} composants visibles</span><span>Sélection : {selectedPart?.name ?? "aucune"}</span><label>Écorché <input aria-label="Niveau d’éclatement de l’assemblage" type="range" min="0" max="1.7" step="0.05" value={explosion} onChange={event => setExplosion(Number(event.target.value))} /></label><label>Coupe <input aria-label="Plan de coupe local" type="range" min="0.05" max="0.95" step="0.05" value={xrayCut} onChange={event => setXrayCut(Number(event.target.value))} /></label><select aria-label="Mode mécanique" value={mode} onChange={event => setMode(event.target.value as MechanicalRender)}><option value="solid">Solide</option><option value="wireframe">Filaire</option><option value="xray">X-ray</option></select><select aria-label="Pipeline technique" value={renderPreset} onChange={event => setRenderPreset(event.target.value)}>{Object.values(renderEngineRegistry).map(engine => <option key={engine.id} value={engine.id}>{engine.label}</option>)}</select></div>
    </section>;
    if (tab === "parts") return <section className="ew-content-card ew-parts-view">
      <header className="ew-panel-header"><div><span>ASSEMBLAGE SOURCE · {model?.parts.length ?? 0} OBJETS</span><h2>Composants & matériaux</h2></div><button className="ew-button" onClick={exportBom} disabled={!model?.parts.length}><ArrowDownToLine size={14} /> Exporter la nomenclature CSV</button></header>
      <label className="ew-search"><Search size={14} /><input value={partFilter} onChange={event => setPartFilter(event.target.value)} placeholder="Filtrer les pièces du drone…" /></label>
      <div className="ew-parts-table"><div className="ew-parts-head"><span>Composant</span><span>Géométrie</span><span>Référence matière</span><span>État</span></div>
        {filteredParts.map(part => { const assigned = materialCatalog.find(item => item.id === workspace.partMaterials[part.id]); return <button key={part.id} className={`ew-part-row ${selectedPart?.id === part.id ? "selected" : ""}`} onClick={() => setSelectedPartId(part.id)}><span><i style={{ background: part.color }} /><strong>{part.name}</strong><small>{part.category} · {part.id}</small></span><span>{Math.floor(part.vertices.length / 3)} sommets<br /><small>{Math.floor(part.indices.length / 3)} triangles</small></span><span>{assigned?.label ?? "Non affecté"}<small>{assigned?.manufacturer ?? "Référence à définir"}</small></span><span className="ew-unverified">{assigned ? "À vérifier" : "À affecter"}</span></button>; })}
        {!filteredParts.length && <div className="ew-table-empty">Aucune pièce ne correspond au filtre.</div>}
      </div>
      <div className="ew-honesty"><CircleAlert size={15} /> Les composants proviennent du mesh conceptuel AeroMind. Une affectation de référence matériau est une donnée de projet; elle ne prouve ni achat, ni réception, ni présence physique.</div>
    </section>;
    if (tab === "factory") return <section className="ew-factory-view">
      <header className="ew-panel-header"><div><span>PLANIFICATION INDUSTRIELLE / MODE VIRTUEL</span><h2>Usine numérique du projet</h2><p>Le plan ci-dessous organise les postes et composants du drone. Il ne représente pas un site ou des équipements physiques connectés.</p></div><button className="ew-button primary" onClick={() => setAddingStation(true)}><Plus size={14} /> Ajouter un poste</button></header>
      {addingStation && <div className="ew-inline-form"><input autoFocus value={newStationName} onChange={event => setNewStationName(event.target.value)} onKeyDown={event => event.key === "Enter" && addStation()} placeholder="Nom du nouveau poste virtuel" /><select value={stationKind} onChange={event => setStationKind(event.target.value as FactoryStation["kind"])}>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button onClick={addStation}><Check size={14} /> Créer</button><button onClick={() => setAddingStation(false)}><X size={14} /> Annuler</button></div>}
      <div className="ew-factory-canvas" aria-label="Plan conceptuel de l’usine virtuelle"><div className="ew-factory-grid" />{workspace.stations.map((station, index) => { const count = Object.values(workspace.partStations).filter(value => value === station.id).length; return <button key={station.id} className={`ew-station ${selectedStation?.id === station.id ? "selected" : ""}`} style={{ left: `${station.x}%`, top: `${station.y}%` }} onClick={() => setSelectedStationId(station.id)}><span>{String(index + 1).padStart(2, "0")}</span><Building2 size={17} /><strong>{station.name}</strong><small>{kindLabels[station.kind]} · {count} pièce(s)</small></button>; })}<div className="ew-factory-track" /><span className="ew-factory-legend">FLUX CONCEPTUEL DU DRONE / NON CONNECTÉ AU MONDE PHYSIQUE</span></div>
      <div className="ew-process-table"><div className="ew-process-heading"><strong>Gamme de travail liée aux pièces</strong><span>{model?.parts.length ?? 0} composants · {workspace.stations.length} postes virtuels</span></div><div className="ew-process-columns"><span>Pièce du modèle</span><span>Poste virtuel affecté</span><span>Étape déclarée</span></div>{(model?.parts ?? []).slice(0, 80).map(part => <div className="ew-process-row" key={part.id}><strong>{part.name}<small>{part.category}</small></strong><select value={workspace.partStations[part.id] ?? ""} onChange={event => assignPartStation(part.id, event.target.value)}><option value="">Non affecté</option>{workspace.stations.map(station => <option key={station.id} value={station.id}>{station.name}</option>)}</select><select className={`ew-stage-select ${stageTone[workspace.partStages[part.id] ?? "planned"]}`} value={workspace.partStages[part.id] ?? "planned"} onChange={event => setPartStage(part.id, event.target.value as FactoryStage)}>{stageOrder.map(stage => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select></div>)}{(model?.parts.length ?? 0) > 80 && <div className="ew-table-empty">Affichage limité aux 80 premiers composants; exportez la nomenclature pour le reste.</div>}</div>
      <div className="ew-honesty"><ShieldAlert size={15} /> État usine : numérique / conceptuel. Aucun PLC, robot, machine-outil, MES ou système de traçabilité physique n’est connecté par ce poste.</div>
    </section>;
    if (tab === "documents") return <section className="ew-content-card ew-document-view"><header className="ew-panel-header"><div><span>DOSSIER TECHNIQUE / DOCUMENTS DU PROJET</span><h2>{selectedDocument?.name ?? selectedFolder?.name ?? "Documents"}</h2></div><div className="ew-action-row"><button className="ew-button" onClick={() => createDocument("note")}><FilePlus2 size={14} /> Note</button><button className="ew-button" onClick={() => createDocument("work-instruction")}><ClipboardCheck size={14} /> Instruction</button><button className="ew-button" onClick={() => createDocument("inspection")}><FileText size={14} /> Inspection</button></div></header>
      {selectedDocument ? <><input className="ew-document-name" aria-label="Nom du document" value={selectedDocument.name} onChange={event => editDocument({ name: event.target.value })} /><div className="ew-doc-meta">{selectedDocument.kind} · créé le {new Date(selectedDocument.createdAt).toLocaleString("fr-FR")} · modifié le {new Date(selectedDocument.updatedAt).toLocaleString("fr-FR")}</div><textarea className="ew-document-body" value={selectedDocument.body} onChange={event => editDocument({ body: event.target.value })} placeholder="Rédigez les éléments du dossier technique, hypothèses, références et décisions. Les champs vides ne sont pas préremplis comme des faits." /><p className="ew-honesty"><CircleAlert size={15} /> Enregistré avec la configuration du projet selon le statut affiché en bas du workspace. Aucun contenu de conformité n’est approuvé automatiquement.</p></> : <div className="ew-empty"><FileText size={28} /><strong>Aucun document sélectionné</strong><span>Choisissez un document dans l’arborescence ou créez une note, une instruction ou une fiche d’inspection.</span></div>}</section>;
    return <section className="ew-content-card ew-module-view"><header className="ew-panel-header"><div><span>OUTILS MÉTIER AEROMIND / PARCOURS ACTUELS</span><h2>Applications & connecteurs</h2><p>Le poste de travail reste le point d’entrée; les modules spécialisés gardent leurs fonctions métier existantes.</p></div></header><div className="ew-module-links">{departmentLinks.map((item, index) => <button key={item.view} onClick={() => onOpen(item.view)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.label}</strong><small>{item.status}</small><ArrowRight size={14} /></button>)}</div><EngineeringConnectorPanel projectId={projectId} t={t} /><div className="ew-honesty"><BadgeCheck size={15} /> Les modules et connecteurs portent leur propre état; un lien ou un exécutable détecté ne signifie pas que l’intégration est opérationnelle.</div></section>;
  };
  return <div className="engineering-command">
    <header className="ew-topbar"><div className="ew-brand"><span className="ew-brand-mark"><Orbit size={17} /></span><div><small>AEROMIND / ENGINEERING SYSTEMS</small><h1>Centre intégré d’ingénierie & d’industrialisation</h1></div></div><div className="ew-top-context"><span><small>PROJET</small><strong>{projectName || "Aucun projet actif"}</strong></span><span><small>DRONE / DESSIN</small><strong>{activeDesign?.label ?? (drawingDesign ? drawingDesign.label : cellLabel || "Aucun drone sélectionné")}</strong></span><span className={`ew-sync ${saveState}`}><i />{syncStatus}</span><button className="ew-icon-button" title="Exporter la structure et le plan de travail JSON" onClick={exportWorkspace}><ArrowDownToLine size={15} /></button></div></header>
    {!activeDesign && <div className="ew-selection-banner"><div><strong>Aucun drone chargé — la zone CAO reste vide</strong><span>Sélectionnez explicitement un profil puis chargez-le, ou dessinez une cellule. Aucun profil n’est présélectionné.</span></div><label className="ew-profile-select"><span>Profil de drone</span><select aria-label="Profil drone à charger" value={draftDroneId} onChange={event => setDraftDroneId(event.target.value)}><option value="">Sélectionner un profil…</option>{droneCatalog.map(item => <option key={item.id} value={item.id}>{item.label} · {item.family}</option>)}</select></label><button className="ew-button primary" disabled={!catalogPreview} onClick={() => catalogPreview && onLoadDrone(catalogPreview)}><Check size={14} /> Charger</button><button className="ew-button" onClick={() => onOpen("design-studio")}><Wrench size={14} /> Dessiner</button></div>}
    <nav className="ew-main-tabs" aria-label="Espaces du centre d’ingénierie">{([ ["assembly", "Atelier CAO"], ["parts", "Pièces & matières"], ["factory", "Usine numérique"], ["documents", "Dossier technique"], ["modules", "Modules AeroMind"] ] as [WorkbenchTab, string][]).map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}<div className="ew-layout-controls"><button aria-pressed={showProjectRail} onClick={() => setShowProjectRail(value => !value)}>{showProjectRail ? <ChevronDown size={13} /> : <FolderOpen size={13} />} {showProjectRail ? "Masquer dossiers" : "Afficher dossiers"}</button><button aria-pressed={showInspector} onClick={() => setShowInspector(value => !value)}>{showInspector ? <ChevronDown size={13} /> : <Layers3 size={13} />} {showInspector ? "Masquer inspecteur" : "Afficher inspecteur"}</button></div></nav>
    <div className={`ew-workbench-layout ${showProjectRail ? "" : "ew-rail-hidden"} ${showInspector ? "" : "ew-inspector-hidden"}`}>
      {showProjectRail && <aside className="ew-project-rail"><div className="ew-rail-heading"><div><small>ESPACE PROJET</small><strong>{projectName}</strong></div><span>{projectId ? "PROJET" : "LOCAL"}</span></div><div className="ew-tree-toolbar"><strong>Dossiers & sous-dossiers</strong><button aria-label="Créer un sous-dossier" title="Créer un dossier dans le dossier sélectionné" onClick={() => setAddingFolder(value => !value)}><FolderPlus size={15} /></button></div>{addingFolder && <div className="ew-folder-create"><input autoFocus value={newFolderName} onChange={event => setNewFolderName(event.target.value)} onKeyDown={event => event.key === "Enter" && createFolder()} placeholder={`Sous-dossier de ${selectedFolder?.name ?? "la racine"}`} aria-label="Nom du nouveau dossier" /><button onClick={createFolder} aria-label="Valider la création du dossier"><Check size={14} /></button><button onClick={() => { setAddingFolder(false); setNewFolderName(""); }} aria-label="Annuler"><X size={14} /></button></div>}<div className="ew-tree-scroll">{folderTree(tree)}{!tree.length && <span className="ew-muted">Aucun dossier. Créez un dossier à la racine.</span>}</div><div className="ew-file-actions"><button onClick={() => createDocument("note")}><FilePlus2 size={14} /> Nouvelle note</button><button onClick={() => createDocument("work-instruction")}><ClipboardCheck size={14} /> Instruction de travail</button><button onClick={() => createDocument("inspection")}><FileText size={14} /> Fiche d’inspection</button></div><div className="ew-folder-tools"><button disabled={!selectedFolder} onClick={renameFolder}><Pencil size={13} /> Renommer</button><button disabled={!selectedFolder} onClick={deleteFolder}><Trash2 size={13} /> Supprimer</button></div><div className="ew-rail-footer">{workspace.folders.length} dossiers · {workspace.documents.length} documents<br />Modifié {new Date(workspace.updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div></aside>}
      <main className="ew-workbench-main">{message && <div className="ew-message" role="status"><span>{message}</span><button onClick={() => setMessage("")} aria-label="Fermer le message"><X size={13} /></button></div>}{renderView()}</main>
      {showInspector && <aside className="ew-inspector"><div className="ew-inspector-header"><span>INSPECTEUR DE PROJET</span><Layers3 size={15} /></div>
        {tab === "factory" ? selectedStation ? <div className="ew-inspector-content"><small>POSTE VIRTUEL / {kindLabels[selectedStation.kind]}</small><input className="ew-inspector-name" aria-label="Nom du poste virtuel" value={selectedStation.name} onChange={event => updateStation(selectedStation.id, { name: event.target.value })} /><label>Type<select value={selectedStation.kind} onChange={event => updateStation(selectedStation.id, { kind: event.target.value as FactoryStation["kind"] })}>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Position X · plan relatif<input type="range" min="4" max="96" value={selectedStation.x} onChange={event => updateStation(selectedStation.id, { x: Number(event.target.value) })} /><small>{selectedStation.x}%</small></label><label>Position Y · plan relatif<input type="range" min="8" max="92" value={selectedStation.y} onChange={event => updateStation(selectedStation.id, { y: Number(event.target.value) })} /><small>{selectedStation.y}%</small></label><div className="ew-inspector-stat"><span>Pièces affectées</span><strong>{Object.values(workspace.partStations).filter(value => value === selectedStation.id).length}</strong></div><button className="ew-button danger" onClick={removeStation}><Trash2 size={14} /> Retirer le poste</button><small className="ew-inspector-note">Le déplacement modifie le plan conceptuel, pas une implantation mesurée sur site.</small></div> : <p className="ew-muted">Ajoutez un poste virtuel pour modifier sa position et son type.</p>
        : tab === "documents" ? selectedDocument ? <div className="ew-inspector-content"><small>DOCUMENT TECHNIQUE</small><strong>{selectedDocument.kind === "note" ? "Note d’ingénierie" : selectedDocument.kind === "work-instruction" ? "Instruction de travail" : "Fiche d’inspection"}</strong><div className="ew-inspector-stat"><span>Dossier parent</span><strong>{workspace.folders.find(folder => folder.id === selectedDocument.folderId)?.name ?? "—"}</strong></div><div className="ew-inspector-stat"><span>Taille du contenu</span><strong>{selectedDocument.body.length} caractères</strong></div><small className="ew-inspector-note">Document versionné dans la configuration du projet; le statut sauvegardé est affiché en en-tête.</small></div> : <p className="ew-muted">Sélectionnez ou créez un document dans l’arborescence.</p>
        : selectedPart && model ? <div className="ew-inspector-content"><small>{activeCell ? "COMPOSANT DU MODÈLE ACTIF" : "COMPOSANT DU PROFIL D’APERÇU"}</small><strong className="ew-part-name">{selectedPart.name}</strong><span className="ew-part-id">{selectedPart.id} · {selectedPart.category}</span><div className="ew-inspector-stat"><span>Sommets / triangles</span><strong>{Math.floor(selectedPart.vertices.length / 3)} / {Math.floor(selectedPart.indices.length / 3)}</strong></div><div className="ew-inspector-stat"><span>Encombrement déclaré</span><strong>{selectedPart.size.map(value => `${value.toFixed(3)} m`).join(" × ")}</strong></div><label>Référence matériau<select value={workspace.partMaterials[selectedPart.id] ?? ""} onChange={event => chooseMaterial(selectedPart.id, event.target.value)}><option value="">Aucune affectation</option>{materialCatalog.map(material => <option key={material.id} value={material.id}>{material.label}{material.manufacturer ? ` · ${material.manufacturer}` : ""}</option>)}</select></label>{workspace.partMaterials[selectedPart.id] && <div className="ew-material-source">{materialCatalog.find(item => item.id === workspace.partMaterials[selectedPart.id])?.catalogSource === "manufacturer" ? "Référence fabricant au catalogue" : "Référence conceptuelle / projet"}<br />Disponibilité physique non confirmée</div>}<div className="ew-inspector-stat"><span>Géométrie source</span><strong>{sceneDesign?.origin === "prototype-reference" ? "Référence paramétrique" : activeDesign ? "Profil ou dessin sélectionné" : "Aperçu non appliqué"}</strong></div><small className="ew-inspector-note">Les dimensions viennent du mesh conceptuel; elles ne remplacent pas un plan coté ou une pièce mesurée.</small></div>
        : <div className="ew-inspector-empty"><Boxes size={24} /><strong>{activeDesign ? "Inspecteur prêt" : "Aucune cellule sélectionnée"}</strong><span>{activeDesign ? "Sélectionnez une pièce du viewport ou une ligne de la nomenclature pour afficher ses données." : "L’inspecteur de pièce s’activera après sélection ou dessin d’un drone."}</span></div>}
      </aside>}
    </div>
    <footer className="ew-bottom-status"><span><i className={saveState} />{syncStatus}</span><span><Building2 size={13} /> Usine virtuelle / aucune machine physique connectée</span><span>Dernier run : {runId || "Aucun"}</span><button onClick={exportWorkspace}><Save size={13} /> Exporter workspace JSON</button></footer>
  </div>;
}
