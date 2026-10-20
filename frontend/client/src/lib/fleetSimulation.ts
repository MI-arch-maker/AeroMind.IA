import { runSimulation, type ConceptConfig } from "./aeroEngine";

export type FleetMissionKind = "observation" | "cartography" | "logistics" | "search-rescue";

export type FleetScenario = {
  aircraftCount: number;
  payloadKgPerAircraft: number;
  missionDistanceKm: number;
  loiterMinutes: number;
  windKmh: number;
  reserveFraction: number;
  batteryAgingPct: number;
  linkLossProbabilityPct: number;
  returnOnLinkLoss: boolean;
  missionKind: FleetMissionKind;
};

export type FleetAircraftResult = {
  index: number;
  payloadKg: number;
  estimatedPowerW: number;
  usableEnergyWh: number;
  enduranceH: number;
  requiredFlightH: number;
  marginH: number;
  status: "pass" | "review" | "fail";
  recovery: "nominal" | "return-on-link-loss" | "hold-for-review";
};

export type FleetSimulationResult = {
  scenario: FleetScenario;
  aircraft: FleetAircraftResult[];
  totalPayloadKg: number;
  totalUsableEnergyWh: number;
  missionTimeH: number;
  fleetEnduranceMarginH: number;
  coverageCapacityKm: number;
  overallStatus: "pass" | "review" | "fail";
  risks: string[];
  assumptions: string[];
};

export const defaultFleetScenario: FleetScenario = {
  aircraftCount: 3,
  payloadKgPerAircraft: 1.5,
  missionDistanceKm: 18,
  loiterMinutes: 12,
  windKmh: 18,
  reserveFraction: 0.22,
  batteryAgingPct: 8,
  linkLossProbabilityPct: 2,
  returnOnLinkLoss: true,
  missionKind: "observation",
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export function simulateFleet(config: ConceptConfig, input: Partial<FleetScenario> = {}): FleetSimulationResult {
  const scenario: FleetScenario = {
    ...defaultFleetScenario,
    ...input,
    aircraftCount: Math.round(clamp(input.aircraftCount ?? defaultFleetScenario.aircraftCount, 1, 24)),
    payloadKgPerAircraft: round(clamp(input.payloadKgPerAircraft ?? defaultFleetScenario.payloadKgPerAircraft, 0, 25)),
    missionDistanceKm: round(clamp(input.missionDistanceKm ?? defaultFleetScenario.missionDistanceKm, 0.1, 500)),
    loiterMinutes: round(clamp(input.loiterMinutes ?? defaultFleetScenario.loiterMinutes, 0, 240)),
    windKmh: round(clamp(input.windKmh ?? defaultFleetScenario.windKmh, 0, 120)),
    reserveFraction: round(clamp(input.reserveFraction ?? defaultFleetScenario.reserveFraction, 0.05, 0.5), 3),
    batteryAgingPct: round(clamp(input.batteryAgingPct ?? defaultFleetScenario.batteryAgingPct, 0, 50)),
    linkLossProbabilityPct: round(clamp(input.linkLossProbabilityPct ?? defaultFleetScenario.linkLossProbabilityPct, 0, 100)),
  };
  const aircraft = Array.from({ length: scenario.aircraftCount }, (_, index) => {
    const payloadConfig = { ...config, payloadKg: scenario.payloadKgPerAircraft, windSpeedKmh: scenario.windKmh, reserveFraction: scenario.reserveFraction };
    const baseline = runSimulation(payloadConfig, [], `FLEET-${String(index + 1).padStart(2, "0")}`);
    const agingFactor = 1 - scenario.batteryAgingPct / 100;
    const linkFactor = 1 + scenario.linkLossProbabilityPct / 100 * 0.015;
    const usableEnergyWh = baseline.energyUsableWh * agingFactor;
    const missionTimeH = scenario.missionDistanceKm / Math.max(1, config.cruiseSpeedKmh) + scenario.loiterMinutes / 60;
    const requiredFlightH = missionTimeH * linkFactor;
    const enduranceH = usableEnergyWh / Math.max(1, baseline.estimatedPowerW);
    const marginH = enduranceH - requiredFlightH;
    const status: FleetAircraftResult["status"] = marginH < 0 ? "fail" : marginH < 0.25 ? "review" : "pass";
    return {
      index: index + 1,
      payloadKg: scenario.payloadKgPerAircraft,
      estimatedPowerW: round(baseline.estimatedPowerW, 0),
      usableEnergyWh: round(usableEnergyWh, 0),
      enduranceH: round(enduranceH),
      requiredFlightH: round(requiredFlightH),
      marginH: round(marginH),
      status,
      recovery: scenario.returnOnLinkLoss ? "return-on-link-loss" as const : "hold-for-review" as const,
    };
  });
  const risks: string[] = [];
  if (scenario.batteryAgingPct >= 15) risks.push("Vieillissement batterie élevé : confirmer par mesures et essais représentatifs.");
  if (scenario.linkLossProbabilityPct > 5) risks.push("Probabilité de perte de liaison élevée : vérifier la couverture et la procédure de retour sûr.");
  if (!scenario.returnOnLinkLoss) risks.push("Aucun retour automatique simulé sur perte de liaison : revue opérateur obligatoire.");
  if (scenario.windKmh > 35) risks.push("Vent de scénario supérieur à 35 km/h : modèle préliminaire, stabilité à vérifier.");
  if (scenario.missionKind === "logistics") risks.push("Charge logistique : vérifier arrimage, centre de gravité et procédure de largage/prise en charge; aucune action de largage n'est simulée.");
  const totalPayloadKg = scenario.aircraftCount * scenario.payloadKgPerAircraft;
  const totalUsableEnergyWh = aircraft.reduce((sum, item) => sum + item.usableEnergyWh, 0);
  const missionTimeH = scenario.missionDistanceKm / Math.max(1, config.cruiseSpeedKmh) + scenario.loiterMinutes / 60;
  const fleetEnduranceMarginH = Math.min(...aircraft.map(item => item.marginH));
  const coverageCapacityKm = round(aircraft.reduce((sum, item) => sum + Math.max(0, config.cruiseSpeedKmh * item.enduranceH), 0));
  const overallStatus = aircraft.some(item => item.status === "fail") ? "fail" : aircraft.some(item => item.status === "review") || risks.length ? "review" : "pass";
  return {
    scenario,
    aircraft,
    totalPayloadKg: round(totalPayloadKg),
    totalUsableEnergyWh: round(totalUsableEnergyWh, 0),
    missionTimeH: round(missionTimeH),
    fleetEnduranceMarginH: round(fleetEnduranceMarginH),
    coverageCapacityKm,
    overallStatus,
    risks,
    assumptions: [
      "Simulation déterministe de charge utile, énergie et liaison; pas de CFD, météo temps réel ou modèle de trafic.",
      "Les appareils sont supposés identiques et lancés dans le même scénario; aucune coordination tactique n'est calculée.",
      "Les fonctions d'armement, ciblage, poursuite et emploi offensif sont hors périmètre.",
    ],
  };
}
