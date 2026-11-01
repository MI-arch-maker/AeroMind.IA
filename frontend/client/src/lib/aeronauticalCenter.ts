import type { ConceptConfig, DroneArchitecture } from "./aeroEngine";

export type AeronauticalRole = "observation" | "cartography" | "logistics" | "search-rescue" | "training";
export type FleetUnitStatus = "ready" | "review" | "offline" | "maintenance";
export type FleetUnit = { id: string; callsign: string; airframe: DroneArchitecture; role: AeronauticalRole; status: FleetUnitStatus; batteryPct: number; hours: number; lastCheck: string; }; 
export type EquipmentOption = {
  id: string;
  label: string;
  category: string;
  massKg: number;
  /** Consommation électrique déclarée, en watts (hypothèse d'avant-projet). */
  powerW: number;
  interface: string;
  verified: boolean;
};

export type EquipmentLoad = {
  /** Masse cumulée des équipements installés, en kg. */
  equipmentMassKg: number;
  /** Consommation cumulée des équipements installés, en W. */
  equipmentPowerW: number;
  /** Masse à vide estimée de la cellule selon l'architecture retenue. */
  airframeMassKg: number;
  /** Masse maximale recalculée = cellule + équipements + charge utile. */
  computedMaxMassKg: number;
  /** Consommation totale estimée = équipements + propulsion. */
  computedPowerW: number;
  /** Autonomie indicative en minutes pour la batterie utile renseignée. */
  enduranceMin: number;
  /** Marge entre la masse recalculée et la masse maximale déclarée. */
  massMarginKg: number;
  installedCount: number;
};

export const aeronauticalRoles: Array<{ id: AeronauticalRole; label: string }> = [
  { id: "observation", label: "Observation" },
  { id: "cartography", label: "Cartographie" },
  { id: "logistics", label: "Logistique" },
  { id: "search-rescue", label: "Recherche-secours" },
  { id: "training", label: "Entraînement" },
];
export const equipmentOptions: EquipmentOption[] = [
  { id: "eo-gimbal", label: "Capteur électro-optique stabilisé", category: "Mission", massKg: 0.42, powerW: 14, interface: "USB-C / 12 V", verified: true },
  { id: "thermal", label: "Capteur thermique radiométrique", category: "Mission", massKg: 0.31, powerW: 11, interface: "Ethernet / 12 V", verified: true },
  { id: "mapping", label: "Caméra cartographique haute résolution", category: "Mission", massKg: 0.55, powerW: 19, interface: "MIPI / 12 V", verified: true },
  { id: "rtk", label: "Récepteur GNSS RTK", category: "Navigation", massKg: 0.09, powerW: 3.5, interface: "UART / PPS", verified: true },
  { id: "relay", label: "Relais de communication longue portée", category: "Liaison", massKg: 0.18, powerW: 9, interface: "Ethernet / 5 V", verified: false },
  { id: "parachute", label: "Système de récupération parachute", category: "Sécurité", massKg: 0.24, powerW: 0.8, interface: "GPIO / 5 V", verified: true },
  { id: "cargo", label: "Baie de charge modulaire", category: "Logistique", massKg: 0.38, powerW: 1.5, interface: "Mécanique / verrou", verified: false },
];

/** Masse à vide indicative de la cellule, par architecture. */
export const airframeEmptyMassKg: Record<DroneArchitecture, number> = {
  quadcopter: 1.35,
  vtol: 2.4,
  "fixed-wing": 1.95,
};

/** Puissance de propulsion et d'avionique hors équipements de mission. */
export function baselinePowerW(config: ConceptConfig): number {
  const motors = Math.max(1, Math.round(config.motorCount ?? (config.airframe === "quadcopter" ? 4 : 1)));
  const perMotorW = config.airframe === "fixed-wing" ? 62 : 78;
  return motors * perMotorW + 16;
}

/**
 * Recalcule en direct la masse maximale et la consommation de la batterie à
 * partir des équipements réellement cochés dans la baie. Calcul préliminaire,
 * jamais une mesure sur aéronef.
 */
export function computeEquipmentLoad(
  config: ConceptConfig,
  equipment: EquipmentOption[]
): EquipmentLoad {
  const equipmentMassKg = equipment.reduce((sum, item) => sum + item.massKg, 0);
  const equipmentPowerW = equipment.reduce((sum, item) => sum + item.powerW, 0);
  const airframeMassKg = config.airframe ? airframeEmptyMassKg[config.airframe] : 0;
  const computedMaxMassKg = airframeMassKg + equipmentMassKg + (config.payloadKg ?? 0);
  const computedPowerW = baselinePowerW(config) + equipmentPowerW;
  const usableWh = Math.max(0, (config.batteryWh ?? 0) * 0.86);
  const enduranceMin = computedPowerW > 0 ? (usableWh / computedPowerW) * 60 : 0;
  return {
    equipmentMassKg: Number(equipmentMassKg.toFixed(3)),
    equipmentPowerW: Number(equipmentPowerW.toFixed(1)),
    airframeMassKg,
    computedMaxMassKg: Number(computedMaxMassKg.toFixed(2)),
    computedPowerW: Number(computedPowerW.toFixed(1)),
    enduranceMin: Number(enduranceMin.toFixed(1)),
    massMarginKg: Number(((config.maxTakeoffKg ?? 0) - computedMaxMassKg).toFixed(2)),
    installedCount: equipment.length,
  };
}
export const defaultFleetUnits: FleetUnit[] = [
  { id: "unit-01", callsign: "AER-01", airframe: "quadcopter", role: "observation", status: "ready", batteryPct: 92, hours: 18.4, lastCheck: "Prévol validée" },
  { id: "unit-02", callsign: "AER-02", airframe: "vtol", role: "cartography", status: "review", batteryPct: 64, hours: 42.1, lastCheck: "Vérification capteur requise" },
  { id: "unit-03", callsign: "AER-03", airframe: "fixed-wing", role: "search-rescue", status: "maintenance", batteryPct: 31, hours: 76.8, lastCheck: "Maintenance planifiée" },
  { id: "unit-04", callsign: "AER-04", airframe: "quadcopter", role: "training", status: "offline", batteryPct: 0, hours: 8.2, lastCheck: "Hors réseau" },
];

export function evaluateReadiness(config: ConceptConfig, equipment: EquipmentOption[], role: AeronauticalRole) {
  const checks = [
    { id: "airframe", label: "Architecture sélectionnée", pass: Boolean(config.airframe) },
    { id: "energy", label: "Batterie et réserve renseignées", pass: config.batteryWh > 0 && config.reserveFraction >= 0.05 },
    { id: "mass", label: "Masse maximale définie", pass: config.maxTakeoffKg > 0 },
    { id: "navigation", label: "Navigation compatible", pass: equipment.some(item => item.id === "rtk") },
    { id: "payload", label: `Équipement mission ${role}`, pass: equipment.some(item => item.category === "Mission" || (role === "logistics" && item.id === "cargo")) },
    { id: "safety", label: "Équipement de sécurité", pass: equipment.some(item => item.id === "parachute") },
  ];
  const passed = checks.filter(check => check.pass).length;
  return { checks, passed, total: checks.length, status: passed === checks.length ? "ready" as const : passed >= 4 ? "review" as const : "blocked" as const };
}
