import { defaultConcept, defaultRequirements, runSimulation, type ConceptConfig, type Requirement } from "./aeroEngine";

export type ReferenceScenario = {
  id: string;
  label: string;
  mission: string;
  config: ConceptConfig;
  requirements: Requirement[];
  expected: { maxMassKg?: number; minEnduranceH?: number; maxWindKmh?: number; mustHaveOpenRisk?: string };
};

const withReq = (id: string, value: number): Requirement[] =>
  defaultRequirements.map(item => item.id === id ? { ...item, value } : item);

export const referenceScenarios: ReferenceScenario[] = [
  { id: "electrical-inspection", label: "Inspection de ligne électrique", mission: "Inspection linéaire avec capteur stabilisé", config: defaultConcept, requirements: defaultRequirements, expected: { maxMassKg: 10.5, maxWindKmh: 30 } },
  { id: "agriculture", label: "Drone agricole", mission: "Cartographie et pulvérisation de parcelles", config: { ...defaultConcept, payloadKg: 2.5, batteryWh: 1050, cruiseSpeedKmh: 45 }, requirements: withReq("payload", 2.5), expected: { maxWindKmh: 25 } },
  { id: "mapping", label: "Cartographie", mission: "Acquisition photogrammétrique longue endurance", config: { ...defaultConcept, payloadKg: 1.2, batteryWh: 1200, cruiseSpeedKmh: 58 }, requirements: withReq("endurance", 3), expected: { minEnduranceH: 3 } },
  { id: "civil-surveillance", label: "Surveillance civile", mission: "Observation civile non armée et documentée", config: { ...defaultConcept, airframe: "quadcopter", motorCount: 4, batteryWh: 900, cruiseSpeedKmh: 35 }, requirements: defaultRequirements, expected: { maxWindKmh: 30 } },
  { id: "long-range-vtol", label: "VTOL longue portée", mission: "Décollage vertical puis transit longue portée", config: { ...defaultConcept, airframe: "vtol", motorCount: 5, batteryWh: 1300, cruiseSpeedKmh: 70 }, requirements: withReq("endurance", 2.5), expected: { minEnduranceH: 2.5 } },
  { id: "hot-zone", label: "Mission en zone chaude", mission: "Mission avec dérating thermique prudent", config: { ...defaultConcept, batteryWh: 950, windSpeedKmh: 20, altitudeM: 80 }, requirements: defaultRequirements, expected: { maxWindKmh: 30 } },
  { id: "strong-wind", label: "Mission avec vent fort", mission: "Scénario de vent défavorable", config: { ...defaultConcept, windSpeedKmh: 38 }, requirements: withReq("wind", 30), expected: { mustHaveOpenRisk: "wind-risk" } },
  { id: "lost-link", label: "Perte de communication", mission: "Retour automatique sur perte de liaison", config: { ...defaultConcept, batteryWh: 900 }, requirements: defaultRequirements, expected: { maxMassKg: 10.5 } },
  { id: "degraded-battery", label: "Batterie dégradée", mission: "Capacité réduite et réserve maintenue", config: { ...defaultConcept, batteryWh: 420 }, requirements: defaultRequirements, expected: { mustHaveOpenRisk: "energy-risk" } },
  { id: "heavy-payload", label: "Charge utile lourde", mission: "Capteur lourd avec contrôle de masse", config: { ...defaultConcept, payloadKg: 3.6, batteryWh: 1400 }, requirements: defaultRequirements, expected: { mustHaveOpenRisk: "mass-risk" } },
];

export function replayReferenceScenario(scenario: ReferenceScenario) {
  const result = runSimulation(scenario.config, scenario.requirements, `REF-${scenario.id}`);
  const checks = [
    scenario.expected.maxMassKg === undefined || result.totalMassKg <= scenario.expected.maxMassKg,
    scenario.expected.minEnduranceH === undefined || result.enduranceH >= scenario.expected.minEnduranceH,
    scenario.expected.maxWindKmh === undefined || scenario.config.windSpeedKmh <= scenario.expected.maxWindKmh,
    scenario.expected.mustHaveOpenRisk === undefined || result.risks.some(risk => risk.id === scenario.expected.mustHaveOpenRisk && risk.status === "open"),
  ];
  return { scenarioId: scenario.id, runId: result.runId, passed: checks.every(Boolean), checks, result };
}
