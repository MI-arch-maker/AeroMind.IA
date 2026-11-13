import { describe, expect, it } from "vitest";
import { canLaunchMission, defaultMissionPlan, validateMissionPlan } from "./autonomy";

describe("supervised autonomy guardrails", () => {
  it("requires human approval and return-on-link-loss", () => {
    expect(canLaunchMission(defaultMissionPlan)).toBe(true);
    expect(canLaunchMission({ ...defaultMissionPlan, humanApproval: false })).toBe(false);
    expect(canLaunchMission({ ...defaultMissionPlan, returnOnLinkLoss: false })).toBe(false);
  });

  it("blocks excessive altitude and geofence radius", () => {
    const checks = validateMissionPlan({ ...defaultMissionPlan, maxAltitudeM: 250, geofenceRadiusKm: 50 });
    expect(checks.find(check => check.id === "altitude")?.passed).toBe(false);
    expect(checks.find(check => check.id === "geofence")?.passed).toBe(false);
  });
});
