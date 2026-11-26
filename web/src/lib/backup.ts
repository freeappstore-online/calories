import type { DailyLog } from "../data/types";
import { isValidCustomFood } from "./customFoods";

const PREFIX = "calories_";
const LOGS_KEY = "calories_logs";
const GOALS_KEY = "calories_goals";
const PROFILE_KEY = "calories_profile";
const MEALS_KEY = "calories_saved_meals";
const CUSTOM_FOODS_KEY = "calories_custom_foods";
const FAVORITES_KEY = "calories_favorites";

export interface Backup {
  app: "calories";
  version: 1;
  exportedAt: string;
  data: Record<string, unknown>;
}

export interface BackupSummary {
  days: number;
  savedMeals: number;
  hasGoals: boolean;
  hasProfile: boolean;
}

export type ParseResult = { ok: true; backup: Backup; summary: BackupSummary } | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasId(v: unknown): v is { id: string } {
  return isRecord(v) && typeof v.id === "string";
}

const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snacks"]);
const ENTRY_NUMBERS = ["portionGrams", "calories", "protein", "carbs", "fat", "fiber", "sugar"] as const;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** A log entry the app can render and sum; `id` is optional for saved-meal entries */
function isValidEntry(v: unknown, needsId: boolean): boolean {
  if (!isRecord(v)) return false;
  if (needsId ? typeof v.id !== "string" : v.id !== undefined && typeof v.id !== "string") return false;
  if (typeof v.name !== "string" || !MEAL_TYPES.has(v.meal as string)) return false;
  if (v.foodId !== null && typeof v.foodId !== "string") return false;
  if (!ENTRY_NUMBERS.every((k) => isNum(v[k]))) return false;
  if (v.micros !== undefined && !(isRecord(v.micros) && Object.values(v.micros).every((m) => m === null || isNum(m)))) return false;
  return true;
}

function appKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k);
  }
  return keys;
}

function readKey(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "");
  } catch {
    return undefined;
  }
}

export function buildBackup(): Backup {
  const data: Record<string, unknown> = {};
  for (const key of appKeys()) {
    const value = readKey(key);
    if (value !== undefined) data[key] = value;
  }
  return { app: "calories", version: 1, exportedAt: new Date().toISOString(), data };
}

export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file is not valid JSON." };
  }
  if (!isRecord(raw) || raw.app !== "calories") {
    return { ok: false, error: "This is not a Calories backup file." };
  }
  if (raw.version !== 1) {
    return { ok: false, error: `Unsupported backup version: ${String(raw.version)}.` };
  }
  const data = raw.data;
  if (!isRecord(data)) {
    return { ok: false, error: "The backup has no data." };
  }
  if (!Object.keys(data).every((k) => k.startsWith(PREFIX))) {
    return { ok: false, error: "The backup contains unexpected keys." };
  }
  const logs = data[LOGS_KEY];
  if (
    logs !== undefined &&
    !(
      isRecord(logs) &&
      Object.entries(logs).every(
        ([date, l]) => DATE_KEY.test(date) && isRecord(l) && Array.isArray(l.entries) && l.entries.every((e) => isValidEntry(e, true)),
      )
    )
  ) {
    return { ok: false, error: "The backup's food log is malformed." };
  }
  const meals = data[MEALS_KEY];
  if (
    meals !== undefined &&
    !(Array.isArray(meals) && meals.every((m) => isRecord(m) && typeof m.id === "string" && typeof m.name === "string" && Array.isArray(m.entries) && m.entries.every((e: unknown) => isValidEntry(e, false))))
  ) {
    return { ok: false, error: "The backup's saved meals are malformed." };
  }
  const customFoods = data[CUSTOM_FOODS_KEY];
  if (customFoods !== undefined && !(Array.isArray(customFoods) && customFoods.every(isValidCustomFood))) {
    return { ok: false, error: "The backup's custom foods are malformed." };
  }
  const favorites = data[FAVORITES_KEY];
  if (favorites !== undefined && !(Array.isArray(favorites) && favorites.every((f) => typeof f === "string"))) {
    return { ok: false, error: "The backup's favorites are malformed." };
  }
  for (const key of [GOALS_KEY, PROFILE_KEY]) {
    if (data[key] !== undefined && !isRecord(data[key])) return { ok: false, error: "The backup's goals or profile are malformed." };
  }
  const backup: Backup = {
    app: "calories",
    version: 1,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
    data,
  };
  const summary: BackupSummary = {
    days: Object.values((logs ?? {}) as Record<string, DailyLog>).filter((l) => l.entries.length > 0).length,
    savedMeals: Array.isArray(meals) ? meals.length : 0,
    hasGoals: GOALS_KEY in data,
    hasProfile: PROFILE_KEY in data,
  };
  return { ok: true, backup, summary };
}

function mergeLogs(local: unknown, incoming: Record<string, DailyLog>): Record<string, DailyLog> {
  const out: Record<string, DailyLog> = isRecord(local) ? { ...(local as Record<string, DailyLog>) } : {};
  for (const [date, inLog] of Object.entries(incoming)) {
    const existing = out[date]?.entries;
    const localEntries = Array.isArray(existing) ? existing : [];
    const ids = new Set(inLog.entries.map((e) => e.id));
    out[date] = { ...inLog, entries: [...inLog.entries, ...localEntries.filter((e) => !ids.has(e.id))] };
  }
  return out;
}

// Arrays of {id} objects (saved meals, custom foods) merge by id, imported wins;
// other arrays (favorites) are unioned.
function mergeArrays(local: unknown, incoming: unknown[]): unknown[] {
  const base = Array.isArray(local) ? local : [];
  if (incoming.every(hasId) && base.every(hasId)) {
    const ids = new Set(incoming.map((i) => (i as { id: string }).id));
    return [...incoming, ...base.filter((b) => !ids.has((b as { id: string }).id))];
  }
  return [...new Set([...base, ...incoming])];
}

export type ApplyResult = { ok: true } | { ok: false; error: string };

/**
 * Computes every new value first, then writes them. If any write fails (storage full) the
 * previous values are restored, so a failed import never leaves the app with partial data.
 * Replace only removes stale keys after every new value is stored.
 */
export function applyBackup(backup: Backup, mode: "merge" | "replace"): ApplyResult {
  const next: [string, string][] = [];
  for (const [key, value] of Object.entries(backup.data)) {
    let v = value;
    if (mode === "merge") {
      if (key === LOGS_KEY) v = mergeLogs(readKey(key), value as Record<string, DailyLog>);
      else if (Array.isArray(value)) v = mergeArrays(readKey(key), value);
    }
    next.push([key, JSON.stringify(v)]);
  }
  const before = new Map(appKeys().map((k) => [k, localStorage.getItem(k)] as const));
  const touched = new Set<string>();
  try {
    for (const [key, json] of next) {
      touched.add(key);
      localStorage.setItem(key, json);
    }
    if (mode === "replace") {
      for (const key of before.keys()) if (!(key in backup.data)) localStorage.removeItem(key);
    }
  } catch {
    try {
      for (const key of touched) {
        const old = before.get(key);
        if (old === undefined || old === null) localStorage.removeItem(key);
        else localStorage.setItem(key, old);
      }
    } catch {
      // restoring only rewrites values that were stored before, so it cannot normally fail
    }
    return { ok: false, error: "Could not import: browser storage is full. Your current data is unchanged." };
  }
  return { ok: true };
}

/** Spreadsheets run cells starting with = + - @ as formulas; a leading ' keeps them text */
function csvCell(s: string): string {
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function logsToCsv(): string {
  const logs = (readKey(LOGS_KEY) ?? {}) as Record<string, DailyLog>;
  const rows = [["date", "meal", "name", "portion_g", "calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g"]];
  for (const date of Object.keys(logs).sort()) {
    for (const e of logs[date]?.entries ?? []) {
      const r1 = (n: number) => Math.round(n * 10) / 10;
      rows.push([date, e.meal, e.name, Math.round(e.portionGrams), Math.round(e.calories), r1(e.protein), r1(e.carbs), r1(e.fat), r1(e.fiber), r1(e.sugar)].map(String));
    }
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
