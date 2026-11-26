import { foodById, servingSizes } from "../data";
import type { CustomFood, FoodItem, ServingSize } from "../data/types";

const CUSTOM_FOODS_KEY = "calories_custom_foods";
const CUSTOM_PREFIX = "custom:";

/** Illustration used for every custom food */
export const CUSTOM_IMAGE = "pot_of_food";

/** Portion limits in grams, shared by every place a portion is typed */
export const MIN_GRAMS = 0.1;
export const MAX_GRAMS = 5000;
/** Upper bound for any value typed per serving in the custom food form (g, mg, µg or kcal) */
export const MAX_CUSTOM_VALUE = 10000;

export const isValidGrams = (g: number) => Number.isFinite(g) && g >= MIN_GRAMS && g <= MAX_GRAMS;

/** Whole grams, except under 1 g where one decimal is shown so the chip stays honest ("0.5g") */
export function formatGrams(g: number): string {
  return g < 1 ? `${Math.round(g * 10) / 10}g` : `${Math.round(g)}g`;
}

/** Index of the first serving of at least 1 g, or null when there is none */
export function defaultServingIndex(servings: ServingSize[] | undefined): number | null {
  const i = servings?.findIndex((s) => s.grams >= 1) ?? -1;
  return i >= 0 ? i : null;
}

const NUTRIENTS = ["calories", "protein", "carbs", "fat", "fiber", "sugar"] as const;

/** True when the value has everything the app reads from a custom food (name, nutrition, serving) */
export function isValidCustomFood(f: unknown): f is CustomFood {
  if (typeof f !== "object" || f === null) return false;
  const r = f as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    r.name.length > 0 &&
    r.category === "custom" &&
    NUTRIENTS.every((k) => typeof r[k] === "number" && Number.isFinite(r[k])) &&
    (r.servingGrams === undefined || (typeof r.servingGrams === "number" && Number.isFinite(r.servingGrams)))
  );
}

export function getCustomFoods(): CustomFood[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CUSTOM_FOODS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isValidCustomFood) : [];
  } catch {
    return [];
  }
}

function write(foods: CustomFood[]): boolean {
  try {
    localStorage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(foods));
    return true;
  } catch {
    return false;
  }
}

/** Returns false when storage rejected the write */
export function saveCustomFood(food: CustomFood): boolean {
  return write([...getCustomFoods().filter((f) => f.id !== food.id), food]);
}

export function deleteCustomFood(id: string): boolean {
  return write(getCustomFoods().filter((f) => f.id !== id));
}

/** Library or custom food by id */
export function findFood(id: string): FoodItem | undefined {
  return foodById.get(id) ?? getCustomFoods().find((f) => f.id === id);
}

/** Common servings of a library food, or the one serving of a custom food */
export function servingsFor(food: FoodItem): ServingSize[] | undefined {
  const custom = food as Partial<CustomFood>;
  if (custom.servingLabel && custom.servingGrams) return [{ label: custom.servingLabel, grams: custom.servingGrams }];
  return servingSizes[food.id];
}

/** Illustration for a logged foodId; deleted custom foods keep the generic icon */
export function imageFor(foodId: string | null): string | undefined {
  if (!foodId) return undefined;
  return foodById.get(foodId)?.image ?? (foodId.startsWith(CUSTOM_PREFIX) ? CUSTOM_IMAGE : undefined);
}

export function newCustomId(): string {
  return CUSTOM_PREFIX + crypto.randomUUID();
}
