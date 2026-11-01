export type MissionTelemetryFrame = {
  latitude?: number;
  longitude?: number;
  altitudeM?: number;
  speedKmh?: number;
  batteryPct?: number;
  headingDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;
  flightMode?: string;
  linkQualityPct?: number;
  latencyMs?: number;
  temperatureC?: number;
  vibrationG?: number;
  fuelPct?: number;
  fuelRemainingKg?: number;
  fuelFlowKgS?: number;
  engineRpm?: number;
  engineTempC?: number;
  exhaustTempC?: number;
  thrustN?: number;
  hybridMode?: string;
};

function finiteNumber(
  data: Record<string, unknown>,
  aliases: string[],
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY
): number | undefined {
  for (const key of aliases) {
    const value = data[key];
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max
    ) {
      return value;
    }
  }
  return undefined;
}

/** Parse a read-only JSON telemetry frame emitted by an AeroMind bridge. */
export function parseMissionTelemetryPayload(
  raw: unknown
): MissionTelemetryFrame | null {
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return null;
  const envelope = parsed as Record<string, unknown>;
  const candidate = envelope.telemetry;
  const data =
    candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? (candidate as Record<string, unknown>)
      : envelope;
  const frame: MissionTelemetryFrame = {
    latitude: finiteNumber(data, ["latitude", "lat"], -90, 90),
    longitude: finiteNumber(data, ["longitude", "lon", "lng"], -180, 180),
    altitudeM: finiteNumber(data, ["altitudeM", "altitude", "alt_m"]),
    speedKmh: finiteNumber(data, ["speedKmh", "speed", "groundSpeedKmh"], 0),
    batteryPct: finiteNumber(
      data,
      ["batteryPct", "battery", "remainingPct"],
      0,
      100
    ),
    headingDeg: finiteNumber(
      data,
      ["headingDeg", "heading", "courseDeg"],
      0,
      360
    ),
    pitchDeg: finiteNumber(data, ["pitchDeg", "pitch", "attitudePitchDeg"], -180, 180),
    rollDeg: finiteNumber(data, ["rollDeg", "roll", "attitudeRollDeg"], -180, 180),
    linkQualityPct: finiteNumber(data, ["linkQualityPct", "linkQuality", "rssiPct"], 0, 100),
    latencyMs: finiteNumber(data, ["latencyMs", "latency", "rttMs"], 0, 60000),
    temperatureC: finiteNumber(data, ["temperatureC", "avionicsTempC", "tempC"], -80, 200),
    vibrationG: finiteNumber(data, ["vibrationG", "vibration", "vibration_g"], 0, 50),
    fuelPct: finiteNumber(data, ["fuelPct", "fuel_pct", "percent_remaining"], 0, 100),
    fuelRemainingKg: finiteNumber(data, ["fuelRemainingKg", "fuel_remaining_kg", "remaining"], 0),
    fuelFlowKgS: finiteNumber(data, ["fuelFlowKgS", "fuel_flow_kg_s"], 0),
    engineRpm: finiteNumber(data, ["engineRpm", "engine_rpm", "rpm"], 0),
    engineTempC: finiteNumber(data, ["engineTempC", "cylinder_temp_c", "motor_temperature"], -80, 1000),
    exhaustTempC: finiteNumber(data, ["exhaustTempC", "exhaust_temp_c", "esc_temperature"], -80, 1500),
    thrustN: finiteNumber(data, ["thrustN", "thrust_n"], 0),
    hybridMode: typeof data.hybridMode === "string" ? data.hybridMode.slice(0, 32) : typeof data.hybrid_mode === "string" ? data.hybrid_mode.slice(0, 32) : undefined,
    flightMode:
      typeof data.flightMode === "string"
        ? data.flightMode.slice(0, 40)
        : typeof data.mode === "string"
          ? data.mode.slice(0, 40)
          : undefined,
  };
  return Object.values(frame).some(value => value !== undefined) ? frame : null;
}
