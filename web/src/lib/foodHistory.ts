import { foodById, servingSizes } from "../data";
import type { FoodEntry, MealType } from "../data/types";
import { getAllLogs } from "./storage";
import { scaleNutrition } from "./nutrition";

const FAVORITES_KEY = "calories_favorites";
const FREQUENT_DAYS = 30;

/** A past entry without id/meal, ready to be re-logged */
export type FoodTemplate = Omit<FoodEntry, "id" | "meal">;

/** Entries with a foodId, newest first, with their log date */
function historyNewestFirst(): { date: string; entry: FoodEntry }[] {
  const logs = getAllLogs();
  const out: { date: string; entry: FoodEntry }[] = [];
  for (const date of Object.keys(logs).sort().reverse()) {
    const entries = logs[date]?.entries;
    if (!Array.isArray(entries)) continue;
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry?.foodId) out.push({ date, entry });
    }
  }
  return out;
}

function toTemplate(entry: FoodEntry): FoodTemplate {
  const { id: _id, meal: _meal, ...rest } = entry;
  return rest;
}

export function getRecentFoods(limit: number): FoodTemplate[] {
  const seen = new Set<string>();
  const result: FoodTemplate[] = [];
  for (const { entry } of historyNewestFirst()) {
    if (seen.has(entry.foodId!)) continue;
    seen.add(entry.foodId!);
    result.push(toTemplate(entry));
    if (result.length >= limit) break;
  }
  return result;
}

/** Foods logged at least twice in the last 30 days, most logged first */
export function getFrequentFoods(limit: number): FoodTemplate[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FREQUENT_DAYS);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  const stats = new Map<string, { count: number; first: number; entry: FoodEntry }>();
  historyNewestFirst().forEach(({ date, entry }, idx) => {
    if (date < cutoffKey) return;
    const s = stats.get(entry.foodId!);
    if (s) s.count++;
    else stats.set(entry.foodId!, { count: 1, first: idx, entry });
  });
  return [...stats.values()]
    .filter((s) => s.count >= 2)
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, limit)
    .map((s) => toTemplate(s.entry));
}

export function getFavorites(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function toggleFavorite(foodId: string): string[] {
  const favs = getFavorites();
  const next = favs.includes(foodId) ? favs.filter((f) => f !== foodId) : [...favs, foodId];
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  } catch {
    return favs;
  }
  return next;
}

/** Favorite foods that exist in the library, as templates: last logged portion, else first serving */
export function getFavoriteTemplates(favorites: string[]): FoodTemplate[] {
  const latest = new Map<string, FoodEntry>();
  for (const { entry } of historyNewestFirst()) {
    if (!latest.has(entry.foodId!)) latest.set(entry.foodId!, entry);
  }
  const result: FoodTemplate[] = [];
  for (const id of favorites) {
    const logged = latest.get(id);
    if (logged) {
      result.push(toTemplate(logged));
      continue;
    }
    const food = foodById.get(id);
    if (!food) continue;
    const portionGrams = servingSizes[id]?.[0]?.grams ?? 100;
    result.push({ foodId: id, name: food.name, portionGrams, ...scaleNutrition(food, portionGrams) });
  }
  return result;
}

/** Fresh, independent entry from a template */
export function templateToEntry(t: FoodTemplate, meal: MealType): FoodEntry {
  return { ...t, id: crypto.randomUUID(), meal };
}
