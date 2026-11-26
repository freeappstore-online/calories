// Open Food Facts lookup by barcode: no key, no account. Only the barcode is sent. Data is ODbL (shown with attribution).

import { MAX_CUSTOM_VALUE, MAX_GRAMS, MIN_GRAMS } from "../customFoods";

export const OFF_ATTRIBUTION = { text: "Data from Open Food Facts (ODbL)", url: "https://world.openfoodfacts.org/" };

const FIELDS = "code,product_name,brands,quantity,serving_size,serving_quantity,nutriments,image_front_small_url";
/** Names the app to Open Food Facts, as they ask API users to; carries no personal information */
const USER_AGENT = "FreeAppStore-Calories/1.0";
const CACHE_KEY = "calories_off_cache";
const CACHE_LIMIT = 100;

/** A product as the Create food form takes it: values per serving, keyed like the form's fields */
export interface OffFood {
  barcode: string;
  name: string;
  servingLabel: string;
  servingGrams: number;
  /** Per serving; calories is absent when Open Food Facts has no energy value for the product */
  values: Record<string, number>;
}

type Nutriments = Record<string, unknown>;
interface OffProduct {
  product_name?: unknown;
  brands?: unknown;
  serving_size?: unknown;
  serving_quantity?: unknown;
  nutriments?: Nutriments;
}

/** Open Food Facts keeps every nutrient in grams per 100 g (kcal for energy); these are the form's fields and how to convert to them */
const MAPPED: { key: string; off: string; factor: number }[] = [
  { key: "protein", off: "proteins_100g", factor: 1 },
  { key: "carbs", off: "carbohydrates_100g", factor: 1 },
  { key: "fat", off: "fat_100g", factor: 1 },
  { key: "fiber", off: "fiber_100g", factor: 1 },
  { key: "sugar", off: "sugars_100g", factor: 1 },
  { key: "satFat", off: "saturated-fat_100g", factor: 1 },
  { key: "cholesterol", off: "cholesterol_100g", factor: 1000 },
  { key: "potassium", off: "potassium_100g", factor: 1000 },
  { key: "calcium", off: "calcium_100g", factor: 1000 },
  { key: "iron", off: "iron_100g", factor: 1000 },
  { key: "magnesium", off: "magnesium_100g", factor: 1000 },
  { key: "vitaminA", off: "vitamin-a_100g", factor: 1e6 },
  { key: "vitaminC", off: "vitamin-c_100g", factor: 1000 },
  { key: "vitaminD", off: "vitamin-d_100g", factor: 1e6 },
  { key: "vitaminB12", off: "vitamin-b12_100g", factor: 1e6 },
];

const KJ_PER_KCAL = 4.184;
/** Grams of sodium are 40% of the salt */
const SODIUM_MG_PER_SALT_G = 400;

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
};
const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Per 100 g values from OFF nutriments, in the form's units (calories kcal, sodium mg, ...), leaving out what it does not have */
export function per100g(n: Nutriments): Record<string, number> {
  const out: Record<string, number> = {};
  const kcal = num(n["energy-kcal_100g"]);
  const kj = num(n["energy-kj_100g"]) ?? num(n["energy_100g"]);
  if (kcal !== undefined) out["calories"] = kcal;
  else if (kj !== undefined) out["calories"] = kj / KJ_PER_KCAL;
  for (const { key, off, factor } of MAPPED) {
    const v = num(n[off]);
    if (v !== undefined) out[key] = v * factor;
  }
  const sodium = num(n["sodium_100g"]);
  const salt = num(n["salt_100g"]);
  if (sodium !== undefined) out["sodium"] = sodium * 1000;
  else if (salt !== undefined) out["sodium"] = salt * SODIUM_MG_PER_SALT_G;
  // Float noise from the unit conversions (418.4 kJ is 99.99999999999999 kcal) is not data
  for (const k of Object.keys(out)) out[k] = round(out[k]!, 6);
  return out;
}

/** The food for the form from an OFF product, or null when it has no name. Values are per serving when OFF gives a serving in grams, else per 100 g. */
export function mapProduct(barcode: string, p: OffProduct): OffFood | null {
  const base = typeof p.product_name === "string" ? p.product_name.trim() : "";
  if (!base) return null;
  const brand = typeof p.brands === "string" ? p.brands.split(",")[0]!.trim() : "";
  const name = (brand && !base.toLowerCase().includes(brand.toLowerCase()) ? `${base} (${brand})` : base).slice(0, 60);

  const grams = num(p.serving_quantity);
  const serving = grams !== undefined && grams >= MIN_GRAMS && grams <= MAX_GRAMS;
  const servingGrams = serving ? grams : 100;
  const label = serving && typeof p.serving_size === "string" && p.serving_size.trim() ? p.serving_size.trim().slice(0, 40) : `${servingGrams} g`;

  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(per100g(p.nutriments ?? {}))) {
    const scaled = round((v * servingGrams) / 100, 2);
    // A value the form could not save is a data error in OFF: leave the field for the user rather than fill it
    if (scaled <= MAX_CUSTOM_VALUE) values[k] = scaled;
  }
  return { barcode, name, servingLabel: label, servingGrams, values };
}

// ── Local cache of what Open Food Facts said, so a product seen once resolves offline ──

type Cache = Record<string, { at: number; food: OffFood }>;

function readCache(): Cache {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Cache) : {};
  } catch {
    return {};
  }
}

export const cachedProduct = (barcode: string): OffFood | undefined => readCache()[barcode]?.food;

function cacheProduct(food: OffFood) {
  const cache = readCache();
  cache[food.barcode] = { at: Date.now(), food };
  const newest = Object.entries(cache).sort((a, b) => b[1].at - a[1].at).slice(0, CACHE_LIMIT);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch {
    // The cache is only a convenience; a full store just means the next lookup goes online
  }
}

export type LookupResult =
  | { status: "found"; food: OffFood; fromCache: boolean }
  | { status: "not-found" }
  | { status: "offline" }
  | { status: "error"; message: string };

/** One lookup at a time keeps a stream of detections far below Open Food Facts' product read limit (about 100 a minute) */
let inFlight: Promise<LookupResult> | null = null;

/** Look a barcode up: this device's cache first, then Open Food Facts */
export function lookupBarcode(barcode: string, fetchImpl: typeof fetch = fetch): Promise<LookupResult> {
  const cached = cachedProduct(barcode);
  if (cached) return Promise.resolve({ status: "found", food: cached, fromCache: true });
  if (inFlight) return inFlight.then(() => lookupBarcode(barcode, fetchImpl));
  const run = fetchProduct(barcode, fetchImpl).finally(() => {
    inFlight = null;
  });
  inFlight = run;
  return run;
}

async function fetchProduct(barcode: string, fetchImpl: typeof fetch): Promise<LookupResult> {
  let res: Response;
  try {
    res = await fetchImpl(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`, {
      headers: { "X-User-Agent": USER_AGENT },
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    return { status: "offline" };
  }
  // The API answers an unknown product with status 0, or (on some paths) with a 404 and the same body
  if (res.status === 404) return { status: "not-found" };
  if (!res.ok) return { status: "error", message: `Open Food Facts answered ${res.status}.` };
  let body: { status?: number; product?: OffProduct };
  try {
    body = await res.json();
  } catch {
    return { status: "error", message: "Open Food Facts sent something unreadable." };
  }
  if (body.status !== 1 || !body.product) return { status: "not-found" };
  const food = mapProduct(barcode, body.product);
  if (!food) return { status: "not-found" };
  cacheProduct(food);
  return { status: "found", food, fromCache: false };
}
