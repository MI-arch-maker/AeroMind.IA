import {
  defaultRequirements,
  runSimulation,
  type ConceptConfig,
} from "./aeroEngine";
import {
  defaultLocalMissionPlan,
  validateLocalMission,
} from "./flightEngineering";

export type EngineeringCheckStatus = "pass" | "review" | "block";
export type EngineeringCheck = {
  id: string;
  discipline: string;
  label: string;
  status: EngineeringCheckStatus;
  detail: string;
};

const isFinitePositive = (value: number) => Number.isFinite(value) && value > 0;

/**
 * Fast client-side consistency checks. They intentionally do not claim structural,
 * flight, regulatory, or manufacturing validation.
 */
export function buildEngineeringReview(
  config: ConceptConfig
): EngineeringCheck[] {
  const architectureReady = Boolean(config.airframe);
  const geometryReady =
    isFinitePositive(config.wingspan) &&
    isFinitePositive(config.chord) &&
    isFinitePositive(config.fuselageLength) &&
    isFinitePositive(config.propDiameter);
  const simulation = runSimulation(config, defaultRequirements, "REVIEW-LOCAL");
  const hasMassLimit = isFinitePositive(config.maxTakeoffKg);
  const massInEnvelope =
    Number.isFinite(simulation.totalMassKg) &&
    hasMassLimit &&
    simulation.totalMassKg <= config.maxTakeoffKg;
  const batteryReady =
    isFinitePositive(config.batteryWh) &&
    Number.isFinite(config.reserveFraction) &&
    config.reserveFraction >= 0.05 &&
    config.reserveFraction <= 0.5;
  const modules = config.installedMaterials ?? [];
  const modulesValid = modules.every(
    item =>
      item.id.trim().length > 0 &&
      Number.isFinite(item.massKg) &&
      item.massKg >= 0 &&
      Number.isInteger(item.quantity ?? 1) &&
      (item.quantity ?? 1) >= 1
  );
  const architectureMismatches = modules.filter(
    item =>
      item.compatibleAirframes?.length &&
      config.airframe &&
      !item.compatibleAirframes.includes(config.airframe)
  );
  const compatibilityUndetermined = modules.some(
    item => item.compatibleAirframes?.length
  ) && !config.airframe;
  const missionPlan = {
    ...defaultLocalMissionPlan,
    ...config.missionPlan,
    waypoints:
      config.missionPlan?.waypoints ?? defaultLocalMissionPlan.waypoints,
  };
  const missionChecks = validateLocalMission(config, missionPlan);
  const missionBlock = missionChecks.some(check => check.severity === "block");
  const missionReview = missionChecks.some(
    check => check.severity === "review"
  );
  const missionDetail = missionChecks
    .filter(check => check.severity !== "pass")
    .map(check => check.message)
    .join(" ");

  return [
    {
      id: "architecture",
      discipline: "Système",
      label: "Architecture sélectionnée",
      status: architectureReady ? "pass" : "block",
      detail: architectureReady
        ? `Profil ${config.airframe} déclaré.`
        : "Choisir une architecture et des paramètres de départ avant de poursuivre.",
    },
    {
      id: "geometry",
      discipline: "Géométrie",
      label: "Cotes principales",
      status: geometryReady ? "pass" : "block",
      detail: geometryReady
        ? "Les dimensions requises sont des valeurs finies et positives."
        : "Envergure, corde, fuselage et hélice doivent être renseignés.",
    },
    {
      id: "mass",
      discipline: "Masse",
      label: "Masse vs limite déclarée",
      status: !hasMassLimit ? "review" : massInEnvelope ? "pass" : "block",
      detail: !hasMassLimit
        ? "Déclarer une masse maximale; aucune limite n’est supposée."
        : massInEnvelope
          ? `${simulation.totalMassKg.toFixed(2)} kg sous la limite de projet de ${config.maxTakeoffKg.toFixed(2)} kg.`
          : `Masse estimée supérieure à la limite de projet (${simulation.totalMassKg.toFixed(2)} / ${config.maxTakeoffKg.toFixed(2)} kg).`,
    },
    {
      id: "battery",
      discipline: "Énergie",
      label: "Capacité et réserve déclarées",
      status: batteryReady ? "pass" : "block",
      detail: batteryReady
        ? `${config.batteryWh} Wh, réserve paramétrée à ${(config.reserveFraction * 100).toFixed(0)} %. Corrélation indicative.`
        : "Vérifier la capacité et définir une réserve comprise entre 5 et 50 %.",
    },
    {
      id: "mission",
      discipline: "Mission",
      label: "Route locale et enveloppe",
      status: missionBlock ? "block" : missionReview ? "review" : "pass",
      detail:
        missionDetail ||
        "Les contrôles locaux de route ne signalent pas d’écart bloquant.",
    },
    {
      id: "materials",
      discipline: "Nomenclature",
      label: "Modules, masses et architecture",
      status: !modulesValid
        ? "block"
        : architectureMismatches.length || compatibilityUndetermined
          ? "review"
          : modules.length
            ? "pass"
            : "review",
      detail: !modulesValid
        ? "Un module contient une masse invalide ou un identifiant vide."
        : modules.length
          ? `${modules.length} ligne(s); masse unitaire × quantité intégrée au bilan par famille.${architectureMismatches.length ? ` Architecture déclarée incompatible : ${architectureMismatches.map(item => item.label).join(", ")}.` : compatibilityUndetermined ? " Déclarer l’architecture pour contrôler les contraintes de famille." : ""} Compatibilité électrique, mécanique et logicielle non validée automatiquement.`
          : "Aucun module additionnel n’est encore déclaré.",
    },
    {
      id: "cg",
      discipline: "Masse & centrage",
      label: "Centre de gravité 3D",
      status: "review",
      detail:
        "Non calculé : les positions XYZ et moments de chaque équipement ne sont pas encore définis.",
    },
    {
      id: "structure",
      discipline: "Structures",
      label: "Résistance et cas de charge",
      status: "review",
      detail:
        "Non calculés : propriétés matière sourcées, géométrie solide, cas de charge et critères d’essai requis.",
    },
    {
      id: "propulsion-evidence",
      discipline: "Propulsion",
      label: "Courbes moteur / hélice",
      status: "review",
      detail:
        "Le bilan utilise une corrélation générique; aucune courbe constructeur ou mesure de banc n’est liée.",
    },
    {
      id: "geospatial",
      discipline: "Navigation",
      label: "Carte et données géographiques",
      status: "review",
      detail:
        "Le canevas est schématique : terrain, obstacles, météo et espaces aériens réels ne sont pas chargés.",
    },
    {
      id: "manufacturing",
      discipline: "Fabrication",
      label: "Dossier de fabrication",
      status: "review",
      detail:
        "Les exports sont des documents de concept; tolérances, procédés, plans et géométrie industrielle restent à valider.",
    },
    {
      id: "hardware",
      discipline: "Essais",
      label: "Connexion matérielle / essais",
      status: "review",
      detail:
        "Aucune connexion au drone ou à l’autopilote; toutes les commandes et télémétries sont locales et simulées.",
    },
  ];
}
