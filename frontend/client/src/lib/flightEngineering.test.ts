import { describe, expect, it } from "vitest";
import { defaultConcept } from "./aeroEngine";
import {
  buildBillOfMaterialsCsv,
  buildEngineeringJson,
  buildOpenScadModel,
} from "./engineeringExports";
import {
  buildMissionTemplate,
  calculateFlightPreview,
  createCompatibleDemoMissionPlan,
  defaultFlightControls,
  defaultLocalMissionPlan,
  estimateLocalMissionDistanceKm,
  validateLocalMission,
} from "./flightEngineering";

describe("flight engineering preview", () => {
  it("builds editable local mission templates from project limits", () => {
    const grid = buildMissionTemplate("area-grid", {
      ...defaultConcept,
      altitudeM: 100,
      cruiseSpeedKmh: 50,
    });
    expect(grid).toHaveLength(7);
    expect(grid.every(point => point.altitudeM <= 100)).toBe(true);
    expect(grid.every(point => point.speedKmh <= 50)).toBe(true);
    expect(grid.some(point => point.action === "turn")).toBe(true);
    expect(buildMissionTemplate("direct-return", defaultConcept)).toHaveLength(
      2
    );
  });

  it("maps persisted control inputs to visible attitude and throttle outputs", () => {
    const response = calculateFlightPreview(defaultConcept, {
      ...defaultFlightControls,
      aileronDeg: 12,
      elevatorDeg: -4,
      throttlePct: 70,
    });
    expect(response.rollDeg).toBeGreaterThan(0);
    expect(response.pitchDeg).toBeLessThan(0);
    expect(response.airspeedKmh).toBe(36.4);
    expect(response.motorOutputsPct).toEqual([70]);
  });

  it("limits actuator outputs and signals saturation", () => {
    const response = calculateFlightPreview(defaultConcept, {
      ...defaultFlightControls,
      servoLimitDeg: 18,
      rudderDeg: 30,
    });
    expect(response.rudderDeg).toBeLessThanOrEqual(18);
    expect(response.saturated).toBe(true);
  });

  it("produces a deterministic mission distance and checks the default local route", () => {
    const first = estimateLocalMissionDistanceKm(defaultLocalMissionPlan);
    const second = estimateLocalMissionDistanceKm(defaultLocalMissionPlan);
    expect(first).toBeGreaterThan(0);
    expect(first).toBe(second);
    expect(
      validateLocalMission(defaultConcept, defaultLocalMissionPlan).some(
        item => item.severity === "block"
      )
    ).toBe(false);
  });

  it("keeps the demo mission inside a small platform envelope", () => {
    const compactConfig = {
      ...defaultConcept,
      altitudeM: 40,
      cruiseSpeedKmh: 30,
    };
    const plan = createCompatibleDemoMissionPlan(compactConfig);
    expect(plan.waypoints.every(point => point.altitudeM <= 32)).toBe(true);
    expect(plan.waypoints.every(point => point.speedKmh <= 24)).toBe(true);
    expect(
      validateLocalMission(compactConfig, plan).some(
        check => check.severity === "block"
      )
    ).toBe(false);
  });

  it("blocks preflight when required design parameters are missing", () => {
    const incompleteConfig = {
      ...defaultConcept,
      altitudeM: 0,
      cruiseSpeedKmh: 0,
      batteryWh: 0,
      maxTakeoffKg: 0,
    };
    expect(
      validateLocalMission(
        incompleteConfig,
        createCompatibleDemoMissionPlan(incompleteConfig)
      ).some(check => check.severity === "block")
    ).toBe(true);
    const incompletePlan = createCompatibleDemoMissionPlan(incompleteConfig);
    expect(incompletePlan.waypoints.every(point => point.altitudeM > 0)).toBe(true);
    expect(incompletePlan.waypoints.every(point => point.speedKmh > 0)).toBe(true);
    expect(
      validateLocalMission(
        { ...defaultConcept, altitudeM: 0.0001, cruiseSpeedKmh: 0.0001 },
        createCompatibleDemoMissionPlan({ ...defaultConcept, altitudeM: 0.0001, cruiseSpeedKmh: 0.0001 })
      ).some(check => check.severity === "block")
    ).toBe(true);
  });
});

describe("engineering exports", () => {
  it("exports selected dimensions as millimetres in OpenSCAD", () => {
    const cad = buildOpenScadModel({
      ...defaultConcept,
      wingspan: 3.2,
      motorCount: 6,
    });
    expect(cad).toContain("wingspan_mm = 3200;");
    expect(cad).toContain("motor_count = 6;");
    expect(cad).toContain("Open with OpenSCAD");
  });

  it("includes installed items and explicit preliminary status in deliverables", () => {
    const materials = [
      { id: "carbon", label: "Composite carbone", use: "Aile", massKg: 0.82 },
    ];
    expect(buildBillOfMaterialsCsv(defaultConcept, materials)).toContain(
      "Composite carbone"
    );
    expect(buildEngineeringJson(defaultConcept)).toContain(
      '"status": "preliminary"'
    );
  });
});
