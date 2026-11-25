export interface FoodItem {
  id: string;
  name: string;
  category: FoodCategory;
  /** Calories per 100g */
  calories: number;
  /** Protein grams per 100g */
  protein: number;
  /** Carbs grams per 100g */
  carbs: number;
  /** Fat grams per 100g */
  fat: number;
  /** Fiber grams per 100g */
  fiber: number;
  /** Sugar grams per 100g */
  sugar: number;
  /** Illustration file name in /foods/<image>.webp */
  image: string;
  /** USDA FoodData Central id the values come from; absent for custom foods */
  fdcId?: number;
  /** Micronutrients per 100g; null where USDA has no value */
  satFat: number | null; // g
  cholesterol: number | null; // mg
  sodium: number | null; // mg
  potassium: number | null; // mg
  calcium: number | null; // mg
  iron: number | null; // mg
  magnesium: number | null; // mg
  vitaminA: number | null; // µg RAE
  vitaminC: number | null; // mg
  vitaminD: number | null; // µg
  vitaminB12: number | null; // µg
}

/** Micronutrients tracked per food and per entry */
export type MicroKey =
  | "satFat"
  | "cholesterol"
  | "sodium"
  | "potassium"
  | "calcium"
  | "iron"
  | "magnesium"
  | "vitaminA"
  | "vitaminC"
  | "vitaminD"
  | "vitaminB12";

/** Display order, unit and FDA Daily Value; limit nutrients are to be kept under their DV */
export const MICRO_DEFS: { key: MicroKey; label: string; unit: string; dv: number; limit?: boolean }[] = [
  { key: "satFat", label: "Saturated fat", unit: "g", dv: 20, limit: true },
  { key: "cholesterol", label: "Cholesterol", unit: "mg", dv: 300, limit: true },
  { key: "sodium", label: "Sodium", unit: "mg", dv: 2300, limit: true },
  { key: "potassium", label: "Potassium", unit: "mg", dv: 4700 },
  { key: "calcium", label: "Calcium", unit: "mg", dv: 1300 },
  { key: "iron", label: "Iron", unit: "mg", dv: 18 },
  { key: "magnesium", label: "Magnesium", unit: "mg", dv: 420 },
  { key: "vitaminA", label: "Vitamin A", unit: "µg", dv: 900 },
  { key: "vitaminC", label: "Vitamin C", unit: "mg", dv: 90 },
  { key: "vitaminD", label: "Vitamin D", unit: "µg", dv: 20 },
  { key: "vitaminB12", label: "Vitamin B12", unit: "µg", dv: 2.4 },
];

/** A user-defined food: nutrition per 100 g, id is "custom:<uuid>" */
export interface CustomFood extends FoodItem {
  category: "custom";
  /** The serving the user entered the label values for */
  servingLabel: string;
  servingGrams: number;
}

export type FoodCategory =
  | "fruits"
  | "vegetables"
  | "protein"
  | "grains"
  | "dairy"
  | "snacks"
  | "sweets"
  | "condiments"
  | "beverages"
  | "meals"
  | "custom";

export type MealType = "breakfast" | "lunch" | "dinner" | "snacks";

export interface FoodEntry {
  id: string;
  foodId: string | null; // null for quick-add
  name: string;
  meal: MealType;
  /** Portion in grams */
  portionGrams: number;
  /** Resolved calories for this entry */
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  /** Micronutrients for this portion; null/absent = unknown. Absent on entries logged before they were tracked. */
  micros?: Partial<Record<MicroKey, number | null>>;
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  entries: FoodEntry[];
}

export interface DailyGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface SavedMeal {
  id: string;
  name: string;
  entries: Omit<FoodEntry, "id">[];
}

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very-active";

export type WeightGoal = "lose" | "maintain" | "gain";

export type Sex = "male" | "female";

export interface UserProfile {
  age: number;
  weight: number; // kg
  height: number; // cm
  sex: Sex;
  activityLevel: ActivityLevel;
  weightGoal: WeightGoal;
}

/** Common serving size for a food (human-friendly portions) */
export interface ServingSize {
  label: string;
  grams: number;
}
