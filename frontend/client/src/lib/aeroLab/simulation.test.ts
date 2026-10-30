import { describe, expect, it } from "vitest";
import { transitionRunState } from "./labMachine";
import { initialConfig, scenarios } from "./scenarios";
import { makeTelemetrySeries, simulate, validateConfig } from "./simulation";
import type { LabConfig } from "./types";

const clone = (config: LabConfig): LabConfig => structuredClone(config);

describe("machine de commandes locale", () => {
  it("lance, met en pause, reprend, termine et réinitialise l’essai", () => {
    let state = transitionRunState("ready", "START");
    expect(state).toBe("running");
    state = transitionRunState(state, "PAUSE");
    expect(state).toBe("paused");
    state = transitionRunState(state, "RESUME");
    expect(state).toBe("running");
    state = transitionRunState(state, "COMPLETE");
    expect(state).toBe("complete");
    state = transitionRunState(state, "RESET");
    expect(state).toBe("ready");
  });

  it("ignore une pause invalide et permet un nouvel essai après complétion", () => {
    expect(transitionRunState("ready", "PAUSE")).toBe("ready");
    expect(transitionRunState("complete", "START")).toBe("running");
    expect(transitionRunState("paused", "START")).toBe("paused");
  });
});

describe("moteur de simulation déterministe", () => {
  it("produit le même résultat et le même identifiant de trace pour un même scénario", () => {
    const config = clone(initialConfig);
    expect(simulate(config)).toEqual(simulate(clone(config)));
  });

  it("change ses métriques quand les conditions météo changent", () => {
    const calm = clone(initialConfig);
    const windy = clone(initialConfig);
    windy.conditions.windMps = 16;
    expect(simulate(calm).traceId).not.toBe(simulate(windy).traceId);
    expect(simulate(calm).stabilityPct).toBeGreaterThan(
      simulate(windy).stabilityPct,
    );
    expect(simulate(calm).groundSpeedMps).toBeGreaterThan(
      simulate(windy).groundSpeedMps,
    );
  });

  it("fait contribuer la masse à vide à la consommation estimée", () => {
    const light = clone(initialConfig);
    const heavy = clone(initialConfig);
    heavy.drone.emptyMassKg = 12;
    expect(simulate(heavy).powerDrawW).toBeGreaterThan(
      simulate(light).powerDrawW,
    );
    expect(simulate(heavy).enduranceMin).toBeLessThan(
      simulate(light).enduranceMin,
    );
    expect(simulate(heavy).traceId).not.toBe(simulate(light).traceId);
  });

  it("signale une charge utile qui dépasse la limite au lieu de masquer l’incohérence", () => {
    const config = clone(initialConfig);
    config.conditions.payloadKg = config.drone.payloadLimitKg + 0.1;
    expect(validateConfig(config)).toContain(
      "La charge déclarée dépasse la limite du profil de drone.",
    );
    expect(() => simulate(config)).toThrow(/dépasse la limite/);
  });

  it("charge chaque scénario en fournissant une configuration reproductible et bien formée", () => {
    for (const scenario of scenarios) {
      const config: LabConfig = {
        drone: scenario.drone,
        mission: scenario.mission,
        conditions: { ...scenario.conditions },
        criteria: initialConfig.criteria,
      };
      expect(validateConfig(config)).toEqual([]);
      expect(config.conditions.turbulenceEnabled).toBe(true);
      expect(simulate(config).traceId).toMatch(/^AM-[0-9A-F]{8}$/);
    }
  });

  it("marque une cible haute vitesse hors domaine au lieu d’annoncer PASS", () => {
    const config = clone(initialConfig);
    config.drone.cruiseSpeedMps = 140;
    expect(validateConfig(config)).toEqual([]);
    const result = simulate(config);
    expect(result.verdict).not.toBe("PASS");
    expect(result.checks.find(check => check.key === "speed-model-domain")?.pass).toBe(false);
    expect(result.assumptions.join(" ")).toContain("hors domaine calibré");
  });

  it("génère une télémétrie déterministe qui termine à 100 % de la trace", () => {
    const result = simulate(initialConfig);
    const samples = makeTelemetrySeries(result);
    expect(samples).toHaveLength(25);
    expect(samples[0].energyPct).toBe(100);
    expect(samples.at(-1)?.energyPct).toBe(result.reserveRemainingPct);
    expect(samples).toEqual(makeTelemetrySeries(result));
  });
});
