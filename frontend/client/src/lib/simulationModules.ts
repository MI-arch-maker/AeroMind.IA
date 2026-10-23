export type SimulationModule = {
  id: string;
  label: string;
  formula: string;
  inputs: string[];
  uncertainty: string;
  limits: string;
};

export const simulationModules: SimulationModule[] = [
  { id: "aerodynamics", label: "Aérodynamique préliminaire", formula: "S = envergure × corde ; charge alaire = masse / S", inputs: ["wingspan", "chord", "totalMassKg"], uncertainty: "±6 %", limits: "Pas de CFD, profil et effets de sol non résolus" },
  { id: "propulsion", label: "Propulsion", formula: "P = (165 + 8m + 0,4V + 1,4W) × facteur architecture", inputs: ["totalMassKg", "cruiseSpeedKmh", "windSpeedKmh", "airframe"], uncertainty: "±15 %", limits: "Rendement moteur/hélice supposé constant" },
  { id: "battery", label: "Batterie", formula: "Eutile = capacité × (1 − réserve)", inputs: ["batteryWh", "reserveFraction"], uncertainty: "±10 %", limits: "Vieillissement, température et courant de pointe non modélisés" },
  { id: "mass", label: "Masse & centre de gravité", formula: "Mtotale = structure + batterie + propulsion + avionique + charge utile", inputs: ["geometry", "batteryWh", "payloadKg"], uncertainty: "±8 %", limits: "Centre de gravité global à confirmer par CAO et pesée" },
  { id: "endurance", label: "Autonomie", formula: "t = Eutile / puissance moyenne ; distance = t × vitesse", inputs: ["energyUsableWh", "estimatedPowerW", "cruiseSpeedKmh"], uncertainty: "±20 %", limits: "Vent et trajectoire supposés stationnaires" },
  { id: "weather", label: "Météo & vent", formula: "marge vent = max(0, (vent cible − vent scénario) / vent cible)", inputs: ["windSpeedKmh", "windTarget"], uncertainty: "Qualitative", limits: "Ne remplace pas une étude de stabilité" },
  { id: "payload", label: "Charge utile", formula: "charge installée ≥ charge exigée", inputs: ["payloadKg", "payloadTarget"], uncertainty: "±3 %", limits: "Position et enveloppe de charge non résolues" },
  { id: "risk", label: "Risques & sensibilité", formula: "règles de seuil sur métriques et exigences", inputs: ["metrics", "requirements"], uncertainty: "Dépend des hypothèses", limits: "Analyse de sensibilité complète à venir" },
];
