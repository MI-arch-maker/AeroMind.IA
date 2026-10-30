import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { AlertTriangle, Box, CheckCircle2, ClipboardCheck, GitCompareArrows, Move3d, PackagePlus, Ruler, ShieldCheck, Trash2, Wrench } from "lucide-react";
import type { ConceptConfig, InstalledMaterial } from "../lib/aeroEngine";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import { PhysicalDroneModel } from "./PhysicalDroneModel";
import "./physical-design-workbench.css";

type PhysicalTab = "model" | "compare" | "validate";

type Props = {
  config: ConceptConfig;
  setConfig: Dispatch<SetStateAction<ConceptConfig>>;
  activeProfile?: DroneCatalogDesign;
};

const starterPhysicalParts: Array<Pick<InstalledMaterial, "label" | "use" | "massKg" | "geometry" | "category" | "dimensions" | "assemblyNotes">> = [
  { label: "Support caméra orientable", use: "Support mécanique de charge utile", massKg: 0.09, geometry: "mount", category: "payload", dimensions: "82 × 54 × 28 mm", assemblyNotes: "Vérifier le débattement et le couple de serrage." },
  { label: "Platine de renfort châssis", use: "Renforcement structurel", massKg: 0.14, geometry: "reinforcement", category: "airframe", dimensions: "120 × 80 × 3 mm", assemblyNotes: "Contrôler l’absence d’interférence avec la batterie." },
  { label: "Entretoises de fixation M3", use: "Jeu de fixation", massKg: 0.03, geometry: "mount", category: "hardware", dimensions: "M3 · 20 mm", assemblyNotes: "Couple et frein-filet à définir par revue mécanique." },
];

const checklistLabels = [
  "Dimensions et tolérances vérifiées",
  "Masse et équilibrage contrôlés",
  "Fixations et couples définis",
  "Interférences et débattements inspectés",
  "Alimentation, câblage et dissipation revus",
  "Essais statiques et électriques planifiés",
];

const physicalParts = (config: ConceptConfig) => (config.installedMaterials ?? []).filter(item => Boolean(item.physicalId));

export function PhysicalDesignWorkbench({ config, setConfig, activeProfile }: Props) {
  const [tab, setTab] = useState<PhysicalTab>("model");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const selected = (config.installedMaterials ?? []).find(item => item.id === selectedId);
  const modifications = useMemo(() => physicalParts(config), [config]);
  const deltaMass = useMemo(() => modifications.reduce((sum, item) => sum + item.massKg * (item.quantity ?? 1), 0), [modifications]);
  const baselineMass = Math.max(0, (config.constructionMassKg ?? 0) - deltaMass);
  const completedChecks = checklistLabels.filter(label => checks[label]).length;

  const addPart = (template: typeof starterPhysicalParts[number]) => {
    const id = `physical-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const part: InstalledMaterial = {
      ...template,
      id,
      physicalId: id,
      catalogSource: "user",
      physicalStatus: "not-verified",
      quantity: 1,
      manufacturerDataStatus: "estimate",
      connectedTo: "FRAME",
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    };
    setConfig(current => ({
      ...current,
      installedMaterials: [...(current.installedMaterials ?? []), part],
      constructionMassKg: (current.constructionMassKg ?? 0) + part.massKg,
    }));
    setSelectedId(id);
  };

  const updateSelected = (patch: Partial<InstalledMaterial>) => {
    if (!selectedId) return;
    setConfig(current => ({
      ...current,
      installedMaterials: (current.installedMaterials ?? []).map(item => item.id === selectedId ? { ...item, ...patch } : item),
    }));
  };

  const removeSelected = () => {
    if (!selectedId || !selected) return;
    setConfig(current => ({
      ...current,
      installedMaterials: (current.installedMaterials ?? []).filter(item => item.id !== selectedId),
      constructionMassKg: Math.max(0, (current.constructionMassKg ?? 0) - selected.massKg * (selected.quantity ?? 1)),
    }));
    setSelectedId(null);
  };

  return (
    <section id="studio-physical-design" className="physical-design-workbench" aria-label="Conception physique des drones">
      <header className="physical-design-header">
        <div className="physical-design-title">
          <span className="physical-design-mark"><Wrench size={19} /></span>
          <div>
            <p className="physical-design-eyebrow">STUDIO / MODIFICATION PHYSIQUE · POSTE DE PRÉPARATION</p>
            <h2>Conception physique des drones</h2>
            <p>Structure, supports, pièces, fixation et préparation documentaire — sans présenter la simulation comme une preuve de sécurité.</p>
          </div>
        </div>
        <div className="physical-design-status"><span /> PROPOSITION · {modifications.length} MODIFICATION(S)</div>
      </header>

      <div className="physical-design-tabs" role="tablist" aria-label="Modules de conception physique">
        <button className={tab === "model" ? "is-active" : ""} onClick={() => setTab("model")}><Move3d size={14} /> Modèle physique</button>
        <button className={tab === "compare" ? "is-active" : ""} onClick={() => setTab("compare")}><GitCompareArrows size={14} /> Comparer baseline</button>
        <button className={tab === "validate" ? "is-active" : ""} onClick={() => setTab("validate")}><ClipboardCheck size={14} /> Validation avant réalisation</button>
      </div>

      {tab === "model" && <div className="physical-design-grid">
        <section className="physical-design-panel physical-design-viewport">
          <div className="physical-design-panel-heading"><div><span>01 / JUMEAU NUMÉRIQUE</span><h3>{activeProfile?.label ?? config.designName ?? "Cellule active"}</h3></div><span className="physical-design-chip">NON CERTIFIÉ</span></div>
          <div className="physical-design-canvas"><PhysicalDroneModel design={activeProfile} parts={config.installedMaterials ?? []} interactive showGrid /><div className="physical-design-canvas-note"><Move3d size={13} /> Vue 3D conceptuelle · sélectionnez une pièce dans la liste</div></div>
          <div className="physical-design-metrics"><div><small>BASELINE</small><strong>{baselineMass.toFixed(2)} <em>kg</em></strong></div><div><small>DELTA MODIFICATION</small><strong>+{deltaMass.toFixed(2)} <em>kg</em></strong></div><div><small>PIÈCES PROPOSÉES</small><strong>{modifications.length}</strong></div><div><small>STATUT</small><strong>À vérifier</strong></div></div>
        </section>
        <aside className="physical-design-panel physical-design-inspector">
          <div className="physical-design-panel-heading"><div><span>02 / PIÈCES & SUPPORTS</span><h3>Catalogue de modification</h3></div><PackagePlus size={16} /></div>
          <div className="physical-design-add-list">{starterPhysicalParts.map(template => <button key={template.label} onClick={() => addPart(template)}><PackagePlus size={13} /><span><strong>{template.label}</strong><small>{template.massKg.toFixed(2)} kg · {template.dimensions}</small></span></button>)}</div>
          <div className="physical-design-component-list"><div className="physical-design-list-label">PROPOSITIONS ACTIVES</div>{modifications.length ? modifications.map(item => <button key={item.id} className={selectedId === item.id ? "is-selected" : ""} onClick={() => setSelectedId(item.id)}><Box size={14} /><span><strong>{item.label}</strong><small>{item.physicalStatus === "not-verified" ? "À vérifier" : item.physicalStatus} · {item.massKg.toFixed(2)} kg</small></span></button>) : <p className="physical-design-empty">Ajoutez une pièce pour commencer une modification documentée.</p>}</div>
          {selected && <div className="physical-design-selected"><div className="physical-design-list-label">INSPECTEUR · {selected.label}</div><label>Décalage X <input type="range" min={-40} max={40} value={selected.offsetX ?? 0} onChange={event => updateSelected({ offsetX: Number(event.target.value) })} /></label><label>Décalage Y <input type="range" min={-40} max={40} value={selected.offsetY ?? 0} onChange={event => updateSelected({ offsetY: Number(event.target.value) })} /></label><label>Statut<select value={selected.physicalStatus ?? "not-verified"} onChange={event => updateSelected({ physicalStatus: event.target.value as InstalledMaterial["physicalStatus"] })}><option value="not-verified">À vérifier</option><option value="received">Reçu</option><option value="inspected">Inspecté</option><option value="rejected">Refusé</option></select></label><button className="physical-design-remove" onClick={removeSelected}><Trash2 size={13} /> Retirer de la proposition</button></div>}
        </aside>
      </div>}

      {tab === "compare" && <div className="physical-design-compare-grid"><section className="physical-design-panel"><div className="physical-design-panel-heading"><div><span>BASELINE / CONFIGURATION D’ORIGINE</span><h3>Référence de départ</h3></div><ShieldCheck size={16} /></div><div className="physical-design-compare-card"><strong>{activeProfile?.label ?? config.designName ?? "Cellule active"}</strong><span>{config.motorCount ?? 0} moteurs · {baselineMass.toFixed(2)} kg de base</span><small>Snapshot de référence conservé localement avant modification.</small></div></section><section className="physical-design-panel"><div className="physical-design-panel-heading"><div><span>PROPOSITION / RÉVISION {modifications.length ? "01" : "—"}</span><h3>Éléments ajoutés ou déplacés</h3></div><GitCompareArrows size={16} /></div>{modifications.length ? <div className="physical-design-diff-list">{modifications.map(item => <div key={item.id}><span className="physical-design-diff-add">AJOUT</span><strong>{item.label}</strong><small>+{item.massKg.toFixed(2)} kg · {item.dimensions ?? "dimensions à confirmer"}</small></div>)}</div> : <div className="physical-design-empty"><GitCompareArrows size={18} /><span>Aucune modification documentée.</span></div>}<div className="physical-design-warning"><AlertTriangle size={15} /><span>Les interférences et le centre de gravité restent à vérifier mécaniquement.</span></div></section></div>}

      {tab === "validate" && <div className="physical-design-validation-grid"><section className="physical-design-panel"><div className="physical-design-panel-heading"><div><span>CONTRÔLES PRÉALABLES</span><h3>Checklist avant réalisation</h3></div><ClipboardCheck size={16} /></div><div className="physical-design-progress"><span><strong>{completedChecks}/{checklistLabels.length}</strong> contrôles documentés</span><div><i style={{ width: `${(completedChecks / checklistLabels.length) * 100}%` }} /></div></div><div className="physical-design-checklist">{checklistLabels.map(label => <label key={label} className={checks[label] ? "is-done" : ""}><input type="checkbox" checked={Boolean(checks[label])} onChange={() => setChecks(current => ({ ...current, [label]: !current[label] }))} /><span>{label}</span>{checks[label] ? <CheckCircle2 size={15} /> : <Ruler size={15} />}</label>)}</div></section><aside className="physical-design-panel physical-design-safety"><AlertTriangle size={22} /><h3>Validation humaine obligatoire</h3><p>Cette interface prépare une modification physique et sa documentation. Elle ne constitue ni une analyse FEA/CFD, ni une certification, ni une autorisation de vol ou de mise en service.</p><strong>Avant toute réalisation : revue mécanique, électrique et réglementaire indépendante.</strong></aside></div>}
    </section>
  );
}
