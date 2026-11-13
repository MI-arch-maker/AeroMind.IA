import type { ConceptConfig } from "../lib/aeroEngine";

type BehaviorContext = "construction" | "simulation" | "inspection" | "studio";

const contextCopy: Record<BehaviorContext, { label: string; title: string; note: string; effect: string }> = {
  construction: {
    label: "CONSTRUCTION / CONFIGURATION",
    title: "Comment la maquette réagit",
    note: "La géométrie, les pièces déclarées et leur masse alimentent le bilan de conception.",
    effect: "Toute variation de dimensions, charge ou propulsion modifie les estimations et doit être revue avant export.",
  },
  simulation: {
    label: "SIMULATION / RÉPONSE DU MODÈLE",
    title: "Lire la réponse calculée",
    note: "Vent, masse, énergie et commandes virtuelles influencent les valeurs du scénario.",
    effect: "Les courbes décrivent le modèle local, pas une mesure en vol ni une performance certifiée.",
  },
  inspection: {
    label: "INSPECTION / ÉTAT DE CONFIGURATION",
    title: "Ce que montre le jumeau",
    note: "La vue compare la configuration déclarée et les états de calcul disponibles.",
    effect: "Sans capteur connecté, les états restent simulés ou déclaratifs; aucun défaut matériel n’est confirmé.",
  },
  studio: {
    label: "STUDIO / ASSEMBLAGE NUMÉRIQUE",
    title: "Impact des modifications de pièce",
    note: "Les couches, interfaces, visibilité et masses inscrites structurent la maquette d’assemblage.",
    effect: "Une pièce non référencée reste une hypothèse de concept et ne vaut pas validation de fabrication.",
  },
};

function showNumber(value: number | undefined, digits = 2) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("fr-FR", { maximumFractionDigits: digits })
    : "—";
}

export function DroneBehaviorPanel({
  configuration,
  context,
  state,
}: {
  configuration: ConceptConfig;
  context: BehaviorContext;
  state?: string;
}) {
  const copy = contextCopy[context];
  const name = configuration.designName || configuration.platformProfile || "Architecture non définie";
  return (
    <section className={`drone-behavior-panel behavior-${context}`} aria-label={`Lecture du comportement du drone : ${copy.title}`}>
      <div className="drone-behavior-heading">
        <div>
          <p className="eyebrow">{copy.label}</p>
          <h3>{copy.title}</h3>
        </div>
        <span className="drone-behavior-state"><i />{state ?? "JUMEAU NUMÉRIQUE · LOCAL"}</span>
      </div>
      <div className="drone-behavior-flow">
        <div><small>01 · CONFIGURATION</small><strong>{name}</strong><span>{configuration.airframe ?? "Type à définir"} · {Math.max(0, Math.round(configuration.motorCount ?? 0))} moteur(s)</span></div>
        <b aria-hidden="true">→</b>
        <div><small>02 · CONDITIONS</small><strong>{showNumber(configuration.wingspan)} m · {showNumber(configuration.payloadKg)} kg</strong><span>{showNumber(configuration.batteryWh, 0)} Wh · vent {showNumber(configuration.windSpeedKmh, 0)} km/h</span></div>
        <b aria-hidden="true">→</b>
        <div><small>03 · EFFET À CONTRÔLER</small><strong>{copy.note}</strong><span>{copy.effect}</span></div>
      </div>
      <div className="drone-behavior-foot"><span>TRAÇABILITÉ · Les valeurs suivent la configuration affichée</span><span>Préliminaire · revue ingénieur requise · aucune commande matérielle</span></div>
    </section>
  );
}
