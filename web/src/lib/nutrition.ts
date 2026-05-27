import type { FoodItem, FoodEntry, UserProfile, ActivityLevel } from "../data/types";

/** Scale a food's nutrition by portion (grams) */
export function scaleNutrition(
  food: FoodItem,
  portionGrams: number,
): { calories: number; protein: number; carbs: number; fat: number; fiber: number; sugar: number } {
  const factor = portionGrams / 100;
  return {
    calories: Math.round(food.calories * factor),
    protein: Math.round(food.protein * factor * 10) / 10,
    carbs: Math.round(food.carbs * factor * 10) / 10,
    fat: Math.round(food.fat * factor * 10) / 10,
    fiber: Math.round(food.fiber * factor * 10) / 10,
    sugar: Math.round(food.sugar * factor * 10) / 10,
  };
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

/** Suggest calorie target based on weight goal */
export function suggestCalories(profile: UserProfile): number {
  const tdee = calculateTDEE(profile);
  switch (profile.weightGoal) {
    case "lose":
      return Math.round(tdee - 500); // ~0.5kg/week loss
    case "gain":
      return Math.round(tdee + 300); // lean bulk
    case "maintain":
      return tdee;
  }
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
