import { afterEach, describe, expect, it, vi } from "vitest";
import { installResizeObserverPolyfill } from "./resizeObserverPolyfill";

afterEach(() => vi.unstubAllGlobals());

describe("installResizeObserverPolyfill", () => {
  it("installs a constructor when a WebView has no native ResizeObserver", () => {
    vi.stubGlobal("window", { ResizeObserver: undefined });

    expect(installResizeObserverPolyfill()).toBe(true);
    expect(typeof window.ResizeObserver).toBe("function");
    expect(installResizeObserverPolyfill()).toBe(false);
  });

  it("does not replace a native ResizeObserver", () => {
    const nativeObserver = class NativeResizeObserver {} as unknown as typeof ResizeObserver;
    vi.stubGlobal("window", { ResizeObserver: nativeObserver });

    expect(installResizeObserverPolyfill()).toBe(false);
    expect(window.ResizeObserver).toBe(nativeObserver);
  });
});
