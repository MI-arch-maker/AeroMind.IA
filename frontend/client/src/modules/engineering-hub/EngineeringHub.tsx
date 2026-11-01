import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BatteryCharging,
  Boxes,
  ClipboardCheck,
  Component,
  Cpu,
  FileText,
  Gauge,
  Layers3,
  Orbit,
  PackageCheck,
  Radio,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import "./engineering-hub.css";
import EngineeringConnectorPanel from "./EngineeringConnectorPanel";

export type EngineeringHubView =
  | "overview"
  | "requirements"
  | "catalog"
  | "design-studio"
  | "parametric-center"
  | "digital-twin"
  | "materials"
  | "simulation"
  | "live"
  | "command-center"
  | "report"
  | "operations"
  | "aero-center";

type Props = {
  projectId?: string;
  projectName: string;
  cellName: string;
  runId: string;
  serverPersisted: boolean;
  t: (frenchText: string) => string;
  onOpen: (view: EngineeringHubView) => void;
};

const departments: Array<{
  number: string;
  title: string;
  scope: string;
  destination: string;
  view: EngineeringHubView;
  status: "workflow" | "partial";
  note: string;
  icon: typeof Wrench;
}> = [
  { number: "01", title: "Conception paramétrique & CAO", scope: "Modélisation, transformations, inspection et exports géométriques.", destination: "Centre paramétrique", view: "parametric-center", status: "workflow", note: "Mechanical Twin et outillage de conception AeroMind réutilisés.", icon: Wrench },
  { number: "02", title: "Structures & matériaux", scope: "Bibliothèque de matériaux, propriétés et nomenclature.", destination: "Construction & équipements", view: "materials", status: "workflow", note: "Catalogue et services de matériaux existants ; solveur FEM externe non connecté.", icon: Layers3 },
  { number: "03", title: "Aérodynamique & CFD", scope: "Calculs conceptuels, conditions de vol et résultats aérodynamiques.", destination: "Centre aéronautique", view: "aero-center", status: "partial", note: "Les résultats conceptuels ne remplacent pas un calcul CFD validé.", icon: Gauge },
  { number: "04", title: "Électronique & PCB", scope: "Inventaire des composants, consommation et documentation de circuits.", destination: "Référentiel composants", view: "materials", status: "partial", note: "Pas d’éditeur de schéma ou de PCB connecté détecté dans le parcours actuel.", icon: Component },
  { number: "05", title: "Énergie & batteries", scope: "Capacité, masse et estimations énergétiques clairement calculées.", destination: "Centre paramétrique", view: "parametric-center", status: "workflow", note: "Les estimations restent calculées ; aucune mesure physique n’est revendiquée.", icon: BatteryCharging },
  { number: "06", title: "Systèmes embarqués & logiciels", scope: "Architecture, supervision et gouvernance des commandes.", destination: "Commandes sûres & gouvernance", view: "command-center", status: "partial", note: "Aucun lien ROS 2 / PX4 / Gazebo n’est déclaré connecté par ce Hub.", icon: Cpu },
  { number: "07", title: "Jumeau numérique & simulation", scope: "Visualisation du modèle, scénarios et résultats simulés.", destination: "Digital Twin Explorer", view: "digital-twin", status: "workflow", note: "Moteur 3D et simulation AeroMind existants ; sortie matérielle reste désactivée.", icon: Orbit },
  { number: "08", title: "Essais & validation", scope: "Scénarios, résultats enregistrés, anomalies et revue humaine.", destination: "Essais & scénarios", view: "live", status: "workflow", note: "Les essais physiques nécessitent des procédures et autorisations séparées.", icon: ClipboardCheck },
  { number: "09", title: "Fabrication & industrialisation", scope: "Nomenclatures, préparation de fichiers et dossier de fabrication.", destination: "Construction & équipements", view: "materials", status: "partial", note: "Le paquet de fabrication AeroMind existe ; aucun connecteur de slicer n’est déclaré actif.", icon: PackageCheck },
  { number: "10", title: "Projets & configurations", scope: "Projets, versions, changements, historique et traçabilité.", destination: "Vue générale / projets", view: "overview", status: "workflow", note: "La vue et les services métier de projet existants restent la source de contexte.", icon: Boxes },
  { number: "11", title: "Maintenance & fiabilité", scope: "Registres, inspections, anomalies et historique de maintenance.", destination: "Opérations & gouvernance", view: "operations", status: "partial", note: "Le service backend de maintenance existe ; le parcours dédié reste à consolider.", icon: Radio },
  { number: "12", title: "Conformité & documentation", scope: "Exigences, preuves, rapports et historique de revue.", destination: "Rapports & revue", view: "report", status: "workflow", note: "Les référentiels ne sont pas déclarés certifiés sans preuves vérifiables.", icon: FileText },
];

const proprietaryTools: Array<{ title: string; view: EngineeringHubView; detail: string }> = [
  { title: "AeroMind Parametric Designer", view: "parametric-center", detail: "Mechanical Twin et Centre paramétrique" },
  { title: "AeroMind Drone Architecture Manager", view: "catalog", detail: "Bibliothèque de cellules et sélection explicite" },
  { title: "AeroMind Materials & Components Library", view: "materials", detail: "Catalogue matériaux et équipements" },
  { title: "AeroMind Simulation Studio", view: "simulation", detail: "Scénarios et runs AeroMind" },
  { title: "AeroMind Structural Analysis", view: "simulation", detail: "Espace de simulation ; FEM externe non connecté" },
  { title: "AeroMind Manufacturing Center", view: "materials", detail: "Nomenclature et préparation de fabrication" },
  { title: "AeroMind Validation & Testing", view: "live", detail: "Essais virtuels et revue humaine" },
  { title: "AeroMind Engineering Documentation", view: "report", detail: "Rapports et documentation technique" },
];

const formats = ["STEP", "IGES", "STL", "OBJ", "glTF", "GLB", "3MF", "DXF", "CSV", "JSON", "PDF"];

export default function EngineeringHub({ projectId, projectName, cellName, runId, serverPersisted, t, onOpen }: Props) {
  const [tab, setTab] = useState<"departments" | "tools" | "connectors">("departments");
  const hasCell = cellName !== "Aucun drone sélectionné";
  return (
    <div className="engineering-hub">
      <header className="engineering-hub-hero">
        <div className="engineering-hub-kicker">AEROMIND / ENGINEERING SYSTEMS</div>
        <h1>AEROMIND AEROSPACE ENGINEERING HUB</h1>
        <p>{t("Environnement intégré de conception, développement et validation de drones")}</p>
        <div className="engineering-hub-context">
          <span><small>{t("PROJET")}</small><strong>{projectId ? projectName : t("Aucun projet actif")}</strong></span>
          <span><small>{t("CELLULE")}</small><strong>{hasCell ? cellName : t("Aucune cellule sélectionnée")}</strong></span>
          <span><small>{t("DERNIER RUN")}</small><strong>{runId || t("Aucun run")}</strong></span>
          <span className={serverPersisted ? "hub-sync-ok" : "hub-sync-local"}><small>{t("SYNCHRONISATION")}</small><strong>{serverPersisted ? t("Serveur confirmé") : t("Brouillon local / non confirmé")}</strong></span>
        </div>
        {!hasCell && <button className="hub-source-notice" type="button" onClick={() => onOpen("catalog")}>
          <ShieldAlert size={17} />
          <span>{t("AUCUNE CELLULE SÉLECTIONNÉE — VEUILLEZ SÉLECTIONNER UN DRONE DEPUIS LA BIBLIOTHÈQUE DES CELLULES OU CRÉER UNE NOUVELLE ARCHITECTURE.")}</span>
          <ArrowRight size={16} />
        </button>}
      </header>

      <nav className="engineering-hub-tabs" aria-label={t("Navigation du Hub d’ingénierie")}>
        <button className={tab === "departments" ? "active" : ""} onClick={() => setTab("departments")}>{t("12 départements")}</button>
        <button className={tab === "tools" ? "active" : ""} onClick={() => setTab("tools")}>{t("8 outils propriétaires")}</button>
        <button className={tab === "connectors" ? "active" : ""} onClick={() => setTab("connectors")}>{t("Connecteurs & formats")}</button>
      </nav>

      {tab === "departments" && <>
        <div className="hub-section-heading"><div><span>01—12 / WORK AREAS</span><h2>{t("Départements d’ingénierie")}</h2></div><p>{t("Les cartes ouvrent les modules AeroMind existants. « Partiel » identifie les parcours encore à compléter — pas un état de validation technique.")}</p></div>
        <div className="hub-department-grid">
          {departments.map(item => {
            const Icon = item.icon;
            return <article className="hub-department-card" key={item.number}>
              <div className="hub-card-top"><span className="hub-department-number">{item.number}</span><span className={`hub-coverage ${item.status}`}>{item.status === "workflow" ? t("Parcours AeroMind") : t("Couverture partielle")}</span></div>
              <Icon size={20} className="hub-card-icon" />
              <h3>{t(item.title)}</h3>
              <p>{t(item.scope)}</p>
              <small>{t(item.note)}</small>
              <button type="button" onClick={() => onOpen(item.view)}>{t(item.destination)}<ArrowRight size={14} /></button>
            </article>;
          })}
        </div>
      </>}

      {tab === "tools" && <>
        <div className="hub-section-heading"><div><span>PROPRIETARY TOOLSET</span><h2>{t("Applications AeroMind")}</h2></div><p>{t("Accès dirigés vers le parcours fonctionnel actuellement disponible dans l’application.")}</p></div>
        <div className="hub-tools-grid">
          {proprietaryTools.map((item, i) => <button type="button" className="hub-tool-card" key={item.title} onClick={() => onOpen(item.view)}>
            <span className="hub-tool-index">A{String(i + 1).padStart(2, "0")}</span><strong>{item.title}</strong><small>{t(item.detail)}</small><ArrowRight size={15} />
          </button>)}
        </div>
      </>}

      {tab === "connectors" && <>
        <div className="hub-section-heading"><div><span>CONNECTOR MANAGER / HONEST STATUS</span><h2>{t("Connecteurs & formats")}</h2></div><p>{t("Aucun logiciel externe ci-dessous n’est marqué « connecté » : son état devra être requalifié par un contrôle réel de configuration, licence, endpoint et échange.")}</p></div>
        <EngineeringConnectorPanel projectId={projectId} t={t} />
        <div className="hub-format-panel"><div><strong>{t("Matrice de formats")}</strong><p>{t("La prise en charge doit être vérifiée par chaque chemin d’import/export ; les unités et métadonnées ne sont pas garanties uniformément.")}</p></div><div className="hub-format-chips">{formats.map(format => <span key={format}>{format}</span>)}</div></div>
      </>}
      <footer className="hub-safety-note"><BadgeCheck size={16} /><span>{t("Simulation uniquement par défaut · aucune commande physique · RBAC et autorisations métier restent appliqués par les services existants.")}</span></footer>
    </div>
  );
}
