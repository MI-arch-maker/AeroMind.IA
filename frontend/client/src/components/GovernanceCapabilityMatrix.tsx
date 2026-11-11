import { Check, LockKeyhole } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const levels = [1, 2, 3, 4, 5];

// Mirrors only the minimum tier thresholds in web/capability_policy.py.
// This read-only explanation never replaces route-local authorization.
export const GOVERNANCE_CAPABILITIES = [
  { id: "basic", minimum: 1, physical: false },
  { id: "engineering", minimum: 2, physical: false },
  { id: "advanced", minimum: 3, physical: false },
  { id: "admin", minimum: 4, physical: false },
  { id: "physical", minimum: 4, physical: true },
  { id: "global", minimum: 5, physical: false },
];
export const meetsCapabilityThreshold = (level: number, minimum: number) => level >= minimum;

export function GovernanceCapabilityMatrix() {
  const { t } = useLanguage();

  const levelName = (level: number) => {
    switch (level) {
      case 1: return t("Découverte");
      case 2: return t("Ingénierie");
      case 3: return t("Avancé");
      case 4: return t("Admin");
      default: return t("Super-Admin");
    }
  };

  const capabilityLabel = (id: string) => {
    switch (id) {
      case "basic": return t("Lecture, brouillons et calculs virtuels de base");
      case "engineering": return t("Édition d’ingénierie et simulation virtuelle nominale");
      case "advanced": return t("Analyse avancée, workflows, preuves et exports");
      case "admin": return t("Routes d’administration");
      case "physical": return t("Routes matériel / données live");
      default: return t("Supervision globale des opérations");
    }
  };

  const capabilityDetail = (id: string) => {
    switch (id) {
      case "basic": return t("Seuil L1");
      case "engineering": return t("Seuil L2");
      case "advanced": return t("Seuil L3");
      case "admin": return t("Seuil L4 · rôle et périmètre requis");
      case "physical": return t("Seuil L4 · step-up et interverrouillages indépendants");
      default: return t("Seuil L5 uniquement · API /api/ops");
    }
  };

  return <section className="sa-capability-matrix" aria-labelledby="sa-capability-heading">
    <header className="sa-capability-head">
      <div>
        <p className="sa-capability-kicker">{t("POLITIQUE BACKEND · LECTURE SEULE")}</p>
        <h2 id="sa-capability-heading">{t("Matrice de capacités L1–L5")}</h2>
        <p>{t("Seuil minimal de qualification déclaré dans la politique centralisée.")}</p>
      </div>
      <span className="sa-capability-version">{t("POLICY")}: {t("L1—L5")}</span>
    </header>

    <div className="sa-capability-table-wrap">
      <table className="sa-capability-table">
        <thead>
          <tr>
            <th scope="col">{t("CAPACITÉ / GARDE")}</th>
            {levels.map(level => <th scope="col" key={level}><strong>L{level}</strong><small>{levelName(level)}</small></th>)}
          </tr>
        </thead>
        <tbody>
          {GOVERNANCE_CAPABILITIES.map(capability => <tr key={capability.id} className={capability.physical ? "is-physical" : ""}>
            <th scope="row"><span>{capabilityLabel(capability.id)}</span><small>{capabilityDetail(capability.id)}</small></th>
            {levels.map(level => {
              const meetsThreshold = meetsCapabilityThreshold(level, capability.minimum);
              const title = meetsThreshold
                ? t("Seuil atteint; les contrôles route-locales restent obligatoires.")
                : t("Seuil de qualification non atteint.");
              return <td key={level} className={meetsThreshold ? "is-met" : "is-locked"} title={title}>
                {meetsThreshold
                  ? <span className="sa-capability-mark"><Check size={13} aria-hidden="true" /><span className="sr-only">{t("Seuil atteint")}</span></span>
                  : <span className="sa-capability-mark"><LockKeyhole size={12} aria-hidden="true" /><span className="sr-only">{t("Seuil non atteint")}</span></span>}
              </td>;
            })}
          </tr>)}
        </tbody>
      </table>
    </div>
    <p className="sa-capability-footnote">{t("Un ✓ signifie uniquement que le niveau atteint le minimum numérique. Chaque route applique encore son rôle, son périmètre propriétaire, sa session, son step-up, ses approbations et ses interverrouillages. L5 ne contourne aucun contrôle.")}</p>
  </section>;
}
