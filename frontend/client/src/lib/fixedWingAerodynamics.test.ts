import { describe, expect, it } from "vitest";
import {
  calculateFixedWingAerodynamics as calc,
  type FixedWingInput,
} from "./fixedWingAerodynamics";

const base: FixedWingInput = {
  architecture: "fixed-wing",
  spanM: 3,
  chordM: 0.4,
  taperRatio: 0.6,
  massKg: 8,
  speedMps: 22,
  altitudeM: 100,
  temperatureC: 15,
  bankDeg: 25,
};

describe("fixed-wing aerodynamic estimate", () => {
  it("computes coherent lift coefficient, turn drag polar and drag", () => {
    const result = calc(base);
    const loadFactor = 1 / Math.cos((25 * Math.PI) / 180);
    expect(result.applicable).toBe(true);
    expect(result.loadFactor).toBeCloseTo(loadFactor, 8);
    expect(result.requiredCL).toBeCloseTo(
      (2 * loadFactor * 8 * 9.80665) /
        (result.densityKgM3! * 22 ** 2 * result.wingAreaM2!),
      8,
    );
    expect(result.cd).toBeCloseTo(
      0.04 + result.requiredCL! ** 2 / (Math.PI * 0.8 * result.aspectRatio!),
      8,
    );
    expect(result.dragN).toBeCloseTo(
      0.5 * result.densityKgM3! * 22 ** 2 * result.wingAreaM2! * result.cd!,
      8,
    );
  });

  it("responds monotonically to mass, speed and density", () => {
    const nominal = calc(base);
    expect(calc({ ...base, massKg: 10 }).requiredCL!).toBeGreaterThan(nominal.requiredCL!);
    expect(calc({ ...base, speedMps: 26 }).dragN!).toBeGreaterThan(nominal.dragN!);
    expect(calc({ ...base, altitudeM: 1500 }).densityKgM3!).toBeLessThan(nominal.densityKgM3!);
  });

  it("rejects non-finite inputs and flags invalid domain and stall margin", () => {
    expect(calc({ ...base, speedMps: Number.NaN }).status).toBe("invalid");
    expect(calc({ ...base, spanM: -1 }).status).toBe("outside-domain");
    expect(calc({ ...base, speedMps: 4 }).status).toBe("stall-risk");
    const stallSpeed = calc(base).stallSpeedMps!;
    expect(calc({ ...base, speedMps: stallSpeed * 1.2 }).status).toBe("stall-risk");
  });

  it("flags incompressible-model results above Mach 0.3", () => {
    const result = calc({ ...base, speedMps: 140 });
    expect(result.machNumber).toBeGreaterThan(0.3);
    expect(result.status).toBe("outside-domain");
    expect(result.reasons.join(" ")).toContain("compressibilité non modélisée");
  });

  it("does not claim results for unsupported architectures or a turn radius at zero bank", () => {
    const unsupported = calc({ ...base, architecture: "quadcopter" });
    expect(unsupported.status).toBe("not-applicable");
    expect(unsupported.dragN).toBeUndefined();
    expect(calc({ ...base, bankDeg: 0 }).turnRadiusM).toBeUndefined();
  });
});
