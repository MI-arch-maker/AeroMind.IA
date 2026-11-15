import { describe, expect, it, vi } from "vitest";
import type * as THREE from "three";
import {
  createAerodynamicCleanup,
  createAerodynamicRenderer,
  disposeAerodynamicRenderer,
} from "./aerodynamicWebGL";

function fixture(available = true) {
  const loseContext = vi.fn();
  const context = {
    isContextLost: () => false,
    getExtension: vi.fn(() => ({ loseContext })),
  } as unknown as WebGL2RenderingContext;
  const canvas = {
    dataset: {},
    getContext: vi.fn(() => (available ? context : null)),
    remove: vi.fn(),
  } as unknown as HTMLCanvasElement;
  const renderer = { dispose: vi.fn() } as unknown as THREE.WebGLRenderer;
  return { canvas, context, renderer, loseContext };
}

describe("initialisation WebGL 2 aérodynamique", () => {
  it("réserve un seul contexte réel et le transmet au renderer", () => {
    const f = fixture();
    const factory = vi.fn(() => f.renderer);
    expect(createAerodynamicRenderer(() => f.canvas, factory).context).toBe(
      f.context,
    );
    expect(f.canvas.getContext).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledWith({
      canvas: f.canvas,
      context: f.context,
      alpha: false,
    });
    expect(f.loseContext).not.toHaveBeenCalled();
    expect(f.canvas.dataset.renderer).toBe("webgl2");
  });
  it("réessaie sans antialiasing si le premier profil est refusé", () => {
    const first = fixture(false);
    const second = fixture();
    const canvasFactory = vi
      .fn()
      .mockReturnValueOnce(first.canvas)
      .mockReturnValueOnce(second.canvas);
    expect(
      createAerodynamicRenderer(canvasFactory, () => second.renderer).canvas,
    ).toBe(second.canvas);
    expect(second.canvas.getContext).toHaveBeenCalledWith(
      "webgl2",
      expect.objectContaining({ antialias: false, powerPreference: "default" }),
    );
    expect(first.canvas.getContext).toHaveBeenCalledOnce();
  });
  it("signale le refus sans fallback WebGL1 ni canvas 2D", () => {
    const f = fixture(false);
    expect(() =>
      createAerodynamicRenderer(
        () => f.canvas,
        () => f.renderer,
      ),
    ).toThrow(/WebGL 2/);
    expect(f.canvas.getContext).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(f.canvas.getContext)
        .mock.calls.every((call) => call[0] === "webgl2"),
    ).toBe(true);
  });
  it("libère chaque contexte dont la construction du renderer échoue", () => {
    const f = fixture();
    expect(() =>
      createAerodynamicRenderer(
        () => f.canvas,
        () => {
          throw new Error("GPU indisponible");
        },
      ),
    ).toThrow("GPU indisponible");
    expect(f.loseContext).toHaveBeenCalledTimes(2);
  });
  it("libère le GPU même si dispose échoue", () => {
    const f = fixture();
    vi.mocked(f.renderer.dispose).mockImplementation(() => {
      throw new Error("dispose");
    });
    expect(() => disposeAerodynamicRenderer(f)).toThrow("dispose");
    expect(f.loseContext).toHaveBeenCalledOnce();
    expect(f.canvas.remove).toHaveBeenCalledOnce();
  });
  it("ne libère jamais deux fois le même contexte", () => {
    const f = fixture();
    disposeAerodynamicRenderer(f);
    disposeAerodynamicRenderer(f);
    expect(f.renderer.dispose).toHaveBeenCalledOnce();
    expect(f.loseContext).toHaveBeenCalledOnce();
  });
  it("nettoie les ressources partielles en ordre inverse malgré un destructeur défaillant", () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const order: string[] = [];
    const lifecycle = createAerodynamicCleanup(() => order.push("gpu-final"));
    lifecycle.add(() => order.push("controls"));
    lifecycle.add(() => {
      order.push("observer-error");
      throw new Error("interruption");
    });
    lifecycle.add(() => order.push("listeners"));
    lifecycle.dispose();
    lifecycle.dispose();
    expect(order).toEqual([
      "listeners",
      "observer-error",
      "controls",
      "gpu-final",
    ]);
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });
});
