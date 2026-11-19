import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadViewportBackground, ViewportBackgroundPicker } from "./ViewportBackgroundPicker";

describe("ViewportBackgroundPicker", () => {
  it("renders the palette, custom color control, and local-only disclosure", () => {
    const markup = renderToStaticMarkup(
      <ViewportBackgroundPicker scope="unit-test" value="#071218" onChange={() => undefined} />,
    );
    expect(markup).toContain("Panneau de couleur");
    expect(markup).toContain('type="color"');
    expect(markup).toContain("Code hexadécimal de la couleur de fond");
    expect(markup).toContain("ne modifie ni le modèle ni les données du projet");
    expect((markup.match(/aria-pressed=/g) ?? []).length).toBe(12);
  });

  it("uses a safe default when browser storage is unavailable", () => {
    expect(loadViewportBackground("parametric")).toBe("#071218");
  });
});
