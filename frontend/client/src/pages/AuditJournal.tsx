import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Activity, AlertTriangle, ChevronLeft, Clock, Filter, Loader2, Plus,
  RefreshCw, Save, Search, ShieldCheck, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "../contexts/LanguageContext";
import { bearerHeaders, clearSessionToken } from "../lib/sessionToken";
import { startLogin } from "../const";

type AuditEvent = {
  id: string;
  actor_id: string;
  actor_role: string;
  action: string;
  resource_id: string | null;
  decision: "allow" | "deny" | "error";
  project_id: string | null;
  drone_id: string | null;
  correlation_id: string;
  message: string;
  payload_json: Record<string, unknown> | string;
  occurred_at: string;
  prev_hash: string | null;
  chain_hash: string | null;
};

type Session = {
  email: string;
  name?: string;
  role?: string;
  level?: string;
  account_status?: string;
} | null;

type Props = {
  onAuthenticated?: (user: Session) => void;
};

const DECISION_TONE: Record<AuditEvent["decision"], { bg: string; text: string; label: string }> = {
  allow: { bg: "bg-emerald-50", text: "text-emerald-700", label: "ALLOW" },
  deny: { bg: "bg-red-50", text: "text-red-700", label: "DENY" },
  error: { bg: "bg-amber-50", text: "text-amber-700", label: "ERROR" },
};

const PAGE_SIZE = 50;

export default function AuditJournal({ onAuthenticated }: Props) {
  const { t } = useLanguage();

  const [user, setUser] = useState<Session>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<"" | AuditEvent["decision"]>("");
  const [searchMessage, setSearchMessage] = useState("");

  // Record dialog
  const [showRecordDialog, setShowRecordDialog] = useState(false);
  const [newAction, setNewAction] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newDecision, setNewDecision] = useState<AuditEvent["decision"]>("allow");
  const [newResourceId, setNewResourceId] = useState("");
  const [newProjectId, setNewProjectId] = useState("");
  const [recording, setRecording] = useState(false);

  // Stats
  const stats = useMemo(() => {
    const byDecision = { allow: 0, deny: 0, error: 0 };
    for (const e of events) byDecision[e.decision]++;
    const lastEvent = events[0];
    const firstEvent = events[events.length - 1];
    return {
      total: totalCount,
      allow: byDecision.allow,
      deny: byDecision.deny,
      error: byDecision.error,
      lastAt: lastEvent?.occurred_at,
      firstAt: firstEvent?.occurred_at,
    };
  }, [events, totalCount]);

  const refreshSession = useCallback(async () => {
    setAuthLoading(true);
    try {
      const r = await fetch("/api/auth/oidc/me", { credentials: "include", headers: bearerHeaders() });
      const u = r.ok ? await r.json() : null;
      setUser(u);
      onAuthenticated?.(u);
    } catch {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, [onAuthenticated]);

  const fetchEvents = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true); else setLoadingEvents(true);
    try {
      const params = new URLSearchParams();
      if (actionFilter.trim()) params.set("actionFilter", actionFilter.trim());
      if (decisionFilter) params.set("decisionFilter", decisionFilter);
      params.set("limit", String(PAGE_SIZE));
      if (cursor) params.set("cursor", cursor);
      const r = await fetch(`/api/trpc/auditEventsExt.list?input=${encodeURIComponent(JSON.stringify({ json: Object.fromEntries(params) }))}`, {
        credentials: "include", headers: bearerHeaders(),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || "Fetch failed");
      const result = data.result?.data?.json ?? data;
      const newEvents = (result.events || []) as AuditEvent[];
      // Local message filter (server doesn't filter message text)
      const filtered = searchMessage.trim()
        ? newEvents.filter(e => (e.message || "").toLowerCase().includes(searchMessage.trim().toLowerCase()))
        : newEvents;
      setEvents(prev => cursor ? [...prev, ...filtered] : filtered);
      setTotalCount(result.totalCount ?? filtered.length);
      setNextCursor(result.nextCursor || null);
    } catch (e: any) {
      toast.error(t("Chargement du journal échoué"), { description: e.message });
    } finally {
      setLoadingMore(false); setLoadingEvents(false);
    }
  }, [actionFilter, decisionFilter, searchMessage, t]);

  useEffect(() => { void refreshSession(); }, [refreshSession]);
  useEffect(() => {
    if (user) void fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, actionFilter, decisionFilter]);

  const recordEvent = async () => {
    if (!newAction.trim() || !newMessage.trim()) {
      toast.error(t("Action et message requis"));
      return;
    }
    setRecording(true);
    try {
      const body: Record<string, unknown> = {
        action: newAction.trim(),
        message: newMessage.trim(),
        decision: newDecision,
      };
      if (newResourceId.trim()) body.resource_id = newResourceId.trim();
      if (newProjectId.trim()) body.project_id = newProjectId.trim();
      const r = await fetch("/api/trpc/auditEventsExt.record", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...bearerHeaders() },
        body: JSON.stringify({ json: body }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || "Record failed");
      toast.success(t("Événement enregistré"), { description: t("Ajouté à votre journal personnel.") });
      setShowRecordDialog(false);
      setNewAction(""); setNewMessage(""); setNewDecision("allow"); setNewResourceId(""); setNewProjectId("");
      void fetchEvents();
    } catch (e: any) {
      toast.error(t("Enregistrement échoué"), { description: e.message });
    } finally {
      setRecording(false);
    }
  };

  const deleteEvent = async (id: string) => {
    if (!window.confirm(t("Supprimer cet événement de votre journal ?"))) return;
    try {
      const r = await fetch("/api/trpc/auditEventsExt.delete", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...bearerHeaders() },
        body: JSON.stringify({ json: { id } }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || "Delete failed");
      toast.success(t("Événement supprimé"));
      setEvents(prev => prev.filter(e => e.id !== id));
      setTotalCount(prev => Math.max(0, prev - 1));
    } catch (e: any) {
      toast.error(t("Suppression échouée"), { description: e.message });
    }
  };

  const clearJournal = async () => {
    if (!window.confirm(t("Vider entièrement votre journal d'audit personnel ? Cette action est irréversible."))) return;
    try {
      const r = await fetch("/api/trpc/auditEventsExt.clear", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...bearerHeaders() },
        body: JSON.stringify({ json: {} }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || "Clear failed");
      toast.success(t("Journal vidé"), { description: String(data.result?.data?.json?.deletedCount ?? data.deletedCount ?? 0) + t(" événement(s) supprimé(s)") });
      setEvents([]); setTotalCount(0); setNextCursor(null);
    } catch (e: any) {
      toast.error(t("Vidage échoué"), { description: e.message });
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/oidc/logout", { method: "POST", credentials: "include", headers: bearerHeaders() });
    } catch { /* ignore */ }
    clearSessionToken();
    setUser(null);
    startLogin();
  };

  if (authLoading) {
    return (
      <main className="min-h-screen bg-[#0a1018] text-slate-200 grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-cyan-400" />
          <p className="text-sm text-slate-400">{t("Vérification de la session…")}</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#0a1018] text-slate-200 grid place-items-center px-4">
        <div className="max-w-md w-full rounded-2xl border border-slate-700 bg-slate-900/70 p-8 text-center">
          <ShieldCheck className="mx-auto mb-4 text-cyan-400" size={40} />
          <h1 className="text-2xl font-bold">{t("Journal d'audit personnel")}</h1>
          <p className="mt-3 text-sm text-slate-400">{t("Connectez-vous pour accéder à votre journal d'audit privé. Chaque utilisateur dispose d'un journal indépendant et isolé.")}</p>
          <button onClick={() => startLogin()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-3 text-sm font-bold text-white hover:bg-cyan-400">
            {t("Se connecter")}
          </button>
          <Link href="/" className="mt-5 block text-center text-xs font-semibold text-slate-500 hover:text-cyan-400">{t("Retour au cockpit")}</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a1018] text-slate-200">
      {/* Top accent strip */}
      <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500" />

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-5 md:px-9 py-4 sticky top-0 z-30">
        <div className="mx-auto max-w-[1400px] flex flex-wrap items-center gap-4">
          <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-cyan-300">
            <ChevronLeft size={16} /> {t("Cockpit")}
          </Link>
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
              <Activity size={18} />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">{t("Journal d'audit")}</h1>
              <p className="text-[11px] text-slate-500">{t("Personnel · isolé · horodaté")}</p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="hidden md:inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[11px]">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-cyan-500/20 text-[9px] font-bold text-cyan-300">
                {(user.email || "?").slice(0, 2).toUpperCase()}
              </span>
              <span className="text-slate-300">{user.email}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold tracking-wider text-emerald-300 uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> {(user.role || "user").toUpperCase()}
            </span>
            <button onClick={() => void logout()} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800">
              {t("Déconnexion")}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] p-5 md:p-9 space-y-6">
        {/* Stats cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label={t("Total")} value={stats.total} tone="cyan" />
          <StatCard label="ALLOW" value={stats.allow} tone="emerald" />
          <StatCard label="DENY" value={stats.deny} tone="red" />
          <StatCard label="ERROR" value={stats.error} tone="amber" />
          <StatCard label={t("Dernier")} value={stats.lastAt ? new Date(stats.lastAt).toLocaleString() : "—"} tone="slate" small />
        </section>

        {/* Toolbar */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{t("Filtrer par action")}</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                <input value={actionFilter} onChange={e => setActionFilter(e.target.value)} placeholder={t("ex : lab.session, telemetry.poll")} className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-slate-200 outline-none focus:border-cyan-500" />
              </div>
            </div>
            <div className="w-40">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{t("Décision")}</label>
              <select value={decisionFilter} onChange={e => setDecisionFilter(e.target.value as any)} className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 px-3 text-xs text-slate-200 outline-none focus:border-cyan-500">
                <option value="">{t("Toutes")}</option>
                <option value="allow">ALLOW</option>
                <option value="deny">DENY</option>
                <option value="error">ERROR</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{t("Rechercher dans le message")}</label>
              <input value={searchMessage} onChange={e => setSearchMessage(e.target.value)} placeholder={t("texte contenu dans le message")} className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 px-3 text-xs text-slate-200 outline-none focus:border-cyan-500" />
            </div>
            <button onClick={() => void fetchEvents()} disabled={loadingEvents} className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50">
              {loadingEvents ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {t("Actualiser")}
            </button>
            <button onClick={() => setShowRecordDialog(true)} className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-400">
              <Plus size={14} /> {t("Enregistrer un événement")}
            </button>
            <button onClick={() => void clearJournal()} className="inline-flex items-center gap-1.5 rounded-md border border-red-700/50 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-950/40">
              <Trash2 size={13} /> {t("Vider mon journal")}
            </button>
          </div>
        </section>

        {/* Events list */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="border-b border-slate-800 px-5 py-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">{t("Événements")}</h2>
            <span className="text-[10px] text-slate-500">{events.length} / {totalCount}</span>
          </div>
          {loadingEvents ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              <p className="mt-3 text-xs text-slate-500">{t("Chargement…")}</p>
            </div>
          ) : events.length === 0 ? (
            <div className="p-12 text-center">
              <Activity className="mx-auto text-slate-600" size={32} />
              <p className="mt-3 text-sm text-slate-400">{t("Aucun événement dans votre journal.")}</p>
              <p className="mt-1 text-xs text-slate-600">{t("Vos actions (connexions, télémétrie, sessions LABBENCH, commandes matérielles) y seront enregistrées automatiquement.")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-800">
              {events.map(e => {
                const tone = DECISION_TONE[e.decision];
                return (
                  <li key={e.id} className="px-5 py-3 hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wider ${tone.bg} ${tone.text}`}>
                        {tone.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2 flex-wrap">
                          <code className="text-xs font-mono text-cyan-300">{e.action}</code>
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                            <Clock size={10} />
                            {new Date(e.occurred_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-300">{e.message}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
                          {e.resource_id && <span>{t("Ressource")}: <code className="text-slate-400">{e.resource_id}</code></span>}
                          {e.project_id && <span>{t("Projet")}: <code className="text-slate-400">{e.project_id.slice(0, 8)}…</code></span>}
                          {e.drone_id && <span>{t("Drone")}: <code className="text-slate-400">{e.drone_id.slice(0, 8)}…</code></span>}
                          <span>{t("Corrélation")}: <code className="text-slate-400">{e.correlation_id.slice(0, 8)}…</code></span>
                          {e.chain_hash && <span title={e.chain_hash}>{t("Hash")}: <code className="text-slate-400">{e.chain_hash.slice(0, 12)}…</code></span>}
                        </div>
                      </div>
                      <button onClick={() => void deleteEvent(e.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-red-950/40 hover:text-red-300" title={t("Supprimer")}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {nextCursor && !loadingEvents && (
            <div className="border-t border-slate-800 p-4 text-center">
              <button onClick={() => void fetchEvents(nextCursor)} disabled={loadingMore} className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                {loadingMore ? <Loader2 size={13} className="animate-spin" /> : <Filter size={13} />} {t("Charger plus")}
              </button>
            </div>
          )}
        </section>

        <p className="text-center text-[10px] uppercase tracking-widest text-slate-600">
          {t("AeroMind · journal d'audit personnel · isolation par utilisateur · horodatage UTC")}
        </p>
      </div>

      {/* Record dialog */}
      {showRecordDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur p-4" onClick={() => setShowRecordDialog(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Plus className="text-cyan-400" size={18} />
                <h3 className="text-base font-bold">{t("Enregistrer un événement")}</h3>
              </div>
              <button onClick={() => setShowRecordDialog(false)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{t("Action")} *</label>
                <input value={newAction} onChange={e => setNewAction(e.target.value)} placeholder="user.note / project.review / custom.action" className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 px-3 text-xs font-mono text-slate-200 outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{t("Message")} *</label>
                <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)} rows={3} placeholder={t("Description de l'événement à archiver dans votre journal personnel")} className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 px-3 text-xs text-slate-200 outline-none focus:border-cyan-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{t("Décision")}</label>
                  <select value={newDecision} onChange={e => setNewDecision(e.target.value as any)} className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 px-3 text-xs text-slate-200 outline-none focus:border-cyan-500">
                    <option value="allow">ALLOW</option>
                    <option value="deny">DENY</option>
                    <option value="error">ERROR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{t("Ressource (optionnel)")}</label>
                  <input value={newResourceId} onChange={e => setNewResourceId(e.target.value)} placeholder="resource-id" className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 px-3 text-xs font-mono text-slate-200 outline-none focus:border-cyan-500" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{t("Projet (optionnel)")}</label>
                <input value={newProjectId} onChange={e => setNewProjectId(e.target.value)} placeholder="project-uuid" className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 px-3 text-xs font-mono text-slate-200 outline-none focus:border-cyan-500" />
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <AlertTriangle size={12} className="text-amber-400" />
                {t("L'événement sera signé (hash chain) et lié à votre identité. Il sera visible uniquement par vous.")}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowRecordDialog(false)} className="rounded-md border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">{t("Annuler")}</button>
                <button onClick={() => void recordEvent()} disabled={recording || !newAction.trim() || !newMessage.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-400 disabled:opacity-50">
                  {recording ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {t("Enregistrer")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value, tone, small }: { label: string; value: number | string; tone: "cyan" | "emerald" | "red" | "amber" | "slate"; small?: boolean }) {
  const tones: Record<string, string> = {
    cyan: "border-cyan-500/30 bg-cyan-500/5 text-cyan-300",
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
    red: "border-red-500/30 bg-red-500/5 text-red-300",
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-300",
    slate: "border-slate-700 bg-slate-800/40 text-slate-300",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className={`font-bold ${small ? "text-sm" : "text-2xl"}`}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}
