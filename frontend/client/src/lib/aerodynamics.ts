/**
 * Aerodynamics — Modélisation aérodynamique avancée pour AeroMind.
 *
 * CAHIER DES CHARGES 2026-10-30 — Optimisation engineering :
 * Ce module fournit les calculs aérodynamiques fondamentaux utilisés
 * par la simulation et l'analyse de mission :
 *   - Atmosphère standard internationale (ISA)
 *   - Nombre de Reynolds et nombre de Mach
 *   - Coefficients de portance (CL) et de traînée (CD)
 *   - Polaire de traînée (drag polar)
 *   - Pression dynamique (q = ½ρV²)
 *   - Charge alaire (W/S) et rapport poussée/poids (T/W)
 *   - Finesse (L/D) et vitesse de décrochage
 *   - Effets de compressibilité (Mach)
 *
 * Toutes les formules sont issues de l'aérodynamique classique et
 * sont utilisées en simulation uniquement — aucun sortie matérielle.
 */

// ═══════════════════════════════════════════════════════════════
// Constantes physiques (SI)
// ═══════════════════════════════════════════════════════════════

/** Accélération gravitationnelle [m/s²] */
export const GRAVITY = 9.80665;

/** Pression atmosphérique standard au niveau de la mer [Pa] */
export const ISA_PRESSURE_SL = 101325;

/** Température atmosphérique standard au niveau de la mer [K] */
export const ISA_TEMP_SL = 288.15;

/** Densité atmosphérique standard au niveau de la mer [kg/m³] */
export const ISA_DENSITY_SL = 1.225;

/** Gradient thermique ISA dans la troposphère [K/m] */
export const ISA_LAPSE_RATE = -0.0065;

/** Constante des gaz parfaits pour l'air [J/(kg·K)] */
export const AIR_GAS_CONSTANT = 287.05;

/** Viscosité cinématique de l'air au niveau de la mer [m²/s] */
export const AIR_VISCOSITY_SL = 1.4607e-5;

/** Rapport de chaleurs massiques (γ = cp/cv) pour l'air */
export const AIR_GAMMA = 1.4;

/** Vitesse du son au niveau de la mer [m/s] */
export const SPEED_OF_SOUND_SL = 340.29;

// ═══════════════════════════════════════════════════════════════
// Atmosphère Standard Internationale (ISA)
// ═══════════════════════════════════════════════════════════════

export interface ISAResult {
  /** Altitude géométrique [m] */
  altitude: number;
  /** Température [K] */
  temperatureK: number;
  /** Température [°C] */
  temperatureC: number;
  /** Pression [Pa] */
  pressurePa: number;
  /** Densité [kg/m³] */
  densityKgM3: number;
  /** Vitesse du son [m/s] */
  speedOfSoundMs: number;
  /** Viscosité cinématique [m²/s] */
  kinematicViscosity: number;
  /** Rapport de densité σ = ρ/ρ₀ (densité relative) */
  densityRatio: number;
}

/**
 * Calcule les propriétés de l'atmosphère standard ISA à une altitude donnée.
 * Valide de 0 à 11 000 m (troposphère).
 *
 * Formules :
 *   T = T₀ + L·h
 *   P = P₀·(T/T₀)^(g/(R·|L|))
 *   ρ = P/(R·T)
 *   a = √(γ·R·T)
 *   μ = μ₀·(T/T₀)^(3/2)·(T₀+S)/(T+S)  (loi de Sutherland, S=110.56 K)
 */
export function computeISAModel(altitude: number): ISAResult {
  const h = Math.max(0, Math.min(altitude, 11000));
  const temperatureK = ISA_TEMP_SL + ISA_LAPSE_RATE * h;
  const temperatureC = temperatureK - 273.15;
  const temperatureRatio = temperatureK / ISA_TEMP_SL;
  const pressurePa = ISA_PRESSURE_SL * Math.pow(temperatureRatio, GRAVITY / (AIR_GAS_CONSTANT * Math.abs(ISA_LAPSE_RATE)));
  const densityKgM3 = pressurePa / (AIR_GAS_CONSTANT * temperatureK);
  const speedOfSoundMs = Math.sqrt(AIR_GAMMA * AIR_GAS_CONSTANT * temperatureK);
  // Loi de Sutherland pour la viscosité dynamique
  const sutherlandConstant = 110.56;
  const dynamicViscosity = 1.716e-5 * Math.pow(temperatureK / 273.15, 1.5) * (273.15 + sutherlandConstant) / (temperatureK + sutherlandConstant);
  const kinematicViscosity = dynamicViscosity / densityKgM3;
  const densityRatio = densityKgM3 / ISA_DENSITY_SL;
  return { altitude: h, temperatureK, temperatureC, pressurePa, densityKgM3, speedOfSoundMs, kinematicViscosity, densityRatio };
}

// ═══════════════════════════════════════════════════════════════
// Reynolds et Mach
// ═══════════════════════════════════════════════════════════════

/**
 * Nombre de Reynolds : Re = ρ·V·L / μ = V·L / ν
 * @param speedMs Vitesse [m/s]
 * @param lengthM Longueur de référence (corde pour une aile) [m]
 * @param densityKgM3 Densité de l'air [kg/m³] (défaut: niveau de la mer)
 * @param viscosity Viscosité cinématique [m²/s] (défaut: niveau de la mer)
 */
export function computeReynoldsNumber(
  speedMs: number,
  lengthM: number,
  densityKgM3: number = ISA_DENSITY_SL,
  viscosity: number = AIR_VISCOSITY_SL,
): number {
  if (speedMs <= 0 || lengthM <= 0 || viscosity <= 0) return 0;
  return (densityKgM3 * speedMs * lengthM) / (densityKgM3 * viscosity);
}

/**
 * Nombre de Mach : M = V / a
 * @param speedMs Vitesse [m/s]
 * @param speedOfSoundMs Vitesse du son [m/s] (défaut: niveau de la mer)
 */
export function computeMachNumber(speedMs: number, speedOfSoundMs: number = SPEED_OF_SOUND_SL): number {
  if (speedOfSoundMs <= 0) return 0;
  return speedMs / speedOfSoundMs;
}

// ═══════════════════════════════════════════════════════════════
// Coefficients aérodynamiques
// ═══════════════════════════════════════════════════════════════

export interface AirfoilCharacteristics {
  /** Coefficient de portance à angle d'attaque nul */
  cl0: number;
  /** Pente de la portance par radian [1/rad] */
  clAlpha: number;
  /** Coefficient de portance maximal */
  clMax: number;
  /** Angle de décrochage [rad] */
  stallAlphaRad: number;
  /** Coefficient de traînée parasite (à portance nulle) */
  cd0: number;
  /** Facteur d'Oswald (efficacité de l'aile, 0.7–0.9 typique) */
  oswaldEfficiency: number;
}

/** Profils aérodynamiques courants (caractéristiques approximatives) */
export const AIRFOIL_PROFILES: Record<string, AirfoilCharacteristics> = {
  "NACA-2412": { cl0: 0.22, clAlpha: 5.73, clMax: 1.52, stallAlphaRad: 0.28, cd0: 0.0065, oswaldEfficiency: 0.85 },
  "NACA-4412": { cl0: 0.38, clAlpha: 5.73, clMax: 1.65, stallAlphaRad: 0.30, cd0: 0.0070, oswaldEfficiency: 0.83 },
  "NACA-0012": { cl0: 0.0, clAlpha: 5.73, clMax: 1.30, stallAlphaRad: 0.27, cd0: 0.0060, oswaldEfficiency: 0.85 },
  "Clark-Y":   { cl0: 0.30, clAlpha: 5.65, clMax: 1.48, stallAlphaRad: 0.28, cd0: 0.0070, oswaldEfficiency: 0.84 },
  "flat-plate": { cl0: 0.0, clAlpha: 5.50, clMax: 0.90, stallAlphaRad: 0.20, cd0: 0.0120, oswaldEfficiency: 0.75 },
};

/**
 * Coefficient de portance CL en fonction de l'angle d'attaque.
 * Utilise le modèle linéaire : CL = CL₀ + CLα · α  (avant décrochage)
 * Après décrochage, CL chute linéairement.
 * @param airfoil Caractéristiques du profil
 * @param alphaRad Angle d'attaque [rad]
 */
export function computeLiftCoefficient(airfoil: AirfoilCharacteristics, alphaRad: number): number {
  const absAlpha = Math.abs(alphaRad);
  const sign = Math.sign(alphaRad);
  if (absAlpha < airfoil.stallAlphaRad) {
    // Zone linéaire
    return airfoil.cl0 + airfoil.clAlpha * alphaRad;
  } else if (absAlpha < airfoil.stallAlphaRad + 0.05) {
    // Zone de décrochage (chute progressive)
    const overshoot = absAlpha - airfoil.stallAlphaRad;
    const clAtStall = airfoil.clMax;
    const clPostStall = airfoil.clMax * (1 - overshoot / 0.05 * 0.3);
    return sign * clPostStall;
  } else {
    // Post-décrochage profond — CL stabilise autour de 0.7·CLmax
    return sign * airfoil.clMax * 0.7;
  }
}

/**
 * Coefficient de traînée CD = CD₀ + CL² / (π · AR · e)
 * (polaire de traînée — équation parabolique)
 * @param cl Coefficient de portance
 * @param cd0 Traînée parasite
 * @param aspectRatio Allongement (b²/S)
 * @param oswald Facteur d'Oswald
 */
export function computeDragCoefficient(
  cl: number,
  cd0: number,
  aspectRatio: number,
  oswald: number,
): number {
  if (aspectRatio <= 0 || oswald <= 0) return cd0;
  const inducedDrag = (cl * cl) / (Math.PI * aspectRatio * oswald);
  // Correction de compressibilité (divergence de Mach)
  return cd0 + inducedDrag;
}

/**
 * Correction de compressibilité (divergence de Mach).
 * Pour M > 0.7, la traînée augmente significativement.
 * Règle empirique : CD_corr = CD · (1 + M⁴ / (1 - M²)) pour M < 0.95
 */
export function applyMachCorrection(cd: number, mach: number): number {
  if (mach >= 0.95) return cd * 3; // Post-divergence
  if (mach < 0.5) return cd; // Pas d'effet
  const correction = 1 + Math.pow(mach, 4) / Math.max(0.01, 1 - mach * mach);
  return cd * Math.min(correction, 3);
}

// ═══════════════════════════════════════════════════════════════
// Grandeurs dérivées
// ═══════════════════════════════════════════════════════════════

/**
 * Pression dynamique : q = ½ · ρ · V²  [Pa]
 */
export function computeDynamicPressure(speedMs: number, densityKgM3: number = ISA_DENSITY_SL): number {
  return 0.5 * densityKgM3 * speedMs * speedMs;
}

/**
 * Charge alaire : W/S = m·g / S  [N/m²]
 * @param massKg Masse totale [kg]
 * @param wingAreaM2 Surface alaire [m²]
 */
export function computeWingLoading(massKg: number, wingAreaM2: number): number {
  if (wingAreaM2 <= 0) return 0;
  return (massKg * GRAVITY) / wingAreaM2;
}

/**
 * Rapport poussée/poids : T/W
 * @param thrustN Poussée totale [N]
 * @param massKg Masse totale [kg]
 */
export function computeThrustToWeightRatio(thrustN: number, massKg: number): number {
  if (massKg <= 0) return 0;
  return thrustN / (massKg * GRAVITY);
}

/**
 * Finesse (rapport portance/traînée) : L/D = CL / CD
 */
export function computeLiftToDragRatio(cl: number, cd: number): number {
  if (cd <= 0) return 0;
  return cl / cd;
}

/**
 * Vitesse de décrochage : Vs = √(2·m·g / (ρ·S·CLmax))
 * @param massKg Masse [kg]
 * @param wingAreaM2 Surface alaire [m²]
 * @param clMax Coefficient de portance max
 * @param densityKgM3 Densité de l'air [kg/m³]
 */
export function computeStallSpeed(
  massKg: number,
  wingAreaM2: number,
  clMax: number,
  densityKgM3: number = ISA_DENSITY_SL,
): number {
  if (wingAreaM2 <= 0 || clMax <= 0 || densityKgM3 <= 0) return 0;
  return Math.sqrt((2 * massKg * GRAVITY) / (densityKgM3 * wingAreaM2 * clMax));
}

/**
 * Portance : L = ½ · ρ · V² · S · CL  [N]
 */
export function computeLift(speedMs: number, densityKgM3: number, wingAreaM2: number, cl: number): number {
  return computeDynamicPressure(speedMs, densityKgM3) * wingAreaM2 * cl;
}

/**
 * Traînée : D = ½ · ρ · V² · S · CD  [N]
 */
export function computeDrag(speedMs: number, densityKgM3: number, wingAreaM2: number, cd: number): number {
  return computeDynamicPressure(speedMs, densityKgM3) * wingAreaM2 * cd;
}

/**
 * Angle d'attaque optimal pour la finesse maximale.
 * En éliminant CL de la polaire parabolique :
 *   CL_opt = √(CD₀ · π · AR · e)
 *   α_opt = (CL_opt - CL₀) / CLα
 */
export function computeOptimalAlphaForGlide(airfoil: AirfoilCharacteristics, aspectRatio: number): number {
  const clOpt = Math.sqrt(airfoil.cd0 * Math.PI * aspectRatio * airfoil.oswaldEfficiency);
  return (clOpt - airfoil.cl0) / airfoil.clAlpha;
}

/**
 * Finesse maximale : (L/D)max = ½ · √(π · AR · e / CD₀)
 */
export function computeMaxGlideRatio(airfoil: AirfoilCharacteristics, aspectRatio: number): number {
  return 0.5 * Math.sqrt((Math.PI * aspectRatio * airfoil.oswaldEfficiency) / airfoil.cd0);
}

// ═══════════════════════════════════════════════════════════════
// Interface de haut niveau — analyse aérodynamique complète
// ═══════════════════════════════════════════════════════════════

export interface AerodynamicConfig {
  massKg: number;
  wingAreaM2: number;
  wingspanM: number;
  chordM: number;
  cruiseSpeedKmh: number;
  altitudeM: number;
  airfoilProfile?: string;
}

export interface AerodynamicAnalysis {
  // Conditions de vol
  speedMs: number;
  machNumber: number;
  reynoldsNumber: number;
  isa: ISAResult;
  // Coefficients
  liftCoefficient: number;
  dragCoefficient: number;
  liftToDragRatio: number;
  maxGlideRatio: number;
  optimalAlphaDeg: number;
  // Forces
  liftN: number;
  dragN: number;
  thrustRequiredN: number;
  // Grandeurs dérivées
  dynamicPressurePa: number;
  wingLoadingNm2: number;
  stallSpeedMs: number;
  stallSpeedKmh: number;
  aspectRatio: number;
  // Évaluation
  aboveStall: boolean;
  thrustMargin: number;
}

/**
 * Analyse aérodynamique complète d'une configuration de drone.
 * Calcule tous les coefficients, forces et grandeurs dérivées
 * pour la configuration et les conditions de vol données.
 */
export function analyzeAerodynamics(config: AerodynamicConfig): AerodynamicAnalysis {
  const airfoil = AIRFOIL_PROFILES[config.airfoilProfile ?? "NACA-2412"] ?? AIRFOIL_PROFILES["NACA-2412"];
  const speedMs = Math.max(0, config.cruiseSpeedKmh / 3.6);
  const isa = computeISAModel(config.altitudeM);
  const machNumber = computeMachNumber(speedMs, isa.speedOfSoundMs);
  const reynoldsNumber = computeReynoldsNumber(speedMs, config.chordM, isa.densityKgM3, isa.kinematicViscosity);
  const aspectRatio = config.wingAreaM2 > 0 ? (config.wingspanM * config.wingspanM) / config.wingAreaM2 : 0;

  // Angle d'attaque optimal pour la finesse max
  const optimalAlphaRad = computeOptimalAlphaForGlide(airfoil, aspectRatio);
  const optimalAlphaDeg = optimalAlphaRad * 180 / Math.PI;

  // Coefficients à l'alpha optimal
  const liftCoefficient = computeLiftCoefficient(airfoil, optimalAlphaRad);
  let dragCoefficient = computeDragCoefficient(liftCoefficient, airfoil.cd0, aspectRatio, airfoil.oswaldEfficiency);
  dragCoefficient = applyMachCorrection(dragCoefficient, machNumber);

  const liftToDragRatio = computeLiftToDragRatio(liftCoefficient, dragCoefficient);
  const maxGlideRatio = computeMaxGlideRatio(airfoil, aspectRatio);

  // Forces
  const dynamicPressurePa = computeDynamicPressure(speedMs, isa.densityKgM3);
  const liftN = computeLift(speedMs, isa.densityKgM3, config.wingAreaM2, liftCoefficient);
  const dragN = computeDrag(speedMs, isa.densityKgM3, config.wingAreaM2, dragCoefficient);
  const thrustRequiredN = dragN;

  // Grandeurs dérivées
  const wingLoadingNm2 = computeWingLoading(config.massKg, config.wingAreaM2);
  const stallSpeedMs = computeStallSpeed(config.massKg, config.wingAreaM2, airfoil.clMax, isa.densityKgM3);
  const stallSpeedKmh = stallSpeedMs * 3.6;

  // Évaluation
  const aboveStall = speedMs > stallSpeedMs * 1.1;
  const weightN = config.massKg * GRAVITY;
  const thrustMargin = liftN > 0 ? (liftN - weightN) / weightN * 100 : 0;

  return {
    speedMs, machNumber, reynoldsNumber, isa,
    liftCoefficient, dragCoefficient, liftToDragRatio, maxGlideRatio, optimalAlphaDeg,
    liftN, dragN, thrustRequiredN,
    dynamicPressurePa, wingLoadingNm2, stallSpeedMs, stallSpeedKmh, aspectRatio,
    aboveStall, thrustMargin,
  };
}
