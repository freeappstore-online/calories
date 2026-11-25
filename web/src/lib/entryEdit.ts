import type { FoodEntry, MealType } from "../data/types";
import { findFood } from "./customFoods";
import { scaleMicros, scaleNutrition } from "./nutrition";

/** Active meal tab for a time of day */
export function defaultMealForTime(date: Date): MealType {
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes < 10 * 60 + 30) return "breakfast";
  if (minutes < 15 * 60) return "lunch";
  if (minutes < 21 * 60) return "dinner";
  return "snacks";
}

/** Rescale a logged entry to a new portion, rounding like scaleNutrition */
export function rescaleEntry(entry: FoodEntry, newGrams: number): FoodEntry {
  const factor = newGrams / entry.portionGrams;
  const r1 = (n: number) => Math.round(n * factor * 10) / 10;
  const next: FoodEntry = {
    ...entry,
    portionGrams: newGrams,
    calories: Math.round(entry.calories * factor),
    protein: r1(entry.protein),
    carbs: r1(entry.carbs),
    fat: r1(entry.fat),
    fiber: r1(entry.fiber),
    sugar: r1(entry.sugar),
  };
  if (entry.micros) {
    next.micros = Object.fromEntries(
      Object.entries(entry.micros).map(([k, v]) => [k, typeof v === "number" ? Math.round(v * factor * 100) / 100 : v]),
    );
  }
  return next;
}

/**
 * Grow or shrink an entry by a factor (e.g. 1.1 or 0.9). Known foods are recomputed
 * from their per-100g values so repeated taps don't accumulate rounding drift;
 * quick-add entries (no grams) scale their stored values.
 */
export function scaleEntry(entry: FoodEntry, factor: number): FoodEntry {
  if (entry.portionGrams <= 0) {
    const r1 = (n: number) => Math.round(n * factor * 10) / 10;
    return {
      ...entry,
      calories: Math.round(entry.calories * factor),
      protein: r1(entry.protein),
      carbs: r1(entry.carbs),
      fat: r1(entry.fat),
      fiber: r1(entry.fiber),
      sugar: r1(entry.sugar),
    };
  }
  const grams = Math.max(1, Math.round(entry.portionGrams * factor));
  if (grams === entry.portionGrams) return entry;
  const food = entry.foodId ? findFood(entry.foodId) : undefined;
  if (!food) return rescaleEntry(entry, grams);
  return {
    ...entry,
    portionGrams: grams,
    ...scaleNutrition(food, grams),
    micros: scaleMicros(food, grams),
  };
}

/** Change a food entry's weight by deltaGrams (never below 1 g); quick-add entries are unchanged */
export function stepEntry(entry: FoodEntry, deltaGrams: number): FoodEntry {
  if (entry.portionGrams <= 0) return entry;
  const grams = Math.max(1, Math.round(entry.portionGrams) + deltaGrams);
  return scaleEntry(entry, grams / entry.portionGrams);
}
