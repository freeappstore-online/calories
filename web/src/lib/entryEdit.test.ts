import { describe, expect, it } from "vitest";
import type { FoodEntry } from "../data/types";
import { rescaleEntry, scaleEntry, stepEntry } from "./entryEdit";
import { scaleMicros, scaleNutrition } from "./nutrition";
import { foodById } from "../data";

const apple = foodById.get("apple")!;

function foodEntry(foodId: string | null, grams: number, overrides: Partial<FoodEntry> = {}): FoodEntry {
  const food = foodId ? foodById.get(foodId) : undefined;
  return {
    id: "e1",
    foodId,
    name: "x",
    meal: "lunch",
    portionGrams: grams,
    ...(food ? scaleNutrition(food, grams) : { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }),
    micros: food ? scaleMicros(food, grams) : undefined,
    ...overrides,
  };
}

describe("entryEdit", () => {
  it("repeated +/- of a known food returns exactly to the start", () => {
    const start = foodEntry("apple", 100);
    let e = start;
    for (let i = 0; i < 10; i++) e = stepEntry(e, 25);
    for (let i = 0; i < 10; i++) e = stepEntry(e, -25);
    expect(e).toEqual(start);
  });

  it("an orphaned entry (food deleted) does not drift on repeated +/-", () => {
    let e = foodEntry(null, 20, { foodId: "deleted-food", calories: 9, protein: 0.2, carbs: 2, fat: 0, micros: { calcium: 3 } });
    for (let i = 0; i < 6; i++) e = stepEntry(e, -1);
    for (let i = 0; i < 20; i++) e = stepEntry(e, 1);
    expect(e.portionGrams).toBe(34);
    expect(e.calories / e.portionGrams).toBeCloseTo(9 / 20, 10);
    expect(e.calories).toBeCloseTo(15.3, 6);
    expect(e.micros!.calcium!).toBeCloseTo(5.1, 6);
  });

  it("scaling an orphan back and forth is exact", () => {
    const start = foodEntry(null, 20, { foodId: "gone", calories: 9 });
    const back = rescaleEntry(rescaleEntry(start, 137), 20);
    expect(back.calories).toBeCloseTo(9, 10);
  });

  it("meal scaling leaves quick adds untouched", () => {
    const quick = foodEntry(null, 0, { calories: 500, protein: 10 });
    expect(scaleEntry(quick, 1.5)).toBe(quick);
    expect(stepEntry(quick, 10)).toBe(quick);
  });

  it("editing from 1 g to 200 g computes from the food, not the rounded entry", () => {
    const one = foodEntry("apple", 1);
    const big = rescaleEntry(one, 200);
    expect(Math.round(big.calories)).toBe(122);
    expect(big.protein).toBeCloseTo(0.4, 6);
    expect(big.portionGrams).toBe(200);
  });

  it("matches the food exactly at any grams", () => {
    expect(rescaleEntry(foodEntry("apple", 37), 143)).toEqual(foodEntry("apple", 143));
    expect(apple.calories).toBe(61);
  });
});
