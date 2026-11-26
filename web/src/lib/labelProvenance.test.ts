import { describe, expect, it } from "vitest";
import { parseLabel, type FieldSource } from "./labelParser";

const AU = `Rolled Oats
NUTRITION INFORMATION
Servings per package: 15
Serving size: 40g
Quantity Quantity
per Serving per 100g
Energy 612kJ 1530kJ
Protein 4.8 g 12.0 g
Fat, total 2.8 g 7.0 g
Carbohydrate 25.2 g 63.0 g
Sodium 2 mg 5 mg`;

const EU = `Nutrition Declaration
Typical values per 100 g
Energy 1046 kJ / 250 kcal
Fat 11 g
Protein 7,5 g
Salt 1.2 g`;

/** The text a source points at */
function printed(text: string, src: FieldSource | undefined): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  return (src?.spans ?? []).map((s) => lines[s.line]!.slice(s.start, s.end).trim());
}

describe("parseLabel provenance", () => {
  it("points each value at its name and figure, and says which column it was read from", () => {
    const r = parseLabel(AU);
    expect(printed(AU, r.sources.protein)).toEqual(["Protein", "4.8 g"]);
    expect(r.sources.protein?.column).toBe("serving");
    expect(printed(AU, r.sources.carbs)).toEqual(["Carbohydrate", "25.2 g"]);
    expect(printed(AU, r.sources.sodium)).toEqual(["Sodium", "2 mg"]);
    expect(printed(AU, r.sources.name)).toEqual(["Rolled Oats"]);
    expect(printed(AU, r.sources.servingGrams)).toEqual(["40g"]);
  });

  it("points at the per 100 g figure when the value was scaled to the serving", () => {
    const text = "Serving size: 40g\nper 100g\nProtein 12.0 g";
    const r = parseLabel(text);
    expect(r.values.protein).toBe(4.8);
    expect(printed(text, r.sources.protein)).toEqual(["Protein", "12.0 g"]);
  });

  it("points calories at the kcal figure of a kJ/kcal pair", () => {
    const r = parseLabel(EU);
    expect(r.values.calories).toBe(250);
    expect(printed(EU, r.sources.calories)).toEqual(["Energy", "250 kcal"]);
  });

  it("points calories at the kJ figure when energy was converted", () => {
    const r = parseLabel(AU);
    expect(printed(AU, r.sources.calories)).toEqual(["Energy", "612kJ"]);
  });

  it("points sodium at the salt figure when it was worked out from salt", () => {
    const r = parseLabel(EU);
    expect(r.values.sodium).toBe(480);
    expect(printed(EU, r.sources.sodium)).toEqual(["Salt", "1.2 g"]);
  });

  it("follows energy that wraps onto the next line", () => {
    const text = "Energy 1046 kJ\n250 kcal\nProtein 7 g";
    const r = parseLabel(text);
    expect(r.values.calories).toBe(250);
    expect(r.sources.calories?.spans.map((s) => s.line)).toEqual([0, 1]);
  });

  it("still finds the figures when units sit in the row headings", () => {
    const text = "Serving size: 30 g\nper Serving per 100 g\nEnergy (kJ) 485 1620\nProtein (g) 5.7 19";
    const r = parseLabel(text);
    expect(r.values.protein).toBe(5.7);
    expect(printed(text, r.sources.protein)).toEqual(["Protein", "5.7"]);
    expect(printed(text, r.sources.calories)).toEqual(["Energy", "485"]);
  });

  it("has no source for a value that was not read", () => {
    const r = parseLabel("Protein 5 g");
    expect(r.sources.fat).toBeUndefined();
    expect(r.sources.protein).toBeDefined();
  });
});
