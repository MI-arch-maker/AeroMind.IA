import type {
  LabConfig,
  MetricCheck,
  SimulationResult,
  TelemetryPoint,
} from "./types";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const round = (value: number, digits = 1) => Number(value.toFixed(digits));

export function validateConfig(config: LabConfig): string[] {
  const { drone, conditions, criteria, mission } = config;
  const errors: string[] = [];
  if (!drone.profile.trim()) errors.push("Sélectionnez un profil de drone.");
  if (drone.emptyMassKg <= 0 || drone.emptyMassKg > 150)
    errors.push("La masse à vide doit être comprise entre 0,1 et 150 kg.");
  if (drone.payloadLimitKg <= 0 || drone.payloadLimitKg > 40)
    errors.push(
      "La charge utile admissible doit être comprise entre 0,1 et 40 kg.",
    );
  if (drone.batteryWh < 50 || drone.batteryWh > 50000)
    errors.push(
      "La capacité énergétique doit être comprise entre 50 et 50 000 Wh.",
    );
  if (drone.cruiseSpeedMps < 2 || drone.cruiseSpeedMps > 200)
    errors.push(
      "La vitesse de croisière simulée doit être comprise entre 2 et 200 m/s.",
    );
  if (drone.nominalPowerW < 20 || drone.nominalPowerW > 20000)
    errors.push(
      "La puissance nominale doit être comprise entre 20 et 20 000 W.",
    );
  if (drone.stabilityRating < 50 || drone.stabilityRating > 100)
    errors.push(
      "La stabilité de référence doit être comprise entre 50 et 100 %.",
    );
  if (conditions.windMps < 0 || conditions.windMps > 30)
    errors.push("Le vent simulé doit être compris entre 0 et 30 m/s.");
  if (conditions.temperatureC < -30 || conditions.temperatureC > 55)
    errors.push(
      "La température simulée doit être comprise entre −30 et 55 °C.",
    );
  if (conditions.payloadKg < 0 || conditions.payloadKg > 40)
    errors.push("La charge utile doit être comprise entre 0 et 40 kg.");
  if (conditions.payloadKg > drone.payloadLimitKg)
    errors.push("La charge déclarée dépasse la limite du profil de drone.");
  if (conditions.reservePct < 5 || conditions.reservePct > 60)
    errors.push(
      "La réserve énergétique cible doit être comprise entre 5 et 60 %.",
    );
  if (conditions.distanceKm < 0.1 || conditions.distanceKm > 100)
    errors.push(
      "La distance de mission doit être comprise entre 0,1 et 100 km.",
    );
  if (conditions.altitudeM < 0 || conditions.altitudeM > 3000)
    errors.push("L’altitude simulée doit être comprise entre 0 et 3 000 m.");
  if (criteria.minStabilityPct < 50 || criteria.minStabilityPct > 99)
    errors.push("Le seuil de stabilité doit être compris entre 50 et 99 %.");
  if (criteria.minReservePct < 5 || criteria.minReservePct > 60)
    errors.push("Le seuil de réserve doit être compris entre 5 et 60 %.");
  if (criteria.maxCrossTrackM < 0.2 || criteria.maxCrossTrackM > 50)
    errors.push("La dérive maximale doit être comprise entre 0,2 et 50 m.");
  if (criteria.minQualityPct < 40 || criteria.minQualityPct > 99)
    errors.push(
      "Le seuil de qualité de mission doit être compris entre 40 et 99 %.",
    );
  if (!mission.objective.trim())
    errors.push("Décrivez l’objectif de mission avant de lancer l’essai.");
  return errors;
}

function stableTraceId(config: LabConfig): string {
  const source = JSON.stringify({
    profile: config.drone.profile,
    mission: config.mission.kind,
    objective: config.mission.objective.trim(),
    drone: config.drone,
    conditions: config.conditions,
    criteria: config.criteria,
  });
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `AM-${(hash >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function simulate(config: LabConfig): SimulationResult {
  const issues = validateConfig(config);
  if (issues.length) throw new Error(issues.join(" "));

  const { drone, conditions, mission, criteria } = config;
  const loadRatio = conditions.payloadKg / drone.payloadLimitKg;
  const windRatio = conditions.windMps / drone.cruiseSpeedMps;
  const headwindFraction = Math.min(0.68, windRatio * 0.58);
  const groundSpeedMps = Math.max(
    2,
    drone.cruiseSpeedMps * (1 - headwindFraction),
  );
  const temperaturePenalty =
    Math.max(0, 20 - conditions.temperatureC) * 0.0045 +
    Math.max(0, conditions.temperatureC - 35) * 0.002;
  const gustPenalty = conditions.turbulenceEnabled ? 0.055 : 0;
  const altitudePenalty = Math.max(0, conditions.altitudeM - 300) * 0.00012;
  // Coefficient conceptuel non étalonné : 2,5 % de puissance par kg autour de 3 kg.
  const emptyMassPenalty = (drone.emptyMassKg - 3) * 0.025;
  const powerMultiplier = Math.max(
    0.5,
    1 +
      emptyMassPenalty +
      loadRatio * 0.28 +
      conditions.windMps * 0.012 +
      temperaturePenalty +
      gustPenalty +
      altitudePenalty,
  );
  const powerDrawW = drone.nominalPowerW * powerMultiplier;
  const overheadMin =
    mission.kind === "inspection" ? 4 : mission.kind === "mapping" ? 2 : 7;
  const durationMin =
    (conditions.distanceKm * 1000) / groundSpeedMps / 60 + overheadMin;
  const enduranceMin = (drone.batteryWh / powerDrawW) * 60;
  const energyUsedWh = (powerDrawW * durationMin) / 60;
  const reserveRemainingPct = clamp(
    (1 - energyUsedWh / drone.batteryWh) * 100,
    0,
    100,
  );
  const stabilityPct = clamp(
    drone.stabilityRating -
      conditions.windMps * (conditions.turbulenceEnabled ? 2.05 : 1.55) -
      loadRatio * 4.6 -
      temperaturePenalty * 18 -
      altitudePenalty * 10,
    0,
    100,
  );
  const crossTrackM = Math.max(
    0.1,
    0.18 +
      conditions.windMps * (1.55 - stabilityPct / 100) * 1.45 +
      loadRatio * 1.25 +
      (conditions.turbulenceEnabled ? conditions.windMps * 0.16 : 0),
  );
  const missionBase =
    mission.kind === "inspection" ? 95 : mission.kind === "mapping" ? 93 : 91;
  const missionQualityPct = clamp(
    missionBase -
      conditions.windMps * (mission.kind === "rescue" ? 2.2 : 1.75) -
      Math.max(
        0,
        conditions.temperatureC < 5 ? 5 - conditions.temperatureC : 0,
      ) *
        0.4 -
      loadRatio * 5 -
      Math.max(0, durationMin - enduranceMin) * 0.8,
    0,
    100,
  );
  const missionMetricPct =
    mission.kind === "mapping"
      ? clamp(
          missionQualityPct - Math.max(0, conditions.windMps - 6) * 1.2,
          0,
          100,
        )
      : mission.kind === "inspection"
        ? clamp(missionQualityPct - Math.max(0, crossTrackM - 1) * 1.3, 0, 100)
        : clamp(
            missionQualityPct - Math.max(0, conditions.windMps - 4) * 1.6,
            0,
            100,
          );
  const metricLabel =
    mission.kind === "mapping"
      ? "Couverture estimée"
      : mission.kind === "inspection"
        ? "Qualité d’inspection"
        : "Qualité de recherche";

  const checks: MetricCheck[] = [
    {
      key: "stability",
      label: "Stabilité",
      value: round(stabilityPct),
      displayValue: `${round(stabilityPct)} %`,
      threshold: `≥ ${criteria.minStabilityPct} %`,
      pass: stabilityPct >= criteria.minStabilityPct,
      marginPct: round(stabilityPct - criteria.minStabilityPct),
      explanation:
        "Indice conceptuel combinant vent, charge déclarée, altitude et stabilité de référence du profil.",
    },
    {
      key: "reserve",
      label: "Réserve énergétique estimée",
      value: round(reserveRemainingPct),
      displayValue: `${round(reserveRemainingPct)} %`,
      threshold: `≥ ${criteria.minReservePct} %`,
      pass: reserveRemainingPct >= criteria.minReservePct,
      marginPct: round(reserveRemainingPct - criteria.minReservePct),
      explanation:
        "Énergie restante estimée après le parcours et le temps de service modélisés.",
    },
    {
      key: "crossTrack",
      label: "Erreur de trajectoire estimée",
      value: round(crossTrackM, 2),
      displayValue: `${round(crossTrackM, 2)} m`,
      threshold: `≤ ${criteria.maxCrossTrackM} m`,
      pass: crossTrackM <= criteria.maxCrossTrackM,
      marginPct: round(
        ((criteria.maxCrossTrackM - crossTrackM) / criteria.maxCrossTrackM) *
          100,
      ),
      explanation:
        "Dérive indicative; ce n’est ni une mesure de navigation réelle ni une preuve de précision.",
    },
    {
      key: "quality",
      label: metricLabel,
      value: round(missionMetricPct),
      displayValue: `${round(missionMetricPct)} %`,
      threshold: `≥ ${criteria.minQualityPct} %`,
      pass: missionMetricPct >= criteria.minQualityPct,
      marginPct: round(missionMetricPct - criteria.minQualityPct),
      explanation:
        "Score synthétique propre au profil de mission sélectionné; il ne remplace pas une mesure métier.",
    },
    {
      key: "payload",
      label: "Charge utile",
      value: round(conditions.payloadKg, 2),
      displayValue: `${round(conditions.payloadKg, 2)} kg`,
      threshold: `≤ ${round(drone.payloadLimitKg, 2)} kg`,
      pass: conditions.payloadKg <= drone.payloadLimitKg,
      marginPct: round(
        ((drone.payloadLimitKg - conditions.payloadKg) / drone.payloadLimitKg) *
          100,
      ),
      explanation:
        "Comparaison de la charge saisie à la limite déclarée du profil.",
    },
    {
      key: "endurance",
      label: "Durée / endurance",
      value: round(durationMin),
      displayValue: `${round(durationMin)} / ${round(enduranceMin)} min`,
      threshold: "Durée mission ≤ endurance estimée",
      pass: durationMin <= enduranceMin * (1 - conditions.reservePct / 100),
      marginPct: round(
        ((enduranceMin * (1 - conditions.reservePct / 100) - durationMin) /
          Math.max(durationMin, 1)) *
          100,
      ),
      explanation:
        "Temps estimé comparé à l’endurance disponible après application de la réserve cible.",
    },
    {
      key: "speed-model-domain",
      label: "Domaine du modèle de vitesse",
      value: round(drone.cruiseSpeedMps, 1),
      displayValue: `${round(drone.cruiseSpeedMps, 1)} m/s (${round(drone.cruiseSpeedMps * 3.6)} km/h)`,
      threshold: "≤ 60 m/s (216 km/h) pour ce modèle conceptuel",
      pass: drone.cruiseSpeedMps <= 60,
      marginPct: round(((60 - drone.cruiseSpeedMps) / 60) * 100),
      explanation:
        "Au-dessus de 60 m/s, puissance, autonomie et qualité de mission ne sont pas calibrées : résultat haute vitesse exploratoire uniquement.",
    },
  ];
  const severeFailure =
    conditions.payloadKg > drone.payloadLimitKg ||
    durationMin > enduranceMin * (1 - conditions.reservePct / 100) * 1.18 ||
    stabilityPct < criteria.minStabilityPct - 12 ||
    reserveRemainingPct < criteria.minReservePct - 12 ||
    crossTrackM > criteria.maxCrossTrackM * 1.6 ||
    missionMetricPct < criteria.minQualityPct - 15;
  const allPass = checks.every((check) => check.pass);
  const verdict = allPass ? "PASS" : severeFailure ? "FAIL" : "WARN";
  const failedChecks = checks
    .filter((check) => !check.pass)
    .map((check) => check.label.toLowerCase());
  const summary = allPass
    ? "Les critères configurés sont respectés dans ce modèle conceptuel. Confirmer les hypothèses avant tout essai physique."
    : severeFailure
      ? `Échec simulé : revoir ${failedChecks.join(", ")}. Le scénario dépasse au moins une marge de prudence du modèle.`
      : `À examiner : ${failedChecks.join(", ")}. Le résultat est proche d’un seuil ou ne le respecte pas; ajustez le profil puis rejouez.`;
  const assumptions = [
    "Modèle déterministe simplifié; les coefficients ne sont pas étalonnés sur un aéronef réel.",
    "La masse à vide influe sur la puissance estimée par un coefficient conceptuel de 2,5 %/kg autour de 3 kg; cette relation n’est pas étalonnée.",
    "Vent et turbulence sont agrégés en pénalités; le relief, les obstacles, les rafales locales et la météo réelle ne sont pas représentés.",
    "Puissance, stabilité, dérive et qualité sont des estimations indicatives, non des performances certifiées.",
    "Aucun plan de vol, capteur, réseau, actionneur ni aéronef réel n’est connecté ou commandé.",
    ...(drone.cruiseSpeedMps > 60
      ? ["Cible > 216 km/h hors domaine calibré : les métriques de performance ne doivent pas être interprétées comme une capacité réelle."]
      : []),
  ];
  return {
    verdict,
    summary,
    durationMin: round(durationMin),
    enduranceMin: round(enduranceMin),
    energyUsedWh: round(energyUsedWh),
    reserveRemainingPct: round(reserveRemainingPct),
    stabilityPct: round(stabilityPct),
    crossTrackM: round(crossTrackM, 2),
    missionQualityPct: round(missionQualityPct),
    metricLabel,
    missionMetricPct: round(missionMetricPct),
    groundSpeedMps: round(groundSpeedMps, 1),
    powerDrawW: round(powerDrawW),
    checks,
    assumptions,
    traceId: stableTraceId(config),
  };
}

export function telemetryAt(
  progressPct: number,
  result: SimulationResult,
): TelemetryPoint {
  const ratio = clamp(progressPct / 100, 0, 1);
  const deterministicRipple = Math.sin(ratio * Math.PI * 6) * (1 - ratio) * 1.2;
  return {
    time: round(result.durationMin * ratio, 1),
    energyPct: round(
      clamp(100 - (100 - result.reserveRemainingPct) * ratio, 0, 100),
      1,
    ),
    stabilityPct: round(
      clamp(result.stabilityPct + deterministicRipple, 0, 100),
      1,
    ),
    crossTrackM: round(
      Math.max(
        0,
        result.crossTrackM * ratio + Math.sin(ratio * Math.PI * 4) * 0.12,
      ),
      2,
    ),
  };
}

export function makeTelemetrySeries(
  result: SimulationResult,
  sampleCount = 24,
): TelemetryPoint[] {
  return Array.from({ length: sampleCount + 1 }, (_, index) =>
    telemetryAt((index / sampleCount) * 100, result),
  );
}
