import { trpc } from "@/lib/trpc";
import { Archive, CheckCircle2, Database, LockKeyhole, RotateCw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type RemoteProject = { id: string; project: { name: string; version: string } };

const simulationInput = {
  mode: "simulation" as const,
  ambientC: 21,
  heaterPowerW: 4,
  dutyCycle: 0.4,
  thermalResistanceCPerW: 3.2,
  durationSeconds: 120,
  positionSetpointDeg: 45,
};

export function LabBenchPersistencePanel({ projectId: controlledProjectId }: { projectId?: string | null } = {}) {
  const meQuery = trpc.auth.me.useQuery(undefined, { staleTime: 60_000 });
  const projectsQuery = trpc.projects.list.useQuery(undefined, { enabled: Boolean(meQuery.data), retry: false });
  const [projectId, setProjectId] = useState<string | null>(null);
  const projects = (projectsQuery.data ?? []).map(project => ({ ...project, id: String(project.id) })) as RemoteProject[];
  const selectedProject = projects.find(project => project.id === (controlledProjectId ?? projectId)) ?? projects[0];
  const selectedProjectId = selectedProject?.id ?? null;
  const registryQuery = trpc.labBench.registry.useQuery(selectedProjectId ?? "0", { enabled: Boolean(selectedProjectId), retry: false });

  useEffect(() => {
    if (!controlledProjectId && !projectId && projects[0]?.id) setProjectId(projects[0].id);
  }, [controlledProjectId, projectId, projects]);

  const seedMutation = trpc.labBench.seedRegistry.useMutation({
    onSuccess(result) {
      toast.success(result.seeded ? "Registre LabBench initialisé" : "Registre déjà présent", { description: result.seeded ? "Exigences, appareil, pilote et audit sont attachés au projet." : result.reason });
      void registryQuery.refetch();
    },
    onError(error) { toast.error("Initialisation refusée", { description: error.message }); },
  });
  const persistMutation = trpc.labBench.persistSimulation.useMutation({
    onSuccess(result) {
      toast.success("Run N2 archivé", { description: `${result.runId} · ${result.telemetry.length} échantillons · audit projet créé.` });
      void registryQuery.refetch();
    },
    onError(error) { toast.error("Archivage refusé", { description: error.message }); },
  });
  const reportMutation = trpc.reports.create.useMutation({
    onSuccess(result) { toast.success("Rapport archivé", { description: `Empreinte ${result.contentSha256.slice(0, 12)}…` }); },
    onError(error) { toast.error("Rapport non archivé", { description: error.message }); },
  });

  const archiveReport = () => {
    if (!selectedProjectId) return;
    reportMutation.mutate({
      id: selectedProjectId,
      title: "LabBench 01 — aperçu de simulation N2",
      contentMarkdown: "# AeroMind LabBench 01 — Simulation N2\n\n- Moteur : `labbench-thermal-v1.0.0`\n- Entrées : 21 °C, 4 W, duty 40 %, Rθ 3,2 °C/W, 120 s\n- Résultat : donnée synthétique uniquement\n- Sûreté : aucune commande physique émise\n\n> Ce rapport décrit une simulation ; il ne constitue pas une mesure physique, une certification ou une autorisation de mise en service.",
    });
  };

  if (meQuery.isLoading) return <section className="lb-persistence lb-panel"><Database size={18} /><div><strong>Vérification de l’accès au projet…</strong><span>Les écritures LabBench ne sont disponibles que pour un projet authentifié.</span></div></section>;
  if (!meQuery.data) return <section className="lb-persistence lb-panel"><LockKeyhole size={18} /><div><strong>Mode aperçu — aucune preuve officielle écrite</strong><span>Connectez-vous et créez/sélectionnez un projet AeroMind pour initialiser le registre, archiver les runs N2 et produire un rapport avec empreinte.</span></div></section>;
  if (!selectedProject) return <section className="lb-persistence lb-panel"><Database size={18} /><div><strong>Projet requis pour l’archivage LabBench</strong><span>Créez d’abord un projet dans le cockpit AeroMind ; aucun registre ni run n’est créé sans propriétaire.</span></div></section>;

  const registry = registryQuery.data;
  return <section className="lb-persistence lb-panel"><div className="lb-persistence-heading"><div><Database size={18} /><span><strong>Persistance officielle du projet</strong><small>{selectedProject.project.name} · {selectedProject.project.version}</small></span></div>{projects.length > 1 && !controlledProjectId && <select aria-label="Projet AeroMind cible" value={selectedProjectId} onChange={event => setProjectId(event.target.value)}>{projects.map(project => <option value={project.id} key={project.id}>{project.project.name}</option>)}</select>}</div><div className="lb-persistence-stats"><span><b>{registry?.requirements.length ?? 0}</b> exigences</span><span><b>{registry?.devices.length ?? 0}</b> appareil(s)</span><span><b>{registry?.drivers.length ?? 0}</b> pilote(s)</span><span><b>{registry?.runs.length ?? 0}</b> run(s)</span></div><div className="lb-persistence-actions"><button className="lb-secondary" disabled={seedMutation.isPending} onClick={() => seedMutation.mutate({ id: selectedProjectId })}><Save size={14} />{seedMutation.isPending ? "Initialisation…" : "Initialiser le registre"}</button><button className="lb-secondary" disabled={persistMutation.isPending} onClick={() => persistMutation.mutate({ id: selectedProjectId, ...simulationInput })}><RotateCw size={14} />{persistMutation.isPending ? "Archivage…" : "Archiver le run N2"}</button><button className="lb-secondary" disabled={reportMutation.isPending} onClick={archiveReport}><Archive size={14} />{reportMutation.isPending ? "Archivage…" : "Archiver le rapport"}</button></div><p><CheckCircle2 size={14} />Les écritures sont associées au propriétaire du projet, à un run, aux échantillons de télémétrie et à l’audit. Elles ne lèvent aucun verrou matériel.</p></section>;
}
