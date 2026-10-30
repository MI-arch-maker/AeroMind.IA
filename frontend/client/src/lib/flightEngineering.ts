import {
  runSimulation,
  type ConceptConfig,
  type FlightControlsConfig,
  type LocalMissionPlan,
  type MissionWaypoint,
} from "./aeroEngine";

export const defaultFlightControls: FlightControlsConfig = {
  mode: "manual",
  aileronDeg: 0,
  elevatorDeg: 0,
  rudderDeg: 0,
  trimDeg: 0,
  throttlePct: 35,
  servoLimitDeg: 25,
  servoRateDegPerSec: 45,
  transitionPct: 0,
};

export const defaultLocalMissionPlan: LocalMissionPlan = {
  operationName: "Aube Claire",
  profileId: "line-inspection",
  radiusKm: 18,
  returnAltitudeM: 80,
  lostLinkAction: "return",
  homeX: 10,
  homeY: 82,
  waypoints: [
    {
      id: "WP-01",
      name: "Départ inspection",
      x: 18,
      y: 64,
      altitudeM: 60,
      speedKmh: 42,
      action: "inspection",
    },
    {
      id: "WP-02",
      name: "Pylône A",
      x: 40,
      y: 44,
      altitudeM: 72,
      speedKmh: 38,
      action: "inspection",
    },
    {
      id: "WP-03",
      name: "Pylône B",
      x: 64,
      y: 48,
      altitudeM: 72,
      speedKmh: 38,
      action: "inspection",
    },
    {
      id: "WP-04",
      name: "Fin de ligne",
      x: 84,
      y: 25,
      altitudeM: 60,
      speedKmh: 42,
      action: "return",
    },
  ],
};

/** Build an explicitly local demo route inside the active platform envelope. */
export function createCompatibleDemoMissionPlan(
  config: ConceptConfig
): LocalMissionPlan {
  const demoAltitude = Math.max(...defaultLocalMissionPlan.waypoints.map(point => point.altitudeM));
  const demoSpeed = Math.max(...defaultLocalMissionPlan.waypoints.map(point => point.speedKmh));
  const altitudeLimit = config.altitudeM >= 5
    ? config.altitudeM * 0.8
    : demoAltitude;
  const speedLimit = config.cruiseSpeedKmh >= 5
    ? Math.min(config.cruiseSpeedKmh * 0.8, 300)
    : demoSpeed;
  return {
    ...defaultLocalMissionPlan,
    returnAltitudeM: Math.min(defaultLocalMissionPlan.returnAltitudeM, altitudeLimit),
    waypoints: defaultLocalMissionPlan.waypoints.map(point => ({
      ...point,
      altitudeM: Math.min(point.altitudeM, altitudeLimit),
      speedKmh: Math.min(point.speedKmh, speedLimit),
    })),
  };
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const round = (value: number, digits = 1) => Number(value.toFixed(digits));

export type MissionTemplateId =
  | "line-inspection"
  | "area-grid"
  | "perimeter"
  | "direct-return";

const missionTemplatePoints: Record<
  MissionTemplateId,
  Array<{
    name: string;
    x: number;
    y: number;
    altitudeFactor: number;
    speedFactor: number;
    action: MissionWaypoint["action"];
  }>
> = {
  "line-inspection": [
    {
      name: "Départ inspection",
      x: 18,
      y: 64,
      altitudeFactor: 0.5,
      speedFactor: 0.82,
      action: "inspection",
    },
    {
      name: "Segment A",
      x: 40,
      y: 44,
      altitudeFactor: 0.6,
      speedFactor: 0.74,
      action: "inspection",
    },
    {
      name: "Segment B",
      x: 64,
      y: 48,
      altitudeFactor: 0.6,
      speedFactor: 0.74,
      action: "inspection",
    },
    {
      name: "Fin de ligne",
      x: 84,
      y: 25,
      altitudeFactor: 0.5,
      speedFactor: 0.82,
      action: "return",
    },
  ],
  "area-grid": [
    {
      name: "Bande 1 — entrée",
      x: 20,
      y: 70,
      altitudeFactor: 0.65,
      speedFactor: 0.8,
      action: "inspection",
    },
    {
      name: "Bande 1 — sortie",
      x: 20,
      y: 30,
      altitudeFactor: 0.65,
      speedFactor: 0.8,
      action: "inspection",
    },
    {
      name: "Virage 1",
      x: 38,
      y: 30,
      altitudeFactor: 0.65,
      speedFactor: 0.65,
      action: "turn",
    },
    {
      name: "Bande 2 — sortie",
      x: 38,
      y: 70,
      altitudeFactor: 0.65,
      speedFactor: 0.8,
      action: "inspection",
    },
    {
      name: "Virage 2",
      x: 56,
      y: 70,
      altitudeFactor: 0.65,
      speedFactor: 0.65,
      action: "turn",
    },
    {
      name: "Bande 3 — sortie",
      x: 56,
      y: 30,
      altitudeFactor: 0.65,
      speedFactor: 0.8,
      action: "inspection",
    },
    {
      name: "Retour zone",
      x: 80,
      y: 30,
      altitudeFactor: 0.5,
      speedFactor: 0.75,
      action: "return",
    },
  ],
  perimeter: [
    {
      name: "Limite nord-ouest",
      x: 20,
      y: 70,
      altitudeFactor: 0.55,
      speedFactor: 0.7,
      action: "inspection",
    },
    {
      name: "Limite sud-ouest",
      x: 20,
      y: 30,
      altitudeFactor: 0.55,
      speedFactor: 0.7,
      action: "inspection",
    },
    {
      name: "Limite sud-est",
      x: 80,
      y: 30,
      altitudeFactor: 0.55,
      speedFactor: 0.7,
      action: "inspection",
    },
    {
      name: "Limite nord-est",
      x: 80,
      y: 70,
      altitudeFactor: 0.55,
      speedFactor: 0.7,
      action: "return",
    },
  ],
  "direct-return": [
    {
      name: "Point d’observation",
      x: 35,
      y: 55,
      altitudeFactor: 0.5,
      speedFactor: 0.65,
      action: "inspection",
    },
    {
      name: "Retour supervisé",
      x: 24,
      y: 72,
      altitudeFactor: 0.45,
      speedFactor: 0.65,
      action: "return",
    },
  ],
};

export function buildMissionTemplate(
  id: MissionTemplateId,
  config: ConceptConfig
): MissionWaypoint[] {
  const ceiling = Math.max(0, config.altitudeM || 120);
  const cruise = Math.min(300, Math.max(1, config.cruiseSpeedKmh || 1));
  return missionTemplatePoints[id].map((point, index) => ({
    id: `TPL-${id}-${index + 1}`,
    name: point.name,
    x: point.x,
    y: point.y,
    altitudeM: round(ceiling * point.altitudeFactor, 0),
    speedKmh: round(cruise * point.speedFactor, 0),
    action: point.action,
  }));
}

export type FlightPreview = {
  aileronDeg: number;
  elevatorDeg: number;
  rudderDeg: number;
  trimDeg: number;
  rollDeg: number;
  pitchDeg: number;
  yawDeg: number;
  throttlePct: number;
  airspeedKmh: number;
  powerW: number;
  motorOutputsPct: number[];
  saturated: boolean;
  profile: string;
};

/** Simplified, non-validated response visualization. Never sends commands to hardware. */
export function calculateFlightPreview(
  config: ConceptConfig,
  controls: FlightControlsConfig = defaultFlightControls
): FlightPreview {
  const limit = clamp(controls.servoLimitDeg, 5, 45);
  const modeGain =
    controls.mode === "stabilized"
      ? 0.72
      : controls.mode === "mission"
        ? 0.55
        : 1;
  const boundedAileron = clamp(controls.aileronDeg, -limit, limit);
  const boundedElevator = clamp(controls.elevatorDeg, -limit, limit);
  const boundedRudder = clamp(controls.rudderDeg, -limit, limit);
  const boundedTrim = clamp(
    controls.trimDeg,
    -Math.min(12, limit),
    Math.min(12, limit)
  );
  const aileronDeg = round(boundedAileron * modeGain);
  const elevatorDeg = round(boundedElevator * modeGain);
  const rudderDeg = round(boundedRudder * modeGain);
  const trimDeg = round(boundedTrim * modeGain);
  const throttlePct = clamp(controls.throttlePct, 0, 100);
  const simulation = runSimulation(config);
  const throttleRatio = throttlePct / 100;
  const motorCount =
    config.airframe === "fixed-wing"
      ? 1
      : Math.max(3, Math.min(8, Math.round(config.motorCount ?? 4)));
  const rollMix = limit ? (aileronDeg / limit) * 16 : 0;
  const pitchMix = limit ? (elevatorDeg / limit) * 14 : 0;
  const yawMix = limit ? (rudderDeg / limit) * 9 : 0;
  const motorOutputsPct = Array.from({ length: motorCount }, (_, index) => {
    if (motorCount === 1) return round(throttlePct, 0);
    const angle = (Math.PI * 2 * index) / motorCount;
    const spinDirection = index % 2 === 0 ? 1 : -1;
    return round(
      clamp(
        throttlePct -
          Math.sin(angle) * rollMix +
          Math.cos(angle) * pitchMix +
          spinDirection * yawMix,
        0,
        100
      ),
      0
    );
  });
  return {
    aileronDeg,
    elevatorDeg,
    rudderDeg,
    trimDeg,
    rollDeg: round(aileronDeg * 0.8),
    pitchDeg: round((elevatorDeg + trimDeg) * 0.72),
    yawDeg: round(rudderDeg * 0.65),
    throttlePct,
    airspeedKmh: round(config.cruiseSpeedKmh * throttleRatio),
    powerW: round(
      simulation.estimatedPowerW * (0.15 + 0.85 * throttleRatio ** 2),
      0
    ),
    motorOutputsPct,
    saturated:
      Math.abs(controls.aileronDeg) > limit ||
      Math.abs(controls.elevatorDeg) > limit ||
      Math.abs(controls.rudderDeg) > limit ||
      Math.abs(controls.trimDeg) > Math.min(12, limit),
    profile:
      controls.mode === "manual"
        ? "Direct"
        : controls.mode === "stabilized"
          ? "Assistance stabilisée"
          : "Guidage de mission simulé",
  };
}

export function estimateLocalMissionDistanceKm(plan: LocalMissionPlan): number {
  const points = [
    { x: plan.homeX, y: plan.homeY },
    ...plan.waypoints,
    { x: plan.homeX, y: plan.homeY },
  ];
  let normalizedDistance = 0;
  for (let index = 1; index < points.length; index += 1) {
    normalizedDistance += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y
    );
  }
  return round((normalizedDistance / 100) * plan.radiusKm * 2, 2);
}

export type MissionCheck = {
  severity: "pass" | "review" | "block";
  message: string;
};

export function validateLocalMission(
  config: ConceptConfig,
  plan: LocalMissionPlan
): MissionCheck[] {
  const checks: MissionCheck[] = [];
  const distanceKm = estimateLocalMissionDistanceKm(plan);
  if (
    !config.airframe ||
    config.altitudeM < 5 ||
    config.cruiseSpeedKmh < 5 ||
    config.batteryWh <= 0 ||
    config.maxTakeoffKg <= 0
  ) {
    checks.push({
      severity: "block",
      message:
        "Définir une architecture, une limite d’altitude, une vitesse et une capacité énergétique avant le prévol.",
    });
  }
  if (plan.waypoints.length < 2) {
    checks.push({
      severity: "block",
      message:
        "Ajouter au moins deux points de passage pour vérifier la trajectoire.",
    });
  } else {
    checks.push({
      severity: "pass",
      message: `${plan.waypoints.length} points de passage définis.`,
    });
  }
  if (
    plan.waypoints.some(
      point => point.altitudeM <= 0 || point.altitudeM > config.altitudeM
    )
  ) {
    checks.push({
      severity: "block",
      message:
        "Un point dépasse le plafond d’altitude paramétré dans le projet.",
    });
  } else {
    checks.push({
      severity: "pass",
      message: "Altitudes des points dans le plafond de projet.",
    });
  }
  const exceedsMissionSpeedEnvelope =
    config.cruiseSpeedKmh > 300 ||
    plan.waypoints.some(point => point.speedKmh > 300);
  if (exceedsMissionSpeedEnvelope) {
    checks.push({
      severity: "block",
      message:
        "Cible supérieure à 300 km/h hors enveloppe de planification : étude conceptuelle uniquement, prévol local bloqué.",
    });
  } else if (
    plan.waypoints.some(
      point =>
        point.speedKmh <= 0 ||
        point.speedKmh > Math.max(config.cruiseSpeedKmh * 1.25, 1)
    )
  ) {
    checks.push({
      severity: "review",
      message:
        "Revoir la vitesse d’un point par rapport à la vitesse de conception.",
    });
  } else {
    checks.push({
      severity: "pass",
      message: "Vitesses des points cohérentes avec la consigne de conception.",
    });
  }
  const estimatedRangeKm = runSimulation(config).rangeKm;
  checks.push(
    distanceKm <= estimatedRangeKm * 0.65
      ? {
          severity: "pass",
          message: `Trajet aller-retour indicatif ${distanceKm} km sous 65 % du rayon théorique (${round(estimatedRangeKm, 1)} km).`,
        }
      : {
          severity: "review",
          message: `Trajet ${distanceKm} km proche ou supérieur au rayon théorique; augmenter la réserve et faire une analyse dédiée.`,
        }
  );
  if (plan.radiusKm <= 0 || plan.radiusKm > 100) {
    checks.push({
      severity: "block",
      message: "Le rayon du canevas local doit rester entre 0 et 100 km.",
    });
  } else {
    checks.push({
      severity: "pass",
      message: "Échelle locale de prévisualisation définie.",
    });
  }
  return checks;
}
