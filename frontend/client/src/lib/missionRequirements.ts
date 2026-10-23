import { defaultRequirements, type Requirement } from "./aeroEngine";
import { additionalMissionRequirementTemplates } from "./missionRequirementCatalog";

export type MissionRequirementClass =
  | "market-current"
  | "specialized"
  | "emerging-gap";

export type MissionRequirementTemplate = {
  id: string;
  label: string;
  mission: string;
  classification: MissionRequirementClass;
  marketPosition: string;
  summary: string;
  requirements: Requirement[];
  evidence: Array<{ title: string; url: string; claim: string }>;
};

/** Remplir un critère à partir d’une observation sourcée, sans transformer un benchmark en norme. */
const sourcedRequirement = (
  item: Omit<Requirement, "status" | "approved" | "visible" | "pinned">
): Requirement => ({
  ...item,
  status: "review",
  approved: false,
  visible: true,
  pinned: false,
});

const hypothesisRequirement = (
  item: Omit<Requirement, "status" | "approved" | "visible" | "pinned">
): Requirement => ({
  ...item,
  status: "hypothesis",
  sourceClass: "emerging-gap",
  approved: false,
  visible: true,
  pinned: false,
});

export const defaultMissionTemplateId = "mission-utilities";

export const missionRequirementTemplates: MissionRequirementTemplate[] = [
  {
    id: "mission-utilities",
    label: "Inspection de réseaux et d’éoliennes",
    mission: "Inspection d’infrastructures linéaires — réseaux électriques, éoliennes et corridors",
    classification: "market-current",
    marketPosition: "Offre courante · capacités de référence constructeurs",
    summary:
      "Les offres en cours couvrent l’inspection électrique, la végétation et les constats après sinistre, ainsi que l’imagerie visuelle/thermique d’éoliennes. Les critères mesurent des performances publiées, pas des obligations.",
    requirements: [
      sourcedRequirement({
        id: "mission-utilities-req-endurance",
        label: "Autonomie maximale de référence",
        value: 55,
        unit: "min",
        target: "55 min annoncées sans charge utile et sans vent; benchmark éditable, non réglementaire.",
        source: "DJI Matrice 350 RTK — autonomie constructeur, conditions indiquées.",
        sourceUrl: "https://enterprise.dji.com/matrice-350-rtk/specs",
        sourceClass: "market-current",
        verification: "Reproduire l’essai avec la charge utile, le profil de corridor et la météo prévus; consigner la durée réellement exploitable.",
        missionProfileId: "mission-utilities",
      }),
      sourcedRequirement({
        id: "mission-utilities-req-ingress-protection",
        label: "Indice de protection de la plateforme",
        value: "IP55",
        unit: "indice IP",
        target: "IP55 publié sur la plateforme de référence; vérifier la configuration complète et l’état des joints.",
        source: "DJI Matrice 350 RTK — indice IP55 et remarque sur l’usure.",
        sourceUrl: "https://enterprise.dji.com/matrice-350-rtk/specs",
        sourceClass: "market-current",
        verification: "Vérifier la fiche de l’ensemble effectivement retenu et les conditions de garantie; inspecter les joints avant essai en environnement poussiéreux/humide.",
        missionProfileId: "mission-utilities",
      }),
      sourcedRequirement({
        id: "mission-utilities-req-thermal-resolution",
        label: "Vidéo thermique de la charge utile",
        value: "1280 × 1024 à 30",
        unit: "pixels · images/s",
        target: "H30T: 1 280 × 1 024 px à 30 ips annoncées; benchmark de capteur, non universel.",
        source: "DJI Zenmuse H30 Series — résolution et cadence publiées pour la H30T.",
        sourceUrl: "https://enterprise.dji.com/zenmuse-h30-series/specs",
        sourceClass: "market-current",
        verification: "Capturer une séquence sur le matériel retenu; confirmer résolution et cadence dans les métadonnées du fichier.",
        missionProfileId: "mission-utilities",
      }),
      sourcedRequirement({
        id: "mission-utilities-req-rtk-accuracy",
        label: "Précision horizontale de positionnement RTK FIX",
        value: "1 cm + 1 ppm",
        unit: "RTK FIX horizontal",
        target: "1 cm + 1 ppm publié en RTK FIX; cible comparative conditionnelle, non réglementaire.",
        source: "DJI Matrice 350 RTK — précision horizontale RTK FIX publiée.",
        sourceUrl: "https://enterprise.dji.com/matrice-350-rtk/specs",
        sourceClass: "market-current",
        verification: "Réaliser un contrôle sur points levés, confirmer le statut RTK FIX et comparer les coordonnées exportées aux points de contrôle.",
        missionProfileId: "mission-utilities",
      }),
    ],
    evidence: [
      {
        title: "Percepto — Electric Utility Inspection",
        url: "https://percepto.co/electric-utilities/",
        claim:
          "La page présente l’inspection autonome de réseaux, les opérations à distance, l’imagerie thermique/visuelle, la végétation et l’historique d’actifs.",
      },
      {
        title: "DJI — Inspection of Wind Turbines",
        url: "https://enterprise.dji.com/inspection/inspection-of-wind-turbines",
        claim:
          "La page décrit l’imagerie visible et thermique des pales, la localisation laser des défauts et le recours à un logiciel tiers pour l’analyse.",
      },
      {
        title: "DJI — Matrice 350 RTK Specs",
        url: "https://enterprise.dji.com/matrice-350-rtk/specs",
        claim:
          "La fiche publie les conditions de l’autonomie maximale, la protection IP55 et la précision RTK.",
      },
      {
        title: "DJI — Zenmuse H30 Series Specs",
        url: "https://enterprise.dji.com/zenmuse-h30-series/specs",
        claim:
          "La fiche H30T publie une vidéo thermique de 1 280 × 1 024 px à 30 ips.",
      },
    ],
  },
  {
    id: "emerging-utilities",
    label: "Piste d’innovation — historique d’actifs ouvert",
    mission: "Hypothèse de recherche : inspection de réseaux avec données interopérables et traçabilité temporelle",
    classification: "emerging-gap",
    marketPosition: "Hypothèse de lacune combinatoire · absence mondiale non démontrée",
    summary:
      "Hypothèse exploratoire : explorer un dossier neutre réunissant captations répétées visibles/thermiques, défauts géolocalisés, SIG, inventaire et historique de maintenance. Les pages de marché consultées répartissent ces capacités entre plateformes ou logiciels; cela n’établit pas qu’aucun produit ne réalise déjà l’intégration.",
    requirements: [
      hypothesisRequirement({
        id: "emerging-utilities-interop-record",
        label: "Dossier interopérable d’inspection d’actif",
        value: "À cadrer",
        unit: "objectif exploratoire",
        target: "Prototyper un identifiant d’actif et un paquet d’évidence reliant images visibles/thermiques, coordonnées, défaut, date, état de traitement et export SIG; comparer ensuite aux offres existantes.",
        source: "Hypothèse issue de la comparaison de Percepto Utilities et du workflow DJI éolien; ce contraste ne prouve pas l’absence de produits intégrés.",
        sourceUrl: "https://percepto.co/electric-utilities/",
        verification: "Avant d’en faire une exigence produit, rechercher les solutions concurrentes du pays cible, interroger exploitants et intégrateurs SIG, puis tester import/export avec un client pilote.",
        missionProfileId: "emerging-utilities",
      }),
    ],
    evidence: [
      {
        title: "Percepto — Electric Utility Inspection",
        url: "https://percepto.co/electric-utilities/",
        claim:
          "Montre une plateforme sectorielle avec inspection de réseaux et informations SIG; elle sert de point de comparaison, pas de preuve d’absence concurrente.",
      },
      {
        title: "DJI — Inspection of Wind Turbines",
        url: "https://enterprise.dji.com/inspection/inspection-of-wind-turbines",
        claim:
          "Décrit une analyse pouvant passer par un logiciel tiers, ce qui motive une question d’interopérabilité à valider sur le marché.",
      },
    ],
  },
  {
    id: "mission-survey",
    label: "Cartographie et levé topographique",
    mission: "Cartographie, photogrammétrie et levé topographique",
    classification: "market-current",
    marketPosition: "Offre courante · performances spécialisées publiées",
    summary:
      "Les services actuels produisent orthomosaïques, modèles numériques de surface et nuages de points. Les performances de couverture, GSD et précision dépendent du capteur, du plan de vol, du PPK et des points de contrôle.",
    requirements: [
      sourcedRequirement({
        id: "survey-gsd-rgb",
        label: "Résolution au sol RGB (GSD)",
        value: 2.7,
        unit: "cm/px",
        target: "≤ 2,7 cm/px à 120 m avec 60 % de recouvrement latéral selon le benchmark WingtraRAY/MAP61; conditionnel, non réglementaire.",
        source: "WingtraRAY — couverture annoncée avec MAP61, altitude et recouvrement publiés.",
        sourceUrl: "https://wingtra.com/ray/",
        sourceClass: "specialized",
        verification: "Vérifier hauteur et recouvrement dans le plan de vol, puis confirmer le GSD dans les métadonnées et sur l’orthomosaïque.",
        missionProfileId: "mission-survey",
      }),
      sourcedRequirement({
        id: "survey-absolute-accuracy",
        label: "Précision absolue contrôlée",
        value: 3,
        unit: "cm",
        target: "≤ 3 cm publié avec PPK et points de contrôle; mesure conditionnée au workflow fabricant.",
        source: "WingtraRAY — précision annoncée avec PPK et GCP, à vérifier par points indépendants.",
        sourceUrl: "https://wingtra.com/ray/",
        sourceClass: "specialized",
        verification: "Comparer les coordonnées à des points de contrôle indépendants; consigner RMS, journaux PPK et configuration GNSS.",
        missionProfileId: "mission-survey",
      }),
      sourcedRequirement({
        id: "survey-coverage-per-flight",
        label: "Couverture cartographiée par vol",
        value: 550,
        unit: "ha/vol",
        target: "550 ha/vol publiés à 2,7 cm/px, 120 m et 60 % latéral; benchmark conditionnel, non réglementaire.",
        source: "WingtraRAY/MAP61 — surface annoncée dans les conditions de fiche.",
        sourceUrl: "https://wingtra.com/ray/",
        sourceClass: "specialized",
        verification: "Comparer le polygone prévu et le polygone réellement acquis aux journaux; contrôler altitude et recouvrement.",
        missionProfileId: "mission-survey",
      }),
      sourcedRequirement({
        id: "survey-geospatial-deliverables",
        label: "Livrables géospatiaux interopérables",
        value: "Orthomosaïque GeoTIFF; DSM GeoTIFF; nuage LAS ou CSV",
        unit: "formats de données",
        target: "Produire des fichiers géoréférencés ouvrables dans le SIG client; cible de configuration, non réglementaire.",
        source: "DJI Surveying (DOM/DSM/modèles 3D) et WingtraRAY (GeoTIFF, LAS ou CSV).",
        sourceUrl: "https://enterprise.dji.com/surveying/land-surveying",
        sourceClass: "market-current",
        verification: "Importer les fichiers dans le SIG cible et contrôler le système de coordonnées, l’emprise, l’ouverture et la cohérence spatiale.",
        missionProfileId: "mission-survey",
      }),
    ],
    evidence: [
      {
        title: "DJI — Land Surveying",
        url: "https://enterprise.dji.com/surveying/land-surveying",
        claim:
          "DJI décrit l’acquisition de données géotaguées, l’orthomosaïque, les modèles 2D/3D, DOM et DSM.",
      },
      {
        title: "DJI — Matrice 4 Series Specs",
        url: "https://enterprise.dji.com/matrice-4-series/specs",
        claim:
          "La fiche Matrice 4E publie un capteur large 20 MP, un obturateur mécanique et la précision RTK annoncée.",
      },
      {
        title: "Wingtra — WingtraRAY",
        url: "https://wingtra.com/ray/",
        claim:
          "La page publie les options capteurs, la couverture, le GSD, la précision conditionnelle et les formats de sortie.",
      },
    ],
  },
  {
    id: "emerging-survey",
    label: "Piste d’innovation — exigences de levé comparables",
    mission: "Hypothèse de recherche : comparer la qualité géospatiale entre plateformes et logiciels",
    classification: "emerging-gap",
    marketPosition: "Hypothèse de standardisation · absence mondiale non démontrée",
    summary:
      "Hypothèse de standardisation : étudier une fiche de mission neutre qui lie GSD, précision mesurée, capteur, hauteur, recouvrement, méthode PPK/GCP et formats exportés. Les outils existent déjà; la piste est leur comparaison et leur traçabilité transversales, à confirmer auprès des utilisateurs.",
    requirements: [
      hypothesisRequirement({
        id: "emerging-survey-evidence-profile",
        label: "Profil de qualité géospatiale reproductible",
        value: "À cadrer",
        unit: "objectif exploratoire",
        target: "Tracer ensemble GSD, précision RMS vérifiée, configuration capteur/PPK, altitude, recouvrement et formats; afficher les conditions de mesure pour chaque livrable.",
        source: "Hypothèse de standardisation dérivée des fiches DJI et Wingtra; les produits observés couvrent déjà des sous-ensembles de ces capacités.",
        sourceUrl: "https://wingtra.com/ray/",
        verification: "Comparer aux logiciels et flux du marché; interroger géomètres, clients SIG et fournisseurs; valider sur des vols contrôlés avant d’en faire un critère d’acceptation.",
        missionProfileId: "emerging-survey",
      }),
    ],
    evidence: [
      {
        title: "DJI — Land Surveying",
        url: "https://enterprise.dji.com/surveying/land-surveying",
        claim:
          "Démontre l’existence de flux de levé et de sorties cartographiques actuellement proposés.",
      },
      {
        title: "Wingtra — WingtraRAY",
        url: "https://wingtra.com/ray/",
        claim:
          "Démontre que des chiffres de GSD, couverture et précision dépendent de paramètres de capture et de traitement déclarés.",
      },
    ],
  },
  ...additionalMissionRequirementTemplates,
];

const defaultMarketProfile = missionRequirementTemplates.find(
  item => item.id === defaultMissionTemplateId
);
const defaultGapProfile = missionRequirementTemplates.find(
  item => item.id === "emerging-utilities"
);

const starterProfileRequirementIds = [
  ["mission-agriculture", "req-agri-multispectral-bands"],
  ["mission-survey", "survey-gsd-rgb"],
  ["mission-search-rescue", "req-sar-thermal-video"],
  ["mission-search-rescue", "req-sar-command-coordination"],
  ["gap-wildfire", "req-wildfire-store-forward"],
  ["gap-gnss-degraded", "req-gap-continuity-evidence"],
  ["gap-gnss-degraded", "req-gap-non-gnss-recovery"],
  ["gap-multi-uav", "req-intention-inter-service"],
  ["gap-environmental", "env-coverage"],
  ["gap-environmental", "env-traceability"],
] as const;

const starterCrossMissionRequirements = starterProfileRequirementIds.flatMap(
  ([profileId, requirementId]) => {
    const requirement = missionRequirementTemplates
      .find(profile => profile.id === profileId)
      ?.requirements.find(item => item.id === requirementId);
    return requirement ? [{ ...requirement }] : [];
  }
);

export const defaultProjectMissionBrief =
  "Socle multisectoriel de benchmarks marché et d’hypothèses émergentes à valider — spécialiser la mission avant le dimensionnement.";

export const defaultMissionRequirements: Requirement[] = [
  ...defaultRequirements.map(item => ({ ...item })),
  ...(defaultMarketProfile?.requirements ?? []).map(item => ({ ...item })),
  ...(defaultGapProfile?.requirements ?? []).map(item => ({ ...item })),
  ...starterCrossMissionRequirements,
];
