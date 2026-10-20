export type AutonomyMode = "manual" | "supervised" | "safe-return" | "emergency-land";

export type MissionPlan = {
  name: string;
  maxAltitudeM: number;
  maxSpeedKmh: number;
  geofenceRadiusKm: number;
  returnOnLinkLoss: boolean;
  minimumBatteryPercent: number;
  humanApproval: boolean;
};

export type MissionCheck = {
  id: string;
  label: string;
  passed: boolean;
  severity: "blocking" | "warning";
  message: string;
};

export const defaultMissionPlan: MissionPlan = {
  name: "Mission de démonstration ATLAS",
  maxAltitudeM: 120,
  maxSpeedKmh: 65,
  geofenceRadiusKm: 5,
  returnOnLinkLoss: true,
  minimumBatteryPercent: 25,
  humanApproval: true,
};

export function validateMissionPlan(plan: MissionPlan): MissionCheck[] {
  return [
    { id: "human-approval", label: "Validation humaine", passed: plan.humanApproval, severity: "blocking", message: plan.humanApproval ? "Un opérateur doit approuver le départ." : "Départ interdit sans validation humaine." },
    { id: "altitude", label: "Limite d’altitude", passed: plan.maxAltitudeM > 0 && plan.maxAltitudeM <= 120, severity: "blocking", message: plan.maxAltitudeM <= 120 ? "Altitude plafonnée dans la limite configurée." : "Altitude supérieure à la limite de démonstration." },
    { id: "link-loss", label: "Perte de liaison", passed: plan.returnOnLinkLoss, severity: "blocking", message: plan.returnOnLinkLoss ? "Retour automatique configuré." : "Aucune procédure de perte de liaison." },
    { id: "battery", label: "Réserve batterie", passed: plan.minimumBatteryPercent >= 20, severity: "warning", message: plan.minimumBatteryPercent >= 20 ? "Réserve minimale conservée." : "Réserve batterie trop faible." },
    { id: "geofence", label: "Géorepérage", passed: plan.geofenceRadiusKm > 0 && plan.geofenceRadiusKm <= 25, severity: "blocking", message: plan.geofenceRadiusKm <= 25 ? "Géorepérage actif." : "Rayon de géorepérage excessif." },
  ];
}

export function canLaunchMission(plan: MissionPlan) {
  return validateMissionPlan(plan).every(check => check.passed || check.severity !== "blocking");
}
