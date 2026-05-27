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
}

export type FoodCategory =
  | "fruits"
  | "vegetables"
  | "protein"
  | "grains"
  | "dairy"
  | "snacks"
  | "beverages"
  | "meals";

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
