export type FixedWingInput = {
  architecture: string | undefined;
  spanM: number;
  chordM: number;
  taperRatio: number;
  massKg: number;
  speedMps: number;
  altitudeM: number;
  temperatureC: number;
  bankDeg: number;
  cd0?: number;
  oswaldEfficiency?: number;
  clMax?: number;
};

export type AeroStatus = "ok" | "outside-domain" | "stall-risk" | "not-applicable" | "invalid";

export type FixedWingResult = {
  status: AeroStatus;
  applicable: boolean;
  reasons: string[];
  assumptions: string[];
  densityKgM3?: number;
  machNumber?: number;
  wingAreaM2?: number;
  aspectRatio?: number;
  loadFactor?: number;
  requiredCL?: number;
  cd?: number;
  dragN?: number;
  propulsivePowerW?: number;
  stallSpeedMps?: number;
  marginAt1_3VsMps?: number;
  glideRatio?: number;
  turnRadiusM?: number;
};

const GRAVITY_MPS2 = 9.80665;
const AIR_GAS_CONSTANT = 287.05287;
const ISA_SEA_LEVEL_K = 288.15;
const ISA_LAPSE_K_PER_M = 0.0065;
const ISA_SEA_LEVEL_PA = 101_325;
const ISA_PRESSURE_EXPONENT = 5.2558797;
const finite = (value: number) => Number.isFinite(value);

/** Ideal-gas density using tropospheric ISA pressure and supplied ambient temperature. */
export function calculateFixedWingAerodynamics(input: FixedWingInput): FixedWingResult {
  const cd0 = input.cd0 ?? 0.04;
  const oswaldEfficiency = input.oswaldEfficiency ?? 0.8;
  const clMax = input.clMax ?? 1.2;
  const assumptions = [
    `Coefficients par défaut, non étalonnés : CD₀=${cd0}, e=${oswaldEfficiency}, CLmax=${clMax}.`,
    "Aile trapézoïdale équivalente; pression ISA troposphérique avec température ambiante saisie.",
    "Virage coordonné en palier : le facteur de charge 1/cos(φ) est pris en compte dans CL, traînée et Vs.",
    "Puissance propulsive = traînée × vitesse; rendement propulsion, rafales et effets de sol ignorés.",
  ];

  if (input.architecture !== "fixed-wing") {
    return {
      status: "not-applicable",
      applicable: false,
      reasons: ["Modèle applicable uniquement à une voilure fixe; aucune performance aérodynamique n’est présentée comme valide."],
      assumptions,
    };
  }

  const values = [
    input.spanM, input.chordM, input.taperRatio, input.massKg, input.speedMps,
    input.altitudeM, input.temperatureC, input.bankDeg, cd0, oswaldEfficiency, clMax,
  ];
  if (!values.every(finite)) {
    return { status: "invalid", applicable: true, reasons: ["Entrée non finie : fournir uniquement des nombres finis."], assumptions };
  }

  const inDomain =
    input.spanM >= 0.1 && input.spanM <= 100 &&
    input.chordM >= 0.02 && input.chordM <= 30 &&
    input.taperRatio > 0 && input.taperRatio <= 1 &&
    input.massKg >= 0.05 && input.massKg <= 10_000 &&
    input.speedMps >= 0.5 && input.speedMps <= 300 &&
    input.altitudeM >= 0 && input.altitudeM <= 11_000 &&
    input.temperatureC >= -80 && input.temperatureC <= 60 &&
    Math.abs(input.bankDeg) < 80 &&
    cd0 > 0 && cd0 <= 1 &&
    oswaldEfficiency > 0 && oswaldEfficiency <= 1 &&
    clMax > 0 && clMax <= 4;
  if (!inDomain) {
    return {
      status: "outside-domain",
      applicable: true,
      reasons: ["Hors domaine : vérifier géométrie, masse, vitesse, altitude, température, banque et coefficients aérodynamiques saisis."],
      assumptions,
    };
  }

  const isaTemperatureK = ISA_SEA_LEVEL_K - ISA_LAPSE_K_PER_M * input.altitudeM;
  const pressurePa = ISA_SEA_LEVEL_PA * Math.pow(isaTemperatureK / ISA_SEA_LEVEL_K, ISA_PRESSURE_EXPONENT);
  const densityKgM3 = pressurePa / (AIR_GAS_CONSTANT * (input.temperatureC + 273.15));
  const machNumber = input.speedMps / Math.sqrt(1.4 * AIR_GAS_CONSTANT * (input.temperatureC + 273.15));
  const wingAreaM2 = input.spanM * input.chordM * (1 + input.taperRatio) / 2;
  const aspectRatio = input.spanM ** 2 / wingAreaM2;
  const dynamicPressurePa = 0.5 * densityKgM3 * input.speedMps ** 2;
  const bankRad = Math.abs(input.bankDeg) * Math.PI / 180;
  const loadFactor = 1 / Math.cos(bankRad);
  const requiredCL = loadFactor * input.massKg * GRAVITY_MPS2 / (dynamicPressurePa * wingAreaM2);
  const cd = cd0 + requiredCL ** 2 / (Math.PI * oswaldEfficiency * aspectRatio);
  const dragN = dynamicPressurePa * wingAreaM2 * cd;
  const stallSpeedMps = Math.sqrt(
    2 * loadFactor * input.massKg * GRAVITY_MPS2 / (densityKgM3 * wingAreaM2 * clMax),
  );
  const marginAt1_3VsMps = input.speedMps - 1.3 * stallSpeedMps;
  const reasons: string[] = [];
  if (machNumber > 0.3) reasons.push("Mach > 0,3 : compressibilité non modélisée; résultats hors domaine pour cette vitesse.");
  if (requiredCL >= clMax) reasons.push("CL requis atteint ou supérieur au CLmax hypothétique : risque de décrochage.");
  if (marginAt1_3VsMps < 0) reasons.push("Vitesse sous 1,3 × Vs au facteur de charge courant : marge de décrochage insuffisante.");
  if (requiredCL > 2.5 || aspectRatio < 1 || aspectRatio > 40) {
    reasons.push("Condition aérodynamique ou allongement hors domaine indicatif du modèle.");
  }
  const status: AeroStatus = requiredCL >= clMax || marginAt1_3VsMps < 0
    ? "stall-risk"
    : reasons.length
      ? "outside-domain"
      : "ok";
  const turnRadiusM = Math.abs(input.bankDeg) < 0.1
    ? undefined
    : input.speedMps ** 2 / (GRAVITY_MPS2 * Math.tan(bankRad));

  return {
    status,
    applicable: true,
    reasons,
    assumptions,
    densityKgM3,
    machNumber,
    wingAreaM2,
    aspectRatio,
    loadFactor,
    requiredCL,
    cd,
    dragN,
    propulsivePowerW: dragN * input.speedMps,
    stallSpeedMps,
    marginAt1_3VsMps,
    glideRatio: requiredCL / cd,
    turnRadiusM,
  };
}
