import { trpc } from "@/lib/trpc";
import {
  Archive,
  CheckCircle2,
  Database,
  LockKeyhole,
  RotateCw,
  Save,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  defaultLabBenchScenario,
  normalizeLabBenchProjects,
  normalizeLabBenchScenario,
  normalizeLabBenchResult,
  validateLabBenchScenario,
  type LabBenchScenario,
  type LabBenchResult,
} from "@/lib/labBench";

export function LabBenchPersistencePanel({
  projectId: controlledProjectId,
  scenario = defaultLabBenchScenario,
  result: currentResult,
  onArchived,
}: {
  projectId?: string | null;
  scenario?: LabBenchScenario;
  result?: LabBenchResult | null;
  onArchived?: (result: LabBenchResult) => void;
} = {}) {
  const meQuery = trpc.auth.me.useQuery(undefined, {
    staleTime: 60_000,
    retry: 1,
  });
  const projectsQuery = trpc.projects.list.useQuery(undefined, {
    // Fire even without auth — same fix as LabBench.tsx
    enabled: true,
    retry: 2,
    retryDelay: 2000,
    staleTime: 30_000,
  });
  const [projectId, setProjectId] = useState<string | null>(null);
  const projects = normalizeLabBenchProjects(projectsQuery.data);
  const selectedProject =
    controlledProjectId !== undefined
      ? projects.find((project) => project.id === controlledProjectId)
      : (projects.find((project) => project.id === projectId) ?? projects[0]);
  const selectedProjectId = selectedProject?.id ?? null;
  const registryQuery = trpc.labBench.registry.useQuery(
    selectedProjectId ?? "0",
    { enabled: Boolean(selectedProjectId), retry: false },
  );

  useEffect(() => {
    if (!controlledProjectId && !projectId && projects[0]?.id)
      setProjectId(projects[0].id);
  }, [controlledProjectId, projectId, projects]);

  const seedMutation = trpc.labBench.seedRegistry.useMutation({
    onSuccess(result) {
      toast.success(
        result?.seeded
          ? "Registre LabBench initialisé"
          : "Registre déjà présent",
        {
          description: result?.seeded
            ? "Exigences, appareil, pilote et audit sont attachés au projet."
            : (result?.reason ?? "Réponse API non confirmée"),
        },
      );
      void registryQuery.refetch();
    },
    onError(error) {
      toast.error("Initialisation refusée", { description: error.message });
    },
  });
  const persistMutation = trpc.labBench.persistSimulation.useMutation({
    onSuccess(result, variables) {
      const archived = normalizeLabBenchResult(
        result,
        normalizeLabBenchScenario(variables),
      );
      if (!archived?.persisted || archived.source !== "server-archived") {
        toast.error("Archivage non confirmé", {
          description: "Le reçu ne confirme pas un run LABBENCH persistant.",
        });
        return;
      }
      onArchived?.(archived);
      if (
        typeof result?.runId !== "string" ||
        !Array.isArray(result?.telemetry)
      ) {
        toast.error("Archivage non confirmé", {
          description: "La réponse API ne contient pas de run valide.",
        });
        return;
      }
      const sampleCount = Array.isArray(result?.telemetry)
        ? result.telemetry.length
        : 0;
      toast.success("Run N2 archivé", {
        description: `${result?.runId ?? "Run non confirmé"} · ${sampleCount} échantillons · audit projet créé.`,
      });
      void registryQuery.refetch();
    },
    onError(error) {
      toast.error("Archivage refusé", { description: error.message });
    },
  });
  const reportMutation = trpc.labBench.createReport.useMutation({
    onSuccess(result) {
      if (typeof result?.contentSha256 !== "string") {
        toast.error("Rapport non confirmé", {
          description: "Aucune empreinte d’archivage reçue de l’API.",
        });
        return;
      }
      toast.success("Rapport archivé", {
        description: `Empreinte ${typeof result?.contentSha256 === "string" ? result.contentSha256.slice(0, 12) : "non confirmée"}…`,
      });
    },
    onError(error) {
      toast.error("Rapport non archivé", { description: error.message });
    },
  });

  const reportReady = Boolean(
    currentResult?.persisted &&
      currentResult.source === "server-archived" &&
      currentResult.projectId === selectedProjectId,
  );
  const archiveReport = () => {
    if (!selectedProjectId || !currentResult || !reportReady) return;
    reportMutation.mutate({
      id: selectedProjectId,
      runId: currentResult.runId,
    });
  };

  if (meQuery.isLoading)
    return (
      <section className="lb-persistence lb-panel">
        <Database size={18} />
        <div>
          <strong>Vérification de l’accès au projet…</strong>
          <span>
            Les écritures LabBench ne sont disponibles que pour un projet
            authentifié.
          </span>
        </div>
      </section>
    );
  if (!meQuery.data)
    return (
      <section className="lb-persistence lb-panel">
        <LockKeyhole size={18} />
        <div>
          <strong>Mode aperçu — aucune preuve officielle écrite</strong>
          <span>
            Connectez-vous et créez/sélectionnez un projet AeroMind pour
            initialiser le registre, archiver les runs N2 et produire un rapport
            avec empreinte.
          </span>
        </div>
      </section>
    );
  if (!selectedProject)
    return (
      <section className="lb-persistence lb-panel">
        <Database size={18} />
        <div>
          <strong>Projet requis pour l’archivage LabBench</strong>
          <span>
            Créez d’abord un projet dans le cockpit AeroMind ; aucun registre ni
            run n’est créé sans propriétaire.
          </span>
        </div>
      </section>
    );

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
  const registryRuns = Array.isArray(registry?.runs) ? registry.runs : [];
  return (
    <section className="lb-persistence lb-panel">
      <div className="lb-persistence-heading">
        <div>
          <Database size={18} />
          <span>
            <strong>Persistance officielle du projet</strong>
            <small>
              {selectedProject.project.name} · {selectedProject.project.version}
            </small>
          </span>
        </div>
        {projects.length > 1 && !controlledProjectId && (
          <select
            aria-label="Projet AeroMind cible"
            value={selectedProjectId ?? ""}
            onChange={(event) => setProjectId(event.target.value)}
          >
            {projects.map((project) => (
              <option value={project.id} key={project.id}>
                {project.project.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="lb-persistence-stats">
        <span>
          <b>{registryRequirements.length}</b> exigences
        </span>
        <span>
          <b>{registryDevices.length}</b> appareil(s)
        </span>
        <span>
          <b>{registryDrivers.length}</b> pilote(s)
        </span>
        <span>
          <b>{registryRuns.length}</b> run(s)
        </span>
      </div>
      <div className="lb-persistence-actions">
        <button
          className="lb-secondary"
          disabled={seedMutation.isPending}
          onClick={() => seedMutation.mutate({ id: selectedProjectId })}
        >
          <Save size={14} />
          {seedMutation.isPending
            ? "Initialisation…"
            : "Initialiser le registre"}
        </button>
        <button
          className="lb-secondary"
          disabled={
            persistMutation.isPending ||
            Boolean(validateLabBenchScenario(scenario))
          }
          onClick={() =>
            persistMutation.mutate({
              id: selectedProjectId,
              mode: "simulation",
              ...scenario,
            })
          }
        >
          <RotateCw size={14} />
          {persistMutation.isPending ? "Archivage…" : "Archiver le run N2"}
        </button>
        <button
          className="lb-secondary"
          disabled={reportMutation.isPending || !reportReady}
          onClick={archiveReport}
        >
          <Archive size={14} />
          {reportMutation.isPending ? "Archivage…" : "Archiver le rapport"}
        </button>
      </div>
      <p>
        <CheckCircle2 size={14} />
        Archivez d’abord le run N2 pour activer son rapport serveur. Les
        écritures sont associées au propriétaire du projet, à un run, aux
        échantillons de télémétrie et à l’audit. Elles ne lèvent aucun verrou
        matériel.
      </p>
    </section>
  );
}
