import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { bearerHeaders } from "@/lib/sessionToken";

type Endpoint = { path: string; method: string; available: boolean; description: string };
type Catalog = { capabilities: { category: string; endpoints: Endpoint[] }[] };

export function OperationalCapabilitiesPanel() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ops/capabilities", { credentials: "include", headers: bearerHeaders() });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || "Catalogue des capacités indisponible.");
      setCatalog(body as Catalog);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Catalogue des capacités indisponible.");
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">CAPACITÉS SERVEUR</p><h2 className="mt-1 text-lg font-bold text-slate-800">Catalogue opérationnel</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Inventaire d’observation issu du backend authentifié. « Actif » décrit la disponibilité technique de la route; chaque appel reste soumis à sa propre vérification de rôle, propriétaire, gates et autorisation humaine.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50"><RefreshCw size={13} className={loading ? "animate-spin" : ""} />Actualiser</button>
    </div>
    {error && <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
    {loading && !catalog && <p role="status" className="mt-4 text-xs text-slate-500">Chargement du catalogue serveur…</p>}
    {catalog && <div className="mt-5 grid gap-4 xl:grid-cols-2">{catalog.capabilities.map(group => <section key={group.category} className="overflow-hidden rounded-xl border border-slate-200"><h3 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700">{group.category}</h3><div>{group.endpoints.map(endpoint => <article key={`${endpoint.method}:${endpoint.path}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 last:border-0"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">{endpoint.method}</code><code className="break-all text-[10px] text-slate-600">{endpoint.path}</code></div><p className="mt-1 text-[10px] leading-4 text-slate-500">{endpoint.description}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${endpoint.available ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{endpoint.available ? "ROUTE ACTIVE" : "ROUTE DÉSACTIVÉE"}</span></article>)}</div></section>)}</div>}
    <p className="mt-4 border-t border-slate-100 pt-3 text-[10px] leading-4 text-slate-500">Les actions métier passent par leurs interfaces et routes authentifiées. Les routes d’armement, pilotage matériel, géofence et arrêt d’urgence conservent leurs contrôles de rôles, gates et autorisations humaines; ce catalogue ne les déclenche jamais.</p>
  </section>;
}
