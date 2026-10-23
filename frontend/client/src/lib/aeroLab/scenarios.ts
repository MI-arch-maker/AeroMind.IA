import type { Criteria, LabConfig, Scenario } from "./types";

export const defaultCriteria: Criteria = {
  minStabilityPct: 78,
  minReservePct: 22,
  maxCrossTrackM: 5,
  minQualityPct: 76,
};

export const scenarios: Scenario[] = [
  {
    id: "solar-inspection",
    name: "Inspection d’infrastructure",
    mission: {
      kind: "inspection",
      label: "Inspection solaire",
      objective:
        "Inspecter une rangée d’équipements avec une charge utile capteur déclarée.",
    },
    drone: {
      profile: "VTOL de service · AM-04",
      emptyMassKg: 3.2,
      payloadLimitKg: 1.2,
      batteryWh: 520,
      cruiseSpeedMps: 13,
      nominalPowerW: 370,
      stabilityRating: 93,
    },
    conditions: {
      windMps: 4,
      temperatureC: 18,
      payloadKg: 0.45,
      reservePct: 22,
      distanceKm: 5.5,
      altitudeM: 85,
      turbulenceEnabled: true,
    },
    note: "Référence de service : vent modéré, inspection courte, charge capteur légère.",
  },
  {
    id: "area-mapping",
    name: "Cartographie de zone",
    mission: {
      kind: "mapping",
      label: "Cartographie civile",
      objective:
        "Balayer une zone déclarée et estimer la couverture utile du scénario.",
    },
    drone: {
      profile: "Aile fixe cartographique · AM-07",
      emptyMassKg: 4.8,
      payloadLimitKg: 1.0,
      batteryWh: 760,
      cruiseSpeedMps: 18,
      nominalPowerW: 430,
      stabilityRating: 90,
    },
    conditions: {
      windMps: 3,
      temperatureC: 21,
      payloadKg: 0.6,
      reservePct: 24,
      distanceKm: 12,
      altitudeM: 120,
      turbulenceEnabled: true,
    },
    note: "Trajectoire plus longue pour comparer endurance et énergie estimées.",
  },
  {
    id: "search-rescue",
    name: "Recherche et sauvetage simulé",
    mission: {
      kind: "rescue",
      label: "SAR simulé",
      objective:
        "Évaluer un parcours de recherche de service sans personne ni aéronef réel.",
    },
    drone: {
      profile: "Multirotor d’observation · AM-02",
      emptyMassKg: 2.9,
      payloadLimitKg: 0.9,
      batteryWh: 460,
      cruiseSpeedMps: 11,
      nominalPowerW: 410,
      stabilityRating: 95,
    },
    conditions: {
      windMps: 7,
      temperatureC: 8,
      payloadKg: 0.55,
      reservePct: 25,
      distanceKm: 4.8,
      altitudeM: 60,
      turbulenceEnabled: true,
    },
    note: "Conditions de service difficiles : vent soutenu et température basse.",
  },
];

export const initialConfig: LabConfig = {
  drone: scenarios[0].drone,
  mission: scenarios[0].mission,
  conditions: { ...scenarios[0].conditions },
  criteria: defaultCriteria,
};
