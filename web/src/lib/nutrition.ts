import { MICRO_DEFS } from "../data/types";
import type { FoodItem, FoodEntry, MicroKey, UserProfile, ActivityLevel } from "../data/types";
import { findFood } from "./customFoods";

/** Scale a food's nutrition by portion (grams). Full precision: round only when displaying. */
export function scaleNutrition(
  food: FoodItem,
  portionGrams: number,
): { calories: number; protein: number; carbs: number; fat: number; fiber: number; sugar: number } {
  const factor = portionGrams / 100;
  return {
    calories: food.calories * factor,
    protein: food.protein * factor,
    carbs: food.carbs * factor,
    fat: food.fat * factor,
    fiber: food.fiber * factor,
    sugar: food.sugar * factor,
  };
}

/** Micronutrients of a portion; null stays null (unknown) */
export function scaleMicros(food: FoodItem, portionGrams: number): Record<MicroKey, number | null> {
  const out = {} as Record<MicroKey, number | null>;
  for (const { key } of MICRO_DEFS) {
    const per100 = food[key];
    out[key] = per100 === null ? null : per100 * (portionGrams / 100);
  }
  return out;
}

/** Amount for display: whole numbers only, "<1" for a non-zero amount below 1 */
export function formatMicro(raw: number): string {
  return raw > 0 && raw < 1 ? "<1" : String(Math.round(raw));
}

export interface MicroTotal {
  /** Sum of the known values only */
  total: number;
  coveredEntries: number;
  /** Entries with no value for this nutrient (not counted in total) */
  unknownEntries: number;
}

/**
 * Per-nutrient totals. Entries logged before micros were tracked are derived from
 * the food by id and portion; quick-add entries and deleted foods count as unknown.
 */
export function sumMicros(entries: FoodEntry[]): Record<MicroKey, MicroTotal> {
  const out = {} as Record<MicroKey, MicroTotal>;
  for (const { key } of MICRO_DEFS) out[key] = { total: 0, coveredEntries: 0, unknownEntries: 0 };
  for (const e of entries) {
    let micros = e.micros;
    if (!micros && e.foodId && e.portionGrams > 0) {
      const food = findFood(e.foodId);
      if (food) micros = scaleMicros(food, e.portionGrams);
    }
    for (const { key } of MICRO_DEFS) {
      const v = micros?.[key];
      if (typeof v === "number") {
        out[key].total += v;
        out[key].coveredEntries++;
      } else {
        out[key].unknownEntries++;
      }
    }
  }
  return out;
}

/** Sum totals from entries */
export function sumEntries(entries: FoodEntry[]): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
} {
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let fiber = 0;
  let sugar = 0;
  for (const e of entries) {
    calories += e.calories;
    protein += e.protein;
    carbs += e.carbs;
    fat += e.fat;
    fiber += e.fiber;
    sugar += e.sugar;
  }
  return {
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    fiber: Math.round(fiber * 10) / 10,
    sugar: Math.round(sugar * 10) / 10,
  };
}

/** Activity level multipliers for TDEE */
const activityMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  "very-active": 1.9,
};

/**
 * Mifflin-St Jeor BMR formula
 * Male: 10 * weight(kg) + 6.25 * height(cm) - 5 * age - 5 (was +5)
 * Actually: Male: +5, Female: -161
 */
export function calculateBMR(profile: UserProfile): number {
  const base = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age;
  return profile.sex === "male" ? base + 5 : base - 161;
}

/** TDEE = BMR * activity multiplier */
export function calculateTDEE(profile: UserProfile): number {
  const bmr = calculateBMR(profile);
  return Math.round(bmr * activityMultipliers[profile.activityLevel]);
}

/** Never suggest less than this; below it a diet needs medical supervision */
export const MIN_CALORIES = 1200;

/** Suggest calorie target based on weight goal (-500 lose, +300 lean bulk), never below MIN_CALORIES */
export function suggestCalories(profile: UserProfile): number {
  const tdee = calculateTDEE(profile);
  const kcal = profile.weightGoal === "lose" ? tdee - 500 : profile.weightGoal === "gain" ? tdee + 300 : tdee;
  return Math.max(MIN_CALORIES, Math.round(kcal));
}

/** Calculate BMI from profile */
export function calculateBMI(profile: UserProfile): number {
  const heightM = profile.height / 100;
  return Math.round((profile.weight / (heightM * heightM)) * 10) / 10;
}

/** BMI category label */
export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
}
