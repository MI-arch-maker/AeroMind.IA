import { afterEach, describe, expect, it, vi } from "vitest";
import { canCreateWebGL2Context, reserveWebGLCanvas, type SlotRelease } from "./PhysicalDroneModel";

const cancellations: Array<() => void> = [];
function reserve(onGranted: (release: SlotRelease) => void) {
  const cancel = reserveWebGLCanvas(onGranted);
  cancellations.push(cancel);
  return cancel;
}

afterEach(() => {
  // Cancel queued requests before releasing their owners, including on failure.
  while (cancellations.length) cancellations.pop()?.();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("canCreateWebGL2Context", () => {
  it("détecte la présence de l’API sans créer ni perdre de contexte de sonde", () => {
    const createElement = vi.fn(() => { throw new Error("Aucun canvas de sonde autorisé"); });
    vi.stubGlobal("document", { createElement });
    vi.stubGlobal("window", { WebGL2RenderingContext: class WebGL2RenderingContext {} });

    expect(canCreateWebGL2Context()).toBe(true);
    expect(createElement).not.toHaveBeenCalled();
  });

  it("signale l’absence de WebGL2 lorsque le navigateur n’expose pas l’API", () => {
    vi.stubGlobal("window", {});
    expect(canCreateWebGL2Context()).toBe(false);
  });

  it("reste sûr sans navigateur (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(canCreateWebGL2Context()).toBe(false);
  });
});

describe("reserveWebGLCanvas", () => {
  it("accorde immédiatement un seul créneau et sert les demandes suivantes en FIFO", () => {
    const order: number[] = [];
    const releases: SlotRelease[] = [];
    for (let index = 0; index < 3; index++) {
      reserve(release => { order.push(index); releases.push(release); });
    }
    expect(order).toEqual([0]);
    releases[0]();
    expect(order).toEqual([0, 1]);
    releases[1]();
    expect(order).toEqual([0, 1, 2]);
  });

  it("retire une demande annulée sans bloquer celle qui suit", () => {
    const cancelOwner = reserve(() => undefined);
    const cancelled = vi.fn();
    const next = vi.fn();
    const cancelWaiting = reserve(cancelled);
    reserve(next);
    cancelWaiting();
    cancelWaiting();
    cancelOwner();
    expect(cancelled).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("rend la libération et l’annulation idempotentes, même après transfert du créneau", () => {
    let freeOwner!: SlotRelease;
    const cancelOwner = reserve(release => { freeOwner = release; });
    const next = vi.fn();
    const third = vi.fn();
    const cancelNext = reserve(next);
    reserve(third);
    freeOwner();
    freeOwner();
    cancelOwner();
    cancelOwner();
    expect(next).toHaveBeenCalledOnce();
    expect(third).not.toHaveBeenCalled();
    cancelNext();
    expect(third).toHaveBeenCalledOnce();
  });

  it("restitue le créneau lorsqu’un callback immédiat lève et propage la même exception", () => {
    const failure = new Error("initialisation immédiate échouée");
    expect(() => reserve(() => { throw failure; })).toThrow(failure);
    const next = vi.fn();
    reserve(next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("isole une exception en attente du cleanup précédent et continue la file", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cancelOwner = reserve(() => undefined);
    const failure = new Error("initialisation en attente échouée");
    reserve(() => { throw failure; });
    const next = vi.fn();
    reserve(next);
    expect(() => cancelOwner()).not.toThrow();
    expect(next).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith("AeroMind WebGL queued reservation failed.", failure);
  });

  it("ne restitue pas deux fois le budget si le callback libère puis lève", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cancelOwner = reserve(() => undefined);
    reserve(release => { release(); throw new Error("après libération"); });
    const next = vi.fn();
    const waiting = vi.fn();
    reserve(next);
    reserve(waiting);
    cancelOwner();
    expect(next).toHaveBeenCalledOnce();
    expect(waiting).not.toHaveBeenCalled();
  });

  it("conserve FIFO lorsqu’un callback réentrant ajoute une demande après libération", () => {
    const order: string[] = [];
    const cancelOwner = reserve(() => undefined);
    let freeSecond!: SlotRelease;
    reserve(release => {
      order.push("first");
      release();
      reserve(() => { order.push("reentrant"); });
    });
    reserve(release => { order.push("second"); freeSecond = release; });
    cancelOwner();
    expect(order).toEqual(["first", "second"]);
    freeSecond();
    expect(order).toEqual(["first", "second", "reentrant"]);
  });

  it("peut annuler un autre waiter pendant un callback de la file", () => {
    const cancelOwner = reserve(() => undefined);
    let cancelVictim!: () => void;
    reserve(release => { cancelVictim(); release(); });
    const victim = vi.fn();
    cancelVictim = reserve(victim);
    const next = vi.fn();
    reserve(next);
    cancelOwner();
    expect(victim).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("draine une longue file de libérations synchrones sans récursion ni blocage", () => {
    const cancelOwner = reserve(() => undefined);
    let granted = 0;
    for (let index = 0; index < 10_000; index++) {
      reserve(release => { granted++; release(); });
    }
    expect(() => cancelOwner()).not.toThrow();
    expect(granted).toBe(10_000);
    const next = vi.fn();
    reserve(next);
    expect(next).toHaveBeenCalledOnce();
  });
});
