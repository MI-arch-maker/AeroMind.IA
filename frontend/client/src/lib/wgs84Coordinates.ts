export type Wgs84ParseResult =
  | { valid: true; latitude: number; longitude: number }
  | { valid: false; error: string };

/** Parse decimal-degree WGS84 coordinates without rounding or silent clamping. */
export function parseWgs84Coordinates(
  latitudeText: string,
  longitudeText: string,
): Wgs84ParseResult {
  if (!latitudeText.trim() || !longitudeText.trim()) {
    return { valid: false, error: "Saisissez la latitude et la longitude." };
  }

  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { valid: false, error: "Les coordonnées doivent être des nombres finis." };
  }
  if (latitude < -90 || latitude > 90) {
    return { valid: false, error: "La latitude doit être comprise entre −90° et 90°." };
  }
  if (longitude < -180 || longitude > 180) {
    return { valid: false, error: "La longitude doit être comprise entre −180° et 180°." };
  }
  return { valid: true, latitude, longitude };
}
