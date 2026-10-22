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
  LockKeyhole,
  Play,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Thermometer,
  TriangleAlert,
  Wifi,
  XCircle,
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

const navigation: Array<{
  id: ViewId;
  label: string;
  caption: string;
  icon: typeof Gauge;
}> = [
  {
    id: "projects",
    label: "Projets",
    caption: "Rattachement & versions",
    icon: FolderKanban,
  },
  {
    id: "overview",
    label: "Vue de preuve",
    caption: "Niveaux & services",
    icon: Gauge,
  },
  {
    id: "requirements",
    label: "Exigences",
    caption: "Critères traçables",
    icon: ClipboardCheck,
  },
  {
    id: "simulation",
    label: "Simulation",
    caption: "Modèle thermique",
    icon: Activity,
  },
  {
    id: "hardware",
    label: "Matériel & pilotes",
    caption: "Registre contrôlé",
    icon: Cpu,
  },
  {
    id: "bench",
    label: "Banc d’essai",
    caption: "Diagnostic & mesures",
    icon: Radio,
  },
  {
    id: "reports",
    label: "Rapports",
    caption: "Dossier de preuve",
    icon: FileCheck2,
  },
  {
    id: "audit",
    label: "Journal d’audit",
    caption: "Événements & reçus",
    icon: History,
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
    eyebrow: "N2",
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

export default function LabBench() {
  const { tKey } = useLanguage();
  const [view, setView] = useState<ViewId>("overview");
  const [mode, setMode] = useState<ModeId>("simulation");
  const [scenario, setScenario] = useState(readLabBenchScenario);
  const [humanConfirmed, setHumanConfirmed] = useState(false);
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
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
  const remoteAuditQuery = trpc.auditEvents.list.useQuery(
    remoteProjectId ?? "0",
    { enabled: Boolean(remoteProjectId && meQuery.data), retry: false },
  );
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
            <span>LABBENCH 01</span>
          </div>
        </div>
        <div className="lb-rail-label">ENVIRONNEMENT D’ESSAI</div>
        <nav aria-label="Navigation LabBench">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`lb-nav-item ${view === item.id ? "is-active" : ""}`}
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
        </nav>
        <div className="lb-rail-foot">
          <ShieldCheck size={17} />
          <span>
            <strong>Frontière de contrôle</strong>
            <small>
              Commandes virtuelles supervisées · aucune sortie physique
            </small>
          </span>
        </div>
      </aside>

      <section className="lb-main">
        <header className="lb-topbar">
          <div>
            <p className="lb-eyebrow">
              PROJET ACTIF · {status?.project?.code ?? "LABBENCH-01"}
            </p>
            <h1>{status?.project?.name ?? tKey("labbench.screen.title")}</h1>
          </div>
          <div className="lb-top-status">
            <span className="lb-chip">
              <CircleDot size={14} />{" "}
              {status?.project?.proofLevel ?? "N2 — Simulation"}
            </span>
            <span className="lb-lock">
              <LockKeyhole size={14} /> Aucune commande physique
            </span>
          </div>
        </header>
        <div className="lb-safety-banner">
          <ShieldCheck size={19} />
          <div>
            <strong>Barrière de sûreté active</strong>
            <span>
              Le changement de mode ne contrôle aucun appareil réel. Les
              consignes virtuelles sont bornées et exigent deux confirmations
              humaines par action. Les sorties physiques restent interdites.
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
        <section className="lb-mode-row" aria-label="Mode de travail">
          {modeItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                pendingCommand.current = null;
                setMode(item.id);
                setHumanConfirmed(false);
                setSafetyConfirmed(false);
              }}
              className={`lb-mode ${mode === item.id ? "is-active" : ""}`}
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
            <small>MODE ACTIF</small>
            <strong>{currentMode.label}</strong>
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
            <small>PASSERELLE MATÉRIELLE</small>
            <strong>VERROUILLÉE</strong>
            <span>Émulateur uniquement · aucune sortie physique</span>
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
              eyebrow="CHAÎNE DE PREUVE"
              title="État de référence du démonstrateur"
              detail="Le niveau actuel est calculé à partir de preuves affichées, jamais d’une étiquette d’interface."
            />
            <div className="lb-proof-track">
              {[
                ["N1", "Conception", "Exigences et registre créés", true],
                ["N2", "Simulation", "Calcul et données synthétiques", true],
                ["N3", "Essais physiques", "Mesures réelles archivées", false],
                ["N4", "Mise en service", "Revue indépendante", false],
              ].map(([level, title, detail, complete], index) => (
                <div
                  className={`lb-proof ${complete ? "is-complete" : ""}`}
                  key={String(level)}
                >
                  <span>
                    {complete ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <span className="lb-proof-number">{level}</span>
                    )}
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </div>
                  {index < 3 && <i />}
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
                  ["Modèle et exigences versionnés", true],
                  ["Calcul documenté et rejouable", true],
                  ["Matériel physique identifié", false],
                  ["Arrêt et état sûr vérifiés", false],
                  ["Revue indépendante terminée", false],
                ].map(([label, passed]) => (
                  <div className="lb-gate" key={String(label)}>
                    {passed ? (
                      <CheckCircle2 size={17} />
                    ) : (
                      <XCircle size={17} />
                    )}
                    <span>{label}</span>
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
              detail="Le moteur est déterministe, ses entrées sont bornées et le résultat conserve une version, une formule et une empreinte."
              actions={
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
                </span>
              </div>
            </section>
          </div>
        )}

        {view === "hardware" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="REGISTRES P1"
              title="Équipement et pilote déclarés"
              detail="Les identités, interfaces, versions et limites sont montrées avant toute lecture de banc."
            />
            <HardwareControlPanel />
            <LabBenchHardwareConfig />
            <div className="lb-hardware-grid">
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
              <section className="lb-panel">
                <div className="lb-panel-title">
                  <ShieldCheck size={17} />
                  <span>Registre pilote</span>
                </div>
                <div className="lb-asset-name">
                  <span>ADAPTATEUR</span>
                  <strong>
                    {selectedRegistryDriver?.name ??
                      status?.driver?.name ??
                      "AeroMind Device Gateway"}
                  </strong>
                  <small>
                    {selectedRegistryDriver?.version ??
                      status?.driver?.version ??
                      "0.1.0-sim"}{" "}
                    ·{" "}
                    {selectedRegistryDriver?.protocol ??
                      status?.driver?.protocol ??
                      "AMDG"}
                  </small>
                </div>
                <dl className="lb-definition-list">
                  <div>
                    <dt>Permissions</dt>
                    <dd>
                      {selectedRegistryDriver?.permissions ??
                        status?.driver?.permissions ??
                        "Lecture seule"}
                    </dd>
                  </div>
                  <div>
                    <dt>Validation</dt>
                    <dd>
                      {selectedRegistryDriver?.validationStatus ??
                        status?.driver?.validation ??
                        "Émulateur"}
                    </dd>
                  </div>
                  <div>
                    <dt>Liste blanche</dt>
                    <dd>
                      {selectedRegistryDriver
                        ? registryFieldLabels(
                            selectedRegistryDriver.allowlistJson,
                          )
                        : (Array.isArray(status?.driver?.allowedCommands)
                            ? status.driver.allowedCommands.join(" · ")
                            : "") || "read.temperature"}
                    </dd>
                  </div>
                  <div>
                    <dt>Commande libre IA</dt>
                    <dd className="lb-text-danger">Refusée</dd>
                  </div>
                </dl>
              </section>
            </div>
            <section className="lb-panel lb-catalog-panel">
              <div className="lb-panel-title">
                <Archive size={17} />
                <span>Catalogue importé</span>
                <small>NON VÉRIFIÉ</small>
              </div>
              <p className="lb-catalog-intro">
                Les références ci-dessous proviennent du JSON fourni. Elles sont
                conservées comme catalogue uniquement : aucun modèle, firmware,
                pilote ou fabricant n’est déclaré vérifié.
              </p>
              <div className="lb-catalog-list">
                {catalogDevices.map((device) => (
                  <article className="lb-catalog-card" key={device.id}>
                    <div className="lb-catalog-card-head">
                      <div>
                        <span className="lb-catalog-code">{device.id}</span>
                        <h3>{device.name}</h3>
                        <small>
                          {device.manufacturer?.name ??
                            "Référence non renseignée"}{" "}
                          · {device.category}
                        </small>
                      </div>
                      <span className="lb-catalog-status">
                        {catalogStatusLabel(device.operationalState)}
                      </span>
                    </div>
                    <div className="lb-catalog-facts">
                      <span>
                        <b>Criticité</b>
                        {catalogStatusLabel(
                          device.criticality?.level ?? "unspecified",
                        )}
                      </span>
                      <span>
                        <b>Connexion</b>
                        {catalogStatusLabel(device.connectionState)}
                      </span>
                      <span>
                        <b>Validation</b>
                        {catalogStatusLabel(device.validationStatus)}
                      </span>
                      <span>
                        <b>Pilote</b>
                        {catalogStatusLabel(
                          device.driver?.status ?? "not_registered",
                        )}
                      </span>
                    </div>
                    <p>{device.description}</p>
                    <div className="lb-catalog-tags">
                      {(Array.isArray(device.specifications?.interfaces)
                        ? device.specifications.interfaces
                        : []
                      ).map((item) => (
                        <span key={item.type}>
                          {item.type} · {catalogStatusLabel(item.security)}
                        </span>
                      ))}
                      {(Array.isArray(device.specifications?.standards)
                        ? device.specifications.standards
                        : []
                      ).map((standard) => (
                        <span key={standard.code}>
                          {standard.code} ·{" "}
                          {catalogStatusLabel(standard.status)}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
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
              }}
            />
          </div>
        )}

        {view === "bench" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="CONSOLE DE DIAGNOSTIC"
              title="Banc de test protégé"
              detail={`${currentMode.label} — ${currentMode.detail}`}
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
                  <span>Commande supervisée</span>
                </div>
                <div className="lb-command-readout">
                  <span>Commande structurée</span>
                  <strong>simulate.servo.setpoint</strong>
                  <small>
                    {scenario.positionSetpointDeg}° · plage autorisée 0–90° ·
                    simulation uniquement
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
                  commande.
                </p>
              </section>
            </div>
          </div>
        )}

        {view === "reports" && (
          <div className="lb-content">
            <SectionHeading
              eyebrow="DOSSIER DE PREUVE"
              title="Rapports et archivage"
              detail="Un rapport affirme le niveau de preuve disponible, pas les capacités futures du système."
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
                  ["Mesures physiques archivées", false],
                  ["Défaut de capteur injecté et traité", false],
                  ["État sûr matériel démontré", false],
                  ["Décision indépendante de mise en service", false],
                ].map(([label, done]) => (
                  <div className="lb-gate" key={String(label)}>
                    {done ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                    <span>{label}</span>
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
              eyebrow="TRAÇABILITÉ"
              title="Journal d’audit du projet actif"
              detail={
                remoteProjectId
                  ? "Les événements persistants du projet sont affichés avec les reçus de la session courante."
                  : "Mode aperçu : le journal affiché est local à cette session et ne constitue pas une preuve serveur."
              }
            />
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
    </main>
  );
}
