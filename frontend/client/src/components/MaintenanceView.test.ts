import { describe, expect, it } from "vitest";
import { maintenanceErrorMessage } from "./MaintenanceView";

describe("maintenanceErrorMessage", () => {
  it("shows API detail or message instead of silently implying an empty result", () => {
    expect(maintenanceErrorMessage(403, { detail: "accès refusé" })).toBe("accès refusé");
    expect(maintenanceErrorMessage(500, { message: "serveur indisponible" })).toBe("serveur indisponible");
  });
  it("falls back to the HTTP status when the response has no usable message", () => {
    expect(maintenanceErrorMessage(503, null)).toBe("HTTP 503");
  });
});
