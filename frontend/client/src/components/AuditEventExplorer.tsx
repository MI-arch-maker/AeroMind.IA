import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Search, SlidersHorizontal } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";

type AdminEvent = {
  id?: string;
  eventType?: string;
  actorEmail?: string;
  actorId?: string;
  targetUserId?: string | null;
  createdAt?: string | null;
};

const PAGE_SIZE = 25;
const safeCsv = (value: unknown) => {
  const text = String(value ?? "");
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

export function AuditEventExplorer({ events }: { events: AdminEvent[] }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);

  const eventTypes = useMemo(() => [...new Set(events.map(event => event.eventType).filter((value): value is string => Boolean(value)))].sort(), [events]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return events.filter(event => {
      const created = event.createdAt ? new Date(event.createdAt) : null;
      const dateKey = created && Number.isFinite(created.getTime()) ? created.toISOString().slice(0, 10) : "";
      const textMatch = !needle || [event.id, event.eventType, event.actorEmail, event.actorId, event.targetUserId].some(value => String(value ?? "").toLocaleLowerCase().includes(needle));
      return textMatch && (!typeFilter || event.eventType === typeFilter) && (!from || (dateKey && dateKey >= from)) && (!to || (dateKey && dateKey <= to));
    });
  }, [events, query, typeFilter, from, to]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const exportCsv = () => {
    const header = ["event_id", "event_type", "actor_email", "actor_id", "target_user_id", "occurred_at"];
    const rows = filtered.map(event => [event.id, event.eventType, event.actorEmail, event.actorId, event.targetUserId, event.createdAt]);
    const csv = [header, ...rows].map(row => row.map(safeCsv).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aeromind-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <section aria-label={t("Explorateur du journal d'audit")} className="space-y-4">
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_minmax(180px,1fr)_150px_150px_auto] xl:items-end">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("Recherche")}
          <span className="relative mt-1 block"><Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" /><input value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder={t("Action, acteur, cible ou identifiant")} className="w-full rounded-md border border-slate-200 bg-white py-2 pl-8 pr-2 text-xs font-normal normal-case tracking-normal text-slate-700 outline-none focus:border-blue-400" /></span>
        </label>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("Type d’événement")}
          <span className="relative mt-1 block"><SlidersHorizontal size={13} className="absolute left-2.5 top-2.5 text-slate-400" /><select value={typeFilter} onChange={event => { setTypeFilter(event.target.value); setPage(0); }} className="w-full rounded-md border border-slate-200 bg-white py-2 pl-8 pr-2 text-xs font-normal normal-case tracking-normal text-slate-700"><option value="">{t("Tous les types")}</option>{eventTypes.map(type => <option key={type} value={type}>{type}</option>)}</select></span>
        </label>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("Du")}
          <input type="date" value={from} max={to || undefined} onChange={event => { setFrom(event.target.value); setPage(0); }} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-normal normal-case tracking-normal text-slate-700" />
        </label>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("Au")}
          <input type="date" value={to} min={from || undefined} onChange={event => { setTo(event.target.value); setPage(0); }} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-normal normal-case tracking-normal text-slate-700" />
        </label>
        <button type="button" disabled={!filtered.length} onClick={exportCsv} className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"><Download size={14} />{t("Exporter CSV")}</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500"><span>{filtered.length} {t("événement(s) correspondant(s) dans les 100 plus récents chargés")}</span><span>{filtered.length ? `${safePage + 1} / ${pageCount}` : "—"}</span></div>
    </div>

    {visible.length ? <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[760px] text-left"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2.5">{t("Événement")}</th><th className="px-3 py-2.5">{t("Acteur")}</th><th className="px-3 py-2.5">{t("Cible")}</th><th className="px-3 py-2.5">{t("Horodatage")}</th><th className="px-3 py-2.5">ID</th></tr></thead><tbody>{visible.map((event, index) => <tr key={event.id || `${event.createdAt}-${index}`} className="border-t border-slate-100"><td className="px-3 py-3"><span className="inline-flex max-w-[260px] break-all rounded-md bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-800">{event.eventType || "—"}</span></td><td className="px-3 py-3 text-xs text-slate-700">{event.actorEmail || event.actorId || "—"}</td><td className="px-3 py-3 text-xs text-slate-500">{event.targetUserId || "—"}</td><td className="whitespace-nowrap px-3 py-3 text-[11px] text-slate-500">{event.createdAt ? new Date(event.createdAt).toLocaleString("fr-FR") : "—"}</td><td className="max-w-[140px] truncate px-3 py-3 font-mono text-[10px] text-slate-400" title={event.id}>{event.id || "—"}</td></tr>)}</tbody></table></div> : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center"><p className="text-sm font-semibold text-slate-600">{events.length ? t("Aucun événement ne correspond aux filtres") : t("Journal vide")}</p><p className="mt-1 text-xs text-slate-400">{t("Aucune entrée n’est supprimée par ces filtres; ajustez la période ou la recherche.")}</p></div>}

    <div className="flex items-center justify-end gap-2"><button type="button" disabled={safePage === 0} onClick={() => setPage(value => Math.max(0, value - 1))} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 disabled:opacity-40"><ChevronLeft size={14} />{t("Précédent")}</button><button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 disabled:opacity-40">{t("Suivant")}<ChevronRight size={14} /></button></div>
  </section>;
}
