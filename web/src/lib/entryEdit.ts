import type { FoodEntry, MealType } from "../data/types";

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
