import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  Activity,
  ArrowRight,
  Boxes,
  Cpu,
  Download,
  FileCode2,
  FileJson2,
  FileSpreadsheet,
  Gauge,
  Layers3,
  Move3d,
  Settings2,
} from "lucide-react";
import {
  defaultRequirements,
  runSimulation,
  type ConceptConfig,
  type SimulationResult,
} from "../lib/aeroEngine";
import type { DroneCatalogDesign } from "../lib/droneCatalog";
import { EngineeringDronePlate } from "./EngineeringDronePlate";
import { ParametricDronePreview } from "./ParametricDronePreview";
import { useLanguage } from "../contexts/LanguageContext";
import "./studio-command-deck.css";

export type StudioSection =
  | "concept"
  | "physical"
  | "cad"
  | "simulation"
  | "materials"
  | "electronics"
  | "assembly"
  | "tests"
  | "reports";

type Props = {
  config: ConceptConfig;
  setConfig: Dispatch<SetStateAction<ConceptConfig>>;
  activeProfile?: DroneCatalogDesign;
  onSelectProfile: (profile: DroneCatalogDesign) => void;
  partsCount: number;
  totalMassKg: number;
  activeSection: StudioSection;
  onNavigate: (section: StudioSection) => void;
  onExportStudio: () => void;
  onExportBom: () => void;
  onExportOpenScad: () => void;
  onExportEngineeringJson: () => void;
};

const formatMetric = (value: number, digits = 1) =>
  Number.isFinite(value)
    ? value.toLocaleString("fr-FR", { maximumFractionDigits: digits })
    : "—";

const sectionItems: Array<{ id: StudioSection; label: string }> = [
  { id: "concept", label: "CONCEPTION" },
  { id: "physical", label: "CONCEPTION PHYSIQUE" },
  { id: "cad", label: "CAO 3D / 2D" },
  { id: "simulation", label: "SIMULATION" },
  { id: "materials", label: "MATÉRIAUX" },
  { id: "electronics", label: "ÉLECTRONIQUE" },
  { id: "assembly", label: "ASSEMBLAGE" },
  { id: "tests", label: "CONTRÔLES" },
  { id: "reports", label: "RAPPORTS" },
];

export function StudioCommandDeck({
  config,
  setConfig,
  activeProfile,
  onSelectProfile,
  partsCount,
  totalMassKg,
  activeSection,
  onNavigate,
  onExportStudio,
  onExportBom,
  onExportOpenScad,
  onExportEngineeringJson,
}: Props) {
  const { t } = useLanguage();
  const [analysis, setAnalysis] = useState<{
    result: SimulationResult;
    configSignature: string;
  } | null>(null);
  const configSignature = useMemo(() => JSON.stringify(config), [config]);
  const displayProfile = useMemo(
    () => activeProfile
      ? {
          ...activeProfile,
          configuration: {
            ...activeProfile.configuration,
            ...config,
            airframe: activeProfile.key,
          },
        }
      : undefined,
    [activeProfile, config]
  );
  const analysisIsStale = Boolean(
    analysis && analysis.configSignature !== configSignature
  );
  const runLocalAnalysis = (section: StudioSection = "simulation") => {
    const runId = `STUDIO-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
    const result = runSimulation(config, defaultRequirements, runId);
    setAnalysis({ result, configSignature });
    onNavigate(section);
  };

  const metricRows = analysis?.result.metrics.slice(0, 4) ?? [];

  return (
    <section className="studio-command-deck" id="studio-concept-overview" aria-label="Studio virtuel de conception et de construction">
      <header className="studio-deck-header">
        <div className="studio-deck-heading">
          <span className="studio-deck-mark" aria-hidden="true"><Settings2 size={19} /></span>
          <div>
            <p className="studio-deck-eyebrow">AEROMIND / STUDIO D’INGÉNIERIE · ESPACE DE TRAVAIL LOCAL</p>
            <h1>Studio virtuel de conception et de construction de drones</h1>
            <p>Integrated Drone Design Studio — un espace synchronisé avec le drone sélectionné dans la bibliothèque ou le dessin créé par l’utilisateur.</p>
          </div>
        </div>
        <div className="studio-deck-truth-badge"><span /> PRÉLIMINAIRE · SIMULATION UNIQUEMENT</div>
      </header>

      <nav className="studio-deck-navigation" role="tablist" aria-label="Modules du Studio">
        {sectionItems.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={activeSection === item.id}
            className={activeSection === item.id ? "is-active" : ""}
            onClick={() => {
              if (item.id === "simulation" || item.id === "tests") runLocalAnalysis(item.id);
              else onNavigate(item.id);
            }}
          >
            {t(item.label)}
          </button>
        ))}
      </nav>

      <div className="studio-deck-main-grid">
        <section className="studio-deck-panel studio-deck-model-panel" aria-label="Aperçu du modèle">
          <div className="studio-deck-panel-heading">
            <div><span>02 / CONCEPTION PARAMÉTRIQUE</span><h2>{activeProfile?.label ?? "Aperçu du modèle"}</h2></div>
            <span className="studio-deck-model-tag">{activeProfile?.key?.toUpperCase() ?? "AUCUNE CELLULE"}</span>
          </div>
          <div className="studio-deck-model-frame">
            {activeProfile ? (
              <ParametricDronePreview
                design={displayProfile ?? activeProfile}
                construction={{ parts: partsCount, massKg: totalMassKg }}
                zoom={1.12}
              />
            ) : config.customSketch?.strokes.length ? (
              <div className="studio-deck-custom-sketch" role="status">
                <Layers3 size={24} />
                <strong>CROQUIS PERSONNALISÉ ACTIF</strong>
                <span>{config.customSketch.strokes.length} trait(s) synchronisé(s)</span>
                <small>Ouvrez l’atelier de dessin ci-dessous pour continuer à éditer cette géométrie.</small>
              </div>
            ) : (
              <EngineeringDronePlate
                status="idle"
                projection="iso"
                construction={{ parts: partsCount, massKg: totalMassKg }}
                emptyWhenUnselected
              />
            )}
            <div className="studio-deck-model-caption">
              <span><Move3d size={13} /> Vue source · cadrage de référence</span>
              <span>Illustration de profil · pas un modèle de fabrication qualifié</span>
            </div>
          </div>
          <div className="studio-deck-model-stats">
            <div><small>ENVERGURE</small><strong>{formatMetric(config.wingspan, 2)} <em>m</em></strong></div>
            <div><small>PROPULSION</small><strong>{config.motorCount ?? 0} <em>moteur(s)</em></strong></div>
            <div><small>ÉLÉMENTS</small><strong>{partsCount} <em>pièces</em></strong></div>
            <div><small>MASSE DÉCLARÉE</small><strong>{formatMetric(totalMassKg, 2)} <em>kg</em></strong></div>
          </div>
          <button type="button" className="studio-deck-open-editor" onClick={() => onNavigate("cad")}>
            Ouvrir l’éditeur géométrique <ArrowRight size={15} />
          </button>
        </section>

        <aside className="studio-deck-side-stack">
          <section className="studio-deck-panel studio-deck-analysis-panel" id="studio-analysis-results">
            <div className="studio-deck-panel-heading">
              <div><span>03 / ANALYSE LOCALE</span><h2>Simulation et estimation</h2></div>
              <Activity size={17} />
            </div>
            <p className="studio-deck-small-copy">Modèle simplifié préliminaire. Ce n’est ni CFD, ni FEA, ni une qualification en vol.</p>
            <button type="button" className="studio-deck-run-button" onClick={() => runLocalAnalysis()} disabled={!activeProfile}>
              <Gauge size={15} /> {analysis ? "Relancer l’analyse" : "Lancer l’analyse locale"}
            </button>
            {!activeProfile && <p className="studio-deck-inline-hint">Sélectionnez d’abord une architecture.</p>}
            {analysis ? (
              <div className="studio-deck-analysis-results" aria-live="polite">
                <div className="studio-deck-analysis-status">
                  <span className={analysisIsStale ? "is-stale" : ""} />
                  {analysisIsStale ? "CONFIGURATION MODIFIÉE · RELANCER" : `RUN ${analysis.result.runId}`}
                </div>
                {metricRows.map(metric => (
                  <div className="studio-deck-metric" key={metric.id}>
                    <span>{metric.label}</span>
                    <strong>{formatMetric(metric.value, 2)} <em>{metric.unit}</em></strong>
                    <small>{metric.status === "pass" ? "Dans la cible indicative" : metric.status === "fail" ? "Hors cible indicative" : "À revoir · estimation"}</small>
                  </div>
                ))}
                <small className="studio-deck-result-limit">Coefficients et marges indicatifs. Révision d’ingénierie indépendante requise.</small>
              </div>
            ) : (
              <div className="studio-deck-analysis-empty"><Activity size={19} /><span>Aucune analyse lancée</span><small>Les résultats n’apparaissent qu’après calcul sur la configuration active.</small></div>
            )}
          </section>

          <section className="studio-deck-panel studio-deck-export-panel" id="studio-export-panel">
            <div className="studio-deck-panel-heading">
              <div><span>04 / SORTIES DISPONIBLES</span><h2>Exports du dossier</h2></div>
              <Download size={17} />
            </div>
            <button type="button" onClick={onExportOpenScad}><FileCode2 size={16} /><span><strong>Modèle OpenSCAD</strong><small>Géométrie conceptuelle · .scad</small></span><ArrowRight size={13} /></button>
            <button type="button" onClick={onExportBom}><FileSpreadsheet size={16} /><span><strong>Nomenclature</strong><small>CSV avec provenance · .csv</small></span><ArrowRight size={13} /></button>
            <button type="button" onClick={onExportEngineeringJson}><FileJson2 size={16} /><span><strong>Dossier d’ingénierie</strong><small>Configuration et estimation · .json</small></span><ArrowRight size={13} /></button>
            <button type="button" onClick={onExportStudio}><Boxes size={16} /><span><strong>Document Studio</strong><small>Pièces, calques et annotations · .json</small></span><ArrowRight size={13} /></button>
            <p>Les exports sont préliminaires; aucun plan certifié, fichier STEP ou dossier EASA/OTAN n’est généré.</p>
          </section>
        </aside>
      </div>

      <div className="studio-deck-workflow" aria-label="Étapes du flux Studio">
        <button type="button" onClick={() => onNavigate("concept")}><span>01</span><strong>Conception</strong><small>Architecture et paramètres</small></button>
        <button type="button" onClick={() => onNavigate("cad")}><span>02</span><strong>CAO conceptuelle</strong><small>Géométrie et composants</small></button>
        <button type="button" onClick={() => runLocalAnalysis()}><span>03</span><strong>Analyse locale</strong><small>Estimations et marges</small></button>
        <button type="button" onClick={() => onNavigate("materials")}><span>04</span><strong>Matériaux</strong><small>Bibliothèque / nomenclature</small></button>
        <button type="button" onClick={() => onNavigate("assembly")}><span>05</span><strong>Assemblage</strong><small>Atelier virtuel</small></button>
        <button type="button" onClick={() => onNavigate("reports")}><span>06</span><strong>Exports</strong><small>Fichiers d’échange locaux</small></button>
      </div>
      <div className="studio-deck-compliance-note"><Layers3 size={14} /> Outil de conception préliminaire — la revue humaine, les essais réels et l’approbation réglementaire restent distincts.</div>
    </section>
  );
}
