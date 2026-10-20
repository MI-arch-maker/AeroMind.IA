import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowDown, ArrowUp, Check, ClipboardList, Eye, EyeOff, Layers3, Lock, MessageSquarePlus, Palette, Ruler, Scissors, Unlock, Wrench } from "lucide-react";
import type { ConceptConfig } from "../lib/aeroEngine";
import type { MechanicalModel, MechanicalPart } from "../lib/mechanicalTwinGeometry";

type Props = { designId: string; model: MechanicalModel; selectedPart?: MechanicalPart; config: ConceptConfig; setConfig: Dispatch<SetStateAction<ConceptConfig>> };
type DockTab = "assembly" | "cad" | "layers";
type AssemblyState = Record<string, "todo" | "ordered" | "mounted" | "inspected">;
type ReviewVariant = { id: string; label: string; createdAt: string; span: number; length: number; motorCount: number };
type LayerMeta = { color: string; opacity: number; note: string };
const assemblyKey = (id: string) => `aeromind-twin-assembly-v1:${id}`;
const variantKey = (id: string) => `aeromind-twin-variants-v1:${id}`;
const layerMetaKey = (id: string) => `aeromind-twin-layer-meta-v1:${id}`;
const statuses: Array<{ id: AssemblyState[string]; label: string }> = [
  { id: "todo", label: "À définir" }, { id: "ordered", label: "À commander" }, { id: "mounted", label: "Monté" }, { id: "inspected", label: "Inspecté" },
];
const safeLayers = (config: ConceptConfig) => config.studioLayers?.filter(Boolean) ?? [];

export function MechanicalTwinIntegrationDock({ designId, model, selectedPart, config, setConfig }: Props) {
  const [tab, setTab] = useState<DockTab>("assembly");
  const [assembly, setAssembly] = useState<AssemblyState>({});
  const [materialByPart, setMaterialByPart] = useState<Record<string, string>>({});
  const [variants, setVariants] = useState<ReviewVariant[]>([]);
  const [variantName, setVariantName] = useState("");
  const [tolerance, setTolerance] = useState(0.5);
  const [section, setSection] = useState(false);
  const [newLayer, setNewLayer] = useState("");
  const [layerMeta, setLayerMeta] = useState<Record<string, LayerMeta>>({});
  const [annotation, setAnnotation] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(assemblyKey(designId)) ?? "null");
      if (saved?.assembly) setAssembly(saved.assembly);
      if (saved?.materialByPart) setMaterialByPart(saved.materialByPart);
      const storedVariants = JSON.parse(localStorage.getItem(variantKey(designId)) ?? "[]");
      if (Array.isArray(storedVariants)) setVariants(storedVariants);
      const storedLayerMeta = JSON.parse(localStorage.getItem(layerMetaKey(designId)) ?? "{}");
      const sharedLayerMeta = config.studioLayerMeta ?? storedLayerMeta;
      if (sharedLayerMeta && typeof sharedLayerMeta === "object") setLayerMeta(sharedLayerMeta);
      if (!config.studioLayerMeta && storedLayerMeta && typeof storedLayerMeta === "object" && Object.keys(storedLayerMeta).length) {
        setConfig((current) => ({ ...current, studioLayerMeta: storedLayerMeta }));
      }
    } catch { /* stockage local optionnel */ }
  }, [designId]);
  useEffect(() => { try { localStorage.setItem(assemblyKey(designId), JSON.stringify({ assembly, materialByPart })); } catch { /* stockage local optionnel */ } }, [designId, assembly, materialByPart]);
  useEffect(() => { try { localStorage.setItem(variantKey(designId), JSON.stringify(variants)); } catch { /* stockage local optionnel */ } }, [designId, variants]);
  useEffect(() => { try { localStorage.setItem(layerMetaKey(designId), JSON.stringify(layerMeta)); } catch { /* stockage local optionnel */ } }, [designId, layerMeta]);
  useEffect(() => {
    const onDockRequest = (event: Event) => {
      const tab = (event as CustomEvent<DockTab>).detail;
      if (tab === "assembly" || tab === "cad" || tab === "layers") setTab(tab);
    };
    window.addEventListener("aeromind-twin-dock", onDockRequest);
    return () => window.removeEventListener("aeromind-twin-dock", onDockRequest);
  }, []);

  const visibleParts = model.parts.filter((part) => {
    const layer = config.studioLayerAssignments?.[part.id];
    return !part.hidden && (layer ? config.studioLayerSettings?.[layer]?.visible !== false : true);
  });
  const completed = visibleParts.filter((part) => assembly[part.id] === "inspected").length;
  const completion = visibleParts.length ? Math.round((completed / visibleParts.length) * 100) : 0;
  const materials = config.installedMaterials ?? [];
  const layers = safeLayers(config);
  const activeLayer = config.activeStudioLayer ?? layers[0] ?? "";
  const selectedLayer = selectedPart ? (config.studioLayerSettings?.[activeLayer] ?? { visible: true, locked: false }) : undefined;
  const nominalMeasure = selectedPart?.size?.[0] ?? model.span;
  const projectedMeasure = Math.max(0.001, nominalMeasure * (selectedPart ? (config.mechanicalTwin?.edits?.[selectedPart.id]?.scale?.[0] ?? 1) : 1));
  const groupSummary = useMemo(() => Object.entries(assembly).filter(([, value]) => value === "mounted" || value === "inspected").length, [assembly]);
  const metaFor = (layer: string): LayerMeta => layerMeta[layer] ?? { color: "#b9a6ff", opacity: 100, note: "" };

  const updateLayerSettings = (layer: string, patch: Partial<{ visible: boolean; locked: boolean }>) => setConfig((current) => ({ ...current, studioLayerSettings: { ...current.studioLayerSettings, [layer]: { visible: true, locked: false, ...current.studioLayerSettings?.[layer], ...patch } } }));
  const updateLayerMeta = (layer: string, patch: Partial<LayerMeta>) => setLayerMeta((current) => {
    const next = { ...current, [layer]: { ...metaFor(layer), ...patch } };
    setConfig((configCurrent) => ({ ...configCurrent, studioLayerMeta: next }));
    return next;
  });
  const addLayer = () => { const name = newLayer.trim(); if (!name || layers.includes(name)) return; setConfig((current) => ({ ...current, studioLayers: [...(current.studioLayers ?? []), name], activeStudioLayer: name, studioLayerSettings: { ...current.studioLayerSettings, [name]: { visible: true, locked: false } } })); setNewLayer(""); };
  const removeLayer = (layer: string) => setConfig((current) => { const next = (current.studioLayers ?? []).filter((item) => item !== layer); const settings = { ...current.studioLayerSettings }; delete settings[layer]; return { ...current, studioLayers: next, studioLayerSettings: settings, activeStudioLayer: current.activeStudioLayer === layer ? next[0] : current.activeStudioLayer }; });
  const moveLayer = (layer: string, direction: -1 | 1) => setConfig((current) => { const ordered = [...(current.studioLayers ?? [])]; const from = ordered.indexOf(layer); const to = from + direction; if (from < 0 || to < 0 || to >= ordered.length) return current; [ordered[from], ordered[to]] = [ordered[to], ordered[from]]; return { ...current, studioLayers: ordered }; });
  const attachSelected = () => { if (!selectedPart || !activeLayer) return; setConfig((current) => ({ ...current, studioLayers: current.studioLayers?.length ? current.studioLayers : [activeLayer], activeStudioLayer: activeLayer, studioLayerAssignments: { ...current.studioLayerAssignments, [selectedPart.id]: activeLayer } })); };
  const saveVariant = () => { const label = variantName.trim() || `Variante ${variants.length + 1}`; setVariants((current) => [...current, { id: `${Date.now()}`, label, createdAt: new Date().toISOString(), span: config.wingspan, length: config.fuselageLength, motorCount: config.motorCount ?? 0 }]); setVariantName(""); };
  const cycleStatus = (partId: string) => { const current = assembly[partId] ?? "todo"; const next = statuses[(statuses.findIndex((item) => item.id === current) + 1) % statuses.length].id; setAssembly((value) => ({ ...value, [partId]: next })); };

  return <section className="mt-integration-dock" aria-label="Outils intégrés de construction, CAO et compositing">
    <header className="mt-dock-header"><div><span className="mt-dock-kicker">INTEGRATED BUILD WORKSPACE · C + A + B</span><strong>CONCEVOIR → COMPOSER → ASSEMBLER</strong><small className="mt-dock-subtitle">Un modèle paramétrique · une nomenclature · une revue traçable</small></div><div className="mt-dock-status"><i /> {completion}% inspecté · {groupSummary}/{visibleParts.length} monté(s)</div></header>
    <div className="mt-cab-journey" aria-label="Parcours de construction"><span className="done">01 CONCEVOIR</span><b>→</b><span className={tab === "layers" ? "active" : ""}>02 COMPOSER</span><b>→</b><span className={tab === "assembly" ? "active" : ""}>03 ASSEMBLER</span><b>→</b><span className={tab === "cad" ? "active" : ""}>04 INSPECTER</span><b>→</b><span>05 SIMULER</span></div>
    <nav className="mt-dock-tabs" aria-label="Espaces intégrés"><button className={tab === "assembly" ? "active" : ""} onClick={() => setTab("assembly")}><ClipboardList size={14} /> ASSEMBLER <small>{visibleParts.length}</small></button><button className={tab === "cad" ? "active" : ""} onClick={() => setTab("cad")}><Ruler size={14} /> CAO / REVUE <small>{variants.length}</small></button><button className={tab === "layers" ? "active" : ""} onClick={() => setTab("layers")}><Layers3 size={14} /> CALQUES <small>{layers.length}</small></button></nav>
    {tab === "assembly" && <div className="mt-dock-panel mt-assembly-panel"><div className="mt-dock-summary"><div><span>PIÈCES VUES</span><strong>{visibleParts.length}</strong></div><div><span>INSPECTÉES</span><strong>{completed}</strong></div><div><span>MATÉRIAUX INSTALLÉS</span><strong>{materials.length}</strong></div><div><span>STATUT</span><strong>CONCEPTUEL</strong></div></div><div className="mt-bom-list">{visibleParts.map((part) => <div className={`mt-bom-row ${selectedPart?.id === part.id ? "active" : ""}`} key={part.id}><button className="mt-bom-name" onClick={() => cycleStatus(part.id)} title="Avancer le statut d’assemblage"><span className="mt-status-dot" data-status={assembly[part.id] ?? "todo"} /><strong>{part.name}</strong><small>{part.category} · {part.size.map((value) => value.toFixed(2)).join(" × ")} m</small></button><select aria-label={`Matériau pour ${part.name}`} value={materialByPart[part.id] ?? ""} onChange={(event) => setMaterialByPart((current) => ({ ...current, [part.id]: event.target.value }))}><option value="">Matériau à préciser</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.label}</option>)}</select><button className="mt-status-button" onClick={() => cycleStatus(part.id)}>{statuses.find((status) => status.id === (assembly[part.id] ?? "todo"))?.label}</button></div>)}</div><p className="mt-dock-note"><Wrench size={13} /> Les statuts et matériaux sont des données de préparation locales; ils ne commandent aucun équipement et ne valident pas la fabrication.</p></div>}
    {tab === "cad" && <div className="mt-dock-panel mt-cad-panel"><div className="mt-cad-grid"><div className="mt-cad-card"><span>MESURE ACTIVE</span><strong>{projectedMeasure.toFixed(3)} m</strong><small>{selectedPart ? selectedPart.name : "Envergure de la cellule"}</small></div><div className="mt-cad-card"><span>TOLÉRANCE INDICATIVE</span><label><input type="number" min="0" step="0.1" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} /> mm</label><small>Hypothèse de revue uniquement</small></div><div className="mt-cad-card"><span>RÉFÉRENCE</span><strong>{model.span.toFixed(2)} m</strong><small>{model.length.toFixed(2)} m de longueur</small></div></div><div className="mt-cad-tools"><button className={section ? "active" : ""} onClick={() => setSection((value) => !value)}><Scissors size={14} /> {section ? "Coupe activée" : "Activer la coupe"}</button><span className="mt-cad-chip">UNITÉS · MÈTRES</span><span className="mt-cad-chip">SOURCE · {model.name}</span></div><div className="mt-variant-bar"><div><span className="mt-dock-kicker">VARIANTES DE REVUE</span><strong>Comparer des configurations locales</strong></div><input aria-label="Nom de variante" placeholder="Nom de variante" value={variantName} onChange={(event) => setVariantName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveVariant(); }} /><button className="mt-tool" onClick={saveVariant}>Enregistrer</button></div><div className="mt-variant-list">{variants.length ? variants.map((variant) => <div key={variant.id}><strong>{variant.label}</strong><span>{variant.span.toFixed(2)} m · {variant.length.toFixed(2)} m · {variant.motorCount} motorisation(s)</span><small>{new Date(variant.createdAt).toLocaleDateString("fr-FR")}</small></div>) : <span className="mt-empty-line">Aucune variante enregistrée pour cette cellule.</span>}</div><p className="mt-dock-note"><Ruler size={13} /> Mesures, coupes et tolérances servent à la revue du modèle procédural; elles ne constituent pas un tolérancement industriel certifié.</p></div>}
    {tab === "layers" && <div className="mt-dock-panel mt-layers-panel"><div className="mt-layer-toolbar"><input aria-label="Nouveau calque" placeholder="Nom du nouveau calque" value={newLayer} onChange={(event) => setNewLayer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addLayer(); }} /><button className="mt-tool" onClick={addLayer}>Créer le calque</button><span className="mt-cad-chip">{selectedPart ? `PIÈCE · ${selectedPart.name}` : "AUCUNE PIÈCE SÉLECTIONNÉE"}</span></div><div className="mt-layer-annotation"><MessageSquarePlus size={14} /><input aria-label="Annotation de revue" placeholder="Annotation attachée à la composition active" value={annotation} onChange={(event) => setAnnotation(event.target.value)} /><button className="mt-tool" onClick={() => { if (annotation.trim() && activeLayer) { updateLayerMeta(activeLayer, { note: annotation.trim() }); setAnnotation(""); } }}>Attacher</button></div><div className="mt-layer-list">{layers.length ? layers.map((layer, index) => { const settings = config.studioLayerSettings?.[layer] ?? { visible: true, locked: false }; const assigned = Object.values(config.studioLayerAssignments ?? {}).filter((value) => value === layer).length; const meta = metaFor(layer); return <div className={`mt-layer-row ${activeLayer === layer ? "active" : ""}`} key={layer}><button className="mt-layer-select" onClick={() => setConfig((current) => ({ ...current, activeStudioLayer: layer }))}><Layers3 size={14} style={{ color: meta.color }} /><strong>{layer}</strong><small>{assigned} pièce(s) · {meta.opacity}%</small></button><div className="mt-layer-controls"><label title="Couleur du calque"><Palette size={12} /><input aria-label={`Couleur ${layer}`} type="color" value={meta.color} onChange={(event) => updateLayerMeta(layer, { color: event.target.value })} /></label><label title="Opacité"><input aria-label={`Opacité ${layer}`} type="range" min="10" max="100" value={meta.opacity} onChange={(event) => updateLayerMeta(layer, { opacity: Number(event.target.value) })} /></label></div><button className="mt-layer-icon" aria-label={`Monter ${layer}`} disabled={index === 0} onClick={() => moveLayer(layer, -1)}><ArrowUp size={14} /></button><button className="mt-layer-icon" aria-label={`Descendre ${layer}`} disabled={index === layers.length - 1} onClick={() => moveLayer(layer, 1)}><ArrowDown size={14} /></button><button className="mt-layer-icon" aria-label={`Visibilité ${layer}`} onClick={() => updateLayerSettings(layer, { visible: !settings.visible })}>{settings.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button><button className="mt-layer-icon" aria-label={`Verrouillage ${layer}`} onClick={() => updateLayerSettings(layer, { locked: !settings.locked })}>{settings.locked ? <Lock size={14} /> : <Unlock size={14} />}</button><button className="mt-layer-delete" onClick={() => removeLayer(layer)}>Supprimer</button>{meta.note && <small className="mt-layer-note">{meta.note}</small>}</div>; }) : <span className="mt-empty-line">Créez un calque manuellement pour commencer.</span>}</div><div className="mt-layer-attach"><strong>Calque actif : {activeLayer || "non défini"}</strong><button className="mt-tool" disabled={!selectedPart || !activeLayer || Boolean(selectedLayer?.locked)} onClick={attachSelected}><Check size={13} /> Affecter la pièce sélectionnée</button></div><p className="mt-dock-note"><Layers3 size={13} /> Les calques restent manuels et documentaires. Chaque couleur, opacité et annotation est conservée localement par cellule.</p></div>}
  </section>;
}
