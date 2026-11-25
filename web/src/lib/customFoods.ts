import { foodById, servingSizes } from "../data";
import type { CustomFood, FoodItem, ServingSize } from "../data/types";

const CUSTOM_FOODS_KEY = "calories_custom_foods";
const CUSTOM_PREFIX = "custom:";

/** Illustration used for every custom food */
export const CUSTOM_IMAGE = "pot_of_food";

export function getCustomFoods(): CustomFood[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CUSTOM_FOODS_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as CustomFood[]).filter((f) => f && typeof f.id === "string") : [];
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
