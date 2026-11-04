import {
  calculateFixedWingAerodynamics,
  standardAtmospherePressurePa,
  type FixedWingResult,
} from "./fixedWingAerodynamics";

export type AirframeKind = "fixed-wing" | "multirotor" | "vtol";
export type TurbulenceModel = "laminar" | "k-epsilon" | "k-omega-sst";
export type CalculationType = "steady-incompressible" | "transient-incompressible";
export type AerodynamicParameters = {
  speedMps: number;
  flowDirectionDeg: number;
  altitudeM: number;
  temperatureC: number;
  pressurePa: number;
  pressureMode: "isa" | "manual";
  massKg: number;
  wingspanM: number;
  chordM: number;
  taperRatio: number;
  angleOfAttackDeg: number;
  bankDeg: number;
  cd0: number;
  oswaldEfficiency: number;
  clMax: number;
  viscosityPaS: number;
  turbulenceModel: TurbulenceModel;
  calculationType: CalculationType;
  rotorCount: number;
  rotorDiameterM: number;
  meshCellSizeMm: number;
  meshRefinement: "coarse" | "standard" | "fine";
  inletBoundary: string;
  outletBoundary: string;
};

export type MeshBoundsM = { x: number; y: number; z: number };

export type PerformanceEstimate = {
  status: "estimate" | "not-applicable" | "invalid";
  sourceLabel: "MODÈLE ANALYTIQUE SIMPLIFIÉ";
  densityKgM3?: number;
  dynamicPressurePa?: number;
  liftN?: number;
  dragN?: number;
  liftDragRatio?: number;
  powerW?: number;
  fixedWing?: FixedWingResult;
  rotorIdealHoverPowerW?: number;
  warnings: string[];
  assumptions: string[];
};

export type LocalScenario = {
  id: string;
  name: string;
  airframe: AirframeKind;
  parameters: AerodynamicParameters;
  createdAt: string;
  provenance: "local-user-scenario";
};

export type LocalRun = {
  id: string;
  modelName: string;
  modelVersion: string;
  createdAt: string;
  elapsedMs: number;
  solver: "ANALYTIC MODEL — NO CFD SOLVER";
  mesh: "NOT GENERATED — ESTIMATION ONLY";
  initialConditions: string;
  convergence: "NOT APPLICABLE — NO CFD RUN";
  status: "ANALYTIC ESTIMATE";
  performance: PerformanceEstimate;
  parameters: AerodynamicParameters;
  limitations: string[];
};

const AIR_GAS_CONSTANT = 287.05287;
const GRAVITY = 9.80665;
const finite = (value: number) => Number.isFinite(value);

export function defaultAerodynamicParameters(config: {
  cruiseSpeedKmh?: number;
  altitudeM?: number;
  wingspan?: number;
  chord?: number;
  maxTakeoffKg?: number;
  airframe?: string;
  motorCount?: number;
  propDiameter?: number;
}): { airframe: AirframeKind; parameters: AerodynamicParameters; isDemonstration: boolean } {
  const speed = Number(config.cruiseSpeedKmh) > 0 ? Number(config.cruiseSpeedKmh) / 3.6 : 22;
  const span = Number(config.wingspan) > 0 ? Number(config.wingspan) : 2.4;
  const chord = Number(config.chord) > 0 ? Number(config.chord) : 0.34;
  const mass = Number(config.maxTakeoffKg) > 0 ? Number(config.maxTakeoffKg) : 8.4;
  const altitude = Number(config.altitudeM) || 0;
  const airframe: AirframeKind = config.airframe === "fixed-wing"
    ? "fixed-wing"
    : config.airframe === "vtol"
      ? "vtol"
      : config.airframe === "quadcopter"
        ? "multirotor"
        : "fixed-wing";
  const isDemonstration = !(Number(config.cruiseSpeedKmh) > 0 && Number(config.wingspan) > 0 && Number(config.chord) > 0 && Number(config.maxTakeoffKg) > 0 && Boolean(config.airframe));
  return {
    airframe,
    isDemonstration,
    parameters: {
      speedMps: speed,
      flowDirectionDeg: 0,
      altitudeM: altitude,
      temperatureC: 15,
      pressurePa: standardAtmospherePressurePa(altitude) ?? 101325,
      pressureMode: "isa",
      massKg: mass,
      wingspanM: span,
      chordM: chord,
      taperRatio: 0.65,
      angleOfAttackDeg: 3,
      bankDeg: 0,
      cd0: 0.04,
      oswaldEfficiency: 0.8,
      clMax: 1.2,
      viscosityPaS: 1.81e-5,
      turbulenceModel: "k-omega-sst",
      calculationType: "steady-incompressible",
      rotorCount: Math.max(1, Math.round(Number(config.motorCount) || 4)),
      rotorDiameterM: Number(config.propDiameter) > 0 ? Number(config.propDiameter) : 0.36,
      meshCellSizeMm: 12,
      meshRefinement: "standard",
      inletBoundary: "Vitesse uniforme — profil incompressible",
      outletBoundary: "Pression statique de référence",
    },
  };
}

export function calculateAirDensity(pressurePa: number, temperatureC: number): number | null {
  if (!finite(pressurePa) || !finite(temperatureC) || pressurePa <= 0 || temperatureC <= -273.15) return null;
  const density = pressurePa / (AIR_GAS_CONSTANT * (temperatureC + 273.15));
  return finite(density) && density > 0 ? density : null;
}

export function estimateAerodynamicPerformance(
  airframe: AirframeKind,
  parameters: AerodynamicParameters,
): PerformanceEstimate {
  const values = Object.values(parameters).filter((value): value is number => typeof value === "number");
  if (!values.every(finite)) {
    return {
      status: "invalid",
      sourceLabel: "MODÈLE ANALYTIQUE SIMPLIFIÉ",
      warnings: ["Entrée non numérique ou non finie; aucun résultat n’est calculé."],
      assumptions: ["Calcul local déterministe; aucun solveur CFD ni maillage exécuté."],
    };
  }
  const density = calculateAirDensity(parameters.pressurePa, parameters.temperatureC);
  if (!density || parameters.speedMps <= 0 || parameters.massKg <= 0) {
    return {
      status: "invalid",
      sourceLabel: "MODÈLE ANALYTIQUE SIMPLIFIÉ",
      warnings: ["La vitesse, la masse, la pression ou la température doit être valide et positive."],
      assumptions: ["Calcul local déterministe; aucun solveur CFD ni maillage exécuté."],
    };
  }
  const dynamicPressure = 0.5 * density * parameters.speedMps ** 2;
  if (airframe !== "fixed-wing") {
    const diskArea = Math.PI * (parameters.rotorDiameterM / 2) ** 2;
    const count = Math.max(1, Math.round(parameters.rotorCount));
    const totalIdealPower = parameters.rotorDiameterM > 0
      ? (parameters.massKg * GRAVITY) ** 1.5 / Math.sqrt(2 * density * diskArea * count)
      : undefined;
    return {
      status: "estimate",
      sourceLabel: "MODÈLE ANALYTIQUE SIMPLIFIÉ",
      densityKgM3: density,
      dynamicPressurePa: dynamicPressure,
      rotorIdealHoverPowerW: totalIdealPower,
      warnings: [
        "Estimation théorique de disque actuateur en vol stationnaire idéal; ce n’est ni un calcul CFD ni une caractérisation d’hélice.",
        "Pertes de profil, interaction entre rotors, effet du fuselage, rendement moteur, contrôleur et régime transitoire non modélisés.",
      ],
      assumptions: [
        `Disques idéaux, poussée répartie sur ${count} rotor(s), air incompressible et stationnaire.`,
        `Température ${parameters.temperatureC} °C et ${parameters.pressureMode === "isa" ? `pression ISA à ${parameters.altitudeM} m (${parameters.pressurePa} Pa)` : `pression statique manuelle (${parameters.pressurePa} Pa)`} utilisées pour la densité du gaz parfait.`,
      ],
    };
  }
  const fixedWing = calculateFixedWingAerodynamics({
    architecture: "fixed-wing",
    spanM: parameters.wingspanM,
    chordM: parameters.chordM,
    taperRatio: parameters.taperRatio,
    massKg: parameters.massKg,
    speedMps: parameters.speedMps,
    altitudeM: parameters.altitudeM,
    temperatureC: parameters.temperatureC,
    bankDeg: parameters.bankDeg,
    cd0: parameters.cd0,
    oswaldEfficiency: parameters.oswaldEfficiency,
    clMax: parameters.clMax,
    pressurePa: parameters.pressureMode === "isa" ? undefined : parameters.pressurePa,
  });
  if (fixedWing.status === "invalid" || fixedWing.status === "outside-domain" || fixedWing.status === "stall-risk") {
    return {
      status: fixedWing.status === "invalid" ? "invalid" : "estimate",
      sourceLabel: "MODÈLE ANALYTIQUE SIMPLIFIÉ",
      densityKgM3: fixedWing.densityKgM3,
      dynamicPressurePa: dynamicPressure,
      liftN: fixedWing.requiredCL !== undefined && fixedWing.wingAreaM2 ? fixedWing.requiredCL * dynamicPressure * fixedWing.wingAreaM2 : undefined,
      dragN: fixedWing.dragN,
      liftDragRatio: fixedWing.glideRatio,
      powerW: fixedWing.propulsivePowerW,
      fixedWing,
      warnings: [...fixedWing.reasons, "Les coefficients aérodynamiques sont indicatifs et ne remplacent pas un solveur CFD ni un essai."],
      assumptions: fixedWing.assumptions,
    };
  }
  return {
    status: fixedWing.applicable ? "estimate" : "not-applicable",
    sourceLabel: "MODÈLE ANALYTIQUE SIMPLIFIÉ",
    densityKgM3: fixedWing.densityKgM3,
    dynamicPressurePa: dynamicPressure,
    liftN: fixedWing.requiredCL !== undefined && fixedWing.wingAreaM2 ? fixedWing.requiredCL * dynamicPressure * fixedWing.wingAreaM2 : undefined,
    dragN: fixedWing.dragN,
    liftDragRatio: fixedWing.glideRatio,
    powerW: fixedWing.propulsivePowerW,
    fixedWing,
    warnings: ["Aile équivalente et coefficients non étalonnés; estimation indicative seulement."],
    assumptions: fixedWing.assumptions,
  };
}

export function estimateMeshWork(bounds: MeshBoundsM, parameters: AerodynamicParameters) {
  if (![bounds.x, bounds.y, bounds.z, parameters.meshCellSizeMm].every(finite) || Math.min(bounds.x, bounds.y, bounds.z, parameters.meshCellSizeMm) <= 0) return null;
  const sizeM = parameters.meshCellSizeMm / 1000;
  const padding = 2.5;
  const box = { x: bounds.x * padding, y: bounds.y * padding, z: bounds.z * padding };
  const cells = Math.ceil(box.x / sizeM) * Math.ceil(box.y / sizeM) * Math.ceil(box.z / sizeM);
  if (!Number.isSafeInteger(cells) || cells < 1) return null;
  const refinementFactor = parameters.meshRefinement === "fine" ? 4 : parameters.meshRefinement === "standard" ? 2 : 1;
  const estimatedCells = Math.round(cells * refinementFactor);
  return {
    estimatedCells,
    estimatedRamGb: Math.round(estimatedCells * 260 / 1_000_000_000 * 10) / 10,
    domainM: box,
    status: "ESTIMATION — MAILLAGE NON GÉNÉRÉ" as const,
  };
}

export function createLocalRun(input: {
  modelName: string;
  modelVersion: string;
  elapsedMs: number;
  initialConditions: string;
  performance: PerformanceEstimate;
  parameters: AerodynamicParameters;
}): LocalRun {
  return {
    id: `AERO-EST-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    modelName: input.modelName || "Modèle non nommé",
    modelVersion: input.modelVersion || "Version locale non validée",
    createdAt: new Date().toISOString(),
    elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
    solver: "ANALYTIC MODEL — NO CFD SOLVER",
    mesh: "NOT GENERATED — ESTIMATION ONLY",
    initialConditions: input.initialConditions,
    convergence: "NOT APPLICABLE — NO CFD RUN",
    status: "ANALYTIC ESTIMATE",
    performance: input.performance,
    parameters: { ...input.parameters },
    limitations: [
      "Aucun solveur CFD réel n’est installé ou raccordé dans cet environnement.",
      "Aucun maillage numérique n’a été généré ni aucun calcul convergé.",
      "Les coefficients et hypothèses du modèle analytique ne sont pas des mesures ni une validation expérimentale.",
    ],
  };
}

export function makeOpenFoamHandoff(input: {
  modelName: string;
  modelVersion: string;
  geometryFileName?: string;
  geometrySha256?: string;
  geometryDecoded?: boolean;
  airframe: AirframeKind;
  parameters: AerodynamicParameters;
  preparedAt?: string;
}) {
  return {
    documentType: "AEROMIND_OPENFOAM_HANDOFF_MANIFEST",
    schemaVersion: 1,
    preparedAt: input.preparedAt ?? new Date().toISOString(),
    state: "PREPARATION_ONLY_SOLVER_NOT_CONNECTED",
    model: { name: input.modelName, version: input.modelVersion },
    geometry: {
      fileName: input.geometryFileName ?? null,
      sha256: input.geometrySha256 ?? null,
      decoded: input.geometryDecoded === true,
    },
    solver: { expected: "OpenFOAM", executableDetected: false, externalService: null },
    requestedCase: {
      airframe: input.airframe,
      altitudeM: input.parameters.altitudeM,
      pressureMode: input.parameters.pressureMode,
      calculationType: input.parameters.calculationType,
      turbulenceModel: input.parameters.turbulenceModel,
      inlet: input.parameters.inletBoundary,
      outlet: input.parameters.outletBoundary,
      speedMps: input.parameters.speedMps,
      flowDirectionDeg: input.parameters.flowDirectionDeg,
      temperatureC: input.parameters.temperatureC,
      pressurePa: input.parameters.pressurePa,
      densityKgM3: calculateAirDensity(input.parameters.pressurePa, input.parameters.temperatureC),
      viscosityPaS: input.parameters.viscosityPaS,
    },
    result: null,
    mesh: null,
    convergence: null,
    note: "Ce manifeste documente une demande de raccordement. Il ne constitue pas un dossier de cas OpenFOAM exécutable et ne contient aucun résultat CFD.",
  };
}

export function reportMarkdown(run: LocalRun, geometryName?: string) {
  const performance = run.performance;
  return [
    "# Rapport aérodynamique AeroMind",
    "",
    `- Identifiant : ${run.id}`,
    `- Type de résultat : ${run.status}`,
    `- Modèle : ${run.modelName} (${run.modelVersion})`,
    `- Géométrie source : ${geometryName ?? "non fournie"}`,
    `- Date : ${run.createdAt}`,
    `- Temps local de calcul analytique : ${run.elapsedMs} ms`,
    `- Solveur : ${run.solver}`,
    `- Maillage : ${run.mesh}`,
    `- Convergence : ${run.convergence}`,
    "",
    "## Paramètres et conditions",
    "",
    ...Object.entries(run.parameters).map(([key, value]) => `- ${key} : ${value}`),
    "",
    "## Valeurs disponibles — estimation analytique simplifiée",
    "",
    `- Densité : ${performance.densityKgM3?.toFixed(4) ?? "indisponible"} kg/m³`,
    `- Pression dynamique : ${performance.dynamicPressurePa?.toFixed(2) ?? "indisponible"} Pa`,
    `- Portance indicative : ${performance.liftN?.toFixed(2) ?? "indisponible"} N`,
    `- Traînée indicative : ${performance.dragN?.toFixed(2) ?? "indisponible"} N`,
    `- Rapport portance/traînée : ${performance.liftDragRatio?.toFixed(2) ?? "indisponible"}`,
    `- Puissance indicative : ${performance.powerW?.toFixed(2) ?? performance.rotorIdealHoverPowerW?.toFixed(2) ?? "indisponible"} W`,
    "",
    "## Hypothèses, incertitudes et limites",
    "",
    ...performance.assumptions.map(item => `- ${item}`),
    ...performance.warnings.map(item => `- Avertissement : ${item}`),
    ...run.limitations.map(item => `- Limite : ${item}`),
    "",
    "Ce rapport ne contient pas de simulation CFD, de maillage résolu, de convergence, de mesure expérimentale ni de certification.",
    "",
  ].join("\n");
}

export const AERODYNAMIC_SCENARIOS_KEY = "aeromind-aero-cfd-scenarios-v1";
export const AERODYNAMIC_HISTORY_KEY = "aeromind-aero-cfd-history-v1";
