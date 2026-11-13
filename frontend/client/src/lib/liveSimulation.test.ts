import { describe, expect, it } from "vitest";
import {
  advanceLiveFlight,
  batteryDrainPerSecond,
  createLiveFlightState,
  cruiseAltitudeTarget,
  DEMO_TIME_SCALE,
  estimatedPowerW,
  hasEnergyBudget,
  LIVE_HISTORY_LIMIT,
  liveSeries,
  liveSeriesRange,
  normalizeLiveParams,
  SAMPLE_INTERVAL_S,
  setLiveArmed,
  usesSimulationDefaults,
} from "./liveSimulation";

const params = {
  cruiseSpeedKmh: 60,
  designAltitudeM: 180,
  batteryWh: 1500,
  payloadKg: 1.4,
  motorCount: 4,
  reserveFraction: 0.15,
};

const run = (state: ReturnType<typeof createLiveFlightState>, seconds: number, dt = 0.25) => {
  let current = state;
  const steps = Math.round(seconds / dt);
  for (let index = 0; index < steps; index += 1) {
    current = advanceLiveFlight(current, dt, params);
  }
  return current;
};

describe("live flight simulation stream", () => {
  it("keeps high design speeds visible in simulation while clamping above the declared 650 km/h limit", () => {
    expect(normalizeLiveParams({ cruiseSpeedKmh: 550 }).cruiseSpeedKmh).toBe(550);
    expect(normalizeLiveParams({ cruiseSpeedKmh: 900 }).cruiseSpeedKmh).toBe(650);
  });

  it("starts on the ground with an immediately usable telemetry buffer", () => {
    const state = createLiveFlightState(params);
    expect(state.armed).toBe(false);
    expect(state.phase).toBe("standby");
    expect(state.altitudeM).toBe(0);
    expect(state.speedKmh).toBe(0);
    expect(state.samples).toHaveLength(1);
    expect(state.samples[0]).toMatchObject({ altitudeM: 0, speedKmh: 0, batteryPct: 100 });
    expect(state.batteryPct).toBeGreaterThan(90);
  });

  it("samples the stream continuously even while disarmed", () => {
    const state = createLiveFlightState(params);
    const next = run(state, 3);
    expect(next.samples.length).toBeGreaterThanOrEqual(
      Math.floor(3 / SAMPLE_INTERVAL_S) - 1
    );
    expect(next.elapsedS).toBeCloseTo(3, 1);
  });

  it("caps the rolling history at the declared limit", () => {
    const state = setLiveArmed(createLiveFlightState(params), true, params);
    const next = run(state, LIVE_HISTORY_LIMIT * SAMPLE_INTERVAL_S + 8);
    expect(next.samples).toHaveLength(LIVE_HISTORY_LIMIT);
    const series = liveSeries(next.samples, "altitudeM");
    expect(series).toHaveLength(LIVE_HISTORY_LIMIT);
    const range = liveSeriesRange(series);
    expect(range.max).toBeGreaterThan(range.min);
  });

  it("produces a moving attitude and altitude once armed", () => {
    const armed = setLiveArmed(createLiveFlightState(params), true, params);
    const samples = [0.25, 1, 2, 4, 8].map(seconds => run(armed, seconds, 0.05));
    expect(samples.some(item => Math.abs(item.rollDeg) > 1)).toBe(true);
    expect(samples.some(item => Math.abs(item.pitchDeg) > 0.5)).toBe(true);
    expect(samples[samples.length - 1].altitudeM).toBeGreaterThan(
      samples[0].altitudeM
    );
    expect(samples[samples.length - 1].altitudeM).toBeLessThanOrEqual(
      cruiseAltitudeTarget(normalizeLiveParams(params)) + 1
    );
    expect(samples[samples.length - 1].speedKmh).toBeGreaterThan(5);
  });

  it("drains the battery monotonically and respects the declared reserve", () => {
    const armed = setLiveArmed(createLiveFlightState(params), true, params);
    const after = run(armed, 600);
    expect(after.batteryPct).toBeLessThan(armed.batteryPct);
    expect(after.batteryPct).toBeGreaterThanOrEqual(
      normalizeLiveParams(params).reserveFraction! * 100
    );
    expect(
      batteryDrainPerSecond(normalizeLiveParams(params), 400, true)
    ).toBeGreaterThan(
      batteryDrainPerSecond(normalizeLiveParams(params), 400, false)
    );
  });

  it("returns to a level, grounded state after disarm", () => {
    const armed = setLiveArmed(createLiveFlightState(params), true, params);
    const flying = run(armed, 6);
    const disarmed = run(setLiveArmed(flying, false, params), 40);
    expect(disarmed.armed).toBe(false);
    expect(disarmed.phase).toBe("standby");
    expect(Math.abs(disarmed.rollDeg)).toBeLessThan(0.35);
    expect(Math.abs(disarmed.pitchDeg)).toBeLessThan(0.35);
    expect(disarmed.speedKmh).toBeLessThan(1);
    expect(disarmed.altitudeM).toBeLessThan(2);
    expect(disarmed.linkQualityPct).toBe(0);
  });

  it("scales the estimated power with payload and translation", () => {
    const light = estimatedPowerW(
      normalizeLiveParams({ ...params, payloadKg: 0.5 }),
      40,
      0
    );
    const heavy = estimatedPowerW(
      normalizeLiveParams({ ...params, payloadKg: 6 }),
      40,
      0
    );
    const translated = estimatedPowerW(normalizeLiveParams(params), 90, 0);
    const hovering = estimatedPowerW(normalizeLiveParams(params), 0, 0);
    expect(heavy).toBeGreaterThan(light);
    expect(translated).toBeGreaterThan(hovering);
    expect(hovering).toBeGreaterThan(0);
  });

  it("keeps the evolution deterministic for a given input", () => {
    const base = setLiveArmed(createLiveFlightState(params), true, params);
    const first = advanceLiveFlight(base, 0.25, params);
    const second = advanceLiveFlight(base, 0.25, params);
    expect(first.speedKmh).toBe(second.speedKmh);
    expect(first.pitchDeg).toBe(second.pitchDeg);
    expect(first.samples.length).toBe(second.samples.length);
  });

  it("never invents a discharge when no energy budget is declared", () => {
    const noBattery = { ...params, batteryWh: 0, cruiseSpeedKmh: 0, designAltitudeM: 0 };
    expect(hasEnergyBudget(noBattery)).toBe(false);
    expect(hasEnergyBudget(params)).toBe(true);
    expect(usesSimulationDefaults(noBattery)).toBe(true);
    expect(usesSimulationDefaults(params)).toBe(false);
    expect(batteryDrainPerSecond(normalizeLiveParams(noBattery), 200, true)).toBe(0);
    const armed = setLiveArmed(createLiveFlightState(noBattery), true, noBattery);
    let after = armed;
    for (let index = 0; index < 960; index += 1) {
      after = advanceLiveFlight(after, 0.25, noBattery);
    }
    expect(after.batteryPct).toBe(100);
    expect(after.altitudeM).toBeGreaterThan(0);
  });

  it("keeps the demonstration discharge slow enough to stay readable", () => {
    const armed = setLiveArmed(createLiveFlightState(params), true, params);
    const after = run(armed, 300);
    const drop = armed.batteryPct - after.batteryPct;
    expect(drop).toBeGreaterThan(2);
    expect(drop).toBeLessThan(40);
    expect(DEMO_TIME_SCALE).toBeGreaterThan(1);
    expect(after.batteryPct).toBeGreaterThan(
      normalizeLiveParams(params).reserveFraction! * 100
    );
  });
});
