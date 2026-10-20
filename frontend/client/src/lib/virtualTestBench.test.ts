import { describe, expect, it } from "vitest";
import { defaultConcept, defaultRequirements } from "./aeroEngine";
import {
  runVirtualTestCampaign,
  virtualCampaignToCsv,
} from "./virtualTestBench";

describe("virtual test bench", () => {
  it("runs five distinct deterministic engineering scenarios", () => {
    const campaign = runVirtualTestCampaign(
      { ...defaultConcept, airframe: "fixed-wing" },
      defaultRequirements,
      "TEST-001"
    );
    expect(campaign.runId).toBe("TEST-001");
    expect(campaign.cases.map(item => item.id)).toEqual([
      "nominal",
      "headwind",
      "battery-derate",
      "payload-margin",
      "link-loss",
    ]);
    expect(campaign.cases[1].checks[0].status).toBe("fail");
    expect(campaign.cases[0].checks[2].status).toBe("pass");
    expect(campaign.cases[2].result.enduranceH).toBeLessThan(
      campaign.cases[0].result.enduranceH
    );
    expect(campaign.cases[3].result.totalMassKg).toBeGreaterThan(
      campaign.cases[0].result.totalMassKg
    );
    expect(campaign.cases[4].checks.map(check => check.id)).toEqual([
      "lost-link",
      "route",
    ]);
    expect(campaign.counts.pass + campaign.counts.review + campaign.counts.fail).toBe(5);
  });

  it("marks an unsafe lost-link hold for review and blocks an empty route", () => {
    const campaign = runVirtualTestCampaign(
      {
        ...defaultConcept,
        airframe: "quadcopter",
        missionPlan: {
          radiusKm: 4,
          returnAltitudeM: 50,
          lostLinkAction: "hold",
          homeX: 10,
          homeY: 80,
          waypoints: [],
        },
      },
      defaultRequirements,
      "TEST-002"
    );
    const test = campaign.cases.find(item => item.id === "link-loss");
    expect(test?.checks[0].status).toBe("review");
    expect(test?.checks[1].status).toBe("fail");
    expect(test?.status).toBe("fail");
  });

  it("exports every check with quoted semicolon-delimited provenance", () => {
    const campaign = runVirtualTestCampaign(defaultConcept, defaultRequirements, "TEST-CSV");
    const csv = virtualCampaignToCsv(campaign);
    expect(csv.startsWith("\uFEFF\"run_id\";\"scenario_id\"")).toBe(true);
    expect(csv).toContain("\"TEST-CSV\";\"battery-derate\"");
    expect(csv).toContain("\"Perte de liaison\"");
    expect(csv.split("\r\n")).toHaveLength(
      1 + campaign.cases.reduce((sum, item) => sum + item.checks.length, 0)
    );
  });
});
