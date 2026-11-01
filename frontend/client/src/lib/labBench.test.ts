import { describe, expect, it } from "vitest";
import {
  calculateLocalLabBenchResult,
  defaultLabBenchScenario,
  normalizeCommandList,
  normalizeLabBenchProjects,
  normalizeLabBenchResult,
  normalizeLabBenchScenario,
  normalizeLabBenchStatus,
  validateLabBenchScenario,
} from "./labBench";

describe("LABBENCH — contrats et calcul local", () => {
  it("supporte une API ancienne/incomplète sans tableau manquant", () => {
    const status = normalizeLabBenchStatus({
      ready: true,
      mode: "safe-python",
    });
    expect(status.services.length).toBeGreaterThan(0);
    expect(status.requirements.length).toBeGreaterThan(0);
    expect(status.catalog).toEqual([]);
  });
  it("rejette les données locales corrompues et restaure les valeurs numériques sûres", () => {
    expect(
      normalizeLabBenchScenario({
        ambientC: "45",
        dutyCycle: 20,
        durationSeconds: null,
      }),
    ).toEqual(defaultLabBenchScenario);
    expect(normalizeLabBenchScenario({ ambientC: 30 }).ambientC).toBe(30);
  });
  it("bloque les paramètres numériques hors plage et non finis", () => {
    expect(
      validateLabBenchScenario({
        ...defaultLabBenchScenario,
        positionSetpointDeg: 91,
      }),
    ).not.toBeNull();
    expect(
      validateLabBenchScenario({ ...defaultLabBenchScenario, ambientC: NaN }),
    ).not.toBeNull();
    expect(() =>
      calculateLocalLabBenchResult({
        ...defaultLabBenchScenario,
        heaterPowerW: -1,
      }),
    ).toThrow();
  });
  it("calcule de façon reproductible sans aucune sortie physique et conserve les entrées", () => {
    const a = calculateLocalLabBenchResult(defaultLabBenchScenario);
    const b = calculateLocalLabBenchResult(defaultLabBenchScenario);
    expect(a.predictedTemperatureC).toBe(26.12);
    expect(a.telemetry).toEqual(b.telemetry);
    expect(a.inputs).toEqual(defaultLabBenchScenario);
    expect(a.physicalCommandsEmitted).toBe(false);
    expect(a.limits.length).toBeGreaterThan(0);
    expect(a.runId).not.toEqual(b.runId);
  });
  it("ne traite pas une réponse null ou un résultat cassé comme un run API", () => {
    expect(normalizeLabBenchResult(null, defaultLabBenchScenario)).toBeNull();
    expect(
      normalizeLabBenchResult(
        { runId: "x", predictedTemperatureC: 20 },
        defaultLabBenchScenario,
      ),
    ).toBeNull();
    const result = calculateLocalLabBenchResult(defaultLabBenchScenario);
    expect(normalizeLabBenchResult(result, defaultLabBenchScenario)).toBeNull();
    const apiResult = {
      ...result,
      source: "api",
      contentSha256: "a".repeat(64),
    };
    expect(
      normalizeLabBenchResult(apiResult, defaultLabBenchScenario)
        ?.predictedTemperatureC,
    ).toBe(26.12);
    expect(
      normalizeLabBenchResult(
        { ...apiResult, synthetic: undefined },
        defaultLabBenchScenario,
      ),
    ).toBeNull();
    expect(
      normalizeLabBenchResult(
        { ...apiResult, physicalOutputEnabled: undefined },
        defaultLabBenchScenario,
      ),
    ).toBeNull();
    expect(
      normalizeLabBenchResult(
        { ...apiResult, physicalCommandsEmitted: true },
        defaultLabBenchScenario,
      ),
    ).toBeNull();
    expect(
      normalizeLabBenchResult(
        { ...apiResult, inputs: { ...defaultLabBenchScenario, ambientC: 30 } },
        defaultLabBenchScenario,
      ),
    ).toBeNull();
  });
  it("normalise un projet sans objet project et conserve son identifiant serveur", () => {
    expect(
      normalizeLabBenchProjects([null, { id: "server-1", name: "Essai" }]),
    ).toMatchObject([{ id: "server-1", project: { name: "Essai" } }]);
  });
  it("migre la liste blanche historique tableau vers textarea sans crash", () => {
    expect(
      normalizeCommandList(["read.status", "simulate.servo.setpoint"], ""),
    ).toBe("read.status\nsimulate.servo.setpoint");
    expect(normalizeCommandList({}, "read.status")).toBe("read.status");
  });
});
