import type { DailyLog } from "../data/types";

const PREFIX = "calories_";
const LOGS_KEY = "calories_logs";
const GOALS_KEY = "calories_goals";
const PROFILE_KEY = "calories_profile";
const MEALS_KEY = "calories_saved_meals";

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
  if (logs !== undefined && !(isRecord(logs) && Object.values(logs).every((l) => isRecord(l) && Array.isArray(l.entries)))) {
    return { ok: false, error: "The backup's food log is malformed." };
  }
  const meals = data[MEALS_KEY];
  if (meals !== undefined && !Array.isArray(meals)) {
    return { ok: false, error: "The backup's saved meals are malformed." };
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
    const localEntries = out[date]?.entries ?? [];
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

export function applyBackup(backup: Backup, mode: "merge" | "replace"): void {
  if (mode === "replace") {
    for (const key of appKeys()) localStorage.removeItem(key);
  }
  for (const [key, value] of Object.entries(backup.data)) {
    let next = value;
    if (mode === "merge") {
      if (key === LOGS_KEY) next = mergeLogs(readKey(key), value as Record<string, DailyLog>);
      else if (Array.isArray(value)) next = mergeArrays(readKey(key), value);
    }
    localStorage.setItem(key, JSON.stringify(next));
  }
}

function csvCell(s: string): string {
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
