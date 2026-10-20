import { useMemo, useState } from "react";
import { Box, CheckCircle2, ExternalLink, Factory, Layers3, Ruler, ShieldCheck, Wrench } from "lucide-react";
import {
  formatAvailabilityLabels,
  industrialDroneRegistry,
  industrialFormats,
  realizationLevels,
  type FormatAvailability,
  type IndustrialDroneReference,
  type IndustrialFormat,
  type RealizationLevel,
} from "../lib/industrialDroneRegistry";

const architectureLabel = { multirotor: "Multirotor", vtol: "VTOL", "fixed-wing": "Voilure fixe" } as const;
const toneFor = (status: FormatAvailability) => `industrial-format-${status}`;

export function IndustrialModelRegistry({ onApply }: { onApply: (reference: IndustrialDroneReference) => void }) {
  const [selectedId, setSelectedId] = useState(industrialDroneRegistry[0].id);
  const [level, setLevel] = useState<RealizationLevel | "all">("all");
  const [format, setFormat] = useState<IndustrialFormat | "all">("all");
  const selected = industrialDroneRegistry.find(item => item.id === selectedId) ?? industrialDroneRegistry[0];
  const filtered = useMemo(() => industrialDroneRegistry.filter(item => {
    const levelMatch = level === "all" || item.readiness === level;
    const formatMatch = format === "all" || item.formats[format] !== "unverified";
    return levelMatch && formatMatch;
  }), [format, level]);

  return <section className="panel industrial-registry" aria-labelledby="industrial-registry-title">
    <div className="panel-header industrial-registry-header">
      <div><p className="eyebrow">04 / REGISTRE INDUSTRIEL & MAQUETTES</p><h3 id="industrial-registry-title">Vrais modèles industriels, traçabilité d’abord</h3><p className="section-description">Références constructeur séparées des concepts AeroMind. Les formats CAO/maillage sont affichés selon leur statut réel : aucun fichier propriétaire n’est inventé ou marqué certifié sans source.</p></div>
      <div className="industrial-registry-kpi"><Factory size={17}/><strong>{industrialDroneRegistry.length}</strong><span>plateformes référencées</span></div>
    </div>
    <div className="industrial-filters">
      <label>Niveau de réalisation<select value={level} onChange={event => setLevel(event.target.value as RealizationLevel | "all")}><option value="all">Tous les niveaux</option>{realizationLevels.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Format recherché<select value={format} onChange={event => setFormat(event.target.value as IndustrialFormat | "all")}><option value="all">Tous les formats</option>{industrialFormats.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <span className="calculated-badge"><Layers3 size={13}/> {filtered.length} résultat(s)</span>
    </div>
    <div className="industrial-registry-layout">
      <div className="industrial-model-list">{filtered.map(item => <button key={item.id} type="button" className={`industrial-model-row ${selected.id === item.id ? "is-selected" : ""}`} onClick={() => setSelectedId(item.id)}><span className="industrial-model-mark">{item.architecture === "multirotor" ? "M" : "V"}</span><span><strong>{item.model}</strong><small>{item.manufacturer} · {architectureLabel[item.architecture]}</small></span><em className={`industrial-cert industrial-cert-${item.certificationTone}`}>{item.certificationTone === "verified" ? "CERTIF. DOC." : item.certificationTone === "limited" ? "PARTIEL" : "À VÉRIFIER"}</em></button>)}</div>
      <div className="industrial-detail">
        <div className="industrial-detail-title"><div><p className="eyebrow">RÉFÉRENCE SÉLECTIONNÉE</p><h4>{selected.manufacturer} · {selected.model}</h4><p>{selected.mission}</p></div><div className="industrial-detail-actions"><a className="icon-button" href={selected.sourceUrl} target="_blank" rel="noreferrer" title="Ouvrir la source officielle"><ExternalLink size={15}/></a><button className="primary-button" type="button" onClick={() => onApply(selected)}><CheckCircle2 size={14}/> Charger cette référence</button></div></div>
        <div className="industrial-spec-strip"><span><Ruler size={13}/><b>{selected.dimensions}</b><small>Géométrie publiée</small></span><span><ShieldCheck size={13}/><b>{selected.certification}</b><small>Statut documentaire</small></span><span><Box size={13}/><b>{selected.mtow} · {selected.payload}</b><small>Performances publiées</small></span></div>
        <div className="industrial-section-heading"><span>Formats d’intégration</span><small>Statut par plateforme</small></div>
        <div className="industrial-format-grid">{industrialFormats.map(item => <div className={`industrial-format ${toneFor(selected.formats[item])}`} key={item}><strong>{item}</strong><span>{formatAvailabilityLabels[selected.formats[item]]}</span></div>)}</div>
        <div className="industrial-section-heading"><span>Maquette physique</span><small>Préparation de réalisation</small></div>
        <div className="industrial-mockup-list">{selected.physicalMockups.map(mockup => <div key={mockup}><Wrench size={14}/><span>{mockup}</span><CheckCircle2 size={14}/></div>)}</div>
        <div className="industrial-data-note"><strong>{realizationLevels.find(item => item.id === selected.readiness)?.label} · {selected.sourceLabel}</strong><span>{selected.dataNote} {selected.sourceDate}.</span></div>
      </div>
    </div>
  </section>;
}
