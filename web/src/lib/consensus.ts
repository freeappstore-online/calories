import type { LabelField, LabelScan } from "./labelParser";
import { energyAgrees, KEY_FIELDS } from "./ocr/chain";

/**
 * Multi-frame consensus for the live label camera. Every sharp, steady frame that was read is a set of votes; each
 * field settles once one value has enough weighted votes and a clear lead. One frame that misreads a digit is outvoted
 * by the others. Pure: no DOM, so it is unit tested.
 */

/** What can be voted on: the nutrients, and the serving they are quoted for */
export type VoteField = LabelField | "servingGrams" | "servingLabel";
type Vote = number | string;

/** What one read frame contributes */
export interface FrameRead {
  values: Partial<Record<VoteField, Vote>>;
  /** Fields whose per-serving and per-100 g figures disagreed in this frame */
  conflicts: LabelField[];
  /** Mean OCR confidence 0..100, null when the engine reports none */
  confidence: number | null;
  /** How sharp the frame was, 0..1 */
  quality: number;
}

/** Turn a parsed frame into votes */
export function frameRead(scan: LabelScan, confidence: number | null, quality: number): FrameRead {
  const values: FrameRead["values"] = { ...scan.values };
  if (scan.servingGrams !== undefined) values.servingGrams = scan.servingGrams;
  if (scan.servingLabel) values.servingLabel = scan.servingLabel;
  return { values, conflicts: scan.conflicts, confidence, quality };
}

/** Weighted votes a value needs to settle, and how far ahead of the runner-up it must be (a ratio) */
export const MIN_WEIGHT = 3;
export const LEAD_RATIO = 2;
/** A frame that fails a plausibility check keeps this share of its weight for the fields involved */
export const IMPLAUSIBLE = 0.25;
/** Reads of a field, and the share of them that agree, below which a field counts as flip-flopping */
export const UNSTABLE_READS = 6;
export const UNSTABLE_SHARE = 0.5;

/** Near-equal readings vote together: one decimal, whole numbers from 100 up */
export const normalise = (v: number): number => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10);

const SUB_OF: Partial<Record<VoteField, VoteField>> = { sugar: "carbs", fiber: "carbs", satFat: "fat" };

/**
 * How much each field of a frame counts, between 0 and 1: confidence x sharpness, cut when the frame contradicts
 * itself (calories off the 4/4/9 sum, a sub-nutrient above its parent, per-serve against per-100 g).
 */
function weights(read: FrameRead): Partial<Record<VoteField, number>> {
  const base = (read.confidence ?? 80) / 100 * read.quality;
  const out: Partial<Record<VoteField, number>> = {};
  const nums = read.values as Partial<Record<LabelField, number>>;
  const energyOk = energyAgrees(nums);
  for (const f of Object.keys(read.values) as VoteField[]) {
    let w = base;
    if (!energyOk && KEY_FIELDS.includes(f as LabelField)) w *= IMPLAUSIBLE;
    if (read.conflicts.includes(f as LabelField)) w *= IMPLAUSIBLE;
    const parent = SUB_OF[f];
    const parentValue = parent && read.values[parent];
    if (typeof parentValue === "number" && typeof read.values[f] === "number" && (read.values[f] as number) > parentValue) w *= IMPLAUSIBLE;
    out[f] = w;
  }
  return out;
}

/** The serving the figures of a frame are quoted for: its serving size, or 100 g when the frame gave none */
const basisOf = (r: FrameRead): number => (typeof r.values.servingGrams === "number" ? normalise(r.values.servingGrams) : 100);

interface Candidate {
  value: Vote;
  /** Per-serve and per-100 g readings never vote together: each has its own basis */
  basis: number;
  weight: number;
  count: number;
}

export interface FieldReport {
  value: Vote;
  settled: boolean;
  /** Frames that read the winning value, and frames that read the field at all */
  agree: number;
  reads: number;
  /** Many reads and no value most of them agree on */
  unstable: boolean;
}

/** The settled values, ready to fill the form */
export interface ConsensusResult {
  values: Partial<Record<LabelField, number>>;
  servingGrams?: number;
  servingLabel?: string;
  /** Frames that voted */
  frames: number;
}

export class Consensus {
  private votes = new Map<VoteField, Map<string, Candidate>>();
  /** Frames that read a field, per field and basis */
  private reads = new Map<string, number>();
  /** Weight behind each basis (a serving size in grams) */
  private bases = new Map<number, number>();
  /** Frames that voted */
  frames = 0;

  add(read: FrameRead): void {
    this.frames++;
    const w = weights(read);
    const basis = basisOf(read);
    this.bases.set(basis, (this.bases.get(basis) ?? 0) + ((read.confidence ?? 80) / 100) * read.quality);
    for (const f of Object.keys(read.values) as VoteField[]) {
      const raw = read.values[f]!;
      const value = typeof raw === "number" ? normalise(raw) : raw.toLowerCase();
      const field = this.votes.get(f) ?? new Map<string, Candidate>();
      this.votes.set(f, field);
      const key = `${basis}|${value}`;
      const c = field.get(key) ?? { value, basis, weight: 0, count: 0 };
      c.weight += w[f] ?? 0;
      c.count++;
      field.set(key, c);
      this.reads.set(`${f}|${basis}`, (this.reads.get(`${f}|${basis}`) ?? 0) + 1);
    }
  }

  /** The serving most frames quoted their figures for */
  private leadingBasis(): number | undefined {
    let lead: number | undefined;
    for (const [b, w] of this.bases) if (lead === undefined || w > this.bases.get(lead)!) lead = b;
    return lead;
  }

  /** Every field read so far with its leading value, settled or not */
  fields(): Partial<Record<VoteField, FieldReport>> {
    const out: Partial<Record<VoteField, FieldReport>> = {};
    const lead = this.leadingBasis();
    for (const [f, cands] of this.votes) {
      // Only frames quoting the leading serving vote (a frame that fell back to the per-100 g column does not compete)
      const sorted = [...cands.values()].filter((c) => c.basis === lead).sort((a, b) => b.weight - a.weight || b.count - a.count);
      const top = sorted[0];
      if (!top) continue;
      const second = sorted[1]?.weight ?? 0;
      const reads = this.reads.get(`${f}|${lead}`) ?? 0;
      const settled = top.weight >= MIN_WEIGHT && top.weight >= LEAD_RATIO * second;
      out[f] = { value: top.value, settled, agree: top.count, reads, unstable: !settled && reads >= UNSTABLE_READS && top.count / reads < UNSTABLE_SHARE };
    }
    // Calories and macros that settled but do not add up: the least supported one has to be re-read
    const keys = KEY_FIELDS.filter((f) => out[f]?.settled);
    if (keys.length === KEY_FIELDS.length && !energyAgrees(Object.fromEntries(KEY_FIELDS.map((f) => [f, out[f]!.value as number])))) {
      const weakest = keys.reduce((a, b) => (this.leadWeight(a) <= this.leadWeight(b) ? a : b));
      out[weakest]!.settled = false;
    }
    return out;
  }

  private leadWeight(f: VoteField): number {
    return Math.max(0, ...[...(this.votes.get(f)?.values() ?? [])].filter((c) => c.basis === this.leadingBasis()).map((c) => c.weight));
  }

  /** The four key values (calories, protein, carbs, fat) have all settled */
  keysSettled(): boolean {
    const f = this.fields();
    return KEY_FIELDS.every((k) => f[k]?.settled);
  }

  result(): ConsensusResult {
    const values: ConsensusResult["values"] = {};
    const out: ConsensusResult = { values, frames: this.frames };
    for (const [f, r] of Object.entries(this.fields()) as [VoteField, FieldReport][]) {
      if (!r.settled) continue;
      if (f === "servingGrams") out.servingGrams = r.value as number;
      else if (f === "servingLabel") out.servingLabel = r.value as string;
      else values[f] = r.value as number;
    }
    return out;
  }
}

/** Settled values win over what a single read found; everything else stays as read */
export function mergeConsensus(scan: LabelScan, c: ConsensusResult | undefined): LabelScan {
  if (!c) return scan;
  return {
    ...scan,
    values: { ...scan.values, ...c.values },
    servingGrams: c.servingGrams ?? scan.servingGrams,
    servingLabel: c.servingLabel ?? scan.servingLabel,
  };
}

// --- frame quality ---

/** Variance of the Laplacian of a greyscale image: high when edges are crisp, low when blurred */
export function laplacianVariance(grey: Uint8Array, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const l = 4 * grey[i]! - grey[i - 1]! - grey[i + 1]! - grey[i - width]! - grey[i + width]!;
      sum += l;
      sumSq += l * l;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Sharpness at which a frame counts fully, the least that is read at all, and the share of the recent best that is still read */
export const GOOD_SHARPNESS = 400;
export const MIN_SHARPNESS = 60;
export const MIN_RELATIVE_SHARPNESS = 0.5;
/** Most the picture may change (mean grey level per pixel of the small copy) from the previous read */
export const MAX_MOTION = 14;
const RECENT = 8;

export type GateVerdict = { pass: true; quality: number } | { pass: false; reason: "blurry" | "moving"; quality: number };

/** Decides whether a frame is sharp and steady enough to vote */
export class FrameGate {
  private recent: number[] = [];

  check(sharpness: number, motion: number): GateVerdict {
    const best = Math.max(sharpness, ...this.recent);
    this.recent.push(sharpness);
    if (this.recent.length > RECENT) this.recent.shift();
    const quality = Math.min(1, sharpness / GOOD_SHARPNESS);
    if (sharpness < MIN_SHARPNESS || sharpness < MIN_RELATIVE_SHARPNESS * best) return { pass: false, reason: "blurry", quality };
    if (motion > MAX_MOTION) return { pass: false, reason: "moving", quality };
    return { pass: true, quality };
  }
}

// --- the photo to keep ---

const fieldCount = (r: FrameRead) => Object.keys(r.values).filter((f) => f !== "servingLabel").length;
const keyCount = (r: FrameRead) => KEY_FIELDS.filter((f) => r.values[f] !== undefined).length;

/** Higher is better: more fields read (the key four count extra), from a sharper frame */
export const frameScore = (r: FrameRead): number => (fieldCount(r) + 2 * keyCount(r)) * (0.3 + 0.7 * r.quality);

/** How many of a frame's values match the consensus, minus twice how many contradict it */
export function agreementWith(r: FrameRead, c: ConsensusResult): number {
  let score = 0;
  const check = (mine: Vote | undefined, theirs: Vote | undefined) => {
    if (mine === undefined || theirs === undefined) return;
    score += (typeof mine === "number" ? normalise(mine) : mine.toLowerCase()) === theirs ? 1 : -2;
  };
  for (const [f, v] of Object.entries(c.values)) check(r.values[f as LabelField], v);
  check(r.values.servingGrams, c.servingGrams);
  return score;
}

/** The few best-looking frames seen, so the one that agrees with the final consensus can be chosen (it is not known early on) */
export class FramePool<T> {
  private items: { item: T; read: FrameRead; score: number }[] = [];
  constructor(private size = 4) {}

  add(item: T, read: FrameRead): void {
    if (fieldCount(read) === 0) return;
    this.items.push({ item, read, score: frameScore(read) });
    this.items.sort((a, b) => b.score - a.score);
    this.items.length = Math.min(this.items.length, this.size);
  }

  /** The frame that agrees most with the consensus, then the best looking one */
  best(c: ConsensusResult): T | undefined {
    let pick: (typeof this.items)[number] | undefined;
    let pickAgreement = -Infinity;
    for (const it of this.items) {
      const a = agreementWith(it.read, c);
      if (a > pickAgreement) {
        pick = it;
        pickAgreement = a;
      }
    }
    return pick?.item;
  }
}
