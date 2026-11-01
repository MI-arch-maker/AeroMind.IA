import { describe, expect, it } from "vitest";
import type { DroneCatalogDesign } from "./droneCatalog";
import { resolveDroneModelArchitecture, resolveDroneMotorCount } from "./droneModelProfile";

function profile(key: DroneCatalogDesign["key"], modelType: DroneCatalogDesign["modelType"], motorCount?: number): Pick<DroneCatalogDesign, "key" | "modelType" | "configuration"> {
  return { key, modelType, configuration: motorCount === undefined ? {} : { motorCount } };
}

describe("droneModelProfile", () => {
  it("reconnaît la voilure fixe et conserve un moteur unique", () => {
    const deluge = profile("fixed-wing", "voilure-conventionnelle", 1);
    expect(resolveDroneModelArchitecture(deluge)).toBe("fixed-wing");
    expect(resolveDroneMotorCount(deluge)).toBe(1);
  });

  it("utilise la valeur par défaut propre à une voilure fixe", () => {
    expect(resolveDroneMotorCount(profile("fixed-wing", "voilure-conventionnelle"))).toBe(1);
  });

  it("reconnaît les architectures VTOL et conserve leur nombre de rotors déclaré", () => {
    const hybrid = profile("vtol", "tiltrotor", 5);
    expect(resolveDroneModelArchitecture(hybrid)).toBe("vtol");
    expect(resolveDroneMotorCount(hybrid)).toBe(5);
  });

  it("garde le minimum de deux rotors pour un multirotor et borne les valeurs excessives", () => {
    expect(resolveDroneModelArchitecture(profile("multirotor", "hexacoptère", 6))).toBe("multirotor");
    expect(resolveDroneMotorCount(profile("multirotor", "hexacoptère", 1))).toBe(2);
    expect(resolveDroneMotorCount(profile("multirotor", "hexacoptère", 12))).toBe(8);
  });
});
