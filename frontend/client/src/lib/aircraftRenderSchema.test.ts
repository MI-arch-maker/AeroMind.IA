import { describe, expect, it } from "vitest";
import type { ConceptConfig } from "./aeroEngine";
import { aircraftParameterSchema, migrateAircraftParameters, renderModes, validateAircraftMutation } from "./aircraftRenderSchema";

const config: ConceptConfig = {
  wingspan: 4.2, chord: 0.52, fuselageLength: 1.8, propDiameter: 0.42,
  batteryWh: 480, payloadKg: 2, cruiseSpeedKmh: 72, windSpeedKmh: 18,
  reserveFraction: 0.2, maxTakeoffKg: 8, altitudeM: 120,
  installedMaterials: [{ id: "battery", label: "Batterie", use: "Énergie", massKg: 1.2, geometry: "core", category: "energy", offsetX: 0.1, offsetY: -0.1 }],
};

describe("aircraft render schema", () => {
  it("migre une configuration existante sans perdre la morphologie ni les composants", () => {
    const aircraft = migrateAircraftParameters(config, undefined, config.installedMaterials);
    expect(aircraft.version).toBe(1);
    expect(aircraft.wing.spanM).toBe(4.2);
    expect(aircraft.wing.stations).toHaveLength(3);
    expect(aircraft.components[0].name).toBe("Batterie");
    expect(aircraftParameterSchema.safeParse(aircraft).success).toBe(true);
  });

  it("rejette une écriture invalide et conserve la valeur précédente", () => {
    const current = migrateAircraftParameters(config);
    const result = validateAircraftMutation(current, draft => ({ ...draft, wing: { ...draft.wing, spanM: -2 } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.value.wing.spanM).toBe(current.wing.spanM);
  });

  it("expose les six rendus libres et ordonnés", () => {
    expect(renderModes).toEqual(["R1", "R2", "R3", "R4", "R5", "R6"]);
  });
});
