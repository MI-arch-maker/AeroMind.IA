import { trpc } from "@/lib/trpc";
import { LabBenchPersistencePanel } from "@/components/LabBenchPersistencePanel";
import { LabBenchHardwareConfig } from "@/components/LabBenchHardwareConfig";
import { HardwareControlPanel } from "@/components/HardwareControlPanel";
import { subscribeToActiveDrone } from "@/lib/hardwareControl";
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
  Database,
  FileCheck2,
  FolderKanban,
  Gauge,
  History,
  KeyRound,
  LockKeyhole,
  Play,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Thermometer,
  TriangleAlert,
  Unlock,
  Wifi,
  XCircle,
  Zap,
} from "lucide-react";
import { Link } from "wouter";
import { useEffect, useMemo, useRef, useState } from "react";
import { readJson } from "@/lib/workspaceSync";
import {
  calculateLocalLabBenchResult,
  defaultLabBenchScenario,
  normalizeLabBenchScenario,
  normalizeLabBenchProjects,
  normalizeLabBenchResult,
  normalizeLabBenchStatus,
  validateLabBenchScenario,
  type LabBenchScenario,
  type LabBenchResult,
} from "@/lib/labBench";
import { useLanguage } from "../contexts/LanguageContext";
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
  | "requirements"
  | "simulation"
  | "hardware"
  | "bench"
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
    ],
  },
  {
    id: "bench",
    label: "04 · Banc de test & Commandes",
    description: "N3 → N4 · armement supervisé",
    views: [
      { id: "bench", label: "Banc", caption: "Commandes supervisées", icon: Radio },
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

const LABBENCH_SCENARIO_KEY = "aeromind-labbench-scenario-v1";
type LocalWorkspace = { projects?: unknown[]; activeProjectId?: string };
const LOCAL_WORKSPACE_KEY = "aeromind-blank-workspace-v3";
function readLabBenchScenario() {
  if (typeof window === "undefined") return defaultLabBenchScenario;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(LABBENCH_SCENARIO_KEY) ?? "null",
    );
    return normalizeLabBenchScenario(stored);
  } catch {
    return defaultLabBenchScenario;
  }
}

const initialAudit = [
  {
    time: "09:42:11",
    type: "gateway.status",
    message: "Adaptateur LabBench simulé démarré en lecture seule.",
    status: "info",
  },
  {
    time: "09:42:08",
    type: "requirements.review",
    message: "REQ-SAF-003 reste en revue humaine ; aucune tolérance inventée.",
    status: "warning",
  },
  {
    time: "09:41:55",
    type: "simulation.loaded",
    message:
      "Jeu de télémétrie synthétique référencé au moteur labbench-thermal-v1.0.0.",
    status: "success",
  },
];

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
  detail,
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
        <p>{detail}</p>
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

export default function LabBench() {
  const { tKey } = useLanguage();
  const [view, setView] = useState<ViewId>("overview");
  const [mode, setMode] = useState<ModeId>("simulation");
  const [scenario, setScenario] = useState(readLabBenchScenario);
  const [humanConfirmed, setHumanConfirmed] = useState(false);
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [secondOperatorCode, setSecondOperatorCode] = useState("");
  const [armDialogOpen, setArmDialogOpen] = useState(false);
  const [reviewer, setReviewer] = useState("");
  const [reviewToken, setReviewToken] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [signOffDialogOpen, setSignOffDialogOpen] = useState(false);
  const [virtualPosition, setVirtualPosition] = useState<number | null>(null);
  const [storageError, setStorageError] = useState(false);
  const pendingCommand = useRef<string | null>(null);
  const projectEpoch = useRef(0);
  const simulationEpoch = useRef<number | null>(null);
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [audit, setAudit] = useState(initialAudit);
  const [localWorkspace, setLocalWorkspace] = useState<LocalWorkspace>(() =>
    readJson(LOCAL_WORKSPACE_KEY, {} as LocalWorkspace),
  );
  const [gateState, setGateState] = useState<LocalGateState>(initialLocalGateState);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LABBENCH_SCENARIO_KEY,
        JSON.stringify(scenario),
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
    setHumanConfirmed(false);
    setSafetyConfirmed(false);
    pendingCommand.current = null;
  }, [scenario]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LABBENCH_SCENARIO_KEY || !event.newValue) return;
      try {
        const next = JSON.parse(event.newValue) as Partial<LabBenchScenario>;
        setScenario((current: LabBenchScenario) =>
          normalizeLabBenchScenario({ ...current, ...next }),
        );
      } catch {
        // Une valeur externe invalide ne doit pas interrompre le banc d’essai.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    const refreshLocalWorkspace = (event: StorageEvent) => {
      if (event.key !== LOCAL_WORKSPACE_KEY) return;
      setLocalWorkspace(readJson(LOCAL_WORKSPACE_KEY, {} as LocalWorkspace));
    };
    window.addEventListener("storage", refreshLocalWorkspace);
    return () => window.removeEventListener("storage", refreshLocalWorkspace);
  }, []);

  const statusQuery = trpc.labBench.status.useQuery(undefined, {
    staleTime: 30_000,
    retry: false,
  });
  const meQuery = trpc.auth.me.useQuery(undefined, {
    staleTime: 60_000,
    retry: false,
  });
  const projectsQuery = trpc.projects.list.useQuery(undefined, {
    enabled: Boolean(meQuery.data),
    retry: false,
  });
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const remoteProjects = normalizeLabBenchProjects(projectsQuery.data);
  const localProjects = normalizeLabBenchProjects(localWorkspace?.projects);
  const projects = remoteProjects.length ? remoteProjects : localProjects;
  const selectedProjectId =
    (activeProjectId &&
    projects.some((project) => project.id === activeProjectId)
      ? activeProjectId
      : null) ??
    (localWorkspace?.activeProjectId &&
    projects.some((project) => project.id === localWorkspace.activeProjectId)
      ? localWorkspace.activeProjectId
      : null) ??
    projects[0]?.id ??
    null;
  const remoteProjectId =
    selectedProjectId &&
    remoteProjects.some((project) => project.id === selectedProjectId)
      ? selectedProjectId
      : null;
  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId,
  );
  const [activeDroneConfig, setActiveDroneConfig] = useState<Record<
    string,
    unknown
  > | null>(null);
  useEffect(() => {
    if (!remoteProjectId) {
      setActiveDroneConfig(selectedProject?.config ?? null);
      return;
    }
    return subscribeToActiveDrone(remoteProjectId, setActiveDroneConfig);
  }, [remoteProjectId, JSON.stringify(selectedProject?.config)]);
  const registryQuery = trpc.labBench.registry.useQuery(
    remoteProjectId ?? "0",
    { enabled: Boolean(remoteProjectId && meQuery.data), retry: false },
  );
  const gateStateQuery = trpc.labBench.gateState.useQuery(
    remoteProjectId ?? "0",
    {
      enabled: Boolean(remoteProjectId && meQuery.data),
      retry: false,
      refetchOnMount: true,
      staleTime: 5_000,
    },
  );
  const remoteAuditQuery = trpc.auditEvents.list.useQuery(
    remoteProjectId ?? "0",
    { enabled: Boolean(remoteProjectId && meQuery.data), retry: false },
  );

  useEffect(() => {
    if (gateStateQuery.data && typeof gateStateQuery.data === "object") {
      const data = gateStateQuery.data as Partial<GateStateResponse>;
      setGateState({
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
    if (gateState.conditions.n3_armed && mode !== "authorized") {
      setMode("authorized");
    }
    if (!gateState.conditions.n3_armed && mode === "authorized") {
      setMode("simulation");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateState.conditions.n3_armed]);

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
    projectEpoch.current += 1;
    simulationEpoch.current = null;
  }, [selectedProjectId]);
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

  const status = normalizeLabBenchStatus(statusQuery.data);
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
  const previewTelemetry = Array.from({ length: 12 }, (_, index) => ({
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
  }));
  const telemetry =
    Array.isArray(latestResult?.telemetry) && latestResult.telemetry.length > 0
      ? latestResult.telemetry
      : previewTelemetry;
  const averageTemperature = useMemo(
    () =>
      telemetry.reduce((sum, sample) => sum + sample.temperatureC, 0) /
      Math.max(telemetry.length, 1),
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
    registryDevices.find((device) => device.deviceCode === "LB01-EMU-001") ??
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
    const error = validateLabBenchScenario(scenario);
    if (error) {
      toast.error("Paramètres hors plage", { description: error });
      return;
    }
    if (!remoteProjectId) {
      runLocalSimulation();
      return;
    }
    setLocalResult(null);
    simulationEpoch.current = projectEpoch.current;
    simulationMutation.mutate({ mode: "simulation", ...scenario });
  };
  const persistSimulation = () => {
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
          "Émulateur LB01-EMU-001 identifié ; mesure physique non revendiquée.",
        status: "info",
      },
      ...entries,
    ]);
    toast.info("Identité de l’émulateur vérifiée", {
      description: "Aucun équipement réel n’est déclaré connecté.",
    });
  };
  const submitHardwareChecklist = () => {
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
    if (!remoteProjectId) return;
    disarmN3Mutation.mutate({ projectId: remoteProjectId });
  };
  const openSignOffDialog = () => {
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
              <span className="lb-zone-meta">{group.description}</span>
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
                    <small>{item.caption}</small>
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

  return (
    <main className="labbench-shell">
      <aside className="lb-rail">
        <Link href="/" className="lb-back">
          <ArrowLeft size={15} /> Cockpit aéronautique
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
            <h1>{status?.project?.name ?? tKey("labbench.screen.title")}</h1>
          </div>
          <div className="lb-top-status">
            <span className="lb-chip">
              <CircleDot size={14} /> Gate courant : {gateState.currentGate}
            </span>
            <span className="lb-lock">
              <LockKeyhole size={14} /> Aucune commande physique
            </span>
          </div>
        </header>
        <div className="lb-safety-banner">
          <ShieldCheck size={19} />
          <div>
            <strong>Barrière de sûreté orchestrée par progression</strong>
            <span>
              Le passage N2 → N3 → N4 se déverrouille par gates explicites.
              L’armement N3 exige une double confirmation humaine et un code
              second opérateur. Les sorties physiques restent interdites ;
              l’armement ne commande aucun matériel réel.
            </span>
          </div>
        </div>
        {storageError && (
          <p className="lb-note" role="status">
            Stockage navigateur indisponible : scénario conservé en mémoire
            seulement ; export JSON disponible.
          </p>
        )}
        {statusQuery.isError && (
          <p className="lb-note" role="status">
            API LABBENCH indisponible : laboratoire local synthétique actif,
            aucune preuve serveur.
          </p>
        )}
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
              {String(activeDroneConfig.airframe ?? "Multirotor")} ·{" "}
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
            <small>N3 ARMÉ</small>
            <strong>
              {gateState.conditions.n3_armed ? (
                <span className="lb-text-warning">
                  <Unlock size={13} /> OUI (virtuel)
                </span>
              ) : (
                <span>VERROUILLÉ</span>
              )}
            </strong>
            <span>
              {gateState.conditions.n3_armed
                ? "Consignes virtuelles actives ; pas de sortie physique"
                : "Armement requis via le banc de test"}
            </span>
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
                  {meQuery.data && remoteProjects.length
                    ? "AUTHENTIFIÉ"
                    : "BROUILLON LOCAL"}
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
                    Le cockpit reste utilisable en simulation, mais les
                    écritures officielles exigent un projet AeroMind.
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
                {statusServices.map((service) => (
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
                    {latestResult ? "RUN SYNTHÉTIQUE" : "APERÇU DES ENTRÉES"}
                  </small>
                </div>
                <div className="lb-measures">
                  <div>
                    <span>Température moyenne</span>
                    <strong>
                      {averageTemperature.toFixed(1)}
                      <em> °C</em>
                    </strong>
                    <small>capteur TMP-01 simulé</small>
                  </div>
                  <div>
                    <span>Position consigne</span>
                    <strong>
                      {scenario.positionSetpointDeg}
                      <em> °</em>
                    </strong>
                    <small>encodeur POS-02 simulé</small>
                  </div>
                  <div>
                    <span>Échantillons</span>
                    <strong>{telemetry.length}</strong>
                    <small>
                      {latestResult
                        ? "trames du dernier run"
                        : "aperçu calculé du scénario"}
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
                    disabled={!remoteProjectId || !latestResult || persistSimulationMutation.isPending}
                  >
                    <Archive size={14} />
                    {persistSimulationMutation.isPending ? "Archivage…" : "Archiver le run (N2)"}
                  </button>
                  <button
                    className="lb-primary"
                    disabled={
                      simulationMutation.isPending ||
                      Boolean(validateLabBenchScenario(scenario))
                    }
                    onClick={runSimulation}
                  >
                    <Play size={15} />
                    {simulationMutation.isPending
                      ? "Calcul en cours…"
                      : "Exécuter la simulation"}
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
                        setScenario({
                          ...scenario,
                          ambientC: Number(event.target.value),
                        })
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
                        setScenario({
                          ...scenario,
                          heaterPowerW: Number(event.target.value),
                        })
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
                        setScenario({
                          ...scenario,
                          dutyCycle: Number(event.target.value),
                        })
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
                        setScenario({
                          ...scenario,
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
                        setScenario({
                          ...scenario,
                          positionSetpointDeg: Number(event.target.value),
                        })
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
                        setScenario({
                          ...scenario,
                          durationSeconds: Number(event.target.value),
                        })
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
                      : "APERÇU"}
                  </small>
                </div>
                <div className="lb-result-number">
                  <span>
                    {latestResult
                      ? "Température du dernier run"
                      : "Température estimée · non exécutée"}
                  </span>
                  <strong>
                    {latestResult?.predictedTemperatureC ??
                      previewTemperatureC.toFixed(2)}
                    <em> °C</em>
                  </strong>
                  <small>
                    Incertitude estimée ± {latestResult?.uncertaintyC ?? "0.58"}{" "}
                    °C
                  </small>
                </div>
                <div className="lb-formula">
                  T = T<sub>amb</sub> + (P × duty) × Rθ
                </div>
                <div className="lb-result-meta">
                  <span>
                    Version moteur{" "}
                    <b>
                      {latestResult?.engineVersion ??
                        "labbench-thermal-v1.0.0-local"}
                    </b>
                  </span>
                  <span>
                    Verdict{" "}
                    <b
                      className={
                        (latestResult?.verdict ??
                          (previewTemperatureC > 55 ? "review" : "pass")) ===
                        "review"
                          ? "lb-text-warning"
                          : "lb-text-good"
                      }
                    >
                      {(latestResult?.verdict ??
                        (previewTemperatureC > 55 ? "review" : "pass")) ===
                      "review"
                        ? "À revoir"
                        : "Scénario conforme · aperçu"}
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
                  disabled={!remoteProjectId || hardwareChecklistMutation.isPending}
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
                      <small>Émulateur LB01-EMU-001 référencé dans le registre.</small>
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
                  <ServiceState state="simulated" />
                </div>
                <div className="lb-asset-name">
                  <span>
                    {selectedRegistryDevice?.deviceCode ?? "LB01-EMU-001"}
                  </span>
                  <strong>
                    {selectedRegistryDevice?.model ??
                      status?.device?.model ??
                      "LabBench 01 / émulateur"}
                  </strong>
                  <small>
                    {selectedRegistryDevice?.manufacturer ??
                      status?.device?.manufacturer ??
                      "AeroMind reference rig"}
                  </small>
                </div>
                <dl className="lb-definition-list">
                  <div>
                    <dt>Révision matérielle</dt>
                    <dd>
                      {selectedRegistryDevice?.hardwareRevision ??
                        status?.device?.hardwareRevision ??
                        "REV-A"}
                    </dd>
                  </div>
                  <div>
                    <dt>Firmware</dt>
                    <dd>
                      {selectedRegistryDevice?.firmwareVersion ??
                        status?.device?.firmwareVersion ??
                        "0.4.2-sim"}
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
                            : "") || "USB-C"}
                    </dd>
                  </div>
                  <div>
                    <dt>Limites</dt>
                    <dd>
                      {selectedRegistryDevice
                        ? registryFieldLabels(selectedRegistryDevice.limitsJson)
                        : (Array.isArray(status?.device?.limits)
                            ? status.device.limits.join(" · ")
                            : "") || "12 V"}
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
                        ? "LB01-EMU-001 · transport virtuel seulement"
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
    </main>
  );
}
