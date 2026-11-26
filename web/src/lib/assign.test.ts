import { describe, expect, it } from "vitest";
import { assign, assignValue, displaced, figureAt, unassign, withAssignments, type Assignment } from "./assign";
import { tokenize } from "./labelParser";
import { highlightsOf } from "./ocr/provenance";
import { parseLabel } from "./labelParser";
import { rectQuad } from "./ocr/geometry";
import type { OcrLine } from "./ocr/types";

/** One line of text, 1000 px wide, characters evenly spaced */
const line = (text: string, y = 0): OcrLine => ({ text, conf: 90, quad: rectQuad(0, y, 1000, y + 20) });
const fig = (text: string) => tokenize(text)[0]!;

describe("figureAt", () => {
  const l = line("Protein 5.7 g 19 g");
  const n = l.text.length;
  const x = (i: number) => (i / n) * 1000;
  it("finds the number under the tap", () => {
    expect(figureAt(l, 0, [x(9), 10])).toMatchObject({ value: 5.7, unit: "g", line: 0, text: "5.7 g" });
    expect(figureAt(l, 0, [x(16), 10])).toMatchObject({ value: 19 });
  });
  it("finds nothing on the nutrient's name, far from any number", () => {
    expect(figureAt(l, 0, [x(2), 10])).toBeUndefined();
    expect(figureAt(line("Total Fat"), 0, [100, 10])).toBeUndefined();
  });
});

describe("assignValue", () => {
  it("takes a plain number in the field's own unit", () => {
    expect(assignValue(fig("5.7 g"), "protein", "serving", 40)).toEqual({ value: 5.7 });
    expect(assignValue(fig("6"), "protein", "serving", 40)).toEqual({ value: 6 });
  });
  it("converts kJ to whole kcal", () => {
    expect(assignValue(fig("1046 kJ"), "calories", "serving", 40)).toEqual({ value: 250 });
    expect(assignValue(fig("1046"), "kj", "serving", 40)).toEqual({ value: 250 });
    expect(assignValue(fig("250 kcal"), "calories", "serving", 40)).toEqual({ value: 250 });
    expect(assignValue(fig("250"), "calories", "serving", 40)).toEqual({ value: 250 });
  });
  it("rejects a unit that makes no sense for the field", () => {
    expect(assignValue(fig("400 IU"), "vitaminD", "serving", 40)).toHaveProperty("error");
    expect(assignValue(fig("12 mg"), "calories", "serving", 40)).toHaveProperty("error");
  });
  it("converts between g, mg and µg", () => {
    expect(assignValue(fig("0.4 g"), "sodium", "serving", 40)).toEqual({ value: 400 });
    expect(assignValue(fig("120 mg"), "protein", "serving", 40)).toEqual({ value: 0.12 });
    expect(assignValue(fig("1.5 µg"), "vitaminB12", "serving", 40)).toEqual({ value: 1.5 });
  });
  it("scales a per-100 g figure to the serving in the form", () => {
    expect(assignValue(fig("12.0 g"), "protein", "per100", 40)).toEqual({ value: 4.8 });
    expect(assignValue(fig("1530 kJ"), "calories", "per100", 40)).toEqual({ value: 146 });
    expect(assignValue(fig("5 mg"), "sodium", "per100", 40)).toEqual({ value: 2 });
    // An empty serving size means a 100 g serving
    expect(assignValue(fig("12.0 g"), "protein", "per100", 0)).toEqual({ value: 12 });
  });
  it("never scales the serving size itself", () => {
    expect(assignValue(fig("40 g"), "servingGrams", "per100", 40)).toEqual({ value: 40 });
  });
});

describe("assignments", () => {
  const a = (key: Assignment["key"], start: number, value = 1): Assignment => ({ option: key, key, span: { line: 0, start, end: start + 3 }, basis: "serving", text: "x", value });
  it("moves a box to its new field and a field to its new box", () => {
    let list = assign([], a("protein", 0));
    list = assign(list, a("fat", 0)); // same box, other field
    expect(list.map((x) => x.key)).toEqual(["fat"]);
    list = assign(list, a("fat", 10)); // same field, other box
    expect(list.map((x) => x.span.start)).toEqual([10]);
    expect(displaced([a("fat", 10)], a("protein", 10)).map((x) => x.key)).toEqual(["fat"]);
  });
  it("clears one box", () => {
    const list = assign(assign([], a("protein", 0)), a("fat", 10));
    expect(unassign(list, { line: 0, start: 0, end: 3 }).map((x) => x.key)).toEqual(["fat"]);
  });
});

describe("withAssignments", () => {
  const text = "Nutrition Facts\nServing size 40g\nCalories 190\nProtein 5g\nTotal Fat 7g";
  const lines = text.split("\n").map((t, i) => line(t, i * 30));
  const scan = parseLabel(text);

  it("recolours a box by giving it to another field", () => {
    const base = highlightsOf(scan, lines);
    expect(base.find((h) => h.field === "protein" && h.role === "figure")?.text).toBe("5g");
    const start = lines[3]!.text.indexOf("5g");
    const mine: Assignment = { option: "fat", key: "fat", span: { line: 3, start, end: start + 2 }, basis: "serving", text: "5g", value: 5 };
    const out = withAssignments(base, [mine], lines);
    expect(out.filter((h) => h.role === "figure" && h.text === "5g").map((h) => h.field)).toEqual(["fat"]);
    // Fat's own figure box (7g) is replaced, and the nutrient names stay
    expect(out.some((h) => h.field === "fat" && h.text === "7g")).toBe(false);
    expect(out.some((h) => h.field === "protein" && h.role === "name")).toBe(true);
  });
  it("is the scan's own boxes when nothing was assigned", () => {
    const base = highlightsOf(scan, lines);
    expect(withAssignments(base, [], lines)).toBe(base);
  });
});
