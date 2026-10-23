import { describe, expect, it } from "vitest";
import { defaultConcept } from "./aeroEngine";
import {
  airframeEmptyMassKg,
  baselinePowerW,
  computeEquipmentLoad,
  equipmentOptions,
  evaluateReadiness,
} from "./aeronauticalCenter";

describe("aeronautical center readiness", () => {
  it("keeps an incomplete aircraft configuration blocked", () => {
    const result = evaluateReadiness(defaultConcept, [], "observation");
    expect(result.status).toBe("blocked");
    expect(result.passed).toBe(3);
  });
  it("recognizes a configured non-armed observation aircraft", () => {
    const config = { ...defaultConcept, airframe: "quadcopter" as const, batteryWh: 900, reserveFraction: 0.2, maxTakeoffKg: 8 };
    const equipment = equipmentOptions.filter(item => ["eo-gimbal", "rtk", "parachute"].includes(item.id));
    const result = evaluateReadiness(config, equipment, "observation");
    expect(result.status).toBe("ready");
    expect(result.passed).toBe(result.total);
  });
  it("declares a power draw for every catalogue equipment", () => {
    for (const item of equipmentOptions) {
      expect(item.powerW).toBeGreaterThan(0);
      expect(item.massKg).toBeGreaterThan(0);
    }
  });
  it("recomputes mass and battery draw when the equipment selection changes", () => {
    const config = { ...defaultConcept, airframe: "quadcopter" as const, batteryWh: 1200, payloadKg: 1, maxTakeoffKg: 9, motorCount: 4 };
    const empty = computeEquipmentLoad(config, []);
    const eo = computeEquipmentLoad(
      config,
      equipmentOptions.filter(item => item.id === "eo-gimbal")
    );
    const sensors = computeEquipmentLoad(
      config,
      equipmentOptions.filter(item => ["eo-gimbal", "thermal", "mapping", "relay"].includes(item.id))
    );
    expect(empty.equipmentMassKg).toBe(0);
    expect(empty.equipmentPowerW).toBe(0);
    expect(empty.airframeMassKg).toBe(airframeEmptyMassKg.quadcopter);
    expect(eo.computedMaxMassKg).toBeGreaterThan(empty.computedMaxMassKg);
    expect(eo.computedPowerW).toBeGreaterThan(empty.computedPowerW);
    expect(sensors.computedPowerW).toBeGreaterThan(eo.computedPowerW);
    expect(sensors.equipmentMassKg).toBeGreaterThan(eo.equipmentMassKg);
    expect(sensors.enduranceMin).toBeLessThan(eo.enduranceMin);
  });
  it("keeps the mass margin relative to the declared maximum take-off mass", () => {
    const config = { ...defaultConcept, airframe: "fixed-wing" as const, batteryWh: 1500, payloadKg: 2, maxTakeoffKg: 4, motorCount: 1 };
    const load = computeEquipmentLoad(config, equipmentOptions.slice(0, 5));
    expect(load.massMarginKg).toBeCloseTo(4 - load.computedMaxMassKg, 2);
    expect(load.computedPowerW).toBeCloseTo(
      baselinePowerW(config) + load.equipmentPowerW,
      1
    );
  });
});
