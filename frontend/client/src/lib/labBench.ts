export type LabBenchScenario = {
  ambientC: number;
  heaterPowerW: number;
  dutyCycle: number;
  thermalResistanceCPerW: number;
  durationSeconds: number;
  positionSetpointDeg: number;
};
export const defaultLabBenchScenario: LabBenchScenario = {
  ambientC: 21,
  heaterPowerW: 4,
  dutyCycle: 0.4,
  thermalResistanceCPerW: 3.2,
  durationSeconds: 120,
  positionSetpointDeg: 45,
};
export const scenarioBounds: Record<
  keyof LabBenchScenario,
  readonly [number, number]
> = {
  ambientC: [-10, 50],
  heaterPowerW: [0, 12],
  dutyCycle: [0, 1],
  thermalResistanceCPerW: [0.1, 12],
  durationSeconds: [1, 3600],
  positionSetpointDeg: [0, 90],
};
export function recordOf(value: unknown): Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}
export function normalizeLabBenchScenario(value: unknown): LabBenchScenario {
  const source = recordOf(value);
  const next = { ...defaultLabBenchScenario };
  for (const key of Object.keys(scenarioBounds) as Array<
    keyof LabBenchScenario
  >) {
    const candidate = source[key];
    const [minimum, maximum] = scenarioBounds[key];
    if (
      typeof candidate === "number" &&
      Number.isFinite(candidate) &&
      candidate >= minimum &&
      candidate <= maximum
    ) {
      next[key] = candidate;
    }
  }
  return next;
}
export function validateLabBenchScenario(
  value: LabBenchScenario,
): string | null {
  for (const key of Object.keys(scenarioBounds) as Array<
    keyof LabBenchScenario
  >) {
    const [minimum, maximum] = scenarioBounds[key];
    if (
      !Number.isFinite(value[key]) ||
      value[key] < minimum ||
      value[key] > maximum
    ) {
      return `${key} : valeur attendue entre ${minimum} et ${maximum}.`;
    }
  }
  return null;
}
export type LabBenchSample = {
  sequence: number;
  elapsedSeconds: number;
  temperatureC: number;
  positionDeg: number;
  quality: string;
};
export type LabBenchResult = {
  runId: string;
  predictedTemperatureC: number;
  uncertaintyC: number;
  engineVersion: string;
  verdict: string;
  contentSha256: string;
  telemetry: LabBenchSample[];
  inputs: LabBenchScenario;
  formula: string;
  physicalCommandsEmitted: false;
  physicalOutputEnabled: false;
  synthetic: true;
  source: "local" | "api" | "server-archived";
  persisted: boolean;
  projectId?: string;
  evidenceLevel: string;
  limits: string[];
};
export function calculateLocalLabBenchResult(
  scenario: LabBenchScenario,
): LabBenchResult {
  const error = validateLabBenchScenario(scenario);
  if (error) throw new Error(error);
  const predicted = Number(
    (
      scenario.ambientC +
      scenario.heaterPowerW *
        scenario.dutyCycle *
        scenario.thermalResistanceCPerW
    ).toFixed(2),
  );
  return {
    runId: `LB-LOCAL-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
    predictedTemperatureC: predicted,
    uncertaintyC: 0.58,
    engineVersion: "labbench-thermal-v1.0.0-local",
    verdict: predicted > 55 ? "review" : "pass",
    contentSha256: "local-simulation-no-server",
    inputs: { ...scenario },
    formula: "T = Tamb + (P × duty) × Rθ",
    physicalCommandsEmitted: false,
    physicalOutputEnabled: false,
    synthetic: true,
    source: "local",
    persisted: false,
    evidenceLevel: "N2 — simulation synthétique locale",
    limits: [
      "Modèle thermique stationnaire simplifié, non calibré.",
      "Aucune mesure physique ni preuve de certification.",
      "Empreinte serveur non disponible en mode local.",
    ],
    telemetry: Array.from({ length: 12 }, (_, index) => ({
      sequence: index + 1,
      elapsedSeconds: Math.round((scenario.durationSeconds * (index + 1)) / 12),
      temperatureC: Number(
        (
          scenario.ambientC +
          (predicted - scenario.ambientC) * ((index + 1) / 12)
        ).toFixed(2),
      ),
      positionDeg: scenario.positionSetpointDeg,
      quality: "synthetic",
    })),
  };
}
export function normalizeLabBenchResult(
  value: unknown,
  inputs: LabBenchScenario,
): LabBenchResult | null {
  const result = recordOf(value);
  if (
    typeof result.runId !== "string" ||
    typeof result.predictedTemperatureC !== "number" ||
    !Number.isFinite(result.predictedTemperatureC) ||
    result.physicalCommandsEmitted !== false ||
    result.physicalOutputEnabled !== false ||
    result.synthetic !== true ||
    typeof result.contentSha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(result.contentSha256) ||
    typeof result.engineVersion !== "string" ||
    typeof result.formula !== "string" ||
    !["pass", "review"].includes(result.verdict) ||
    !Array.isArray(result.limits) ||
    !Array.isArray(result.telemetry) ||
    result.telemetry.length === 0
  )
    return null;
  const recordedInputs = recordOf(result.inputs);
  if (
    !(Object.keys(scenarioBounds) as Array<keyof LabBenchScenario>).every(
      (key) => recordedInputs[key] === inputs[key],
    )
  )
    return null;
  const samples = result.telemetry.filter((sample: unknown) => {
    const row = recordOf(sample);
    return [
      row.sequence,
      row.elapsedSeconds,
      row.temperatureC,
      row.positionDeg,
    ].every((value) => typeof value === "number" && Number.isFinite(value));
  });
  if (samples.length !== result.telemetry.length) return null;
  return {
    ...result,
    runId: result.runId,
    predictedTemperatureC: result.predictedTemperatureC,
    uncertaintyC: Number.isFinite(result.uncertaintyC)
      ? result.uncertaintyC
      : 0.58,
    contentSha256: result.contentSha256,
    engineVersion:
      typeof result.engineVersion === "string"
        ? result.engineVersion
        : "labbench-thermal-v1.0.0",
    verdict: result.verdict === "review" ? "review" : "pass",
    telemetry: samples,
    inputs: { ...inputs },
    formula:
      typeof result.formula === "string"
        ? result.formula
        : "T = Tamb + (P × duty) × Rθ",
    physicalCommandsEmitted: false,
    physicalOutputEnabled: false,
    synthetic: true,
    source:
      result.source === "server-archived" &&
      result.persisted === true &&
      typeof result.projectId === "string"
        ? "server-archived"
        : "api",
    persisted:
      result.source === "server-archived" &&
      result.persisted === true &&
      typeof result.projectId === "string",
    projectId:
      typeof result.projectId === "string" ? result.projectId : undefined,
    evidenceLevel: "N2 — simulation synthétique",
    limits: Array.isArray(result.limits)
      ? result.limits.map(String)
      : ["Simulation non calibrée ; aucune mesure physique."],
  };
}
export type LabBenchProject = {
  id: string;
  project: { name: string; version: string; status: string };
  config: Record<string, unknown>;
};
export function normalizeLabBenchProjects(value: unknown): LabBenchProject[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    const row = recordOf(item);
    if (
      (typeof row.id !== "string" && typeof row.id !== "number") ||
      !String(row.id)
    )
      return [];
    const project = recordOf(row.project ?? recordOf(row.data).project);
    return [
      {
        id: String(row.id),
        project: {
          name:
            typeof project.name === "string"
              ? project.name
              : typeof row.name === "string"
                ? row.name
                : "Projet AeroMind",
          version: String(project.version ?? "1.0"),
          status: String(project.status ?? "draft"),
        },
        config: recordOf(row.config ?? recordOf(row.data).config),
      },
    ];
  });
}
export const localLabBenchStatus = {
  project: {
    code: "LABBENCH-01",
    name: "LabBench 01 — laboratoire virtuel",
    proofLevel: "N2 — Simulation",
  },
  services: [
    {
      id: "thermal",
      label: "Moteur thermique",
      detail: "Calcul synthétique local disponible.",
      state: "simulated",
    },
    {
      id: "gateway",
      label: "Passerelle virtuelle",
      detail: "Consignes synthétiques après deux confirmations humaines.",
      state: "simulated",
    },
    {
      id: "physical",
      label: "Sorties physiques",
      detail: "Interdites, quel que soit le mode choisi.",
      state: "limited",
    },
  ],
  requirements: [
    {
      code: "REQ-SIM-001",
      title: "Consigne virtuelle bornée",
      limit: "0–90",
      unit: "°",
      source: "Contrat de simulation LABBENCH",
      acceptance: "Les valeurs hors plage sont refusées.",
      status: "approved",
    },
    {
      code: "REQ-SAF-001",
      title: "Absence de sortie physique",
      limit: "0 commande physique",
      unit: "",
      source: "Périmètre virtuel AeroMind",
      acceptance: "Aucun adaptateur matériel chargé.",
      status: "approved",
    },
    {
      code: "REQ-SAF-002",
      title: "Contrôle humain renforcé",
      limit: "2 confirmations distinctes",
      unit: "",
      source: "Contrat de simulation LABBENCH",
      acceptance:
        "Confirmation de la consigne et du périmètre virtuel avant chaque action.",
      status: "approved",
    },
  ],
  catalog: [],
};
export function normalizeLabBenchStatus(value: unknown) {
  const source = recordOf(value);
  return {
    ...localLabBenchStatus,
    ...source,
    project: { ...localLabBenchStatus.project, ...recordOf(source.project) },
    device: recordOf(source.device),
    driver: recordOf(source.driver),
    services: Array.isArray(source.services)
      ? source.services
      : localLabBenchStatus.services,
    requirements: Array.isArray(source.requirements)
      ? source.requirements
      : localLabBenchStatus.requirements,
    catalog: Array.isArray(source.catalog) ? source.catalog : [],
  };
}
export function normalizeCommandList(value: unknown, fallback: string): string {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").join("\n")
    : typeof value === "string"
      ? value
      : fallback;
}
