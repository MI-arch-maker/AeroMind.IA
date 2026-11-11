import { ArrowUpRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

export const GOVERNANCE_STAGES = [
  { code: "G01", label: "Exigences", detail: "Cadre de la demande" },
  { code: "G02", label: "Identité", detail: "Habilitation vérifiée" },
  { code: "G03", label: "Équipements", detail: "Revue du périmètre" },
  { code: "G04", label: "Simulation", detail: "Validation logicielle" },
  { code: "G05", label: "Décision humaine", detail: "Décision explicite" },
];

export function GovernanceCycleMap({ onOpenLevels, t }: { onOpenLevels: () => void; t: (text: string) => string }) {
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="sa-governance-cycle-title">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-[#102a3c] to-[#135561] p-5 text-white">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-200">{t("Chaîne de gouvernance AeroMind")}</p>
          <h2 id="sa-governance-cycle-title" className="mt-1 text-lg font-bold">{t("G01–G05 · revue à contrôle humain")}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-200">{t("Frise de référence : aucun statut réel de dossier n’est affiché ici. Le parcours G01–G05 accessible dans le cockpit est une simulation locale.")}</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg border border-cyan-100/20 bg-white/10 px-3 py-2 text-[10px] font-bold tracking-wide text-cyan-100"><ShieldCheck size={14} /> {t("SUPER-ADMIN · L5")}</span>
      </header>

      <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-5">
        {GOVERNANCE_STAGES.map((stage, index) => (
          <article key={stage.code} className="relative min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-md border border-cyan-100 bg-cyan-50 px-2 py-1 font-mono text-[10px] font-bold text-cyan-800">{stage.code}</span>
              {index < GOVERNANCE_STAGES.length - 1 && <span className="hidden text-slate-300 xl:inline" aria-hidden="true">→</span>}
            </div>
            <strong className="mt-3 block text-xs text-slate-800">{t(stage.label)}</strong>
            <span className="mt-1 block text-[10px] leading-4 text-slate-500">{t(stage.detail)}</span>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
        <p className="flex items-start gap-2 text-[10px] leading-5 text-slate-500"><LockKeyhole className="mt-0.5 shrink-0 text-amber-600" size={14} />{t("GATE 05 ne constitue pas une autorisation matérielle; aucune commande physique n’est exécutée par cette frise.")}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onOpenLevels} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50">{t("Consulter la matrice L1–L5")} <ArrowUpRight size={13} /></button>
          <Link href="/?view=mission-center" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50">{t("Ouvrir le workflow G01–G05 · simulation locale")} <ArrowUpRight size={13} /></Link>
          <Link href="/virtual-factory" className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#087e83] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#076a70]">{t("Ouvrir l’ingénierie virtuelle")} <ArrowUpRight size={13} /></Link>
        </div>
      </div>
    </section>
  );
}
