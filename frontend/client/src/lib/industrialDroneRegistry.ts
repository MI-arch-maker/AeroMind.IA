export type IndustrialFormat = "STEP" | "IGES" | "STL" | "OBJ" | "GLB/GLTF" | "CFD mesh";
export type FormatAvailability = "source" | "conversion" | "workflow" | "unverified";
export type RealizationLevel = "reference" | "digital-twin" | "prototype" | "production";

export type IndustrialDroneReference = {
  id: string;
  manufacturer: string;
  model: string;
  family: string;
  mission: string;
  architecture: "multirotor" | "vtol" | "fixed-wing";
  dimensions: string;
  mtow: string;
  payload: string;
  sourceUrl: string;
  sourceLabel: string;
  sourceDate: string;
  certification: string;
  certificationTone: "verified" | "limited" | "not-stated";
  readiness: RealizationLevel;
  physicalMockups: string[];
  formats: Record<IndustrialFormat, FormatAvailability>;
  dataNote: string;
  configuration: {
    airframe: "multirotor" | "vtol" | "fixed-wing";
    wingspan: number;
    fuselageLength: number;
    chord: number;
    propDiameter: number;
    batteryWh: number;
    payloadKg: number;
    cruiseSpeedKmh: number;
    motorCount: number;
    maxTakeoffKg: number;
  };
};

export const industrialFormats: IndustrialFormat[] = ["STEP", "IGES", "STL", "OBJ", "GLB/GLTF", "CFD mesh"];

export const realizationLevels: Array<{ id: RealizationLevel; label: string; description: string }> = [
  { id: "reference", label: "Référence", description: "Fiche constructeur et cotes publiques" },
  { id: "digital-twin", label: "Jumeau numérique", description: "Géométrie importée, simplifiée ou convertie" },
  { id: "prototype", label: "Prototype", description: "Maquette ou prototype à valider" },
  { id: "production", label: "Produit", description: "Plateforme commerciale documentée" },
];

export const industrialDroneRegistry: IndustrialDroneReference[] = [
  {
    id: "dji-m350-rtk",
    manufacturer: "DJI Enterprise",
    model: "Matrice 350 RTK",
    family: "Multirotor industriel",
    mission: "Inspection, cartographie, LiDAR et opérations de sécurité civile",
    architecture: "multirotor",
    dimensions: "810 × 670 × 430 mm déployé",
    mtow: "9,2 kg",
    payload: "960 g par nacelle",
    sourceUrl: "https://enterprise.dji.com/matrice-350-rtk/specs",
    sourceLabel: "Fiche technique DJI Enterprise",
    sourceDate: "Consultée le 06/10/2026",
    certification: "Classe C3 (UE) indiquée par le constructeur",
    certificationTone: "verified",
    readiness: "production",
    physicalMockups: ["Maquette échelle 1:5", "Support de banc avec nacelle factice", "Kit inspection plié / déployé"],
    formats: { STEP: "unverified", IGES: "unverified", STL: "conversion", OBJ: "conversion", "GLB/GLTF": "conversion", "CFD mesh": "workflow" },
    dataNote: "Les fichiers CAO propriétaires ne sont pas fournis dans l’archive ; l’interface conserve la traçabilité vers la fiche constructeur.",
    configuration: { airframe: "multirotor", wingspan: 0.895, fuselageLength: 0.81, chord: 0.25, propDiameter: 0.53, batteryWh: 882, payloadKg: 0.96, cruiseSpeedKmh: 82.8, motorCount: 4, maxTakeoffKg: 9.2 },
  },
  {
    id: "wingtra-ray",
    manufacturer: "Wingtra",
    model: "WingtraRAY",
    family: "VTOL de cartographie",
    mission: "Topographie, photogrammétrie, LiDAR et couverture de grandes zones",
    architecture: "vtol",
    dimensions: "Voir fiche constructeur / configuration capteur",
    mtow: "À confirmer selon configuration",
    payload: "RGB, LiDAR, multispectral",
    sourceUrl: "https://wingtra.com/ray/",
    sourceLabel: "Page officielle WingtraRAY",
    sourceDate: "Consultée le 06/10/2026",
    certification: "C3 et C6 annoncées par Wingtra pour l’UE avec parachute",
    certificationTone: "verified",
    readiness: "production",
    physicalMockups: ["Maquette échelle 1:4", "Démonstrateur ailes démontables", "Gabarit d’intégration capteur"],
    formats: { STEP: "unverified", IGES: "unverified", STL: "conversion", OBJ: "conversion", "GLB/GLTF": "conversion", "CFD mesh": "workflow" },
    dataNote: "La certification porte sur la plateforme et les configurations annoncées ; elle ne valide pas une intégration Aeromind.",
    configuration: { airframe: "vtol", wingspan: 2.4, fuselageLength: 1.25, chord: 0.3, propDiameter: 0.34, batteryWh: 1200, payloadKg: 1.2, cruiseSpeedKmh: 58, motorCount: 4, maxTakeoffKg: 6 },
  },
  {
    id: "wingtraone-gen2",
    manufacturer: "Wingtra",
    model: "WingtraOne GEN II",
    family: "VTOL de levé aérien",
    mission: "Cartographie et relevés avec capteurs RGB, multispectraux ou LiDAR",
    architecture: "vtol",
    dimensions: "137 × 67 × 23 cm indiqué dans la fiche technique",
    mtow: "4,8 kg",
    payload: "800 g",
    sourceUrl: "https://wingtra.com/wingtraone-gen-ii-drone/",
    sourceLabel: "Fiche technique officielle Wingtra",
    sourceDate: "Consultée le 06/10/2026",
    certification: "C3 annoncé ; pas de C6 pour cette génération",
    certificationTone: "verified",
    readiness: "production",
    physicalMockups: ["Maquette échelle 1:3", "Prototype de fixation payload", "Gabarit de transport"],
    formats: { STEP: "unverified", IGES: "unverified", STL: "conversion", OBJ: "conversion", "GLB/GLTF": "conversion", "CFD mesh": "workflow" },
    dataNote: "Plateforme industrielle réelle, mais les ressources 3D doivent être obtenues auprès du fabricant ou d’un fournisseur autorisé.",
    configuration: { airframe: "vtol", wingspan: 2.4, fuselageLength: 1.37, chord: 0.29, propDiameter: 0.34, batteryWh: 1100, payloadKg: 0.8, cruiseSpeedKmh: 57.6, motorCount: 4, maxTakeoffKg: 4.8 },
  },
  {
    id: "quantum-trinity-pro",
    manufacturer: "Quantum-Systems",
    model: "Trinity Pro",
    family: "VTOL eVTOL de corridor",
    mission: "Cartographie longue distance, corridors et acquisition LiDAR",
    architecture: "vtol",
    dimensions: "Envergure et cotes à compléter depuis le tech sheet",
    mtow: "5,75 kg",
    payload: "Capteurs RGB, oblique, multispectral et LiDAR",
    sourceUrl: "https://quantum-systems.com/trinity-pro/",
    sourceLabel: "Page officielle Quantum-Systems",
    sourceDate: "Consultée le 06/10/2026",
    certification: "Statut de certification non affirmé dans la source consultée",
    certificationTone: "not-stated",
    readiness: "production",
    physicalMockups: ["Maquette échelle 1:4", "Banc capteur Qube", "Démonstrateur de verrouillage payload"],
    formats: { STEP: "unverified", IGES: "unverified", STL: "conversion", OBJ: "conversion", "GLB/GLTF": "conversion", "CFD mesh": "workflow" },
    dataNote: "Les performances constructeur sont des données de référence ; elles ne remplacent pas une qualification dans Aeromind.",
    configuration: { airframe: "vtol", wingspan: 2.394, fuselageLength: 1.4, chord: 0.31, propDiameter: 0.36, batteryWh: 1500, payloadKg: 1.2, cruiseSpeedKmh: 61.2, motorCount: 4, maxTakeoffKg: 5.75 },
  },
];

export const formatAvailabilityLabels: Record<FormatAvailability, string> = {
  source: "Fourni par source",
  conversion: "Conversion requise",
  workflow: "Chaîne à générer",
  unverified: "Non vérifié",
};
