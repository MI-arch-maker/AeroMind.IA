import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, Cpu, Database, RefreshCw, ShieldCheck } from "lucide-react";
import { bearerHeaders } from "@/lib/sessionToken";

type Health = {
  status: string;
  api_status: string;
  database_status: string;
  database_latency_ms?: number;
  mode: string;
  environment: string;
  virtual_only: boolean;
  physical_output_enabled: boolean;
  database_url_configured: boolean;
  oidc_configured: boolean;
  internal_llm_configuration_status: "not_selected" | "configured" | "incomplete";
  stats: Record<string, number | string>;
  warnings?: string[];
  timestamp: string;
};

const stateStyle = (ok: boolean | undefined) => ok === undefined
  ? "border-slate-200 bg-slate-50 text-slate-500"
  : ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800";
const timeLabel = (value?: string) => value ? new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "medium" }) : "—";

export function SystemHealthPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [roundTripMs, setRoundTripMs] = useState<number | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError("");
    const started = performance.now();
    try {
      const response = await fetch("/api/ops/health", { credentials: "include", headers: bearerHeaders(), cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || `Sonde de santé refusée (${response.status}).`);
      setHealth(body as Health);
      setRoundTripMs(Math.round(performance.now() - started));
    } catch (reason) {
      setHealth(null);
      setRoundTripMs(null);
      setError(reason instanceof Error ? reason.message : "Sonde de santé indisponible.");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const dbOk = health?.database_status === "connected";
  const apiOk = health?.api_status === "operational";
  const oidcOk = health?.oidc_configured;
  const llmConfigured = health?.internal_llm_configuration_status === "configured";
  const llmNotSelected = health?.internal_llm_configuration_status === "not_selected";

  return <section className="mb-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6" aria-labelledby="system-health-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-blue-600">SUPERVISION · SONDES BACKEND</p><h2 id="system-health-heading" className="mt-1 text-lg font-bold text-slate-800">Santé des services</h2><p className="mt-1 text-xs text-slate-500">Actualisation automatique toutes les 30 secondes; état et compteurs issus de l’API authentifiée.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} />{loading ? "Vérification…" : "Vérifier maintenant"}</button>
    </div>

    {error && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error} — aucune disponibilité n’est présumée.</div>}
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatusCard icon={<Activity size={16} />} label="API AeroMind" status={health ? (apiOk ? "OPÉRATIONNELLE" : "DÉGRADÉE") : error ? "INJOIGNABLE" : "SONDE EN COURS"} detail={health ? `${health.environment} · ${roundTripMs ?? "—"} ms aller-retour` : "En attente d’une réponse"} ok={health ? apiOk : error ? false : undefined} />
      <StatusCard icon={<Database size={16} />} label="Base de données" status={health ? (dbOk ? "CONNECTÉE" : "INDISPONIBLE") : "NON VÉRIFIÉE"} detail={health ? `Sonde SQL · ${health.database_latency_ms ?? "—"} ms` : "Aucune connexion confirmée"} ok={health ? dbOk : undefined} />
      <StatusCard icon={<ShieldCheck size={16} />} label="Microsoft Entra / OIDC" status={health ? (oidcOk ? "CONFIGURÉ" : "NON CONFIGURÉ") : "NON VÉRIFIÉ"} detail="État de configuration côté serveur" ok={health ? oidcOk : undefined} />
      <StatusCard icon={<Cpu size={16} />} label="Gateway LLM interne" status={health ? (llmConfigured ? "CONFIGURATION COMPLÈTE" : llmNotSelected ? "NON SÉLECTIONNÉ" : "CONFIGURATION INCOMPLÈTE") : "NON VÉRIFIÉ"} detail={health ? "La connectivité se valide par un test ponctuel depuis la Console Admin." : "Aucun secret ni URL n’est affiché"} ok={health ? (llmConfigured ? true : llmNotSelected ? undefined : false) : undefined} />
    </div>

    {health && <><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Mode runtime" value={health.mode} /><Metric label="Sortie physique" value={health.physical_output_enabled ? "Activée — contrôler les interverrouillages" : "Désactivée"} /><Metric label="Projets enregistrés" value={String(health.stats.projects ?? "—")} /><Metric label="Essais en attente d’outbox" value={String(health.stats.pending_outbox_events ?? "—")} /></div>
      {health.warnings?.length ? <ul className="mt-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{health.warnings.map((warning, index) => <li key={`${index}-${warning}`}>• {warning}</li>)}</ul> : null}
      <p className="mt-4 text-[10px] text-slate-400">État observé : {timeLabel(health.timestamp)} · verrou virtuel : {health.virtual_only ? "actif" : "inactif"}. Le statut LLM porte sur la configuration seulement, pas sur une réponse du fournisseur.</p>
    </>}
  </section>;
}

function StatusCard({ icon, label, status, detail, ok }: { icon: ReactNode; label: string; status: string; detail: string; ok?: boolean }) {
  return <article className={`rounded-xl border p-3 ${stateStyle(ok)}`}><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide">{icon}{label}</div><strong className="mt-2 block text-xs">{status}</strong><p className="mt-1 text-[10px] leading-4 opacity-80">{detail}</p></article>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><span className="block text-[10px] text-slate-500">{label}</span><strong className="mt-1 block break-all text-xs text-slate-700">{value}</strong></div>;
}
