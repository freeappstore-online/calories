import type { MicroKey } from "../data/types";

/** Form fields a label scan can fill (all per serving, units as in the form) */
export type LabelField = "calories" | "protein" | "carbs" | "fat" | "fiber" | "sugar" | MicroKey;

export interface LabelScan {
  name?: string;
  /** Serving description such as "1 bar"; absent when the label only gives grams */
  servingLabel?: string;
  servingGrams?: number;
  /** Values per serving of `servingGrams` (per 100 g when no serving size was found) */
  values: Partial<Record<LabelField, number>>;
  /** Things the user should double check */
  warnings: string[];
}

type Unit = "g" | "mg" | "ug" | "kj" | "kcal" | "iu" | "";

interface Token {
  value: number;
  unit: Unit;
}

/** Display units of each field, the unit values are converted to */
const FIELD_UNIT: Record<string, Unit> = {
  protein: "g", carbs: "g", fat: "g", fiber: "g", sugar: "g", satFat: "g",
  cholesterol: "mg", sodium: "mg", potassium: "mg", calcium: "mg", iron: "mg", magnesium: "mg",
  vitaminA: "ug", vitaminC: "mg", vitaminD: "ug", vitaminB12: "ug",
};

type Key = LabelField | "energy" | "salt" | null;

/** Order matters: earlier patterns claim their text first, so "saturated fat" never reaches the fat pattern */
const KEYWORDS: { key: Key; re: RegExp }[] = [
  { key: null, re: /calories\s+from\s+fat/gi },
  { key: null, re: /(?:includes?\s+[\d.,oO]+\s*g\s+)?added\s+sugars?/gi },
  { key: null, re: /\b(?:trans|poly\s*-?\s*unsaturated|mono\s*-?\s*unsaturated|unsaturated)(?:\s+fat)?\b/gi },
  { key: "satFat", re: /\b(?:saturat\w*|sat\.?)(?:\s+fats?)?/gi },
  { key: "energy", re: /\b(?:energy|calories)\b/gi },
  { key: "protein", re: /\bprotein/gi },
  { key: "carbs", re: /\b(?:total\s+)?carbohydrates?(?:\s*,?\s*total)?|\bcarbs\b/gi },
  { key: "sugar", re: /\b(?:total\s+)?sugars?\b/gi },
  { key: "fiber", re: /\b(?:dietary\s+)?fib(?:re|er)\b/gi },
  { key: "fat", re: /\b(?:total\s+)?fats?\b(?:\s*,?\s*total)?/gi },
  { key: "cholesterol", re: /\bcholesterol/gi },
  { key: "sodium", re: /\bsodium/gi },
  { key: "salt", re: /\bsalt\b/gi },
  { key: "potassium", re: /\bpotassium/gi },
  { key: "calcium", re: /\bcalcium/gi },
  { key: "iron", re: /\biron\b/gi },
  { key: "magnesium", re: /\bmagnesium/gi },
  { key: "vitaminA", re: /\bvit(?:amin|\.)?\s*a\b/gi },
  { key: "vitaminC", re: /\bvit(?:amin|\.)?\s*c\b/gi },
  { key: "vitaminD", re: /\bvit(?:amin|\.)?\s*d\d?\b/gi },
  { key: "vitaminB12", re: /\bvit(?:amin|\.)?\s*b\s*-?\s*12\b/gi },
];

const TOKEN_RE =
  /(?<![A-Za-z0-9])([0-9OoIl|][0-9OoIl|]*(?:[.,][0-9OoIl|]+)?)\s*(kj|k[dli]|kcal|cal|mg|m(?:c|e|ce)g|[µμu]g|iu|g|%)?(?![A-Za-z0-9])/gi;

function toUnit(raw: string | undefined): Unit | "%" {
  const u = (raw ?? "").toLowerCase();
  if (u === "") return "";
  if (u === "%") return "%";
  if (u === "kj" || /^k[dli]$/.test(u)) return "kj";
  if (u === "kcal" || u === "cal") return "kcal";
  if (u === "mg") return "mg";
  if (u === "g") return "g";
  if (u === "iu") return "iu";
  return "ug";
}

/** "1,046" is a thousand, "0,5" and "4,2" are decimals */
function parseNumber(raw: string): number | null {
  let s = raw.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1");
  if (!/\d/.test(s)) return null;
  if (/^[1-9]\d{0,2},\d{3}$/.test(s)) s = s.replace(",", "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Fast-model OCR often reads the "g" after a number as 9 ("3.2g" becomes "3.29", "7g" becomes "79") */
function stripGramNine(raw: string): string {
  return /^\d+\.\d+9$/.test(raw) || /^[1-9]\d*9$/.test(raw) && raw.length > 1 ? raw.slice(0, -1) : raw;
}

function tokenize(text: string, gramField = false): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[1]!;
    const unit = toUnit(m[2]);
    if (unit === "%") continue;
    // Letters that only look like digits count when a unit follows ("O g" is zero grams) or when mixed with real digits
    if (!/\d/.test(raw) && !(unit !== "" && /^[Oo]+$/.test(raw))) continue;
    const value = parseNumber(unit === "" && gramField ? stripGramNine(raw) : raw);
    if (value !== null) out.push({ value, unit });
  }
  return out;
}

/** Convert a token to the field's unit; null when the unit makes no sense for the field (e.g. IU) */
function convert(t: Token, target: Unit): number | null {
  if (t.unit === "" || t.unit === target) return t.value;
  const perMg: Partial<Record<Unit, number>> = { g: 1000, mg: 1, ug: 0.001 };
  const from = perMg[t.unit];
  const to = perMg[target];
  if (from === undefined || to === undefined) return null;
  return (t.value * from) / to;
}

interface Segment {
  key: Key;
  text: string;
}

/** Split one line at every nutrient keyword; each segment holds the text up to the next keyword */
function segments(line: string): Segment[] {
  const claimed: { start: number; end: number; key: Key }[] = [];
  for (const { key, re } of KEYWORDS) {
    re.lastIndex = 0;
    for (const m of line.matchAll(re)) {
      const start = m.index!;
      const end = start + m[0].length;
      if (claimed.some((c) => start < c.end && end > c.start)) continue;
      claimed.push({ start, end, key });
    }
  }
  claimed.sort((a, b) => a.start - b.start);
  return claimed.map((c, i) => ({ key: c.key, text: line.slice(c.end, claimed[i + 1]?.start ?? line.length) }));
}

/** Grams (or mL, taken as grams) of one serving and an optional friendly label */
function findServing(text: string): { grams?: number; label?: string } {
  const tidy = (s: string) => s.replace(/[:()\-–—]/g, " ").replace(/\s+/g, " ").trim();
  const num = "([0-9OolI]+(?:[.,][0-9]+)?)";
  const unit = "\\s*(?:g|ml)\\b";
  const grams = (s: string) => parseNumber(s);

  const size = text.match(new RegExp(`serv(?:ing|e)\\s*size\\s*:?\\s*([^\\n]*)`, "i"));
  if (size) {
    const rest = size[1]!;
    // "1 bar (40g)" or "2 biscuits (30 g)": label before the parenthesis, grams inside it
    const paren = rest.match(new RegExp(`^(.*?)\\(\\s*${num}${unit}[^)]*\\)`, "i"));
    if (paren) {
      const label = tidy(paren[1]!);
      return { grams: grams(paren[2]!) ?? undefined, label: /[A-Za-z]/.test(label) ? label : undefined };
    }
    // "40g (1/2 cup)" or "40 g"
    const lead = rest.match(new RegExp(`^\\s*${num}${unit}\\s*(?:\\(([^)]*)\\))?`, "i"));
    if (lead) {
      const label = tidy(lead[2] ?? "");
      return { grams: grams(lead[1]!) ?? undefined, label: /[A-Za-z]/.test(label) ? label : undefined };
    }
  }
  const per = text.match(new RegExp(`per\\s+${num}${unit}\\s*(?:serv|portion)`, "i")) ??
    text.match(new RegExp(`(?:serv(?:ing|e)|portion)\\s*\\(?\\s*${num}${unit}`, "i")) ??
    text.match(new RegExp(`${num}${unit}\\s*(?:serving|portion)`, "i"));
  return per ? { grams: grams(per[1]!) ?? undefined } : {};
}

const NOT_NAME = /nutri|facts|inform|serv|per\s|ingredient|quantity|average|amount|energy|calorie|panel|%|\d/i;

/** Product name: the first plain line above the panel, if any */
function findName(lines: string[]): string | undefined {
  for (const line of lines) {
    if (/nutri|serving|quantity|per\s*100|amount|energy|calories/i.test(line)) return undefined;
    const t = line.trim();
    if (t.length >= 3 && t.length <= 40 && /^[A-Za-z][A-Za-z '&-]+$/.test(t) && !NOT_NAME.test(t)) return t;
  }
  return undefined;
}

type Columns = Partial<Record<LabelField, number[]>>;

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Parse OCR text of a nutrition label into per-serving form values */
export function parseLabel(text: string): LabelScan {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const joined = lines.join("\n");
  const warnings: string[] = [];

  // Column order from the header: per serving vs per 100 g
  const servIdx = joined.search(/per\s+(?:serving|serve|portion|\d+\s*g\s+serving)/i);
  const hundredIdx = joined.search(/per\s*100\s*(?:g|ml)|\b100\s*(?:g|ml)\b/i);
  const cols: ("serving" | "per100")[] =
    servIdx >= 0 && hundredIdx >= 0
      ? servIdx < hundredIdx ? ["serving", "per100"] : ["per100", "serving"]
      : [hundredIdx >= 0 && servIdx < 0 ? "per100" : "serving"];

  const columns: Columns = {};
  let kj: number[] = [];
  let kcal: number[] = [];
  let salt: number[] = [];
  let lastKey: Key = null;

  for (const line of lines) {
    const segs = segments(line);
    if (segs.length === 0) {
      // Energy sometimes wraps: "Energy 1046 kJ" then "250 kcal"
      if (lastKey === "energy" && kcal.length === 0) {
        const t = tokenize(line).filter((x) => x.unit === "kcal");
        if (t.length) kcal = t.map((x) => x.value);
      }
      continue;
    }
    for (const seg of segs) {
      lastKey = seg.key;
      if (!seg.key) continue;
      const gramField = FIELD_UNIT[seg.key] === "g" || seg.key === "salt";
      const tokens = tokenize(seg.text, gramField);
      if (seg.key === "energy") {
        const bare = tokens.filter((t) => t.unit === "");
        const k = tokens.filter((t) => t.unit === "kcal").map((t) => t.value);
        const j = tokens.filter((t) => t.unit === "kj").map((t) => t.value);
        // US "Calories 200": a bare number is kcal
        if (k.length) kcal = kcal.length ? kcal : k;
        else if (j.length === 0 && bare.length) kcal = kcal.length ? kcal : bare.map((t) => t.value);
        if (j.length && kj.length === 0) kj = j;
        continue;
      }
      // A stray unit-less number beyond the expected columns is usually a misread % value
      const withUnit = tokens.filter((t) => t.unit !== "");
      const use = tokens.length > cols.length && withUnit.length ? withUnit : tokens;
      if (seg.key === "salt") {
        if (salt.length === 0) salt = use.map((t) => convert(t, "g")).filter((v): v is number => v !== null);
        continue;
      }
      if (columns[seg.key]) continue;
      const target = FIELD_UNIT[seg.key] ?? "g";
      const vals = use.map((t) => convert(t, target)).filter((v): v is number => v !== null);
      if (vals.length) columns[seg.key] = vals.slice(0, cols.length);
    }
  }

  if (kcal.length) columns.calories = kcal.slice(0, cols.length);
  else if (kj.length) columns.calories = kj.slice(0, cols.length).map((v) => v / 4.184);
  if (!columns.sodium && salt.length) columns.sodium = salt.slice(0, cols.length).map((g) => g * 400);

  // Serving size
  const serving = findServing(joined);
  const grams = serving.grams && serving.grams > 0 ? serving.grams : undefined;

  // One basis for everything: per 100 g when the label has it (cross-checked against the serving column), else per serving
  const servCol = cols.indexOf("serving");
  const hundredCol = cols.indexOf("per100");
  const entries = Object.entries(columns) as [LabelField, number[]][];
  const at = (vals: number[], col: number) => (col >= 0 ? vals[col] : undefined);
  const values: Partial<Record<LabelField, number>> = {};
  for (const [field, vals] of entries) {
    const s = at(vals, servCol);
    const h = at(vals, hundredCol);
    let perServing: number | undefined;
    if (h !== undefined && grams) {
      // The per-100 g figure is the more precise; keep the printed per-serving number when it agrees, so values match the label
      const scaled = (h * grams) / 100;
      perServing = s !== undefined && Math.abs(s - scaled) <= Math.max(0.15 * scaled, 0.1) ? s : scaled;
    }
    else if (h !== undefined) perServing = h; // no serving size: treat the serving as 100 g
    else if (s !== undefined) perServing = s;
    else if (vals[0] !== undefined) perServing = vals[0];
    if (perServing === undefined) continue;
    values[field] = field === "calories" ? Math.round(perServing) : round(perServing, 2);
  }

  const scan: LabelScan = { values, warnings };
  if (grams) scan.servingGrams = grams;
  else if (hundredCol >= 0) scan.servingGrams = 100;
  if (serving.label) scan.servingLabel = serving.label;
  const name = findName(lines);
  if (name) scan.name = name;

  if (!grams && hundredCol < 0) warnings.push("No serving size in grams was found. Check the serving size.");
  if (!grams && hundredCol >= 0) warnings.push("No serving size was found, so values are per 100 g.");
  if (values.calories === undefined) warnings.push("Calories were not read.");
  return scan;
}
