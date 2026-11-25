#!/usr/bin/env node
// Generates web/src/data/foods.generated.ts and web/public/foods/*.webp from scripts/food-list.mjs.
//
// Nutrition: USDA FoodData Central (public domain, CC0) — FNDDS 2021-2023 survey foods, plus
//   SR Legacy for "sr:" rows. Download and unzip both CSV releases from
//   https://fdc.nal.usda.gov/download-datasets:
//     FoodData_Central_survey_food_csv_2024-10-31.zip
//     FoodData_Central_sr_legacy_food_csv_2018-04.zip
// Illustrations: Microsoft Fluent Emoji 3D (MIT), https://github.com/microsoft/fluentui-emoji,
//   fetched once and converted to 96px WebP with `cwebp` (brew install webp).
//
// Usage: node scripts/build-foods.mjs <fndds-csv-dir> <sr-legacy-csv-dir>

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { foodList } from "./food-list.mjs";

const [fnddsDir, srDir] = process.argv.slice(2);
if (!fnddsDir || !srDir) {
  console.error("usage: node scripts/build-foods.mjs <fndds-csv-dir> <sr-legacy-csv-dir>");
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseCsv(path) {
  const rows = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line) continue;
    const cells = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") { cells.push(cur); cur = ""; }
      else cur += c;
    }
    cells.push(cur);
    rows.push(cells);
  }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

// Output field → [SR Legacy nutrient id, FNDDS nutrient number]
const NUTRIENTS = {
  calories: ["1008", "208"],
  protein: ["1003", "203"],
  carbs: ["1005", "205"],
  fat: ["1004", "204"],
  fiber: ["1079", "291"],
  sugar: ["2000", "269"],
  satFat: ["1258", "606"],
  cholesterol: ["1253", "601"],
  sodium: ["1093", "307"],
  potassium: ["1092", "306"],
  calcium: ["1087", "301"],
  iron: ["1089", "303"],
  magnesium: ["1090", "304"],
  vitaminA: ["1106", "320"],
  vitaminC: ["1162", "401"],
  vitaminD: ["1114", "328"],
  vitaminB12: ["1178", "418"],
};
const MACROS = ["calories", "protein", "carbs", "fat", "fiber", "sugar"];

function loadSource(dir, nutrientCol) {
  const foods = parseCsv(join(dir, "food.csv"));
  const byDesc = new Map(foods.map((f) => [f.description, f.fdc_id]));
  const wanted = new Set(Object.values(NUTRIENTS).map((n) => n[nutrientCol]));
  const nutrients = new Map();
  for (const n of parseCsv(join(dir, "food_nutrient.csv"))) {
    if (!wanted.has(n.nutrient_id)) continue;
    if (!nutrients.has(n.fdc_id)) nutrients.set(n.fdc_id, {});
    nutrients.get(n.fdc_id)[n.nutrient_id] = Number(n.amount);
  }
  const units = existsSync(join(dir, "measure_unit.csv"))
    ? new Map(parseCsv(join(dir, "measure_unit.csv")).map((u) => [u.id, u.name]))
    : new Map();
  const portions = new Map();
  for (const p of parseCsv(join(dir, "food_portion.csv"))) {
    if (!portions.has(p.fdc_id)) portions.set(p.fdc_id, []);
    portions.get(p.fdc_id).push(p);
  }
  return { foods, byDesc, nutrients, units, portions, nutrientCol };
}

const fndds = loadSource(fnddsDir, 1);
const sr = loadSource(srDir, 0);

function round(value, field) {
  if (field === "calories") return Math.round(value);
  if (["cholesterol", "sodium", "potassium", "calcium", "magnesium"].includes(field) && value >= 10) {
    return Math.round(value);
  }
  return Math.round(value * 10) / 10;
}

function portionLabel(src, p) {
  if (src === fndds) return p.portion_description;
  const unit = src.units.get(p.measure_unit_id);
  const parts = [Number(p.amount).toString()];
  if (unit && unit !== "undetermined") parts.push(unit);
  if (p.modifier) parts.push(p.modifier);
  return parts.join(" ").replace(/\s+,/g, ",");
}

function servingsFor(src, fdcId) {
  const seen = new Set();
  const out = [];
  const list = (src.portions.get(fdcId) ?? []).sort((a, b) => Number(a.seq_num) - Number(b.seq_num));
  for (const p of list) {
    const label = portionLabel(src, p).trim();
    const grams = Math.round(Number(p.gram_weight) * 10) / 10;
    if (!label || !(grams > 0) || /quantity not specified|guideline amount/i.test(label)) continue;
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push({ label, grams });
    if (out.length === 4) break;
  }
  return out;
}

function suggest(src, desc) {
  const words = desc.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
  return src.foods
    .map((f) => ({ d: f.description, s: words.filter((w) => f.description.toLowerCase().includes(w)).length }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.d.length - b.d.length)
    .slice(0, 5)
    .map((x) => x.d);
}

const ids = new Set();
const errors = [];
const foods = [];
const servings = {};
for (const [id, name, category, rawDesc, illustration] of foodList) {
  if (ids.has(id)) errors.push(`duplicate id ${id}`);
  ids.add(id);
  const src = rawDesc.startsWith("sr:") ? sr : fndds;
  const desc = rawDesc.replace(/^sr:/, "");
  const fdcId = src.byDesc.get(desc);
  if (!fdcId) {
    errors.push(`${id}: no ${src === sr ? "SR Legacy" : "FNDDS"} food "${desc}"\n    try: ${suggest(src, desc).join(" | ")}`);
    continue;
  }
  const values = src.nutrients.get(fdcId) ?? {};
  const food = { id, name, category, image: illustration.toLowerCase().replace(/ /g, "_"), fdcId: Number(fdcId) };
  for (const [field, cols] of Object.entries(NUTRIENTS)) {
    const v = values[cols[src.nutrientCol]];
    if (v === undefined && MACROS.includes(field) && field !== "sugar" && field !== "fiber") {
      errors.push(`${id}: missing ${field}`);
    }
    food[field] = v === undefined ? (MACROS.includes(field) ? 0 : null) : round(v, field);
  }
  foods.push(food);
  const s = servingsFor(src, fdcId);
  if (s.length) servings[id] = s;
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const out = `// GENERATED by scripts/build-foods.mjs from scripts/food-list.mjs — do not edit by hand.
// Nutrition: USDA FoodData Central (FNDDS 2021-2023 / SR Legacy), public domain. Values per 100 g.
import type { FoodItem, ServingSize } from "./types";

export const foods: FoodItem[] = [
${foods.map((f) => `  ${JSON.stringify(f)},`).join("\n")}
];

export const servingSizes: Record<string, ServingSize[]> = {
${Object.entries(servings).map(([id, s]) => `  ${JSON.stringify(id)}: ${JSON.stringify(s)},`).join("\n")}
};
`;
writeFileSync(join(root, "web/src/data/foods.generated.ts"), out);
console.log(`wrote ${foods.length} foods, ${Object.keys(servings).length} with servings`);

// Illustrations
const imgDir = join(root, "web/public/foods");
mkdirSync(imgDir, { recursive: true });
const names = [...new Set(foodList.map((f) => f[4]))];
for (const name of names) {
  const slug = name.toLowerCase().replace(/ /g, "_");
  const dest = join(imgDir, `${slug}.webp`);
  if (existsSync(dest)) continue;
  const url = `https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/${encodeURIComponent(name)}/3D/${slug}_3d.png`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`illustration "${name}": HTTP ${res.status} ${url}`);
  const png = join(tmpdir(), `${slug}_3d.png`);
  writeFileSync(png, Buffer.from(await res.arrayBuffer()));
  execFileSync("cwebp", ["-quiet", "-q", "82", "-alpha_q", "90", "-resize", "96", "96", png, "-o", dest]);
}
console.log(`illustrations: ${names.length} in web/public/foods`);
