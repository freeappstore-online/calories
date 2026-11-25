/** App preferences (portion step sizes) */
export interface Settings {
  /** Grams added/removed by a food row's −/+ */
  foodStepGrams: number;
  /** Grams added/removed from a meal's total weight by the meal −/+ */
  mealStepGrams: number;
}

const KEY = "calories_settings";
export const DEFAULT_SETTINGS: Settings = { foodStepGrams: 5, mealStepGrams: 10 };

export function getSettings(): Settings {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return DEFAULT_SETTINGS;
    const s = { ...DEFAULT_SETTINGS, ...(parsed as Partial<Settings>) };
    const ok = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 1;
    return {
      foodStepGrams: ok(s.foodStepGrams) ? s.foodStepGrams : DEFAULT_SETTINGS.foodStepGrams,
      mealStepGrams: ok(s.mealStepGrams) ? s.mealStepGrams : DEFAULT_SETTINGS.mealStepGrams,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
