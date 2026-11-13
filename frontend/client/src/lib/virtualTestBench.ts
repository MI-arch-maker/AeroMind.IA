import {
  defaultRequirements,
  runSimulation,
  type ConceptConfig,
  type MetricStatus,
  type Requirement,
  type SimulationResult,
} from "./aeroEngine";
import {
  defaultLocalMissionPlan,
  validateLocalMission,
} from "./flightEngineering";

export type VirtualTestId =
  | "nominal"
  | "headwind"
  | "battery-derate"
  | "payload-margin"
  | "link-loss";

export type VirtualTestStatus = "pass" | "review" | "fail";

export type VirtualTestCheck = {
  id: string;
  label: string;
  status: VirtualTestStatus;
  value: string;
  target: string;
  note: string;
};

export type VirtualTestCase = {
  id: VirtualTestId;
  label: string;
  description: string;
  perturbation: string;
  result: SimulationResult;
  checks: VirtualTestCheck[];
  status: VirtualTestStatus;
};

export type VirtualTestCampaign = {
  runId: string;
  generatedAt: string;
  cases: VirtualTestCase[];
  counts: Record<VirtualTestStatus, number>;
  signature: string;
};

const testDefinitions: Array<
  Pick<VirtualTestCase, "id" | "label" | "description" | "perturbation">
> = [
  {
    id: "nominal",
    label: "Référence nominale",
    description: "Évalue la configuration active sans perturbation.",
    perturbation: "Configuration projet",
  },
  {
    id: "headwind",
    label: "Vent renforcé",
    description: "Applique une rafale de scénario de +12 km/h (plafonnée à 60 km/h).",
    perturbation: "+12 km/h de vent",
  },
  {
    id: "battery-derate",
    label: "Batterie dégradée",
    description: "Réduit la capacité énergétique modélisée de 20 %.",
    perturbation: "−20 % capacité batterie",
  },
  {
    id: "payload-margin",
    label: "Marge de charge utile",
    description: "Ajoute 0,25 kg à la charge utile afin d’observer la marge de masse.",
    perturbation: "+0,25 kg de charge utile",
  },
  {
    id: "link-loss",
    label: "Perte de liaison",
    description: "Vérifie le repli choisi et la cohérence du plan local; aucune liaison n’est coupée.",
    perturbation: "Revue logique uniquement",
  },
];

const worstStatus = (checks: VirtualTestCheck[]): VirtualTestStatus =>
  checks.some(check => check.status === "fail")
    ? "fail"
    : checks.some(check => check.status === "review")
      ? "review"
      : "pass";

const statusFromMetric = (status: MetricStatus): VirtualTestStatus =>
  status === "pass" ? "pass" : status === "fail" ? "fail" : "review";

const format = (value: number, digits = 1) =>
  new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

function makeScenarioConfig(id: VirtualTestId, config: ConceptConfig): ConceptConfig {
  if (id === "headwind") {
    return {
      ...config,
      windSpeedKmh: Math.min(60, Math.max(0, config.windSpeedKmh) + 12),
    };
  }
  if (id === "battery-derate") {
    return { ...config, batteryWh: Math.max(1, config.batteryWh * 0.8) };
  }
  if (id === "payload-margin") {
    return { ...config, payloadKg: Math.max(0, config.payloadKg) + 0.25 };
  }
  return config;
}

export function runVirtualTestCampaign(
  config: ConceptConfig,
  requirements: Requirement[] = defaultRequirements,
  runId = `VTEST-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`
): VirtualTestCampaign {
  const targetEndurance = Number(
    requirements.find(item => item.id === "endurance")?.value ?? 2.5
  );
  const targetWind = Number(
    requirements.find(item => item.id === "wind")?.value ?? 30
  );
  const targetMass = Number(
    requirements.find(item => item.id === "mass")?.value ?? config.maxTakeoffKg
  );
  const targetPayload = Number(
    requirements.find(item => item.id === "payload")?.value ?? config.payloadKg
  );
  const missionPlan = config.missionPlan ?? defaultLocalMissionPlan;
  const baseline = runSimulation(config, requirements, `${runId}-BASE`);

  const cases = testDefinitions.map(definition => {
    const scenarioConfig = makeScenarioConfig(definition.id, config);
    const result =
      definition.id === "nominal"
        ? baseline
        : runSimulation(scenarioConfig, requirements, `${runId}-${definition.id.toUpperCase()}`);
    const massCheck: VirtualTestCheck = {
      id: "mass",
      label: "Masse au décollage",
      status: result.totalMassKg <= targetMass ? "pass" : "fail",
      value: `${format(result.totalMassKg, 2)} kg`,
      target: `≤ ${format(targetMass, 2)} kg`,
      note:
        result.totalMassKg <= targetMass
          ? "Sous la limite saisie dans les exigences."
          : "Dépasse la limite de masse; revoir la configuration.",
    };
    const energyCheck: VirtualTestCheck = {
      id: "energy",
      label: "Autonomie estimée",
      status: result.enduranceH >= targetEndurance ? "pass" : "review",
      value: `${format(result.enduranceH, 2)} h`,
      target: `≥ ${format(targetEndurance, 2)} h`,
      note:
        result.enduranceH >= targetEndurance
          ? "Le modèle atteint la cible; la marge reste à confirmer par essai."
          : "Sous la cible dans ce modèle préliminaire.",
    };
    const windMetric = result.metrics.find(metric => metric.id === "wind");
    const windCheck: VirtualTestCheck = {
      id: "wind",
      label: "Vent de scénario",
      status: statusFromMetric(windMetric?.status ?? "review"),
      value: `${format(scenarioConfig.windSpeedKmh, 0)} km/h`,
      target: `≤ ${format(targetWind, 0)} km/h`,
      note:
        scenarioConfig.windSpeedKmh <= targetWind
          ? "Dans le seuil de projet; pas une validation de stabilité."
          : "Seuil dépassé; les performances réelles ne sont pas calculées ici.",
    };
    const payloadCheck: VirtualTestCheck = {
      id: "payload",
      label: "Charge utile de scénario",
      status:
        scenarioConfig.payloadKg >= targetPayload &&
        result.totalMassKg <= targetMass
          ? "pass"
          : result.totalMassKg > targetMass
            ? "fail"
            : "review",
      value: `${format(scenarioConfig.payloadKg, 2)} kg`,
      target: `≥ ${format(targetPayload, 2)} kg · masse ≤ ${format(targetMass, 2)} kg`,
      note:
        definition.id === "payload-margin"
          ? "Perturbation de charge uniquement; centre de gravité et structure non simulés."
          : "Charge utile conservée depuis le projet actif.",
    };
    const safeAction =
      missionPlan.lostLinkAction === "return" ||
      missionPlan.lostLinkAction === "land";
    const linkCheck: VirtualTestCheck = {
      id: "lost-link",
      label: "Action de perte de liaison",
      status: safeAction ? "pass" : "review",
      value: missionPlan.lostLinkAction.toUpperCase(),
      target: "Retour ou atterrissage configuré",
      note: safeAction
        ? "Action de repli déclarée dans le plan local; elle n’a pas été exécutée."
        : "Le plan prévoit un maintien; confirmer la procédure de contingence.",
    };
    const missionChecks = validateLocalMission(config, missionPlan);
    const blockedMissionChecks = missionChecks.filter(
      check => check.severity === "block"
    );
    const routeCheck: VirtualTestCheck = {
      id: "route",
      label: "Intégrité du plan local",
      status: blockedMissionChecks.length
        ? "fail"
        : missionChecks.some(check => check.severity === "review")
          ? "review"
          : "pass",
      value: `${missionPlan.waypoints.length} point(s)`,
      target: "≥ 2 points · altitudes et vitesses cohérentes",
      note: blockedMissionChecks[0]?.message ??
        missionChecks.find(check => check.severity === "review")?.message ??
        "Contrôles géométriques locaux satisfaits.",
    };
    const checks =
      definition.id === "nominal"
        ? [massCheck, energyCheck, windCheck]
        : definition.id === "headwind"
          ? [windCheck, energyCheck, massCheck]
          : definition.id === "battery-derate"
            ? [energyCheck, massCheck]
            : definition.id === "payload-margin"
              ? [payloadCheck, massCheck]
              : [linkCheck, routeCheck];
    return {
      ...definition,
      result,
      checks,
      status: worstStatus(checks),
    };
  });
  const counts: Record<VirtualTestStatus, number> = {
    pass: cases.filter(item => item.status === "pass").length,
    review: cases.filter(item => item.status === "review").length,
    fail: cases.filter(item => item.status === "fail").length,
  };
  return {
    runId,
    generatedAt: new Date().toISOString(),
    cases,
    counts,
    signature: JSON.stringify({ config, requirements }),
  };
}

function csvCell(value: string | number) {
  const stringValue = String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

export function virtualCampaignToCsv(campaign: VirtualTestCampaign) {
  const rows = [
    ["run_id", "scenario_id", "scenario", "overall_status", "check", "status", "value", "target", "note"],
    ...campaign.cases.flatMap(test =>
      test.checks.map(check => [
        campaign.runId,
        test.id,
        test.label,
        test.status,
        check.label,
        check.status,
        check.value,
        check.target,
        check.note,
      ])
    ),
  ];
  return `\uFEFF${rows.map(row => row.map(csvCell).join(";")).join("\r\n")}`;
}
