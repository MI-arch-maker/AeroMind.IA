import { afterEach, describe, expect, it, vi } from "vitest";
import { persistSidebarWidth, readSidebarWidth } from "./DashboardLayout";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("largeur de la sidebar", () => {
  it("utilise la largeur par défaut si localStorage est indisponible", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readSidebarWidth()).toBe(280);
    expect(() => persistSidebarWidth(320)).not.toThrow();
  });

  it("ignore une valeur invalide et borne les valeurs valides", () => {
    const getItem = vi.fn(() => "not-a-number");
    vi.stubGlobal("localStorage", { getItem, setItem: vi.fn() });
    expect(readSidebarWidth()).toBe(280);

    getItem.mockReturnValue("120");
    expect(readSidebarWidth()).toBe(200);
    getItem.mockReturnValue("600");
    expect(readSidebarWidth()).toBe(480);
    getItem.mockReturnValue("340");
    expect(readSidebarWidth()).toBe(340);
  });

  it("retombe sur la largeur par défaut si l’accès au stockage lève une erreur", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("storage blocked"); },
      setItem: () => { throw new Error("storage blocked"); },
    });
    expect(readSidebarWidth()).toBe(280);
    expect(() => persistSidebarWidth(300)).not.toThrow();
  });
});
