import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Activity, ArrowLeft, FolderLock, ShieldCheck } from "lucide-react";

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
      setLlmResult(`Connecté · déploiement ${body.deployment} · modèle ${body.model}`);
    } catch (reason) {
      setLlmResult(reason instanceof Error ? reason.message : "Échec de validation du gateway interne.");
    } finally { setLlmBusy(false); }
  };
  return <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100">
    <div className="mx-auto max-w-4xl">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft size={16}/>Retour à AeroMind</Link>
      <header className="mt-8 flex items-start gap-4 border-b border-slate-800 pb-7"><ShieldCheck className="mt-1 text-cyan-300" size={30}/><div><p className="text-xs uppercase tracking-[.2em] text-cyan-300">Gouvernance AeroMind · accès contrôlé</p><h1 className="mt-2 text-3xl font-semibold">Console administrateur</h1><p className="mt-2 text-sm text-slate-400">Vue limitée à votre espace. Les opérations super-admin restent dans leur console dédiée.</p></div></header>
      {loading && <p className="py-10 text-slate-400">Vérification des autorisations…</p>}
      {!loading && error && <section className="mt-8 rounded-xl border border-amber-700/50 bg-amber-950/30 p-6"><h2 className="font-semibold">Accès non établi</h2><p className="mt-2 text-sm text-amber-100">{error}</p><button onClick={login} className="mt-5 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950">Se connecter explicitement avec Entra</button><form onSubmit={localLogin} className="mt-6 grid max-w-md gap-3 border-t border-amber-900/50 pt-5"><label className="grid gap-1 text-sm">Adresse professionnelle<input required type="email" autoComplete="username" value={localEmail} onChange={event => setLocalEmail(event.target.value)} className="rounded border border-slate-700 bg-slate-900 p-2"/></label><label className="grid gap-1 text-sm">Mot de passe MFA local<input required type="password" autoComplete="current-password" value={localPassword} onChange={event => setLocalPassword(event.target.value)} className="rounded border border-slate-700 bg-slate-900 p-2"/></label><label className="grid gap-1 text-sm">Code TOTP à six chiffres<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={localOtp} onChange={event => setLocalOtp(event.target.value)} className="rounded border border-slate-700 bg-slate-900 p-2"/></label><button disabled={localBusy} className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold">{localBusy ? "Vérification…" : "Se connecter avec MFA local"}</button></form></section>}
      {data && <>
        <div className="mt-6 flex items-center justify-between gap-4"><p className="text-sm text-slate-400">Session console {data.role} · {data.account.name || data.account.email}</p><button onClick={() => void logout()} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">Fermer la session console</button></div>
        <section className="mt-5 grid gap-4 sm:grid-cols-3">{[["Projets personnels", data.workspace.projects], ["Cellules créées explicitement", data.workspace.cells], ["Simulations", data.workspace.simulations]].map(([label, value]) => <article key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900 p-5"><FolderLock className="mb-4 text-cyan-300" size={20}/><p className="text-sm text-slate-400">{label}</p><strong className="mt-1 block text-3xl">{value}</strong></article>)}</section>
        <section className="mt-5 rounded-xl border border-slate-800 bg-slate-900 p-5"><h2 className="flex items-center gap-2 font-semibold"><Activity size={17}/>Gouvernance et garde-fous</h2><ul className="mt-4 space-y-2 text-sm text-slate-300"><li>Déploiement AeroMind sans abonnement ni prélèvement intégré.</li><li>Sortie physique désactivée par défaut; toute action sensible exige une autorisation humaine.</li><li>Cette console ne donne pas accès à la gestion des comptes globaux ni aux décisions super-admin.</li></ul></section>
        <section className="mt-5 rounded-xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold">Gateway IA interne</h2><p className="mt-2 text-sm text-slate-400">Envoie une requête de test minimale au modèle configuré. L’URL et le secret ne sont jamais renvoyés au navigateur.</p><button onClick={() => void validateLlm()} disabled={llmBusy} className="mt-4 rounded-lg border border-cyan-700 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-50">{llmBusy ? "Test en cours…" : "Tester la connexion interne"}</button>{llmResult && <p role="status" className="mt-3 text-sm text-slate-300">{llmResult}</p>}</section>
        {data.role === "super_admin" && <Link href="/super-admin" className="mt-6 inline-block text-sm font-semibold text-cyan-300">Ouvrir la console Super-Admin complète</Link>}
      </>}
    </div>
  </main>;
}
