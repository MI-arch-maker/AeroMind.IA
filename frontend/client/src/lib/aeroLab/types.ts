export type MissionKind = "inspection" | "mapping" | "rescue";
export type RunStatus = "ready" | "running" | "paused" | "complete";
export type Verdict = "PASS" | "WARN" | "FAIL";

export interface DroneConfig {
  profile: string;
  emptyMassKg: number;
  payloadLimitKg: number;
  batteryWh: number;
  cruiseSpeedMps: number;
  nominalPowerW: number;
  stabilityRating: number;
}

export interface Conditions {
  windMps: number;
  temperatureC: number;
  payloadKg: number;
  reservePct: number;
  distanceKm: number;
  altitudeM: number;
  turbulenceEnabled: boolean;
}

export interface Mission {
  kind: MissionKind;
  objective: string;
  label: string;
}

export interface Criteria {
  minStabilityPct: number;
  minReservePct: number;
  maxCrossTrackM: number;
  minQualityPct: number;
}

export interface LabConfig {
  drone: DroneConfig;
  conditions: Conditions;
  mission: Mission;
  criteria: Criteria;
}

export interface MetricCheck {
  key: string;
  label: string;
  value: number;
  displayValue: string;
  threshold: string;
  pass: boolean;
  marginPct: number;
  explanation: string;
}

export interface SimulationResult {
  verdict: Verdict;
  summary: string;
  durationMin: number;
  enduranceMin: number;
  energyUsedWh: number;
  reserveRemainingPct: number;
  stabilityPct: number;
  crossTrackM: number;
  missionQualityPct: number;
  metricLabel: string;
  missionMetricPct: number;
  groundSpeedMps: number;
  powerDrawW: number;
  checks: MetricCheck[];
  assumptions: string[];
  traceId: string;
}

export interface Scenario {
  id: string;
  name: string;
  mission: Mission;
  drone: DroneConfig;
  conditions: Omit<Conditions, "turbulenceEnabled"> & {
    turbulenceEnabled: boolean;
  };
  note: string;
}

export interface TelemetryPoint {
  time: number;
  energyPct: number;
  stabilityPct: number;
  crossTrackM: number;
}
