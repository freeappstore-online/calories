import { beforeEach, describe, expect, it } from "vitest";
import { applyBackup, logsToCsv, parseBackup } from "./backup";
import { getCustomFoods } from "./customFoods";
import { getFavoriteTemplates } from "./foodHistory";
import { matchesQuery, normalizeSearch } from "./foodSearch";

class MemoryStorage {
  private m = new Map<string, string>();
  /** Throws on setItem once this many writes happened, to simulate a full quota */
  failAfter = Infinity;
  private writes = 0;
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.writes++ >= this.failAfter) throw new Error("QuotaExceededError");
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

let store: MemoryStorage;
beforeEach(() => {
  store = new MemoryStorage();
  (globalThis as { localStorage?: unknown }).localStorage = store;
});

const entry = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  foodId: "apple",
  name: "Apple",
  meal: "snacks",
  portionGrams: 100,
  calories: 52,
  protein: 0,
  carbs: 14,
  fat: 0,
  fiber: 2,
  sugar: 10,
  ...over,
});
const file = (data: Record<string, unknown>) => JSON.stringify({ app: "calories", version: 1, exportedAt: "", data });
const logsFile = (entries: unknown[]) => file({ calories_logs: { "2026-01-01": { date: "2026-01-01", entries } } });
const customFood = (over: Record<string, unknown> = {}) => ({
  id: "custom:1",
  name: "Mine",
  category: "custom",
  image: "pot_of_food",
  servingLabel: "1 serving",
  servingGrams: 50,
  calories: 100,
  protein: 1,
  carbs: 1,
  fat: 1,
  fiber: 1,
  sugar: 1,
  ...over,
});

describe("parseBackup validation", () => {
  it("accepts a well-formed backup", () => {
    const r = parseBackup(logsFile([entry()]));
    expect(r.ok && r.summary.days).toBe(1);
  });

  it.each([
    ["a null entry", [null]],
    ["a non-object entry", ["x"]],
    ["an entry without id", [entry({ id: undefined })]],
    ["an entry with a bad meal", [entry({ meal: "brunch" })]],
    ["an entry with string calories", [entry({ calories: "52" })]],
    ["an entry with missing protein", [entry({ protein: undefined })]],
    ["an entry with NaN-ish (null) carbs", [entry({ carbs: null })]],
    ["an entry with bad micros", [entry({ micros: { iron: "x" } })]],
  ])("rejects %s", (_n, entries) => {
    expect(parseBackup(logsFile(entries as unknown[])).ok).toBe(false);
  });

  it("rejects hostile shapes", () => {
    expect(parseBackup(file({ calories_logs: [] })).ok).toBe(false);
    expect(parseBackup(file({ calories_logs: { "2026-01-01": null } })).ok).toBe(false);
    expect(parseBackup(file({ calories_logs: { "2026-01-01": { entries: "x" } } })).ok).toBe(false);
    expect(parseBackup('{"app":"calories","version":1,"data":{"calories_logs":{"__proto__":{"entries":[]}}}}').ok).toBe(false);
    expect(parseBackup(file({ calories_saved_meals: [null] })).ok).toBe(false);
    expect(parseBackup(file({ calories_saved_meals: [{ id: "m", name: "x", entries: [null] }] })).ok).toBe(false);
    expect(parseBackup(file({ calories_favorites: [1] })).ok).toBe(false);
    expect(parseBackup(file({ calories_goals: [] })).ok).toBe(false);
    expect(parseBackup(file({ calories_profile: "x" })).ok).toBe(false);
    expect(parseBackup(file({ other_key: 1 })).ok).toBe(false);
  });

  it("rejects custom foods without a name or numeric calories", () => {
    expect(parseBackup(file({ calories_custom_foods: [customFood({ name: undefined })] })).ok).toBe(false);
    expect(parseBackup(file({ calories_custom_foods: [customFood({ calories: "100" })] })).ok).toBe(false);
    expect(parseBackup(file({ calories_custom_foods: [null] })).ok).toBe(false);
    expect(parseBackup(file({ calories_custom_foods: [customFood()] })).ok).toBe(true);
  });
});

describe("applyBackup", () => {
  const good = () => {
    const r = parseBackup(logsFile([entry({ id: "new" })]));
    if (!r.ok) throw new Error("fixture invalid");
    return r.backup;
  };

  it("replace leaves existing data intact when the file is invalid", () => {
    store.setItem("calories_logs", '{"keep":"me"}');
    const r = parseBackup(logsFile([null]));
    expect(r.ok).toBe(false); // the UI never reaches applyBackup
    expect(store.getItem("calories_logs")).toBe('{"keep":"me"}');
  });

  it("replace swaps data and removes stale keys only after the new values are stored", () => {
    store.setItem("calories_logs", "{}");
    store.setItem("calories_goals", '{"calories":1}');
    expect(applyBackup(good(), "replace")).toEqual({ ok: true });
    expect(store.getItem("calories_goals")).toBeNull();
    expect(JSON.parse(store.getItem("calories_logs")!)["2026-01-01"].entries[0].id).toBe("new");
  });

  it("restores the previous data when a write fails midway", () => {
    store.setItem("calories_goals", '{"calories":1}');
    store.setItem("calories_logs", '{"old":true}');
    store.failAfter = 2; // two setItem calls above already counted; next write fails
    const r = applyBackup(good(), "replace");
    expect(r.ok).toBe(false);
    store.failAfter = Infinity;
    expect(store.getItem("calories_logs")).toBe('{"old":true}');
    expect(store.getItem("calories_goals")).toBe('{"calories":1}');
  });

  it("merge tolerates a corrupt local log", () => {
    store.setItem("calories_logs", JSON.stringify({ "2026-01-01": { entries: "broken" } }));
    expect(applyBackup(good(), "merge")).toEqual({ ok: true });
    expect(JSON.parse(store.getItem("calories_logs")!)["2026-01-01"].entries).toHaveLength(1);
  });
});

describe("logsToCsv", () => {
  it("neutralises formula-looking names", () => {
    store.setItem(
      "calories_logs",
      JSON.stringify({ "2026-01-01": { date: "2026-01-01", entries: [entry({ name: "=HYPERLINK(1)" }), entry({ name: "@x" }), entry({ name: "+1" }), entry({ name: "-2" }), entry({ name: "Apple" })] } }),
    );
    const rows = logsToCsv().trim().split("\r\n").slice(1);
    expect(rows.map((r) => r.split(",")[2])).toEqual(["'=HYPERLINK(1)", "'@x", "'+1", "'-2", "Apple"]);
  });
});

describe("custom foods and favourites", () => {
  it("getCustomFoods drops foods without a name or calories", () => {
    store.setItem("calories_custom_foods", JSON.stringify([customFood(), customFood({ id: "custom:2", name: undefined }), null, { id: "x" }]));
    expect(getCustomFoods().map((f) => f.id)).toEqual(["custom:1"]);
  });

  it("favourites skip foods that no longer exist, even if they were logged", () => {
    store.setItem("calories_custom_foods", JSON.stringify([customFood()]));
    store.setItem(
      "calories_logs",
      JSON.stringify({ "2026-01-01": { date: "2026-01-01", entries: [entry({ foodId: "custom:gone", name: "Gone" })] } }),
    );
    const t = getFavoriteTemplates(["custom:gone", "custom:1"]);
    expect(t.map((x) => x.foodId)).toEqual(["custom:1"]);
  });

  it("a favourite with a 0.5 g first serving defaults to 100 g, not 0.5 g", () => {
    store.setItem("calories_custom_foods", JSON.stringify([customFood({ servingGrams: 0.5 })]));
    expect(getFavoriteTemplates(["custom:1"])[0]?.portionGrams).toBe(100);
  });
});

describe("search normalisation", () => {
  it("trims, lower-cases and folds accents", () => {
    expect(normalizeSearch("  Crème BRÛLÉE ")).toBe("creme brulee");
    expect(matchesQuery("  apple", "Apple pie")).toBe(true);
    expect(matchesQuery("creme", "Crème brûlée")).toBe(true);
    expect(matchesQuery("crème", "Creme brulee")).toBe(true);
    expect(matchesQuery("   ", "anything")).toBe(true);
    expect(matchesQuery("zzz", "Apple", "fruits")).toBe(false);
  });
});
