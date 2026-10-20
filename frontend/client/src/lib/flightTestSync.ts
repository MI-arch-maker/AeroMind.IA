export type FlightTestCoordinate = {
  x: number;
  y: number;
  altitudeM: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** A route is considered synchronized only when it contains at least two waypoints. */
export function hasSynchronizedMissionRoute(waypoints: readonly unknown[] | undefined): boolean {
  return (waypoints?.length ?? 0) >= 2;
}

/** Projects normalized local XY and mission altitude into the display's axonometric volume. */
export function projectFlightTestPoint(
  point: FlightTestCoordinate,
  altitudeExtentM: number,
): { x: number; y: number } {
  const safeExtent = Number.isFinite(altitudeExtentM) ? Math.max(altitudeExtentM, 1) : 1;
  const safeX = Number.isFinite(point.x) ? point.x : 0;
  const safeY = Number.isFinite(point.y) ? point.y : 0;
  const safeAltitude = Number.isFinite(point.altitudeM) ? point.altitudeM : 0;
  return {
    x: 10 + safeX * 0.64 + safeY * 0.18,
    y: 76 - safeY * 0.18 - clamp(safeAltitude / safeExtent, 0, 1) * 18,
  };
}

/** Returns null rather than inventing a 0% battery reading when capacity is absent. */
export function estimateFlightTestBatteryPercent(
  energyUsableWh: number,
  batteryCapacityWh: number,
  phase: number,
): number | null {
  if (!Number.isFinite(batteryCapacityWh) || batteryCapacityWh <= 0 || !Number.isFinite(energyUsableWh)) {
    return null;
  }
  const batteryBase = clamp((energyUsableWh / batteryCapacityWh) * 100, 0, 100);
  const safePhase = clamp(Number.isFinite(phase) ? phase : 0, 0, 1);
  return Math.max(0, Math.round(batteryBase - safePhase * Math.min(batteryBase, 18)));
}
