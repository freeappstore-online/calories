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

/** Multiply every nutrient of an entry by factor (full precision; display code rounds) */
function multiplyNutrients(entry: FoodEntry, factor: number): FoodEntry {
  const next: FoodEntry = {
    ...entry,
    calories: entry.calories * factor,
    protein: entry.protein * factor,
    carbs: entry.carbs * factor,
    fat: entry.fat * factor,
    fiber: entry.fiber * factor,
    sugar: entry.sugar * factor,
  };
  if (entry.micros) {
    next.micros = Object.fromEntries(
      Object.entries(entry.micros).map(([k, v]) => [k, typeof v === "number" ? v * factor : v]),
    );
  }
  return next;
}

/**
 * Rescale a logged food entry to a new portion. Known foods are recomputed from their
 * per-100g values; entries whose food was deleted scale their stored values by ratio.
 */
export function rescaleEntry(entry: FoodEntry, newGrams: number): FoodEntry {
  const food = entry.foodId ? findFood(entry.foodId) : undefined;
  if (food) {
    return { ...entry, portionGrams: newGrams, ...scaleNutrition(food, newGrams), micros: scaleMicros(food, newGrams) };
  }
  return { ...multiplyNutrients(entry, newGrams / entry.portionGrams), portionGrams: newGrams };
}

/**
 * Grow or shrink a food entry by a factor (e.g. 1.1 or 0.9). Quick-add entries
 * (no grams) are returned unchanged.
 */
export function scaleEntry(entry: FoodEntry, factor: number): FoodEntry {
  if (entry.portionGrams <= 0) return entry;
  const grams = Math.max(1, Math.round(entry.portionGrams * factor));
  if (grams === entry.portionGrams) return entry;
  return rescaleEntry(entry, grams);
}

/** Change a food entry's weight by deltaGrams (never below 1 g); quick-add entries are unchanged */
export function stepEntry(entry: FoodEntry, deltaGrams: number): FoodEntry {
  if (entry.portionGrams <= 0) return entry;
  const grams = Math.max(1, Math.round(entry.portionGrams) + deltaGrams);
  return scaleEntry(entry, grams / entry.portionGrams);
}
