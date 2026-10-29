import { simulationModules, type SimulationModule } from "./simulationModules";
import type { MechanicalTwinConfig } from "./mechanicalTwinGeometry";
import type { PayloadCalibrationProfile } from "./payloadCalibration";

export type RequirementStatus = "ok" | "review" | "hypothesis" | "conflict";

export type Requirement = {
  id: string;
  label: string;
  value: number | string;
  unit: string;
  target: string;
  status: RequirementStatus;
  source: string;
  visible?: boolean;
  pinned?: boolean;
  approved?: boolean;
  sourceUrl?: string;
  sourceClass?:
    | "market-current"
    | "specialized"
    | "emerging-gap"
    | "hypothesis";
  verification?: string;
  missionProfileId?: string;
};

export type FlightMode = "manual" | "stabilized" | "mission";

export type FlightControlsConfig = {
  mode: FlightMode;
  aileronDeg: number;
  elevatorDeg: number;
  rudderDeg: number;
  trimDeg: number;
  throttlePct: number;
  servoLimitDeg: number;
  servoRateDegPerSec: number;
  transitionPct: number;
};

export type MissionWaypoint = {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Coordonnées WGS84 réelles facultatives; x/y restent pour compatibilité des plans locaux. */
  latitude?: number;
  longitude?: number;
  altitudeM: number;
  speedKmh: number;
  action: "inspection" | "turn" | "return";
};

export type LocalMissionPlan = {
  /** Nom humain de l’essai virtuel, sans commande d’équipement réel. */
  operationName?: string;
  profileId?: string;
  radiusKm: number;
  returnAltitudeM: number;
  lostLinkAction: "return" | "hold" | "land";
  /** Cap de référence local de l’aperçu, en degrés. */
  referenceHeadingDeg?: number;
  homeX: number;
  homeY: number;
  waypoints: MissionWaypoint[];
};

/** Conditions de mission synthétiques : elles modifient uniquement le modèle local. */
export type MissionEnvironment = {
  ambientC: number;
  windKmh: number;
  emiLevel: number;
  /** Descripteurs de scène locale; ils n'impliquent pas une géolocalisation réelle. */
  surfaceProfile?: string;
  locationLabel?: string;
};

export type DronePartCategory =
  | "airframe"
  | "propulsion"
  | "energy"
  | "avionics"
  | "payload"
  | "landing-gear"
  | "safety"
  | "hardware";

export type DroneArchitecture = "fixed-wing" | "quadcopter" | "vtol";
export type CalculationModelType =
  | "aile-volante"
  | "voilure-conventionnelle"
  | "tiltrotor"
  | "tilt-wing"
  | "tail-sitter"
  | "coaxial-x8"
  | "octocoptère"
  | "ducted-fan"
  | "multirotor"
  | "aérostat"
  | "effet-de-sol"
  | "tandem-wing"
  | "canard"
  | "tricoptère"
  | "hexacoptère"
  | "biplan"
  | "double-poutre"
  | "parapente"
  | "ornithoptère"
  | "cyclocoptère"
  | "planeur"
  /** Longue endurance haute altitude : fuselage allongé, très grande envergure. */
  | "hale-voilure"
  /** Longue endurance moyenne altitude : cellule allongée à charge utile de capteurs. */
  | "male-voilure"
  | "stealth-wing"
  | "blended-pusher";

export type InstalledMaterial = {
  id: string;
  label: string;
  /** Calque documentaire d’origine, facultatif et sans effet sur le calcul physique. */
  layer?: string;
  use: string;
  /** Optional installation offset; X is expressed as a percentage of wingspan. */
  position?: [number, number, number];
  massKg: number;
  /** Masse unitaire; la masse installée d’une ligne est massKg × quantity. */
  quantity?: number;
  geometry: "skin" | "core" | "mount" | "reinforcement";
  category?: DronePartCategory;
  manufacturer?: string;
  partNumber?: string;
  productUrl?: string;
  massSourceUrl?: string;
  catalogSource?: "manufacturer" | "concept" | "user";
  manufacturerDataStatus?: "verified" | "partial" | "estimate";
  physicalStatus?: "not-verified" | "received" | "inspected" | "rejected";
  physicalId?: string;
  /** Aire de traînée équivalente estimée, m²; non mesurée sauf source vérifiée. */
  dragAreaM2?: number;
  /** Puissance auxiliaire estimée, W; ne remplace pas une mesure électrique. */
  powerDrawW?: number;
  /** Bus logique du banc virtuel (aucune liaison électrique réelle). */
  connectedTo?: string;
  assemblyNotes?: string;
  dimensions?: string;
  electrical?: string;
  interfaces?: string;
  /** Paramètres IDDS indicatifs éditables; ces hypothèses ne sont pas des données certifiées. */
  iddsMaterial?: string;
  iddsChemistry?: string;
  iddsDensityKgM3?: number;
  iddsYoungModulusGPa?: number;
  iddsVolumeM3?: number;
  iddsEquation?: string;
  iddsWidth?: number;
  iddsHeight?: number;
  iddsRotation?: number;
  iddsConstraint?: string;
  iddsVisible?: boolean;
  compatibleAirframes?: DroneArchitecture[];
  /**
   * Décalage d’implantation en pourcentage de la zone de maquette.
   * Borné à ±PART_OFFSET_RANGE ; ne modifie jamais les données produit.
   */
  offsetX?: number;
  offsetY?: number;
  /**
   * Facteur d’échelle géométrique de la pièce (1 = cote nominale).
   * Borné à PART_SCALE_RANGE. Pour une référence constructeur, l’échelle est
   * un réglage d’affichage : la masse documentée n’est pas altérée.
   */
  scale?: number;
};

/** Bornes d’échelle acceptées par les commandes de pièce. */
export const PART_SCALE_RANGE = { min: 0.5, max: 2 } as const;
/** Bornes de déplacement (en % de la zone de maquette). */
export const PART_OFFSET_RANGE = { min: -35, max: 35 } as const;

export const clampPartScale = (value: number) =>
  Number.isFinite(value)
    ? Math.min(PART_SCALE_RANGE.max, Math.max(PART_SCALE_RANGE.min, value))
    : 1;

export const clampPartOffset = (value: number) =>
  Number.isFinite(value)
    ? Math.min(PART_OFFSET_RANGE.max, Math.max(PART_OFFSET_RANGE.min, value))
    : 0;

/**
 * Une référence catalogue constructeur décrit un produit réel : sa masse
 * documentée ne doit pas être recalculée à partir d’un réglage de scène.
 */
export const isManufacturerReference = (part: InstalledMaterial) =>
  part.catalogSource === "manufacturer";

/**
 * Masse installée d’une ligne de nomenclature.
 * - référence constructeur : masse documentée × quantité (échelle = affichage) ;
 * - pièce de concept ou utilisateur : masse × quantité × échelle³ (estimation
 *   volumique, signalée comme telle dans l’interface).
 */
export const installedPartMassKg = (part: InstalledMaterial) => {
  const quantity = Math.max(1, Math.round(part.quantity ?? 1));
  const base = Number.isFinite(part.massKg) ? Math.max(0, part.massKg) : 0;
  if (isManufacturerReference(part)) return base * quantity;
  const scale = clampPartScale(part.scale ?? 1);
  return base * quantity * scale ** 3;
};

export const installedPartsMassKg = (parts: InstalledMaterial[] = []) =>
  parts.reduce((sum, part) => sum + installedPartMassKg(part), 0);

export type DroneSketchStroke = {
  id: string;
  tool: "freehand" | "line" | "rectangle" | "ellipse" | "wing" | "fuselage" | "tail" | "payload" | "measure" | "annotation" | "triangle" | "hexagon" | "gear" | "propeller";
  color: string;
  width: number;
  layer?: string;
  label?: string;
  fill?: string;
  fillSecondary?: string;
  brushStyle?: "pencil" | "marker" | "calligraphy" | "airbrush";
  opacity?: number;
  rotation?: number;
  scale?: number;
  component?: "parametric" | "freeform";
  parameters?: { span?: number; length?: number; diameter?: number; thickness?: number };
  keyframes?: DroneSketchKeyframe[];
  points: Array<{ x: number; y: number }>;
};

export type DroneSketchKeyframe = {
  time: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity: number;
};

export type DroneSketch = {
  version: 1;
  strokes: DroneSketchStroke[];
  modifiedAt: string;
};

/** Indique si la masse affichée intègre une estimation liée à l’échelle. */
export const partMassIsScaledEstimate = (part: InstalledMaterial) =>
  !isManufacturerReference(part) && clampPartScale(part.scale ?? 1) !== 1;

export type ConceptConfig = {
  wingspan: number;
  chord: number;
  fuselageLength: number;
  propDiameter: number;
  batteryWh: number;
  payloadKg: number;
  cruiseSpeedKmh: number;
  windSpeedKmh: number;
  reserveFraction: number;
  maxTakeoffKg: number;
  altitudeM: number;
  /** Architecture de la maquette générée par le constructeur. */
  airframe?: DroneArchitecture;
  /** Morphologie spécialisée ; elle sélectionne les coefficients du moteur. */
  modelType?: CalculationModelType;
  motorCount?: number;
  designName?: string;
  /** Rendu aéronautique actif R1 à R6, persisté par projet. */
  renderMode?: "R1" | "R2" | "R3" | "R4" | "R5" | "R6";
  renderTheme?: "studio-pro" | "avionics-hud" | "blueprint";
  renderLayout?: "immersive" | "cad" | "operational";
  renderUpdatedAt?: string;
  renderStatus?: "LOCAL" | "SERVER-ACK" | "ERROR";
  renderSchemaVersion?: number;
  renderVariants?: Array<{ id: string; name: string; config: ConceptConfig; createdAt: string }>;
  /** Masse des matériaux explicitement installés dans la nomenclature. */
  constructionMassKg?: number;
  /** État de commande conservé avec la configuration du projet. */
  flightControls?: FlightControlsConfig;
  /** Plan de navigation local et simulé, sans coordonnées réelles. */
  missionPlan?: LocalMissionPlan;
  /** Conditions de simulation dégradées, persistées avec la configuration locale. */
  missionEnvironment?: MissionEnvironment;
  /** Scénario d’essai courant partagé entre le laboratoire, Mission Control et les analyses. */
  activeFlightTestScenario?: "hover" | "route" | "wind" | "obstacles" | "return";
  /** Préférences de visualisation de l’essai, conservées avec le projet. */
  flightTestDisplay?: { showExpected: boolean; showZones: boolean; showGrid: boolean };
  /** Cible virtuelle personnalisée, sans commande ni coordonnées opérationnelles. */
  missionTarget?: { name: string; brief: string };
  /** Étape manuellement active dans la progression de conception du Digital Twin (0 à 4). */
  designEvolutionStage?: number;
  /** Étapes de revue d’assemblage cochées par l’opérateur; ce n’est pas une certification. */
  assemblyReviewSteps?: string[];
  /** Éditions géométriques du Twin, distinctes des données fabricant et de la nomenclature. */
  mechanicalTwin?: MechanicalTwinConfig;
  /** Chaque cellule garde son assemblage édité; changer de drone n’applique pas les éditions d’un autre. */
  mechanicalTwins?: Record<string, MechanicalTwinConfig>;
  /** Matériaux et modules réellement sélectionnés dans la nomenclature. */
  installedMaterials?: InstalledMaterial[];
  /** Réglages et dernier rapport de calibration logicielle, par module de mission. */
  payloadCalibrationProfiles?: Record<string, PayloadCalibrationProfile>;
  /** Calques personnalisés du Studio; métadonnée d’édition, sans effet sur la simulation. */
  studioLayers?: string[];
  /** Réglages non destructifs de calque et calque actif, synchronisés au projet. */
  studioLayerSettings?: Record<string, {
    visible: boolean;
    locked: boolean;
    opacity?: number;
    blendMode?: "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten";
    exposureEV?: number;
    contrast?: number;
    saturation?: number;
    whiteBalance?: number;
    blackLevel?: number;
    whiteLevel?: number;
  }>;
  /** Affectation manuelle des pièces de revue aux calques du Studio. */
  studioLayerAssignments?: Record<string, string>;
  /** Couleur, opacité et annotation des calques; appliquées au rendu du Twin sélectionné. */
  studioLayerMeta?: Record<string, { color: string; opacity: number; note?: string }>;
  activeStudioLayer?: string;
  /** Profil de conception sélectionné dans la bibliothèque. */
  platformProfile?: string;
  /** Sélection courante propagée avec le workspace à tous les écrans. */
  engineeringSelection?: {
    source: "catalog" | "industrial" | "custom";
    droneId: string;
    droneLabel: string;
    materialId?: string;
    materialLabel?: string;
    materialSource?: string;
    updatedAt: string;
  };
  /** État métier du centre aéronautique conservé avec le projet. */
  aeronauticalRole?: string;
  integratedEquipmentIds?: string[];
  /** Réglages d’assemblage synchronisés avec l’inspecteur du dock. */
  materialFamily?: string;
  /** Apparence et visibilité des composants de la maquette physique, partagées avec Dessiner. */
  physicalAppearance?: { color: string; material: string; technical: boolean; visible: Record<string, boolean> };
  jointType?: string;
  payloadIntegration?: string;
  motorPosition?: string;
  symmetric?: boolean;
  missionBrief?: string;
  /** Croquis libre de construction, partagé entre Studio et Poste de construction. */
  customSketch?: DroneSketch;
};

export type MassBreakdown = {
  structure: number;
  battery: number;
  propulsion: number;
  avionics: number;
  payload: number;
};

export type MetricStatus = "pass" | "review" | "fail";

export type SimulationMetric = {
  id: string;
  label: string;
  value: number;
  unit: string;
  target: string;
  margin: string;
  status: MetricStatus;
  uncertainty: string;
  assumption: string;
};

export type RiskItem = {
  id: string;
  label: string;
  severity: "high" | "medium" | "low";
  probability: string;
  mitigation: string;
  status: "open" | "monitoring" | "controlled";
};

export type SimulationResult = {
  runId: string;
  generatedAt: string;
  method: string;
  totalMassKg: number;
  energyUsableWh: number;
  estimatedPowerW: number;
  enduranceH: number;
  rangeKm: number;
  wingAreaM2: number;
  wingLoadingKgM2: number;
  energyMarginH: number;
  windMarginPercent: number;
  massBreakdown: MassBreakdown;
  metrics: SimulationMetric[];
  risks: RiskItem[];
  confidence: "indicative" | "moderate" | "high";
  engineVersion: string;
  modules: SimulationModule[];
  assumptions: string[];
  limits: string[];
};

export const defaultConcept: ConceptConfig = {
  wingspan: 2.8,
  chord: 0.32,
  fuselageLength: 1.55,
  propDiameter: 0.42,
  batteryWh: 820,
  payloadKg: 1.5,
  cruiseSpeedKmh: 52,
  windSpeedKmh: 24,
  reserveFraction: 0.18,
  maxTakeoffKg: 10.5,
  altitudeM: 120,
  airframe: "fixed-wing",
  motorCount: 1,
  designName: "ATLAS / configuration 03",
};

export const defaultRequirements: Requirement[] = [
  {
    id: "endurance",
    label: "Autonomie cible",
    value: 2.5,
    unit: "h",
    target: "≥ 2,5 h",
    status: "review",
    source: "Cahier des charges client",
  },
  {
    id: "payload",
    label: "Charge utile inspection",
    value: 1.5,
    unit: "kg",
    target: "≥ 1,5 kg",
    status: "ok",
    source: "Capteur multispectral — hypothèse",
  },
  {
    id: "cruise",
    label: "Vitesse de croisière",
    value: 52,
    unit: "km/h",
    target: "45–65 km/h",
    status: "ok",
    source: "Mission d’inspection linéaire",
  },
  {
    id: "wind",
    label: "Vent de référence",
    value: 24,
    unit: "km/h",
    target: "≤ 30 km/h",
    status: "hypothesis",
    source: "Scénario météo préliminaire",
  },
  {
    id: "mass",
    label: "Masse maximale au décollage",
    value: 10.5,
    unit: "kg",
    target: "≤ 10,5 kg",
    status: "ok",
    source: "Limite de plateforme — hypothèse",
  },
  {
    id: "altitude",
    label: "Altitude opérationnelle",
    value: 120,
    unit: "m AGL",
    target: "≤ 120 m AGL",
    status: "hypothesis",
    source: "Cadre opérationnel à confirmer",
  },
];

export const formatNumber = (value: number, digits = 1) =>
  new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

export const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

type CalculationProfile = {
  structureBaseKg: number;
  structurePerSpanKg: number;
  propulsionBaseKg: number;
  propulsionPerMotorKg: number;
  powerFactor: number;
  transitionFactor: number;
};

const calculationProfiles: Record<CalculationModelType, CalculationProfile> = {
  "aile-volante": {
    structureBaseKg: 1.45,
    structurePerSpanKg: 0.42,
    propulsionBaseKg: 0.78,
    propulsionPerMotorKg: 0.18,
    powerFactor: 0.88,
    transitionFactor: 1,
  },
  "voilure-conventionnelle": {
    structureBaseKg: 1.6,
    structurePerSpanKg: 0.48,
    propulsionBaseKg: 0.85,
    propulsionPerMotorKg: 0.22,
    powerFactor: 1,
    transitionFactor: 1,
  },
  "blended-pusher": {
    structureBaseKg: 1.82,
    structurePerSpanKg: 0.5,
    propulsionBaseKg: 0.9,
    propulsionPerMotorKg: 0.24,
    powerFactor: 0.96,
    transitionFactor: 1,
  },
  tiltrotor: {
    structureBaseKg: 1.72,
    structurePerSpanKg: 0.5,
    propulsionBaseKg: 1.05,
    propulsionPerMotorKg: 0.16,
    powerFactor: 1.18,
    transitionFactor: 1.08,
  },
  "tilt-wing": {
    structureBaseKg: 1.78,
    structurePerSpanKg: 0.52,
    propulsionBaseKg: 1.08,
    propulsionPerMotorKg: 0.17,
    powerFactor: 1.2,
    transitionFactor: 1.1,
  },
  "tail-sitter": {
    structureBaseKg: 1.52,
    structurePerSpanKg: 0.44,
    propulsionBaseKg: 0.92,
    propulsionPerMotorKg: 0.17,
    powerFactor: 1.1,
    transitionFactor: 1.12,
  },
  "coaxial-x8": {
    structureBaseKg: 0.72,
    structurePerSpanKg: 0.3,
    propulsionBaseKg: 0.72,
    propulsionPerMotorKg: 0.2,
    powerFactor: 1.34,
    transitionFactor: 1,
  },
  octocoptère: {
    structureBaseKg: 0.86,
    structurePerSpanKg: 0.34,
    propulsionBaseKg: 0.76,
    propulsionPerMotorKg: 0.19,
    powerFactor: 1.4,
    transitionFactor: 1,
  },
  "ducted-fan": {
    structureBaseKg: 0.92,
    structurePerSpanKg: 0.36,
    propulsionBaseKg: 0.86,
    propulsionPerMotorKg: 0.23,
    powerFactor: 1.38,
    transitionFactor: 1,
  },
  multirotor: {
    structureBaseKg: 0.9,
    structurePerSpanKg: 0.34,
    propulsionBaseKg: 0.82,
    propulsionPerMotorKg: 0.2,
    powerFactor: 1.22,
    transitionFactor: 1,
  },
  aérostat: {
    structureBaseKg: 0.95,
    structurePerSpanKg: 0.18,
    propulsionBaseKg: 0.52,
    propulsionPerMotorKg: 0.12,
    powerFactor: 0.52,
    transitionFactor: 1,
  },
  "effet-de-sol": {
    structureBaseKg: 1.8,
    structurePerSpanKg: 0.54,
    propulsionBaseKg: 0.82,
    propulsionPerMotorKg: 0.22,
    powerFactor: 0.78,
    transitionFactor: 1,
  },
  "tandem-wing": {
    structureBaseKg: 1.72,
    structurePerSpanKg: 0.51,
    propulsionBaseKg: 0.86,
    propulsionPerMotorKg: 0.22,
    powerFactor: 0.98,
    transitionFactor: 1,
  },
  canard: {
    structureBaseKg: 1.68,
    structurePerSpanKg: 0.5,
    propulsionBaseKg: 0.88,
    propulsionPerMotorKg: 0.22,
    powerFactor: 1.04,
    transitionFactor: 1,
  },
  tricoptère: {
    structureBaseKg: 0.68,
    structurePerSpanKg: 0.28,
    propulsionBaseKg: 0.7,
    propulsionPerMotorKg: 0.2,
    powerFactor: 1.16,
    transitionFactor: 1,
  },
  hexacoptère: {
    structureBaseKg: 0.78,
    structurePerSpanKg: 0.32,
    propulsionBaseKg: 0.74,
    propulsionPerMotorKg: 0.19,
    powerFactor: 1.32,
    transitionFactor: 1,
  },
  biplan: {
    structureBaseKg: 1.86,
    structurePerSpanKg: 0.58,
    propulsionBaseKg: 0.9,
    propulsionPerMotorKg: 0.22,
    powerFactor: 1.08,
    transitionFactor: 1,
  },
  "double-poutre": {
    structureBaseKg: 1.74,
    structurePerSpanKg: 0.5,
    propulsionBaseKg: 0.92,
    propulsionPerMotorKg: 0.2,
    powerFactor: 1.02,
    transitionFactor: 1,
  },
  parapente: {
    structureBaseKg: 0.9,
    structurePerSpanKg: 0.2,
    propulsionBaseKg: 0.64,
    propulsionPerMotorKg: 0.16,
    powerFactor: 0.72,
    transitionFactor: 1,
  },
  ornithoptère: {
    structureBaseKg: 0.74,
    structurePerSpanKg: 0.3,
    propulsionBaseKg: 0.58,
    propulsionPerMotorKg: 0.14,
    powerFactor: 1.12,
    transitionFactor: 1,
  },
  cyclocoptère: {
    structureBaseKg: 0.9,
    structurePerSpanKg: 0.34,
    propulsionBaseKg: 0.9,
    propulsionPerMotorKg: 0.2,
    powerFactor: 1.3,
    transitionFactor: 1,
  },
  planeur: {
    structureBaseKg: 1.25,
    structurePerSpanKg: 0.3,
    propulsionBaseKg: 0.62,
    propulsionPerMotorKg: 0.16,
    powerFactor: 0.62,
    transitionFactor: 1,
  },
  // Longue endurance : la structure coûte en envergure, la propulsion reste
  // dimensionnée pour un vol de croisière lent et économique.
  "hale-voilure": {
    structureBaseKg: 1.68,
    structurePerSpanKg: 0.26,
    propulsionBaseKg: 0.74,
    propulsionPerMotorKg: 0.17,
    powerFactor: 0.58,
    transitionFactor: 1,
  },
  "male-voilure": {
    structureBaseKg: 1.52,
    structurePerSpanKg: 0.32,
    propulsionBaseKg: 0.82,
    propulsionPerMotorKg: 0.2,
    powerFactor: 0.7,
    transitionFactor: 1,
  },
  "stealth-wing": {
    structureBaseKg: 1.44,
    structurePerSpanKg: 0.38,
    propulsionBaseKg: 0.78,
    propulsionPerMotorKg: 0.18,
    powerFactor: 0.76,
    transitionFactor: 1,
  },
};

export function getCalculationProfile(
  config: ConceptConfig
): CalculationProfile & { modelType: CalculationModelType } {
  const modelType =
    config.modelType ??
    (config.airframe === "vtol"
      ? "tiltrotor"
      : config.airframe === "quadcopter"
        ? "multirotor"
        : "voilure-conventionnelle");
  return {
    modelType,
    ...(calculationProfiles[modelType] ??
      calculationProfiles["voilure-conventionnelle"]),
  };
}

export function runSimulation(
  config: ConceptConfig,
  requirements: Requirement[] = defaultRequirements,
  runId = "SIM-001"
): SimulationResult {
  const installedMaterialMass = config.installedMaterials
    ? installedPartsMassKg(config.installedMaterials)
    : (config.constructionMassKg ?? 0);
  const installedCategoryMass = (categories: DronePartCategory[]) =>
    (config.installedMaterials ?? []).reduce(
      (sum, item) =>
        sum +
        (item.category && categories.includes(item.category)
          ? installedPartMassKg(item)
          : 0),
      0
    );
  const categorizedInstalledMass = (config.installedMaterials ?? [])
    .filter(item => !item.category)
    .reduce((sum, item) => sum + installedPartMassKg(item), 0);
  const calculationProfile = getCalculationProfile(config);
  const massBreakdown: MassBreakdown = {
    structure:
      calculationProfile.structureBaseKg +
      config.wingspan * calculationProfile.structurePerSpanKg +
      config.fuselageLength * 0.12 +
      installedCategoryMass(["airframe", "landing-gear", "hardware"]) +
      categorizedInstalledMass,
    battery: config.batteryWh / 300 + installedCategoryMass(["energy"]),
    propulsion:
      calculationProfile.propulsionBaseKg +
      (config.motorCount ?? 1) * calculationProfile.propulsionPerMotorKg +
      config.propDiameter *
        (calculationProfile.modelType === "aérostat" ? 0.08 : 0.22) +
      installedCategoryMass(["propulsion"]),
    avionics: 0.64 + installedCategoryMass(["avionics", "safety"]),
    payload: config.payloadKg + installedCategoryMass(["payload"]),
  };
  const totalMassKg = Object.values(massBreakdown).reduce(
    (sum, mass) => sum + mass,
    0
  );
  // P1-13 fix: wingArea was span × chord (rectangle), over-estimating by
  // 1.4-1.6× for delta/tapered wings. Now uses a trapezoidal approximation
  // with taperRatio (default 0.6 for delta, 1.0 for rectangular).
  const taperRatio = (config as any).taperRatio ?? 0.65;
  const wingAreaM2 = config.wingspan * config.chord * (0.5 * (1 + taperRatio));
  const wingLoadingKgM2 = totalMassKg / wingAreaM2;
  // P1-12 fix: compute center of gravity (CG) along the longitudinal axis.
  // Uses installedMaterials positions + structural mass at 35% MAC.
  const _installedForCG = config.installedMaterials ?? [];
  const _structMassKg = massBreakdown.structure;
  const _structCG_x = config.chord * 0.35; // structure CG at 35% MAC
  let _momentSum = _structMassKg * _structCG_x;
  let _massSum = _structMassKg;
  for (const part of _installedForCG) {
    const partMass = part.massKg ?? 0;
    const partX = (part.position?.[0] ?? 0) * config.wingspan * 0.01; // offsetX is % of span
    _momentSum += partMass * partX;
    _massSum += partMass;
  }
  const cgX_m = _massSum > 0 ? _momentSum / _massSum : _structCG_x;
  // CG envelope: 25%-35% MAC is typical for stable flight
  const cgMACPercent = (cgX_m / config.chord) * 100;
  const cgWithinEnvelope = cgMACPercent >= 25 && cgMACPercent <= 35;
  const architecturePowerFactor =
    calculationProfile.powerFactor * calculationProfile.transitionFactor;
  const environment = config.missionEnvironment ?? {
    ambientC: 20,
    windKmh: config.windSpeedKmh,
    emiLevel: 0,
  };
  const installedAuxiliaryPowerW = (config.installedMaterials ?? []).reduce(
    (sum, part) => sum + Math.max(0, part.powerDrawW ?? 0),
    0
  );
  const installedDragAreaM2 = (config.installedMaterials ?? []).reduce(
    (sum, part) => sum + Math.max(0, part.dragAreaM2 ?? 0),
    0
  );
  const speedMps = Math.max(0, config.cruiseSpeedKmh / 3.6);
  // Low-order engineering estimate only; coefficients are explicit and unqualified.
  const componentDragPowerW = installedDragAreaM2 * speedMps ** 2 * 18;
  const weatherPowerFactor =
    1 + Math.abs(environment.ambientC - 20) * 0.0015 +
    Math.max(0, environment.emiLevel) * 0.025;
  const extraWindPowerW =
    Math.max(0, environment.windKmh - config.windSpeedKmh) * 1.4;
  const estimatedPowerW =
    ((165 +
      totalMassKg * 8 +
      config.cruiseSpeedKmh * 0.4 +
      config.windSpeedKmh * 1.4 +
      extraWindPowerW) *
      architecturePowerFactor *
      weatherPowerFactor) +
    componentDragPowerW +
    installedAuxiliaryPowerW;
  const batteryTemperatureFactor = Math.max(
    0.72,
    1 - Math.max(0, 10 - environment.ambientC) * 0.003 -
      Math.max(0, environment.ambientC - 40) * 0.004
  );
  const energyUsableWh =
    config.batteryWh * (1 - config.reserveFraction) * batteryTemperatureFactor;
  const enduranceH = energyUsableWh / estimatedPowerW;
  const rangeKm = enduranceH * config.cruiseSpeedKmh;
  const enduranceTarget = Number(
    requirements.find(item => item.id === "endurance")?.value ?? 2.5
  );
  const massTarget = Number(
    requirements.find(item => item.id === "mass")?.value ?? config.maxTakeoffKg
  );
  const windTarget = Number(
    requirements.find(item => item.id === "wind")?.value ?? 30
  );
  const payloadTarget = Number(
    requirements.find(item => item.id === "payload")?.value ?? config.payloadKg
  );
  const energyMarginH = enduranceH - enduranceTarget;
  const windMarginPercent = Math.max(
    0,
    ((windTarget - config.windSpeedKmh) / windTarget) * 100
  );
  const massStatus: MetricStatus = totalMassKg <= massTarget ? "pass" : "fail";
  const enduranceStatus: MetricStatus =
    enduranceH >= enduranceTarget ? "pass" : "review";
  const windStatus: MetricStatus =
    config.windSpeedKmh <= windTarget ? "pass" : "fail";
  const payloadStatus: MetricStatus =
    config.payloadKg >= payloadTarget ? "pass" : "fail";

  const metrics: SimulationMetric[] = [
    {
      id: "mass",
      label: "Masse au décollage",
      value: round(totalMassKg),
      unit: "kg",
      target: `≤ ${formatNumber(massTarget)} kg`,
      margin: `${formatNumber(massTarget - totalMassKg)} kg`,
      status: massStatus,
      uncertainty: "± 8 %",
      assumption:
        "Masse structurelle dérivée de la géométrie, composants nominaux.",
    },
    {
      id: "energy",
      label: "Autonomie estimée",
      value: round(enduranceH),
      unit: "h",
      target: `≥ ${formatNumber(enduranceTarget)} h`,
      margin: `${formatNumber(energyMarginH)} h`,
      status: enduranceStatus,
      uncertainty: "± 15 %",
      assumption:
        "Puissance moyenne estimée; réserve, température, vent dégradé et consommations/traînée de composants inclus si renseignés. Coefficients non qualifiés.",
    },
    {
      id: "range",
      label: "Rayon de mission théorique",
      value: round(rangeKm, 0),
      unit: "km",
      target: "indicatif",
      margin: "—",
      status: "review",
      uncertainty: "± 20 %",
      assumption: "Vitesse sol supposée égale à la vitesse de croisière.",
    },
    {
      id: "wing-loading",
      label: "Charge alaire",
      value: round(wingLoadingKgM2),
      unit: "kg/m²",
      target: "< 13 kg/m²",
      margin: `${formatNumber(13 - wingLoadingKgM2)} kg/m²`,
      status: wingLoadingKgM2 < 13 ? "pass" : "review",
      uncertainty: "± 6 %",
      assumption: "Surface portante rectangulaire, sans correction de saumon.",
    },
    {
      id: "wind",
      label: "Marge au vent de référence",
      value: round(windMarginPercent, 0),
      unit: "%",
      target: "≥ 0 %",
      margin: `${formatNumber(windMarginPercent, 0)} %`,
      status: windStatus,
      uncertainty: "qualitative",
      assumption: "Indicateur préliminaire, pas une validation de stabilité.",
    },
    {
      id: "payload",
      label: "Charge utile installée",
      value: round(config.payloadKg),
      unit: "kg",
      target: `≥ ${formatNumber(payloadTarget)} kg`,
      margin: `${formatNumber(config.payloadKg - payloadTarget)} kg`,
      status: payloadStatus,
      uncertainty: "± 3 %",
      assumption: "Masse utile considérée comme centrée et disponible.",
    },
  ];

  const risks: RiskItem[] = [
    {
      id: "energy-risk",
      label:
        energyMarginH < 0
          ? "Autonomie sous la cible"
          : "Autonomie proche de la cible",
      severity: energyMarginH < -0.2 ? "high" : "medium",
      probability: energyMarginH < 0 ? "Probable" : "Possible",
      mitigation:
        "Augmenter la capacité batterie ou réduire la puissance de croisière.",
      status: energyMarginH < 0 ? "open" : "monitoring",
    },
    {
      id: "mass-risk",
      label:
        totalMassKg > massTarget
          ? "Masse hors enveloppe"
          : "Masse dans l’enveloppe",
      severity: totalMassKg > massTarget ? "high" : "low",
      probability: totalMassKg > massTarget ? "Probable" : "Faible",
      mitigation:
        "Revoir structure, batterie et charge utile avant gel de configuration.",
      status: totalMassKg > massTarget ? "open" : "controlled",
    },
    {
      id: "wind-risk",
      label:
        config.windSpeedKmh > windTarget
          ? "Vent supérieur au scénario"
          : "Validation vent à compléter",
      severity: config.windSpeedKmh > windTarget ? "high" : "medium",
      probability:
        config.windSpeedKmh > windTarget ? "Possible" : "À confirmer",
      mitigation:
        "Compléter l’analyse de stabilité et la campagne d’essais en soufflerie.",
      status: config.windSpeedKmh > windTarget ? "open" : "monitoring",
    },
    {
      id: "regulatory-risk",
      label: "Cadre opérationnel non confirmé",
      severity: "medium",
      probability: "À confirmer",
      mitigation:
        "Revue réglementaire UE/Roumanie selon catégorie et opération.",
      status: "open",
    },
  ];

  const hasMissingOrConflicting = requirements.some(
    item => item.status === "conflict"
  );
  const confidence = hasMissingOrConflicting
    ? "indicative"
    : metrics.filter(item => item.status === "pass").length >= 4
      ? "moderate"
      : "indicative";

  return {
    runId,
    generatedAt: new Date().toISOString(),
    method: `Modèle de bilan préliminaire AeroMind — base ${calculationProfile.modelType}, calcul déterministe côté client`,
    totalMassKg: round(totalMassKg),
    energyUsableWh: round(energyUsableWh, 0),
    estimatedPowerW: round(estimatedPowerW, 0),
    enduranceH: round(enduranceH),
    rangeKm: round(rangeKm, 0),
    wingAreaM2: round(wingAreaM2, 2),
    wingLoadingKgM2: round(wingLoadingKgM2),
    energyMarginH: round(energyMarginH),
    windMarginPercent: round(windMarginPercent, 0),
    massBreakdown: Object.fromEntries(
      Object.entries(massBreakdown).map(([key, value]) => [key, round(value)])
    ) as MassBreakdown,
    metrics,
    risks,
    confidence,
    engineVersion: "AERO-PRELIM-0.7.0",
    modules: simulationModules,
    assumptions: [
      "Puissance moyenne constante avec réserve batterie incluse.",
      "Surface portante rectangulaire et vitesse sol assimilée à la vitesse de croisière.",
      "Les masses sont des corrélations préliminaires, pas des mesures physiques.",
      `Architecture calculée : ${calculationProfile.modelType} (base ${config.airframe ?? "non définie"}), coefficients spécialisés appliqués.`,
      `Nomenclature installée : ${round(installedMaterialMass)} kg ajoutés aux familles correspondantes (quantité × masse unitaire).`,
    ],
    limits: [
      "Ce calcul ne remplace ni CFD, ni essai en vol, ni certification.",
      "La stabilité dynamique, la météo locale et le vieillissement batterie restent à valider.",
      "Une revue humaine est obligatoire avant toute décision critique.",
    ],
  };
}
