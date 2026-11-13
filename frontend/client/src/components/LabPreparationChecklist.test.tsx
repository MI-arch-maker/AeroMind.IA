import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LabPreparationChecklist } from "./LabPreparationChecklist";

vi.mock("../contexts/LanguageContext", () => ({
  useLanguage: () => ({ t: (message: string) => message }),
}));

describe("LabPreparationChecklist", () => {
  it("displays the non-certification warning and critical software-only preparation prompts", () => {
    const markup = renderToStaticMarkup(React.createElement(LabPreparationChecklist));

    expect(markup).toContain("Preparation aid only — not EASA approval or certification");
    expect(markup).toContain("not regulatory approval, EASA certification");
    expect(markup).toContain("Keep output silent and hardware disabled");
    expect(markup).toContain("Use deterministic simulation and SITL before any bench proposal");
    expect(markup).toContain("No hardware test or flight is authorized here");
    expect(markup).toContain("Require fresh position and telemetry, correlated ACKs, and explicit failure states");
    expect(markup).toContain("Review link-loss behavior for the exact firmware and aircraft");
    expect(markup).toContain("A visual checklist mark is not evidence");
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain("Repérer comme lu (session uniquement)");
    expect(markup).toContain("ne sont pas enregistrées et ne valent ni preuve");
    expect(markup).toContain("0/14 repérés dans cette session");
    expect(markup).toContain("https://www.easa.europa.eu/en/document-library/easy-access-rules/easy-access-rules-unmanned-aircraft-systems");
    expect(markup).toContain("https://mavlink.io/en/services/mission.html");
    expect(markup).toContain("https://docs.px4.io/main/en/config/safety");
  });
});
