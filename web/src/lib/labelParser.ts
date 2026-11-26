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
  /** Fields whose per-serving and per-100 g figures disagree */
  conflicts: LabelField[];
  /** Where on the label each value came from (the nutrient's name and the figure read) */
  sources: Partial<Record<SourceKey, FieldSource>>;
}

/** A character range of one text line (line numbers count the non-empty lines passed in) */
export interface Span {
  line: number;
  start: number;
  end: number;
}

export type SourceKey = LabelField | "name" | "servingGrams" | "servingLabel";

export interface FieldSource {
  /** The printed name first, then the figure the value was taken from */
  spans: Span[];
  /** Which table column the figure was in, when the label has two */
  column?: "serving" | "per100";
}

type Unit = "g" | "mg" | "ug" | "kj" | "kcal" | "iu" | "";

interface Token {
  value: number;
  unit: Unit;
  /** Printed as "<1": value is half the stated limit */
  lt?: boolean;
  /** Character range of the figure in the text it was read from */
  start: number;
  end: number;
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
  { key: "protein", re: /\bprot[a-z]{0,2}[nm]\b/gi },
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

/** Groups: 1 "<", 2 number, 3 "Nil" (as OCR reads it), 4 unit */
const TOKEN_RE =
  /(?<![A-Za-z0-9])(<\s*)?(?:([0-9OoIl|§][0-9OoIl|§]*(?:[.,][0-9OoIl|§]+)?)|(n[iIl1|][iIl1|]))\s*(kj|k[dli]|kcal|cal|m(?:c|e|ce)?g?|[µμu]g|iu|g|%)?(?![A-Za-z0-9])/gi;

function toUnit(raw: string | undefined): Unit | "%" {
  const u = (raw ?? "").toLowerCase();
  if (u === "") return "";
  if (u === "%") return "%";
  if (u === "kj" || /^k[dli]$/.test(u)) return "kj";
  if (u === "kcal" || u === "cal") return "kcal";
  if (u === "mg" || u === "m") return "mg";
  if (u === "g") return "g";
  if (u === "iu") return "iu";
  return "ug";
}

/** "1,046" is a thousand, "0,5" and "4,2" are decimals */
function parseNumber(raw: string): number | null {
  let s = raw.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/§/g, "5");
  if (!/\d/.test(s)) return null;
  if (/^[1-9]\d{0,2},\d{3}$/.test(s)) s = s.replace(",", "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fast-model OCR often reads the "g" after a number as 9 ("3.2g" becomes "3.29", "7g" becomes "79").
 * `all`: also whole numbers, which is only safe where units are printed beside the numbers; a real "19" must survive elsewhere.
 */
function stripGramNine(rawText: string, all: boolean): string {
  const raw = rawText.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/§/g, "5");
  if (/^\d+\.\d+9$/.test(raw)) return raw.slice(0, -1);
  return all && /^[1-9]\d*9$/.test(raw) && raw.length > 1 ? raw.slice(0, -1) : raw;
}

type Strip = "none" | "decimal" | "all";

/** `strip`: how far to repair a unit-less gram value whose "g" was misread as 9 */
function tokenize(text: string, strip: Strip = "none"): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const unit = toUnit(m[4]);
    if (unit === "%") continue;
    const start = m.index!;
    const end = start + m[0].length;
    if (m[3]) {
      out.push({ value: 0, unit, start, end });
      continue;
    }
    const raw = m[2]!;
    // Letters that only look like digits count when a unit follows ("O g" is zero grams) or when mixed with real digits
    if (!/\d/.test(raw) && !(unit !== "" && /^[Oo]+$/.test(raw))) continue;
    const value = parseNumber(unit === "" && strip !== "none" ? stripGramNine(raw, strip === "all") : raw);
    if (value === null) continue;
    out.push(m[1] ? { value: value / 2, unit, lt: true, start, end } : { value, unit, start, end });
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
  /** The keyword as printed ("Energy", "Calories") */
  word: string;
  text: string;
  /** Where the keyword starts in the line, and where `text` starts */
  wordStart: number;
  offset: number;
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
  return claimed.map((c, i) => ({ key: c.key, word: line.slice(c.start, c.end), text: line.slice(c.end, claimed[i + 1]?.start ?? line.length), wordStart: c.start, offset: c.end }));
}

/** Grams (or mL, taken as grams) of one serving and an optional friendly label */
function findServing(text: string): { grams?: number; label?: string } {
  const tidy = (s: string) => s.replace(/[:()\-–—]/g, " ").replace(/\s+/g, " ").trim();
  const num = "([0-9OolI]+(?:[.,][0-9]+)?)";
  const unit = "\\s*(?:g|ml)\\b";
  const grams = (s: string) => parseNumber(s);

  // The word "size" is sometimes misread ("Serving mze 309"), so any short word followed by a number will do
  const size =
    text.match(new RegExp(`serv(?:ing|e)\\s*size\\s*:?\\s*([^\\n]*)`, "i")) ??
    text.match(new RegExp(`serv(?:ing|e)\\s*[a-z]{3,4}\\s*:?\\s*(\\d[^\\n]*)`, "i"));
  if (size) {
    // "309" is 30 g with the g read as 9
    const rest = size[1]!.replace(/^(\s*\d{2,})9(?![\d.]|\s*(?:g|ml)\b)/, "$1 g");
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
  const per = text.match(new RegExp(`per\\s+([0-9OolI]+?(?:[.,][0-9]+)?)\\s*(?:g|9|ml)\\s*(?:serv|portion)`, "i")) ??
    text.match(new RegExp(`(?:serv(?:ing|e)|portion)\\s*\\(?\\s*${num}${unit}`, "i")) ??
    text.match(new RegExp(`${num}${unit}\\s*(?:serving|portion)`, "i"));
  return per ? { grams: grams(per[1]!) ?? undefined } : {};
}

const NOT_NAME = /nutri|facts|inform|serv|per\s|ingredient|quantity|average|amount|energy|calorie|panel|%|\d/i;

/** Product name: the first plain line above the panel, if any */
function findName(lines: string[]): { name: string; line: number } | undefined {
  for (const [i, line] of lines.entries()) {
    if (/nutri|serving|quantity|per\s*100|amount|energy|calories/i.test(line)) return undefined;
    const t = line.trim();
    if (t.length >= 3 && t.length <= 40 && /^[A-Za-z][A-Za-z '&-]+$/.test(t) && !NOT_NAME.test(t)) return { name: t, line: i };
  }
  return undefined;
}

/** The first line carrying the figure `value` (as printed, with an optional g/ml), preferring lines that talk about serving size */
function findFigure(lines: string[], value: number): Span | undefined {
  const re = new RegExp(`(?<![\\d.,])${String(value).replace(".", "[.,]")}\\s*(?:g|ml)?(?![\\d])`, "i");
  let found: Span | undefined;
  for (const [i, line] of lines.entries()) {
    const m = re.exec(line);
    if (!m) continue;
    const span = { line: i, start: m.index, end: m.index + m[0].length };
    if (/serv|portion|per\s/i.test(line)) return span;
    found ??= span;
  }
  return found;
}

type Columns = Partial<Record<LabelField, number[]>>;

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Parse OCR text of a nutrition label into per-serving form values */
export function parseLabel(text: string): LabelScan {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const joined = lines.join("\n");
  const warnings: string[] = [];

  // Column order from the header: per serving vs per 100 g
  const servIdx = joined.search(/per\s+(?:serving|serve|portion|\d+\s*[g9]\s+serving)/i);
  const hundredIdx = joined.search(/per\s*[1lIt|]00\s*(?:g|9|ml)|\b[1lIt|]00\s*(?:g|ml)\b/i);
  const headerKnown = servIdx >= 0 || hundredIdx >= 0;
  let cols: ("serving" | "per100")[] =
    servIdx >= 0 && hundredIdx >= 0
      ? servIdx < hundredIdx ? ["serving", "per100"] : ["per100", "serving"]
      : [hundredIdx >= 0 && servIdx < 0 ? "per100" : "serving"];
  // With no column header read at all, keep two values per row and work out the order from the serving size afterwards
  const width = headerKnown ? cols.length : 2;

  // Units in the row headings ("Protein (g) 5.7 19") mean the numbers carry none, so a trailing 9 is real
  const headingUnits = /\((?:g|9|mg)\)/i.test(joined);
  const usLike = /daily\s*value|nutrition\s*facts/i.test(joined);

  const columns: Columns = {};
  const approx = new Set<string>();
  let kj: number[] = [];
  let kcal: number[] = [];
  let salt: number[] = [];
  let lastKey: Key = null;
  // Where each figure was printed, in step with the arrays of figures above
  const figureSpans: Partial<Record<LabelField, Span[]>> = {};
  const nameSpans: Partial<Record<LabelField, Span>> = {};
  let kjSp: Span[] = [];
  let kcalSp: Span[] = [];
  let saltSp: Span[] = [];
  let energyName: Span | undefined;
  let saltName: Span | undefined;
  const spanOf = (li: number, seg: Segment, t: Token): Span => ({ line: li, start: seg.offset + t.start, end: seg.offset + t.end });

  for (const [li, line] of lines.entries()) {
    const segs = segments(line);
    if (segs.length === 0) {
      // Energy sometimes wraps: "Energy 1046 kJ" then "250 kcal"
      if (lastKey === "energy" && kcal.length === 0) {
        const t = tokenize(line).filter((x) => x.unit === "kcal");
        if (t.length) {
          kcal = t.map((x) => x.value);
          kcalSp = t.map((x) => ({ line: li, start: x.start, end: x.end }));
        }
      }
      continue;
    }
    for (const seg of segs) {
      lastKey = seg.key;
      if (!seg.key) continue;
      const nameSpan: Span = { line: li, start: seg.wordStart, end: seg.wordStart + seg.word.length };
      // What is printed between the nutrient name and its first number: "(kJ)", "(g)", "kJ/kcal"
      const heading = seg.text.split(/\d/)[0] ?? "";
      const gramField = FIELD_UNIT[seg.key] === "g" || seg.key === "salt";
      // "(9)" is a "(g)" heading; it must not count as a number (blanked to the same length so positions still line up)
      const text = seg.text.replace(/\(\s*(?:g|9|mg|m9)\s*\)/gi, (m) => " ".repeat(m.length));
      let strip: Strip = "none";
      if (gramField && !headingUnits) {
        // Whole numbers are only repaired where this row (or a US panel) prints units beside its numbers, or already needed repair
        const rowUnits = tokenize(text).some((t) => t.unit === "g") || text.includes("%");
        const repaired = tokenize(text, "decimal").some((t, i) => t.value !== tokenize(text)[i]?.value);
        strip = rowUnits || usLike || repaired ? "all" : "decimal";
      }
      const tokens = tokenize(text, strip);
      if (seg.key === "energy") {
        const bare = tokens.filter((t) => t.unit === "");
        const kT = tokens.filter((t) => t.unit === "kcal");
        const jT = tokens.filter((t) => t.unit === "kj");
        const k = kT.map((t) => t.value);
        const j = jT.map((t) => t.value);
        const headKj = /\bk[jdli]\b|kilojoule/i.test(heading);
        const headKcal = /\bk?c{1,2}al\b|\bcalorie/i.test(heading);
        energyName ??= nameSpan;
        if (k.length && !kcal.length) {
          kcal = k;
          kcalSp = kT.map((t) => spanOf(li, seg, t));
        }
        if (j.length && kj.length === 0) {
          kj = j;
          kjSp = jT.map((t) => spanOf(li, seg, t));
        }
        if (k.length === 0 && j.length === 0 && bare.length) {
          const nums = bare.map((t) => t.value);
          if ((headKj && headKcal) || /\bk[jdli]\s*\//i.test(heading)) {
            // "kJ/kcal 1046/250": each pair holds both figures, and kJ is always the larger
            const pairs: Token[][] = [];
            for (let i = 0; i + 1 < bare.length; i += 2) pairs.push([bare[i]!, bare[i + 1]!]);
            if (pairs.length && kcal.length === 0) {
              const small = pairs.map((p) => (p[0]!.value <= p[1]!.value ? p[0]! : p[1]!));
              kcal = small.map((t) => t.value);
              kcalSp = small.map((t) => spanOf(li, seg, t));
            }
            if (pairs.length && kj.length === 0) {
              const big = pairs.map((p) => (p[0]!.value > p[1]!.value ? p[0]! : p[1]!));
              kj = big.map((t) => t.value);
              kjSp = big.map((t) => spanOf(li, seg, t));
            }
          } else if (headKcal || (!headKj && /^calor/i.test(seg.word))) {
            // US "Calories 200": a bare number is kcal
            if (kcal.length === 0) {
              kcal = nums;
              kcalSp = bare.map((t) => spanOf(li, seg, t));
            }
          } else if (kj.length === 0) {
            // "Energy (kJ) 485 1620", or "Energy 485 1620" with the unit lost: AU/NZ panels print kJ
            kj = nums;
            kjSp = bare.map((t) => spanOf(li, seg, t));
          }
        }
        continue;
      }
      // A stray unit-less number beyond the expected columns is usually a misread % value
      const withUnit = tokens.filter((t) => t.unit !== "");
      const use = tokens.length > width && withUnit.length ? withUnit : tokens;
      if (seg.key === "salt") {
        if (salt.length === 0) {
          const ok = use.map((t) => ({ v: convert(t, "g"), t })).filter((x): x is { v: number; t: Token } => x.v !== null);
          salt = ok.map((x) => x.v);
          saltSp = ok.map((x) => spanOf(li, seg, x.t));
          saltName = nameSpan;
        }
        continue;
      }
      if (columns[seg.key]) continue;
      const target = FIELD_UNIT[seg.key] ?? "g";
      const kept = use
        .map((t) => ({ v: convert(t, target), lt: t.lt, span: spanOf(li, seg, t) }))
        .filter((x): x is { v: number; lt: boolean | undefined; span: Span } => x.v !== null)
        .slice(0, width);
      if (kept.length) {
        columns[seg.key] = kept.map((x) => x.v);
        figureSpans[seg.key] = kept.map((x) => x.span);
        nameSpans[seg.key] = nameSpan;
        kept.forEach((x, i) => x.lt && approx.add(`${seg.key}:${i}`));
      }
    }
  }

  // A kcal figure that is not about a quarter of the kJ beside it was misread (e.g. "1 16"); the kJ one wins
  if (kcal.length && kj.length) {
    const fromKj = kcal.map((c, i) => kj[i] !== undefined && Math.abs(c - kj[i]! / 4.184) > 0.15 * (kj[i]! / 4.184));
    kcalSp = kcalSp.map((s, i) => (fromKj[i] ? kjSp[i] ?? s : s));
    kcal = kcal.map((c, i) => (fromKj[i] ? kj[i]! / 4.184 : c));
  }
  if (kcal.length) {
    columns.calories = kcal.slice(0, width);
    figureSpans.calories = kcalSp.slice(0, width);
  } else if (kj.length) {
    columns.calories = kj.slice(0, width).map((v) => v / 4.184);
    figureSpans.calories = kjSp.slice(0, width);
  }
  if (energyName) nameSpans.calories = energyName;
  if (!columns.sodium && salt.length) {
    columns.sodium = salt.slice(0, width).map((g) => g * 400);
    figureSpans.sodium = saltSp.slice(0, width);
    if (saltName) nameSpans.sodium = saltName;
  }

  // Serving size
  const serving = findServing(joined);
  const grams = serving.grams && serving.grams > 0 ? serving.grams : undefined;

  if (!headerKnown && grams && grams !== 100) {
    // Per-100 g figures are 100/grams times the per-serving ones: the larger column is per 100 g when the serving is under 100 g
    const ratio = 100 / grams;
    const pairs = Object.values(columns).filter((v) => v.length >= 2 && v[0]! > 0 && v[1]! > 0);
    const near = (r: number, want: number) => Math.abs(r / want - 1) <= 0.25;
    const first100 = pairs.filter((v) => near(v[0]! / v[1]!, ratio)).length;
    const second100 = pairs.filter((v) => near(v[1]! / v[0]!, ratio)).length;
    if (first100 >= 2 && first100 > second100) cols = ["per100", "serving"];
    else if (second100 >= 2 && second100 > first100) cols = ["serving", "per100"];
  }

  // One basis for everything: per 100 g when the label has it (cross-checked against the serving column), else per serving
  const servCol = cols.indexOf("serving");
  const hundredCol = cols.indexOf("per100");
  const entries = Object.entries(columns) as [LabelField, number[]][];
  const at = (vals: number[], col: number) => (col >= 0 ? vals[col] : undefined);
  const values: Partial<Record<LabelField, number>> = {};
  const disagree: LabelField[] = [];
  const sources: LabelScan["sources"] = {};
  for (const [field, vals] of entries) {
    // Grams of a nutrient cannot exceed the grams of food: a bigger number is a misread
    const gramLimit = FIELD_UNIT[field] === "g";
    let s = at(vals, servCol);
    let h = at(vals, hundredCol);
    const printed = s !== undefined || h !== undefined;
    if (gramLimit && h !== undefined && h > 100) h = undefined;
    if (gramLimit && s !== undefined && s > (grams ?? 100) * 1.05) s = undefined;
    let perServing: number | undefined;
    // The column the value came from
    let col = -1;
    if (h !== undefined && grams) {
      // The per-100 g figure is the more precise; keep the printed per-serving number when it agrees, so values match the label
      const scaled = (h * grams) / 100;
      const sApprox = approx.has(`${field}:${servCol}`);
      const hApprox = approx.has(`${field}:${hundredCol}`);
      if (s === undefined || (sApprox && !hApprox)) [perServing, col] = [scaled, hundredCol];
      else if (hApprox || Math.abs(s - scaled) <= Math.max(0.15 * scaled, 0.1)) [perServing, col] = [s, servCol];
      else if (scaled > 0 && [10, 0.1].some((f) => Math.abs(s / scaled - f) <= 0.15 * f)) {
        // A lost or extra decimal point ("48g" for 4.8 g): the figure with a fractional part is the intact one
        [perServing, col] = Number.isInteger(s) && !Number.isInteger(scaled) ? [scaled, hundredCol] : [s, servCol];
      } else {
        // Two printed figures that do not agree: one was misread, and the printed per-serving one is what the label shows
        [perServing, col] = [s, servCol];
        disagree.push(field);
      }
    }
    else if (h !== undefined) [perServing, col] = [h, hundredCol]; // no serving size: treat the serving as 100 g
    else if (s !== undefined) [perServing, col] = [s, servCol];
    else if (!printed && vals[0] !== undefined) [perServing, col] = [vals[0], 0];
    if (perServing === undefined) continue;
    values[field] = field === "calories" ? Math.round(perServing) : round(perServing, 2);
    const figure = figureSpans[field]?.[col];
    const named = nameSpans[field];
    if (figure || named) {
      sources[field] = { spans: [named, figure].filter((x): x is Span => !!x) };
      if (printed && col >= 0 && cols.length > 1) sources[field]!.column = cols[col];
    }
  }

  // Sugars and fibre cannot exceed the carbohydrate, nor saturated fat the fat: a lost decimal point ("21" for 2.1)
  for (const [field, parent] of [["sugar", "carbs"], ["fiber", "carbs"], ["satFat", "fat"]] as const) {
    const v = values[field];
    const total = values[parent];
    if (v !== undefined && total !== undefined && Number.isInteger(v) && v > total + 0.05 && v / 10 <= total + 0.05) values[field] = round(v / 10, 2);
  }

  const scan: LabelScan = { values, warnings, sources, conflicts: disagree };
  if (grams) scan.servingGrams = grams;
  else if (hundredCol >= 0) scan.servingGrams = 100;
  if (serving.label) scan.servingLabel = serving.label;
  const found = findName(lines);
  if (found) {
    scan.name = found.name;
    sources.name = { spans: [{ line: found.line, start: 0, end: lines[found.line]!.length }] };
  }
  const servingSpan = grams ? findFigure(lines, grams) : undefined;
  if (servingSpan) {
    sources.servingGrams = { spans: [servingSpan] };
    if (serving.label) sources.servingLabel = { spans: [servingSpan] };
  }

  if (disagree.length) warnings.push(`The per-serving and per-100 g columns do not match for ${disagree.join(", ")}. Check ${disagree.length === 1 ? "it" : "them"}.`);
  if (approx.size) warnings.push('Values printed as "<" were entered as half the limit.');
  if (!grams && hundredCol < 0) warnings.push("No serving size in grams was found. Check the serving size.");
  if (!grams && hundredCol >= 0) warnings.push("No serving size was found, so values are per 100 g.");
  if (values.calories === undefined) warnings.push("Calories were not read.");
  return scan;
}
