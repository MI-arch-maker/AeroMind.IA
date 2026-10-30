/**
 * AeroMind · flux de simulation continue (poste de commandement de vol).
 *
 * Ce module alimente l'animation temps réel de l'horizon artificiel et des
 * graphiques de télémétrie. Il reste purement logiciel : aucun ordre n'est
 * envoyé, aucun actionneur n'est piloté et aucune donnée n'est présentée comme
 * une mesure physique. L'état produit est déterministe pour un même pas de
 * temps, ce qui permet de le tester sans navigateur.
 */

export type LiveFlightPhase = "standby" | "preflight" | "cruise" | "returning";

export type LiveTelemetrySample = {
  /** Temps de vol simulé, en secondes. */
  t: number;
  altitudeM: number;
  speedKmh: number;
  headingDeg: number;
  batteryPct: number;
  powerW: number;
  verticalSpeedMs: number;
  vibrationG: number;
  linkQualityPct: number;
  temperatureC: number;
  pitchDeg: number;
  rollDeg: number;
};

export type LiveFlightParams = {
  cruiseSpeedKmh: number;
  designAltitudeM: number;
  batteryWh: number;
  payloadKg: number;
  motorCount: number;
  reserveFraction?: number;
  initialBatteryPct?: number;
};

export type LiveFlightState = {
  /** Temps de vol simulé cumulé. */
  elapsedS: number;
  armed: boolean;
  phase: LiveFlightPhase;
  pitchDeg: number;
  rollDeg: number;
  yawDeg: number;
  headingDeg: number;
  altitudeM: number;
  speedKmh: number;
  verticalSpeedMs: number;
  batteryPct: number;
  powerW: number;
  vibrationG: number;
  linkQualityPct: number;
  temperatureC: number;
  /** Tampon circulaire borné alimentant les graphiques défilants. */
  samples: LiveTelemetrySample[];
  /** Accumulateur interne : une trame est échantillonnée par `SAMPLE_INTERVAL_S`. */
  accumulatorS: number;
};

export const LIVE_HISTORY_LIMIT = 180;
export const SAMPLE_INTERVAL_S = 0.25;
/**
 * Facteur d'accélération de démonstration appliqué à la décharge en vol : il
 * rend la pente lisible sur un graphique de quelques minutes sans jamais
 * prétendre mesurer une consommation réelle de batterie.
 */
export const DEMO_TIME_SCALE = 6;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const round = (value: number, digits = 3) =>
  Number(value.toFixed(digits));
const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

const safe = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

export function normalizeLiveParams(
  params: Partial<LiveFlightParams> | undefined
): LiveFlightParams {
  // Les grandeurs non renseignées restent à zéro : le simulateur ne doit pas
  // inventer une capacité, un plafond ou une charge que l'opérateur n'a pas
  // saisis. Les seules valeurs de repli concernent la propulsion.
  return {
    cruiseSpeedKmh: clamp(safe(Number(params?.cruiseSpeedKmh), 0), 0, 220),
    designAltitudeM: clamp(safe(Number(params?.designAltitudeM), 0), 0, 600),
    batteryWh: clamp(safe(Number(params?.batteryWh), 0), 0, 4000),
    payloadKg: clamp(safe(Number(params?.payloadKg), 0), 0, 30),
    motorCount: clamp(Math.round(safe(Number(params?.motorCount), 4)), 1, 12),
    reserveFraction: clamp(safe(Number(params?.reserveFraction), 0.15), 0, 0.6),
    initialBatteryPct: clamp(safe(Number(params?.initialBatteryPct), 100), 1, 100),
  };
}

/** Altitude de croisière atteignable, bornée par le plafond de conception. */
export function cruiseAltitudeTarget(params: LiveFlightParams): number {
  const ceiling = params.designAltitudeM > 0 ? params.designAltitudeM : 120;
  return round(clamp(ceiling * 0.72, 15, 420), 1);
}

/**
 * Vrai lorsque la cible affichée provient des valeurs par défaut du simulateur
 * et non d'une configuration de cellule renseignée par l'opérateur.
 */
export function usesSimulationDefaults(
  params: Partial<LiveFlightParams> | undefined
): boolean {
  const normalized = normalizeLiveParams(params);
  return (
    (params?.cruiseSpeedKmh ?? 0) <= 0 ||
    (params?.designAltitudeM ?? 0) <= 0 ||
    normalized.batteryWh <= 0
  );
}

/** Vrai si une capacité énergétique exploitable a été renseignée. */
export function hasEnergyBudget(
  params: Partial<LiveFlightParams> | undefined
): boolean {
  return (params?.batteryWh ?? 0) > 0;
}

/** Vitesse cible en croisière simulée, bornée par la vitesse paramétrée. */
export function cruiseSpeedTarget(params: LiveFlightParams): number {
  return round(clamp(params.cruiseSpeedKmh * 0.92, 6, 180), 1);
}

/**
 * Puissance instantanée estimée (W) : composante de sustentation liée à la
 * configuration, puis composante de translation liée au vent relatif. Modèle
 * d'avant-projet, jamais une mesure moteur.
 */
export function estimatedPowerW(
  params: LiveFlightParams,
  speedKmh: number,
  verticalSpeedMs: number
): number {
  const liftFactor = 78 + params.payloadKg * 19;
  const hoverW = params.motorCount * liftFactor * 0.62;
  const speedRatio = clamp(speedKmh / Math.max(12, cruiseSpeedTarget(params)), 0, 2.4);
  const translationW = hoverW * 0.34 * speedRatio;
  const climbW = clamp(verticalSpeedMs, -6, 6) * params.motorCount * 26;
  return round(clamp(hoverW + translationW + climbW, 0, 9000), 0);
}

/** Consommation moyenne (% de batterie par seconde) pour la charge courante. */
export function batteryDrainPerSecond(
  params: LiveFlightParams,
  powerW: number,
  armed: boolean
): number {
  // Sans capacité renseignée, aucune décharge n'est simulée : afficher une
  // pente serait une invention de mesure.
  if (!(params.batteryWh > 0)) return 0;
  const usableWh = Math.max(1, params.batteryWh * 0.86);
  const standbyW = 12 + params.motorCount * 1.6;
  const effectiveW = armed ? powerW : standbyW;
  // 3600 s/h converti en pourcentage de la capacité utile.
  return (effectiveW / usableWh) * (100 / 3600);
}

export function createLiveFlightState(
  rawParams: Partial<LiveFlightParams> | undefined
): LiveFlightState {
  const params = normalizeLiveParams(rawParams);
  const initialState: LiveFlightState = {
    elapsedS: 0,
    armed: false,
    phase: "standby",
    pitchDeg: 0,
    rollDeg: 0,
    yawDeg: 0,
    headingDeg: 0,
    altitudeM: 0,
    speedKmh: 0,
    verticalSpeedMs: 0,
    batteryPct: params.initialBatteryPct ?? 100,
    powerW: estimatedPowerW(params, 0, 0),
    vibrationG: 0,
    linkQualityPct: 0,
    temperatureC: 21.5,
    samples: [],
    accumulatorS: 0,
  };
  // Exposer une première trame dès le montage évite un cluster vide avant le
  // premier tick de simulation.
  initialState.samples = [sample(initialState)];
  return initialState;
}

function sample(state: LiveFlightState): LiveTelemetrySample {
  return {
    t: round(state.elapsedS, 2),
    altitudeM: round(state.altitudeM, 2),
    speedKmh: round(state.speedKmh, 2),
    headingDeg: round(((state.headingDeg % 360) + 360) % 360, 1),
    batteryPct: round(state.batteryPct, 2),
    powerW: round(state.powerW, 0),
    verticalSpeedMs: round(state.verticalSpeedMs, 2),
    vibrationG: round(state.vibrationG, 4),
    linkQualityPct: round(state.linkQualityPct, 1),
    temperatureC: round(state.temperatureC, 1),
    pitchDeg: round(state.pitchDeg, 1),
    rollDeg: round(state.rollDeg, 1),
  };
}

/** Arme ou désarme le scénario local : l'état global de l'interface suit. */
export function setLiveArmed(
  state: LiveFlightState,
  armed: boolean,
  rawParams: Partial<LiveFlightParams> | undefined
): LiveFlightState {
  const params = normalizeLiveParams(rawParams);
  return {
    ...state,
    armed,
    phase: armed ? "preflight" : "standby",
    speedKmh: armed ? state.speedKmh : 0,
    verticalSpeedMs: armed ? state.verticalSpeedMs : 0,
    powerW: estimatedPowerW(params, armed ? state.speedKmh : 0, 0),
    vibrationG: armed ? state.vibrationG : 0,
    linkQualityPct: armed ? Math.max(state.linkQualityPct, 72) : 0,
    accumulatorS: 0,
  };
}

/**
 * Avance le flux de simulation de `dtS` secondes. La fonction est pure : le
 * même état d'entrée produit toujours le même état de sortie.
 */
export function advanceLiveFlight(
  state: LiveFlightState,
  dtS: number,
  rawParams: Partial<LiveFlightParams> | undefined
): LiveFlightState {
  const params = normalizeLiveParams(rawParams);
  const dt = clamp(safe(Number(dtS), 0), 0, 1.5);
  if (dt <= 0) return state;
  const elapsedS = state.elapsedS + dt;
  const t = elapsedS;

  const altitudeTarget = state.armed ? cruiseAltitudeTarget(params) : 0;
  const nextAltitude = damp(state.altitudeM, altitudeTarget, state.armed ? 0.34 : 0.5, dt);
  const verticalSpeedMs = clamp((nextAltitude - state.altitudeM) / dt, -6, 6);

  const speedTarget = state.armed ? cruiseSpeedTarget(params) : 0;
  const nextSpeed = damp(state.speedKmh, speedTarget, state.armed ? 0.5 : 0.65, dt);

  // Attitude : oscillation de vol en charge, retour au niveau à l'arrêt.
  const nextPitch = state.armed
    ? -2.6 + Math.sin(t * 0.41) * 3.4 + Math.sin(t * 1.27) * 0.7
    : damp(state.pitchDeg, 0, 2.4, dt);
  const nextRoll = state.armed
    ? Math.sin(t * 0.27) * 11.5 + Math.sin(t * 0.83) * 2.1
    : damp(state.rollDeg, 0, 2.4, dt);
  const nextYaw = state.armed
    ? state.yawDeg + dt * (6.4 + Math.sin(t * 0.19) * 3.2)
    : state.yawDeg;

  const headingDeg = state.armed ? 118 + nextYaw * 1.35 : ((state.headingDeg % 360) + 360) % 360;

  const powerW = estimatedPowerW(params, nextSpeed, verticalSpeedMs);
  const drain = batteryDrainPerSecond(params, powerW, state.armed);
  const floorPct = params.reserveFraction ? params.reserveFraction * 100 : 15;
  const nextBattery = clamp(
    state.batteryPct - drain * dt * (state.armed ? DEMO_TIME_SCALE : 1),
    floorPct,
    100
  );

  const vibrationG = state.armed
    ? round(clamp(0.028 + Math.abs(Math.sin(t * 1.9)) * 0.021 + nextSpeed / 9000, 0, 0.12), 4)
    : 0;
  const linkQualityPct = state.armed
    ? round(clamp(94 - Math.abs(Math.sin(t * 0.11)) * 9 + nextAltitude / 120, 55, 100), 1)
    : 0;
  const temperatureC = round(
    damp(state.temperatureC, state.armed ? 38.5 : 24, 0.045, dt),
    1
  );

  const phase: LiveFlightPhase =
    !state.armed
      ? "standby"
      : nextAltitude < cruiseAltitudeTarget(params) * 0.55
        ? "preflight"
        : "cruise";

  const next: LiveFlightState = {
    ...state,
    elapsedS,
    phase,
    altitudeM: nextAltitude,
    speedKmh: nextSpeed,
    verticalSpeedMs,
    pitchDeg: round(nextPitch, 2),
    rollDeg: round(nextRoll, 2),
    yawDeg: nextYaw,
    headingDeg,
    batteryPct: nextBattery,
    powerW,
    vibrationG,
    linkQualityPct,
    temperatureC,
  };

  const accumulatorS = state.accumulatorS + dt;
  if (accumulatorS >= SAMPLE_INTERVAL_S) {
    const kept = [
      ...state.samples,
      ...Array.from({ length: Math.floor(accumulatorS / SAMPLE_INTERVAL_S) }, () =>
        sample(next)
      ),
    ];
    next.samples = kept.slice(-LIVE_HISTORY_LIMIT);
    next.accumulatorS = accumulatorS % SAMPLE_INTERVAL_S;
  } else {
    next.samples = state.samples;
    next.accumulatorS = accumulatorS;
  }
  return next;
}

export function liveSeries(
  samples: LiveTelemetrySample[],
  key: keyof Omit<LiveTelemetrySample, "t">
): number[] {
  return samples.map(item => item[key]);
}

export function liveSeriesRange(values: number[]): {
  min: number;
  max: number;
  last: number;
} {
  if (!values.length) return { min: 0, max: 0, last: 0 };
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    last: values[values.length - 1],
  };
}

export function describeLivePhase(state: LiveFlightState): string {
  if (!state.armed) return "DÉSARMÉ · BANC AU SOL";
  if (state.phase === "preflight") return "MISE EN ROUTE VIRTUELLE";
  if (state.phase === "returning") return "RETOUR VERS ZONE SÛRE";
  return "CROISIÈRE SIMULÉE";
}
