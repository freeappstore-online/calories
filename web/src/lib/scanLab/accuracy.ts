import type { LabelField, LabelScan } from "../labelParser";
import { bestAttempt, ENGINE_ORDER, type Attempt } from "../ocr/chain";
import { highlightsOf } from "../ocr/provenance";
import type { EngineId, OcrLine } from "../ocr/types";

/** What the user can state as true for a lab item: the label values per serving, and the serving size */
export type CorrectKey = LabelField | "servingGrams";
export type CorrectValues = Partial<Record<CorrectKey, number>>;

export type Verdict = "right" | "wrong" | "missing";

export interface Accuracy {
  /** Fields with a correct value */
  total: number;
  right: number;
  /** Read, but a different number */
  wrong: number;
  /** Not read at all */
  missing: number;
}

/** Two figures are the same when they agree to the one decimal a label prints */
const SAME = 0.05;

export function readValue(scan: LabelScan | undefined, key: CorrectKey): number | undefined {
  if (!scan) return undefined;
  return key === "servingGrams" ? scan.servingGrams : scan.values[key];
}

export function verdict(read: number | undefined, correct: number): Verdict {
  if (read === undefined) return "missing";
  return Math.abs(read - correct) < SAME ? "right" : "wrong";
}

export const correctKeys = (correct: CorrectValues): CorrectKey[] => (Object.keys(correct) as CorrectKey[]).filter((k) => correct[k] !== undefined);

/** How a read compares with the correct values; a failed or absent read has every field missing */
export function accuracyOf(correct: CorrectValues, scan: LabelScan | undefined): Accuracy {
  const out: Accuracy = { total: 0, right: 0, wrong: 0, missing: 0 };
  for (const key of correctKeys(correct)) {
    out.total++;
    out[verdict(readValue(scan, key), correct[key]!)]++;
  }
  return out;
}

const add = (a: Accuracy, b: Accuracy): Accuracy => ({ total: a.total + b.total, right: a.right + b.right, wrong: a.wrong + b.wrong, missing: a.missing + b.missing });
const ZERO: Accuracy = { total: 0, right: 0, wrong: 0, missing: 0 };

/** Share of fields right, as a whole percentage; null with nothing to compare */
export const percent = (a: Accuracy | null | undefined): number | null => (a && a.total > 0 ? Math.round((100 * a.right) / a.total) : null);

/** What the failover chain would have kept: it stops at the first good read, else the best of what it read */
export function chainPick(attempts: Attempt[]): Attempt | undefined {
  const ordered = ENGINE_ORDER.map((e) => attempts.find((a) => a.engine === e)).filter((a): a is Attempt => !!a);
  const cut = ordered.findIndex((a) => a.good);
  return bestAttempt(cut >= 0 ? ordered.slice(0, cut + 1) : ordered);
}

export interface ItemAccuracy {
  byEngine: Partial<Record<EngineId, Accuracy>>;
  /** The chain's own pick; null when no model has read the photo */
  chain: Accuracy | null;
  chainEngine?: EngineId;
}

/** Per-model and chain accuracy of one item's nutrition-panel reads; null until correct values are entered */
export function itemAccuracy(correct: CorrectValues, attempts: Attempt[]): ItemAccuracy | null {
  if (correctKeys(correct).length === 0) return null;
  const byEngine: ItemAccuracy["byEngine"] = {};
  for (const a of attempts) byEngine[a.engine] = accuracyOf(correct, a.scan);
  const pick = chainPick(attempts);
  return { byEngine, chain: pick ? accuracyOf(correct, pick.scan) : null, chainEngine: pick?.engine };
}

export interface OverallAccuracy {
  /** Items that have correct values */
  items: number;
  byEngine: Partial<Record<EngineId, Accuracy>>;
  chain: Accuracy | null;
}

/** Field-weighted accuracy over every item with correct values */
export function overallAccuracy(per: (ItemAccuracy | null)[]): OverallAccuracy {
  const out: OverallAccuracy = { items: 0, byEngine: {}, chain: null };
  for (const acc of per) {
    if (!acc) continue;
    out.items++;
    for (const [engine, a] of Object.entries(acc.byEngine) as [EngineId, Accuracy][]) out.byEngine[engine] = add(out.byEngine[engine] ?? ZERO, a);
    if (acc.chain) out.chain = add(out.chain ?? ZERO, acc.chain);
  }
  return out;
}

const lineHeight = (l: OcrLine) => Math.hypot(l.quad[3][0] - l.quad[0][0], l.quad[3][1] - l.quad[0][1]);

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-/&'])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());

/**
 * A name for the food from the front of the pack: the largest printed text (brand and product are set biggest), read
 * top to bottom. Small print and number-heavy lines such as weights are left out.
 */
export function suggestName(lines: OcrLine[]): string {
  const usable = lines.filter((l) => (l.text.match(/\p{L}/gu)?.length ?? 0) >= 3 && (l.text.match(/\d/g)?.length ?? 0) <= l.text.length / 3);
  if (usable.length === 0) return "";
  const tallest = Math.max(...usable.map(lineHeight));
  const big = usable.filter((l) => lineHeight(l) >= tallest * 0.6);
  const top = (l: OcrLine) => Math.min(...l.quad.map((p) => p[1]));
  const text = big.sort((a, b) => top(a) - top(b)).map((l) => l.text).join(" ").replace(/\s+/g, " ").trim().slice(0, 60).trim();
  return text && text === text.toUpperCase() ? titleCase(text) : text;
}

const round = (n: number) => Math.round(n * 10) / 10;

export interface ScanDescription {
  values: Partial<Record<CorrectKey, number>>;
  name?: string;
  servingLabel?: string;
  warnings: string[];
  conflicts: LabelField[];
  /** For each value: the printed name and the figure it was taken from, and the table column when the label has two */
  provenance: Record<string, { name?: string; figure?: string; column?: string }>;
}

/** A parsed read as plain data: values with the text they came from */
export function describeScan(scan: LabelScan, lines: OcrLine[]): ScanDescription {
  const values: ScanDescription["values"] = { ...scan.values };
  if (scan.servingGrams !== undefined) values.servingGrams = scan.servingGrams;
  const provenance: ScanDescription["provenance"] = {};
  for (const h of highlightsOf(scan, lines)) {
    const p = (provenance[h.field] ??= {});
    if (h.role === "name") p.name = h.text;
    else p.figure = h.text;
  }
  for (const [field, src] of Object.entries(scan.sources)) if (src?.column && provenance[field]) provenance[field].column = src.column;
  return {
    values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, round(v)])) as ScanDescription["values"],
    ...(scan.name ? { name: scan.name } : {}),
    ...(scan.servingLabel ? { servingLabel: scan.servingLabel } : {}),
    warnings: scan.warnings,
    conflicts: scan.conflicts,
    provenance,
  };
}
