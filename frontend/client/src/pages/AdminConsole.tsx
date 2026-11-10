import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Activity, AlertCircle, ArrowDownToLine, ArrowLeft, Check, ChevronRight, Clock3, Cpu, FileClock, FolderKanban, FolderLock, LayoutDashboard, LockKeyhole, LogOut, Moon, RefreshCw, Search, ShieldCheck, Sparkles, Users } from "lucide-react";
import "./admin-console.css";

type Overview = {
  role: "admin" | "super_admin";
  account: { id?: string; name?: string; email?: string };
  workspace: { projects: number; cells: number; simulations: number };
  billing: { enabled: false; mode: string };
  physicalOutput: { enabled: false; requiresHumanAuthorization: true };
};
type ProjectRecord = { id: string; name: string; createdAt?: string | null; updatedAt?: string | null; hasCell: boolean };
type SimulationRecord = { id: string; projectId: string; projectName: string; createdAt?: string | null; status: string };
type AuditRecord = { id: string; projectId?: string | null; type: string; message: string; occurredAt?: string | null };
type Records = { projects: ProjectRecord[]; simulations: SimulationRecord[]; events: AuditRecord[]; limits: { perSection: number; payloadsIncluded: boolean } };
type View = "overview" | "projects" | "simulations" | "journal" | "security";

const nav: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Vue générale", icon: LayoutDashboard },
  { id: "projects", label: "Projets", icon: FolderKanban },
  { id: "simulations", label: "Simulations", icon: Activity },
  { id: "journal", label: "Journal", icon: FileClock },
  { id: "security", label: "Sécurité & accès", icon: ShieldCheck },
];
const time = (value?: string | null) => value ? new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function AdminConsole() {
  const [data, setData] = useState<Overview | null>(null);
  const [records, setRecords] = useState<Records | null>(null);
  const [error, setError] = useState("");
  const [recordsError, setRecordsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [localEmail, setLocalEmail] = useState("");
  const [localPassword, setLocalPassword] = useState("");
  const [localOtp, setLocalOtp] = useState("");
  const [localBusy, setLocalBusy] = useState(false);
  const [llmBusy, setLlmBusy] = useState(false);
  const [llmResult, setLlmResult] = useState<{ text: string; ok: boolean } | null>(null);
  const [sessionActionBusy, setSessionActionBusy] = useState(false);

  const loadConsole = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const overviewResponse = await fetch("/api/admin-console/overview", { credentials: "include" });
      const overviewBody = await overviewResponse.json().catch(() => ({}));
      if (!overviewResponse.ok) throw new Error(overviewResponse.status === 401 ? "Connectez-vous explicitement pour ouvrir la console." : overviewBody.detail || "Accès réservé aux rôles administrateur.");
      setData(overviewBody as Overview);
      try {
        const recordsResponse = await fetch("/api/admin-console/workspace/records", { credentials: "include" });
        const recordsBody = await recordsResponse.json().catch(() => ({}));
        if (!recordsResponse.ok) throw new Error(recordsBody.detail || "Les registres du workspace sont indisponibles.");
        setRecords(recordsBody as Records);
        setRecordsError("");
      } catch (reason) {
        setRecordsError(reason instanceof Error ? reason.message : "Les registres du workspace sont indisponibles.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Console indisponible.");
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadConsole();
  }, [loadConsole]);

  const login = () => { window.location.assign(`/api/auth/oidc/login?console=admin&return_to=${encodeURIComponent("/admin-console")}`); };
  const localLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLocalBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/local/login?console=admin", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: localEmail, password: localPassword, otp: localOtp }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || "Connexion locale refusée.");
      window.location.reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Connexion locale refusée."); }
    finally { setLocalBusy(false); }
  };
  const endConsoleSession = async (sleep = false) => {
    setSessionActionBusy(true);
    try {
      const response = await fetch("/api/admin-console/logout", { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("Le serveur n’a pas confirmé la fermeture de la session.");
      setData(null); setRecords(null); setLlmResult(null);
      setError(sleep ? "Console en veille sécurisée : session révoquée. Une reconnexion explicite est requise pour la reprendre." : "Session de console terminée. Le cockpit AeroMind n’a pas été connecté.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible de fermer la session de console.");
    } finally { setSessionActionBusy(false); }
  };
  const validateLlm = async () => {
    setLlmBusy(true); setLlmResult(null);
    try {
      const response = await fetch("/api/admin-console/llm/validate", { method: "POST", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || body.detail || "Échec de validation du gateway interne.");
      setLlmResult({ ok: true, text: `Connexion validée · déploiement ${body.deployment} · modèle ${body.model}` });
    } catch (reason) {
      setLlmResult({ ok: false, text: reason instanceof Error ? reason.message : "Échec de validation du gateway interne." });
    } finally { setLlmBusy(false); }
  };

  const exportRecords = () => {
    if (!records) return;
    const payload = [
      ["Type", "Identifiant", "Nom / statut", "Date", "Projet"],
      ...records.projects.map(item => ["Projet", item.id, item.name, time(item.updatedAt), ""]),
      ...records.simulations.map(item => ["Simulation", item.id, item.status, time(item.createdAt), item.projectName]),
    ];
    const csv = payload.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "aeromind-workspace-metadata.csv"; link.click(); URL.revokeObjectURL(url);
  };

  const filteredProjects = useMemo(() => (records?.projects ?? []).filter(item => `${item.name} ${item.id}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [records, query]);
  const filteredSimulations = useMemo(() => (records?.simulations ?? []).filter(item => `${item.projectName} ${item.status} ${item.id}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [records, query]);
  const roleName = data?.role === "super_admin" ? "Super-Admin" : "Administrateur";
  const section = nav.find(item => item.id === view)!;
  const SectionIcon = section.icon;

  return <main className="admin-console-shell">
    <div className="admin-console-frame">
      <div className="admin-console-topbar">
        <Link href="/" className="admin-console-brand"><span className="admin-console-mark" aria-hidden="true">A</span><span><strong>AEROMIND.IA</strong><small>Gouvernance opérationnelle</small></span></Link>
        <div className="admin-console-top-actions">
          {!loading && !data && <button type="button" onClick={login} className="admin-console-button admin-console-button-primary"><ShieldCheck size={14} /> Connexion</button>}
          {data && <button type="button" onClick={() => void loadConsole(true)} disabled={refreshing} className="admin-console-button admin-console-refresh"><RefreshCw size={14} className={refreshing ? "admin-console-spin" : ""} />{refreshing ? "Actualisation…" : "Actualiser"}</button>}
          {data && <button type="button" onClick={() => void endConsoleSession(true)} disabled={sessionActionBusy} className="admin-console-button admin-console-standby"><Moon size={14} />{sessionActionBusy ? "Fermeture…" : "Mise en veille"}</button>}
          {data && <button type="button" onClick={() => void endConsoleSession(false)} disabled={sessionActionBusy} className="admin-console-button admin-console-logout-top"><LogOut size={14} />{sessionActionBusy ? "Fermeture…" : "Déconnexion"}</button>}
          <Link href="/" className="admin-console-back"><ArrowLeft size={15} /> Retour au cockpit</Link>
        </div>
      </div>

      <header className="admin-console-hero">
        <div><p className="admin-console-eyebrow">Console de gouvernance · accès contrôlé</p><h1>Administration<br />de l’espace AeroMind.</h1><p>Gestion et suivi de l’espace du compte connecté. Les actions globales de gouvernance et la gestion des comptes restent réservées à la Console Super-Admin.</p></div>
        {!loading && data && <div className="admin-console-session"><i aria-hidden="true" /> SESSION {roleName.toUpperCase()} AUTHENTIFIÉE</div>}
      </header>

      {loading && <section className="admin-console-card admin-console-card-body" role="status"><p className="admin-console-eyebrow">Contrôle de session</p><h2 className="admin-console-loading-title">Vérification des autorisations…</h2><p className="admin-console-muted">Aucune action d’administration n’est exécutée pendant cette vérification.</p></section>}

      {!loading && error && <section className="admin-console-alert" aria-labelledby="admin-access-title">
        <h2 id="admin-access-title">Accès non établi</h2><p>{error}</p>
        <div className="admin-console-login-actions"><button type="button" onClick={login} className="admin-console-button admin-console-button-primary"><ShieldCheck size={15} /> Se connecter avec Microsoft Entra</button></div>
        <form onSubmit={localLogin} className="admin-console-form">
          <p className="admin-console-eyebrow">Authentification locale renforcée</p>
          <label>Adresse professionnelle<input required type="email" autoComplete="username" value={localEmail} onChange={event => setLocalEmail(event.target.value)} /></label>
          <label>Mot de passe MFA local<input required type="password" autoComplete="current-password" value={localPassword} onChange={event => setLocalPassword(event.target.value)} /></label>
          <label>Code TOTP à six chiffres<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={localOtp} onChange={event => setLocalOtp(event.target.value.replace(/\D/g, ""))} /></label>
          <button disabled={localBusy} className="admin-console-button">{localBusy ? "Vérification en cours…" : "Se connecter avec MFA local"}</button>
        </form>
      </section>}

      {!loading && data && <>
        <div className="admin-console-commandbar"><div className="admin-console-breadcrumb"><span>GOUVERNANCE</span><ChevronRight size={13} /><strong>{section.label}</strong></div><div className="admin-console-quick-actions"><span className="admin-console-limit">Périmètre individuel · métadonnées uniquement</span>{records && <button type="button" className="admin-console-button" onClick={exportRecords}><ArrowDownToLine size={14} /> Exporter les listes</button>}</div></div>
        <div className="admin-console-workspace">
          <nav className="admin-console-nav" aria-label="Navigation administrative">{nav.map(item => { const Icon = item.icon; return <button key={item.id} type="button" className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => { setView(item.id); setQuery(""); }}><Icon size={16} /><span>{item.label}</span>{item.id === "projects" && <b>{data.workspace.projects}</b>}{item.id === "simulations" && <b>{data.workspace.simulations}</b>}</button>; })}<div className="admin-console-nav-foot"><LockKeyhole size={14} /><span>Contrôle d’accès par session dédiée</span></div></nav>
          <section className="admin-console-view" aria-labelledby="admin-view-title">
            <div className="admin-console-view-heading"><div><p className="admin-console-eyebrow">AEROMIND.IA / ESPACE CONTRÔLÉ</p><h2 id="admin-view-title"><SectionIcon size={21} />{section.label}</h2><p>Consultation opérationnelle du périmètre autorisé pour {data.account.email}.</p></div><span className="admin-console-view-state"><i />{refreshing ? "MISE À JOUR" : "SESSION ACTIVE"}</span></div>
            {recordsError && <div className="admin-console-inline-error" role="alert"><AlertCircle size={15} />{recordsError}<button type="button" onClick={() => void loadConsole(true)}>Réessayer</button></div>}

            {view === "overview" && <>
              <section className="admin-console-card admin-console-overview-card"><div className="admin-console-card-head"><div><p className="admin-console-eyebrow">SYNTHÈSE DU WORKSPACE</p><h3>Ressources sous votre périmètre</h3><p>Comptages calculés côté serveur pour le compte authentifié.</p></div><FolderLock size={20} color="#087e83" /></div><div className="admin-console-card-body"><div className="admin-console-metrics">
                <article className="admin-console-metric"><span>Projets personnels</span><strong>{data.workspace.projects}</strong><small>Accès limité au propriétaire connecté</small></article>
                <article className="admin-console-metric"><span>Cellules créées explicitement</span><strong>{data.workspace.cells}</strong><small>Aucune création implicite à la connexion</small></article>
                <article className="admin-console-metric"><span>Simulations enregistrées</span><strong>{data.workspace.simulations}</strong><small>Registre associé au compte</small></article>
              </div></div></section>
              <div className="admin-console-overview-grid"><section className="admin-console-card"><div className="admin-console-card-head"><div><p className="admin-console-eyebrow">ACTIVITÉ RÉCENTE</p><h3>Dernières simulations</h3><p>Liste limitée aux métadonnées de l’espace.</p></div><button type="button" className="admin-console-text-link" onClick={() => setView("simulations")}>Ouvrir le registre <ChevronRight size={14} /></button></div><div className="admin-console-record-list">{(records?.simulations ?? []).slice(0, 5).map(item => <RecordRow key={item.id} title={item.projectName} subtitle={`${item.status} · ${item.id.slice(0, 8)}`} date={item.createdAt} icon={<Activity size={15} />} />)}{!records?.simulations.length && <EmptyState title="Aucune simulation enregistrée" text="Les simulations sauvegardées dans cet espace apparaîtront ici." />}</div></section>
                <section className="admin-console-card"><div className="admin-console-card-head"><div><p className="admin-console-eyebrow">DERNIÈRES MODIFICATIONS</p><h3>Journal du workspace</h3><p>Événements associés à votre compte ou à ses projets.</p></div><button type="button" className="admin-console-text-link" onClick={() => setView("journal")}>Consulter le journal <ChevronRight size={14} /></button></div><div className="admin-console-record-list">{(records?.events ?? []).slice(0, 5).map(item => <RecordRow key={item.id} title={item.type} subtitle={item.message} date={item.occurredAt} icon={<FileClock size={15} />} />)}{!records?.events.length && <EmptyState title="Aucun événement disponible" text="Aucune entrée d’audit n’est présente dans le périmètre de ce compte." />}</div></section></div>
              <section className="admin-console-card"><div className="admin-console-card-head"><div><p className="admin-console-eyebrow">GARDE-FOUS EN VIGUEUR</p><h3>Frontières d’administration</h3></div><ShieldCheck size={19} color="#087e83" /></div><div className="admin-console-card-body"><ul className="admin-console-policy-list"><li><LockKeyhole size={16} /><span>Les listes et indicateurs sont filtrés côté serveur par l’identifiant du compte connecté.</span></li><li><ShieldCheck size={16} /><span>La sortie physique reste désactivée dans cette console; aucun ordre matériel n’est proposé ici.</span></li><li><Users size={16} /><span>La gestion globale des comptes, rôles et approbations reste dans la Console Super-Admin.</span></li><li><Activity size={16} /><span>Aucun abonnement, prélèvement ou paramètre de facturation n’est géré par AeroMind.</span></li></ul></div></section>
            </>}

            {view === "projects" && <section className="admin-console-card"><div className="admin-console-card-head admin-console-registry-head"><div><p className="admin-console-eyebrow">REGISTRE PROPRIÉTAIRE</p><h3>Projets du workspace</h3><p>{filteredProjects.length} résultat(s) · maximum serveur {records?.limits.perSection ?? 100} · données de configuration exclues.</p></div><Search size={19} color="#087e83" /></div><div className="admin-console-registry-toolbar"><label className="admin-console-search"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher par nom ou identifiant" /></label><span>Tri : modification la plus récente</span></div><div className="admin-console-table-wrap"><table className="admin-console-table"><thead><tr><th>Projet</th><th>Identifiant</th><th>Cellule active</th><th>Création</th><th>Dernière modification</th></tr></thead><tbody>{filteredProjects.map(item => <tr key={item.id}><td><strong>{item.name || "Projet sans nom"}</strong></td><td><code>{item.id}</code></td><td><span className={`admin-console-badge ${item.hasCell ? "is-set" : "is-empty"}`}>{item.hasCell ? "RÉFÉRENCÉE" : "AUCUNE"}</span></td><td>{time(item.createdAt)}</td><td>{time(item.updatedAt)}</td></tr>)}{!filteredProjects.length && <tr><td colSpan={5}><EmptyState title="Aucun projet correspondant" text="Vérifiez le filtre ou créez un projet depuis le cockpit AeroMind." /></td></tr>}</tbody></table></div><p className="admin-console-data-note">Cette console est en lecture seule pour le registre projet. La création, édition et suppression s’effectuent dans le cockpit, avec ses contrôles de propriétaire.</p></section>}

            {view === "simulations" && <section className="admin-console-card"><div className="admin-console-card-head admin-console-registry-head"><div><p className="admin-console-eyebrow">REGISTRE D’EXÉCUTION</p><h3>Simulations enregistrées</h3><p>{filteredSimulations.length} résultat(s) · payloads d’ingénierie non exposés dans la console.</p></div><Activity size={19} color="#087e83" /></div><div className="admin-console-registry-toolbar"><label className="admin-console-search"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher par projet, statut ou identifiant" /></label><span>Lecture seule · propre au compte</span></div><div className="admin-console-record-list">{filteredSimulations.map(item => <article className="admin-console-record" key={item.id}><span className="admin-console-record-icon"><Activity size={16} /></span><div className="admin-console-record-main"><strong>{item.projectName}</strong><small>{item.id} · projet {item.projectId}</small></div><span className="admin-console-badge is-set">{item.status}</span><time>{time(item.createdAt)}</time></article>)}{!filteredSimulations.length && <EmptyState title="Aucune simulation correspondante" text="Les enregistrements disponibles apparaîtront ici lorsqu’ils seront associés à votre espace." />}</div></section>}

            {view === "journal" && <section className="admin-console-card"><div className="admin-console-card-head"><div><p className="admin-console-eyebrow">TRAÇABILITÉ DU WORKSPACE</p><h3>Événements d’audit</h3><p>Événements filtrés par propriétaire ou par projet appartenant à ce compte. Le journal global est réservé au Super-Admin.</p></div><FileClock size={19} color="#087e83" /></div><div className="admin-console-record-list">{(records?.events ?? []).map(item => <article className="admin-console-record admin-console-event" key={item.id}><span className="admin-console-record-icon"><FileClock size={16} /></span><div className="admin-console-record-main"><strong>{item.type}</strong><small>{item.message}</small>{item.projectId && <small>Projet : {item.projectId}</small>}</div><time>{time(item.occurredAt)}</time></article>)}{!records?.events.length && <EmptyState title="Journal vide" text="Aucun événement disponible dans le périmètre de cette identité." />}</div></section>}

            {view === "security" && <div className="admin-console-security-grid"><section className="admin-console-card"><div className="admin-console-card-head"><div><p className="admin-console-eyebrow">IDENTITÉ DE SESSION</p><h3>Compte & autorisations</h3><p>Session d’administration à cookie dédié, distincte de la session cockpit.</p></div><Users size={19} color="#087e83" /></div><div className="admin-console-card-body"><div className="admin-console-security-row"><span>Nom</span><strong>{data.account.name || "Non renseigné"}</strong></div><div className="admin-console-security-row"><span>Adresse de compte</span><strong>{data.account.email}</strong></div><div className="admin-console-security-row"><span>Rôle autorisé</span><strong>{roleName}</strong></div><div className="admin-console-security-row"><span>Identifiant de workspace</span><code>{data.account.id || "—"}</code></div><button type="button" onClick={() => void endConsoleSession(false)} disabled={sessionActionBusy} className="admin-console-button admin-console-button-dark admin-console-logout"><LogOut size={14} /> Déconnexion de cette console</button><p className="admin-console-data-note">La révocation de cette session ne connecte ni ne déconnecte automatiquement le cockpit.</p></div></section>
                <section className="admin-console-card"><div className="admin-console-card-head"><div><p className="admin-console-eyebrow">SERVICE IA</p><h3>Gateway interne AeroMind</h3><p>Test réel, minimal et contrôlé du déploiement interne configuré.</p></div><Cpu size={19} color="#087e83" /></div><div className="admin-console-card-body"><p className="admin-console-muted">L’URL du gateway et son secret ne sont jamais transmis à l’interface. Le résultat n’affiche que le mode de déploiement et l’identifiant de modèle.</p><button type="button" onClick={() => void validateLlm()} disabled={llmBusy} className="admin-console-button admin-console-button-primary"><Sparkles size={15} />{llmBusy ? "Test du gateway en cours…" : "Tester la connexion au gateway"}</button>{llmResult && <p role="status" className={`admin-console-result ${llmResult.ok ? "is-success" : "is-failure"}`}>{llmResult.ok ? <Check size={15} /> : <AlertCircle size={15} />}{llmResult.text}</p>}</div></section>
                <section className="admin-console-card"><div className="admin-console-card-head"><div><p className="admin-console-eyebrow">GOUVERNANCE PRIVÉE</p><h3>Facturation & sortie physique</h3><p>Politiques exposées par le backend de gouvernance.</p></div><ShieldCheck size={19} color="#087e83" /></div><div className="admin-console-card-body"><div className="admin-console-security-row"><span>Mode de déploiement</span><strong>{data.billing.mode}</strong></div><div className="admin-console-security-row"><span>Facturation applicative AeroMind</span><strong>{data.billing.enabled ? "Activée" : "Désactivée"}</strong></div><div className="admin-console-security-row"><span>Sortie physique</span><strong>{data.physicalOutput.enabled ? "Activée" : "Désactivée"}</strong></div><div className="admin-console-security-row"><span>Autorisation humaine requise</span><strong>{data.physicalOutput.requiresHumanAuthorization ? "Oui" : "Non"}</strong></div></div></section></div>}
          </section>
        </div>
      </>}
      <footer className="admin-console-footer"><strong>AEROMIND.IA · CONSOLE D’ADMINISTRATION</strong><span>Accès minimum nécessaire · Données à portée contrôlée · Vue actualisée {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span></footer>
    </div>
  </main>;
}

function RecordRow({ title, subtitle, date, icon }: { title: string; subtitle: string; date?: string | null; icon: React.ReactNode }) {
  return <article className="admin-console-record"><span className="admin-console-record-icon">{icon}</span><div className="admin-console-record-main"><strong>{title}</strong><small>{subtitle}</small></div><time><Clock3 size={12} />{time(date)}</time></article>;
}
function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="admin-console-empty"><FolderLock size={20} /><strong>{title}</strong><p>{text}</p></div>;
}
