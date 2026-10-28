import { trpc } from "@/lib/trpc";
import { LabBenchPersistencePanel } from "@/components/LabBenchPersistencePanel";
import { LabBenchHardwareConfig } from "@/components/LabBenchHardwareConfig";
import { HardwareControlPanel } from "@/components/HardwareControlPanel";
import { FleetRadar } from "@/components/FleetRadar";
import { FleetMap } from "@/components/FleetMap";
import { MaterialLibraryView } from "@/components/MaterialLibraryView";
import { DashboardView } from "@/components/DashboardView";
import { TelemetryCharts } from "@/components/TelemetryCharts";
import { PreFlightChecklist } from "@/components/PreFlightChecklist";
import { MissionPlanner } from "@/components/MissionPlanner";
import { MaintenanceView } from "@/components/MaintenanceView";
import { FlightHistory } from "@/components/FlightHistory";
import { AdvancedReplay } from "@/components/AdvancedReplay";
import { VoiceCommandBar } from "@/components/VoiceCommandBar";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { hasSessionIntegratedDrone, hasUserIntegratedDrone, labBenchDataProjectId } from "@/lib/labBenchDataGate";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Cpu,
  Crosshair,
  Database,
  FileCheck2,
  FolderKanban,
  Gauge,
  Info,
  History,
  KeyRound,
  LockKeyhole,
  Map,
  Mic,
  Plane,
  Play,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Thermometer,
  TriangleAlert,
  Unlock,
  Users,
  Volume2,
  Wifi,
  XCircle,
  Zap,
} from "lucide-react";
import { Link } from "wouter";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  calculateLocalLabBenchResult,
  normalizeLabBenchScenario,
  normalizeLabBenchProjects,
  normalizeLabBenchResult,
  normalizeLabBenchStatus,
  validateLabBenchScenario,
  type LabBenchScenario,
  type LabBenchResult,
} from "@/lib/labBench";
import { useLanguage } from "../contexts/LanguageContext";
import { performStepUp, fetchActiveDrone } from "../lib/labStatus";
import { startLogin } from "../const";
import "./labbench.css";

// ===========================================================================
// LabBench 01 — Modernized modular architecture (5 zones, gate progression).
//
// The navigation is grouped into 5 functional zones instead of a flat list of
// views:
//   1. Gouvernance & Exigences  (N1 — read only)
//   2. Simulation & HIL         (N2 — virtual)
//   3. Hardware & Drivers       (N3 — registry / checklist)
//   4. Banc de test & Commandes (N3 → N4 — supervised arm/disarm)
//   5. Preuves & Audit          (all levels)
//
// The "permanent block" of the previous version is replaced by an explicit
// gate progression: the operator drives each gate from the UI, with
// server-side persistence and double confirmation for the N3 arm.
// ===========================================================================

type ViewId =
  | "projects"
  | "overview"
  | "dashboard"
  | "requirements"
  | "simulation"
  | "hardware"
  | "materials"
  | "bench"
  | "fleet"
  | "radar"
  | "map"
  | "mission"
  | "preflight"
  | "charts"
  | "flights"
  | "replay-adv"
  | "voice"
  | "collaboration"
  | "maintenance"
  | "hardware-control"
  | "reports"
  | "audit";
type ModeId = "simulation" | "connected" | "authorized";

type ZoneId = "governance" | "simulation" | "hardware" | "bench" | "audit";

type GateState = "passed" | "open" | "pending";

type GateDefinition = {
  code: string;
  label: string;
  description: string;
  level: string;
  zone: ZoneId;
  requiredConditions: string[];
  conditions: Record<string, boolean>;
  state: GateState;
};

type ZoneProgress = {
  zone: ZoneId;
  label: string;
  passed: boolean;
  openCount: number;
  gates: Array<{ code: string; state: GateState }>;
};

type GateStateResponse = {
  projectId: string;
  gateStateId: string;
  updatedAt: string;
  conditions: Record<string, boolean>;
  gates: GateDefinition[];
  currentGate: string;
  armEvents: Array<Record<string, unknown>>;
  reviewEvents: Array<Record<string, unknown>>;
  hardwareChecklist: {
    deviceIdentified: boolean;
    driverValidated: boolean;
    calibrationSimulated: boolean;
    complete: boolean;
  };
  physicalOutputEnabled: false;
  physicalCommandsEmitted: false;
  physicalExecutionPermitted: false;
  zoneProgress: ZoneProgress[];
};

type LocalGateState = {
  gates: GateDefinition[];
  zoneProgress: ZoneProgress[];
  currentGate: string;
  conditions: Record<string, boolean>;
  hardwareChecklist: GateStateResponse["hardwareChecklist"];
  armEvents: Array<Record<string, unknown>>;
  reviewEvents: Array<Record<string, unknown>>;
  updatedAt: string | null;
};

// === TypeScript port of Python _resolvedGates + _zone_progress ===
const GATE_DEFS: Array<{ code: string; label: string; description: string; level: string; zone: ZoneId; requiredConditions: string[] }> = [
  { code: "N1", label: "Conception", description: "Registre exigences + identité appareil/émulateur créés.", level: "N1", zone: "governance", requiredConditions: ["registry_initialized"] },
  { code: "N2", label: "Simulation", description: "Au moins un run N2 archivé côté serveur (empreinte SHA-256).", level: "N2", zone: "simulation", requiredConditions: ["registry_initialized", "n2_run_archived"] },
  { code: "N3-READY", label: "Conformité matérielle", description: "Pilote + identité appareil vérifiés ; calibration simulée exécutée.", level: "N3", zone: "hardware", requiredConditions: ["registry_initialized", "n2_run_archived", "hardware_checklist_complete"] },
  { code: "N3-ARMED", label: "Armement N3 supervisé", description: "Armement explicite après double confirmation humaine.", level: "N3", zone: "bench", requiredConditions: ["n3_ready", "arm_double_confirmed"] },
  { code: "N4", label: "Mise en service (revue indépendante)", description: "Revue indépendante signée après démonstration N3 supervisée.", level: "N4", zone: "audit", requiredConditions: ["n3_armed", "independent_review_signed"] },
];

function _resolvedGates(conditions: Record<string, boolean>): GateDefinition[] {
  const result: GateDefinition[] = [];
  let passedSoFar = true;
  for (const def of GATE_DEFS) {
    const allMet = def.requiredConditions.every((c) => conditions[c] === true);
    let state: GateState;
    if (passedSoFar && allMet) {
      state = "passed";
    } else if (!passedSoFar) {
      state = "pending";
    } else {
      state = "open";
      passedSoFar = false;
    }
    result.push({
      code: def.code,
      label: def.label,
      description: def.description,
      level: def.level,
      zone: def.zone,
      requiredConditions: def.requiredConditions,
      conditions: Object.fromEntries(def.requiredConditions.map((c) => [c, conditions[c] === true])),
      state,
    });
  }
  return result;
}

function _zoneProgress(gates: GateDefinition[]): ZoneProgress[] {
  const zonesOrder: ZoneId[] = ["governance", "simulation", "hardware", "bench", "audit"];
  const zoneLabels: Record<ZoneId, string> = {
    governance: "Gouvernance & Exigences",
    simulation: "Simulation & HIL",
    hardware: "Hardware & Drivers",
    bench: "Banc de test & Commandes",
    audit: "Preuves & Audit",
  };
  return zonesOrder.map((zone) => {
    const zoneGates = gates.filter((g) => g.zone === zone);
    const passed = zoneGates.length > 0 && zoneGates.every((g) => g.state === "passed");
    const openCount = zoneGates.filter((g) => g.state === "open").length;
    return {
      zone,
      label: zoneLabels[zone],
      passed,
      openCount,
      gates: zoneGates.map((g) => ({ code: g.code, state: g.state })),
    };
  });
}

// Helper: find first matching element in array, return fallback
function _next<T>(predicate: (item: T) => boolean, items: T[], fallback: T): T {
  return items.find(predicate) ?? fallback;
}

const initialLocalGateState: LocalGateState = {
  gates: [
    {
      code: "N1",
      label: "Conception",
      description: "Registre exigences + identité appareil/émulateur créés.",
      level: "N1",
      zone: "governance",
      requiredConditions: ["registry_initialized"],
      conditions: { registry_initialized: false },
      state: "open",
    },
    {
      code: "N2",
      label: "Simulation",
      description: "Au moins un run N2 archivé côté serveur (empreinte SHA-256).",
      level: "N2",
      zone: "simulation",
      requiredConditions: ["registry_initialized", "n2_run_archived"],
      conditions: { registry_initialized: false, n2_run_archived: false },
      state: "pending",
    },
    {
      code: "N3-READY",
      label: "Conformité matérielle",
      description: "Pilote + identité appareil vérifiés ; calibration simulée exécutée.",
      level: "N3",
      zone: "hardware",
      requiredConditions: ["registry_initialized", "n2_run_archived", "hardware_checklist_complete"],
      conditions: { registry_initialized: false, n2_run_archived: false, hardware_checklist_complete: false },
      state: "pending",
    },
    {
      code: "N3-ARMED",
      label: "Armement N3 supervisé",
      description: "Armement explicite après double confirmation humaine.",
      level: "N3",
      zone: "bench",
      requiredConditions: ["n3_ready", "arm_double_confirmed"],
      conditions: { n3_ready: false, arm_double_confirmed: false },
      state: "pending",
    },
    {
      code: "N4",
      label: "Mise en service (revue indépendante)",
      description: "Revue indépendante signée après démonstration N3 supervisée.",
      level: "N4",
      zone: "audit",
      requiredConditions: ["n3_armed", "independent_review_signed"],
      conditions: { n3_armed: false, independent_review_signed: false },
      state: "pending",
    },
  ],
  zoneProgress: [
    { zone: "governance", label: "Gouvernance & Exigences", passed: false, openCount: 1, gates: [{ code: "N1", state: "open" }] },
    { zone: "simulation", label: "Simulation & HIL", passed: false, openCount: 0, gates: [{ code: "N2", state: "pending" }] },
    { zone: "hardware", label: "Hardware & Drivers", passed: false, openCount: 0, gates: [{ code: "N3-READY", state: "pending" }] },
    { zone: "bench", label: "Banc de test & Commandes", passed: false, openCount: 0, gates: [{ code: "N3-ARMED", state: "pending" }] },
    { zone: "audit", label: "Preuves & Audit", passed: false, openCount: 0, gates: [{ code: "N4", state: "pending" }] },
  ],
  currentGate: "N1",
  conditions: {
    registry_initialized: false,
    n2_run_archived: false,
    hardware_checklist_complete: false,
    n3_ready: false,
    arm_double_confirmed: false,
    n3_armed: false,
    independent_review_signed: false,
  },
  hardwareChecklist: {
    deviceIdentified: false,
    driverValidated: false,
    calibrationSimulated: false,
    complete: false,
  },
  armEvents: [],
  reviewEvents: [],
  updatedAt: null,
};

const ZONE_GROUPS: Array<{
  id: ZoneId;
  label: string;
  description: string;
  views: Array<{ id: ViewId; label: string; caption: string; icon: typeof Gauge }>;
}> = [
  {
    id: "governance",
    label: "01 · Gouvernance & Exigences",
    description: "N1 · registre, exigences et projets",
    views: [
      { id: "projects", label: "Projets", caption: "Rattachement officiel", icon: FolderKanban },
      { id: "dashboard", label: "Dashboard", caption: "Vue multi-projets", icon: Activity },
      { id: "overview", label: "Vue preuves", caption: "Chaîne N1→N4", icon: ClipboardCheck },
      { id: "requirements", label: "Exigences", caption: "Référentiel", icon: ShieldCheck },
    ],
  },
  {
    id: "simulation",
    label: "02 · Simulation & HIL",
    description: "N2 · moteur thermique synthétique",
    views: [
      { id: "simulation", label: "Simulation", caption: "Moteur N2", icon: Activity },
    ],
  },
  {
    id: "hardware",
    label: "03 · Hardware & Drivers",
    description: "N3 · registre appareil + pilote",
    views: [
      { id: "hardware", label: "Hardware", caption: "Checklist + pilote", icon: Cpu },
      { id: "materials", label: "Matériels", caption: "Catalogue étendu", icon: Database },
      { id: "maintenance", label: "Maintenance", caption: "Records + batteries", icon: ShieldCheck },
    ],
  },
  {
    id: "bench",
    label: "04 · Banc de test & Commandes",
    description: "N3 → N4 · armement supervisé",
    views: [
      { id: "bench", label: "Banc", caption: "Commandes supervisées", icon: Radio },
      { id: "fleet", label: "Flotte", caption: "Multi-drones", icon: Gauge },
      { id: "radar", label: "Radar", caption: "Temps réel + replay", icon: Crosshair },
      { id: "map", label: "Carte", caption: "Vue géographique", icon: Map },
      { id: "mission", label: "Mission", caption: "Waypoints + upload", icon: Plane },
      { id: "preflight", label: "Pré-vol", caption: "Checklist", icon: ClipboardCheck },
      { id: "charts", label: "Charts", caption: "Télémétrie", icon: Activity },
      { id: "replay-adv", label: "Replay 3D", caption: "Timeline + 3D trail", icon: Crosshair },
      { id: "voice", label: "Voix", caption: "Commandes vocales", icon: Mic },
      { id: "collaboration", label: "Multi-op", caption: "Opérateurs live", icon: Users },
      { id: "flights", label: "Vols", caption: "Historique + CSV", icon: History },
      { id: "hardware-control", label: "Hardware", caption: "Pilote matériel v5", icon: Zap },
      { id: "reports", label: "Rapports", caption: "Dossier de preuve", icon: FileCheck2 },
    ],
  },
  {
    id: "audit",
    label: "05 · Preuves & Audit",
    description: "tous niveaux · traçabilité",
    views: [
      { id: "audit", label: "Journal d’audit", caption: "Événements & reçus", icon: History },
    ],
  },
];

const modeItems: Array<{
  id: ModeId;
  label: string;
  eyebrow: string;
  detail: string;
}> = [
  {
    id: "simulation",
    label: "Simulation",
    eyebrow: "N2",
    detail: "Données synthétiques. Aucun appareil réel n’est commandé.",
  },
  {
    id: "connected",
    label: "Diagnostic virtuel",
    eyebrow: "N2",
    detail:
      "Identité de l’émulateur et télémétrie synthétique ; aucun appareil réel.",
  },
  {
    id: "authorized",
    label: "Commande virtuelle supervisée",
    eyebrow: "N3",
    detail:
      "Consigne simulée après deux confirmations humaines ; sorties physiques interdites.",
  },
];

// Only the explicit user-entered scenario is persisted. The previous key is
// intentionally ignored so old demo/default values cannot become evidence.
const LABBENCH_SCENARIO_KEY = "aeromind-labbench-scenario-user-v2";
const EMPTY_LABBENCH_SCENARIO: LabBenchScenario = {
  ambientC: 0,
  heaterPowerW: 0,
  dutyCycle: 0,
  thermalResistanceCPerW: 0.1,
  durationSeconds: 1,
  positionSetpointDeg: 0,
};
type StoredLabBenchScenario = {
  source: "user";
  values: LabBenchScenario;
};
function readStoredLabBenchScenario(): StoredLabBenchScenario | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(LABBENCH_SCENARIO_KEY) ?? "null",
    ) as Partial<StoredLabBenchScenario> | null;
    if (stored?.source !== "user") return null;
    const values = stored.values as Partial<LabBenchScenario> | undefined;
    const requiredKeys: Array<keyof LabBenchScenario> = [
      "ambientC",
      "heaterPowerW",
      "dutyCycle",
      "thermalResistanceCPerW",
      "durationSeconds",
      "positionSetpointDeg",
    ];
    if (!values || !requiredKeys.every((key) => typeof values[key] === "number" && Number.isFinite(values[key]))) return null;
    return { source: "user", values: normalizeLabBenchScenario(stored.values) };
  } catch {
    return null;
  }
}
function readLabBenchScenario() {
  return readStoredLabBenchScenario()?.values ?? { ...EMPTY_LABBENCH_SCENARIO };
}
function hasStoredUserScenario() {
  return Boolean(readStoredLabBenchScenario());
}
export type LabBenchIntegratedProps = {
  integrated?: boolean;
  integratedProjectId?: string;
  projectName?: string;
  activeDroneLabel?: string;
  workspaceConfig?: unknown;
  userIntegratedThisSession?: boolean;
};

const initialAudit: Array<{ time: string; type: string; message: string; status: string }> = [];

const StatusDot = ({ state }: { state: string }) => (
  <span className={`lb-status-dot lb-${state}`} aria-hidden="true" />
);

function ServiceState({ state }: { state: string }) {
  const words: Record<string, string> = {
    available: "Disponible",
    degraded: "Dégradé",
    limited: "Limité",
    simulated: "Simulé",
  };
  return (
    <span className={`lb-service-state lb-${state}`}>
      <StatusDot state={state} />
      {words[state] ?? state}
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="lb-section-heading">
      <div>
        <p className="lb-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {actions}
    </div>
  );
}

function requirementLimit(requirement: {
  limit?: string;
  limitValue?: string;
}) {
  return requirement.limitValue ?? requirement.limit ?? "—";
}

function requirementAcceptance(requirement: {
  acceptance?: string;
  acceptanceCriteria?: string;
}) {
  return requirement.acceptanceCriteria ?? requirement.acceptance ?? "—";
}

function parseRegistryJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function registryFieldLabels(value: string | null | undefined) {
  const parsed = parseRegistryJson(value);
  if (Array.isArray(parsed)) return parsed.map(String).join(" · ");
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.labels))
      return record.labels.map(String).join(" · ");
    return Object.entries(record)
      .map(
        ([key, item]) =>
          `${key}: ${typeof item === "string" ? item : JSON.stringify(item)}`,
      )
      .join(" · ");
  }
  return parsed == null ? "—" : String(parsed);
}

function catalogStatusLabel(status: string) {
  return (
    {
      catalog_only: "Catalogue uniquement",
      not_connected: "Non connecté",
      not_validated: "Non validé",
      unverified: "Source non vérifiée",
      reference_only: "Référence uniquement",
      supplier_claim_unverified: "Revendication non vérifiée",
      claimed_not_verified: "Sécurité revendiquée · non vérifiée",
      unspecified: "Non spécifié",
      flight_critical: "Critique pour le vol",
      mission_critical: "Critique pour la mission",
      not_registered: "Non enregistré",
      none: "Aucune permission",
    }[status] ?? status
  );
}

function zoneOfView(view: ViewId): ZoneId | null {
  for (const group of ZONE_GROUPS) {
    if (group.views.some((v) => v.id === view)) return group.id;
  }
  return null;
}

function gateStateLabel(state: GateState): string {
  return state === "passed" ? "Réussi" : state === "open" ? "À passer" : "En attente";
}

function GateBadge({ state }: { state: GateState }) {
  return (
    <span className={`lb-gate-badge lb-gate-${state}`} aria-label={gateStateLabel(state)}>
      {state === "passed" ? <CheckCircle2 size={12} /> : state === "open" ? <CircleDot size={12} /> : <LockKeyhole size={12} />}
      {gateStateLabel(state)}
    </span>
  );
}

export default function LabBench({
  integrated = false,
  integratedProjectId,
  projectName,
  activeDroneLabel,
  workspaceConfig,
  userIntegratedThisSession = false,
}: LabBenchIntegratedProps = {}) {
  const { tKey } = useLanguage();
  const [view, setView] = useState<ViewId>("overview");
  const [mode, setMode] = useState<ModeId>("simulation");
  const [scenario, setScenario] = useState(readLabBenchScenario);
  const [scenarioUserProvided, setScenarioUserProvided] = useState(hasStoredUserScenario);
  const [humanConfirmed, setHumanConfirmed] = useState(false);
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [secondOperatorCode, setSecondOperatorCode] = useState("");
  const [armDialogOpen, setArmDialogOpen] = useState(false);
  const [reviewer, setReviewer] = useState("");
  const [reviewToken, setReviewToken] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [labMfaCode, setLabMfaCode] = useState("");
  const [labSessionInfo, setLabSessionInfo] = useState<{ project_id: string; roles: string[]; expires_at: string } | null>(null);
  const [stepUpHelpOpen, setStepUpHelpOpen] = useState(false);
  const [activeDroneSync, setActiveDroneSync] = useState<{ drone_name?: string; revision?: string; last_sync_at?: string } | null>(null);
  const [labActivationError, setLabActivationError] = useState<string | null>(null);
  const [labActivating, setLabActivating] = useState(false);
  const [signOffDialogOpen, setSignOffDialogOpen] = useState(false);
  const [virtualPosition, setVirtualPosition] = useState<number | null>(null);
  const [storageError, setStorageError] = useState(false);
  const pendingCommand = useRef<string | null>(null);
  const projectEpoch = useRef(0);
  const simulationEpoch = useRef<number | null>(null);
  const materialsRef = useRef<{ refresh: () => void } | null>(null);
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [audit, setAudit] = useState(initialAudit);
  const [serverGateState, setServerGateState] = useState<LocalGateState>(initialLocalGateState);
  const [localGateState, setLocalGateState] = useState<LocalGateState>(initialLocalGateState);
  const workspaceRecord =
    workspaceConfig && typeof workspaceConfig === "object"
      ? (workspaceConfig as Record<string, unknown>)
      : null;
  const integratedSurface = integrated || Boolean(integratedProjectId);

  useEffect(() => {
    try {
      if (scenarioUserProvided) {
        const stored: StoredLabBenchScenario = {
          source: "user",
          values: scenario,
        };
        window.localStorage.setItem(LABBENCH_SCENARIO_KEY, JSON.stringify(stored));
      } else {
        window.localStorage.removeItem(LABBENCH_SCENARIO_KEY);
      }
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
    setHumanConfirmed(false);
    setSafetyConfirmed(false);
    pendingCommand.current = null;
  }, [scenario, scenarioUserProvided]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LABBENCH_SCENARIO_KEY || !event.newValue) return;
      try {
        const stored = JSON.parse(event.newValue) as Partial<StoredLabBenchScenario>;
        if (stored.source !== "user") return;
        setScenario((current: LabBenchScenario) =>
          normalizeLabBenchScenario({ ...current, ...stored.values }),
        );
        setScenarioUserProvided(true);
      } catch {
        // Une valeur externe invalide ne doit pas interrompre le banc d’essai.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const updateScenario = (patch: Partial<LabBenchScenario>) => {
    setScenario((current) => ({ ...current, ...patch }));
    setScenarioUserProvided(true);
  };

  const statusQuery = trpc.labBench.status.useQuery(undefined, {
    staleTime: 30_000,
    retry: false,
  });
  const meQuery = trpc.auth.me.useQuery(undefined, {
    staleTime: 60_000,
    retry: 1,
  });
  const projectsQuery = trpc.projects.list.useQuery(undefined, {
    // Fire even without auth — the API may return local projects or 401
    // (which we handle gracefully). Don't block the entire LabBench on auth.
    enabled: true,
    retry: 2,
    retryDelay: 2000,
    staleTime: 30_000,
  });
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  useEffect(() => {
    setActiveProjectId(integratedProjectId ?? null);
  }, [integratedProjectId]);
  const remoteProjects = normalizeLabBenchProjects(projectsQuery.data);
  // LABBENCH 01 is an integrated AeroMind surface: server projects are the only source of truth.
  // Anonymous/local workspace drafts are intentionally not exposed here.
  const projects = remoteProjects;
  const selectedProjectId =
    integratedProjectId ??
    (activeProjectId &&
    projects.some((project) => project.id === activeProjectId)
      ? activeProjectId
      : null);
  const selectedRemoteProjectId =
    selectedProjectId &&
    remoteProjects.some((project) => project.id === selectedProjectId)
      ? selectedProjectId
      : null;
  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId,
  );
  const explicitWorkspaceConfig = workspaceRecord ?? (!integratedSurface ? selectedProject?.config ?? null : null);
  const hasUserIntegratedData = integratedSurface
    ? hasSessionIntegratedDrone(explicitWorkspaceConfig, userIntegratedThisSession)
    : hasUserIntegratedDrone(explicitWorkspaceConfig);
  const remoteProjectId = labBenchDataProjectId(
    selectedRemoteProjectId,
    integratedSurface,
    integratedSurface ? hasUserIntegratedData : true,
  );
  const activeDroneConfig = hasUserIntegratedData
    ? explicitWorkspaceConfig as Record<string, unknown>
    : null;
  const integratedLocalDataReady = integratedSurface && hasUserIntegratedData;
  // Integrated LabBench reads the exact Home workspace, and remains empty until
  // a catalogue selection or genuine user-authored drawing is present.
  const serverDataReady = integratedSurface
    ? integratedLocalDataReady
    : Boolean(meQuery.data && remoteProjectId && projectsQuery.isSuccess && !projectsQuery.isError);
  const registryQuery = trpc.labBench.registry.useQuery(
    remoteProjectId ?? "0",
    { enabled: Boolean(remoteProjectId), retry: false },
  );
  const gateStateQuery = trpc.labBench.gateState.useQuery(
    remoteProjectId ?? "0",
    {
      enabled: Boolean(remoteProjectId),
      retry: false,
      refetchOnMount: true,
      staleTime: 5_000,
    },
  );
  const remoteAuditQuery = trpc.auditEvents.list.useQuery(
    remoteProjectId ?? "0",
    { enabled: Boolean(remoteProjectId), retry: false },
  );

  useEffect(() => {
    if (gateStateQuery.data && typeof gateStateQuery.data === "object") {
      const data = gateStateQuery.data as Partial<GateStateResponse>;
      setServerGateState({
        gates: Array.isArray(data.gates) ? (data.gates as GateDefinition[]) : initialLocalGateState.gates,
        zoneProgress: Array.isArray(data.zoneProgress) ? (data.zoneProgress as ZoneProgress[]) : initialLocalGateState.zoneProgress,
        currentGate: typeof data.currentGate === "string" ? data.currentGate : initialLocalGateState.currentGate,
        conditions:
          data.conditions && typeof data.conditions === "object"
            ? (data.conditions as Record<string, boolean>)
            : initialLocalGateState.conditions,
        hardwareChecklist:
          data.hardwareChecklist && typeof data.hardwareChecklist === "object"
            ? (data.hardwareChecklist as GateStateResponse["hardwareChecklist"])
            : initialLocalGateState.hardwareChecklist,
        armEvents: Array.isArray(data.armEvents) ? data.armEvents : [],
        reviewEvents: Array.isArray(data.reviewEvents) ? data.reviewEvents : [],
        updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
      });
    }
  }, [gateStateQuery.data]);

  // Sync the active mode from gate state: when N3 is armed, switch to authorized
  useEffect(() => {
    // Use serverGateState if it has data, otherwise localGateState
    const gs = serverGateState?.conditions?.registry_initialized ? serverGateState : localGateState;
    if (!gs) return;
    if (gs.conditions.n3_armed && mode !== "authorized") {
      setMode("authorized");
    }
    if (!gs.conditions.n3_armed && mode === "authorized") {
      setMode("simulation");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteProjectId, serverGateState, localGateState, mode]);

  const [localResult, setLocalResult] = useState<LabBenchResult | null>(null);
  const [runScenarioSignature, setRunScenarioSignature] = useState<
    string | null
  >(null);
  useEffect(() => {
    pendingCommand.current = null;
    setLocalResult(null);
    setRunScenarioSignature(null);
    setHumanConfirmed(false);
    setSafetyConfirmed(false);
    setSecondOperatorCode("");
    setVirtualPosition(null);
    setConnectionChecked(false);
    setAudit([]);
    setServerGateState(initialLocalGateState);
    setLabSessionInfo(null);
    setActiveDroneSync(null);
    projectEpoch.current += 1;
    simulationEpoch.current = null;
  }, [selectedProjectId]);
  // === Integrated local mode ===
  // A local calculation is allowed only from the active Home workspace after
  // the user selected/imported a cell or drawing. It is never a substitute for
  // an empty workspace and it is never presented as server evidence.
  const isLocalMode = integratedLocalDataReady && !remoteProjectId;
  // Auto-seed N1 registry when entering LabBench in local mode (so the gate shows as passed)
  useEffect(() => {
    if (isLocalMode && !localGateState.conditions.registry_initialized) {
      localSeedRegistry();
    }
  }, [isLocalMode]); // Only when isLocalMode changes
  // Use server gate state if available, local sandbox otherwise
  const effectiveGateState = remoteProjectId ? serverGateState : (isLocalMode ? localGateState : initialLocalGateState);
  // Alias for backward compatibility with existing JSX references
  const gateState = effectiveGateState;

  // Local sandbox actions — these simulate the server-side gate operations
  // in-memory. They don't persist, but they let the operator test the full
  // N1→N4 flow without needing an OIDC-authenticated server.
  const localSeedRegistry = () => {
    setLocalGateState((prev) => {
      const conditions = { ...prev.conditions, registry_initialized: true };
      const gates = _resolvedGates(conditions);
      return { ...prev, conditions, gates, zoneProgress: _zoneProgress(gates), currentGate: (gates.find((g) => g.state !== "passed") ?? { code: "N4" }).code };
    });
    toast.success("Registre initialisé (mode local)");
  };

  const localRunSimulation = () => {
    if (!scenarioUserProvided) {
      toast.error("Donnée utilisateur requise", {
        description: "Saisissez explicitement les paramètres LABBENCH ou sélectionnez une cellule AeroMind.",
      });
      return;
    }
    simulationMutation.reset();
    const result = calculateLocalLabBenchResult(scenario);
    setLocalResult(result);
    setRunScenarioSignature(JSON.stringify(scenario));
    setLocalGateState((prev) => {
      const conditions = { ...prev.conditions, n2_run_archived: true };
      const gates = _resolvedGates(conditions);
      return { ...prev, conditions, gates, zoneProgress: _zoneProgress(gates), currentGate: (gates.find((g) => g.state !== "passed") ?? { code: "N4" }).code };
    });
    setAudit((entries) => [
      { time: new Date().toLocaleTimeString("fr-FR"), type: "simulation.local.completed", message: `${result.runId} calculé localement ; preuve N2 locale.`, status: "info" },
      ...entries,
    ]);
    toast.success(`Simulation locale ${result.runId} terminée`);
  };

  const localCompleteChecklist = () => {
    setLocalGateState((prev) => {
      const conditions = { ...prev.conditions, hardware_checklist_complete: true };
      const gates = _resolvedGates(conditions);
      return { ...prev, conditions, gates, zoneProgress: _zoneProgress(gates), currentGate: (gates.find((g) => g.state !== "passed") ?? { code: "N4" }).code };
    });
    toast.success("Checklist hardware simulée (mode local)");
  };

  const localArmN3 = () => {
    if (!humanConfirmed || !safetyConfirmed) {
      toast.error("Double confirmation requise");
      return;
    }
    setLocalGateState((prev) => {
      const conditions = { ...prev.conditions, arm_double_confirmed: true, n3_armed: true };
      const gates = _resolvedGates(conditions);
      return { ...prev, conditions, gates, zoneProgress: _zoneProgress(gates), currentGate: (gates.find((g) => g.state !== "passed") ?? { code: "N4" }).code };
    });
    setHumanConfirmed(false);
    setSafetyConfirmed(false);
    setMode("authorized");
    toast.success("N3 armé (mode local — virtuel uniquement)");
  };

  const localDisarmN3 = () => {
    setLocalGateState((prev) => {
      const conditions = { ...prev.conditions, arm_double_confirmed: false, n3_armed: false };
      const gates = _resolvedGates(conditions);
      return { ...prev, conditions, gates, zoneProgress: _zoneProgress(gates), currentGate: (gates.find((g) => g.state !== "passed") ?? { code: "N4" }).code };
    });
    setMode("simulation");
    toast.info("N3 désarmé (mode local)");
  };

  const localSignOffN4 = () => {
    if (!reviewer.trim() || reviewToken.trim().length < 8) {
      toast.error("Reviewer + jeton requis");
      return;
    }
    setLocalGateState((prev) => {
      const conditions = { ...prev.conditions, independent_review_signed: true };
      const gates = _resolvedGates(conditions);
      return { ...prev, conditions, gates, zoneProgress: _zoneProgress(gates), currentGate: (gates.find((g) => g.state !== "passed") ?? { code: "N4" }).code };
    });
    setSignOffDialogOpen(false);
    setReviewer("");
    setReviewToken("");
    setReviewNote("");
    toast.success("Revue N4 signée (mode local)");
  };
  // === End local sandbox ===

  const simulationMutation = trpc.labBench.runSimulation.useMutation({
    onSuccess(rawResult, variables) {
      if (simulationEpoch.current !== projectEpoch.current) return;
      const inputs = normalizeLabBenchScenario(variables);
      const result = normalizeLabBenchResult(rawResult, inputs);
      if (!result) {
        const fallback = calculateLocalLabBenchResult(inputs);
        setLocalResult(fallback);
        setRunScenarioSignature(JSON.stringify(inputs));
        toast.info("Simulation locale exécutée", {
          description:
            "Réponse API incomplète ; résultat synthétique calculé localement.",
        });
        return;
      }
      setLocalResult(result);
      setRunScenarioSignature(JSON.stringify(inputs));
      setAudit((entries) => [
        {
          time: new Date().toLocaleTimeString("fr-FR"),
          type: "simulation.completed",
          message: `Run ${result.runId} calculé par l’API ; aucune mesure physique.`,
          status: result.verdict === "pass" ? "success" : "warning",
        },
        ...entries,
      ]);
      toast.success(`Simulation ${result.runId} terminée`, {
        description: `Température synthétique : ${result.predictedTemperatureC} °C.`,
      });
      void gateStateQuery.refetch();
    },
    onError(error, variables) {
      if (simulationEpoch.current !== projectEpoch.current) return;
      const inputs = normalizeLabBenchScenario(variables);
      const result = calculateLocalLabBenchResult(inputs);
      setLocalResult(result);
      setRunScenarioSignature(JSON.stringify(inputs));
      setAudit((entries) => [
        {
          time: new Date().toLocaleTimeString("fr-FR"),
          type: "simulation.local.completed",
          message: `${result.runId} calculé localement après indisponibilité API (${error.message}) ; aucune mesure physique.`,
          status: "info",
        },
        ...entries,
      ]);
      toast.info("Simulation locale exécutée", {
        description: `Résultat synthétique ${result.runId} disponible; aucun matériel n’a été commandé.`,
      });
    },
  });
  const persistSimulationMutation = trpc.labBench.persistSimulation.useMutation({
    onSuccess: () => {
      void gateStateQuery.refetch();
      void remoteAuditQuery.refetch();
    },
  });
  const hardwareChecklistMutation = trpc.labBench.completeHardwareChecklist.useMutation({
    onSuccess: (data: any) => {
      toast.success("Checklist hardware simulée enregistrée", {
        description: "N3-READY évalué à partir des preuves serveur.",
      });
      void gateStateQuery.refetch();
      void remoteAuditQuery.refetch();
      setAudit((entries) => [
        {
          time: new Date().toLocaleTimeString("fr-FR"),
          type: "gate.hardware_checklist",
          message: `Checklist simulée ${data?.checklist?.complete ? "complète" : "partielle"} ; aucune commande matérielle.`,
          status: data?.checklist?.complete ? "success" : "warning",
        },
        ...entries,
      ]);
    },
    onError: (error: any) => {
      toast.error("Checklist hardware indisponible", { description: error?.message ?? "Erreur serveur" });
    },
  });
  const armN3Mutation = trpc.labBench.armN3.useMutation({
    onSuccess: (data: any) => {
      toast.success("N3 armé (virtuel)", {
        description: data?.reason ?? "Armement enregistré ; aucune sortie physique.",
      });
      setArmDialogOpen(false);
      setHumanConfirmed(false);
      setSafetyConfirmed(false);
      setSecondOperatorCode("");
      void gateStateQuery.refetch();
      void remoteAuditQuery.refetch();
      setAudit((entries) => [
        {
          time: new Date().toLocaleTimeString("fr-FR"),
          type: "gate.arm_n3",
          message: "Armement N3 supervisé enregistré après double confirmation.",
          status: "success",
        },
        ...entries,
      ]);
    },
    onError: (error: any) => {
      toast.error("Armement N3 refusé", { description: error?.message ?? "Erreur serveur" });
    },
  });
  const disarmN3Mutation = trpc.labBench.disarmN3.useMutation({
    onSuccess: () => {
      toast.info("N3 désarmé", { description: "Aucune commande active résiduelle." });
      void gateStateQuery.refetch();
      void remoteAuditQuery.refetch();
      setAudit((entries) => [
        {
          time: new Date().toLocaleTimeString("fr-FR"),
          type: "gate.disarm_n3",
          message: "Désarmement N3 enregistré.",
          status: "warning",
        },
        ...entries,
      ]);
    },
    onError: (error: any) => {
      toast.error("Désarmement indisponible", { description: error?.message ?? "Erreur serveur" });
    },
  });
  const signOffN4Mutation = trpc.labBench.signOffN4.useMutation({
    onSuccess: () => {
      toast.success("Revue N4 signée", { description: "Aucune commande matérielle." });
      setSignOffDialogOpen(false);
      setReviewer("");
      setReviewToken("");
      setReviewNote("");
      void gateStateQuery.refetch();
      void remoteAuditQuery.refetch();
      setAudit((entries) => [
        {
          time: new Date().toLocaleTimeString("fr-FR"),
          type: "gate.sign_off_n4",
          message: "Revue indépendante N4 signée.",
          status: "success",
        },
        ...entries,
      ]);
    },
    onError: (error: any) => {
      toast.error("Signature N4 refusée", { description: error?.message ?? "Erreur serveur" });
    },
  });

  // === Multi-drone (fleet) state ===
  const [fleetDrones, setFleetDrones] = useState<Array<{
    id: string;
    name: string;
    config: Record<string, unknown>;
    isActive: boolean;
  }>>([]);
  const [fleetResults, setFleetResults] = useState<Array<Record<string, unknown>> | null>(null);
  const [fleetDroneScenarios, setFleetDroneScenarios] = useState<Record<string, LabBenchScenario>>({});
  const [fleetArmDialogDrone, setFleetArmDialogDrone] = useState<{ id: string; name: string } | null>(null);
  const [fleetHumanConfirmed, setFleetHumanConfirmed] = useState(false);
  const [fleetSafetyConfirmed, setFleetSafetyConfirmed] = useState(false);
  const [fleetSecondOperatorCode, setFleetSecondOperatorCode] = useState("");

  const fleetQuery = trpc.labBench.fleetGateState.useQuery(
    remoteProjectId ?? "0",
    {
      enabled: Boolean(remoteProjectId && view === "fleet"),
      retry: false,
      staleTime: 10_000,
    },
  );

  // Refresh drone list when entering fleet view.
  useEffect(() => {
    if (view !== "fleet" || !remoteProjectId) return;
    let cancelled = false;
    fetch(`/api/projects/${encodeURIComponent(remoteProjectId)}/drones`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<Record<string, unknown>>) => {
        if (cancelled) return;
        const drones = rows.map((row) => ({
          id: String(row.id ?? ""),
          name: String(row.name ?? "Drone"),
          config: (row.config && typeof row.config === "object" ? row.config : {}) as Record<string, unknown>,
          isActive: Boolean(row.is_active),
        })).filter((d) => d.id);
        setFleetDrones(drones);
      })
      .catch(() => { if (!cancelled) setFleetDrones([]); });
    return () => { cancelled = true; };
  }, [view, remoteProjectId]);

  const fleetSimMutation = trpc.labBench.runFleetSimulation.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Simulation flotte terminée · ${data?.fleetSize ?? 0} drone(s)`);
      setFleetResults(Array.isArray(data?.results) ? data.results : []);
      void fleetQuery.refetch();
      void remoteAuditQuery.refetch();
      setAudit((entries) => [
        {
          time: new Date().toLocaleTimeString("fr-FR"),
          type: "fleet.simulation.completed",
          message: `Run flotte ${data?.fleetSize ?? 0} drones ; aucune mesure physique.`,
          status: "success",
        },
        ...entries,
      ]);
    },
    onError: (error: any) => {
      toast.error("Simulation flotte indisponible", { description: error?.message ?? "Erreur serveur" });
    },
  });
  const fleetArmMutation = trpc.labBench.armN3Drone.useMutation({
    onSuccess: (data: any) => {
      toast.success(`N3 armé pour ${data?.droneName ?? "drone"}`, {
        description: data?.reason ?? "Armement enregistré ; aucune sortie physique.",
      });
      setFleetArmDialogDrone(null);
      setFleetHumanConfirmed(false);
      setFleetSafetyConfirmed(false);
      setFleetSecondOperatorCode("");
      void fleetQuery.refetch();
      void remoteAuditQuery.refetch();
      setAudit((entries) => [
        {
          time: new Date().toLocaleTimeString("fr-FR"),
          type: "fleet.arm_n3_drone",
          message: `Armement N3 drone ${data?.droneName ?? ""} enregistré.`,
          status: "success",
        },
        ...entries,
      ]);
    },
    onError: (error: any) => {
      toast.error("Armement drone refusé", { description: error?.message ?? "Erreur serveur" });
    },
  });
  const fleetDisarmMutation = trpc.labBench.disarmN3Drone.useMutation({
    onSuccess: (_data: any, vars: any) => {
      toast.info("N3 désarmé", { description: `Drone ${vars?.droneName ?? ""} désarmé.` });
      void fleetQuery.refetch();
      void remoteAuditQuery.refetch();
    },
    onError: (error: any) => {
      toast.error("Désarmement indisponible", { description: error?.message ?? "Erreur serveur" });
    },
  });
  const fleetChecklistMutation = trpc.labBench.completeHardwareChecklistDrone.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Checklist drone ${data?.droneName ?? ""} enregistrée`);
      void fleetQuery.refetch();
      void remoteAuditQuery.refetch();
    },
    onError: (error: any) => {
      toast.error("Checklist drone indisponible", { description: error?.message ?? "Erreur serveur" });
    },
  });

  const addDroneToProject = async () => {
    if (!remoteProjectId) return;
    try {
      const resp = await fetch(`/api/projects/${encodeURIComponent(remoteProjectId)}/drones`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Drone ${fleetDrones.length + 1}`, data: { airframe: "multirotor", motor_count: 4, mass_kg: 1.2, battery_wh: 100 } }),
      });
      if (resp.ok) {
        toast.success("Drone ajouté à la flotte");
        // Refresh drone list
        const list = await fetch(`/api/projects/${encodeURIComponent(remoteProjectId)}/drones`, { credentials: "include" });
        if (list.ok) {
          const rows = await list.json();
          setFleetDrones(rows.map((r: Record<string, unknown>) => ({
            id: String(r.id ?? ""),
            name: String(r.name ?? "Drone"),
            config: (r.config && typeof r.config === "object" ? r.config : {}) as Record<string, unknown>,
            isActive: Boolean(r.is_active),
          })).filter((d: { id: string }) => d.id));
        }
      } else {
        toast.error("Ajout impossible", { description: "Récupérez un projet authentifié pour ajouter un drone." });
      }
    } catch {
      toast.error("Ajout impossible");
    }
  };

  const runFleetSimulationAll = () => {
    if (!remoteProjectId) {
      toast.error("Aucun projet authentifié");
      return;
    }
    if (fleetDrones.length === 0) {
      toast.error("Flotte vide", { description: "Ajoutez au moins un drone à la flotte." });
      return;
    }
    const missingScenario = fleetDrones.some((drone) => !fleetDroneScenarios[drone.id]);
    if (missingScenario) {
      toast.error("Données utilisateur requises", {
        description: "Renseignez les paramètres de chaque drone avant de lancer la flotte.",
      });
      return;
    }
    const scenarios = fleetDrones.map((d) => {
      const sc = fleetDroneScenarios[d.id] as LabBenchScenario;
      return { droneId: d.id, ...sc };
    });
    fleetSimMutation.mutate({ projectId: remoteProjectId, scenarios });
  };

  const openFleetArmDialog = (drone: { id: string; name: string }) => {
    const perDroneState = (fleetQuery.data as any)?.perDrone?.find((p: any) => p.droneId === drone.id);
    if (!perDroneState?.conditions?.n3_ready) {
      toast.error("Gate N3-READY non atteinte", {
        description: `Complétez la checklist + archivez un run N2 pour ${drone.name}.`,
      });
      return;
    }
    setFleetArmDialogDrone(drone);
    setFleetHumanConfirmed(false);
    setFleetSafetyConfirmed(false);
    setFleetSecondOperatorCode("");
  };
  const confirmFleetArm = () => {
    if (!fleetArmDialogDrone || !remoteProjectId) return;
    if (!fleetHumanConfirmed || !fleetSafetyConfirmed || fleetSecondOperatorCode.trim().length < 6) {
      toast.error("Double confirmation requise", { description: "Cochez les deux cases + code second opérateur (≥ 6 caractères)." });
      return;
    }
    fleetArmMutation.mutate({
      projectId: remoteProjectId,
      droneId: fleetArmDialogDrone.id,
      humanConfirmed: fleetHumanConfirmed,
      safetyConfirmed: fleetSafetyConfirmed,
      secondOperatorCode: fleetSecondOperatorCode.trim(),
      physicalOutputEnabled: false,
    });
  };

  // === Hardware control v5 state (Phase A-D exposed in cockpit) ===
  // The hardware endpoints are REST-only (no tRPC bridge), so we use fetch.
  // All state is gated by the HARDWARE_CONTROL env var on the server side;
  // the UI shows clearly when hardware is dormant.
  type HardwareStatus = {
    hardwareControlEnabled: boolean;
    allowedCommands: string[];
    allowedModes: number[];
    maxFleetSize: number;
    poolSize: number;
    physicalOutputEnabled: false;
    physicalCommandsEmitted: false;
  };
  type PoolEntry = {
    droneId: string;
    droneName: string;
    connectionUrl: string;
    registeredAt: string;
    lastStatus?: string;
    hardwareControlEnabled?: boolean;
  };
  type HardwareGateState = {
    projectId: string;
    gateStateId: string;
    updatedAt: string;
    conditions: {
      virtual_n3_armed: boolean;
      hardware_review_signed: boolean;
      drone_registered_in_pool: boolean;
    };
    reviewEvents: Array<Record<string, unknown>>;
    physicalOutputEnabled: false;
    physicalCommandsEmitted: false;
  };
  type GeofenceState = {
    projectId: string;
    configured: boolean;
    polygon?: Array<[number, number]>;
    maxAltitudeM?: number;
    maxDistanceM?: number;
    homeLat?: number;
    homeLon?: number;
    updatedAt?: string;
  };

  const [hardwareStatus, setHardwareStatus] = useState<HardwareStatus | null>(null);
  const [poolEntries, setPoolEntries] = useState<PoolEntry[]>([]);
  const [hardwareGate, setHardwareGate] = useState<HardwareGateState | null>(null);
  const [geofenceState, setGeofenceState] = useState<GeofenceState | null>(null);

  // Pool registration form state
  const [hwRegDroneId, setHwRegDroneId] = useState("");
  const [hwRegDroneName, setHwRegDroneName] = useState("");
  const [hwRegConnectionUrl, setHwRegConnectionUrl] = useState("udpout:127.0.0.1:14550");

  // Geofence form state
  const [hwGeofencePolygon, setHwGeofencePolygon] = useState("");
  const [hwGeofenceMaxAlt, setHwGeofenceMaxAlt] = useState(120);
  const [hwGeofenceMaxDist, setHwGeofenceMaxDist] = useState(500);
  const [hwGeofenceHomeLat, setHwGeofenceHomeLat] = useState("");
  const [hwGeofenceHomeLon, setHwGeofenceHomeLon] = useState("");

  // Hardware review form state
  const [hwReviewer, setHwReviewer] = useState("");
  const [hwReviewToken, setHwReviewToken] = useState("");
  const [hwReviewNote, setHwReviewNote] = useState("");
  const [hwReviewDialogOpen, setHwReviewDialogOpen] = useState(false);

  // Issue token state
  const [hwIssuedToken, setHwIssuedToken] = useState("");
  const [hwIssuedForDrone, setHwIssuedForDrone] = useState("");

  // Command form state
  const [hwCommand, setHwCommand] = useState("NAV_TAKEOFF");
  const [hwCommandParams, setHwCommandParams] = useState('{"p7": 30}');
  const [hwCommandToken, setHwCommandToken] = useState("");
  const [hwCommandDroneId, setHwCommandDroneId] = useState("");

  const refreshHardware = async () => {
    try {
      const r = await fetch("/api/hardware/status", { credentials: "include" });
      if (r.ok) setHardwareStatus(await r.json());
    } catch { /* API indisponible en mode dormant */ }
  };
  const refreshPool = async () => {
    try {
      const r = await fetch("/api/hardware/pool", { credentials: "include" });
      if (r.ok) {
        const body = await r.json();
        setPoolEntries(Array.isArray(body?.drones) ? body.drones : []);
      }
    } catch { /* ignore */ }
  };
  const refreshHardwareGate = async () => {
    if (!remoteProjectId) { setHardwareGate(null); return; }
    try {
      const r = await fetch(`/api/hardware/gate?projectId=${encodeURIComponent(remoteProjectId)}`, { credentials: "include" });
      if (r.ok) setHardwareGate(await r.json());
    } catch { /* ignore */ }
  };
  const refreshGeofence = async () => {
    if (!remoteProjectId) { setGeofenceState(null); return; }
    try {
      const r = await fetch(`/api/hardware/geofence?projectId=${encodeURIComponent(remoteProjectId)}`, { credentials: "include" });
      if (r.ok) setGeofenceState(await r.json());
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (view !== "hardware-control" && view !== "radar") return;
    if (view === "hardware-control") {
      void refreshHardware();
      void refreshPool();
      void refreshHardwareGate();
    }
    void refreshGeofence();
  }, [view, remoteProjectId]);

  const submitPoolRegister = async () => {
    if (!remoteProjectId) {
      toast.error("Aucun projet authentifié");
      return;
    }
    if (!hwRegDroneId.trim() || !hwRegConnectionUrl.trim()) {
      toast.error("Champs requis", { description: "droneId + connectionUrl" });
      return;
    }
    try {
      const r = await fetch("/api/hardware/pool/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          droneId: hwRegDroneId.trim(),
          droneName: hwRegDroneName.trim() || hwRegDroneId.trim(),
          connectionUrl: hwRegConnectionUrl.trim(),
          projectId: remoteProjectId,
        }),
      });
      if (r.ok) {
        toast.success("Drone enregistré dans le pool matériel");
        setHwRegDroneId("");
        setHwRegDroneName("");
        void refreshPool();
        void refreshHardwareGate();
        void refreshHardware();
      } else {
        const err = await r.json().catch(() => ({}));
        toast.error("Échec enregistrement", { description: err?.error?.message ?? `HTTP ${r.status}` });
      }
    } catch (e: any) {
      toast.error("Réseau indisponible", { description: e?.message });
    }
  };

  const submitUnregister = async (droneId: string) => {
    try {
      const r = await fetch(`/api/hardware/pool/${encodeURIComponent(droneId)}/unregister`, {
        method: "POST",
        credentials: "include",
      });
      if (r.ok) {
        toast.info(`Drone ${droneId} retiré du pool`);
        void refreshPool();
        void refreshHardwareGate();
        void refreshHardware();
      }
    } catch { /* ignore */ }
  };

  const submitGeofence = async () => {
    if (!remoteProjectId) {
      toast.error("Aucun projet authentifié");
      return;
    }
    let polygon: Array<[number, number]> = [];
    if (hwGeofencePolygon.trim()) {
      try {
        const parsed = JSON.parse(hwGeofencePolygon);
        if (!Array.isArray(parsed) || parsed.length < 3) throw new Error("polygone ≥ 3 points");
        polygon = parsed.map((p: any) => [Number(p[0]), Number(p[1])]);
      } catch (e: any) {
        toast.error("Polygone invalide", { description: "Format: [[lat,lon],...]" });
        return;
      }
    }
    try {
      const r = await fetch("/api/hardware/geofence", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: remoteProjectId,
          polygon,
          maxAltitudeM: Number(hwGeofenceMaxAlt) || 120,
          maxDistanceM: Number(hwGeofenceMaxDist) || 500,
          homeLat: hwGeofenceHomeLat ? Number(hwGeofenceHomeLat) : null,
          homeLon: hwGeofenceHomeLon ? Number(hwGeofenceHomeLon) : null,
        }),
      });
      if (r.ok) {
        toast.success("Géofence enregistrée");
        void refreshGeofence();
      } else {
        const err = await r.json().catch(() => ({}));
        toast.error("Échec géofence", { description: err?.error?.message ?? `HTTP ${r.status}` });
      }
    } catch (e: any) {
      toast.error("Réseau indisponible", { description: e?.message });
    }
  };

  const submitHwReview = async () => {
    if (!remoteProjectId) return;
    if (!hwReviewer.trim() || hwReviewToken.trim().length < 16) {
      toast.error("Reviewer + jeton (≥ 16 chars) requis");
      return;
    }
    try {
      const r = await fetch("/api/hardware/gate/sign-review", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: remoteProjectId,
          reviewer: hwReviewer.trim(),
          reviewToken: hwReviewToken.trim(),
          note: hwReviewNote.trim(),
        }),
      });
      if (r.ok) {
        toast.success("Revue hardware N4 signée");
        setHwReviewDialogOpen(false);
        setHwReviewer("");
        setHwReviewToken("");
        setHwReviewNote("");
        void refreshHardwareGate();
        void remoteAuditQuery.refetch();
      } else {
        const err = await r.json().catch(() => ({}));
        toast.error("Signature refusée", { description: err?.error?.message ?? `HTTP ${r.status}` });
      }
    } catch (e: any) {
      toast.error("Réseau indisponible", { description: e?.message });
    }
  };

  const issueToken = async (droneId: string) => {
    if (!remoteProjectId) return;
    try {
      const r = await fetch("/api/hardware/gate/issue-token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: remoteProjectId, droneId }),
      });
      if (r.ok) {
        const body = await r.json();
        setHwIssuedToken(String(body?.token ?? ""));
        setHwIssuedForDrone(droneId);
        setHwCommandToken(String(body?.token ?? ""));
        setHwCommandDroneId(droneId);
        toast.success("Jeton single-use émis", { description: "Le jeton est prêt pour une seule commande." });
      } else {
        const err = await r.json().catch(() => ({}));
        toast.error("Émission refusée", { description: err?.error?.message ?? `HTTP ${r.status}` });
      }
    } catch (e: any) {
      toast.error("Réseau indisponible", { description: e?.message });
    }
  };

  const sendCommand = async () => {
    if (!remoteProjectId) return;
    if (!hwCommandDroneId.trim()) {
      toast.error("Drone requis");
      return;
    }
    if (hwCommandToken.trim().length < 16) {
      toast.error("Jeton invalide", { description: "Émettez un jeton single-use avant d'envoyer." });
      return;
    }
    let params: Record<string, number> = {};
    try {
      params = JSON.parse(hwCommandParams);
    } catch {
      toast.error("Paramètres invalides", { description: "Format JSON attendu, ex: {\"p7\": 30}" });
      return;
    }
    try {
      const r = await fetch(`/api/hardware/drones/${encodeURIComponent(hwCommandDroneId)}/command`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: remoteProjectId,
          command: hwCommand,
          confirmationToken: hwCommandToken.trim(),
          parameters: params,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok && body?.accepted) {
        toast.success(`Commande ${hwCommand} envoyée`, {
          description: `Drone ${hwCommandDroneId} · reçuId ${body?.receiptId}`,
        });
        // Consume the token: clear it.
        setHwCommandToken("");
        setHwIssuedToken("");
        void refreshHardware();
        void remoteAuditQuery.refetch();
      } else {
        toast.error("Commande refusée", { description: body?.error?.message ?? `HTTP ${r.status}` });
      }
    } catch (e: any) {
      toast.error("Réseau indisponible", { description: e?.message });
    }
  };

  const triggerEmergencyStop = async () => {
    if (!confirm("E-STOP : broadcaster NAV_LAND à TOUS les drones du pool ?")) return;
    try {
      const r = await fetch("/api/hardware/emergency-stop", {
        method: "POST",
        credentials: "include",
      });
      if (r.ok) {
        const body = await r.json();
        const stopped = Array.isArray(body?.results) ? body.results.length : 0;
        toast.warning(`E-stop déclenché`, { description: `${stopped} drone(s) notifiés · eventId ${body?.estopEventId ?? ""}` });
        void refreshHardware();
        void remoteAuditQuery.refetch();
      } else {
        toast.error("E-stop indisponible", { description: `HTTP ${r.status}` });
      }
    } catch (e: any) {
      toast.error("Réseau indisponible", { description: e?.message });
    }
  };

  const finishVirtualCommand = (receipt: any) => {
    const executed =
      receipt?.executed === true && receipt?.physicalCommandsEmitted === false;
    if (executed)
      setVirtualPosition(
        Number(receipt.positionDeg ?? scenario.positionSetpointDeg),
      );
    setHumanConfirmed(false);
    setSafetyConfirmed(false);
    const reason =
      typeof receipt?.reason === "string"
        ? receipt.reason
        : "Réponse de commande incomplète : aucune exécution confirmée.";
    setAudit((entries) => [
      {
        time: new Date().toLocaleTimeString("fr-FR"),
        type: executed ? "virtual.command.executed" : "virtual.command.refused",
        message: reason,
        status: executed ? "success" : "warning",
      },
      ...entries,
    ]);
    if (executed)
      toast.success("Consigne virtuelle appliquée", { description: reason });
    else toast.warning("Commande virtuelle refusée", { description: reason });
  };
  const commandMutation = trpc.labBench.validateCommand.useMutation({
    onSuccess(receipt) {
      if (pendingCommand.current !== JSON.stringify(scenario)) return;
      pendingCommand.current = null;
      if (
        receipt?.allowed === true &&
        receipt?.executed === false &&
        receipt?.virtualPreview === true &&
        receipt?.physicalCommandsEmitted === false
      ) {
        finishVirtualCommand({
          executed: true,
          physicalCommandsEmitted: false,
          positionDeg: receipt.positionDeg,
          reason: `Consigne ${receipt.positionDeg}° appliquée dans cet aperçu local après validation. Aucun contrôleur serveur commandé ; reçu local non persistant.`,
        });
      } else finishVirtualCommand(receipt);
    },
    onError(error) {
      setHumanConfirmed(false);
      setSafetyConfirmed(false);
      toast.error("Validation indisponible", { description: error.message });
    },
  });

  // The API response is authoritative. When it is absent, do not hydrate the
  // screen from localLabBenchStatus or any historical emulator defaults.
  const status = remoteProjectId && statusQuery.data
    ? normalizeLabBenchStatus(statusQuery.data)
    : null;
  const scenarioSignature = JSON.stringify(scenario);
  const rawLatestResult = localResult;
  const latestResult =
    rawLatestResult && runScenarioSignature === scenarioSignature
      ? rawLatestResult
      : null;
  const previewTemperatureC = Number(
    (
      scenario.ambientC +
      scenario.heaterPowerW *
        scenario.dutyCycle *
        scenario.thermalResistanceCPerW
    ).toFixed(2),
  );
  const previewTelemetry = scenarioUserProvided
    ? Array.from({ length: 12 }, (_, index) => ({
        sequence: index + 1,
        elapsedSeconds: Math.round((scenario.durationSeconds * (index + 1)) / 12),
        temperatureC: Number(
          (
            scenario.ambientC +
            (previewTemperatureC - scenario.ambientC) * ((index + 1) / 12)
          ).toFixed(2),
        ),
        positionDeg: scenario.positionSetpointDeg,
        quality: "synthetic",
      }))
    : [];
  const telemetry =
    Array.isArray(latestResult?.telemetry) && latestResult.telemetry.length > 0
      ? latestResult.telemetry
      : previewTelemetry;
  const averageTemperature = useMemo(
    () =>
      telemetry.length > 0
        ? telemetry.reduce((sum, sample) => sum + sample.temperatureC, 0) /
          telemetry.length
        : null,
    [telemetry],
  );
  const currentMode = modeItems.find((item) => item.id === mode)!;
  const registry = registryQuery.data;
  const registryRequirements = Array.isArray(registry?.requirements)
    ? registry.requirements
    : [];
  const registryDevices = Array.isArray(registry?.devices)
    ? registry.devices
    : [];
  const registryDrivers = Array.isArray(registry?.drivers)
    ? registry.drivers
    : [];
  const selectedRegistryDevice =
    registryDevices[0];
  const selectedRegistryDriver =
    registryDrivers.find((driver) =>
      String(driver?.name ?? "").includes("Device Gateway"),
    ) ?? registryDrivers[0];
  const statusServices = Array.isArray(status?.services) ? status.services : [];
  const statusRequirements = Array.isArray(status?.requirements)
    ? status.requirements
    : [];
  const catalogDevices = Array.isArray(status?.catalog) ? status.catalog : [];
  const auditEvents = Array.isArray(remoteAuditQuery.data)
    ? remoteAuditQuery.data
    : [];

  const currentZone = zoneOfView(view);

  const runLocalSimulation = () => {
    if (!scenarioUserProvided) {
      toast.error("Entrées utilisateur requises", {
        description: "Modifiez au moins une entrée du scénario avant tout calcul.",
      });
      return;
    }
    simulationMutation.reset();
    const result = calculateLocalLabBenchResult(scenario);
    setLocalResult(result);
    setRunScenarioSignature(JSON.stringify(scenario));
    setAudit((entries) => [
      {
        time: new Date().toLocaleTimeString("fr-FR"),
        type: "simulation.local.completed",
        message: `${result.runId} calculé localement à partir des entrées courantes ; aucune mesure physique.`,
        status: "info",
      },
      ...entries,
    ]);
    toast.success(`Simulation locale ${result.runId} terminée`, {
      description: `Température calculée : ${result.predictedTemperatureC.toFixed(2)} °C · preuve N2 synthétique.`,
    });
  };
  const runSimulation = () => {
    if (!scenarioUserProvided) {
      toast.error("Entrées utilisateur requises", {
        description: "LABBENCH n’exécute aucun scénario par défaut ou préchargé.",
      });
      return;
    }
    const error = validateLabBenchScenario(scenario);
    if (error) {
      toast.error("Paramètres hors plage", { description: error });
      return;
    }
    if (isLocalMode || !remoteProjectId) {
      // Use localRunSimulation which both computes AND advances the N2 gate
      localRunSimulation();
      return;
    }
    setLocalResult(null);
    simulationEpoch.current = projectEpoch.current;
    simulationMutation.mutate({ mode: "simulation", ...scenario });
  };
  const persistSimulation = () => {
    if (isLocalMode) {
      // Advance the N2 gate in local mode
      setLocalGateState((prev) => {
        const conditions = { ...prev.conditions, n2_run_archived: true };
        const gates = _resolvedGates(conditions);
        return { ...prev, conditions, gates, zoneProgress: _zoneProgress(gates), currentGate: (gates.find((g) => g.state !== "passed") ?? { code: "N4" }).code };
      });
      toast.success("Run N2 archivé (mode local)", { description: "Gate N2 validée. Vous pouvez maintenant compléter la checklist N3-READY." });
      return;
    }
    if (!remoteProjectId) {
      toast.error("Aucun projet authentifié", {
        description: "La persistance officielle exige un projet AeroMind.",
      });
      return;
    }
    if (!latestResult) {
      toast.error("Aucun run à archiver", {
        description: "Lancez d’abord une simulation.",
      });
      return;
    }
    persistSimulationMutation.mutate({ mode: "simulation", projectId: remoteProjectId, ...scenario });
  };
  const downloadReport = () => {
    if (!latestResult) {
      toast.error("Aucun run à exporter", {
        description: "Lancez d’abord une simulation.",
      });
      return;
    }
    const report = {
      title: "AeroMind LabBench 01 — rapport de simulation N2",
      exportedAt: new Date().toISOString(),
      project: selectedProject ?? null,
      inputs: latestResult.inputs,
      formula: latestResult.formula,
      result: latestResult,
      gateState: {
        currentGate: gateState.currentGate,
        conditions: gateState.conditions,
      },
      evidenceLevel: "N2 — simulation synthétique",
      physicalCommandsEmitted: false,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${latestResult.runId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Rapport JSON téléchargé", {
      description:
        "Le rapport conserve les entrées, la formule, l’incertitude et les limites.",
    });
  };
  const inspectLink = () => {
    setConnectionChecked(true);
    setAudit((entries) => [
      {
        time: new Date().toLocaleTimeString("fr-FR"),
        type: "gateway.identity.checked",
        message:
          `Source AeroMind vérifiée pour ${activeDroneLabel ?? "la configuration active"} ; aucune mesure physique revendiquée.`,
        status: "info",
      },
      ...entries,
    ]);
    toast.info("Identité de l’émulateur vérifiée", {
      description: "Aucun équipement réel n’est déclaré connecté.",
    });
  };
  const submitHardwareChecklist = () => {
    if (isLocalMode) { localCompleteChecklist(); return; }
    if (!remoteProjectId) {
      toast.error("Aucun projet authentifié", {
        description: "La checklist nécessite un projet AeroMind.",
      });
      return;
    }
    hardwareChecklistMutation.mutate({
      projectId: remoteProjectId,
      deviceIdentified: true,
      driverValidated: true,
      calibrationSimulated: true,
      physicalOutputEnabled: false,
    });
  };
  const openArmDialog = () => {
    if (isLocalMode) {
      if (!gateState.conditions.n3_ready) {
        toast.error("Gate N3-READY non atteinte", {
          description: "Complétez d'abord la checklist hardware.",
        });
        return;
      }
      setHumanConfirmed(false);
      setSafetyConfirmed(false);
      setSecondOperatorCode("");
      setArmDialogOpen(true);
      return;
    }
    if (!remoteProjectId) {
      toast.error("Aucun projet authentifié", {
        description: "L’armement N3 nécessite un projet AeroMind.",
      });
      return;
    }
    if (!gateState.conditions.n3_ready) {
      toast.error("Gate N3-READY non atteinte", {
        description: "Complétez d’abord la checklist hardware.",
      });
      return;
    }
    setHumanConfirmed(false);
    setSafetyConfirmed(false);
    setSecondOperatorCode("");
    setArmDialogOpen(true);
  };
  const confirmArm = () => {
    if (isLocalMode) { localArmN3(); return; }
    if (!remoteProjectId) {
      toast.error("Aucun projet authentifié");
      return;
    }
    if (!humanConfirmed || !safetyConfirmed) {
      toast.error("Double confirmation requise", {
        description: "Cochez les deux cases avant l’armement.",
      });
      return;
    }
    if (secondOperatorCode.trim().length < 6) {
      toast.error("Code second opérateur invalide", {
        description: "Saisir au moins 6 caractères.",
      });
      return;
    }
    armN3Mutation.mutate({
      projectId: remoteProjectId,
      humanConfirmed,
      safetyConfirmed,
      secondOperatorCode: secondOperatorCode.trim(),
      physicalOutputEnabled: false,
    });
  };
  const disarm = () => {
    if (isLocalMode) { localDisarmN3(); return; }
    if (!remoteProjectId) return;
    disarmN3Mutation.mutate({ projectId: remoteProjectId });
  };
  const openSignOffDialog = () => {
    if (isLocalMode) {
      if (!gateState.conditions.n3_armed) {
        toast.error("N3 doit être armé", { description: "Armez N3 avant la revue N4." });
        return;
      }
      setReviewer("");
      setReviewToken("");
      setReviewNote("");
      setSignOffDialogOpen(true);
      return;
    }
    if (!remoteProjectId) {
      toast.error("Aucun projet authentifié");
      return;
    }
    if (!gateState.conditions.n3_armed) {
      toast.error("N3 doit être armé", {
        description: "Armez N3 avant la revue indépendante N4.",
      });
      return;
    }
    setReviewer("");
    setReviewToken("");
    setReviewNote("");
    setSignOffDialogOpen(true);
  };
  const confirmSignOff = () => {
    if (isLocalMode) { localSignOffN4(); return; }
    if (!remoteProjectId) return;
    if (!reviewer.trim() || reviewToken.trim().length < 8) {
      toast.error("Revue invalide", {
        description: "Reviewer + jeton (≥ 8 caractères) requis.",
      });
      return;
    }
    signOffN4Mutation.mutate({
      projectId: remoteProjectId,
      reviewer: reviewer.trim(),
      reviewToken: reviewToken.trim(),
      note: reviewNote.trim(),
      physicalOutputEnabled: false,
    });
  };
  const prepareCommand = () => {
    if (
      mode !== "authorized" ||
      !humanConfirmed ||
      !safetyConfirmed ||
      validateLabBenchScenario(scenario)
    )
      return;
    const payload = {
      mode,
      command: "simulate.servo.setpoint",
      deviceConnected: false,
      humanConfirmed,
      safetyConfirmed,
      estopVerified: false,
      driverValidated: true,
      positionSetpointDeg: scenario.positionSetpointDeg,
      physicalOutputEnabled: false,
    };
    if (!remoteProjectId) {
      finishVirtualCommand({
        executed: true,
        physicalCommandsEmitted: false,
        positionDeg: scenario.positionSetpointDeg,
        reason: `Consigne ${scenario.positionSetpointDeg}° appliquée localement à l’émulateur après deux confirmations. Aucun matériel commandé ; reçu non persistant.`,
      });
      return;
    }
    pendingCommand.current = JSON.stringify(scenario);
    setHumanConfirmed(false);
    setSafetyConfirmed(false);
    commandMutation.mutate(payload);
  };
  const stopVirtualCommand = () => {
    pendingCommand.current = null;
    setVirtualPosition(null);
    setHumanConfirmed(false);
    setSafetyConfirmed(false);
    setMode("simulation");
    setAudit((entries) => [
      {
        time: new Date().toLocaleTimeString("fr-FR"),
        type: "virtual.stop",
        message:
          "Essai virtuel arrêté ; confirmations annulées, aucune reprise automatique.",
        status: "warning",
      },
      ...entries,
    ]);
  };

  // Modernized sidebar: group views by zone, show per-zone gate state.
  const renderSidebarNav = () => (
    <nav aria-label="Navigation LabBench 5 zones">
      {ZONE_GROUPS.map((group) => {
        const progress = gateState.zoneProgress.find(
          (zp) => zp.zone === group.id,
        );
        const allPassed = progress?.passed ?? false;
        return (
          <div key={group.id} className="lb-zone-group">
            <div className="lb-zone-header">
              <span className="lb-zone-label">{group.label}</span>
              {progress && (
                <span
                  className={`lb-zone-pill ${allPassed ? "is-passed" : progress.openCount > 0 ? "is-open" : "is-pending"}`}
                >
                  {allPassed ? (
                    <>
                      <CheckCircle2 size={11} /> Validé
                    </>
                  ) : progress.openCount > 0 ? (
                    <>
                      <CircleDot size={11} /> {progress.openCount} ouverte(s)
                    </>
                  ) : (
                    <>
                      <LockKeyhole size={11} /> En attente
                    </>
                  )}
                </span>
              )}
            </div>
            <div className="lb-zone-views">
              {group.views.map((item) => (
                <button
                  key={item.id}
                  className={`lb-nav-item ${view === item.id ? "is-active" : ""}`}
                  aria-current={view === item.id ? "page" : undefined}
                  onClick={() => setView(item.id)}
                >
                  <item.icon size={17} />
                  <span>
                    <strong>{item.label}</strong>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const renderGateProgressPanel = () => {
    if (view === "overview" || view === "audit") return null;
    return (
      <section className="lb-gate-strip" aria-label="Progression des gates LabBench">
        {gateState.gates.map((gate) => (
          <div key={gate.code} className={`lb-gate-strip-item lb-gate-${gate.state}`}>
            <span className="lb-gate-strip-code">{gate.code}</span>
            <span className="lb-gate-strip-label">{gate.label}</span>
            <GateBadge state={gate.state} />
          </div>
        ))}
      </section>
    );
  };

  // === v15 — Collaboration panel (multi-operator WebSocket) ===
  const realtime = useRealtimeSync(remoteProjectId);

  const CollaborationPanel = () => (
    <div className="lb-collab">
      <div className="lb-collab-status">
        <span className={realtime.connected ? "lb-text-good" : "lb-text-warning"}>
          <Wifi size={14} /> {realtime.connected ? "WebSocket connecté" : "WebSocket déconnecté (reconnexion auto)"}
        </span>
        <span>{realtime.operators.length} opérateur(s) en ligne</span>
      </div>

      <section className="lb-panel">
        <div className="lb-panel-title">
          <Users size={17} />
          <span>Opérateurs en ligne</span>
        </div>
        {realtime.operators.length === 0 ? (
          <p className="lb-empty-state">Aucun autre opérateur connecté.</p>
        ) : (
          <div className="lb-collab-operators">
            {realtime.operators.map((op) => (
              <div key={op.userId} className="lb-collab-operator">
                <span className="lb-collab-dot" />
                <div>
                  <strong>{op.userEmail}</strong>
                  <small>Connecté depuis {op.connectedAt?.slice(11, 19)}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="lb-panel">
        <div className="lb-panel-title">
          <History size={17} />
          <span>Flux d'événements live ({realtime.events.length})</span>
          <button className="lb-secondary" onClick={() => realtime.clearEvents()} style={{ marginLeft: "auto", fontSize: 10, padding: "4px 8px" }}>
            Effacer
          </button>
        </div>
        {realtime.events.length === 0 ? (
          <p className="lb-empty-state">Aucun événement reçu. Les actions des autres opérateurs apparaîtront ici en temps réel.</p>
        ) : (
          <div className="lb-collab-events">
            {realtime.events.slice().reverse().map((ev, i) => (
              <div key={i} className="lb-collab-event">
                <span className="lb-collab-event-time">{ev.timestamp?.slice(11, 19)}</span>
                <span className="lb-collab-event-type">{ev.type}</span>
                <span className="lb-collab-event-actor">{ev.actorEmail ?? "—"}</span>
                <span className="lb-collab-event-payload">{JSON.stringify(ev.payload).slice(0, 80)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  return (
    <main className={`labbench-shell lb-engineering-shell lb-presentation-shell ${integrated ? "lb-integrated-shell" : ""}`}>
      <aside className="lb-rail">
        <Link href="/?view=overview" className="lb-back">
          <ArrowLeft size={15} /> Vue d’ensemble AeroMind
        </Link>
        <div className="lb-brand">
          <span className="lb-mark">
            <i />
            <i />
            <i />
          </span>
          <div>
            <strong>AeroMind</strong>
            <span>LABBENCH 01 · v2</span>
          </div>
        </div>
        <div className="lb-rail-label">ENVIRONNEMENT D’ESSAI · 5 ZONES</div>
        {renderSidebarNav()}
        <div className="lb-rail-foot">
          <ShieldCheck size={17} />
          <span>
            <strong>Frontière de contrôle</strong>
            <small>
              Progression par gates · sorties physiques interdites
            </small>
          </span>
        </div>
      </aside>

      <section className="lb-main">
        <header className="lb-topbar">
          <div>
            <p className="lb-eyebrow">
              PROJET ACTIF · {status?.project?.code ?? "LABBENCH-01"} · ZONE {currentZone?.toUpperCase()}
            </p>
            <h1>{status?.project?.name ?? projectName ?? tKey("labbench.screen.title")}</h1>
            <small className="lb-integrated-context">
              Source unique : {projectName ?? "workspace AeroMind"} · cellule : {activeDroneLabel ?? "aucune sélection"}
            </small>
          </div>
          <div className="lb-top-status">
            <span className="lb-engineering-badge">
              <Activity size={12} /> MASTER ENGINEERING
            </span>
            <span className="lb-chip">
              <CircleDot size={14} /> Gate courant : {gateState.currentGate}
            </span>
            <span className="lb-lock">
              <LockKeyhole size={14} /> Sorties physiques verrouillées (par défaut)
            </span>
          </div>
        </header>
        <div className="lb-safety-banner">
          <ShieldCheck size={19} />
          <div>
            <strong>LabBench 01 — interface intégrée à AeroMind</strong>
            <span>
              Les sorties physiques sont verrouillées par défaut (HARDWARE_CONTROL=false).
              Le passage N1 → N2 → N3 → N4 se déverrouille par gates explicites.
              L’armement N3 exige une double confirmation humaine et un code second opérateur.
              L’activation des sorties physiques se fait via HARDWARE_CONTROL=true après validation HIL.
            </span>
          </div>
        </div>
        {storageError && (
          <p className="lb-note" role="status">
            Stockage navigateur indisponible : seules les données serveur AeroMind sont utilisées.
          </p>
        )}
        {statusQuery.isError && (
          <p className="lb-note" role="status">
            API LABBENCH indisponible : aucune donnée locale de remplacement n’est utilisée.
            Reconnectez le projet AeroMind pour rétablir la synchronisation.
          </p>
        )}
                {/* === Mode indicator (mirrors AeroMind Home.tsx) === */}
        <section className="lb-identity-panel" aria-label="Double identification AeroMind et LABBENCH 01">
          <div className="lb-identity-cell">
            <span className="lb-identity-kicker">IDENTITÉ 01 · AEROMIND</span>
            <strong>{meQuery.data?.email ?? meQuery.data?.name ?? "Session AeroMind requise"}</strong>
            <small>{remoteProjectId ? `Projet maître synchronisé · ${remoteProjectId}` : "Aucun projet serveur sélectionné"}</small>
          </div>
          <div className="lb-identity-divider" />
          <div className="lb-identity-cell">
            <span className="lb-identity-kicker">IDENTITÉ 02 · LABBENCH 01</span>
            <strong>{labSessionInfo ? "Session LABBENCH active" : "Step-up LABBENCH requis"}</strong>
            <small>{labSessionInfo ? `Rôles : ${labSessionInfo.roles.join(", ")} · expire ${new Date(labSessionInfo.expires_at).toLocaleTimeString("fr-FR")}` : "La seconde identification protège les vues et opérations sensibles."}</small>
          </div>
          <div className="lb-identity-actions">
            {!meQuery.data && (
              <button type="button" className="lb-secondary lb-entra-login" onClick={startLogin}>
                <KeyRound size={15} /> Se connecter via Microsoft Entra ID
              </button>
            )}
            {!labSessionInfo && remoteProjectId && (
              <div className="lb-stepup-form">
                <label htmlFor="labbench-stepup-code">Code TOTP à 6 chiffres</label>
                <div className="lb-stepup-controls">
                  <input id="labbench-stepup-code" aria-label="Code TOTP à 6 chiffres pour la seconde identification LABBENCH" value={labMfaCode} onChange={(event) => setLabMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000 000" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
                  <button className="lb-primary" disabled={labActivating || labMfaCode.length < 6} onClick={async () => {
                    setLabActivating(true); setLabActivationError(null);
                    try {
                      const session = await performStepUp(remoteProjectId, labMfaCode.trim(), ["reader", "analyst", "designer"], "step-up");
                      const info = { project_id: remoteProjectId, roles: ["reader", "analyst", "designer"], expires_at: session.expires_at };
                      setLabSessionInfo(info);
                      const active = await fetchActiveDrone(remoteProjectId, session.token);
                      setActiveDroneSync(active.active_drone ? { drone_name: active.active_drone.drone_name, revision: active.active_revision?.checksum ?? undefined, last_sync_at: active.last_sync_at } : { last_sync_at: active.last_sync_at });
                    } catch (error) { setLabActivationError(error instanceof Error ? error.message : "Activation LABBENCH impossible"); } finally { setLabActivating(false); }
                  }}>{labActivating ? "Activation…" : "Activer LABBENCH"}</button>
                </div>
              </div>
            )}
            {!labSessionInfo && <button type="button" className="lb-stepup-help-button" onClick={() => setStepUpHelpOpen((open) => !open)} aria-expanded={stepUpHelpOpen}><Info size={15} /> Comment obtenir ce code ?</button>}
          </div>
        </section>
        {stepUpHelpOpen && !labSessionInfo && (
          <section className="lb-stepup-help" aria-label="Aide de seconde identification LABBENCH">
            <Info size={18} />
            <div>
              <strong>Le Step-up est la seconde identification de LABBENCH 01.</strong>
              <p>Connectez-vous d’abord à AeroMind, puis saisissez ici le code TOTP à 6 chiffres affiché par votre application d’authentification (Aegis, Google Authenticator, Microsoft Authenticator ou équivalent). Ce n’est ni le mot de passe AeroMind, ni le code de rapport.</p>
              <p>Si aucun code n’est encore configuré pour {meQuery.data?.email ?? "votre compte"}, ouvrez la console Super-Admin et utilisez <b>Préparer mon accès local MFA</b> ou l’activation de compte. Scannez ou copiez la clé TOTP dans votre application, validez l’enrôlement, puis revenez ici. La session LABBENCH est temporaire et expire après 15 minutes.</p>
            </div>
          </section>
        )}
        {labActivationError && <p className="lb-note lb-text-danger" role="alert">{labActivationError}</p>}
        {!serverDataReady ? (
          <section className="lb-server-lock lb-panel" role="status">
            {integratedSurface ? <Database size={20} /> : <LockKeyhole size={20} />}
            <div>
              <strong>
                {integratedSurface
                  ? "LABBENCH prêt — aucune donnée utilisateur intégrée"
                  : "LABBENCH verrouillé — données serveur requises"}
              </strong>
              <span>
                {integratedSurface
                  ? "Sélectionnez une cellule dans la Bibliothèque ou importez un dessin utilisateur dans AeroMind. Aucun chiffre, résultat, scénario ou émulateur n’est pris en compte avant cette action."
                  : "Aucune vue, simulation, télémétrie ou commande locale de remplacement n’est affichée. Ouvrez AeroMind et sélectionnez un projet serveur réel pour continuer."}
              </span>
              <Link href="/" className="lb-secondary">Ouvrir AeroMind</Link>
            </div>
          </section>
        ) : (
          <>
        <div className="lb-local-mode-banner lb-remote-banner"><ShieldCheck size={16} /><span><strong>Source AeroMind synchronisée</strong></span></div>
        {remoteProjectId && activeDroneSync && <div className="lb-sync-strip"><Database size={15} /><span>Dernière synchronisation : {activeDroneSync.last_sync_at ? new Date(activeDroneSync.last_sync_at).toLocaleString("fr-FR") : "—"}</span><span>Drone actif : {activeDroneSync.drone_name ?? "aucun"}</span><span>Révision : {activeDroneSync.revision ? activeDroneSync.revision.slice(0, 12) : "—"}</span></div>}
        <section
          className="lb-panel"
          aria-label="Configuration drone active du projet"
        >
          <div className="lb-panel-title">
            <Cpu size={17} />
            <span>Drone actif du projet</span>
            <small>
              {activeDroneConfig
                ? "CONFIGURATION SYNCHRONISÉE"
                : "CONFIGURATION INDISPONIBLE"}
            </small>
          </div>
          {activeDroneConfig ? (
            <p>
              {String(activeDroneConfig.airframe ?? "Non renseigné")} ·{" "}
              {String(activeDroneConfig.motorCount ?? "—")} moteurs ·{" "}
              {String(
                activeDroneConfig.massKg ?? activeDroneConfig.mass_kg ?? "—",
              )}{" "}
              kg · batterie{" "}
              {String(
                activeDroneConfig.batteryWh ??
                  activeDroneConfig.battery_wh ??
                  "—",
              )}{" "}
              Wh
            </p>
          ) : (
            <p>
              La configuration est chargée depuis le projet authentifié actif.
              Les essais du LabBench restent des paramètres distincts.
            </p>
          )}
        </section>
        {renderGateProgressPanel()}
        <section className="lb-mode-row" aria-label="Mode de travail">
          {modeItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === "authorized" && !gateState.conditions.n3_armed) {
                  toast.error("Armement N3 requis", {
                    description: "Armez N3 depuis le banc de test pour activer la commande supervisée.",
                  });
                  return;
                }
                pendingCommand.current = null;
                setMode(item.id);
                setHumanConfirmed(false);
                setSafetyConfirmed(false);
              }}
              className={`lb-mode ${mode === item.id ? "is-active" : ""}`}
              aria-disabled={item.id === "authorized" && !gateState.conditions.n3_armed}
            >
              <span>{item.eyebrow}</span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </button>
          ))}
        </section>
        <section
          className="lb-instrument-strip"
          aria-label="État instrumenté du LabBench"
        >
          <div>
            <small>GATE COURANT</small>
            <strong>{gateState.currentGate}</strong>
            <span>
              {status?.project?.code ?? "LABBENCH-01"} ·{" "}
              {status?.project?.proofLevel ?? "N2 — Simulation"}
            </span>
          </div>
          <div>
            <small>DERNIER RUN</small>
            <strong>{latestResult?.runId ?? "EN ATTENTE"}</strong>
            <span>
              {latestResult
                ? `Verdict ${latestResult.verdict.toUpperCase()}`
                : "Aucun calcul exécuté"}
            </span>
          </div>
          <div>
            <small>CANAL TÉLÉMÉTRIE</small>
            <strong>{telemetry.length} échantillons</strong>
            <span>
              {latestResult
                ? "Run courant · données simulées"
                : "Prévisualisation synthétique"}
            </span>
          </div>
          <div>
            <small>HARDWARE_CONTROL</small>
            <strong className="lb-text-warning">VERROUILLÉE</strong>
            <span>Par défaut — s'active après validation HIL</span>
          </div>
        </section>

        {view === "projects" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="RATTACHEMENT OFFICIEL"
              title="Projets et versions LabBench"
              detail="Chaque exigence, run, télémétrie, rapport et audit doit être rattaché à un projet propriétaire ; le mode aperçu ne crée aucune preuve serveur."
            />
            <section className="lb-panel lb-projects-panel">
              <div className="lb-panel-title">
                <FolderKanban size={17} />
                <span>Projets accessibles</span>
                <small>
                    {meQuery.data && remoteProjects.length ? "AUTHENTIFIÉ" : "SERVEUR INDISPONIBLE"}
                </small>
              </div>
              {meQuery.isLoading ? (
                <p className="lb-empty-state">
                  Vérification de l’identité en cours…
                </p>
              ) : projects.length === 0 ? (
                <div className="lb-empty-state">
                  <strong>Aucun projet authentifié sélectionné</strong>
                  <span>
                    LABBENCH reste verrouillé tant qu’un projet AeroMind
                    serveur réel n’est pas disponible.
                  </span>
                  <Link href="/" className="lb-secondary">
                    Créer ou ouvrir un projet
                  </Link>
                </div>
              ) : (
                <div className="lb-project-list">
                  {projects.map((project) => {
                    const id = String(project.id);
                    const selected = id === selectedProjectId;
                    return (
                      <button
                        key={id}
                        className={`lb-project-row ${selected ? "is-selected" : ""}`}
                        onClick={() => {
                          setActiveProjectId(id);
                          setView("overview");
                        }}
                      >
                        <div>
                          <strong>{project.project.name}</strong>
                          <small>
                            {project.project.status} · version{" "}
                            {project.project.version}
                          </small>
                        </div>
                        <span>
                          {selected ? "Projet actif" : "Sélectionner"}
                        </span>
                        <ChevronRight size={15} />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
            <section className="lb-note">
              <ShieldCheck size={18} />
              <div>
                <strong>Règle de preuve.</strong>
                <span>
                  Changer de projet change uniquement la cible de
                  lecture/archivage. Cela n’active jamais une passerelle et ne
                  modifie aucune permission.
                </span>
              </div>
            </section>
          </div>
        )}

        {view === "overview" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="CHAÎNE DE PREUVE MODERNE"
              title="Progression par gates — LabBench 01 v2"
              detail="Le niveau actuel est calculé à partir des preuves serveur (registre, runs archivés, checklist, armement, revue) — jamais d’une étiquette d’interface."
            />
            <div className="lb-gate-track">
              {gateState.gates.map((gate, index) => (
                <div
                  className={`lb-gate-card lb-gate-${gate.state}`}
                  key={gate.code}
                >
                  <div className="lb-gate-card-head">
                    <span className="lb-gate-card-code">{gate.code}</span>
                    {index < gateState.gates.length - 1 && <i />}
                  </div>
                  <div className="lb-gate-card-body">
                    <strong>{gate.label}</strong>
                    <small>{gate.description}</small>
                  </div>
                  <div className="lb-gate-card-state">
                    <GateBadge state={gate.state} />
                  </div>
                  <div className="lb-gate-card-conditions">
                    {gate.requiredConditions.map((cond) => (
                      <span
                        key={cond}
                        className={`lb-gate-cond ${gate.conditions[cond] ? "is-met" : "is-missing"}`}
                      >
                        {gate.conditions[cond] ? (
                          <CheckCircle2 size={11} />
                        ) : (
                          <XCircle size={11} />
                        )}
                        {cond}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="lb-overview-grid">
              <section className="lb-panel lb-services">
                <div className="lb-panel-title">
                  <Database size={17} />
                  <span>État réel des services</span>
                </div>
                {statusServices.length === 0 ? (
                  <div className="lb-empty-state">
                    <strong>Aucun service issu d’une donnée utilisateur.</strong>
                    <span>Les données de démonstration et les identités d’émulateur sont exclues.</span>
                  </div>
                ) : statusServices.map((service) => (
                  <div className="lb-service-row" key={service.id}>
                    <div>
                      <strong>{service.label}</strong>
                      <small>{service.detail}</small>
                    </div>
                    <ServiceState state={service.state} />
                  </div>
                ))}
              </section>
              <section className="lb-panel lb-measure-panel">
                <div className="lb-panel-title">
                  <Thermometer size={17} />
                  <span>Télémétrie du scénario</span>
                  <small>
                    {latestResult
                      ? "RUN UTILISATEUR"
                      : scenarioUserProvided
                        ? "ENTRÉES UTILISATEUR · NON EXÉCUTÉ"
                        : "AUCUNE DONNÉE"}
                  </small>
                </div>
                <div className="lb-measures">
                  <div>
                    <span>Température moyenne</span>
                    <strong>
                      {averageTemperature == null ? "—" : averageTemperature.toFixed(1)}
                      {averageTemperature == null ? null : <em> °C</em>}
                    </strong>
                    <small>{latestResult ? "trames du run utilisateur" : "aucune mesure calculée"}</small>
                  </div>
                  <div>
                    <span>Position consigne</span>
                    <strong>
                      {scenarioUserProvided ? scenario.positionSetpointDeg : "—"}
                      {scenarioUserProvided ? <em> °</em> : null}
                    </strong>
                    <small>{scenarioUserProvided ? "consigne saisie par l’utilisateur" : "aucune consigne intégrée"}</small>
                  </div>
                  <div>
                    <span>Échantillons</span>
                    <strong>{telemetry.length}</strong>
                    <small>
                      {latestResult
                        ? "trames du dernier run utilisateur"
                        : scenarioUserProvided
                          ? "aucun run exécuté"
                          : "aucune donnée utilisateur"}
                    </small>
                  </div>
                </div>
                <div
                  className="lb-chart"
                  aria-label="Courbe de télémétrie synthétique calculée depuis le scénario"
                >
                  {telemetry.map((point, index) => (
                    <span
                      key={point.sequence}
                      style={{
                        height: `${Math.max(18, ((point.temperatureC - Math.min(scenario.ambientC, previewTemperatureC - 1)) / Math.max(1, Math.abs(previewTemperatureC - scenario.ambientC) + 2)) * 100)}%`,
                        opacity: 0.45 + index / 24,
                      }}
                    >
                      <b>{point.temperatureC}</b>
                    </span>
                  ))}
                </div>
              </section>
              <section className="lb-panel lb-gates">
                <div className="lb-panel-title">
                  <ClipboardCheck size={17} />
                  <span>Portes de passage</span>
                </div>
                {[
                  ["Modèle et exigences versionnés", gateState.conditions.registry_initialized],
                  ["Calcul documenté et rejouable", gateState.conditions.n2_run_archived],
                  ["Matériel physique identifié (checklist)", gateState.conditions.hardware_checklist_complete],
                  ["Armement N3 supervisé (double confirmation)", gateState.conditions.n3_armed],
                  ["Revue indépendante terminée", gateState.conditions.independent_review_signed],
                ].map(([label, passed]) => (
                  <div className="lb-gate" key={String(label)}>
                    {passed ? (
                      <CheckCircle2 size={17} />
                    ) : (
                      <XCircle size={17} />
                    )}
                    <span>{String(label)}</span>
                    <strong>{passed ? "Réussi" : "Requis"}</strong>
                  </div>
                ))}
              </section>
            </div>
            <section className="lb-panel lb-boundary">
              <div>
                <p className="lb-eyebrow">CONTRAT DEVICE GATEWAY</p>
                <h3>Une intention n’est jamais une commande matérielle.</h3>
                <p>
                  Entrées structurées, limites de type et de plage, permissions,
                  liste blanche, journal d’erreur et retour à l’état sûr sont
                  appliqués avant toute future intégration d’adaptateur.
                  L’armement N3 n’ouvre qu’un aperçu virtuel supervisé.
                </p>
              </div>
              <div className="lb-boundary-list">
                <span>
                  <CheckCircle2 size={15} /> Lecture seule par défaut
                </span>
                <span>
                  <CheckCircle2 size={15} /> IA sans droit de commande
                </span>
                <span>
                  <CheckCircle2 size={15} /> Émulateur avant banc physique
                </span>
                <span>
                  <CheckCircle2 size={15} /> Armement à double confirmation
                </span>
              </div>
            </section>
          </div>
        )}

        {view === "requirements" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="RÉFÉRENTIEL"
              title="Exigences et critères d’acceptation"
              detail="Chaque limite doit conserver une source et un critère ; les seuils physiques non choisis restent explicitement ouverts."
            />
            <section className="lb-panel lb-table-panel">
              <div className="lb-panel-title">
                <ClipboardCheck size={17} />
                <span>
                  {registry
                    ? `Référentiel persistant · ${registryRequirements.length} exigence(s)`
                    : "Référentiel de référence · aperçu"}
                </span>
              </div>
              <div className="lb-table lb-requirements-table">
                <div className="lb-table-head">
                  <span>Code</span>
                  <span>Fonction / limite</span>
                  <span>Source</span>
                  <span>Critère d’acceptation</span>
                  <span>État</span>
                </div>
                {(registryRequirements.length
                  ? registryRequirements
                  : statusRequirements
                ).map((requirement) => (
                  <div className="lb-table-row" key={requirement.code}>
                    <strong>{requirement.code}</strong>
                    <span>
                      <b>{requirement.title}</b>
                      <small>
                        {requirementLimit(requirement)} {requirement.unit}
                      </small>
                    </span>
                    <span>{requirement.source}</span>
                    <span>{requirementAcceptance(requirement)}</span>
                    <span
                      className={`lb-requirement-state is-${requirement.status}`}
                    >
                      {requirement.status === "approved"
                        ? "Approuvée"
                        : "À revoir"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
            <section className="lb-note">
              <TriangleAlert size={18} />
              <div>
                <strong>Aucune tolérance universelle n’est inventée.</strong>
                <span>
                  {registry
                    ? "Ces exigences sont lues depuis le projet actif et restent traçables par propriétaire."
                    : "Sélectionnez un projet authentifié pour initialiser et relire le référentiel persistant."}
                </span>
              </div>
            </section>
          </div>
        )}

        {view === "simulation" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="MOTEUR D’INGÉNIERIE"
              title="Simulation thermique reproductible"
              detail="Le moteur est déterministe, ses entrées sont bornées et le résultat conserve une version, une formule et une empreinte. L’archivage serveur valide la gate N2."
              actions={
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="lb-secondary"
                    onClick={persistSimulation}
                    disabled={(!remoteProjectId && !isLocalMode) || !latestResult || persistSimulationMutation.isPending || gateState.conditions.n2_run_archived}
                  >
                    <Archive size={14} />
                    {persistSimulationMutation.isPending ? "Archivage…" : "Archiver le run (N2)"}
                  </button>
                  <button
                    className="lb-primary"
                    disabled={
                      simulationMutation.isPending ||
                      !scenarioUserProvided ||
                      Boolean(validateLabBenchScenario(scenario))
                    }
                    onClick={runSimulation}
                  >
                    <Play size={15} />
                    {simulationMutation.isPending
                      ? "Calcul en cours…"
                      : scenarioUserProvided
                        ? "Exécuter la simulation"
                        : "Saisir des données pour calculer"}
                  </button>
                </div>
              }
            />
            <div className="lb-simulation-grid">
              <section className="lb-panel">
                <div className="lb-panel-title">
                  <SlidersHorizontal size={17} />
                  <span>Entrées contrôlées</span>
                </div>
                <div className="lb-definition-list">
                  <label>
                    <dt>Température ambiante (°C)</dt>
                    <input
                      type="number"
                      min={-10}
                      max={50}
                      step={0.5}
                      value={scenario.ambientC}
                      onChange={(event) =>
                        updateScenario({ ambientC: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <dt>Puissance chauffage (W)</dt>
                    <input
                      type="number"
                      min={0}
                      max={12}
                      step={0.5}
                      value={scenario.heaterPowerW}
                      onChange={(event) =>
                        updateScenario({ heaterPowerW: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <dt>Rapport cyclique (0–1)</dt>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={scenario.dutyCycle}
                      onChange={(event) =>
                        updateScenario({ dutyCycle: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <dt>Résistance thermique (°C/W)</dt>
                    <input
                      type="number"
                      min={0.1}
                      max={12}
                      step={0.1}
                      value={scenario.thermalResistanceCPerW}
                      onChange={(event) =>
                        updateScenario({
                          thermalResistanceCPerW: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    <dt>Consigne simulée (°)</dt>
                    <input
                      type="number"
                      min={0}
                      max={90}
                      step={1}
                      value={scenario.positionSetpointDeg}
                      onChange={(event) =>
                        updateScenario({ positionSetpointDeg: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <dt>Durée (s)</dt>
                    <input
                      type="number"
                      min={1}
                      max={3600}
                      step={1}
                      value={scenario.durationSeconds}
                      onChange={(event) =>
                        updateScenario({ durationSeconds: Number(event.target.value) })
                      }
                    />
                  </label>
                </div>
              </section>
              <section className="lb-panel lb-simulation-result">
                <div className="lb-panel-title">
                  <Activity size={17} />
                  <span>Résultat & incertitude</span>
                  <small>
                    {latestResult
                      ? latestResult.engineVersion?.includes("local")
                        ? "RUN LOCAL"
                        : "RUN API"
                      : scenarioUserProvided
                        ? "ENTRÉES UTILISATEUR"
                        : "AUCUNE DONNÉE"}
                  </small>
                </div>
                <div className="lb-result-number">
                  <span>
                    {latestResult
                      ? "Température du dernier run utilisateur"
                      : "Aucun résultat calculé"}
                  </span>
                  <strong>
                    {latestResult ? latestResult.predictedTemperatureC : "—"}
                    {latestResult ? <em> °C</em> : null}
                  </strong>
                  <small>
                    {latestResult
                      ? `Incertitude estimée ± ${latestResult.uncertaintyC} °C`
                      : "Aucune incertitude avant exécution"}
                  </small>
                </div>
                <div className="lb-formula">
                  T = T<sub>amb</sub> + (P × duty) × Rθ
                </div>
                <div className="lb-result-meta">
                  <span>
                    Version moteur{" "}
                    <b>{latestResult?.engineVersion ?? "Aucun moteur exécuté"}</b>
                  </span>
                  <span>
                    Verdict{" "}
                    <b
                      className={latestResult?.verdict === "review" ? "lb-text-warning" : "lb-text-good"}
                    >
                      {latestResult
                        ? latestResult.verdict === "review"
                          ? "À revoir"
                          : "Scénario conforme"
                        : "Aucun verdict"}
                    </b>
                  </span>
                </div>
                <div className="lb-gate-inline">
                  <span>
                    Gate N2 —{" "}
                    {gateState.conditions.n2_run_archived ? (
                      <strong className="lb-text-good">PASSÉE (run archivé)</strong>
                    ) : (
                      <strong className="lb-text-warning">OUVERTE — archivez le run pour la valider</strong>
                    )}
                  </span>
                </div>
              </section>
            </div>
            <section className="lb-note">
              <AlertTriangle size={18} />
              <div>
                <strong>Limite de modèle.</strong>
                <span>
                  Cette simulation utilise des données synthétiques et ne
                  constitue ni une mesure physique, ni un jumeau numérique
                  calibré, ni une autorisation d’actionner du matériel.
                  L’archivage serveur persiste le run et déclenche la gate N2.
                </span>
              </div>
            </section>
          </div>
        )}

        {view === "hardware" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="REGISTRES N3 · CHECKLIST CONFORMITÉ"
              title="Hardware & Drivers — checklist simulée"
              detail="La checklist est simulée : elle ne commande aucun appareil réel. Sa complétude déclenche la gate N3-READY et autorise l’armement N3."
              actions={
                <button
                  className="lb-primary"
                  onClick={submitHardwareChecklist}
                  disabled={(!remoteProjectId && !isLocalMode) || hardwareChecklistMutation.isPending}
                >
                  <ClipboardCheck size={15} />
                  {hardwareChecklistMutation.isPending ? "Enregistrement…" : "Compléter la checklist (N3-READY)"}
                </button>
              }
            />
            <div className="lb-hardware-grid">
              <section className="lb-panel">
                <div className="lb-panel-title">
                  <ClipboardCheck size={17} />
                  <span>Checklist conformité matérielle (simulée)</span>
                </div>
                <div className="lb-checklist">
                  <div className={`lb-checklist-item ${gateState.hardwareChecklist.deviceIdentified ? "is-met" : "is-missing"}`}>
                    {gateState.hardwareChecklist.deviceIdentified ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                    <div>
                      <strong>Identité appareil vérifiée</strong>
                      <small>{activeDroneLabel ? `Configuration ${activeDroneLabel} issue du workspace.` : "Aucune identité utilisateur renseignée."}</small>
                    </div>
                    <span>{gateState.hardwareChecklist.deviceIdentified ? "Validé" : "Requis"}</span>
                  </div>
                  <div className={`lb-checklist-item ${gateState.hardwareChecklist.driverValidated ? "is-met" : "is-missing"}`}>
                    {gateState.hardwareChecklist.driverValidated ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                    <div>
                      <strong>Pilote validé</strong>
                      <small>AeroMind Device Gateway · liste blanche de commandes lecture seule.</small>
                    </div>
                    <span>{gateState.hardwareChecklist.driverValidated ? "Validé" : "Requis"}</span>
                  </div>
                  <div className={`lb-checklist-item ${gateState.hardwareChecklist.calibrationSimulated ? "is-met" : "is-missing"}`}>
                    {gateState.hardwareChecklist.calibrationSimulated ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                    <div>
                      <strong>Calibration simulée exécutée</strong>
                      <small>Capteurs TMP-01 et POS-02 initialisés en synthétique.</small>
                    </div>
                    <span>{gateState.hardwareChecklist.calibrationSimulated ? "Validé" : "Requis"}</span>
                  </div>
                  <div className={`lb-checklist-item ${gateState.conditions.n3_ready ? "is-met" : "is-missing"}`}>
                    {gateState.conditions.n3_ready ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                    <div>
                      <strong>Gate N3-READY atteinte</strong>
                      <small>Conditions : registre + run N2 + checklist complète.</small>
                    </div>
                    <span>{gateState.conditions.n3_ready ? "Réussi" : "En attente"}</span>
                  </div>
                </div>
              </section>
              <section className="lb-panel">
                <div className="lb-panel-title">
                  <Cpu size={17} />
                  <span>Registre appareil</span>
                  <ServiceState state={selectedRegistryDevice ? "simulated" : "limited"} />
                </div>
                <div className="lb-asset-name">
                  <span>
                    {selectedRegistryDevice?.deviceCode ?? "Aucune donnée importée"}
                  </span>
                  <strong>
                    {selectedRegistryDevice?.model ??
                      status?.device?.model ??
                      "Non renseigné"}
                  </strong>
                  <small>
                    {selectedRegistryDevice?.manufacturer ??
                      status?.device?.manufacturer ??
                      "Non renseigné"}
                  </small>
                </div>
                <dl className="lb-definition-list">
                  <div>
                    <dt>Révision matérielle</dt>
                    <dd>
                      {selectedRegistryDevice?.hardwareRevision ??
                        status?.device?.hardwareRevision ??
                        "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Firmware</dt>
                    <dd>
                      {selectedRegistryDevice?.firmwareVersion ??
                        status?.device?.firmwareVersion ??
                        "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Interfaces</dt>
                    <dd>
                      {selectedRegistryDevice
                        ? registryFieldLabels(
                            selectedRegistryDevice.interfacesJson,
                          )
                        : (Array.isArray(status?.device?.interfaces)
                            ? status.device.interfaces.join(" · ")
                            : "") || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Limites</dt>
                    <dd>
                      {selectedRegistryDevice
                        ? registryFieldLabels(selectedRegistryDevice.limitsJson)
                        : (Array.isArray(status?.device?.limits)
                            ? status.device.limits.join(" · ")
                            : "") || "—"}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
            <HardwareControlPanel />
            <LabBenchHardwareConfig />
            <section className="lb-panel lb-protocol">
              <div>
                <p className="lb-eyebrow">PROTOCOLE D’INTÉGRATION</p>
                <h3>
                  Adapter → contrat commun → passerelle → contrôleur
                  déterministe
                </h3>
              </div>
              <div className="lb-protocol-steps">
                <span>1. Identité</span>
                <ChevronRight size={15} />
                <span>2. Type & unité</span>
                <ChevronRight size={15} />
                <span>3. Plage</span>
                <ChevronRight size={15} />
                <span>4. Permission</span>
                <ChevronRight size={15} />
                <span>5. Journal</span>
              </div>
            </section>
            <LabBenchPersistencePanel
              projectId={remoteProjectId}
              scenario={scenario}
              result={latestResult}
              onArchived={(archived) => {
                if (
                  archived.projectId !== remoteProjectId ||
                  JSON.stringify(archived.inputs) !== JSON.stringify(scenario)
                )
                  return;
                setLocalResult(archived);
                setRunScenarioSignature(JSON.stringify(archived.inputs));
                void remoteAuditQuery.refetch();
                void gateStateQuery.refetch();
              }}
            />
          </div>
        )}

        {view === "bench" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="BANC DE TEST · ARMEMENT N3"
              title="Procédure d’armement supervisée"
              detail={`${currentMode.label} — ${currentMode.detail}. L’armement exige la gate N3-READY, une double confirmation humaine et un code second opérateur.`}
              actions={
                <div style={{ display: "flex", gap: 8 }}>
                  {gateState.conditions.n3_armed ? (
                    <button
                      className="lb-secondary"
                      onClick={disarm}
                      disabled={disarmN3Mutation.isPending}
                    >
                      <LockKeyhole size={15} />
                      {disarmN3Mutation.isPending ? "Désarmement…" : "Désarmer N3"}
                    </button>
                  ) : (
                    <button
                      className="lb-primary"
                      onClick={openArmDialog}
                      disabled={!gateState.conditions.n3_ready}
                    >
                      <Unlock size={15} />
                      Armer N3 (double confirmation)
                    </button>
                  )}
                </div>
              }
            />
            <div className="lb-bench-grid">
              <section className="lb-panel lb-console">
                <div className="lb-panel-title">
                  <Radio size={17} />
                  <span>Liaison & télémétrie</span>
                  <ServiceState
                    state={connectionChecked ? "simulated" : "limited"}
                  />
                </div>
                <div className="lb-console-status">
                  <Wifi size={24} />
                  <div>
                    <strong>
                      {connectionChecked
                        ? "Émulateur identifié"
                        : "Liaison non vérifiée"}
                    </strong>
                    <small>
                      {connectionChecked
                        ? `${activeDroneLabel ?? "Configuration AeroMind active"} · transport virtuel seulement`
                        : "Diagnostic virtuel disponible sans matériel"}
                    </small>
                  </div>
                </div>
                <button className="lb-secondary" onClick={inspectLink}>
                  Vérifier l’identité de l’émulateur
                </button>
                <div className="lb-telemetry-list">
                  {telemetry
                    .slice(-5)
                    .reverse()
                    .map((point) => (
                      <div key={point.sequence}>
                        <span>
                          #{String(point.sequence).padStart(2, "0")} ·{" "}
                          {point.elapsedSeconds}s
                        </span>
                        <strong>{point.temperatureC} °C</strong>
                        <small>
                          {point.quality === "validated"
                            ? "validé"
                            : "synthétique"}
                        </small>
                      </div>
                    ))}
                </div>
              </section>
              <section className="lb-panel lb-command-panel">
                <div className="lb-panel-title">
                  <LockKeyhole size={17} />
                  <span>Commande supervisée {gateState.conditions.n3_armed ? "(ARMÉE)" : "(VERROUILLÉE)"}</span>
                </div>
                <div className="lb-command-readout">
                  <span>Commande structurée</span>
                  <strong>simulate.servo.setpoint</strong>
                  <small>
                    {scenario.positionSetpointDeg}° · plage autorisée 0–90° ·
                    {gateState.conditions.n3_armed ? " armée virtuellement" : " armement requis"}
                  </small>
                </div>
                <label className="lb-confirm">
                  <input
                    type="checkbox"
                    checked={humanConfirmed}
                    onChange={(event) =>
                      setHumanConfirmed(event.target.checked)
                    }
                    disabled={mode !== "authorized"}
                  />
                  <span>
                    Je confirme cette consigne exacte :{" "}
                    {scenario.positionSetpointDeg}°.
                  </span>
                </label>
                <label className="lb-confirm">
                  <input
                    type="checkbox"
                    checked={safetyConfirmed}
                    onChange={(event) =>
                      setSafetyConfirmed(event.target.checked)
                    }
                    disabled={mode !== "authorized"}
                  />
                  <span>
                    Je confirme le périmètre exclusivement virtuel et la
                    possibilité d’arrêt immédiat.
                  </span>
                </label>
                <div className="lb-command-checks">
                  <span>
                    <CheckCircle2 size={15} /> Aucun équipement réel commandé
                  </span>
                  <span>
                    <CheckCircle2 size={15} /> Arrêt virtuel disponible
                    immédiatement
                  </span>
                  <span>
                    <CheckCircle2 size={15} /> Pilote simulateur : validé
                  </span>
                </div>
                <button
                  className="lb-primary lb-command-button"
                  disabled={
                    mode !== "authorized" ||
                    !humanConfirmed ||
                    !safetyConfirmed ||
                    commandMutation.isPending ||
                    Boolean(validateLabBenchScenario(scenario))
                  }
                  onClick={prepareCommand}
                >
                  <LockKeyhole size={15} />
                  {commandMutation.isPending
                    ? "Vérification…"
                    : "Appliquer la consigne virtuelle"}
                </button>
                <p role="status">
                  Position de l’aperçu local :{" "}
                  {virtualPosition == null
                    ? "aucune consigne active"
                    : `${virtualPosition}°`}
                  . Les confirmations sont consommées après chaque action et
                  annulées si les paramètres changent.
                </p>
                <button className="lb-secondary" onClick={stopVirtualCommand}>
                  Arrêter l’essai virtuel — un clic
                </button>
                <p>
                  Deux confirmations distinctes par le même opérateur ; ce
                  panneau ne remplace pas la revue indépendante du centre de
                  commande. L’armement N3 persiste côté serveur et reste
                  traçable dans le journal d’audit.
                </p>
              </section>
            </div>
            {!gateState.conditions.n3_ready && (
              <section className="lb-note">
                <AlertTriangle size={18} />
                <div>
                  <strong>N3-READY non atteinte.</strong>
                  <span>
                    Complétez d’abord la checklist hardware depuis la zone 03.
                    L’armement n’est disponible qu’après la gate N3-READY.
                  </span>
                </div>
              </section>
            )}
            {gateState.conditions.n3_armed && !gateState.conditions.independent_review_signed && (
              <section className="lb-note lb-note-info">
                <ShieldCheck size={18} />
                <div>
                  <strong>N4 disponible.</strong>
                  <span>
                    N3 est armée. La revue indépendante N4 peut être signée
                    depuis la zone 05 (Preuves & Audit) pour clore la
                    progression.
                  </span>
                </div>
              </section>
            )}
          </div>
        )}

        {view === "fleet" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="MULTI-DRONES · FLOTTE PARALLÈLE"
              title="Pilotage multi-drones — LabBench 01 v3"
              detail="Chaque drone a sa propre progression de gates (N1 → N4). N3 peut être armé indépendamment par drone. La simulation de flotte archive un run N2 par drone en parallèle."
              actions={
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="lb-secondary"
                    onClick={addDroneToProject}
                    disabled={!remoteProjectId && !isLocalMode}
                  >
                    <Activity size={14} /> Ajouter un drone
                  </button>
                  <button
                    className="lb-primary"
                    onClick={runFleetSimulationAll}
                    disabled={(!remoteProjectId && !isLocalMode) || fleetDrones.length === 0 || fleetDrones.some((drone) => !fleetDroneScenarios[drone.id]) || fleetSimMutation.isPending}
                  >
                    <Play size={14} />
                    {fleetSimMutation.isPending ? "Simulation flotte…" : `Simuler flotte (${fleetDrones.length})`}
                  </button>
                </div>
              }
            />
            {!remoteProjectId ? (
              <section className="lb-note">
                <AlertTriangle size={18} />
                <div>
                  <strong>Projet authentifié requis.</strong>
                  <span>La vue flotte nécessite un projet AeroMind authentifié pour persister les gates par drone.</span>
                </div>
              </section>
            ) : fleetDrones.length === 0 ? (
              <section className="lb-note">
                <AlertTriangle size={18} />
                <div>
                  <strong>Flotte vide.</strong>
                  <span>Cliquez « Ajouter un drone » pour démarrer. Chaque projet peut contenir jusqu'à 12 drones.</span>
                </div>
              </section>
            ) : (
              <div className="lb-fleet-grid">
                {fleetDrones.map((drone) => {
                  const perDroneState = (fleetQuery.data as any)?.perDrone?.find((p: any) => p.droneId === drone.id);
                  const gates = perDroneState?.gates ?? [];
                  const gateByCode: Record<string, string> = {};
                  gates.forEach((g: any) => { gateByCode[g.code] = g.state; });
                  const n3Armed = perDroneState?.conditions?.n3_armed === true;
                  const scenario = fleetDroneScenarios[drone.id] ?? EMPTY_LABBENCH_SCENARIO;
                  const result = fleetResults?.find((r: any) => r.droneId === drone.id);
                  return (
                    <section key={drone.id} className={`lb-panel lb-fleet-card ${n3Armed ? "is-armed" : ""}`}>
                      <div className="lb-panel-title">
                        <Radio size={15} />
                        <span>{drone.name}</span>
                        <small>{drone.isActive ? "PRIMAIRE" : "SECONDAIRE"}</small>
                      </div>
                      <div className="lb-fleet-config">
                        <span>
                          <b>airframe</b>{String(drone.config.airframe ?? "multirotor")}
                        </span>
                        <span>
                          <b>moteurs</b>{String(drone.config.motorCount ?? drone.config.motor_count ?? "—")}
                        </span>
                        <span>
                          <b>masse</b>{String(drone.config.massKg ?? drone.config.mass_kg ?? "—")} kg
                        </span>
                      </div>
                      <div className="lb-fleet-gates">
                        {["N1", "N2", "N3-READY", "N3-ARMED", "N4"].map((code) => (
                          <span key={code} className={`lb-fleet-gate lb-gate-${gateByCode[code] ?? "pending"}`}>
                            <span className="lb-fleet-gate-code">{code}</span>
                            <span className="lb-fleet-gate-state">
                              {gateByCode[code] === "passed" ? <CheckCircle2 size={11} /> :
                                gateByCode[code] === "open" ? <CircleDot size={11} /> :
                                <LockKeyhole size={11} />}
                            </span>
                          </span>
                        ))}
                      </div>
                      <div className="lb-fleet-inputs">
                        <label>
                          <span>Consigne (°)</span>
                          <input
                            type="number"
                            min={0}
                            max={90}
                            step={1}
                            value={scenario.positionSetpointDeg}
                            onChange={(event) =>
                              setFleetDroneScenarios((prev) => ({
                                ...prev,
                                [drone.id]: { ...scenario, positionSetpointDeg: Number(event.target.value) },
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Ambient (°C)</span>
                          <input
                            type="number"
                            min={-10}
                            max={50}
                            step={0.5}
                            value={scenario.ambientC}
                            onChange={(event) =>
                              setFleetDroneScenarios((prev) => ({
                                ...prev,
                                [drone.id]: { ...scenario, ambientC: Number(event.target.value) },
                              }))
                            }
                          />
                        </label>
                      </div>
                      {result && (
                        <div className="lb-fleet-result">
                          {result.error ? (
                            <span className="lb-text-danger">
                              {String((result.error as any).code)}: {String((result.error as any).message)}
                            </span>
                          ) : (
                            <span>
                              <b>Run</b> {String(result.runId)} · <b>T°</b> {String(result.predictedTemperatureC)} °C ·{" "}
                              <b>Verdict</b> {String(result.verdict)}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="lb-fleet-actions">
                        <button
                          className="lb-secondary"
                          onClick={() =>
                            fleetChecklistMutation.mutate({
                              projectId: remoteProjectId,
                              droneId: drone.id,
                              deviceIdentified: true,
                              driverValidated: true,
                              calibrationSimulated: true,
                            })
                          }
                          disabled={fleetChecklistMutation.isPending}
                        >
                          <ClipboardCheck size={13} /> Checklist N3
                        </button>
                        {n3Armed ? (
                          <button
                            className="lb-secondary"
                            onClick={() => {
                              fleetDisarmMutation.mutate({ projectId: remoteProjectId, droneId: drone.id, droneName: drone.name });
                            }}
                            disabled={fleetDisarmMutation.isPending}
                          >
                            <LockKeyhole size={13} /> Désarmer
                          </button>
                        ) : (
                          <button
                            className="lb-primary"
                            onClick={() => openFleetArmDialog(drone)}
                            disabled={!perDroneState?.conditions?.n3_ready}
                          >
                            <Unlock size={13} /> Armer N3
                          </button>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
            <section className="lb-note">
              <ShieldCheck size={18} />
              <div>
                <strong>Frontière de contrôle — pilotage multi-drones.</strong>
                <span>
                  L'armement N3 d'un drone ne commande aucun matériel réel. Les consignes restent virtuelles et bornées 0–90°. Chaque armement est persisté et audit-trailé par drone.
                </span>
              </div>
            </section>
          </div>
        )}

        {view === "radar" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="RADAR TEMPS RÉEL · LABBENCH 01 v6"
              title="Radar multi-drones — visualisation live"
              detail="Stream SSE à 2 Hz depuis le pool matériel. Chaque drone apparaît comme un blip avec cap, altitude, batterie et trace. La géofence est dessinée en rouge pointillé. Les drones hors géofence clignotent en rouge."
            />
            <FleetRadar projectId={remoteProjectId} geofence={geofenceState} />
            {!remoteProjectId && (
              <section className="lb-note">
                <AlertTriangle size={18} />
                <div>
                  <strong>Aucun projet authentifié.</strong>
                  <span>Le radar fonctionne sans projet (vue des drones du pool), mais la géofence est par projet.</span>
                </div>
              </section>
            )}
          </div>
        )}

        {view === "map" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="CARTE GÉOGRAPHIQUE · LABBENCH 01 v7"
              title="Vue cartographique multi-drones"
              detail="Positions géographiques réelles des drones du pool sur fonds OpenStreetMap / Esri World Imagery. Mêmes données que le radar, en coordonnées lat/lon au lieu de x_m/y_m centrés home."
            />
            <FleetMap projectId={remoteProjectId} geofence={geofenceState} />
            {!remoteProjectId && (
              <section className="lb-note">
                <AlertTriangle size={18} />
                <div>
                  <strong>Aucun projet authentifié.</strong>
                  <span>La carte affiche les drones du pool sur le home par défaut.</span>
                </div>
              </section>
            )}
          </div>
        )}

        {view === "materials" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="BIBLIOTHÈQUE MATÉRIAUX · LABBENCH 01 v7"
              title="Catalogue étendu — moteurs, ESC, hélices, FC, caméras, payloads non-armés"
              detail="10 catégories, 30+ références fabricant. Toutes les entrées sont NON armées — AeroMind reste une plateforme non-armée par contrat (engineering/FINAL_REPORT_NON_WEAPONIZED_PLATFORM.md)."
              actions={
                <button
                  className="lb-secondary"
                  onClick={() => materialsRef.current?.refresh()}
                >
                  <Activity size={14} /> Rafraîchir
                </button>
              }
            />
            <MaterialLibraryView ref={materialsRef} />
          </div>
        )}

        {view === "dashboard" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="DASHBOARD · LABBENCH 01 v11"
              title="Vue multi-projets agrégée"
              detail="Total projets, drones, missions, alertes actives, maintenances dues, cycles batterie. Vue par projet + alertes récentes."
            />
            <DashboardView onSelectProject={(id) => { setActiveProjectId(id); setView("overview"); }} />
          </div>
        )}

        {view === "mission" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="MISSION PLANNER · LABBENCH 01 v8"
              title="Planification de mission — waypoints + upload MAVLink"
              detail="Cliquez sur la carte pour ajouter des waypoints. Sauvegardez, puis uploadez vers un drone via MAVLink (gated par token + geofence par waypoint)."
            />
            <MissionPlanner projectId={remoteProjectId} geofence={geofenceState} />
          </div>
        )}

        {view === "preflight" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="PRÉ-VOL · LABBENCH 01 v8"
              title="Checklist pré-vol — 10 items requis"
              detail="Checklist par défaut (10 items : batterie, hélices, moteurs, GPS, IMU, géofence, e-stop, météo, zone, briefing). Chaque exécution est audit-trailée."
            />
            <PreFlightChecklist projectId={remoteProjectId} />
          </div>
        )}

        {view === "charts" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="CHARTS · LABBENCH 01 v8"
              title="Télémétrie au fil du temps — altitude / batterie / cap"
              detail="Lit les samples persistés (FleetTelemetrySample) et affiche 3 charts recharts. Filtre par période (15min / 60min / 6h / 24h)."
            />
            <TelemetryCharts projectId={remoteProjectId} />
          </div>
        )}

        {view === "flights" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="VOLS · LABBENCH 01 v9"
              title="Historique des vols + export CSV"
              detail="Télémétrie persistée filtrée par période. Export CSV pour analyse offline."
              actions={
                <a
                  className="lb-secondary"
                  href={`/api/flights/export.csv?projectId=${encodeURIComponent(remoteProjectId ?? "")}&minutes=60`}
                  download={`aeromind-telemetry-${Date.now()}.csv`}
                >
                  <Archive size={14} /> Export CSV (60 min)
                </a>
              }
            />
            <FlightHistory projectId={remoteProjectId} />
          </div>
        )}

        {view === "replay-adv" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="REPLAY 3D · LABBENCH 01 v12"
              title="Replay avancé — timeline + trace 3D + charts synchronisés"
              detail="Trace 3D avec altitude encodée comme taille/couleur des points. Timeline scrubber avec play/pause/vitesse. Charts altitude+batterie synchronisés avec la position du curseur."
            />
            <AdvancedReplay projectId={remoteProjectId} />
          </div>
        )}

        {view === "voice" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="COMMANDES VOCALES · LABBENCH 01 v13"
              title="Commandes vocales — Web Speech API + MAVLink"
              detail="Parlez en français ou anglais. Le texte est parsé en commande MAVLink structurée, affiché en preview, puis exécuté après confirmation + token. E-stop vocal sans token."
            />
            <VoiceCommandBar projectId={remoteProjectId} />
          </div>
        )}

        {view === "collaboration" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="MULTI-OPÉRATEUR · LABBENCH 01 v15"
              title="Collaboration temps réel — WebSocket"
              detail="Quand plusieurs opérateurs sont connectés au même projet, ils voient les actions des autres en temps réel (arm, disarm, command, alert, présence)."
            />
            <CollaborationPanel />
          </div>
        )}

        {view === "maintenance" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="MAINTENANCE · LABBENCH 01 v10"
              title="Maintenance + cycles batterie"
              detail="Records de maintenance (inspection, réparation, calibration, MAJ firmware) avec prochaine échéance. Cycles batterie (charge/décharge/stockage) avec agrégation par batterie."
            />
            <MaintenanceView projectId={remoteProjectId} />
          </div>
        )}

        {view === "hardware-control" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="PILOTE MATÉRIEL · LABBENCH 01 v5"
              title="Hardware control — phases A-D exposées"
              detail="Le code matériel est dormant tant que HARDWARE_CONTROL != 'true'. Toute commande passe par 7 couches de sûreté (flag, allowlist, token single-use, géofence fail-closed, revue N4 reviewer indépendant, audit log, e-stop)."
              actions={
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="lb-secondary" onClick={() => { void refreshHardware(); void refreshPool(); void refreshHardwareGate(); void refreshGeofence(); }}>
                    <Activity size={14} /> Rafraîchir
                  </button>
                  <button className="lb-estop" onClick={triggerEmergencyStop} title="Broadcast NAV_LAND à tous les drones du pool">
                    <AlertTriangle size={15} /> E-STOP
                  </button>
                </div>
              }
            />

            {/* Status banner */}
            <section className={`lb-panel lb-hw-status ${hardwareStatus?.hardwareControlEnabled ? "is-active" : "is-dormant"}`}>
              <div className="lb-panel-title">
                <Zap size={17} />
                <span>État du subsystem hardware</span>
                <small>{hardwareStatus?.hardwareControlEnabled ? "ACTIF" : "DORMANT"}</small>
              </div>
              <div className="lb-hw-status-grid">
                <div>
                  <small>HARDWARE_CONTROL</small>
                  <strong className={hardwareStatus?.hardwareControlEnabled ? "lb-text-good" : "lb-text-danger"}>
                    {hardwareStatus?.hardwareControlEnabled ? "true" : "false (par défaut)"}
                  </strong>
                  <span>{hardwareStatus?.hardwareControlEnabled ? "Sorties physiques activées côté serveur" : "Aucune sortie physique — bascule requise post-HIL"}</span>
                </div>
                <div>
                  <small>POOL SIZE</small>
                  <strong>{hardwareStatus?.poolSize ?? 0} / {hardwareStatus?.maxFleetSize ?? 12}</strong>
                  <span>Drones enregistrés</span>
                </div>
                <div>
                  <small>ALLOWLIST</small>
                  <strong>{hardwareStatus?.allowedCommands?.length ?? 5} commandes</strong>
                  <span>{(hardwareStatus?.allowedCommands ?? []).join(" · ")}</span>
                </div>
                <div>
                  <small>SORTIES PHYSIQUES</small>
                  <strong className="lb-text-danger">INTERDITES PAR DÉFAUT</strong>
                  <span>Tant que HARDWARE_CONTROL != 'true'</span>
                </div>
              </div>
            </section>

            {/* Gate state — 3 conditions */}
            <section className="lb-panel">
              <div className="lb-panel-title">
                <ShieldCheck size={17} />
                <span>Gate N4 hardware — 3 conditions</span>
                {hardwareGate && (
                  <small>
                    {Object.values(hardwareGate.conditions).filter(Boolean).length}/3 remplies
                  </small>
                )}
              </div>
              <div className="lb-hw-conditions">
                <div className={`lb-hw-condition ${hardwareGate?.conditions.virtual_n3_armed ? "is-met" : "is-missing"}`}>
                  {hardwareGate?.conditions.virtual_n3_armed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  <div>
                    <strong>N3 virtuel armé</strong>
                    <small>Au moins un drone armé via la gate virtuelle (vue Flotte).</small>
                  </div>
                </div>
                <div className={`lb-hw-condition ${hardwareGate?.conditions.hardware_review_signed ? "is-met" : "is-missing"}`}>
                  {hardwareGate?.conditions.hardware_review_signed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  <div>
                    <strong>Revue hardware N4 signée</strong>
                    <small>Reviewer indépendant ≠ opérateur qui a armé N3.</small>
                  </div>
                </div>
                <div className={`lb-hw-condition ${hardwareGate?.conditions.drone_registered_in_pool ? "is-met" : "is-missing"}`}>
                  {hardwareGate?.conditions.drone_registered_in_pool ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  <div>
                    <strong>Drone dans le pool matériel</strong>
                    <small>Enregistré via /api/hardware/pool/register.</small>
                  </div>
                </div>
              </div>
              <div className="lb-hw-gate-actions">
                <button
                  className="lb-primary"
                  onClick={() => setHwReviewDialogOpen(true)}
                  disabled={!hardwareGate?.conditions.virtual_n3_armed}
                  title={!hardwareGate?.conditions.virtual_n3_armed ? "Le N3 virtuel doit être armé d'abord" : ""}
                >
                  <KeyRound size={14} /> Signer revue hardware N4
                </button>
              </div>
              {hardwareGate?.reviewEvents && hardwareGate.reviewEvents.length > 0 && (
                <div className="lb-hw-reviews">
                  {hardwareGate.reviewEvents.map((ev, i) => (
                    <div key={i} className="lb-hw-review-row">
                      <FileCheck2 size={14} />
                      <div>
                        <strong>{String(ev.reviewer ?? "—")}</strong>
                        <small>{String(ev.at ?? "").slice(0, 19).replace("T", " ")} · {String(ev.note ?? "")}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="lb-hw-grid">
              {/* Pool registration + list */}
              <section className="lb-panel">
                <div className="lb-panel-title">
                  <Cpu size={17} />
                  <span>Pool matériel ({poolEntries.length}/{hardwareStatus?.maxFleetSize ?? 12})</span>
                </div>
                <div className="lb-hw-form">
                  <label>
                    <span>Drone ID</span>
                    <input
                      type="text"
                      value={hwRegDroneId}
                      onChange={(e) => setHwRegDroneId(e.target.value)}
                      placeholder="UUID du drone (depuis la vue Flotte)"
                    />
                  </label>
                  <label>
                    <span>Nom (optionnel)</span>
                    <input
                      type="text"
                      value={hwRegDroneName}
                      onChange={(e) => setHwRegDroneName(e.target.value)}
                      placeholder="Drone 1"
                    />
                  </label>
                  <label className="lb-hw-wide">
                    <span>Connection URL (MAVLink)</span>
                    <input
                      type="text"
                      value={hwRegConnectionUrl}
                      onChange={(e) => setHwRegConnectionUrl(e.target.value)}
                      placeholder="udpout:127.0.0.1:14550 ou serial:/dev/ttyUSB0:57600"
                    />
                  </label>
                  <button className="lb-primary" onClick={submitPoolRegister} disabled={!remoteProjectId && !isLocalMode}>
                    <Activity size={14} /> Enregistrer
                  </button>
                </div>
                <div className="lb-hw-pool-list">
                  {poolEntries.length === 0 ? (
                    <p className="lb-empty-state">Aucun drone dans le pool.</p>
                  ) : (
                    poolEntries.map((drone) => (
                      <div key={drone.droneId} className="lb-hw-pool-row">
                        <div>
                          <strong>{drone.droneName}</strong>
                          <small>{drone.droneId}</small>
                          <small>{drone.connectionUrl}</small>
                        </div>
                        <div className="lb-hw-pool-actions">
                          <button className="lb-secondary" onClick={() => issueToken(drone.droneId)}>
                            <KeyRound size={13} /> Token
                          </button>
                          <button className="lb-secondary" onClick={() => submitUnregister(drone.droneId)}>
                            <XCircle size={13} /> Retirer
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* Geofence configuration */}
              <section className="lb-panel">
                <div className="lb-panel-title">
                  <Gauge size={17} />
                  <span>Géofence projective</span>
                  <small>{geofenceState?.configured ? "CONFIGURÉE" : "NON CONFIGURÉE"}</small>
                </div>
                <div className="lb-hw-form">
                  <label className="lb-hw-wide">
                    <span>Polygone JSON [[lat, lon], ...] (vide = pas de polygone)</span>
                    <textarea
                      value={hwGeofencePolygon}
                      onChange={(e) => setHwGeofencePolygon(e.target.value)}
                      placeholder='[[48.0, 2.0], [48.1, 2.0], [48.1, 2.1], [48.0, 2.1]]'
                      rows={3}
                    />
                  </label>
                  <label>
                    <span>Altitude max (m)</span>
                    <input
                      type="number"
                      min={10}
                      max={120}
                      step={5}
                      value={hwGeofenceMaxAlt}
                      onChange={(e) => setHwGeofenceMaxAlt(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    <span>Distance max (m, VLOS)</span>
                    <input
                      type="number"
                      min={50}
                      max={2000}
                      step={50}
                      value={hwGeofenceMaxDist}
                      onChange={(e) => setHwGeofenceMaxDist(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    <span>Home lat (optionnel)</span>
                    <input
                      type="number"
                      step={0.0001}
                      value={hwGeofenceHomeLat}
                      onChange={(e) => setHwGeofenceHomeLat(e.target.value)}
                      placeholder="48.05"
                    />
                  </label>
                  <label>
                    <span>Home lon (optionnel)</span>
                    <input
                      type="number"
                      step={0.0001}
                      value={hwGeofenceHomeLon}
                      onChange={(e) => setHwGeofenceHomeLon(e.target.value)}
                      placeholder="2.05"
                    />
                  </label>
                  <button className="lb-secondary lb-hw-wide" onClick={submitGeofence} disabled={!remoteProjectId && !isLocalMode}>
                    Enregistrer la géofence
                  </button>
                </div>
                {geofenceState?.configured && (
                  <div className="lb-hw-geofence-summary">
                    <span><b>Polygone</b>{geofenceState.polygon?.length ?? 0} points</span>
                    <span><b>Alt max</b>{geofenceState.maxAltitudeM} m</span>
                    <span><b>Dist max</b>{geofenceState.maxDistanceM} m</span>
                  </div>
                )}
              </section>
            </div>

            {/* Command panel */}
            <section className="lb-panel lb-hw-command">
              <div className="lb-panel-title">
                <Radio size={17} />
                <span>Envoi d'une commande matérielle</span>
                <small>SINGLE-USE TOKEN</small>
              </div>
              <div className="lb-hw-form">
                <label className="lb-hw-wide">
                  <span>Drone ID (cible)</span>
                  <input
                    type="text"
                    value={hwCommandDroneId}
                    onChange={(e) => setHwCommandDroneId(e.target.value)}
                    placeholder="UUID du drone (depuis le pool ci-dessus)"
                  />
                </label>
                <label>
                  <span>Commande (allowlist)</span>
                  <select value={hwCommand} onChange={(e) => setHwCommand(e.target.value)}>
                    {(hardwareStatus?.allowedCommands ?? ["COMPONENT_ARM_DISARM", "NAV_TAKEOFF", "NAV_LAND", "NAV_RETURN_TO_LAUNCH", "DO_SET_MODE"]).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="lb-hw-wide">
                  <span>Paramètres (JSON, ex: {"{ \"p7\": 30 }"} pour takeoff à 30 m)</span>
                  <input
                    type="text"
                    value={hwCommandParams}
                    onChange={(e) => setHwCommandParams(e.target.value)}
                    placeholder='{"p7": 30}'
                  />
                </label>
                <label className="lb-hw-wide">
                  <span>Token single-use (issu par le bouton Token ci-dessus)</span>
                  <input
                    type="text"
                    value={hwCommandToken}
                    onChange={(e) => setHwCommandToken(e.target.value)}
                    placeholder="64-char token (consumé après envoi)"
                    className="lb-hw-token-input"
                  />
                </label>
                <button
                  className="lb-primary lb-hw-wide"
                  onClick={sendCommand}
                  disabled={
                    !remoteProjectId ||
                    !hwCommandDroneId.trim() ||
                    hwCommandToken.trim().length < 16 ||
                    !hardwareStatus?.hardwareControlEnabled
                  }
                  title={!hardwareStatus?.hardwareControlEnabled ? "HARDWARE_CONTROL != 'true' côté serveur" : ""}
                >
                  <Radio size={14} />
                  Envoyer la commande matérielle
                </button>
              </div>
              {hwIssuedToken && (
                <div className="lb-hw-token-display">
                  <span>Dernier jeton émis pour {hwIssuedForDrone} :</span>
                  <code>{hwIssuedToken}</code>
                  <small>Copiez-le dans le champ token ci-dessus, puis cliquez Envoyer. Le jeton est consumé après usage.</small>
                </div>
              )}
              {!hardwareStatus?.hardwareControlEnabled && (
                <div className="lb-note lb-note-info">
                  <LockKeyhole size={18} />
                  <div>
                    <strong>Hardware dormant.</strong>
                    <span>HARDWARE_CONTROL n'est pas 'true' côté serveur. Les boutons sont désactivés jusqu'à bascule post-HIL.</span>
                  </div>
                </div>
              )}
            </section>

            <section className="lb-note lb-note-estop">
              <AlertTriangle size={18} />
              <div>
                <strong>E-STOP disponible en permanence.</strong>
                <span>
                  Le bouton E-STOP (en haut à droite) broadcast NAV_LAND à tous les
                  drones du pool. Il reste actif même si HARDWARE_CONTROL est dormant
                  (il n'a alors aucun effet physique, juste un audit log).
                </span>
              </div>
            </section>
          </div>
        )}

        {view === "reports" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="DOSSIER DE PREUVE"
              title="Rapports et archivage"
              detail="Un rapport affirme le niveau de preuve disponible, pas les capacités futures du système. La gate N4 conditionne la mise en service."
            />
            <div className="lb-reports-grid">
              <section className="lb-panel">
                <div className="lb-panel-title">
                  <Archive size={17} />
                  <span>Rapport de simulation</span>
                  <span className="lb-revision">APERÇU N2</span>
                </div>
                <h3>
                  LabBench 01 — {latestResult?.runId ?? "scénario non exécuté"}
                </h3>
                <p>
                  Entrées contrôlées, formule documentée, sortie synthétique,
                  incertitude et limites du moteur sont regroupées dans cet
                  aperçu. Pour archivage officiel, rattacher le run à un projet
                  authentifié via les procédures persistantes LabBench et le
                  registre de rapports existant.
                </p>
                <div className="lb-report-meta">
                  <span>
                    Version moteur{" "}
                    <b>{latestResult?.engineVersion ?? "aucun run"}</b>
                  </span>
                  <span>
                    Statut <b className="lb-text-good">N2 — Simulation</b>
                  </span>
                </div>
                <button
                  className="lb-secondary"
                  onClick={downloadReport}
                  disabled={!latestResult}
                >
                  Télécharger le rapport JSON du run
                </button>
              </section>
              <section className="lb-panel">
                <div className="lb-panel-title">
                  <FileCheck2 size={17} />
                  <span>Checklist de validation</span>
                </div>
                {[
                  [
                    "Paramètres et version moteur conservés",
                    Boolean(latestResult),
                  ],
                  ["Run N2 archivé côté serveur", gateState.conditions.n2_run_archived],
                  ["Checklist hardware complète (N3-READY)", gateState.conditions.hardware_checklist_complete],
                  ["Armement N3 supervisé actif", gateState.conditions.n3_armed],
                  ["Revue indépendante N4 signée", gateState.conditions.independent_review_signed],
                ].map(([label, done]) => (
                  <div className="lb-gate" key={String(label)}>
                    {done ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                    <span>{String(label)}</span>
                    <strong>{done ? "Présent" : "Ouvert"}</strong>
                  </div>
                ))}
              </section>
            </div>
            <section className="lb-note">
              <TriangleAlert size={18} />
              <div>
                <strong>Références à évaluer, non certifications.</strong>
                <span>
                  ISO 12100, ISO 13849 / IEC 62061 et IEC 62443 restent à
                  analyser selon l’usage, la famille d’appareil et l’intégration
                  effective.
                </span>
              </div>
            </section>
          </div>
        )}

        {view === "audit" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="TRAÇABILITÉ · SIGN-OFF N4"
              title="Journal d’audit & revue indépendante"
              detail={
                remoteProjectId
                  ? "Les événements persistants du projet sont affichés avec les reçus de la session courante. La revue N4 signée clôt la progression."
                  : "Mode aperçu : le journal affiché est local à cette session et ne constitue pas une preuve serveur."
              }
              actions={
                gateState.conditions.n3_armed && !gateState.conditions.independent_review_signed ? (
                  <button className="lb-primary" onClick={openSignOffDialog}>
                    <KeyRound size={15} />
                    Signer la revue N4
                  </button>
                ) : undefined
              }
            />
            {gateState.reviewEvents.length > 0 && (
              <section className="lb-panel lb-review-events">
                <div className="lb-panel-title">
                  <FileCheck2 size={17} />
                  <span>Revues N4 signées</span>
                </div>
                {gateState.reviewEvents.map((event, index) => (
                  <div className="lb-review-event" key={String(event.id ?? index)}>
                    <CheckCircle2 size={16} />
                    <div>
                      <strong>
                        Revue signée par {String(event.reviewer ?? "—")} ·{" "}
                        {String(event.at ?? "—").slice(0, 19).replace("T", " ")}
                      </strong>
                      <small>{String(event.note ?? "Revue indépendante.")}</small>
                    </div>
                    <span className="lb-text-good">Signée</span>
                  </div>
                ))}
              </section>
            )}
            <section className="lb-panel lb-audit-panel">
              <div className="lb-audit-head">
                <span>Heure</span>
                <span>Événement</span>
                <span>Détail</span>
                <span>État</span>
              </div>
              {auditEvents.map((event) => (
                <div className="lb-audit-row" key={String(event.id)}>
                  <span>
                    {new Date(event.createdAt).toLocaleTimeString("fr-FR")}
                  </span>
                  <strong>{event.eventType}</strong>
                  <p>{JSON.stringify(event.payload)}</p>
                  <span className="lb-audit-state lb-success">Persistant</span>
                </div>
              ))}
              {audit.map((event, index) => (
                <div className="lb-audit-row" key={`${event.time}-${index}`}>
                  <span>{event.time}</span>
                  <strong>{event.type}</strong>
                  <p>{event.message}</p>
                  <span className={`lb-audit-state lb-${event.status}`}>
                    {event.status === "success"
                      ? "Local · conforme"
                      : event.status === "warning"
                        ? "Local · attention"
                        : "Local · info"}
                  </span>
                </div>
              ))}
              {auditEvents.length === 0 && audit.length === 0 && (
                <p className="lb-empty-state">
                  Aucun événement pour ce projet ou cette session.
                </p>
              )}
            </section>
          </div>
        )}
          </>
        )}
      </section>

      {armDialogOpen && (
        <div className="lb-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="arm-dialog-title">
          <div className="lb-modal">
            <div className="lb-modal-header">
              <Zap size={18} />
              <h2 id="arm-dialog-title">Armement N3 supervisé — double confirmation</h2>
            </div>
            <div className="lb-modal-body">
              <p className="lb-modal-warning">
                <AlertTriangle size={16} />
                Cet armement ne déclenche <strong>aucune commande physique</strong>.
                Il déverrouille uniquement les consignes virtuelles supervisées
                de la zone 04 et reste traçable côté serveur.
              </p>
              <label className="lb-confirm">
                <input
                  type="checkbox"
                  checked={humanConfirmed}
                  onChange={(event) => setHumanConfirmed(event.target.checked)}
                />
                <span>
                  Je confirme avoir lu la procédure d’armement et l’absence de
                  sortie physique.
                </span>
              </label>
              <label className="lb-confirm">
                <input
                  type="checkbox"
                  checked={safetyConfirmed}
                  onChange={(event) => setSafetyConfirmed(event.target.checked)}
                />
                <span>
                  Je confirme le périmètre virtuel exclusif et la possibilité
                  d’arrêt immédiat.
                </span>
              </label>
              <label className="lb-input-row">
                <span>Code second opérateur (≥ 6 caractères) :</span>
                <input
                  type="password"
                  value={secondOperatorCode}
                  onChange={(event) => setSecondOperatorCode(event.target.value)}
                  placeholder="Saisir le code du second opérateur"
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="lb-modal-footer">
              <button
                className="lb-secondary"
                onClick={() => setArmDialogOpen(false)}
                disabled={armN3Mutation.isPending}
              >
                Annuler
              </button>
              <button
                className="lb-primary"
                onClick={confirmArm}
                disabled={
                  armN3Mutation.isPending ||
                  !humanConfirmed ||
                  !safetyConfirmed ||
                  secondOperatorCode.trim().length < 6
                }
              >
                <Unlock size={15} />
                {armN3Mutation.isPending ? "Armement…" : "Armer N3"}
              </button>
            </div>
          </div>
        </div>
      )}

      {signOffDialogOpen && (
        <div className="lb-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="signoff-dialog-title">
          <div className="lb-modal">
            <div className="lb-modal-header">
              <KeyRound size={18} />
              <h2 id="signoff-dialog-title">Revue indépendante N4 — signature</h2>
            </div>
            <div className="lb-modal-body">
              <p className="lb-modal-warning">
                <ShieldCheck size={16} />
                La signature N4 clôt la progression. Elle ne déclenche aucune
                commande matérielle ; elle est persistée et auditée.
              </p>
              <label className="lb-input-row">
                <span>Revue par (nom / email) :</span>
                <input
                  type="text"
                  value={reviewer}
                  onChange={(event) => setReviewer(event.target.value)}
                  placeholder="Ex. Marie Lefèvre — Independent Reviewer"
                />
              </label>
              <label className="lb-input-row">
                <span>Jeton de revue (≥ 8 caractères) :</span>
                <input
                  type="password"
                  value={reviewToken}
                  onChange={(event) => setReviewToken(event.target.value)}
                  placeholder="Jeton délivré hors bande"
                  autoComplete="off"
                />
              </label>
              <label className="lb-input-row">
                <span>Note de revue (optionnel) :</span>
                <textarea
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder="Ex. Démonstration N3 supervisée conforme ; aucune anomalie."
                  rows={3}
                />
              </label>
            </div>
            <div className="lb-modal-footer">
              <button
                className="lb-secondary"
                onClick={() => setSignOffDialogOpen(false)}
                disabled={signOffN4Mutation.isPending}
              >
                Annuler
              </button>
              <button
                className="lb-primary"
                onClick={confirmSignOff}
                disabled={
                  signOffN4Mutation.isPending ||
                  !reviewer.trim() ||
                  reviewToken.trim().length < 8
                }
              >
                <FileCheck2 size={15} />
                {signOffN4Mutation.isPending ? "Signature…" : "Signer la revue N4"}
              </button>
            </div>
          </div>
        </div>
      )}

      {fleetArmDialogDrone && (
        <div className="lb-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="fleet-arm-dialog-title">
          <div className="lb-modal">
            <div className="lb-modal-header">
              <Zap size={18} />
              <h2 id="fleet-arm-dialog-title">
                Armement N3 — drone {fleetArmDialogDrone.name}
              </h2>
            </div>
            <div className="lb-modal-body">
              <p className="lb-modal-warning">
                <AlertTriangle size={16} />
                Cet armement ne déclenche <strong>aucune commande physique</strong>.
                Il déverrouille uniquement les consignes virtuelles supervisées
                pour le drone <b>{fleetArmDialogDrone.name}</b> et reste traçable
                côté serveur (audit `labbench.gate.arm_n3_drone`).
              </p>
              <label className="lb-confirm">
                <input
                  type="checkbox"
                  checked={fleetHumanConfirmed}
                  onChange={(event) => setFleetHumanConfirmed(event.target.checked)}
                />
                <span>
                  Je confirme avoir lu la procédure d’armement et l’absence de
                  sortie physique pour le drone {fleetArmDialogDrone.name}.
                </span>
              </label>
              <label className="lb-confirm">
                <input
                  type="checkbox"
                  checked={fleetSafetyConfirmed}
                  onChange={(event) => setFleetSafetyConfirmed(event.target.checked)}
                />
                <span>
                  Je confirme le périmètre virtuel exclusif du drone {fleetArmDialogDrone.name} et la
                  possibilité d’arrêt immédiat.
                </span>
              </label>
              <label className="lb-input-row">
                <span>Code second opérateur (≥ 6 caractères) :</span>
                <input
                  type="password"
                  value={fleetSecondOperatorCode}
                  onChange={(event) => setFleetSecondOperatorCode(event.target.value)}
                  placeholder="Saisir le code du second opérateur"
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="lb-modal-footer">
              <button
                className="lb-secondary"
                onClick={() => setFleetArmDialogDrone(null)}
                disabled={fleetArmMutation.isPending}
              >
                Annuler
              </button>
              <button
                className="lb-primary"
                onClick={confirmFleetArm}
                disabled={
                  fleetArmMutation.isPending ||
                  !fleetHumanConfirmed ||
                  !fleetSafetyConfirmed ||
                  fleetSecondOperatorCode.trim().length < 6
                }
              >
                <Unlock size={15} />
                {fleetArmMutation.isPending ? "Armement…" : `Armer N3 — ${fleetArmDialogDrone.name}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {hwReviewDialogOpen && (
        <div className="lb-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="hw-review-dialog-title">
          <div className="lb-modal">
            <div className="lb-modal-header">
              <KeyRound size={18} />
              <h2 id="hw-review-dialog-title">Revue hardware N4 — signature indépendante</h2>
            </div>
            <div className="lb-modal-body">
              <p className="lb-modal-warning">
                <ShieldCheck size={16} />
                Le reviewer doit être <strong>différent</strong> de l'opérateur qui a armé le N3 virtuel.
                Cette signature est distincte de la revue virtuelle N4 et reste audit-trailée
                (event_type `labbench.hardware.review_signed`).
              </p>
              <label className="lb-input-row">
                <span>Reviewer (nom ou email, ≠ opérateur N3) :</span>
                <input
                  type="text"
                  value={hwReviewer}
                  onChange={(e) => setHwReviewer(e.target.value)}
                  placeholder="independent-reviewer@example.com"
                />
              </label>
              <label className="lb-input-row">
                <span>Jeton de revue (≥ 16 caractères) :</span>
                <input
                  type="password"
                  value={hwReviewToken}
                  onChange={(e) => setHwReviewToken(e.target.value)}
                  placeholder="very-long-review-token-12345"
                  autoComplete="off"
                />
              </label>
              <label className="lb-input-row">
                <span>Note de revue (optionnel) :</span>
                <textarea
                  value={hwReviewNote}
                  onChange={(e) => setHwReviewNote(e.target.value)}
                  placeholder="Ex. Tests HIL SITL validés ; geofence configurée ; e-stop vérifié."
                  rows={3}
                />
              </label>
            </div>
            <div className="lb-modal-footer">
              <button
                className="lb-secondary"
                onClick={() => setHwReviewDialogOpen(false)}
              >
                Annuler
              </button>
              <button
                className="lb-primary"
                onClick={submitHwReview}
                disabled={!hwReviewer.trim() || hwReviewToken.trim().length < 16}
              >
                <FileCheck2 size={15} />
                Signer la revue hardware N4
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
