import { Briefcase, Cable, Eye, Monitor, Radio, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import "./operator-equipment-registry.css";

type RegistryEntry = {
  icon: typeof Cable;
  title: string;
  family: string;
  state: string;
  stateClass: "existing" | "pending" | "readonly";
  detail: string;
  evidence: string;
};

export function OperatorEquipmentRegistry() {
  const { t } = useLanguage();
  const entries: RegistryEntry[] = [
    { icon: Cable, title: t("Interfaces du profil LABBENCH"), family: t("USB / série · CAN · Ethernet"), state: t("Profil documentaire"), stateClass: "existing", detail: t("Les champs de liaison et paramètres existent dans LABBENCH. La saisie reste locale; aucun port n’est ouvert par le profil."), evidence: t("Composant existant · LabBenchHardwareConfig") },
    { icon: Radio, title: t("Observateur télémétrique MAVLink"), family: t("Lecture seule · consentement requis"), state: t("Opt-in opérateur"), stateClass: "readonly", detail: t("L’observateur existant expose un état de télémétrie, sans fonction de commande. Il ne doit être interrogé qu’après une demande explicite."), evidence: t("API existante · authentification, périmètre projet et audit") },
    { icon: Monitor, title: t("Station / contrôleur opérateur"), family: t("Console, contrôleur, alimentation"), state: t("À inventorier"), stateClass: "pending", detail: t("Aucun modèle, identifiant d’actif, révision ou justificatif de qualification n’est attesté dans le registre livré."), evidence: t("À renseigner à partir du registre interne et des preuves approuvées") },
    { icon: Briefcase, title: t("Mallette et kit de terrain"), family: t("Mallette · accessoires · inspection"), state: t("À inventorier"), stateClass: "pending", detail: t("Le contenu, le responsable, l’état d’inspection et les dates de vérification ne sont pas enregistrés dans cette interface."), evidence: t("Aucun inventaire de mallette vérifié dans le dépôt fourni") },
    { icon: Eye, title: t("Lunettes / affichage opérateur"), family: t("Visuel · casque · écran"), state: t("À inventorier"), stateClass: "pending", detail: t("Aucune référence de modèle, version, compatibilité ou preuve de contrôle n’est déclarée comme vérifiée."), evidence: t("À qualifier selon le protocole interne AeroMind") },
  ];
  return (
    <section className="operator-equipment-registry" aria-labelledby="operator-equipment-title">
      <header className="oer-header">
        <div className="oer-title-wrap">
          <span className="oer-mark"><ShieldCheck size={17} /></span>
          <div>
            <p className="oer-eyebrow">{t("AEROMIND · REGISTRE D’INTÉGRATION")}</p>
            <h3 id="operator-equipment-title">{t("Interfaces & équipements opérateur")}</h3>
            <p className="oer-intro">{t("Inventaire des fonctions déjà présentes et des éléments restant à qualifier — aucune liaison n’est ouverte ici.")}</p>
          </div>
        </div>
        <span className="oer-boundary">{t("SANS COMMANDE PHYSIQUE")}</span>
      </header>

      <div className="oer-grid">
        {entries.map((entry) => {
          const Icon = entry.icon;
          return (
            <article className="oer-card" key={entry.title}>
              <div className="oer-card-top">
                <span className="oer-icon"><Icon size={16} /></span>
                <span className={`oer-state oer-state-${entry.stateClass}`}>{entry.state}</span>
              </div>
              <p className="oer-family">{entry.family}</p>
              <h4>{entry.title}</h4>
              <p className="oer-detail">{entry.detail}</p>
              <small className="oer-evidence">{entry.evidence}</small>
            </article>
          );
        })}
      </div>

      <footer className="oer-footer">
        <span><ShieldCheck size={14} /> {t("Règle de qualification")}</span>
        <p>{t("Une interface configurée n’est pas une interface connectée. Le statut « connecté » exige une preuve de contrôle récente; les droits, le périmètre, la révision et l’audit restent déterminants.")}</p>
      </footer>
    </section>
  );
}
