import type { MissionTelemetryFrame } from "./missionBridge";

export type MavlinkObserverSnapshot = {
  status: string;
  connected: boolean;
  readOnly: true;
  hardwareCommandsEnabled: false;
  receivedAt?: number;
  frame: MissionTelemetryFrame | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function number(value: unknown, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : undefined;
}

/** Convert an explicitly read-only AeroMind observer response; reject unsafe/unknown contracts. */
export function parseMavlinkObserverSnapshot(value: unknown): MavlinkObserverSnapshot | null {
  const data = record(value);
  if (!data || typeof data.status !== "string" || typeof data.connected !== "boolean") return null;
  if (data.read_only !== true || data.hardware_commands_enabled !== false) return null;

  const position = record(data.position);
  const flight = record(data.flight);
  const battery = record(data.battery);
  const latitude = number(position?.latitude_deg, -90, 90);
  const longitude = number(position?.longitude_deg, -180, 180);
  const altitudeM = number(position?.relative_altitude_m);
  const speedMps = number(flight?.groundspeed, 0);
  const headingDeg = number(flight?.heading, 0, 360);
  const batteryPct = number(battery?.battery_remaining, 0, 100);
  const customMode = number(record(data.heartbeat)?.custom_mode, 0);
  const frame: MissionTelemetryFrame = {
    latitude,
    longitude,
    altitudeM,
    speedKmh: speedMps === undefined ? undefined : speedMps * 3.6,
    headingDeg,
    batteryPct,
    flightMode: customMode === undefined ? undefined : `MAVLink · mode ${customMode}`,
  };
  const hasFrame = Object.values(frame).some(item => item !== undefined);
  const timestamp = typeof data.last_frame_at === "string" ? Date.parse(data.last_frame_at) : Number.NaN;

  return {
    status: data.status,
    connected: data.connected,
    readOnly: true,
    hardwareCommandsEnabled: false,
    receivedAt: Number.isFinite(timestamp) ? timestamp : undefined,
    frame: hasFrame ? frame : null,
  };
}
