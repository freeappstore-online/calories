// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasValidCheckDigit, normalizeBarcode, upcEToUpcA } from "./gtin";
import { cachedProduct, lookupBarcode, mapProduct, per100g } from "./off";

const here = dirname(fileURLToPath(import.meta.url));
/** Responses recorded from https://world.openfoodfacts.org on 2026-11-27 (fields as the app asks for them) */
const recorded = (name: string) => JSON.parse(readFileSync(join(here, "fixtures", `${name}.json`), "utf8"));

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}
beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

describe("barcode numbers", () => {
  it("checks the GTIN check digit", () => {
    expect(hasValidCheckDigit("4006381333931")).toBe(true);
    expect(hasValidCheckDigit("4006381333932")).toBe(false);
    expect(hasValidCheckDigit("96385074")).toBe(true);
  });

  it("gives EAN-13 for EAN-13 and UPC-A, EAN-8 as it is, and rejects bad numbers", () => {
    expect(normalizeBarcode("3017620422003")).toBe("3017620422003");
    expect(normalizeBarcode("036000291452")).toBe("0036000291452");
    expect(normalizeBarcode("96385074")).toBe("96385074");
    expect(normalizeBarcode(" 3017620422003\n")).toBe("3017620422003");
    expect(normalizeBarcode("3017620422004")).toBeNull();
    expect(normalizeBarcode("12345")).toBeNull();
    expect(normalizeBarcode("30176204220a3")).toBeNull();
  });

  it("expands UPC-E to the UPC-A (and EAN-13) it stands for", () => {
    expect(upcEToUpcA("01234565")).toBe("012345000065");
    expect(upcEToUpcA("04252614")).toBe("042100005264");
    expect(normalizeBarcode("04252614")).toBe("0042100005264");
    expect(normalizeBarcode("01234566")).toBeNull();
  });
});

describe("Open Food Facts nutriment mapping", () => {
  it("maps a product without a serving to per 100 g, reading sodium and ignoring estimated values", () => {
    const food = mapProduct("3017620422003", recorded("nutella").product)!;
    expect(food).toMatchObject({ barcode: "3017620422003", name: "Nutella (Ferrero)", servingLabel: "100 g", servingGrams: 100 });
    expect(food.values).toEqual({ calories: 539, protein: 6.3, carbs: 57.5, fat: 30.9, fiber: 0, sugar: 56.3, satFat: 10.6, sodium: 42.8 });
  });

  it("scales to the serving OFF gives", () => {
    const food = mapProduct("8076800195057", recorded("barilla").product)!;
    expect(food.name).toBe("Spaghetti Nº5 (Barilla)");
    expect(food).toMatchObject({ servingLabel: "1 serving (85 g)", servingGrams: 85 });
    expect(food.values.calories).toBeCloseTo(305.15, 2);
    expect(food.values.sodium).toBeCloseTo(3.4, 2);
    expect(food.values.fiber).toBeCloseTo(2.55, 2);
    expect(food.values.satFat).toBeCloseTo(0.43, 2);
  });

  it("uses kJ when there is no kcal, and salt when there is no sodium", () => {
    expect(per100g({ "energy-kj_100g": 1000, salt_100g: 1 })).toEqual({ calories: 239.005736, sodium: 400 });
    expect(per100g({ energy_100g: 418.4 })).toEqual({ calories: 100 });
    expect(per100g({ "energy-kcal_100g": 50, "energy-kj_100g": 999, sodium_100g: 0.1, salt_100g: 9 })).toEqual({ calories: 50, sodium: 100 });
  });

  it("converts grams to the form's units for the micronutrients", () => {
    expect(per100g({ cholesterol_100g: 0.02, potassium_100g: 0.3, calcium_100g: 0.12, iron_100g: 0.0014, magnesium_100g: 0.03, "vitamin-a_100g": 0.0008, "vitamin-c_100g": 0.06, "vitamin-d_100g": 0.000005, "vitamin-b12_100g": 0.0000024 })).toEqual({
      cholesterol: 20, potassium: 300, calcium: 120, iron: 1.4, magnesium: 30, vitaminA: 800, vitaminC: 60, vitaminD: 5, vitaminB12: 2.4,
    });
  });

  it("leaves out missing, negative, non-numeric and absurd values, and keeps a string number", () => {
    const food = mapProduct("1", { product_name: "Odd", nutriments: { "energy-kcal_100g": "120", proteins_100g: -3, fat_100g: "n/a", carbohydrates_100g: 99999999 } })!;
    expect(food.values).toEqual({ calories: 120 });
  });

  it("has no calories when OFF has no energy, and no food when it has no name", () => {
    expect(mapProduct("1", { product_name: "Mystery", nutriments: { proteins_100g: 3 } })!.values).toEqual({ protein: 3 });
    expect(mapProduct("1", { product_name: "  ", nutriments: { "energy-kcal_100g": 1 } })).toBeNull();
  });

  it("ignores an unusable serving and a brand already in the name, and keeps the name within 60 characters", () => {
    expect(mapProduct("1", { product_name: "Acme Oats", brands: "ACME, Other", serving_quantity: 0, nutriments: {} })).toMatchObject({ name: "Acme Oats", servingGrams: 100 });
    expect(mapProduct("1", { product_name: "x".repeat(80), brands: "B", nutriments: {} })!.name).toHaveLength(60);
  });
});

describe("lookupBarcode", () => {
  const respond = (body: unknown, status = 200) => vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify(body), { status }));

  it("asks Open Food Facts for the barcode only, with no credentials or referrer, then answers from the cache", async () => {
    const fetchMock = respond(recorded("nutella"));
    const r = await lookupBarcode("3017620422003", fetchMock as unknown as typeof fetch);
    expect(r).toMatchObject({ status: "found", fromCache: false, food: { name: "Nutella (Ferrero)" } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/3017620422003\.json\?fields=code,product_name,/);
    expect(init).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer", headers: { "X-User-Agent": expect.stringMatching(/^FreeAppStore-Calories\/\d/) } });
    expect(cachedProduct("3017620422003")?.name).toBe("Nutella (Ferrero)");

    const again = vi.fn(async () => {
      throw new TypeError("offline");
    });
    expect(await lookupBarcode("3017620422003", again as unknown as typeof fetch)).toMatchObject({ status: "found", fromCache: true });
    expect(again).not.toHaveBeenCalled();
  });

  it("reports not found for status 0 and for a 404, and does not cache it", async () => {
    expect(await lookupBarcode("0000000000017", respond(recorded("notfound")) as unknown as typeof fetch)).toEqual({ status: "not-found" });
    expect(await lookupBarcode("0000000000024", respond({ status: 0 }, 404) as unknown as typeof fetch)).toEqual({ status: "not-found" });
    expect(cachedProduct("0000000000017")).toBeUndefined();
  });

  it("reports offline when the request fails, and an error on a server fault or a broken body", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await lookupBarcode("5449000000996", offline as unknown as typeof fetch)).toEqual({ status: "offline" });
    expect(await lookupBarcode("5449000000996", respond({}, 503) as unknown as typeof fetch)).toMatchObject({ status: "error" });
    const html = vi.fn(async () => new Response("<html>", { status: 200 }));
    expect(await lookupBarcode("5449000000996", html as unknown as typeof fetch)).toMatchObject({ status: "error" });
  });

  it("makes one request at a time", async () => {
    let open = 0;
    let most = 0;
    const slow = vi.fn(async () => {
      most = Math.max(most, ++open);
      await new Promise((r) => setTimeout(r, 5));
      open--;
      return new Response(JSON.stringify({ status: 0 }), { status: 200 });
    });
    await Promise.all([lookupBarcode("0000000000031", slow as unknown as typeof fetch), lookupBarcode("0000000000048", slow as unknown as typeof fetch)]);
    expect(slow).toHaveBeenCalledTimes(2);
    expect(most).toBe(1);
  });
});

describe("self-hosted barcode reader", () => {
  it("public/zxing/zxing_reader.wasm is the pinned package's file", () => {
    const web = join(here, "..", "..", "..");
    const hash = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
    expect(hash(join(web, "public", "zxing", "zxing_reader.wasm"))).toBe(hash(join(web, "node_modules", "zxing-wasm", "dist", "reader", "zxing_reader.wasm")));
    expect(JSON.parse(readFileSync(join(web, "package.json"), "utf8")).devDependencies["zxing-wasm"]).toBe("3.1.8");
  });
});
