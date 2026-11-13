export type CalibrationStatus = "pass" | "review" | "fail";
export type PayloadCalibrationCheck = {
  id: string;
  label: string;
  status: CalibrationStatus;
  measured: string;
  target: string;
  detail: string;
};
export type PayloadCalibrationReport = {
  id: string;
  equipmentId: string;
  equipmentLabel: string;
  generatedAt: string;
  modelVersion: "AEROMIND-SIM-CAL-1.0";
  overall: CalibrationStatus;
  source: "simulation-locale";
  parameters: { gimbalPitchDeg: number; fieldOfViewDeg: number; nominalFieldOfViewDeg: number };
  checks: PayloadCalibrationCheck[];
  limitations: string[];
};
export type PayloadCalibrationProfile = {
  gimbalPitchDeg: number;
  fieldOfViewDeg: number;
  lastReport?: PayloadCalibrationReport;
  reportStale?: boolean;
};

export type CalibrationModuleSpec = {
  id: string;
  label: string;
  nominalFieldOfViewDeg: number;
};

const statusFromThreshold = (value: number, passAt: number, reviewAt: number): CalibrationStatus =>
  value <= passAt ? "pass" : value <= reviewAt ? "review" : "fail";

export function runPayloadCalibration(input: {
  module: CalibrationModuleSpec;
  installed: boolean;
  gimbalPitchDeg: number;
  fieldOfViewDeg: number;
  generatedAt?: string;
  reportId?: string;
}): PayloadCalibrationReport {
  const { module, installed, gimbalPitchDeg, fieldOfViewDeg } = input;
  const fovError = Math.abs(fieldOfViewDeg - module.nominalFieldOfViewDeg);
  const axisResidual = Number((Math.abs(gimbalPitchDeg) * 0.08 + fovError * 0.04).toFixed(2));
  const checks: PayloadCalibrationCheck[] = [
    {
      id: "equipment-presence",
      label: "Présence dans la nomenclature",
      status: installed ? "pass" : "fail",
      measured: installed ? "Installé" : "Absent",
      target: "Équipement installé",
      detail: installed ? "La référence est rattachée au modèle actif." : "Installez cet équipement dans le modèle avant le test.",
    },
    {
      id: "gimbal-range",
      label: "Plage d’inclinaison de nacelle",
      status: statusFromThreshold(Math.abs(gimbalPitchDeg), 30, 40),
      measured: `${gimbalPitchDeg.toFixed(1)}°`,
      target: "|inclinaison| ≤ 30°",
      detail: Math.abs(gimbalPitchDeg) <= 30 ? "Dans la plage nominale du scénario." : Math.abs(gimbalPitchDeg) <= 40 ? "Proche de la limite du scénario; revue conseillée." : "Hors tolérance du scénario de calibration.",
    },
    {
      id: "fov-reference",
      label: "Écart au champ nominal du module",
      status: statusFromThreshold(fovError, 5, 15),
      measured: `${fieldOfViewDeg.toFixed(1)}° (écart ${fovError.toFixed(1)}°)`,
      target: `${module.nominalFieldOfViewDeg}° ± 5°`,
      detail: fovError <= 5 ? "Champ dans la tolérance nominale." : fovError <= 15 ? "Écart modéré; vérification opérateur recommandée." : "Écart important au nominal; résultat non conforme au scénario.",
    },
    {
      id: "axis-residual",
      label: "Résidu d’alignement calculé",
      status: statusFromThreshold(axisResidual, 2, 4),
      measured: `${axisResidual.toFixed(2)} u.s.`,
      target: "≤ 2,00 u.s.",
      detail: "Résidu calculé par le modèle logiciel à partir de l’inclinaison et de l’écart de champ; ce n’est pas une lecture capteur.",
    },
  ];
  const overall: CalibrationStatus = checks.some(check => check.status === "fail")
    ? "fail"
    : checks.some(check => check.status === "review") ? "review" : "pass";
  return {
    id: input.reportId ?? `CAL-${Date.now().toString(36).toUpperCase()}`,
    equipmentId: module.id,
    equipmentLabel: module.label,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    modelVersion: "AEROMIND-SIM-CAL-1.0",
    overall,
    source: "simulation-locale",
    parameters: { gimbalPitchDeg, fieldOfViewDeg, nominalFieldOfViewDeg: module.nominalFieldOfViewDeg },
    checks,
    limitations: [
      "Résultats issus d’un modèle déterministe local; aucun capteur n’a été interrogé.",
      "Aucune commande, calibration ou activation matérielle n’a été effectuée.",
      "Les tolérances sont des critères de démonstration, pas des spécifications fabricant ni une certification métrologique.",
    ],
  };
}
