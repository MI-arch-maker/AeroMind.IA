import { describe, expect, it } from "vitest";
import { HOME_VIEW_IDS, resolveInitialHomeView } from "./homeViewRouting";

describe("resolveInitialHomeView", () => {
  it("résout directement chaque vue déclarée de Home", () => {
    for (const view of HOME_VIEW_IDS) {
      const expected = view === "tools" || view === "inspector" ? "digital-twin" : view;
      expect(resolveInitialHomeView(`?view=${encodeURIComponent(view)}`, "/")).toBe(expected);
    }
  });

  it("préserve les alias historiques dans Digital Twin Explorer", () => {
    expect(resolveInitialHomeView("?view=tools", "/")).toBe("digital-twin");
    expect(resolveInitialHomeView("?view=inspector", "/")).toBe("digital-twin");
  });

  it("conserve les routes historiques et ignore une vue inconnue", () => {
    expect(resolveInitialHomeView("", "/engineering-hub")).toBe("engineering-hub");
    expect(resolveInitialHomeView("", "/labbench")).toBe("labbench");
    expect(resolveInitialHomeView("?view=not-a-view", "/")).toBe("overview");
    expect(resolveInitialHomeView("", "/")).toBe("overview");
  });
});
