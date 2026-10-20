import { describe, expect, it } from "vitest";
import { isAppLanguage, languageDictionary, missingLanguageEntries, translate, translateEmbedded } from "./language";

describe("AeroMind interface language dictionaries", () => {
  it("contains the selectable French and English dictionaries", () => {
    expect(Object.keys(languageDictionary)).toEqual(["fr", "en"]);
    expect(translate("fr", "Vue générale")).toBe("Vue générale");
    expect(translate("en", "Vue générale")).toBe("Overview");
    expect(translate("en", "Rapport technique révisable")).toBe("Reviewable engineering report");
  });

  it("validates persisted locale values and safely preserves unknown source text", () => {
    expect(isAppLanguage("fr")).toBe(true);
    expect(isAppLanguage("en")).toBe(true);
    expect(isAppLanguage("de")).toBe(false);
    expect(translate("en", "A new string without a reviewed dictionary entry")).toBe(
      "A new string without a reviewed dictionary entry",
    );
  });
  it("translates catalogued English DOM text back to French after a language toggle", () => {
    const english = translate("en", "Vue générale");
    expect(english).toBe("Overview");
    expect(translate("fr", english)).toBe("Vue générale");
    expect(translate("en", translate("fr", english))).toBe(english);
  });
  it("translates a catalogued marker embedded next to a numeric unit", () => {
    expect(translateEmbedded("fr", "Overview 12 km")).toBe("Vue générale 12 km");
    expect(translateEmbedded("en", "Vue générale 12 km")).toBe("Overview 12 km");
  });
  it("keeps the reviewed interface surface complete in both selectable languages", () => {
    expect(missingLanguageEntries("fr")).toEqual([]);
    expect(missingLanguageEntries("en")).toEqual([]);
  });
});
