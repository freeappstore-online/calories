import { describe, expect, it } from "vitest";
import { parseLabel } from "./labelParser";

// Samples are shaped like real Tesseract output: stray spaces, O/0 and l/1 confusion, dropped units.
const AU = `Rolled Oats
NUTRITION INFORMATION
Servings per package: 15
Serving size: 40g
Quantity Quantity
per Serving per 100g
Energy 612kJ 1530kJ
Protein 4.8 g 12.0 g
Fat, total 2.8 g 7.0 g
- saturated O.5 g 1.3 g
Carbohydrate 25.2 g 63.0 g
- sugars 0.4 g 1.0 g
Dietary fibre 4.0 g 10.0 g
Sodium 2 mg 5 mg`;

const AU_NOISY = `NUTRITION INFORMATION PANEL
Servings per package: 8
Serving size: 30 g (1/2 cup)
Average Quantity Average Quantity
per Serving per 100 g
Energy 480 kJ 1600 kJ
Protein 3.Og lO.Og
Fat, total 1,5g 5.Og
-saturated 0.3 g l.O g
Carbohydrate 20.1 g 67 g
- sugars 8.4 g 28 g
Dietary fibre 2.1g 7.0g
Sodium 90mg 300 mg`;

const EU = `Nutrition Declaration
Typical values per 100 g
Energy 1046 kJ / 250 kcal
Fat 11 g
of which saturates 4.5 g
Carbohydrate 28 g
of which sugars 5.2 g
Fibre 3.1 g
Protein 7,5 g
Salt 1.2 g`;

const EU_TWO = `Typical values per 100g per 30g serving
Energy 1046kJ/250kcal 314kJ/75kcal
Fat 11g 3.3g
of which saturates 4.5g 1.4g
Carbohydrate 28g 8.4g
of which sugars 5.2g 1.6g
Fibre 3.1g 0.9g
Protein 7.5g 2.3g
Salt 1.2g 0.36g`;

const US = `Nutrition Facts
8 servings per container
Serving size 1 bar (40g)
Amount per serving
Calories 200
% Daily Value*
Total Fat 8g 10%
Saturated Fat 1.5g 8%
Trans Fat 0g
Cholesterol Omg 0%
Sodium 160mg 7%
Total Carbohydrate 25g 9%
Dietary Fiber 3g 11%
Total Sugars 12g
Includes 10g Added Sugars 20%
Protein 6g
Vitamin D 2mcg 10%
Calcium 260mg 20%
Iron 1.1mg 6%
Potassium 240mg 5%`;

describe("parseLabel", () => {
  it("reads an AU/NZ panel, converting kJ and using per-100 g", () => {
    const r = parseLabel(AU);
    expect(r.name).toBe("Rolled Oats");
    expect(r.servingGrams).toBe(40);
    expect(r.values).toMatchObject({
      calories: Math.round((1530 / 4.184) * 0.4),
      protein: 4.8, fat: 2.8, satFat: 0.5, carbs: 25.2, sugar: 0.4, fiber: 4, sodium: 2,
    });
  });

  it("copes with OCR noise (O for 0, l for 1, comma decimals, missing spaces)", () => {
    const r = parseLabel(AU_NOISY);
    expect(r.servingGrams).toBe(30);
    expect(r.servingLabel).toBe("1/2 cup");
    expect(r.values.protein).toBe(3);
    expect(r.values.fat).toBe(1.5);
    expect(r.values.satFat).toBe(0.3);
    expect(r.values.carbs).toBe(20.1);
    expect(r.values.sodium).toBe(90);
    expect(r.values.calories).toBe(Math.round((1600 * 0.3) / 4.184));
  });

  it("reads an EU per-100 g label, kcal beside kJ, salt to sodium", () => {
    const r = parseLabel(EU);
    expect(r.servingGrams).toBe(100);
    expect(r.values).toMatchObject({
      calories: 250, fat: 11, satFat: 4.5, carbs: 28, sugar: 5.2, fiber: 3.1, protein: 7.5, sodium: 480,
    });
    expect(r.warnings.join(" ")).toMatch(/per 100 g/);
  });

  it("reads an EU two-column label using the serving grams", () => {
    const r = parseLabel(EU_TWO);
    expect(r.servingGrams).toBe(30);
    expect(r.values.calories).toBe(75);
    expect(r.values.fat).toBe(3.3);
    expect(r.values.sodium).toBe(144);
  });

  it("reads a US Nutrition Facts panel and ignores % daily values and added sugars", () => {
    const r = parseLabel(US);
    expect(r.servingGrams).toBe(40);
    expect(r.servingLabel).toBe("1 bar");
    expect(r.values).toEqual({
      calories: 200, fat: 8, satFat: 1.5, cholesterol: 0, sodium: 160, carbs: 25, fiber: 3, sugar: 12,
      protein: 6, vitaminD: 2, calcium: 260, iron: 1.1, potassium: 240,
    });
  });

  it("returns nothing useful for unrelated text", () => {
    const r = parseLabel("hello world\nthis is not a label");
    expect(r.values).toEqual({});
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

// Real Tesseract.js output (eng "fast" model) for rendered label images, including rotated and blurred variants.
const REAL: [string, string, Record<string, number>][] = [
  [
    "au",
    `NUTRITION INFORMATION
Serving size: 30 g
Quantity per Serving Quantity per 100g
Energy 470 kJ 1570 kJ
Protein 3.29 10.7g
Fat, total 1.99 6.3g
- saturated 0.4g 1.39
Carbohydrate 19.59 65.0 g
- sugars 48g 16.0g
Dietary fibre 2.49 8.0g
Sodium 135 mg 450 mg`,
    { calories: 112, protein: 3.2, fat: 1.9, satFat: 0.4, carbs: 19.5, sugar: 4.8, fiber: 2.4, sodium: 135 },
  ],
  [
    "au_rot",
    `NUTRITION INFORMATION
Servings per Package: 12
Serving size: 30 g
Quantity per Serving Quantity per 100 g
Energy 470 kJ 1570 kJ
Protein 3.2g 10.7 g
Fat, total 1.99 6.3g
- Saturated 0.4g 1.3g
Carbohydrate 19.5g 65.0g
- Sugars 48g 16.0g
Dietary fibre 2.4g 8.0g
Sodium 135 mg 450 mg
450 mg`,
    { calories: 112, protein: 3.2, fat: 1.9, satFat: 0.4, carbs: 19.5, sugar: 4.8, fiber: 2.4, sodium: 135 },
  ],
  [
    "eu",
    `Nutrition Declaration
Typical values per 100g _ per 30 g serving
Energy 1620 kJ /385 kcal 486 kJ/ 116 kcal
Fat 14g 4.29
of which saturates 6.19 1.8 9
Carbohydrate 52g 15.6 g
of which sugars 21g 6.3 g
Fibre 3.4g 1.0g
Protein 6.5g 2.0g
Salt 0.80 g 0.24 g`,
    { calories: 116, fat: 4.2, satFat: 1.8, carbs: 15.6, sugar: 6.3, fiber: 1, protein: 2, sodium: 96 },
  ],
  [
    "us",
    `Nutrition Facts
8 servings per container
Serving size 1 bar (40g)
AmountpersevingSSsS~C~CS<Sst
Calories 190
% Daily Value*
Total Fat 7g 9%
Saturated Fat 2g 10%
Trans Fat Og
Cholesterol Omg 0%
Sodium 150mg 7%
Total Carbohydrate 26g 9%
Dietary Fiber 4g 14%
Total Sugars 11g
Includes 9g Added Sugars 18%
Protein 5g
Vitamin D 1mcg 6%
Calcium 40mg 4%
Iron 1.8mg 10%
Potassium 210mg 4%`,
    { calories: 190, fat: 7, satFat: 2, cholesterol: 0, sodium: 150, carbs: 26, fiber: 4, sugar: 11, protein: 5, vitaminD: 1, calcium: 40, iron: 1.8, potassium: 210 },
  ],
  [
    "us_rot",
    `Nutrition Facts
8 servings per container
Serving size 1 bar (40g)
Amount per serving
Calories 190
% Daily Value*
Total Fat 79 9%
Saturated Fat 2g 10%
Trans Fat 0g
Cholesterol Omg 0%
Sodium 150mg 7%
Total Carbohydrate 269 9%
Dietary Fiber 4g 14%
Total Sugars 119
Includes 9g Added Sugars 18%
Protein 5g
Vitamin D 1mceg 6%
Calcium 40mg 4%
Iron 1.8mg 10%
Potassium 210mg 4%`,
    { calories: 190, fat: 7, satFat: 2, cholesterol: 0, sodium: 150, carbs: 26, fiber: 4, sugar: 11, protein: 5, vitaminD: 1, calcium: 40, iron: 1.8, potassium: 210 },
  ],
];

describe("parseLabel on real OCR output", () => {
  it.each(REAL)("%s", (_name, text, expected) => {
    const r = parseLabel(text);
    for (const [k, v] of Object.entries(expected)) {
      expect(r.values[k as keyof typeof r.values], k).toBeCloseTo(v, k === "calories" ? 0 : 1);
    }
  });
});
