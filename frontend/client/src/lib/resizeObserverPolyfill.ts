import ResizeObserverPolyfill from "resize-observer-polyfill";

/** Install the ResizeObserver fallback before mounting components that depend on it. */
export function installResizeObserverPolyfill(): boolean {
  if (typeof window === "undefined" || typeof window.ResizeObserver === "function") return false;
  window.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver;
  return true;
}
