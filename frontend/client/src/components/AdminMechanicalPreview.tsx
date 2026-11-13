import { useMemo } from "react";
import { AlertCircle, Box, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { resolveAdministrativeMechanicalPreview } from "@/lib/administrativeMechanicalPreview";
import { MechanicalTwinViewport } from "./MechanicalTwinViewport";
import "./mechanical-twin.css";
import "./admin-mechanical-preview.css";

type Props = {
  projectId?: string | null;
  projectName?: string | null;
  configuration?: unknown;
  loading?: boolean;
  error?: string;
};

export function AdminMechanicalPreview({
  projectId,
  projectName,
  configuration,
  loading = false,
  error,
}: Props) {
  const { t } = useLanguage();
  const resolved = useMemo(() => {
    try {
      return resolveAdministrativeMechanicalPreview(configuration);
    } catch {
      return null;
    }
  }, [configuration]);

  if (loading) return <div className="am-admin-mechanical-state" role="status">{t("Chargement de la configuration mécanique persistée…")}</div>;
  if (error) return <div className="am-admin-mechanical-state is-error" role="alert"><AlertCircle size={17} />{error}</div>;
  if (!projectId) return <div className="am-admin-mechanical-state"><Box size={22} /><strong>{t("Sélectionnez un projet")}</strong><span>{t("Aucun modèle n’est injecté tant qu’un dossier n’a pas été explicitement choisi.")}</span></div>;
  if (!resolved) return <div className="am-admin-mechanical-state"><Box size={22} /><strong>{t("Aucune géométrie paramétrique exploitable")}</strong><span>{t("Le projet sélectionné ne contient pas une architecture et les dimensions persistées requises. Aucun modèle n’est généré par défaut.")}</span></div>;

  return <div className="am-admin-mechanical-preview" aria-label={`${t("Jumeau mécanique en lecture seule")} · ${projectName || resolved.displayName}`}>
    <div className="am-admin-mechanical-viewport">
      <MechanicalTwinViewport
        key={`${projectId}:${resolved.model.designId}`}
        model={resolved.model}
        selected=""
        onSelect={() => undefined}
        view="iso"
        mode="solid"
        explosion={0}
        resetKey={0}
        xrayCut={1}
        xrayOpacity={{}}
        readOnly
      />
    </div>
    <div className="am-admin-mechanical-caption">
      <span><ShieldCheck size={13} />{t("Configuration persistée · consultation seule")}</span>
      <strong title={resolved.displayName}>{resolved.displayName}</strong>
      <small>{t("Aucune cellule n’est créée et aucune modification n’est enregistrée.")}</small>
    </div>
  </div>;
}
