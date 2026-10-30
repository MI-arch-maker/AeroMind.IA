/**
 * GuidanceOptimization — Algorithmes de guidage et optimisation de trajectoire.
 *
 * CAHIER DES CHARGES 2026-10-30 — Optimisation engineering :
 * Ce module fournit les algorithmes de guidage avancés pour la
 * planification et l'exécution de mission :
 *   - Interpolation par spline cubique (trajectoire lissée)
 *   - Chemins de Dubins (distance minimale avec rayon de virage)
 *   - Correcteur PID pour le suivi de trajectoire
 *   - Profil de vitesse optimisé (accélération/décélération)
 *   - Compensation de vent (correction de cap)
 *   - Contraintes de rayon de virage (virages banked)
 *
 * Tous les calculs sont en simulation uniquement.
 */

// ═══════════════════════════════════════════════════════════════
// Types de base
// ═══════════════════════════════════════════════════════════════

export interface GeoPoint {
  lat: number;
  lng: number;
  altM: number;
}

export interface TrajectoryPoint extends GeoPoint {
  /** Cap à ce point [deg] */
  headingDeg: number;
  /** Vitesse recommandée à ce point [km/h] */
  speedKmh: number;
  /** Distance cumulée depuis le départ [m] */
  cumulativeDistanceM: number;
  /** Temps estimé d'arrivée à ce point [s] */
  estimatedTimeS: number;
}

export interface OptimizedTrajectory {
  points: TrajectoryPoint[];
  totalDistanceM: number;
  totalTimeS: number;
  averageSpeedKmh: number;
  maxSpeedKmh: number;
  minSpeedKmh: number;
  turnCount: number;
  smoothnessScore: number;
}

// ═══════════════════════════════════════════════════════════════
// Outils géométriques
// ═══════════════════════════════════════════════════════════════

const EARTH_RADIUS_M = 6371000;

/** Distance haversine entre deux points géographiques [m] */
export function haversineMeters(p1: GeoPoint, p2: GeoPoint): number {
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((p1.lat * Math.PI) / 180) * Math.cos((p2.lat * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Cap (bearing) entre deux points [deg, 0=Nord, sens horaire] */
export function computeBearingDeg(p1: GeoPoint, p2: GeoPoint): number {
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** Différence angulaire entre deux caps [deg], normalisée [-180, +180] */
export function headingDifference(h1: number, h2: number): number {
  let diff = h2 - h1;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

// ═══════════════════════════════════════════════════════════════
// Interpolation par spline cubique (Catmull-Rom)
// ═══════════════════════════════════════════════════════════════

/**
 * Interpolation Catmull-Rom entre 4 points de contrôle.
 * Produit une courbe C¹ continue (tangente continue).
 * @param p0 Point de contrôle précédent
 * @param p1 Point de départ du segment
 * @param p2 Point d'arrivée du segment
 * @param p3 Point de contrôle suivant
 * @param t Paramètre [0, 1]
 */
function catmullRom(
  p0: number, p1: number, p2: number, p3: number, t: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/**
 * Génère une trajectoire lissée par spline Catmull-Rom entre les waypoints.
 * Insère des points intermédiaires pour produire une courbe continue.
 * @param waypoints Liste de waypoints ordonnés
 * @param segmentsPerLeg Nombre de points intermédiaires par segment
 */
export function smoothTrajectory(
  waypoints: GeoPoint[],
  segmentsPerLeg: number = 10,
): GeoPoint[] {
  if (waypoints.length < 2) return waypoints;
  const result: GeoPoint[] = [];

  // Ajouter des points fantômes aux extrémités pour Catmull-Rom
  const padded: GeoPoint[] = [
    { ...waypoints[0] },
    ...waypoints,
    { ...waypoints[waypoints.length - 1] },
  ];

  for (let i = 1; i < padded.length - 2; i++) {
    const p0 = padded[i - 1];
    const p1 = padded[i];
    const p2 = padded[i + 1];
    const p3 = padded[i + 2];

    for (let s = 0; s <= segmentsPerLeg; s++) {
      const t = s / segmentsPerLeg;
      const lat = catmullRom(p0.lat, p1.lat, p2.lat, p3.lat, t);
      const lng = catmullRom(p0.lng, p1.lng, p2.lng, p3.lng, t);
      const alt = catmullRom(p0.altM, p1.altM, p2.altM, p3.altM, t);
      // Éviter les doublons aux jonctions
      if (s < segmentsPerLeg || i === padded.length - 3) {
        result.push({ lat, lng, altM: alt });
      }
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Chemins de Dubins (distance minimale avec contrainte de virage)
// ═══════════════════════════════════════════════════════════════

export type DubinsPathType = "LSL" | "LSR" | "RSL" | "RSR" | "LRL" | "RLR";

export interface DubinsPath {
  type: DubinsPathType;
  length: number;
  segments: { type: "L" | "S" | "R"; length: number }[];
}

/**
 * Calcule le chemin de Dubins (distance minimale) entre deux configurations
 * (position + cap) avec un rayon de virage minimum donné.
 *
 * Les 6 combinaisons possibles sont : LSL, LSR, RSL, RSR, LRL, RLR
 * où L = virage gauche, R = virage droit, S = segment droit.
 *
 * @param start Configuration de départ (position + cap)
 * @param end Configuration d'arrivée
 * @param turnRadius Rayon de virage minimum [m]
 */
export function computeDubinsPath(
  start: GeoPoint & { headingDeg: number },
  end: GeoPoint & { headingDeg: number },
  turnRadius: number,
): DubinsPath {
  // Convertir en coordonnées locales relatives (start = origine)
  const distance = haversineMeters(start, end);
  const bearing = computeBearingDeg(start, end);
  const dx = distance * Math.sin((bearing * Math.PI) / 180);
  const dy = distance * Math.cos((bearing * Math.PI) / 180);
  const startHeadingRad = (start.headingDeg * Math.PI) / 180;
  const endHeadingRad = (end.headingDeg * Math.PI) / 180;
  const phi = Math.atan2(dx, dy) - startHeadingRad;
  const lambda = endHeadingRad - startHeadingRad - phi;
  const d = distance / Math.max(turnRadius, 1);

  // Calculer les 6 combinaisons et choisir la plus courte
  const candidates: Array<{ type: DubinsPathType; length: number }> = [];
  const sa = Math.sin(phi);
  const ca = Math.cos(phi);
  const sb = Math.sin(lambda);
  const cb = Math.cos(lambda);

  // LSL
  const p_lsl = -phi + lambda;
  const q_lsl = 2 + d * d - 2 * d * ca + 2 * Math.sqrt(d * d - 2 * d * ca + 1) * sa;
  if (q_lsl >= 0) candidates.push({ type: "LSL", length: Math.sqrt(q_lsl) + Math.abs(p_lsl) + Math.abs(lambda) });

  // RSR
  const p_rsr = phi - lambda;
  const q_rsr = 2 + d * d + 2 * d * ca + 2 * Math.sqrt(d * d + 2 * d * ca + 1) * sa;
  if (q_rsr >= 0) candidates.push({ type: "RSR", length: Math.sqrt(q_rsr) + Math.abs(p_rsr) + Math.abs(lambda) });

  // LSR
  const p_lsr = -phi - lambda + (Math.PI / 2);
  const q_lsr = -2 + d * d - 2 * d * sb + 2 * Math.sqrt(d * d - 2 * d * sb + 2);
  if (q_lsr >= 0) candidates.push({ type: "LSR", length: Math.sqrt(q_lsr) + Math.abs(p_lsr) });

  // RSL
  const p_rsl = phi + lambda - (Math.PI / 2);
  const q_rsl = -2 + d * d + 2 * d * sb + 2 * Math.sqrt(d * d + 2 * d * sb + 2);
  if (q_rsl >= 0) candidates.push({ type: "RSL", length: Math.sqrt(q_rsl) + Math.abs(p_rsl) });

  // LRL
  const p_lrl = -phi + (Math.PI / 3);
  const q_lrl = (d * d - 4 * d * ca + 4) / 4;
  if (q_lrl >= 0 && q_lrl <= Math.PI) candidates.push({ type: "LRL", length: 3 * Math.PI - Math.abs(p_lrl) - Math.abs(lambda) + Math.sqrt(q_lrl) });

  // RLR
  const p_rlr = phi - (Math.PI / 3);
  const q_rlr = (d * d + 4 * d * ca + 4) / 4;
  if (q_rlr >= 0 && q_rlr <= Math.PI) candidates.push({ type: "RLR", length: 3 * Math.PI - Math.abs(p_rlr) - Math.abs(lambda) + Math.sqrt(q_rlr) });

  // Sélectionner le chemin le plus court
  candidates.sort((a, b) => a.length - b.length);
  const best = candidates[0];

  if (!best) {
    return { type: "LSL", length: distance, segments: [{ type: "S", length: distance }] };
  }

  // Convertir en segments concrets (approximation)
  const segments: { type: "L" | "S" | "R"; length: number }[] = [];
  for (const c of best.type) {
    if (c === "L") segments.push({ type: "L", length: turnRadius * Math.abs(phi) });
    else if (c === "R") segments.push({ type: "R", length: turnRadius * Math.abs(phi) });
    else segments.push({ type: "S", length: distance * 0.7 });
  }

  return { type: best.type, length: best.length * turnRadius, segments };
}

// ═══════════════════════════════════════════════════════════════
// Correcteur PID pour le suivi de trajectoire
// ═══════════════════════════════════════════════════════════════

export interface PIDGains {
  kp: number;
  ki: number;
  kd: number;
}

export interface PIDState {
  integral: number;
  previousError: number;
}

/**
 * Correcteur PID (Proportionnel-Intégral-Dérivé).
 * Calcule la correction de cap pour suivre une trajectoire.
 *
 * @param errorDeg Erreur de cap [deg] (positif = déviation droite)
 * @param gains Gains PID
 * @param state État interne (intégrale + erreur précédente)
 * @param dt Pas de temps [s]
 * @returns Correction de cap [deg]
 */
export function computePIDCorrection(
  errorDeg: number,
  gains: PIDGains,
  state: PIDState,
  dt: number,
): number {
  // Anti-windup : limiter l'intégrale
  const maxIntegral = 30; // ±30° max
  state.integral = Math.max(-maxIntegral, Math.min(maxIntegral, state.integral + errorDeg * dt));
  const derivative = (errorDeg - state.previousError) / Math.max(dt, 0.001);
  state.previousError = errorDeg;
  const correction = gains.kp * errorDeg + gains.ki * state.integral + gains.kd * derivative;
  // Limiter la correction à ±45°
  return Math.max(-45, Math.min(45, correction));
}

// ═══════════════════════════════════════════════════════════════
// Profil de vitesse optimisé
// ═══════════════════════════════════════════════════════════════

export interface SpeedProfile {
  maxSpeedKmh: number;
  cruiseSpeedKmh: number;
  approachSpeedKmh: number;
  turnSpeedKmh: number;
}

/**
 * Calcule le profil de vitesse optimisé le long d'une trajectoire.
 * Décélère avant les virages et aux waypoints, accélère sur les segments droits.
 *
 * @param points Points de la trajectoire lissée
 * @param config Vitesse de croisière et paramètres
 */
export function computeSpeedProfile(
  points: GeoPoint[],
  config: { cruiseSpeedKmh: number; maxSpeedKmh: number },
): number[] {
  if (points.length < 2) return [config.cruiseSpeedKmh];
  const speeds: number[] = new Array(points.length).fill(config.cruiseSpeedKmh);
  const cruise = config.cruiseSpeedKmh;
  const maxSpeed = Math.min(config.maxSpeedKmh, cruise * 1.25);
  const approachSpeed = cruise * 0.7;
  const turnSpeed = cruise * 0.6;

  // Calculer la courbure locale (changement de cap entre segments consécutifs)
  for (let i = 1; i < points.length - 1; i++) {
    const bearing1 = computeBearingDeg(points[i - 1], points[i]);
    const bearing2 = computeBearingDeg(points[i], points[i + 1]);
    const turnAngle = Math.abs(headingDifference(bearing1, bearing2));

    // Vitesse réduite dans les virages serrés
    if (turnAngle > 30) {
      speeds[i] = turnSpeed;
    } else if (turnAngle > 15) {
      speeds[i] = approachSpeed;
    } else if (turnAngle < 5) {
      speeds[i] = maxSpeed; // Accélérer sur les segments droits
    }
  }

  // Lissage : éviter les variations brutales de vitesse
  for (let pass = 0; pass < 3; pass++) {
    const smoothed = [...speeds];
    for (let i = 1; i < speeds.length - 1; i++) {
      smoothed[i] = (speeds[i - 1] + 2 * speeds[i] + speeds[i + 1]) / 4;
    }
    speeds.splice(0, speeds.length, ...smoothed);
  }

  // Premier et dernier point : vitesse d'approche
  speeds[0] = Math.min(speeds[0], approachSpeed);
  speeds[speeds.length - 1] = Math.min(speeds[speeds.length - 1], approachSpeed);

  return speeds;
}

// ═══════════════════════════════════════════════════════════════
// Compensation de vent
// ═══════════════════════════════════════════════════════════════

export interface WindVector {
  speedKmh: number;
  directionDeg: number; // Direction d'où vient le vent [deg, 0=Nord]
}

/**
 * Calcule le cap corrigé pour compenser le vent (wind correction angle).
 *
 * Triangle des vitesses :
 *   V_air + V_wind = V_ground
 *   Cap vrai = Route + angle de correction
 *
 * @param groundTrackDeg Route sol désirée [deg]
 * @param groundSpeedKmh Vitesse sol désirée [km/h]
 * @param wind Vent (vitesse + direction d'où il vient)
 * @returns Cap à suivre [deg] et vitesse air requise [km/h]
 */
export function computeWindCorrection(
  groundTrackDeg: number,
  groundSpeedKmh: number,
  wind: WindVector,
): { headingDeg: number; airspeedKmh: number; windCorrectionAngleDeg: number } {
  const trackRad = (groundTrackDeg * Math.PI) / 180;
  const windFromRad = (wind.directionDeg * Math.PI) / 180;

  // Composantes du vent dans le repère route
  const windCrosswindKmh = wind.speedKmh * Math.sin(windFromRad - trackRad); // Vent traversier
  const windHeadwindKmh = wind.speedKmh * Math.cos(windFromRad - trackRad); // Vent de face/arrière

  // Angle de correction de vent (WCA)
  const wcaRad = Math.asin(Math.max(-1, Math.min(1, windCrosswindKmh / Math.max(groundSpeedKmh, 1))));
  const windCorrectionAngleDeg = (wcaRad * 180) / Math.PI;

  // Cap vrai
  const headingDeg = (groundTrackDeg + windCorrectionAngleDeg + 360) % 360;

  // Vitesse air requise
  const airspeedKmh = groundSpeedKmh / Math.cos(wcaRad) - windHeadwindKmh;

  return { headingDeg, airspeedKmh: Math.max(0, airspeedKmh), windCorrectionAngleDeg };
}

// ═══════════════════════════════════════════════════════════════
// Rayon de virage et contraintes banked turn
// ═══════════════════════════════════════════════════════════════

/**
 * Rayon de virage en fonction de la vitesse et de l'inclinaison.
 * R = V² / (g · tan(φ))
 * @param speedKmh Vitesse [km/h]
 * @param bankAngleDeg Angle de roulis/inclinaison [deg]
 */
export function computeTurnRadius(speedKmh: number, bankAngleDeg: number): number {
  if (bankAngleDeg <= 0) return Infinity;
  const speedMs = speedKmh / 3.6;
  const bankRad = (bankAngleDeg * Math.PI) / 180;
  return (speedMs * speedMs) / (9.80665 * Math.tan(bankRad));
}

/**
 * Angle de roulis requis pour un virage à un rayon et vitesse donnés.
 * φ = arctan(V² / (g · R))
 */
export function computeBankAngle(speedKmh: number, turnRadiusM: number): number {
  if (turnRadiusM <= 0) return 0;
  const speedMs = speedKmh / 3.6;
  const bankRad = Math.atan((speedMs * speedMs) / (9.80665 * turnRadiusM));
  return (bankRad * 180) / Math.PI;
}

// ═══════════════════════════════════════════════════════════════
// Optimisation complète de trajectoire
// ═══════════════════════════════════════════════════════════════

export interface GuidanceConfig {
  cruiseSpeedKmh: number;
  maxSpeedKmh: number;
  maxBankAngleDeg: number;
  wind?: WindVector;
  segmentsPerLeg: number;
}

/**
 * Optimisation complète de trajectoire : lissage spline + profil vitesse +
 * compensation vent + calcul des caps et temps estimés.
 *
 * @param waypoints Waypoints de mission (départ → arrivée)
 * @param config Configuration du guidage
 */
export function optimizeTrajectory(
  waypoints: GeoPoint[],
  config: GuidanceConfig,
): OptimizedTrajectory {
  if (waypoints.length < 2) {
    return {
      points: [],
      totalDistanceM: 0,
      totalTimeS: 0,
      averageSpeedKmh: 0,
      maxSpeedKmh: 0,
      minSpeedKmh: 0,
      turnCount: 0,
      smoothnessScore: 0,
    };
  }

  // 1. Lisser la trajectoire par spline Catmull-Rom
  const smoothed = smoothTrajectory(waypoints, config.segmentsPerLeg);

  // 2. Calculer le profil de vitesse optimisé
  const speeds = computeSpeedProfile(smoothed, {
    cruiseSpeedKmh: config.cruiseSpeedKmh,
    maxSpeedKmh: config.maxSpeedKmh,
  });

  // 3. Construire les points de trajectoire avec caps, distances et temps
  const trajectoryPoints: TrajectoryPoint[] = [];
  let cumulativeDistance = 0;
  let cumulativeTime = 0;
  let turnCount = 0;
  let prevBearing = 0;

  for (let i = 0; i < smoothed.length; i++) {
    const point = smoothed[i];
    let headingDeg = prevBearing;
    if (i < smoothed.length - 1) {
      const bearing = computeBearingDeg(point, smoothed[i + 1]);
      headingDeg = bearing;
      // Compter les virages significatifs
      if (i > 0 && Math.abs(headingDifference(prevBearing, bearing)) > 15) {
        turnCount++;
      }
      prevBearing = bearing;
    }

    // Compensation de vent
    let effectiveSpeedKmh = speeds[i];
    if (config.wind) {
      const correction = computeWindCorrection(headingDeg, speeds[i], config.wind);
      effectiveSpeedKmh = correction.airspeedKmh;
    }

    // Distance et temps
    if (i > 0) {
      const segmentDistance = haversineMeters(smoothed[i - 1], point);
      cumulativeDistance += segmentDistance;
      const avgSpeedMs = ((speeds[i] + speeds[i - 1]) / 2) / 3.6;
      cumulativeTime += segmentDistance / Math.max(avgSpeedMs, 0.1);
    }

    trajectoryPoints.push({
      ...point,
      headingDeg,
      speedKmh: speeds[i],
      cumulativeDistanceM: cumulativeDistance,
      estimatedTimeS: cumulativeTime,
    });
  }

  // 4. Calculer les métriques
  const totalDistanceM = cumulativeDistance;
  const totalTimeS = cumulativeTime;
  const allSpeeds = speeds.filter(s => s > 0);
  const averageSpeedKmh = allSpeeds.length > 0 ? allSpeeds.reduce((a, b) => a + b, 0) / allSpeeds.length : 0;
  const maxSpeedKmh = allSpeeds.length > 0 ? Math.max(...allSpeeds) : 0;
  const minSpeedKmh = allSpeeds.length > 0 ? Math.min(...allSpeeds) : 0;

  // Score de fluidité (0-100) : basé sur le nombre de virages et la variation de vitesse
  const expectedTurns = waypoints.length;
  const turnPenalty = Math.max(0, turnCount - expectedTurns) * 5;
  const speedVariance = allSpeeds.length > 1
    ? allSpeeds.reduce((sum, s) => sum + Math.pow(s - averageSpeedKmh, 2), 0) / allSpeeds.length
    : 0;
  const speedPenalty = Math.min(30, Math.sqrt(speedVariance) * 2);
  const smoothnessScore = Math.max(0, Math.min(100, 100 - turnPenalty - speedPenalty));

  return {
    points: trajectoryPoints,
    totalDistanceM,
    totalTimeS,
    averageSpeedKmh,
    maxSpeedKmh,
    minSpeedKmh,
    turnCount,
    smoothnessScore,
  };
}
