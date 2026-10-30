import type {
  ConceptConfig,
  SimulationResult as AeroMindSimulation,
} from "../aeroEngine";
import { estimateLocalMissionDistanceKm } from "../flightEngineering";
import { defaultCriteria } from "./scenarios";
import type { LabConfig, MissionKind } from "./types";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export function adaptProjectToLab(
  project: ConceptConfig,
  simulation: AeroMindSimulation,
  fallbackObjective: string,
): LabConfig {
  const breakdown = simulation.massBreakdown;
  const breakdownEmptyMass =
    breakdown.structure +
    breakdown.battery +
    breakdown.propulsion +
    breakdown.avionics;
  const emptyMassKg = clamp(
    breakdownEmptyMass > 0
      ? breakdownEmptyMass
      : simulation.totalMassKg - project.payloadKg,
    0.1,
    150,
  );
  const payloadLimitKg = clamp(project.maxTakeoffKg - emptyMassKg, 0.1, 40);
  const windKmh = project.missionEnvironment?.windKmh ?? project.windSpeedKmh;
  const windMps = clamp(windKmh / 3.6, 0, 30);
  const temperatureC = clamp(
    project.missionEnvironment?.ambientC ?? 18,
    -30,
    55,
  );
  const altitudeM = clamp(project.altitudeM, 0, 3000);
  const reservePct = clamp(project.reserveFraction * 100, 5, 60);
  const distanceKm = clamp(
    project.missionPlan
      ? estimateLocalMissionDistanceKm(project.missionPlan)
      : 5.5,
    0.1,
    100,
  );
  const turbulenceEnabled = Boolean(
    (project.missionEnvironment?.windKmh ?? 0) > project.windSpeedKmh ||
      project.activeFlightTestScenario === "wind",
  );
  const missionText = [
    project.aeronauticalRole,
    project.missionTarget?.name,
    project.missionTarget?.brief,
    project.missionBrief,
    project.missionPlan?.operationName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const missionKind: MissionKind = /cartograph|mapping|survey|orthophoto/.test(
    missionText,
  )
    ? "mapping"
    : /recherche|sauvetage|secours|rescue|\bsar\b/.test(missionText)
      ? "rescue"
      : "inspection";
  const loadRatio = project.payloadKg / Math.max(payloadLimitKg, 0.1);
  const temperaturePenalty =
    Math.max(0, 20 - temperatureC) * 0.0045 +
    Math.max(0, temperatureC - 35) * 0.002;
  const gustPenalty = turbulenceEnabled ? 0.055 : 0;
  const altitudePenalty = Math.max(0, altitudeM - 300) * 0.00012;
  const massPenalty = (emptyMassKg - 3) * 0.025;
  const normalizationFactor = Math.max(
    0.5,
    1 +
      massPenalty +
      loadRatio * 0.28 +
      windMps * 0.012 +
      temperaturePenalty +
      gustPenalty +
      altitudePenalty,
  );
  const referencePowerW = clamp(
    (simulation.estimatedPowerW || project.batteryWh / 2) / normalizationFactor,
    20,
    20000,
  );

  return {
    drone: {
      profile:
        project.engineeringSelection?.droneLabel ||
        project.platformProfile ||
        project.designName ||
        "Configuration AeroMind active",
      emptyMassKg,
      payloadLimitKg,
      batteryWh: clamp(project.batteryWh, 50, 50000),
      cruiseSpeedMps: clamp(project.cruiseSpeedKmh / 3.6, 2, 200),
      nominalPowerW: referencePowerW,
      // Valeur de départ hypothétique; l’utilisateur peut la modifier pour son scénario.
      stabilityRating: 90,
    },
    mission: {
      kind: missionKind,
      label:
        project.missionTarget?.name ||
        project.missionPlan?.operationName ||
        "Mission AeroMind",
      objective:
        project.missionTarget?.brief ||
        project.missionBrief ||
        project.missionPlan?.operationName ||
        fallbackObjective,
    },
    conditions: {
      windMps,
      temperatureC,
      payloadKg: project.payloadKg,
      reservePct,
      distanceKm,
      altitudeM,
      turbulenceEnabled,
    },
    criteria: { ...defaultCriteria },
  };
}
