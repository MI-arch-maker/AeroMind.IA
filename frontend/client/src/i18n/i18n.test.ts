import { describe, expect, it, vi } from "vitest";
import { compareLocale, formatDate, formatNumber, resolveMessage } from ".";

describe("namespaced AeroMind i18n foundation", () => {
  it("resolves the same screen key from the shared global language", () => {
    expect(resolveMessage("fr", "home.screen.title")).toBe("Cockpit d’ingénierie");
    expect(resolveMessage("en", "home.screen.title")).toBe("Engineering cockpit");
    expect(resolveMessage("fr", "labbench.screen.title")).toBe("Banc d’essai LabBench");
    expect(resolveMessage("en", "admin.screen.title")).toBe("Super-Admin console");
  });

  it("uses a localized, non-key fallback and logs a missing key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(resolveMessage("fr", "missing.key")).toBe("Texte indisponible dans la langue sélectionnée");
    expect(resolveMessage("en", "missing.key")).toBe("Text unavailable in the selected language");
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("formats numbers, dates and sorting according to the active locale", () => {
    expect(formatNumber("fr", 1234.5)).toBe("1\u202f234,5");
    expect(formatNumber("en", 1234.5)).toBe("1,234.5");
    const date = new Date("2026-04-05T12:00:00Z");
    expect(formatDate("fr", date, { timeZone: "UTC", dateStyle: "short" })).toBe("05/04/2026");
    expect(formatDate("en", date, { timeZone: "UTC", dateStyle: "short" })).toBe("05/04/2026");
    expect(["Éclair", "eau"].sort((a, b) => compareLocale("fr", a, b))).toEqual(["eau", "Éclair"]);
  });
});
