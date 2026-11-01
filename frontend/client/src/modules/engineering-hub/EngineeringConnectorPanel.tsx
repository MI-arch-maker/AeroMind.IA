import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, CheckCircle2, CircleAlert, FileUp, Play, RefreshCw, ShieldCheck } from "lucide-react";

type Connector = {
  family_id: string;
  products: string[];
  source_validation: string;
  status: string;
  status_detail: string;
  runtime_detected: boolean;
  runtime_names: string[];
  last_exchange_test: string | null;
  evidence_level: string;
};
type Job = {
  job_id: string;
  artifact_id: string;
  project_id: string;
  job_type: "import" | "export";
  profile_id: string;
  status: string;
  phase: string;
  input_sha256: string;
  report: Record<string, any>;
  error_code?: string | null;
};
type Props = { projectId?: string; t: (frenchText: string) => string };

function csrfHeaders(): Record<string, string> {
  try {
    const token = sessionStorage.getItem("lab_csrf_token");
    return token ? { "X-CSRF-Token": token } : {};
  } catch {
    return {};
  }
}
function idempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `ui-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
async function responseJson(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("API AeroMind indisponible : réponse non JSON.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.detail ?? body?.error?.message ?? body?.message ?? `HTTP ${response.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return body;
}

export default function EngineeringConnectorPanel({ projectId, t }: Props) {
  const english = t("Connecteurs & formats") === "Connectors & formats";
  const tr = (fr: string, en: string) => english ? en : fr;
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [simulationStatus, setSimulationStatus] = useState<any>(null);
  const [profileId, setProfileId] = useState("aeromind.bom.v1");
  const [dialectId, setDialectId] = useState("utf8-comma-v1");
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [exportJob, setExportJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [ackPartial, setAckPartial] = useState(false);
  const [confirmSourceOnly, setConfirmSourceOnly] = useState(false);
  const [notice, setNotice] = useState("");
  const [internalRun, setInternalRun] = useState<any>(null);
  const [simulationBusy, setSimulationBusy] = useState(false);
  const isStep = profileId === "aeromind.step.p21.inspect.v1";
  const isCsv = profileId !== "aeromind.step.p21.inspect.v1";
  const report = job?.report ?? {};

  const loadCatalog = async () => {
    try {
      const [catalog, status] = await Promise.all([
        fetch("/api/engineering/connectors", { credentials: "include", cache: "no-store" }).then(responseJson),
        fetch("/api/engineering/simulations/status", { credentials: "include", cache: "no-store" }).then(responseJson),
      ]);
      setConnectors(catalog.items ?? []);
      setSimulationStatus(status);
      setCatalogError("");
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : String(error));
    }
  };
  useEffect(() => { void loadCatalog(); }, []);

  const refreshJob = async (jobId: string, target: "import" | "export") => {
    const updated = await fetch(`/api/engineering/jobs/${encodeURIComponent(jobId)}`, { credentials: "include", cache: "no-store" }).then(responseJson);
    if (target === "import") setJob(updated);
    else setExportJob(updated);
  };
  useEffect(() => {
    if (!job || !["queued", "running", "cancel_requested"].includes(job.status)) return;
    let live = true;
    const timer = window.setInterval(() => {
      if (live) void refreshJob(job.job_id, "import").catch((error) => setNotice(error instanceof Error ? error.message : String(error)));
    }, 900);
    return () => { live = false; window.clearInterval(timer); };
  }, [job?.job_id, job?.status]);
  useEffect(() => {
    if (!exportJob || !["queued", "running", "cancel_requested"].includes(exportJob.status)) return;
    let live = true;
    const timer = window.setInterval(() => {
      if (live) void refreshJob(exportJob.job_id, "export").catch((error) => setNotice(error instanceof Error ? error.message : String(error)));
    }, 900);
    return () => { live = false; window.clearInterval(timer); };
  }, [exportJob?.job_id, exportJob?.status]);

  const importReady = useMemo(() => !!projectId && !!file && !busy, [projectId, file, busy]);
  const startImport = async () => {
    if (!projectId || !file) return;
    setBusy(true); setNotice(""); setJob(null); setExportJob(null); setAckPartial(false); setConfirmSourceOnly(false);
    try {
      const body = new FormData();
      body.set("project_id", projectId);
      body.set("profile_id", profileId);
      body.set("dialect_id", isCsv ? dialectId : "utf8-comma-v1");
      body.set("dry_run", "true");
      body.set("file", file);
      const created = await fetch("/api/engineering/files/import-jobs", {
        method: "POST", credentials: "include",
        headers: { "Idempotency-Key": idempotencyKey(), ...csrfHeaders() },
        body,
      }).then(responseJson);
      setJob(created);
      setNotice(tr("Fichier placé en quarantaine. Le rapport du dry-run est en cours.", "File quarantined. The dry-run report is processing."));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const commitImport = async () => {
    if (!job) return;
    setBusy(true); setNotice("");
    try {
      const updated = await fetch(`/api/engineering/jobs/${encodeURIComponent(job.job_id)}/commit`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({
          confirm: true,
          expected_input_sha256: job.input_sha256,
          acknowledge_partial: ackPartial,
          confirm_source_only: confirmSourceOnly,
        }),
      }).then(responseJson);
      setJob(updated);
      setNotice(tr("Commit effectué et lié au projet; consultez le rapport et les limites ci-dessous.", "Commit completed and linked to the project; review the report and limitations below."));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const startExport = async (format: "machine-canonical" | "spreadsheet-safe") => {
    if (!projectId || !job) return;
    setBusy(true); setNotice("");
    try {
      const created = await fetch("/api/engineering/files/export-jobs", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey(), ...csrfHeaders() },
        body: JSON.stringify({ project_id: projectId, source_job_id: job.job_id, export_format: format }),
      }).then(responseJson);
      setExportJob(created);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const runInternal = async () => {
    if (!projectId) return;
    setSimulationBusy(true); setNotice(""); setInternalRun(null);
    try {
      const result = await fetch("/api/engineering/simulations/internal", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey(), ...csrfHeaders() },
        body: JSON.stringify({ project_id: projectId, scenario_id: "propulsion.hybrid-demo.v1" }),
      }).then(responseJson);
      setInternalRun(result);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setSimulationBusy(false);
    }
  };

  return <div className="hub-operations">
    <section className="hub-operation-card">
      <div className="hub-operation-heading"><div><span>CONNECTOR REGISTRY / SERVER-REPORTED</span><h3>{tr("Registre des 13 familles", "13-family connector registry")}</h3></div><button type="button" className="hub-icon-button" onClick={() => void loadCatalog()} aria-label={tr("Actualiser", "Refresh")}><RefreshCw size={15} /></button></div>
      <p className="hub-muted">{tr("La présence éventuelle d’un exécutable n’est pas un test de santé, de licence ou d’échange. Aucun connecteur externe n’est marqué connecté.", "A detected executable is not a health, license, or exchange test. No external connector is marked connected.")}</p>
      {catalogError && <div className="hub-message error"><CircleAlert size={15} />{catalogError}</div>}
      <div className="hub-connector-table" role="table" aria-label={tr("Registre serveur des connecteurs", "Server connector registry")}>
        <div className="hub-connector-row hub-connector-header" role="row"><span>{tr("Famille / produits", "Family / products")}</span><span>{tr("État serveur", "Server status")}</span><span>{tr("Runtime", "Runtime")}</span><span>{tr("Preuve d’échange", "Exchange evidence")}</span></div>
        {connectors.map((item) => <div className="hub-connector-row hub-connector-live" role="row" key={item.family_id}>
          <strong>{item.products.join(" / ")}</strong>
          <span className="hub-connector-state"><i />{tr("Configuration requise", "Configuration required")}</span>
          <span>{item.runtime_detected ? item.runtime_names.join(", ") : tr("Non détecté", "Not detected")}</span>
          <span title={item.status_detail}>{item.last_exchange_test ? item.evidence_level : tr("Aucun échange testé", "No exchange tested")}</span>
        </div>)}
        {!connectors.length && !catalogError && <div className="hub-empty">{tr("Chargement du registre serveur…", "Loading server registry…")}</div>}
      </div>
      <p className="hub-connector-footnote">{tr("Les six familles restantes nécessitent une vérification documentaire complémentaire; licences, comptes et endpoints ne sont pas configurés ici.", "Six families still require additional source review; licenses, accounts, and endpoints are not configured here.")}</p>
    </section>

    <section className="hub-operation-card">
      <div className="hub-operation-heading"><div><span>FILE ADAPTER / DRY-RUN FIRST</span><h3>{tr("Importer un fichier d’ingénierie", "Import an engineering file")}</h3></div><FileUp size={18} /></div>
      <p className="hub-muted">{tr("Les imports sont d’abord validés en dry-run. Aucun enregistrement n’est commité automatiquement; l’identité du projet provient du contexte authentifié, jamais du CSV.", "Imports are validated in dry-run first. Nothing is committed automatically; project identity comes from the authenticated context, never from the CSV.")}</p>
      {!projectId && <div className="hub-message warning"><CircleAlert size={15} />{tr("Ouvrez ou créez un projet persistant avant l’import.", "Open or create a persistent project before importing.")}</div>}
      <div className="hub-form-grid">
        <label>{tr("Profil de données", "Data profile")}<select value={profileId} onChange={(event) => { setProfileId(event.target.value); setFile(null); setJob(null); setExportJob(null); }}>
          <option value="aeromind.bom.v1">aeromind.bom.v1 — BOM CSV</option>
          <option value="aeromind.simulation-results.v1">aeromind.simulation-results.v1 — résultats CSV</option>
          <option value="aeromind.step.p21.inspect.v1">aeromind.step.p21.inspect.v1 — inspection STEP</option>
        </select></label>
        {isCsv && <label>{tr("Dialecte CSV (choix explicite)", "CSV dialect (explicit selection)")}<select value={dialectId} onChange={(event) => setDialectId(event.target.value)}>
          <option value="utf8-comma-v1">UTF-8 · virgule · RFC 4180</option>
          <option value="utf8-bom-comma-v1">UTF-8 BOM · virgule</option>
          <option value="utf8-semicolon-v1">UTF-8 · point-virgule</option>
        </select></label>}
        <label className="hub-file-field">{tr("Fichier source", "Source file")}<input type="file" accept={isStep ? ".step,.stp" : ".csv,text/csv"} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      </div>
      {isStep && <div className="hub-message warning"><CircleAlert size={15} />{tr("STEP est limité à l’inspection structurelle Part 21 : aucune géométrie B-rep, PMI ou historique n’est extrait. Le commit lie seulement le fichier source au projet.", "STEP is limited to Part 21 structural inspection: no B-rep geometry, PMI, or history is extracted. Commit links only the source file to the project.")}</div>}
      {isCsv && <div className="hub-inline-note"><ShieldCheck size={15} />{tr("Cellules traitées comme données inertes; aucune formule, commande, macro ou fichier externe n’est exécuté.", "Cells are inert data; no formula, command, macro, or external file is executed.")}</div>}
      <div className="hub-action-row"><button type="button" className="hub-primary-button" disabled={!importReady} onClick={() => void startImport()}>{busy ? tr("Traitement…", "Processing…") : tr("Lancer le dry-run", "Run dry-run")}</button>{file && <span>{file.name} · {Math.ceil(file.size / 1024)} KiB</span>}</div>
      {notice && <div className={`hub-message ${notice.toLowerCase().includes("erreur") || notice.includes("HTTP") ? "error" : "info"}`}>{notice}</div>}
      {job && <div className="hub-job-report">
        <div className="hub-job-header"><strong>{tr("Job", "Job")} {job.job_id.slice(0, 8)} · {job.status}</strong><span>SHA-256 {job.input_sha256}</span></div>
        {(job.status === "awaiting_review") && <>
          {Number(report.rejected_records ?? 0) > 0 && <label className="hub-confirm-check"><input type="checkbox" checked={ackPartial} onChange={(event) => setAckPartial(event.target.checked)} />{tr(`Je confirme le commit partiel (${report.accepted_records} acceptées / ${report.rejected_records} rejetées).`, `I confirm partial commit (${report.accepted_records} accepted / ${report.rejected_records} rejected).`)}</label>}
          {isStep && <label className="hub-confirm-check"><input type="checkbox" checked={confirmSourceOnly} onChange={(event) => setConfirmSourceOnly(event.target.checked)} />{tr("Je confirme que seul le fichier STEP brut est lié; aucune géométrie n’est importée.", "I confirm only the raw STEP file is linked; no geometry is imported.")}</label>}
          <button type="button" className="hub-primary-button" disabled={busy || (Number(report.rejected_records ?? 0) > 0 && !ackPartial) || (isStep && !confirmSourceOnly)} onClick={() => void commitImport()}>{tr("Confirmer le commit", "Confirm commit")}</button>
        </>}
        {job.status === "completed" && job.job_type === "import" && job.profile_id !== "aeromind.step.p21.inspect.v1" && <div className="hub-action-row"><button type="button" className="hub-secondary-button" disabled={busy} onClick={() => void startExport("machine-canonical")}>{tr("Exporter CSV canonique", "Export canonical CSV")}</button><button type="button" className="hub-secondary-button" disabled={busy} onClick={() => void startExport("spreadsheet-safe")}>{tr("Exporter CSV tableur-sûr", "Export spreadsheet-safe CSV")}</button></div>}
        <div className="hub-report-stats"><span>{tr("Lignes acceptées", "Accepted rows")}: <strong>{report.accepted_records ?? "—"}</strong></span><span>{tr("Lignes rejetées", "Rejected rows")}: <strong>{report.rejected_records ?? "—"}</strong></span><span>{tr("Preuve", "Evidence")}: <strong>{report.evidence_level ?? "en attente"}</strong></span><span>{tr("Scan AV", "AV scan")}: <strong>{report.scan_status ?? tr("non réalisé", "not performed")}</strong></span></div>
        {Array.isArray(report.warnings) && report.warnings.length > 0 && <ul className="hub-report-list">{report.warnings.map((warning: any, index: number) => <li key={`${warning.code}-${index}`}>{warning.message}</li>)}</ul>}
        {Array.isArray(report.errors) && report.errors.length > 0 && <ul className="hub-report-list error">{report.errors.map((error: any, index: number) => <li key={`${error.code}-${index}`}>{error.code}: {error.message}</li>)}</ul>}
        {Array.isArray(report.row_errors) && report.row_errors.length > 0 && <details><summary>{tr("Détail des rejets de lignes", "Row rejection details")}</summary><pre>{JSON.stringify(report.row_errors, null, 2)}</pre></details>}
        {Array.isArray(report.sample_records) && report.sample_records.length > 0 && <details><summary>{tr("Aperçu normalisé", "Normalized preview")}</summary><pre>{JSON.stringify(report.sample_records, null, 2)}</pre></details>}
      </div>}
      {exportJob && <div className="hub-message info">{tr("Export", "Export")} · {exportJob.status} {exportJob.status === "completed" && <a href={`/api/engineering/jobs/${encodeURIComponent(exportJob.job_id)}/download`}><ArrowDownToLine size={14} /> {tr("Télécharger le CSV", "Download CSV")}</a>}</div>}
    </section>

    <section className="hub-operation-card hub-simulation-card">
      <div className="hub-operation-heading"><div><span>SIMULATION / STRICTLY NON-PHYSICAL</span><h3>{tr("Flux de simulation", "Simulation workflow")}</h3></div><Play size={17} /></div>
      <div className="hub-simulation-status-grid">
        <div><small>{tr("Moteur interne", "Internal engine")}</small><strong>{simulationStatus?.internal?.status ?? tr("Chargement…", "Loading…")}</strong><span>{simulationStatus?.internal?.evidence_level ?? "—"}</span></div>
        <div><small>{tr("SITL externe", "External SITL")}</small><strong>{tr("Configuration requise", "Configuration required")}</strong><span>{simulationStatus?.external_sitl?.reason ?? tr("État serveur indisponible", "Server status unavailable")}</span></div>
      </div>
      <p className="hub-muted">{tr("Le scénario interne exécute le modèle déterministe de propulsion AeroMind; ce n’est ni un autopilote, ni une dynamique de vol, ni un test SITL.", "The internal scenario runs AeroMind’s deterministic propulsion model; it is not an autopilot, flight dynamics model, or SITL test.")}</p>
      <button type="button" className="hub-primary-button" disabled={!projectId || simulationBusy} onClick={() => void runInternal()}>{simulationBusy ? tr("Run en cours…", "Run in progress…") : tr("Exécuter le scénario hybride de démonstration", "Run hybrid demonstration scenario")}</button>
      {internalRun && <div className="hub-message success"><CheckCircle2 size={15} /><span>{tr("Run enregistré", "Run persisted")} {internalRun.run_id} · {internalRun.evidence_level} · {tr("sortie physique désactivée", "physical output disabled")}</span></div>}
    </section>
  </div>;
}
