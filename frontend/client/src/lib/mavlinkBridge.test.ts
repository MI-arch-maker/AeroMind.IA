import { describe, expect, it } from "vitest";
import { parseMavlinkObserverSnapshot } from "./mavlinkBridge";

const safeSnapshot = {
  status: "OBSERVING",
  connected: true,
  read_only: true,
  hardware_commands_enabled: false,
  last_frame_at: "2026-10-19T10:00:00.000Z",
  heartbeat: { custom_mode: 4 },
  position: { latitude_deg: 48.5, longitude_deg: 2.3, relative_altitude_m: 80 },
  flight: { groundspeed: 10, heading: 90 },
  battery: { battery_remaining: 76 },
};

describe("read-only MAVLink observer bridge", () => {
  it("maps only read-only telemetry and converts speed from m/s to km/h", () => {
    expect(parseMavlinkObserverSnapshot(safeSnapshot)).toMatchObject({
      status: "OBSERVING",
      connected: true,
      readOnly: true,
      hardwareCommandsEnabled: false,
      frame: {
        latitude: 48.5,
        longitude: 2.3,
        altitudeM: 80,
        speedKmh: 36,
        headingDeg: 90,
        batteryPct: 76,
      },
    });
  });

  it("rejects any response that does not affirm the read-only/no-command contract", () => {
    expect(parseMavlinkObserverSnapshot({ ...safeSnapshot, read_only: false })).toBeNull();
    expect(parseMavlinkObserverSnapshot({ ...safeSnapshot, hardware_commands_enabled: true })).toBeNull();
    expect(parseMavlinkObserverSnapshot({ status: "OBSERVING", connected: true })).toBeNull();
  });
});
