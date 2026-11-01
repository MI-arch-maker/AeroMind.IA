import {
  defaultRequirements,
  round,
  runSimulation,
  type ConceptConfig,
  type DroneArchitecture,
} from "./aeroEngine";
import { droneCatalog } from "./droneCatalog";

/**
 * Générateur de concept local : transforme un brief de mission en *proposition*
 * paramétrique traçable, sans jamais modifier le projet.
 *
 * Principes :
 * - aucune valeur n’est inventée : chaque champ proposé cite soit une valeur
 *   explicitement présente dans le brief, soit un profil du catalogue livré ;
 * - la proposition est un brouillon : elle n’est appliquée qu’après validation
 *   humaine explicite, champ par champ ;
 * - les estimations dérivées proviennent du modèle local `runSimulation`, qui
 *   reste un calcul préliminaire non certifiant.
 */

export type ConceptFieldKey =
  | "wingspan"
  | "chord"
  | "fuselageLength"
  | "propDiameter"
  | "batteryWh"
  | "payloadKg"
  | "cruiseSpeedKmh"
  | "windSpeedKmh"
  | "reserveFraction"
  | "maxTakeoffKg"
  | "altitudeM"
  | "motorCount";

export type ConceptFieldDefinition = {
  key: ConceptFieldKey;
  label: string;
  unit: string;
  digits: number;
  min: number;
  max: number;
};

export const conceptFieldDefinitions: ConceptFieldDefinition[] = [
  { key: "wingspan", label: "Envergure", unit: "m", digits: 2, min: 0.6, max: 6 },
  { key: "chord", label: "Corde", unit: "m", digits: 2, min: 0.1, max: 0.9 },
  {
    key: "fuselageLength",
    label: "Longueur de fuselage",
    unit: "m",
    digits: 2,
    min: 0.5,
    max: 3.5,
  },
  {
    key: "propDiameter",
    label: "Diamètre d’hélice",
    unit: "m",
    digits: 2,
    min: 0.15,
    max: 1.2,
  },
  { key: "batteryWh", label: "Énergie batterie", unit: "Wh", digits: 0, min: 200, max: 6000 },
  { key: "payloadKg", label: "Charge utile", unit: "kg", digits: 2, min: 0, max: 12 },
  {
    key: "cruiseSpeedKmh",
    label: "Vitesse de croisière",
    unit: "km/h",
    digits: 0,
    min: 12,
    max: 140,
  },
  { key: "windSpeedKmh", label: "Vent de référence", unit: "km/h", digits: 0, min: 0, max: 80 },
  {
    key: "reserveFraction",
    label: "Réserve énergie",
    unit: "fraction",
    digits: 2,
    min: 0.05,
    max: 0.5,
  },
  {
    key: "maxTakeoffKg",
    label: "Masse maximale déclarée",
    unit: "kg",
    digits: 1,
    min: 0.5,
    max: 45,
  },
  { key: "altitudeM", label: "Altitude de scénario", unit: "m", digits: 0, min: 10, max: 4000 },
  { key: "motorCount", label: "Nombre de moteurs", unit: "", digits: 0, min: 1, max: 12 },
];

const fieldByKey = new Map(conceptFieldDefinitions.map(item => [item.key, item]));

export const clampConceptField = (key: ConceptFieldKey, value: number) => {
  const definition = fieldByKey.get(key);
  if (!definition || !Number.isFinite(value)) return value;
  return round(Math.min(definition.max, Math.max(definition.min, value)), definition.digits);
};

export type ConceptFieldSource = "brief" | "catalogue" | "architecture" | "modèle";

export type ConceptProposalField = {
  key: ConceptFieldKey;
  label: string;
  unit: string;
  current: number;
  proposed: number;
  rationale: string;
  source: ConceptFieldSource;
  /** Estimation à confirmer plutôt que valeur lue dans le brief. */
  estimate: boolean;
};

export type ConceptProposalDerived = {
  label: string;
  value: string;
  note: string;
};

export type ConceptProposal = {
  id: string;
  brief: string;
  summary: string;
  architecture: DroneArchitecture | null;
  architectureLabel: string | null;
  architectureRationale: string;
  confidence: "faible" | "moyenne" | "haute";
  fields: ConceptProposalField[];
  derived: ConceptProposalDerived[];
  warnings: string[];
  unknowns: string[];
  /** Rappel affiché sous l’aperçu : rien n’est appliqué sans validation. */
  notice: string;
};

const architectureLabels: Record<DroneArchitecture, string> = {
  "fixed-wing": "Voilure fixe",
  quadcopter: "Multirotor",
  vtol: "VTOL à bascule",
};

const architectureDefaultMotors: Record<DroneArchitecture, number> = {
  "fixed-wing": 1,
  quadcopter: 4,
  vtol: 5,
};

const normalizeBrief = (brief: string) =>
  brief
    .toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\s+/g, " ")
    .trim();

const numberPattern = "(\\d+(?:\\.\\d+)?)";

type Signal<T> = { value: T; token: string };

const findNumber = (text: string, pattern: RegExp): Signal<number> | null => {
  const match = text.match(pattern);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return { value, token: match[0].trim() };
};

const architectureKeywords: Array<{
  key: DroneArchitecture;
  words: string[];
  label: string;
}> = [
  {
    key: "vtol",
    words: ["vtol", "bascule", "tiltrotor", "tilt-rotor", "transition", "décollage vertical"],
    label: "mots-clés VTOL / transition",
  },
  {
    key: "quadcopter",
    words: [
      "multirotor",
      "quadrirotor",
      "quadricoptère",
      "quadcopter",
      "hélicoptère",
      "stationnaire",
      "vol vertical",
      "rotors",
      "quad",
    ],
    label: "mots-clés multirotor / vol stationnaire",
  },
  {
    key: "fixed-wing",
    words: [
      "aile fixe",
      "voilure fixe",
      "avion",
      "planeur",
      "longue portée",
      "longue distance",
      "croisière",
      "cartographie linéaire",
      "inspection de ligne",
      "inspection linéaire",
    ],
    label: "mots-clés voilure fixe / croisière longue",
  },
];

export function detectArchitecture(brief: string): {
  architecture: DroneArchitecture | null;
  rationale: string;
  ambiguous: boolean;
} {
  const text = normalizeBrief(brief);
  const scored = architectureKeywords
    .map(entry => ({
      ...entry,
      hits: entry.words.filter(word => text.includes(word)),
    }))
    .filter(entry => entry.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length);

  if (!scored.length) {
    return {
      architecture: null,
      rationale:
        "Aucune architecture n’est identifiable dans le brief : le modèle actuel est conservé.",
      ambiguous: false,
    };
  }
  const [best] = scored;
  return {
    architecture: best.key,
    rationale: `${architectureLabels[best.key]} proposée à partir de : ${best.hits.join(", ")}.`,
    ambiguous: scored.length > 1,
  };
}

/** Profil du catalogue le plus proche de l’architecture détectée. */
function pickCatalogueReference(architecture: DroneArchitecture, brief: string) {
  const text = normalizeBrief(brief);
  const candidates = droneCatalog.filter(design => design.key === architecture);
  if (!candidates.length) return null;
  const scored = candidates
    .map(design => {
      const tokens = `${design.label} ${design.family} ${design.mission} ${design.specs}`
        .toLowerCase()
        .split(/[^a-zà-ÿ0-9]+/)
        .filter(token => token.length > 4);
      const score = tokens.reduce(
        (sum, token) => (text.includes(token) ? sum + 1 : sum),
        0
      );
      return { design, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0].design;
}

export type BriefSignals = {
  cruiseSpeedKmh: Signal<number> | null;
  distanceKm: Signal<number> | null;
  payloadKg: Signal<number> | null;
  batteryMassKg: Signal<number> | null;
  maxTakeoffKg: Signal<number> | null;
  altitudeM: Signal<number> | null;
  enduranceMin: Signal<number> | null;
  windKmh: Signal<number> | null;
  reserveFraction: Signal<number> | null;
  wingspanM: Signal<number> | null;
};

export function extractBriefSignals(brief: string): BriefSignals {
  const text = normalizeBrief(brief);
  const speed = findNumber(text, new RegExp(`${numberPattern}\\s*(?:km/h|kmh|km\\.h)`));
  const distance = findNumber(
    text,
    new RegExp(`(?:sur|de|distance|trajet|linéaire|inspection)[^0-9]{0,24}${numberPattern}\\s*km\\b(?!\\s*/)`)
  ) ?? findNumber(text, new RegExp(`${numberPattern}\\s*km\\b(?!\\s*/)`));
  const payload =
    findNumber(
      text,
      new RegExp(`(?:charge utile|charge|utile|capteur|payload|emport)[^0-9]{0,24}${numberPattern}\\s*kg`)
    ) ?? findNumber(text, new RegExp(`${numberPattern}\\s*kg\\s*(?:de\\s+)?(?:charge|utile)`));
  const batteryMass = findNumber(
    text,
    new RegExp(`(?:batterie|pack|accu)[^0-9]{0,24}${numberPattern}\\s*kg`)
  );
  const maxTakeoff = findNumber(
    text,
    new RegExp(`(?:masse maximale|masse max|mtow|masse au décollage|masse totale)[^0-9]{0,24}${numberPattern}\\s*kg`)
  );
  const altitudeM =
    findNumber(
      text,
      new RegExp(`(?:altitude|à|a|plafond|survol)[^0-9]{0,16}${numberPattern}\\s*ft\\b`)
    ) !== null
      ? null
      : findNumber(
          text,
          new RegExp(`(?:altitude|plafond|survol|à)\\s*(?:de\\s*)?${numberPattern}\\s*m\\b`)
        );
  const altitudeFt = findNumber(
    text,
    new RegExp(`${numberPattern}\\s*(?:ft|pieds)\\b`)
  );
  const endurance =
    findNumber(
      text,
      new RegExp(`(?:autonomie|endurance|vol|voler|mission)[^0-9]{0,24}${numberPattern}\\s*(?:min|minutes?)\\b`)
    ) ??
    ((): Signal<number> | null => {
      const hours = findNumber(
        text,
        new RegExp(`(?:autonomie|endurance|vol|voler)[^0-9]{0,24}${numberPattern}\\s*(?:h|heures?)\\b`)
      );
      return hours ? { value: hours.value * 60, token: hours.token } : null;
    })();
  const windMs = findNumber(
    text,
    new RegExp(`(?:vent|rafales?)[^0-9]{0,16}${numberPattern}\\s*(?:m/s|m\\.s)`)
  );
  const windKts = findNumber(
    text,
    new RegExp(`(?:vent|rafales?)[^0-9]{0,16}${numberPattern}\\s*(?:nœuds|noeuds|kt|kts)`)
  );
  const windKmh = findNumber(
    text,
    new RegExp(`(?:vent|rafales?)[^0-9]{0,16}${numberPattern}\\s*(?:km/h|kmh)`)
  );
  const reserve = findNumber(
    text,
    new RegExp(`(?:réserve|reserve|marge d.énergie)[^0-9]{0,16}${numberPattern}\\s*%`)
  );
  const wingspan = findNumber(
    text,
    new RegExp(`(?:envergure|aile de|aile)[^0-9]{0,16}${numberPattern}\\s*m\\b`)
  );

  const wind: Signal<number> | null = windKmh
    ? windKmh
    : windMs
      ? { value: windMs.value * 3.6, token: windMs.token }
      : windKts
        ? { value: windKts.value * 1.852, token: windKts.token }
        : null;

  return {
    cruiseSpeedKmh: speed,
    distanceKm: distance,
    payloadKg: payload,
    batteryMassKg: batteryMass,
    maxTakeoffKg: maxTakeoff,
    altitudeM: altitudeFt
      ? { value: altitudeFt.value * 0.3048, token: altitudeFt.token }
      : altitudeM,
    enduranceMin: endurance,
    windKmh: wind,
    reserveFraction: reserve ? { value: reserve.value / 100, token: reserve.token } : null,
    wingspanM: wingspan,
  };
}

const fieldValue = (
  key: ConceptFieldKey,
  current: ConceptConfig
): number => Number(current[key] ?? 0);

function deriveMetrics(config: ConceptConfig) {
  const result = runSimulation(config, defaultRequirements, "PROPOSITION");
  return {
    totalMassKg: result.totalMassKg,
    enduranceH: result.enduranceH,
    rangeKm: result.rangeKm,
    usableWh: result.energyUsableWh,
    estimatedPowerW: result.estimatedPowerW,
  };
}

export function buildConceptProposal(
  brief: string,
  current: ConceptConfig,
  options: { id?: string } = {}
): ConceptProposal {
  const text = normalizeBrief(brief);
  const signals = extractBriefSignals(brief);
  const { architecture, rationale: architectureRationale, ambiguous } =
    detectArchitecture(brief);
  const reference = architecture ? pickCatalogueReference(architecture, brief) : null;

  const fields: ConceptProposalField[] = [];
  const warnings: string[] = [];
  const unknowns: string[] = [];

  const push = (
    key: ConceptFieldKey,
    proposed: number,
    rationale: string,
    source: ConceptFieldSource,
    estimate = false
  ) => {
    const definition = fieldByKey.get(key)!;
    const value = clampConceptField(key, proposed);
    // Un même champ n’apparaît qu’une fois : la dernière source évaluée
    // (brief ou modèle) remplace la valeur issue du catalogue. Un signal
    // explicite qui rejoint la valeur actuelle du projet annule donc la
    // proposition de catalogue correspondante au lieu de la laisser passer.
    const existing = fields.findIndex(field => field.key === key);
    if (existing >= 0) fields.splice(existing, 1);
    if (value === fieldValue(key, current)) return;
    fields.push({
      key,
      label: definition.label,
      unit: definition.unit,
      current: fieldValue(key, current),
      proposed: value,
      rationale,
      source,
      estimate,
    });
  };

  /**
   * Brouillon vivant partagé : il référence le tableau `fields` en cours de
   * construction, ce qui permet de projeter le modèle à chaque étape sans
   * jamais toucher au projet réel.
   */
  const draft: ConceptProposal = {
    id: options.id ?? "preview",
    brief,
    summary: "",
    architecture,
    architectureLabel: architecture ? architectureLabels[architecture] : null,
    architectureRationale,
    confidence: "moyenne",
    fields,
    derived: [],
    warnings: [],
    unknowns: [],
    notice: "",
  };

  // 1. Valeurs issues du catalogue livré (référence de conception, pas un produit).
  if (reference) {
    const c = reference.configuration;
    const source = `catalogue « ${reference.label} » (${reference.family})`;
    if (typeof c.wingspan === "number")
      push("wingspan", c.wingspan, `Envergure de départ reprise du profil ${source}.`, "catalogue", true);
    if (typeof c.chord === "number")
      push("chord", c.chord, `Corde de départ reprise du profil ${source}.`, "catalogue", true);
    if (typeof c.fuselageLength === "number")
      push(
        "fuselageLength",
        c.fuselageLength,
        `Longueur de fuselage reprise du profil ${source}.`,
        "catalogue",
        true
      );
    if (typeof c.propDiameter === "number")
      push(
        "propDiameter",
        c.propDiameter,
        `Diamètre d’hélice repris du profil ${source}.`,
        "catalogue",
        true
      );
    if (typeof c.cruiseSpeedKmh === "number")
      push(
        "cruiseSpeedKmh",
        c.cruiseSpeedKmh,
        `Vitesse de croisière reprise du profil ${source}.`,
        "catalogue",
        true
      );
    if (typeof c.altitudeM === "number")
      push("altitudeM", c.altitudeM, `Altitude de scénario reprise du profil ${source}.`, "catalogue", true);
  }

  // 2. Architecture : moteurs cohérents avec la famille détectée.
  if (architecture) {
    const motors = architectureDefaultMotors[architecture];
    push(
      "motorCount",
      motors,
      `Nombre de moteurs par défaut de l’architecture ${architectureLabels[architecture]}.`,
      "architecture",
      true
    );
    if (motors > 1)
      warnings.push(
        architecture === "vtol"
          ? `Architecture ${architectureLabels[architecture]} : vérifier la disposition réelle des ${motors} moteurs, la chaîne de bascule et les phases de transition avant tout calcul détaillé.`
          : `Architecture ${architectureLabels[architecture]} : vérifier la disposition réelle des ${motors} bras et le dimensionnement des hélices avant tout calcul détaillé.`
      );
  }

  // 3. Valeurs explicitement présentes dans le brief (priorité la plus forte).
  if (signals.wingspanM)
    push(
      "wingspan",
      signals.wingspanM.value,
      `Envergure explicite dans le brief (« ${signals.wingspanM.token} »).`,
      "brief"
    );
  if (signals.cruiseSpeedKmh)
    push(
      "cruiseSpeedKmh",
      signals.cruiseSpeedKmh.value,
      `Vitesse de croisière explicite dans le brief (« ${signals.cruiseSpeedKmh.token} »).`,
      "brief"
    );
  if (signals.payloadKg)
    push(
      "payloadKg",
      signals.payloadKg.value,
      `Charge utile explicite dans le brief (« ${signals.payloadKg.token} »).`,
      "brief"
    );
  if (signals.altitudeM)
    push(
      "altitudeM",
      signals.altitudeM.value,
      `Altitude de scénario explicite dans le brief (« ${signals.altitudeM.token} »).`,
      "brief"
    );
  if (signals.windKmh)
    push(
      "windSpeedKmh",
      signals.windKmh.value,
      `Vent de référence explicite dans le brief (« ${signals.windKmh.token} », converti en km/h).`,
      "brief"
    );
  if (signals.reserveFraction)
    push(
      "reserveFraction",
      signals.reserveFraction.value,
      `Réserve d’énergie explicite dans le brief (« ${signals.reserveFraction.token} »).`,
      "brief"
    );
  if (signals.maxTakeoffKg)
    push(
      "maxTakeoffKg",
      signals.maxTakeoffKg.value,
      `Masse maximale déclarée explicite dans le brief (« ${signals.maxTakeoffKg.token} »).`,
      "brief"
    );
  if (signals.distanceKm)
    unknowns.push(
      `Distance de mission « ${signals.distanceKm.token} » lue, mais aucune portée certifiée ne peut en être déduite : elle sert de contrôle de cohérence, pas de performance garantie.`
    );

  // 4. Énergie : dimensionnement à partir de la puissance estimée du modèle
  // projeté, corrigée de la réserve. Fonctionne même sur un modèle vierge.
  if (signals.enduranceMin) {
    const targetH = signals.enduranceMin.value / 60;
    const reserve = signals.reserveFraction?.value ?? current.reserveFraction;
    const preliminary = applyConceptProposal(
      current,
      draft,
      fields.map(field => field.key)
    );
    const estimatedPowerW = deriveMetrics(preliminary).estimatedPowerW;
    if (estimatedPowerW > 0) {
      const requiredWh = round(
        (targetH * estimatedPowerW) / Math.max(0.05, 1 - reserve),
        0
      );
      if (Math.abs(requiredWh - current.batteryWh) > 20) {
        push(
          "batteryWh",
          requiredWh,
          `Énergie nécessaire pour ${signals.enduranceMin.value.toFixed(0)} min : puissance estimée du modèle local (${estimatedPowerW.toFixed(0)} W) × durée, divisée par (1 − réserve ${(reserve * 100).toFixed(0)} %). Extrapolation locale, non mesurée.`,
          "modèle",
          true
        );
      }
      if (targetH > 6)
        warnings.push(
          `Autonomie visée (${signals.enduranceMin.value.toFixed(0)} min) au-delà du domaine de validité du modèle énergétique simplifié : l’extrapolation batterie est très incertaine.`
        );
    } else {
      warnings.push(
        "Autonomie visée dans le brief, mais la puissance estimée du modèle est nulle : capacité batterie laissée inchangée."
      );
    }
  }

  if (signals.batteryMassKg)
    unknowns.push(
      `Masse de batterie « ${signals.batteryMassKg.token} » mentionnée : le modèle dimensionne l’énergie en Wh, pas en masse de pack. À convertir avec la fiche cellule retenue.`
    );

  // 5. Contrôles de cohérence sur la proposition complète.
  const projected: ConceptConfig = applyConceptProposal(
    current,
    draft,
    fields.map(item => item.key)
  );
  const projectedMetrics = deriveMetrics(projected);
  const beforeMetrics = deriveMetrics(current);

  const maxMassField = signals.maxTakeoffKg
    ? signals.maxTakeoffKg.value
    : projected.maxTakeoffKg;
  if (maxMassField > 0 && projectedMetrics.totalMassKg > maxMassField)
    warnings.push(
      `Incohérence de masse : la configuration proposée estime ${projectedMetrics.totalMassKg.toFixed(2)} kg pour une masse maximale déclarée de ${maxMassField.toFixed(2)} kg.`
    );
  if (maxMassField <= 0)
    unknowns.push(
      "Aucune masse maximale déclarée dans le projet : la masse projetée ne peut pas être confrontée à une enveloppe autorisée."
    );
  if (signals.payloadKg && signals.payloadKg.value > 5)
    warnings.push(
      `Charge utile ${signals.payloadKg.value.toFixed(2)} kg supérieure aux profils de concept livrés : le dimensionnement devient une étude à part entière.`
    );
  if (ambiguous)
    warnings.push(
      "Plusieurs familles d’architecture apparaissent dans le brief : l’architecture retenue est la plus probable, à confirmer."
    );
  if (!fields.length)
    warnings.push(
      "Aucune valeur exploitable n’a été trouvée : aucune modification n’est proposée. Précisez des nombres avec unités (km/h, kg, m, min) et la famille d’aéronef."
    );
  if (text.length < 12)
    warnings.push(
      "Brief très court : la proposition repose surtout sur des hypothèses de catalogue."
    );

  const explicitSignals = [
    signals.wingspanM,
    signals.cruiseSpeedKmh,
    signals.payloadKg,
    signals.altitudeM,
    signals.windKmh,
    signals.reserveFraction,
    signals.maxTakeoffKg,
    signals.enduranceMin,
  ].filter(Boolean).length;
  const confidence: ConceptProposal["confidence"] =
    explicitSignals >= 4 ? "haute" : explicitSignals >= 2 ? "moyenne" : "faible";

  warnings.push(
    "Proposition préliminaire : hypothèses et extrapolations locales, à confronter aux fiches fournisseurs, aux calculs détaillés et à une revue humaine."
  );

  const enduranceDeltaMin =
    (projectedMetrics.enduranceH - beforeMetrics.enduranceH) * 60;
  const massDeltaKg = projectedMetrics.totalMassKg - beforeMetrics.totalMassKg;

  const derived: ConceptProposalDerived[] = [
    {
      label: "Masse totale estimée",
      value: `${projectedMetrics.totalMassKg.toFixed(2)} kg`,
      note: `Écart avec le modèle actuel : ${massDeltaKg >= 0 ? "+" : ""}${massDeltaKg.toFixed(2)} kg.`,
    },
    {
      label: "Énergie utile",
      value: `${projectedMetrics.usableWh.toFixed(0)} Wh`,
      note: "Capacité batterie moins la réserve déclarée.",
    },
    {
      label: "Autonomie estimée",
      value: `${(projectedMetrics.enduranceH * 60).toFixed(0)} min`,
      note: `Écart : ${enduranceDeltaMin >= 0 ? "+" : ""}${enduranceDeltaMin.toFixed(0)} min. Modèle simplifié.`,
    },
    {
      label: "Distance franchissable estimée",
      value: `${projectedMetrics.rangeKm.toFixed(1)} km`,
      note: "Autonomie × vitesse de croisière, hors vent et hors relief.",
    },
  ];

  const summaryParts = [
    architecture ? architectureLabels[architecture] : "architecture inchangée",
    `${fields.length} champ(s) modifié(s)`,
  ];

  return {
    id: options.id ?? `PROP-${Date.now().toString(36)}`,
    brief,
    summary: `${summaryParts.join(" · ")} · confiance ${confidence}`,
    architecture,
    architectureLabel: architecture ? architectureLabels[architecture] : null,
    architectureRationale,
    confidence,
    fields,
    derived,
    warnings: Array.from(new Set(warnings)),
    unknowns: Array.from(new Set(unknowns)),
    notice:
      "Rien n’est appliqué tant que vous n’avez pas validé. Les champs refusés conservent la valeur actuelle du projet.",
  };
}

/**
 * Applique uniquement les champs explicitement acceptés.
 * Les données non listées (nomenclature, données constructeur, plan de mission)
 * sont recopiées telles quelles.
 */
export function applyConceptProposal(
  current: ConceptConfig,
  proposal: ConceptProposal,
  acceptedKeys: ConceptFieldKey[]
): ConceptConfig {
  const accepted = new Set(acceptedKeys);
  const next: ConceptConfig = { ...current };
  const mutable = next as unknown as Record<string, unknown>;
  proposal.fields.forEach(field => {
    if (!accepted.has(field.key)) return;
    mutable[field.key] = clampConceptField(field.key, field.proposed);
  });
  if (proposal.architecture && accepted.has("motorCount")) {
    next.airframe = proposal.architecture;
    next.platformProfile = proposal.architecture;
    next.designName = `${proposal.architectureLabel ?? proposal.architecture} / ${proposal.brief
      .slice(0, 32)
      .trim()}`;
  }
  next.missionBrief = proposal.brief;
  return next;
}

/** Signature stable utilisée par les tests de reproductibilité. */
export const proposalSignature = (proposal: ConceptProposal) =>
  [
    proposal.architecture ?? "none",
    proposal.confidence,
    ...proposal.fields.map(
      field => `${field.key}:${field.source}:${field.proposed}`
    ),
  ].join("|");
