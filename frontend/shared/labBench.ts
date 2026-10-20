export type LabBenchMode = "simulation" | "connected" | "authorized";

export type ThermalSimulationInput = {
  ambientC: number;
  heaterPowerW: number;
  dutyCycle: number;
  thermalResistanceCPerW: number;
  durationSeconds: number;
  positionSetpointDeg: number;
};

export const LAB_BENCH_ENGINE_VERSION = "labbench-thermal-v1.0.0";

export const LAB_BENCH_REQUIREMENTS = [
  { code: "REQ-ENV-001", title: "Température mesurée", limit: "18 à 30", unit: "°C", source: "Banc LabBench 01", acceptance: "Capteur valide et dans la plage définie", status: "approved" },
  { code: "REQ-MEC-002", title: "Position de l’actionneur", limit: "0 à 90", unit: "°", source: "Spécification servo faible énergie", acceptance: "Aucune commande hors limite", status: "approved" },
  { code: "REQ-SAF-003", title: "État sûr", limit: "< 500", unit: "ms", source: "Analyse de risques à compléter", acceptance: "Interverrouillage et arrêt physique vérifiés", status: "review" },
  { code: "REQ-DAT-004", title: "Qualité de télémétrie", limit: ">= 95", unit: "%", source: "Protocole d’essai", acceptance: "Échantillons horodatés et cohérents", status: "approved" },
] as const;

export const LAB_BENCH_ASSETS = {
  device: {
    code: "LB01-EMU-001",
    manufacturer: "AeroMind reference rig",
    model: "LabBench 01 / émulateur",
    hardwareRevision: "REV-A",
    firmwareVersion: "0.4.2-sim",
    interfaces: ["USB-C série simulée", "GPIO logique simulé"],
    limits: ["12 Vcc / 1 A", "servo 0–90°", "aucune charge dangereuse"],
  },
  driver: {
    name: "AeroMind Device Gateway – LabBench adapter",
    version: "0.1.0-sim",
    protocol: "AMDG structured command v1",
    permissions: "lecture seule par défaut",
    validation: "émulateur validé pour essais logiciels",
    allowedCommands: ["read.temperature", "read.position", "simulate.servo.setpoint"],
  },
} as const;

const finite = (value: number, field: string) => {
  if (!Number.isFinite(value)) throw new Error(`${field} doit être un nombre fini.`);
  return value;
};

const inRange = (value: number, min: number, max: number, field: string) => {
  finite(value, field);
  if (value < min || value > max) throw new Error(`${field} doit rester entre ${min} et ${max}.`);
  return value;
};

export function runThermalSimulation(input: ThermalSimulationInput) {
  const ambientC = inRange(input.ambientC, -10, 50, "La température ambiante");
  const heaterPowerW = inRange(input.heaterPowerW, 0, 12, "La puissance du chauffage");
  const dutyCycle = inRange(input.dutyCycle, 0, 1, "Le rapport cyclique");
  const thermalResistanceCPerW = inRange(input.thermalResistanceCPerW, 0.1, 12, "La résistance thermique");
  const durationSeconds = inRange(input.durationSeconds, 1, 3_600, "La durée");
  const positionSetpointDeg = inRange(input.positionSetpointDeg, 0, 90, "La consigne de position");

  const effectivePowerW = heaterPowerW * dutyCycle;
  const predictedTemperatureC = ambientC + effectivePowerW * thermalResistanceCPerW;
  const uncertaintyC = Math.sqrt(0.25 ** 2 + (effectivePowerW * 0.08) ** 2).toFixed(2);
  const energyWh = (effectivePowerW * durationSeconds) / 3600;
  const sampleCount = 12;
  const telemetry = Array.from({ length: sampleCount }, (_, index) => {
    const progress = (index + 1) / sampleCount;
    const response = ambientC + (predictedTemperatureC - ambientC) * (1 - Math.exp(-3 * progress));
    return {
      sequence: index + 1,
      elapsedSeconds: Math.round(durationSeconds * progress),
      temperatureC: Number(response.toFixed(2)),
      positionDeg: positionSetpointDeg,
      quality: index === sampleCount - 1 ? "validated" : "synthetic",
    };
  });

  return {
    engineVersion: LAB_BENCH_ENGINE_VERSION,
    input: { ambientC, heaterPowerW, dutyCycle, thermalResistanceCPerW, durationSeconds, positionSetpointDeg },
    formula: "T = T_amb + (P × duty) × Rθ",
    effectivePowerW: Number(effectivePowerW.toFixed(2)),
    predictedTemperatureC: Number(predictedTemperatureC.toFixed(2)),
    uncertaintyC: Number(uncertaintyC),
    energyWh: Number(energyWh.toFixed(3)),
    telemetry,
    verdict: predictedTemperatureC >= 18 && predictedTemperatureC <= 30 ? "pass" : "review",
    limitations: [
      "Modèle stationnaire simplifié : aucune dynamique thermique de pièce réelle n’est identifiée.",
      "Les données sont synthétiques et ne constituent pas des mesures physiques.",
      "Ce calcul n’autorise aucune commande matérielle.",
    ],
  } as const;
}

export type CommandGateInput = {
  mode: LabBenchMode;
  deviceConnected: boolean;
  humanConfirmed: boolean;
  estopVerified: boolean;
  driverValidated: boolean;
  positionSetpointDeg: number;
};

export function evaluateLabBenchCommand(input: CommandGateInput) {
  const checks = [
    { id: "mode", label: "Mode opération autorisée", pass: input.mode === "authorized" },
    { id: "link", label: "Équipement identifié et connecté", pass: input.deviceConnected },
    { id: "person", label: "Confirmation humaine enregistrée", pass: input.humanConfirmed },
    { id: "estop", label: "Arrêt physique / interverrouillage vérifié", pass: input.estopVerified },
    { id: "driver", label: "Pilote validé", pass: input.driverValidated },
    { id: "limit", label: "Consigne dans 0–90°", pass: input.positionSetpointDeg >= 0 && input.positionSetpointDeg <= 90 },
  ];
  const passedPreconditions = checks.every(check => check.pass);

  return {
    command: { name: "simulate.servo.setpoint", unit: "degree", value: input.positionSetpointDeg },
    checks,
    passedPreconditions,
    accepted: false,
    disposition: "blocked" as const,
    reason: passedPreconditions
      ? "Passerelle matérielle absente : la commande est journalisée comme préparation, aucune trame ne peut être envoyée."
      : "Préconditions incomplètes : aucune commande n’est préparée et aucune trame ne peut être envoyée.",
    safeState: "sorties physiques non configurées / lecture seule maintenue",
  };
}
