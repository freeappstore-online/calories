/** App preferences (portion step sizes, daily bar scale) */
export interface Settings {
  /** Grams added/removed by a food row's −/+ */
  foodStepGrams: number;
  /** Grams added/removed from a meal's total weight by the meal −/+ */
  mealStepGrams: number;
  /** Grams spanned by the full width of the daily protein/carbs/fat/sugar bars */
  macroBarGrams: number;
}

const KEY = "calories_settings";
export const DEFAULT_SETTINGS: Settings = { foodStepGrams: 5, mealStepGrams: 10, macroBarGrams: 400 };

export function getSettings(): Settings {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return DEFAULT_SETTINGS;
    const s = { ...DEFAULT_SETTINGS, ...(parsed as Partial<Settings>) };
    const ok = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 1;
    const keys = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];
    return Object.fromEntries(keys.map((k) => [k, ok(s[k]) ? s[k] : DEFAULT_SETTINGS[k]])) as unknown as Settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
