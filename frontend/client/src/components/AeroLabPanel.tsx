import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  BatteryCharging,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Play,
  Printer,
  RotateCcw,
  ShieldCheck,
  Wind,
  Zap,
} from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import type {
  ConceptConfig,
  SimulationResult as AeroMindSimulation,
} from "../lib/aeroEngine";
import { adaptProjectToLab } from "../lib/aeroLab/adapter";
import { transitionRunState } from "../lib/aeroLab/labMachine";
import { scenarios } from "../lib/aeroLab/scenarios";
import { calculateFixedWingAerodynamics } from "../lib/fixedWingAerodynamics";
import {
  makeTelemetrySeries,
  simulate,
  telemetryAt,
  validateConfig,
} from "../lib/aeroLab/simulation";
import type {
  LabConfig,
  RunStatus,
  Scenario,
  SimulationResult,
  TelemetryPoint,
} from "../lib/aeroLab/types";
import "./aero-lab-panel.css";

type Props = { project: ConceptConfig; projectSimulation: AeroMindSimulation };
type LabEvent = { key: string; time: string };
type Reference = { label: string; result: SimulationResult };

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));
const formatNumber = (language: string, value: number, digits = 1) =>
  new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

export function AeroLabPanel({ project, projectSimulation }: Props) {
  const { language, t } = useLanguage();
  const projectSeed = useMemo(
    () =>
      adaptProjectToLab(
        project,
        projectSimulation,
        t("Évaluer la mission du profil AeroMind actif."),
      ),
    [project, projectSimulation, t],
  );
  const projectInputKey = useMemo(
    () => JSON.stringify({ project, projectSimulation }),
    [project, projectSimulation],
  );
  const lastProjectInputKey = useRef(projectInputKey);
  const [labConfig, setLabConfig] = useState<LabConfig>(() => projectSeed);
  const [selectedScenario, setSelectedScenario] = useState("aeromind-project");
  const [status, setStatus] = useState<RunStatus>("ready");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [projectOutdated, setProjectOutdated] = useState(false);
  const [reference, setReference] = useState<Reference | null>(null);
  const [telemetryVisible, setTelemetryVisible] = useState(true);
  const [feedback, setFeedback] = useState(
    "Le banc est amorcé avec le profil AeroMind actif.",
  );
  const [aeroModelSettings, setAeroModelSettings] = useState({
    cd0: 0.04,
    oswaldEfficiency: 0.8,
    clMax: 1.2,
    bankDeg: 25,
  });
  const [events, setEvents] = useState<LabEvent[]>([
    { key: "Profil AeroMind chargé depuis le projet actif.", time: "T+00:00" },
  ]);

  const validationErrors = useMemo(
    () => validateConfig(labConfig),
    [labConfig],
  );
  const previewResult = useMemo(
    () => (validationErrors.length === 0 ? simulate(labConfig) : null),
    [labConfig, validationErrors],
  );
  const visibleResult = result ?? previewResult;
  const aeroResult = useMemo(() => calculateFixedWingAerodynamics({
    architecture: project.airframe,
    spanM: project.wingspan,
    chordM: project.chord,
    taperRatio: (project as ConceptConfig & { taperRatio?: number }).taperRatio ?? 0.65,
    massKg: labConfig.drone.emptyMassKg + labConfig.conditions.payloadKg,
    speedMps: labConfig.drone.cruiseSpeedMps,
    altitudeM: labConfig.conditions.altitudeM,
    temperatureC: labConfig.conditions.temperatureC,
    ...aeroModelSettings,
  }), [project, labConfig, aeroModelSettings]);
  const liveTelemetry: TelemetryPoint | null = visibleResult
    ? telemetryAt(progress, visibleResult)
    : null;
  const chamberActive = status === "running" || status === "paused" || status === "complete";
  const chamberX = chamberActive ? 24 + progress * 0.52 : 50;
  const chamberY = 50 + (liveTelemetry ? clamp(liveTelemetry.crossTrackM / Math.max(labConfig.criteria.maxCrossTrackM, 1) * 12, -12, 12) : 0);
  const chamberTilt = liveTelemetry ? clamp(liveTelemetry.crossTrackM * 1.8, -14, 14) : 0;
  const samples = useMemo(
    () => (visibleResult ? makeTelemetrySeries(visibleResult) : []),
    [visibleResult],
  );
  const locked = status === "running" || status === "paused";

  useEffect(() => {
    if (projectInputKey === lastProjectInputKey.current) return;
    lastProjectInputKey.current = projectInputKey;
    if (selectedScenario !== "aeromind-project") return;
    if (status !== "ready") {
      setProjectOutdated(true);
      return;
    }
    setLabConfig(structuredClone(projectSeed));
    setProgress(0);
    setResult(null);
    setProjectOutdated(false);
    setFeedback("Profil AeroMind actif actualisé depuis le projet.");
    setEvents((current) =>
      [
        {
          key: "Profil AeroMind actif actualisé depuis le projet.",
          time: "T+00:00",
        },
        ...current,
      ].slice(0, 8),
    );
  }, [projectInputKey, projectSeed, selectedScenario, status]);

  useEffect(() => {
    if (
      !projectOutdated ||
      selectedScenario !== "aeromind-project" ||
      status !== "ready"
    ) {
      return;
    }
    setLabConfig(structuredClone(projectSeed));
    setProgress(0);
    setResult(null);
    setProjectOutdated(false);
    setFeedback("Profil AeroMind actif resynchronisé après la séquence.");
    setEvents((current) =>
      [
        {
          key: "Profil AeroMind actif resynchronisé après la séquence.",
          time: "T+00:00",
        },
        ...current,
      ].slice(0, 8),
    );
  }, [projectOutdated, projectSeed, selectedScenario, status]);

  const addEvent = (key: string) => {
    setEvents((current) =>
      [
        {
          key,
          time: `T+${String(Math.floor((progress / 100) * 60)).padStart(2, "0")}:00`,
        },
        ...current,
      ].slice(0, 8),
    );
  };

  const resetRun = (announce = true) => {
    setStatus(transitionRunState(status, "RESET"));
    setProgress(0);
    setResult(null);
    if (announce) {
      setFeedback(
        "Essai réinitialisé; les données de simulation restent locales.",
      );
      addEvent("Essai réinitialisé.");
    }
  };

  const loadConfiguration = (next: LabConfig, id: string, message: string) => {
    setLabConfig(structuredClone(next));
    setSelectedScenario(id);
    setStatus("ready");
    setProgress(0);
    setResult(null);
    setProjectOutdated(false);
    setFeedback(message);
    addEvent(message);
  };

  const updateConfig = (updater: (current: LabConfig) => LabConfig) => {
    if (locked) return;
    setLabConfig(updater);
    setSelectedScenario("custom");
    setStatus("ready");
    setProgress(0);
    setResult(null);
    setProjectOutdated(false);
    setFeedback("Paramètre modifié; la prévision est recalculée localement.");
  };

  const onScenarioChange = (id: string) => {
    if (locked) return;
    if (id === "aeromind-project") {
      loadConfiguration(
        projectSeed,
        id,
        "Profil de conception AeroMind rechargé dans le banc local.",
      );
      return;
    }
    if (id === "custom") {
      setSelectedScenario(id);
      setProjectOutdated(false);
      setFeedback("Configuration personnalisée sélectionnée.");
      return;
    }
    const scenario = scenarios.find((item) => item.id === id);
    if (!scenario) return;
    const next: LabConfig = {
      drone: { ...scenario.drone },
      mission: { ...scenario.mission },
      conditions: { ...scenario.conditions },
      criteria: { ...labConfig.criteria },
    };
    loadConfiguration(
      next,
      id,
      `${t("Scénario chargé")}: ${t(scenario.name)}. ${t("Les seuils d’acceptation restent ceux de votre configuration.")}`,
    );
  };

  const startRun = () => {
    if (status === "paused") {
      setStatus(transitionRunState(status, "RESUME"));
      setFeedback("Essai repris; la progression précédente est conservée.");
      addEvent("Essai repris.");
      return;
    }
    if (!previewResult) {
      setFeedback("Corrigez les paramètres signalés avant de lancer l’essai.");
      return;
    }
    setProgress(0);
    setResult(null);
    setStatus(transitionRunState(status, "START"));
    setFeedback(
      "Calcul déterministe local en cours; aucune commande matérielle n’est envoyée.",
    );
    addEvent("Essai démarré.");
  };

  const pauseRun = () => {
    if (status !== "running") return;
    setStatus(transitionRunState(status, "PAUSE"));
    setFeedback(
      "Essai en pause; les paramètres sont verrouillés jusqu’à la reprise ou au reset.",
    );
    addEvent("Essai mis en pause.");
  };

  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(
      () => setProgress((value) => Math.min(100, value + 4)),
      180,
    );
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status !== "running" || progress < 100 || !previewResult) return;
    setResult(previewResult);
    setStatus(transitionRunState("running", "COMPLETE"));
    setFeedback(
      "Séquence terminée; le résultat reste une estimation du modèle conceptuel.",
    );
    addEvent("Séquence terminée à 100 %.");
  }, [status, progress, previewResult]);

  const syncProject = () => {
    loadConfiguration(
      projectSeed,
      "aeromind-project",
      "Profil de conception AeroMind resynchronisé; les modifications du banc sont réinitialisées.",
    );
  };

  const exportReport = () => {
    if (!result || status !== "complete") return;
    const failedChecks = result.checks
      .filter((check) => !check.pass)
      .map((check) => t(check.label))
      .join(", ");
    const summary =
      result.verdict === "PASS"
        ? t(
            "Les critères configurés sont respectés dans ce modèle conceptuel. Confirmez les hypothèses avant un essai physique.",
          )
        : `${t(result.verdict === "FAIL" ? "Échec simulé" : "À examiner")}: ${failedChecks}. ${t("Le résultat est indicatif; ajustez le profil puis rejouez.")}`;
    const report = {
      type: "aeromind_aerolab_local_concept_simulation_non_certified",
      createdAt: new Date().toISOString(),
      language,
      hardwareConnected: false,
      source: t(
        "Profil AeroMind lu; aucune configuration du projet n’a été écrite.",
      ),
      scenario: selectedScenario,
      configuration: {
        ...labConfig,
        mission: {
          ...labConfig.mission,
          label: t(labConfig.mission.label),
          objective: t(labConfig.mission.objective),
        },
      },
      result: {
        ...result,
        summary,
        metricLabel: t(result.metricLabel),
        checks: result.checks.map((check) => ({
          ...check,
          label: t(check.label),
          threshold: t(check.threshold),
          explanation: t(check.explanation),
        })),
        assumptions: result.assumptions.map(t),
      },
      telemetry: makeTelemetrySeries(result),
      limits: result.assumptions.map(t),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `aeromind-aerolab-${result.traceId.toLowerCase()}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback("Rapport JSON exporté localement.");
  };

  const printReport = () => {
    if (!result || status !== "complete") return;
    const cleanup = () => document.body.classList.remove("aerolab-printing");
    document.body.classList.add("aerolab-printing");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1500);
  };

  const changeNumber = (
    path: "drone" | "conditions" | "criteria",
    key: string,
    value: number,
  ) => {
    updateConfig((current) => ({
      ...current,
      [path]: { ...current[path], [key]: Number.isFinite(value) ? value : 0 },
    }));
  };

  const changeMission = (key: "kind" | "objective", value: string) => {
    updateConfig((current) => ({
      ...current,
      mission: { ...current.mission, [key]: value } as LabConfig["mission"],
    }));
  };

  const statusLabel =
    status === "running"
      ? t("ESSAI EN COURS")
      : status === "paused"
        ? t("ESSAI EN PAUSE")
        : status === "complete"
          ? t("ESSAI TERMINÉ")
          : t("BANC PRÊT");
  const fieldLock = locked
    ? t("Paramètres verrouillés pendant l’exécution")
    : t("Paramètres configurables");
  const format = (value: number, digits = 1) =>
    formatNumber(language, value, digits);

  return (
    <section className="aerolab-panel" aria-labelledby="aerolab-title">
      <header className="aerolab-header">
        <div>
          <span className="aerolab-kicker">
            {t("BANC D’ESSAIS NUMÉRIQUE · ENVIRONNEMENT ISOLÉ")}
          </span>
          <h2 id="aerolab-title">{t("Laboratoire d’essais virtuel")}</h2>
          <p>
            {t(
              "Évaluez un drone construit face à sa mission dans un modèle déterministe local, reproductible et sans connexion matérielle.",
            )}
          </p>
        </div>
        <span className={`aerolab-status aerolab-status-${status}`}>
          <i />
          {statusLabel}
          <small>{t("SIMULATION LOCALE · AUCUNE LIAISON MATÉRIELLE")}</small>
        </span>
      </header>

      {projectOutdated && (
        <div className="aerolab-project-refresh" role="status">
          <span>
            <AlertTriangle size={14} />
            {t(
              "Le profil AeroMind actif a changé; le laboratoire conserve l’instantané de cette séquence jusqu’à réinitialisation ou resynchronisation.",
            )}
          </span>
          <button
            type="button"
            disabled={locked}
            onClick={syncProject}
            title={t("Resynchroniser le drone actif")}
          >
            <RotateCcw size={13} /> {t("Resynchroniser le drone actif")}
          </button>
        </div>
      )}

      <div className="aerolab-overview">
        <article>
          <small>{t("MISSION CIBLE")}</small>
          <b>{t(labConfig.mission.label)}</b>
          <span>
            {t(
              labConfig.mission.kind === "inspection"
                ? "Inspection"
                : labConfig.mission.kind === "mapping"
                  ? "Cartographie civile"
                  : "Recherche et sauvetage simulé",
            )}
          </span>
        </article>
        <article>
          <small>{t("PROFIL REPRIS DU PROJET")}</small>
          <b>{labConfig.drone.profile}</b>
          <span>
            {format(labConfig.drone.emptyMassKg, 1)} kg ·{" "}
            {format(labConfig.drone.batteryWh, 0)} Wh
          </span>
        </article>
        <article>
          <small>{t("CONDITIONS SIMULÉES")}</small>
          <b>
            {format(labConfig.conditions.distanceKm, 1)} {t("km")} ·{" "}
            {format(labConfig.conditions.windMps, 1)} {t("m/s")}
          </b>
          <span>
            {format(labConfig.conditions.temperatureC, 0)} {t("°C")} ·{" "}
            {format(labConfig.conditions.altitudeM, 0)} {t("m")}
          </span>
        </article>
        <article>
          <small>{t("PRÉVISION DU MODÈLE")}</small>
          <b
            className={`aerolab-verdict-text aerolab-${(visibleResult?.verdict ?? "WARN").toLowerCase()}`}
          >
            {visibleResult?.verdict ?? "—"}
          </b>
          <span>
            {status === "complete"
              ? t("Issue de l’essai exécuté")
              : t("Calcul préliminaire · non exécuté")}
          </span>
        </article>
      </div>

      <div className="aerolab-workspace">
        <aside className="aerolab-controls">
          <div className="aerolab-section-title">
            <div>
              <span className="aerolab-kicker">
                01 · {t("DÉFINITION D’ESSAI")}
              </span>
              <h3>{t("Préparer le scénario")}</h3>
            </div>
            <span className={`aerolab-lock ${locked ? "is-locked" : ""}`}>
              {fieldLock}
            </span>
          </div>
          <label className="aerolab-label" htmlFor="aerolab-scenario">
            {t("Scénario reproductible")}
          </label>
          <select
            id="aerolab-scenario"
            value={selectedScenario}
            disabled={locked}
            onChange={(event) => onScenarioChange(event.target.value)}
          >
            <option value="aeromind-project">
              {t("Configuration active AeroMind")}
            </option>
            {scenarios.map((scenario: Scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {t(scenario.name)}
              </option>
            ))}
            <option value="custom">{t("Configuration personnalisée")}</option>
          </select>
          <div className="aerolab-scenario-actions">
            <span>
              {t(
                "Les seuils d’acceptation restent ceux de votre configuration.",
              )}
            </span>
            <button type="button" onClick={syncProject} disabled={locked}>
              <RotateCcw size={13} />
              {t("Resynchroniser le drone actif")}
            </button>
          </div>

          <fieldset disabled={locked}>
            <legend>
              <span>A</span>
              {t("Cellule simulée")}
            </legend>
            <label className="aerolab-label" htmlFor="aerolab-profile">
              {t("Profil / identifiant conceptuel")}
            </label>
            <input
              id="aerolab-profile"
              value={labConfig.drone.profile}
              onChange={(event) =>
                updateConfig((current) => ({
                  ...current,
                  drone: { ...current.drone, profile: event.target.value },
                }))
              }
            />
            <div className="aerolab-field-grid">
              <NumberField
                id="aerolab-empty-mass"
                label={t("Masse à vide")}
                value={labConfig.drone.emptyMassKg}
                unit="kg"
                min={0.1}
                max={150}
                step={0.1}
                disabled={locked}
                onChange={(value) =>
                  changeNumber("drone", "emptyMassKg", value)
                }
              />
              <NumberField
                id="aerolab-payload-limit"
                label={t("Charge utile admissible")}
                value={labConfig.drone.payloadLimitKg}
                unit="kg"
                min={0.1}
                max={40}
                step={0.1}
                disabled={locked}
                onChange={(value) =>
                  changeNumber("drone", "payloadLimitKg", value)
                }
              />
              <NumberField
                id="aerolab-battery"
                label={t("Batterie")}
                value={labConfig.drone.batteryWh}
                unit="Wh"
                min={50}
                max={50000}
                step={10}
                disabled={locked}
                onChange={(value) => changeNumber("drone", "batteryWh", value)}
              />
              <NumberField
                id="aerolab-speed"
                label={t("Vitesse de croisière")}
                value={labConfig.drone.cruiseSpeedMps}
                unit="m/s"
                min={2}
                max={200}
                step={0.5}
                disabled={locked}
                onChange={(value) =>
                  changeNumber("drone", "cruiseSpeedMps", value)
                }
              />
              <NumberField
                id="aerolab-power"
                label={t("Puissance de référence estimée")}
                value={labConfig.drone.nominalPowerW}
                unit="W"
                min={20}
                max={20000}
                step={10}
                disabled={locked}
                onChange={(value) =>
                  changeNumber("drone", "nominalPowerW", value)
                }
              />
              <NumberField
                id="aerolab-stability"
                label={t("Stabilité de référence · hypothèse")}
                value={labConfig.drone.stabilityRating}
                unit="%"
                min={50}
                max={100}
                step={1}
                disabled={locked}
                onChange={(value) =>
                  changeNumber("drone", "stabilityRating", value)
                }
              />
            </div>
            <p className="aerolab-helper">
              {t(
                "La puissance de départ est issue de l’estimation AeroMind normalisée; la stabilité initiale est une hypothèse modifiable.",
              )}
            </p>
          </fieldset>

          <fieldset disabled={locked}>
            <legend>
              <span>B</span>
              {t("Mission de service")}
            </legend>
            <label className="aerolab-label" htmlFor="aerolab-mission">
              {t("Profil de mission")}
            </label>
            <select
              id="aerolab-mission"
              value={labConfig.mission.kind}
              onChange={(event) => changeMission("kind", event.target.value)}
            >
              <option value="inspection">
                {t("Inspection d’infrastructure")}
              </option>
              <option value="mapping">{t("Cartographie civile")}</option>
              <option value="rescue">
                {t("Recherche et sauvetage simulé")}
              </option>
            </select>
            <label
              className="aerolab-label aerolab-spaced"
              htmlFor="aerolab-objective"
            >
              {t("Objectif d’essai")}
            </label>
            <textarea
              id="aerolab-objective"
              value={t(labConfig.mission.objective)}
              onChange={(event) =>
                changeMission("objective", event.target.value)
              }
              rows={2}
            />
          </fieldset>

          <fieldset disabled={locked}>
            <legend>
              <span>C</span>
              {t("Environnement simulé")}
            </legend>
            <div className="aerolab-field-grid">
              <NumberField
                id="aerolab-wind"
                label={t("Vent moyen")}
                value={labConfig.conditions.windMps}
                unit="m/s"
                min={0}
                max={30}
                step={0.5}
                disabled={locked}
                onChange={(value) =>
                  changeNumber("conditions", "windMps", value)
                }
              />
              <NumberField
                id="aerolab-temperature"
                label={t("Température")}
                value={labConfig.conditions.temperatureC}
                unit="°C"
                min={-30}
                max={55}
                step={1}
                disabled={locked}
                onChange={(value) =>
                  changeNumber("conditions", "temperatureC", value)
                }
              />
              <NumberField
                id="aerolab-payload"
                label={t("Charge embarquée")}
                value={labConfig.conditions.payloadKg}
                unit="kg"
                min={0}
                max={40}
                step={0.05}
                disabled={locked}
                onChange={(value) =>
                  changeNumber("conditions", "payloadKg", value)
                }
              />
              <NumberField
                id="aerolab-reserve"
                label={t("Réserve cible")}
                value={labConfig.conditions.reservePct}
                unit="%"
                min={5}
                max={60}
                step={1}
                disabled={locked}
                onChange={(value) =>
                  changeNumber("conditions", "reservePct", value)
                }
              />
              <NumberField
                id="aerolab-distance"
                label={t("Distance mission")}
                value={labConfig.conditions.distanceKm}
                unit="km"
                min={0.1}
                max={100}
                step={0.1}
                disabled={locked}
                onChange={(value) =>
                  changeNumber("conditions", "distanceKm", value)
                }
              />
              <NumberField
                id="aerolab-altitude"
                label={t("Altitude simulée")}
                value={labConfig.conditions.altitudeM}
                unit="m"
                min={0}
                max={3000}
                step={5}
                disabled={locked}
                onChange={(value) =>
                  changeNumber("conditions", "altitudeM", value)
                }
              />
            </div>
            <label className="aerolab-switch-row">
              <input
                type="checkbox"
                checked={labConfig.conditions.turbulenceEnabled}
                disabled={locked}
                onChange={(event) =>
                  updateConfig((current) => ({
                    ...current,
                    conditions: {
                      ...current.conditions,
                      turbulenceEnabled: event.target.checked,
                    },
                  }))
                }
              />
              <span className="aerolab-switch" />
              <span>
                <b>{t("Perturbations / rafales")}</b>
                <small>
                  {t(
                    "Activer un facteur déterministe de turbulence dans le modèle.",
                  )}
                </small>
              </span>
            </label>
          </fieldset>

          <fieldset disabled={locked}>
            <legend>
              <span>D</span>
              {t("Critères d’acceptation")}
            </legend>
            <div className="aerolab-field-grid">
              <NumberField
                id="aerolab-min-stability"
                label={t("Stabilité min.")}
                value={labConfig.criteria.minStabilityPct}
                unit="%"
                min={50}
                max={99}
                step={1}
                disabled={locked}
                onChange={(value) =>
                  changeNumber("criteria", "minStabilityPct", value)
                }
              />
              <NumberField
                id="aerolab-min-reserve"
                label={t("Réserve min.")}
                value={labConfig.criteria.minReservePct}
                unit="%"
                min={5}
                max={60}
                step={1}
                disabled={locked}
                onChange={(value) =>
                  changeNumber("criteria", "minReservePct", value)
                }
              />
              <NumberField
                id="aerolab-max-error"
                label={t("Dérive max.")}
                value={labConfig.criteria.maxCrossTrackM}
                unit="m"
                min={0.2}
                max={50}
                step={0.1}
                disabled={locked}
                onChange={(value) =>
                  changeNumber("criteria", "maxCrossTrackM", value)
                }
              />
              <NumberField
                id="aerolab-min-quality"
                label={t("Qualité mission min.")}
                value={labConfig.criteria.minQualityPct}
                unit="%"
                min={40}
                max={99}
                step={1}
                disabled={locked}
                onChange={(value) =>
                  changeNumber("criteria", "minQualityPct", value)
                }
              />
            </div>
          </fieldset>
        </aside>

        <div className="aerolab-workspace-right">
          <section
            className={`aerolab-console aerolab-state-${status}`}
            aria-label={t("Poste de pilotage d’essai local")}
          >
            <div className="aerolab-section-title">
              <div>
                <span className="aerolab-kicker">
                  02 · {t("EXÉCUTION LOCALE")}
                </span>
                <h3>{t("Poste de pilotage d’essai")}</h3>
              </div>
              <span className="aerolab-run-state">
                <i />
                {statusLabel}
              </span>
            </div>
            <div className="aerolab-tunnel">
              <div className="aerolab-tunnel-label">
                <span>{t("CHAMBRE D’ESSAI NUMÉRIQUE")}</span>
                <span>{t("MODÈLE CONCEPTUEL · SANS MATÉRIEL")}</span>
              </div>
              <div className={`aerolab-wind-lines ${status === "running" ? "is-flowing" : ""}`} style={{ "--wind-speed": `${Math.max(0.8, 3.5 - labConfig.conditions.windMps * 0.08)}s` } as CSSProperties} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="aerolab-gauges">
                <span>
                  {t("Vitesse sol estimée")}
                  <b>
                    {visibleResult ? format(visibleResult.groundSpeedMps) : "—"}
                    <small> m/s</small>
                  </b>
                </span>
                <span>
                  {t("Vent moyen simulé")}
                  <b>
                    {format(labConfig.conditions.windMps)}
                    <small> m/s</small>
                  </b>
                </span>
              </div>
              <svg
                className={`aerolab-drone ${status === "running" ? "is-flying" : ""} aerolab-airframe-${labConfig.drone.profile.toLowerCase().includes("wing") || labConfig.drone.profile.toLowerCase().includes("fixed") ? "wing" : labConfig.drone.profile.toLowerCase().includes("vtol") ? "vtol" : "multirotor"}`}
                style={{ left: `${chamberX}%`, top: `${chamberY}%`, "--drone-tilt": `${chamberTilt}deg` } as CSSProperties}
                viewBox="0 0 420 170"
                role="img"
                aria-label={t(
                  "Schéma conceptuel d’un drone dans une chambre d’essai simulée",
                )}
              >
                <ellipse
                  cx="214"
                  cy="137"
                  rx="118"
                  ry="10"
                  fill="rgba(0,0,0,.28)"
                />
                <g fill="#bbc9ca" stroke="#ecf5f1" strokeWidth="2">
                  {labConfig.drone.profile.toLowerCase().includes("wing") || labConfig.drone.profile.toLowerCase().includes("fixed") ? <path d="M38 87 176 77l31-43 16 38 64-8 95 23-95 23-64-8-16 38-31-43z" /> : <><path d="M70 85h82l47-24h38l48 24h75v12h-75l-48 24h-38l-47-24H70z" /><path d="M194 64l-25-28 44 19 33 0 33-19-25 28v54l25 24-46-18-36 0-29 18 26-25z" /></>}
                </g>
                <g stroke="#819a9e" strokeWidth="5" strokeLinecap="round">
                  <path d="M120 82L63 60M120 99L63 121M303 82l57-22M303 99l57 22" />
                </g>
                <g fill="#0b2730" stroke="#76b7b7" strokeWidth="4">
                  <circle className="aerolab-propeller" cx="58" cy="58" r="14" />
                  <circle className="aerolab-propeller" cx="58" cy="123" r="14" />
                  <circle className="aerolab-propeller" cx="365" cy="58" r="14" />
                  <circle className="aerolab-propeller" cx="365" cy="123" r="14" />
                </g>
                <circle cx="216" cy="88" r="5" fill="#8be1d7" />
              </svg>
              <div className="aerolab-chamber-readout"><b>{labConfig.drone.profile}</b><span>{selectedScenario === "aeromind-project" ? projectOutdated ? "PROFIL AEROMIND À RESYNCHRONISER" : "PROFIL AEROMIND RELIÉ · À JOUR" : "SCÉNARIO LOCAL PERSONNALISÉ"}</span><span>{labConfig.mission.label} · {Math.round(labConfig.conditions.altitudeM)} m</span><span>{visibleResult ? `${format(visibleResult.groundSpeedMps)} m/s sol` : "Configuration à compléter"} · vent {format(labConfig.conditions.windMps)} m/s</span></div>
              <div className="aerolab-tunnel-axis">
                <span>{t("FLUX D’AIR SIMULÉ")}</span>
                <span>{t("VISUALISATION SCHÉMATIQUE")}</span>
              </div>
            </div>
            <div className="aerolab-progress-label">
              <span>
                {status === "running"
                  ? t("Calcul de la séquence")
                  : status === "paused"
                    ? t("Séquence suspendue")
                    : status === "complete"
                      ? t("Séquence calculée")
                      : t("Prêt à initialiser l’essai")}
              </span>
              <b>{Math.round(progress)}%</b>
            </div>
            <div
              className="aerolab-progress"
              role="progressbar"
              aria-label={t("Progression de l’essai simulé")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
            >
              <i style={{ width: `${progress}%` }} />
            </div>
            <div className="aerolab-actions">
              <button
                className="aerolab-primary"
                type="button"
                onClick={startRun}
                disabled={status === "running" || validationErrors.length > 0}
              >
                <Play size={14} />
                {status === "paused"
                  ? t("Reprendre l’essai")
                  : status === "complete"
                    ? t("Rejouer l’essai")
                    : t("Lancer l’essai")}
              </button>
              <button
                type="button"
                onClick={pauseRun}
                disabled={status !== "running"}
              >
                <span className="aerolab-pause-icon">Ⅱ</span>
                {t("Pause")}
              </button>
              <button
                type="button"
                onClick={() => resetRun()}
                disabled={status === "ready" && progress === 0}
              >
                <RotateCcw size={14} />
                {t("Réinitialiser")}
              </button>
            </div>
            <div className="aerolab-console-foot">
              <span>
                <i />
                {t("Calcul local déterministe")}
              </span>
              <span>{t("Aucun matériel connecté")}</span>
              <label>
                <input
                  type="checkbox"
                  checked={telemetryVisible}
                  onChange={() => setTelemetryVisible((value) => !value)}
                />
                {t("Télémétrie synthétique")}
              </label>
            </div>
          </section>

          {telemetryVisible && liveTelemetry && (
            <section className="aerolab-telemetry">
              <div className="aerolab-section-title">
                <div>
                  <span className="aerolab-kicker">
                    {t("TÉLÉMÉTRIE SYNTHÉTIQUE")}
                  </span>
                  <h3>
                    {status === "complete"
                      ? t("Échantillon final")
                      : status === "ready"
                        ? t("Aperçu pré-vol calculé")
                        : `${t("Lecture simulée")} · ${Math.round(progress)}%`}
                  </h3>
                </div>
                <span className="aerolab-local-tag">
                  <i />
                  {t("DONNÉES GÉNÉRÉES LOCALEMENT")}
                </span>
              </div>
              <div className="aerolab-telemetry-grid">
                <TelemetryCell
                  icon={<Gauge size={14} />}
                  label={t("Temps mission")}
                  value={`${format(liveTelemetry.time)} min`}
                />
                <TelemetryCell
                  icon={<BatteryCharging size={14} />}
                  label={t("Énergie restante")}
                  value={`${format(liveTelemetry.energyPct)} %`}
                />
                <TelemetryCell
                  icon={<Activity size={14} />}
                  label={t("Stabilité estimée")}
                  value={`${format(liveTelemetry.stabilityPct)} %`}
                />
                <TelemetryCell
                  icon={<Wind size={14} />}
                  label={t("Erreur trajectoire")}
                  value={`${format(liveTelemetry.crossTrackM, 2)} m`}
                />
              </div>
            </section>
          )}

          <section className="aerolab-analysis aerolab-fixed-wing" aria-label={t("Estimation aérodynamique voilure fixe")}>
            <div className="aerolab-section-title"><div><span className="aerolab-kicker">MODÈLE ANALYTIQUE · SIMULATION SEULE</span><h3>{t("Aérodynamique — voilure fixe")}</h3></div><span>{t(aeroResult.status === "not-applicable" ? "NON APPLICABLE" : aeroResult.status === "stall-risk" ? "RISQUE DE DÉCROCHAGE" : aeroResult.status === "ok" ? "ESTIMATION" : "HORS DOMAINE")}</span></div>
            {!aeroResult.applicable || !aeroResult.densityKgM3 ? <p>{t(aeroResult.reasons[0])}</p> : <><p>{aeroResult.reasons.join(" ") || t("Estimation conceptuelle dans les limites du modèle.")}</p><div className="aerolab-metric-grid">{[["Mach indicatif",aeroResult.machNumber,""],["Densité",aeroResult.densityKgM3,"kg/m³"],["Surface",aeroResult.wingAreaM2,"m²"],["Allongement",aeroResult.aspectRatio,""],["CL requis",aeroResult.requiredCL,""],["CD polaire",aeroResult.cd,""],["Traînée",aeroResult.dragN,"N"],["Puissance propulsive estimée",aeroResult.propulsivePowerW,"W"],["Vs estimée · banque saisie",aeroResult.stallSpeedMps,"m/s"],["Facteur de charge n",aeroResult.loadFactor,""],["Marge à 1,3×Vs · banque",aeroResult.marginAt1_3VsMps,"m/s"],["Finesse CL/CD",aeroResult.glideRatio,""],["Rayon virage coordonné · banque saisie",aeroResult.turnRadiusM,"m"]].map(([label,value,unit])=><article className="aerolab-metric" key={String(label)}><small>{t(String(label))}</small><b>{value == null ? "—" : format(Number(value),2)} {value == null ? "" : String(unit)}</b></article>)}</div>
              <div className="aerolab-aero-parameters" aria-label={t("Hypothèses aérodynamiques réglables")}>
                <NumberField id="aerolab-aero-cd0" label="CD₀" value={aeroModelSettings.cd0} unit="coefficient" min={0.005} max={0.2} step={0.005} disabled={locked} onChange={value => setAeroModelSettings(current => ({ ...current, cd0: value }))} />
                <NumberField id="aerolab-aero-oswald" label="Efficacité d’Oswald (e)" value={aeroModelSettings.oswaldEfficiency} unit="coefficient" min={0.3} max={1} step={0.05} disabled={locked} onChange={value => setAeroModelSettings(current => ({ ...current, oswaldEfficiency: value }))} />
                <NumberField id="aerolab-aero-clmax" label="CL max hypothétique" value={aeroModelSettings.clMax} unit="coefficient" min={0.5} max={2.5} step={0.1} disabled={locked} onChange={value => setAeroModelSettings(current => ({ ...current, clMax: value }))} />
                <NumberField id="aerolab-aero-bank" label="Inclinaison de virage" value={aeroModelSettings.bankDeg} unit="°" min={0} max={60} step={1} disabled={locked} onChange={value => setAeroModelSettings(current => ({ ...current, bankDeg: value }))} />
              </div></>}
            <ul>{aeroResult.assumptions.map((assumption)=><li key={assumption}>{t(assumption)}</li>)}</ul><small>{t("Masse utilisée = masse à vide du scénario + charge utile du scénario. Vitesse, altitude et température proviennent du scénario AeroLab. Géométrie du projet AeroMind; le scénario ne modifie pas le bilan AeroLab existant.")}</small><p>{t("Simulation uniquement : non certifié, sans branchement au guidage matériel.")}</p>
          </section>
          <section className="aerolab-analysis">
            <div className="aerolab-section-title">
              <div>
                <span className="aerolab-kicker">
                  03 · {t("RÉSULTATS & CRITÈRES")}
                </span>
                <h3>{t("Analyse de mission")}</h3>
              </div>
              <span className="aerolab-preview-tag">
                {status === "complete"
                  ? `${progress}% · ${t("TRACE ENREGISTRÉE")}`
                  : t("PRÉVISION · NON EXÉCUTÉE")}
              </span>
            </div>
            {visibleResult ? (
              <>
                <div className="aerolab-verdict-row">
                  <div className="aerolab-verdict-line">
                    <span
                      className={`aerolab-verdict aerolab-${visibleResult.verdict.toLowerCase()}`}
                    >
                      {visibleResult.verdict === "PASS" ? (
                        <CheckCircle2 size={15} />
                      ) : visibleResult.verdict === "FAIL" ? (
                        <AlertTriangle size={15} />
                      ) : (
                        <ShieldCheck size={15} />
                      )}{" "}
                      {visibleResult.verdict}
                    </span>
                    <p>
                      {visibleResult.verdict === "PASS" ? (
                        t(
                          "Les critères configurés sont respectés dans ce modèle conceptuel. Confirmez les hypothèses avant un essai physique.",
                        )
                      ) : (
                        <>
                          {visibleResult.verdict === "FAIL"
                            ? t("Échec simulé")
                            : t("À examiner")}
                          :{" "}
                          {visibleResult.checks
                            .filter((check) => !check.pass)
                            .map((check) => t(check.label))
                            .join(", ")}
                          .{" "}
                          {t(
                            "Le résultat est indicatif; ajustez le profil puis rejouez.",
                          )}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="aerolab-trace">
                    <small>{t("TRACE DÉTERMINISTE")}</small>
                    <b>{visibleResult.traceId}</b>
                  </div>
                </div>
                <div className="aerolab-metric-grid">
                  <MetricCard
                    label={t("Stabilité estimée")}
                    value={`${format(visibleResult.stabilityPct)}%`}
                    meter={visibleResult.stabilityPct}
                  />
                  <MetricCard
                    label={t("Réserve après mission")}
                    value={`${format(visibleResult.reserveRemainingPct)}%`}
                    meter={visibleResult.reserveRemainingPct}
                  />
                  <MetricCard
                    label={t(visibleResult.metricLabel)}
                    value={`${format(visibleResult.missionMetricPct)}%`}
                    meter={visibleResult.missionMetricPct}
                  />
                  <MetricCard
                    label={t("Endurance estimée")}
                    value={`${format(visibleResult.enduranceMin, 0)} min`}
                    meter={Math.min(
                      100,
                      (visibleResult.enduranceMin / 90) * 100,
                    )}
                  />
                </div>
                <div className="aerolab-chart-grid">
                  <MiniChart
                    title={t("Énergie résiduelle")}
                    unit="%"
                    values={samples.map((sample) => sample.energyPct)}
                    color="teal"
                  />
                  <MiniChart
                    title={t("Indice de stabilité")}
                    unit="%"
                    values={samples.map((sample) => sample.stabilityPct)}
                    color="green"
                  />
                  <MiniChart
                    title={t("Erreur de trajectoire")}
                    unit="m"
                    values={samples.map((sample) => sample.crossTrackM)}
                    color="amber"
                  />
                </div>
                <div className="aerolab-criteria-title">
                  <h4>
                    <ClipboardCheck size={14} />
                    {t("Vérification des critères")}
                  </h4>
                  <span>
                    {visibleResult.checks.filter((check) => check.pass).length}/
                    {visibleResult.checks.length} {t("CONFORMES")}
                  </span>
                </div>
                <div className="aerolab-checks">
                  {visibleResult.checks.map((check) => (
                    <div className="aerolab-check" key={check.key}>
                      <span className={check.pass ? "is-pass" : "is-review"}>
                        {check.pass ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <AlertTriangle size={14} />
                        )}
                      </span>
                      <b>{t(check.label)}</b>
                      <em>{check.displayValue}</em>
                      <small>{t(check.threshold)}</small>
                      <strong>
                        {check.pass ? t("CONFORME") : t("À EXAMINER")}
                      </strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="aerolab-invalid">
                <AlertTriangle size={18} />
                <span>
                  {t("Corrigez les paramètres avant d’afficher les résultats.")}{" "}
                  {validationErrors.map((error) => t(error)).join(" ")}
                </span>
              </div>
            )}
            <div className="aerolab-analysis-actions">
              <button
                type="button"
                onClick={() =>
                  result &&
                  setReference({ label: labConfig.drone.profile, result })
                }
                disabled={status !== "complete"}
              >
                <ShieldCheck size={14} />
                {t("Épingler comme référence")}
              </button>
              <button
                type="button"
                onClick={exportReport}
                disabled={status !== "complete" || !result}
              >
                <ArrowDownToLine size={14} />
                {t("Exporter rapport JSON")}
              </button>
              <button
                type="button"
                onClick={printReport}
                disabled={status !== "complete" || !result}
              >
                <Printer size={14} />
                {t("Imprimer")}
              </button>
            </div>
            {reference && result && (
              <div className="aerolab-reference">
                <div>
                  <small>{t("COMPARAISON À LA RÉFÉRENCE")}</small>
                  <b>
                    {t("Essai courant vs")} {reference.label}
                  </b>
                </div>
                <span>{t("Δ orienté · positif = amélioration")}</span>
                <div className="aerolab-reference-grid">
                  {[
                    {
                      label: t("Stabilité"),
                      value:
                        result.stabilityPct - reference.result.stabilityPct,
                      unit: "pts",
                    },
                    {
                      label: t("Réserve estimée"),
                      value:
                        result.reserveRemainingPct -
                        reference.result.reserveRemainingPct,
                      unit: "pts",
                    },
                    {
                      label: t("Erreur trajectoire"),
                      value: reference.result.crossTrackM - result.crossTrackM,
                      unit: t("m de mieux"),
                    },
                    {
                      label: t("Qualité mission"),
                      value:
                        result.missionMetricPct -
                        reference.result.missionMetricPct,
                      unit: "pts",
                    },
                  ].map((item) => (
                    <div key={item.label}>
                      <small>{item.label}</small>
                      <b className={item.value >= 0 ? "is-better" : "is-worse"}>
                        {item.value > 0 ? "+" : ""}
                        {format(item.value)} <i>{item.unit}</i>
                      </b>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="aerolab-journal">
            <div className="aerolab-section-title">
              <div>
                <span className="aerolab-kicker">
                  {t("TRAÇABILITÉ DE SESSION")}
                </span>
                <h3>{t("Journal d’essai")}</h3>
              </div>
              <span>
                {events.length} {t("ÉVÉNEMENTS")}
              </span>
            </div>
            <div>
              {events.map((event, index) => (
                <div className="aerolab-event" key={`${event.key}-${index}`}>
                  <time>{event.time}</time>
                  <i />
                  {t(event.key)}
                </div>
              ))}
            </div>
            <p className="aerolab-feedback" role="status">
              {t(feedback)}
              {validationErrors.length > 0 && <b> {t(validationErrors[0])}</b>}
            </p>
          </section>
        </div>
      </div>

      <footer className="aerolab-footer">
        <span>
          <b>AEROMIND · LABORATOIRE D’ESSAIS VIRTUEL</b> ·{" "}
          {t("Prototype intégré · calcul local seulement")}
        </span>
        <span>
          {t(
            "Modèle non calibré · ne remplace ni essais physiques ni certification",
          )}
        </span>
      </footer>
    </section>
  );
}

function NumberField({
  id,
  label,
  value,
  unit,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const { t } = useLanguage();
  return (
    <label className="aerolab-number-field" htmlFor={id}>
      <span>{label}</span>
      <span className="aerolab-input-wrap">
        <input
          id={id}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <small>{t(unit)}</small>
      </span>
    </label>
  );
}

function TelemetryCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="aerolab-telemetry-cell">
      <span>
        {icon}
        {label}
      </span>
      <b>{value}</b>
    </div>
  );
}

function MetricCard({
  label,
  value,
  meter,
}: {
  label: string;
  value: string;
  meter: number;
}) {
  return (
    <article className="aerolab-metric">
      <span>{label}</span>
      <b>{value}</b>
      <i>
        <em style={{ width: `${clamp(meter, 0, 100)}%` }} />
      </i>
    </article>
  );
}

function MiniChart({
  title,
  unit,
  values,
  color,
}: {
  title: string;
  unit: string;
  values: number[];
  color: "teal" | "green" | "amber";
}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values
    .map(
      (value, index) =>
        `${(index / Math.max(values.length - 1, 1)) * 240},${34 - ((value - min) / range) * 26}`,
    )
    .join(" ");
  return (
    <article className={`aerolab-chart aerolab-chart-${color}`}>
      <div>
        <span>{title}</span>
        <small>{unit}</small>
      </div>
      <svg viewBox="0 0 240 40" role="img" aria-label={title}>
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <small>
        {min.toFixed(1)} → {max.toFixed(1)} {unit}
      </small>
    </article>
  );
}
