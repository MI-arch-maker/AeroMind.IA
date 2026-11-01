import type { ConceptConfig } from "./aeroEngine";
import type { CatalogModelType, DroneCatalogDesign } from "./droneCatalog";

/**
 * AeroMind · Atelier de prototypes — catégorie « Systèmes de Reconnaissance
 * Haute Altitude et Longue Endurance (HALE / MALE) ».
 *
 * Ces fiches décrivent des architectures à fuselage allongé et grande
 * envergure destinées à la surveillance continue de zones d'accès restreint en
 * temps de crise. Elles sont catégorisées comme « Vecteurs d'Observation Longue
 * Portée et Haute Contrainte Environnementale » : capteurs de situation,
 * relais de communication et soutien à la décision, sans aucune fonction
 * offensive, sans charge militaire et sans ciblage.
 *
 * Toutes les valeurs restent des hypothèses d'avant-projet et ne sont jamais
 * des performances certifiées, ni des plans de fabrication.
 */

export const LONG_RANGE_CATEGORY_LABEL =
  "Systèmes de Reconnaissance Haute Altitude et Longue Endurance (HALE / MALE)";
export const LONG_RANGE_CATEGORY_CLASSIFICATION =
  "Vecteurs d’Observation Longue Portée et Haute Contrainte Environnementale";

export type LongRangeEnduranceClass = "HALE" | "MALE";

export type LongRangeObservationVector = DroneCatalogDesign & {
  enduranceClass: LongRangeEnduranceClass;
  classification: string;
  /** Endurance de référence simulée, en heures (hypothèse d'avant-projet). */
  enduranceHours: number;
  /** Plafond opérationnel de référence simulé, en mètres. */
  serviceCeilingM: number;
  /** Régime de surveillance visé, sans coordonnées réelles. */
  surveillanceRegime: string;
  /** Contraintes environnementales documentées pour la préparation. */
  environmentalConstraints: string[];
  /** Charges utiles d'observation déclarées (capteurs uniquement). */
  sensorSuite: string[];
  /** Points de vigilance de préparation, jamais des consignes de vol. */
  engineeringWatchpoints: string[];
};

type VectorSeed = {
  id: string;
  label: string;
  modelType: CatalogModelType;
  enduranceClass: LongRangeEnduranceClass;
  mission: string;
  enduranceHours: number;
  serviceCeilingM: number;
  surveillanceRegime: string;
  environmentalConstraints: string[];
  sensorSuite: string[];
  engineeringWatchpoints: string[];
  tone: DroneCatalogDesign["tone"];
  wingspan: number;
  fuselageLength: number;
  chord: number;
  payloadKg: number;
  cruiseSpeedKmh: number;
  motorCount: number;
  batteryWh: number;
};

const civilUse =
  "Plateforme d’ingénierie non armée : observation de situation, surveillance de zone restreinte et relais de communication ; capteurs uniquement, supervision humaine obligatoire et aucune fonction offensive.";

const vector = (seed: VectorSeed): LongRangeObservationVector => ({
  key: "fixed-wing",
  modelType: seed.modelType,
  id: seed.id,
  label: seed.label,
  family: `${seed.enduranceClass} · fuselage allongé et grande envergure`,
  mission: seed.mission,
  specs: `${seed.wingspan.toFixed(1)} m · ${seed.payloadKg.toFixed(1)} kg utile · ${seed.enduranceHours.toFixed(0)} h visées · ${seed.motorCount} moteur(s)`,
  disciplines: "Allongement · charge alaire · énergie embarquée · liaison longue portée",
  tone: seed.tone,
  role: "civil",
  defenseUse: civilUse,
  origin: "aeromind-parametric",
  silhouette: "long",
  enduranceClass: seed.enduranceClass,
  classification: LONG_RANGE_CATEGORY_CLASSIFICATION,
  enduranceHours: seed.enduranceHours,
  serviceCeilingM: seed.serviceCeilingM,
  surveillanceRegime: seed.surveillanceRegime,
  environmentalConstraints: seed.environmentalConstraints,
  sensorSuite: seed.sensorSuite,
  engineeringWatchpoints: seed.engineeringWatchpoints,
  configuration: {
    airframe: "fixed-wing",
    wingspan: seed.wingspan,
    chord: seed.chord,
    fuselageLength: seed.fuselageLength,
    propDiameter: 0.5,
    batteryWh: seed.batteryWh,
    payloadKg: seed.payloadKg,
    cruiseSpeedKmh: seed.cruiseSpeedKmh,
    motorCount: seed.motorCount,
    altitudeM: Math.min(seed.serviceCeilingM, 500),
  } satisfies Partial<ConceptConfig>,
});

const seeds: VectorSeed[] = [
  {
    id: "sentinel-hale-01",
    label: "SENTINEL-HALE-01",
    modelType: "hale-voilure",
    enduranceClass: "HALE",
    mission:
      "Surveillance continue de zone d’accès restreint en temps de crise, avec relais de situation vers un poste de commandement.",
    enduranceHours: 26,
    serviceCeilingM: 460,
    surveillanceRegime: "Maintien haute altitude · couverture large · cadence d’image lente",
    environmentalConstraints: [
      "Vent d’altitude soutenu et cisaillement",
      "Écart thermique jour/nuit marqué",
      "Visibilité réduite par brume ou aérosols",
    ],
    sensorSuite: [
      "Capteur électro-optique longue focale stabilisé",
      "Capteur thermique radiométrique",
      "Liaison satcom de situation (relais de données)",
    ],
    engineeringWatchpoints: [
      "Marge d’énergie sur un cycle de 24 h sans ravitaillement",
      "Charge alaire faible : sensibilité aux rafales",
      "Gestion thermique de la baie capteurs en altitude",
    ],
    tone: "violet",
    wingspan: 11.5,
    fuselageLength: 4.2,
    chord: 0.62,
    payloadKg: 2.4,
    cruiseSpeedKmh: 88,
    motorCount: 1,
    batteryWh: 3600,
  },
  {
    id: "sentinel-hale-02",
    label: "SENTINEL-HALE-02",
    modelType: "hale-voilure",
    enduranceClass: "HALE",
    mission:
      "Observation persistante d’un secteur critique et continuité de liaison pour les services publics engagés.",
    enduranceHours: 32,
    serviceCeilingM: 500,
    surveillanceRegime: "Relais de communication haute altitude · veille permanente",
    environmentalConstraints: [
      "Froid extrême en altitude",
      "Rayonnement solaire direct sur les capteurs",
      "Perte de liaison temporaire en relief",
    ],
    sensorSuite: [
      "Boucle relais de données et de voix de secours",
      "Visière électro-optique grand angle",
      "Enregistreur de situation horodaté",
    ],
    engineeringWatchpoints: [
      "Redondance de la chaîne de liaison",
      "Endurance de la boucle relais sous charge",
      "Givrage potentiel de l’hélice propulsive",
    ],
    tone: "cyan",
    wingspan: 13.2,
    fuselageLength: 4.6,
    chord: 0.66,
    payloadKg: 2.9,
    cruiseSpeedKmh: 92,
    motorCount: 1,
    batteryWh: 4200,
  },
  {
    id: "sentinel-male-01",
    label: "SENTINEL-MALE-01",
    modelType: "male-voilure",
    enduranceClass: "MALE",
    mission:
      "Surveillance de zone étendue en moyenne altitude avec inspection documentée des points sensibles.",
    enduranceHours: 18,
    serviceCeilingM: 300,
    surveillanceRegime: "Orbite d’observation · recouvrement documenté",
    environmentalConstraints: [
      "Vent modéré et turbulence de relief",
      "Poussière et particules en suspension",
      "Températures élevées au sol",
    ],
    sensorSuite: [
      "Tourelle électro-optique et thermique combinée",
      "Capteur cartographique haute résolution",
      "Télémétrie de situation en lecture seule",
    ],
    engineeringWatchpoints: [
      "Refroidissement de la tourelle au sol",
      "Protection des optiques contre l’abrasion",
      "Marge de poussée en air chaud et altitude",
    ],
    tone: "amber",
    wingspan: 8.6,
    fuselageLength: 3.4,
    chord: 0.5,
    payloadKg: 2.1,
    cruiseSpeedKmh: 76,
    motorCount: 1,
    batteryWh: 2600,
  },
  {
    id: "sentinel-male-02",
    label: "SENTINEL-MALE-02",
    modelType: "male-voilure",
    enduranceClass: "MALE",
    mission:
      "Reconnaissance de situation et relais de communication pour les opérations de secours en zone d’accès contraint.",
    enduranceHours: 21,
    serviceCeilingM: 340,
    surveillanceRegime: "Corridor de surveillance · relais tactique de secours",
    environmentalConstraints: [
      "Relief accidenté et masque radio",
      "Brouillard de vallée matinal",
      "Embruns en zone littorale",
    ],
    sensorSuite: [
      "Radar de situation (détection de mouvement)",
      "Capteur thermique pour recherche de personnes",
      "Relais radio de secours",
    ],
    engineeringWatchpoints: [
      "Tenue à la corrosion en zone littorale",
      "Recalage de navigation sans GPS prolongé",
      "Priorité des charges utiles en budget énergie",
    ],
    tone: "cyan",
    wingspan: 9.8,
    fuselageLength: 3.8,
    chord: 0.54,
    payloadKg: 2.6,
    cruiseSpeedKmh: 80,
    motorCount: 2,
    batteryWh: 3100,
  },
  {
    id: "sentinel-male-03",
    label: "SENTINEL-MALE-03",
    modelType: "male-voilure",
    enduranceClass: "MALE",
    mission:
      "Surveillance environnementale et cartographie de crise à moyenne altitude, en appui aux autorités compétentes.",
    enduranceHours: 16,
    serviceCeilingM: 260,
    surveillanceRegime: "Relevé multi-capteurs · comparaison temporelle",
    environmentalConstraints: [
      "Panaches de fumée et de poussière",
      "Chaleur radiative de surface",
      "Couverture nuageuse basse",
    ],
    sensorSuite: [
      "Capteur multispectral environnemental",
      "Capteur thermique de cartographie de feu",
      "Station météorologique légère",
    ],
    engineeringWatchpoints: [
      "Filtration de l’air de refroidissement",
      "Étalonnage des capteurs après exposition thermique",
      "Budget énergie du relevé multi-capteurs",
    ],
    tone: "violet",
    wingspan: 10.4,
    fuselageLength: 4,
    chord: 0.58,
    payloadKg: 2.3,
    cruiseSpeedKmh: 74,
    motorCount: 2,
    batteryWh: 2900,
  },
];

export const longRangeObservationVectors: LongRangeObservationVector[] =
  seeds.map(vector);

export const longRangeObservationSummary = {
  total: longRangeObservationVectors.length,
  hale: longRangeObservationVectors.filter(item => item.enduranceClass === "HALE").length,
  male: longRangeObservationVectors.filter(item => item.enduranceClass === "MALE").length,
  maxEnduranceHours: Math.max(...longRangeObservationVectors.map(item => item.enduranceHours)),
  maxServiceCeilingM: Math.max(...longRangeObservationVectors.map(item => item.serviceCeilingM)),
  classification: LONG_RANGE_CATEGORY_CLASSIFICATION,
  label: LONG_RANGE_CATEGORY_LABEL,
};

export function findLongRangeVector(
  id: string | undefined
): LongRangeObservationVector | undefined {
  return longRangeObservationVectors.find(item => item.id === id);
}

/**
 * Chaîne de préparation documentaire associée à un vecteur longue portée.
 * Ce n'est pas une autorisation de vol : chaque étape exige une validation
 * humaine indépendante avant tout usage opérationnel réel.
 */
export function buildLongRangePreparationNote(
  vector: LongRangeObservationVector
): string[] {
  return [
    `Classe ${vector.enduranceClass} · ${vector.classification.toLowerCase()}`,
    `Endurance de référence simulée : ${vector.enduranceHours} h — hypothèse d’avant-projet à qualifier`,
    `Plafond de référence simulé : ${vector.serviceCeilingM} m — aucune valeur réglementaire inférée`,
    `Régime de surveillance visé : ${vector.surveillanceRegime}`,
    `Contraintes environnementales à traiter : ${vector.environmentalConstraints.join(" · ")}`,
    `Capteurs déclarés : ${vector.sensorSuite.join(" · ")}`,
    `Points de vigilance ingénierie : ${vector.engineeringWatchpoints.join(" · ")}`,
    "Aucune charge militaire, aucun ciblage, aucune fonction offensive : capteurs de situation et relais uniquement.",
  ];
}