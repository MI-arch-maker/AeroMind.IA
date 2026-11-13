import { describe, expect, it } from "vitest";
import {
  defaultMissionRequirements,
  missionRequirementTemplates,
} from "./missionRequirements";

describe("mission requirement library", () => {
  it("keeps current offers distinct from explicitly tentative opportunity profiles", () => {
    const market = missionRequirementTemplates.filter(
      template => template.classification !== "emerging-gap"
    );
    const opportunities = missionRequirementTemplates.filter(
      template => template.classification === "emerging-gap"
    );

    expect(market.length).toBe(4);
    expect(opportunities.length).toBe(6);
    expect(missionRequirementTemplates.length).toBe(10);
    for (const template of market) {
      expect(template.requirements.length).toBeGreaterThanOrEqual(3);
      expect(template.requirements.every(item => item.sourceUrl?.startsWith("https://"))).toBe(true);
      expect(template.evidence.length).toBeGreaterThanOrEqual(2);
    }
    for (const template of opportunities) {
      expect(template.requirements.length).toBeGreaterThanOrEqual(1);
      expect(template.requirements.some(item => item.status === "hypothesis")).toBe(true);
      expect(
        template.requirements
          .filter(item => item.status === "hypothesis")
          .every(item => item.sourceClass === "emerging-gap")
      ).toBe(true);
      expect(template.summary.toLowerCase()).toContain("hypothèse");
    }
  });

  it("starts new projects with a multisector benchmark and emerging-requirement baseline", () => {
    expect(defaultMissionRequirements).toHaveLength(21);
    expect(defaultMissionRequirements.filter(item => item.status === "hypothesis")).toHaveLength(9);
    expect(defaultMissionRequirements.some(item => item.sourceClass === "market-current")).toBe(true);
    const initialIds = new Set(defaultMissionRequirements.map(item => item.id));
    expect(initialIds.has("req-wildfire-store-forward")).toBe(true);
    expect(initialIds.has("req-gap-non-gnss-recovery")).toBe(true);
    expect(initialIds.has("req-intention-inter-service")).toBe(true);
    expect(initialIds.has("env-traceability")).toBe(true);
  });

  it("uses unique profile and requirement identifiers", () => {
    expect(new Set(missionRequirementTemplates.map(item => item.id)).size).toBe(
      missionRequirementTemplates.length
    );
    const ids = missionRequirementTemplates.flatMap(template =>
      template.requirements.map(item => item.id)
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
