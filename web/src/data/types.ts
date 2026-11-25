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
  /** USDA FoodData Central id the values come from */
  fdcId: number;
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
