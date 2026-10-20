import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import "../components/sharedWorkspaceSync.css";
import "../components/drone-catalog-premium.css";
import "../components/external-drone-import.css";
import type Hls from "hls.js";
import {
  AIChatBox,
  type Message as ChatMessage,
} from "../components/AIChatBox";
import { trpc } from "../lib/trpc";
import { bearerHeaders, clearSessionToken } from "../lib/sessionToken";
import {
  createWorkspaceChannel,
  parseWorkspaceMessage,
  publishWorkspaceMessage,
} from "../lib/workspaceSync";
import {
  createWorkspaceSnapshot,
  readWorkspaceStorage,
  writeWorkspaceStorage,
} from "../lib/projectSyncStore";
import { normalizeLegacyStudioLayers } from "../lib/studioLayerCommands";
import { buildManufacturingPackage } from "../lib/manufacturing";
import { buildEngineeringReview } from "../lib/engineeringReview";
import { nextLocalSimulationRunId } from "../lib/simulationRunId";
import { startLogin } from "../const";
import { droneCatalog, type DroneCatalogDesign } from "../lib/droneCatalog";
import { adaptExternalDroneToCatalog, deleteImportedDroneProfile, getMeshDimensions, initializeImportedDroneProfile, loadImportedDroneProfiles, loadImportedDroneProfilesDurable, normalizeImportedDroneProfile, parseExternalDroneMesh, saveImportedDroneProfile, transitionImportedDroneProfile, type Axis, type AxisMapping, type ImportArchitecture, type ImportedDroneProfile, type ImportedDroneReviewStatus } from "../lib/externalDroneImport";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import {
  missionRequirementTemplates,
  type MissionRequirementTemplate,
} from "../lib/missionRequirements";
import {
  dronePartCatalog,
  dronePartCategories,
  type DronePartCategory,
  type DronePartDefinition,
} from "../lib/droneParts";
import { manufacturerPartCatalog } from "../lib/manufacturerParts";
import { materialCatalog, materialLibrarySummary } from "../lib/materialLibrary";
import { ParametricDronePreview } from "../components/ParametricDronePreview";
import { PhysicalDroneModel } from "../components/PhysicalDroneModel";
import { EngineeringDronePlate } from "../components/EngineeringDronePlate";
import { DroneBehaviorPanel } from "../components/DroneBehaviorPanel";
import { DroneSketchProWorkbench } from "../components/DroneSketchProWorkbench";
import { VirtualAssemblyWorkshop } from "../components/VirtualAssemblyWorkshop";
import { VirtualSimulationCenter } from "../components/VirtualSimulationCenter";
import { VirtualFlightTestHall } from "../components/VirtualFlightTestHall";
import type { MissionTelemetryFrame } from "../lib/missionBridge";
import {
  authorizeControlCommand,
  CONTROL_BOUNDARY,
  createControlAuditEvent,
  ingestReadOnlyTelemetry,
} from "../lib/aircraftControlBoundary";
import {
  areAllProtocolChecksAcknowledged,
  SIMULATION_ACTIVATION_PROTOCOL,
  TELEMETRY_ACTIVATION_PROTOCOL,
} from "../lib/activationProtocol";
import {
  buildBillOfMaterialsCsv,
  buildEngineeringJson,
  buildOpenScadModel,
  safeEngineeringFilename,
} from "../lib/engineeringExports";
import {
  buildMissionTemplate,
  calculateFlightPreview,
  createCompatibleDemoMissionPlan,
  defaultFlightControls,
  defaultLocalMissionPlan,
  estimateLocalMissionDistanceKm,
  validateLocalMission,
  type MissionTemplateId,
} from "../lib/flightEngineering";
import { parseLocalMissionPlanJson } from "../lib/missionPlanFile";
import { parseMavlinkObserverSnapshot } from "../lib/mavlinkBridge";
import {
  defaultTrialOperation,
  findTrialOperation,
  trialOperations,
} from "../lib/trialOperations";
import {
  applyConceptProposal,
  buildConceptProposal,
  type ConceptFieldKey,
  type ConceptProposal,
} from "../lib/conceptGenerator";
import {
  applyPartCommand,
  describePartMass,
  summarizeParts,
  PART_NUDGE_STEP,
  PART_SCALE_STEP,
  type PartCommand,
} from "../lib/partCommands";
import {
  runVirtualTestCampaign,
  virtualCampaignToCsv,
  type VirtualTestCampaign,
  type VirtualTestId,
} from "../lib/virtualTestBench";
import { AeronauticalCenterView } from "../components/AeronauticalCenterView";
import { WorkspaceWindow } from "../components/WorkspaceWindow";
import { DesignStudioView } from "../components/DesignStudioView";
import { DigitalTwinExplorer } from "../components/DigitalTwinExplorer";
import { SatelliteNavigationView } from "../components/SatelliteNavigationView";
import { HumanCommandCenter } from "../components/HumanCommandCenter";
import LabBench from "./LabBench";
import { IndustrialModelRegistry } from "../components/IndustrialModelRegistry";
import { industrialDroneRegistry, type IndustrialDroneReference } from "../lib/industrialDroneRegistry";
import { FlightCommandDeck } from "../components/FlightCommandDeck";
import { EngineeringStreamArchitecture } from "../components/EngineeringStreamArchitecture";
import { EngineeringSyncStatus } from "../components/EngineeringSyncStatus";
import { evaluateEngineeringSync } from "../lib/engineeringSyncHealth";
import {
  createWorkflowReport,
  demoScenario,
  executeWorkflowRun,
  registerPrototype,
  replayWorkflowRun,
  type WorkflowPrototype,
  type WorkflowRun,
} from "../lib/integratedWorkflow";
import {
  canLaunchMission,
  defaultMissionPlan,
  validateMissionPlan,
  type AutonomyMode,
  type MissionPlan,
} from "@shared/autonomy";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  BatteryCharging,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  ClipboardCheck,
  Cloud,
  Copy,
  Cpu,
  Crosshair,
  Download,
  FileBarChart,
  FileText,
  Info,
  Eye,
  Pin,
  Trash2,
  LayoutDashboard,
  Layers3,
  Database,
  Menu,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Orbit,
  Package,
  Pause,
  Play,
  Radio,
  Route,
  Satellite,
  Ruler,
  Target,
  Timer,
  Navigation,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Undo2,
  Upload,
  ScanLine,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Search,
  Pencil,
  Sparkles,
  Wind,
  Video,
  Wrench,
  Gauge,
  Lightbulb,
  LogIn,
  LogOut,
  Rotate3d,
  X,
  Zap,
} from "lucide-react";
import {
  clampPartScale,
  defaultConcept,
  defaultRequirements,
  formatNumber,
  installedPartMassKg,
  installedPartsMassKg,
  isManufacturerReference,
  runSimulation,
  type ConceptConfig,
  type CalculationModelType,
  type DroneArchitecture,
  type FlightControlsConfig,
  type InstalledMaterial,
  type LocalMissionPlan,
  type MissionWaypoint,
  type MetricStatus,
  type Requirement,
  type RequirementStatus,
  type RiskItem,
  type SimulationMetric,
  type SimulationResult,
} from "../lib/aeroEngine";
import { hasDroneGeometry } from "../lib/droneSketchGeometry";
import { useLanguage } from "../contexts/LanguageContext";
import { translate, type AppLanguage } from "../lib/language";

const APP_VERSION = "18.27.0";

/** Profil canonique partagé par la bibliothèque et tous les postes 3D. */
function industrialReferenceToDesign(reference: IndustrialDroneReference): DroneCatalogDesign {
  const key = reference.architecture === "multirotor" ? "quadcopter" : reference.architecture;
  const modelType: CalculationModelType = reference.architecture === "fixed-wing" ? "voilure-conventionnelle" : reference.architecture === "vtol" ? "tiltrotor" : "multirotor";
  return {
    id: reference.id,
    key,
    modelType,
    label: reference.model,
    family: reference.family,
    mission: reference.mission,
    specs: `${reference.dimensions} · ${reference.payload}`,
    disciplines: "Référence industrielle · intégration · qualification",
    tone: "cyan",
    role: "civil",
    defenseUse: "Plateforme civile non armée ; intégration et qualification humaine obligatoires.",
    origin: "prototype-reference",
    configuration: {
      ...reference.configuration,
      airframe: key,
      modelType,
      designName: `${reference.manufacturer} ${reference.model}`,
    },
  };
}

const allDroneProfiles = [
  ...droneCatalog,
  ...industrialDroneRegistry.map(industrialReferenceToDesign),
];
const findDroneProfile = (id?: string) =>
  id ? allDroneProfiles.find(item => item.id === id) ?? loadImportedDroneProfiles().find(item => item.id === id) : undefined;

const DEFAULT_MISSION_BRIEF =
  "Inspection d’une ligne électrique sur 18 km, capteur stabilisé, retour supervisé.";

type SessionUser = { email?: string; name?: string; role?: string };

function SessionControls() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const response = await fetch("/api/auth/oidc/me", { credentials: "include", headers: bearerHeaders() });
      setUser(response.ok ? ((await response.json()) as SessionUser) : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const onSessionChanged = () => void refresh();
    window.addEventListener("aeromind-auth-changed", onSessionChanged);
    return () => window.removeEventListener("aeromind-auth-changed", onSessionChanged);
  }, []);

  const login = () => startLogin();
  const logout = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/oidc/logout", { method: "POST", credentials: "include" });
      clearSessionToken();
      setUser(null);
      window.dispatchEvent(new Event("aeromind-auth-changed"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="session-controls" aria-live="polite">Vérification de la session…</div>;
  if (!user) {
    return (
      <div className="session-controls">
        <div className="session-copy"><strong>Session fermée</strong><small>Connectez-vous pour synchroniser AeroMind.</small></div>
        <button className="primary-button session-button" onClick={login} type="button"><LogIn size={14} /> Se connecter</button>
      </div>
    );
  }
  return (
    <div className="session-controls">
      <div className="session-copy"><strong>{user.name || user.email || "Compte AeroMind"}</strong><small>Session active · {user.role === "super_admin" ? "Super-Admin" : "Utilisateur"}</small></div>
      <button className="secondary-button session-button" onClick={() => void logout()} disabled={busy} type="button"><LogOut size={14} /> {busy ? "Déconnexion…" : "Se déconnecter"}</button>
    </div>
  );
}

/** Formatage d’une valeur de proposition selon son unité. */
const formatProposalValue = (value: number, unit: string) => {
  if (unit === "fraction") return formatNumber(value, 2);
  if (unit === "Wh" || unit === "km/h" || unit === "")
    return formatNumber(value, 0);
  return formatNumber(value, 2);
};

function downloadLocalFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type ViewId =
  | "overview"
  | "requirements"
  | "concept"
  | "tools"
  | "inspector"
  | "digital-twin"
  | "catalog"
  | "satellite-nav"
  | "simulation"
  | "labbench"
  | "live"
  | "mission-center"
  | "command-center"
  | "report"
  | "copilot"
  | "operations"
  | "materials"
  | "aero-center"
  | "design-studio"
;
type ProjectState = {
  name: string;
  mission: string;
  status: string;
  version: string;
  owner: string;
  lastUpdated: string;
};
type ProjectRecord = {
  id: string;
  project: ProjectState;
  requirements: Requirement[];
  config: ConceptConfig;
  runId: string;
};
type PersistedState = ProjectRecord & {
  projects?: ProjectRecord[];
  activeProjectId?: string;
};

type ActionStatus = "idle" | "loading" | "success" | "error";
type ActionState = {
  status: ActionStatus;
  message: string;
  retry?: () => void;
};
type SetConceptConfig = Dispatch<SetStateAction<ConceptConfig>>;

const WORKSPACE_KEY = "aeromind-blank-workspace-v3";
const blankConcept: ConceptConfig = {
  wingspan: 0,
  chord: 0,
  fuselageLength: 0,
  propDiameter: 0,
  batteryWh: 0,
  payloadKg: 0,
  cruiseSpeedKmh: 0,
  windSpeedKmh: 0,
  reserveFraction: 0,
  maxTakeoffKg: 0,
  altitudeM: 0,
  airframe: undefined,
  motorCount: undefined,
  designName: "Projet vierge — saisie humaine requise",
};
const defaultProject: ProjectState = {
  name: "Nouveau projet",
  mission:
    "Définissez votre mission, choisissez un exemple ou construisez une architecture personnalisée.",
  status: "Non initialisé",
  version: APP_VERSION,
  owner: "Projet local",
  lastUpdated: "Jamais enregistré",
};
const emptyProject: ProjectState = {
  name: "Aucun projet sélectionné",
  mission:
    "Créez manuellement un projet pour initialiser l’espace de conception.",
  status: "En attente",
  version: APP_VERSION,
  owner: "Aucun propriétaire",
  lastUpdated: "Jamais enregistré",
};
const navItems: Array<{
  id: ViewId;
  label: string;
  meta: string;
  icon: typeof LayoutDashboard;
  group: "PILOTER" | "CONCEVOIR" | "SIMULER" | "REVOIR";
  primary?: boolean;
}> = [
  {
    id: "overview",
    label: "Vue générale",
    meta: "01",
    icon: LayoutDashboard,
    group: "PILOTER",
    primary: true,
  },
  {
    id: "aero-center",
    label: "Observation & instrumentation",
    meta: "ACC",
    icon: Navigation,
    group: "PILOTER",
    primary: true,
  },
  {
    id: "mission-center",
    label: "Poste de commande de vol",
    meta: "OPS",
    icon: Video,
    group: "PILOTER",
    primary: true,
  },
  {
    id: "satellite-nav",
    label: "Navigation satellite",
    meta: "GNSS",
    icon: Satellite,
    group: "PILOTER",
    primary: true,
  },
  {
    id: "command-center",
    label: "Commandes sûres & gouvernance",
    meta: "SIM",
    icon: ShieldCheck,
    group: "PILOTER",
    primary: true,
  },
  {
    id: "requirements",
    label: "Mission & exigences",
    meta: "—",
    icon: ClipboardCheck,
    group: "CONCEVOIR",
    primary: true,
  },
  {
    id: "design-studio",
    label: "Studio IDDS",
    meta: "CAD",
    icon: Rotate3d,
    group: "CONCEVOIR",
    primary: true,
  },
  {
    id: "catalog",
    label: "Bibliothèque de cellules",
    meta: String(droneCatalog.length).padStart(2, "0"),
    icon: Package,
    group: "CONCEVOIR",
    primary: true,
  },
  {
    id: "digital-twin",
    label: "Digital Twin Explorer",
    meta: "TWIN",
    icon: Rotate3d,
    group: "CONCEVOIR",
    primary: true,
  },
  {
    id: "materials",
    label: "Construction & équipements",
    meta: String(materialLibrarySummary.total).padStart(2, "0"),
    icon: Layers3,
    group: "CONCEVOIR",
    primary: true,
  },
  {
    id: "simulation",
    label: "Simulation & analyses",
    meta: "SIM-000",
    icon: Activity,
    group: "SIMULER",
    primary: true,
  },
  {
    id: "labbench",
    label: "LabBench 01",
    meta: "P1",
    icon: Cpu,
    group: "SIMULER",
    primary: true,
  },
  {
    id: "live",
    label: "Essais & scénarios",
    meta: "TEST",
    icon: Radio,
    group: "SIMULER",
    primary: true,
  },
  {
    id: "copilot",
    label: "Copilote IA / jumeau numérique",
    meta: "AI",
    icon: Sparkles,
    group: "SIMULER",
  },
  {
    id: "report",
    label: "Rapports & revue",
    meta: "DRAFT",
    icon: FileText,
    group: "REVOIR",
    primary: true,
  },
  {
    id: "operations",
    label: "Journal de validation détaillé",
    meta: "HUMAN",
    icon: ShieldCheck,
    group: "REVOIR",
  },
];

// Arborescence nominale : vue générale, mission, architecture, construction, observation, simulation, validation, commande sûre.
const engineeringNavOrder: ViewId[] = [
  "overview",
  "requirements",
  "catalog",
  "digital-twin",
  "design-studio",
  "materials",
  "aero-center",
  "simulation",
  "labbench",
  "mission-center",
  "satellite-nav",
  "live",
  "report",
  "command-center",
];
const orderedNavItems = [
  ...navItems.filter(item => item.primary).sort((a, b) => engineeringNavOrder.indexOf(a.id) - engineeringNavOrder.indexOf(b.id)),
  ...navItems.filter(item => !item.primary),
];
const componentDetails: Record<
  string,
  { label: string; detail: string; value: string }
> = {
  fuselage: {
    label: "Fuselage central",
    detail: "Composite carbone · volume instrumenté",
    value: "1,55 m",
  },
  wing: {
    label: "Aile principale",
    detail: "Voilure droite · profil préliminaire",
    value: "2,80 m",
  },
  tail: {
    label: "Empennage",
    detail: "Stabilisation longitudinale",
    value: "0,64 m",
  },
  propeller: {
    label: "Propulsion",
    detail: "Hélice bipale · moteur électrique",
    value: "Ø 0,42 m",
  },
  payload: {
    label: "Charge utile",
    detail: "Baie capteur inspection",
    value: "1,50 kg",
  },
};
const normalizeConcept = (config: ConceptConfig): ConceptConfig => ({
  ...blankConcept,
  ...config,
  airframe: config.airframe,
  modelType:
    config.modelType ??
    findDroneProfile(config.platformProfile)?.modelType,
  motorCount: config.motorCount,
  designName: config.designName ?? "Projet vierge — saisie humaine requise",
});
const demoProjectId = "project-aeromind-inspection-demo";
const demoProject: ProjectRecord = {
  id: demoProjectId,
  project: {
    ...defaultProject,
    name: "Inspection ligne électrique · démonstration",
    mission: DEFAULT_MISSION_BRIEF,
    status: "Scénario local prêt",
    owner: "AeroMind IA · local",
    lastUpdated: "Initialisé automatiquement",
  },
  requirements: defaultRequirements.map(item => ({
    ...item,
    visible: true,
    pinned: item.id === "endurance" || item.id === "payload",
    approved: item.status === "ok",
  })),
  config: normalizeConcept({
    ...defaultConcept,
    missionBrief: DEFAULT_MISSION_BRIEF,
    aeronauticalRole: "observation",
    integratedEquipmentIds: ["eo-gimbal", "rtk", "parachute"],
    flightControls: { ...defaultFlightControls },
    missionPlan: { ...defaultLocalMissionPlan },
  }),
  runId: "SIM-000",
};
const emptyWorkspace: PersistedState = {
  id: "workspace-empty",
  project: emptyProject,
  requirements: [],
  config: normalizeConcept(blankConcept),
  runId: "—",
  projects: [],
  activeProjectId: "",
};
const readPersistedState = (): PersistedState => {
  if (typeof window === "undefined") return emptyWorkspace;
  const result = readWorkspaceStorage();
  if (result?.ok) {
    const parsed = result.value as unknown as PersistedState;
    const userProjects = (parsed.projects ?? []).filter(
      item => item.id !== "project-local-1" && item.id !== demoProjectId
    );
    if (!userProjects.length) return emptyWorkspace;
    const activeProjectId = userProjects.some(item => item.id === parsed.activeProjectId)
      ? parsed.activeProjectId : userProjects[0].id;
    const active = userProjects.find(item => item.id === activeProjectId) ?? userProjects[0];
    return { ...active, projects: userProjects, activeProjectId: active.id, config: normalizeConcept(active.config) };
  }
  if (result && !result.ok) {
    console.error("AeroMind: restauration locale refusée", result.message, result.issues);
  }
  return emptyWorkspace;
};
const statusLabel: Record<RequirementStatus, string> = {
  ok: "Satisfaite",
  review: "À vérifier",
  hypothesis: "Hypothèse",
  conflict: "Conflit",
};
const metricStatusLabel: Record<MetricStatus, string> = {
  pass: "Dans l’enveloppe",
  review: "Revue requise",
  fail: "Hors enveloppe",
};

function StatusPill({
  status,
  children,
}: {
  status: RequirementStatus | MetricStatus | RiskItem["severity"];
  children?: ReactNode;
}) {
  return (
    <span className={`status-pill status-${status}`}>
      {children ??
        (status in statusLabel
          ? statusLabel[status as RequirementStatus]
          : metricStatusLabel[status as MetricStatus])}
    </span>
  );
}
function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {description && <p className="section-description">{description}</p>}
      </div>
      {action && <div className="section-action">{action}</div>}
    </div>
  );
}

function EngineeringGuide({
  eyebrow,
  title,
  description,
  suggestions,
  onApply,
}: {
  eyebrow: string;
  title: string;
  description: string;
  suggestions: string[];
  onApply?: (suggestion: string) => void;
}) {
  return (
    <aside className="engineering-guide" aria-label={`Guide ${title}`}>
      <div className="engineering-guide-mark">
        <Lightbulb size={15} />
      </div>
      <div className="engineering-guide-content">
        <span className="eyebrow">{eyebrow}</span>
        <strong>{title}</strong>
        <p>{description}</p>
        <div className="engineering-guide-suggestions">
          {suggestions.map(suggestion => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onApply?.(suggestion)}
              disabled={!onApply}
            >
              <ArrowRight size={12} /> {suggestion}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
  detail,
  tone = "cyan",
  progress,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  unit?: string;
  detail: string;
  tone?: string;
  progress?: number;
}) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-topline">
        <span className="metric-icon">
          <Icon size={16} strokeWidth={1.7} />
        </span>
        <span className="metric-label">{label}</span>
        <MoreHorizontal size={16} className="muted-icon" />
      </div>
      <div className="metric-value">
        {value} <small>{unit}</small>
      </div>
      <div className="metric-foot">
        <span>{detail}</span>
        {progress !== undefined && <span>{progress}%</span>}
      </div>
      {progress !== undefined && (
        <div className="metric-progress">
          <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      )}
    </article>
  );
}
function MiniBar({
  label,
  value,
  percent,
  tone = "cyan",
}: {
  label: string;
  value: string;
  percent: number;
  tone?: string;
}) {
  return (
    <div className="mini-bar-row">
      <div className="mini-bar-label">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="mini-bar-track">
        <span
          className={`bar-${tone}`}
          style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  );
}

function DroneBlueprint({
  config,
  selected,
  onSelect,
}: {
  config: ConceptConfig;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const kind = config.airframe ?? "fixed-wing";
  if (!config.airframe || kind === "fixed-wing") return null;
  const motors = Math.max(3, Math.min(8, Math.round(config.motorCount ?? 4)));
  const flight = calculateFlightPreview(config, {
    ...defaultFlightControls,
    ...config.flightControls,
  });
  const spanBase = kind === "vtol" ? 2.4 : 1.15;
  const spanScale = Math.max(0.62, Math.min(1.4, config.wingspan / spanBase));
  const lengthScale = Math.max(
    0.72,
    Math.min(1.35, config.fuselageLength / (kind === "vtol" ? 1.35 : 0.55))
  );
  const propScale = Math.max(0.8, Math.min(1.35, config.propDiameter / 0.42));
  return (
    <div
      className={`drone-blueprint blueprint-${kind}`}
      aria-label={`Maquette interactive ${kind}`}
      data-wingspan={config.wingspan}
      data-motor-count={motors}
    >
      <div className="blueprint-grid" />
      <div
        className="blueprint-frame"
        style={{
          width: `${Math.max(50, Math.min(94, 74 * spanScale))}%`,
          height: `${Math.max(165, Math.min(285, 220 * lengthScale))}px`,
        }}
      >
        {Array.from({ length: motors }).map((_, index) => {
          const angle = -90 + (360 * index) / motors;
          const x =
            50 +
            Math.cos((angle * Math.PI) / 180) * (kind === "vtol" ? 33 : 37);
          const y =
            50 +
            Math.sin((angle * Math.PI) / 180) * (kind === "vtol" ? 27 : 33);
          const output = flight.motorOutputsPct[index] ?? 0;
          return (
            <button
              key={index}
              type="button"
              className={`blueprint-motor ${selected === `motor-${index}` ? "is-selected" : ""} ${output > 0 ? "is-spinning" : ""}`}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: `${48 * propScale}px`,
                height: `${48 * propScale}px`,
                animationDuration: `${Math.max(0.12, 0.9 - output / 140)}s`,
              }}
              onClick={() => onSelect(`motor-${index}`)}
              aria-label={`Moteur ${index + 1} — sortie simulée ${output}%`}
              title={`Sortie simulée ${output}%`}
            >
              <span className="motor-ring" />
              <span className="motor-prop" />
            </button>
          );
        })}
        <button
          type="button"
          className={`blueprint-body ${selected === "fuselage" ? "is-selected" : ""}`}
          style={{
            width: `${Math.max(112, 130 * lengthScale)}px`,
            height: `${Math.max(72, 82 * lengthScale)}px`,
          }}
          onClick={() => onSelect("fuselage")}
          aria-label="Corps central"
        >
          <span>{kind === "vtol" ? "VTOL" : "AI"}</span>
        </button>
        {kind === "vtol" && (
          <>
            <button
              type="button"
              className={`blueprint-wing ${selected === "wing" ? "is-selected" : ""}`}
              onClick={() => onSelect("wing")}
              aria-label="Aile VTOL"
            />
            <button
              type="button"
              className={`blueprint-aileron ${selected === "aileron" ? "is-selected" : ""}`}
              style={{
                transform: `translateX(${flight.aileronDeg * 0.45}px) rotate(${flight.aileronDeg * 0.45}deg)`,
              }}
              onClick={() => onSelect("aileron")}
              aria-label={`Aileron VTOL ${flight.aileronDeg} degrés`}
            />
          </>
        )}
        {config.installedMaterials?.map((module, index) => (
          <button
            key={module.id}
            type="button"
            className={`blueprint-module module-${module.geometry}`}
            style={{
              left: `${23 + (index % 6) * 10 + (module.offsetX ?? 0)}%`,
              top: `${23 + Math.floor(index / 6) * 8.5 + (module.offsetY ?? 0)}%`,
              transform: `scale(${clampPartScale(module.scale ?? 1)})`,
            }}
            onClick={() => onSelect(`module-${module.id}`)}
            aria-label={`${module.label}, ${installedPartMassKg(module).toFixed(2)} kilogramme`}
            title={`${module.label} · ${installedPartMassKg(module).toFixed(2)} kg au bilan`}
          >
            {module.label.slice(0, 2).toUpperCase()}
          </button>
        ))}
      </div>
      <span className="blueprint-label">
        {config.platformProfile?.toUpperCase() ??
          (kind === "quadcopter" ? "MULTIROTOR" : "VTOL HYBRIDE")}{" "}
        · {motors} MOTEURS · {config.wingspan.toFixed(2)} m
      </span>
    </div>
  );
}

function ConceptCanvas({
  config,
  selected,
  onSelect,
  rotation,
  rotationX,
  rotationY,
  zoom,
  setRotation,
  setRotationX,
  setRotationY,
  setZoom,
}: {
  config: ConceptConfig;
  selected: string;
  onSelect: (id: string) => void;
  rotation: number;
  rotationX: number;
  rotationY: number;
  zoom: number;
  setRotation: (value: number) => void;
  setRotationX: (value: number) => void;
  setRotationY: (value: number) => void;
  setZoom: (value: number) => void;
}) {
  const catalogDesign = findDroneProfile(config.platformProfile);
  const activeCatalogDesign = catalogDesign
    ? {
        ...catalogDesign,
        configuration: { ...catalogDesign.configuration, ...config },
      }
    : undefined;
  const scale = Math.max(0.6, Math.min(1.8, 1 + zoom * 0.1));
  const flight = calculateFlightPreview(config, {
    ...defaultFlightControls,
    ...config.flightControls,
  });
  const wingspanScale = Math.max(0.58, Math.min(1.45, config.wingspan / 2.8));
  const chordScale = Math.max(0.62, Math.min(1.55, config.chord / 0.32));
  const fuselageScale = Math.max(
    0.68,
    Math.min(1.5, config.fuselageLength / 1.55)
  );
  const propScale = Math.max(0.65, Math.min(1.55, config.propDiameter / 0.42));
  const payloadScale = Math.max(0.65, Math.min(1.5, config.payloadKg / 1.5));
  const propOffsetX =
    config.motorPosition === "Nacelles sur aile"
      ? 210
      : config.motorPosition === "Configuration centrale"
        ? 130
        : 0;
  const [projection, setProjection] = useState<
    "isometric" | "top" | "quarter-left" | "quarter-right" | "orbit"
  >("isometric");
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const viewPresets = [
    { id: "isometric", label: "ISO", rotationX: 52, rotationY: 0 },
    { id: "top", label: "PLAN", rotationX: 0, rotationY: 0 },
    { id: "quarter-left", label: "3/4 G", rotationX: 52, rotationY: -26 },
    { id: "quarter-right", label: "3/4 D", rotationX: 52, rotationY: 26 },
  ] as const;
  const dragRef = useRef<{
    x: number;
    y: number;
    rotation: number;
    rotationX: number;
    rotationY: number;
  } | null>(null);
  useEffect(() => {
    const syncFullscreen = () =>
      setCanvasFullscreen(document.fullscreenElement === canvasWrapRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  const applyViewPreset = (preset: (typeof viewPresets)[number]) => {
    setProjection(preset.id);
    setRotation(0);
    setRotationX(preset.rotationX);
    setRotationY(preset.rotationY);
  };
  const toggleCanvasFullscreen = async () => {
    const canvas = canvasWrapRef.current;
    if (!canvas) return;
    try {
      if (document.fullscreenElement === canvas) {
        await document.exitFullscreen();
      } else {
        await canvas.requestFullscreen();
      }
    } catch {
      setCanvasFullscreen(false);
    }
  };
  const handleCanvasWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom(Math.max(-4, Math.min(8, zoom + (event.deltaY < 0 ? 1 : -1))));
  };
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      rotation,
      rotationX,
      rotationY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const deltaX = event.clientX - dragRef.current.x;
    const deltaY = event.clientY - dragRef.current.y;
    setRotation(dragRef.current.rotation + deltaX * 0.3);
    setRotationX(
      Math.max(0, Math.min(80, dragRef.current.rotationX - deltaY * 0.3))
    );
    setRotationY(
      Math.max(-65, Math.min(65, dragRef.current.rotationY + deltaX * 0.2))
    );
    setProjection("orbit");
  };
  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  return (
    <div className="concept-canvas-wrap" ref={canvasWrapRef}>
      <div className="canvas-toolbar">
        <div className="toolbar-group">
          <button
            className="icon-button"
            aria-label="Tourner à gauche"
            onClick={() => setRotation(rotation - 12)}
          >
            <ArrowDownRight size={15} className="rotate-left" />
          </button>
          <span className="toolbar-readout">
            AZ {String((rotation + 360) % 360).padStart(3, "0")}°
          </span>
          <button
            className="icon-button"
            aria-label="Tourner à droite"
            onClick={() => setRotation(rotation + 12)}
          >
            <ArrowDownRight size={15} />
          </button>
        </div>
        <div
          className="canvas-projection-tools"
          role="group"
          aria-label="Projection du modèle"
        >
          {viewPresets.map(preset => (
            <button
              key={preset.id}
              type="button"
              className={`canvas-projection-button ${projection === preset.id ? "is-active" : ""}`}
              aria-pressed={projection === preset.id}
              aria-label={`Projection ${preset.label}`}
              title={`Projection ${preset.label}`}
              onClick={() => applyViewPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="toolbar-group">
          <button
            className="icon-button"
            aria-label="Zoom arrière"
            onClick={() => setZoom(Math.max(-4, zoom - 1))}
          >
            −
          </button>
          <span className="toolbar-readout">{Math.round(scale * 100)}%</span>
          <button
            className="icon-button"
            aria-label="Zoom avant"
            onClick={() => setZoom(Math.min(8, zoom + 1))}
          >
            +
          </button>
          <button
            className="icon-button"
            aria-label="Réinitialiser la vue"
            onClick={() => {
              setRotation(0);
              setRotationX(52);
              setRotationY(0);
              setZoom(0);
              setProjection("isometric");
            }}
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            className={`icon-button ${showMeasurements ? "is-active" : ""}`}
            aria-label={
              showMeasurements ? "Masquer les mesures" : "Afficher les mesures"
            }
            aria-pressed={showMeasurements}
            onClick={() => setShowMeasurements(value => !value)}
          >
            <Ruler size={14} />
          </button>
          <label
            className="canvas-zoom-slider"
            title="Agrandissement du modèle"
          >
            <span>ZOOM</span>
            <input
              type="range"
              min="0.6"
              max="1.8"
              step="0.05"
              value={scale}
              onChange={event =>
                setZoom((Number(event.target.value) - 1) / 0.1)
              }
              aria-label="Agrandissement du modèle"
            />
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label={
              canvasFullscreen
                ? "Quitter le plein écran du concept"
                : "Afficher le concept en plein écran"
            }
            onClick={() => void toggleCanvasFullscreen()}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
      <div
        className={`concept-canvas ${dragRef.current ? "is-dragging" : ""}`}
        onPointerDown={handlePointerDown}
        onWheel={handleCanvasWheel}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          transform: `scale(${scale}) rotateX(${rotationX}deg) rotateY(${rotationY}deg) rotateZ(${rotation / 5}deg)`,
        }}
      >
        <div className="flight-grid" aria-hidden="true" />
        {!config.airframe && (
          <div className="empty-canvas-state">
            <Box size={28} />
            <strong>Aucune maquette chargée</strong>
            <span>
              Choisissez un exemple ci-dessus ou construisez votre propre
              architecture.
            </span>
          </div>
        )}
        {config.airframe && (activeCatalogDesign ? (
          <div className="tools-catalog-preview tools-catalog-preview-3d">
            <EngineeringDronePlate
              design={activeCatalogDesign}
              status="flying"
              construction={{ parts: config.installedMaterials?.length ?? 0, massKg: config.constructionMassKg ?? 0 }}
            />
            <span className="engineering-sync-label">
              MORPHOLOGIE ACTIVE ·{" "}
              {(activeCatalogDesign.modelType ?? "architecture").toUpperCase()}{" "}
              · CALCULS SYNCHRONISÉS
            </span>
          </div>
        ) : (
          <DroneBlueprint
            config={config}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
        <svg
          viewBox="0 0 760 390"
          role="img"
          aria-label={`Maquette paramétrique ${config.designName ?? "drone"} · envergure ${config.wingspan} m · fuselage ${config.fuselageLength} m`}
          className="aircraft-svg"
          data-material-family={config.materialFamily ?? "Composite carbone"}
          data-wingspan={config.wingspan}
          data-fuselage-length={config.fuselageLength}
          data-aileron-deg={flight.aileronDeg}
          data-elevator-deg={flight.elevatorDeg}
          data-rudder-deg={flight.rudderDeg}
          style={{
            display:
              config.airframe === "fixed-wing" && !activeCatalogDesign
                ? "block"
                : "none",
          }}
        >
          <defs>
            <linearGradient id="fuselageGradient" x1="0" x2="1" y1="0" y2="1">
              <stop
                offset="0"
                stopColor={
                  config.materialFamily?.includes("Aluminium")
                    ? "#f4dfa9"
                    : config.materialFamily?.includes("Mousse")
                      ? "#dcf0bd"
                      : "#d9f3f3"
                }
              />
              <stop
                offset="0.36"
                stopColor={
                  config.materialFamily?.includes("Aluminium")
                    ? "#a98c56"
                    : config.materialFamily?.includes("Mousse")
                      ? "#77a66a"
                      : "#5cc4cc"
                }
              />
              <stop
                offset="1"
                stopColor={
                  config.materialFamily?.includes("Aluminium")
                    ? "#584c3a"
                    : config.materialFamily?.includes("Mousse")
                      ? "#355743"
                      : "#1c6475"
                }
              />
            </linearGradient>
            <linearGradient id="wingGradient" x1="0" x2="0" y1="0" y2="1">
              <stop
                offset="0"
                stopColor={
                  config.materialFamily?.includes("Aluminium")
                    ? "#f4dfa9"
                    : config.materialFamily?.includes("Mousse")
                      ? "#dcf0bd"
                      : "#b7e3e5"
                }
              />
              <stop
                offset="1"
                stopColor={
                  config.materialFamily?.includes("Aluminium")
                    ? "#75603a"
                    : config.materialFamily?.includes("Mousse")
                      ? "#55764d"
                      : "#246476"
                }
              />
            </linearGradient>
            <filter id="aircraftShadow">
              <feDropShadow
                dx="0"
                dy="12"
                stdDeviation="7"
                floodColor="#031820"
                floodOpacity="0.48"
              />
            </filter>
          </defs>
          <g filter="url(#aircraftShadow)">
            <path
              className={
                selected === "wing"
                  ? "aircraft-part is-selected"
                  : "aircraft-part"
              }
              onClick={() => onSelect("wing")}
              d="M110 211 L321 180 L412 186 L650 212 L650 231 L411 222 L321 215 L110 235 Z"
              transform={`translate(380 211) scale(${wingspanScale} ${chordScale}) translate(-380 -211)`}
              fill="url(#wingGradient)"
            />
            <path
              className={
                selected === "tail"
                  ? "aircraft-part is-selected"
                  : "aircraft-part"
              }
              onClick={() => onSelect("tail")}
              d="M566 203 L664 163 L688 170 L628 218 Z"
              transform={`translate(380 211) scale(${fuselageScale} ${chordScale}) translate(-380 -211)`}
              fill="#73c8cd"
            />
            <path
              className={
                selected === "tail"
                  ? "aircraft-part is-selected"
                  : "aircraft-part"
              }
              onClick={() => onSelect("tail")}
              d="M579 226 L653 271 L680 268 L627 217 Z"
              transform={`translate(380 211) scale(${fuselageScale} ${chordScale}) translate(-380 -211)`}
              fill="#2d7788"
            />
            <path
              className={`aircraft-control-surface ${selected === "aileron" ? "is-selected" : ""}`}
              d="M415 222 L615 228 L615 233 L415 227 Z"
              transform={`rotate(${flight.aileronDeg * 0.75} 520 226)`}
              data-deflection={flight.aileronDeg}
              onClick={() => onSelect("aileron")}
              aria-label={`Aileron ${flight.aileronDeg} degrés`}
            />
            <path
              className={`aircraft-control-surface ${selected === "elevator" ? "is-selected" : ""}`}
              d="M600 218 L641 240 L652 247 L628 220 Z"
              transform={`rotate(${flight.elevatorDeg * 0.7} 626 229)`}
              data-deflection={flight.elevatorDeg}
              onClick={() => onSelect("elevator")}
              aria-label={`Profondeur ${flight.elevatorDeg} degrés`}
            />
            <path
              className={`aircraft-control-surface ${selected === "rudder" ? "is-selected" : ""}`}
              d="M650 176 L666 167 L678 170 L660 187 Z"
              transform={`rotate(${flight.rudderDeg * 0.8} 660 177)`}
              data-deflection={flight.rudderDeg}
              onClick={() => onSelect("rudder")}
              aria-label={`Dérive ${flight.rudderDeg} degrés`}
            />
            <path
              className={
                selected === "fuselage"
                  ? "aircraft-part is-selected"
                  : "aircraft-part"
              }
              onClick={() => onSelect("fuselage")}
              d="M182 209 C236 184 328 171 465 190 C516 197 579 208 620 216 C581 228 518 239 461 242 C337 247 247 234 182 218 Z"
              transform={`translate(380 211) scale(${fuselageScale} ${chordScale}) translate(-380 -211)`}
              fill="url(#fuselageGradient)"
            />
            <path
              className={
                selected === "payload"
                  ? "aircraft-part is-selected"
                  : "aircraft-part"
              }
              onClick={() => onSelect("payload")}
              d="M303 211 C313 195 345 190 372 198 L386 225 C361 233 330 229 308 222 Z"
              transform={`translate(345 211) scale(${payloadScale}) translate(-345 -211)`}
              fill="#173f50"
              stroke="#89d9d7"
              strokeWidth="2"
            />
            <path
              className="aircraft-window"
              d="M388 196 C408 193 429 195 448 199 L457 213 L420 211 Z"
            />
            <path
              className="aircraft-line"
              d="M184 218 C270 228 370 231 472 225"
            />
            <g
              transform={`translate(${propOffsetX} 0) translate(169 214) scale(${propScale}) translate(-169 -214)`}
              onClick={() => onSelect("propeller")}
              className={`aircraft-propeller ${selected === "propeller" ? "is-selected" : ""}`}
            >
              <circle
                cx="169"
                cy="214"
                r="23"
                fill="none"
                stroke="#8ee7e4"
                strokeWidth="3"
              />
              <path
                className="propeller-blade"
                d="M169 214 C132 182 127 165 140 160 C160 168 171 189 169 214 Z"
              />
              <path
                className="propeller-blade"
                d="M169 214 C205 245 210 263 195 268 C179 254 169 236 169 214 Z"
              />
            </g>
            {config.symmetric !== false && (
              <path className="symmetry-axis" d="M380 165 V260" />
            )}
            {config.installedMaterials?.map((module, index) => (
              <g
                key={module.id}
                className={`material-marker module-${module.geometry}`}
                transform={`translate(${155 + (index % 6) * 86 + (module.offsetX ?? 0) * 6} ${150 + Math.floor(index / 6) * 26 + (module.offsetY ?? 0) * 4}) scale(${clampPartScale(module.scale ?? 1)})`}
                onClick={() => onSelect(`module-${module.id}`)}
                role="button"
                tabIndex={0}
                aria-label={`${module.label} · ${installedPartMassKg(module).toFixed(2)} kg au bilan`}
              >
                <circle r="10" />
                <text y="3">{module.label.slice(0, 2).toUpperCase()}</text>
              </g>
            ))}
          </g>
          <g
            className="measurement-lines"
            style={{ display: showMeasurements ? undefined : "none" }}
          >
            <path d="M110 285 H650" />
            <path d="M110 277 V293 M650 277 V293" />
            <text x="350" y="310">
              ENVERGURE {formatNumber(config.wingspan, 2)} m
            </text>
            <path d="M98 175 V244" />
            <path d="M91 175 H105 M91 244 H105" />
            <text x="72" y="220" transform="rotate(-90 72 220)">
              CORDE
            </text>
          </g>
        </svg>
        <div className="canvas-axis axis-x">X</div>
        <div className="canvas-axis axis-y">Y</div>
        <div className="canvas-axis axis-z">Z</div>
      </div>
      <div className="canvas-footer">
        <span>
          <CircleDot size={12} /> Sélectionnez un composant
        </span>
        <span>
          {projection.toUpperCase()} · X {Math.round(rotationX)}° / Y{" "}
          {Math.round(rotationY)}°
        </span>
        <span>UNITÉS : SI · {formatNumber(config.batteryWh, 0)} Wh</span>
        <span>MAQUETTE SVG · CAO NON CERTIFIÉE</span>
      </div>
    </div>
  );
}
function ProjectSelector({
  project,
  projects,
  activeProjectId,
  onSelect,
  onCreate,
  onDelete,
}: {
  project: ProjectState;
  projects: ProjectRecord[];
  activeProjectId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="project-selector project-selector-rich">
      <div className="project-mark">
        <span>A</span>
      </div>
      <div className="project-selector-copy">
        <span className="project-selector-label">PROJET ACTIF</span>
        {projects.length ? (
          <select
            aria-label="Choisir un projet"
            value={activeProjectId}
            onChange={event => onSelect(event.target.value)}
          >
            {projects.map(item => (
              <option key={item.id} value={item.id}>
                {item.project.name}
              </option>
            ))}
          </select>
        ) : (
          <strong>Aucun projet utilisateur</strong>
        )}
        <small>
          {projects.length
            ? `${project.status} · ${projects.length} projet${projects.length > 1 ? "s" : ""}`
            : "Créez votre espace de travail"}
        </small>
      </div>
      <button
        className="ghost-icon-button"
        aria-label="Créer un nouveau projet"
        title="Nouveau projet"
        onClick={onCreate}
      >
        <Plus size={15} />
      </button>
      {projects.length > 0 && (
        <button
          className="ghost-icon-button"
          aria-label="Supprimer le projet actif"
          title="Supprimer le projet actif"
          onClick={onDelete}
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

function ActivityRow({
  icon,
  tone,
  title,
  meta,
}: {
  icon: ReactNode;
  tone: string;
  title: string;
  meta: string;
}) {
  return (
    <div className="activity-row">
      <span className={`activity-icon activity-${tone}`}>{icon}</span>
      <div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
    </div>
  );
}
function ActionCenter({ actions }: { actions: Record<string, ActionState> }) {
  const visible = Object.entries(actions).filter(
    ([, action]) => action.status !== "idle"
  );
  if (!visible.length) return null;
  return (
    <section
      className="action-center"
      aria-live="polite"
      aria-label="Centre de contrôle des actions"
    >
      <div className="action-center-heading">
        <span className="eyebrow">CENTRE DE CONTRÔLE</span>
        <span className="action-center-caption">
          Chaque opération est traçable et rejouable
        </span>
      </div>
      <div className="action-status-list">
        {visible.map(([id, action]) => (
          <div key={id} className={`action-status action-${action.status}`}>
            {action.status === "loading" ? (
              <RefreshCw size={14} className="spin" />
            ) : action.status === "success" ? (
              <CheckCircle2 size={14} />
            ) : (
              <AlertTriangle size={14} />
            )}
            <span>{action.message}</span>
            {action.status === "error" && action.retry && (
              <button className="text-button" onClick={action.retry}>
                Réessayer <RefreshCw size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function EngineeringConceptPreview({ config }: { config: ConceptConfig }) {
  const catalogDesign = findDroneProfile(config.platformProfile);
  if (catalogDesign) {
    const activeDesign = {
      ...catalogDesign,
      configuration: { ...catalogDesign.configuration, ...config },
    };
    return (
      <div className="engineering-concept-preview engineering-catalog-synchronized">
        <ParametricDronePreview design={activeDesign} />
        <div className="engineering-sync-label">
          RÉFÉRENCE SYNCHRONISÉE · {activeDesign.id.toUpperCase()} ·{" "}
          {activeDesign.family.toUpperCase()} ·{" "}
          {(activeDesign.modelType ?? "architecture").toUpperCase()}
        </div>
      </div>
    );
  }
  return <div className="engineering-concept-preview engineering-unselected" role="status"><Box size={28} /><strong>Aucun drone actif</strong><span>Sélectionnez un drone dans la Bibliothèque avant toute visualisation.</span></div>;
}

function IntegratedWorkflowPanel({
  projectId, project, config, requirements, onView, onRunCommitted,
}: {
  projectId: string; project: ProjectState; config: ConceptConfig; requirements: Requirement[];
  onView: (view: ViewId) => void; onRunCommitted: (run: WorkflowRun) => void;
}) {
  const [prototype, setPrototype] = useState<WorkflowPrototype | null>(null);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"register" | "run" | "report" | "replay" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasConfig = Boolean(config.airframe && config.wingspan > 0 && config.fuselageLength > 0);
  const register = async () => { setBusy("register"); setError(null); try { setPrototype(await registerPrototype({ projectId, name: config.designName ?? project.name, version: project.version, config, requirements, sketch: config.customSketch })); } catch (cause) { setError(cause instanceof Error ? cause.message : "Enregistrement impossible"); } finally { setBusy(null); } };
  const execute = async () => { if (!prototype) return; setBusy("run"); setError(null); try { const next = await executeWorkflowRun(prototype.id, demoScenario()); setRun(next); onRunCommitted(next); } catch (cause) { setError(cause instanceof Error ? cause.message : "Exécution impossible"); } finally { setBusy(null); } };
  const report = async () => { if (!run) return; setBusy("report"); setError(null); try { setReportId((await createWorkflowReport(run.id)).id); } catch (cause) { setError(cause instanceof Error ? cause.message : "Rapport impossible"); } finally { setBusy(null); } };
  const replay = async () => { if (!run) return; setBusy("replay"); setError(null); try { const next = await replayWorkflowRun(run.id); setRun(next); onRunCommitted(next); } catch (cause) { setError(cause instanceof Error ? cause.message : "Rejeu impossible"); } finally { setBusy(null); } };
  return <section className="unified-workflow-console" aria-label="Workflow intégré versionné"><div className="unified-workflow-title"><div><p className="eyebrow">CONTRAT WORKFLOW / PROTOTYPE IMMUTABLE</p><h3>Transfert vérifiable entre les trois modules</h3><p>Unités SI, hash d’entrée, version immuable et run rejouable.</p></div><span className="unified-workflow-state">N2 · SANS SORTIE MATÉRIELLE</span></div><div className="unified-workflow-stages"><span className={hasConfig ? "is-done" : "is-current"}>01 Atelier <small>{hasConfig ? "configuration valide" : "configuration requise"}</small></span><ArrowRight size={14} /><span className={prototype ? "is-done" : "is-current"}>02 Version <small>{prototype ? `${prototype.version} · ${prototype.input_sha256.slice(0, 10)}…` : "non enregistrée"}</small></span><ArrowRight size={14} /><span className={run ? "is-done" : "is-current"}>03 Simulation / Hall <small>{run ? `${run.status} · ${run.id.slice(0, 8)}` : "aucun run"}</small></span><ArrowRight size={14} /><span className={reportId ? "is-done" : "is-current"}>04 Rapport <small>{reportId ?? "non généré"}</small></span></div><div className="unified-workflow-actions"><button className="secondary-button" type="button" disabled={!hasConfig || busy !== null || Boolean(prototype)} onClick={() => void register()}>{busy === "register" ? "Enregistrement…" : prototype ? "Version enregistrée" : "Enregistrer la version"}</button><button className="primary-button" type="button" disabled={!prototype || busy !== null || Boolean(run)} onClick={() => void execute()}>{busy === "run" ? "Exécution…" : "Transférer et exécuter"}</button><button className="secondary-button" type="button" disabled={!run || busy !== null} onClick={() => onView("live")}>Ouvrir le hall</button><button className="secondary-button" type="button" disabled={!run || busy !== null || Boolean(reportId)} onClick={() => void report()}>{busy === "report" ? "Génération…" : "Enregistrer le rapport"}</button><button className="secondary-button" type="button" disabled={!run || busy !== null} onClick={() => void replay()}>Rejouer</button>{run && <button className="secondary-button" type="button" onClick={() => onView("design-studio")}>Retour atelier</button>}</div><div className="unified-workflow-evidence"><span>Preuve : {run?.result?.evidence_level ?? "non exécuté"}</span><span>Moteur : {run?.engine_version ?? "—"}</span><span>Run : {run?.id ?? "—"}</span></div>{error && <div className="unified-workflow-error" role="alert"><AlertTriangle size={14} /> {error} <small>Connexion OIDC et projet distant requis pour la persistance serveur.</small></div>}</section>;
}
function UnifiedEngineeringFlow({
  project,
  config,
  simulation,
  runId,
  onView,
  onCreateProject,
}: {
  project: ProjectState;
  config: ConceptConfig;
  simulation: SimulationResult;
  runId: string;
  onView: (view: ViewId) => void;
  onCreateProject: () => void;
}) {
  const hasPrototype = Boolean(config.airframe && config.platformProfile);
  const hasSimulation = runId !== "SIM-000" && Boolean(config.airframe);
  const hasTest = hasSimulation;
  const steps = [
    {
      id: "concept" as const,
      index: "01",
      label: "Atelier",
      detail: hasPrototype ? `${config.designName ?? "Prototype actif"} · ${project.version}` : "Créer ou sélectionner un prototype",
      state: hasPrototype ? "done" : "current",
      action: "Ouvrir l’atelier",
    },
    {
      id: "simulation" as const,
      index: "02",
      label: "Simulation",
      detail: hasSimulation ? `${simulation.runId} · modèle local calculé` : "Transférer la configuration vers le Centre",
      state: hasSimulation ? "done" : hasPrototype ? "current" : "locked",
      action: hasSimulation ? "Revoir le run" : "Configurer le scénario",
    },
    {
      id: "live" as const,
      index: "03",
      label: "Hall d’essais",
      detail: hasTest ? "Scénario reproductible · télémétrie synthétique" : "Attente d’un run de simulation",
      state: hasTest ? "done" : hasSimulation ? "current" : "locked",
      action: "Ouvrir le hall",
    },
    {
      id: "report" as const,
      index: "04",
      label: "Rapport & itération",
      detail: hasSimulation ? "Comparer, documenter, revenir à l’atelier" : "Disponible après analyse",
      state: hasSimulation ? "current" : "locked",
      action: "Ouvrir le dossier",
    },
  ];

  return (
    <section className="unified-engineering-flow" aria-label="Cycle de développement AeroMind">
      <div className="unified-flow-heading">
        <div>
          <p className="eyebrow">PLATEFORME UNIFIÉE / CYCLE DE DÉVELOPPEMENT</p>
          <h2>De l’atelier au vol simulé</h2>
          <p>Une même identité de prototype circule entre conception, calcul, essais et revue. Les données restent locales, synthétiques et sans sortie matérielle.</p>
        </div>
        {!hasPrototype && <button className="secondary-button" onClick={onCreateProject}>Créer le prototype de démonstration</button>}
      </div>
      <div className="unified-flow-meta">
        <span><b>PROTOTYPE</b> {hasPrototype ? (config.designName ?? config.platformProfile) : "NON AFFECTÉ"}</span>
        <span><b>IDENTITÉ</b> {hasPrototype ? config.platformProfile : "—"}</span>
        <span><b>VERSION</b> {project.version}</span>
        <span><b>RUN</b> {runId}</span>
      </div>
      <div className="unified-flow-steps">
        {steps.map((step, index) => (
          <div className={`unified-flow-step is-${step.state}`} key={step.id}>
            <button type="button" onClick={() => step.state !== "locked" && onView(step.id)} aria-label={`${step.action} : ${step.label}`}>
              <span className="unified-flow-index">{step.index}</span>
              <span className="unified-flow-copy"><strong>{step.label}</strong><small>{step.detail}</small></span>
              <ArrowRight size={15} />
            </button>
            {index < steps.length - 1 && <span className="unified-flow-connector" aria-hidden="true" />}
          </div>
        ))}
      </div>
      <div className="unified-flow-note"><span className="unified-flow-dot" /> N2 / SIMULATION UNIQUEMENT <span>·</span> Transfert logique actif <span>·</span> Aucune commande réelle</div>
    </section>
  );
}

function Overview({
  project,
  simulation,
  onView,
  onCreateProject,
  hasProject,
  onRunSimulation,
  isRunning,
  config,
  requirements,
  runId,
  projectId,
  onRunCommitted,
}: {
  project: ProjectState;
  simulation: SimulationResult;
  onView: (view: ViewId) => void;
  onCreateProject: () => void;
  hasProject: boolean;
  onRunSimulation: () => void;
  isRunning: boolean;
  config: ConceptConfig;
  requirements: Requirement[];
  runId: string;
  projectId: string;
  workflowRun: WorkflowRun | null;
  onRunCommitted: (run: WorkflowRun) => void;
}) {
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>(
    {}
  );
  const configured = Boolean(config.airframe);
  const selectedLibraryBase = config.platformProfile
    ? findDroneProfile(config.platformProfile)
    : undefined;
  // L’identité choisie dans la bibliothèque est la source canonique de la
  // morphologie affichée dans tous les postes. Les paramètres du projet ne
  // sont que des overrides de configuration, jamais une nouvelle cellule.
  const selectedLibraryProfile = selectedLibraryBase
    ? {
        ...selectedLibraryBase,
        configuration: { ...selectedLibraryBase.configuration, ...config },
      }
    : undefined;
  const overviewLiveParams = useMemo(
    () => ({
      cruiseSpeedKmh: config.cruiseSpeedKmh,
      designAltitudeM: config.altitudeM,
      batteryWh: config.batteryWh,
      payloadKg: config.payloadKg,
      motorCount: config.motorCount ?? 4,
      reserveFraction: config.reserveFraction,
    }),
    [
      config.cruiseSpeedKmh,
      config.altitudeM,
      config.batteryWh,
      config.payloadKg,
      config.motorCount,
      config.reserveFraction,
    ]
  );
  const [overviewFlight, setOverviewFlight] = useState<LiveFlightState>(() =>
    createLiveFlightState(overviewLiveParams)
  );
  useEffect(() => {
    setOverviewFlight(current =>
      setLiveArmed(current, Boolean(configured), overviewLiveParams)
    );
  }, [configured, overviewLiveParams]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setOverviewFlight(current =>
        advanceLiveFlight(current, 0.25, overviewLiveParams)
      );
    }, 250);
    return () => window.clearInterval(timer);
  }, [overviewLiveParams]);
  const overviewAltitude = liveSeries(overviewFlight.samples, "altitudeM");
  const overviewEnergy = liveSeries(overviewFlight.samples, "batteryPct");
  const overviewPower = liveSeries(overviewFlight.samples, "powerW");
  const checklistItems = selectedLibraryProfile
    ? [
        {
          id: "library-profile",
          label: `Profil ${selectedLibraryProfile.label} chargé depuis la bibliothèque`,
          detail: `${selectedLibraryProfile.family} · ${selectedLibraryProfile.modelType ?? "architecture cataloguée"}`,
          automatic: true,
        },
        {
          id: "airframe",
          label: "Cellule et géométrie reprises",
          detail: `${formatNumber(config.wingspan ?? 0, 2)} m d’envergure · ${formatNumber(config.fuselageLength ?? 0, 2)} m de longueur`,
          automatic: Boolean(config.wingspan && config.fuselageLength),
        },
        {
          id: "propulsion",
          label: "Propulsion cohérente avec l’architecture",
          detail: `${config.motorCount ?? 0} moteur(s) · ${selectedLibraryProfile.modelType ?? "type non renseigné"}`,
          automatic: Boolean(config.motorCount),
        },
        {
          id: "energy",
          label: "Réserve énergétique renseignée",
          detail: `${formatNumber(config.batteryWh ?? 0, 0)} Wh · réserve ${formatNumber((config.reserveFraction ?? 0) * 100, 0)} %`,
          automatic: Boolean(config.batteryWh),
        },
        {
          id: "payload",
          label: "Charge utile compatible avec la mission",
          detail: `${formatNumber(config.payloadKg ?? 0, 2)} kg · ${selectedLibraryProfile.mission}`,
          automatic: Boolean(config.payloadKg),
        },
      ]
    : [];
  const checklistCompleted = checklistItems.filter(
    item => item.automatic || checklistState[item.id]
  ).length;
  const visibleRequirements = requirements.filter(
    requirement => requirement.visible !== false
  );
  const satisfiedRequirements = visibleRequirements.filter(
    requirement => requirement.status === "ok"
  ).length;
  const unresolvedRequirements = visibleRequirements.filter(
    requirement => requirement.status !== "ok"
  ).length;
  const requirementProgress = visibleRequirements.length
    ? Math.round((satisfiedRequirements / visibleRequirements.length) * 100)
    : 0;
  const riskCount = configured
    ? simulation.risks.filter(risk => risk.status === "open").length
    : 0;
  const energyProgress = Math.round(
    Math.max(0, Math.min(100, (simulation.enduranceH / 2.5) * 100))
  );
  const baseline = selectedLibraryProfile ? `BL-${selectedLibraryProfile.id.toUpperCase()} / REV-A` : "NO BASELINE";
  const openRisk = simulation.risks.find(risk => risk.status === "open");
  const evidenceState = configured && selectedLibraryProfile ? "TRACEABLE" : "INCOMPLETE";
  return (
    <div className="operations-readiness-center engineering-overview">
      <header className="eng-topbar"><div className="eng-wordmark"><span className="eng-led" /> AEROMIND <b>OPERATIONS D’INGÉNIERIE</b></div><div className="eng-topbar-meta"><span>PROGRAMME / ORC-01</span><span>ENV. / DONNÉES LOCALES</span><span className="eng-authority"><ShieldCheck size={12} /> AUTORITÉ HUMAINE</span></div></header>
      <section className="eng-title-row"><div><p className="eyebrow">INGÉNIERIE SYSTÈME · SUIVI DE CONFIGURATION</p><h1>Contrôle de configuration</h1><p>Baseline d’ingénierie, posture de qualification et gates de décision pour la cellule active.</p></div><div className="eng-title-actions"><span className={`eng-posture ${configured ? "is-ready" : "is-blocked"}`}><i /> {configured ? "REVUE PRÉLIMINAIRE" : "CONFIGURATION REQUISE"}</span><button className="secondary-button" onClick={() => onView("report")}><FileBarChart size={14} /> Dossier de revue</button><button className="primary-button" onClick={onRunSimulation} disabled={isRunning || !configured}>{isRunning ? <RefreshCw size={14} className="spin" /> : <Play size={14} />} {isRunning ? "Calcul en cours" : "Lancer l’analyse"}</button></div></section>
      <IntegratedWorkflowPanel projectId={projectId} project={project} config={config} requirements={requirements} onView={onView} onRunCommitted={onRunCommitted} />
      <UnifiedEngineeringFlow project={project} config={config} simulation={simulation} runId={runId} onView={onView} onCreateProject={onCreateProject} />
      <section className="eng-baseline-bar"><div><small>ÉLÉMENT DE CONFIGURATION</small><strong>{selectedLibraryProfile?.label ?? "CELLULE NON AFFECTÉE"}</strong></div><div><small>BASELINE</small><b>{baseline}</b></div><div><small>ÉTAT DU MODÈLE</small><b className={configured ? "eng-good" : "eng-warn"}>{configured ? "CALCULABLE" : "VERROUILLÉ"}</b></div><div><small>PROVENANCE DES DONNÉES</small><b className={evidenceState === "TRACEABLE" ? "eng-good" : "eng-warn"}>{evidenceState === "TRACEABLE" ? "TRAÇABLE" : "INCOMPLÈTE"}</b></div><div><small>DERNIÈRE ANALYSE</small><b>{configured ? "LOCAL / LIVE" : "—"}</b></div></section>
      <div className="eng-main-grid">
        <aside className="eng-rail"><section className="eng-panel"><div className="eng-panel-title"><span>CONTRÔLE PROGRAMME</span><b>01</b></div><dl className="eng-data-list"><div><dt>Projet</dt><dd>{hasProject ? project.name : "Non défini"}</dd></div><div><dt>Intention de mission</dt><dd>{selectedLibraryProfile?.mission ?? "Saisie opérateur attendue"}</dd></div><div><dt>Responsable configuration</dt><dd>Autorité d’ingénierie humaine</dd></div><div><dt>État de revue</dt><dd className={configured ? "eng-good" : "eng-warn"}>{configured ? "Prêt pour revue préliminaire" : "Sélection requise"}</dd></div></dl><button className="eng-text-action" onClick={() => onView(hasProject ? "requirements" : "catalog")}>{hasProject ? "Ouvrir les exigences" : "Sélectionner une configuration"} <ArrowRight size={13} /></button></section><section className="eng-panel"><div className="eng-panel-title"><span>GATES DE REVUE TECHNIQUE</span><b>02</b></div><div className="eng-review-list"><div className={hasProject ? "is-pass" : "is-open"}><span>BRF</span><b>Brief mission</b><em>{hasProject ? "PASS" : "OPEN"}</em></div><div className={selectedLibraryProfile ? "is-pass" : "is-open"}><span>CFG</span><b>Baseline cellule</b><em>{selectedLibraryProfile ? "PASS" : "OPEN"}</em></div><div className={visibleRequirements.length ? "is-review" : "is-open"}><span>REQ</span><b>Exigences</b><em>{visibleRequirements.length ? `${requirementProgress}%` : "OPEN"}</em></div><div className={configured ? "is-review" : "is-open"}><span>SIM</span><b>Analyse</b><em>{configured ? "REVIEW" : "VERROUILLÉ"}</em></div><div className="is-open"><span>HUM</span><b>Disposition humaine</b><em>REQUIRED</em></div></div></section></aside>
        <main className="eng-center"><section className="eng-panel eng-airframe-panel"><div className="eng-panel-title"><span>ACTIVE ÉLÉMENT DE CONFIGURATION / AIRFRAME</span><b>{selectedLibraryProfile?.id?.toUpperCase() ?? "—"}</b></div>{selectedLibraryProfile ? <div className="eng-airframe-body"><div className="eng-airframe-visual"><ParametricDronePreview design={selectedLibraryProfile} /><span>VISUEL CANONIQUE BIBLIOTHÈQUE · LECTURE SEULE</span></div><div className="eng-airframe-specs"><div><small>FAMILLE</small><strong>{selectedLibraryProfile.family}</strong></div><div><small>TYPE DE MODÈLE</small><strong>{selectedLibraryProfile.modelType ?? "—"}</strong></div><div><small>ENVERGURE</small><strong>{formatNumber(config.wingspan ?? 0, 2)} m</strong></div><div><small>MASSE / CHARGE UTILE</small><strong>{formatNumber(simulation.totalMassKg)} kg / {formatNumber(config.payloadKg ?? 0, 2)} kg</strong></div><div><small>PROPULSION</small><strong>{config.motorCount ?? 0} motor(s)</strong></div><div><small>ÉNERGIE</small><strong>{formatNumber(config.batteryWh ?? 0, 0)} Wh</strong></div></div></div> : <div className="eng-empty-state"><Box size={22} /><b>Aucune configuration contrôlée chargée</b><span>Sélectionnez une cellule dans la bibliothèque pour établir la baseline de configuration.</span></div>}<button className="eng-text-action" onClick={() => onView("catalog")}>Ouvrir la bibliothèque de configurations <ArrowRight size={13} /></button></section><section className="eng-panel eng-stream-panel"><div className="eng-panel-title"><span>FLUX DE DONNÉES D’INGÉNIERIE / SORTIE MODÈLE</span><b>{configured ? "4 Hz · LECTURE SEULE" : "VERROUILLÉ"}</b></div><EngineeringStreamArchitecture configured={configured} flight={overviewFlight} altitude={overviewAltitude} energy={overviewEnergy} power={overviewPower} phase={configured ? describeLivePhase(overviewFlight) : "AUCUNE CONFIGURATION ACTIVE"} mass={`${formatNumber(simulation.totalMassKg)} kg`} endurance={`${formatNumber(simulation.enduranceH)} h`} wind={`${formatNumber(simulation.windMarginPercent, 0)}%`} /></section></main>
        <aside className="eng-rail"><section className="eng-panel eng-disposition"><div className="eng-panel-title"><span>DISPOSITION D’INGÉNIERIE</span><b>03</b></div><div className="eng-disposition-status"><small>DISPOSITION RECOMMANDÉE</small><strong className={configured ? "eng-warn" : "eng-muted"}>{configured ? "PASSAGE EN REVUE HUMAINE" : "HOLD"}</strong><span>{configured ? "Model outputs are preliminary and require evidence review before acceptance." : "Aucune décision ne peut être préparée sans configuration active."}</span></div><div className="eng-decision-metrics"><div><small>READINESS</small><strong>{configured ? "82%" : "—"}</strong></div><div><small>RISQUES OUVERTS</small><strong className={riskCount ? "eng-warn" : "eng-good"}>{configured ? String(riskCount).padStart(2, "0") : "—"}</strong></div><div><small>EXIG. OUVERTES</small><strong>{unresolvedRequirements}</strong></div></div><button className="eng-text-action" onClick={() => onView("simulation")}>Ouvrir les détails d’analyse <ArrowRight size={13} /></button></section><section className="eng-panel"><div className="eng-panel-title"><span>POINT OUVERT PRIORITAIRE</span><b>04</b></div>{openRisk ? <div className="eng-open-item"><span className={`orc-severity severity-${openRisk.severity}`} /><b>{openRisk.label}</b><small>{openRisk.probability} · {openRisk.status.toUpperCase()}</small></div> : <div className="eng-no-item"><CheckCircle2 size={15} /> Aucun risque ouvert dans le calcul courant</div>}<div className="eng-control-note"><Info size={13} /> Aucune commande d’actionneur, transmission de mission ou approbation autonome n’est disponible ici.</div></section></aside>
      </div>
      <section className="eng-panel eng-ledger"><div className="eng-panel-title"><span>SUIVI DE CONFIGURATION / REGISTRE DE REVUE</span><b>ENREGISTREMENT CONTRÔLÉ</b></div><div className="eng-ledger-head"><span>ÉLÉMENT</span><span>BASELINE / SOURCE</span><span>PREUVE</span><span>ÉTAT</span><span>RESPONSABLE</span></div><div className="eng-ledger-row"><b>Identité cellule</b><span>{selectedLibraryProfile?.id ?? "—"}</span><span>Profil bibliothèque</span><em className={selectedLibraryProfile ? "eng-good" : "eng-warn"}>{selectedLibraryProfile ? "SYNCED" : "OPEN"}</em><small>Configuration</small></div><div className="eng-ledger-row"><b>Géométrie & propulsion</b><span>{config.motorCount ?? 0} motors · {formatNumber(config.wingspan ?? 0, 2)} m</span><span>Modèle paramétrique</span><em className={configured ? "eng-good" : "eng-warn"}>{configured ? "CALCULABLE" : "VERROUILLÉ"}</em><small>Engineering</small></div><div className="eng-ledger-row"><b>Exigences</b><span>{visibleRequirements.length} visible / {satisfiedRequirements} satisfied</span><span>Exigences register</span><em className={visibleRequirements.length && unresolvedRequirements === 0 ? "eng-good" : "eng-warn"}>{visibleRequirements.length ? `${requirementProgress}%` : "OPEN"}</em><small>Systèmes</small></div><div className="eng-ledger-row"><b>Preuve de simulation</b><span>{overviewFlight.samples.length} frames · local model</span><span>Plan de données ingénierie</span><em className={configured ? "eng-warn" : "eng-muted"}>{configured ? "PRÉLIMINAIRE" : "N/A"}</em><small>Analyse</small></div></section>
      <footer className="eng-footer"><span><ShieldCheck size={12} /> REVUE HUMAINE REQUISE</span><span>CONTROLLED CONFIGURATION · PRÉLIMINAIRE DATA · NOT CERTIFIED</span><span>AEROMIND / ORC-01</span></footer>
    </div>
  );
}
function RequirementsView({
  requirements,
  missionTemplates,
  onApplyMissionTemplate,
  onChange,
  onView,
  onAddRequirement,
  onDeleteRequirement,
  onToggleRequirement,
}: {
  requirements: Requirement[];
  missionTemplates: MissionRequirementTemplate[];
  onApplyMissionTemplate: (
    templateId: string,
    mode: "append" | "replace"
  ) => void;
  onChange: (
    id: string,
    field: keyof Requirement,
    value: string | number
  ) => void;
  onView: (view: ViewId) => void;
  onAddRequirement: () => void;
  onDeleteRequirement: (id: string) => void;
  onToggleRequirement: (
    id: string,
    field: "visible" | "pinned" | "approved"
  ) => void;
}) {
  const [showHidden, setShowHidden] = useState(false);
  const [profileSearch, setProfileSearch] = useState("");
  const [profileClass, setProfileClass] = useState<MissionRequirementTemplate["classification"] | "all">("all");
  const [profileCoverage, setProfileCoverage] = useState<"all" | "active" | "pending" | "empty">("all");
  const visibleRequirements = requirements.filter(
    item => showHidden || item.visible !== false
  );
  const hiddenCount =
    requirements.length -
    requirements.filter(item => item.visible !== false).length;
  const requirementStats = {
    total: visibleRequirements.length,
    ok: visibleRequirements.filter(item => item.status === "ok").length,
    review: visibleRequirements.filter(item => item.status === "review" || item.status === "hypothesis").length,
    conflict: visibleRequirements.filter(item => item.status === "conflict").length,
    approved: visibleRequirements.filter(item => item.approved).length,
    sourced: visibleRequirements.filter(item => Boolean(item.source?.trim())).length,
  };
  const requirementCoverage = requirementStats.total
    ? Math.round((requirementStats.ok / requirementStats.total) * 100)
    : 0;
  const normalizeProfileSearch = (value: string) =>
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim();
  const normalizedProfileSearch = normalizeProfileSearch(profileSearch);
  const filteredMissionProfiles = missionTemplates.filter(profile => {
    if (profileClass !== "all" && profile.classification !== profileClass) return false;
    const rows = visibleRequirements.filter(item => item.missionProfileId === profile.id);
    if (profileCoverage === "active" && rows.length === 0) return false;
    if (profileCoverage === "empty" && rows.length > 0) return false;
    if (profileCoverage === "pending" && !rows.some(item => item.status === "review" || item.status === "hypothesis" || item.status === "conflict")) return false;
    if (!normalizedProfileSearch) return true;
    const searchable = [
      profile.id, profile.label, profile.mission, profile.marketPosition, profile.summary,
      ...profile.requirements.flatMap(item => [item.label, item.target, item.source, item.verification]),
    ].join(" ");
    return normalizeProfileSearch(searchable).includes(normalizedProfileSearch);
  });
  return (
    <div className="view-stack">
      <SectionHeading
        eyebrow="01 / SPÉCIFICATIONS"
        title="Centre de maîtrise des exigences"
        description="Chaque exigence possède une valeur, une source et un cycle de validation contrôlables par l’équipe d’ingénierie."
        action={
          <button className="secondary-button" onClick={onAddRequirement}>
            <Plus size={15} /> Nouvelle exigence
          </button>
        }
      />
      <section className="requirements-command-panel" aria-label="Synthèse de maîtrise des exigences">
        <div className="requirements-command-heading">
          <div><p className="eyebrow">ENGINEERING CONTROL / CONFIGURATION BASELINE</p><h3>Registre de conformité contrôlé</h3><span>Référentiel local · revue humaine obligatoire · aucune approbation automatique</span></div>
          <div className={`requirements-command-state ${requirementStats.conflict ? "is-alert" : requirementStats.review ? "is-review" : "is-ready"}`}><i />{requirementStats.conflict ? "ACTION REQUISE" : requirementStats.review ? "REVUE EN COURS" : "BASELINE STABLE"}</div>
        </div>
        <div className="requirements-command-kpis">
          <div><small>COUVERTURE</small><strong>{requirementCoverage}<em>%</em></strong><span>{requirementStats.ok}/{requirementStats.total} satisfaites</span></div>
          <div><small>REVUE OU HYPOTHÈSE</small><strong>{String(requirementStats.review).padStart(2, "0")}</strong><span>preuve ou décision attendue</span></div>
          <div><small>CONFLITS</small><strong className={requirementStats.conflict ? "is-alert" : ""}>{String(requirementStats.conflict).padStart(2, "0")}</strong><span>{requirementStats.conflict ? "blocage à traiter" : "aucun conflit détecté"}</span></div>
          <div><small>TRAÇABILITÉ</small><strong>{requirementStats.sourced}/{requirementStats.total}</strong><span>{requirementStats.approved} approuvée(s) · source liée</span></div>
        </div>
        <div className="requirements-control-rail"><span><b>01</b> INTENTION</span><i /><span><b>02</b> CRITÈRE</span><i /><span><b>03</b> PREUVE</span><i /><span><b>04</b> REVUE</span><i /><span><b>05</b> DÉCISION HUMAINE</span></div>
      </section>
      <section className="requirements-dashboard panel" aria-label="Tableau de conformité des profils de mission">
        <div className="requirements-dashboard-header">
          <div><p className="eyebrow">DÉCISION / CONFORMITÉ</p><h3>Profils de mission</h3></div>
          <span>{filteredMissionProfiles.length}/{missionTemplates.length} profils affichés · {requirements.filter(item => item.status === "ok").length}/{requirements.length} satisfaites</span>
        </div>
        <div className="mission-profile-search" role="search" aria-label="Recherche avancée des profils de mission">
          <label className="mission-profile-search-field">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Rechercher dans les profils, missions et critères</span>
            <input value={profileSearch} onChange={event => setProfileSearch(event.target.value)} placeholder="Rechercher un profil, une mission, un critère, une source…" />
            {profileSearch && <button type="button" className="mission-profile-clear" onClick={() => setProfileSearch("")} aria-label="Effacer la recherche"><X size={14} /></button>}
          </label>
          <label className="mission-profile-filter"><SlidersHorizontal size={14} aria-hidden="true" /><span className="sr-only">Famille de profils</span>
            <select value={profileClass} onChange={event => setProfileClass(event.target.value as typeof profileClass)} aria-label="Filtrer par famille">
              <option value="all">Toutes les familles</option>
              <option value="market-current">Références marché</option>
              <option value="specialized">Profils spécialisés</option>
              <option value="emerging-gap">Pistes exploratoires</option>
            </select>
          </label>
          <label className="mission-profile-filter"><span className="sr-only">État de conformité</span>
            <select value={profileCoverage} onChange={event => setProfileCoverage(event.target.value as typeof profileCoverage)} aria-label="Filtrer par état de conformité">
              <option value="all">Tous les états</option>
              <option value="active">Avec critères appliqués</option>
              <option value="pending">À vérifier ou en conflit</option>
              <option value="empty">Sans critères appliqués</option>
            </select>
          </label>
          <small aria-live="polite">{filteredMissionProfiles.length}/{missionTemplates.length} profils affichés</small>
        </div>
        <div className="requirements-profile-grid">
          {filteredMissionProfiles.map(profile => {
            const rows = visibleRequirements.filter(item => item.missionProfileId === profile.id);
            const ok = rows.filter(item => item.status === "ok").length;
            const review = rows.filter(item => item.status === "review" || item.status === "hypothesis").length;
            const conflict = rows.filter(item => item.status === "conflict").length;
            const score = rows.length ? Math.round((ok / rows.length) * 100) : null;
            const classLabel = profile.classification === "market-current" ? "RÉFÉRENCE MARCHÉ" : profile.classification === "specialized" ? "SPÉCIALISÉ" : "PISTE EXPLORATOIRE";
            return <article className={`requirements-profile-card ${profile.classification}`} key={profile.id}>
              <div className="requirements-profile-card-top"><span>{classLabel}</span><b>{profile.id}</b></div>
              <h4>{profile.label}</h4>
              <p>{profile.mission}</p>
              {score === null ? <div className="requirements-profile-empty"><span>Aucun critère de ce profil n’est actuellement appliqué.</span><small>{profile.requirements.length} critère(s) disponibles dans son socle</small></div> : <>
                <div className="requirements-profile-summary"><strong>{score}<em>%</em></strong><span>{rows.length} critère(s) actif(s)<small>{ok} satisfaits · {review} à vérifier · {conflict} conflit(s)</small></span></div>
                <div className="requirements-dashboard-track" role="img" aria-label={`${ok} critères satisfaits, ${review} à vérifier, ${conflict} conflits`}><i className="req-ok" style={{ width: `${score}%` }} /><i className="req-review" style={{ width: `${Math.round((review / rows.length) * 100)}%` }} /><i className="req-conflict" style={{ width: `${Math.round((conflict / rows.length) * 100)}%` }} /></div>
              </>}
            </article>;
          })}
          {filteredMissionProfiles.length === 0 && <p className="mission-profile-no-results" role="status">Aucun profil ne correspond à ces filtres. Modifiez la recherche ou choisissez « Tous les états ».</p>}
        </div>
        <div className="requirements-profile-legend"><span><i className="req-ok"/> Satisfaite</span><span><i className="req-review"/> Revue / hypothèse</span><span><i className="req-conflict"/> Conflit</span><small>Les profils sans critères appliqués restent visibles; leur socle n’est pas présenté comme une conformité évaluée.</small></div>
      </section>
      <EngineeringGuide
        eyebrow="CONSOLE INGÉNIEUR / EXIGENCES"
        title="Transformer une intention en critère vérifiable"
        description="Utilisez ces repères pour rédiger vos propres critères. Ils ouvrent le bon espace de travail, mais n’inscrivent aucune valeur dans le projet."
        suggestions={[
          "Définir la mission et son périmètre",
          "Fixer une preuve attendue par exigence",
          "Relier chaque cible à une source",
        ]}
        onApply={() => onView("concept")}
      />
      <section
        className="mission-template-library"
        aria-labelledby="mission-template-heading"
      >
        <div className="mission-template-library-header">
          <div>
            <p className="eyebrow">BIBLIOTHÈQUE / EXIGENCES SOURCÉES</p>
            <h3 id="mission-template-heading">
              Profils de mission prêts à adapter
            </h3>
          </div>
          <span>{missionTemplates.length} profils</span>
        </div>
        <p className="mission-template-library-note">
          Les nouveaux projets démarrent avec un socle multisectoriel :
          benchmarks de marché et plusieurs hypothèses émergentes à éprouver.
          Spécialiser la mission et arbitrer ces hypothèses avant validation.
          Les profils « marché » reprennent des capacités publiées; les profils
          « émergents » ne prétendent pas qu’aucun produit ne les couvre. Les
          valeurs restent modifiables et ne valent ni certification ni règle
          universelle.
        </p>
        {(["market-current", "specialized", "emerging-gap"] as const).map(
          classification => {
            const entries = missionTemplates.filter(
              template => template.classification === classification
            );
            if (!entries.length) return null;
            const heading =
              classification === "market-current"
                ? "Missions courantes sur le marché"
                : classification === "specialized"
                  ? "Offres spécialisées / émergentes"
                  : "Opportunités d’ingénierie peu standardisées";
            return (
              <div
                className={`mission-template-group mission-group-${classification}`}
                key={classification}
              >
                <h4>{heading}</h4>
                <div className="mission-template-grid">
                  {entries.map(template => (
                    <article
                      className="mission-template-card"
                      key={template.id}
                    >
                      <div className="mission-template-card-heading">
                        <strong>{template.label}</strong>
                        <span>{template.marketPosition}</span>
                      </div>
                      <p>{template.summary}</p>
                      <small>
                        {template.requirements.length} critères ·{" "}
                        {template.evidence.length} sources
                      </small>
                      <div className="mission-template-evidence">
                        {template.evidence.slice(0, 3).map(source => (
                          <a
                            key={source.url}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            title={source.claim}
                          >
                            {source.title} <ArrowUpRight size={10} />
                          </a>
                        ))}
                      </div>
                      <div className="mission-template-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            onApplyMissionTemplate(template.id, "append")
                          }
                        >
                          <Plus size={13} /> Ajouter
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            onApplyMissionTemplate(template.id, "replace")
                          }
                        >
                          Remplacer la liste
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            );
          }
        )}
      </section>
      <div className="callout callout-cyan">
        <Sparkles size={17} />
        <div>
          <strong>Workflow d’exigence actif</strong>
          <p>
            Personnalisez les champs, épinglez les critères critiques et
            approuvez uniquement les exigences revues.
          </p>
        </div>
        <button className="text-button" onClick={() => onView("copilot")}>
          Examiner <ArrowRight size={14} />
        </button>
      </div>
      <div className="table-panel">
        <div className="table-toolbar requirement-toolbar">
          <div className="toolbar-filter">
            <span className="filter-dot active" /> {requirements.length}{" "}
            exigences
          </div>
          <div className="toolbar-filter">
            <span className="filter-dot green" />{" "}
            {requirements.filter(item => item.approved).length} approuvées
          </div>
          <button
            className="text-button"
            onClick={() => setShowHidden(value => !value)}
          >
            <Eye size={14} />{" "}
            {showHidden
              ? "Masquer les exigences cachées"
              : `Afficher les exigences cachées${hiddenCount ? ` (${hiddenCount})` : ""}`}
          </button>
        </div>
        <div className="requirements-table">
          <div className="table-row table-head">
            <span>Exigence</span>
            <span>Valeur / unité</span>
            <span>Cible</span>
            <span>Statut</span>
            <span>Source</span>
            <span>Actions</span>
          </div>
          {visibleRequirements.map(requirement => (
            <div
              className={`table-row requirement-edit-row ${requirement.pinned ? "is-pinned" : ""} ${requirement.visible === false ? "is-hidden" : ""}`}
              key={requirement.id}
            >
              <div className="requirement-name">
                <span
                  className={`requirement-marker marker-${requirement.status}`}
                />
                <div>
                  <input
                    aria-label={`Libellé ${requirement.label}`}
                    value={requirement.label}
                    onChange={event =>
                      onChange(requirement.id, "label", event.target.value)
                    }
                  />
                  <span>
                    ID / REQ-{requirement.id.toUpperCase()}
                    {requirement.sourceClass &&
                      ` · ${requirement.sourceClass === "market-current" ? "MARCHÉ" : requirement.sourceClass === "specialized" ? "SPÉCIALISÉ" : requirement.sourceClass === "emerging-gap" ? "ÉMERGENT" : "HYPOTHÈSE"}`}
                  </span>
                </div>
              </div>
              <div className="editable-value requirement-value-fields">
                <input
                  aria-label={`Valeur ${requirement.label}`}
                  type={
                    typeof requirement.value === "number" ? "number" : "text"
                  }
                  value={String(requirement.value)}
                  onChange={event =>
                    onChange(
                      requirement.id,
                      "value",
                      typeof requirement.value === "number"
                        ? Number(event.target.value)
                        : event.target.value
                    )
                  }
                />
                <input
                  aria-label={`Unité ${requirement.label}`}
                  value={requirement.unit}
                  onChange={event =>
                    onChange(requirement.id, "unit", event.target.value)
                  }
                />
              </div>
              <input
                className="requirement-inline-input"
                aria-label={`Cible ${requirement.label}`}
                value={requirement.target}
                onChange={event =>
                  onChange(requirement.id, "target", event.target.value)
                }
              />
              <select
                className="requirement-status-select"
                aria-label={`Statut ${requirement.label}`}
                value={requirement.status}
                onChange={event =>
                  onChange(requirement.id, "status", event.target.value)
                }
              >
                <option value="hypothesis">Hypothèse</option>
                <option value="review">À vérifier</option>
                <option value="ok">Satisfaite</option>
                <option value="conflict">Conflit</option>
              </select>
              <div className="mission-requirement-source-cell">
                <input
                  className="requirement-inline-input"
                  aria-label={`Source ${requirement.label}`}
                  value={requirement.source}
                  onChange={event =>
                    onChange(requirement.id, "source", event.target.value)
                  }
                />
                {requirement.sourceUrl && (
                  <a
                    href={requirement.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ouvrir la source <ArrowUpRight size={11} />
                  </a>
                )}
                {requirement.verification && (
                  <small title={requirement.verification}>
                    Vérification : {requirement.verification}
                  </small>
                )}
              </div>
              <div className="requirement-actions">
                <button
                  className={`row-action ${requirement.approved ? "action-active" : ""}`}
                  title={
                    requirement.approved
                      ? "Révoquer l’approbation"
                      : "Approuver"
                  }
                  aria-label={
                    requirement.approved
                      ? "Révoquer l’approbation"
                      : "Approuver"
                  }
                  onClick={() =>
                    onToggleRequirement(requirement.id, "approved")
                  }
                >
                  <CheckCircle2 size={14} />
                </button>
                <button
                  className={`row-action ${requirement.pinned ? "action-active" : ""}`}
                  title="Épingler"
                  aria-label="Épingler"
                  onClick={() => onToggleRequirement(requirement.id, "pinned")}
                >
                  <Pin size={14} />
                </button>
                <button
                  className="row-action"
                  title={requirement.visible === false ? "Afficher" : "Cacher"}
                  aria-label={
                    requirement.visible === false ? "Afficher" : "Cacher"
                  }
                  onClick={() => onToggleRequirement(requirement.id, "visible")}
                >
                  <Eye size={14} />
                </button>
                <button
                  className="row-action action-danger"
                  title="Supprimer"
                  aria-label="Supprimer"
                  onClick={() => onDeleteRequirement(requirement.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="assumption-note">
        <Info size={15} />
        <span>
          Les modifications sont sauvegardées localement et recalculent
          automatiquement la simulation. Une exigence approuvée reste traçable
          et peut être révoquée.
        </span>
      </div>
    </div>
  );
}
const architecturePresets: Record<
  NonNullable<ConceptConfig["airframe"]>,
  Partial<ConceptConfig> & { label: string; description: string }
> = {
  "fixed-wing": {
    label: "Voilure fixe",
    description: "Endurance et rayon de mission",
    wingspan: 2.8,
    chord: 0.32,
    propDiameter: 0.42,
    batteryWh: 820,
    motorCount: 1,
  },
  quadcopter: {
    label: "Quadricoptère",
    description: "Stationnaire, inspection rapprochée",
    wingspan: 1.15,
    chord: 0.24,
    fuselageLength: 0.55,
    propDiameter: 0.38,
    batteryWh: 620,
    motorCount: 4,
    cruiseSpeedKmh: 28,
  },
  vtol: {
    label: "VTOL hybride",
    description: "Décollage vertical + croisière",
    wingspan: 2.4,
    chord: 0.3,
    fuselageLength: 1.35,
    propDiameter: 0.34,
    batteryWh: 980,
    motorCount: 4,
    cruiseSpeedKmh: 48,
  },
};

const architectureChoices: Array<{
  id: string;
  label: string;
  description: string;
  base: NonNullable<ConceptConfig["airframe"]>;
  wingspan: number;
  fuselageLength: number;
  motors: number;
  category: string;
}> = [
  {
    id: "fixed-wing",
    label: "Aile fixe classique",
    description: "Croisière et endurance",
    base: "fixed-wing",
    wingspan: 2.8,
    fuselageLength: 1.55,
    motors: 1,
    category: "Civil",
  },
  {
    id: "flying-wing",
    label: "Aile volante",
    description: "Cellule compacte sans empennage",
    base: "fixed-wing",
    wingspan: 2.2,
    fuselageLength: 0.9,
    motors: 1,
    category: "Civil",
  },
  {
    id: "glider",
    label: "Planeur motorisé",
    description: "Grande finesse, propulsion auxiliaire",
    base: "fixed-wing",
    wingspan: 3.8,
    fuselageLength: 1.6,
    motors: 1,
    category: "Essai",
  },
  {
    id: "twin-boom",
    label: "Double poutre",
    description: "Cellule modulaire d’inspection",
    base: "fixed-wing",
    wingspan: 2.7,
    fuselageLength: 1.5,
    motors: 2,
    category: "Civil",
  },
  {
    id: "tricopter",
    label: "Tricoptère",
    description: "Trois rotors, banc de stabilité",
    base: "quadcopter",
    wingspan: 0.95,
    fuselageLength: 0.7,
    motors: 3,
    category: "Essai",
  },
  {
    id: "quadcopter",
    label: "Quadricoptère",
    description: "Stationnaire et inspection rapprochée",
    base: "quadcopter",
    wingspan: 1.15,
    fuselageLength: 0.55,
    motors: 4,
    category: "Civil",
  },
  {
    id: "hexacopter",
    label: "Hexacoptère",
    description: "Redondance multirotor",
    base: "quadcopter",
    wingspan: 1.45,
    fuselageLength: 0.7,
    motors: 6,
    category: "Civil",
  },
  {
    id: "octocopter",
    label: "Octocoptère",
    description: "Plateforme lourde de test",
    base: "quadcopter",
    wingspan: 1.8,
    fuselageLength: 0.9,
    motors: 8,
    category: "Essai",
  },
  {
    id: "coaxial-x8",
    label: "Coaxial X8",
    description: "Huit rotors en configuration coaxiale",
    base: "quadcopter",
    wingspan: 1.4,
    fuselageLength: 0.8,
    motors: 8,
    category: "Essai",
  },
  {
    id: "vtol-lift-cruise",
    label: "VTOL lift + cruise",
    description: "Levage vertical et aile de croisière",
    base: "vtol",
    wingspan: 2.4,
    fuselageLength: 1.35,
    motors: 5,
    category: "Civil",
  },
  {
    id: "tiltrotor",
    label: "Tiltrotor",
    description: "Nacelles orientables · transition simulée",
    base: "vtol",
    wingspan: 2.5,
    fuselageLength: 1.4,
    motors: 4,
    category: "Essai",
  },
  {
    id: "tailsitter",
    label: "Tail-sitter VTOL",
    description: "Décollage vertical sur empennage",
    base: "vtol",
    wingspan: 1.9,
    fuselageLength: 1.1,
    motors: 4,
    category: "Essai",
  },
  {
    id: "civil-blimp",
    label: "Aérostat / dirigeable",
    description: "Observation lente à faible énergie",
    base: "fixed-wing",
    wingspan: 3.2,
    fuselageLength: 2.5,
    motors: 2,
    category: "Civil",
  },
  {
    id: "test-bed",
    label: "Banc volant expérimental",
    description: "Plateforme instrumentée de validation",
    base: "quadcopter",
    wingspan: 1.3,
    fuselageLength: 0.8,
    motors: 4,
    category: "Essai",
  },
  {
    id: "mil-isr-fixed",
    label: "ISR longue endurance (non armé)",
    description: "Reconnaissance et observation ; sans charge offensive",
    base: "fixed-wing",
    wingspan: 4.2,
    fuselageLength: 1.8,
    motors: 1,
    category: "Militaire · non armé",
  },
  {
    id: "mil-tactical-vtol",
    label: "Reconnaissance VTOL (non armé)",
    description: "Observation et relais supervisés ; sans armement",
    base: "vtol",
    wingspan: 2.3,
    fuselageLength: 1.3,
    motors: 6,
    category: "Militaire · non armé",
  },
  {
    id: "biplane",
    label: "Biplan",
    description: "Deux plans portants · faible vitesse",
    base: "fixed-wing",
    wingspan: 2.4,
    fuselageLength: 1.25,
    motors: 1,
    category: "Essai",
  },
  {
    id: "ornithopter",
    label: "Ornithoptère",
    description: "Battement d’ailes biomimétique",
    base: "fixed-wing",
    wingspan: 1.8,
    fuselageLength: 0.75,
    motors: 2,
    category: "Recherche",
  },
  {
    id: "cyclocopter",
    label: "Cyclocoptère",
    description: "Propulsion cyclique vectorielle",
    base: "quadcopter",
    wingspan: 1.3,
    fuselageLength: 0.62,
    motors: 4,
    category: "Recherche",
  },
  {
    id: "paraglider",
    label: "Aile souple / parapente",
    description: "Voile souple · récupération douce",
    base: "fixed-wing",
    wingspan: 5.2,
    fuselageLength: 1.4,
    motors: 1,
    category: "Secours",
  },
];

const catalogProfileForChoice: Record<string, string> = {
  biplane: "biplane-01",
  glider: "glider-01",
  "twin-boom": "boom-01",
  tricopter: "tri-01",
  hexacopter: "hexa-01",
  ornithopter: "ornitho-01",
  cyclocopter: "cyclo-01",
  paraglider: "para-01",
};

const modelTypeForChoice: Record<string, CalculationModelType> = {
  "fixed-wing": "voilure-conventionnelle",
  "flying-wing": "aile-volante",
  glider: "planeur",
  "twin-boom": "double-poutre",
  tricopter: "tricoptère",
  quadcopter: "multirotor",
  hexacopter: "hexacoptère",
  octocopter: "octocoptère",
  "coaxial-x8": "coaxial-x8",
  "vtol-lift-cruise": "tiltrotor",
  tiltrotor: "tiltrotor",
  tailsitter: "tail-sitter",
  "civil-blimp": "aérostat",
  "test-bed": "ducted-fan",
  "mil-isr-fixed": "voilure-conventionnelle",
  "mil-tactical-vtol": "tiltrotor",
  biplane: "biplan",
  ornithopter: "ornithoptère",
  cyclocopter: "cyclocoptère",
  paraglider: "parapente",
};

function buildProfileMaterials(
  design: DroneCatalogDesign
): InstalledMaterial[] {
  const fixedWing = design.key === "fixed-wing";
  const vtol = design.key === "vtol";
  const motorCount = design.configuration.motorCount ?? 1;
  return [
    {
      id: `${design.id}-fuselage`,
      label: `${design.label} · fuselage profilé`,
      use: "Cellule principale paramétrique",
      massKg: fixedWing ? 1.6 : 1.1,
      quantity: 1,
      geometry: "core",
      category: "airframe",
      catalogSource: "concept",
      manufacturerDataStatus: "estimate",
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    },
    ...(fixedWing || vtol
      ? [
          {
            id: `${design.id}-wing`,
            label: `${design.label} · voilure`,
            use: "Aile et surfaces portantes",
            massKg: fixedWing ? 1.0 : 0.8,
            quantity: 1,
            geometry: "skin" as const,
            category: "airframe" as const,
            catalogSource: "concept" as const,
            manufacturerDataStatus: "estimate" as const,
            offsetX: 0,
            offsetY: 0,
            scale: 1,
          },
        ]
      : []),
    {
      id: `${design.id}-propulsion`,
      label: `${design.label} · propulsion (${motorCount} moteur(s))`,
      use: "Groupe propulsif paramétrique",
      massKg: fixedWing ? 0.55 : 0.28 * motorCount,
      quantity: 1,
      geometry: "mount",
      category: "propulsion",
      catalogSource: "concept",
      manufacturerDataStatus: "estimate",
      offsetX: fixedWing ? 34 : 0,
      offsetY: 0,
      scale: 1,
    },
    {
      id: `${design.id}-avionics`,
      label: `${design.label} · avionique`,
      use: "Avionique et liaison de simulation",
      massKg: 0.28,
      quantity: 1,
      geometry: "mount",
      category: "avionics",
      catalogSource: "concept",
      manufacturerDataStatus: "estimate",
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    },
    {
      id: `${design.id}-payload`,
      label: `${design.label} · baie capteur`,
      use: "Charge utile capteur non offensive",
      massKg: Math.max(0.15, (design.configuration.payloadKg ?? 0) * 0.18),
      quantity: 1,
      geometry: "mount",
      category: "payload",
      catalogSource: "concept",
      manufacturerDataStatus: "estimate",
      offsetX: -18,
      offsetY: 0,
      scale: 1,
    },
  ];
}

const CELL_LIBRARY_NAMES_KEY = "aeromind-cell-library-custom-names-v1";

function readCellLibraryNames(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(CELL_LIBRARY_NAMES_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.entries(parsed).reduce<Record<string, string>>((names, [id, value]) => {
      if (typeof value === "string" && value.trim()) names[id] = value.trim().slice(0, 80);
      return names;
    }, {});
  } catch {
    return {};
  }
}

function writeCellLibraryNames(names: Record<string, string>) {
  try {
    window.localStorage.setItem(CELL_LIBRARY_NAMES_KEY, JSON.stringify(names));
  } catch {
    // Le renommage reste une préférence locale facultative.
  }
}

function DroneCatalogView({
  onLoad,
  onSelect,
  onOpenTools,
  onApplyIndustrial,
  activeDroneId,
}: {
  onLoad: (design: DroneCatalogDesign) => void;
  onSelect: (design: DroneCatalogDesign) => void;
  onOpenTools: () => void;
  onApplyIndustrial: (reference: IndustrialDroneReference) => void;
  activeDroneId?: string;
}) {
  // Bibliothèque complète des cellules paramétriques, registre industriel,
  // comparaison et fiche détaillée. Le catalogue reste strictement sans sélection initiale.
  const [importedProfiles, setImportedProfiles] = useState<ImportedDroneProfile[]>(() => loadImportedDroneProfiles());
  const [pendingProfileAction, setPendingProfileAction] = useState<{ kind: "retain" | "delete"; profile: ImportedDroneProfile } | null>(null);
  const catalog = [...droneCatalog, ...importedProfiles];
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [customNames, setCustomNames] = useState<Record<string, string>>(() => readCellLibraryNames());
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [selectedId, setSelectedId] = useState(activeDroneId ?? "");
  const [importUnit, setImportUnit] = useState<"m" | "cm" | "mm">("m");
  const [importArchitecture, setImportArchitecture] = useState<ImportArchitecture>("other");
  const [importAxes, setImportAxes] = useState<AxisMapping>({ span: "x", length: "y", height: "z" });
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewProfile, setPreviewProfile] = useState<ImportedDroneProfile | null>(null);
  const [importMessage, setImportMessage] = useState("");
  const importFileRef = useRef<HTMLInputElement>(null);
  const profileJsonRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setSelectedId(activeDroneId ?? ""); }, [activeDroneId]);
  useEffect(() => {
    let active = true;
    void loadImportedDroneProfilesDurable().then(profiles => { if (active) setImportedProfiles(current => [...current, ...profiles].reduce<ImportedDroneProfile[]>((all, item) => [...all.filter(entry => entry.id !== item.id), item], []).slice(-40)); });
    return () => { active = false; };
  }, []);
  const [query, setQuery] = useState("");
  const importExternalMesh = async (file?: File) => {
    if (!file) return;
    setPreviewFile(file);
    setPreviewProfile(null);
    setImportMessage("Analyse de la maquette et création du profil paramétrique…");
    if (file.size > 20 * 1024 * 1024) {
      setImportMessage("Fichier trop volumineux : limite actuelle de 20 Mio (20 × 1 024 × 1 024 octets).");
      setPreviewFile(null);
      return;
    }
    try {
      const bounds = parseExternalDroneMesh(file.name, await file.arrayBuffer());
      const unitToMeters = importUnit === "mm" ? 0.001 : importUnit === "cm" ? 0.01 : 1;
      const dimensions = getMeshDimensions(bounds, unitToMeters, importAxes);
      const match = adaptExternalDroneToCatalog(file.name, bounds, unitToMeters, droneCatalog, importArchitecture, importAxes);
      const importedProfile = initializeImportedDroneProfile(match.design);
      await saveImportedDroneProfile(importedProfile);
      setImportedProfiles(current => [...current.filter(item => item.id !== importedProfile.id), importedProfile]);
      setSelectedId(importedProfile.id);
      setPreviewProfile(importedProfile);
      setImportMessage(`Profil enregistré localement en évaluation — il ne devient pas la configuration active avant confirmation de sa conservation. Dimensions déclarées (envergure / longueur / hauteur) : ${dimensions.map(value => `${value.toFixed(3)} m`).join(" / ")}. Architecture choisie : ${importArchitecture === "other" ? "à confirmer" : importArchitecture}. Profil de référence : ${match.selectedProfile}. Le maillage source n’est pas conservé.`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Impossible d’analyser cette maquette.");
    } finally {
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };
  const exportImportedProfiles = () => {
    const payload = JSON.stringify({ format: "aeromind-cell-profiles", version: 1, exportedAt: new Date().toISOString(), profiles: importedProfiles }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "aeromind-profils-cellules.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setImportMessage(`${importedProfiles.length} profil(s) paramétrique(s) exporté(s) en JSON. Les maillages source ne sont pas inclus.`);
  };
  const restoreImportedProfiles = async (file?: File) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const items = parsed && typeof parsed === "object" && "profiles" in parsed ? (parsed as { profiles: unknown }).profiles : parsed;
      if (!Array.isArray(items)) throw new Error("Le fichier doit contenir une liste profiles au format JSON AeroMind.");
      const valid = items.map(item => normalizeImportedDroneProfile(item)).filter((profile): profile is ImportedDroneProfile => Boolean(profile)).slice(-40).map(profile => profile.libraryWorkflow.status === "accepted" ? transitionImportedDroneProfile(profile, "evaluation") : profile);
      if (!valid.length) throw new Error("Aucun profil AeroMind valide trouvé dans ce fichier.");
      for (const profile of valid) await saveImportedDroneProfile(profile);
      setImportedProfiles(current => [...current, ...valid].reduce<ImportedDroneProfile[]>((all, item) => [...all.filter(entry => entry.id !== item.id), item], []).slice(-40));
      setImportMessage(`${valid.length} profil(s) restauré(s) localement. Les profils restaurés repassent en évaluation dans ce navigateur; les maillages source ne sont pas inclus.`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Impossible de restaurer ce fichier JSON.");
    } finally {
      if (profileJsonRef.current) profileJsonRef.current.value = "";
    }
  };
  const persistImportedReviewStatus = async (profile: ImportedDroneProfile, status: ImportedDroneReviewStatus) => {
    const updated = transitionImportedDroneProfile(profile, status);
    try {
      await saveImportedDroneProfile(updated);
      setImportedProfiles(current => current.map(item => item.id === updated.id ? updated : item));
      if (status === "accepted") {
        setSelectedId(updated.id);
        onLoad(updated);
        setImportMessage(`« ${updated.label} » est conservé dans la bibliothèque et chargé dans la configuration de travail. Cette décision locale n’est pas une validation technique ou réglementaire.`);
      } else {
        setImportMessage(`« ${updated.label} » est remis en évaluation. Une configuration déjà copiée dans un projet reste inchangée.`);
      }
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Le statut du profil n’a pas pu être enregistré.");
    }
  };
  const confirmImportedProfileAction = async () => {
    const action = pendingProfileAction;
    if (!action) return;
    setPendingProfileAction(null);
    if (action.kind === "retain") {
      await persistImportedReviewStatus(action.profile, "accepted");
      return;
    }
    try {
      await deleteImportedDroneProfile(action.profile.id);
      setImportedProfiles(current => current.filter(item => item.id !== action.profile.id));
      setPreviewProfile(current => current?.id === action.profile.id ? null : current);
      setComparisonIds(current => current.filter(id => id !== action.profile.id));
      setSelectedId(current => current === action.profile.id ? "" : current);
      setImportMessage(`« ${action.profile.label} » a été supprimé de la bibliothèque locale. Une configuration déjà créée à partir de ce profil n’a pas été effacée.`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Le profil est conservé : la suppression locale n’a pas abouti.");
    }
  };
  const selected = catalog.find(item => item.id === selectedId);
  const selectedImportedProfile = importedProfiles.find(item => item.id === selectedId);
  const selectedImportedPending = selectedImportedProfile?.libraryWorkflow.status !== "accepted" && Boolean(selectedImportedProfile);
  const displayLabel = (design: DroneCatalogDesign) => customNames[design.id] ?? design.label;
  const namedDesign = (design: DroneCatalogDesign, label = displayLabel(design)): DroneCatalogDesign => ({ ...design, label });
  const startRename = (design: DroneCatalogDesign) => {
    setEditingNameId(design.id);
    setNameDraft(displayLabel(design));
  };
  const cancelRename = () => {
    setEditingNameId(null);
    setNameDraft("");
  };
  const commitRename = (design: DroneCatalogDesign) => {
    const nextName = nameDraft.trim().slice(0, 80);
    const nextNames = { ...customNames };
    if (nextName && nextName !== design.label) nextNames[design.id] = nextName;
    else delete nextNames[design.id];
    setCustomNames(nextNames);
    writeCellLibraryNames(nextNames);
    if (selected?.id === design.id && activeDroneId === design.id) onSelect(namedDesign(design, nextName || design.label));
    cancelRename();
  };
  const visibleCatalog = catalog.filter(item => `${displayLabel(item)} ${item.label} ${item.family} ${item.mission}`.toLowerCase().includes(query.toLowerCase()));
  const toggleComparison = (id: string) => setComparisonIds(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 2 ? [...current, id] : [current[1], id]);
  const comparison = catalog.filter(item => comparisonIds.includes(item.id));
  const comparisonRows = [
    ["Architecture", (item: DroneCatalogDesign) => item.family],
    ["Envergure", (item: DroneCatalogDesign) => `${item.configuration.wingspan ?? "—"} m`],
    ["Longueur fuselage", (item: DroneCatalogDesign) => `${item.configuration.fuselageLength ?? "—"} m`],
    ["Capacité batterie", (item: DroneCatalogDesign) => `${item.configuration.batteryWh ?? "—"} Wh`],
    ["Charge utile déclarée", (item: DroneCatalogDesign) => `${item.configuration.payloadKg ?? "—"} kg`],
    ["Croisière paramétrée", (item: DroneCatalogDesign) => `${item.configuration.cruiseSpeedKmh ?? "—"} km/h`],
    ["Nombre de moteurs", (item: DroneCatalogDesign) => `${item.configuration.motorCount ?? "—"}`],
  ] as const;
  return (
    <div className="view-stack legacy-drone-library">
      <SectionHeading eyebrow="03 / BIBLIOTHÈQUE DE CONCEPTION" title="Bibliothèque des cellules" description={`${catalog.length} cellules paramétriques AeroMinD, dont huit références morphologiques adaptées du PDF utilisateur. Chaque sélection explicite synchronise l’identité, l’architecture et les paramètres de la cellule avec le workspace actif; les cotes des maquettes PDF restent indicatives et non certifiées.`} action={<span className="calculated-badge"><Box size={13} /> {catalog.length} concepts non construits</span>} />
      <section className="legacy-selection-console"><div><p className="eyebrow">CONSOLE DE SÉLECTION / BIBLIOTHÈQUE</p><h3>Choisir une architecture par mission</h3><p>Comparez les variantes de structure et d’énergie. Sélectionnez une fiche pour synchroniser ses données avec le workspace actif; aucune cellule n’est appliquée par défaut.</p></div><label className="legacy-catalog-search"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Filtrer les ${catalog.length} concepts…`} aria-label="Filtrer les concepts paramétriques" /></label><div className="legacy-console-actions"><button type="button" onClick={() => document.getElementById("catalog-comparison-title")?.scrollIntoView({ behavior: "smooth" })}>Comparer l’endurance et la charge utile</button><button type="button" onClick={() => document.getElementById("catalog-comparison-title")?.scrollIntoView({ behavior: "smooth" })}>Comparer la redondance propulsion</button><button type="button" onClick={onOpenTools}>Charger une référence puis la modifier</button></div></section>
      <section className="panel external-drone-import" aria-label="Importer une maquette externe">
        <div className="external-drone-import-copy"><p className="eyebrow">CELLULE PERSONNALISÉE / IMPORT LOCAL</p><h3>Analyser une maquette OBJ ou STL</h3><p>L’analyse calcule l’enveloppe du maillage et crée un profil paramétrique affiché avec le même rendu que les drones du catalogue. Le fichier source n’est pas converti en CAO complète.</p><small>Les profils sont enregistrés sur cet appareil dans IndexedDB (avec repli localStorage), sans téléversement. Tout nouveau profil commence en évaluation et doit être conservé explicitement avant d’être chargé comme configuration active. Exportez vos données séparément pour les sauvegarder ou les partager.</small></div>
        <div className="external-drone-import-controls external-drone-import-form">
          <label>Unité<select value={importUnit} onChange={event => setImportUnit(event.target.value as "m" | "cm" | "mm")}><option value="m">Mètres</option><option value="cm">Centimètres</option><option value="mm">Millimètres</option></select></label>
          <label>Architecture<select value={importArchitecture} onChange={event => setImportArchitecture(event.target.value as ImportArchitecture)}><option value="other">Autre / indéterminée</option><option value="fixed-wing">Voilure fixe</option><option value="quadcopter">Multirotor</option><option value="vtol">VTOL</option></select></label>
          {([ ["span", "Axe d’envergure"], ["length", "Axe de longueur"], ["height", "Axe de hauteur"] ] as const).map(([key, title]) => <label key={key}>{title}<select value={importAxes[key]} onChange={event => setImportAxes(current => ({ ...current, [key]: event.target.value as Axis }))}><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select></label>)}
          <button type="button" className="primary-button" onClick={() => importFileRef.current?.click()}><Upload size={15} /> Choisir OBJ/STL</button>
          <input ref={importFileRef} type="file" accept=".obj,.stl,model/obj,model/stl" hidden onChange={event => void importExternalMesh(event.currentTarget.files?.[0])} />
          <button type="button" className="secondary-button" onClick={exportImportedProfiles} disabled={!importedProfiles.length}>Exporter profils JSON</button>
          <button type="button" className="secondary-button" onClick={() => profileJsonRef.current?.click()}>Restaurer profils JSON</button>
          <input ref={profileJsonRef} type="file" accept="application/json,.json" hidden onChange={event => void restoreImportedProfiles(event.currentTarget.files?.[0])} />
        </div>
        {previewFile && previewFile.size <= 20 * 1024 * 1024 && <>
          {previewProfile ? <div className="external-parametric-preview" aria-label="Aperçu paramétrique du profil importé">
            <ParametricDronePreview design={previewProfile} />
            <small>RENDU PARAMÉTRIQUE · MÊME COMPOSANT QUE LA BIBLIOTHÈQUE DES CELLULES</small>
          </div> : <div className="external-parametric-preview-placeholder" role="status">{importMessage || "Analyse de la maquette et création du profil paramétrique…"}</div>}
          <p className="external-mesh-dimensions">Fichier : {previewFile.name} · {(previewFile.size / (1024 * 1024)).toFixed(2)} Mio · axes attribués : {importAxes.span.toUpperCase()} = envergure, {importAxes.length.toUpperCase()} = longueur, {importAxes.height.toUpperCase()} = hauteur. Le profil utilise le même rendu paramétrique que les fiches du catalogue et reste modifiable après conservation.</p>
        </>}
        {importMessage && <p className="external-drone-import-message" role="status">{importMessage}</p>}
        <p className="external-import-warning"><strong>Limites à connaître :</strong> l’architecture est un choix utilisateur, pas une détection automatique. Le profil catalogue sert de base aux paramètres non mesurés. L’aperçu ne vaut ni import CAO complet, ni contrôle d’intégrité, ni validation structurale/aéronautique.</p>
      </section>
      <IndustrialModelRegistry onApply={onApplyIndustrial} />
      <section className="panel catalog-comparison-panel legacy-comparison-panel" aria-labelledby="catalog-comparison-title"><div className="panel-header"><div><p className="eyebrow">ÉTUDE DE VARIANTES / PARAMÈTRES DÉCLARÉS</p><h3 id="catalog-comparison-title">Comparer deux concepts</h3></div><span className="calculated-badge">{comparison.length} / 2 sélectionnés</span></div>{comparison.length === 2 ? <div className="catalog-comparison-scroll"><div className="catalog-comparison-grid"><div className="catalog-comparison-label">Paramètre</div>{comparison.map(item => <strong key={item.id} className="catalog-comparison-name">{displayLabel(item)}</strong>)}{comparisonRows.flatMap(([label, value]) => [<span key={`${label}-label`} className="catalog-comparison-label">{label}</span>, ...comparison.map(item => <span key={`${label}-${item.id}`} className="catalog-comparison-value">{value(item)}</span>)])}</div></div> : <p className="catalog-comparison-empty">Sélectionnez deux fiches à comparer. Les valeurs restent des hypothèses de concept.</p>}</section>
      <section className="legacy-concept-section" aria-labelledby="legacy-concepts-title"><div className="legacy-section-heading"><div><p className="eyebrow">05 / CONCEPTS AEROMIND · PARAMETRIC CORE</p><h3 id="legacy-concepts-title">Variantes paramétriques disponibles</h3></div><span>{visibleCatalog.length} / {catalog.length} affichés</span></div><div className="legacy-concept-grid">{visibleCatalog.map(item => {
        const importedProfile = importedProfiles.find(profile => profile.id === item.id);
        const isImportedPending = Boolean(importedProfile && importedProfile.libraryWorkflow.status !== "accepted");
        const isImportedAccepted = Boolean(importedProfile && importedProfile.libraryWorkflow.status === "accepted");
        const itemLabel = displayLabel(item);
        const isRenaming = editingNameId === item.id;
        return <article key={item.id} className={`legacy-concept-card catalog-${item.tone} ${selected?.id === item.id ? "is-selected" : ""}`}><div className="legacy-concept-visual"><ParametricDronePreview design={item} /><span>{item.modelType?.toUpperCase() ?? "PARAMETRIC"}</span></div><div className="legacy-concept-copy"><p className="eyebrow">{item.family.toUpperCase()}</p>{importedProfile && <div className={`imported-profile-status ${isImportedAccepted ? "is-accepted" : "is-evaluation"}`}><strong>{isImportedAccepted ? "CONSERVÉ · ACCEPTÉ PAR L’UTILISATEUR" : "EN ÉVALUATION · NON ACCEPTÉ"}</strong><small>{importedProfile.libraryWorkflow.updatedAt ? `Statut local mis à jour · ${new Date(importedProfile.libraryWorkflow.updatedAt).toLocaleString("fr-FR")}` : "Statut local"}</small></div>}<div className="legacy-concept-name-row">{isRenaming ? <input autoFocus maxLength={80} value={nameDraft} aria-label={`Nouveau nom pour ${item.label}`} onChange={event => setNameDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") commitRename(item); if (event.key === "Escape") cancelRename(); }} /> : <h4>{itemLabel}</h4>}{isRenaming ? <><button type="button" onClick={() => commitRename(item)}>Enregistrer</button><button type="button" onClick={cancelRename}>Annuler</button></> : <button type="button" className="rename-drone-button" onClick={() => startRename(item)} aria-label={`Renommer ${itemLabel}`} title="Renommer ce drone"><Pencil size={13} /> Renommer</button>}</div><p>{item.mission}</p><div className="legacy-concept-metrics"><span><small>ENVERGURE</small><b>{item.configuration.wingspan?.toFixed(1)} m</b></span><span><small>CHARGE</small><b>{item.configuration.payloadKg?.toFixed(1)} kg</b></span><span><small>ÉNERGIE</small><b>{item.configuration.batteryWh} Wh</b></span><span><small>MOTEURS</small><b>{item.configuration.motorCount ?? "—"}</b></span></div><div className="legacy-concept-actions"><button type="button" className={selected?.id === item.id && !isImportedPending ? "is-active" : ""} disabled={isImportedPending} title={isImportedPending ? "Confirmez d’abord la conservation de ce profil." : undefined} onClick={() => { setSelectedId(item.id); if (activeDroneId !== item.id) onSelect(namedDesign(item)); }}>{isImportedPending ? <ClipboardCheck size={13} /> : selected?.id === item.id ? <Check size={13} /> : <Plus size={13} />} {isImportedPending ? "Bloqué · en évaluation" : selected?.id === item.id ? "Drone actif · fiche affichée" : "Sélectionner et synchroniser"}</button><button type="button" onClick={() => toggleComparison(item.id)}>{comparisonIds.includes(item.id) ? "Dans la comparaison" : "Comparer"}</button><button type="button" className="primary-button" disabled={isImportedPending} title={isImportedPending ? "La création d’une variante est disponible après acceptation explicite." : undefined} onClick={() => onLoad(namedDesign(item))}><Box size={14} /> {isImportedPending ? "Attendre l’acceptation" : "Créer une variante"}</button></div>
        {importedProfile && <div className="imported-profile-management"><div className="imported-profile-management-title"><strong>GESTION DU PROFIL IMPORTÉ</strong><small>Statut enregistré localement dans ce navigateur</small></div><div className="imported-profile-management-actions"><button type="button" className="is-evaluation" disabled={!isImportedAccepted} onClick={() => void persistImportedReviewStatus(importedProfile, "evaluation")}><ClipboardCheck size={13}/>{isImportedPending ? "En évaluation" : "Mettre en évaluation"}</button><button type="button" className="is-retain" disabled={!isImportedPending} onClick={() => setPendingProfileAction({ kind: "retain", profile: importedProfile })}><CheckCircle2 size={13}/>{isImportedAccepted ? "Drone conservé" : "Conserver dans la bibliothèque"}</button><button type="button" className="is-delete" onClick={() => setPendingProfileAction({ kind: "delete", profile: importedProfile })}><Trash2 size={13}/>Supprimer</button></div><small className="imported-profile-management-note">L’évaluation du statut est une étape de revue humaine, pas un contrôle technique ni une certification aéronautique.</small></div>}
        </div></article>;
      })}</div></section>
      {selected ? <section className="panel legacy-selected-sheet" aria-label={`Fiche ${displayLabel(selected)}`} ><div className="panel-header"><div><p className="eyebrow">RÉFÉRENCE PROTOTYPE · FICHE SÉLECTIONNÉE</p><h3>{displayLabel(selected)}</h3></div><span className="calculated-badge"><ShieldCheck size={13} /> NON ARMÉ · TRACE À VALIDER</span></div><div className="legacy-selected-layout"><div className="legacy-selected-visual"><ParametricDronePreview design={selected} /><span>AEROMIND / PHYSICAL PARAMETRIC MOCKUP · {selected.modelType?.toUpperCase()} · SPAN {selected.configuration.wingspan?.toFixed(2)} M</span></div><div className="legacy-selected-data"><p>{selected.mission}</p><p>{selected.defenseUse}</p><dl><div><dt>ARCHITECTURE</dt><dd>{selected.family} · {selected.modelType}</dd></div><div><dt>CONSTRUCTION</dt><dd>Composite / géométrie paramétrique</dd></div><div><dt>FUSELAGE</dt><dd>{selected.configuration.fuselageLength?.toFixed(2)} m · profil déclaré</dd></div><div><dt>DONNÉES</dt><dd>Hypothèses préliminaires · aucune certification automatique</dd></div></dl><div className="legacy-selected-actions"><button className="secondary-button" type="button" onClick={onOpenTools}><SlidersHorizontal size={14} /> Modifier dans le Poste de construction</button><button className="primary-button" type="button" disabled={Boolean(selectedImportedPending)} title={selectedImportedPending ? "Confirmez d’abord la conservation du profil dans sa fiche." : undefined} onClick={() => onLoad(namedDesign(selected))}><Box size={14} /> {selectedImportedPending ? "En attente d’acceptation" : "Charger cette référence"}</button></div></div></div></section> : <section className="panel legacy-empty-sheet"><ShieldCheck size={18} /><div><p className="eyebrow">RÉFÉRENCE SÉLECTIONNÉE</p><h3>Aucune architecture choisie</h3><span>Sélectionnez une fiche pour afficher son visuel paramétrique, ses données et ses actions. Aucun modèle n’est injecté par défaut.</span></div></section>}
      <section className="panel inspector-note"><Info size={15} /><span>Les concepts sont des hypothèses de travail destinées à l’observation, à la cartographie, au secours et à la protection civile non armée. Ils deviennent un projet seulement après l’action explicite de l’utilisateur.</span></section>
      <AlertDialog open={Boolean(pendingProfileAction)} onOpenChange={open => { if (!open) setPendingProfileAction(null); }}>
        <AlertDialogContent className="imported-profile-confirm-dialog">
          <AlertDialogHeader><AlertDialogTitle>{pendingProfileAction?.kind === "delete" ? "Confirmer la suppression du profil" : "Confirmer la conservation du profil"}</AlertDialogTitle><AlertDialogDescription>{pendingProfileAction?.kind === "delete" ? <>Le profil « {pendingProfileAction.profile.label} » sera supprimé de cette bibliothèque locale. Cette action n’efface pas une configuration déjà copiée dans un projet; le maillage source n’est pas stocké ici.</> : <>« {pendingProfileAction?.profile.label} » sera marqué comme conservé et chargé dans la configuration de travail. Cette décision locale ne constitue ni une validation technique, ni une certification, ni une autorisation de vol.</>}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction className={pendingProfileAction?.kind === "delete" ? "imported-profile-confirm-delete" : "imported-profile-confirm-retain"} onClick={() => void confirmImportedProfileAction()}>{pendingProfileAction?.kind === "delete" ? "Confirmer la suppression" : "Confirmer la conservation"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
function LongRangeObservationSection({
  onLoad,
}: {
  onLoad: (design: DroneCatalogDesign) => void;
}) {
  const [classFilter, setClassFilter] = useState<"all" | "HALE" | "MALE">("all");
  const [selectedId, setSelectedId] = useState("");
  const vectors = longRangeObservationVectors.filter(
    item => classFilter === "all" || item.enduranceClass === classFilter
  );
  const selected: LongRangeObservationVector | undefined =
    vectors.find(item => item.id === selectedId);
  const preparationNote = selected ? buildLongRangePreparationNote(selected) : [];
  return (
    <section
      className="panel long-range-panel"
      aria-labelledby="long-range-category-title"
    >
      <div className="panel-header">
        <div>
          <p className="eyebrow">
            CATÉGORIE 04 / {LONG_RANGE_CATEGORY_CLASSIFICATION.toUpperCase()}
          </p>
          <h3 id="long-range-category-title">{LONG_RANGE_CATEGORY_LABEL}</h3>
          <p className="section-description">
            Cellules à fuselage allongé et grande envergure pour la surveillance
            continue de zones d’accès restreint en temps de crise. Capteurs de
            situation et relais de communication uniquement : aucune charge
            militaire, aucun ciblage, supervision humaine obligatoire.
          </p>
        </div>
        <span className="calculated-badge">
          <Timer size={13} /> {longRangeObservationSummary.total} vecteurs ·{" "}
          {longRangeObservationSummary.hale} HALE /{" "}
          {longRangeObservationSummary.male} MALE
        </span>
      </div>
      <div className="long-range-toolbar">
        <div
          className="long-range-filters"
          role="group"
          aria-label="Filtrer les vecteurs longue portée"
        >
          {(
            [
              ["all", "TOUS", longRangeObservationSummary.total],
              ["HALE", "HALE · HAUTE ALTITUDE", longRangeObservationSummary.hale],
              ["MALE", "MALE · MOYENNE ALTITUDE", longRangeObservationSummary.male],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              className={classFilter === id ? "is-active" : ""}
              aria-pressed={classFilter === id}
              onClick={() => setClassFilter(id)}
            >
              {label} <b>{count}</b>
            </button>
          ))}
        </div>
        <div className="long-range-kpis">
          <div>
            <span>Endurance max. visée</span>
            <strong>{longRangeObservationSummary.maxEnduranceHours} h</strong>
          </div>
          <div>
            <span>Plafond max. de référence</span>
            <strong>{longRangeObservationSummary.maxServiceCeilingM} m</strong>
          </div>
          <div>
            <span>Catégorisation</span>
            <strong>CAPTEURS · NON ARMÉ</strong>
          </div>
        </div>
      </div>
      <div className="long-range-layout">
        <div className="long-range-grid">
          {vectors.map(item => (
            <article
              key={item.id}
              className={`long-range-card catalog-${item.tone} ${selected?.id === item.id ? "is-selected" : ""}`}
            >
              <div className="long-range-visual">
                <ParametricDronePreview design={item} />
                <span className={`long-range-class class-${item.enduranceClass.toLowerCase()}`}>
                  {item.enduranceClass}
                </span>
              </div>
              <div className="long-range-copy">
                <p className="eyebrow">{item.family.toUpperCase()}</p>
                <h4>{item.label}</h4>
                <p>{item.mission}</p>
                <div className="long-range-metrics">
                  <span>
                    <small>ENDURANCE VISÉE</small>
                    <b>{item.enduranceHours} h</b>
                  </span>
                  <span>
                    <small>PLAFOND DE RÉFÉRENCE</small>
                    <b>{item.serviceCeilingM} m</b>
                  </span>
                  <span>
                    <small>ENVERGURE</small>
                    <b>{item.configuration.wingspan?.toFixed(1)} m</b>
                  </span>
                  <span>
                    <small>CHARGE CAPTEURS</small>
                    <b>{item.configuration.payloadKg?.toFixed(1)} kg</b>
                  </span>
                </div>
                <div className="long-range-actions">
                  <button
                    className={`catalog-compare-button ${selected?.id === item.id ? "is-selected" : ""}`}
                    type="button"
                    aria-pressed={selected?.id === item.id}
                    onClick={() => setSelectedId(item.id)}
                  >
                    {selected?.id === item.id ? (
                      <Check size={13} />
                    ) : (
                      <Plus size={13} />
                    )}
                    {selected?.id === item.id
                      ? "Fiche affichée"
                      : "Ouvrir la fiche technique"}
                  </button>
                  <button className="primary-button" onClick={() => onLoad(item)}>
                    <Box size={15} /> Créer une variante
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
        {selected ? (
          <aside className="panel long-range-sheet" aria-label="Fiche technique longue portée">
            <div className="panel-header">
              <div>
                <p className="eyebrow">
                  FICHE D’IDENTIFICATION / {selected.enduranceClass}
                </p>
                <h3>{selected.label}</h3>
              </div>
              <span className="calculated-badge">
                <ShieldCheck size={13} /> NON ARMÉ
              </span>
            </div>
            <dl className="long-range-detail-list">
              <div>
                <dt>Catégorie</dt>
                <dd>{LONG_RANGE_CATEGORY_CLASSIFICATION}</dd>
              </div>
              <div>
                <dt>Architecture</dt>
                <dd>
                  Fuselage allongé · envergure{" "}
                  {selected.configuration.wingspan?.toFixed(1)} m · longueur{" "}
                  {selected.configuration.fuselageLength?.toFixed(1)} m
                </dd>
              </div>
              <div>
                <dt>Endurance de référence</dt>
                <dd>
                  {selected.enduranceHours} h visées (hypothèse d’avant-projet)
                </dd>
              </div>
              <div>
                <dt>Plafond de référence</dt>
                <dd>{selected.serviceCeilingM} m — valeur de conception</dd>
              </div>
              <div>
                <dt>Régime de surveillance</dt>
                <dd>{selected.surveillanceRegime}</dd>
              </div>
            </dl>
            <div className="long-range-blocks">
              <div>
                <strong>Contraintes environnementales</strong>
                <ul>
                  {selected.environmentalConstraints.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Suite de capteurs déclarée</strong>
                <ul>
                  {selected.sensorSuite.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Points de vigilance ingénierie</strong>
                <ul>
                  {selected.engineeringWatchpoints.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="long-range-note">
              <strong>Note de préparation documentaire</strong>
              {preparationNote.map(line => (
                <span key={line}>{line}</span>
              ))}
            </div>
            <div className="inspector-note">
              <Info size={15} />
              <span>
                Cette fiche décrit une hypothèse de travail destinée à
                l’observation et au relais de situation. Elle ne constitue ni une
                autorisation de vol, ni une performance certifiée, ni un plan de
                fabrication.
              </span>
            </div>
          </aside>
        ) : (
          <aside className="panel long-range-sheet long-range-empty-sheet" aria-label="Aucune fiche sélectionnée">
            <div className="panel-header"><div><p className="eyebrow">FICHE TECHNIQUE / EN ATTENTE</p><h3>Sélection utilisateur requise</h3></div><span className="calculated-badge">AUCUNE SÉLECTION</span></div>
            <p className="long-range-empty-copy">Sélectionnez « Ouvrir la fiche technique » sur une carte pour afficher ses métriques, contraintes et recommandations. AeroMind ne charge aucun vecteur par défaut.</p>
            <div className="long-range-empty-orbit"><span>HALE / MALE</span><i /><b>READY</b></div>
          </aside>
        )}
      </div>
    </section>
  );
}
function ConceptView({
  config,
  activeProfile,
  setConfig,
  selectedComponent,
  setSelectedComponent,
  rotation,
  rotationX,
  rotationY,
  zoom,
  setRotation,
  setRotationX,
  setRotationY,
  setZoom,
  onRunSimulation,
  onDuplicate,
  onOpenLibrary,
}: {
  config: ConceptConfig;
  activeProfile?: DroneCatalogDesign;
  setConfig: SetConceptConfig;
  selectedComponent: string;
  setSelectedComponent: (id: string) => void;
  rotation: number;
  rotationX: number;
  rotationY: number;
  zoom: number;
  setRotation: (value: number) => void;
  setRotationX: (value: number) => void;
  setRotationY: (value: number) => void;
  setZoom: (value: number) => void;
  onRunSimulation: () => void;
  onDuplicate: () => void;
  onOpenLibrary: () => void;
}) {
  const materialOptions: InstalledMaterial[] = [
    {
      id: "carbon",
      label: "Composite carbone",
      use: "Longerons, fuselage",
      massKg: 0.82,
      geometry: "skin",
    },
    {
      id: "aluminium",
      label: "Aluminium 7075",
      use: "Supports moteurs",
      massKg: 0.34,
      geometry: "mount",
    },
    {
      id: "foam",
      label: "Mousse EPP",
      use: "Noyau d’aile / protection",
      massKg: 0.28,
      geometry: "core",
    },
  ];
  const installedMaterials =
    config.installedMaterials ??
    (config.constructionMassKg
      ? [
          {
            id: "legacy-material-mass",
            label: "Masse héritée",
            use: "Masse existante du projet",
            massKg: config.constructionMassKg,
            geometry: "reinforcement" as const,
          },
        ]
      : []);
  const installedMaterialMass = installedPartsMassKg(installedMaterials);
  const installedPartsSummary = summarizeParts(installedMaterials);
  const materials = [
    ...materialOptions.map(item => ({
      ...item,
      mass: item.massKg,
      status: installedMaterials.some(installed => installed.id === item.id)
        ? "Installé"
        : "Disponible",
    })),
    {
      id: "battery",
      label: "Pack Li-ion modulaire",
      use: "Énergie propulsion (déjà comptée au bilan)",
      mass: config.batteryWh / 300,
      status: "Paramétré",
    },
  ];
  const flightControls: FlightControlsConfig = {
    ...defaultFlightControls,
    ...config.flightControls,
  };
  const missionPlan: LocalMissionPlan = {
    ...defaultLocalMissionPlan,
    ...config.missionPlan,
    waypoints:
      config.missionPlan?.waypoints ?? defaultLocalMissionPlan.waypoints,
  };
  const flightResponse = calculateFlightPreview(config, flightControls);
  const missionChecks = validateLocalMission(config, missionPlan);
  const missionDistanceKm = estimateLocalMissionDistanceKm(missionPlan);
  const engineeringChecks = buildEngineeringReview(config);
  const engineeringCounts = engineeringChecks.reduce(
    (counts, check) => ({
      ...counts,
      [check.status]: counts[check.status] + 1,
    }),
    { pass: 0, review: 0, block: 0 }
  );
  const [videoPreview, setVideoPreview] = useState(true);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoTick, setDemoTick] = useState(0);
  const [conceptZoom, setConceptZoom] = useState(1);
  const [activeAssemblyTool, setActiveAssemblyTool] = useState("assemble");
  const [activePartCategory, setActivePartCategory] =
    useState<DronePartCategory>("airframe");
  const [activePartLibrary, setActivePartLibrary] = useState<
    "manufacturer" | "concept"
  >("manufacturer");
  const [partQuantityToAdd, setPartQuantityToAdd] = useState(1);
  const [customPartName, setCustomPartName] = useState("");
  const [customPartMass, setCustomPartMass] = useState(0.1);
  const [conceptProposal, setConceptProposal] =
    useState<ConceptProposal | null>(null);
  const [acceptedProposalFields, setAcceptedProposalFields] = useState<
    Partial<Record<ConceptFieldKey, boolean>>
  >({});
  const [generatorStatus, setGeneratorStatus] = useState<string | null>(null);
  const [partLog, setPartLog] = useState<string[]>([]);
  const [undoStack, setUndoStack] = useState<ConceptConfig[]>([]);
  const [redoStack, setRedoStack] = useState<ConceptConfig[]>([]);
  const previousConfig = useRef(config);
  const historyAction = useRef(false);
  const lastHistoryAt = useRef(0);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(
    null
  );
  const missionPlanFileInputRef = useRef<HTMLInputElement>(null);
  const [missionPlanImportStatus, setMissionPlanImportStatus] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const activeCatalogProfile = activeProfile ?? (config.platformProfile
    ? findDroneProfile(config.platformProfile)
    : undefined);
  useEffect(() => {
    if (previousConfig.current === config) return;
    const before = previousConfig.current;
    previousConfig.current = config;
    if (historyAction.current) {
      historyAction.current = false;
      lastHistoryAt.current = 0;
      return;
    }
    const now = Date.now();
    if (JSON.stringify(before) !== JSON.stringify(config)) {
      if (now - lastHistoryAt.current > 350) {
        setUndoStack(stack => [...stack.slice(-49), before]);
      }
      setRedoStack([]);
      lastHistoryAt.current = now;
    }
  }, [config]);
  const undoConfiguration = () => {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    historyAction.current = true;
    setUndoStack(stack => stack.slice(0, -1));
    setRedoStack(stack => [...stack.slice(-49), config]);
    setConfig(previous);
  };
  const redoConfiguration = () => {
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    historyAction.current = true;
    setRedoStack(stack => stack.slice(0, -1));
    setUndoStack(stack => [...stack.slice(-49), config]);
    setConfig(next);
  };
  useEffect(() => {
    if (!demoRunning) return;
    const timer = window.setInterval(() => setDemoTick(value => value + 1), 80);
    return () => window.clearInterval(timer);
  }, [demoRunning]);
  const demoProgress = (demoTick % 160) / 160;
  const demoTransform = `translate(${Math.sin(demoProgress * Math.PI * 2) * 20 + flightResponse.rollDeg * 0.45}px, ${Math.cos(demoProgress * Math.PI * 2) * 8 + flightResponse.pitchDeg * 0.35}px) rotate(${rotation / 3 + flightResponse.yawDeg * 0.28}deg)`;
  const selectedWaypoint =
    missionPlan.waypoints.find(item => item.id === selectedWaypointId) ??
    missionPlan.waypoints[0];
  const updateConfig = (key: keyof ConceptConfig, value: number) =>
    setConfig({ ...config, [key]: value });
  const updateFlightControls = (patch: Partial<FlightControlsConfig>) =>
    setConfig({ ...config, flightControls: { ...flightControls, ...patch } });
  const updateMissionPlan = (patch: Partial<LocalMissionPlan>) =>
    setConfig({ ...config, missionPlan: { ...missionPlan, ...patch } });
  const importMissionPlanFile = async (file: File) => {
    setMissionPlanImportStatus(null);
    try {
      if (file.size > 128_000) {
        throw new Error("Le fichier dépasse la limite de 128 ko.");
      }
      const importedPlan = parseLocalMissionPlanJson(await file.text());
      updateMissionPlan(importedPlan);
      setSelectedWaypointId(importedPlan.waypoints[0]?.id ?? null);
      setMissionPlanImportStatus({
        kind: "success",
        message: `Parcours chargé : ${file.name} · ${importedPlan.waypoints.length} points.`,
      });
    } catch (error) {
      setMissionPlanImportStatus({
        kind: "error",
        message: `Import refusé : ${error instanceof Error ? error.message : "fichier illisible"}`,
      });
    }
  };
  const persistInstalledMaterials = (next: InstalledMaterial[]) =>
    setConfig({
      ...config,
      installedMaterials: next,
      constructionMassKg: installedPartsMassKg(next),
    });
  const updateInstalledMaterialMass = (id: string, massKg: number) => {
    const next = installedMaterials.map(item =>
      item.id === id
        ? { ...item, massKg: Number.isFinite(massKg) ? Math.max(0, massKg) : 0 }
        : item
    );
    persistInstalledMaterials(next);
  };
  const updateInstalledMaterialQuantity = (id: string, quantity: number) => {
    const next = installedMaterials.map(item =>
      item.id === id
        ? {
            ...item,
            quantity: Math.min(999, Math.max(1, Math.round(quantity || 1))),
          }
        : item
    );
    persistInstalledMaterials(next);
  };
  const toggleMaterial = (id: string) => {
    const item = materialOptions.find(material => material.id === id);
    if (!item) return;
    const next = installedMaterials.some(material => material.id === id)
      ? installedMaterials.filter(material => material.id !== id)
      : [...installedMaterials, item];
    persistInstalledMaterials(next);
  };
  const installAllMaterials = () => {
    const next = [
      ...installedMaterials.filter(item => item.id === "legacy-material-mass"),
      ...materialOptions,
    ];
    persistInstalledMaterials(next);
  };
  const resetMaterials = () => persistInstalledMaterials([]);
  const removeInstalledMaterial = (id: string) =>
    persistInstalledMaterials(
      installedMaterials.filter(item => item.id !== id)
    );
  /**
   * Exécute une commande locale sur une pièce installée, puis conserve la
   * nomenclature mise à jour avec le projet. Les références constructeur ne
   * voient jamais leurs champs produit réécrits.
   */
  const runPartCommand = (command: PartCommand) => {
    const outcome = applyPartCommand(installedMaterials, command);
    if (outcome.changed) persistInstalledMaterials(outcome.parts);
    if (command.kind === "duplicate") {
      const previousIds = new Set(installedMaterials.map(item => item.id));
      const duplicate = outcome.parts.find(item => !previousIds.has(item.id));
      if (duplicate) setSelectedComponent(`module-${duplicate.id}`);
    }
    setPartLog(log =>
      [...outcome.warnings, outcome.message, ...log].filter(Boolean).slice(0, 6)
    );
  };
  const selectedModuleId = selectedComponent.startsWith("module-")
    ? selectedComponent.slice(7)
    : null;
  const selectedModule = selectedModuleId
    ? (installedMaterials.find(item => item.id === selectedModuleId) ?? null)
    : null;
  const generateConceptProposal = () => {
    const proposal = buildConceptProposal(
      config.missionBrief?.trim() || DEFAULT_MISSION_BRIEF,
      config
    );
    setConceptProposal(proposal);
    setAcceptedProposalFields(
      Object.fromEntries(proposal.fields.map(field => [field.key, true]))
    );
    setGeneratorStatus(
      proposal.fields.length
        ? `Proposition préparée : ${proposal.fields.length} champ(s) à valider. Aucune modification appliquée.`
        : "Aucune valeur exploitable dans le brief : rien n’est proposé."
    );
  };
  const toggleProposalField = (key: ConceptFieldKey) =>
    setAcceptedProposalFields(previous => ({
      ...previous,
      [key]: !previous[key],
    }));
  const setAllProposalFields = (accepted: boolean) => {
    if (!conceptProposal) return;
    setAcceptedProposalFields(
      Object.fromEntries(
        conceptProposal.fields.map(field => [field.key, accepted])
      )
    );
  };
  const applyProposalToModel = () => {
    if (!conceptProposal) return;
    const keys = conceptProposal.fields
      .filter(field => acceptedProposalFields[field.key])
      .map(field => field.key);
    if (!keys.length) {
      setGeneratorStatus(
        "Aucun champ accepté : le modèle du projet reste strictement inchangé."
      );
      return;
    }
    setConfig(applyConceptProposal(config, conceptProposal, keys));
    setGeneratorStatus(
      `Proposition appliquée : ${keys.join(", ")}. Les autres champs du projet sont inchangés ; le bilan doit être recalculé.`
    );
    setConceptProposal(null);
  };
  const rejectConceptProposal = () => {
    setConceptProposal(null);
    setGeneratorStatus(
      "Proposition rejetée : le modèle du projet reste strictement inchangé."
    );
  };
  const addCatalogPart = (part: DronePartDefinition, quantity = 1) => {
    const instance: InstalledMaterial = {
      ...part,
      id: `${part.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      quantity: Math.min(999, Math.max(1, Math.round(quantity))),
      catalogSource: part.catalogSource ?? "concept",
      manufacturerDataStatus: part.manufacturerDataStatus ?? "estimate",
    };
    persistInstalledMaterials([...installedMaterials, instance]);
    setSelectedComponent(`module-${instance.id}`);
  };
  const addCustomPart = () => {
    const label = customPartName.trim();
    if (!label || !Number.isFinite(customPartMass) || customPartMass < 0)
      return;
    const instance: InstalledMaterial = {
      id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      label,
      use: "Pièce utilisateur — référence et compatibilité à documenter",
      massKg: customPartMass,
      quantity: 1,
      geometry: "mount",
      category: activePartCategory,
      catalogSource: "user",
      manufacturerDataStatus: "estimate",
    };
    persistInstalledMaterials([...installedMaterials, instance]);
    setCustomPartName("");
    setSelectedComponent(`module-${instance.id}`);
  };
  const addReinforcement = () => {
    const next = [
      ...installedMaterials,
      {
        id: `reinforcement-${Date.now()}`,
        label: "Renfort imprimé",
        use: "Clips et support de liaison",
        massKg: 0.18,
        geometry: "reinforcement" as const,
      },
    ];
    persistInstalledMaterials(next);
  };
  const addWaypointAt = (event: React.MouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(
      3,
      Math.min(97, ((event.clientX - bounds.left) / bounds.width) * 100)
    );
    const y = Math.max(
      3,
      Math.min(97, ((event.clientY - bounds.top) / bounds.height) * 100)
    );
    const waypoint: MissionWaypoint = {
      id: `WP-${Date.now()}`,
      name: `Point ${missionPlan.waypoints.length + 1}`,
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
      altitudeM: missionPlan.returnAltitudeM,
      speedKmh: config.cruiseSpeedKmh,
      action: "inspection",
    };
    updateMissionPlan({ waypoints: [...missionPlan.waypoints, waypoint] });
    setSelectedWaypointId(waypoint.id);
  };
  const updateSelectedWaypoint = (patch: Partial<MissionWaypoint>) => {
    if (!selectedWaypoint) return;
    updateMissionPlan({
      waypoints: missionPlan.waypoints.map(item =>
        item.id === selectedWaypoint.id ? { ...item, ...patch } : item
      ),
    });
  };
  const removeSelectedWaypoint = () => {
    if (!selectedWaypoint) return;
    const next = missionPlan.waypoints.filter(
      item => item.id !== selectedWaypoint.id
    );
    updateMissionPlan({ waypoints: next });
    setSelectedWaypointId(next[0]?.id ?? null);
  };
  const routePoints = [
    { x: missionPlan.homeX, y: missionPlan.homeY },
    ...missionPlan.waypoints,
    { x: missionPlan.homeX, y: missionPlan.homeY },
  ]
    .map(point => `${point.x * 5},${point.y * 3}`)
    .join(" ");
  const missionPathNodes = [
    { x: missionPlan.homeX, y: missionPlan.homeY },
    ...missionPlan.waypoints,
    { x: missionPlan.homeX, y: missionPlan.homeY },
  ];
  const missionSegments = Math.max(1, missionPathNodes.length - 1);
  const missionProgress = demoRunning
    ? ((demoTick % 800) / 800) * missionSegments
    : 0;
  const missionSegmentIndex = Math.min(
    Math.floor(missionProgress),
    missionSegments - 1
  );
  const missionSegmentFraction = missionProgress - missionSegmentIndex;
  const simulatedMapX =
    missionPathNodes[missionSegmentIndex].x +
    (missionPathNodes[missionSegmentIndex + 1].x -
      missionPathNodes[missionSegmentIndex].x) *
      missionSegmentFraction;
  const simulatedMapY =
    missionPathNodes[missionSegmentIndex].y +
    (missionPathNodes[missionSegmentIndex + 1].y -
      missionPathNodes[missionSegmentIndex].y) *
      missionSegmentFraction;
  const applyArchitecture = (
    airframe: NonNullable<ConceptConfig["airframe"]>
  ) => {
    const preset = architecturePresets[airframe];
    setConfig({
      ...config,
      ...(!config.airframe && !config.engineeringSelection?.droneId ? {
        windSpeedKmh: 8,
        altitudeM: 120,
        reserveFraction: defaultConcept.reserveFraction,
        maxTakeoffKg: defaultConcept.maxTakeoffKg,
      } : {}),
      ...preset,
      airframe,
      platformProfile: airframe,
      designName: `${preset.label} / variante générée`,
    });
  };
  const selected = !config.airframe
    ? {
        label: "Aucun composant",
        detail: "Choisissez une architecture ou un profil paramétré.",
        value: "—",
      }
    : selectedComponent === "wing"
      ? {
          label: "Aile principale",
          detail: "Envergure et corde issues du modèle de projet.",
          value: `${config.wingspan.toFixed(2)} m`,
        }
      : selectedComponent === "fuselage"
        ? {
            label: "Fuselage central",
            detail: "Longueur paramétrique du modèle de projet.",
            value: `${config.fuselageLength.toFixed(2)} m`,
          }
        : selectedComponent === "propeller"
          ? {
              label: "Propulsion",
              detail: "Hélice / rotors et consigne locale simulée.",
              value: `Ø ${config.propDiameter.toFixed(2)} m`,
            }
          : selectedComponent === "payload"
            ? {
                label: "Charge utile",
                detail: "Baie capteur et masse au bilan.",
                value: `${config.payloadKg.toFixed(2)} kg`,
              }
            : selectedComponent === "aileron"
              ? {
                  label: "Aileron / roulis",
                  detail:
                    "Surface mobile reliée aux commandes de vol simulées.",
                  value: `${flightResponse.aileronDeg.toFixed(1)}°`,
                }
              : selectedComponent === "elevator"
                ? {
                    label: "Profondeur / tangage",
                    detail:
                      "Surface mobile reliée aux commandes de vol simulées.",
                    value: `${flightResponse.elevatorDeg.toFixed(1)}°`,
                  }
                : selectedComponent === "rudder"
                  ? {
                      label: "Dérive / lacet",
                      detail:
                        "Surface mobile reliée aux commandes de vol simulées.",
                      value: `${flightResponse.rudderDeg.toFixed(1)}°`,
                    }
                  : selectedComponent.startsWith("module-")
                    ? (() => {
                        const module = installedMaterials.find(
                          item => item.id === selectedComponent.slice(7)
                        );
                        return {
                          label: module?.label ?? "Module installé",
                          detail:
                            module?.use ??
                            "Module lié à la nomenclature du projet.",
                          value: `${module?.massKg.toFixed(2) ?? "0.00"} kg`,
                        };
                      })()
                    : (componentDetails[selectedComponent] ??
                      (selectedComponent.startsWith("motor-")
                        ? {
                            label: `Moteur ${Number(selectedComponent.split("-")[1]) + 1}`,
                            detail:
                              "Sortie de mixage calculée localement à partir du throttle et des axes.",
                            value: `${flightResponse.motorOutputsPct[Number(selectedComponent.split("-")[1])] ?? 0}%`,
                          }
                        : componentDetails.fuselage));
  return (
    <div className="view-stack">
      <VirtualAssemblyWorkshop config={config} setConfig={setConfig} activeProfile={activeProfile} parts={installedMaterials} context="construction" onOpenLibrary={onOpenLibrary} />
      <SectionHeading
        eyebrow="02 / GÉOMÉTRIE PARAMÉTRIQUE"
        title="Constructeur de maquettes paramétriques"
        description="Assemblez une maquette 3D, choisissez des sous-ensembles et préparez une nomenclature de construction civile."
        action={
          <div className="header-actions">
            <button
              className="secondary-button history-button"
              onClick={undoConfiguration}
              disabled={!undoStack.length}
              title="Annuler la dernière modification du modèle"
            >
              <Undo2 size={14} /> Annuler
            </button>
            <button
              className="secondary-button history-button"
              onClick={redoConfiguration}
              disabled={!redoStack.length}
              title="Rétablir la dernière modification annulée"
            >
              <Redo2 size={14} /> Rétablir
            </button>
            <button className="secondary-button" onClick={onDuplicate}>
              <Copy size={15} /> Dupliquer
            </button>
            <button className="primary-button" onClick={onRunSimulation}>
              <Play size={15} fill="currentColor" /> Recalculer
            </button>
          </div>
        }
      />
      <section className="panel concept-panel concept-3d-library-preview">
        <div className="panel-header">
          <div>
            <p className="eyebrow">CONCEPT 3D / CONFIGURATION 03</p>
            <h3>
              {activeCatalogProfile
                ? `${activeCatalogProfile.label} · ${activeCatalogProfile.family}`
                : "Aucune architecture sélectionnée"}
            </h3>
          </div>
          <span className="calculated-badge">
            {activeCatalogProfile
              ? `BIBLIOTHÈQUE · ${activeCatalogProfile.id}`
              : "EN ATTENTE"}
          </span>
        </div>
        {activeCatalogProfile ? (
          <>
            <div className="concept-3d-zoom-toolbar" role="group" aria-label="Taille du visuel du drone">
              <span>ÉCHELLE VISUELLE</span>
              <button type="button" onClick={() => setConceptZoom(value => Math.max(0.7, Number((value - 0.1).toFixed(1))))} aria-label="Réduire le drone">−</button>
              <input type="range" min="0.7" max="1.8" step="0.1" value={conceptZoom} onChange={event => setConceptZoom(Number(event.target.value))} aria-label="Agrandir ou réduire le drone" />
              <button type="button" onClick={() => setConceptZoom(value => Math.min(1.8, Number((value + 0.1).toFixed(1))))} aria-label="Agrandir le drone">+</button>
              <strong>{Math.round(conceptZoom * 100)}%</strong>
              <button type="button" onClick={() => setConceptZoom(1)}>Réinitialiser</button>
            </div>
            <ParametricDronePreview
              design={{
                ...activeCatalogProfile,
                configuration: {
                  ...activeCatalogProfile.configuration,
                  ...config,
                },
              }}
              zoom={conceptZoom}
              construction={{
                parts: installedMaterials.length,
                massKg: installedMaterialMass,
              }}
            />
          </>
        ) : (
          <div className="copilot-empty-state simulation-empty-state">
            <div className="copilot-empty-orb">
              <Box size={24} />
            </div>
            <h3>Aucun visuel par défaut</h3>
            <p>
              Choisissez une fiche dans la Bibliothèque de drones pour afficher
              sa géométrie réelle dans le Concept 3D.
            </p>
          </div>
        )}
      </section>
      <DroneBehaviorPanel configuration={config} context="construction" />
      <section className="panel physical-construction-panel" aria-label="Construction matérielle du studio">
        <div className="panel-header">
          <div>
            <p className="eyebrow">STUDIO / CONSTRUCTION MATÉRIELLE</p>
            <h3>Pièces physiques liées au modèle</h3>
          </div>
          <span className="calculated-badge">{installedMaterials.length} composant(s) · {installedMaterialMass.toFixed(2)} kg</span>
        </div>
        <p className="section-description">
          La vue SVG reste une couche de visualisation. La source de construction est désormais la nomenclature matérielle ci-dessous : chaque élément doit être relié à une référence, une masse et un identifiant physique avant validation.
        </p>
        {installedMaterials.length ? (
          <div className="physical-material-grid">
            {installedMaterials.map(item => (
              <div className="physical-material-card" key={item.id}>
                <div><strong>{item.label}</strong><span className={`material-status status-${item.manufacturerDataStatus ?? "estimate"}`}>{item.manufacturerDataStatus === "verified" ? "SOURCE VÉRIFIÉE" : item.manufacturerDataStatus === "partial" ? "SOURCE PARTIELLE" : "À QUALIFIER"}</span></div>
                <small>{item.manufacturer ?? "Fabricant non renseigné"} · {item.partNumber ?? "Référence à attribuer"}</small>
                <small>ID physique : {item.physicalId ?? "à attribuer à la réception"} · {item.massKg.toFixed(3)} kg × {item.quantity ?? 1}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="inspector-note"><Info size={15} /> Aucune pièce matérielle n’est liée. Ajoutez des composants depuis l’onglet Matériaux & assemblages avant d’utiliser ce studio comme nomenclature.</div>
        )}
      </section>
      <EngineeringGuide
        eyebrow="CONSOLE DE RÉFÉRENCE / CONCEPT 3D"
        title="Construire sans polluer le projet"
        description="Ces repères sont des suggestions de travail : ils ne remplissent aucune donnée automatiquement. Cliquez pour les reprendre dans votre brief de mission, puis ajustez-les manuellement."
        suggestions={[
          "Inspection linéaire · endurance · retour supervisé",
          "Cartographie rapprochée · capteur stabilisé",
          "Transport civil · charge utile à définir",
        ]}
        onApply={suggestion =>
          setConfig({ ...config, missionBrief: suggestion })
        }
      />
      <section className="panel builder-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">CONSTRUCTEUR DE MAQUETTES</p>
            <h3>Générer une architecture drone</h3>
          </div>
          <span className="builder-status">
            <span className="live-dot" /> Paramétrique
          </span>
        </div>
        <p className="builder-copy">
          Choisissez une architecture et décrivez la mission. AeroMind prépare
          une variante visualisable et recalcule immédiatement son bilan
          préliminaire.
        </p>
        <div className="architecture-grid architecture-grid-expanded">
          {architectureChoices.map(choice => (
            <button
              key={choice.id}
              className={`architecture-card ${config.platformProfile === (catalogProfileForChoice[choice.id] ?? choice.id) ? "is-active" : ""}`}
              aria-pressed={
                config.platformProfile ===
                (catalogProfileForChoice[choice.id] ?? choice.id)
              }
              onClick={() => {
                const base = architecturePresets[choice.base];
                setConfig({
                  ...config,
                  ...base,
                  airframe: choice.base,
                  modelType: modelTypeForChoice[choice.id],
                  platformProfile:
                    catalogProfileForChoice[choice.id] ?? choice.id,
                  designName: `${choice.label} / variante manuelle`,
                  wingspan: choice.wingspan,
                  fuselageLength: choice.fuselageLength,
                  motorCount: choice.motors,
                  missionPlan: config.missionPlan
                    ? { ...config.missionPlan, profileId: choice.id }
                    : config.missionPlan,
                });
              }}
            >
              <span
                className={`architecture-icon architecture-${choice.base}`}
              />
              <span className="architecture-category">{choice.category}</span>
              <strong>{choice.label}</strong>
              <small>{choice.description}</small>
              <em>
                {choice.motors} moteur(s) · base{" "}
                {choice.base === "fixed-wing"
                  ? "voilure fixe"
                  : choice.base === "vtol"
                    ? "VTOL"
                    : "multirotor"}
              </em>
            </button>
          ))}
        </div>
        <div className="mission-brief-card">
          <div>
            <span className="eyebrow">MISSION / INTENTION D’INGÉNIERIE</span>
            <strong>Décrire ce que le drone doit accomplir</strong>
            <small>
              Cette note guide les choix ; elle ne constitue pas une exigence
              validée.
            </small>
          </div>
          <input
            aria-label="Brief de mission pour la maquette"
            value={config.missionBrief ?? ""}
            placeholder="Ex. inspection d’une ligne de 18 km, capteur stabilisé…"
            onChange={event =>
              setConfig({ ...config, missionBrief: event.target.value })
            }
          />
        </div>
        <div className="builder-actions">
          <button
            className="secondary-button"
            onClick={() =>
              downloadLocalFile(
                `${safeEngineeringFilename(config.designName ?? "aeromind")}.json`,
                buildEngineeringJson(config),
                "application/json"
              )
            }
          >
            <Download size={14} /> Exporter JSON
          </button>
          <button
            className="secondary-button"
            onClick={() =>
              downloadLocalFile(
                `${safeEngineeringFilename(config.designName ?? "aeromind")}.scad`,
                buildOpenScadModel(config),
                "text/plain;charset=utf-8"
              )
            }
          >
            <Download size={14} /> Exporter OpenSCAD
          </button>
          <button
            className="secondary-button"
            onClick={() =>
              downloadLocalFile(
                `${safeEngineeringFilename(config.designName ?? "aeromind")}-bom.csv`,
                buildBillOfMaterialsCsv(
                  config,
                  config.installedMaterials ?? []
                ),
                "text/csv;charset=utf-8"
              )
            }
          >
            <Download size={14} /> BOM CSV
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              const dossier = buildManufacturingPackage(
                config,
                (config.installedMaterials ?? []).map(item => ({
                  label: item.label,
                  mass: item.massKg,
                  use: item.use,
                }))
              );
              downloadLocalFile(
                `${safeEngineeringFilename(config.designName ?? "aeromind")}-dossier-fabrication.json`,
                JSON.stringify(dossier, null, 2),
                "application/json"
              );
            }}
          >
            <FileText size={14} /> Dossier fabrication
          </button>
        </div>
        <div className="concept-generator" aria-label="Générateur de concept">
          <div className="concept-generator-header">
            <div>
              <p className="eyebrow">
                GÉNÉRATEUR / BRIEF → MODÈLE PARAMÉTRIQUE
              </p>
              <h4>Proposition de variante à valider</h4>
            </div>
            <span className="generator-badge">
              <ShieldCheck size={13} /> Validation humaine requise
            </span>
          </div>
          <p className="concept-generator-copy">
            Le générateur lit le brief ci-dessus, reprend le profil de catalogue
            de l’architecture reconnue et extrapole l’énergie selon le modèle
            local. Chaque champ proposé indique sa source. Aucune valeur n’est
            écrite dans le projet avant votre validation explicite.
          </p>
          <div className="concept-generator-explainer" role="note">
            <strong>Pourquoi un champ peut apparaître « non retenu » ?</strong>
            <span>
              La commande libre IA prépare une proposition en lecture seule. «
              Non retenu » signifie que le champ n’a pas encore été accepté dans
              le projet ; ce n’est pas un refus de la commande ni une erreur de
              sécurité.
            </span>
          </div>
          <div className="concept-generator-actions">
            <button
              className="primary-button"
              onClick={generateConceptProposal}
            >
              <Sparkles size={15} /> Proposer une variante
            </button>
            {conceptProposal && (
              <>
                <button
                  className="secondary-button"
                  onClick={() => setAllProposalFields(true)}
                >
                  <Check size={14} /> Tout retenir
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setAllProposalFields(false)}
                >
                  <X size={14} /> Ne retenir aucun champ
                </button>
              </>
            )}
          </div>
          {generatorStatus && (
            <p className="concept-generator-status" role="status">
              {generatorStatus}
            </p>
          )}
          {conceptProposal && (
            <div className="concept-proposal">
              <div className="proposal-summary">
                <strong>{conceptProposal.summary}</strong>
                <span>{conceptProposal.architectureRationale}</span>
              </div>
              <div className="proposal-table-wrapper">
                <table className="proposal-table">
                  <thead>
                    <tr>
                      <th scope="col">Champ</th>
                      <th scope="col">Actuel</th>
                      <th scope="col">Proposé</th>
                      <th scope="col">Source</th>
                      <th scope="col">Justification</th>
                      <th scope="col">Décision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conceptProposal.fields.map(field => (
                      <tr
                        key={field.key}
                        className={
                          acceptedProposalFields[field.key]
                            ? "is-accepted"
                            : "is-refused"
                        }
                      >
                        <td>{field.label}</td>
                        <td>
                          {formatProposalValue(field.current, field.unit)}
                          {field.unit === "fraction" ? "" : ` ${field.unit}`}
                        </td>
                        <td>
                          <strong>
                            {formatProposalValue(field.proposed, field.unit)}
                            {field.unit === "fraction" ? "" : ` ${field.unit}`}
                          </strong>
                        </td>
                        <td>
                          {field.source}
                          {field.estimate ? " · estimation" : ""}
                        </td>
                        <td>{field.rationale}</td>
                        <td>
                          <label className="proposal-accept">
                            <input
                              type="checkbox"
                              checked={!!acceptedProposalFields[field.key]}
                              onChange={() => toggleProposalField(field.key)}
                              aria-label={`Retenir le champ ${field.label}`}
                            />
                            {acceptedProposalFields[field.key]
                              ? "Retenu dans le projet"
                              : "Non retenu · à décider"}
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="proposal-derived">
                {conceptProposal.derived.map(item => (
                  <div key={item.label} className="proposal-derived-card">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.note}</small>
                  </div>
                ))}
              </div>
              {conceptProposal.warnings.length > 0 && (
                <ul className="proposal-warnings" aria-label="Avertissements">
                  {conceptProposal.warnings.map(warning => (
                    <li key={warning}>
                      <AlertTriangle size={13} /> {warning}
                    </li>
                  ))}
                </ul>
              )}
              {conceptProposal.unknowns.length > 0 && (
                <ul
                  className="proposal-unknowns"
                  aria-label="Points à documenter"
                >
                  {conceptProposal.unknowns.map(item => (
                    <li key={item}>
                      <Info size={13} /> {item}
                    </li>
                  ))}
                </ul>
              )}
              <div className="concept-generator-actions">
                <button
                  className="primary-button"
                  onClick={applyProposalToModel}
                >
                  <Check size={15} /> Appliquer les champs retenus
                </button>
                <button
                  className="secondary-button"
                  onClick={rejectConceptProposal}
                >
                  <X size={15} /> Rejeter la proposition
                </button>
              </div>
              <p className="concept-generator-notice">
                {conceptProposal.notice}
              </p>
            </div>
          )}
        </div>
      </section>
      <section className="panel materials-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">ATELIER / NOMENCLATURE</p>
            <h3>Matériel de construction exploitable</h3>
          </div>
          <Wrench size={16} className="muted-icon" />
        </div>
        <p className="section-description">
          Sélectionnez une matière pour l’ajouter à la nomenclature active. Les
          masses sont injectées dans le bilan préliminaire et restent
          modifiables.
        </p>
        <div className="materials-grid">
          {materials.map(material => (
            <button
              key={material.id}
              className={`material-card ${material.status === "Installé" ? "is-installed" : ""}`}
              disabled={material.id === "battery"}
              title={
                material.id === "battery"
                  ? "La masse de batterie est déjà calculée à partir de sa capacité."
                  : undefined
              }
              onClick={() => toggleMaterial(material.id)}
            >
              <span className="material-status">{material.status}</span>
              <strong>{material.label}</strong>
              <small>{material.use}</small>
              <b>{material.mass.toFixed(2)} kg</b>
            </button>
          ))}
        </div>
        {installedMaterials.filter(item => item.id !== "legacy-material-mass")
          .length > 0 && (
          <div
            className="installed-module-editor"
            aria-label="Masse des modules installés"
          >
            {installedMaterials
              .filter(item => item.id !== "legacy-material-mass")
              .map(item => (
                <label key={item.id} className="installed-module-row">
                  <span>
                    <strong>{item.label}</strong>
                    <small>
                      {item.use} ·{" "}
                      {isManufacturerReference(item)
                        ? "masse produit documentée"
                        : "masse de concept"}
                      {clampPartScale(item.scale ?? 1) !== 1
                        ? ` · échelle ${clampPartScale(item.scale ?? 1).toFixed(2)}×`
                        : ""}
                    </small>
                  </span>
                  <span className="module-mass-input">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      step="0.01"
                      aria-label={`Masse unitaire de ${item.label}`}
                      value={item.massKg}
                      onChange={event =>
                        updateInstalledMaterialMass(
                          item.id,
                          Number(event.target.value)
                        )
                      }
                    />{" "}
                    kg/u
                  </span>
                  <span
                    className={`module-effective-mass ${describePartMass(item).estimated ? "is-estimate" : ""}`}
                    title={describePartMass(item).detail}
                  >
                    {describePartMass(item).label}
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`Retirer ${item.label}`}
                    onClick={() => removeInstalledMaterial(item.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </label>
              ))}
          </div>
        )}
        <div className="materials-actions">
          <button className="secondary-button" onClick={installAllMaterials}>
            Installer le catalogue
          </button>
          <button className="secondary-button" onClick={resetMaterials}>
            Réinitialiser la nomenclature
          </button>
          <button className="secondary-button" onClick={addReinforcement}>
            <Plus size={14} /> Ajouter un renfort
          </button>
        </div>
        <div className="materials-summary">
          <span>
            {
              installedMaterials.filter(
                item => item.id !== "legacy-material-mass"
              ).length
            }{" "}
            module(s) installé(s) · sauvegardé(s) avec le projet
          </span>
          <strong>
            {installedMaterialMass.toFixed(2)} kg ajoutés au bilan
          </strong>
        </div>
        <p className="materials-note">
          {installedPartsSummary.lineCount} ligne(s) ·{" "}
          {installedPartsSummary.manufacturerLines} référence(s) constructeur ·{" "}
          {installedPartsSummary.note}
        </p>
      </section>
      <div className={`concept-workspace ${config.airframe ? "" : "is-empty"}`}>
        <aside
          className="panel assembly-side-tools"
          aria-label="Barre d’outils de montage aéronautique"
        >
          <div className="panel-header">
            <div>
              <p className="eyebrow">STUDIO / OUTILS</p>
              <h3>Montage VTOL</h3>
            </div>
            <Wrench size={16} className="cyan-icon" />
          </div>
          <p className="side-tools-caption">
            Barre verticale inspirée des studios CAO, Photoshop et After
            Effects.
          </p>
          <div className="side-tool-stack">
            {[
              ["assemble", "Assembler", Box],
              ["parts", "Pièces drone", Package],
              ["airframe", "Architecture", Rotate3d],
              ["fuselage", "Cellule", Settings2],
              ["wing", "Ailes", SlidersHorizontal],
              ["motor", "Propulsion", Zap],
              ["bond", "Liaisons", Wrench],
              ["material", "Matériaux", Package],
              ["payload", "Charge utile", Box],
              ["measure", "Mesures", Ruler],
              ["performance", "Performances", Activity],
              ["range", "Rayon mission", Navigation],
              ["symmetry", "Symétrie", Orbit],
              ["mass", "Masse", Gauge],
              ["flight", "Commandes de vol", Navigation],
              ["fabrication", "Exports CAO", Download],
              ["video", "Timeline", Video],
            ].map(([id, label, Icon]) => (
              <button
                key={id as string}
                className={`side-tool-button ${activeAssemblyTool === id ? "is-active" : ""}`}
                onClick={() => setActiveAssemblyTool(id as string)}
                title={label as string}
              >
                <Icon size={15} />
                <span>{label as string}</span>
              </button>
            ))}
          </div>
          <div className="assembly-tool-workbench" aria-live="polite">
            {activeAssemblyTool === "assemble" && (
              <>
                <div>
                  <p className="eyebrow">MODE ASSEMBLAGE</p>
                  <strong>Rassembler une configuration civile</strong>
                  <span>
                    Activez les modules dans l’ordre souhaité, puis contrôlez la
                    nomenclature installée.
                  </span>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setActiveAssemblyTool("airframe")}
                >
                  <Box size={15} /> Choisir une architecture
                </button>
              </>
            )}
            {activeAssemblyTool === "parts" && (
              <div className="assembly-fields drone-parts-workbench">
                <div className="part-library-heading">
                  <strong>
                    {activePartLibrary === "manufacturer"
                      ? "Catalogue fabricants"
                      : "Pièces de concept"}
                  </strong>
                  <span>
                    {activePartLibrary === "manufacturer"
                      ? `${manufacturerPartCatalog.length} références sourcées`
                      : `${dronePartCatalog.length} modules génériques`}
                  </span>
                </div>
                <div
                  className="part-library-tabs"
                  role="group"
                  aria-label="Type de catalogue de pièces"
                >
                  <button
                    type="button"
                    className={
                      activePartLibrary === "manufacturer" ? "is-active" : ""
                    }
                    aria-pressed={activePartLibrary === "manufacturer"}
                    onClick={() => setActivePartLibrary("manufacturer")}
                  >
                    Fabricants ({manufacturerPartCatalog.length})
                  </button>
                  <button
                    type="button"
                    className={
                      activePartLibrary === "concept" ? "is-active" : ""
                    }
                    aria-pressed={activePartLibrary === "concept"}
                    onClick={() => setActivePartLibrary("concept")}
                  >
                    Concepts ({dronePartCatalog.length})
                  </button>
                </div>
                <label className="assembly-field">
                  Famille
                  <select
                    value={activePartCategory}
                    onChange={event =>
                      setActivePartCategory(
                        event.target.value as DronePartCategory
                      )
                    }
                  >
                    {dronePartCategories.map(category => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="assembly-field">
                  Quantité à ajouter
                  <input
                    type="number"
                    min="1"
                    max="64"
                    step="1"
                    value={partQuantityToAdd}
                    onChange={event =>
                      setPartQuantityToAdd(
                        Math.min(
                          64,
                          Math.max(
                            1,
                            Math.round(Number(event.target.value) || 1)
                          )
                        )
                      )
                    }
                    aria-label="Quantité de pièces à ajouter"
                  />
                </label>
                <div
                  className="drone-parts-list"
                  aria-label="Pièces disponibles"
                >
                  {(activePartLibrary === "manufacturer"
                    ? manufacturerPartCatalog
                    : dronePartCatalog
                  )
                    .filter(part => part.category === activePartCategory)
                    .map(part => (
                      <div className="drone-part-entry" key={part.id}>
                        <button
                          type="button"
                          className="drone-part-card"
                          onClick={() =>
                            addCatalogPart(part, partQuantityToAdd)
                          }
                          title={`Ajouter ${part.label} au modèle et à la nomenclature`}
                        >
                          <span>
                            <strong>{part.label}</strong>
                            {part.manufacturer && (
                              <small className="drone-part-manufacturer">
                                {part.manufacturer}
                                {part.partNumber ? ` · ${part.partNumber}` : ""}
                              </small>
                            )}
                            <small>{part.use}</small>
                            {part.electrical && (
                              <small>{part.electrical}</small>
                            )}
                            {part.interfaces && (
                              <small>{part.interfaces}</small>
                            )}
                            {part.compatibleAirframes?.length ? (
                              <small>
                                Architecture cible :{" "}
                                {part.compatibleAirframes
                                  .map(architecture =>
                                    architecture === "fixed-wing"
                                      ? "voilure fixe"
                                      : architecture === "quadcopter"
                                        ? "quadrirotor"
                                        : "VTOL"
                                  )
                                  .join(" / ")}
                              </small>
                            ) : null}
                            <small
                              className={`drone-part-data-status ${part.manufacturerDataStatus ?? "estimate"}`}
                            >
                              {part.manufacturerDataStatus === "verified"
                                ? "Masse publiée par le fabricant"
                                : part.manufacturerDataStatus === "partial"
                                  ? "Masse documentée — source à contrôler"
                                  : "Masse indicative — à confirmer"}
                            </small>
                          </span>
                          <b>{part.massKg.toFixed(3)} kg/u</b>
                          <Plus size={13} />
                        </button>
                        {part.productUrl && (
                          <a
                            className="drone-part-source-link"
                            href={part.productUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Fiche fabricant <ArrowUpRight size={11} />
                          </a>
                        )}
                      </div>
                    ))}
                  {(activePartLibrary === "manufacturer"
                    ? manufacturerPartCatalog
                    : dronePartCatalog
                  ).filter(part => part.category === activePartCategory)
                    .length === 0 && (
                    <small className="part-library-empty">
                      Aucune référence dans cette famille; les modules de
                      concept restent accessibles dans l’onglet voisin.
                    </small>
                  )}
                </div>
                <div className="custom-drone-part">
                  <strong>Créer une pièce personnalisée</strong>
                  <input
                    value={customPartName}
                    onChange={event => setCustomPartName(event.target.value)}
                    maxLength={60}
                    placeholder="Nom de la pièce"
                    aria-label="Nom de la pièce personnalisée"
                  />
                  <label className="assembly-field">
                    Masse estimée (kg)
                    <input
                      type="number"
                      min="0"
                      max="50"
                      step="0.001"
                      value={customPartMass}
                      onChange={event =>
                        setCustomPartMass(Number(event.target.value))
                      }
                      aria-label="Masse de la pièce personnalisée en kilogrammes"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!customPartName.trim()}
                    onClick={addCustomPart}
                  >
                    <Plus size={13} /> Ajouter au modèle
                  </button>
                </div>
                <div className="installed-drone-parts">
                  <div className="part-library-heading">
                    <strong>Installées dans ce modèle</strong>
                    <span>
                      {installedMaterials.filter(item => item.category).length}{" "}
                      lignes · {installedMaterialMass.toFixed(2)} kg
                    </span>
                  </div>
                  {installedMaterials.filter(item => item.category).length ? (
                    <div className="installed-drone-parts-list">
                      {installedMaterials
                        .filter(item => item.category)
                        .map(item => (
                          <div className="installed-drone-part" key={item.id}>
                            <span
                              title={`${item.use}${item.manufacturer ? ` · ${item.manufacturer} ${item.partNumber ?? ""}` : ""}`}
                            >
                              <strong>{item.label}</strong>
                              {item.manufacturer && (
                                <small>
                                  {item.manufacturer}
                                  {item.partNumber
                                    ? ` · ${item.partNumber}`
                                    : ""}
                                </small>
                              )}
                              {item.compatibleAirframes?.length ? (
                                <small>
                                  {item.compatibleAirframes
                                    .map(architecture =>
                                      architecture === "fixed-wing"
                                        ? "voilure fixe"
                                        : architecture === "quadcopter"
                                          ? "quadrirotor"
                                          : "VTOL"
                                    )
                                    .join(" / ")}
                                </small>
                              ) : null}
                            </span>
                            <input
                              type="number"
                              min="1"
                              max="999"
                              step="1"
                              aria-label={`Quantité de ${item.label}`}
                              value={item.quantity ?? 1}
                              onChange={event =>
                                updateInstalledMaterialQuantity(
                                  item.id,
                                  Number(event.target.value)
                                )
                              }
                            />
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              aria-label={`Masse unitaire de ${item.label} en kg`}
                              value={item.massKg}
                              onChange={event =>
                                updateInstalledMaterialMass(
                                  item.id,
                                  Number(event.target.value)
                                )
                              }
                            />
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`Retirer ${item.label} du modèle`}
                              onClick={() => removeInstalledMaterial(item.id)}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <small>Aucune pièce de la bibliothèque installée.</small>
                  )}
                </div>
                <small className="part-library-disclaimer">
                  {activePartLibrary === "manufacturer"
                    ? "Les fiches constructeur et masses publiées sont sourcées; la compatibilité système reste à valider."
                    : "Les masses sont des estimations de concept, pas des références fabricant."}{" "}
                  — Les quantités et masses unitaires sont conservées dans la
                  BOM et ajoutées aux corrélations de masse de base :
                  réconcilier ces postes avant fabrication. La maquette 3D reste
                  paramétrique et ne charge pas la géométrie STEP du produit.
                </small>
              </div>
            )}
            {activeAssemblyTool === "bond" && (
              <label className="assembly-field">
                Type de liaison
                <select
                  value={config.jointType ?? "Fixation mécanique M4"}
                  onChange={event =>
                    setConfig({
                      ...config,
                      jointType: event.target.value,
                    })
                  }
                >
                  <option>Fixation mécanique M4</option>
                  <option>Adhésif structurel</option>
                  <option>Interface rapide capteur</option>
                </select>
                <small>
                  Prévisualisation de montage uniquement · validation
                  structurelle requise.
                </small>
              </label>
            )}
            {activeAssemblyTool === "airframe" && (
              <label className="assembly-field">
                Architecture
                <select
                  value={config.airframe ?? "fixed-wing"}
                  onChange={event =>
                    applyArchitecture(
                      event.target.value as NonNullable<
                        ConceptConfig["airframe"]
                      >
                    )
                  }
                >
                  <option value="fixed-wing">Voilure fixe</option>
                  <option value="quadcopter">Multirotor</option>
                  <option value="vtol">VTOL civil</option>
                </select>
                <small>
                  Le choix actualise la maquette et ses paramètres associés.
                </small>
              </label>
            )}
            {activeAssemblyTool === "material" && (
              <label className="assembly-field">
                Famille de matériau
                <select
                  value={config.materialFamily ?? "Composite carbone"}
                  onChange={event =>
                    setConfig({ ...config, materialFamily: event.target.value })
                  }
                >
                  <option>Composite carbone</option>
                  <option>Aluminium 7075</option>
                  <option>Mousse EPP</option>
                  <option>Thermoplastique technique</option>
                </select>
                <small>
                  La nomenclature détaillée se construit ensuite dans Matériel
                  de construction.
                </small>
              </label>
            )}
            {activeAssemblyTool === "fuselage" && (
              <ParameterField
                label="Longueur du fuselage"
                value={config.fuselageLength}
                unit="m"
                min={config.airframe === "quadcopter" ? 0.3 : 1}
                max={config.airframe === "quadcopter" ? 2 : 2.6}
                step={0.05}
                onChange={value => updateConfig("fuselageLength", value)}
              />
            )}
            {activeAssemblyTool === "motor" && (
              <div className="assembly-fields">
                <label className="assembly-field">
                  Emplacement
                  <select
                    value={config.motorPosition ?? "Nacelle avant"}
                    onChange={event =>
                      setConfig({
                        ...config,
                        motorPosition: event.target.value,
                      })
                    }
                  >
                    <option>Nacelle avant</option>
                    <option>Nacelles sur aile</option>
                    <option>Configuration centrale</option>
                    <option>Bras multirotor</option>
                  </select>
                </label>
                <ParameterField
                  label="Nombre de moteurs"
                  value={config.motorCount ?? 1}
                  unit="u"
                  min={1}
                  max={8}
                  step={1}
                  onChange={value =>
                    setConfig({ ...config, motorCount: value })
                  }
                />
              </div>
            )}
            {activeAssemblyTool === "wing" && (
              <div className="assembly-fields">
                <ParameterField
                  label="Envergure"
                  value={config.wingspan}
                  unit="m"
                  min={config.airframe === "quadcopter" ? 0.5 : 1.8}
                  max={config.airframe === "quadcopter" ? 2.5 : 4.2}
                  step={0.1}
                  onChange={value => updateConfig("wingspan", value)}
                />
                <ParameterField
                  label="Corde"
                  value={config.chord}
                  unit="m"
                  min={0.2}
                  max={0.55}
                  step={0.01}
                  onChange={value => updateConfig("chord", value)}
                />
              </div>
            )}
            {activeAssemblyTool === "payload" && (
              <div className="assembly-fields">
                <label className="assembly-field">
                  Intégration
                  <select
                    value={
                      config.payloadIntegration ?? "Baie capteur stabilisée"
                    }
                    onChange={event =>
                      setConfig({
                        ...config,
                        payloadIntegration: event.target.value,
                      })
                    }
                  >
                    <option>Baie capteur stabilisée</option>
                    <option>Charge d’inspection optique</option>
                    <option>Module télémétrie</option>
                    <option>Plateau expérimental</option>
                  </select>
                </label>
                <ParameterField
                  label="Masse utile"
                  value={config.payloadKg}
                  unit="kg"
                  min={0.2}
                  max={5}
                  step={0.1}
                  onChange={value => updateConfig("payloadKg", value)}
                />
              </div>
            )}
            {activeAssemblyTool === "performance" && (
              <div className="assembly-fields">
                <ParameterField
                  label="Vitesse de croisière"
                  value={config.cruiseSpeedKmh}
                  unit="km/h"
                  min={10}
                  max={150}
                  step={1}
                  onChange={value => updateConfig("cruiseSpeedKmh", value)}
                />
                <ParameterField
                  label="Vent de conception"
                  value={config.windSpeedKmh}
                  unit="km/h"
                  min={0}
                  max={80}
                  step={1}
                  onChange={value => updateConfig("windSpeedKmh", value)}
                />
                <ParameterField
                  label="Réserve batterie"
                  value={config.reserveFraction * 100}
                  unit="%"
                  min={5}
                  max={50}
                  step={1}
                  onChange={value =>
                    updateConfig("reserveFraction", value / 100)
                  }
                />
                <ParameterField
                  label="Masse maximale déclarée"
                  value={config.maxTakeoffKg}
                  unit="kg"
                  min={1}
                  max={50}
                  step={0.1}
                  onChange={value => updateConfig("maxTakeoffKg", value)}
                />
                <ParameterField
                  label="Altitude du scénario"
                  value={config.altitudeM}
                  unit="m"
                  min={10}
                  max={1000}
                  step={5}
                  onChange={value => updateConfig("altitudeM", value)}
                />
                <small className="assembly-field-note">
                  Valeurs de scénario pour l’étude. Le plafond réglementaire,
                  les limites certifiées et les performances réelles ne sont pas
                  déduits automatiquement.
                </small>
              </div>
            )}
            {activeAssemblyTool === "range" && (
              <div className="assembly-fields">
                <label className="assembly-field">
                  Nom de l’opération d’essai
                  <select
                    value={
                      missionPlan.operationName ?? defaultTrialOperation.name
                    }
                    onChange={event =>
                      updateMissionPlan({ operationName: event.target.value })
                    }
                  >
                    {trialOperations.map(operation => (
                      <option key={operation.id} value={operation.name}>
                        {operation.name} · {operation.objective}
                      </option>
                    ))}
                  </select>
                  <small>
                    {
                      findTrialOperation(
                        trialOperations.find(
                          item =>
                            item.name ===
                            (missionPlan.operationName ??
                              defaultTrialOperation.name)
                        )?.id
                      ).safetyGate
                    }
                  </small>
                </label>
                <label className="assembly-field">
                  Profil de mission local
                  <select
                    value={missionPlan.profileId ?? "line-inspection"}
                    onChange={event => {
                      const profileId = event.target.value as MissionTemplateId;
                      updateMissionPlan({
                        profileId,
                        waypoints: buildMissionTemplate(profileId, config),
                      });
                    }}
                  >
                    <option value="line-inspection">Inspection linéaire</option>
                    <option value="area-grid">
                      Cartographie en quadrillage
                    </option>
                    <option value="perimeter">Inspection de périmètre</option>
                    <option value="direct-return">Observation et retour</option>
                  </select>
                </label>
                <label className="assembly-field">
                  <span>
                    Demi-rayon du canevas local{" "}
                    <strong>{missionPlan.radiusKm} km</strong>
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={80}
                    value={missionPlan.radiusKm}
                    onChange={event =>
                      updateMissionPlan({
                        radiusKm: Number(event.target.value),
                      })
                    }
                  />
                  <small>
                    Échelle de la prévisualisation schématique; aucune
                    navigation réelle.
                  </small>
                </label>
              </div>
            )}
            {activeAssemblyTool === "measure" && (
              <div className="assembly-readout">
                <strong>Mesures du modèle</strong>
                <span>Envergure · {config.wingspan.toFixed(2)} m</span>
                <span>Corde · {config.chord.toFixed(2)} m</span>
                <span>Fuselage · {config.fuselageLength.toFixed(2)} m</span>
              </div>
            )}
            {activeAssemblyTool === "symmetry" && (
              <div className="assembly-readout">
                <strong>Symétrie de conception</strong>
                <span>
                  État du modèle ·{" "}
                  {config.symmetric === false ? "désactivée" : "activée"}
                </span>
                <button
                  className="secondary-button"
                  onClick={() =>
                    setConfig({
                      ...config,
                      symmetric: config.symmetric === false,
                    })
                  }
                >
                  {config.symmetric === false
                    ? "Activer la symétrie"
                    : "Désactiver la symétrie"}
                </button>
                <small>
                  Le repère de symétrie est affiché dans la maquette; les
                  tolérances physiques restent à vérifier.
                </small>
              </div>
            )}
            {activeAssemblyTool === "mass" && (
              <div className="assembly-readout">
                <strong>Bilan de masse calculé</strong>
                <span>
                  Masse totale · {runSimulation(config).totalMassKg.toFixed(2)}{" "}
                  kg
                </span>
                <span>
                  Masse de construction · {installedMaterialMass.toFixed(2)} kg
                </span>
                <button className="text-button" onClick={onRunSimulation}>
                  Recalculer le bilan <ArrowRight size={13} />
                </button>
              </div>
            )}
            {activeAssemblyTool === "flight" && (
              <div className="assembly-readout">
                <strong>Simulation de vol locale</strong>
                <span>Mode · {flightResponse.profile}</span>
                <span>
                  Roulis / tangage · {flightResponse.rollDeg.toFixed(1)}° /{" "}
                  {flightResponse.pitchDeg.toFixed(1)}°
                </span>
                <button
                  className="secondary-button"
                  onClick={() =>
                    document
                      .getElementById("flight-engineering-panel")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                >
                  Ouvrir les commandes complètes
                </button>
                <small>
                  Simulation uniquement; aucune liaison ni commande vers un
                  appareil.
                </small>
              </div>
            )}
            {activeAssemblyTool === "fabrication" && (
              <div className="assembly-readout">
                <strong>Sorties paramétriques</strong>
                <span>OpenSCAD · géométrie de concept (mm)</span>
                <span>BOM · matériaux installés et masses</span>
                <button
                  className="secondary-button"
                  onClick={() =>
                    downloadLocalFile(
                      `${safeEngineeringFilename(config.designName ?? "aeromind")}.scad`,
                      buildOpenScadModel(config),
                      "text/plain;charset=utf-8"
                    )
                  }
                >
                  Télécharger le modèle SCAD
                </button>
                <button
                  className="secondary-button"
                  onClick={() =>
                    downloadLocalFile(
                      `${safeEngineeringFilename(config.designName ?? "aeromind")}-bom.csv`,
                      buildBillOfMaterialsCsv(
                        config,
                        config.installedMaterials ?? []
                      ),
                      "text/csv;charset=utf-8"
                    )
                  }
                >
                  Télécharger BOM CSV
                </button>
                <small>
                  Concept préliminaire à revoir et dimensionner avant
                  fabrication.
                </small>
              </div>
            )}
            {activeAssemblyTool === "video" && (
              <div className="assembly-readout">
                <strong>Aperçu visuel</strong>
                <span>
                  {videoPreview ? "Aperçu activé" : "Aperçu en pause"}
                </span>
                <button
                  className="secondary-button"
                  onClick={() => setVideoPreview(value => !value)}
                >
                  {videoPreview ? "Mettre en pause" : "Activer l’aperçu"}
                </button>
              </div>
            )}
          </div>
          <div className="side-tools-status">
            <span className="live-dot" /> Outils prêts · contrôle humain
          </div>
        </aside>
        <section className="panel concept-main-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">
                AEROMIND / ARCHITECTURE{" "}
                {config.airframe === "quadcopter"
                  ? "MULTIROTOR"
                  : config.airframe === "vtol"
                    ? "VTOL"
                    : config.airframe === "fixed-wing"
                      ? "VOILURE FIXE"
                      : "AUCUNE SÉLECTION"}
              </p>
              <h3>{config.designName ?? "Maquette numérique préliminaire"}</h3>
            </div>
            <div className="panel-status">
              <span className="live-dot" /> Synchronisé
            </div>
          </div>
          <ConceptCanvas
            config={config}
            selected={selectedComponent}
            onSelect={setSelectedComponent}
            rotation={rotation}
            rotationX={rotationX}
            rotationY={rotationY}
            zoom={zoom}
            setRotation={setRotation}
            setRotationX={setRotationX}
            setRotationY={setRotationY}
            setZoom={setZoom}
          />
          <div className="component-strip">
            {Object.entries(componentDetails).map(([id, item]) => (
              <button
                key={id}
                className={`component-chip ${selectedComponent === id ? "is-selected" : ""}`}
                onClick={() => setSelectedComponent(id)}
              >
                <span className="component-chip-dot" />
                <span>{item.label}</span>
                <small>{item.value}</small>
              </button>
            ))}
          </div>
        </section>
        <aside className="panel parameter-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">INSPECTEUR</p>
              <h3>{selected.label}</h3>
            </div>
            <Settings2 size={16} className="muted-icon" />
          </div>
          <p className="selected-detail">{selected.detail}</p>
          {config.airframe ? (
            <div className="parameter-form">
              <ParameterField
                label="Envergure"
                value={config.wingspan}
                unit="m"
                min={config.airframe === "quadcopter" ? 0.5 : 1.8}
                max={config.airframe === "quadcopter" ? 2.5 : 4.2}
                step={0.1}
                onChange={value => updateConfig("wingspan", value)}
              />
              <ParameterField
                label="Corde moyenne"
                value={config.chord}
                unit="m"
                min={0.2}
                max={0.55}
                step={0.01}
                onChange={value => updateConfig("chord", value)}
              />
              <ParameterField
                label="Longueur fuselage"
                value={config.fuselageLength}
                unit="m"
                min={config.airframe === "quadcopter" ? 0.3 : 1}
                max={config.airframe === "quadcopter" ? 2 : 2.6}
                step={0.05}
                onChange={value => updateConfig("fuselageLength", value)}
              />
              <ParameterField
                label="Diamètre hélice"
                value={config.propDiameter}
                unit="m"
                min={0.25}
                max={0.65}
                step={0.01}
                onChange={value => updateConfig("propDiameter", value)}
              />
              <ParameterField
                label="Capacité batterie"
                value={config.batteryWh}
                unit="Wh"
                min={400}
                max={1400}
                step={10}
                onChange={value => updateConfig("batteryWh", value)}
              />
              <ParameterField
                label="Nombre de moteurs"
                value={config.motorCount ?? 1}
                unit="u"
                min={1}
                max={8}
                step={1}
                onChange={value => setConfig({ ...config, motorCount: value })}
              />
            </div>
          ) : (
            <div className="human-input-gate">
              <ShieldCheck size={20} />
              <strong>Saisie humaine obligatoire</strong>
              <span>
                Aucune géométrie, exigence ou architecture n’est injectée par
                AeroMind AI. Sélectionnez une architecture ci-dessus ou ouvrez
                le catalogue pour commencer.
              </span>
            </div>
          )}
          {selectedModule && (
            <>
              <div className="inspector-divider" />
              <div
                className="part-commands"
                aria-label={`Commandes de la pièce ${selectedModule.label}`}
              >
                <div className="part-commands-header">
                  <strong>Commandes de pièce</strong>
                  <span>
                    {isManufacturerReference(selectedModule)
                      ? "Référence constructeur"
                      : "Pièce de concept"}
                  </span>
                </div>
                <p className="part-commands-mass">
                  Masse au bilan :{" "}
                  <strong>{describePartMass(selectedModule).label}</strong> ·{" "}
                  {describePartMass(selectedModule).detail}
                </p>
                <div className="part-command-row">
                  <span className="part-command-label">Déplacer</span>
                  <button
                    className="icon-button"
                    aria-label={`Déplacer ${selectedModule.label} vers la gauche`}
                    onClick={() =>
                      runPartCommand({
                        kind: "move",
                        id: selectedModule.id,
                        dx: -PART_NUDGE_STEP,
                        dy: 0,
                      })
                    }
                  >
                    ←
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Déplacer ${selectedModule.label} vers la droite`}
                    onClick={() =>
                      runPartCommand({
                        kind: "move",
                        id: selectedModule.id,
                        dx: PART_NUDGE_STEP,
                        dy: 0,
                      })
                    }
                  >
                    →
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Déplacer ${selectedModule.label} vers le haut`}
                    onClick={() =>
                      runPartCommand({
                        kind: "move",
                        id: selectedModule.id,
                        dx: 0,
                        dy: -PART_NUDGE_STEP,
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Déplacer ${selectedModule.label} vers le bas`}
                    onClick={() =>
                      runPartCommand({
                        kind: "move",
                        id: selectedModule.id,
                        dx: 0,
                        dy: PART_NUDGE_STEP,
                      })
                    }
                  >
                    ↓
                  </button>
                </div>
                <div className="part-command-row">
                  <span className="part-command-label">Échelle</span>
                  <button
                    className="icon-button"
                    aria-label={`Réduire ${selectedModule.label}`}
                    onClick={() =>
                      runPartCommand({
                        kind: "scale",
                        id: selectedModule.id,
                        factor: 1 - PART_SCALE_STEP,
                      })
                    }
                  >
                    −
                  </button>
                  <strong className="part-scale-value">
                    {clampPartScale(selectedModule.scale ?? 1).toFixed(2)}×
                  </strong>
                  <button
                    className="icon-button"
                    aria-label={`Agrandir ${selectedModule.label}`}
                    onClick={() =>
                      runPartCommand({
                        kind: "scale",
                        id: selectedModule.id,
                        factor: 1 + PART_SCALE_STEP,
                      })
                    }
                  >
                    +
                  </button>
                </div>
                <div className="part-command-grid">
                  <label>
                    Position X (%)
                    <input
                      type="number"
                      min={-35}
                      max={35}
                      step={1}
                      aria-label={`Position horizontale de ${selectedModule.label}`}
                      value={selectedModule.offsetX ?? 0}
                      onChange={event =>
                        runPartCommand({
                          kind: "move",
                          id: selectedModule.id,
                          dx:
                            Number(event.target.value) -
                            (selectedModule.offsetX ?? 0),
                          dy: 0,
                        })
                      }
                    />
                  </label>
                  <label>
                    Position Y (%)
                    <input
                      type="number"
                      min={-35}
                      max={35}
                      step={1}
                      aria-label={`Position verticale de ${selectedModule.label}`}
                      value={selectedModule.offsetY ?? 0}
                      onChange={event =>
                        runPartCommand({
                          kind: "move",
                          id: selectedModule.id,
                          dx: 0,
                          dy:
                            Number(event.target.value) -
                            (selectedModule.offsetY ?? 0),
                        })
                      }
                    />
                  </label>
                  <label>
                    Quantité
                    <input
                      type="number"
                      min={1}
                      max={999}
                      step={1}
                      aria-label={`Quantité de ${selectedModule.label}`}
                      value={Math.max(
                        1,
                        Math.round(selectedModule.quantity ?? 1)
                      )}
                      onChange={event =>
                        runPartCommand({
                          kind: "quantity",
                          id: selectedModule.id,
                          quantity: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <div className="part-command-row">
                  <button
                    className="secondary-button"
                    onClick={() =>
                      runPartCommand({
                        kind: "duplicate",
                        id: selectedModule.id,
                      })
                    }
                  >
                    <Copy size={14} /> Dupliquer
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      runPartCommand({
                        kind: "reset-transform",
                        id: selectedModule.id,
                      })
                    }
                  >
                    <RotateCcw size={14} /> Réinitialiser
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      runPartCommand({ kind: "remove", id: selectedModule.id });
                      setSelectedComponent("fuselage");
                    }}
                  >
                    <Trash2 size={14} /> Supprimer
                  </button>
                </div>
                {partLog.length > 0 && (
                  <ul className="part-log" aria-label="Journal des pièces">
                    {partLog.slice(0, 3).map((entry, index) => (
                      <li key={`${entry}-${index}`}>{entry}</li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
          <div className="inspector-divider" />
          <div className="inspector-summary">
            <span>Version géométrique</span>
            <strong>GEO-03 / active</strong>
            <span>Unités</span>
            <strong>SI · métrique</strong>
            <span>Provenance</span>
            <strong>Paramètre utilisateur</strong>
          </div>
          <div className="inspector-note">
            <Info size={15} />
            <span>
              Les paramètres modifiés recalculent les indicateurs, mais ne
              constituent pas une validation aérodynamique.
            </span>
          </div>
        </aside>
      </div>
      <section
        className="panel engineering-review-panel"
        aria-labelledby="engineering-review-title"
      >
        <div className="panel-header engineering-review-header">
          <div>
            <p className="eyebrow">REVUE DE CONCEPTION / CONTRÔLES LOCAUX</p>
            <h3 id="engineering-review-title">
              État d’ingénierie & données manquantes
            </h3>
          </div>
          <div
            className="engineering-review-counts"
            aria-label="Synthèse des contrôles"
          >
            <span className="engineering-count-pass">
              {engineeringCounts.pass} cohérents
            </span>
            <span className="engineering-count-review">
              {engineeringCounts.review} à revoir
            </span>
            <span className="engineering-count-block">
              {engineeringCounts.block} bloquants
            </span>
          </div>
        </div>
        <div className="engineering-check-grid">
          {engineeringChecks.map(check => {
            const CheckIcon =
              check.status === "pass"
                ? CheckCircle2
                : check.status === "block"
                  ? AlertTriangle
                  : Info;
            return (
              <article
                key={check.id}
                className={`engineering-check engineering-check-${check.status}`}
              >
                <CheckIcon size={15} aria-hidden="true" />
                <div>
                  <div className="engineering-check-heading">
                    <small>{check.discipline}</small>
                    <span>
                      {check.status === "pass"
                        ? "COHÉRENT"
                        : check.status === "block"
                          ? "BLOQUANT"
                          : "REVUE REQUISE"}
                    </span>
                  </div>
                  <strong>{check.label}</strong>
                  <p>{check.detail}</p>
                </div>
              </article>
            );
          })}
        </div>
        <div className="engineering-review-boundary">
          <ShieldCheck size={14} />
          <span>
            Revue préliminaire uniquement : aucun résultat ne vaut validation
            structurelle, navigabilité, conformité réglementaire ou autorisation
            de vol.
          </span>
        </div>
      </section>
      <div className="concept-lower-grid">
        <section
          className="panel control-surface-panel"
          id="flight-engineering-panel"
        >
          <div className="panel-header">
            <div>
              <p className="eyebrow">VOL / COMMANDES ET TÉLÉMÉTRIE SIMULÉS</p>
              <h3>Poste de commande de vol</h3>
            </div>
            <Rotate3d size={16} className="muted-icon" />
          </div>
          <div className="simulation-boundary">
            <ShieldCheck size={15} /> SIMULATION LOCALE — aucune liaison, aucun
            ordre envoyé à un drone réel.
          </div>
          <div
            className="flight-mode-tabs"
            role="group"
            aria-label="Mode de simulation"
          >
            {(
              [
                ["manual", "Direct"],
                ["stabilized", "Stabilisé"],
                ["mission", "Guidage mission"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                className={flightControls.mode === mode ? "is-active" : ""}
                onClick={() => updateFlightControls({ mode })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="surface-grid">
            {(
              [
                [
                  "aileronDeg",
                  config.airframe === "quadcopter"
                    ? "Roulis / mix moteurs"
                    : "Aileron / roulis",
                ],
                [
                  "elevatorDeg",
                  config.airframe === "quadcopter"
                    ? "Tangage / mix moteurs"
                    : "Profondeur / tangage",
                ],
                [
                  "rudderDeg",
                  config.airframe === "quadcopter"
                    ? "Lacet / mix moteurs"
                    : "Dérive / lacet",
                ],
                ["trimDeg", "Trim simulé"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="surface-field">
                <span>
                  {label}
                  <strong>{flightControls[key]}°</strong>
                </span>
                <input
                  aria-label={label}
                  type="range"
                  min={-30}
                  max={30}
                  step={1}
                  value={flightControls[key]}
                  onChange={event =>
                    updateFlightControls({ [key]: Number(event.target.value) })
                  }
                />
              </label>
            ))}
            <label className="surface-field throttle-field">
              <span>
                Poussée / throttle simulé
                <strong>{flightControls.throttlePct}%</strong>
              </span>
              <input
                aria-label="Poussée / throttle simulé"
                type="range"
                min={0}
                max={100}
                step={1}
                value={flightControls.throttlePct}
                onChange={event =>
                  updateFlightControls({
                    throttlePct: Number(event.target.value),
                  })
                }
              />
            </label>
            {config.airframe === "vtol" && (
              <label className="surface-field throttle-field">
                <span>
                  Transition VTOL — état géométrique
                  <strong>{flightControls.transitionPct}%</strong>
                </span>
                <input
                  aria-label="Transition VTOL simulée"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={flightControls.transitionPct}
                  onChange={event =>
                    updateFlightControls({
                      transitionPct: Number(event.target.value),
                    })
                  }
                />
              </label>
            )}
          </div>
          <details className="flight-advanced-settings">
            <summary>Réglages avancés des actionneurs simulés</summary>
            <div className="surface-grid">
              <label className="surface-field">
                <span>
                  Limite servo<strong>{flightControls.servoLimitDeg}°</strong>
                </span>
                <input
                  type="range"
                  min={5}
                  max={45}
                  value={flightControls.servoLimitDeg}
                  onChange={event =>
                    updateFlightControls({
                      servoLimitDeg: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="surface-field">
                <span>
                  Vitesse servo indicative
                  <strong>{flightControls.servoRateDegPerSec}°/s</strong>
                </span>
                <input
                  type="range"
                  min={10}
                  max={180}
                  step={5}
                  value={flightControls.servoRateDegPerSec}
                  onChange={event =>
                    updateFlightControls({
                      servoRateDegPerSec: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
          </details>
          <div className="flight-telemetry-grid" aria-live="polite">
            <div>
              <small>ROULIS SIM.</small>
              <strong>{flightResponse.rollDeg.toFixed(1)}°</strong>
            </div>
            <div>
              <small>TANGAGE SIM.</small>
              <strong>{flightResponse.pitchDeg.toFixed(1)}°</strong>
            </div>
            <div>
              <small>LACET SIM.</small>
              <strong>{flightResponse.yawDeg.toFixed(1)}°</strong>
            </div>
            <div>
              <small>VITESSE INDICATIVE</small>
              <strong>{flightResponse.airspeedKmh.toFixed(1)} km/h</strong>
            </div>
            <div>
              <small>PUISSANCE ESTIMÉE</small>
              <strong>{flightResponse.powerW} W</strong>
            </div>
            <div>
              <small>SORTIES MOTEUR</small>
              <strong>{flightResponse.motorOutputsPct.length} canaux</strong>
            </div>
          </div>
          <div className="motor-output-grid">
            {flightResponse.motorOutputsPct.map((value, index) => (
              <div key={index} className="motor-output">
                <span>M{index + 1}</span>
                <div>
                  <i style={{ width: `${value}%` }} />
                </div>
                <b>{value}%</b>
              </div>
            ))}
          </div>
          <div className="surface-actions">
            <button
              className="secondary-button"
              onClick={() =>
                updateFlightControls({
                  aileronDeg: 0,
                  elevatorDeg: 0,
                  rudderDeg: 0,
                  trimDeg: 0,
                })
              }
            >
              Centrer les axes
            </button>
            <button
              className="secondary-button"
              onClick={() =>
                updateFlightControls({
                  mode: "stabilized",
                  aileronDeg: 6,
                  elevatorDeg: 3,
                  rudderDeg: 2,
                  trimDeg: 0,
                  throttlePct: 42,
                })
              }
            >
              Charger un profil stable
            </button>
            <button
              className="primary-button"
              onClick={() => setDemoRunning(value => !value)}
            >
              {demoRunning ? <Pause size={14} /> : <Play size={14} />}{" "}
              {demoRunning
                ? "Arrêter la simulation"
                : "Lancer la simulation locale"}
            </button>
          </div>
          <div
            className={`surface-status ${flightResponse.saturated ? "has-warning" : ""}`}
          >
            {flightResponse.saturated ? (
              <AlertTriangle size={14} />
            ) : (
              <CheckCircle2 size={14} />
            )}
            {flightResponse.saturated
              ? `Saturation : sorties limitées à ±${flightControls.servoLimitDeg}°.`
              : `${flightResponse.profile} · valeurs sauvegardées au projet.`}
          </div>
        </section>

        <section className="panel video-panel mission-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">NAVIGATION / PLAN LOCAL</p>
              <h3>Plan de mission local</h3>
            </div>
            <Navigation size={16} className="muted-icon" />
          </div>
          <p className="mission-panel-intro">
            Définissez les points et limites manuellement. Cette carte est
            schématique et locale ; elle ne pilote aucun aéronef.
          </p>
          <div className="mission-map-toolbar">
            <span>
              <span className="live-dot" /> CARTE SCHÉMATIQUE LOCALE
            </span>
            <strong>{missionDistanceKm.toFixed(2)} km A/R estimés</strong>
          </div>
          <svg
            className="mission-route-map"
            viewBox="0 0 500 300"
            role="img"
            aria-label="Carte locale de planification; cliquer pour ajouter un point"
            onClick={addWaypointAt}
          >
            <defs>
              <pattern
                id="routeGrid"
                width="25"
                height="25"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 25 0 L 0 0 0 25"
                  fill="none"
                  stroke="rgba(117,226,220,.12)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="500" height="300" fill="url(#routeGrid)" />
            <path
              className="mission-corridor"
              d="M 20 240 C 120 190,180 210,250 150 S 390 70,470 60"
            />
            <polyline className="mission-route-line" points={routePoints} />
            <circle
              className="mission-home"
              cx={missionPlan.homeX * 5}
              cy={missionPlan.homeY * 3}
              r="10"
            />
            <text x={missionPlan.homeX * 5 + 12} y={missionPlan.homeY * 3 + 4}>
              BASE
            </text>
            {missionPlan.waypoints.map((point, index) => (
              <g
                key={point.id}
                className={`mission-waypoint ${selectedWaypoint?.id === point.id ? "is-selected" : ""}`}
                onClick={event => {
                  event.stopPropagation();
                  setSelectedWaypointId(point.id);
                }}
                role="button"
                aria-label={`Sélectionner ${point.name}`}
                tabIndex={0}
              >
                <circle
                  cx={point.x * 5}
                  cy={point.y * 3}
                  r={selectedWaypoint?.id === point.id ? 9 : 7}
                />
                <text x={point.x * 5 + 10} y={point.y * 3 - 9}>
                  P{index + 1}
                </text>
              </g>
            ))}
            <circle
              className={`mission-simulated-aircraft ${demoRunning ? "is-moving" : ""}`}
              cx={simulatedMapX * 5}
              cy={simulatedMapY * 3}
              r="6"
            />
            <text className="map-scale-label" x="490" y="288" textAnchor="end">
              largeur affichée : {(missionPlan.radiusKm * 2).toFixed(0)} km
            </text>
          </svg>
          <div className="mission-controls-row">
            <label className="surface-field">
              <span>
                Demi-largeur du canevas
                <strong>{missionPlan.radiusKm} km</strong>
              </span>
              <input
                aria-label="Demi-largeur du canevas local"
                type="range"
                min={1}
                max={80}
                value={missionPlan.radiusKm}
                onChange={event =>
                  updateMissionPlan({ radiusKm: Number(event.target.value) })
                }
              />
            </label>
            <label className="surface-field">
              <span>
                Altitude retour simulée
                <strong>{missionPlan.returnAltitudeM} m</strong>
              </span>
              <input
                aria-label="Altitude de retour simulée"
                type="range"
                min={20}
                max={config.altitudeM}
                value={Math.min(missionPlan.returnAltitudeM, config.altitudeM)}
                onChange={event =>
                  updateMissionPlan({
                    returnAltitudeM: Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="assembly-field">
              Perte de liaison (scénario simulé)
              <select
                aria-label="Action simulée en cas de perte de liaison"
                value={missionPlan.lostLinkAction}
                onChange={event =>
                  updateMissionPlan({
                    lostLinkAction: event.target
                      .value as LocalMissionPlan["lostLinkAction"],
                  })
                }
              >
                <option value="return">Retour simulé</option>
                <option value="hold">Maintien simulé</option>
                <option value="land">Atterrissage simulé</option>
              </select>
            </label>
          </div>
          <div className="mission-waypoint-editor">
            <div className="mission-waypoint-heading">
              <strong>
                {selectedWaypoint
                  ? `Point actif · ${selectedWaypoint.name}`
                  : "Aucun point sélectionné"}
              </strong>
              <div>
                <button
                  className="secondary-button"
                  onClick={() => {
                    const point: MissionWaypoint = {
                      id: `WP-${Date.now()}`,
                      name: `Point ${missionPlan.waypoints.length + 1}`,
                      x: 55,
                      y: 42,
                      altitudeM: missionPlan.returnAltitudeM,
                      speedKmh: config.cruiseSpeedKmh,
                      action: "inspection",
                    };
                    updateMissionPlan({
                      waypoints: [...missionPlan.waypoints, point],
                    });
                    setSelectedWaypointId(point.id);
                  }}
                >
                  <Plus size={13} /> Ajouter un point
                </button>
                {selectedWaypoint && (
                  <button
                    className="icon-button"
                    aria-label="Supprimer le point sélectionné"
                    onClick={removeSelectedWaypoint}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            {selectedWaypoint && (
              <div className="waypoint-fields">
                <label className="assembly-field">
                  Nom
                  <input
                    value={selectedWaypoint.name}
                    onChange={event =>
                      updateSelectedWaypoint({ name: event.target.value })
                    }
                  />
                </label>
                <label className="assembly-field">
                  Altitude simulée (m)
                  <input
                    type="number"
                    min={0}
                    max={config.altitudeM}
                    value={selectedWaypoint.altitudeM}
                    onChange={event =>
                      updateSelectedWaypoint({
                        altitudeM: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="assembly-field">
                  Vitesse (km/h)
                  <input
                    type="number"
                    min={1}
                    max={140}
                    value={selectedWaypoint.speedKmh}
                    onChange={event =>
                      updateSelectedWaypoint({
                        speedKmh: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="assembly-field">
                  Action
                  <select
                    value={selectedWaypoint.action}
                    onChange={event =>
                      updateSelectedWaypoint({
                        action: event.target.value as MissionWaypoint["action"],
                      })
                    }
                  >
                    <option value="inspection">Inspection</option>
                    <option value="turn">Virage</option>
                    <option value="return">Retour</option>
                  </select>
                </label>
              </div>
            )}
          </div>
          <div className="mission-readiness" aria-live="polite">
            {missionChecks.map((check, index) => (
              <div key={index} className={`mission-check is-${check.severity}`}>
                <span>
                  {check.severity === "pass"
                    ? "✓"
                    : check.severity === "block"
                      ? "×"
                      : "!"}
                </span>
                {check.message}
              </div>
            ))}
          </div>
          <div className="mission-footer">
            <span>
              Simulation locale · aucun fond géographique ni GNSS réels
            </span>
            <input
              ref={missionPlanFileInputRef}
              type="file"
              accept=".json,application/json"
              aria-label="Fichier de parcours local JSON"
              hidden
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                if (file) void importMissionPlanFile(file);
                event.currentTarget.value = "";
              }}
            />
            <div className="mission-file-actions">
              <button
                type="button"
                className="text-button"
                onClick={() => missionPlanFileInputRef.current?.click()}
                title="Le fichier valide remplacera le parcours local courant"
              >
                <Upload size={13} /> Importer JSON
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  downloadLocalFile(
                    `${safeEngineeringFilename(config.designName ?? "aeromind")}-mission-locale.json`,
                    JSON.stringify(missionPlan, null, 2),
                    "application/json"
                  )
                }
              >
                Exporter le plan JSON <Download size={13} />
              </button>
              {missionPlanImportStatus && (
                <span
                  className={`mission-file-status is-${missionPlanImportStatus.kind}`}
                  role="status"
                  aria-live="polite"
                >
                  {missionPlanImportStatus.message}
                </span>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
function InspectorView({
  config,
  setConfig,
  selectedComponent,
  setSelectedComponent,
  rotation,
  rotationX,
  rotationY,
  zoom,
  setRotation,
  setRotationX,
  setRotationY,
  setZoom,
}: {
  config: ConceptConfig;
  setConfig: SetConceptConfig;
  selectedComponent: string;
  setSelectedComponent: (id: string) => void;
  rotation: number;
  rotationX: number;
  rotationY: number;
  zoom: number;
  setRotation: (value: number) => void;
  setRotationX: (value: number) => void;
  setRotationY: (value: number) => void;
  setZoom: (value: number) => void;
}) {
  const update = (key: keyof ConceptConfig, value: number) =>
    setConfig({ ...config, [key]: value });
  const [projection, setProjection] = useState<"top" | "iso" | "side">("top");
  const [plateZoom, setPlateZoom] = useState(1);
  const [twinStatus, setTwinStatus] = useState("Synchronisation locale · lecture seule");
  const selectedProfile = findDroneProfile(config.platformProfile);
  const liveDesign: DroneCatalogDesign | undefined = selectedProfile
    ? { ...selectedProfile, configuration: { ...selectedProfile.configuration, ...config } }
    : undefined;
  return (
    <div className="view-stack">
      <SectionHeading
        eyebrow="03 / CONTRÔLE DES ÉQUIPEMENTS"
        title="Inspecteur & équipements"
        description="Contrôlez les équipements, leurs interfaces et leurs états de qualification dans une vue dédiée, distincte de l’atelier de construction."
      />
      <div className="inspector-window-grid">
        {[
          ["Énergie", `${config.batteryWh} Wh`, "Pack, réserve, connectique"],
          [
            "Propulsion",
            `${config.motorCount ?? 1} moteur(s)`,
            "Groupe moteur et hélice",
          ],
          ["Avionique", "Télémétrie active", "Liaison, journal, failsafe"],
          [
            "Charge utile",
            `${config.payloadKg.toFixed(2)} kg`,
            "Capteur et interface mécanique",
          ],
          ["Structure", `${config.wingspan.toFixed(2)} × ${config.fuselageLength.toFixed(2)} m`, "Envergure × longueur déclarées"],
          ["Environnement", `${config.windSpeedKmh.toFixed(0)} km/h`, "Vent de référence du scénario"],
        ].map(([title, value, detail]) => (
          <article className="equipment-card" key={title}>
            <span className="eyebrow">ÉQUIPEMENT</span>
            <strong>{title}</strong>
            <b>{value}</b>
            <small>{detail}</small>
            <span className="equipment-state">À qualifier</span>
          </article>
        ))}
      </div>
      <div className="inspector-layout">
        <section className="panel inspector-3d-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">JUMEAU NUMÉRIQUE</p>
              <h3>Vue 3D d’inspection</h3>
            </div>
            <ScanLine size={16} className="cyan-icon" />
          </div>
          <div className="inspector-camera-toolbar" role="group" aria-label="Outils de vue du jumeau numérique">
            <span>PROJECTION</span>
            {(["top", "iso", "side"] as const).map(view => <button key={view} type="button" className={projection === view ? "is-active" : ""} aria-pressed={projection === view} onClick={() => setProjection(view)}>{view === "top" ? "PLAN" : view === "iso" ? "ISO" : "PROFIL"}</button>)}
            <i />
            <button type="button" aria-label="Réduire le zoom du jumeau" onClick={() => setPlateZoom(value => Math.max(0.7, Number((value - 0.1).toFixed(1))))}>−</button>
            <strong>{Math.round(plateZoom * 100)}%</strong>
            <button type="button" aria-label="Augmenter le zoom du jumeau" onClick={() => setPlateZoom(value => Math.min(1.55, Number((value + 0.1).toFixed(1))))}>+</button>
            <button type="button" onClick={() => setPlateZoom(1)}>RÉINITIALISER</button>
          </div>
          <div className="inspector-live-3d-stage">
            <EngineeringDronePlate design={liveDesign} status="flying" projection={projection} zoom={plateZoom} emptyWhenUnselected construction={{ parts: config.installedMaterials?.length ?? 0, massKg: config.constructionMassKg ?? 0 }} />
            <div className="inspector-live-3d-readout">
              <span>JUMEAU NUMÉRIQUE · RÉFÉRENCE DE CONFIGURATION</span>
              <b>{liveDesign ? "PROFIL DE DRONE SÉLECTIONNÉ" : "AUCUNE RÉFÉRENCE SÉLECTIONNÉE"}</b>
              <small>{liveDesign ? twinStatus : "Sélection requise · aucun modèle généré"}</small>
            </div>
          </div>
          <div className="inspector-twin-actions" role="group" aria-label="Actions du jumeau numérique">
            <button type="button" className="secondary-button" onClick={() => setTwinStatus(`Synchronisé à ${new Date().toLocaleTimeString("fr-FR")} · configuration locale`)}><RefreshCw size={14} /> Synchroniser</button>
            <button type="button" className="secondary-button" onClick={() => setTwinStatus(`Diagnostic local · ${config.motorCount ?? 1} moteur(s) · ${config.batteryWh} Wh · enveloppe calculée`)}><ScanLine size={14} /> Diagnostic local</button>
            <button type="button" className="secondary-button" onClick={() => downloadLocalFile("aeromind-jumeau-numerique.json", JSON.stringify({ exportedAt: new Date().toISOString(), projection, zoom: plateZoom, configuration: config }, null, 2), "application/json")}><Download size={14} /> Exporter l’état</button>
          </div>
        </section>
        <section className="panel equipment-parameters">
          <div className="panel-header">
            <div>
              <p className="eyebrow">FICHE ÉQUIPEMENT</p>
              <h3>Paramètres inspectés</h3>
            </div>
            <Settings2 size={16} className="muted-icon" />
          </div>
          <ParameterField
            label="Batterie"
            value={config.batteryWh}
            unit="Wh"
            min={400}
            max={1400}
            step={10}
            onChange={value => update("batteryWh", value)}
          />
          <ParameterField
            label="Charge utile"
            value={config.payloadKg}
            unit="kg"
            min={0.2}
            max={5}
            step={0.1}
            onChange={value => update("payloadKg", value)}
          />
          <ParameterField
            label="Vent de référence"
            value={config.windSpeedKmh}
            unit="km/h"
            min={0}
            max={45}
            step={1}
            onChange={value => update("windSpeedKmh", value)}
          />
          <div className="inspector-config-divider">GÉOMÉTRIE & ENVELOPPE</div>
          <ParameterField
            label="Envergure"
            value={config.wingspan}
            unit="m"
            min={0.4}
            max={12}
            step={0.05}
            onChange={value => update("wingspan", value)}
          />
          <ParameterField
            label="Longueur fuselage"
            value={config.fuselageLength}
            unit="m"
            min={0.25}
            max={6}
            step={0.05}
            onChange={value => update("fuselageLength", value)}
          />
          <ParameterField
            label="Diamètre hélice"
            value={config.propDiameter}
            unit="m"
            min={0.08}
            max={2}
            step={0.01}
            onChange={value => update("propDiameter", value)}
          />
          <ParameterField
            label="Masse max. décollage"
            value={config.maxTakeoffKg}
            unit="kg"
            min={0.5}
            max={60}
            step={0.1}
            onChange={value => update("maxTakeoffKg", value)}
          />
          <div className="inspector-note">
            <Info size={15} />
            <span>
              Chaque modification est locale au projet et recalculée dans la
              simulation.
            </span>
          </div>
        </section>
      </div>
      <DroneBehaviorPanel configuration={config} context="inspection" />
    </div>
  );
}

function ParameterField({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="parameter-field">
      <span>
        {label}
        <small>{unit}</small>
      </span>
      <div className="parameter-input">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={event => onChange(Number(event.target.value))}
        />
        <span>{unit}</span>
      </div>
      <input
        className="range-input"
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
      />
    </label>
  );
}
function SimulationView({
  simulation: baseSimulation,
  onRunSimulation,
  isRunning,
  config,
  setConfig,
  history,
  versions,
  onRestoreVersion,
}: {
  simulation: SimulationResult;
  onRunSimulation: () => void;
  isRunning: boolean;
  config: ConceptConfig;
  setConfig: SetConceptConfig;
  history: Array<{
    id: number;
    runId: string;
    engineVersion: string;
    createdAt: Date;
  }>;
  versions: Array<{ id: number; version: string; createdAt: Date }>;
  onRestoreVersion: (versionId: number) => void;
}) {
  const [showMethod, setShowMethod] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [lastReplay, setLastReplay] = useState<{
    passed: number;
    total: number;
    time: string;
  } | null>(null);
  const hasCustomSimulation = Boolean(config.airframe && config.motorCount);
  const simulation = baseSimulation;
  const updateScenario = (key: keyof ConceptConfig, value: number) =>
    setConfig({ ...config, [key]: value });
  return (
    <div className="view-stack">
      <SectionHeading
        eyebrow="03 / LABORATOIRE DE SIMULATION"
        title={
          hasCustomSimulation
            ? "Résultats et incertitudes"
            : "Simulation locale personnalisable"
        }
        description={
          hasCustomSimulation
            ? "Chaque résultat conserve sa méthode, sa cible, sa marge et son niveau d’incertitude."
            : "Aucune donnée de scénario n’est introduite. Saisissez les paramètres ou choisissez une cellule, puis relancez le calcul local."
        }
        action={
          <button
            className="primary-button"
            onClick={onRunSimulation}
            disabled={isRunning || !hasCustomSimulation}
            title={!hasCustomSimulation ? "Saisie humaine requise avant tout calcul" : undefined}
          >
            {isRunning ? (
              <RefreshCw size={15} className="spin" />
            ) : (
              <Play size={15} fill="currentColor" />
            )}{" "}
            {isRunning ? "Calcul en cours" : "Relancer la simulation"}
          </button>
        }
      />
      {!hasCustomSimulation && <div className="inspector-note human-input-lock"><ShieldCheck size={15} /><span><b>Saisie humaine requise.</b> AeroMind n’injecte aucun scénario, aucune architecture et aucune donnée de performance. Les valeurs n’apparaissent qu’après une action utilisateur explicite.</span></div>}
      <div className="simulation-meta">
        <span>
          <span className="meta-key">RUN</span> {simulation.runId}
        </span>
        <span>
          <span className="meta-key">MÉTHODE</span> {simulation.method}
        </span>
        <span>
          <span className="meta-key">CONFIANCE</span>{" "}
          <StatusPill
            status={
              simulation.confidence === "moderate" ? "review" : "hypothesis"
            }
          >
            {simulation.confidence === "moderate" ? "Modérée" : "Indicative"}
          </StatusPill>
        </span>
        <span className="simulation-time">
          Mis à jour{" "}
          {new Date(simulation.generatedAt).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <DroneBehaviorPanel configuration={config} context="simulation" state={simulation.runId} />
      <section className="panel simulation-inputs-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">SCÉNARIO LOCAL · ENTRÉES ÉDITABLES</p>
            <h3>Paramétrer la campagne</h3>
          </div>
          <span className="calculated-badge">
            <Activity size={13} /> Recalcul automatique
          </span>
        </div>
        <div className="simulation-input-grid">
          <label>
            <span>Batterie (Wh)</span>
            <input
              type="number"
              min="50"
              step="10"
              value={config.batteryWh}
              onChange={event =>
                updateScenario("batteryWh", Number(event.target.value))
              }
            />
          </label>
          <label>
            <span>Charge utile (kg)</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={config.payloadKg}
              onChange={event =>
                updateScenario("payloadKg", Number(event.target.value))
              }
            />
          </label>
          <label>
            <span>Vitesse (km/h)</span>
            <input
              type="number"
              min="1"
              step="1"
              value={config.cruiseSpeedKmh}
              onChange={event =>
                updateScenario("cruiseSpeedKmh", Number(event.target.value))
              }
            />
          </label>
          <label>
            <span>Vent (km/h)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={config.windSpeedKmh}
              onChange={event =>
                updateScenario("windSpeedKmh", Number(event.target.value))
              }
            />
          </label>
          <label>
            <span>Altitude (m)</span>
            <input
              type="number"
              min="0"
              step="10"
              value={config.altitudeM}
              onChange={event =>
                updateScenario("altitudeM", Number(event.target.value))
              }
            />
          </label>
          <label>
            <span>Masse max. (kg)</span>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={config.maxTakeoffKg}
              onChange={event =>
                updateScenario("maxTakeoffKg", Number(event.target.value))
              }
            />
          </label>
        </div>
        <div className="simulation-input-footer">
          <span>
            <span className="live-dot" /> Toute modification met à jour les
            résultats affichés.
          </span>
          <span>
            Source : moteur déterministe local · lecture seule matériel
          </span>
        </div>
      </section>
      <section className="panel reference-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">TRAÇABILITÉ SERVEUR</p>
            <h3>Historique des versions et simulations</h3>
          </div>
          <span className="calculated-badge">
            {history.length} runs · {versions.length} versions
          </span>
        </div>
        {!history.length && !versions.length ? (
          <p className="section-description">
            Aucun historique persistant disponible. Connectez un compte métier
            et configurez la base de données pour créer des enregistrements
            partagés.
          </p>
        ) : (
          <div className="reference-grid">
            {history.slice(0, 4).map(run => (
              <div
                className="reference-case reference-pass"
                key={`run-${run.id}`}
              >
                <span>
                  <Activity size={14} />
                </span>
                <div>
                  <strong>{run.runId}</strong>
                  <small>
                    Moteur {run.engineVersion} ·{" "}
                    {new Date(run.createdAt).toLocaleString("fr-FR")}
                  </small>
                </div>
                <em>RUN</em>
              </div>
            ))}
            {versions.slice(0, 4).map(version => (
              <button
                className="reference-case"
                key={`version-${version.id}`}
                onClick={() => onRestoreVersion(version.id)}
                title="Restaurer en créant un nouvel instantané"
              >
                <span>
                  <Save size={14} />
                </span>
                <div>
                  <strong>{version.version}</strong>
                  <small>
                    Instantané ·{" "}
                    {new Date(version.createdAt).toLocaleString("fr-FR")}
                  </small>
                </div>
                <em>RESTAURER</em>
              </button>
            ))}
          </div>
        )}
      </section>
      {hasCustomSimulation ? (
        <>
      <div className="simulation-grid">
        <section className="panel results-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">BILAN DE PERFORMANCE / 06 INDICATEURS</p>
              <h3>Résultats calculés</h3>
            </div>
            <span className="calculated-badge">
              <Check size={13} /> Déterministe
            </span>
          </div>
          <div className="results-list">
            {simulation.metrics.map(metric => (
              <ResultRow key={metric.id} metric={metric} />
            ))}
          </div>
        </section>
        <aside className="panel energy-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">BUDGET ÉNERGÉTIQUE</p>
              <h3>Réserve batterie</h3>
            </div>
            <BatteryCharging size={18} className="cyan-icon" />
          </div>
          <div className="energy-gauge">
            <div className="gauge-circle">
              <strong>{formatNumber(simulation.energyUsableWh, 0)}</strong>
              <span>Wh utiles</span>
            </div>
          </div>
          <div className="energy-reserve-control">
            <label>
              <span>
                Réserve de sécurité{" "}
                <strong>{Math.round(config.reserveFraction * 100)} %</strong>
              </span>
              <input
                type="range"
                min="0.05"
                max="0.4"
                step="0.01"
                value={config.reserveFraction}
                onChange={event =>
                  setConfig({
                    ...config,
                    reserveFraction: Number(event.target.value),
                  })
                }
              />
            </label>
            <div>
              <button
                className="secondary-button"
                onClick={() => setConfig({ ...config, reserveFraction: 0.1 })}
              >
                10 %
              </button>
              <button
                className="secondary-button"
                onClick={() => setConfig({ ...config, reserveFraction: 0.18 })}
              >
                18 %
              </button>
              <button
                className="secondary-button"
                onClick={() => setConfig({ ...config, reserveFraction: 0.25 })}
              >
                25 %
              </button>
            </div>
          </div>
          <div className="energy-stats">
            <div>
              <span>Capacité nominale</span>
              <strong>{formatNumber(config.batteryWh, 0)} Wh</strong>
            </div>
            <div>
              <span>Réserve appliquée</span>
              <strong>{formatNumber(config.reserveFraction * 100, 0)} %</strong>
            </div>
            <div>
              <span>Puissance moyenne</span>
              <strong>{formatNumber(simulation.estimatedPowerW, 0)} W</strong>
            </div>
          </div>
          <div className="energy-note">
            <Zap size={14} />
            <span>
              La réserve est exclue de l’autonomie exploitable. La température
              et le vieillissement ne sont pas modélisés.
            </span>
          </div>
        </aside>
      </div>
      <div className="simulation-lower">
        <section className="panel mass-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">STRUCTURE / MASSE</p>
              <h3>Contribution des sous-systèmes</h3>
            </div>
            <span className="mono-label">
              {formatNumber(simulation.totalMassKg)} kg TOTAL
            </span>
          </div>
          <div className="mini-bars">
            {Object.entries(simulation.massBreakdown).map(
              ([key, value], index) => (
                <MiniBar
                  key={key}
                  label={
                    {
                      structure: "Structure",
                      battery: "Batterie",
                      propulsion: "Propulsion",
                      avionics: "Avionique",
                      payload: "Charge utile",
                    }[key] ?? key
                  }
                  value={`${formatNumber(value)} kg`}
                  percent={(value / simulation.totalMassKg) * 100}
                  tone={["cyan", "amber", "blue", "violet", "green"][index]}
                />
              )
            )}
          </div>
        </section>
        <section className="panel risk-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">ANALYSE DE RISQUES</p>
              <h3>
                {simulation.risks.filter(risk => risk.status === "open").length}{" "}
                points à revoir
              </h3>
            </div>
            <AlertTriangle size={18} className="amber-icon" />
          </div>
          <div className="risk-list">
            {simulation.risks.slice(0, 3).map(risk => (
              <RiskRow key={risk.id} risk={risk} />
            ))}
          </div>
        </section>
      </div>
      <div className="limits-banner">
        <Info size={16} />
        <div>
          <strong>Limites du modèle</strong>
          <span>
            Ce calcul n’est ni une simulation CFD OpenFOAM, ni un essai en vol,
            ni une démonstration de conformité réglementaire. Les résultats
            doivent être revus par un ingénieur habilité.
          </span>
        </div>
        <button
          className="text-button"
          onClick={() => setShowMethod(value => !value)}
        >
          {showMethod ? "Masquer la méthode" : "Lire la méthode"}{" "}
          <ArrowRight size={14} />
        </button>
      </div>
      {showMethod && (
        <section className="panel method-panel">
          <p className="eyebrow">MÉTHODE EXPLICABLE</p>
          <h3>{simulation.engineVersion}</h3>
          <div className="method-grid">
            {simulation.modules.map(module => (
              <div key={module.id}>
                <strong>{module.label}</strong>
                <span>{module.formula}</span>
                <small>
                  Incertitude : {module.uncertainty} · Limite : {module.limits}
                </small>
              </div>
            ))}
          </div>
        </section>
      )}
        </>
      ) : (
        <section className="panel simulation-results-waiting" aria-live="polite">
          <div className="simulation-results-waiting-icon"><ShieldCheck size={20} /></div>
          <div>
            <p className="eyebrow">DATA GATE / RÉSULTATS SUSPENDUS</p>
            <h3>Aucune performance n’est publiée sans baseline active.</h3>
            <p>Les chiffres calculés sur la configuration vierge sont masqués. Sélectionnez une architecture et sa propulsion dans le Poste de construction pour ouvrir les indicateurs, les risques et le budget énergétique.</p>
            <div className="simulation-waiting-checks"><span><i className={config.airframe ? "is-ready" : ""} />Architecture {config.airframe ? "définie" : "requise"}</span><span><i className={config.airframe && config.motorCount ? "is-ready" : ""} />Propulsion {config.airframe && config.motorCount ? "définie" : "requise"}</span><span><i />Recalcul manuel après choix</span></div>
          </div>
        </section>
      )}
    </div>
  );
}
function ResultRow({ metric }: { metric: SimulationMetric }) {
  return (
    <div className="result-row">
      <div className={`result-state state-${metric.status}`}>
        <span />
      </div>
      <div className="result-name">
        <strong>{metric.label}</strong>
        <span>{metric.assumption}</span>
      </div>
      <div className="result-value">
        <strong>
          {formatNumber(
            metric.value,
            metric.unit === "km" || metric.unit === "%" ? 0 : 1
          )}
        </strong>
        <span>{metric.unit}</span>
      </div>
      <div className="result-target">
        <span>CIBLE</span>
        <strong>{metric.target}</strong>
      </div>
      <div className="result-margin">
        <span>MARGE</span>
        <strong className={`margin-${metric.status}`}>{metric.margin}</strong>
      </div>
      <div className="result-uncertainty">
        <span>INCERT.</span>
        <strong>{metric.uncertainty}</strong>
      </div>
      <StatusPill status={metric.status}>
        {metricStatusLabel[metric.status]}
      </StatusPill>
    </div>
  );
}
function RiskRow({ risk }: { risk: RiskItem }) {
  return (
    <div className="risk-row">
      <div className={`risk-severity severity-${risk.severity}`} />
      <div className="risk-copy">
        <strong>{risk.label}</strong>
        <span>{risk.mitigation}</span>
      </div>
      <div className="risk-probability">
        <span>PROBABILITÉ</span>
        <strong>{risk.probability}</strong>
      </div>
      <StatusPill status={risk.severity}>
        {risk.status === "open"
          ? "Ouvert"
          : risk.status === "monitoring"
            ? "Surveiller"
            : "Contrôlé"}
      </StatusPill>
    </div>
  );
}
function buildLocalCopilotAnswer(
  question: string,
  simulation: SimulationResult,
  config: ConceptConfig
): string {
  const normalized = question.toLocaleLowerCase("fr-FR");
  const openRisks = simulation.risks.filter(risk => risk.status === "open");
  if (normalized.includes("autonomie") || normalized.includes("énergie")) {
    return `### Diagnostic énergie local\n\nL’autonomie calculée est de **${formatNumber(simulation.enduranceH)} h** pour une batterie de **${formatNumber(config.batteryWh, 0)} Wh**. Les leviers prioritaires sont la masse totale (${formatNumber(simulation.totalMassKg)} kg), la réserve de ${formatNumber(config.reserveFraction * 100, 0)} % et le vent de référence (${formatNumber(config.windSpeedKmh, 0)} km/h).\n\n**Action vérifiable :** exécuter la campagne d’essais virtuels, puis comparer une variante avec masse utile réduite et réserve inchangée. Ce résultat reste préliminaire et ne remplace pas une validation énergétique instrumentée.`;
  }
  if (
    normalized.includes("risque") ||
    normalized.includes("audit") ||
    normalized.includes("hypothèse")
  ) {
    return `### Revue locale des risques\n\n**${openRisks.length} risque(s) ouvert(s)** sont actuellement associés au run ${simulation.runId}. ${openRisks[0] ? `Le premier point à traiter est : **${openRisks[0].label}**.` : "Aucun risque ouvert n’est remonté par le modèle courant."}\n\n**Décision recommandée :** distinguer dans le rapport les valeurs calculées, les hypothèses et les preuves attendues. Toute conclusion d’ingénierie doit être relue par un opérateur qualifié.`;
  }
  return `### Brief AeroMind local\n\nJ’ai analysé **${simulation.runId}** : masse ${formatNumber(simulation.totalMassKg)} kg, autonomie ${formatNumber(simulation.enduranceH)} h, rayon théorique ${formatNumber(simulation.rangeKm, 0)} km et confiance modèle **${simulation.confidence}**.\n\n**Prochaine étape :** vérifier les exigences ouvertes, exécuter la campagne virtuelle et consigner les écarts dans le rapport. Le moteur local est disponible sans fournisseur externe ; il ne fabrique pas de mesure et ne transmet aucune commande réelle.`;
}

function CopilotView({
  project,
  config,
  requirements,
  simulation,
  hasProject,
  onView,
  onCreateProject,
}: {
  project: ProjectState;
  config: ConceptConfig;
  requirements: Requirement[];
  simulation: SimulationResult;
  hasProject: boolean;
  onView: (view: ViewId) => void;
  onCreateProject: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [localThinking, setLocalThinking] = useState(false);
  const aiStatusQuery = trpc.ai.status.useQuery(undefined, { retry: false });
  const chatMutation = trpc.ai.chat.useMutation({
    onSuccess: response =>
      setMessages(current => [
        ...current,
        { role: "assistant", content: response.content },
      ]),
    onError: error =>
      setMessages(current => [
        ...current,
        {
          role: "assistant",
          content: `**Continuité IA locale activée.**\n\n${buildLocalCopilotAnswer("diagnostic", simulation, config)}\n\n_L’appel distant a été indisponible (${error.message})._`,
        },
      ]),
  });
  const context = {
    project: project.name,
    mission: project.mission,
    config: {
      ...(Object.fromEntries(
        Object.entries(config).filter(([, value]) =>
          ["string", "number"].includes(typeof value)
        )
      ) as Record<string, string | number>),
      installedModuleCount: config.installedMaterials?.length ?? 0,
      installedModuleMassKg: (config.installedMaterials ?? []).reduce(
        (sum, item) => sum + item.massKg,
        0
      ),
      flightMode: config.flightControls?.mode ?? "—",
      throttlePct: config.flightControls?.throttlePct ?? "—",
      missionWaypointCount: config.missionPlan?.waypoints.length ?? 0,
      missionRadiusKm: config.missionPlan?.radiusKm ?? "—",
      symmetryEnabled:
        config.symmetric === undefined ? "—" : config.symmetric ? 1 : 0,
    },
    simulation: {
      runId: simulation.runId,
      totalMassKg: simulation.totalMassKg,
      enduranceH: simulation.enduranceH,
      rangeKm: simulation.rangeKm,
      windMarginPercent: simulation.windMarginPercent,
      confidence: simulation.confidence,
      risks: simulation.risks,
    },
    requirements,
  };
  const sendMessage = (content: string) => {
    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    if (!aiStatusQuery.data?.providerConfigured) {
      setLocalThinking(true);
      window.setTimeout(() => {
        setMessages(current => [
          ...current,
          {
            role: "assistant",
            content: buildLocalCopilotAnswer(content, simulation, config),
          },
        ]);
        setLocalThinking(false);
      }, 260);
      return;
    }
    chatMutation.mutate({
      messages: nextMessages.map(({ role, content }) => ({
        role: role as "user" | "assistant",
        content,
      })),
      context,
    });
  };
  if (!hasProject) {
    return (
      <div className="view-stack">
        <SectionHeading
          eyebrow="05 / INTELLIGENCE DE CONCEPTION"
          title="Copilote AeroMind"
          description="Un copilote de préparation reste disponible dès l’exploration ; l’analyse contextualisée s’active dès qu’un projet est créé."
        />
        <section className="copilot-analysis-rail" aria-label="Disponibilité du copilote">
          <div><small>PROJET ACTIF</small><strong>NON SÉLECTIONNÉ</strong><span>Rattachement requis</span></div>
          <div><small>CONFIGURATION</small><strong>EN ATTENTE</strong><span>Aucune architecture injectée</span></div>
          <div><small>PREUVES</small><strong>0</strong><span>Aucun run projet actif</span></div>
          <div><small>PROCHAINE ACTION</small><strong>BRIEF</strong><span>Créer ou ouvrir un espace de travail</span></div>
        </section>
        <section className="panel copilot-empty-state">
          <div className="copilot-empty-orb">
            <Sparkles size={28} />
          </div>
          <span className="eyebrow">AEROMIND AI / VEILLE</span>
          <h3>Aucune donnée de projet à analyser</h3>
          <p>
            Le copilote ne fabrique pas de mission, de géométrie, de risque ou
            de recommandation. Créez un projet, renseignez votre intention et
            revenez ici pour obtenir une analyse contextualisée.
          </p>
          <div className="copilot-empty-grid">
            <span>Contexte projet : —</span>
            <span>Run de simulation : —</span>
            <span>Risques : —</span>
            <span>Recommandations : —</span>
          </div>
          <div className="copilot-empty-actions">
            <button
              className="primary-button"
              type="button"
              onClick={onCreateProject}
            >
              <Plus size={14} /> Créer un espace de travail
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => onView("catalog")}
            >
              <Package size={14} /> Explorer la bibliothèque
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => onView("simulation")}
            >
              <Activity size={14} /> Ouvrir la simulation
            </button>
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="view-stack">
      <SectionHeading
        eyebrow="05 / INTELLIGENCE DE CONCEPTION"
        title="Copilote AeroMind"
        description="Une IA de raisonnement connectée au scénario actif : elle lit les résultats, questionne les hypothèses et propose la prochaine action vérifiable."
        action={
          <span className="ai-live-badge">
            <span className="live-dot" />{" "}
            {aiStatusQuery.data?.providerConfigured
              ? "LLM SERVEUR ACTIF"
              : "IA LOCALE ACTIVE"}
          </span>
        }
      />
      <div className="copilot-command-strip">
        <div>
          <span className="eyebrow">AEROMIND AI / ORCHESTRATEUR</span>
          <strong>Brief → hypothèses → décision → preuve</strong>
        </div>
        <span className="copilot-command-status">
          <i /> CONTEXTE SYNCHRONISÉ
        </span>
        <span className="copilot-command-status">
          <i /> RÉPONSE TRAÇABLE
        </span>
      </div>
      <section className="copilot-analysis-rail" aria-label="Chaîne de décision et preuves">
        <div><small>CONFIGURATION</small><strong>{config.designName || config.airframe || "À définir"}</strong><span>{config.motorCount ?? 0} moteur(s) · {formatNumber(config.wingspan, 2)} m</span></div>
        <div><small>RUN DE RÉFÉRENCE</small><strong>{simulation.runId}</strong><span>{formatNumber(simulation.totalMassKg)} kg · {formatNumber(simulation.enduranceH)} h</span></div>
        <div><small>RISQUES OUVERTS</small><strong>{simulation.risks.filter(risk => risk.status === "open").length}</strong><span>À traiter avant revue</span></div>
        <div><small>EXIGENCES</small><strong>{requirements.length}</strong><span>Sources injectées dans le contexte</span></div>
      </section>
      <div className="copilot-layout">
        <section className="panel copilot-panel">
          <div className="copilot-context">
            <div>
              <span className="eyebrow">CONTEXTE INJECTÉ</span>
              <strong>{project.name}</strong>
              <span>
                {simulation.runId} · {formatNumber(simulation.totalMassKg)} kg ·{" "}
                {formatNumber(simulation.enduranceH)} h
              </span>
            </div>
            <div className="copilot-context-state">
              <span className="online-pulse" />{" "}
              {aiStatusQuery.data?.providerConfigured
                ? "LLM serveur connecté"
                : "Moteur local contrôlé"}
            </div>
          </div>
          <AIChatBox
            messages={messages}
            onSendMessage={sendMessage}
            isLoading={chatMutation.isPending || localThinking}
            height="min(620px, 62vh)"
            placeholder="Posez une question sur la mission, le modèle ou une décision…"
            emptyStateMessage="Le copilote connaît votre configuration active."
            suggestedPrompts={[
              "Pourquoi l’autonomie est-elle sous la cible ?",
              "Quelle action réduit le plus le risque énergétique ?",
              "Audite les hypothèses critiques avant la revue.",
            ]}
          />
          <div className="copilot-action-rail">
            <span>ANALYSE RAPIDE</span>
            <button
              onClick={() =>
                sendMessage(
                  "Produis un brief de revue en séparant données, hypothèses, risques et preuves attendues."
                )
              }
            >
              Brief de revue
            </button>
            <button
              onClick={() =>
                sendMessage(
                  "Construis une matrice de décisions pour réduire le risque principal de cette configuration."
                )
              }
            >
              Matrice de décision
            </button>
            <button
              onClick={() =>
                sendMessage(
                  "Prépare la liste des essais virtuels à exécuter avant toute validation humaine."
                )
              }
            >
              Plan de preuves
            </button>
          </div>
        </section>
        <aside className="panel copilot-side">
          <div className="panel-header">
            <div>
              <p className="eyebrow">POSTURE D’ANALYSE</p>
              <h3>Posture de raisonnement contrôlé</h3>
            </div>
            <ShieldCheck size={17} className="cyan-icon" />
          </div>
          <div className="copilot-principles">
            <div>
              <strong>Contexte réel</strong>
              <span>
                La réponse reçoit la géométrie, les exigences, le run et les
                risques actuels.
              </span>
            </div>
            <div>
              <strong>Raisonnement explicable</strong>
              <span>
                Chaque recommandation doit distinguer mesure, hypothèse et
                décision.
              </span>
            </div>
            <div>
              <strong>Contrôle humain</strong>
              <span>
                Aucune réponse ne remplace un essai, une CFD ou une revue
                d’ingénieur.
              </span>
            </div>
          </div>
          <div className="copilot-snapshot">
            <span>POINTS OUVERTS</span>
            <strong>
              {simulation.risks.filter(risk => risk.status === "open").length}
            </strong>
            <small>risques nécessitant une décision</small>
          </div>
          <div className="copilot-snapshot copilot-snapshot-secondary">
            <span>EXIGENCES LUES</span>
            <strong>{requirements.length}</strong>
            <small>critères injectés dans le contexte</small>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ReportView({
  project,
  requirements,
  config,
  simulation,
  onExport,
  onView,
  activeProjectId,
  remoteReady,
  language,
  workbenchCapture,
}: {
  project: ProjectState;
  requirements: Requirement[];
  config: ConceptConfig;
  simulation: SimulationResult;
  onExport: () => void;
  onView: (view: ViewId) => void;
  activeProjectId: string;
  remoteReady: boolean;
  language: AppLanguage;
  workbenchCapture: string;
}) {
  const t = (text: string) => translate(language, text);
  const reportsQuery = trpc.reports.list.useQuery(activeProjectId, {
    enabled: remoteReady && !activeProjectId.startsWith("project-"),
    retry: false,
  });
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const reportDetailQuery = trpc.reports.get.useQuery(selectedReportId ?? 0, {
    enabled: remoteReady && selectedReportId !== null,
    retry: false,
  });
  if (!activeProjectId) {
    return (
      <div className="view-stack">
        <SectionHeading
          eyebrow="04 / DOCUMENTATION"
          title={t("Rapport technique révisable")}
          description="Le rapport reste vierge tant qu’aucun projet n’a été créé."
        />
        <section className="report-assurance-ribbon" aria-label="État du dossier documentaire">
          <div><small>DOCUMENT CONTROL</small><strong>EN ATTENTE</strong><span>Aucun identifiant de rapport attribué</span></div>
          <div><small>ARCHITECTURE</small><strong>—</strong><span>Choix explicite requis</span></div>
          <div><small>PREUVES INCLUSES</small><strong>0</strong><span>Aucun run à tracer</span></div>
          <div><small>STATUT D’ÉMISSION</small><strong>BLOQUÉE</strong><span>Projet requis · revue non effectuée</span></div>
        </section>
        <section className="panel report-empty-state">
          <FileText size={30} />
          <h3>Aucun dossier de construction</h3>
          <p>
            Créez un projet puis renseignez l’architecture, la mission, les
            matériaux, la propulsion, l’avionique et les exigences pour générer
            un rapport traçable.
          </p>
        </section>
      </div>
    );
  }
  return (
    <div className="view-stack">
      <SectionHeading
        eyebrow="04 / DOCUMENTATION"
        title={t("Rapport technique révisable")}
        description="Un document de conception structuré, avec provenance et limites visibles."
        action={
          <div className="header-actions">
            <button className="secondary-button" onClick={onExport}>
              <Download size={15} /> Télécharger .md
            </button>
            <button className="primary-button" onClick={onExport}>
              <Save size={15} /> Exporter le rapport
            </button>
          </div>
        }
      />
      <section className="report-assurance-ribbon" aria-label="Contrôle documentaire">
        <div><small>DOCUMENT CONTROL</small><strong>RPT-{simulation.runId}</strong><span>Version {project.version} · modifiable</span></div>
        <div><small>ARCHITECTURE</small><strong>{config.designName || config.airframe || "À définir"}</strong><span>{config.motorCount ?? 0} moteur(s) · charge {formatNumber(config.payloadKg)} kg</span></div>
        <div><small>PREUVES INCLUSES</small><strong>{simulation.metrics.length + requirements.length + (config.installedMaterials?.length ?? 0)}</strong><span>indicateurs, exigences et composants</span></div>
        <div><small>STATUT D’ÉMISSION</small><strong>REVUE REQUISE</strong><span>Pas de certification ou d’attestation implicite</span></div>
      </section>
      <div className="report-layout">
        <article className="report-paper">
          <div className="report-cover">
            <div className="report-wordmark">
              <span className="wordmark-mark">A</span>
              <span>
                AEROMIND <b>IA</b>
              </span>
            </div>
            <span className="report-classification">
              DESIGN REVIEW / PRELIMINARY
            </span>
            <h3>{project.name}</h3>
            <p>{project.mission}</p>
            <div className="report-cover-meta">
              <span>RAPPORT / RPT-{simulation.runId}</span>
              <span>VERSION {project.version}</span>
              <span>
                {new Date(simulation.generatedAt).toLocaleDateString("fr-FR")}
              </span>
            </div>
          </div>
          <div className="report-body">
            {workbenchCapture && (
              <section className="report-workbench-evidence">
                <div>
                  <span>08 / BUILD EVIDENCE</span>
                  <h4>{language === "en" ? "Captured construction workbench" : "Capture du poste de construction"}</h4>
                  <p>{language === "en" ? "Visual reference only; verify dimensions and hardware against approved drawings and manufacturer data." : "Référence visuelle uniquement ; vérifiez les dimensions et le matériel à partir des plans approuvés et des données fabricant."}</p>
                </div>
                <img src={workbenchCapture} alt={language === "en" ? "Captured AeroMind mechanical construction interface" : "Capture de l’interface de construction mécanique AeroMind"} />
              </section>
            )}
            <div className="report-section" id="report-summary">
              <span className="report-number">01</span>
              <div>
                <h4>{t("Résumé de conception")}</h4>
                <p>
                  {config.designName || config.airframe || "L’architecture active"} est un concept préliminaire de plateforme aérienne. La configuration présente une masse estimée de{" "}
                  <strong>{formatNumber(simulation.totalMassKg)} kg</strong>,
                  une autonomie calculée de{" "}
                  <strong>{formatNumber(simulation.enduranceH)} h</strong> et
                  une charge utile de{" "}
                  <strong>{formatNumber(config.payloadKg)} kg</strong>.
                </p>
              </div>
            </div>
            <div className="report-section" id="report-parameters">
              <span className="report-number">02</span>
              <div>
                <h4>{t("Paramètres actifs")}</h4>
                <div className="report-data-grid">
                  <span>
                    Envergure <b>{formatNumber(config.wingspan, 2)} m</b>
                  </span>
                  <span>
                    Surface alaire{" "}
                    <b>{formatNumber(simulation.wingAreaM2, 2)} m²</b>
                  </span>
                  <span>
                    Batterie <b>{formatNumber(config.batteryWh, 0)} Wh</b>
                  </span>
                  <span>
                    Vent de référence{" "}
                    <b>{formatNumber(config.windSpeedKmh, 0)} km/h</b>
                  </span>
                </div>
              </div>
            </div>
            <div className="report-section" id="report-construction">
              <span className="report-number">03</span>
              <div>
                <h4>{t("Dossier de construction et nomenclature")}</h4>
                <p>
                  Cette section décrit les éléments actuellement déclarés dans
                  la maquette. Une mention « concept » indique une estimation de
                  projet et non une masse fabricant.
                </p>
                <div className="report-construction-summary">
                  <span>
                    Architecture <b>{config.airframe ?? "Non définie"}</b>
                  </span>
                  <span>
                    Profil <b>{config.platformProfile ?? "Non défini"}</b>
                  </span>
                  <span>
                    Famille matériaux{" "}
                    <b>{config.materialFamily ?? "Non définie"}</b>
                  </span>
                  <span>
                    Masse construction{" "}
                    <b>{formatNumber(config.constructionMassKg ?? 0)} kg</b>
                  </span>
                </div>
                <table className="report-table report-bom-table">
                  <thead>
                    <tr>
                      <th>Élément</th>
                      <th>Fonction</th>
                      <th>Masse</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(config.installedMaterials ?? []).length ? (
                      (config.installedMaterials ?? []).map(item => (
                        <tr key={item.id}>
                          <td>{item.label}</td>
                          <td>{item.use}</td>
                          <td>
                            {formatNumber(item.massKg, 2)} kg ×{" "}
                            {item.quantity ?? 1}
                          </td>
                          <td>
                            {item.catalogSource === "manufacturer"
                              ? "Fabricant"
                              : "Concept / saisie"}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4}>
                          Aucun composant n’est encore inscrit dans la
                          nomenclature.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="report-section" id="report-flight-systems">
              <span className="report-number">04</span>
              <div>
                <h4>{t("Systèmes, propulsion et mission")}</h4>
                <div className="report-data-grid">
                  <span>
                    Propulsion{" "}
                    <b>
                      {config.motorCount ?? "—"} moteur(s) · Ø{" "}
                      {formatNumber(config.propDiameter, 2)} m
                    </b>
                  </span>
                  <span>
                    Commande{" "}
                    <b>{config.flightControls?.mode ?? "Non définie"}</b>
                  </span>
                  <span>
                    Throttle nominal{" "}
                    <b>{config.flightControls?.throttlePct ?? "—"} %</b>
                  </span>
                  <span>
                    Avionique / liaison{" "}
                    <b>
                      {config.flightControls ? "Profil déclaré" : "Non définie"}
                    </b>
                  </span>
                  <span>
                    Plan mission{" "}
                    <b>
                      {config.missionPlan?.waypoints.length ?? 0} waypoint(s)
                    </b>
                  </span>
                  <span>
                    Rayon local <b>{config.missionPlan?.radiusKm ?? "—"} km</b>
                  </span>
                </div>
                <ul className="report-list">
                  {(config.missionPlan?.waypoints ?? []).map(point => (
                    <li key={point.id}>
                      <strong>{point.name}</strong> · {point.altitudeM} m ·{" "}
                      {point.speedKmh} km/h · {point.action}
                    </li>
                  ))}
                  {!config.missionPlan?.waypoints.length && (
                    <li>Aucun waypoint de mission déclaré.</li>
                  )}
                </ul>
              </div>
            </div>
            <div className="report-section" id="report-results">
              <span className="report-number">05</span>
              <div>
                <h4>{t("Résultats et décisions")}</h4>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Indicateur</th>
                      <th>Valeur</th>
                      <th>Cible</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulation.metrics.slice(0, 5).map(metric => (
                      <tr key={metric.id}>
                        <td>{metric.label}</td>
                        <td>
                          {formatNumber(
                            metric.value,
                            metric.unit === "km" ? 0 : 1
                          )}{" "}
                          {metric.unit}
                        </td>
                        <td>{metric.target}</td>
                        <td>
                          <span
                            className={`report-status report-${metric.status}`}
                          >
                            {metricStatusLabel[metric.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="report-section" id="report-safe-commands">
              <span className="report-number">06</span>
              <div>
                <h4>{language === "en" ? "Safe commands · simulation only" : "Commandes sûres · simulation uniquement"}</h4>
                <p>{language === "en" ? "These controls change the virtual scenario only. No command is sent to physical aircraft or actuators." : "Ces commandes modifient uniquement le scénario virtuel. Aucune commande n’est transmise à un aéronef ou à un actionneur physique."}</p>
                <table className="report-table"><thead><tr><th>{language === "en" ? "Control" : "Commande"}</th><th>{language === "en" ? "Safe effect" : "Effet sûr"}</th><th>{language === "en" ? "Resume condition" : "Condition de reprise"}</th></tr></thead><tbody>
                  <tr><td>PAUSE / HOLD</td><td>{language === "en" ? "Freeze the virtual mission and retain its state." : "Figer la mission virtuelle et conserver son état."}</td><td>{language === "en" ? "Human review before resume." : "Revue humaine avant reprise."}</td></tr>
                  <tr><td>ABORT SIM</td><td>{language === "en" ? "End the simulation run; no physical action." : "Clore le run de simulation ; aucune action physique."}</td><td>{language === "en" ? "Explicitly start a new simulation." : "Lancer explicitement une nouvelle simulation."}</td></tr>
                  <tr><td>CHECK LINK / BATTERY</td><td>{language === "en" ? "Read-only review of scenario prerequisites." : "Vérification en lecture seule des prérequis du scénario."}</td><td>{language === "en" ? "Resolve warnings and document evidence." : "Traiter les alertes et consigner les preuves."}</td></tr>
                </tbody></table>
              </div>
            </div>
            <div className="report-section" id="report-limits">
              <span className="report-number">07</span>
              <div>
                <h4>{t("Hypothèses et limites")}</h4>
                <ul className="report-list">
                  <li>
                    Modèle de bilan déterministe côté client, sans maillage CFD.
                  </li>
                  <li>
                    Masse structurelle dérivée d’une corrélation géométrique
                    préliminaire.
                  </li>
                  <li>
                    Vent, température, vieillissement batterie et stabilité
                    dynamique restent à valider.
                  </li>
                  <li>
                    Ce document ne constitue ni une certification ni une
                    autorisation d’exploitation.
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="report-footer">
            <ShieldCheck size={15} /> Généré par AeroMind AI · Document
            révisable par un ingénieur
          </div>
        </article>
        <aside className="report-side">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">{t("INDEX DU RAPPORT")}</p>
                <h3>{t("Sections")}</h3>
              </div>
              <FileText size={16} className="muted-icon" />
            </div>
            <div className="report-index">
              <button
                onClick={() =>
                  document
                    .getElementById("report-summary")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                01 <span>{t("Résumé de conception")}</span>
              </button>
              <button
                onClick={() =>
                  document
                    .getElementById("report-parameters")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                02 <span>{t("Paramètres actifs")}</span>
              </button>
              <button
                onClick={() =>
                  document
                    .getElementById("report-results")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                05 <span>{t("Résultats et décisions")}</span>
              </button>
              <button
                onClick={() =>
                  document
                    .getElementById("report-construction")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                03 <span>Construction et nomenclature</span>
              </button>
              <button
                onClick={() =>
                  document
                    .getElementById("report-flight-systems")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                04 <span>Systèmes, propulsion, mission</span>
              </button>
              <button
                onClick={() =>
                  document
                    .getElementById("report-limits")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                06 <span>{t("Hypothèses et limites")}</span>
              </button>
            </div>
          </div>
          <div className="panel report-side-note">
            <div className="side-note-icon">
              <Info size={16} />
            </div>
            <div>
              <strong>Prochaine étape recommandée</strong>
              <p>
                Revoir l’autonomie sous cible et confirmer le cadre opérationnel
                avant comparaison de variantes.
              </p>
              <button
                className="text-button"
                onClick={() => onView("requirements")}
              >
                Revenir aux exigences <ArrowRight size={14} />
              </button>
            </div>
          </div>
          <div className="panel report-integrity">
            <div className="integrity-line">
              <CheckCircle2 size={16} />
              <span>Provenance enregistrée</span>
            </div>
            <div className="integrity-line">
              <CheckCircle2 size={16} />
              <span>Version de scénario {simulation.runId}</span>
            </div>
            <div className="integrity-line">
              <AlertTriangle size={16} />
              <span>Validation humaine requise</span>
            </div>
          </div>
        </aside>
      </div>
      <section className="panel reference-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">ARCHIVE DOCUMENTAIRE</p>
            <h3>Rapports enregistrés</h3>
          </div>
          <span className="calculated-badge">
            {reportsQuery.data?.length ?? 0} rapports
          </span>
        </div>
        {!reportsQuery.data?.length ? (
          <p className="section-description">
            {remoteReady
              ? "Aucun rapport archivé pour ce projet."
              : "L’archive serveur nécessite une session authentifiée et une base métier disponible."}
          </p>
        ) : (
          <div className="reference-grid">
            {reportsQuery.data.map(report => (
              <button
                className="reference-case"
                key={report.id}
                onClick={() => setSelectedReportId(report.id)}
              >
                <span>
                  <FileText size={14} />
                </span>
                <div>
                  <strong>{report.title}</strong>
                  <small>
                    SHA-256 {report.contentSha256.slice(0, 16)}… ·{" "}
                    {new Date(report.createdAt).toLocaleString("fr-FR")}
                  </small>
                </div>
                <em>OUVRIR</em>
              </button>
            ))}
          </div>
        )}
        {reportDetailQuery.data && (
          <pre
            className="simulation-footnote"
            style={{ whiteSpace: "pre-wrap", maxHeight: 320, overflow: "auto" }}
          >
            {reportDetailQuery.data.contentMarkdown}
          </pre>
        )}
      </section>
    </div>
  );
}

function LiveSimulationView({
  config,
  simulation,
  requirements,
  setConfig,
  onOpenBuilder,
}: {
  config: ConceptConfig;
  setConfig: SetConceptConfig;
  simulation: SimulationResult;
  requirements: Requirement[];
  onOpenBuilder: () => void;
}) {
  const configured = Boolean(
    config.airframe &&
      config.batteryWh > 0 &&
      config.maxTakeoffKg > 0 &&
      config.altitudeM >= 5 &&
      config.cruiseSpeedKmh >= 5
  );
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [mode, setMode] = useState<"manual" | "supervised" | "safe-return">(
    "supervised"
  );
  const windSpeed = config.windSpeedKmh;
  const targetAltitude = config.altitudeM;
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [stickRoll, setStickRoll] = useState(0);
  const [stickPitch, setStickPitch] = useState(0);
  const [throttlePct, setThrottlePct] = useState(50);
  const [showGrid, setShowGrid] = useState(true);
  const [showOrbit, setShowOrbit] = useState(true);
  const [showTelemetryOverlay, setShowTelemetryOverlay] = useState(true);
  const [trajectoryFrame, setTrajectoryFrame] = useState<"tactical" | "clean">("tactical");
  const [sensorActive, setSensorActive] = useState(true);
  const [testStep, setTestStep] = useState(0);
  const [selectedTestId, setSelectedTestId] =
    useState<VirtualTestId>("nominal");
  const [executedCampaign, setExecutedCampaign] =
    useState<VirtualTestCampaign | null>(null);
  const [testEvents, setTestEvents] = useState<string[]>([
    "Prévol validée · banc de démonstration prêt",
  ]);
  const previewCampaign = useMemo(
    () => runVirtualTestCampaign(config, requirements, "APERÇU"),
    [config, requirements]
  );
  const campaign =
    executedCampaign?.signature === previewCampaign.signature
      ? executedCampaign
      : previewCampaign;
  const campaignIsCurrent = campaign === executedCampaign;
  const selectedTest =
    campaign.cases.find(item => item.id === selectedTestId) ??
    campaign.cases[0];
  const recordTest = (message: string) =>
    setTestEvents(current =>
      [
        `${new Date().toLocaleTimeString("fr-FR")} · ${message}`,
        ...current,
      ].slice(0, 8)
    );
  const runTestCampaign = () => {
    if (!configured) return;
    const runId = `VTEST-${String(Date.now()).slice(-8)}`;
    const nextCampaign = runVirtualTestCampaign(config, requirements, runId);
    setExecutedCampaign(nextCampaign);
    setTestStep(value => value + 1);
    recordTest(
      `Campagne ${runId} exécutée · ${nextCampaign.counts.pass} cohérent(s), ${nextCampaign.counts.review} à revoir, ${nextCampaign.counts.fail} échec(s)`
    );
  };
  const exportTestCampaign = () =>
    downloadLocalFile(
      `${safeEngineeringFilename(config.designName ?? "aeromind")}-${campaign.runId.toLowerCase()}-essais.csv`,
      virtualCampaignToCsv(campaign),
      "text/csv;charset=utf-8"
    );
  const resetTest = () => {
    setElapsed(0);
    setTestStep(0);
    setPlaying(false);
    setTestEvents(["Scénario réinitialisé · banc prêt"]);
  };
  const stepTest = () => {
    setElapsed(value => Math.min(59.95, value + 1));
    setTestStep(value => value + 1);
    recordTest("Pas de simulation exécuté · télémétrie recalculée");
  };
  const captureTestSnapshot = () => {
    const content = [
      "horodatage;run;mode;temps_s;altitude_m;vitesse_kmh;cap_deg;batterie_pct;vent_kmh;roulis_pct;tangage_pct;gaz_pct",
      `${new Date().toISOString()};${simulation.runId};${mode};${elapsed.toFixed(2)};${altitude};${speed};${heading};${battery};${windSpeed};${stickRoll};${stickPitch};${throttlePct}`,
    ].join("\n");
    downloadLocalFile(
      `instantane-${simulation.runId.toLowerCase()}-${Date.now()}.csv`,
      content,
      "text/csv;charset=utf-8"
    );
    recordTest(
      `Instantané CSV exporté · ${altitude} m · ${speed} km/h · ${heading}°`
    );
  };
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () => setElapsed(value => (value + 0.05) % 60),
      50
    );
    return () => window.clearInterval(timer);
  }, [playing]);
  const phase = (elapsed / 60) * Math.PI * 2;
  const controlAuthority =
    mode === "manual" ? 1 : mode === "supervised" ? 0.35 : 0;
  const rollInput = stickRoll * controlAuthority;
  const pitchInput = stickPitch * controlAuthority;
  const returnProgress =
    mode === "safe-return" && playing ? Math.min(elapsed / 15, 1) : 0;
  const x =
    50 + (Math.cos(phase) * 28 + rollInput * 0.14) * (1 - returnProgress);
  const y =
    50 +
    (Math.sin(phase * 1.35) * 22 - pitchInput * 0.12) * (1 - returnProgress);
  const altitude = Math.round(
    targetAltitude + Math.sin(phase) * 18 + pitchInput * 0.08
  );
  const speed = Math.max(
    0,
    Math.round(
      config.cruiseSpeedKmh *
        speedMultiplier *
        (throttlePct / 50) *
        (mode === "safe-return" ? 0.65 : 1) +
        Math.cos(phase * 1.4) * 4 -
        windSpeed * 0.2
    )
  );
  const battery = Math.max(
    0,
    Math.round(100 - (elapsed / 60) * (100 - config.reserveFraction * 100))
  );
  const heading =
    Math.round(((phase * 57.3 + 180 + rollInput * 0.45) % 360) + 360) % 360;
  return (
    <div className="view-stack">
      <SectionHeading
        eyebrow="04 / BANC DE TESTS VIRTUELS"
        title="Essais virtuels & tableau visuel"
        description="Comparez cinq perturbations paramétriques du projet actif, consultez les contrôles calculés et exportez le journal d’essais. Les animations et résultats restent locaux et préliminaires."
        action={
          <span className={`live-state ${playing ? "live-on" : "live-off"}`}>
            <span className="live-dot" />{" "}
            {playing ? "SIMULATION" : "EN ATTENTE"}
          </span>
        }
      />
      <div className="live-toolbar">
        <div className="live-toolbar-group">
          <button
            className="primary-button"
            onClick={() => setPlaying(value => !value)}
            disabled={!configured}
            title="Démarre ou met en pause l’animation et le temps simulé; aucun vol réel n’est commandé."
          >
            {playing ? (
              <Pause size={15} />
            ) : (
              <Play size={15} fill="currentColor" />
            )}{" "}
            {playing
              ? "Pause"
              : elapsed === 0
                ? "Lancer la simulation"
                : "Reprendre"}
          </button>
          <button
            className="secondary-button"
            onClick={resetTest}
            title="Remet le chronomètre et l’état visuel à zéro."
          >
            <RefreshCw size={15} /> Réinitialiser
          </button>
          <button
            className="secondary-button"
            onClick={stepTest}
            disabled={!configured}
            title="Avance le scénario simulé d’une seconde sans démarrer la lecture continue."
          >
            <ArrowRight size={15} /> Pas suivant
          </button>
          <button
            className="secondary-button"
            onClick={captureTestSnapshot}
            disabled={!configured}
            title="Télécharger un instantané CSV des valeurs affichées"
          >
            <Download size={15} /> Exporter un instantané
          </button>
        </div>
        <div
          className="live-mode-buttons"
          role="group"
          aria-label="Mode de conduite de la simulation"
        >
          <button
            className={mode === "manual" ? "is-active" : ""}
            aria-pressed={mode === "manual"}
            title="Les manches virtuels influencent directement la trajectoire simulée."
            onClick={() => setMode("manual")}
          >
            MANUEL
          </button>
          <button
            className={mode === "supervised" ? "is-active" : ""}
            aria-pressed={mode === "supervised"}
            title="Les manches virtuels sont atténués pour une démonstration supervisée."
            onClick={() => setMode("supervised")}
          >
            SUPERVISÉ
          </button>
          <button
            className={mode === "safe-return" ? "is-active" : ""}
            aria-pressed={mode === "safe-return"}
            title="Le modèle converge vers le point de départ et ignore les manches."
            onClick={() => setMode("safe-return")}
          >
            RETOUR SÛR
          </button>
        </div>
      </div>
      <div className="live-mode-explanation" role="status">
        {mode === "manual"
          ? "MANUEL · Les manches virtuels influencent directement cap, altitude et vitesse du modèle."
          : mode === "supervised"
            ? "SUPERVISÉ · Les manches virtuels sont limités à 35 % de leur effet nominal."
            : "RETOUR SÛR · L’animation converge vers le point de départ; les manches sont neutralisés."}{" "}
        Toutes ces commandes n’agissent que sur le jumeau numérique local.
      </div>
      <section className="test-telemetry-rail" aria-label="Lecture instrumentée du scénario">
        <div><small>ALTITUDE MODÈLE</small><strong>{configured ? `${altitude} m` : "—"}</strong><span>AGL · scénario local</span></div>
        <div><small>VITESSE CALCULÉE</small><strong>{configured ? `${speed} km/h` : "—"}</strong><span>vent {windSpeed} km/h</span></div>
        <div><small>CAP</small><strong>{configured ? `${heading}°` : "—"}</strong><span>{mode.toUpperCase()}</span></div>
        <div><small>RÉSERVE ESTIMÉE</small><strong>{configured ? `${battery}%` : "—"}</strong><span>run {simulation.runId}</span></div>
      </section>
      <DroneBehaviorPanel configuration={config} context="simulation" state={playing ? "LECTURE SIMULÉE" : "BANC EN ATTENTE"} />
      {!configured && (
        <section className="workspace-demo-gate">
          <div>
            <p className="eyebrow">CONFIGURATION REQUISE</p>
            <strong>
              Architecture, énergie, masse maximale, altitude ou vitesse à
              renseigner.
            </strong>
            <span>
              Les jauges, essais et résultats sont suspendus pour éviter des
              chiffres artificiels. Définissez une architecture, une capacité
              énergétique, une masse maximale, un plafond ≥ 5 m et une vitesse ≥
              5 km/h avant le prévol.
            </span>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={onOpenBuilder}
          >
            <Settings2 size={15} /> Régler les paramètres prévol
          </button>
        </section>
      )}
      <div className="live-grid">
        <section className="panel live-canvas-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">JUMEAU NUMÉRIQUE / TRAJECTOIRE</p>
              <h3>Maquette · comportement simulé</h3>
            </div>
            <span
              className="calculated-badge"
              title={
                mode === "safe-return"
                  ? "Le marqueur converge vers le centre local; aucun GPS ni aéronef n’est utilisé."
                  : mode === "manual"
                    ? "La position suit les commandes virtuelles avec pleine autorité dans le modèle."
                    : "Les commandes virtuelles sont limitées à 35 % dans le modèle."
              }
            >
              <Radio size={13} />{" "}
              {mode === "safe-return"
                ? "Retour vers zone sûre"
                : "Boucle de mission"}
            </span>
          </div>
          <div className="trajectory-control-strip" role="toolbar" aria-label="Commandes de la fenêtre trajectoire">
            <span className="trajectory-strip-label"><Crosshair size={13} /> VUE INSTRUMENTÉE</span>
            <button type="button" className={trajectoryFrame === "tactical" ? "is-active" : ""} aria-pressed={trajectoryFrame === "tactical"} onClick={() => setTrajectoryFrame("tactical")}>TACTIQUE</button>
            <button type="button" className={trajectoryFrame === "clean" ? "is-active" : ""} aria-pressed={trajectoryFrame === "clean"} onClick={() => setTrajectoryFrame("clean")}>ÉPURÉE</button>
            <i />
            <button type="button" className={showGrid ? "is-active" : ""} aria-pressed={showGrid} onClick={() => setShowGrid(value => !value)}>GRILLE</button>
            <button type="button" className={showOrbit ? "is-active" : ""} aria-pressed={showOrbit} onClick={() => setShowOrbit(value => !value)}>ORBITE</button>
            <button type="button" className={showTelemetryOverlay ? "is-active" : ""} aria-pressed={showTelemetryOverlay} onClick={() => setShowTelemetryOverlay(value => !value)}>HUD</button>
            <button type="button" onClick={() => { setElapsed(0); setPlaying(false); setStickRoll(0); setStickPitch(0); setThrottlePct(50); }}>RECADRER</button>
          </div>
          <div className={`live-canvas trajectory-frame-${trajectoryFrame}`}>
            <svg
              viewBox="0 0 100 100"
              role="img"
              aria-label="Simulation animée de la trajectoire du drone"
            >
              <defs>
                <pattern
                  id="liveGrid"
                  width="5"
                  height="5"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 5 0 L 0 0 0 5"
                    fill="none"
                    stroke="rgba(117,226,220,.12)"
                    strokeWidth=".18"
                  />
                </pattern>
                <filter id="droneGlow">
                  <feGaussianBlur stdDeviation="1.4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {showGrid && (
                <rect width="100" height="100" fill="url(#liveGrid)" />
              )}
              {showOrbit && <circle
                cx="50"
                cy="50"
                r="31"
                fill="none"
                stroke="rgba(117,226,220,.25)"
                strokeDasharray="1 2"
              />}
              {showOrbit && <path
                d="M22 52 C30 20 72 18 82 46 S68 79 45 72 S22 52 22 52"
                fill="none"
                stroke="#75e2dc"
                strokeWidth=".7"
                opacity=".55"
              />}
              {showOrbit && <circle cx="50" cy="50" r="2" fill="#86d5a5" />}
              <g
                filter="url(#droneGlow)"
                transform={`translate(${x - 4} ${y - 3}) rotate(${heading} 4 3)`}
              >
                <path
                  d="M0 3 L5 0 L8 3 L5 6 Z"
                  fill="#d9f3f3"
                  stroke="#75e2dc"
                  strokeWidth=".45"
                />
                <path
                  d="M2 3 L-2 1 M6 3 L10 1"
                  stroke="#75e2dc"
                  strokeWidth=".65"
                />
              </g>
              <text x="4" y="8" fill="#829a9b" fontSize="3">
                TRAJECTOIRE LOCALE · SANS GPS
              </text>
              <text x="4" y="95" fill="#829a9b" fontSize="3">
                GEOFENCE DE SCÉNARIO · SIMULÉ
              </text>
            </svg>
            {showTelemetryOverlay && <div className="live-overlay">
              <span><b>MODE</b> {mode.toUpperCase()} · SIMULÉ</span>
              <span><b>RUN</b> {simulation.runId}</span>
              <span><b>ALT</b> {configured ? `${altitude} m` : "—"}</span>
              <span><b>SPD</b> {configured ? `${speed} km/h` : "—"}</span>
            </div>}
          </div>
        </section>
        <aside className="live-metrics">
          <div className="panel live-metric-card">
            <p className="eyebrow">TÉLÉMÉTRIE</p>
            <div className="telemetry-value">
              <strong>{configured ? altitude : "—"}</strong>
              <span>{configured ? "m AGL" : "configuration requise"}</span>
            </div>
            <div className="telemetry-row">
              <span>Vitesse</span>
              <strong>{configured ? `${speed} km/h` : "—"}</strong>
            </div>
            <div className="telemetry-row">
              <span>Cap</span>
              <strong>{configured ? `${heading}°` : "—"}</strong>
            </div>
            <div className="telemetry-row">
              <span>Batterie</span>
              <strong className={battery < 35 ? "telemetry-warning" : ""}>
                {configured ? `${battery}%` : "—"}
              </strong>
            </div>
            <div className="telemetry-row">
              <span>Autonomie modèle</span>
              <strong>
                {configured ? `${formatNumber(simulation.enduranceH)} h` : "—"}
              </strong>
            </div>
          </div>
          <div className="panel live-settings-card">
            <div className="panel-header">
              <h3>Réglages & manche virtuel</h3>
              <Settings2 size={15} className="muted-icon" />
            </div>
            <label className="live-control">
              <span>
                Altitude cible <strong>{targetAltitude} m</strong>
              </span>
              <input
                type="range"
                min="20"
                max="150"
                value={targetAltitude}
                onChange={event =>
                  setConfig({
                    ...config,
                    altitudeM: Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="live-control">
              <span>
                Vent simulé <strong>{windSpeed} km/h</strong>
              </span>
              <input
                type="range"
                min="0"
                max="45"
                value={windSpeed}
                onChange={event =>
                  setConfig({
                    ...config,
                    windSpeedKmh: Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="live-control">
              <span>
                Vitesse × <strong>{speedMultiplier.toFixed(1)}</strong>
              </span>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={speedMultiplier}
                onChange={event =>
                  setSpeedMultiplier(Number(event.target.value))
                }
              />
            </label>
            <div className="virtual-flight-controller">
              <div className="virtual-flight-controller-header">
                <strong>MANCHES DE SIMULATION</strong>
                <span>LOCAL · SANS SORTIE MATÉRIELLE</span>
              </div>
              <label className="live-control">
                <span>
                  Roulis / cap{" "}
                  <strong>
                    {stickRoll > 0 ? "+" : ""}
                    {stickRoll} %
                  </strong>
                </span>
                <input
                  aria-label="Manche virtuel, roulis et cap"
                  type="range"
                  min="-100"
                  max="100"
                  step="5"
                  value={stickRoll}
                  disabled={mode === "safe-return"}
                  onChange={event => setStickRoll(Number(event.target.value))}
                />
              </label>
              <label className="live-control">
                <span>
                  Tangage / altitude{" "}
                  <strong>
                    {stickPitch > 0 ? "+" : ""}
                    {stickPitch} %
                  </strong>
                </span>
                <input
                  aria-label="Manche virtuel, tangage et altitude"
                  type="range"
                  min="-100"
                  max="100"
                  step="5"
                  value={stickPitch}
                  disabled={mode === "safe-return"}
                  onChange={event => setStickPitch(Number(event.target.value))}
                />
              </label>
              <label className="live-control">
                <span>
                  Gaz <strong>{throttlePct} %</strong>
                </span>
                <input
                  aria-label="Gaz virtuel de simulation"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={throttlePct}
                  disabled={mode === "safe-return"}
                  onChange={event => setThrottlePct(Number(event.target.value))}
                />
              </label>
              <div className="virtual-flight-controller-footer">
                <small>
                  {mode === "manual"
                    ? "Autorité complète du manche dans le jumeau numérique."
                    : mode === "supervised"
                      ? "Autorité limitée à 35 %; revue opérateur maintenue."
                      : "Retour sûr automatique actif; commandes manuelles neutralisées."}
                </small>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setStickRoll(0);
                    setStickPitch(0);
                    setThrottlePct(50);
                  }}
                >
                  Centrer les manches
                </button>
              </div>
            </div>
            <label className="live-switch">
              <input
                type="checkbox"
                checked={sensorActive}
                onChange={event => setSensorActive(event.target.checked)}
              />{" "}
              Capteur de mission actif
            </label>
            <label className="live-switch">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={event => setShowGrid(event.target.checked)}
              />{" "}
              Afficher la grille de trajectoire
            </label>
          </div>
          <div className="panel live-event-card">
            <div className="panel-header">
              <h3>Événements live</h3>
              <Timer size={15} className="muted-icon" />
            </div>
            <div className="live-events">
              <span>
                <span className="event-pulse" /> Télémétrie nominale
              </span>
              <span>
                <Navigation size={12} />{" "}
                {configured
                  ? `Trajectoire de scénario · vent ${windSpeed} km/h`
                  : "Trajectoire en attente d’une architecture"}
              </span>
              <span>
                {sensorActive ? (
                  <ShieldCheck size={12} />
                ) : (
                  <AlertTriangle size={12} />
                )}{" "}
                {sensorActive ? "Capteur actif" : "Capteur en pause"}
              </span>
            </div>
          </div>
        </aside>
      </div>
      <section className="panel test-dashboard-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">BANC D’ESSAI / MONITEUR VIRTUEL</p>
            <h3>Moniteur visuel de scénario</h3>
          </div>
          <span className="calculated-badge">
            <Video size={13} /> TEST-{String(testStep).padStart(3, "0")}
          </span>
        </div>
        <div className="test-dashboard-grid">
          <div className="test-video-frame">
            <div className="test-video-scan" />
            <div className="test-video-crosshair" />
            <span className="test-video-label">
              <span className="live-dot" />{" "}
              {playing
                ? "REC · SCÉNARIO EN COURS"
                : configured
                  ? "READY · LANCEZ LA SIMULATION"
                  : "EN ATTENTE · ARCHITECTURE REQUISE"}
            </span>
            {configured && (
              <div
                className="test-video-drone"
                style={{
                  transform: `translate(${Math.sin(phase) * 80}px, ${Math.cos(phase * 1.4) * 18}px) rotate(${heading / 4}deg)`,
                }}
              >
                <span />
              </div>
            )}
            <div className="test-video-footer">
              <span>CAM-01 / VUE SYSTÈME</span>
              <span>
                {configured
                  ? `${altitude} m · ${speed} km/h · ${battery}%`
                  : "— · — · — · valeurs suspendues"}
              </span>
            </div>
          </div>
          <div className="test-event-log">
            <div className="test-log-title">Journal fonctionnel</div>
            {testEvents.map((event, index) => (
              <div className="test-log-row" key={`${event}-${index}`}>
                <span className="event-pulse" />
                <span>{event}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="panel virtual-campaign-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">CAMPAGNE / CALCUL DÉTERMINISTE LOCAL</p>
            <h3>Suite d’essais paramétriques</h3>
          </div>
          <span className="calculated-badge">
            {campaignIsCurrent
              ? campaign.runId
              : executedCampaign
                ? "PARAMÈTRES MODIFIÉS"
                : "APERÇU"}
          </span>
        </div>
        <div className="virtual-campaign-toolbar">
          <span>
            {configured
              ? `${campaign.counts.pass} cohérents · ${campaign.counts.review} à revoir · ${campaign.counts.fail} échecs`
              : "Configuration requise avant tout calcul"}
          </span>
          <div className="header-actions">
            <button
              className="primary-button"
              onClick={runTestCampaign}
              disabled={!configured}
              title={
                !configured
                  ? "Chargez une architecture et ses paramètres dans la bibliothèque"
                  : "Calcule les cinq perturbations déterministes du modèle courant"
              }
            >
              <Play size={14} /> Exécuter la campagne
            </button>
            <button
              className="secondary-button"
              onClick={exportTestCampaign}
              disabled={!configured}
            >
              <Download size={14} /> Exporter CSV
            </button>
          </div>
        </div>
        {configured ? (
          <>
            <div
              className="virtual-test-case-grid"
              role="group"
              aria-label="Scénarios d’essai"
            >
              {campaign.cases.map(test => (
                <button
                  type="button"
                  key={test.id}
                  className={`virtual-test-case is-${test.status} ${selectedTestId === test.id ? "is-selected" : ""}`}
                  aria-pressed={selectedTestId === test.id}
                  onClick={() => setSelectedTestId(test.id)}
                >
                  <span className="virtual-test-case-heading">
                    <strong>{test.label}</strong>
                    <b>
                      {test.status === "pass"
                        ? "COHÉRENT"
                        : test.status === "fail"
                          ? "ÉCHEC"
                          : "À REVOIR"}
                    </b>
                  </span>
                  <small>{test.perturbation}</small>
                  <span className="virtual-test-case-metrics">
                    {formatNumber(test.result.totalMassKg, 2)} kg ·{" "}
                    {formatNumber(test.result.enduranceH, 2)} h
                  </span>
                </button>
              ))}
            </div>
            <div className="virtual-test-detail">
              <div className="virtual-test-detail-heading">
                <div>
                  <p className="eyebrow">
                    {selectedTest.id.toUpperCase()} / RÉSULTAT DE MODÈLE
                  </p>
                  <strong>{selectedTest.label}</strong>
                  <span>{selectedTest.description}</span>
                </div>
                <span
                  className={`virtual-test-status is-${selectedTest.status}`}
                >
                  {selectedTest.status === "pass"
                    ? "COHÉRENT"
                    : selectedTest.status === "fail"
                      ? "ÉCHEC"
                      : "À REVOIR"}
                </span>
              </div>
              <div className="virtual-test-check-grid">
                {selectedTest.checks.map(check => (
                  <article
                    key={check.id}
                    className={`virtual-test-check is-${check.status}`}
                  >
                    <span>
                      {check.status === "pass"
                        ? "PASS"
                        : check.status === "fail"
                          ? "FAIL"
                          : "REVUE"}
                    </span>
                    <strong>{check.label}</strong>
                    <b>{check.value}</b>
                    <small>Cible : {check.target}</small>
                    <p>{check.note}</p>
                  </article>
                ))}
              </div>
              <small className="virtual-test-provenance">
                {campaign.runId} · calcul{" "}
                {new Date(campaign.generatedAt).toLocaleString("fr-FR")} ·{" "}
                {campaignIsCurrent
                  ? "paramètres identiques au dernier run"
                  : "aperçu recalculé après modification"}
              </small>
            </div>
          </>
        ) : (
          <div className="workspace-demo-gate">
            <div>
              <strong>Campagne indisponible</strong>
              <span>
                Une architecture, une capacité énergétique, une limite
                d’altitude et une vitesse de croisière exploitables sont
                nécessaires.
              </span>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={onOpenBuilder}
            >
              Régler les paramètres prévol
            </button>
          </div>
        )}
      </section>
      <section className="telemetry-analytics-panel panel" aria-label="Télémétrie analytique temps réel">
        <div className="panel-header"><div><p className="eyebrow">ANALYTIQUE / STREAM SYNTHÉTIQUE</p><h3>Courbes interconnectées</h3></div><span className="live-state live-on">LIVE</span></div>
        <div className="telemetry-chart-grid">
          {[{ title: "Stress structurel", unit: "σ / marge", color: "#ffb300", values: [28,34,31,46,43,58,51,65,60,72,66,78] }, { title: "Coefficient de traînée", unit: "Cd / profil", color: "#00e5ff", values: [62,57,59,53,55,48,51,45,47,41,44,38] }, { title: "Décharge batterie", unit: "% / cycle", color: "#00ff66", values: [96,92,89,84,81,76,72,66,61,55,49,43] }].map(chart => { const points = chart.values.map((value, index) => `${index * 16},${100 - value}`).join(" "); return <article className="telemetry-chart-card" key={chart.title}><div className="telemetry-chart-heading"><strong>{chart.title}</strong><span>{chart.unit}</span></div><svg viewBox="0 0 176 100" preserveAspectRatio="none" role="img" aria-label={`${chart.title}, graphique temps réel`}><path d="M0 20H176M0 50H176M0 80H176" className="telemetry-chart-gridline" /><polyline points={points} fill="none" stroke={chart.color} strokeWidth="2" vectorEffect="non-scaling-stroke" className="telemetry-chart-line" /><circle cx="176" cy={100 - chart.values.at(-1)!} r="3" fill={chart.color} /></svg><small>échantillons glissants · t−12 → maintenant</small></article>; })}
        </div>
      </section>
      <div className="live-disclaimer">
        <AlertTriangle size={15} /> Tous les essais utilisent des modèles
        déterministes préliminaires et des perturbations de scénario; aucune
        mesure physique, validation de stabilité ou certification n’est produite
        et aucun ordre n’est envoyé à un aéronef.
      </div>
    </div>
  );
}

function TestFlightCoordinator() {
  const [phase, setPhase] = useState<
    "idle" | "preflight" | "ready" | "stopped"
  >("idle");
  const [mission, setMission] = useState("Essai captif de trajectoire");
  const [log, setLog] = useState<string[]>([
    "Fenêtre d’essai prête · simulation uniquement",
  ]);
  const record = (message: string) =>
    setLog(items =>
      [
        `${new Date().toLocaleTimeString("fr-FR")} · ${message}`,
        ...items,
      ].slice(0, 5)
    );
  const start = () => {
    setPhase("preflight");
    record("Prévol lancée · contrôles géorepérage, batterie et liaison");
    window.setTimeout(() => {
      setPhase("ready");
      record(
        "Prévol validée · lancement simulé autorisé après approbation humaine"
      );
    }, 500);
  };
  return (
    <section className="panel test-coordinator">
      <div className="panel-header">
        <div>
          <p className="eyebrow">COORDINATION / ESSAI SUPERVISÉ</p>
          <h3>Fenêtre de vol d’essai</h3>
        </div>
        <span className={`live-state live-${phase === "ready" ? "on" : "off"}`}>
          {phase === "ready"
            ? "PRÊT"
            : phase === "preflight"
              ? "PRÉVOL"
              : phase === "stopped"
                ? "ARRÊTÉ"
                : "EN ATTENTE"}
        </span>
      </div>
      <div className="test-coordinator-controls">
        <label>
          Mission
          <select
            value={mission}
            onChange={event => setMission(event.target.value)}
          >
            <option>Essai captif de trajectoire</option>
            <option>Validation retour sûr</option>
            <option>Inspection simulée de capteur</option>
          </select>
        </label>
        <div className="operation-actions">
          <button
            className="primary-button"
            onClick={start}
            disabled={phase === "preflight"}
          >
            <Play size={15} /> Préparer l’essai
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              setPhase("stopped");
              record("Arrêt opérateur · essai simulé interrompu");
            }}
          >
            <Pause size={15} /> Arrêt d’urgence logiciel
          </button>
        </div>
      </div>
      <div className="test-event-log">
        {log.map((item, index) => (
          <div className="test-log-row" key={`${item}-${index}`}>
            <span className="event-pulse" />
            <span>{item}</span>
          </div>
        ))}
      </div>
      <div className="live-disclaimer">
        <AlertTriangle size={15} /> Cette fenêtre orchestre uniquement une
        simulation supervisée et un essai au sol. Elle n’envoie aucun ordre à un
        aéronef réel.
      </div>
    </section>
  );
}

type MissionTelemetry = MissionTelemetryFrame & { receivedAt: number };
type ObservationOperation =
  | "surveillance"
  | "inspection"
  | "mapping"
  | "search-rescue"
  | "relay"
  | "environmental";
const observationOperations: Array<{
  id: ObservationOperation;
  label: string;
  short: string;
  description: string;
  accent: string;
}> = [
  {
    id: "surveillance",
    label: "Surveillance périmétrique",
    short: "SURV",
    description: "Couverture de secteur · détection passive · suivi de zone",
    accent: "cyan",
  },
  {
    id: "inspection",
    label: "Inspection technique",
    short: "INSP",
    description: "Repérage de défauts · structure · points d’intérêt",
    accent: "amber",
  },
  {
    id: "mapping",
    label: "Cartographie 3D",
    short: "MAP",
    description: "Grille de recouvrement · trajectoire de relevé · nadir",
    accent: "blue",
  },
  {
    id: "search-rescue",
    label: "Recherche & secours",
    short: "SAR",
    description: "Secteur prioritaire · balise · corridor de recherche",
    accent: "coral",
  },
  {
    id: "relay",
    label: "Relais de communication",
    short: "RELAY",
    description: "Couverture radio · nœuds · qualité de liaison",
    accent: "violet",
  },
  {
    id: "environmental",
    label: "Observation environnementale",
    short: "ECO",
    description: "Vent, température, terrain · mesures comparables",
    accent: "green",
  },
];

function MissionOperationsView({
  projectName,
  config,
  activeProfile,
  simulation,
  setConfig,
  onOpenBuilder,
  onLoadDemoPlan,
  simulationArmed,
  onSimulationArmedChange,
}: {
  projectName: string;
  config: ConceptConfig;
  activeProfile?: DroneCatalogDesign;
  simulation: SimulationResult;
  setConfig: SetConceptConfig;
  onOpenBuilder: () => void;
  onLoadDemoPlan: () => void;
  simulationArmed: boolean;
  onSimulationArmedChange: (value: boolean) => void;
}) {
  const flightDesignProfile = activeProfile ?? (config.platformProfile
    ? findDroneProfile(config.platformProfile)
    : undefined);
  // Le pont ne fabrique jamais de maquette de secours : seul le profil choisi
  // explicitement dans la Bibliothèque peut être affiché.
  const flightDesign: DroneCatalogDesign | undefined = flightDesignProfile
    ? {
        ...flightDesignProfile,
        configuration: { ...flightDesignProfile.configuration, ...config },
      }
    : undefined;
  const observationRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const cameraRef = useRef<MediaStream | null>(null);
  const testFeedCleanupRef = useRef<(() => void) | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const mavlinkPollRef = useRef<number | null>(null);
  const [streamUrl, setStreamUrl] = useState("");
  const [activeStreamUrl, setActiveStreamUrl] = useState("");
  const [videoState, setVideoState] = useState<
    "offline" | "connecting" | "live" | "error"
  >("offline");
  const [observationClock, setObservationClock] = useState(() => Date.now());
  const [videoError, setVideoError] = useState("");
  const [videoSize, setVideoSize] = useState("");
  const [showObservationReticle, setShowObservationReticle] = useState(true);
  const [showTelemetryOverlay, setShowTelemetryOverlay] = useState(true);
  const [observationLayer, setObservationLayer] = useState<
    "tactical" | "systems" | "spectrum"
  >("tactical");
  const [observationOperation, setObservationOperation] =
    useState<ObservationOperation>("surveillance");
  const [cameraActive, setCameraActive] = useState(false);
  const [testFeedActive, setTestFeedActive] = useState(false);
  const [telemetryUrl, setTelemetryUrl] = useState("");
  const [telemetryState, setTelemetryState] = useState<
    "offline" | "connecting" | "connected" | "error"
  >("offline");
  const [telemetryError, setTelemetryError] = useState("");
  const [mavlinkObserverStatus, setMavlinkObserverStatus] = useState("INACTIF");
  const [telemetry, setTelemetry] = useState<MissionTelemetry | null>(null);
  const [telemetrySource, setTelemetrySource] = useState<
    "none" | "synthetic" | "wss" | "mavlink"
  >("none");
  const [telemetryConsent, setTelemetryConsent] = useState(false);
  const [telemetryProtocolChecks, setTelemetryProtocolChecks] = useState<boolean[]>(
    () => TELEMETRY_ACTIVATION_PROTOCOL.map(() => false)
  );
  const telemetryProtocolReady = areAllProtocolChecksAcknowledged(telemetryProtocolChecks);
  const [demoState, setDemoState] = useState<
    | "ready"
    | "running"
    | "paused"
    | "hold"
    | "returning"
    | "stopped"
    | "emergency-land"
  >("ready");
  const [activeWaypoint, setActiveWaypoint] = useState(0);
  const [routeDrawingEnabled, setRouteDrawingEnabled] = useState(false);
  const [operatorApproved, setOperatorApproved] = useState(false);
  const [simulationProtocolChecks, setSimulationProtocolChecks] = useState<boolean[]>(
    () => SIMULATION_ACTIVATION_PROTOCOL.map(() => false)
  );
  const simulationProtocolReady = areAllProtocolChecksAcknowledged(simulationProtocolChecks);
  const [missionElapsedSeconds, setMissionElapsedSeconds] = useState(0);
  const [operationLog, setOperationLog] = useState<string[]>([
    "Poste initialisé · aucune liaison aéronef active",
  ]);
  // Flux de simulation continu : l'horizon artificiel et les graphiques de
  // télémétrie sont alimentés en permanence, sans activation manuelle.
  const [visionMode, setVisionMode] = useState<VisionMode>("visible");
  const [visionGainPct, setVisionGainPct] = useState(62);
  useEffect(() => {
    const timer = window.setInterval(() => setObservationClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const liveParams = useMemo(
    () => ({
      cruiseSpeedKmh: config.cruiseSpeedKmh,
      designAltitudeM: config.altitudeM,
      batteryWh: config.batteryWh,
      payloadKg: config.payloadKg,
      motorCount: config.motorCount ?? 4,
      reserveFraction: config.reserveFraction,
    }),
    [
      config.cruiseSpeedKmh,
      config.altitudeM,
      config.batteryWh,
      config.payloadKg,
      config.motorCount,
      config.reserveFraction,
    ]
  );
  const [liveFlight, setLiveFlight] = useState<LiveFlightState>(() =>
    createLiveFlightState(liveParams)
  );
  useEffect(() => {
    setLiveFlight(current =>
      setLiveArmed(current, simulationArmed, liveParams)
    );
  }, [simulationArmed, liveParams]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveFlight(current => advanceLiveFlight(current, 0.25, liveParams));
    }, 250);
    return () => window.clearInterval(timer);
  }, [liveParams]);
  const liveAltitudeSeries = liveSeries(liveFlight.samples, "altitudeM");
  const liveSpeedSeries = liveSeries(liveFlight.samples, "speedKmh");
  const liveBatterySeries = liveSeries(liveFlight.samples, "batteryPct");
  const livePowerSeries = liveSeries(liveFlight.samples, "powerW");
  const liveVibrationSeries = liveSeries(liveFlight.samples, "vibrationG");
  const liveLinkSeries = liveSeries(liveFlight.samples, "linkQualityPct");
  const setSimulationArmState = (nextArmed: boolean) => {
    if (nextArmed && (!simulationProtocolReady || !operatorApproved)) {
      recordOperation("Armement virtuel refusé · protocole humain complet et approbation explicite requis");
      return;
    }
    const decision = authorizeControlCommand(
      {
        kind: nextArmed ? "simulation-arm" : "simulation-disarm",
        operator: "opérateur-local",
        requestedAt: new Date().toISOString(),
      },
      "simulation"
    );
    const audit = createControlAuditEvent(decision);
    if (!decision.accepted) {
      recordOperation(`${audit.id} · refusé · ${decision.reason}`);
      return;
    }
    onSimulationArmedChange(nextArmed);
    if (!nextArmed) setVisionMode("visible");
    recordOperation(
      `${audit.id} · ${nextArmed ? "armement virtuel du scénario local" : "désarmement virtuel"} · état global mis à jour, aucune sortie actionneur`
    );
  };
  const missionPlan: LocalMissionPlan = {
    ...defaultLocalMissionPlan,
    ...config.missionPlan,
    waypoints: config.missionPlan?.waypoints ?? [],
  };
  const approvalFingerprint = JSON.stringify({
    airframe: config.airframe,
    batteryWh: config.batteryWh,
    altitudeM: config.altitudeM,
    cruiseSpeedKmh: config.cruiseSpeedKmh,
    missionPlan,
    missionEnvironment: config.missionEnvironment,
  });
  const waypoints = missionPlan.waypoints;
  const missionChecks = validateLocalMission(config, missionPlan);
  const blockingPreflight = missionChecks.some(
    check => check.severity === "block"
  );
  const missionDistanceKm = estimateLocalMissionDistanceKm(missionPlan);
  const addMissionWaypointFromCommandCanvas = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!routeDrawingEnabled || missionPlan.waypoints.length >= 64) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(3, Math.min(97, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.max(3, Math.min(97, ((event.clientY - bounds.top) / bounds.height) * 100));
    const waypoint: MissionWaypoint = {
      id: `CMD-WP-${Date.now()}-${missionPlan.waypoints.length + 1}`,
      name: `Point dessiné ${missionPlan.waypoints.length + 1}`,
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
      altitudeM: Math.min(config.altitudeM, Math.max(1, config.altitudeM)),
      speedKmh: Math.max(1, config.cruiseSpeedKmh),
      action: "inspection",
    };
    setConfig({
      ...config,
      missionPlan: { ...missionPlan, waypoints: [...missionPlan.waypoints, waypoint] },
    });
    recordOperation(`Itinéraire manuel · point ${missionPlan.waypoints.length + 1} ajouté au plan local`);
  };
  const clearCommandRoute = () => {
    setConfig({ ...config, missionPlan: { ...missionPlan, waypoints: [] } });
    setActiveWaypoint(0);
    recordOperation("Itinéraire manuel effacé · plan local vidé");
  };
  const routePoints = [
    { x: missionPlan.homeX, y: missionPlan.homeY },
    ...waypoints,
    { x: missionPlan.homeX, y: missionPlan.homeY },
  ]
    .map(point => `${point.x},${point.y}`)
    .join(" ");
  const virtualAircraftPosition =
    demoState === "returning" || demoState === "stopped" || demoState === "emergency-land"
      ? { x: missionPlan.homeX, y: missionPlan.homeY }
      : (waypoints[activeWaypoint] ?? {
          x: missionPlan.homeX,
          y: missionPlan.homeY,
        });
  const recordOperation = (message: string) =>
    setOperationLog(current =>
      [
        `${new Date().toLocaleTimeString("fr-FR")} · ${message}`,
        ...current,
      ].slice(0, 8)
    );
  const activateLocalControl = () => {
    onLoadDemoPlan();
    setDemoState("ready");
    setActiveWaypoint(0);
    setMissionElapsedSeconds(0);
    setOperatorApproved(false);
    setSimulationProtocolChecks(SIMULATION_ACTIVATION_PROTOCOL.map(() => false));
    recordOperation(
      "Parcours local chargé · approbation opérateur requise séparément"
    );
  };

  useEffect(() => {
    setOperatorApproved(false);
    setSimulationProtocolChecks(SIMULATION_ACTIVATION_PROTOCOL.map(() => false));
    if (simulationArmed) onSimulationArmedChange(false);
    if (demoState === "running") {
      setDemoState("paused");
      recordOperation(
        "Configuration modifiée · scénario mis en pause pour nouvelle revue opérateur"
      );
    }
  }, [approvalFingerprint]);

  useEffect(() => {
    if (demoState !== "running") return;
    const timer = window.setInterval(
      () => setMissionElapsedSeconds(value => value + 1),
      1000
    );
    return () => window.clearInterval(timer);
  }, [demoState]);

  useEffect(() => {
    if (demoState !== "returning") return;
    const timer = window.setTimeout(() => {
      setDemoState("stopped");
      setActiveWaypoint(0);
      recordOperation("Retour simulé terminé · démonstration clôturée");
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [demoState]);

  const stopTestFeed = () => {
    testFeedCleanupRef.current?.();
    testFeedCleanupRef.current = null;
    setTestFeedActive(false);
    if (telemetrySource === "synthetic") {
      setTelemetrySource("none");
      setTelemetryState("offline");
      setTelemetry(null);
    }
  };
  const stopCamera = () => {
    stopTestFeed();
    cameraRef.current?.getTracks().forEach(track => track.stop());
    cameraRef.current = null;
    setCameraActive(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!activeStreamUrl || !video) return;
    setVideoState("connecting");
    setVideoError("");
    video.srcObject = null;
    const isHls = /\.m3u8(?:$|\?)/i.test(activeStreamUrl);
    let hls: Hls | null = null;
    let disposed = false;
    const onLoaded = () => setVideoState("live");
    const onVideoError = () => {
      setVideoState("error");
      setVideoError(
        "Le navigateur n’a pas pu lire ce flux. Vérifiez l’URL, le format et les autorisations CORS."
      );
    };
    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("error", onVideoError);
    const startPlayback = async () => {
      if (isHls) {
        try {
          const { default: HlsPlayer } = await import("hls.js");
          if (disposed) return;
          if (HlsPlayer.isSupported()) {
            hls = new HlsPlayer({ enableWorker: true, lowLatencyMode: true });
            hlsRef.current = hls;
            hls.on(HlsPlayer.Events.MEDIA_ATTACHED, () =>
              hls?.loadSource(activeStreamUrl)
            );
            hls.on(HlsPlayer.Events.MANIFEST_PARSED, () => {
              setVideoState("live");
              void video.play().catch(() => undefined);
            });
            hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
              if (data.fatal) {
                setVideoState("error");
                setVideoError(
                  `Erreur de lecture HLS (${data.type}). Vérifiez l’accès réseau et CORS du serveur vidéo.`
                );
              }
            });
            hls.attachMedia(video);
            return;
          }
          if (!video.canPlayType("application/vnd.apple.mpegurl")) {
            setVideoState("error");
            setVideoError(
              "Ce navigateur ne prend pas en charge HLS nativement."
            );
            return;
          }
        } catch {
          if (!disposed) {
            setVideoState("error");
            setVideoError("Le lecteur HLS n’a pas pu être chargé.");
          }
          return;
        }
      }
      if (disposed) return;
      video.src = activeStreamUrl;
      video.load();
      void video.play().catch(() => undefined);
    };
    void startPlayback();
    return () => {
      disposed = true;
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onVideoError);
      hls?.destroy();
      if (hlsRef.current === hls) hlsRef.current = null;
      // Le changement vers la caméra locale ou le flux synthétique peut
      // intervenir avant l’exécution du cleanup React. Ne pas détruire le
      // nouveau MediaStream installé entre-temps.
      if (!video.srcObject) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [activeStreamUrl]);

  useEffect(
    () => () => {
      testFeedCleanupRef.current?.();
      cameraRef.current?.getTracks().forEach(track => track.stop());
      socketRef.current?.close();
      if (mavlinkPollRef.current !== null) window.clearInterval(mavlinkPollRef.current);
      hlsRef.current?.destroy();
    },
    []
  );

  const connectVideoStream = () => {
    let parsed: URL;
    try {
      parsed = new URL(streamUrl.trim());
    } catch {
      setVideoState("error");
      setVideoError(
        "Saisissez une URL vidéo complète en https:// (HLS .m3u8 ou média compatible navigateur)."
      );
      return;
    }
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      (window.location.protocol === "https:" &&
        parsed.protocol !== "https:" &&
        !["localhost", "127.0.0.1"].includes(parsed.hostname))
    ) {
      setVideoState("error");
      setVideoError(
        "Sur une page HTTPS, le flux distant doit aussi être servi en HTTPS. RTSP doit passer par une passerelle HLS/WebRTC."
      );
      return;
    }
    stopCamera();
    setVideoSize("");
    setActiveStreamUrl(parsed.toString());
    recordOperation("Source vidéo réseau demandée par l’opérateur");
  };

  const startTestFeed = () => {
    const video = videoRef.current;
    if (!video || !HTMLCanvasElement.prototype.captureStream) {
      setVideoState("error");
      setVideoError(
        "Le navigateur ne prend pas en charge le flux de test local."
      );
      return;
    }
    setActiveStreamUrl("");
    hlsRef.current?.destroy();
    stopCamera();
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 540;
    const context = canvas.getContext("2d");
    if (!context) return;
    const scene = new Image();
    scene.src = "/assets/flight-observation-simulation.webp";
    let frame = 0;
    const draw = () => {
      frame += 1;
      if (scene.complete && scene.naturalWidth) {
        context.drawImage(scene, 0, 0, canvas.width, canvas.height);
      } else {
        const fallback = context.createLinearGradient(0, 0, 0, canvas.height);
        fallback.addColorStop(0, "#294b50");
        fallback.addColorStop(1, "#132c2c");
        context.fillStyle = fallback;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.fillStyle = "rgba(3, 10, 13, 0.18)";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const aircraftX = 140 + ((frame * 2) % 680);
      const aircraftY = 270 + Math.sin(frame / 24) * 70;
      context.strokeStyle = "rgba(231, 255, 250, 0.92)";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(aircraftX, aircraftY, 18, 0, Math.PI * 2);
      context.moveTo(aircraftX - 30, aircraftY);
      context.lineTo(aircraftX + 30, aircraftY);
      context.moveTo(aircraftX, aircraftY - 30);
      context.lineTo(aircraftX, aircraftY + 30);
      context.stroke();
      context.fillStyle = "rgba(3, 10, 13, 0.82)";
      context.fillRect(20, 20, 300, 112);
      context.strokeStyle = "rgba(117, 226, 220, 0.45)";
      context.strokeRect(20, 20, 300, 112);
      context.fillStyle = "#e4f0ed";
      context.font = "bold 15px monospace";
      context.fillText("AEROMIND · DÉMO VISUELLE", 34, 48);
      context.fillStyle = "#75e2dc";
      context.font = "14px monospace";
      context.fillText(
        `ALT  ${Math.round(80 + Math.sin(frame / 18) * 4)} m`,
        34,
        76
      );
      context.fillText(
        `VIT  ${Math.round(42 + Math.sin(frame / 20) * 3)} km/h`,
        34,
        99
      );
      context.fillText(
        `BATT ${Math.max(0, Math.round(86 - frame / 900))}%`,
        184,
        99
      );
      context.fillStyle = "rgba(3, 10, 13, 0.82)";
      context.fillRect(20, canvas.height - 48, 430, 28);
      context.fillStyle = "#edbd73";
      context.font = "12px monospace";
      context.fillText(
        "LIAISON SYNTHÉTIQUE LOCALE · TÉLÉMÉTRIE ACTIVE",
        32,
        canvas.height - 29
      );
      setTelemetry({
        altitudeM: Math.round(80 + Math.sin(frame / 18) * 4),
        speedKmh: Math.round(42 + Math.sin(frame / 20) * 3),
        batteryPct: Math.max(0, Math.round(86 - frame / 900)),
        headingDeg: Math.round((frame * 1.7) % 360),
        flightMode: "SIMULATION / SUPERVISÉ",
        receivedAt: Date.now(),
      });
    };
    draw();
    const timer = window.setInterval(draw, 1000 / 24);
    const stream = canvas.captureStream(24);
    cameraRef.current = stream;
    video.srcObject = stream;
    void video.play().catch(() => {
      setVideoState("error");
      setVideoError("La lecture automatique de la simulation a été bloquée. Cliquez sur Lecture dans le lecteur vidéo.");
    });
    testFeedCleanupRef.current = () => window.clearInterval(timer);
    setTestFeedActive(true);
    setCameraActive(false);
    setVideoState("live");
    setTelemetryState("connected");
    setTelemetrySource("synthetic");
    setVideoSize("960 × 540");
    setVideoError("");
    recordOperation(
      "Flux de test local activé · liaison synthétique locale opérationnelle"
    );
  };

  const startLocalCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setVideoState("error");
      setVideoError(
        "La caméra locale nécessite un navigateur compatible et une page sécurisée HTTPS."
      );
      return;
    }
    setActiveStreamUrl("");
    setVideoSize("");
    hlsRef.current?.destroy();
    stopCamera();
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      cameraRef.current = media;
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setVideoState("live");
      setVideoError("");
      recordOperation("Caméra locale ouverte · ce n’est pas un flux drone");
    } catch (error) {
      setVideoState("error");
      setVideoError(
        error instanceof Error
          ? error.message
          : "Accès caméra refusé ou indisponible."
      );
    }
  };

  const disconnectVideo = () => {
    setActiveStreamUrl("");
    stopCamera();
    setVideoState("offline");
    setVideoError("");
    setVideoSize("");
    recordOperation("Source vidéo déconnectée");
  };

  const toggleObservationFullscreen = async () => {
    const screen = observationRef.current;
    if (!screen) return;
    try {
      if (document.fullscreenElement === screen) {
        await document.exitFullscreen();
      } else if (screen.requestFullscreen) {
        await screen.requestFullscreen();
      }
    } catch {
      recordOperation("Plein écran indisponible dans ce navigateur");
    }
  };

  const connectMavlinkObserver = () => {
    if (!telemetryProtocolReady || !telemetryConsent) {
      setTelemetryState("error");
      setTelemetryError("Connexion refusée : complétez le protocole humain et confirmez l’observation en lecture seule.");
      return;
    }
    socketRef.current?.close();
    socketRef.current = null;
    if (mavlinkPollRef.current !== null) window.clearInterval(mavlinkPollRef.current);
    setTelemetry(null);
    setTelemetrySource("mavlink");
    setTelemetryState("connecting");
    setTelemetryError("");
    setMavlinkObserverStatus("CONNEXION À L’OBSERVATEUR");

    const poll = async () => {
      if (mavlinkPollRef.current === null) return;
      try {
        const response = await fetch("/api/telemetry/mavlink/status", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const snapshot = parseMavlinkObserverSnapshot(await response.json());
        if (!snapshot) throw new Error("Contrat observateur lecture seule invalide");
        if (mavlinkPollRef.current === null) return;
        setMavlinkObserverStatus(snapshot.status);
        setTelemetryState(snapshot.connected ? "connected" : "connecting");
        setTelemetrySource("mavlink");
        setTelemetry(snapshot.frame && snapshot.receivedAt !== undefined
          ? { ...snapshot.frame, receivedAt: snapshot.receivedAt }
          : null);
        setTelemetryError(snapshot.connected
          ? ""
          : `Observateur actif en lecture seule · état ${snapshot.status}; en attente d’un heartbeat récent.`);
      } catch (error) {
        if (mavlinkPollRef.current === null) return;
        setTelemetryState("error");
        setMavlinkObserverStatus("ERREUR");
        setTelemetryError(error instanceof Error
          ? `Observateur MAVLink indisponible : ${error.message}`
          : "Observateur MAVLink indisponible.");
      }
    };
    mavlinkPollRef.current = window.setInterval(() => void poll(), 1000);
    void poll();
    recordOperation("Observateur MAVLink activé après checklist · réception entrante en lecture seule");
  };

  const connectTelemetry = () => {
    if (!telemetryProtocolReady || !telemetryConsent) {
      setTelemetryState("error");
      setTelemetryError("Connexion refusée : complétez le protocole humain et confirmez la réception en lecture seule.");
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(telemetryUrl.trim());
    } catch {
      setTelemetryState("error");
      setTelemetryError(
        "Saisissez l’URL WebSocket complète de votre passerelle télémétrie."
      );
      return;
    }
    const localHost = ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if (
      parsed.protocol !== "wss:" &&
      !(
        parsed.protocol === "ws:" &&
        localHost &&
        window.location.protocol !== "https:"
      )
    ) {
      setTelemetryState("error");
      setTelemetryError(
        "La télémétrie doit utiliser WSS. WS n’est toléré qu’en test local non sécurisé."
      );
      return;
    }
    if (mavlinkPollRef.current !== null) {
      window.clearInterval(mavlinkPollRef.current);
      mavlinkPollRef.current = null;
    }
    socketRef.current?.close();
    setTelemetry(null);
    setTelemetrySource("none");
    setTelemetryError("");
    setTelemetryState("connecting");
    try {
      const socket = new WebSocket(parsed.toString());
      socketRef.current = socket;
      socket.onopen = () => {
        if (socketRef.current === socket) {
          setTelemetryState("connected");
          setTelemetrySource("wss");
          recordOperation("Passerelle télémétrie connectée · lecture seule");
        }
      };
      socket.onmessage = event => {
        const telemetryResult = ingestReadOnlyTelemetry(event.data);
        const frame = telemetryResult.frame;
        if (!telemetryResult.accepted || !frame) {
          setTelemetryError(
            "Message ignoré : la passerelle doit émettre un objet JSON de télémétrie."
          );
          return;
        }
        setTelemetry({ ...frame, receivedAt: Date.now() });
      };
      socket.onerror = () => {
        if (socketRef.current === socket) {
          setTelemetryState("error");
          setTelemetry(null);
          setTelemetryError(
            "Connexion impossible. Vérifiez le WSS, le certificat TLS, l’accès réseau et le format de la passerelle."
          );
        }
      };
      socket.onclose = () => {
        if (socketRef.current === socket) {
          setTelemetryState("offline");
          setTelemetrySource("none");
          setTelemetry(null);
        }
      };
    } catch (error) {
      setTelemetryState("error");
      setTelemetryError(
        error instanceof Error
          ? error.message
          : "Impossible d’ouvrir le WebSocket."
      );
    }
  };

  const disconnectTelemetry = () => {
    if (mavlinkPollRef.current !== null) {
      window.clearInterval(mavlinkPollRef.current);
      mavlinkPollRef.current = null;
    }
    socketRef.current?.close();
    socketRef.current = null;
    setTelemetryState("offline");
    setTelemetry(null);
    setTelemetrySource("none");
    setMavlinkObserverStatus("INACTIF");
    setTelemetryConsent(false);
    setTelemetryProtocolChecks(TELEMETRY_ACTIVATION_PROTOCOL.map(() => false));
    setTelemetryError("");
    recordOperation("Passerelle télémétrie déconnectée");
  };

  const runLocalOperation = (
    command:
      | "start"
      | "pause"
      | "resume"
      | "waypoint"
      | "hold"
      | "return"
      | "land"
      | "stop"
  ) => {
    const controlKind =
      command === "start"
        ? "simulation-start"
        : command === "pause" || command === "resume"
          ? "simulation-pause"
          : command === "hold"
            ? "simulation-hold"
            : command === "return"
              ? "simulation-return"
              : command === "land"
                ? "simulation-land"
                : "observe";
    const controlDecision = authorizeControlCommand({
      kind: controlKind,
      operator: "local-operator",
      requestedAt: new Date().toISOString(),
      payload: {
        missionId: missionPlan.operationName,
        activeWaypoint,
        waypointCount: waypoints.length,
        state: demoState,
        humanApproved: operatorApproved && simulationProtocolReady,
        preflightPassed: !blockingPreflight,
      },
    });
    const audit = createControlAuditEvent(controlDecision);
    if (!controlDecision.accepted) {
      recordOperation(`${audit.id} · ${controlDecision.reason}`);
      return;
    }
    const labels = {
      start: `${flightDesign?.label ?? config.designName ?? "Drone actif"} · démonstration locale démarrée`,
      pause: "Démonstration locale mise en pause",
      resume: "Démonstration locale reprise",
      waypoint: `Point de mission local sélectionné ${Math.min(activeWaypoint + 2, Math.max(waypoints.length, 1))}/${waypoints.length}`,
      hold: "Maintien de la démonstration locale",
      return: "Retour domicile simulé",
      land: "Atterrissage d’urgence simulé",
      stop: "Démonstration locale clôturée",
    };
    const nextStates = {
      start: "running",
      pause: "paused",
      resume: "running",
      waypoint: "running",
      hold: "hold",
      return: "returning",
      land: "emergency-land",
      stop: "stopped",
    } as const;
    if ((command === "start" || command === "waypoint") && !waypoints.length) {
      onLoadDemoPlan();
      recordOperation("Plan local compatible généré automatiquement pour le drone sélectionné");
    }
    if (command === "start" && !["ready", "stopped"].includes(demoState)) {
      recordOperation(
        "Départ refusé · utilisez Pause/Reprendre ou clôturez d’abord la démonstration en cours"
      );
      return;
    }
    if (command === "start" && !simulationProtocolReady) {
      recordOperation("Départ refusé · protocole humain d’activation incomplet");
      return;
    }
    if (command === "start" && !operatorApproved) {
      recordOperation(
        "Départ refusé · approbation humaine de la démonstration locale requise"
      );
      return;
    }
    if (command === "start" && blockingPreflight) {
      recordOperation(
        "Départ refusé · un contrôle prévol bloquant doit être corrigé"
      );
      return;
    }
    if (command === "start") {
      setActiveWaypoint(0);
      setMissionElapsedSeconds(0);
    }
    if (command === "waypoint" && waypoints.length) {
      if (activeWaypoint >= waypoints.length - 1) {
        recordOperation(
          "Dernier point atteint · utilisez Retour sûr ou Atterrissage simulé pour terminer la route"
        );
        return;
      }
      setActiveWaypoint(current => current + 1);
    }
    if (command === "stop") {
      setOperatorApproved(false);
      setSimulationProtocolChecks(SIMULATION_ACTIVATION_PROTOCOL.map(() => false));
    }
    setDemoState(nextStates[command]);
    recordOperation(
      `${audit.id} · ${labels[command]} · aucune commande envoyée à un aéronef`
    );
  };

  const displayValue = (value: number | undefined, digits = 1) =>
    value === undefined ? "—" : value.toFixed(digits);
  const activeObservationOperation =
    observationOperations.find(item => item.id === observationOperation) ??
    observationOperations[0];
  const telemetryAgeSeconds = telemetry
    ? Math.max(0, Math.floor((observationClock - telemetry.receivedAt) / 1000))
    : null;
  const telemetryFrameFresh = Boolean(telemetryAgeSeconds !== null && telemetryAgeSeconds <= 5);
  const freshTelemetry =
    (telemetrySource === "wss" || telemetrySource === "mavlink") && telemetryFrameFresh ? telemetry : null;
  const observationSimulationActive = ["running", "paused", "hold"].includes(demoState);
  const observationMetricSource = (value: number | undefined) =>
    value === undefined
      ? telemetrySource !== "none"
        ? telemetryState === "connected"
          ? telemetry
            ? `Trame ${telemetrySource === "mavlink" ? "MAVLink" : telemetrySource === "wss" ? "WSS" : "de test"} périmée`
            : `En attente de trame ${telemetrySource === "wss" ? "WSS" : "de test"}`
          : telemetry
            ? `Trame ${telemetrySource === "wss" ? "WSS" : "de test"} périmée`
            : `Aucune trame ${telemetrySource === "wss" ? "WSS" : "de test"} reçue`
        : observationSimulationActive
          ? "Indisponible dans le scénario"
          : "Aucune donnée reçue"
      : telemetrySource !== "none"
        ? telemetrySource === "mavlink" ? "MAVLink · lecture seule" : telemetrySource === "wss" ? "Trame WSS · source non vérifiée" : "Flux de test local · synthétique"
        : "Estimation · scénario local";
  const observationMetrics = {
    altitude:
      telemetrySource !== "none"
        ? (telemetryFrameFresh ? telemetry?.altitudeM : undefined)
        : observationSimulationActive
          ? waypoints[activeWaypoint]?.altitudeM
          : undefined,
    speed:
      telemetrySource !== "none"
        ? (telemetryFrameFresh ? telemetry?.speedKmh : undefined)
        : observationSimulationActive
          ? waypoints[activeWaypoint]?.speedKmh
          : undefined,
    heading:
      telemetrySource !== "none"
        ? (telemetryFrameFresh ? telemetry?.headingDeg : undefined)
        : observationSimulationActive
        ? (() => {
            const previous = waypoints[Math.max(0, activeWaypoint - 1)] ?? { x: missionPlan.homeX, y: missionPlan.homeY };
            const current = waypoints[activeWaypoint] ?? previous;
            return (Math.atan2(current.y - previous.y, current.x - previous.x) * 180) / Math.PI + 90;
          })()
        : undefined,
    battery:
      telemetrySource !== "none"
        ? (telemetryFrameFresh ? telemetry?.batteryPct : undefined)
        : observationSimulationActive
          ? Math.max(1, 100 - missionElapsedSeconds * 0.08)
          : undefined,
    linkQualityPct:
      telemetrySource !== "none" && telemetryFrameFresh ? telemetry?.linkQualityPct : undefined,
    latencyMs: telemetrySource !== "none" && telemetryFrameFresh ? telemetry?.latencyMs : undefined,
    temperatureC:
      telemetrySource !== "none"
        ? (telemetryFrameFresh ? telemetry?.temperatureC : undefined)
        : observationSimulationActive
          ? liveFlight.temperatureC
          : undefined,
    vibrationG:
      telemetrySource !== "none"
        ? (telemetryFrameFresh ? telemetry?.vibrationG : undefined)
        : observationSimulationActive
          ? liveFlight.vibrationG
          : undefined,
  };
  // Le HUD affiche la trame WSS reçue si elle existe, sinon le flux de
  // simulation continue : l'écran d'observation n'est jamais figé.
  const hudUsesExternalFeed = freshTelemetry !== null;
  const hudUsesSimulation = observationSimulationActive || testFeedActive;
  const hudTelemetry = freshTelemetry ?? (testFeedActive && telemetryFrameFresh ? telemetry : null);
  const hudValues = {
    altitudeM: hudTelemetry?.altitudeM ?? (hudUsesSimulation ? liveFlight.altitudeM : undefined),
    speedKmh: hudTelemetry?.speedKmh ?? (hudUsesSimulation ? liveFlight.speedKmh : undefined),
    headingDeg: hudTelemetry?.headingDeg ?? (hudUsesSimulation ? liveFlight.headingDeg : undefined),
    batteryPct: hudTelemetry?.batteryPct ?? (hudUsesSimulation ? liveFlight.batteryPct : undefined),
    pitchDeg: hudUsesSimulation ? liveFlight.pitchDeg : undefined,
    rollDeg: hudUsesSimulation ? liveFlight.rollDeg : undefined,
  };
  return (
    <div className="view-stack mission-operations-view">
      <SectionHeading
        eyebrow="OPS / OBSERVATION EXTERNE · TÉLÉMÉTRIE CONNECTABLE"
        title="Poste de commande de vol"
        description="L’écran d’observation reçoit une source vidéo indépendante et pilote le scénario SITL à partir du plan de mission actif. Les commandes locales modifient réellement l’état virtuel, sans sortie vers un aéronef physique."
        action={
          <div className="mission-header-status">
          <span className="calculated-badge">DRONE ACTIF · {flightDesign?.label ?? config.designName ?? "À configurer"}</span>
          <span
            className={`live-state ${videoState === "live" ? "live-on" : "live-off"}`}
          >
            <span className="live-dot" />
            {videoState === "live"
              ? testFeedActive
                ? "DÉMO VISUELLE LOCALE"
                : "VIDÉO CONNECTÉE"
              : "SOURCE À CONNECTER"}
          </span>
          </div>
        }
      />
      <div className="mission-live-banner">
        <ShieldCheck size={17} />
        <div>
          <strong>État des liaisons</strong>
          <span>
            Vidéo :{" "}
            {videoState === "live" ? "source active" : "aucune source active"} ·
            télémétrie :{" "}
            {telemetryState === "connected"
              ? telemetrySource === "synthetic"
                ? "connectée (simulation locale)"
                : "connectée (lecture seule)"
              : "non connectée"}{" "}
            · commande autopilote : non intégrée
          </span>
        </div>
      </div>
      <section className="panel mission-platform-selector">
        <div className="panel-header">
          <div>
            <p className="eyebrow">CONFIGURATION ACTIVE / PROFIL DE CELLULE</p>
            <h3>Format et architecture du drone</h3>
          </div>
          <Settings2 size={16} className="muted-icon" />
        </div>
        <div className="mission-platform-options mission-platform-options-expanded">
          {architectureChoices.map(choice => (
            <button
              key={choice.id}
              className={
                config.platformProfile ===
                (catalogProfileForChoice[choice.id] ?? choice.id)
                  ? "is-active"
                  : ""
              }
              aria-pressed={
                config.platformProfile ===
                (catalogProfileForChoice[choice.id] ?? choice.id)
              }
              onClick={() => {
                const base = architecturePresets[choice.base];
                setConfig({
                  ...config,
                  ...base,
                  airframe: choice.base,
                  modelType: modelTypeForChoice[choice.id],
                  platformProfile:
                    catalogProfileForChoice[choice.id] ?? choice.id,
                  designName: `${choice.label} / variante manuelle`,
                  wingspan: choice.wingspan,
                  fuselageLength: choice.fuselageLength,
                  motorCount: choice.motors,
                  missionPlan: { ...missionPlan, profileId: choice.id },
                });
              }}
            >
              <b>{choice.label}</b>
              <small>
                {choice.category} · {choice.description} · {choice.motors}{" "}
                moteur(s)
              </small>
            </button>
          ))}
        </div>
        <div className="mission-envelope-controls">
          <label>
            Plafond de conception (m)
            <input
              aria-label="Plafond d’altitude de conception en mètres"
              type="number"
              min="0"
              max="500"
              step="1"
              value={config.altitudeM}
              onChange={event =>
                setConfig({ ...config, altitudeM: Number(event.target.value) })
              }
            />
            <small>
              Renseignez une valeur positive; aucun plafond réglementaire n’est
              inféré.
            </small>
          </label>
          <label>
            Vitesse de croisière (km/h)
            <input
              aria-label="Vitesse de croisière de conception en kilomètres par heure"
              type="number"
              min="0"
              max="300"
              step="1"
              value={config.cruiseSpeedKmh}
              onChange={event =>
                setConfig({
                  ...config,
                  cruiseSpeedKmh: Number(event.target.value),
                })
              }
            />
            <small>Entrée de modèle préliminaire, à documenter.</small>
          </label>
          <label>
            Masse maximale au décollage (kg)
            <input
              aria-label="Masse maximale au décollage en kilogrammes"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={config.maxTakeoffKg}
              onChange={event =>
                setConfig({
                  ...config,
                  maxTakeoffKg: Number(event.target.value),
                })
              }
            />
            <small>
              Valeur de conception requise avant le prévol; pas une mesure
              certifiée.
            </small>
          </label>
        </div>
      </section>
      <section
        className="panel trial-operation-card"
        aria-label="Opération d’essai active"
      >
        <div className="panel-header">
          <div>
            <p className="eyebrow">
              BANC D’ESSAI · SIMULATION ÉCRAN UNIQUEMENT
            </p>
            <h3>{missionPlan.operationName ?? defaultTrialOperation.name}</h3>
            <p className="section-description">
              {
                findTrialOperation(
                  trialOperations.find(
                    item =>
                      item.name ===
                      (missionPlan.operationName ?? defaultTrialOperation.name)
                  )?.id
                ).objective
              }
            </p>
          </div>
          <span className="calculated-badge">NON OFFENSIF · SUPERVISÉ</span>
        </div>
        <div className="trial-operation-safety">
          {
            findTrialOperation(
              trialOperations.find(
                item =>
                  item.name ===
                  (missionPlan.operationName ?? defaultTrialOperation.name)
              )?.id
            ).safetyGate
          }{" "}
          · aucune commande envoyée à un aéronef.
        </div>
      </section>
      <div className="mission-live-banner">
        <ShieldCheck size={17} />
        <div>
          <strong>Frontière de contrôle {CONTROL_BOUNDARY.version}</strong>
          <span>
            Mode actif : simulation / HIL lecture seule · armement, actionneurs,
            téléversement et télémétrie sortante rejetés par contrat.
          </span>
        </div>
      </div>
      <div className="mission-live-grid">
        <section
          className="panel mission-video-panel mission-observation-panel"
          ref={observationRef}
        >
          <div className="panel-header">
            <div>
              <p className="eyebrow">
                OBSERVATION VISUELLE · CANAL INDÉPENDANT
              </p>
              <h3>Écran d’observation de vol</h3>
            </div>
            <div className="mission-observation-tools">
              <button
                type="button"
                className={`mission-observation-tool ${showObservationReticle ? "is-active" : ""}`}
                aria-pressed={showObservationReticle}
                onClick={() => setShowObservationReticle(value => !value)}
                title="Afficher ou masquer le réticule"
              >
                <Crosshair size={14} /> Réticule
              </button>
              <button
                type="button"
                className={`mission-observation-tool ${showTelemetryOverlay ? "is-active" : ""}`}
                aria-pressed={showTelemetryOverlay}
                onClick={() => setShowTelemetryOverlay(value => !value)}
                title="Afficher ou masquer le HUD télémétrique"
              >
                <Eye size={14} /> HUD
              </button>
              <button
                type="button"
                className="mission-observation-tool"
                onClick={() => void toggleObservationFullscreen()}
                aria-label="Agrandir l’écran d’observation ou quitter le plein écran"
                title="Plein écran"
              >
                <Maximize2 size={14} /> Plein écran
              </button>
            </div>
            <div
              className="mission-vision-modes"
              role="group"
              aria-label="Couches de vision de l’écran d’observation"
            >
              {visionModes.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`vision-mode-button mode-${item.id} ${visionMode === item.id ? "is-active" : ""}`}
                  aria-pressed={visionMode === item.id}
                  disabled={!simulationArmed && item.id !== "visible"}
                  title={
                    simulationArmed
                      ? item.description
                      : "Couche disponible après armement virtuel du scénario local."
                  }
                  onClick={() => {
                    setVisionMode(item.id);
                    recordOperation(
                      `Écran d’observation · couche ${item.label.toUpperCase()} · shader simulé, aucune mesure radiométrique`
                    );
                  }}
                >
                  <span>{item.short}</span>
                  {item.label}
                </button>
              ))}
              <label className="vision-gain">
                <span>GAIN {visionGainPct}%</span>
                <input
                  type="range"
                  min="20"
                  max="100"
                  step="1"
                  value={visionGainPct}
                  onChange={event => setVisionGainPct(Number(event.target.value))}
                  aria-label="Gain de la couche de vision simulée"
                />
              </label>
            </div>
            <span
              className={`live-state ${videoState === "live" && !testFeedActive ? "live-on" : "live-off"}`}
            >
              <span className="live-dot" />
              {testFeedActive
                ? "DÉMO VISUELLE"
                : cameraActive
                  ? "CAMÉRA LOCALE"
                  : videoState === "live"
                    ? "SOURCE ACTIVE"
                    : videoState.toUpperCase()}
            </span>
          </div>
          <div className="mission-observation-meta">
            <span className={`mission-observation-signal ${videoState}`}>
              <span />
              {videoState === "live" && !testFeedActive
                ? cameraActive
                  ? "IMAGE · CAMÉRA LOCALE"
                  : "IMAGE · FLUX CONNECTÉ"
                : testFeedActive
                  ? "DÉMO · SCÈNE SYNTHÉTIQUE"
                  : videoState === "connecting"
                    ? "ÉTABLISSEMENT DU FLUX"
                    : videoState === "error"
                      ? "SIGNAL INDISPONIBLE"
                      : "EN ATTENTE D’UNE SOURCE VIDÉO"}
            </span>
            <span>{videoSize ? `IMAGE ${videoSize}` : "RÉSOLUTION —"}</span>
            <span>
              {testFeedActive
                ? "TÉLÉMÉTRIE SYNTHÉTIQUE LOCALE"
                : telemetryState === "connected" && telemetryFrameFresh
                  ? `TÉLÉMÉTRIE ${telemetrySource === "mavlink" ? "MAVLINK" : telemetrySource === "wss" ? "WSS" : "SYNTHÉTIQUE"} · ${telemetryAgeSeconds}s`
                  : telemetryState === "connected" || telemetry
                    ? `TÉLÉMÉTRIE PÉRIMÉE · ${telemetryAgeSeconds ?? "—"}s`
                  : telemetrySource === "synthetic"
                    ? "TÉLÉMÉTRIE SYNTHÉTIQUE ACTIVE"
                    : "TÉLÉMÉTRIE NON CONNECTÉE"}
            </span>
          </div>
          <div className="mission-observation-statusbar" aria-label="État synchronisé des sources d’observation">
            <div className={`observation-source-card ${videoState === "live" ? "is-good" : videoState === "error" ? "is-alert" : ""}`}>
              <Video size={15} /><span>IMAGE<strong>{videoState === "live" ? (testFeedActive ? "FLUX DE TEST" : cameraActive ? "CAMÉRA LOCALE" : "FLUX RÉSEAU") : videoState === "connecting" ? "CONNEXION…" : videoState === "error" ? "ERREUR SOURCE" : "AUCUNE SOURCE"}</strong></span><i />
            </div>
            <div className={`observation-source-card ${telemetryFrameFresh ? "is-good" : telemetry ? "is-alert" : ""}`}>
              <Radio size={15} /><span>TÉLÉMÉTRIE<strong>{telemetryFrameFresh ? `${telemetrySource === "mavlink" ? "MAVLINK" : telemetrySource === "wss" ? "WSS" : "TEST LOCAL"} · ${telemetryAgeSeconds}s` : telemetry ? `PÉRIMÉE · ${telemetryAgeSeconds}s` : telemetryState === "connecting" ? "CONNEXION…" : "EN ATTENTE"}</strong></span><i />
            </div>
            <div className="observation-source-card">
              <Route size={15} /><span>MISSION<strong>{observationSimulationActive ? describeLivePhase(liveFlight).toUpperCase() : "À L’ARRÊT"}</strong></span><i />
            </div>
            <div className="observation-source-card">
              <Target size={15} /><span>POINT ACTIF<strong>{waypoints.length ? `${waypoints[activeWaypoint]?.name ?? `WP ${activeWaypoint + 1}`} · ${Math.min(activeWaypoint + 1, waypoints.length)}/${waypoints.length}` : "AUCUN PLAN CHARGÉ"}</strong></span><i />
            </div>
          </div>
          <div
            className="mission-operation-visual-toolbar"
            aria-label="Visuels d’opération disponibles"
          >
            <div className="mission-operation-visual-heading">
              <span>
                <ScanLine size={14} /> VISUELS OPÉRATIONNELS
              </span>
              <small>PROFIL ACTIF · {activeObservationOperation.short}</small>
            </div>
            <div
              className="mission-operation-visual-list"
              role="tablist"
              aria-label="Type d’opération observée"
            >
              {observationOperations.map(operation => (
                <button
                  key={operation.id}
                  type="button"
                  role="tab"
                  aria-selected={observationOperation === operation.id}
                  className={`operation-visual-tab tone-${operation.accent} ${observationOperation === operation.id ? "is-active" : ""}`}
                  onClick={() => {
                    setObservationOperation(operation.id);
                    recordOperation(
                      `Profil visuel activé · ${operation.label}`
                    );
                  }}
                >
                  <span>{operation.short}</span>
                  <strong>{operation.label}</strong>
                  <small>{operation.description}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="mission-video-frame">
            <video
              ref={videoRef}
              controls
              autoPlay
              playsInline
              muted
              onLoadedMetadata={event => {
                const { videoWidth, videoHeight } = event.currentTarget;
                setVideoSize(
                  videoWidth && videoHeight
                    ? `${videoWidth} × ${videoHeight}`
                    : ""
                );
              }}
              aria-label="Écran d’observation affichant uniquement la source vidéo connectée"
            />
            <VisionShaderOverlay
              mode={visionMode}
              armed={simulationArmed}
              gainPct={visionGainPct}
              levelPct={48}
            />
            {videoState !== "live" && (
              <div className="mission-video-placeholder">
                <Video size={32} />
                <strong>
                  {videoState === "connecting"
                    ? "Connexion au flux…"
                    : videoState === "error"
                      ? "Source vidéo indisponible"
                      : "Aucune source d’observation connectée"}
                  <small>
                    Aucun visuel de démonstration n’est préchargé. Connectez
                    une source vidéo ou lancez explicitement le flux de test local.
                  </small>
                </strong>
              </div>
            )}
            {showObservationReticle && videoState === "live" && (
              <div className="mission-video-reticle" aria-hidden="true" />
            )}
            {showTelemetryOverlay && (hudUsesExternalFeed || hudUsesSimulation) && (
                <div
                  className="mission-observation-hud"
                  aria-label="Télémétrie de simulation continue"
                >
                  <div>
                    <span>ALT</span>
                    <strong>
                      {displayValue(hudValues.altitudeM)} m
                    </strong>
                  </div>
                  <div>
                    <span>VIT</span>
                    <strong>
                      {displayValue(hudValues.speedKmh)} km/h
                    </strong>
                  </div>
                  <div>
                    <span>CAP</span>
                    <strong>
                      {displayValue(hudValues.headingDeg, 0)}°
                    </strong>
                  </div>
                  <div>
                    <span>BATT</span>
                    <strong>
                      {displayValue(hudValues.batteryPct, 0)}%
                    </strong>
                  </div>
                  <div>
                    <span>ASSIETTE</span>
                    <strong>
                      {displayValue(hudValues.pitchDeg)}° / {displayValue(hudValues.rollDeg)}°
                    </strong>
                  </div>
                  <div>
                    <span>PUI</span>
                    <strong>{hudUsesSimulation ? `${liveFlight.powerW} W` : "—"}</strong>
                  </div>
                  <small>
                    {hudTelemetry
                      ? `TRAME ${telemetrySource === "mavlink" ? "MAVLINK · LECTURE SEULE" : telemetrySource === "wss" ? "WSS · NON VÉRIFIÉE" : "TEST · SYNTHÉTIQUE"} · ${new Date(hudTelemetry.receivedAt).toLocaleTimeString("fr-FR")}`
                      : `SIMULATION LOCALE · ${liveFlight.samples.length} TRAMES · HORLOGE ${Math.floor(liveFlight.elapsedS / 60)}:${String(Math.floor(liveFlight.elapsedS % 60)).padStart(2, "0")}`}
                  </small>
                </div>
            )}
            <span
              className={`mission-video-tag ${videoState === "live" && !testFeedActive ? "is-live" : ""} ${testFeedActive ? "is-demo" : ""}`}
            >
              <span />
              {testFeedActive
                ? "DÉMO"
                : cameraActive
                  ? "LOCAL"
                  : videoState === "live"
                    ? "ACTIF"
                    : "OFFLINE"}
            </span>
            {(testFeedActive || videoState === "live") && <div
              className={`mission-operation-overlay operation-${observationOperation}`}
              aria-label={`Visuel opérationnel ${activeObservationOperation.label}`}
            >
              <div className="operation-overlay-header">
                <span>
                  <i /> {activeObservationOperation.label.toUpperCase()}
                </span>
                <small>
                  MODE{" "}
                  {testFeedActive
                    ? "SIMULATION"
                    : videoState === "live"
                      ? "LIVE"
                      : "APERÇU"}
                </small>
              </div>
              <div className="operation-overlay-grid" />
              {testFeedActive ? <>
              <div className="operation-target operation-target-a"><span>TEST-01</span></div>
              <div className="operation-target operation-target-b"><span>{observationOperation === "mapping" ? "TEST-02" : "TEST-PT"}</span></div>
              <div className="operation-vector"><b>{displayValue(observationMetrics.heading, 0)}°</b><small>CAP SYNTHÉTIQUE</small></div>
              {observationOperation === "mapping" && (
                <div className="operation-swatch mapping-swatch">
                  <span /> LIGNES DE RECouvrement <b>72%</b>
                </div>
              )}
              {observationOperation === "search-rescue" && (
                <div className="operation-swatch search-swatch">
                  <span /> SECTEUR PRIORITAIRE <b>R2</b>
                </div>
              )}
              {observationOperation === "inspection" && (
                <div className="operation-swatch inspection-swatch">
                  <span /> POINT D’INTÉRÊT <b>Δ 0.8</b>
                </div>
              )}
              {observationOperation === "relay" && (
                <div className="operation-swatch relay-swatch">
                  <span /> COUVERTURE RF <b>98%</b>
                </div>
              )}
              {observationOperation === "environmental" && (
                <div className="operation-swatch environmental-swatch">
                  <span /> CAPTEURS AIR/SOL <b>NOMINAL</b>
                </div>
              )}
              </> : <div className="observation-analysis-unavailable"><ScanLine size={13} /> ANALYSE D’IMAGE NON CONNECTÉE · AUCUN MARQUAGE DE CIBLE</div>}
            </div>
            }
          </div>
          <div className="mission-video-source">
            <label className="mission-input-label">
              Source vidéo indépendante du scénario (HLS / MP4 / WebM)
              <input
                value={streamUrl}
                onChange={event => setStreamUrl(event.target.value)}
                placeholder="https://passerelle-votre-drone/mission/live.m3u8"
                aria-label="URL du flux vidéo"
              />
            </label>
            <div className="mission-source-actions">
              <button className="primary-button" onClick={connectVideoStream}>
                <Radio size={14} /> Connecter le flux
              </button>
              <button className="secondary-button" onClick={startTestFeed}>
                <Activity size={14} />{" "}
                {testFeedActive
                  ? "Relancer le flux de test"
                  : "Flux de test local"}
              </button>
              <button
                className="secondary-button"
                onClick={() => void startLocalCamera()}
              >
                <Video size={14} /> Caméra locale
              </button>
              <button className="secondary-button" onClick={disconnectVideo}>
                Déconnecter
              </button>
            </div>
            <small className="mission-observation-note">
              Hors flux connecté, l’image d’arrière-plan est une illustration
              simulée. Le flux de test est synthétique ; seule une URL autorisée
              ou la caméra locale fournit une image réelle. Aucune commande
              n’est transmise à un aéronef.
            </small>
            {videoError && (
              <p className="mission-inline-error" role="alert">
                {videoError}
              </p>
            )}
          </div>
          <section
            className="mission-observation-analytics"
            aria-label="Console d’instrumentation avancée"
          >
            <div className="mission-analytics-header">
              <div>
                <p className="eyebrow">AEROMIND / OBSERVATION CORE</p>
                <strong>Instrument cluster · analyse de flux</strong>
                <small>
                  Lecture seule · trames WSS non vérifiées; estimations de
                  scénario signalées comme simulées, jamais comme mesures physiques.
                </small>
              </div>
              <div
                className="mission-analytics-modes"
                role="tablist"
                aria-label="Couche d’observation"
              >
                {(
                  [
                    ["tactical", "TACTIQUE"],
                    ["systems", "SYSTÈMES"],
                    ["spectrum", "SPECTRE"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={observationLayer === id}
                    className={observationLayer === id ? "is-active" : ""}
                    onClick={() => setObservationLayer(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mission-analytics-grid">
              <div className="mission-analytics-radar">
                <div className="mission-radar-heading">
                  <span>
                    <Crosshair size={13} />{" "}
                    {observationLayer === "tactical"
                      ? "SITUATION TACTIQUE"
                      : observationLayer === "systems"
                        ? "ÉTAT SYSTÈMES"
                        : "SPECTRE DE LIAISON"}
                  </span>
                  <small>
                    {observationLayer === "tactical"
                      ? freshTelemetry?.latitude !== undefined && freshTelemetry?.longitude !== undefined
                        ? "GRILLE LOCALE · GPS WSS REÇU"
                        : "GRILLE LOCALE · NO GPS"
                      : observationLayer === "systems"
                        ? "ÉTAT DES SOURCES REÇUES"
                        : "AUCUNE DONNÉE SPECTRALE"}
                  </small>
                </div>
                {observationLayer === "tactical" ? (
                  <svg
                    viewBox="0 0 100 100"
                    role="img"
                    aria-label="Carte tactique locale de la mission simulée"
                  >
                    <circle cx="50" cy="50" r="39" />
                    <circle cx="50" cy="50" r="25" />
                    <circle cx="50" cy="50" r="12" />
                    <path d="M50 6V94M6 50H94" />
                    <polyline points={routePoints} />
                    <circle
                      cx={virtualAircraftPosition.x}
                      cy={virtualAircraftPosition.y}
                      r="2.8"
                      className="mission-radar-aircraft"
                    />
                    <circle
                      cx={missionPlan.homeX}
                      cy={missionPlan.homeY}
                      r="2"
                      className="mission-radar-home"
                    />
                    <text x="53" y="12">
                      N
                    </text>
                    <text x="7" y="47">
                      W
                    </text>
                    <text x="88" y="47">
                      E
                    </text>
                  </svg>
                ) : observationLayer === "systems" ? (
                  <div className="mission-observation-layer-view" aria-live="polite">
                    <div><span>PASSERELLE</span><strong>{telemetryState === "connected" ? "WSS CONNECTÉ · LECTURE SEULE" : "AUCUNE LIAISON"}</strong></div>
                    <div><span>MODE DE VOL</span><strong>{freshTelemetry?.flightMode ?? "NON TRANSMIS"}</strong></div>
                    <div><span>POSITION GPS</span><strong>{freshTelemetry?.latitude !== undefined && freshTelemetry?.longitude !== undefined ? `${freshTelemetry.latitude.toFixed(5)}, ${freshTelemetry.longitude.toFixed(5)}` : "NON TRANSMISE"}</strong></div>
                    <div><span>DERNIÈRE TRAME</span><strong>{freshTelemetry ? new Date(freshTelemetry.receivedAt).toLocaleTimeString("fr-FR") : telemetry ? "TRAME PÉRIMÉE" : "AUCUNE TRAME REÇUE"}</strong></div>
                    <p>La connexion seule ne prouve ni l’identité du capteur ni la validité physique des mesures.</p>
                  </div>
                ) : (
                  <div className="mission-observation-layer-view is-empty" role="status">
                    <strong>Spectre indisponible</strong>
                    <p>La passerelle actuelle ne transmet aucun canal spectral. Aucun graphique de spectre n’est simulé ou présenté comme mesuré.</p>
                  </div>
                )}
                <div className="mission-radar-footer">
                  <span>
                    <i className="is-cyan" /> SCÉNARIO LOCAL{" "}
                    {demoState === "running" ? "EN COURS" : "À L’ARRÊT"}
                  </span>
                  <span>
                    <i className="is-amber" /> HOME / {waypoints.length} WP
                  </span>
                </div>
              </div>
              <div className="mission-analytics-horizon">
                <div className="mission-analytics-horizon-heading">
                  <span>
                    <Crosshair size={13} /> HORIZON ARTIFICIEL · MODÈLE LOCAL
                  </span>
                  <small>{describeLivePhase(liveFlight)}</small>
                </div>
                <ArtificialHorizon
                  pitchDeg={liveFlight.pitchDeg}
                  rollDeg={liveFlight.rollDeg}
                  headingDeg={liveFlight.headingDeg}
                  altitudeM={liveFlight.altitudeM}
                  speedKmh={liveFlight.speedKmh}
                  verticalSpeedMs={liveFlight.verticalSpeedMs}
                  armed={simulationArmed}
                  compact
                />
              </div>
              <div className="mission-analytics-instruments">
                <div className="mission-instrument-card is-primary">
                  <span>ALTITUDE</span>
                  <strong>
                    {displayValue(observationMetrics.altitude, 0)}
                    {observationMetrics.altitude !== undefined && <small> m</small>}
                  </strong>
                  <em>{observationMetricSource(observationMetrics.altitude)}</em>
                  <div className="instrument-bar">
                    <i
                      style={{
                        width: `${Math.min(100, Math.max(0, (observationMetrics.altitude ?? 0) / 1.5))}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="mission-instrument-card">
                  <span>VITESSE</span>
                  <strong>
                    {displayValue(observationMetrics.speed, 0)}
                    {observationMetrics.speed !== undefined && <small> km/h</small>}
                  </strong>
                  <em>
                    {observationMetrics.heading === undefined
                      ? observationMetricSource(observationMetrics.speed)
                      : `CAP ${displayValue(observationMetrics.heading, 0)}° · ${observationMetricSource(observationMetrics.speed)}`}
                  </em>
                  <div className="instrument-bar">
                    <i
                      style={{
                        width: `${Math.min(100, Math.max(0, observationMetrics.speed ?? 0))}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="mission-instrument-card">
                  <span>BATTERIE</span>
                  <strong>
                    {displayValue(observationMetrics.battery, 0)}
                    {observationMetrics.battery !== undefined && <small> %</small>}
                  </strong>
                  <em>
                    {observationMetrics.battery === undefined
                      ? observationMetricSource(observationMetrics.battery)
                      : `${observationMetricSource(observationMetrics.battery)} · ${simulation.enduranceH.toFixed(1)} h estimées`}
                  </em>
                  <div className="instrument-bar is-green">
                    <i style={{ width: `${observationMetrics.battery ?? 0}%` }} />
                  </div>
                </div>
                <div className="mission-instrument-card">
                  <span>QUALITÉ / LATENCE</span>
                  <strong>
                    {displayValue(observationMetrics.linkQualityPct, 0)}
                    {observationMetrics.linkQualityPct !== undefined && <small> %</small>}
                  </strong>
                  <em>
                    {observationMetrics.latencyMs !== undefined
                      ? `Latence reçue: ${observationMetrics.latencyMs.toFixed(0)} ms`
                      : telemetryState === "connected"
                        ? "Latence non transmise par la passerelle"
                        : "Aucune liaison mesurée"}
                  </em>
                  <div className="instrument-bar is-blue">
                    <i style={{ width: `${observationMetrics.linkQualityPct ?? 0}%` }} />
                  </div>
                </div>
                <div className="mission-instrument-mini">
                  <span>
                    <Gauge size={13} /> VIBRATION
                  </span>
                  <strong>
                    {displayValue(observationMetrics.vibrationG, 2)}
                    {observationMetrics.vibrationG !== undefined ? " g" : ""}
                  </strong>
                  <b className={observationMetrics.vibrationG === undefined ? "status-unknown" : "status-review"}>
                    {observationMetrics.vibrationG === undefined
                      ? "NON FOURNIE"
                      : telemetrySource === "mavlink"
                        ? "MAVLINK · LECTURE SEULE"
                        : telemetrySource === "wss"
                        ? "WSS NON VÉRIFIÉ"
                        : "MODÈLE SIMULÉ"}
                  </b>
                </div>
                <div className="mission-instrument-mini">
                  <span>
                    <Wind size={13} /> VENT MODÈLE
                  </span>
                  <strong>{config.windSpeedKmh.toFixed(0)} km/h</strong>
                  <b
                    className={
                      "status-review"
                    }
                  >
                    {config.windSpeedKmh > 25 ? "REVUE" : "SCÉNARIO"}
                  </b>
                </div>
                <div className="mission-instrument-mini">
                  <span>
                    <Zap size={13} /> TEMP. AVIONIQUE
                  </span>
                  <strong>
                    {displayValue(observationMetrics.temperatureC, 1)}
                    {observationMetrics.temperatureC !== undefined ? " °C" : ""}
                  </strong>
                  <b className={observationMetrics.temperatureC === undefined ? "status-unknown" : "status-review"}>
                    {observationMetrics.temperatureC === undefined
                      ? "NON FOURNIE"
                      : telemetrySource === "mavlink"
                        ? "MAVLINK · LECTURE SEULE"
                        : telemetrySource === "wss"
                        ? "WSS NON VÉRIFIÉ"
                        : "MODÈLE SIMULÉ"}
                  </b>
                </div>
                <div className="mission-instrument-mini">
                  <span>
                    <ShieldCheck size={13} /> GEOFENCE
                  </span>
                  <strong>LOCAL</strong>
                  <b className="status-ok">SIMULÉE</b>
                </div>
              </div>
            </div>
          </section>
          <div className="mission-quick-command-panel">
            <div className="mission-quick-command-heading">
              <div>
                <p className="eyebrow">RACCOURCIS LOCAUX · NON TRANSMIS</p>
                <strong>Commandes de simulation</strong>
              </div>
              <span className="mission-command-state">
                <strong>
                  {demoState === "ready"
                    ? "PRÊT"
                    : demoState === "running"
                      ? "EN MISSION"
                      : demoState === "paused"
                        ? "PAUSÉ"
                        : demoState === "hold"
                          ? "MAINTIEN"
                          : demoState === "returning"
                            ? "RETOUR"
                            : demoState === "emergency-land"
                              ? "ATTERRISSAGE D’URGENCE"
                              : "CLOS"}
                </strong>
                <small aria-live="polite">
                  MINUTEUR{" "}
                  {String(Math.floor(missionElapsedSeconds / 60)).padStart(
                    2,
                    "0"
                  )}
                  :{String(missionElapsedSeconds % 60).padStart(2, "0")}
                </small>
              </span>
            </div>
            <fieldset className="mission-activation-protocol">
              <legend>Protocole humain d’activation · simulation locale</legend>
              {SIMULATION_ACTIVATION_PROTOCOL.map((item, index) => (
                <label className="mission-protocol-check" key={item.id}>
                  <input
                    type="checkbox"
                    checked={simulationProtocolChecks[index] ?? false}
                    onChange={event => {
                      const next = simulationProtocolChecks.map((checked, checkIndex) =>
                        checkIndex === index ? event.target.checked : checked
                      );
                      setSimulationProtocolChecks(next);
                      if (!areAllProtocolChecksAcknowledged(next)) setOperatorApproved(false);
                    }}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </fieldset>
            <label className="mission-command-approval">
              <input
                type="checkbox"
                checked={operatorApproved}
                disabled={!simulationProtocolReady}
                onChange={event => setOperatorApproved(simulationProtocolReady && event.target.checked)}
              />
              <span>
                <strong>J’autorise cette simulation locale</strong>
                <small>
                  Cette confirmation distincte n’est activée qu’après la checklist. Toute modification du scénario invalide les validations.
                </small>
              </span>
            </label>
            <div className="mission-quick-command-grid">
              <button
                className="secondary-button"
                onClick={activateLocalControl}
                disabled={demoState === "running" || demoState === "returning"}
              >
                <Activity size={14} /> Charger un parcours d’exemple
              </button>
              <button
                className="primary-button"
                onClick={() => runLocalOperation("start")}
                disabled={
                  !simulationProtocolReady ||
                  !operatorApproved ||
                  blockingPreflight ||
                  demoState === "running" ||
                  demoState === "returning"
                }
              >
                <Play size={14} /> Lancer la démo
              </button>
              <button
                className="secondary-button"
                onClick={() =>
                  runLocalOperation(
                    demoState === "running" ? "pause" : "resume"
                  )
                }
                disabled={
                  demoState !== "running" &&
                  demoState !== "paused" &&
                  demoState !== "hold"
                }
              >
                {demoState === "running" ? (
                  <Pause size={14} />
                ) : (
                  <Play size={14} />
                )}
                {demoState === "running" ? "Pause" : "Reprendre"}
              </button>
              <button
                className="secondary-button"
                onClick={() => runLocalOperation("return")}
                disabled={
                  demoState === "ready" ||
                  demoState === "stopped" ||
                  demoState === "returning"
                }
              >
                <Navigation size={14} /> Retour domicile
              </button>
              <button
                className="secondary-button"
                onClick={() => runLocalOperation("land")}
                disabled={
                  demoState === "ready" ||
                  demoState === "stopped" ||
                  demoState === "returning"
                }
              >
                <AlertTriangle size={14} /> Atterrissage simulé
              </button>
              <button
                className="secondary-button"
                onClick={() => runLocalOperation("stop")}
                disabled={demoState === "ready" || demoState === "stopped"}
              >
                <X size={14} /> Clore la démo
              </button>
            </div>
            <small className="mission-quick-command-note">
              Précontrôle AeroMind = vérification bloquante, pas autorisation de vol. Démarrage simulé soumis à un accord humain distinct; aucune liaison de commande n’existe.
            </small>
          </div>
        </section>
        <section className="panel telemetry-bridge-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">PASSERELLES WSS / MAVLINK · LECTURE SEULE</p>
              <h3>Télémétrie de mission</h3>
            </div>
            <Radio size={16} className="muted-icon" />
          </div>
          <label className="mission-input-label">
            WebSocket sécurisé de télémétrie
            <input
              value={telemetryUrl}
              onChange={event => {
                setTelemetryUrl(event.target.value);
                setTelemetryConsent(false);
                setTelemetryProtocolChecks(TELEMETRY_ACTIVATION_PROTOCOL.map(() => false));
                if (telemetryState !== "offline") disconnectTelemetry();
              }}
              placeholder="wss://votre-passerelle/telemetry"
              aria-label="URL de télémétrie WSS"
            />
          </label>
          <fieldset className="mission-activation-protocol telemetry-activation-protocol">
            <legend>Protocole humain d’activation · télémétrie entrante</legend>
            {TELEMETRY_ACTIVATION_PROTOCOL.map((item, index) => (
              <label className="mission-protocol-check" key={item.id}>
                <input
                  type="checkbox"
                  checked={telemetryProtocolChecks[index] ?? false}
                  onChange={event => {
                    const next = telemetryProtocolChecks.map((checked, checkIndex) =>
                      checkIndex === index ? event.target.checked : checked
                    );
                    setTelemetryProtocolChecks(next);
                    if (!areAllProtocolChecksAcknowledged(next)) {
                      setTelemetryConsent(false);
                      if (telemetryState !== "offline") disconnectTelemetry();
                    }
                  }}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </fieldset>
          <label className="mission-command-approval telemetry-human-consent">
            <input
              type="checkbox"
              checked={telemetryConsent}
              disabled={!telemetryProtocolReady}
              onChange={event => setTelemetryConsent(telemetryProtocolReady && event.target.checked)}
            />
            <span>
              <strong>J’autorise cette réception entrante en lecture seule</strong>
              <small>Confirmation séparée; toute modification de l’URL ou de la checklist révoque l’accord et ferme la liaison. MAVLink : {mavlinkObserverStatus}.</small>
            </span>
          </label>
          <div className="mission-source-actions">
            <button
              className="secondary-button"
              onClick={connectMavlinkObserver}
              disabled={!telemetryProtocolReady || !telemetryConsent || telemetryState === "connecting"}
              title="Démarrer le polling de l’endpoint AeroMind MAVLink strictement en lecture seule"
            >
              <Radio size={14} /> Observer MAVLink
            </button>
            <button
              className="secondary-button"
              onClick={connectTelemetry}
              disabled={!telemetryProtocolReady || !telemetryConsent || telemetryState === "connecting"}
              title={!telemetryProtocolReady || !telemetryConsent ? "Checklist et autorisation humaine requises avant la réception WSS" : "Connecter en lecture seule"}
            >
              <Radio size={14} />{" "}
              {telemetryState === "connecting"
                ? "Connexion…"
                : "Connecter télémétrie"}
            </button>
            <button
              className="secondary-button"
              onClick={disconnectTelemetry}
              disabled={telemetryState === "offline"}
            >
              Déconnecter
            </button>
          </div>
          {telemetryError && (
            <p className="mission-inline-error" role="alert">
              {telemetryError}
            </p>
          )}
          <div className="mission-telemetry-grid">
            <div>
              <span>Altitude</span>
              <strong>
                {displayValue(telemetry?.altitudeM)}
                {telemetry?.altitudeM === undefined ? "" : " m"}
              </strong>
            </div>
            <div>
              <span>Vitesse</span>
              <strong>
                {displayValue(telemetry?.speedKmh)}
                {telemetry?.speedKmh === undefined ? "" : " km/h"}
              </strong>
            </div>
            <div>
              <span>Batterie</span>
              <strong>
                {displayValue(telemetry?.batteryPct, 0)}
                {telemetry?.batteryPct === undefined ? "" : "%"}
              </strong>
            </div>
            <div>
              <span>Cap</span>
              <strong>
                {displayValue(telemetry?.headingDeg, 0)}
                {telemetry?.headingDeg === undefined ? "" : "°"}
              </strong>
            </div>
            <div className="mission-gps-cell">
              <span>Position reçue</span>
              <strong>
                {telemetry?.latitude === undefined ||
                telemetry.longitude === undefined
                  ? "—"
                  : `${telemetry.latitude.toFixed(6)}, ${telemetry.longitude.toFixed(6)}`}
              </strong>
            </div>
            <div>
              <span>Mode reçu</span>
              <strong>{telemetry?.flightMode ?? "—"}</strong>
            </div>
          </div>
          <small className="mission-protocol-note">
            Format attendu : JSON périodique avec <code>latitude/lat</code>,{" "}
            <code>longitude/lon</code>, <code>altitudeM</code>,{" "}
            <code>speedKmh</code>, <code>batteryPct</code>,{" "}
            <code>headingDeg</code>, <code>flightMode</code>. Dernière trame :{" "}
            {telemetry
              ? new Date(telemetry.receivedAt).toLocaleTimeString("fr-FR")
              : "aucune"}
            .
          </small>
        </section>
      </div>
      <section
        className="panel live-telemetry-panel"
        aria-label="Télémétrie de simulation défilante"
      >
        <div className="panel-header">
          <div>
            <p className="eyebrow">FLUX CONTINU · GRAPHIQUES DÉFILANTS</p>
            <h3>Télémétrie de simulation en défilement</h3>
            <p className="section-description">
              Le flux est alimenté en permanence par le modèle de simulation
              local : les courbes se décalent à chaque trame sans action
              opérateur. Aucune valeur n’est présentée comme une mesure
              embarquée et aucune écriture de télémétrie n’est possible.
            </p>
          </div>
          <span className={`calculated-badge ${simulationArmed ? "is-armed" : ""}`}>
            <Activity size={13} /> {describeLivePhase(liveFlight)}
          </span>
        </div>
        <div className="live-telemetry-strips">
          <TelemetryStripChart
            label="ALTITUDE"
            unit="m"
            values={liveAltitudeSeries}
            tone="cyan"
            decimals={0}
          />
          <TelemetryStripChart
            label="VITESSE"
            unit="km/h"
            values={liveSpeedSeries}
            tone="green"
            decimals={1}
          />
          <TelemetryStripChart
            label="BATTERIE"
            unit="%"
            values={liveBatterySeries}
            tone="amber"
            decimals={2}
          />
          <TelemetryStripChart
            label="PUISSANCE"
            unit="W"
            values={livePowerSeries}
            tone="violet"
            decimals={0}
          />
          {simulationArmed && (
            <>
              <TelemetryStripChart
                label="QUALITÉ DE LIAISON"
                unit="%"
                values={liveLinkSeries}
                tone="coral"
                decimals={0}
              />
              <TelemetryStripChart
                label="VIBRATION"
                unit="g"
                values={liveVibrationSeries}
                tone="cyan"
                decimals={3}
              />
            </>
          )}
        </div>
        <div className="live-telemetry-rail">
          <div>
            <span>ASSIETTE COURANTE</span>
            <strong>
              {liveFlight.pitchDeg.toFixed(1)}° / {liveFlight.rollDeg.toFixed(1)}°
            </strong>
          </div>
          <div>
            <span>CAP SIMULÉ</span>
            <strong>{liveFlight.headingDeg.toFixed(0)}°</strong>
          </div>
          <div>
            <span>CIBLE DE CROISIÈRE</span>
            <strong>
              {cruiseSpeedTarget(liveParams).toFixed(0)} km/h ·{" "}
              {cruiseAltitudeTarget(liveParams).toFixed(0)} m
            </strong>
            {usesSimulationDefaults(liveParams) && (
              <small className="live-telemetry-note">
                Valeurs par défaut du simulateur : renseignez vitesse, plafond et
                capacité pour des cibles issues de votre configuration.
              </small>
            )}
          </div>
          <div>
            <span>TRAMES EN TAMPON</span>
            <strong>{liveFlight.samples.length}</strong>
          </div>
          {!hasEnergyBudget(liveParams) && (
            <div className="live-telemetry-note-block">
              <span>BUDGET ÉNERGIE</span>
              <strong>NON RENSEIGNÉ · AUCUNE DÉCHARGE SIMULÉE</strong>
            </div>
          )}
          <div>
            <span>SORTIE MATÉRIELLE</span>
            <strong>BLOQUÉE PAR CONTRAT</strong>
          </div>
        </div>
      </section>
      <div className="mission-ops-grid">
        <section className="panel mission-command-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">COMMANDES D’OPÉRATION</p>
              <h3>Console de commande virtuelle</h3>
            </div>
            <span className="calculated-badge">
              LOCAL ·{" "}
              {demoState === "ready"
                ? "PRÊT"
                : demoState === "running"
                  ? "EN MISSION"
                  : demoState === "paused"
                    ? "PAUSÉ"
                    : demoState === "hold"
                      ? "MAINTIEN"
                      : demoState === "returning"
                        ? "RETOUR"
                        : demoState === "emergency-land"
                          ? "ATTERRISSAGE D’URGENCE"
                          : "CLOS"}
            </span>
          </div>
          <div
            className={`mission-arm-bar ${simulationArmed ? "is-armed" : "is-disarmed"}`}
            role="status"
            aria-live="polite"
          >
            <div className="mission-arm-state">
              <span className="arm-state-dot" />
              <strong>
                {simulationArmed
                  ? "ARMEMENT VIRTUEL ACTIF · SCÉNARIO LOCAL"
                  : "VÉHICULE DÉSARMÉ · BANC AU SOL SIMULÉ"}
              </strong>
              <small>
                {describeLivePhase(liveFlight)} · altitude{" "}
                {liveFlight.altitudeM.toFixed(0)} m · {liveFlight.speedKmh.toFixed(0)} km/h ·
                énergie {liveFlight.batteryPct.toFixed(0)} % · {liveFlight.powerW} W
              </small>
            </div>
            <div className="mission-arm-actions">
              <button
                type="button"
                className={`arm-button ${simulationArmed ? "is-active" : ""}`}
                onClick={() => setSimulationArmState(true)}
                disabled={simulationArmed}
                title="Arme le scénario de simulation local : état d’interface et couches de vision uniquement. Aucun actionneur, aucune sortie matérielle."
              >
                <Zap size={14} /> ARMER (SIM)
              </button>
              <button
                type="button"
                className="disarm-button"
                onClick={() => setSimulationArmState(false)}
                disabled={!simulationArmed}
                title="Désarme le scénario local et remet l’interface au banc au sol simulé."
              >
                <ShieldCheck size={14} /> DISARM
              </button>
            </div>
          </div>
          <div className="mission-command-grid">
            <button
              className="primary-button"
              onClick={() => runLocalOperation("start")}
              disabled={
                !operatorApproved ||
                blockingPreflight ||
                demoState === "running" ||
                demoState === "returning"
              }
            >
              <Play size={14} /> Lancer la démo
            </button>
            <button
              className="secondary-button"
              onClick={() =>
                runLocalOperation(demoState === "running" ? "pause" : "resume")
              }
              disabled={
                demoState !== "running" &&
                demoState !== "paused" &&
                demoState !== "hold"
              }
            >
              {demoState === "running" ? (
                <Pause size={14} />
              ) : (
                <Play size={14} />
              )}
              {demoState === "running" ? "Pause" : "Reprendre"}
            </button>
            <button
              className="secondary-button"
              onClick={() => runLocalOperation("waypoint")}
              disabled={
                demoState === "ready" ||
                demoState === "stopped" ||
                demoState === "returning"
              }
            >
              <ArrowRight size={14} /> Point suivant
            </button>
            <button
              className="secondary-button"
              onClick={() => runLocalOperation("hold")}
              disabled={demoState !== "running"}
            >
              <CircleDot size={14} /> Maintien simulé
            </button>
            <button
              className="secondary-button"
              onClick={() => runLocalOperation("return")}
              disabled={
                !waypoints.length ||
                demoState === "ready" ||
                demoState === "stopped" ||
                demoState === "returning"
              }
            >
              <Navigation size={14} /> Retour domicile simulé
            </button>
            <button
              className="secondary-button"
              onClick={() => runLocalOperation("land")}
              disabled={
                !waypoints.length ||
                demoState === "ready" ||
                demoState === "stopped" ||
                demoState === "returning"
              }
            >
              <AlertTriangle size={14} /> Atterrissage simulé
            </button>
            <button
              className="secondary-button"
              onClick={() => runLocalOperation("stop")}
              disabled={demoState === "ready" || demoState === "stopped"}
            >
              <X size={14} /> Clore la démo
            </button>
          </div>
          <div className="mission-command-warning">
            <AlertTriangle size={15} />
            <span>
              Ces commandes modifient uniquement le scénario local. Aucun
              armement, téléversement de mission ni ordre à un drone n’est
              implémenté. N’utilisez pas ces boutons comme commandes de vol
              réelles.
            </span>
          </div>
          <div className="mission-log-list" aria-live="polite">
            {operationLog.map((line, index) => (
              <div key={`${line}-${index}`}>
                <span className="event-pulse" />
                {line}
              </div>
            ))}
          </div>
        </section>
        <section className="panel mission-route-command-panel" aria-labelledby="mission-route-command-title">
          <div className="panel-header">
            <div>
              <p className="eyebrow">ITINÉRAIRE UTILISATEUR · CONTRÔLE DE MISSION</p>
              <h3 id="mission-route-command-title">Dessiner mon itinéraire</h3>
            </div>
            <span className="calculated-badge">{missionPlan.waypoints.length} / 64 points</span>
          </div>
          <p className="mission-route-command-description">Dessinez votre parcours directement sur la carte tactique. Cette fonction reste disponible quel que soit le mode de navigation choisi.</p>
          <div className="mission-route-command-toolbar">
            <button type="button" className={routeDrawingEnabled ? "primary-button" : "secondary-button"} onClick={() => setRouteDrawingEnabled(current => !current)}>
              <Pencil size={14} /> {routeDrawingEnabled ? "Dessin actif · cliquez sur la carte" : "Commencer à dessiner"}
            </button>
            <button type="button" className="secondary-button" onClick={clearCommandRoute} disabled={!missionPlan.waypoints.length}>
              <Trash2 size={14} /> Effacer l’itinéraire
            </button>
            <span className="mission-route-command-status">{routeDrawingEnabled ? "Ajoutez les points dans l’ordre souhaité." : "Activez le dessin pour ajouter un waypoint."}</span>
          </div>
          <svg className={`mission-route-command-canvas ${routeDrawingEnabled ? "is-drawing" : ""}`} viewBox="0 0 100 100" role="application" aria-label="Carte tactique locale pour dessiner un itinéraire" onClick={addMissionWaypointFromCommandCanvas}>
            <defs><pattern id="missionCommandDrawingGrid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(115, 155, 160, 0.16)" strokeWidth="0.3" /></pattern></defs>
            <rect width="100" height="100" fill="url(#missionCommandDrawingGrid)" />
            <polyline points={[{ x: missionPlan.homeX, y: missionPlan.homeY }, ...missionPlan.waypoints].map(point => `${point.x},${point.y}`).join(" ")} className="mission-route-command-line" />
            <circle cx={missionPlan.homeX} cy={missionPlan.homeY} r="4" className="mission-route-command-home" />
            <text x={missionPlan.homeX + 4.5} y={missionPlan.homeY + 1} className="mission-route-command-label">HOME</text>
            {missionPlan.waypoints.map((point, index) => <g key={point.id}><circle cx={point.x} cy={point.y} r="3.2" className="mission-route-command-point" /><text x={point.x + 3.5} y={point.y - 2.5} className="mission-route-command-label">{String(index + 1).padStart(2, "0")}</text></g>)}
            <text x="3" y="96" className="mission-route-command-caption">{routeDrawingEnabled ? "CLIQUEZ POUR AJOUTER · COORDONNÉES LOCALES · SANS GPS" : "CANEVA TACTIQUE · ACTIVEZ LE DESSIN POUR AJOUTER DES POINTS"}</text>
          </svg>
        </section>
        <section className="panel mission-plan-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">PROJET ACTIF / PLAN LOCAL</p>
              <h3>{projectName}</h3>
            </div>
            <span className="calculated-badge">{simulation.runId}</span>
          </div>
          <div className="mission-command-map-shell">
            <div className="mission-command-map-heading">
              <span>CARTE TACTIQUE VIRTUELLE · COORDONNÉES LOCALES</span>
              <strong>
                {waypoints.length
                  ? `WP-${String(Math.min(activeWaypoint + 1, waypoints.length)).padStart(2, "0")} / ${String(waypoints.length).padStart(2, "0")}`
                  : "AUCUN PARCOURS"}
              </strong>
            </div>
            {waypoints.length ? (
              <svg
                className="mission-command-map"
                viewBox="0 0 100 100"
                role="img"
                aria-label={`Carte locale de mission, ${waypoints.length} points de passage, aucune coordonnée GPS`}
              >
                <defs>
                  <pattern
                    id="missionCommandGrid"
                    width="10"
                    height="10"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 10 0 L 0 0 0 10"
                      fill="none"
                      stroke="rgba(115, 155, 160, 0.16)"
                      strokeWidth="0.3"
                    />
                  </pattern>
                </defs>
                <rect
                  width="100"
                  height="100"
                  fill="url(#missionCommandGrid)"
                />
                <polyline
                  points={routePoints}
                  className="mission-command-route"
                />
                <circle
                  cx={missionPlan.homeX}
                  cy={missionPlan.homeY}
                  r="4.4"
                  className="mission-command-home"
                />
                <text
                  x={missionPlan.homeX + 5}
                  y={missionPlan.homeY + 1.4}
                  className="mission-map-label"
                >
                  HOME
                </text>
                {waypoints.slice(0, 8).map((point, index) => (
                  <g
                    key={point.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Sélectionner WP-${String(index + 1).padStart(2, "0")}, ${point.name}`}
                    onClick={() => setActiveWaypoint(index)}
                    onKeyDown={event => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActiveWaypoint(index);
                      }
                    }}
                  >
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={index === activeWaypoint ? 4 : 3}
                      className={`mission-command-waypoint ${index === activeWaypoint ? "is-current" : ""}`}
                    />
                    <text
                      x={point.x + 3.4}
                      y={point.y - 2.5}
                      className="mission-map-label"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </text>
                  </g>
                ))}
                <g
                  transform={`translate(${virtualAircraftPosition.x} ${virtualAircraftPosition.y})`}
                  className="mission-command-aircraft-marker"
                  aria-label="Position de démonstration locale"
                >
                  <circle r="5.4" />
                  <path d="M 0 -3 L 2.1 2.2 L 0 1.2 L -2.1 2.2 Z" />
                </g>
                <text x="3" y="96" className="mission-map-caption">
                  ROUTE DE CANEVAS · SANS GPS · SANS FOND CARTOGRAPHIQUE
                </text>
              </svg>
            ) : (
              <div className="mission-command-map-empty">
                <Info size={17} />
                <span>
                  Chargez explicitement un parcours de démonstration ou créez
                  vos points dans le constructeur.
                </span>
                <button
                  className="secondary-button"
                  onClick={activateLocalControl}
                >
                  <Play size={13} /> Charger le parcours local d’exemple
                </button>
              </div>
            )}
            <div className="mission-command-map-footer">
              <span>
                Distance estimée
                <strong>{missionDistanceKm.toFixed(2)} km</strong>
              </span>
              <span>
                Rayon déclaré
                <strong>{missionPlan.radiusKm.toFixed(1)} km</strong>
              </span>
              <span>
                Position GPS<strong>Non disponible</strong>
              </span>
            </div>
          </div>
          <div className="mission-plan-summary">
            <span>
              Architecture<strong>{config.airframe ?? "non définie"}</strong>
            </span>
            <span>
              Points de passage<strong>{waypoints.length}</strong>
            </span>
            <span>
              Rayon déclaré
              <strong>{missionPlan.radiusKm.toFixed(1)} km</strong>
            </span>
            <span>
              Endurance modèle
              <strong>{simulation.enduranceH.toFixed(2)} h</strong>
            </span>
          </div>
          <div
            className="mission-preflight-grid"
            aria-label="Contrôles de prévol virtuels"
          >
            {missionChecks.map((check, index) => {
              const status =
                check.severity === "block"
                  ? "fail"
                  : check.severity === "review"
                    ? "review"
                    : "pass";
              return (
                <article
                  key={`preflight-${index}`}
                  className={`mission-preflight-check is-${status}`}
                >
                  <span>
                    {status === "fail"
                      ? "BLOQUANT"
                      : status === "review"
                        ? "À REVOIR"
                        : "OK"}
                  </span>
                  <strong>
                    {[
                      "Points de passage",
                      "Plafond d’altitude",
                      "Vitesse des points",
                      "Rayon énergétique",
                      "Échelle de carte",
                    ][index] ?? `Contrôle ${index + 1}`}
                  </strong>
                  <small>{check.message}</small>
                </article>
              );
            })}
          </div>
          {waypoints.length ? (
            <div className="mission-waypoint-list">
              {waypoints.slice(0, 8).map((point, index) => (
                <div
                  className={index === activeWaypoint ? "is-current" : ""}
                  key={point.id}
                >
                  <span>WP-{String(index + 1).padStart(2, "0")}</span>
                  <strong>{point.name}</strong>
                  <small>
                    {point.altitudeM} m · {point.speedKmh} km/h · {point.action}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <p className="mission-empty-note">
              Aucun point de passage : ajoutez un itinéraire dans le
              constructeur pour activer la démonstration locale.
            </p>
          )}
          <button className="secondary-button" onClick={onOpenBuilder}>
            <Wrench size={14} /> Ouvrir le constructeur
          </button>
          <small className="mission-protocol-note">
            Les points du projet sont des coordonnées de canevas normalisées,
            pas des coordonnées GPS navigables.
          </small>
        </section>
      </div>
      <FlightCommandDeck
        design={flightDesign}
        demoState={demoState}
        videoState={videoState}
        telemetryState={telemetryState}
        telemetry={telemetry}
        telemetrySource={telemetrySource}
        activeWaypoint={activeWaypoint}
        waypoints={waypoints}
        missionChecks={missionChecks.map(check => ({
          severity:
            check.severity === "block"
              ? "block"
              : check.severity === "review"
                ? "review"
                : "pass",
          message: check.message,
        }))}
        missionDistanceKm={missionDistanceKm}
        enduranceH={simulation.enduranceH}
        batteryWh={config.batteryWh}
        missionPlan={missionPlan}
        environment={config.missionEnvironment ?? { ambientC: 20, windKmh: config.windSpeedKmh, emiLevel: 0 }}
        operatorApproved={operatorApproved && simulationProtocolReady}
        onCommand={runLocalOperation}
        onLoadDemoPlan={activateLocalControl}
        onOpenBuilder={onOpenBuilder}
        onMissionPlanChange={plan => setConfig({ ...config, missionPlan: plan })}
        onEnvironmentChange={environment => setConfig({ ...config, missionEnvironment: environment })}
      />
      <div className="mission-live-disclaimer">
        <Info size={15} />
        <span>
          Un flux HLS, MP4/WebM ou WSS réel nécessite l’URL et les droits
          d’accès de votre caméra/passerelle. Le poste pilote ici le plan de
          mission SITL local : démarrage, pause, reprise, point suivant,
          maintien, retour et atterrissage modifient l’état virtuel et le
          journal. Aucune commande n’est envoyée à un aéronef physique.
          Quitter cet onglet ferme la passerelle et arrête le flux ou la caméra
          locale.
        </span>
      </div>
    </div>
  );
}

function IdentityConnections() {
  const providersQuery = trpc.identity.providers.useQuery();
  const providers = providersQuery.data ?? [];
  const [connectionState, setConnectionState] = useState("Prêt pour la connexion OIDC");
  const trialEmail = "demo@example.com";
  const copyTrialEmail = async () => {
    try {
      await navigator.clipboard.writeText(trialEmail);
      setConnectionState("Adresse d’essai copiée");
    } catch {
      setConnectionState(`Adresse d’essai : ${trialEmail}`);
    }
  };
  return (
    <section className="panel observator-core-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">OBSERVATOR CORE / IDENTITY GATEWAY</p>
          <h3>Observator Core</h3>
        </div>
        <span className="calculated-badge"><Cloud size={13} /> {connectionState}</span>
      </div>
      <p className="section-description">
        Passerelle d’identité et d’observation : les boutons ci-dessous vérifient la disponibilité du fournisseur et préparent une session d’essai. Aucun secret n’est enregistré dans le navigateur.
      </p>
      <div className="observator-trial-card"><div><span className="eyebrow">ADRESSE D’ESSAI AUTORISÉE</span><strong>{trialEmail}</strong><small>Connexion réelle soumise au fournisseur OIDC configuré côté serveur.</small></div><div className="observator-trial-actions"><button type="button" className="secondary-button" onClick={copyTrialEmail}><Copy size={14} /> Copier</button><button type="button" className="primary-button" onClick={() => { setConnectionState("Vérification du fournisseur…"); void providersQuery.refetch().then(() => setConnectionState("Fournisseur vérifié · prêt")); }}><RefreshCw size={14} /> Tester la connexion</button></div></div>
      <div className="materials-grid">
        {providers.map(provider => (
          <div className="material-card" key={provider.id}>
            <span className="material-status">
              {provider.configured ? "Configuré" : "À configurer"}
            </span>
            <strong>{provider.label}</strong>
            <small>{provider.domains}</small>
            <b>{provider.note}</b>
          </div>
        ))}
      </div>
      {!providersQuery.isLoading && !providers.length && (
        <div className="inspector-note">
          <Info size={15} />
          <span>
            Le registre d’identité est indisponible. Vérifiez la configuration
            serveur.
          </span>
        </div>
      )}
    </section>
  );
}

/** Glyphe d'aperçu par catégorie : remplace la ligne de texte froide du catalogue. */
function MaterialGlyph({ category }: { category?: DronePartCategory }) {
  const stroke = "currentColor";
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <g fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
        {category === "airframe" && (
          <>
            <path d="M6 26h36" />
            <path d="M24 12v22" />
            <path d="M14 20h20" />
            <path d="M10 34h28" />
          </>
        )}
        {category === "propulsion" && (
          <>
            <circle cx="24" cy="24" r="13" />
            <circle cx="24" cy="24" r="3.6" />
            <path d="M24 11v9M24 28v9M11 24h9M28 24h9" />
          </>
        )}
        {category === "energy" && (
          <>
            <rect x="9" y="15" width="26" height="18" rx="3" />
            <path d="M35 20h4v8h-4" />
            <path d="M15 24h14" />
          </>
        )}
        {category === "avionics" && (
          <>
            <rect x="14" y="14" width="20" height="20" rx="2.5" />
            <rect x="20" y="20" width="8" height="8" rx="1.4" />
            <path d="M14 18H9M14 24H9M14 30H9M34 18h5M34 24h5M34 30h5M18 14V9M24 14V9M30 14V9M18 34v5M24 34v5M30 34v5" />
          </>
        )}
        {category === "payload" && (
          <>
            <rect x="9" y="16" width="22" height="15" rx="3" />
            <circle cx="20" cy="23.5" r="5.4" />
            <circle cx="20" cy="23.5" r="2" />
            <path d="M31 21h8v5h-8" />
          </>
        )}
        {category === "landing-gear" && (
          <>
            <path d="M14 11l5 15M34 11l-5 15" />
            <path d="M9 36h30" />
            <path d="M16 26h16" />
          </>
        )}
        {category === "safety" && (
          <>
            <path d="M24 9c9 0 15 5 15 11H9c0-6 6-11 15-11Z" />
            <path d="M13 20l11 17 11-17" />
            <path d="M24 20v17" />
          </>
        )}
        {category === "hardware" && (
          <>
            <circle cx="18" cy="18" r="5" />
            <circle cx="31" cy="31" r="5" />
            <path d="M21.5 21.5l6 6" />
          </>
        )}
        {!category && (
          <>
            <path d="M24 9l13 7.5v15L24 39l-13-7.5v-15Z" />
            <path d="M11 16.5l13 7.5 13-7.5M24 24v15" />
          </>
        )}
      </g>
    </svg>
  );
}

/** Profil filaire 3D associé à la catégorie de matériel affichée. */
function wireModelForCategory(category?: DronePartCategory): WireModelKind {
  switch (category) {
    case "airframe":
      return "chassis";
    case "propulsion":
      return "propulsion";
    case "energy":
      return "energy";
    case "avionics":
      return "navigation";
    case "payload":
      return "payload";
    case "landing-gear":
    case "safety":
      return "structure";
    default:
      return "generic";
  }
}

const materialSourceLabel: Record<string, string> = {
  manufacturer: "FABRICANT",
  user: "PERSONNALISÉ",
  concept: "CONCEPT",
};
type MaterialIntegrationGuide = { stage: string; architecture: string; tools: string[]; check: string };
const materialIntegrationGuides: Record<DronePartCategory, MaterialIntegrationGuide> = {
  airframe: { stage: "Structure & géométrie", architecture: "Définit la cellule, les surfaces porteuses et la reprise des efforts.", tools: ["CAO 3D", "gabarit d’alignement", "pied à coulisse"], check: "Cotes, rigidité et interfaces de fixation." },
  propulsion: { stage: "Propulsion & commandes", architecture: "Relie moteurs, hélices, supports et commandes à la cellule.", tools: ["CAO de support", "banc de poussée", "tachymètre"], check: "Sens de rotation, dégagement, vibrations et poussée." },
  energy: { stage: "Énergie & distribution", architecture: "Structure le bilan de puissance, le câblage et l’intégration batterie.", tools: ["multimètre", "wattmètre", "sertisseuse"], check: "Polarité, courant, connecteurs et échauffement." },
  avionics: { stage: "Avionique & commande", architecture: "Implante calculateur, navigation et liaisons de données.", tools: ["gabarit d’implantation", "outil de configuration", "analyseur de bus"], check: "Compatibilité électrique, bus, antennes et dégagements." },
  payload: { stage: "Capteurs & mission", architecture: "Associe charge utile, champ de vue, centre de gravité et mission.", tools: ["CAO d’enveloppe", "banc de stabilisation", "cible de calibration"], check: "Masse, champ de vue, vibrations et axe optique." },
  "landing-gear": { stage: "Train & protection", architecture: "Vérifie garde au sol, points d’appui et protection de la cellule.", tools: ["gabarit de niveau", "pied à coulisse", "banc de charge statique"], check: "Garde au sol, symétrie et reprise des charges." },
  safety: { stage: "Sécurité & récupération", architecture: "Réserve le volume et l’interface des dispositifs de récupération.", tools: ["gabarit de montage", "banc d’essai à froid", "liste de contrôle"], check: "Déploiement, dégagement et revue indépendante." },
  hardware: { stage: "Interfaces & quincaillerie", architecture: "Ferme les liaisons mécaniques et électriques entre sous-systèmes.", tools: ["clé dynamométrique", "jauge / pied à coulisse", "gabarit de perçage"], check: "Couple, verrouillage, tolérances et traçabilité." },
};
const materialGuideFor = (category?: DronePartCategory) =>
  category ? materialIntegrationGuides[category] : materialIntegrationGuides.hardware;
function MaterialsAssemblyView({
  config,
  setConfig,
  onOpenConstruction,
  onOpenDesign,
  onOpenArchitecture,
}: {
  config: ConceptConfig;
  setConfig: SetConceptConfig;
  onOpenConstruction: () => void;
  onOpenDesign: () => void;
  onOpenArchitecture: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<DronePartCategory | "all">("all");
  const [source, setSource] = useState<"all" | "manufacturer" | "concept" | "user">("all");
  const [selectedId, setSelectedId] = useState<string | null>(config.engineeringSelection?.materialId ?? null);
  const [custom, setCustom] = useState({ label: "", manufacturer: "", partNumber: "", massKg: "", physicalId: "" });
  useEffect(() => { setSelectedId(config.engineeringSelection?.materialId ?? null); }, [config.engineeringSelection?.materialId]);
  const catalog = materialCatalog;
  const installed = config.installedMaterials ?? [];
  const catalogIds = new Set(catalog.map(item => item.id));
  const allItems = [...catalog, ...installed.filter(item => !catalogIds.has(item.id))];
  const filtered = allItems.filter(item => {
    const guide = materialGuideFor(item.category);
    const haystack = `${item.label} ${item.use} ${item.manufacturer ?? ""} ${item.partNumber ?? ""} ${item.category ?? ""} ${item.interfaces ?? ""} ${guide.stage} ${guide.architecture} ${guide.tools.join(" ")} ${guide.check}`.toLocaleLowerCase("fr-FR");
    return (category === "all" || item.category === category) &&
      (source === "all" || (item.catalogSource ?? "concept") === source) &&
      haystack.includes(query.toLocaleLowerCase("fr-FR"));
  });
  const selected = allItems.find(item => item.id === selectedId) ?? filtered[0] ?? null;
  const selectedGuide = selected ? materialGuideFor(selected.category) : null;
  const architectureName = config.engineeringSelection?.droneLabel ?? config.designName ?? config.airframe ?? "Aucune architecture sélectionnée";
  const architectureLinked = Boolean(config.airframe || config.platformProfile || (config.engineeringSelection?.droneId && config.engineeringSelection.droneId !== "unselected"));
  const selectMaterial = (item: DronePartDefinition | InstalledMaterial) => {
    setSelectedId(item.id);
    setConfig(current => ({
      ...current,
      engineeringSelection: {
        ...current.engineeringSelection,
        source: current.engineeringSelection?.source ?? (current.platformProfile || current.customSketch?.strokes?.length ? "custom" : "catalog"),
        droneId: current.engineeringSelection?.droneId ?? current.platformProfile ?? "unselected",
        droneLabel: current.engineeringSelection?.droneLabel ?? current.designName ?? "Aucun drone sélectionné",
        materialId: item.id,
        materialLabel: item.label,
        materialSource: item.catalogSource ?? "concept",
        updatedAt: new Date().toISOString(),
      },
    }));
  };
  const updateInstalled = (update: (current: InstalledMaterial[]) => InstalledMaterial[]) =>
    setConfig(current => {
      const next = update(current.installedMaterials ?? []);
      return { ...current, installedMaterials: next, constructionMassKg: installedPartsMassKg(next) };
    });
  const addToAssembly = (item: DronePartDefinition | InstalledMaterial) => {
    selectMaterial(item);
    updateInstalled(current => {
      const existing = current.find(entry => entry.id === item.id);
      return existing
        ? current.map(entry => entry.id === item.id ? { ...entry, quantity: (entry.quantity ?? 1) + 1 } : entry)
        : [...current, { ...item, quantity: item.quantity ?? 1 } as InstalledMaterial];
    });
  };
  const removeFromAssembly = (id: string) => updateInstalled(current => current.filter(item => item.id !== id));
  const addCustomPart = () => {
    const label = custom.label.trim();
    const massKg = Number(custom.massKg);
    if (!label || !Number.isFinite(massKg) || massKg < 0) return;
    const item: DronePartDefinition = {
      id: `user-part-${Date.now()}`,
      label,
      category: "hardware",
      use: "Composant personnalisé — identification physique à compléter",
      massKg,
      geometry: "mount",
      manufacturer: custom.manufacturer.trim() || "Non renseigné",
      partNumber: custom.partNumber.trim() || "Référence interne à attribuer",
      catalogSource: "user",
      manufacturerDataStatus: "estimate",
      physicalStatus: "not-verified",
      physicalId: custom.physicalId.trim() || "Identifiant physique à attribuer",
      interfaces: "À documenter sur la pièce réelle et sa fiche de montage",
    };
    updateInstalled(current => [...current, item]);
    selectMaterial(item);
    setCustom({ label: "", manufacturer: "", partNumber: "", massKg: "", physicalId: "" });
  };
  return (
    <div className="view-stack materials-assembly-view">
      <SectionHeading eyebrow="BIBLIOTHÈQUE / IDENTIFICATION MATÉRIELLE" title="Bibliothèque de matériels & assemblages" description="Catalogue unifié des références fabricants, modules de concept et matériels personnalisés. Chaque fiche peut être ajoutée à la nomenclature, puis vérifiée sur pièce avant toute décision d’ingénierie." />
      <div className="materials-summary-grid" aria-label="Résumé de la bibliothèque de matériels">
        <div><strong>{materialLibrarySummary.total}</strong><span>références catalogue</span></div>
        <div><strong>{installed.length}</strong><span>éléments dans l’assemblage</span></div>
        <div><strong>{installedPartsMassKg(installed).toFixed(2)} kg</strong><span>masse installée calculée</span></div>
        <div><strong>{materialLibrarySummary.manufacturer}</strong><span>références fabricant sourcées</span></div>
      </div>
      <section className="materials-architecture-flow" aria-label="Lien entre matériel, architecture et outils de conception">
        <div className="materials-architecture-heading"><div><p className="eyebrow">MATÉRIEL → ARCHITECTURE → ATELIER</p><h3>Chaîne d’intégration du drone</h3></div><span className={architectureLinked ? "is-connected" : "is-pending"}><i />{architectureLinked ? "ARCHITECTURE LIÉE" : "ARCHITECTURE À CHOISIR"}</span></div>
        <div className="materials-architecture-steps">
          <div><small>01 / ARCHITECTURE</small><strong>{architectureName}</strong><span>Cellule, propulsion, énergie, avionique et mission</span></div>
          <div><small>02 / CONCEPTION & CAO</small><strong>{selectedGuide?.stage ?? "Implantation des sous-systèmes"}</strong><span>{installed.length} composant(s) dans la nomenclature partagée</span></div>
          <div><small>03 / OUTILLAGE À PRÉVOIR</small><strong>{selectedGuide?.tools.slice(0, 2).join(" · ") ?? "Selon la catégorie sélectionnée"}</strong><span>Recommandations indicatives, non inventaire d’atelier</span></div>
          <div><small>04 / CONTRÔLE</small><strong>{installedPartsMassKg(installed).toFixed(2)} kg déclarés</strong><span>Vérifier interfaces, masse et données fabricant</span></div>
        </div>
        <div className="materials-architecture-footer"><span><Info size={14} /> Le catalogue est embarqué dans l’application; l’ajout inscrit une pièce dans la configuration projet partagée, sans créer une référence fournisseur distante.</span><div><button type="button" onClick={onOpenConstruction}><Wrench size={14} /> Poste de construction</button><button type="button" onClick={onOpenDesign}><Layers3 size={14} /> Conception / CAO</button><button type="button" onClick={onOpenArchitecture}><Box size={14} /> Architecture 3D</button></div></div>
      </section>
      <section className="panel materials-toolbar">
        <input aria-label="Rechercher un composant" placeholder="Rechercher moteur, hélice, capteur, référence…" value={query} onChange={event => setQuery(event.target.value)} />
        <select aria-label="Filtrer par catégorie" value={category} onChange={event => setCategory(event.target.value as DronePartCategory | "all")}><option value="all">Toutes les catégories</option>{dronePartCategories.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <select aria-label="Filtrer par source" value={source} onChange={event => setSource(event.target.value as typeof source)}><option value="all">Toutes les sources</option><option value="manufacturer">Fabricant</option><option value="concept">Concept / générique</option><option value="user">Personnalisé</option></select>
      </section>
      <div className="materials-layout">
        <section className="panel material-catalog-panel"><div className="panel-header"><div><p className="eyebrow">CATALOGUE UNIFIÉ</p><h3>Composants disponibles</h3></div><span className="calculated-badge">{filtered.length} résultat(s)</span></div><div className="material-card-grid">
            {filtered.map(item => {
              const guide = materialGuideFor(item.category);
              const inAssembly = installed.some(part => part.id === item.id);
              return (
              <button
                key={item.id}
                type="button"
                className={`material-preview-card tone-${item.catalogSource ?? "concept"} ${selected?.id === item.id ? "is-selected" : ""}`}
                aria-pressed={selected?.id === item.id}
                onClick={() => selectMaterial(item)}
              >
                <span className="material-preview-visual" aria-hidden="true">
                  <MaterialGlyph category={item.category} />
                  <i className="material-preview-scan" />
                </span>
                <span className="material-preview-copy">
                  <strong>{item.label}</strong>
                  <small>
                    {item.category
                      ? dronePartCategories.find(categoryItem => categoryItem.id === item.category)?.label
                      : "Composant"}{" "}
                    · {item.manufacturer ?? "Concept AeroMind"}
                  </small>
                  <small className="material-preview-use">{item.use}</small>
                  <span className="material-preview-tooling"><Wrench size={12} />{guide.tools.slice(0, 2).join(" · ")}</span>
                  <span className="material-preview-meta">
                    <b>{item.massKg.toFixed(3)} kg</b>
                    <em>{materialSourceLabel[item.catalogSource ?? "concept"] ?? "CONCEPT"}</em>
                    {inAssembly && <i className="material-installed-chip">DANS LA NOMENCLATURE</i>}
                    <i
                      className={
                        item.manufacturerDataStatus === "verified"
                          ? "is-verified"
                          : item.manufacturerDataStatus === "partial"
                            ? "is-partial"
                            : "is-estimate"
                      }
                    >
                      {item.manufacturerDataStatus === "verified"
                        ? "SOURCE VÉRIFIÉE"
                        : item.manufacturerDataStatus === "partial"
                          ? "SOURCE PARTIELLE"
                          : "À QUALIFIER"}
                    </i>
                  </span>
                </span>
              </button>
              );
            })}
          </div></section>
        <aside className="panel material-detail-panel">{selected ? <><div className="panel-header"><div><p className="eyebrow">FICHE D’IDENTIFICATION</p><h3>{selected.label}</h3></div><span className={`material-status status-${selected.manufacturerDataStatus ?? "estimate"}`}>{selected.manufacturerDataStatus === "verified" ? "SOURCE VÉRIFIÉE" : selected.manufacturerDataStatus === "partial" ? "SOURCE PARTIELLE" : "À QUALIFIER"}</span></div><WireframeViewer
            model={wireModelForCategory(selected.category)}
            label={selected.label}
            caption={`Volume filaire 3D · ${selected.partNumber ?? "référence à attribuer"} · ${(selected.manufacturer ?? "Concept AeroMind").toUpperCase()}`}
            accent={
              selected.category === "propulsion"
                ? "#a9b7c2"
                : selected.category === "payload"
                  ? "#f4be4f"
                  : selected.category === "energy"
                    ? "#6fe0ad"
                    : "#48d3f0"
            }
          />
          {selectedGuide && <section className="material-integration-card" aria-label="Outils et vérifications recommandés pour ce matériel">
            <div className="material-integration-heading"><div><small>LIEN AVEC L’ARCHITECTURE</small><h4>{selectedGuide.stage}</h4></div><span><Layers3 size={13} /> {selected.category ? dronePartCategories.find(item => item.id === selected.category)?.label : "Composant"}</span></div>
            <p>{selectedGuide.architecture}</p>
            <div className="material-tool-list"><strong><Wrench size={13} /> Outillage à prévoir</strong>{selectedGuide.tools.map(tool => <span key={tool}>{tool}</span>)}</div>
            <div className="material-integration-check"><CheckCircle2 size={14} /><span><b>Point de contrôle</b>{selectedGuide.check}</span></div>
            <small className="material-guidance-note">Suggestions d’ingénierie à adapter à la pièce et au fabricant; elles ne certifient ni la compatibilité ni la disponibilité des outils.</small>
          </section>}
          <dl className="material-detail-list"><div><dt>Fabricant</dt><dd>{selected.manufacturer ?? "Non renseigné"}</dd></div><div><dt>Référence / SKU</dt><dd>{selected.partNumber ?? "Non renseignée"}</dd></div><div><dt>Identifiant physique</dt><dd>{selected.physicalId ?? "À attribuer à la réception"} · {selected.physicalStatus === "inspected" ? "inspecté" : selected.physicalStatus === "received" ? "réceptionné" : "non vérifié"}</dd></div><div><dt>Masse unitaire</dt><dd>{selected.massKg.toFixed(3)} kg · quantité {selected.quantity ?? 1}</dd></div><div><dt>Dimensions</dt><dd>{selected.dimensions ?? "À relever sur pièce ou dans la fiche technique"}</dd></div><div><dt>Interfaces d’assemblage</dt><dd>{selected.interfaces ?? "À documenter : perçages, connectique, enveloppe et fixations"}</dd></div><div><dt>Électricité / énergie</dt><dd>{selected.electrical ?? "Non renseigné — validation fabricant nécessaire"}</dd></div></dl><div className="material-detail-actions"><button className="primary-button" onClick={() => addToAssembly(selected)}>Ajouter à la nomenclature</button>{installed.some(item => item.id === selected.id) && <button className="secondary-button" onClick={() => removeFromAssembly(selected.id)}>Retirer de l’assemblage</button>}{selected.productUrl && <a className="secondary-button" href={selected.productUrl} target="_blank" rel="noreferrer">Ouvrir la source fabricant</a>}</div><p className="inspector-note"><Info size={15} /> Une référence catalogue ne prouve pas la présence physique. Pour passer au statut matériel identifiable, renseignez l’identifiant de pièce, la fiche fabricant, la photo ou le relevé, puis faites valider la réception.</p></> : <p className="section-description">Aucun composant ne correspond à la recherche.</p>}</aside>
      </div>
      <div className="materials-layout materials-bottom-layout"><section className="panel"><div className="panel-header"><div><p className="eyebrow">NOUVELLE RÉFÉRENCE</p><h3>Ajouter un composant personnalisé</h3></div><Plus size={16} className="muted-icon" /></div><div className="materials-custom-form"><input placeholder="Nom du composant" value={custom.label} onChange={event => setCustom({ ...custom, label: event.target.value })} /><input placeholder="Fabricant" value={custom.manufacturer} onChange={event => setCustom({ ...custom, manufacturer: event.target.value })} /><input placeholder="Référence / numéro de pièce" value={custom.partNumber} onChange={event => setCustom({ ...custom, partNumber: event.target.value })} /><input placeholder="ID physique / lot" value={custom.physicalId} onChange={event => setCustom({ ...custom, physicalId: event.target.value })} /><input type="number" min="0" step="0.001" placeholder="Masse (kg)" value={custom.massKg} onChange={event => setCustom({ ...custom, massKg: event.target.value })} /><button className="secondary-button" onClick={addCustomPart}>Créer la fiche</button></div></section><section className="panel"><div className="panel-header"><div><p className="eyebrow">NOMENCLATURE ACTIVE</p><h3>Assemblage du projet</h3></div><span className="calculated-badge">{installed.length} ligne(s)</span></div>{installed.length ? <div className="assembly-bom-list">{installed.map(item => <div key={item.id}><span><strong>{item.label}</strong><small>{item.partNumber ?? "Sans référence"} · ID {item.physicalId ?? "à attribuer"} · {item.quantity ?? 1} × {item.massKg.toFixed(3)} kg</small></span><button className="text-button" onClick={() => removeFromAssembly(item.id)}>Retirer</button></div>)}</div> : <p className="section-description">Ajoutez des composants depuis le catalogue pour constituer la nomenclature active.</p>}</section></div>
    </div>
  );
}

function OperationsView({
  onResetWorkspace,
  onRefreshSystem,
  activeProjectId,
  authenticated,
  remoteReady,
  config,
  setConfig,
}: {
  onResetWorkspace: () => void;
  onRefreshSystem: () => void;
  activeProjectId: string;
  authenticated: boolean;
  remoteReady: boolean;
  config: ConceptConfig;
  setConfig: SetConceptConfig;
}) {
  const [localState, setLocalState] = useState("Session locale active");
  const [plan, setPlan] = useState<MissionPlan>(() => ({
    ...defaultMissionPlan,
    maxAltitudeM: config.altitudeM || defaultMissionPlan.maxAltitudeM,
    maxSpeedKmh: config.cruiseSpeedKmh || defaultMissionPlan.maxSpeedKmh,
    geofenceRadiusKm:
      config.missionPlan?.radiusKm || defaultMissionPlan.geofenceRadiusKm,
    minimumBatteryPercent: config.reserveFraction
      ? Math.round(config.reserveFraction * 100)
      : defaultMissionPlan.minimumBatteryPercent,
    returnOnLinkLoss:
      config.missionPlan?.lostLinkAction === "return" ||
      defaultMissionPlan.returnOnLinkLoss,
  }));
  const [mode, setMode] = useState<AutonomyMode>("manual");
  const missionRoute = {
    ...defaultLocalMissionPlan,
    ...config.missionPlan,
    waypoints: config.missionPlan?.waypoints ?? [],
  };
  const [routeDrawingEnabled, setRouteDrawingEnabled] = useState(false);
  const updateMissionRoute = (waypoints: MissionWaypoint[]) => {
    setConfig({
      ...config,
      missionPlan: {
        ...missionRoute,
        waypoints,
      },
    });
  };
  const addMissionWaypointFromCanvas = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!routeDrawingEnabled || missionRoute.waypoints.length >= 64) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(3, Math.min(97, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.max(3, Math.min(97, ((event.clientY - bounds.top) / bounds.height) * 100));
    const waypoint: MissionWaypoint = {
      id: `OPS-WP-${Date.now()}-${missionRoute.waypoints.length + 1}`,
      name: `Point dessiné ${missionRoute.waypoints.length + 1}`,
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
      altitudeM: Math.min(plan.maxAltitudeM, Math.max(1, config.altitudeM || 60)),
      speedKmh: Math.min(plan.maxSpeedKmh, Math.max(1, config.cruiseSpeedKmh || 30)),
      action: "inspection",
    };
    updateMissionRoute([...missionRoute.waypoints, waypoint]);
    record(`Itinéraire manuel · point ${missionRoute.waypoints.length + 1} ajouté au canevas local`);
  };
  const clearMissionRoute = () => {
    updateMissionRoute([]);
    record("Itinéraire manuel effacé · aucun point de passage conservé");
  };
  const updatePlan = (next: MissionPlan) => {
    setPlan(next);
    setConfig({
      ...config,
      altitudeM: next.maxAltitudeM,
      cruiseSpeedKmh: next.maxSpeedKmh,
      reserveFraction: next.minimumBatteryPercent / 100,
      missionPlan: {
        ...defaultLocalMissionPlan,
        ...config.missionPlan,
        radiusKm: next.geofenceRadiusKm,
        lostLinkAction: next.returnOnLinkLoss ? "return" : "hold",
      },
    });
  };
  useEffect(() => {
    setPlan(current => ({
      ...current,
      maxAltitudeM: config.altitudeM || current.maxAltitudeM,
      maxSpeedKmh: config.cruiseSpeedKmh || current.maxSpeedKmh,
      geofenceRadiusKm:
        config.missionPlan?.radiusKm || current.geofenceRadiusKm,
      minimumBatteryPercent: config.reserveFraction
        ? Math.round(config.reserveFraction * 100)
        : current.minimumBatteryPercent,
      returnOnLinkLoss: config.missionPlan?.lostLinkAction === "return",
    }));
  }, [
    config.altitudeM,
    config.cruiseSpeedKmh,
    config.missionPlan?.radiusKm,
    config.missionPlan?.lostLinkAction,
    config.reserveFraction,
  ]);
  const auditMutation = trpc.auditEvents.record.useMutation();
  const auditQuery = trpc.auditEvents.list.useQuery(activeProjectId, {
    enabled: authenticated && remoteReady && !activeProjectId.startsWith("project-"),
    retry: false,
  });
  const [events, setEvents] = useState<string[]>([
    "Session opérationnelle ouverte · supervision humaine active",
  ]);
  const checks = validateMissionPlan(plan);
  const record = (message: string) => {
    setEvents(current =>
      [
        `${new Date().toLocaleTimeString("fr-FR")} · ${message}`,
        ...current,
      ].slice(0, 6)
    );
    if (authenticated && remoteReady && !activeProjectId.startsWith("project-")) {
      auditMutation.mutate(
        {
          id: activeProjectId,
          eventType: "operation.action",
          payload: { message, mode, recordedAt: new Date().toISOString() },
        },
        {
          onSuccess: () => {
            void auditQuery.refetch();
          },
        }
      );
    }
  };
  const setSafeMode = (nextMode: AutonomyMode, message: string) => {
    setMode(nextMode);
    record(message);
  };
  const approveMission = () => {
    if (!canLaunchMission(plan)) {
      record("Départ refusé · une validation bloquante est en échec");
      return;
    }
    setMode("supervised");
    record("Mission approuvée par l’opérateur · mode supervisé engagé");
  };
  const [authorizationState, setAuthorizationState] = useState<"draft" | "requested" | "approved">("draft");
  const [uploadState, setUploadState] = useState("Aucun fichier en quarantaine");
  const [cfdState, setCfdState] = useState("Runtime OpenFOAM non vérifié");
  const [certificate, setCertificate] = useState<{ id: string; status: string } | null>(null);
  const projectBound = Boolean(activeProjectId && !activeProjectId.startsWith("project-"));
  const evidenceValid = Boolean(certificate);
  const approvalBlockedReason = !authenticated
    ? "Session OIDC requise"
    : !projectBound
      ? "Projet serveur authentifié requis"
      : !evidenceValid
        ? "Preuve serveur valide requise"
        : "";
  // Séquence d'authentification asynchrone simulée : aucune clé privée, aucun
  // jeton réel et aucun appel d'autorisation externe ne sont produits.
  const authorizationStages = [
    "Assemblage de l’en-tête JWT et des revendications",
    "Signature asymétrique ES256 (simulation)",
    "Validation de l’émetteur, de l’audience et du nonce",
    "Résolution JWKS et contrôle d’horloge",
    "Calcul des droits opérateur et du périmètre mission",
    "Scellement du dossier d’autorisation",
  ];
  const [authProgressPct, setAuthProgressPct] = useState(0);
  const [authStageIndex, setAuthStageIndex] = useState(-1);
  const [authSequenceState, setAuthSequenceState] = useState<
    "idle" | "running" | "done" | "refused"
  >("idle");
  const authTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (authTimerRef.current !== null) window.clearInterval(authTimerRef.current);
    },
    []
  );
  const runAuthorizationSequence = () => {
    if (authTimerRef.current !== null) window.clearInterval(authTimerRef.current);
    setAuthSequenceState("running");
    setAuthProgressPct(0);
    setAuthStageIndex(0);
    record(
      "Séquence d’authentification JWT lancée · simulation locale, aucun jeton réel émis"
    );
    let step = 0;
    authTimerRef.current = window.setInterval(() => {
      step += 1;
      const index = Math.min(step - 1, authorizationStages.length - 1);
      setAuthStageIndex(index);
      setAuthProgressPct(
        Math.min(100, Math.round((step / authorizationStages.length) * 100))
      );
      record(`JWT · ${authorizationStages[index]}`);
      if (step >= authorizationStages.length) {
        if (authTimerRef.current !== null) window.clearInterval(authTimerRef.current);
        authTimerRef.current = null;
        setAuthSequenceState("done");
        setAuthorizationState("requested");
        record("Dossier d’autorisation transmis · décision humaine requise");
      }
    }, 320);
  };
  const requestFlightAuthorization = () => {
    if (!authenticated || !projectBound || !canLaunchMission(plan)) {
      if (authTimerRef.current !== null) window.clearInterval(authTimerRef.current);
      authTimerRef.current = null;
      setAuthSequenceState("refused");
      setAuthProgressPct(0);
      setAuthStageIndex(-1);
      record(
        !authenticated
          ? "Autorisation refusée · session OIDC requise"
          : !projectBound
            ? "Autorisation refusée · projet serveur authentifié requis"
            : "Autorisation refusée · checklist pré-vol bloquante"
      );
      return;
    }
    runAuthorizationSequence();
  };
  // Flux de session continu : simule une activité logicielle intense en
  // arrière-plan (liaison, trames, quarantaine, scellement de preuve).
  const [systemFeed, setSystemFeed] = useState<
    Array<{ id: string; at: string; line: string; tone: string }>
  >([
    {
      id: "SYS-000",
      at: new Date().toLocaleTimeString("fr-FR"),
      line: "Journal de session initialisé · supervision humaine active",
      tone: "neutral",
    },
  ]);
  useEffect(() => {
    const templates: Array<[string, string]> = [
      [`Télémétrie lecture seule · ${(12 + Math.random() * 8).toFixed(1)} trames/s tamponnées`, "cyan"],
      ["Liaison locale · qualité de canal stable, latence nominale", "green"],
      ["Validation de payload · empreinte SHA-256 recalculée en quarantaine", "violet"],
      [`Réseau · ${(0.4 + Math.random() * 1.4).toFixed(2)} Mo/s entrants, 0 sortie actionneur`, "amber"],
      ["Garde-fou · frontière de contrôle vérifiée, sorties matérielles rejetées", "green"],
      ["Preuve interne · horodatage du dossier de revue mis à jour", "violet"],
      [`Enveloppe énergie · réserve modélisée ${(14 + Math.random() * 6).toFixed(1)} %`, "amber"],
      ["Journal d’audit · événement métier sérialisé, aucune transmission externe", "cyan"],
      ["Sécurité · rotation des tampons de session, aucune clé persistée", "violet"],
      ["Télémétrie synthétique · recalage du modèle de vol local", "cyan"],
    ];
    let counter = 0;
    const push = () => {
      counter += 1;
      const [line, tone] = templates[counter % templates.length];
      setSystemFeed(current =>
        [
          {
            id: `SYS-${String(counter).padStart(3, "0")}`,
            at: new Date().toLocaleTimeString("fr-FR"),
            line,
            tone,
          },
          ...current,
        ].slice(0, 14)
      );
    };
    const timer = window.setInterval(push, 1400);
    return () => window.clearInterval(timer);
  }, []);
  const approveFlightAuthorization = async () => {
    try {
      const response = await fetch("/api/auth/oidc/me", { credentials: "include", headers: bearerHeaders() });
      const identity = response.ok ? (await response.json() as { role?: string }) : null;
      if (identity?.role !== "super_admin") {
        record("Approbation refusée · rôle Super-Admin requis");
        return;
      }
      setAuthorizationState("approved");
      record("Autorisation approuvée · sortie physique toujours bloquée");
    } catch {
      record("Approbation impossible · identité non vérifiable");
    }
  };
  const issueEvidenceCertificate = () => {
    const campaign = runVirtualTestCampaign(config);
    if (campaign.counts.fail > 0) {
      record("Certification refusée · échec dans la campagne de preuve");
      return;
    }
    const id = `AM-CERT-N2-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
    setCertificate({ id, status: "N2 · simulation et revue humaine" });
    record(`Dossier de preuve généré · ${id}`);
  };
  const prepareCfdCase = async () => {
    setCfdState("Préparation du cas CFD…");
    try {
      const response = await fetch("/api/ops/cfd/prepare", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: activeProjectId, configuration: config }) });
      const result = await response.json() as { status?: string; reason?: string };
      setCfdState(result.reason || result.status || "Cas CFD préparé");
      record(`CFD · ${result.status || "résultat inconnu"}`);
    } catch {
      setCfdState("Préparation CFD indisponible");
      record("CFD · erreur de préparation");
    }
  };
  return (
    <div className="view-stack">
      <SectionHeading
        eyebrow="05 / OPÉRATIONS SUPERVISÉES"
        title="Autonomie encadrée"
        description="AeroMind propose et vérifie ; l’opérateur approuve, surveille et peut reprendre la main à tout moment."
        action={
          <span className={`operation-mode mode-${mode}`}>
            {mode === "manual"
              ? "MANUEL"
              : mode === "supervised"
                ? "SUPERVISÉ"
                : mode === "safe-return"
                  ? "RETOUR SÛR"
                  : "ATTERRISSAGE URGENCE"}
          </span>
        }
      />
      <section className="panel operations-command-center" aria-label="Centre opérationnel AeroMind">
        <div className="panel-header"><div><p className="eyebrow">CENTRE OPÉRATIONNEL AEROMIND · ADMINISTRATION HUMAINE</p><h3>Autorisation, preuve et essais</h3></div><span className="calculated-badge">SORTIES PHYSIQUES BLOQUÉES</span></div>
        <div className="operations-command-grid">
          <div><strong>Préparation de dossier (simulé)</strong><span className={`ops-state ops-state-${authorizationState}`}>{authorizationState === "draft" ? "BROUILLON" : authorizationState === "requested" ? "EN ATTENTE SUPER-ADMIN" : "APPROUVÉE · SIMULATION"}</span><small>Le dossier est traçable ; aucune approbation ne déclenche un aéronef réel.</small><div className={`authorization-progress is-${authSequenceState}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={authProgressPct} aria-label="Progression de la séquence d’authentification JWT simulée"><div className="authorization-progress-track"><i style={{ width: `${authProgressPct}%` }} /></div><div className="authorization-progress-meta"><span>{authSequenceState === "idle" ? "Séquence d’authentification inactive" : authSequenceState === "refused" ? "Séquence interrompue · prérequis manquant" : authSequenceState === "done" ? "Chaîne JWT simulée validée" : authorizationStages[Math.max(0, authStageIndex)]}</span><b>{authProgressPct}%</b></div><div className="authorization-stages">{authorizationStages.map((stage, index) => <span key={stage} className={authSequenceState === "done" || index < authStageIndex ? "is-done" : authSequenceState === "running" && index === authStageIndex ? "is-current" : ""}><i />{stage}</span>)}</div><small className="authorization-disclaimer">Chaîne cryptographique simulée localement : aucun jeton n’est émis, aucune clé privée n’est manipulée et aucune décision automatique n’est prise.</small></div><div className="operation-actions"><button className="secondary-button" onClick={requestFlightAuthorization} disabled={!authenticated || !projectBound || authorizationState !== "draft" || authSequenceState === "running"}>{authSequenceState === "running" ? "Séquence en cours…" : "Demander l’autorisation"}</button><button className="primary-button" onClick={() => void approveFlightAuthorization()} disabled={authorizationState !== "requested" || !authenticated || !projectBound || !evidenceValid} title={approvalBlockedReason || "Preuve serveur valide et décision humaine requises"}>Approuver (Super-Admin)</button></div></div>
          <div><strong>Attestation simulée — NON ÉMISE</strong><span className="ops-state">{certificate?.status || "NON ÉMISE"}</span><small>Certificat limité au niveau effectivement testé, sans déclaration réglementaire implicite.</small><button className="secondary-button" onClick={issueEvidenceCertificate} disabled={!authenticated || !projectBound} title={!authenticated || !projectBound ? "Session OIDC et projet serveur requis" : "Générer une attestation interne, non émise"}>Générer le dossier de preuve</button>{certificate && <code className="ops-certificate">{certificate.id}</code>}</div>
          <div><strong>CFD OpenFOAM isolée</strong><span className="ops-state">{cfdState}</span><small>Le cas est préparé séparément ; aucun résultat n’est présenté comme mesuré sans runtime disponible.</small><button className="secondary-button" onClick={() => void prepareCfdCase()} disabled={!authenticated || !projectBound} title={!authenticated || !projectBound ? "Session OIDC et projet serveur requis" : "Générer le fichier sans lancer de calcul"}>Générer un fichier de cas CFD</button></div>
          <div><strong>Téléversement en quarantaine</strong><span className="ops-state">{uploadState}</span><small>Hash et analyse avant tout usage. Aucun envoi vers un contrôleur ou un aéronef.</small><label className="secondary-button ops-upload"><Upload size={14} /> Déposer un artefact<input type="file" hidden onChange={event => { const file = event.target.files?.[0]; if (file) { setUploadState(`${file.name} · quarantaine · analyse requise`); record(`Artefact placé en quarantaine · ${file.name}`); } }} /></label></div>
        </div>
      </section>
      <div className="operations-grid">
        <section className="panel operation-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">PLAN DE MISSION / PRÉVOL</p>
              <h3>{plan.name}</h3>
            </div>
            <span className="calculated-badge">
              <ShieldCheck size={13} /> Supervision requise
            </span>
          </div>
          <div className="operation-fields">
            <label>
              Altitude max. (m)
              <input
                type="number"
                value={plan.maxAltitudeM}
                onChange={e =>
                  updatePlan({ ...plan, maxAltitudeM: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Vitesse max. (km/h)
              <input
                type="number"
                value={plan.maxSpeedKmh}
                onChange={e =>
                  updatePlan({ ...plan, maxSpeedKmh: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Géorepérage (km)
              <input
                type="number"
                value={plan.geofenceRadiusKm}
                onChange={e =>
                  updatePlan({
                    ...plan,
                    geofenceRadiusKm: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Réserve batterie (%)
              <input
                type="number"
                value={plan.minimumBatteryPercent}
                onChange={e =>
                  updatePlan({
                    ...plan,
                    minimumBatteryPercent: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <label className="operation-check">
            <input
              type="checkbox"
              checked={plan.returnOnLinkLoss}
              onChange={e =>
                updatePlan({ ...plan, returnOnLinkLoss: e.target.checked })
              }
            />{" "}
            Retour automatique en cas de perte de liaison
          </label>
          <label className="operation-check">
            <input
              type="checkbox"
              checked={plan.humanApproval}
              onChange={e =>
                updatePlan({ ...plan, humanApproval: e.target.checked })
              }
            />{" "}
            Approbation humaine obligatoire avant départ
          </label>
          <section className="mission-route-drawing" aria-labelledby="mission-route-drawing-title">
            <div className="mission-route-drawing-heading">
              <div>
                <p className="eyebrow">ITINÉRAIRE UTILISATEUR · TOUS MODES</p>
                <h4 id="mission-route-drawing-title">Dessiner mon itinéraire</h4>
                <small>Ajoutez des points directement sur le canevas. Le tracé reste disponible quel que soit le mode de navigation choisi.</small>
              </div>
              <span className="calculated-badge">{missionRoute.waypoints.length} / 64 points</span>
            </div>
            <div className="mission-route-drawing-toolbar">
              <button type="button" className={routeDrawingEnabled ? "primary-button" : "secondary-button"} onClick={() => setRouteDrawingEnabled(current => !current)}>
                <Pencil size={14} /> {routeDrawingEnabled ? "Dessin actif · cliquer pour ajouter" : "Commencer à dessiner"}
              </button>
              <button type="button" className="secondary-button" onClick={clearMissionRoute} disabled={!missionRoute.waypoints.length}>
                <Trash2 size={14} /> Effacer l’itinéraire
              </button>
              <span className="mission-route-mode-note">Mode actuel : <strong>{mode === "manual" ? "manuel" : mode === "supervised" ? "supervisé" : mode === "safe-return" ? "retour sûr" : "atterrissage urgence"}</strong></span>
            </div>
            <svg
              className={`mission-route-drawing-canvas ${routeDrawingEnabled ? "is-drawing" : ""}`}
              viewBox="0 0 100 100"
              role="application"
              aria-label="Canevas local pour dessiner l’itinéraire de mission"
              onClick={addMissionWaypointFromCanvas}
            >
              <defs>
                <pattern id="missionRouteDrawingGrid" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(115, 155, 160, 0.16)" strokeWidth="0.3" />
                </pattern>
              </defs>
              <rect width="100" height="100" fill="url(#missionRouteDrawingGrid)" />
              <polyline points={[{ x: missionRoute.homeX, y: missionRoute.homeY }, ...missionRoute.waypoints].map(point => `${point.x},${point.y}`).join(" ")} className="mission-route-drawing-line" />
              <circle cx={missionRoute.homeX} cy={missionRoute.homeY} r="4" className="mission-route-drawing-home" />
              <text x={missionRoute.homeX + 4.5} y={missionRoute.homeY + 1} className="mission-route-drawing-label">HOME</text>
              {missionRoute.waypoints.map((point, index) => (
                <g key={point.id}>
                  <circle cx={point.x} cy={point.y} r="3.2" className="mission-route-drawing-point" />
                  <text x={point.x + 3.5} y={point.y - 2.5} className="mission-route-drawing-label">{String(index + 1).padStart(2, "0")}</text>
                </g>
              ))}
              <text x="3" y="96" className="mission-route-drawing-caption">{routeDrawingEnabled ? "CLIQUEZ POUR AJOUTER · CANEVAS LOCAL · SANS GPS" : "ACTIVEZ LE DESSIN POUR AJOUTER DES POINTS · SANS GPS"}</text>
            </svg>
            <div className="mission-route-drawing-list">
              {missionRoute.waypoints.slice(-8).map((point, index) => (
                <div key={point.id}><span>WP-{String(missionRoute.waypoints.length - 7 + index).padStart(2, "0")}</span><strong>{point.name}</strong><small>{point.x.toFixed(1)} / {point.y.toFixed(1)} · {point.altitudeM} m · {point.speedKmh} km/h</small></div>
              ))}
            </div>
          </section>
          <div className="mission-checks">
            {checks.map(check => (
              <div
                key={check.id}
                className={`mission-check ${check.passed ? "check-pass" : check.severity === "blocking" ? "check-blocking" : "check-warning"}`}
              >
                <span>
                  {check.passed ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <AlertTriangle size={14} />
                  )}
                </span>
                <div>
                  <strong>{check.label}</strong>
                  <small>{check.message}</small>
                </div>
              </div>
            ))}
          </div>
          <div className="operation-actions">
            <button className="primary-button" onClick={approveMission}>
              <ShieldCheck size={15} /> Approuver la mission
            </button>
            <button
              className="secondary-button"
              onClick={() =>
                setSafeMode(
                  "safe-return",
                  "Commande opérateur · retour vers zone sûre"
                )
              }
            >
              Retour sûr
            </button>
            <button
              className="secondary-button"
              onClick={() =>
                setSafeMode(
                  "emergency-land",
                  "Commande opérateur · atterrissage d’urgence"
                )
              }
            >
              Atterrissage urgence
            </button>
          </div>
        </section>
        <aside className="panel operation-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">JOURNAL DE SESSION · LOCAL</p>
              <h3>Actions de cette session</h3>
            </div>
            <Activity size={16} className="muted-icon" />
          </div>
          <div className="operation-timeline">
            {events.map((event, index) => (
              <div key={`${event}-${index}`}>
                <span className="timeline-dot" />
                <span>{event}</span>
              </div>
            ))}
          </div>
          <div
            className="session-live-feed"
            aria-live="polite"
            aria-label="Flux continu de journaux système simulés"
          >
            <div className="session-live-heading">
              <span className="live-dot" />
              <strong>FLUX SYSTÈME CONTINU</strong>
              <small>{systemFeed.length} lignes · simulation locale</small>
            </div>
            <div className="session-live-rows">
              {systemFeed.map(item => (
                <div key={item.id} className={`session-live-row tone-${item.tone}`}>
                  <span className="event-pulse" />
                  <code>{item.at}</code>
                  <span>{item.line}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="inspector-note">
            <Info size={15} />
            <span>
              Aucun mode de mission ne peut sélectionner une cible humaine ou
              déclencher une action offensive. La perte de confiance impose un
              mode sûr.
            </span>
          </div>
        </aside>
      </div>
      <section className="panel reference-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">JOURNAL D’AUDIT · SERVEUR</p>
            <h3>Événements métier persistés</h3>
          </div>
          <span className="calculated-badge">
            {auditQuery.data?.length ?? 0} événements
          </span>
        </div>
        {!auditQuery.data?.length ? (
          <p className="section-description">
            {remoteReady
              ? "Aucun événement métier enregistré pour ce projet."
              : "Journal serveur indisponible : les actions locales ne sont pas présentées comme persistées."}
          </p>
        ) : (
          <div className="operation-timeline">
            {auditQuery.data.map(event => (
              <div key={event.id}>
                <span className="timeline-dot" />
                <span>
                  <strong>{event.eventType}</strong> ·{" "}
                  {JSON.stringify(event.payload)}
                  <small>
                    {" "}
                    · {new Date(event.createdAt).toLocaleString("fr-FR")}
                  </small>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">ESPACE DE TRAVAIL</p>
            <h3>
              {remoteReady ? "Espace métier connecté" : "Mode brouillon local"}
            </h3>
          </div>
          <span className="builder-status">
            <span className="live-dot" /> {localState}
          </span>
        </div>
        <p className="section-description">
          {remoteReady
            ? "Le projet, ses versions, runs, rapports et événements métier sont enregistrés sur le backend. Les animations de vol restent des démonstrations visuelles."
            : "Les modifications sont conservées dans le navigateur uniquement. Aucune synchronisation distante n’est active et les données ne sont pas partagées entre utilisateurs."}
        </p>
      </section>
      <div className="system-actions">
        <button
          className="secondary-button"
          onClick={() => {
            setLocalState("Actualisation en cours…");
            window.setTimeout(
              () => setLocalState("Session locale active"),
              350
            );
            onRefreshSystem();
          }}
        >
          <RefreshCw size={14} /> Actualiser le système
        </button>
        <button className="secondary-button" onClick={onResetWorkspace}>
          <RotateCcw size={14} /> Effacer le cache local
        </button>
      </div>
      <TestFlightCoordinator />
      <IdentityConnections />
    </div>
  );
}

function ProjectGateCard({
  onCreate,
  onCatalog,
}: {
  onCreate: () => void;
  onCatalog?: () => void;
}) {
  return (
    <section
      className="project-gate-card project-gate-console"
      aria-labelledby="project-gate-title"
    >
      <header className="project-gate-console-bar">
        <div className="project-gate-console-crumb">
          <span className="console-led" /> AEROMIND / ESPACE PROJET /
          CONFIGURATION
        </div>
        <div className="project-gate-console-meta">
          <span>WORKSPACE 00.01</span>
          <span>LOCAL DRAFT</span>
          <span>NO FLIGHT OUTPUT</span>
        </div>
      </header>
      <div className="project-gate-console-frame">
        <aside className="project-gate-console-rail">
          <div className="console-rail-brand">
            <span>A</span>
            <small>CONFIG</small>
          </div>
          <div className="console-rail-step is-active">
            <b>01</b>
            <span>Brief</span>
          </div>
          <div className="console-rail-step">
            <b>02</b>
            <span>Profil</span>
          </div>
          <div className="console-rail-step">
            <b>03</b>
            <span>Critères</span>
          </div>
          <div className="console-rail-step">
            <b>04</b>
            <span>Maquette</span>
          </div>
          <div className="console-rail-bottom">
            <Settings2 size={15} />
            <span>PRÉFÉRENCES</span>
          </div>
        </aside>
        <main className="project-gate-console-main">
          <div className="project-gate-console-heading">
            <div>
              <p className="eyebrow">INITIALISATION GUIDÉE · ÉTAPE 01 / 04</p>
              <h1 id="project-gate-title">
                Configurer un espace de conception.
              </h1>
              <p>
                Commencez par une intention, puis laissez AeroMind organiser la
                géométrie, les exigences et la construction. Aucun drone n’est
                présélectionné.
              </p>
            </div>
            <div className="console-progress">
              <span>PROGRESSION</span>
              <strong>00%</strong>
              <i>
                <b />
              </i>
            </div>
          </div>
          <div className="project-gate-console-grid">
            <section
              className="console-viewport"
              aria-label="Aperçu de configuration vierge"
            >
              <div className="console-panel-label">
                <span>
                  <Orbit size={13} /> CONFIGURATION VIERGE
                </span>
                <small>APERÇU GÉNÉRATIF</small>
              </div>
              <div className="console-viewport-stage">
                <div className="console-stage-grid" />
                <div className="console-stage-orbit orbit-one" />
                <div className="console-stage-orbit orbit-two" />
                <div className="console-stage-crosshair" />
                <div className="console-stage-placeholder">
                  <span>
                    <Box size={22} />
                  </span>
                  <strong>ARCHITECTURE À DÉFINIR</strong>
                  <small>
                    La géométrie apparaîtra ici après votre sélection ou votre
                    brief.
                  </small>
                </div>
                <span className="stage-tag stage-tag-a">NO PROFILE</span>
                <span className="stage-tag stage-tag-b">PARAMETRIC READY</span>
                <span className="stage-axis">X 000 · Y 000 · Z 000</span>
              </div>
              <div className="console-viewport-footer">
                <span>
                  <i className="console-led" /> CANVAS READY
                </span>
                <span>VUE ISOMÉTRIQUE · UNITÉS SI</span>
              </div>
            </section>
            <aside className="console-config-panel">
              <div className="console-config-title">
                <div>
                  <p className="eyebrow">CONFIGURATION INITIALE</p>
                  <h3>Point de départ</h3>
                </div>
                <Sparkles size={16} />
              </div>
              <button
                className="console-option-card is-primary"
                type="button"
                onClick={onCreate}
              >
                <span>
                  <Plus size={16} />
                </span>
                <div>
                  <strong>Projet vierge</strong>
                  <small>Définir mission et contraintes manuellement</small>
                </div>
                <ArrowRight size={15} />
              </button>
              {onCatalog && (
                <button
                  className="console-option-card"
                  type="button"
                  onClick={onCatalog}
                >
                  <span>
                    <Package size={16} />
                  </span>
                  <div>
                    <strong>Bibliothèque drones</strong>
                    <small>Parcourir les architectures disponibles</small>
                  </div>
                  <ArrowRight size={15} />
                </button>
              )}
              <div className="console-config-divider">
                <span>OU DÉCRIVEZ VOTRE INTENTION</span>
              </div>
              <label className="console-brief-field">
                <span>BRIEF DE MISSION</span>
                <textarea
                  placeholder="Ex. inspection, cartographie, secours…"
                  rows={3}
                />
                <small>
                  Le brief restera une hypothèse jusqu’à sa validation.
                </small>
              </label>
              <button
                className="console-suggest-button"
                type="button"
                onClick={onCreate}
              >
                <Sparkles size={14} /> Générer une base de configuration{" "}
                <ArrowRight size={14} />
              </button>
            </aside>
          </div>
          <div className="console-readiness-grid">
            <div className="console-readiness-card">
              <span>
                <ClipboardCheck size={15} />
              </span>
              <div>
                <small>EXIGENCES</small>
                <strong>Prêtes à instancier</strong>
              </div>
              <b>—</b>
            </div>
            <div className="console-readiness-card">
              <span>
                <Ruler size={15} />
              </span>
              <div>
                <small>GÉOMÉTRIE</small>
                <strong>En attente de profil</strong>
              </div>
              <b>—</b>
            </div>
            <div className="console-readiness-card">
              <span>
                <BatteryCharging size={15} />
              </span>
              <div>
                <small>ÉNERGIE</small>
                <strong>À paramétrer</strong>
              </div>
              <b>—</b>
            </div>
            <div className="console-readiness-card">
              <span>
                <ShieldCheck size={15} />
              </span>
              <div>
                <small>CONTRÔLE</small>
                <strong>Barrière active</strong>
              </div>
              <b className="is-good">OK</b>
            </div>
          </div>
        </main>
      </div>
      <footer className="project-gate-console-footer">
        <span>
          <Database size={13} /> BROUILLON LOCAL DISPONIBLE
        </span>
        <span>ÉDITION · SIMULATION · REVUE HUMAINE</span>
        <span>
          <span className="console-led" /> AUCUNE COMMANDE PHYSIQUE
        </span>
      </footer>
    </section>
  );
}
function ProjectRequiredGate({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="empty-workspace project-required-gate">
      <ProjectGateCard onCreate={onCreate} />
    </div>
  );
}

function EmptyWorkspace({
  onCreate,
  onCatalog,
}: {
  onCreate: () => void;
  onCatalog: () => void;
}) {
  return (
    <div className="empty-workspace project-required-gate">
      <ProjectGateCard onCreate={onCreate} onCatalog={onCatalog} />
    </div>
  );
}

function requirementsForDroneProfile(
  design: DroneCatalogDesign
): Requirement[] {
  const architecture = design.family;
  const mission = design.mission;
  const isFixedWing = design.key === "fixed-wing";
  const isVtol = design.key === "vtol";
  const count = design.configuration.motorCount ?? (isFixedWing ? 1 : 4);
  const battery = design.configuration.batteryWh ?? 0;
  return [
    {
      id: `profile-${design.id}-mission`,
      label: "Mission et usage autorisé",
      value: mission,
      unit: "brief",
      target: "Mission documentée, non offensive et validée par un opérateur.",
      status: "review",
      source: `Profil ${design.label}`,
      visible: true,
      pinned: true,
      approved: false,
      verification:
        "Relire le brief, les rôles opérateur et les limites de l’usage prévu.",
      missionProfileId: design.id,
    },
    {
      id: `profile-${design.id}-geometry`,
      label: "Géométrie de référence",
      value: `${design.configuration.wingspan ?? "—"} × ${design.configuration.fuselageLength ?? "—"}`,
      unit: "m",
      target: `${architecture} · envergure et longueur à confirmer avec la fiche de configuration.`,
      status: "review",
      source: `Paramètres ${design.label}`,
      visible: true,
      pinned: false,
      approved: false,
      verification:
        "Comparer les cotes du modèle avec la documentation ou la mesure de la maquette.",
      missionProfileId: design.id,
    },
    {
      id: `profile-${design.id}-propulsion`,
      label: "Propulsion et redondance",
      value: count,
      unit: "moteur(s)",
      target: isFixedWing
        ? "Propulsion dimensionnée pour le profil de croisière."
        : isVtol
          ? "Transition et poussée verticale à vérifier."
          : "Poussée nominale et marge de sécurité à vérifier.",
      status: "review",
      source: `Configuration ${design.label}`,
      visible: true,
      pinned: false,
      approved: false,
      verification:
        "Contrôler nombre de moteurs, diamètre, puissance, redondance et comportement en perte d’un élément.",
      missionProfileId: design.id,
    },
    {
      id: `profile-${design.id}-energy`,
      label: "Énergie et autonomie",
      value: battery,
      unit: "Wh",
      target:
        "Autonomie calculée avec réserve explicite et essai de qualification à planifier.",
      status: "hypothesis",
      source: `Batterie paramétrée ${design.label}`,
      visible: true,
      pinned: false,
      approved: false,
      verification:
        "Recalculer avec masse, vent, température et réserve de mission documentés.",
      missionProfileId: design.id,
    },
  ];
}

export default function Home() {
  const initialState = useMemo(readPersistedState, []);
  const { language, setLanguage, t, tKey } = useLanguage();
  const [workbenchCapture, setWorkbenchCapture] = useState(() => {
    try { return window.localStorage.getItem("aeromind-workbench-capture") ?? ""; }
    catch { return ""; }
  });
  useEffect(() => {
    const receiveCapture = (event: Event) => setWorkbenchCapture((event as CustomEvent<string>).detail ?? "");
    window.addEventListener("aeromind-workbench-capture", receiveCapture);
    return () => window.removeEventListener("aeromind-workbench-capture", receiveCapture);
  }, []);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    let cancelled = false;
    const verifySession = async () => {
      try {
        const response = await fetch("/api/auth/oidc/me", { credentials: "include", headers: bearerHeaders() });
        if (!cancelled) setSessionUser(response.ok ? (await response.json() as SessionUser) : null);
      } catch {
        if (!cancelled) setSessionUser(null);
      }
    };
    void verifySession();
    const onSessionChanged = () => void verifySession();
    window.addEventListener("aeromind-auth-changed", onSessionChanged);
    return () => { cancelled = true; window.removeEventListener("aeromind-auth-changed", onSessionChanged); };
  }, []);
  const authQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const authenticatedUser = authQuery.data ?? sessionUser;
  const serverProjectsQuery = trpc.projects.list.useQuery(undefined, {
    enabled: Boolean(authenticatedUser),
    retry: false,
  });
  const createProjectOnServer = async (input: { project: ProjectState; config: ConceptConfig; requirements: Requirement[]; runId: string }): Promise<ProjectRecord> => {
    const response = await fetch("/api/trpc/projects.create", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...bearerHeaders() },
      body: JSON.stringify({ json: input }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body?.error?.json?.message || body?.error?.message || `API projets indisponible (${response.status})`;
      throw new Error(message);
    }
    const created = body?.result?.data?.json ?? body?.result?.data ?? body?.data ?? body;
    if (!created || typeof created !== "object" || !("id" in created) || !("project" in created) || !("config" in created) || !("requirements" in created) || !("runId" in created)) {
      throw new Error("Réponse API de création de projet invalide");
    }
    return created as ProjectRecord;
  };
  const saveSnapshotMutation = trpc.projects.saveSnapshot.useMutation();
  const deleteProjectMutation = trpc.projects.delete.useMutation();
  const restoreVersionMutation = trpc.designVersions.restore.useMutation();
  const createSimulationMutation = trpc.simulationRuns.create.useMutation();
  const createReportMutation = trpc.reports.create.useMutation();
  const submitReportMutation = trpc.reports.submit.useMutation();
  const serverHydrated = useRef(false);
  const localServerHydrated = useRef(false);
  const skipServerSave = useRef(false);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const suppressSyncBroadcast = useRef(false);
  const lastWorkspaceUpdatedAt = useRef<string>("");
  const initialProjectId = initialState.activeProjectId ?? "";
  const initialProjects = initialState.projects?.length
    ? initialState.projects
    : [];
  const [projects, setProjects] = useState<ProjectRecord[]>(initialProjects);
  const [activeProjectId, setActiveProjectId] = useState(initialProjectId);
  const serverRunsQuery = trpc.simulationRuns.list.useQuery(activeProjectId, {
    enabled: Boolean(
      authenticatedUser &&
        serverProjectsQuery.isSuccess &&
        !activeProjectId.startsWith("project-")
    ),
    retry: false,
  });
  const serverVersionsQuery = trpc.designVersions.list.useQuery(
    activeProjectId,
    {
      enabled: Boolean(
        authenticatedUser &&
          serverProjectsQuery.isSuccess &&
          !activeProjectId.startsWith("project-")
      ),
      retry: false,
    }
  );
  const serverReportsQuery = trpc.reports.list.useQuery(activeProjectId, {
    enabled: Boolean(
      authenticatedUser &&
        serverProjectsQuery.isSuccess &&
        !activeProjectId.startsWith("project-")
    ),
    retry: false,
  });
  const [project, setProject] = useState<ProjectState>(initialState.project);
  const [requirements, setRequirements] = useState<Requirement[]>(
    initialState.requirements
  );
  const [config, setConfig] = useState<ConceptConfig>(initialState.config);
  useEffect(() => {
    const normalized = normalizeLegacyStudioLayers(config);
    if (normalized !== config) setConfig(normalized);
  }, [config]);
  const [runId, setRunId] = useState(initialState.runId);
  const [workflowRun, setWorkflowRun] = useState<WorkflowRun | null>(null);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [activeView, setActiveView] = useState<ViewId>(() => {
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView === "materials") return "materials";
    if (requestedView === "satellite-nav") return "satellite-nav";
    if (requestedView === "digital-twin" || requestedView === "tools" || requestedView === "inspector") return "digital-twin";
    if (requestedView === "live") return "live";
    if (requestedView === "simulation") return "simulation";
    if (requestedView === "mission-center") return "mission-center";
    return "overview";
  });
  const [selectedComponent, setSelectedComponent] = useState("fuselage");
  const [rotation, setRotation] = useState(0);
  const [rotationX, setRotationX] = useState(52);
  const [rotationY, setRotationY] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [actions, setActions] = useState<Record<string, ActionState>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showAdvancedNav, setShowAdvancedNav] = useState(false);
  // État global d'armement virtuel : il suit l'interface entière (barre
  // supérieure, poste de commandement, couches de vision) et ne peut jamais
  // autoriser une sortie matérielle.
  const [simulationArmed, setSimulationArmed] = useState(false);
  const [createProjectDialogOpen, setCreateProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved"
  );
  const [syncNotice, setSyncNotice] = useState("");
  const simulation = useMemo(
    () => runSimulation(config, requirements, runId),
    [config, requirements, runId]
  );
  const engineeringSyncHealth = useMemo(
    () => evaluateEngineeringSync({ projectId: activeProjectId, config, requirements, runId, hasWorkflowRun: Boolean(workflowRun) }),
    [activeProjectId, config, requirements, runId, workflowRun]
  );
  useEffect(() => {
    if (authenticatedUser || localServerHydrated.current) return;
    // Aucun projet local distant n’est chargé implicitement : l’ouverture reste
    // vierge. La création et la restauration passent par une action explicite.
    localServerHydrated.current = true;
  }, [authenticatedUser, initialProjects.length]);
  useEffect(() => {
    if (
      !authenticatedUser ||
      !serverProjectsQuery.isSuccess ||
      serverHydrated.current
    )
      return;
    serverHydrated.current = true;
    skipServerSave.current = true;
    const remoteProjects =
      serverProjectsQuery.data as unknown as ProjectRecord[];
    setProjects(remoteProjects);
    const selected =
      remoteProjects.find(item => item.id === activeProjectId) ??
      remoteProjects[0];
    if (!selected) {
      setActiveProjectId("");
      setProject(emptyProject);
      setRequirements([]);
      setConfig(normalizeConcept(blankConcept));
      setRunId("SIM-000");
      return;
    }
    setActiveProjectId(selected.id);
    setProject(selected.project);
    setRequirements(selected.requirements);
    setConfig(normalizeConcept(selected.config));
    setRunId(selected.runId);
  }, [
    authenticatedUser,
    serverProjectsQuery.data,
    serverProjectsQuery.isSuccess,
    activeProjectId,
  ]);
  useEffect(() => {
    if (!activeProjectId) {
      setSaveState("saved");
      return;
    }
    setSaveState("saving");
    try {
      const currentRecord: ProjectRecord = {
        id: activeProjectId,
        project,
        requirements,
        config,
        runId,
      };
      const nextProjects = projects.map(item =>
        item.id === activeProjectId ? currentRecord : item
      );
      if (!nextProjects.some(item => item.id === activeProjectId))
        nextProjects.push(currentRecord);
      const payload = createWorkspaceSnapshot({
        ...currentRecord,
        projects: nextProjects,
        activeProjectId,
        source: "LOCAL",
        syncStatus: "LOCAL",
      });
      lastWorkspaceUpdatedAt.current = payload.updatedAt;
      setSyncNotice("");
      writeWorkspaceStorage(payload);
      if (suppressSyncBroadcast.current) {
        suppressSyncBroadcast.current = false;
      } else {
        publishWorkspaceMessage(syncChannelRef.current, {
          type: "workspace",
          payload,
        });
      }
      if (!authenticatedUser && localServerHydrated.current) {
        const timer = window.setTimeout(() => {
          void fetch("/api/local/workspace", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ workspace: payload }),
          })
            .then(response => {
              if (!response.ok) throw new Error("local workspace save failed");
              setSaveState("saved");
            })
            .catch(() => setSaveState("error"));
        }, 450);
        return () => window.clearTimeout(timer);
      }
      if (
        authenticatedUser &&
        serverProjectsQuery.isSuccess &&
        !activeProjectId.startsWith("project-")
      ) {
        if (skipServerSave.current) {
          skipServerSave.current = false;
          setSaveState("saved");
          return;
        }
        setSaveState("saving");
        const timer = window.setTimeout(() => {
          saveSnapshotMutation.mutate(
            { id: activeProjectId, project, requirements, config, runId },
            {
              onSuccess: () => {
                setSaveState("saved");
                void serverVersionsQuery.refetch();
              },
              onError: () => setSaveState("error"),
            }
          );
        }, 900);
        return () => window.clearTimeout(timer);
      }
      setSaveState("saved");
    } catch (error) {
      // Une donnée non conforme ou un stockage indisponible est visible :
      // aucun succès de façade ne doit masquer une perte de synchronisation.
      console.error("AeroMind: synchronisation refusée", error);
      setSaveState("error");
    }
  }, [
    project,
    requirements,
    config,
    runId,
    activeProjectId,
    projects,
    authenticatedUser,
    serverProjectsQuery.isSuccess,
    saveSnapshotMutation.mutate,
  ]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== WORKSPACE_KEY || !event.newValue) return;
      const parsed = parseWorkspaceMessage(event.newValue);
      if (!parsed.ok) {
        console.error("AeroMind: snapshot externe refusé", parsed.message);
        setSaveState("error");
        return;
      }
      if (lastWorkspaceUpdatedAt.current && parsed.workspace.updatedAt <= lastWorkspaceUpdatedAt.current) {
        setSyncNotice("Données remplacées par une modification plus récente");
        return;
      }
      lastWorkspaceUpdatedAt.current = parsed.workspace.updatedAt;
      try {
        const next = parsed.workspace as unknown as PersistedState;
        suppressSyncBroadcast.current = true;
        const nextProjects = (next.projects ?? []).filter(
          item => item.id !== "project-local-1" && item.id !== demoProjectId
        );
        setProjects(nextProjects);
        setActiveProjectId(
          nextProjects.length
            ? (next.activeProjectId ?? nextProjects[0].id)
            : ""
        );
        setProject(next.project);
        setRequirements(next.requirements);
        setConfig(normalizeConcept(next.config));
        setRunId(next.runId);
        setWorkspaceRevision(current => current + 1);
        setSaveState("saved");
      } catch (error) {
        console.error("AeroMind: application storage refusée", error);
        setSaveState("error");
      }
    };
    const applyExternalState = (raw: unknown) => {
      const parsed = parseWorkspaceMessage(raw);
      if (!parsed.ok) {
        console.error("AeroMind: message inter-onglets refusé", parsed.message);
        setSaveState("error");
        return;
      }
      if (lastWorkspaceUpdatedAt.current && parsed.workspace.updatedAt <= lastWorkspaceUpdatedAt.current) {
        setSyncNotice("Données remplacées par une modification plus récente");
        return;
      }
      lastWorkspaceUpdatedAt.current = parsed.workspace.updatedAt;
      try {
        const next = parsed.workspace as unknown as PersistedState;
        suppressSyncBroadcast.current = true;
        const nextProjects = (next.projects ?? []).filter(
          item => item.id !== "project-local-1" && item.id !== demoProjectId
        );
        setProjects(nextProjects);
        setActiveProjectId(
          nextProjects.length
            ? (next.activeProjectId ?? nextProjects[0].id)
            : ""
        );
        setProject(next.project);
        setRequirements(next.requirements ?? []);
        setConfig(normalizeConcept(next.config));
        setRunId(next.runId);
        setWorkspaceRevision(current => current + 1);
        setSaveState("saved");
      } catch (error) {
        console.error("AeroMind: application inter-onglets refusée", error);
        setSaveState("error");
      }
    };
    const channel = createWorkspaceChannel();
    syncChannelRef.current = channel;
    channel?.addEventListener("message", event => {
      if (event.data?.type === "workspace" && event.data.payload) {
        applyExternalState(event.data);
      } else if (event.data && !event.data.type) {
        // Compatibilité avec les brouillons émis par les versions précédentes.
        applyExternalState(event.data);
      }
    });
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.close();
      syncChannelRef.current = null;
    };
  }, []);
  const snapshotCurrent = (): ProjectRecord => ({
    id: activeProjectId,
    project,
    requirements,
    config,
    runId,
  });
  const selectProject = (id: string) => {
    const target = projects.find(item => item.id === id);
    if (!target || id === activeProjectId) return;
    setProjects(current =>
      current.map(item =>
        item.id === activeProjectId ? snapshotCurrent() : item
      )
    );
    setActiveProjectId(id);
    setProject(target.project);
    setRequirements(target.requirements);
    setConfig(normalizeConcept(target.config));
    setRunId(target.runId);
    setActiveView("overview");
  };
  const createProject = () => {
    if (!authenticatedUser) {
      setAction("project", {
        status: "error",
        message: "Connectez-vous avant de créer un projet.",
        retry: () => window.location.assign("/api/auth/oidc/login"),
      });
      return;
    }
    setNewProjectName(`Nouveau projet ${projects.length + 1}`);
    setCreateProjectDialogOpen(true);
  };
  const confirmCreateProject = async () => {
    if (!authenticatedUser) {
      setCreateProjectDialogOpen(false);
      setAction("project", {
        status: "error",
        message: "Connectez-vous avant de créer un projet.",
        retry: () => window.location.assign("/api/auth/oidc/login"),
      });
      return;
    }
    const requestedName = newProjectName;
    setCreateProjectDialogOpen(false);
    const id = `project-${Date.now()}`;
    const initialRequirements: Requirement[] = [];
    let fresh: ProjectRecord = {
      id,
      project: {
        ...defaultProject,
        name: requestedName.trim() || `Nouveau projet ${projects.length + 1}`,
        mission: "",
      },
      requirements: initialRequirements,
      config: normalizeConcept({
        ...blankConcept,
        missionBrief: "",
      }),
      runId: "SIM-000",
    };
    let serverCreateFailed = false;
    if (authenticatedUser) {
      try {
        const created = await createProjectOnServer({
          project: fresh.project,
          config: fresh.config,
          requirements: fresh.requirements,
          runId: fresh.runId,
        });
        if (
          !created ||
          typeof created !== "object" ||
          !("id" in created) ||
          !("project" in created) ||
          !("config" in created) ||
          !("requirements" in created) ||
          !("runId" in created)
        ) {
          throw new Error("API métier sans persistance de projet configurée");
        }
        fresh = created as unknown as ProjectRecord;
        skipServerSave.current = true;
        void serverProjectsQuery.refetch();
      } catch {
        serverCreateFailed = true;
        setAction("project", {
          status: "error",
          message:
            "L’API métier est indisponible. Le projet reste un brouillon local non synchronisé.",
        });
      }
    }
    setProjects(current => [
      ...current.map(item =>
        item.id === activeProjectId ? snapshotCurrent() : item
      ),
      fresh,
    ]);
    setActiveProjectId(fresh.id);
    setProject(fresh.project);
    setRequirements(fresh.requirements);
    setConfig(fresh.config);
    setRunId(fresh.runId);
    setActiveView("overview");
    setAction("project", {
      status: serverCreateFailed ? "error" : "success",
      message: serverCreateFailed
        ? "L’API métier est indisponible. Le projet reste un brouillon local non synchronisé."
        : authenticatedUser && serverProjectsQuery.isSuccess
          ? `${fresh.project.name} créé dans l’espace métier.`
          : `${fresh.project.name} créé comme brouillon local.`,
    });
  };
  const deleteProject = async () => {
    if (
      !window.confirm(
        `Supprimer le projet « ${project.name} » ? Les versions, simulations, rapports et événements d’audit associés seront également supprimés.`
      )
    )
      return;
    const isRemoteProject = Boolean(
      authenticatedUser &&
        serverProjectsQuery.isSuccess &&
        !activeProjectId.startsWith("project-")
    );
    if (isRemoteProject) {
      try {
        await deleteProjectMutation.mutateAsync(activeProjectId);
        void serverProjectsQuery.refetch();
      } catch {
        setAction("project", {
          status: "error",
          message:
            "Suppression non confirmée par le serveur. Le projet a été conservé.",
        });
        return;
      }
    }
    if (projects.length === 1) {
      setProjects([]);
      window.localStorage.removeItem(WORKSPACE_KEY);
      setActiveProjectId("");
      setProject(emptyProject);
      setRequirements([]);
      setConfig(normalizeConcept(blankConcept));
      setRunId("SIM-000");
      setActiveView("overview");
      setAction("project", {
        status: "success",
        message: isRemoteProject
          ? "Projet et données associées supprimés de l’espace métier."
          : "Brouillon local supprimé. L’espace est maintenant vide.",
      });
      return;
    }
    const remaining = projects.filter(item => item.id !== activeProjectId);
    const target = remaining[0];
    setProjects(remaining);
    setActiveProjectId(target.id);
    setProject(target.project);
    setRequirements(target.requirements);
    setConfig(normalizeConcept(target.config));
    setRunId(target.runId);
    setActiveView("overview");
    setAction("project", {
      status: "success",
      message: isRemoteProject
        ? `Projet supprimé. ${target.project.name} est maintenant actif.`
        : `Brouillon local supprimé. ${target.project.name} est maintenant actif.`,
    });
  };
  const restoreDesignVersion = async (versionId: number) => {
    if (
      !authenticatedUser ||
      !serverProjectsQuery.isSuccess ||
      !!activeProjectId.startsWith("project-")
    )
      return;
    try {
      const restored = (await restoreVersionMutation.mutateAsync({
        id: activeProjectId,
        versionId,
      })) as unknown as ProjectRecord;
      setProjects(current =>
        current.map(item => (item.id === restored.id ? restored : item))
      );
      setProject(restored.project);
      setRequirements(restored.requirements);
      setConfig(normalizeConcept(restored.config));
      setRunId(restored.runId);
      skipServerSave.current = true;
      void serverProjectsQuery.refetch();
      void serverVersionsQuery.refetch();
      void serverRunsQuery.refetch();
      setAction("simulation", {
        status: "success",
        message: `Version restaurée sans écraser l’historique; nouvel instantané créé.`,
      });
    } catch {
      setAction("simulation", {
        status: "error",
        message:
          "Restauration impossible; la version historique est conservée.",
      });
    }
  };
  const setAction = (id: string, action: ActionState) =>
    setActions(current => ({ ...current, [id]: action }));
  const runSimulationNow = () => {
    if (isRunning) return;
    if (!config.airframe || !config.motorCount) return;
    const simulationConfig = config;

    setIsRunning(true);
    setAction("simulation", {
      status: "loading",
      message: "Simulation modulaire en cours…",
    });
    window.setTimeout(async () => {
      try {
        const localRunId = nextLocalSimulationRunId(runId);
        setProject(previous => ({
          ...previous,
          lastUpdated: new Date().toLocaleString("fr-FR"),
          version: APP_VERSION,
        }));
        if (
          authenticatedUser &&
          serverProjectsQuery.isSuccess &&
          !activeProjectId.startsWith("project-")
        ) {
          const persisted = await createSimulationMutation.mutateAsync({
            id: activeProjectId,
            project,
            config: simulationConfig,
            requirements,
            result: {
              ...runSimulation(simulationConfig, requirements, localRunId),
              runId: localRunId,
            },
            engineVersion: APP_VERSION,
          });
          setRunId(persisted.runId);
          void serverProjectsQuery.refetch();
          void serverRunsQuery.refetch();
          void serverVersionsQuery.refetch();
          skipServerSave.current = true;
          setAction("simulation", {
            status: "success",
            message: `Simulation ${persisted.runId} enregistrée · version ${persisted.version} · entrées et résultats persistés.`,
          });
        } else {
          setRunId(localRunId);
          setAction("simulation", {
            status: "success",
            message: `Estimation ${localRunId} calculée localement; aucun run n’a été persisté côté serveur.`,
          });
        }
      } catch {
        setAction("simulation", {
          status: "error",
          message:
            "Le run n’a pas pu être persisté. Les résultats locaux précédents sont conservés; vérifiez la connexion et réessayez.",
          retry: runSimulationNow,
        });
      } finally {
        setIsRunning(false);
      }
    }, 650);
  };
  const applyIndustrialReference = (reference: IndustrialDroneReference) => {
    const canonical = industrialReferenceToDesign(reference);
    const selectedAt = new Date().toISOString();
    setConfig(current => normalizeConcept({
      ...current,
      ...(!current.airframe && !current.engineeringSelection?.droneId ? {
        windSpeedKmh: 8,
        altitudeM: 120,
        reserveFraction: defaultConcept.reserveFraction,
      } : {}),
      ...canonical.configuration,
      airframe: canonical.key,
      modelType: canonical.modelType,
      designName: canonical.label,
      platformProfile: canonical.id,
      constructionMassKg: 0,
      installedMaterials: [],
      customSketch: undefined,
      engineeringSelection: {
        source: "industrial",
        droneId: canonical.id,
        droneLabel: canonical.label,
        updatedAt: selectedAt,
      },
    }));
    setRequirements([
      {
        id: `industrial-${reference.id}-documentation`,
        label: "Documentation constructeur",
        value: reference.certification,
        unit: "statut",
        target: "Source officielle conservée et niveau documentaire vérifié.",
        status: "review",
        source: reference.sourceLabel,
        visible: true,
        pinned: true,
        approved: false,
        verification:
          "Ouvrir la source officielle et archiver les références utilisées.",
      },
      {
        id: `industrial-${reference.id}-geometry`,
        label: "Dimensions publiées",
        value: reference.dimensions,
        unit: "géométrie",
        target: "Cotes cohérentes avec la maquette chargée.",
        status: "review",
        source: reference.sourceLabel,
        visible: true,
        pinned: false,
        approved: false,
        verification:
          "Comparer les dimensions au modèle et signaler tout écart.",
      },
      {
        id: `industrial-${reference.id}-payload`,
        label: "Masse et charge utile",
        value: reference.payload,
        unit: "performance",
        target:
          "Masse maximale et charge utile utilisées comme références, non comme certification.",
        status: "hypothesis",
        source: reference.sourceLabel,
        visible: true,
        pinned: false,
        approved: false,
        verification: "Requalifier avec la configuration réellement assemblée.",
      },
    ]);
    setProject(previous => ({
      ...previous,
      status: "Référence industrielle chargée",
      lastUpdated: new Date().toLocaleString("fr-FR"),
    }));
    setWorkspaceRevision(value => value + 1);
    setActiveView("digital-twin");
    setAction("catalog", {
      status: "success",
      message: `${reference.model} chargé : configuration, géométrie et certification documentaire synchronisées.`,
    });
  };
  const updateRequirement = (
    id: string,
    field: keyof Requirement,
    value: string | number
  ) => {
    setRequirements(current =>
      current.map(requirement => {
        if (requirement.id !== id) return requirement;
        const next = { ...requirement, [field]: value };
        if (
          field === "value" &&
          typeof value === "number" &&
          id === "endurance" &&
          value > simulation.enduranceH
        )
          next.status = "review";
        return next;
      })
    );
  };
  const toggleRequirement = (
    id: string,
    field: "visible" | "pinned" | "approved"
  ) => {
    setRequirements(current =>
      current.map(requirement =>
        requirement.id === id
          ? { ...requirement, [field]: !requirement[field] }
          : requirement
      )
    );
  };
  const deleteRequirement = (id: string) => {
    setRequirements(current =>
      current.filter(requirement => requirement.id !== id)
    );
  };
  const applyMissionTemplate = (
    templateId: string,
    mode: "append" | "replace"
  ) => {
    const template = missionRequirementTemplates.find(
      item => item.id === templateId
    );
    if (!template) return;
    if (
      mode === "replace" &&
      requirements.length > 0 &&
      !window.confirm(
        `Remplacer les ${requirements.length} exigences du projet par les ${template.requirements.length} critères du profil « ${template.label} » ?`
      )
    )
      return;
    const nextRequirements = template.requirements.map(item => ({
      ...item,
      visible: true,
      approved: false,
      pinned: false,
      missionProfileId: template.id,
    }));
    if (mode === "replace") setRequirements(nextRequirements);
    else
      setRequirements(current => {
        const existingIds = new Set(current.map(item => item.id));
        return [
          ...current,
          ...nextRequirements.filter(item => !existingIds.has(item.id)),
        ];
      });
    setConfig(current => ({ ...current, missionBrief: template.mission }));
    setProject(current => ({
      ...current,
      mission: template.mission,
      version: APP_VERSION,
      lastUpdated: new Date().toLocaleString("fr-FR"),
    }));
    setAction("requirements", {
      status: "success",
      message:
        mode === "replace"
          ? `Profil « ${template.label} » chargé; ses critères restent à vérifier par l’équipe.`
          : `Critères du profil « ${template.label} » ajoutés sans remplacer les exigences existantes.`,
    });
  };
  const addRequirement = () => {
    const id = `custom-${Date.now()}`;
    setRequirements(current => [
      ...current,
      {
        id,
        label: "Nouvelle exigence à personnaliser",
        value: 0,
        unit: "SI",
        target: "À définir",
        status: "hypothesis",
        source: "Ajout utilisateur",
        visible: true,
        pinned: false,
        approved: false,
      },
    ]);
  };
  const duplicateConcept = () => {
    setConfig(current => ({
      ...current,
      designName: `${current.designName ?? "ATLAS"} / copie`,
    }));
    setProject(previous => ({
      ...previous,
      version: APP_VERSION,
      lastUpdated: new Date().toLocaleString("fr-FR"),
    }));
  };
  const resetEntireWorkspace = () => {
    if (
      !window.confirm(
        "Effacer le cache de projets de ce navigateur ? Les données enregistrées sur le serveur ne seront pas supprimées."
      )
    )
      return;
    if (authenticatedUser) {
      window.localStorage.removeItem(WORKSPACE_KEY);
      setAction("project", {
        status: "success",
        message:
          "Cache local effacé. Les projets serveur et leur historique sont conservés.",
      });
      return;
    }
    window.localStorage.removeItem(WORKSPACE_KEY);
    setProjects([]);
    setActiveProjectId("");
    setProject(defaultProject);
    setRequirements([]);
    setConfig(normalizeConcept(blankConcept));
    setRunId("SIM-000");
    setWorkspaceRevision(value => value + 1);
    setActiveView("overview");
  };
  const resetScenario = () => {
    setAction("scenario", {
      status: "loading",
      message: "Restauration de la configuration de référence…",
    });
    setProject(defaultProject);
    setRequirements([]);
    setConfig(
      normalizeConcept({
        ...blankConcept,
        reserveFraction: defaultConcept.reserveFraction,
        constructionMassKg: 0,
      })
    );
    setRunId("SIM-000");
    setWorkspaceRevision(value => value + 1);
    setActiveView("overview");
    setSelectedComponent("fuselage");
    setRotation(0);
    setRotationX(52);
    setRotationY(0);
    setZoom(0);
    setAction("scenario", {
      status: "success",
      message: "Configuration de référence restaurée.",
    });
  };
  const exportReport = async () => {
    setAction("report", {
      status: "loading",
      message: "Génération du rapport technique…",
    });
    try {
      const constructionRows = (config.installedMaterials ?? []).length
        ? (config.installedMaterials ?? [])
            .map(
              item =>
                `| ${item.label} | ${item.use} | ${formatNumber(item.massKg, 2)} kg | ${item.quantity ?? 1} | ${item.catalogSource === "manufacturer" ? "Fabricant" : "Concept / saisie"} |`
            )
            .join("\\n")
        : "| Aucun composant déclaré | — | — | — | À renseigner |";
      const waypointRows = (config.missionPlan?.waypoints ?? []).length
        ? (config.missionPlan?.waypoints ?? [])
            .map(
              point =>
                `- **${point.name}** · altitude ${point.altitudeM} m · vitesse ${point.speedKmh} km/h · action ${point.action}`
            )
            .join("\\n")
        : "- Aucun waypoint déclaré.";
      const captured = (() => { try { return window.localStorage.getItem("aeromind-workbench-capture") ?? ""; } catch { return ""; } })();
      const report = `# AeroMind AI — Dossier de revue technique ${simulation.runId}\n\n## 0. Fiche de décision\n\n**Projet :** ${project.name}\n**Mission :** ${project.mission}\n**Statut de conception :** ${project.status}\n**Version :** ${project.version}\n**Généré le :** ${new Date(simulation.generatedAt).toLocaleString("fr-FR")}\n\n> **Conclusion préliminaire :** la configuration est exploitable pour une campagne de simulation et une revue humaine. Elle ne constitue pas une autorisation de vol, une certification ou une preuve de performance physique.\n\n## 1. Résumé exécutif\n\nMasse estimée : **${formatNumber(simulation.totalMassKg)} kg**. Autonomie calculée : **${formatNumber(simulation.enduranceH)} h**. Rayon théorique : **${formatNumber(simulation.rangeKm, 0)} km**. Confiance du modèle : **${simulation.confidence}**.\n\n**Architecture active :** ${config.airframe ?? "non définie"} · ${config.motorCount ?? "—"} moteur(s) · charge utile ${formatNumber(config.payloadKg)} kg.\n\n## 2. Configuration et hypothèses d’entrée\n\n| Paramètre | Valeur | Statut |\n| --- | ---: | --- |\n| Envergure | ${formatNumber(config.wingspan, 2)} m | calculée |\n| Corde | ${formatNumber(config.chord, 2)} m | calculée |\n| Fuselage | ${formatNumber(config.fuselageLength, 2)} m | calculée |\n| Batterie | ${formatNumber(config.batteryWh, 0)} Wh | à qualifier |\n| Vitesse de croisière | ${formatNumber(config.cruiseSpeedKmh, 0)} km/h | entrée projet |\n| Vent de référence | ${formatNumber(config.windSpeedKmh, 0)} km/h | hypothèse |\n| Réserve énergétique | ${formatNumber(config.reserveFraction * 100, 0)} % | exigence de prudence |\n| Exigences suivies | ${requirements.length} | traçabilité locale |\n\n## 3. Dossier de construction / nomenclature complète\n\n**Profil de plateforme :** ${config.platformProfile ?? "non défini"}\n**Famille matériau :** ${config.materialFamily ?? "non définie"}\n**Type d’assemblage :** ${config.jointType ?? "non défini"}\n**Intégration charge utile :** ${config.payloadIntegration ?? "non définie"}\n**Position moteur :** ${config.motorPosition ?? "non définie"}\n**Masse de construction déclarée :** ${formatNumber(config.constructionMassKg ?? 0)} kg\n\n| Élément | Fonction | Masse unitaire | Quantité | Provenance |\n| --- | --- | ---: | ---: | --- |\n${constructionRows}\n\n## 4. Propulsion, commande, avionique et mission\n\n- **Propulsion :** ${config.motorCount ?? "—"} moteur(s), hélice/rotor Ø ${formatNumber(config.propDiameter, 2)} m.\n- **Mode de commande :** ${config.flightControls?.mode ?? "non défini"}; throttle nominal ${config.flightControls?.throttlePct ?? "—"} %.\n- **Limite servo :** ${config.flightControls?.servoLimitDeg ?? "—"}°; vitesse servo ${config.flightControls?.servoRateDegPerSec ?? "—"}°/s.\n- **Plan mission :** ${config.missionPlan?.waypoints.length ?? 0} waypoint(s), rayon ${config.missionPlan?.radiusKm ?? "—"} km.\n\n${waypointRows}\n\n## 5. Résultats calculés et décision associée\n\n${simulation.metrics.map(metric => `- **${metric.label}** : ${formatNumber(metric.value, metric.unit === "km" || metric.unit === "%" ? 0 : 1)} ${metric.unit} · cible ${metric.target} · marge ${metric.margin} · **${metricStatusLabel[metric.status]}**`).join("\\n")}\n\n## 6. Gates de préparation\n\n${requirements.length ? requirements.map(requirement => `- [${requirement.status === "ok" ? "x" : " "}] ${requirement.label} — ${statusLabel[requirement.status]} · source ${requirement.source}`).join("\\n") : "- Aucune exigence projet n’est encore enregistrée."}\n\n## 7. Risques ouverts et plan de vérification\n\n${simulation.risks.length ? simulation.risks.map(risk => `- **${risk.label}** — mitigation : ${risk.mitigation} · sévérité ${risk.severity} · statut ${risk.status}`).join("\\n") : "- Aucun risque n’est remonté par le modèle courant."}\n\n**Séquence recommandée :**\n1. Rejouer la campagne virtuelle avec les perturbations nominales, vent et perte de liaison.\n2. Réconcilier masse, batterie, matériaux et charge utile avec les fiches fabricant ou mesures disponibles.\n3. Vérifier la nomenclature, les contraintes d’assemblage et la logique de retour sûr en lecture seule.\n4. Faire signer la revue par un ingénieur responsable avant tout essai au sol.\n\n## 8. Commandes sûres — simulation uniquement\n\n| Commande | Effet sûr | Condition de reprise |\n| --- | --- | --- |\n| PAUSE / HOLD | Figer le scénario virtuel et conserver son état ; aucune sortie matérielle. | Revue humaine avant reprise. |\n| ABORT SIM | Clore le run de simulation ; aucune action physique. | Lancer explicitement un nouveau run. |\n| CHECK LINK / BATTERY | Vérification en lecture seule des prérequis du scénario. | Traiter les alertes et consigner les preuves. |\n\nAucune commande de cette table n’est transmise à un aéronef ou à un actionneur physique.\n\n## 9. Méthode, provenance et limites\n\n- ${simulation.method}.\n- Les résultats proviennent du moteur déterministe local et du run **${simulation.runId}**.\n- Les valeurs non documentées restent des hypothèses ; elles ne doivent pas être présentées comme des mesures.\n- Ceci n’est ni une simulation CFD OpenFOAM, ni un essai, ni une certification.\n- Les fonctions d’armement, d’actionneur et de téléversement restent rejetées par la frontière de contrôle AeroMind.\n- Revue humaine obligatoire avant toute décision d’ingénierie.\n${captured ? `\n## 10. Capture du poste de construction\n\n![Capture AeroMind du poste de construction](${captured})\n\nRéférence visuelle uniquement : vérifier les cotes et matériels sur plans approuvés et fiches fabricant.\n` : "\n## 10. Capture du poste de construction\n\nAucune capture enregistrée. Utilisez « Capturer la vue » dans le jumeau mécanique, puis relancez l’export.\n"}`;
      let persistedReportId: string | number | undefined;
      if (
        authenticatedUser &&
        serverProjectsQuery.isSuccess &&
        !activeProjectId.startsWith("project-")
      ) {
        const authorizationCode = window.prompt(
          "Code personnel AeroMind requis pour envoyer officiellement ce rapport :"
        )?.trim();
        if (!authorizationCode) {
          setAction("report", {
            status: "error",
            message: "Envoi annulé : le code personnel AeroMind est obligatoire.",
            retry: exportReport,
          });
          return;
        }
        const stored = await createReportMutation.mutateAsync({
          id: activeProjectId,
          title: `Rapport technique ${simulation.runId}`,
          contentMarkdown: report,
        });
        persistedReportId = stored.id;
        await submitReportMutation.mutateAsync({
          id: String(stored.id),
          authorizationCode,
        });
        void serverReportsQuery.refetch();
      }
      const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `aeromind-${simulation.runId.toLowerCase()}-rapport.md`;
      anchor.click();
      URL.revokeObjectURL(url);
      setAction("report", {
        status: "success",
        message: persistedReportId
          ? `Rapport #${persistedReportId} enregistré, haché et téléchargé en Markdown.`
          : "Rapport Markdown téléchargé localement; aucune copie serveur n’a été créée.",
      });
    } catch {
      setAction("report", {
        status: "error",
        message: "Impossible d’exporter le rapport.",
        retry: exportReport,
      });
    }
  };
  const loadDroneExample = (
    design: DroneCatalogDesign,
    keepStudioOpen = false,
    navigateAfterLoad = true
  ) => {
    const airframe = design.key;
    const preset = architecturePresets[airframe];
    const profileMaterials = buildProfileMaterials(design);
    const selectedAt = new Date().toISOString();
    setConfig(current => normalizeConcept({
      ...current,
      ...(!current.airframe && !current.engineeringSelection?.droneId ? {
        windSpeedKmh: 8,
        reserveFraction: defaultConcept.reserveFraction,
        maxTakeoffKg: defaultConcept.maxTakeoffKg,
      } : {}),
      ...preset,
      ...design.configuration,
      airframe,
      modelType: design.modelType,
      platformProfile: design.id,
      designName: `${design.label} / variante de travail`,
      missionBrief: design.mission,
      customSketch: undefined,
      installedMaterials: profileMaterials,
      engineeringSelection: {
        source: "catalog",
        droneId: design.id,
        droneLabel: design.label,
        updatedAt: selectedAt,
      },
      constructionMassKg: profileMaterials.reduce(
        (sum, material) => sum + material.massKg * (material.quantity ?? 1),
        0
      ),
      flightControls: { ...defaultFlightControls },
      missionPlan: {
        ...defaultLocalMissionPlan,
        waypoints: defaultLocalMissionPlan.waypoints.map(item => ({ ...item })),
      },
    }));
    setRequirements(requirementsForDroneProfile(design));
    if (activeProjectId) {
      setProject(current => ({
        ...current,
        name: `${design.label} — projet de travail`,
        mission: design.mission,
        status: "Conception active",
        version: APP_VERSION,
        lastUpdated: new Date().toLocaleString("fr-FR"),
      }));
    }
    if (navigateAfterLoad) setActiveView(keepStudioOpen ? "design-studio" : "digital-twin");
    setAction("catalog", {
      status: "success",
      message: `${design.label} chargé après action humaine. Données synchronisées; ${requirementsForDroneProfile(design).length} exigences proposées, non approuvées et personnalisables dans Exigences.`,
    });
  };
  const activeLibraryProfile = config.engineeringSelection?.source !== "custom" && !hasDroneGeometry(config.customSketch?.strokes) && config.platformProfile
    ? findDroneProfile(config.platformProfile)
    : undefined;
  const activeLibraryDesign: DroneCatalogDesign | undefined = activeLibraryProfile
    ? {
        ...activeLibraryProfile,
        configuration: { ...activeLibraryProfile.configuration, ...config },
      }
    : undefined;
  const activeDroneLabel = hasDroneGeometry(config.customSketch?.strokes)
    ? config.engineeringSelection?.droneLabel ?? config.designName ?? "Drone personnalisé"
    : config.engineeringSelection?.source === "custom"
      ? "Aucun drone sélectionné"
      : config.engineeringSelection?.droneLabel ?? (config.platformProfile || config.airframe
        ? config.designName ?? config.platformProfile ?? config.airframe ?? "Drone actif"
        : "Aucun drone sélectionné");
  const viewTitle = activeView === "overview"
    ? tKey("home.screen.title")
    : activeView === "tools" || activeView === "inspector"
      ? "Digital Twin Explorer"
      : t(navItems.find(item => item.id === activeView)?.label ?? "Contrôle de configuration");
  const navigateToView = (view: ViewId) => {
    setActiveView(view === "tools" || view === "inspector" ? "digital-twin" : view);
    setMobileNavOpen(false);
  };
  return (
    <div className="aeromind-app">
      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark">
            <span>A</span>
            <i />
          </div>
          <div>
            <strong>
              AEROMIND <b>IA</b>
            </strong>
            <span>ENGINEERING SYSTEMS</span>
          </div>
          <button
            className="mobile-close"
            onClick={() => setMobileNavOpen(false)}
          >
            <X size={17} />
          </button>
        </div>
        <div className="sidebar-rule" />
        <ProjectSelector
          project={project}
          projects={projects}
          activeProjectId={activeProjectId}
          onSelect={selectProject}
          onCreate={createProject}
          onDelete={deleteProject}
        />
        <nav className="main-nav" aria-label={t("Navigation principale")}>
          {(showAdvancedNav ? orderedNavItems : orderedNavItems.filter(item => item.primary)).map((item, index, visibleItems) => {
            const Icon = item.icon;
            return (
              <div key={item.id} className="nav-entry-group">
                {(index === 0 || visibleItems[index - 1].group !== item.group) && (
                  <span className="nav-group-label">{t(item.group)}</span>
                )}
                <button
                  className={`nav-item ${activeView === item.id ? "is-active" : ""}`}
                  onClick={() => navigateToView(item.id)}
                >
                  <Icon size={17} strokeWidth={1.7} />
                  <span>{t(item.label)}</span>
                  <small>{item.meta}</small>
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className={`nav-advanced-toggle ${showAdvancedNav ? "is-open" : ""}`}
            onClick={() => setShowAdvancedNav(value => !value)}
            aria-expanded={showAdvancedNav}
          >
            <ChevronDown size={15} />
            <span>{showAdvancedNav ? "Réduire les consoles" : "Ouvrir les consoles avancées"}</span>
            <small>{orderedNavItems.filter(item => !item.primary).length}</small>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="compute-status">
            <span className="status-orb">
              <Cloud size={14} />
            </span>
            <div>
              <strong>
                {authenticatedUser
                  ? "Session métier active"
                  : "Mode brouillon local"}
              </strong>
              <span>
                {serverProjectsQuery.isSuccess
                  ? "API et projets synchronisés"
                  : authenticatedUser
                    ? "API métier indisponible"
                    : "Connexion requise pour la persistance"}
              </span>
            </div>
            <span className="online-pulse" />
          </div>
          {authenticatedUser?.role === "super_admin" && (
            <button
              className="nav-item"
              onClick={() => {
                window.location.href = "/super-admin";
              }}
            >
              <ShieldCheck size={16} />
              <span>Console Super-Admin</span>
              <small>SECURE</small>
            </button>
          )}
          <SessionControls />
          <button
            className="user-row"
            onClick={() => {
              if (authenticatedUser) setActiveView("operations");
              else {
                try {
                  if (window.__MANUS_CONFIG__?.externalOidcEnabled) {
                    window.location.assign("/api/auth/oidc/login");
                  } else {
                    setActiveView("operations");
                  }
                } catch {
                  setActiveView("operations");
                }
              }
            }}
            aria-label={
              authenticatedUser
                ? "Ouvrir le compte et les opérations"
                : window.__MANUS_CONFIG__?.externalOidcEnabled
                  ? "Se connecter via le SSO autonome AeroMind"
                  : "Configurer le SSO autonome avant de se connecter"
            }
          >
            <span className="avatar">LP</span>
            <span>
              <strong>
                {authenticatedUser?.name ||
                  authenticatedUser?.email ||
                  (window.__MANUS_CONFIG__?.externalOidcEnabled
                    ? "Connexion AeroMind"
                    : "SSO à configurer")}
              </strong>
              <small>
                {serverProjectsQuery.isSuccess
                  ? "Compte connecté · données serveur"
                  : authenticatedUser
                    ? "Compte connecté · stockage local"
                    : window.__MANUS_CONFIG__?.externalOidcEnabled
                      ? `Connexion ${window.__MANUS_CONFIG__.externalOidcProvider} indépendante`
                      : "SSO autonome non configuré · voir le guide de déploiement"}
              </small>
            </span>
            <ChevronDown size={14} className="muted-icon" />
          </button>
        </div>
      </aside>
      <main className="main-shell">
        {new URLSearchParams(window.location.search).get("external_login") ===
          "failed" && (
          <div
            role="alert"
            className="m-4 rounded border border-amber-500/50 bg-amber-950/30 p-3 text-sm text-amber-100"
          >
            Connexion externe refusée : vérifiez le fournisseur OIDC,
            l’autorisation du compte et son adresse e-mail AeroMind. Si le
            problème persiste, contactez le Super-Admin.
          </div>
        )}
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Ouvrir la navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={19} />
          </button>
          <div className="breadcrumb">
            <span>{project.name}</span>
            <ArrowRight size={13} />
            <strong>{viewTitle}</strong>
            <span className="breadcrumb-version">v{project.version}</span>
          </div>
          <div className="topbar-actions">
            <label className="aeromind-language-picker" title={t("Langue de l’interface")}>
              <span aria-hidden="true">文</span>
              <span className="sr-only">{t("Langue de l’interface")}</span>
              <select aria-label={t("Langue de l’interface")} value={language} onChange={event => setLanguage(event.target.value as AppLanguage)}>
                <option value="fr">{t("Français")}</option><option value="en">{t("Anglais")}</option>
              </select>
            </label>
            <span
              className={`simulation-arm-badge ${simulationArmed ? "is-armed" : ""}`}
              role="status"
              aria-live="polite"
              title={
                simulationArmed
                  ? "Scénario de simulation armé virtuellement : état d’interface et couches de vision uniquement. Aucun actionneur réel."
                  : "Banc au sol simulé. Le flux de télémétrie continue de s’animer."
              }
            >
              <span className="arm-state-dot" />
              {simulationArmed ? "SIMULATION ARMÉE" : "SIMULATION DÉSARMÉE"}
            </span>
            <span
              className={`autosave autosave-${saveState}`}
              title={
                syncNotice || (saveState === "error"
                  ? "Le brouillon reste disponible localement ; la synchronisation distante pourra être réessayée."
                  : "Source locale synchronisée entre les onglets ; copie distante opportuniste.")
              }
              role="status"
              aria-live="polite"
            >
              <span className="save-dot" />{" "}
              {syncNotice || (saveState === "saving"
                ? "SYNCHRONISATION…"
                : saveState === "error"
                  ? "ERREUR DE SYNCHRONISATION · détail dans l’état"
                  : authenticatedUser && serverProjectsQuery.isSuccess
                    ? "SYNCHRONISÉ (SERVEUR)"
                    : "SYNCHRONISÉ (LOCAL)")}
            </span>
            <button
              className="icon-button"
              aria-label="Ouvrir la traçabilité"
              onClick={() => navigateToView("simulation")}
            >
              <Activity size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Ouvrir la simulation en direct"
              onClick={() => navigateToView("live")}
            >
              <MoreHorizontal size={17} />
            </button>
          </div>
        </header>
        <div className="main-content">
          {!activeProjectId && (
            <div className="workspace-warning" role="status">
              <strong>Workspace vierge — aucune création automatique.</strong>
              <span>
                Les onglets restent accessibles en mode exploration. Créez un
                projet manuellement pour enregistrer vos modifications.
              </span>
              <button className="secondary-button" onClick={createProject}>
                Créer manuellement
              </button>
            </div>
          )}
          <EngineeringSyncStatus health={engineeringSyncHealth} />
          <section
            className="shared-sync-ribbon"
            role="status"
            aria-label="État synchronisé du projet actif"
            data-testid="shared-workspace-state"
            data-active-drone={config.engineeringSelection?.droneId ?? config.platformProfile ?? "none"}
            data-installed-material-count={config.installedMaterials?.length ?? 0}
            data-custom-sketch-count={config.customSketch?.strokes.length ?? 0}
          >
            <div className="shared-sync-ribbon-title">
              <span className="shared-sync-live-dot" />
              <div><strong>PROJET SYNCHRONISÉ</strong><small>{project.name} · même source de données pour tous les écrans</small></div>
            </div>
            <div className="shared-sync-ribbon-cell"><small>DRONE / DESSIN ACTIF</small><strong>{activeDroneLabel}</strong><span>{config.engineeringSelection?.source === "custom" || config.customSketch?.strokes.length ? `${config.customSketch?.strokes.length ?? 0} objets de dessin partagés` : `${config.airframe ?? "architecture en attente"} · ${config.wingspan.toFixed(2)} m`}</span></div>
            <div className="shared-sync-ribbon-cell"><small>MATÉRIAU SÉLECTIONNÉ / NOMENCLATURE</small><strong>{config.engineeringSelection?.materialLabel ?? "Aucun matériau sélectionné"}</strong><span>{config.installedMaterials?.length ?? 0} élément(s) installé(s) · {(config.constructionMassKg ?? 0).toFixed(2)} kg déclarés</span></div>
            <div className="shared-sync-ribbon-cell"><small>ÉCRITURES / COMMANDES</small><strong>{requirements.length} exigence(s) · {config.missionPlan?.waypoints.length ?? 0} waypoint(s)</strong><span>{config.flightControls?.mode ?? "commandes virtuelles"} · sortie physique désactivée</span></div>
          </section>
          <section className="digital-thread-rail" aria-label="Fil d’ingénierie AeroMind">
            <div className="digital-thread-heading">
              <span className="digital-thread-kicker">AEROMIND / DIGITAL THREAD</span>
              <strong>{activeDroneLabel}</strong>
              <small>{config.airframe ? `${config.airframe.toUpperCase()} · RÉVISION LOCALE` : "ARCHITECTURE AUCUNE SÉLECTION"}</small>
            </div>
            <div className="digital-thread-steps">
              {[
                ["requirements", "EXIGENCES", "01"],
                ["design-studio", "IDDS", "02"],
                ["materials", "ÉQUIPEMENTS", "03"],
                ["simulation", "SIMULATION", "04"],
                ["live", "ESSAIS", "05"],
                ["report", "REVUE", "06"],
              ].map(([view, label, index]) => (
                <button key={view} type="button" className={activeView === view ? "is-active" : ""} onClick={() => navigateToView(view as ViewId)}>
                  <span>{index}</span><strong>{label}</strong>
                </button>
              ))}
            </div>
            <div className="digital-thread-proof"><span className="proof-dot" /> SIMULATION UNIQUEMENT <b>·</b> NON CERTIFIÉ <b>·</b> SORTIE MATÉRIELLE DÉSACTIVÉE</div>
          </section>
          <>
            <ActionCenter actions={actions} />
            {activeView === "overview" ? (
              <Overview
                project={project}
                simulation={simulation}
                onView={setActiveView}
                onCreateProject={createProject}
                hasProject={Boolean(
                  activeProjectId && config.airframe && runId !== "SIM-000"
                )}
                onRunSimulation={runSimulationNow}
                isRunning={isRunning}
                config={config}
                requirements={requirements}
                runId={runId}
                projectId={activeProjectId}
                workflowRun={workflowRun}
                onRunCommitted={run => { setWorkflowRun(run); setRunId(`WORKFLOW-${run.id.slice(0, 8)}`); }}
              />
            ) : (
              <WorkspaceWindow
                viewId={activeView}
                title={viewTitle}
                onClose={() => setActiveView("overview")}
              >
                <div className="workspace-window-inner">
                  <>
                    {activeView === "requirements" && (
                      <RequirementsView
                        requirements={requirements}
                        missionTemplates={missionRequirementTemplates}
                        onApplyMissionTemplate={applyMissionTemplate}
                        onChange={updateRequirement}
                        onView={setActiveView}
                        onAddRequirement={addRequirement}
                        onDeleteRequirement={deleteRequirement}
                        onToggleRequirement={toggleRequirement}
                      />
                    )}
                    {activeView === "catalog" && (
                      <DroneCatalogView
                        onLoad={loadDroneExample}
                        // La sélection synchronise la cellule sans imposer une
                        // navigation : l’opérateur conserve la console ouverte
                        // et peut continuer à utiliser IDDS, l’assemblage et
                        // l’atelier équipements/calibration.
                        onSelect={design => loadDroneExample(design, false, false)}
                        activeDroneId={config.engineeringSelection?.droneId ?? config.platformProfile}
                        onOpenTools={() => setActiveView("digital-twin")}
                        onApplyIndustrial={applyIndustrialReference}
                      />
                    )}
                    {activeView === "concept" && (
                      <ConceptView
                        key={`${activeProjectId || "empty-workspace"}-${workspaceRevision}`}
                        config={config}
                        activeProfile={activeLibraryDesign}
                        setConfig={setConfig}
                        selectedComponent={selectedComponent}
                        setSelectedComponent={setSelectedComponent}
                        rotation={rotation}
                        rotationX={rotationX}
                        rotationY={rotationY}
                        zoom={zoom}
                        setRotation={setRotation}
                        setRotationX={setRotationX}
                        setRotationY={setRotationY}
                        setZoom={setZoom}
                        onRunSimulation={runSimulationNow}
                        onDuplicate={duplicateConcept}
                        onOpenLibrary={() => setActiveView("catalog")}
                      />
                    )}
                    {(activeView === "tools" || activeView === "inspector" || activeView === "digital-twin") && (
                      <DigitalTwinExplorer
                        config={config}
                        setConfig={setConfig}
                        activeProfile={activeLibraryProfile}
                        projectName={project.name}
                        language={language}
                        hasProject={Boolean(activeProjectId)}
                        runId={runId}
                        onRunSimulation={runSimulationNow}
                        onOpenCatalog={() => navigateToView("catalog")}
                        onOpenSketch={() => setActiveView("design-studio")}
                      />
                    )}
                    {activeView === "simulation" && (
                      <VirtualSimulationCenter
                        simulation={simulation}
                        requirements={requirements}
                        onRunSimulation={runSimulationNow}
                        isRunning={isRunning}
                        config={config}
                        setConfig={setConfig}
                        history={
                          (serverRunsQuery.data ?? []) as Array<{
                            id: number;
                            runId: string;
                            engineVersion: string;
                            createdAt: Date;
                          }>
                        }
                        versions={
                          (serverVersionsQuery.data ?? []) as Array<{
                            id: number;
                            version: string;
                            createdAt: Date;
                          }>
                        }
                        onRestoreVersion={restoreDesignVersion}
                      />
                    )}
                    {activeView === "labbench" && <LabBench />}
                    {activeView === "command-center" && <HumanCommandCenter />}
                    {activeView === "live" && (
                      <VirtualFlightTestHall
                        config={config}
                        setConfig={setConfig}
                        simulation={simulation}
                        requirements={requirements}
                        workflowRun={workflowRun}
                        onOpenBuilder={() => setActiveView("simulation")}
                      />
                    )}
                    {activeView === "satellite-nav" && (
                      <SatelliteNavigationView
                        key={activeLibraryProfile?.id ?? "no-cell"}
                        activeProfile={activeLibraryProfile}
                        userIdentity={authenticatedUser?.email ?? "local"}
                      />
                    )}
                    {activeView === "mission-center" && (
                      <MissionOperationsView
                        projectName={project.name}
                        config={config}
                        activeProfile={activeLibraryDesign}
                        setConfig={setConfig}
                        simulation={simulation}
                        onOpenBuilder={() => setActiveView("digital-twin")}
                        onLoadDemoPlan={() =>
                          setConfig(current => ({
                            ...current,
                            missionPlan:
                              createCompatibleDemoMissionPlan(current),
                          }))
                        }
                        simulationArmed={simulationArmed}
                        onSimulationArmedChange={setSimulationArmed}
                      />
                    )}
                    {activeView === "report" && (
                      <ReportView
                        project={project}
                        requirements={requirements}
                        config={config}
                        simulation={simulation}
                        onExport={exportReport}
                        onView={setActiveView}
                        activeProjectId={activeProjectId}
                        language={language}
                        workbenchCapture={workbenchCapture}
                        remoteReady={Boolean(
                          authenticatedUser && serverProjectsQuery.isSuccess
                        )}
                      />
                    )}
                    {activeView === "copilot" && (
                      <CopilotView
                        project={project}
                        config={config}
                        requirements={requirements}
                        simulation={simulation}
                        onView={navigateToView}
                        onCreateProject={createProject}
                        hasProject={Boolean(
                          activeProjectId &&
                            config.airframe &&
                            runId !== "SIM-000"
                        )}
                      />
                    )}
                    {activeView === "operations" && (
                      <OperationsView
                        config={config}
                        setConfig={setConfig}
                        onResetWorkspace={resetEntireWorkspace}
                        onRefreshSystem={() => window.location.reload()}
                        activeProjectId={activeProjectId}
                        authenticated={Boolean(authenticatedUser)}
                        remoteReady={Boolean(
                          authenticatedUser && serverProjectsQuery.isSuccess
                        )}
                      />
                    )}
                    {activeView === "materials" && (
                      <MaterialsAssemblyView config={config} setConfig={setConfig} onOpenConstruction={() => setActiveView("concept")} onOpenDesign={() => setActiveView("design-studio")} onOpenArchitecture={() => setActiveView("digital-twin")} />
                    )}
                    {activeView === "aero-center" && (
                      <AeronauticalCenterView
                        config={config}
                        setConfig={setConfig}
                      />
                    )}
                    {activeView === "design-studio" && (
                      <DesignStudioView
                        config={config}
                        setConfig={setConfig}
                        onSelectProfile={design =>
                          loadDroneExample(design, true)
                        }
                        onOpenLibrary={() => setActiveView("catalog")}
                        activeProfile={activeLibraryDesign}
                      />
                    )}
                  </>
                </div>
              </WorkspaceWindow>
            )}
          </>
          {createProjectDialogOpen && (
            <div
              className="project-create-backdrop"
              role="presentation"
              onMouseDown={event => {
                if (event.currentTarget === event.target)
                  setCreateProjectDialogOpen(false);
              }}
            >
              <form
                className="project-create-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="project-create-title"
                onSubmit={event => {
                  event.preventDefault();
                  void confirmCreateProject();
                }}
              >
                <div className="project-create-dialog-head">
                  <div>
                    <span className="eyebrow">WORKSPACE / INITIALISATION · SSO VALIDÉ</span>
                    <h2 id="project-create-title">
                      Créer un espace de travail
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Fermer la fenêtre de création"
                    onClick={() => setCreateProjectDialogOpen(false)}
                  >
                    <X size={15} />
                  </button>
                </div>
                <p>
                  Donnez un nom à votre projet. Il sera partagé avec les onglets
                  Exigences, Simulation, LabBench, Copilote et Opérations.
                </p>
                <label className="project-create-field">
                  <span>NOM DU PROJET</span>
                  <input
                    autoFocus
                    value={newProjectName}
                    onChange={event => setNewProjectName(event.target.value)}
                    placeholder="Ex. Inspection ligne électrique"
                  />
                </label>
                <div className="project-create-dialog-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setCreateProjectDialogOpen(false)}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={!newProjectName.trim()}
                  >
                    <Plus size={14} /> Initialiser le workspace
                  </button>
                </div>
              </form>
            </div>
          )}
          <footer className="app-footer">
            <span>
              <Orbit size={13} /> AEROMIND AI / ENGINEERING COPILOT v
              {APP_VERSION}
            </span>
            <span>Engineering OS · Civil, secours & défense non offensive</span>
            <span>Calculs préliminaires — revue humaine obligatoire</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
import { ArtificialHorizon } from "../components/ArtificialHorizon";
import { TelemetryStripChart } from "../components/TelemetryStripChart";
import {
  WireframeViewer,
  type WireModelKind,
} from "../components/WireframeViewer";
import {
  VisionShaderOverlay,
  visionModes,
  type VisionMode,
} from "../components/VisionShaderOverlay";
import {
  advanceLiveFlight,
  createLiveFlightState,
  cruiseAltitudeTarget,
  cruiseSpeedTarget,
  describeLivePhase,
  liveSeries,
  setLiveArmed,
  hasEnergyBudget,
  usesSimulationDefaults,
  type LiveFlightState,
} from "../lib/liveSimulation";
import {
  LONG_RANGE_CATEGORY_CLASSIFICATION,
  LONG_RANGE_CATEGORY_LABEL,
  buildLongRangePreparationNote,
  longRangeObservationSummary,
  longRangeObservationVectors,
  type LongRangeObservationVector,
} from "../lib/longRangeObservation";
