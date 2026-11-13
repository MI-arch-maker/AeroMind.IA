import { describe, expect, it } from "vitest";
import { parseWgs84Coordinates } from "./wgs84Coordinates";

describe("parseWgs84Coordinates", () => {
  it("preserves valid decimal-degree coordinates without rounding", () => {
    expect(parseWgs84Coordinates("48.85661234", "2.35222198")).toEqual({
      valid: true,
      latitude: 48.85661234,
      longitude: 2.35222198,
    });
  });

  it("accepts the WGS84 boundary values", () => {
    expect(parseWgs84Coordinates("-90", "-180").valid).toBe(true);
    expect(parseWgs84Coordinates("90", "180").valid).toBe(true);
  });

  it("rejects empty, non-finite and out-of-range coordinates", () => {
    expect(parseWgs84Coordinates("", "2").valid).toBe(false);
    expect(parseWgs84Coordinates("Infinity", "2").valid).toBe(false);
    expect(parseWgs84Coordinates("90.0001", "2").valid).toBe(false);
    expect(parseWgs84Coordinates("48", "180.0001").valid).toBe(false);
  });
});
