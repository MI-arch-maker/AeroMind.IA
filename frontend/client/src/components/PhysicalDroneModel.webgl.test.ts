import { afterEach, describe, expect, it, vi } from "vitest";
import { canCreateWebGL2Context } from "./PhysicalDroneModel";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("canCreateWebGL2Context", () => {
  it("détecte la présence de l’API sans exiger ni créer un canvas de sonde", () => {
    vi.stubGlobal("window", { WebGL2RenderingContext: class WebGL2RenderingContext {} });

    expect(canCreateWebGL2Context()).toBe(true);
  });

  it("signale l’absence de WebGL2 lorsque le navigateur n’expose pas l’API", () => {
    vi.stubGlobal("window", {});

    expect(canCreateWebGL2Context()).toBe(false);
  });
});
