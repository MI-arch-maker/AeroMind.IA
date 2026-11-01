import type { ConceptConfig } from "./aeroEngine";

export type CatalogModelType =
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
  | "hale-voilure"
  | "male-voilure"
  | "stealth-wing"
  | "blended-pusher";

export type DroneCatalogDesign = {
  key: NonNullable<ConceptConfig["airframe"]>;
  modelType?: CatalogModelType;
  id: string;
  label: string;
  family: string;
  mission: string;
  specs: string;
  disciplines: string;
  tone: "cyan" | "violet" | "amber";
  configuration: Partial<ConceptConfig>;
  role: "civil" | "défense-non-armée";
  defenseUse: string;
  origin: "prototype-reference" | "aeromind-parametric";
  referenceImage?: string;
  referenceLabel?: string;
  /** Exports CAD source associés à une cellule de la bibliothèque. */
  engineeringAssets?: {
    hudSvg: string;
    vectorSvg: string;
    cadSvg: string;
    previewPng: string;
    obj: string;
    stl: string;
    openScad: string;
  };
  /** Morphologie illustrative, distincte de l’architecture de propulsion. */
  silhouette?: "long" | "flat" | "fusiform" | "surveillance" | "assistance";
};

type ProfileSeed = Omit<DroneCatalogDesign, "configuration" | "role" | "defenseUse" | "origin"> & {
  role?: DroneCatalogDesign["role"];
  defenseUse?: string;
  origin?: DroneCatalogDesign["origin"];
  configuration: Omit<NonNullable<DroneCatalogDesign["configuration"]>, "airframe"> & { airframe?: DroneCatalogDesign["key"] };
};

const nonArmedDefenseUse =
  "Usage institutionnel défensif non armé : capteurs, communications, secours et protection civile uniquement ; aucun ciblage, aucune charge offensive et supervision humaine obligatoire.";
const civilUse =
  "Plateforme d’ingénierie non armée pour observation, cartographie, inspection ou secours ; capteurs uniquement et validation humaine avant emploi.";

function profile(seed: ProfileSeed): DroneCatalogDesign {
  return {
    ...seed,
    modelType: seed.modelType ?? (seed.key === "fixed-wing" ? "voilure-conventionnelle" : seed.key === "vtol" ? "tiltrotor" : "multirotor"),
    role: seed.role ?? "civil",
    defenseUse: seed.defenseUse ?? civilUse,
    origin: seed.origin ?? "aeromind-parametric",
    configuration: { ...seed.configuration, airframe: seed.key },
  };
}

type ProfileTuple = [
  string, string, string, string, number, number, number, number, number,
  number, number, DroneCatalogDesign["tone"], DroneCatalogDesign["origin"],
  DroneCatalogDesign["silhouette"], DroneCatalogDesign["role"]?
];

const fixedWing: ProfileTuple[] = [
  ["deluge-e", "DELUGE-E", "Référence utilisateur · voilure fixe profilée", "Observation, cartographie et protection civile à endurance accrue.", 3.6, 1.9, 0.42, 1.4, 58, 1, 1320, "violet", "prototype-reference", "fusiform"],
  ["strata-01", "STRATA-01", "Voilure fixe · endurance étendue", "Cartographie linéaire et inspection d’infrastructures sur corridor.", 4.8, 2.1, 0.44, 1.2, 64, 1, 1640, "cyan", "aeromind-parametric", "long"],
  ["strata-02", "STRATA-02", "Voilure fixe · cartographie multispectrale", "Collecte de données agricoles, environnementales et topographiques.", 3.2, 1.55, 0.36, 0.9, 52, 1, 1080, "amber", "aeromind-parametric", "flat"],
  ["strata-03", "STRATA-03", "Voilure fixe · surveillance côtière", "Observation de littoral, détection de pollution et relais de situation.", 4.2, 1.85, 0.4, 1.1, 60, 1, 1420, "violet", "aeromind-parametric", "surveillance"],
  ["strata-04", "STRATA-04", "Voilure fixe · recherche-secours", "Recherche de personnes et cartographie d’urgence avec capteurs optiques.", 2.8, 1.45, 0.34, 0.8, 49, 1, 940, "cyan", "aeromind-parametric", "assistance"],
  ["strata-05", "STRATA-05", "Voilure fixe · relais longue portée", "Maintien d’une liaison de secours et synchronisation de capteurs distants.", 5.4, 2.3, 0.46, 1.0, 67, 1, 1880, "amber", "aeromind-parametric", "long"],
  ["strata-06", "STRATA-06", "Voilure fixe · vent renforcé", "Inspection de réseau en conditions de vent avec marge structurelle étudiée.", 3.9, 1.75, 0.43, 1.5, 56, 1, 1510, "violet", "aeromind-parametric", "long"],
  ["strata-07", "STRATA-07", "Voilure fixe · transport de capteurs", "Démonstrateur de baie modulaire pour capteurs civils interchangeables.", 3.4, 1.7, 0.39, 2.2, 50, 1, 1560, "cyan", "aeromind-parametric", "flat"],
  ["horizon-01", "HORIZON-01", "Défense non armée · observation persistante", "Alerte de situation, cartographie de crise et recherche-secours pour autorités démocratiques.", 5.8, 2.35, 0.47, 1.3, 70, 1, 2100, "amber", "aeromind-parametric", "surveillance", "défense-non-armée"],
  ["horizon-02", "HORIZON-02", "Défense non armée · relais de crise", "Relais de communication, observation et coordination humanitaire supervisée.", 4.6, 2, 0.43, 1.0, 62, 1, 1720, "cyan", "aeromind-parametric", "surveillance", "défense-non-armée"],
  ["horizon-03", "HORIZON-03", "Défense non armée · frontière et secours", "Surveillance de frontière documentée et appui aux opérations de secours, sans fonction offensive.", 4.1, 1.8, 0.4, 1.1, 59, 1, 1380, "violet", "aeromind-parametric", "assistance", "défense-non-armée"],
  ["horizon-04", "HORIZON-04", "Défense non armée · météo de crise", "Mesure atmosphérique, alerte météo et protection civile en zone dégradée.", 3.7, 1.6, 0.38, 0.9, 55, 1, 1260, "amber", "aeromind-parametric", "flat", "défense-non-armée"],
];

const multirotor: ProfileTuple[] = [
  ["nimbus-01", "NIMBUS-01", "Multirotor · inspection rapprochée", "Inspection de structures, ouvrages d’art et locaux techniques.", 1.2, 0.62, 0.26, 1.2, 30, 6, 860, "cyan", "aeromind-parametric", "surveillance"],
  ["nimbus-02", "NIMBUS-02", "Multirotor · levé de précision", "Photogrammétrie stationnaire et mesure de déformation.", 1.5, 0.7, 0.28, 1.8, 34, 6, 1040, "violet", "aeromind-parametric", "flat"],
  ["nimbus-03", "NIMBUS-03", "Multirotor · environnement humide", "Inspection de quais, barrages et infrastructures exposées aux embruns.", 1.35, 0.66, 0.27, 1.5, 28, 6, 980, "amber", "aeromind-parametric", "assistance"],
  ["nimbus-04", "NIMBUS-04", "Multirotor · espace confiné", "Inspection en espace contraint avec protection des rotors et faible vitesse.", 0.9, 0.5, 0.22, 0.55, 22, 4, 620, "cyan", "aeromind-parametric", "flat"],
  ["nimbus-05", "NIMBUS-05", "Multirotor · logistique légère", "Acheminement supervisé de petits équipements de secours.", 1.8, 0.82, 0.3, 3.5, 32, 8, 1480, "amber", "aeromind-parametric", "assistance"],
  ["nimbus-06", "NIMBUS-06", "Multirotor · relais de communication", "Maintien d’une liaison locale dans une zone sinistrée.", 1.7, 0.78, 0.29, 1.7, 30, 8, 1320, "violet", "aeromind-parametric", "surveillance"],
  ["nimbus-07", "NIMBUS-07", "Multirotor · thermique et incendie", "Observation thermique, cartographie de feu et soutien aux pompiers.", 1.55, 0.7, 0.28, 1.4, 29, 6, 1160, "amber", "aeromind-parametric", "assistance"],
  ["nimbus-08", "NIMBUS-08", "Multirotor · autonomie batterie", "Banc d’essai de redondance énergétique et de récupération sûre.", 1.3, 0.64, 0.26, 1.1, 26, 8, 1250, "cyan", "aeromind-parametric", "long"],
  ["sentinel-01", "SENTINEL-01", "Défense non armée · observation rapprochée", "Observation vérifiable de points sensibles et recherche de personnes, capteurs uniquement.", 1.9, 0.86, 0.31, 1.2, 35, 8, 1520, "violet", "aeromind-parametric", "surveillance", "défense-non-armée"],
  ["sentinel-02", "SENTINEL-02", "Défense non armée · sécurité civile", "Appui aux secours, inspection d’urgence et transmission de situation sans charge offensive.", 1.6, 0.74, 0.29, 2.2, 31, 6, 1260, "amber", "aeromind-parametric", "assistance", "défense-non-armée"],
  ["sentinel-03", "SENTINEL-03", "Défense non armée · protection d’infrastructure", "Inspection documentée d’infrastructure critique et alerte précoce supervisée.", 2.1, 0.9, 0.32, 1.6, 38, 8, 1740, "cyan", "aeromind-parametric", "surveillance", "défense-non-armée"],
  ["sentinel-04", "SENTINEL-04", "Défense non armée · secours en terrain complexe", "Recherche-secours et relais de communication en terrain contraint, sans armement.", 1.45, 0.68, 0.27, 1.0, 30, 6, 1090, "violet", "aeromind-parametric", "assistance", "défense-non-armée"],
];

const vtol: ProfileTuple[] = [
  ["atlas-01", "ATLAS-01", "VTOL hybride · cartographie corridor", "Décollage vertical puis transit sur aile pour cartographie étendue.", 2.8, 1.45, 0.32, 1.4, 55, 5, 1320, "cyan", "aeromind-parametric", "long"],
  ["atlas-02", "ATLAS-02", "VTOL hybride · inspection linéaire", "Accès à des sites isolés et retour vertical sur zone d’intervention.", 2.4, 1.3, 0.3, 1.1, 49, 5, 1160, "violet", "aeromind-parametric", "surveillance"],
  ["atlas-03", "ATLAS-03", "VTOL hybride · charge utile modulaire", "Transport de capteurs et modules de mesure interchangeables.", 3.3, 1.6, 0.36, 2.6, 45, 6, 1680, "amber", "aeromind-parametric", "assistance"],
  ["atlas-04", "ATLAS-04", "VTOL hybride · vent et relief", "Observation de relief avec redondance et marge de poussée étudiées.", 3, 1.5, 0.34, 1.2, 51, 7, 1480, "cyan", "aeromind-parametric", "long"],
  ["atlas-05", "ATLAS-05", "VTOL tiltrotor · transition instrumentée", "Banc paramétrique de transition et de contrôle supervisé.", 2.6, 1.4, 0.31, 1.0, 53, 4, 1240, "violet", "aeromind-parametric", "fusiform"],
  ["atlas-06", "ATLAS-06", "VTOL tailsitter · déploiement rapide", "Concept compact pour observation et cartographie d’urgence.", 2.1, 1.15, 0.28, 0.8, 47, 4, 940, "amber", "aeromind-parametric", "flat"],
  ["atlas-07", "ATLAS-07", "VTOL hybride · relais longue durée", "Maintien d’un relais de communication après déploiement vertical.", 3.8, 1.8, 0.39, 1.0, 57, 6, 1820, "cyan", "aeromind-parametric", "long"],
  ["atlas-08", "ATLAS-08", "VTOL hybride · logistique de secours", "Acheminement de fournitures médicales sous validation opérateur.", 3.2, 1.55, 0.35, 4.2, 42, 8, 2080, "amber", "aeromind-parametric", "assistance"],
  ["vigil-01", "VIGIL-01", "Défense non armée · reconnaissance VTOL", "Observation et évaluation de crise à commande humaine supervisée, aucun système d’arme.", 2.7, 1.4, 0.32, 1.1, 48, 6, 1380, "violet", "aeromind-parametric", "surveillance", "défense-non-armée"],
  ["vigil-02", "VIGIL-02", "Défense non armée · relais institutionnel", "Continuité des communications et recherche-secours pour services publics.", 3.4, 1.65, 0.36, 1.4, 46, 8, 1710, "cyan", "aeromind-parametric", "surveillance", "défense-non-armée"],
  ["vigil-03", "VIGIL-03", "Défense non armée · transport humanitaire", "Transport de médicaments et d’équipements de secours en zone isolée.", 3.6, 1.7, 0.37, 5, 40, 8, 2240, "amber", "aeromind-parametric", "assistance", "défense-non-armée"],
  ["vigil-04", "VIGIL-04", "Défense non armée · météo et évacuation", "Mesure de situation, relais et soutien à l’évacuation sous autorité compétente.", 2.9, 1.45, 0.33, 1.5, 44, 6, 1460, "violet", "aeromind-parametric", "assistance", "défense-non-armée"],
];

const mantisProfiles: DroneCatalogDesign[] = [
  profile({ key: "fixed-wing", modelType: "blended-pusher", id: "mantis-x-01", label: "MANTIS-X 01", family: "Aile haute · propulsive · empennage double dérive", mission: "Observation, inspection linéaire et cartographie avec cellule profilée et propulsion arrière.", specs: "6,2 m · 1,8 kg utile · 1 moteur propulsif", disciplines: "Aile haute · nacelle profilée · dérives inclinées", tone: "cyan", silhouette: "surveillance", referenceLabel: "Morphologie issue du cahier des charges joint", configuration: { wingspan: 6.2, chord: 0.62, fuselageLength: 2.55, propDiameter: 0.58, batteryWh: 2860, payloadKg: 1.8, cruiseSpeedKmh: 92, motorCount: 1, altitudeM: 4200 } }),
  profile({ key: "fixed-wing", modelType: "blended-pusher", id: "mantis-x-02", label: "MANTIS-X 02", family: "Aile haute · propulsive · endurance", mission: "Variante longue endurance pour surveillance environnementale et relais de situation.", specs: "8,4 m · 2,4 kg utile · 1 moteur propulsif", disciplines: "Envergure augmentée · énergie · stabilité", tone: "violet", silhouette: "long", referenceLabel: "Morphologie issue du cahier des charges joint", configuration: { wingspan: 8.4, chord: 0.7, fuselageLength: 3.05, propDiameter: 0.62, batteryWh: 3680, payloadKg: 2.4, cruiseSpeedKmh: 104, motorCount: 1, altitudeM: 5200 } }),
  profile({ key: "fixed-wing", modelType: "blended-pusher", id: "mantis-x-03", label: "MANTIS-X 03", family: "Aile haute · propulsive · capteurs", mission: "Variante capteur pour inspection d’infrastructures et relevés multispectraux.", specs: "5,1 m · 1,2 kg utile · 1 moteur propulsif", disciplines: "Baie ventrale · voilure compacte · retour sûr", tone: "amber", silhouette: "assistance", referenceLabel: "Morphologie issue du cahier des charges joint", configuration: { wingspan: 5.1, chord: 0.56, fuselageLength: 2.1, propDiameter: 0.5, batteryWh: 2240, payloadKg: 1.2, cruiseSpeedKmh: 78, motorCount: 1, altitudeM: 2800 } }),
  profile({ key: "fixed-wing", modelType: "blended-pusher", id: "mantis-x-04", label: "MANTIS-X 04", family: "Aile haute · propulsive · secours", mission: "Variante compacte pour recherche-secours et cartographie d’urgence supervisée.", specs: "4,2 m · 0,9 kg utile · 1 moteur propulsif", disciplines: "Déploiement rapide · visibilité · récupération", tone: "cyan", silhouette: "flat", referenceLabel: "Morphologie issue du cahier des charges joint", configuration: { wingspan: 4.2, chord: 0.5, fuselageLength: 1.8, propDiameter: 0.44, batteryWh: 1760, payloadKg: 0.9, cruiseSpeedKmh: 70, motorCount: 1, altitudeM: 2200 } }),
];
const specializedProfiles: DroneCatalogDesign[] = [
  ...mantisProfiles,
  profile({ key: "fixed-wing", modelType: "aile-volante", id: "wing-01", label: "WING-01", family: "Aile volante pure", mission: "Cartographie silencieuse et observation longue portée avec cellule sans empennage.", specs: "4,4 m · 1,2 kg utile · 1 moteur", disciplines: "Flèche · entrée dorsale · composites", tone: "cyan", silhouette: "fusiform", configuration: { wingspan: 4.4, chord: 0.48, fuselageLength: 1.35, propDiameter: 0.46, batteryWh: 1560, payloadKg: 1.2, cruiseSpeedKmh: 65, motorCount: 1, altitudeM: 180 } }),
  profile({ key: "fixed-wing", modelType: "aile-volante", id: "wing-02", label: "WING-02", family: "Aile volante compacte", mission: "Inspection et relais de données sur plateforme à faible traînée.", specs: "2,6 m · 0,7 kg utile · 1 moteur", disciplines: "Planform · stabilité · capteurs", tone: "violet", silhouette: "flat", configuration: { wingspan: 2.6, chord: 0.38, fuselageLength: 0.92, propDiameter: 0.34, batteryWh: 920, payloadKg: 0.7, cruiseSpeedKmh: 52, motorCount: 1, altitudeM: 120 } }),
  profile({ key: "fixed-wing", modelType: "tandem-wing", id: "tandem-01", label: "TANDEM-01", family: "Voilure tandem", mission: "Banc de comparaison de portance et de stabilité pour missions d’inspection.", specs: "3,0 m · 1,0 kg utile · 1 moteur", disciplines: "Deux ailes · centrage · essais", tone: "amber", silhouette: "long", configuration: { wingspan: 3, chord: 0.3, fuselageLength: 1.5, propDiameter: 0.4, batteryWh: 1040, payloadKg: 1, cruiseSpeedKmh: 48, motorCount: 1, altitudeM: 130 } }),
  profile({ key: "fixed-wing", modelType: "canard", id: "canard-01", label: "CANARD-01", family: "Voilure canard", mission: "Étude de contrôle longitudinal et de capteurs frontaux non offensifs.", specs: "2,8 m · 0,8 kg utile · 1 moteur", disciplines: "Canard · centrage · gouvernes", tone: "violet", silhouette: "flat", configuration: { wingspan: 2.8, chord: 0.34, fuselageLength: 1.4, propDiameter: 0.38, batteryWh: 980, payloadKg: 0.8, cruiseSpeedKmh: 50, motorCount: 1, altitudeM: 120 } }),
  profile({ key: "vtol", modelType: "tilt-wing", id: "tiltwing-01", label: "TILTWING-01", family: "Tilt-wing", mission: "Transition aile basculante pour accès vertical et croisière efficace.", specs: "2,7 m · 1,0 kg utile · 4 moteurs", disciplines: "Basculement · transition · liaison", tone: "cyan", silhouette: "long", configuration: { wingspan: 2.7, chord: 0.32, fuselageLength: 1.3, propDiameter: 0.34, batteryWh: 1280, payloadKg: 1, cruiseSpeedKmh: 48, motorCount: 4, altitudeM: 140 } }),
  profile({ key: "vtol", modelType: "tail-sitter", id: "tailsitter-01", label: "TAILSITTER-01", family: "Tail-sitter", mission: "Déploiement vertical compact et passage en vol horizontal supervisé.", specs: "2,0 m · 0,6 kg utile · 4 moteurs", disciplines: "Assiette · transition · récupération", tone: "amber", silhouette: "assistance", configuration: { wingspan: 2, chord: 0.29, fuselageLength: 1.12, propDiameter: 0.3, batteryWh: 860, payloadKg: 0.6, cruiseSpeedKmh: 44, motorCount: 4, altitudeM: 100 } }),
  profile({ key: "quadcopter", modelType: "coaxial-x8", id: "coaxial-01", label: "COAXIAL-X8", family: "Coaxial X8", mission: "Redondance de propulsion et observation stationnaire avec huit rotors coaxiaux.", specs: "1,5 m · 1,8 kg utile · 8 moteurs", disciplines: "Coaxial · thermique · redondance", tone: "violet", silhouette: "surveillance", configuration: { wingspan: 1.5, chord: 0.3, fuselageLength: 0.72, propDiameter: 0.38, batteryWh: 1420, payloadKg: 1.8, cruiseSpeedKmh: 34, motorCount: 8, altitudeM: 100 } }),
  profile({ key: "quadcopter", modelType: "octocoptère", id: "octa-01", label: "OCTA-01", family: "Octocoptère lourd", mission: "Transport supervisé de capteurs et d’équipements de secours.", specs: "2,2 m · 5,0 kg utile · 8 moteurs", disciplines: "Charge · structure · retour sûr", tone: "amber", silhouette: "assistance", configuration: { wingspan: 2.2, chord: 0.34, fuselageLength: 0.92, propDiameter: 0.46, batteryWh: 2180, payloadKg: 5, cruiseSpeedKmh: 36, motorCount: 8, altitudeM: 100 } }),
  profile({ key: "quadcopter", modelType: "ducted-fan", id: "ducted-01", label: "DUCTED-01", family: "Ducted-fan", mission: "Inspection de proximité avec rotors carénés et réduction du risque opérateur.", specs: "1,1 m · 0,8 kg utile · 4 moteurs", disciplines: "Carénage · bruit · sécurité", tone: "cyan", silhouette: "flat", configuration: { wingspan: 1.1, chord: 0.24, fuselageLength: 0.58, propDiameter: 0.28, batteryWh: 760, payloadKg: 0.8, cruiseSpeedKmh: 26, motorCount: 4, altitudeM: 70 } }),
  profile({ key: "fixed-wing", modelType: "aérostat", id: "aerostat-01", label: "AEROSTAT-01", family: "Aérostat captif", mission: "Observation persistante à très faible vitesse et relais de communication.", specs: "6,0 m · 2,0 kg utile · 2 moteurs", disciplines: "Enveloppe · ancrage · météo", tone: "amber", silhouette: "long", configuration: { wingspan: 6, chord: 0.7, fuselageLength: 3.6, propDiameter: 0.42, batteryWh: 1100, payloadKg: 2, cruiseSpeedKmh: 18, motorCount: 2, altitudeM: 80 } }),
  profile({ key: "fixed-wing", modelType: "effet-de-sol", id: "groundeffect-01", label: "GROUND-EFFECT-01", family: "Aile à effet de sol", mission: "Banc d’étude de vol bas et de surveillance côtière non armée.", specs: "4,2 m · 1,5 kg utile · 1 moteur", disciplines: "Effet de sol · flottaison · météo", tone: "violet", silhouette: "flat", configuration: { wingspan: 4.2, chord: 0.52, fuselageLength: 2, propDiameter: 0.48, batteryWh: 1440, payloadKg: 1.5, cruiseSpeedKmh: 72, motorCount: 1, altitudeM: 30 } }),
  profile({ key: "vtol", modelType: "tiltrotor", id: "tiltrotor-01", label: "TILTROTOR-01", family: "Tiltrotor", mission: "Comparaison de nacelles orientables pour mission de liaison et secours.", specs: "3,1 m · 1,4 kg utile · 4 moteurs", disciplines: "Nacelles · transition · contrôle", tone: "cyan", silhouette: "fusiform", configuration: { wingspan: 3.1, chord: 0.34, fuselageLength: 1.45, propDiameter: 0.4, batteryWh: 1480, payloadKg: 1.4, cruiseSpeedKmh: 56, motorCount: 4, altitudeM: 140 } }),
  profile({ key: "quadcopter", modelType: "tricoptère", id: "tri-01", label: "TRI-01", family: "Tricoptère", mission: "Banc de contrôle lacet et inspection stationnaire à trois rotors.", specs: "1,4 m · 1,0 kg utile · 3 moteurs", disciplines: "Lacet · servo arrière · redondance", tone: "cyan", silhouette: "surveillance", configuration: { wingspan: 1.4, chord: 0.28, fuselageLength: 0.7, propDiameter: 0.38, batteryWh: 900, payloadKg: 1, cruiseSpeedKmh: 30, motorCount: 3, altitudeM: 90 } }),
  profile({ key: "quadcopter", modelType: "hexacoptère", id: "hexa-01", label: "HEXA-01", family: "Hexacoptère", mission: "Plateforme redondante de cartographie et de secours instrumenté.", specs: "1,8 m · 2,4 kg utile · 6 moteurs", disciplines: "Redondance · charge · thermique", tone: "violet", silhouette: "assistance", configuration: { wingspan: 1.8, chord: 0.32, fuselageLength: 0.8, propDiameter: 0.42, batteryWh: 1500, payloadKg: 2.4, cruiseSpeedKmh: 32, motorCount: 6, altitudeM: 100 } }),
  profile({ key: "fixed-wing", modelType: "biplan", id: "biplane-01", label: "BIPLANE-01", family: "Biplan", mission: "Étude de portance, faible vitesse et stabilité pour mission d’observation.", specs: "2,4 m · 0,9 kg utile · 1 moteur", disciplines: "Deux plans · entretoises · centrage", tone: "amber", silhouette: "flat", configuration: { wingspan: 2.4, chord: 0.42, fuselageLength: 1.25, propDiameter: 0.38, batteryWh: 880, payloadKg: 0.9, cruiseSpeedKmh: 42, motorCount: 1, altitudeM: 120 } }),
  profile({ key: "fixed-wing", modelType: "double-poutre", id: "boom-01", label: "BOOM-01", family: "Double poutre", mission: "Cellule ouverte pour capteurs modulaires et maintenance rapide.", specs: "3,3 m · 1,5 kg utile · 2 moteurs", disciplines: "Poutres · baie centrale · bimoteur", tone: "violet", silhouette: "long", configuration: { wingspan: 3.3, chord: 0.4, fuselageLength: 1.6, propDiameter: 0.42, batteryWh: 1320, payloadKg: 1.5, cruiseSpeedKmh: 54, motorCount: 2, altitudeM: 160 } }),
  profile({ key: "fixed-wing", modelType: "parapente", id: "para-01", label: "PARA-01", family: "Aile souple / parapente", mission: "Observation lente et récupération douce avec enveloppe souple paramétrique.", specs: "5,2 m · 1,0 kg utile · 1 moteur", disciplines: "Voile souple · suspentes · vent", tone: "cyan", silhouette: "long", configuration: { wingspan: 5.2, chord: 0.8, fuselageLength: 1.4, propDiameter: 0.36, batteryWh: 1040, payloadKg: 1, cruiseSpeedKmh: 28, motorCount: 1, altitudeM: 150 } }),
  profile({ key: "fixed-wing", modelType: "ornithoptère", id: "ornitho-01", label: "ORNITHO-01", family: "Ornithoptère", mission: "Banc de recherche biomimétique à battement d’ailes et capteurs légers.", specs: "1,8 m · 0,3 kg utile · 2 moteurs", disciplines: "Battement · résonance · acoustique", tone: "amber", silhouette: "flat", configuration: { wingspan: 1.8, chord: 0.3, fuselageLength: 0.75, propDiameter: 0.2, batteryWh: 520, payloadKg: 0.3, cruiseSpeedKmh: 24, motorCount: 2, altitudeM: 80 } }),
  profile({ key: "quadcopter", modelType: "cyclocoptère", id: "cyclo-01", label: "CYCLO-01", family: "Cyclocoptère", mission: "Étude de propulsion cyclique et de contrôle vectoriel en environnement contraint.", specs: "1,3 m · 0,6 kg utile · 4 moteurs", disciplines: "Cylindres · vecteur · contrôle", tone: "violet", silhouette: "flat", configuration: { wingspan: 1.3, chord: 0.3, fuselageLength: 0.62, propDiameter: 0.32, batteryWh: 780, payloadKg: 0.6, cruiseSpeedKmh: 30, motorCount: 4, altitudeM: 70 } }),
  profile({ key: "fixed-wing", modelType: "planeur", id: "glider-01", label: "GLIDER-01", family: "Planeur instrumenté", mission: "Endurance silencieuse, thermiques simulés et relais de mesure scientifique.", specs: "5,8 m · 0,8 kg utile · 1 moteur", disciplines: "Finesse · ballast · thermiques", tone: "cyan", silhouette: "long", configuration: { wingspan: 5.8, chord: 0.26, fuselageLength: 1.8, propDiameter: 0.3, batteryWh: 720, payloadKg: 0.8, cruiseSpeedKmh: 46, motorCount: 1, altitudeM: 220 } }),
  profile({ key: "fixed-wing", modelType: "hale-voilure", id: "hale-stratospheric", label: "HALE-STRATOSPHERIC", family: "Profil HALE-Stratospheric", mission: "Surveillance haute altitude non armée et observation de zones de crise environnementale.", specs: "4,8 m · nez bulbeux · 1 moteur", disciplines: "Haute altitude · environnement · endurance", tone: "cyan", silhouette: "long", configuration: { wingspan: 4.8, chord: 0.34, fuselageLength: 2.2, propDiameter: 0.34, batteryWh: 2480, payloadKg: 1.4, cruiseSpeedKmh: 72, motorCount: 1, altitudeM: 18000 } }),
  profile({ key: "fixed-wing", modelType: "male-voilure", id: "male-longenver", label: "MALE-LONGENVER", family: "Profil MALE-LongEnver", mission: "Inspection de sécurité civile sur corridors étendus, avec grande autonomie et capteurs non offensifs.", specs: "3,6 m · fuselage 2,1 m · 1 moteur", disciplines: "Corridor · V inversé · autonomie", tone: "amber", silhouette: "long", configuration: { wingspan: 3.6, chord: 0.38, fuselageLength: 2.1, propDiameter: 0.38, batteryWh: 2120, payloadKg: 1.8, cruiseSpeedKmh: 68, motorCount: 1, altitudeM: 9000 } }),
  profile({ key: "fixed-wing", modelType: "stealth-wing", id: "stealth-wing-01", label: "STEALTH-WING", family: "Profil Furtif Stealth-Wing", mission: "Aile volante intégrée pour collecte de capteurs en environnement électromagnétique perturbé, sans charge offensive.", specs: "3,2 m · aile volante intégrée · 1 moteur", disciplines: "Faible signature · CEM · aile volante", tone: "violet", silhouette: "flat", configuration: { wingspan: 3.2, chord: 0.52, fuselageLength: 1.35, propDiameter: 0.3, batteryWh: 1860, payloadKg: 1.1, cruiseSpeedKmh: 84, motorCount: 1, altitudeM: 6000 } }),

  profile({ key: "fixed-wing", modelType: "hale-voilure", id: "strata-hale-115", label: "STRATA-HALE", family: "Variante STRATA-HALE · Haute Altitude", mission: "Surveillance longue distance non armée, avec baie de capteurs optimisée et empennage en V inversé.", specs: "11,5 m · fuselage allongé · baie capteurs", disciplines: "Haute altitude · V inversé · endurance", tone: "cyan", silhouette: "long", configuration: { wingspan: 11.5, chord: 0.42, fuselageLength: 2.8, propDiameter: 0.38, batteryWh: 3180, payloadKg: 2.4, cruiseSpeedKmh: 76, motorCount: 1, altitudeM: 18000 } }),
  profile({ key: "fixed-wing", modelType: "stealth-wing", id: "stealth-wing-flat-01", label: "STEALTH-WING · AILE VOLANTE", family: "Variante furtive Stealth-Wing", mission: "Aile volante intégrée en profil triangulaire plat continu, sans dérive verticale, pour milieux perturbés.", specs: "3,2 m · triangle extrudé · sans dérive", disciplines: "Aile volante · CEM · faible signature", tone: "violet", silhouette: "flat", configuration: { wingspan: 3.2, chord: 0.58, fuselageLength: 1.35, propDiameter: 0.3, batteryWh: 2040, payloadKg: 1.2, cruiseSpeedKmh: 88, motorCount: 1, altitudeM: 6200 } }),
  profile({ key: "fixed-wing", modelType: "male-voilure", id: "sentinel-male-132", label: "SENTINEL-MALE", family: "Variante SENTINEL-MALE · Moyenne Altitude", mission: "Inspection de corridors de sécurité civile avec long fuselage, envergure optimisée et tourelle optronique stabilisée.", specs: "13,2 m · tourelle optronique · 1 moteur", disciplines: "Moyenne altitude · corridor · optronique", tone: "amber", silhouette: "long", configuration: { wingspan: 13.2, chord: 0.46, fuselageLength: 2.6, propDiameter: 0.4, batteryWh: 2860, payloadKg: 2.1, cruiseSpeedKmh: 70, motorCount: 1, altitudeM: 9000 } }),

];

const pdfAssetRoot = "/assets/aeromind-cell-library";
function pdfEngineeringAssets(stem: string): NonNullable<DroneCatalogDesign["engineeringAssets"]> {
  return {
    hudSvg: `${pdfAssetRoot}/${stem}-hud.svg`,
    vectorSvg: `${pdfAssetRoot}/${stem}.svg`,
    cadSvg: `${pdfAssetRoot}/${stem}-3d.svg`,
    previewPng: `${pdfAssetRoot}/${stem}-3d.png`,
    obj: `${pdfAssetRoot}/${stem}.obj`,
    stl: `${pdfAssetRoot}/${stem}.stl`,
    openScad: `${pdfAssetRoot}/${stem}.scad`,
  };
}

/** Huit profils conceptuels issus du PDF joint ; les cotes sont celles des maquettes CAO, pas des performances certifiées. */
const pdfReferenceProfiles: DroneCatalogDesign[] = [
  profile({ key: "fixed-wing", modelType: "stealth-wing", id: "pdf-01-aile-delta-noire", label: "AILE DELTA · NOIRE", family: "Aile volante furtive · maquette PDF", mission: "Référence de forme pour visualisation, étude conceptuelle et essais exclusivement simulés.", specs: "Maquette CAO · envergure 0,72 m · 1 moteur", disciplines: "Aile delta · coque centrale · surfaces de contrôle", tone: "violet", silhouette: "flat", referenceLabel: "Silhouette adaptée du PDF utilisateur · maquette non certifiée", engineeringAssets: pdfEngineeringAssets("01-aile-delta-noire"), referenceImage: `${pdfAssetRoot}/01-aile-delta-noire-hud.svg`, configuration: { wingspan: 0.72, chord: 0.33, fuselageLength: 0.39, propDiameter: 0.12, batteryWh: 420, payloadKg: 0, cruiseSpeedKmh: 35, motorCount: 1, altitudeM: 60 } }),
  profile({ key: "fixed-wing", modelType: "aile-volante", id: "pdf-02-delta-jaune", label: "DELTA · BANDE JAUNE", family: "Aile delta · maquette PDF", mission: "Référence de forme pour visualisation, étude conceptuelle et essais exclusivement simulés.", specs: "Maquette CAO · envergure 0,68 m · 1 moteur", disciplines: "Plan delta · repère haute visibilité · structure", tone: "amber", silhouette: "flat", referenceLabel: "Silhouette adaptée du PDF utilisateur · maquette non certifiée", engineeringAssets: pdfEngineeringAssets("02-delta-jaune"), referenceImage: `${pdfAssetRoot}/02-delta-jaune-hud.svg`, configuration: { wingspan: 0.68, chord: 0.36, fuselageLength: 0.4, propDiameter: 0.12, batteryWh: 400, payloadKg: 0, cruiseSpeedKmh: 32, motorCount: 1, altitudeM: 60 } }),
  profile({ key: "fixed-wing", modelType: "blended-pusher", id: "pdf-03-delta-prop-gris", label: "DELTA · PROPULSION ARRIÈRE", family: "Aile volante propulsive · maquette PDF", mission: "Référence de forme pour visualisation, étude conceptuelle et essais exclusivement simulés.", specs: "Maquette CAO · envergure 0,70 m · 1 moteur", disciplines: "Cellule intégrée · hélice propulsive · accès technique", tone: "cyan", silhouette: "fusiform", referenceLabel: "Silhouette adaptée du PDF utilisateur · maquette non certifiée", engineeringAssets: pdfEngineeringAssets("03-delta-prop-gris"), referenceImage: `${pdfAssetRoot}/03-delta-prop-gris-hud.svg`, configuration: { wingspan: 0.7, chord: 0.35, fuselageLength: 0.42, propDiameter: 0.12, batteryWh: 430, payloadKg: 0, cruiseSpeedKmh: 34, motorCount: 1, altitudeM: 60 } }),
  profile({ key: "fixed-wing", modelType: "male-voilure", id: "pdf-04-maq9", label: "MAQ-9 · EMPENNAGE EN V", family: "Voilure fixe · empennage en V · maquette PDF", mission: "Référence de forme uniquement pour étude de cellule, traçabilité de conception et simulation non opérationnelle.", specs: "Maquette CAO · envergure 0,86 m · 1 moteur", disciplines: "Aile fixe · empennage en V · train conceptuel", tone: "cyan", silhouette: "long", referenceLabel: "Silhouette adaptée du PDF utilisateur · paramètres indicatifs, non certifiés", engineeringAssets: pdfEngineeringAssets("04-maq9"), referenceImage: `${pdfAssetRoot}/04-maq9-hud.svg`, configuration: { wingspan: 0.86, chord: 0.27, fuselageLength: 0.34, propDiameter: 0.12, batteryWh: 560, payloadKg: 0, cruiseSpeedKmh: 36, motorCount: 1, altitudeM: 80 } }),
  profile({ key: "fixed-wing", modelType: "blended-pusher", id: "pdf-05-delta-prop-arriere", label: "AILE ARGENT · PROPULSEUR", family: "Aile volante argent · maquette PDF", mission: "Référence de forme pour visualisation, étude conceptuelle et essais exclusivement simulés.", specs: "Maquette CAO · envergure 0,74 m · 1 moteur", disciplines: "Voilure intégrée · accès aux panneaux · propulsion arrière", tone: "cyan", silhouette: "long", referenceLabel: "Silhouette adaptée du PDF utilisateur · maquette non certifiée", engineeringAssets: pdfEngineeringAssets("05-delta-prop-arriere"), referenceImage: `${pdfAssetRoot}/05-delta-prop-arriere-hud.svg`, configuration: { wingspan: 0.74, chord: 0.375, fuselageLength: 0.37, propDiameter: 0.12, batteryWh: 460, payloadKg: 0, cruiseSpeedKmh: 35, motorCount: 1, altitudeM: 60 } }),
  profile({ key: "vtol", modelType: "tiltrotor", id: "pdf-06-vtol-rouge", label: "VTOL HYBRIDE · ROUGE", family: "Aile fixe · sustentation verticale · maquette PDF", mission: "Référence de forme pour revue des composants verticaux et simulation de transition uniquement.", specs: "Maquette CAO · envergure 0,82 m · 4 rotors + 1 moteur", disciplines: "Voilure fixe · rotors de sustentation · propulsion arrière", tone: "amber", silhouette: "long", referenceLabel: "Silhouette adaptée du PDF utilisateur · étude conceptuelle non certifiée", engineeringAssets: pdfEngineeringAssets("06-vtol-rouge"), referenceImage: `${pdfAssetRoot}/06-vtol-rouge-hud.svg`, configuration: { wingspan: 0.82, chord: 0.3, fuselageLength: 0.35, propDiameter: 0.12, batteryWh: 620, payloadKg: 0, cruiseSpeedKmh: 38, motorCount: 5, altitudeM: 60 } }),
  profile({ key: "quadcopter", modelType: "ducted-fan", id: "pdf-07-quad-duct", label: "QUADRIROTOR · CONDUITS ANNULAIRES", family: "Quadrirotor caréné · maquette PDF", mission: "Référence de forme pour assemblage et simulation d’une plateforme à rotors protégés.", specs: "Maquette CAO · envergure 0,56 m · 4 rotors carénés", disciplines: "Cadres de protection · rotors carénés · inspection simulée", tone: "cyan", silhouette: "flat", referenceLabel: "Silhouette adaptée du PDF utilisateur · maquette non certifiée", engineeringAssets: pdfEngineeringAssets("07-quad-duct"), referenceImage: `${pdfAssetRoot}/07-quad-duct-hud.svg`, configuration: { wingspan: 0.56, chord: 0.34, fuselageLength: 0.2, propDiameter: 0.2, batteryWh: 480, payloadKg: 0, cruiseSpeedKmh: 28, motorCount: 4, altitudeM: 40 } }),
  profile({ key: "fixed-wing", modelType: "voilure-conventionnelle", id: "pdf-08-aile-droite", label: "CELLULE À AILES DROITES", family: "Voilure fixe · empennage double · maquette PDF", mission: "Adaptation non armée de la silhouette pour revue de cellule et essais de géométrie exclusivement simulés.", specs: "Maquette CAO · envergure 0,76 m · cellule non armée", disciplines: "Aile droite · empennage double · sans charge offensive", tone: "cyan", silhouette: "surveillance", referenceLabel: "Silhouette adaptée du PDF utilisateur ; charges externes offensives exclues conformément au profil non armé AeroMinD.", engineeringAssets: pdfEngineeringAssets("08-aile-droite-blanc"), referenceImage: `${pdfAssetRoot}/08-aile-droite-blanc-hud.svg`, configuration: { wingspan: 0.76, chord: 0.29, fuselageLength: 0.38, propDiameter: 0.12, batteryWh: 520, payloadKg: 0, cruiseSpeedKmh: 35, motorCount: 1, altitudeM: 60 } }),
];

function fromTuple(tuple: ProfileTuple, key: DroneCatalogDesign["key"]): DroneCatalogDesign {
  const [id, label, family, mission, wingspan, fuselageLength, chord, payloadKg, cruiseSpeedKmh, motorCount, batteryWh, tone, origin, silhouette, role] = tuple;
  return profile({
    key,
    id,
    label,
    family,
    mission,
    specs: `${wingspan.toFixed(1)} m · ${payloadKg.toFixed(1)} kg utile · ${motorCount} moteur(s)`,
    disciplines: "Paramètres géométriques · énergie · sécurité fonctionnelle",
    tone,
    origin,
    silhouette,
    role,
    defenseUse: role === "défense-non-armée" ? nonArmedDefenseUse : civilUse,
    configuration: {
      wingspan,
      chord,
      fuselageLength,
      propDiameter: key === "fixed-wing" ? 0.46 : key === "vtol" ? 0.36 : 0.34,
      batteryWh,
      payloadKg,
      cruiseSpeedKmh,
      motorCount,
      altitudeM: key === "fixed-wing" ? 180 : key === "vtol" ? 140 : 100,
    },
  });
}

const fixedWingProfiles = fixedWing.map(tuple => fromTuple(tuple, "fixed-wing"));
const multirotorProfiles = multirotor.map(tuple => fromTuple(tuple, "quadcopter"));
const vtolProfiles = vtol.map(tuple => fromTuple(tuple, "vtol"));
const aeromindReferenceProfile = profile({
  key: "quadcopter",
  modelType: "hexacoptère",
  id: "aeromind-reference-multirotor-001",
  label: "Drone à carénage ovale — Référence",
  family: "Multirotor · maquette de conception physique",
  mission: "Maquette numérique inspirée de l’image de référence AeroMind.ai ; configuration de propulsion indicative, non certifiée.",
  specs: "Carénage ovale · 6 rotors indicatifs · module supérieur non spécifié",
  disciplines: "Corps central · bras latéraux · propulsion turquoise · module orange",
  tone: "cyan",
  origin: "prototype-reference",
  role: "civil",
  referenceLabel: "Image de référence fournie par l’utilisateur — identité visuelle, pas géométrie mesurée.",
  configuration: {
    wingspan: 1.65,
    chord: 0.52,
    fuselageLength: 0.92,
    propDiameter: 0.34,
    batteryWh: 1240,
    payloadKg: 1.2,
    cruiseSpeedKmh: 38,
    motorCount: 6,
    altitudeM: 120,
  },
});

/**
 * Bibliothèque de conception AeroMinD : profils paramétriques, références morphologiques PDF
 * et plusieurs architectures aéronautiques, dont 12 profils de défense démocratique non armés.
 * Les valeurs sont des hypothèses d’avant-projet, jamais des performances certifiées.
 */
// Parité stricte avec la bibliothèque de l’ancienne URL publique.
// Ces profils ajoutés dans une session ultérieure ne font pas partie de la source héritée.
const legacyExcludedIds = new Set([
  "hale-stratospheric",
  "male-longenver",
  "stealth-wing-01",
  "strata-hale-115",
  "stealth-wing-flat-01",
  "sentinel-male-132",
]);
export const droneCatalog: DroneCatalogDesign[] = [
  ...fixedWingProfiles,
  ...multirotorProfiles,
  ...vtolProfiles,
  aeromindReferenceProfile,
  ...specializedProfiles.filter(item => !legacyExcludedIds.has(item.id)),
  ...pdfReferenceProfiles,
].map(item => ({
  ...item,
  defenseUse: item.role === "défense-non-armée" ? nonArmedDefenseUse : item.defenseUse,
}));

export const catalogSummary = {
  total: droneCatalog.length,
  fixedWing: droneCatalog.filter(item => item.key === "fixed-wing").length,
  multirotor: droneCatalog.filter(item => item.key === "quadcopter").length,
  vtol: droneCatalog.filter(item => item.key === "vtol").length,
  nonArmedDefense: droneCatalog.filter(item => item.role === "défense-non-armée").length,
  prototypeReference: droneCatalog.filter(item => item.origin === "prototype-reference").length,
  specializedArchitectures: new Set(droneCatalog.map(item => item.modelType)).size,
};
