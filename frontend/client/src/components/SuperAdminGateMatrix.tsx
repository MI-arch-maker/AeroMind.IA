import { Check, LockKeyhole, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const SUPER_ADMIN_GATES = [
  { id: "G01", title: "Cadrage et contexte", scope: "L1 · Reader — le Super-Admin conserve ce droit", limit: "Validation et trace séquentielles" },
  { id: "G02", title: "Préparation et prévol", scope: "L2 · Designer — le Super-Admin conserve ce droit", limit: "Aucun armement physique" },
  { id: "G03", title: "Vérification et qualification", scope: "L3 · Analyst — le Super-Admin conserve ce droit", limit: "Simulation et dry-run uniquement" },
  { id: "G04", title: "Transmission et intégrité", scope: "L4 · Admin — le Super-Admin conserve ce droit", limit: "Le code ne vaut pas autorisation automatique" },
  { id: "G05", title: "Décision Super-Admin", scope: "L5 · Super-Admin — décision finale du dossier", limit: "Aucune certification ou sortie physique" },
] as const;

export function SuperAdminGateMatrix() {
  const { t } = useLanguage();

  return (
    <section className="sa-gate-matrix" aria-labelledby="sa-gate-matrix-title">
      <header className="sa-gate-matrix-head">
        <div>
          <p className="sa-capability-kicker">{t("AUTORISATIONS INSTITUTIONNELLES · PORTÉE L5")}</p>
          <h2 id="sa-gate-matrix-title">{t("Super-Admin · G01 à G05")}</h2>
          <p>{t("Le Super-Admin cumule les droits L1 à L4 et gère G05 pour les opérations qui lui sont soumises.")}</p>
        </div>
        <span className="sa-gate-matrix-badge"><ShieldCheck size={13} /> {t("5 / 5 attribuées")}</span>
      </header>
      <div className="sa-gate-matrix-grid">
        {SUPER_ADMIN_GATES.map((gate) => (
          <article className="sa-gate-card" key={gate.id}>
            <div className="sa-gate-card-top">
              <span className="sa-gate-id">{gate.id}</span>
              <span className="sa-gate-state"><Check size={12} /> {t("Attribuée")}</span>
            </div>
            <h3>{t(gate.title)}</h3>
            <p>{t(gate.scope)}</p>
            <small><LockKeyhole size={11} /> {t(gate.limit)}</small>
          </article>
        ))}
      </div>
      <footer className="sa-gate-matrix-foot">
        <Check size={14} aria-hidden="true" />
        <span>{t("La portée Super-Admin couvre G01, G02, G03, G04 et G05. Les validations séquentielles, le step-up, le CSRF, la trace d’audit et le verrou physique restent obligatoires côté serveur.")}</span>
      </footer>
    </section>
  );
}
