import type { ConceptConfig, Requirement } from "./aeroEngine";
import { hasDroneGeometry } from "./droneSketchGeometry";

export const ENGINEERING_MODULES = [
  "Contrôle de configuration", "Exigences", "Poste de construction", "Inspecteur & équipements", "Bibliothèque drones", "Simulation", "LabBench", "Essais / tableau visuel", "Poste de commandement de vol", "Rapport", "Copilote IA", "Opérations sûres", "Bibliothèque matériels", "Centre aéronautique", "Studio de conception",
] as const;
export type EngineeringModule = typeof ENGINEERING_MODULES[number];
export type SyncIssue = { code: string; severity: "info" | "warning" | "error"; module: EngineeringModule | "SÉCURITÉ"; message: string; solution: string };
export type EngineeringSyncHealth = { status: "READY" | "PARTIAL" | "BLOCKED"; revision: string; selectedProfileId: string | null; modules: Record<EngineeringModule, "linked" | "partial" | "waiting">; issues: SyncIssue[]; security: { physicalOutputEnabled: false; tamperGuard: "active" } };

export function evaluateEngineeringSync(input: { projectId: string; config: ConceptConfig; requirements: Requirement[]; runId: string; hasWorkflowRun: boolean }): EngineeringSyncHealth {
  const issues: SyncIssue[] = [];
  const hasCustomGeometry = hasDroneGeometry(input.config.customSketch?.strokes);
  const selectedProfileId = hasCustomGeometry
    ? input.config.engineeringSelection?.droneId ?? "custom-sketch"
    : input.config.engineeringSelection?.source === "custom" ? null : input.config.platformProfile ?? null;
  const hasProject = Boolean(input.projectId);
  if (!hasProject) issues.push({ code: "NO_PROJECT", severity: "warning", module: "Contrôle de configuration", message: "Aucun projet actif : aucune donnée métier ne peut être publiée.", solution: "Créer ou sélectionner manuellement un projet." });
  if (!selectedProfileId) issues.push({ code: "HUMAN_SELECTION_REQUIRED", severity: "info", module: "Bibliothèque drones", message: "Aucun drone n’est sélectionné automatiquement.", solution: "Sélectionner explicitement une architecture ou créer une cellule personnalisée." });
  if (!input.requirements.length) issues.push({ code: "NO_REQUIREMENTS", severity: "warning", module: "Exigences", message: "Aucune exigence n’est synchronisée.", solution: "Ajouter et approuver les exigences avant simulation." });
  if (!input.config.installedMaterials?.length) issues.push({ code: "NO_COMPONENTS", severity: "warning", module: "Poste de construction", message: "Aucun composant installé dans le document d’ingénierie.", solution: "Ajouter des composants depuis la bibliothèque ou le Studio." });
  if (!input.hasWorkflowRun && input.runId !== "—" && input.runId !== "SIM-000") issues.push({ code: "RUN_NOT_PERSISTED", severity: "warning", module: "Simulation", message: "Un identifiant de run local existe sans preuve de workflow serveur.", solution: "Enregistrer une PrototypeVersion puis lancer le workflow versionné." });
  if (input.hasWorkflowRun && !hasCustomGeometry) issues.push({ code: "SKETCH_NOT_ATTACHED", severity: "info", module: "Studio de conception", message: "Le run est lié à la configuration, mais aucun croquis géométrique n’est attaché.", solution: "Publier une géométrie de croquis dans la version prototype." });
  const modules = Object.fromEntries(ENGINEERING_MODULES.map(module => [module, hasProject ? (selectedProfileId || module === "Studio de conception" ? "linked" : "waiting") : "waiting"])) as EngineeringSyncHealth["modules"];
  for (const module of ["Simulation", "LabBench", "Essais / tableau visuel", "Copilote IA"] as const) modules[module] = input.hasWorkflowRun ? "linked" : "partial";
  const status = issues.some(issue => issue.severity === "error") ? "BLOCKED" : issues.some(issue => issue.severity === "warning") ? "PARTIAL" : "READY";
  return { status, revision: `${input.projectId || "workspace"}:${input.runId}:${selectedProfileId || "human-selection-required"}`, selectedProfileId, modules, issues, security: { physicalOutputEnabled: false, tamperGuard: "active" } };
}
