import type { DailyLog, DailyGoals, SavedMeal, UserProfile } from "../data/types";

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
    return JSON.parse(raw) as Record<string, DailyLog>;
  } catch {
    return {};
  }
}

export function getLog(date: string): DailyLog {
  const logs = getAllLogs();
  return logs[date] ?? { date, entries: [] };
}

export function saveLog(log: DailyLog): void {
  const logs = getAllLogs();
  logs[log.date] = log;
  localStorage.setItem(KEYS.logs, JSON.stringify(logs));
}

// ── Goals ──

const DEFAULT_GOALS: DailyGoals = {
  calories: 2000,
  protein: 150,
  carbs: 250,
  fat: 65,
};

export function getGoals(): DailyGoals {
  try {
    const raw = localStorage.getItem(KEYS.goals);
    if (!raw) return DEFAULT_GOALS;
    return JSON.parse(raw) as DailyGoals;
  } catch {
    return DEFAULT_GOALS;
  }
}

export function saveGoals(goals: DailyGoals): void {
  localStorage.setItem(KEYS.goals, JSON.stringify(goals));
}

// ── Saved Meals ──

export function getSavedMeals(): SavedMeal[] {
  try {
    const raw = localStorage.getItem(KEYS.savedMeals);
    if (!raw) return [];
    return JSON.parse(raw) as SavedMeal[];
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
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(KEYS.profile, JSON.stringify(profile));
}
