import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Activity, ArrowLeft, Cpu, FolderLock, LockKeyhole, LogOut, ShieldCheck, Sparkles, Users } from "lucide-react";
import "./admin-console.css";

type Overview = {
  role: "admin" | "super_admin";
  account: { name?: string; email?: string };
  workspace: { projects: number; cells: number; simulations: number };
  billing: { enabled: false; mode: string };
  physicalOutput: { enabled: false; requiresHumanAuthorization: true };
};

export default function AdminConsole() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [localEmail, setLocalEmail] = useState("");
  const [localPassword, setLocalPassword] = useState("");
  const [localOtp, setLocalOtp] = useState("");
  const [localBusy, setLocalBusy] = useState(false);
  const [llmBusy, setLlmBusy] = useState(false);
  const [llmResult, setLlmResult] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin-console/overview", { credentials: "include", signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(response.status === 401 ? "Connectez-vous explicitement pour ouvrir la console." : body.detail || "Accès réservé aux rôles administrateur.");
        return body as Overview;
      })
      .then(setData)
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message || "Console indisponible."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

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
  const logout = async () => {
    await fetch("/api/admin-console/logout", { method: "POST", credentials: "include" });
    setData(null);
    setError("Session de console terminée. Le cockpit AeroMind n’a pas été connecté.");
  };
  const validateLlm = async () => {
    setLlmBusy(true); setLlmResult("");
    try {
      const response = await fetch("/api/admin-console/llm/validate", { method: "POST", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || body.detail || "Échec de validation du gateway interne.");
      setLlmResult(`Connexion validée · déploiement ${body.deployment} · modèle ${body.model}`);
    } catch (reason) {
      setLlmResult(reason instanceof Error ? reason.message : "Échec de validation du gateway interne.");
    } finally { setLlmBusy(false); }
  };

  const roleName = data?.role === "super_admin" ? "Super-Admin" : "Administrateur";
  return <main className="admin-console-shell">
    <div className="admin-console-frame">
      <div className="admin-console-topbar">
        <Link href="/" className="admin-console-brand"><span className="admin-console-mark" aria-hidden="true">A</span><span><strong>AEROMIND.IA</strong><small>Gouvernance opérationnelle</small></span></Link>
        <Link href="/" className="admin-console-back"><ArrowLeft size={15} /> Retour au cockpit</Link>
      </div>

      <header className="admin-console-hero">
        <div><p className="admin-console-eyebrow">Console de gouvernance · accès contrôlé</p><h1>Administration<br />de l’espace AeroMind.</h1><p>Vue de pilotage limitée à l’identité et au périmètre de travail autorisés. Les opérations globales restent séparées dans la console Super-Admin.</p></div>
        {!loading && data && <div className="admin-console-session"><i aria-hidden="true" /> SESSION {roleName.toUpperCase()} ACTIVE</div>}
      </header>

      {loading && <section className="admin-console-card admin-console-card-body" role="status"><p className="admin-console-eyebrow">Contrôle de session</p><h2 style={{ margin: "8px 0 0", fontSize: 18 }}>Vérification des autorisations…</h2><p style={{ color: "#657a87", fontSize: 12 }}>Aucune action d’administration n’est exécutée pendant cette vérification.</p></section>}

      {!loading && error && <section className="admin-console-alert" aria-labelledby="admin-access-title">
        <h2 id="admin-access-title">Accès non établi</h2><p>{error}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}><button type="button" onClick={login} className="admin-console-button admin-console-button-primary"><ShieldCheck size={15} /> Se connecter avec Microsoft Entra</button></div>
        <form onSubmit={localLogin} className="admin-console-form">
          <p className="admin-console-eyebrow">Authentification locale renforcée</p>
          <label>Adresse professionnelle<input required type="email" autoComplete="username" value={localEmail} onChange={event => setLocalEmail(event.target.value)} /></label>
          <label>Mot de passe MFA local<input required type="password" autoComplete="current-password" value={localPassword} onChange={event => setLocalPassword(event.target.value)} /></label>
          <label>Code TOTP à six chiffres<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={localOtp} onChange={event => setLocalOtp(event.target.value.replace(/\D/g, ""))} /></label>
          <button disabled={localBusy} className="admin-console-button">{localBusy ? "Vérification en cours…" : "Se connecter avec MFA local"}</button>
        </form>
      </section>}

      {!loading && data && <>
        <div className="admin-console-layout">
          <div className="admin-console-main">
            <section className="admin-console-card">
              <div className="admin-console-card-head"><div><h2>Synthèse de l’espace de travail</h2><p>Indicateurs de l’espace associé au compte courant, sans agrégation d’autres utilisateurs.</p></div><FolderLock size={19} color="#087e83" /></div>
              <div className="admin-console-card-body"><div className="admin-console-metrics">
                <article className="admin-console-metric"><span>Projets personnels</span><strong>{data.workspace.projects}</strong><small>Dans le périmètre du compte</small></article>
                <article className="admin-console-metric"><span>Cellules créées explicitement</span><strong>{data.workspace.cells}</strong><small>Aucune création implicite</small></article>
                <article className="admin-console-metric"><span>Simulations</span><strong>{data.workspace.simulations}</strong><small>Traçabilité de l’espace</small></article>
              </div></div>
            </section>

            <section className="admin-console-card">
              <div className="admin-console-card-head"><div><h2>Garde-fous opérationnels</h2><p>Les règles affichées reflètent les capacités et limites déclarées par la console.</p></div><ShieldCheck size={19} color="#087e83" /></div>
              <div className="admin-console-card-body"><ul className="admin-console-policy-list">
                <li><LockKeyhole size={16} /><span>Les opérations restent limitées à l’espace personnel et au rôle autorisé.</span></li>
                <li><ShieldCheck size={16} /><span>La sortie physique est désactivée par défaut et exige une autorisation humaine.</span></li>
                <li><Users size={16} /><span>La gestion globale des comptes et les décisions de gouvernance Super-Admin restent hors de cette console.</span></li>
                <li><Activity size={16} /><span>Aucune offre, aucun abonnement ni prélèvement n’est piloté depuis cet espace.</span></li>
              </ul></div>
            </section>

            <section className="admin-console-card">
              <div className="admin-console-card-head"><div><h2>Validation du service IA interne</h2><p>Test contrôlé du gateway configuré. L’URL et le secret ne sont jamais transmis à l’interface.</p></div><Cpu size={19} color="#087e83" /></div>
              <div className="admin-console-card-body"><button type="button" onClick={() => void validateLlm()} disabled={llmBusy} className="admin-console-button admin-console-button-primary"><Sparkles size={15} />{llmBusy ? "Test du gateway en cours…" : "Tester la connexion au gateway interne"}</button>{llmResult && <p role="status" className="admin-console-result">{llmResult}</p>}</div>
            </section>
          </div>

          <aside className="admin-console-side">
            <section className="admin-console-scope"><h2>Identité & périmètre</h2><p>La session de cette console est séparée de la session du cockpit. Sa fermeture n’ouvre ni ne ferme automatiquement l’autre parcours.</p><div className="scope-meta"><span>Rôle</span><strong>{roleName}</strong></div><div className="scope-meta"><span>Compte</span><strong style={{ maxWidth: 170, overflowWrap: "anywhere", textAlign: "right" }}>{data.account.name || data.account.email}</strong></div><button type="button" onClick={() => void logout()} className="admin-console-button admin-console-button-dark" style={{ width: "100%", marginTop: 16 }}><LogOut size={14} /> Fermer la session console</button></section>
            <section className="admin-console-card"><div className="admin-console-card-head"><div><h2>Mode de déploiement</h2><p>Facturation applicative</p></div></div><div className="admin-console-card-body"><span className="admin-console-session" style={{ fontSize: 9 }}>SANS ABONNEMENT</span><p style={{ margin: "12px 0 0", color: "#657a87", fontSize: 11, lineHeight: 1.65 }}>Mode : {data.billing.mode}. Aucun prélèvement n’est initié par AeroMind.</p></div></section>
          </aside>
        </div>
      </>}
      <footer className="admin-console-footer"><strong>AEROMIND.IA · GOVERNANCE</strong><span>Accès minimum nécessaire · Session contrôlée</span></footer>
    </div>
  </main>;
}
