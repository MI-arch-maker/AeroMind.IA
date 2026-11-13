import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowLeft, Check, ChevronRight,
  Clock3, Cpu, FileClock, FolderKanban, FolderLock, LayoutDashboard,
  LockKeyhole, LogOut, Moon, RefreshCw, Search, ShieldCheck, Sparkles,
  Users,
} from "lucide-react";
import { AdminMechanicalPreview } from "@/components/AdminMechanicalPreview";
import { GOVERNANCE_STAGES } from "@/components/GovernanceCycleMap";
import { useLanguage } from "@/contexts/LanguageContext";
import "./admin-console.css";

export type Overview = {
  role: "admin" | "super_admin";
  account: { id?: string; name?: string; email?: string };
  workspace: { projects: number; cells: number; simulations: number };
  billing: { enabled: false; mode: string };
  physicalOutput: { enabled: false; requiresHumanAuthorization: true };
};
export type ProjectRecord = { id: string; name: string; createdAt?: string | null; updatedAt?: string | null; hasCell: boolean };
export type SimulationRecord = { id: string; projectId: string; projectName: string; createdAt?: string | null; status: string };
export type AuditRecord = { id: string; projectId?: string | null; type: string; message: string; occurredAt?: string | null };
export type Records = { projects: ProjectRecord[]; simulations: SimulationRecord[]; events: AuditRecord[]; limits: { perSection: number; payloadsIncluded: boolean } };
type QualificationEvent = { id: string; level: string; actor: string; actorRef: string; action: string; decision: string; projectId?: string | null; occurredAt?: string | null; source: string };
type QualificationActivity = { level: string; events: QualificationEvent[]; updatedAt: string; payloadsIncluded: false; refreshMode: string };
type MechanicalPreviewPayload = { projectId: string; projectName: string; configuration: unknown; readOnly: true; source: string };
export type View = "overview" | "projects" | "simulations" | "journal" | "activity" | "security";
type InspectorTab = "details" | "simulations" | "journal";

const nav: { id: View; labelKey: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", labelKey: "Mon espace", icon: LayoutDashboard },
  { id: "projects", labelKey: "Projets", icon: FolderKanban },
  { id: "simulations", labelKey: "Simulations", icon: Activity },
  { id: "journal", labelKey: "Journal", icon: FileClock },
  { id: "activity", labelKey: "Activités L1–L3", icon: Users },
  { id: "security", labelKey: "Sécurité & accès", icon: ShieldCheck },
];

const time = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
    : "—";
};

export default function AdminConsole() {
  const { t } = useLanguage();
  const [data, setData] = useState<Overview | null>(null);
  const [records, setRecords] = useState<Records | null>(null);
  const [qualificationActivity, setQualificationActivity] = useState<QualificationActivity | null>(null);
  const [qualificationActivityError, setQualificationActivityError] = useState("");
  const [qualificationActivityLoading, setQualificationActivityLoading] = useState(false);
  const [qualificationLevel, setQualificationLevel] = useState("all");
  const [mechanicalPreview, setMechanicalPreview] = useState<MechanicalPreviewPayload | null>(null);
  const [mechanicalPreviewError, setMechanicalPreviewError] = useState("");
  const [mechanicalPreviewLoading, setMechanicalPreviewLoading] = useState(false);
  const [error, setError] = useState("");
  const [recordsError, setRecordsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("details");
  const [localEmail, setLocalEmail] = useState("");
  const [localPassword, setLocalPassword] = useState("");
  const [localOtp, setLocalOtp] = useState("");
  const [localBusy, setLocalBusy] = useState(false);
  const [llmBusy, setLlmBusy] = useState(false);
  const [llmResult, setLlmResult] = useState<{ text: string; ok: boolean } | null>(null);
  const [sessionActionBusy, setSessionActionBusy] = useState(false);
  const activityRequestSequence = useRef(0);

  const loadConsole = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const overviewResponse = await fetch("/api/admin-console/overview", { credentials: "include" });
      const overviewBody = await overviewResponse.json().catch(() => ({}));
      if (!overviewResponse.ok) throw new Error(overviewResponse.status === 401 ? t("Connectez-vous explicitement pour ouvrir la console.") : overviewBody.detail || t("Accès réservé aux rôles administrateur."));
      setData(overviewBody as Overview);
      try {
        const recordsResponse = await fetch("/api/admin-console/workspace/records", { credentials: "include" });
        const recordsBody = await recordsResponse.json().catch(() => ({}));
        if (!recordsResponse.ok) throw new Error(recordsBody.detail || t("Les registres du workspace sont indisponibles."));
        setRecords(recordsBody as Records);
        setRecordsError("");
      } catch (reason) {
        setRecordsError(reason instanceof Error ? reason.message : t("Les registres du workspace sont indisponibles."));
        setRecords(null);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Console indisponible."));
      setData(null);
      setRecords(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => { void loadConsole(); }, [loadConsole]);
  const loadQualificationActivity = useCallback(async (quiet = false) => {
    if (!data || view !== "activity") return;
    const requestSequence = ++activityRequestSequence.current;
    if (!quiet) setQualificationActivityLoading(true);
    setQualificationActivityError("");
    try {
      const params = new URLSearchParams({ level: qualificationLevel, limit: "100" });
      const response = await fetch(`/api/admin-console/qualification-activity?${params}`, { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || t("Le registre d’activités L1–L3 est indisponible."));
      if (requestSequence === activityRequestSequence.current) setQualificationActivity(body as QualificationActivity);
    } catch (reason) {
      if (requestSequence === activityRequestSequence.current) setQualificationActivityError(reason instanceof Error ? reason.message : t("Le registre d’activités L1–L3 est indisponible."));
    } finally {
      if (requestSequence === activityRequestSequence.current && !quiet) setQualificationActivityLoading(false);
    }
  }, [data, view, qualificationLevel, t]);

  useEffect(() => {
    if (!data || view !== "activity") return;
    void loadQualificationActivity(false);
    const timer = window.setInterval(() => void loadQualificationActivity(true), 15_000);
    return () => {
      window.clearInterval(timer);
      activityRequestSequence.current += 1;
      setQualificationActivityLoading(false);
    };
  }, [data, view, loadQualificationActivity]);

  useEffect(() => {
    if (selectedProjectId && records && !records.projects.some(item => item.id === selectedProjectId)) {
      setSelectedProjectId(null);
      setInspectorTab("details");
    }
  }, [records, selectedProjectId]);

  const login = () => {
    window.location.assign(`/api/auth/oidc/login?console=admin&return_to=${encodeURIComponent("/admin-console")}`);
  };

  const localLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/local/login?console=admin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: localEmail, password: localPassword, otp: localOtp }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || t("Connexion locale refusée."));
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Connexion locale refusée."));
    } finally {
      setLocalBusy(false);
    }
  };

  const endConsoleSession = async (sleep = false) => {
    setSessionActionBusy(true);
    try {
      const response = await fetch("/api/admin-console/logout", { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error(t("Le serveur n’a pas confirmé la fermeture de la session."));
      setData(null);
      setRecords(null);
      setQualificationActivity(null);
      setMechanicalPreview(null);
      setError(sleep
        ? t("Console en veille sécurisée : session révoquée. Une reconnexion explicite est requise pour la reprendre.")
        : t("Session de console terminée. Le cockpit AeroMind n’a pas été connecté."));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Impossible de fermer la session de console."));
    } finally {
      setSessionActionBusy(false);
    }
  };

  const validateLlm = async () => {
    setLlmBusy(true);
    setLlmResult(null);
    try {
      const response = await fetch("/api/admin-console/llm/validate", { method: "POST", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || body.detail || t("Échec de validation du gateway interne."));
      setLlmResult({ ok: true, text: `${t("Connexion validée")} · ${t("déploiement")} ${body.deployment} · ${t("modèle")} ${body.model}` });
    } catch (reason) {
      setLlmResult({ ok: false, text: reason instanceof Error ? reason.message : t("Échec de validation du gateway interne.") });
    } finally {
      setLlmBusy(false);
    }
  };

  const exportRecords = () => {
    if (!records) return;
    const cell = (value: unknown) => {
      const text = String(value ?? "");
      const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const payload = [
      [t("Type"), t("Identifiant"), t("Nom / statut"), t("Détail"), t("Date"), t("Projet")],
      ...records.projects.map(item => [t("Projet"), item.id, item.name, t("Métadonnées du workspace"), time(item.updatedAt), ""]),
      ...records.simulations.map(item => [t("Simulation"), item.id, item.status, t("Métadonnées uniquement"), time(item.createdAt), item.projectName]),
      ...records.events.map(item => [t("Audit"), item.id, item.type, item.message, time(item.occurredAt), item.projectId ?? ""]),
    ];
    const csv = payload.map(row => row.map(cell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "aeromind-workspace-metadata.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const filteredProjects = useMemo(
    () => (records?.projects ?? []).filter(item => `${item.name} ${item.id}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())),
    [records, query],
  );
  const filteredSimulations = useMemo(
    () => (records?.simulations ?? []).filter(item => `${item.projectName} ${item.status} ${item.id}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())),
    [records, query],
  );
  const selectedProject = records?.projects.find(item => item.id === selectedProjectId) ?? null;
  const roleName = data?.role === "super_admin" ? t("Super-Admin") : t("Administrateur");
  const section = nav.find(item => item.id === view)!;
  const SectionIcon = section.icon;
  const selectedProjectSimulations = records?.simulations.filter(item => item.projectId === selectedProjectId) ?? [];
  const selectedProjectEvents = records?.events.filter(item => item.projectId === selectedProjectId) ?? [];

  useEffect(() => {
    if (!data || !selectedProject) {
      setMechanicalPreview(null);
      setMechanicalPreviewError("");
      setMechanicalPreviewLoading(false);
      return;
    }
    const controller = new AbortController();
    setMechanicalPreview(null);
    setMechanicalPreviewError("");
    setMechanicalPreviewLoading(true);
    fetch(`/api/admin-console/workspace/projects/${encodeURIComponent(selectedProject.id)}/mechanical-preview`, {
      credentials: "include", cache: "no-store", signal: controller.signal,
    }).then(async response => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || t("Le jumeau mécanique du projet est indisponible."));
      setMechanicalPreview(body as MechanicalPreviewPayload);
    }).catch(reason => {
      if (!controller.signal.aborted) setMechanicalPreviewError(reason instanceof Error ? reason.message : t("Le jumeau mécanique du projet est indisponible."));
    }).finally(() => {
      if (!controller.signal.aborted) setMechanicalPreviewLoading(false);
    });
    return () => controller.abort();
  }, [data?.account.id, selectedProject?.id, t]);

  const selectProject = (id: string) => {
    setSelectedProjectId(id);
    setInspectorTab("details");
    setView("overview");
  };

  return <main className="admin-console-shell">
    <aside className="admin-console-sidebar">
      <Link href="/" className="admin-console-brand">
        <span className="admin-console-mark" aria-hidden="true">A</span>
        <span><strong>{t("AEROMIND.IA")}</strong><small>{t("Ingénierie institutionnelle")}</small></span>
      </Link>
      <div className="admin-console-sidebar-context">
        <span>{t("CONSOLE ADMIN")}</span>
        <strong>{data?.role === "super_admin" ? "L5" : "L4"} · {t("PÉRIMÈTRE AUTORISÉ")}</strong>
      </div>
      <nav className="admin-console-nav" aria-label={t("Navigation administrative")}>
        {nav.map(item => {
          const Icon = item.icon;
          const badge = item.id === "projects" ? data?.workspace.projects : item.id === "simulations" ? data?.workspace.simulations : undefined;
          return <button key={item.id} type="button" className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => { setView(item.id); setQuery(""); }}>
            <Icon size={16} /><span>{t(item.labelKey)}</span>{badge !== undefined && <b>{badge}</b>}
          </button>;
        })}
        <Link href="/virtual-factory" className="admin-console-nav-link"><Cpu size={16} /><span>{t("Virtual Factory")}</span><ChevronRight size={13} /></Link>
        <Link href="/?view=mission-center" className="admin-console-nav-link admin-console-nav-simulation"><Activity size={16} /><span>{t("G01–G05 · simulation locale")}</span><ChevronRight size={13} /></Link>
      </nav>
      <div className="admin-console-sidebar-foot">
        <div className="admin-console-sidebar-lock"><LockKeyhole size={14} /><span>{t("Données limitées au propriétaire")}</span></div>
        {data && <><strong>{data.account.name || data.account.email || t("Identité vérifiée")}</strong><small>{data.account.email}</small><small className="admin-console-owner-id">{t("Identifiant propriétaire")} · {data.account.id || "—"}</small></>}
        <Link href="/" className="admin-console-back"><ArrowLeft size={14} />{t("Retour au cockpit")}</Link>
      </div>
    </aside>

    <section className="admin-console-app">
      <header className="admin-console-topbar">
        <div className="admin-console-context">
          <span className="admin-console-context-label">{t("WORKSPACE D’INGÉNIERIE")}</span>
          {data && <span className="admin-console-role-chip">{data.role === "super_admin" ? "L5 · SUPER-ADMIN" : "L4 · ADMIN"}</span>}
          {data && <span className="admin-console-virtual-chip">{data.physicalOutput.enabled ? t("SORTIE PHYSIQUE SOUMISE AUX CONTRÔLES") : t("VIRTUAL ONLY · SORTIES INACTIVES")}</span>}
        </div>
        <div className="admin-console-top-actions">
          {!loading && !data && <button type="button" onClick={login} className="admin-console-button admin-console-button-primary"><ShieldCheck size={14} />{t("Connexion")}</button>}
          {data && <button type="button" onClick={() => void loadConsole(true)} disabled={refreshing} className="admin-console-button admin-console-refresh"><RefreshCw size={14} className={refreshing ? "admin-console-spin" : ""} />{refreshing ? t("Actualisation…") : t("Actualiser")}</button>}
          {data && records && <button type="button" className="admin-console-button admin-console-export" onClick={exportRecords}><ArrowDownToLine size={14} />{t("Exporter les métadonnées")}</button>}
          {data && <button type="button" onClick={() => void endConsoleSession(true)} disabled={sessionActionBusy} className="admin-console-button admin-console-standby"><Moon size={14} />{sessionActionBusy ? t("Fermeture…") : t("Mise en veille")}</button>}
          {data && <button type="button" onClick={() => void endConsoleSession(false)} disabled={sessionActionBusy} className="admin-console-button admin-console-logout-top"><LogOut size={14} />{sessionActionBusy ? t("Fermeture…") : t("Déconnexion")}</button>}
        </div>
      </header>

      <div className="admin-console-main">
        {loading && <section className="admin-console-loading" role="status"><RefreshCw size={17} className="admin-console-spin" /><div><strong>{t("Vérification de la session dédiée…")}</strong><span>{t("Aucune connexion au cockpit et aucune action ne sont déclenchées automatiquement.")}</span></div></section>}

        {!loading && error && <section className="admin-console-auth" aria-labelledby="admin-access-title">
          <div className="admin-console-auth-heading"><ShieldCheck size={22} /><div><p className="admin-console-eyebrow">{t("CONNEXION EXPLICITE")}</p><h1 id="admin-access-title">{t("Accès non établi")}</h1><p>{error}</p></div></div>
          <div className="admin-console-auth-actions"><button type="button" onClick={login} className="admin-console-button admin-console-button-primary"><ShieldCheck size={15} />{t("Se connecter avec Microsoft Entra")}</button></div>
          <form onSubmit={localLogin} className="admin-console-form">
            <p className="admin-console-eyebrow">{t("AUTHENTIFICATION LOCALE RENFORCÉE")}</p>
            <label>{t("Adresse professionnelle")}<input required type="email" autoComplete="username" value={localEmail} onChange={event => setLocalEmail(event.target.value)} /></label>
            <label>{t("Mot de passe MFA local")}<input required type="password" autoComplete="current-password" value={localPassword} onChange={event => setLocalPassword(event.target.value)} /></label>
            <label>{t("Code TOTP à six chiffres")}<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={localOtp} onChange={event => setLocalOtp(event.target.value.replace(/\D/g, ""))} /></label>
            <button disabled={localBusy} className="admin-console-button admin-console-button-primary">{localBusy ? t("Vérification en cours…") : t("Se connecter avec MFA local")}</button>
          </form>
        </section>}

        {!loading && data && <>
          <div className="admin-console-commandbar">
            <div className="admin-console-breadcrumb"><span>{t("ESPACE PROPRIÉTAIRE")}</span><ChevronRight size={13} /><strong>{t(section.labelKey)}</strong></div>
            <div className="admin-console-command-meta"><span>{t("Registres renvoyés par l’API propriétaire")}</span>{records && <span>{records.projects.length} {t("projet(s) chargé(s)")}</span>}</div>
          </div>
          {recordsError && <div className="admin-console-inline-error" role="alert"><AlertCircle size={15} />{recordsError}<button type="button" onClick={() => void loadConsole(true)}>{t("Réessayer")}</button></div>}

          {view === "overview" && <>
            <section className="admin-console-workspace-heading">
              <div><p className="admin-console-eyebrow">{t("POSTE D’INGÉNIERIE")} · {data.role === "super_admin" ? "L5 SUPER-ADMIN" : "L4 ADMIN"}</p><h1>{t("Mon espace")}</h1><p>{t("La géométrie mécanique est chargée uniquement depuis le projet explicitement sélectionné et sa configuration persistée.")}</p></div>
              <div className="admin-console-heading-stats">
                <div><span>{t("Projets")}</span><strong>{data.workspace.projects}</strong></div>
                <div><span>{t("Cellules enregistrées")}</span><strong>{data.workspace.cells}</strong></div>
                <div><span>{t("Simulations")}</span><strong>{data.workspace.simulations}</strong></div>
              </div>
            </section>

            <section className="admin-console-gate-strip" aria-label={t("Repères G01 à G05 informatifs") }>
              <div className="admin-console-gate-title"><span>{t("PARCOURS DE GOUVERNANCE")}</span><strong>{t("G01–G05")}</strong><small>{t("Référentiel informatif · aucun état de gate réel affiché")}</small></div>
              <ol>{GOVERNANCE_STAGES.map((stage, index) => <li key={stage.code}><span>{stage.code}</span><strong>{t(stage.label)}</strong>{index < GOVERNANCE_STAGES.length - 1 && <i aria-hidden="true">›</i>}</li>)}</ol>
              <Link href="/?view=mission-center" className="admin-console-gate-link">{t("Ouvrir la simulation locale")}<ChevronRight size={13} /></Link>
            </section>

            <section className="admin-console-workbench" aria-label={t("Workspace d’ingénierie") }>
              <aside className="admin-console-project-tree">
                <div className="admin-console-panel-title"><div><p className="admin-console-eyebrow">{t("ESPACE PERSONNEL")}</p><h2>{t("Projets")}</h2></div><span className="admin-console-count">{records?.projects.length ?? 0}</span></div>
                <label className="admin-console-search"><Search size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Rechercher un projet…")} aria-label={t("Rechercher un projet")}/></label>
                <div className="admin-console-project-list" role="group" aria-label={t("Projets du compte autorisé")}>
                  {filteredProjects.map(item => <button key={item.id} type="button" className={`admin-console-project-item ${selectedProjectId === item.id ? "is-selected" : ""}`} aria-pressed={selectedProjectId === item.id} onClick={() => selectProject(item.id)}>
                    <span className="admin-console-project-glyph"><FolderKanban size={15} /></span><span className="admin-console-project-copy"><strong>{item.name || t("Projet sans nom")}</strong><small>{item.id.slice(0, 12)} · {item.hasCell ? t("Cellule référencée") : t("Aucune cellule référencée")}</small></span><ChevronRight size={14} />
                  </button>)}
                  {!filteredProjects.length && <EmptyState title={records?.projects.length ? t("Aucun projet correspondant") : t("Aucun projet enregistré")} text={records?.projects.length ? t("Modifiez le filtre pour retrouver les métadonnées correspondantes.") : t("Les projets apparaîtront ici après une création explicite dans le cockpit.")} />}
                </div>
                <div className="admin-console-tree-foot"><LockKeyhole size={13} /><span>{t("Liste filtrée côté serveur par propriétaire")}</span></div>
              </aside>

              <section className="admin-console-design-canvas" aria-labelledby="admin-canvas-title">
                <header className="admin-console-canvas-header"><div><p className="admin-console-eyebrow">{t("JUMEAU MÉCANIQUE")}</p><h2 id="admin-canvas-title">{t("Configuration du projet sélectionné")}</h2><span>{selectedProject?.name || t("Sélection humaine requise")}</span></div><Link href="/virtual-factory" className="admin-console-button admin-console-button-primary"><Cpu size={14} />{t("Ouvrir Virtual Factory")}</Link></header>
                <div className="admin-console-model-stage"><AdminMechanicalPreview projectId={selectedProject?.id} projectName={selectedProject?.name} configuration={mechanicalPreview?.configuration} loading={mechanicalPreviewLoading} error={mechanicalPreviewError || undefined} /></div>
                <footer className="admin-console-canvas-foot"><p><ShieldCheck size={14} />{t("Rendu mécanique en lecture seule à partir des paramètres persistés; aucune création, sauvegarde ou sortie physique.")}</p><span>{selectedProject?.id ?? t("Aucun projet sélectionné")}</span></footer>
              </section>

              <aside className="admin-console-inspector">
                <div className="admin-console-panel-title"><div><p className="admin-console-eyebrow">{t("INSPECTEUR")}</p><h2>{selectedProject?.name || t("Aucun projet sélectionné")}</h2></div><FolderLock size={17} /></div>
                <div className="admin-console-inspector-tabs" role="tablist" aria-label={t("Onglets de l’inspecteur")}>
                  {([["details", t("Dossier")], ["simulations", t("Simulations")], ["journal", t("Journal")]] as [InspectorTab, string][]).map(([tab, label]) => <button key={tab} id={`admin-inspector-tab-${tab}`} data-inspector-tab={tab} type="button" role="tab" aria-selected={inspectorTab === tab} aria-controls="admin-inspector-panel" tabIndex={inspectorTab === tab ? 0 : -1} className={inspectorTab === tab ? "is-active" : ""} onClick={() => setInspectorTab(tab)} onKeyDown={event => { if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return; event.preventDefault(); const tabs: InspectorTab[] = ["details", "simulations", "journal"]; const current = tabs.indexOf(tab); const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length; const nextTab = tabs[next]; setInspectorTab(nextTab); event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-inspector-tab="${nextTab}"]`)?.focus(); }}>{label}</button>)}
                </div>
                <div id="admin-inspector-panel" role="tabpanel" tabIndex={0} aria-labelledby={`admin-inspector-tab-${inspectorTab}`}>
                {!selectedProject && <div className="admin-console-inspector-empty"><FolderKanban size={20} /><strong>{t("Sélection humaine requise")}</strong><p>{t("Choisissez un projet dans la liste de votre espace pour consulter ses seules métadonnées.")}</p></div>}
                {selectedProject && inspectorTab === "details" && <dl className="admin-console-inspector-details">
                  <div><dt>{t("Identifiant projet")}</dt><dd><code>{selectedProject.id}</code></dd></div>
                  <div><dt>{t("Cellule référencée")}</dt><dd>{selectedProject.hasCell ? t("Oui · métadonnée") : t("Aucune")}</dd></div>
                  <div><dt>{t("Création")}</dt><dd>{time(selectedProject.createdAt)}</dd></div>
                  <div><dt>{t("Modification")}</dt><dd>{time(selectedProject.updatedAt)}</dd></div>
                  <div><dt>{t("Simulations enregistrées")}</dt><dd>{selectedProjectSimulations.length}</dd></div>
                  <p className="admin-console-inspector-note">{t("Seuls les champs nécessaires au jumeau mécanique sont fournis par une route owner-scoped; les autres payloads restent exclus.")}</p>
                </dl>}
                {selectedProject && inspectorTab === "simulations" && <div className="admin-console-inspector-records">{selectedProjectSimulations.length ? selectedProjectSimulations.map(item => <article key={item.id}><Activity size={14} /><div><strong>{item.status}</strong><small>{time(item.createdAt)}</small><code>{item.id}</code></div></article>) : <EmptyState title={t("Aucune simulation enregistrée")} text={t("Aucune simulation du registre propriétaire n’est associée à ce projet.")} />}</div>}
                {selectedProject && inspectorTab === "journal" && <div className="admin-console-inspector-records">{selectedProjectEvents.length ? selectedProjectEvents.map(item => <article key={item.id}><FileClock size={14} /><div><strong>{item.type}</strong><small>{item.message}</small><time>{time(item.occurredAt)}</time></div></article>) : <EmptyState title={t("Aucun événement associé")} text={t("Le registre du propriétaire ne contient pas d’événement lié à ce projet.")} />}</div>}
                </div>
              </aside>
            </section>

            <section className="admin-console-lower-grid">
              <div className="admin-console-lower-panel"><div className="admin-console-panel-title"><div><p className="admin-console-eyebrow">{t("COMMANDES DE WORKSPACE")}</p><h2>{t("Actions principales")}</h2></div><Cpu size={17} /></div><div className="admin-console-action-stack">
                <Link href="/virtual-factory" className="admin-console-action-link"><Cpu size={15} /><span><strong>{t("Ouvrir l’ingénierie virtuelle")}</strong><small>{t("La navigation ne crée aucune entité persistante.")}</small></span><ChevronRight size={14} /></Link>
                <button type="button" className="admin-console-action-link" onClick={() => setView("projects")}><FolderKanban size={15} /><span><strong>{t("Consulter le registre projets")}</strong><small>{t("Lecture seule · périmètre propriétaire")}</small></span><ChevronRight size={14} /></button>
                <button type="button" className="admin-console-action-link" onClick={() => setView("simulations")}><Activity size={15} /><span><strong>{t("Consulter les simulations")}</strong><small>{t("Métadonnées chargées depuis l’API")}</small></span><ChevronRight size={14} /></button>
              </div></div>
              <div className="admin-console-lower-panel"><div className="admin-console-panel-title"><div><p className="admin-console-eyebrow">{t("DOSSIER SÉLECTIONNÉ")}</p><h2>{t("Métadonnées du projet")}</h2></div><FolderLock size={16} /></div>
                {selectedProject ? <><strong className="admin-console-selected-name">{selectedProject.name || t("Projet sans nom")}</strong><div className="admin-console-selected-meta"><span>{t("Identifiant")}</span><code>{selectedProject.id}</code><span>{t("Cellule")}</span><strong>{selectedProject.hasCell ? t("Référencée") : t("Aucune")}</strong><span>{t("Dernière modification")}</span><strong>{time(selectedProject.updatedAt)}</strong></div></> : <p className="admin-console-lower-empty">{t("Aucun projet sélectionné dans cet inspecteur. Sélectionnez un projet pour afficher sa fiche API.")}</p>}
              </div>
              <div className="admin-console-lower-panel"><div className="admin-console-panel-title"><div><p className="admin-console-eyebrow">{t("JOURNAL PROPRIÉTAIRE")}</p><h2>{t("Activité récente")}</h2></div><FileClock size={16} /></div>
                <div className="admin-console-recent-events">{(records?.events ?? []).slice(0, 4).map(item => <article key={item.id}><span>{time(item.occurredAt)}</span><strong>{item.type}</strong><small>{item.message}</small></article>)}{!records?.events.length && <p className="admin-console-lower-empty">{t("Aucun événement disponible dans le périmètre retourné par l’API.")}</p>}</div>
              </div>
            </section>
          </>}

          {view === "projects" && <section className="admin-console-registry">
            <div className="admin-console-registry-heading"><div><p className="admin-console-eyebrow">{t("REGISTRE PROPRIÉTAIRE")}</p><h1>{t("Projets du workspace")}</h1><p>{filteredProjects.length} {t("résultat(s)")} · {t("maximum serveur")} {records?.limits.perSection ?? 100} · {t("configurations exclues")}</p></div></div>
            <label className="admin-console-search admin-console-registry-search"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Rechercher par nom ou identifiant")} /></label>
            <div className="admin-console-table-wrap"><table className="admin-console-table"><thead><tr><th>{t("Projet")}</th><th>{t("Identifiant")}</th><th>{t("Cellule référencée")}</th><th>{t("Création")}</th><th>{t("Dernière modification")}</th></tr></thead><tbody>{filteredProjects.map(item => <tr key={item.id} tabIndex={0} aria-selected={selectedProjectId === item.id} onClick={() => selectProject(item.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectProject(item.id); } }}><td><strong>{item.name || t("Projet sans nom")}</strong></td><td><code>{item.id}</code></td><td><span className={`admin-console-badge ${item.hasCell ? "is-set" : "is-empty"}`}>{item.hasCell ? t("RÉFÉRENCÉE") : t("AUCUNE")}</span></td><td>{time(item.createdAt)}</td><td>{time(item.updatedAt)}</td></tr>)}{!filteredProjects.length && <tr><td colSpan={5}><EmptyState title={t("Aucun projet correspondant")} text={t("Vérifiez le filtre ou créez un projet explicitement depuis le cockpit.")} /></td></tr>}</tbody></table></div>
            <p className="admin-console-data-note">{t("Consultation en lecture seule. Les données sont filtrées côté serveur par identité propriétaire; aucune mutation n’est offerte dans ce registre.")}</p>
          </section>}

          {view === "simulations" && <section className="admin-console-registry">
            <div className="admin-console-registry-heading"><div><p className="admin-console-eyebrow">{t("REGISTRE D’EXÉCUTION")}</p><h1>{t("Simulations enregistrées")}</h1><p>{filteredSimulations.length} {t("résultat(s)")} · {t("payloads d’ingénierie non exposés")}</p></div></div>
            <label className="admin-console-search admin-console-registry-search"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Rechercher par projet, statut ou identifiant")} /></label>
            <div className="admin-console-simulation-list">{filteredSimulations.map(item => <article className="admin-console-simulation-row" key={item.id}><span className="admin-console-project-glyph"><Activity size={15} /></span><div><strong>{item.projectName}</strong><small>{item.id} · {t("projet")} {item.projectId}</small></div><span className="admin-console-badge is-set">{item.status}</span><time>{time(item.createdAt)}</time></article>)}{!filteredSimulations.length && <EmptyState title={t("Aucune simulation correspondante")} text={t("Les métadonnées disponibles apparaîtront ici lorsqu’elles seront associées à votre espace.")} />}</div>
          </section>}

          {view === "journal" && <section className="admin-console-registry">
            <div className="admin-console-registry-heading"><div><p className="admin-console-eyebrow">{t("TRAÇABILITÉ DU WORKSPACE")}</p><h1>{t("Événements d’audit")}</h1><p>{t("Événements filtrés par propriétaire ou projet appartenant à ce compte. Le journal global reste hors de ce périmètre.")}</p></div></div>
            <div className="admin-console-simulation-list">{(records?.events ?? []).map(item => <article className="admin-console-event-row" key={item.id}><span className="admin-console-project-glyph"><FileClock size={15} /></span><div><strong>{item.type}</strong><small>{item.message}</small>{item.projectId && <small>{t("Projet")} · {item.projectId}</small>}</div><time>{time(item.occurredAt)}</time></article>)}{!records?.events.length && <EmptyState title={t("Journal vide")} text={t("Aucun événement disponible dans le périmètre de cette identité.")} />}</div>
          </section>}

          {view === "activity" && <section className="admin-console-registry admin-console-qualification-activity">
            <div className="admin-console-registry-heading"><div><p className="admin-console-eyebrow">{t("SUPERVISION DE GOUVERNANCE")}</p><h1>{t("Activités L1–L3")}</h1><p>{t("Journal d’activité filtré côté serveur par qualification; seuls des identifiants de compte et métadonnées opérationnelles sont exposés, jamais les payloads personnels.")}</p></div></div>
            <div className="admin-console-activity-toolbar">
              <label>{t("Filtrer par qualification")}<select value={qualificationLevel} onChange={event => { setQualificationActivity(null); setQualificationLevel(event.target.value); }} aria-label={t("Filtrer par qualification")}><option value="all">{t("Tous les niveaux")}</option><option value="L1">L1</option><option value="L2">L2</option><option value="L3">L3</option></select></label>
              <span>{t("Actualisation périodique toutes les 15 secondes")}{qualificationActivity?.updatedAt ? ` · ${time(qualificationActivity.updatedAt)}` : ""}</span>
              <button type="button" onClick={() => void loadQualificationActivity(false)} disabled={qualificationActivityLoading}><RefreshCw size={14} className={qualificationActivityLoading ? "admin-console-spin" : ""} />{t("Actualiser")}</button>
            </div>
            {qualificationActivityError && <div className="admin-console-inline-error" role="alert"><AlertCircle size={15} />{qualificationActivityError}</div>}
            {qualificationActivityLoading && !qualificationActivity && <p className="admin-console-activity-status" role="status">{t("Chargement des métadonnées d’activité…")}</p>}
            <div className="admin-console-table-wrap"><table className="admin-console-table admin-console-activity-table"><thead><tr><th>{t("Date")}</th><th>{t("Qualification")}</th><th>{t("Compte")}</th><th>{t("Action")}</th><th>{t("Décision")}</th><th>{t("Projet")}</th><th>{t("Source")}</th></tr></thead><tbody>
              {(qualificationActivity?.events ?? []).map(item => <tr key={`${item.source}:${item.id}`}><td>{time(item.occurredAt)}</td><td><span className="admin-console-badge is-set">{item.level}</span></td><td><strong>{item.actor}</strong><small className="admin-console-actor-ref">{item.actorRef}</small></td><td><code>{item.action}</code></td><td>{item.decision === "deny" || item.decision === "error" ? <span className="admin-console-badge is-empty">{item.decision}</span> : <span className="admin-console-badge is-set">{item.decision === "logged" ? t("Enregistrée") : item.decision}</span>}</td><td><code>{item.projectId || "—"}</code></td><td>{item.source === "canonical-audit" ? t("Audit canonique") : t("Audit projet")}</td></tr>)}
              {!qualificationActivityLoading && !qualificationActivityError && !(qualificationActivity?.events ?? []).length && <tr><td colSpan={7}><EmptyState title={t("Aucune activité enregistrée pour ce filtre")} text={t("Les événements apparaissent uniquement lorsqu’ils sont effectivement consignés dans les journaux disponibles.")} /></td></tr>}
            </tbody></table></div>
            <p className="admin-console-data-note">{t("Le niveau est déterminé par le registre serveur. Rafraîchissement périodique; ce panneau n’est pas un flux continu et ne reconstitue pas les actions absentes des journaux.")}</p>
          </section>}

          {view === "security" && <section className="admin-console-security-grid">
            <article className="admin-console-security-panel"><div className="admin-console-panel-title"><div><p className="admin-console-eyebrow">{t("IDENTITÉ DE SESSION")}</p><h2>{t("Compte & autorisations")}</h2></div><Users size={19} /></div><p>{t("Session d’administration à cookie dédié, distincte de la session cockpit.")}</p><div className="admin-console-security-rows"><div><span>{t("Nom")}</span><strong>{data.account.name || t("Non renseigné")}</strong></div><div><span>{t("Adresse de compte")}</span><strong>{data.account.email}</strong></div><div><span>{t("Rôle autorisé")}</span><strong>{roleName}</strong></div><div><span>{t("Identifiant propriétaire")}</span><code>{data.account.id || "—"}</code></div></div><button type="button" onClick={() => void endConsoleSession(false)} disabled={sessionActionBusy} className="admin-console-button admin-console-button-dark"><LogOut size={14} />{t("Déconnexion de cette console")}</button><p className="admin-console-security-note">{t("La révocation de cette session ne connecte ni ne déconnecte automatiquement le cockpit.")}</p></article>
            <article className="admin-console-security-panel"><div className="admin-console-panel-title"><div><p className="admin-console-eyebrow">{t("SERVICE IA")}</p><h2>{t("Gateway interne AeroMind")}</h2></div><Cpu size={19} /></div><p>{t("Test ponctuel explicite du déploiement interne configuré. Aucune URL ni clé n’est transmise à l’interface.")}</p><button type="button" onClick={() => void validateLlm()} disabled={llmBusy} className="admin-console-button admin-console-button-primary"><Sparkles size={15} />{llmBusy ? t("Test du gateway en cours…") : t("Tester la connexion au gateway")}</button>{llmResult && <p role="status" className={`admin-console-result ${llmResult.ok ? "is-success" : "is-failure"}`}>{llmResult.ok ? <Check size={15} /> : <AlertCircle size={15} />}{llmResult.text}</p>}</article>
            <article className="admin-console-security-panel admin-console-policy-panel"><div className="admin-console-panel-title"><div><p className="admin-console-eyebrow">{t("GOUVERNANCE PRIVÉE")}</p><h2>{t("Facturation & sortie physique")}</h2></div><ShieldCheck size={19} /></div><p>{t("Politiques effectivement renvoyées par le backend.")}</p><div className="admin-console-security-rows"><div><span>{t("Mode de déploiement")}</span><strong>{data.billing.mode}</strong></div><div><span>{t("Facturation applicative AeroMind")}</span><strong>{data.billing.enabled ? t("Activée") : t("Désactivée")}</strong></div><div><span>{t("Sortie physique")}</span><strong>{data.physicalOutput.enabled ? t("Activée") : t("Désactivée")}</strong></div><div><span>{t("Autorisation humaine requise")}</span><strong>{data.physicalOutput.requiresHumanAuthorization ? t("Oui") : t("Non")}</strong></div></div></article>
          </section>}
        </>}

        <footer className="admin-console-footer"><strong>{t("AEROMIND.IA")} {t("CONSOLE ADMIN")}</strong><span>{t("Accès minimum nécessaire · Périmètre propriétaire · Aucune connexion automatique")}</span></footer>
      </div>
    </section>
  </main>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="admin-console-empty"><FolderLock size={20} /><strong>{title}</strong><p>{text}</p></div>;
}
