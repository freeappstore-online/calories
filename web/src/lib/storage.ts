import type { DailyLog, SavedMeal, TargetOverrides, Targets, UserProfile } from "../data/types";

const KEYS = {
  logs: "calories_logs",
  goals: "calories_goals",
  savedMeals: "calories_saved_meals",
  profile: "calories_profile",
} as const;

// ── Daily Logs ──

export function getAllLogs(): Record<string, DailyLog> {
  try {
    const raw = localStorage.getItem(KEYS.logs);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, DailyLog>;
  } catch {
    return {};
  }
}

export function getLog(date: string): DailyLog {
  const logs = getAllLogs();
  const log = logs[date];
  return log && Array.isArray(log.entries) ? log : { date, entries: [] };
}

export function saveLog(log: DailyLog): void {
  const logs = getAllLogs();
  logs[log.date] = log;
  localStorage.setItem(KEYS.logs, JSON.stringify(logs));
}

// ── Target overrides ──

/** The fixed goals before targets followed the profile; saved values equal to these were never a choice */
const LEGACY_DEFAULTS: Partial<Targets> = { calories: 2000, protein: 150, carbs: 250, fat: 65 };

/** Stored under the old goals key; `v: 2` marks the overrides-only format */
export function getTargetOverrides(): TargetOverrides {
  try {
    const raw = localStorage.getItem(KEYS.goals);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const { v, ...values } = parsed as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(values)) {
      if (typeof n !== "number" || !(n > 0)) continue;
      if (v !== 2 && LEGACY_DEFAULTS[k as keyof Targets] === n) continue;
      out[k] = n;
    }
    if (v !== 2) saveTargetOverrides(out);
    return out;
  } catch {
    return {};
  }
}

export function saveTargetOverrides(overrides: TargetOverrides): void {
  localStorage.setItem(KEYS.goals, JSON.stringify({ ...overrides, v: 2 }));
}

// ── Saved Meals ──

export function getSavedMeals(): SavedMeal[] {
  try {
    const raw = localStorage.getItem(KEYS.savedMeals);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedMeal[]) : [];
  } catch {
    return [];
  }
}

export function saveSavedMeals(meals: SavedMeal[]): void {
  localStorage.setItem(KEYS.savedMeals, JSON.stringify(meals));
}

// ── Profile ──

export function getProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(KEYS.profile);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as UserProfile;
  } catch {
    return null;
  }
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(KEYS.profile, JSON.stringify(profile));
}
