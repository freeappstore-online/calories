// The tools an AI on this computer can call through the FreeAppStore desktop app (see lib/useAiAccess.ts).
// Errors are thrown as instructions: the AI reads them as-is. Results stay far below the bridge's 1 MB message cap.

import type { AppTool } from "@freeappstore/sdk/bridge";
import { foods, servingSizes } from "../data";
import { MICRO_DEFS, type CustomFood, type FoodEntry, type FoodItem, type MealType } from "../data/types";
import { buildCustomFood, findFood, getCustomFoods, isValidGrams, MAX_CUSTOM_VALUE, MAX_GRAMS, MIN_GRAMS, saveCustomFood, servingsFor } from "./customFoods";
import { shiftDate, today, toDateString } from "./dates";
import { defaultMealForTime } from "./entryEdit";
import { matchesQuery, normalizeSearch } from "./foodSearch";
import { parseLabel } from "./labelParser";
import { scaleMicros, scaleNutrition, sumEntries, sumMicros } from "./nutrition";
import type { EngineId, OcrLine } from "./ocr/types";
import { describeScan, type CorrectKey } from "./scanLab/accuracy";
import { getJobState } from "./scanLab/jobState";
import { accuracyReport, blobToDataUrl, getItem, itemReport, itemSummary, labAccuracy, listItems, PHOTO_KINDS, setCorrect, storageBytes, type LabItem, type PhotoKind } from "./scanLab/store";
import { getLog, getProfile, getTargetOverrides, saveLog } from "./storage";
import { computeTargets } from "./targets";

/** Fires after a tool changed the log, the custom foods or the lab, so the screen shows it live */
export const DATA_CHANGED_EVENT = "calories:data-changed";

/** What the tools need from the browser side; the pure rest works on storage */
export interface AiDeps {
  /** Start reading a lab item's photos with downloaded models, resolving when done */
  rerun: (itemId: string, engine?: EngineId) => Promise<unknown>;
  readyEngines: () => EngineId[];
  /** Tell the screen the log or custom foods changed */
  changed: () => void;
  /** Longest a rerun_scan call waits before reporting it is still running (the bridge gives up at 30 s) */
  waitMs?: number;
}

const MEALS: MealType[] = ["breakfast", "lunch", "dinner", "snacks"];
const MAX_RANGE_DAYS = 366;
const r1 = (n: number) => Math.round(n * 10) / 10;

function dateArg(value: unknown, name: string): string {
  const d = value === undefined || value === null || value === "" ? today() : value;
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || toDateString(new Date(d + "T12:00:00")) !== d) {
    throw new Error(`"${String(value)}" is not a valid ${name}. Use YYYY-MM-DD, for example ${today()}.`);
  }
  return d;
}

const mealArg = (value: unknown): MealType => {
  if (value === undefined || value === null || value === "") return defaultMealForTime(new Date());
  if (!MEALS.includes(value as MealType)) throw new Error(`Meal "${String(value)}" is not one of: ${MEALS.join(", ")}.`);
  return value as MealType;
};

function numberArg(value: unknown, name: string, { min = 0, max = MAX_CUSTOM_VALUE, required = false } = {}): number | undefined {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${name} is required. Give a number.`);
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a number from ${min} to ${max}; got ${JSON.stringify(value)}.`);
  }
  return value;
}

// ── Scan lab ──

async function itemArg(id: unknown): Promise<LabItem> {
  if (typeof id !== "string" || !id) throw new Error("Pass the scan's id. Call list_scans to see the ids.");
  const item = await getItem(id);
  if (!item) {
    const ids = (await listItems()).map((i) => `${i.id} (${i.name || "unnamed"})`).join(", ");
    throw new Error(`There is no scan with id "${id}". ${ids ? `Scans: ${ids}.` : "The scan lab is empty: the user adds items in Profile, Label scanner, Scan lab."}`);
  }
  return item;
}

const photoArg = (value: unknown): PhotoKind => {
  if (!PHOTO_KINDS.includes(value as PhotoKind)) throw new Error('photo must be "front" or "nutrition".');
  return value as PhotoKind;
};

/** Nothing the AI is sent may pass this: the bridge refuses 1 MB messages, with some room for the envelope */
const MAX_RESULT_BYTES = 900_000;

const CORRECT_KEYS: CorrectKey[] = ["calories", "protein", "carbs", "fat", "fiber", "sugar", ...MICRO_DEFS.map((m) => m.key), "servingGrams"];

function parseCorrect(values: unknown): Partial<Record<CorrectKey, number | null>> {
  if (typeof values !== "object" || values === null || Array.isArray(values) || Object.keys(values).length === 0) {
    throw new Error(`Pass "values" as an object of the label's true values per serving, e.g. {"calories": 250, "protein": 12}. Fields: ${CORRECT_KEYS.join(", ")}. Use null to clear one.`);
  }
  const out: Partial<Record<CorrectKey, number | null>> = {};
  for (const [k, v] of Object.entries(values)) {
    if (!CORRECT_KEYS.includes(k as CorrectKey)) throw new Error(`"${k}" is not a field. Fields: ${CORRECT_KEYS.join(", ")}.`);
    out[k as CorrectKey] = v === null ? null : numberArg(v, k);
  }
  return out;
}

function scanTools(deps: AiDeps): AppTool[] {
  return [
    {
      name: "list_scans",
      description:
        "List the scan lab: real nutrition-label photos the user saved, each with a front photo and a nutrition-panel photo that every downloaded OCR model has read. " +
        "Returns every item (id, name, which photos and models, whether correct values are entered, the chain's accuracy), the overall accuracy per model and the storage used. Call this first.",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        const items = await listItems();
        const overall = labAccuracy(items);
        const pc = (a: { total: number; right: number }) => (a.total ? Math.round((100 * a.right) / a.total) : null);
        return {
          count: items.length,
          storageBytes: storageBytes(items),
          downloadedModels: deps.readyEngines(),
          overallAccuracy: {
            itemsWithCorrectValues: overall.items,
            chain: overall.chain && { ...overall.chain, percentRight: pc(overall.chain) },
            byEngine: Object.fromEntries(Object.entries(overall.byEngine).map(([e, a]) => [e, { ...a, percentRight: pc(a) }])),
          },
          items: items.map(itemSummary),
        };
      },
    },
    {
      name: "get_scan",
      description:
        "Everything about one scan: for each model and photo the raw text it read, the parsed values with the printed name and figure each came from, warnings, confidence, time, " +
        "whether the failover chain would pick it, plus the correct values the user entered and the per-model accuracy. Photos are separate (get_scan_photo). " +
        "Box positions are left out unless include_boxes is true; use photo or engine to narrow a large result.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Scan id from list_scans." },
          photo: { type: "string", enum: ["front", "nutrition"], description: "Only reads of this photo." },
          engine: { type: "string", enum: ["paddle", "tesseract", "florence"], description: "Only reads by this model." },
          include_boxes: { type: "boolean", description: "Include every recognised line with its box in image pixels." },
        },
        required: ["id"],
      },
      handler: async ({ id, photo, engine, include_boxes }) => {
        const item = await itemArg(id);
        const report = itemReport(item, include_boxes === true);
        const reads = report.reads.filter((r) => (photo === undefined || r.photo === photo) && (engine === undefined || r.engine === engine));
        const out = { ...report, reads, ...jobStatus(item) };
        if (JSON.stringify(out).length > MAX_RESULT_BYTES) {
          throw new Error("This scan is too large to return in one call. Narrow it with photo (front or nutrition) and engine, or leave include_boxes off.");
        }
        return out;
      },
    },
    {
      name: "get_scan_photo",
      description: "One of a scan's photos, downscaled, as a JPEG data URL (at most about 640 KB of image) so you can look at the real label.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Scan id." }, photo: { type: "string", enum: ["front", "nutrition"] } },
        required: ["id", "photo"],
      },
      handler: async ({ id, photo }) => {
        const item = await itemArg(id);
        const kind = photoArg(photo);
        const p = item[kind];
        if (!p) throw new Error(`This scan has no ${kind} photo. The user adds it in the app: Profile, Label scanner, Scan lab, open "${item.name || "this item"}".`);
        return { id: item.id, photo: kind, mime: p.small.type || "image/jpeg", width: p.width, height: p.height, bytes: p.small.size, dataUrl: await blobToDataUrl(p.small) };
      },
    },
    {
      name: "rerun_scan",
      description:
        "Read a scan's photos again with the current parser and models (all downloaded models, or just one), to check parser changes against real photos. " +
        "Replaces the earlier reads. A slow model may not finish in time: the call then returns status \"running\"; call get_scan a little later to see the new reads.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Scan id." },
          engine: { type: "string", enum: ["paddle", "tesseract", "florence"], description: "Only this model. Default: every downloaded model." },
        },
        required: ["id"],
      },
      handler: async ({ id, engine }) => {
        const item = await itemArg(id);
        const ready = deps.readyEngines();
        if (engine !== undefined && !["paddle", "tesseract", "florence"].includes(engine)) throw new Error('engine must be "paddle", "tesseract" or "florence".');
        if (ready.length === 0) throw new Error("No scanner model is downloaded. The user downloads one in the app: Profile, Label scanner (PaddleOCR is recommended).");
        if (engine !== undefined && !ready.includes(engine)) throw new Error(`The ${engine} model is not downloaded. Downloaded: ${ready.join(", ")}. Omit engine to use them all, or ask the user to download it in Profile, Label scanner.`);
        if (!item.front && !item.nutrition) throw new Error("This scan has no photos to read. The user adds them in the app.");
        const done = deps.rerun(item.id, engine);
        const finished = await Promise.race([done.then(() => true), new Promise<false>((r) => setTimeout(() => r(false), deps.waitMs ?? 20_000))]);
        if (!finished) return { id: item.id, status: "running", message: "Still reading. Call get_scan in a few seconds; reads are saved as each model finishes." };
        const fresh = await itemArg(item.id);
        return { id: item.id, status: "done", accuracy: accuracyReport(fresh), reads: itemReport(fresh, false).reads.map((r) => ({ photo: r.photo, engine: r.engine, ms: r.ms, good: r.good, chainPick: r.chainPick ?? false, error: r.error, values: r.parsed?.values })) };
      },
    },
    {
      name: "set_correct_values",
      description:
        "Record the label's true values for a scan (per serving, as printed), so the lab can score each model. Merges with what is there; null clears a field. " +
        `Fields: ${CORRECT_KEYS.join(", ")}. Returns the updated accuracy.`,
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Scan id." },
          values: { type: "object", description: 'True values, e.g. {"calories": 250, "protein": 12, "servingGrams": 40}.', additionalProperties: { type: ["number", "null"] } },
        },
        required: ["id", "values"],
      },
      handler: async ({ id, values }) => {
        const item = await itemArg(id);
        const saved = (await setCorrect(item.id, parseCorrect(values)))!;
        return { id: saved.id, correct: saved.correct, accuracy: accuracyReport(saved) };
      },
    },
    {
      name: "parse_text",
      description:
        "Run the app's label parser on text you give it (one line per row of the label), for parser experiments. Returns the values it finds per serving, the printed name and figure each came from, warnings and conflicts. Nothing is saved.",
      inputSchema: { type: "object", properties: { text: { type: "string", description: "OCR text of a nutrition label." } }, required: ["text"] },
      handler: ({ text }) => {
        if (typeof text !== "string" || !text.trim()) throw new Error("Pass the label text in `text`, one line per row, e.g. \"Protein 12 g\\nCarbohydrate 30 g\".");
        if (text.length > 20_000) throw new Error("text is longer than 20000 characters. Pass only the nutrition panel.");
        const lines: OcrLine[] = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).map((t) => ({ text: t, conf: null, quad: [[0, 0], [1, 0], [1, 1], [0, 1]] }));
        return describeScan(parseLabel(text), lines);
      },
    },
  ];
}

/** Whether reads are running now, so the AI knows to ask again later */
function jobStatus(item: LabItem) {
  const { job, queued } = getJobState();
  return queued > 0 ? { readingNow: { thisScan: job?.itemId === item.id ? job : null, runsQueued: queued } } : {};
}

// ── Food log ──

const entryOut = (e: FoodEntry) => ({
  id: e.id,
  meal: e.meal,
  name: e.name,
  foodId: e.foodId,
  grams: e.portionGrams,
  calories: Math.round(e.calories),
  protein: r1(e.protein),
  carbs: r1(e.carbs),
  fat: r1(e.fat),
  fiber: r1(e.fiber),
  sugar: r1(e.sugar),
});

const MACRO_KEYS = ["calories", "protein", "carbs", "fat", "fiber", "sugar"] as const;

function targetsOut() {
  const t = computeTargets(getProfile(), getTargetOverrides());
  return Object.fromEntries(MACRO_KEYS.map((k) => [k, Math.round(t[k])]));
}

function dayOut(date: string) {
  const { entries } = getLog(date);
  const totals = sumEntries(entries);
  const targets = computeTargets(getProfile(), getTargetOverrides());
  const byMeal = Object.fromEntries(MEALS.map((m) => [m, sumEntries(entries.filter((e) => e.meal === m))]));
  const micros = sumMicros(entries);
  return {
    date,
    entries: entries.map(entryOut),
    totals,
    targets: targetsOut(),
    percentOfTarget: Object.fromEntries(MACRO_KEYS.map((k) => [k, Math.round((100 * totals[k]) / targets[k])])),
    byMeal,
    micronutrients: Object.fromEntries(
      MICRO_DEFS.filter((m) => micros[m.key].coveredEntries > 0).map((m) => [m.key, { total: r1(micros[m.key].total), unit: m.unit, target: targets[m.key], entriesWithoutValue: micros[m.key].unknownEntries }]),
    ),
  };
}

const foodOut = (f: FoodItem) => ({
  id: f.id,
  name: f.name,
  category: f.category,
  per100g: Object.fromEntries([...MACRO_KEYS, ...MICRO_DEFS.map((m) => m.key)].map((k) => [k, f[k as keyof FoodItem]]).filter(([, v]) => v !== null)),
  servings: servingsFor(f) ?? [],
});

const customOut = (f: CustomFood) => ({ ...foodOut(f), servingLabel: f.servingLabel, servingGrams: f.servingGrams });

function foodTools(deps: AiDeps): AppTool[] {
  const date = { type: "string", description: "Day as YYYY-MM-DD. Default today." };
  return [
    {
      name: "get_day",
      description: "One day's food log: every entry (with the id), totals, % of the daily target, totals per meal and micronutrients, plus the targets and what is left.",
      inputSchema: { type: "object", properties: { date } },
      handler: ({ date }) => {
        const d = dayOut(dateArg(date, "date"));
        return { ...d, remaining: Object.fromEntries(MACRO_KEYS.map((k) => [k, r1(Number(d.targets[k]) - d.totals[k])])) };
      },
    },
    {
      name: "get_range_summary",
      description: `Totals per day over a date range (at most ${MAX_RANGE_DAYS} days), the average over days that have entries, and the targets. Days with no entries are listed with logged: false.`,
      inputSchema: {
        type: "object",
        properties: { from: { type: "string", description: "First day, YYYY-MM-DD." }, to: { type: "string", description: "Last day, YYYY-MM-DD. Default today." } },
        required: ["from"],
      },
      handler: ({ from, to }) => {
        const a = dateArg(from, "from date");
        const b = dateArg(to, "to date");
        if (a > b) throw new Error(`from (${a}) is after to (${b}). Swap them.`);
        const days: string[] = [];
        for (let d = a; d <= b; d = shiftDate(d, 1)) {
          days.push(d);
          if (days.length > MAX_RANGE_DAYS) throw new Error(`That range is longer than ${MAX_RANGE_DAYS} days. Ask for a shorter one, or call it more than once.`);
        }
        const rows = days.map((d) => {
          const entries = getLog(d).entries;
          return { date: d, logged: entries.length > 0, entries: entries.length, ...sumEntries(entries) };
        });
        const logged = rows.filter((r) => r.logged);
        const avg = (k: (typeof MACRO_KEYS)[number]) => (logged.length ? r1(logged.reduce((s, r) => s + r[k], 0) / logged.length) : null);
        return { from: a, to: b, days: rows, daysLogged: logged.length, averagePerLoggedDay: Object.fromEntries(MACRO_KEYS.map((k) => [k, avg(k)])), targets: targetsOut() };
      },
    },
    {
      name: "search_foods",
      description: "Search the food library and the user's custom foods by name. Returns ids to use with add_entry, nutrition per 100 g and common servings. Best matches first.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: 'Words from the food name, e.g. "greek yogurt".' }, limit: { type: "number", description: "Most results, 1 to 50. Default 10." } },
        required: ["query"],
      },
      handler: ({ query, limit }) => {
        if (typeof query !== "string" || !query.trim()) throw new Error('Pass the food to look for in `query`, e.g. "banana".');
        const max = Math.round(numberArg(limit, "limit", { min: 1, max: 50 }) ?? 10);
        const q = normalizeSearch(query);
        const words = q.split(/\s+/);
        const all: FoodItem[] = [...getCustomFoods(), ...foods];
        const hits = all
          .filter((f) => words.every((w) => matchesQuery(w, f.name)))
          .map((f) => {
            const n = normalizeSearch(f.name);
            return { f, rank: n === q ? 0 : n.startsWith(q) ? 1 : n.split(/\s+/).some((w) => w.startsWith(words[0]!)) ? 2 : 3 };
          })
          .sort((x, y) => x.rank - y.rank || x.f.name.length - y.f.name.length);
        return { query, total: hits.length, foods: hits.slice(0, max).map((h) => foodOut(h.f)) };
      },
    },
    {
      name: "add_entry",
      description:
        "Log food. Either a known food: food_id (from search_foods or list_custom_foods) and grams; or a quick add: name and calories (macros optional). " +
        "Shows live in the app and can be edited or deleted there. Returns the entry and the day's new totals.",
      inputSchema: {
        type: "object",
        properties: {
          food_id: { type: "string", description: "Food id from search_foods / list_custom_foods." },
          grams: { type: "number", description: `Portion in grams, ${MIN_GRAMS} to ${MAX_GRAMS}. With food_id.` },
          name: { type: "string", description: "Quick add: what it is." },
          calories: { type: "number", description: "Quick add: calories." },
          protein: { type: "number" },
          carbs: { type: "number" },
          fat: { type: "number" },
          meal: { type: "string", enum: MEALS, description: "Default: the meal that fits the time of day." },
          date,
        },
      },
      handler: (a) => {
        const day = dateArg(a.date, "date");
        const meal = mealArg(a.meal);
        let entry: FoodEntry;
        if (a.food_id !== undefined) {
          const food = typeof a.food_id === "string" ? findFood(a.food_id) : undefined;
          if (!food) throw new Error(`There is no food with id "${String(a.food_id)}". Call search_foods or list_custom_foods and use an id from the result.`);
          if (a.grams === undefined) throw new Error(`Pass grams, the portion eaten, ${MIN_GRAMS} to ${MAX_GRAMS}. Common servings: ${(servingsFor(food) ?? servingSizes[food.id] ?? []).map((s) => `${s.label} = ${s.grams} g`).join(", ") || "none listed"}.`);
          const grams = numberArg(a.grams, "grams", { min: MIN_GRAMS, max: MAX_GRAMS, required: true })!;
          if (!isValidGrams(grams)) throw new Error(`grams must be from ${MIN_GRAMS} to ${MAX_GRAMS}.`);
          entry = { id: crypto.randomUUID(), foodId: food.id, name: food.name, meal, portionGrams: grams, ...scaleNutrition(food, grams), micros: scaleMicros(food, grams) };
        } else if (a.name !== undefined || a.calories !== undefined) {
          if (typeof a.name !== "string" || !a.name.trim()) throw new Error("A quick add needs a name, e.g. \"Coffee with milk\". For a known food pass food_id and grams instead.");
          entry = {
            id: crypto.randomUUID(),
            foodId: null,
            name: a.name.trim().slice(0, 60),
            meal,
            portionGrams: 0,
            calories: numberArg(a.calories, "calories", { required: true })!,
            protein: numberArg(a.protein, "protein") ?? 0,
            carbs: numberArg(a.carbs, "carbs") ?? 0,
            fat: numberArg(a.fat, "fat") ?? 0,
            fiber: 0,
            sugar: 0,
          };
        } else {
          throw new Error("Pass either food_id and grams (a known food, see search_foods), or name and calories (a quick add).");
        }
        const log = getLog(day);
        saveLog({ ...log, entries: [...log.entries, entry] });
        deps.changed();
        return { added: entryOut(entry), day: { date: day, totals: sumEntries([...log.entries, entry]), targets: targetsOut() } };
      },
    },
    {
      name: "list_custom_foods",
      description: "The user's custom foods (their own labels), with ids, nutrition per 100 g and their serving.",
      inputSchema: { type: "object", properties: {} },
      handler: () => ({ foods: getCustomFoods().map(customOut) }),
    },
    {
      name: "create_custom_food",
      description:
        "Create a custom food from label values for one serving (stored per 100 g). Name, serving_grams and calories are required; micronutrients are optional per serving " +
        `(${MICRO_DEFS.map((m) => `${m.key} in ${m.unit}`).join(", ")}). Shows in the app's Foods list; log it with add_entry.`,
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Food name, up to 60 characters." },
          serving_label: { type: "string", description: 'The serving as the label says, e.g. "1 bar". Default "1 serving".' },
          serving_grams: { type: "number", description: `Grams in one serving, ${MIN_GRAMS} to ${MAX_GRAMS}.` },
          calories: { type: "number" },
          protein: { type: "number", description: "g per serving" },
          carbs: { type: "number", description: "g per serving" },
          fat: { type: "number", description: "g per serving" },
          fiber: { type: "number", description: "g per serving" },
          sugar: { type: "number", description: "g per serving" },
          micros: { type: "object", description: "Per serving, keyed by nutrient, e.g. {\"sodium\": 190}.", additionalProperties: { type: "number" } },
        },
        required: ["name", "serving_grams", "calories"],
      },
      handler: (a) => {
        const name = typeof a.name === "string" ? a.name.trim() : "";
        if (name.length < 1 || name.length > 60) throw new Error("name is required, 1 to 60 characters.");
        const servingGrams = numberArg(a.serving_grams, "serving_grams", { min: MIN_GRAMS, max: MAX_GRAMS, required: true })!;
        const perServing: Record<string, number | null | undefined> = { calories: numberArg(a.calories, "calories", { required: true })! };
        for (const k of ["protein", "carbs", "fat", "fiber", "sugar"] as const) perServing[k] = numberArg(a[k], k);
        if (a.micros !== undefined) {
          if (typeof a.micros !== "object" || a.micros === null || Array.isArray(a.micros)) throw new Error("micros must be an object like {\"sodium\": 190}.");
          for (const [k, v] of Object.entries(a.micros)) {
            if (!MICRO_DEFS.some((m) => m.key === k)) throw new Error(`"${k}" is not a micronutrient. Use: ${MICRO_DEFS.map((m) => m.key).join(", ")}.`);
            perServing[k] = numberArg(v, k);
          }
        }
        const food = buildCustomFood({ name, servingLabel: (typeof a.serving_label === "string" && a.serving_label.trim()) || "1 serving", servingGrams, perServing });
        if (!saveCustomFood(food)) throw new Error("Could not save: the browser's storage is full or unavailable.");
        deps.changed();
        return { created: customOut(food) };
      },
    },
    {
      name: "get_targets",
      description: "The user's daily targets (calories, protein, carbs, fat, fibre, sugar and micronutrients) as in effect, and which ones they set by hand.",
      inputSchema: { type: "object", properties: {} },
      handler: () => {
        const overrides = getTargetOverrides();
        const t = computeTargets(getProfile(), overrides);
        return { targets: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, r1(v)])), setByUser: Object.keys(overrides), profileSet: getProfile() !== null };
      },
    },
  ];
}

export function buildTools(deps: AiDeps): AppTool[] {
  return [...scanTools(deps), ...foodTools(deps)];
}
