import { describe, expect, it } from "vitest";
import { parseMissionTelemetryPayload } from "./missionBridge";

describe("read-only mission telemetry bridge", () => {
  it("parses normalized aliases and nested telemetry frames", () => {
    expect(
      parseMissionTelemetryPayload(
        JSON.stringify({
          type: "telemetry",
          telemetry: {
            lat: 48.123456,
            lon: 2.654321,
            altitudeM: 63.5,
            speedKmh: 28,
            batteryPct: 74,
            headingDeg: 182,
            pitchDeg: -4.5,
            rollDeg: 1.8,
            linkQualityPct: 87,
            latencyMs: 42,
            temperatureC: 38.2,
            vibrationG: 0.12,
            mode: "AUTO",
          },
        })
      )
    ).toEqual({
      latitude: 48.123456,
      longitude: 2.654321,
      altitudeM: 63.5,
      speedKmh: 28,
      batteryPct: 74,
      headingDeg: 182,
      pitchDeg: -4.5,
      rollDeg: 1.8,
      linkQualityPct: 87,
      latencyMs: 42,
      temperatureC: 38.2,
      vibrationG: 0.12,
      flightMode: "AUTO",
    });
  });

  it("keeps zero-valued readings and rejects out-of-range GPS/battery values", () => {
    expect(
      parseMissionTelemetryPayload(
        JSON.stringify({
          lat: 95,
          lon: -181,
          altitudeM: 0,
          speedKmh: 0,
          batteryPct: 120,
          headingDeg: 0,
          linkQualityPct: 120,
          latencyMs: -4,
          temperatureC: 250,
          vibrationG: -1,
        })
      )
    ).toEqual({ altitudeM: 0, speedKmh: 0, headingDeg: 0 });
  });

  it("returns null for malformed frames and objects without supported telemetry", () => {
    expect(parseMissionTelemetryPayload("not-json")).toBeNull();
    expect(
      parseMissionTelemetryPayload(JSON.stringify({ event: "heartbeat" }))
    ).toBeNull();
    expect(parseMissionTelemetryPayload({ altitudeM: 10 })).toBeNull();
  });
});
