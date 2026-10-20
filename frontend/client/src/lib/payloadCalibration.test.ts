import { describe, expect, it } from "vitest";
import { runPayloadCalibration } from "./payloadCalibration";

const module = { id: "camera-rgb", label: "Caméra RGB", nominalFieldOfViewDeg: 62 };

describe("payload software calibration", () => {
  it("returns a passing report for installed equipment at nominal settings", () => {
    const report = runPayloadCalibration({
      module,
      installed: true,
      gimbalPitchDeg: 0,
      fieldOfViewDeg: 62,
      generatedAt: "2026-10-19T12:00:00.000Z",
      reportId: "CAL-TEST-1",
    });
    expect(report.overall).toBe("pass");
    expect(report.source).toBe("simulation-locale");
    expect(report.checks).toHaveLength(4);
    expect(report.checks.every(check => check.status === "pass")).toBe(true);
    expect(report.limitations).toContain("Aucune commande, calibration ou activation matérielle n’a été effectuée.");
  });

  it("fails an equipment-presence check when the module is not installed", () => {
    const report = runPayloadCalibration({ module, installed: false, gimbalPitchDeg: 0, fieldOfViewDeg: 62 });
    expect(report.overall).toBe("fail");
    expect(report.checks.find(check => check.id === "equipment-presence")?.status).toBe("fail");
  });

  it("flags out-of-range alignment and substantial field-of-view error", () => {
    const report = runPayloadCalibration({ module, installed: true, gimbalPitchDeg: 45, fieldOfViewDeg: 120 });
    expect(report.overall).toBe("fail");
    expect(report.checks.find(check => check.id === "gimbal-range")?.status).toBe("fail");
    expect(report.checks.find(check => check.id === "fov-reference")?.status).toBe("fail");
    expect(report.checks.find(check => check.id === "axis-residual")?.status).toBe("fail");
  });

  it("produces a review result for borderline settings and records its tested parameters", () => {
    const report = runPayloadCalibration({ module, installed: true, gimbalPitchDeg: 35, fieldOfViewDeg: 72 });
    expect(report.overall).toBe("review");
    expect(report.parameters).toMatchObject({ gimbalPitchDeg: 35, fieldOfViewDeg: 72, nominalFieldOfViewDeg: 62 });
  });
});
