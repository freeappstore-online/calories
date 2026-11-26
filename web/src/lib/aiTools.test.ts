import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppTool } from "@freeappstore/sdk/bridge";
import { buildTools, type AiDeps } from "./aiTools";
import { getCustomFoods } from "./customFoods";
import { shiftDate, today } from "./dates";
import { assess } from "./ocr/chain";
import { rectQuad } from "./ocr/geometry";
import type { EngineId } from "./ocr/types";
import { createItem, memoryDb, setLabDb, updateItem, withRead, type LabItem } from "./scanLab/store";
import { updateJob } from "./scanLab/jobState";
import { getLog, saveLog } from "./storage";

class MemoryStorage {
  private m = new Map<string, string>();
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
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

const GOOD = `Serving size: 30 g
per Serving per 100 g
Energy 485 kJ 1620 kJ
Protein 5.7 g 19.0 g
Fat, total 3.3 g 11.0 g
Carbohydrate 14.7 g 49.0 g`;

const read = (engine: EngineId, text: string) =>
  assess(engine, { width: 100, height: 100, lines: text.split("\n").map((t, i) => ({ text: t, conf: 90, quad: rectQuad(0, i * 10, 100, i * 10 + 9) })) }, 900);

let deps: { changed: ReturnType<typeof vi.fn>; rerun: ReturnType<typeof vi.fn>; readyEngines: () => EngineId[]; waitMs: number };
let tools: Record<string, AppTool>;
let ready: EngineId[];

const call = (name: string, args: Record<string, unknown> = {}) => Promise.resolve().then(() => tools[name]!.handler(args)) as Promise<any>;
const fails = (name: string, args: Record<string, unknown>) => call(name, args).then(() => "no error", (e: Error) => e.message);

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  setLabDb(memoryDb());
  updateJob({ job: null, queued: 0 });
  ready = ["paddle", "tesseract"];
  deps = { changed: vi.fn(), rerun: vi.fn(async () => undefined), readyEngines: () => ready, waitMs: 30 };
  tools = Object.fromEntries(buildTools(deps as unknown as AiDeps).map((t) => [t.name, t]));
});

/** A lab item with both photos, a read per model, and some correct values */
async function labItem(): Promise<LabItem> {
  const photo = (n: number) => ({ original: new Blob([new Uint8Array(n * 2)]), small: new Blob([new Uint8Array(n)], { type: "image/jpeg" }), width: 800, height: 600 });
  let item = await createItem("Oat bar", { nutrition: photo(40), front: photo(30) });
  item = withRead(item, { photo: "nutrition", engine: "paddle", ranAt: 1, attempt: read("paddle", GOOD) });
  item = withRead(item, { photo: "nutrition", engine: "tesseract", ranAt: 1, attempt: read("tesseract", GOOD.replace("Protein 5.7 g 19.0 g", "Protein 6.7 g 22.3 g")) });
  item = withRead(item, { photo: "front", engine: "paddle", ranAt: 1, attempt: read("paddle", "OAT BAR") });
  return (await updateItem(item.id, () => item))!;
}

it("offers every tool the issue asks for, each with a description and an object schema", () => {
  expect(Object.keys(tools).sort()).toEqual(
    ["add_entry", "create_custom_food", "get_day", "get_range_summary", "get_scan", "get_scan_photo", "get_targets", "list_custom_foods", "list_scans", "parse_text", "rerun_scan", "search_foods", "set_correct_values"].sort(),
  );
  for (const t of Object.values(tools)) {
    expect(t.description.length).toBeGreaterThan(30);
    expect(t.inputSchema.type).toBe("object");
  }
});

describe("scan lab tools", () => {
  it("list_scans summarises the lab and says which models are downloaded", async () => {
    const item = await labItem();
    await call("set_correct_values", { id: item.id, values: { protein: 5.7, fat: 3.3 } });
    const out = await call("list_scans");
    expect(out).toMatchObject({ count: 1, downloadedModels: ["paddle", "tesseract"] });
    expect(out.storageBytes).toBe(40 * 3 + 30 * 3);
    expect(out.items[0]).toMatchObject({ id: item.id, name: "Oat bar", hasPhotos: { front: true, nutrition: true }, hasCorrectValues: true, chainPercentRight: 100 });
    expect(out.overallAccuracy.byEngine.tesseract).toMatchObject({ right: 1, wrong: 1, percentRight: 50 });
  });

  it("get_scan returns texts, parsed values with provenance, timings and accuracy, without photos or boxes", async () => {
    const item = await labItem();
    await call("set_correct_values", { id: item.id, values: { protein: 5.7 } });
    const out = await call("get_scan", { id: item.id });
    expect(out.reads).toHaveLength(3);
    const paddle = out.reads.find((r: any) => r.engine === "paddle" && r.photo === "nutrition");
    expect(paddle).toMatchObject({ ms: 900, good: true, chainPick: true });
    expect(paddle.text).toContain("Protein 5.7 g");
    expect(paddle.parsed.values.protein).toBe(5.7);
    expect(paddle.parsed.provenance.protein.figure).toContain("5.7");
    expect(paddle.lines).toBeUndefined();
    expect(out.accuracy.byEngine.tesseract.wrong).toBe(1);
    expect(JSON.stringify(out)).not.toContain("base64");
    expect((await call("get_scan", { id: item.id, include_boxes: true, photo: "front" })).reads).toEqual([expect.objectContaining({ photo: "front", lines: expect.any(Array) })]);
    expect((await call("get_scan", { id: item.id, engine: "tesseract" })).reads).toHaveLength(1);
  });

  it("get_scan says when reads are running", async () => {
    const item = await labItem();
    updateJob({ queued: 1, job: { itemId: item.id, photo: "nutrition", engine: "paddle", fraction: 0.4 } });
    expect((await call("get_scan", { id: item.id })).readingNow.thisScan).toMatchObject({ engine: "paddle" });
  });

  it("get_scan refuses a result too big for the bridge and says how to narrow it", async () => {
    const item = await labItem();
    const lines = Array.from({ length: 20000 }, (_, i) => `Line ${i} with some printed words`).join("\n");
    await updateItem(item.id, (i) => withRead(i, { photo: "nutrition", engine: "florence", ranAt: 1, attempt: read("florence", lines) }));
    expect(await fails("get_scan", { id: item.id, include_boxes: true })).toMatch(/too large.*photo.*engine/i);
  });

  it("get_scan_photo returns the downscaled JPEG as a data URL", async () => {
    const item = await labItem();
    const out = await call("get_scan_photo", { id: item.id, photo: "front" });
    expect(out).toMatchObject({ photo: "front", mime: "image/jpeg", width: 800, height: 600, bytes: 30 });
    expect(out.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(JSON.stringify(out).length).toBeLessThan(1_000_000);
  });

  it("scan tools explain what to do when the scan or photo is missing", async () => {
    expect(await fails("get_scan", { id: "nope" })).toMatch(/no scan with id "nope".*empty/i);
    expect(await fails("get_scan", {})).toMatch(/list_scans/);
    const item = await labItem();
    expect(await fails("get_scan", { id: "nope" })).toContain(item.id);
    const bare = await createItem("Bare");
    expect(await fails("get_scan_photo", { id: bare.id, photo: "front" })).toMatch(/no front photo.*Scan lab/);
    expect(await fails("get_scan_photo", { id: item.id, photo: "side" })).toMatch(/front.*nutrition/);
  });

  it("rerun_scan runs the models and returns the new reads and accuracy", async () => {
    const item = await labItem();
    await call("set_correct_values", { id: item.id, values: { protein: 5.7 } });
    const out = await call("rerun_scan", { id: item.id, engine: "paddle" });
    expect(deps.rerun).toHaveBeenCalledWith(item.id, "paddle");
    expect(out.status).toBe("done");
    expect(out.reads.find((r: any) => r.engine === "paddle" && r.photo === "nutrition").values.protein).toBe(5.7);
    await call("rerun_scan", { id: item.id });
    expect(deps.rerun).toHaveBeenLastCalledWith(item.id, undefined);
  });

  it("rerun_scan reports a slow run as still running instead of timing out", async () => {
    const item = await labItem();
    deps.rerun.mockImplementation(() => new Promise(() => undefined));
    expect(await call("rerun_scan", { id: item.id })).toMatchObject({ status: "running", message: expect.stringContaining("get_scan") });
  });

  it("rerun_scan tells the AI what is missing", async () => {
    const item = await labItem();
    ready = [];
    expect(await fails("rerun_scan", { id: item.id })).toMatch(/No scanner model is downloaded.*Label scanner/);
    ready = ["paddle"];
    expect(await fails("rerun_scan", { id: item.id, engine: "florence" })).toMatch(/florence model is not downloaded.*Downloaded: paddle/);
    expect(await fails("rerun_scan", { id: item.id, engine: "x" })).toMatch(/engine must be/);
    expect(await fails("rerun_scan", { id: (await createItem("Bare")).id })).toMatch(/no photos/);
  });

  it("set_correct_values merges, clears with null and returns accuracy; bad input says what is allowed", async () => {
    const item = await labItem();
    const out = await call("set_correct_values", { id: item.id, values: { protein: 5.7, fat: 3.3, servingGrams: 30 } });
    expect(out.correct).toEqual({ protein: 5.7, fat: 3.3, servingGrams: 30 });
    expect(out.accuracy.chain).toMatchObject({ engine: "paddle", right: 3, total: 3, percentRight: 100 });
    expect((await call("set_correct_values", { id: item.id, values: { fat: null } })).correct).toEqual({ protein: 5.7, servingGrams: 30 });
    expect(await fails("set_correct_values", { id: item.id, values: { protien: 1 } })).toMatch(/"protien" is not a field.*calories/);
    expect(await fails("set_correct_values", { id: item.id, values: { protein: -2 } })).toMatch(/protein must be a number/);
    expect(await fails("set_correct_values", { id: item.id, values: {} })).toMatch(/Pass "values"/);
  });

  it("parse_text runs the parser and nothing is saved", async () => {
    const out = await call("parse_text", { text: GOOD });
    expect(out.values).toMatchObject({ protein: 5.7, fat: 3.3, carbs: 14.7, servingGrams: 30 });
    expect(out.provenance.fat.name).toMatch(/fat/i);
    expect(await call("list_scans")).toMatchObject({ count: 0 });
    expect(await fails("parse_text", { text: "  " })).toMatch(/Pass the label text/);
    expect(await fails("parse_text", { text: "x".repeat(20001) })).toMatch(/longer than 20000/);
  });
});

describe("food log tools", () => {
  const day = today();

  it("search_foods finds library and custom foods, best match first, with ids and servings", async () => {
    await call("create_custom_food", { name: "Banana bread", serving_grams: 60, calories: 200 });
    const out = await call("search_foods", { query: "banana" });
    expect(out.total).toBeGreaterThan(1);
    expect(out.foods.some((f: any) => f.id.startsWith("custom:"))).toBe(true);
    expect(out.foods[0].name.toLowerCase()).toContain("banana");
    expect(out.foods[0].per100g.calories).toBeGreaterThan(0);
    expect((await call("search_foods", { query: "banana", limit: 2 })).foods).toHaveLength(2);
    expect((await call("search_foods", { query: "zzzzqqq" })).foods).toEqual([]);
    expect(await fails("search_foods", { query: "" })).toMatch(/Pass the food/);
    expect(await fails("search_foods", { query: "a", limit: 500 })).toMatch(/limit must be/);
  });

  it("add_entry logs a library food by grams and the day shows it", async () => {
    const { foods } = await call("search_foods", { query: "banana", limit: 1 });
    const out = await call("add_entry", { food_id: foods[0].id, grams: 120, meal: "snacks" });
    expect(out.added).toMatchObject({ meal: "snacks", grams: 120, foodId: foods[0].id });
    expect(out.added.calories).toBe(Math.round((foods[0].per100g.calories * 120) / 100));
    expect(deps.changed).toHaveBeenCalledTimes(1);
    expect(getLog(day).entries).toHaveLength(1);
    expect(getLog(day).entries[0]!.micros).toBeDefined();
    const d = await call("get_day");
    expect(d.entries).toHaveLength(1);
    expect(d.totals.calories).toBe(out.day.totals.calories);
    expect(d.remaining.calories).toBe(d.targets.calories - d.totals.calories);
  });

  it("add_entry quick adds, to another date, and defaults the meal", async () => {
    const yesterday = shiftDate(day, -1);
    const out = await call("add_entry", { name: "Coffee with milk", calories: 45, protein: 2, date: yesterday });
    expect(out.added).toMatchObject({ foodId: null, name: "Coffee with milk", calories: 45, protein: 2 });
    expect(["breakfast", "lunch", "dinner", "snacks"]).toContain(out.added.meal);
    expect(getLog(yesterday).entries).toHaveLength(1);
    expect(getLog(day).entries).toHaveLength(0);
  });

  it("add_entry errors are instructions", async () => {
    expect(await fails("add_entry", {})).toMatch(/food_id and grams.*name and calories/);
    expect(await fails("add_entry", { food_id: "nope", grams: 5 })).toMatch(/search_foods/);
    const { foods } = await call("search_foods", { query: "banana", limit: 1 });
    expect(await fails("add_entry", { food_id: foods[0].id })).toMatch(/Pass grams/);
    expect(await fails("add_entry", { food_id: foods[0].id, grams: 0 })).toMatch(/grams must be a number/);
    expect(await fails("add_entry", { food_id: foods[0].id, grams: 100, meal: "brunch" })).toMatch(/not one of: breakfast, lunch, dinner, snacks/);
    expect(await fails("add_entry", { name: "x", calories: 1, date: "26/11/2026" })).toMatch(/YYYY-MM-DD/);
    expect(await fails("add_entry", { name: "x", calories: 1, date: "2026-02-31" })).toMatch(/YYYY-MM-DD/);
    expect(await fails("add_entry", { name: "Tea" })).toMatch(/calories is required/);
    expect(await fails("add_entry", { calories: 5 })).toMatch(/needs a name/);
    expect(deps.changed).not.toHaveBeenCalled();
  });

  it("get_day totals, per meal and against the targets", async () => {
    saveLog({ date: day, entries: [
      { id: "1", foodId: null, name: "A", meal: "breakfast", portionGrams: 0, calories: 300, protein: 10, carbs: 40, fat: 8, fiber: 3, sugar: 5 },
      { id: "2", foodId: null, name: "B", meal: "dinner", portionGrams: 0, calories: 700, protein: 40, carbs: 60, fat: 20, fiber: 5, sugar: 9 },
    ] });
    const d = await call("get_day", { date: day });
    expect(d.totals).toMatchObject({ calories: 1000, protein: 50 });
    expect(d.byMeal.breakfast.calories).toBe(300);
    expect(d.byMeal.lunch.calories).toBe(0);
    expect(d.targets.calories).toBe(2000);
    expect(d.percentOfTarget.calories).toBe(50);
    expect(d.entries.map((e: any) => e.id)).toEqual(["1", "2"]);
    expect(await fails("get_day", { date: "yesterday" })).toMatch(/not a valid date/);
  });

  it("get_range_summary lists each day, averages over logged days and limits the range", async () => {
    const d1 = shiftDate(day, -2);
    saveLog({ date: d1, entries: [{ id: "1", foodId: null, name: "A", meal: "lunch", portionGrams: 0, calories: 1800, protein: 100, carbs: 200, fat: 60, fiber: 0, sugar: 0 }] });
    saveLog({ date: day, entries: [{ id: "2", foodId: null, name: "B", meal: "lunch", portionGrams: 0, calories: 2200, protein: 120, carbs: 250, fat: 70, fiber: 0, sugar: 0 }] });
    const out = await call("get_range_summary", { from: d1, to: day });
    expect(out.days.map((r: any) => r.logged)).toEqual([true, false, true]);
    expect(out.daysLogged).toBe(2);
    expect(out.averagePerLoggedDay.calories).toBe(2000);
    expect(out.targets.calories).toBe(2000);
    expect(await fails("get_range_summary", { from: day, to: d1 })).toMatch(/after to/);
    expect(await fails("get_range_summary", { from: "2020-01-01", to: day })).toMatch(/longer than 366 days/);
  });

  it("create_custom_food stores per 100 g, and list_custom_foods and add_entry use it", async () => {
    const out = await call("create_custom_food", { name: " Oat bar ", serving_label: "1 bar", serving_grams: 40, calories: 160, protein: 4, carbs: 24, fat: 6, micros: { sodium: 80 } });
    expect(out.created).toMatchObject({ name: "Oat bar", servingLabel: "1 bar", servingGrams: 40 });
    expect(out.created.per100g).toMatchObject({ calories: 400, protein: 10, carbs: 60, fat: 15, sodium: 200 });
    expect(getCustomFoods()).toHaveLength(1);
    expect(deps.changed).toHaveBeenCalledTimes(1);
    const list = await call("list_custom_foods");
    expect(list.foods).toHaveLength(1);
    const entry = await call("add_entry", { food_id: list.foods[0].id, grams: 40 });
    expect(entry.added.calories).toBe(160);
  });

  it("create_custom_food errors are instructions", async () => {
    expect(await fails("create_custom_food", { name: "", serving_grams: 40, calories: 1 })).toMatch(/name is required/);
    expect(await fails("create_custom_food", { name: "x", calories: 1 })).toMatch(/serving_grams is required/);
    expect(await fails("create_custom_food", { name: "x", serving_grams: 40 })).toMatch(/calories is required/);
    expect(await fails("create_custom_food", { name: "x", serving_grams: 40, calories: 99999 })).toMatch(/calories must be/);
    expect(await fails("create_custom_food", { name: "x", serving_grams: 40, calories: 1, micros: { zinc: 2 } })).toMatch(/not a micronutrient.*sodium/);
    expect(getCustomFoods()).toHaveLength(0);
  });

  it("get_targets returns the targets in effect and which were set by hand", async () => {
    expect(await call("get_targets")).toMatchObject({ targets: { calories: 2000, protein: 150 }, setByUser: [], profileSet: false });
    localStorage.setItem("calories_goals", JSON.stringify({ calories: 1800, v: 2 }));
    const out = await call("get_targets");
    expect(out.targets.calories).toBe(1800);
    expect(out.setByUser).toEqual(["calories"]);
  });
});
