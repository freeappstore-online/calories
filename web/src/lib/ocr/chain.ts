import { parseLabel, type LabelField, type LabelScan } from "../labelParser";
import { ocrConfidence, ocrText, type EngineId, type OcrResult } from "./types";

/** Engines in the order a scan tries them: fastest first */
export const ENGINE_ORDER: EngineId[] = ["tesseract", "paddle", "florence"];

/** The values a label scan must find before the result is trusted without asking another model */
export const KEY_FIELDS: LabelField[] = ["calories", "protein", "carbs", "fat"];

/** Below this mean confidence (0..100) a read is treated as weak even when every field was found */
export const MIN_CONFIDENCE = 60;

export interface Attempt {
  engine: EngineId;
  ms: number;
  /** Absent when the engine failed to run */
  result?: OcrResult;
  scan?: LabelScan;
  confidence: number | null;
  good: boolean;
  error?: string;
}

/**
 * Calories should roughly equal 4 per gram of protein and carbohydrate plus 9 per gram of fat (fibre, alcohol and sugar
 * alcohols move it somewhat). A reading far off that has a misread digit in it, e.g. "9947 kcal" for a bar of 19 g protein.
 */
export function energyAgrees(values: LabelScan["values"]): boolean {
  const { calories, protein, carbs, fat } = values;
  if (calories === undefined || protein === undefined || carbs === undefined || fat === undefined) return true;
  const estimate = 4 * protein + 4 * carbs + 9 * fat;
  return Math.abs(calories - estimate) <= Math.max(25, 0.4 * Math.max(calories, estimate));
}

/** A read is good when all four key values were found and add up, per-serving and per-100 g agree, and the engine was confident */
export function isGood(scan: LabelScan, confidence: number | null): boolean {
  if (!KEY_FIELDS.every((f) => scan.values[f] !== undefined)) return false;
  if (scan.conflicts.length > 0 || !energyAgrees(scan.values)) return false;
  return confidence === null || confidence >= MIN_CONFIDENCE;
}

/** Higher is better: key values count most, then the other fields found, then fewer warnings */
export function readScore(scan: LabelScan): number {
  const keys = KEY_FIELDS.filter((f) => scan.values[f] !== undefined).length;
  return keys * 100 + Object.keys(scan.values).length * 10 - scan.warnings.length * 3 - scan.conflicts.length * 20 - (energyAgrees(scan.values) ? 0 : 20);
}

/** Judge one engine's result */
export function assess(engine: EngineId, result: OcrResult, ms: number): Attempt {
  const scan = parseLabel(ocrText(result));
  const confidence = ocrConfidence(result);
  return { engine, ms, result, scan, confidence, good: isGood(scan, confidence) };
}

/** The best read so far: a good one if there is one, else the one with the most fields and fewest warnings */
export function bestAttempt(attempts: Attempt[]): Attempt | undefined {
  const read = attempts.filter((a) => a.scan);
  return read.find((a) => a.good) ?? read.reduce<Attempt | undefined>((best, a) => (!best || readScore(a.scan!) > readScore(best.scan!) ? a : best), undefined);
}

/** The next downloaded engine in the order that has not been tried yet */
export function nextEngine(ready: ReadonlySet<EngineId>, attempts: Attempt[], order: EngineId[] = ENGINE_ORDER): EngineId | undefined {
  const tried = new Set(attempts.map((a) => a.engine));
  return order.find((e) => ready.has(e) && !tried.has(e));
}

export interface ChainOptions {
  ready: ReadonlySet<EngineId>;
  /** Run one engine on the photo */
  recognise: (engine: EngineId) => Promise<OcrResult>;
  /** Called before each engine starts */
  onStart?: (engine: EngineId) => void;
  /** Attempts already made (when continuing a scan) */
  previous?: Attempt[];
  /** Run only the next engine, whatever the result (the "Try next model" button) */
  single?: boolean;
  now?: () => number;
}

/**
 * Run the downloaded engines in order and stop at the first good result. An engine that fails to run counts as a
 * failed attempt and the next one is tried. Returns every attempt made, oldest first, including `previous`.
 */
export async function runChain(opts: ChainOptions): Promise<Attempt[]> {
  const now = opts.now ?? (() => performance.now());
  const attempts = [...(opts.previous ?? [])];
  for (;;) {
    const engine = nextEngine(opts.ready, attempts);
    if (!engine) return attempts;
    opts.onStart?.(engine);
    const t0 = now();
    let attempt: Attempt;
    try {
      attempt = assess(engine, await opts.recognise(engine), now() - t0);
    } catch (e) {
      attempt = { engine, ms: now() - t0, confidence: null, good: false, error: e instanceof Error ? e.message : String(e) };
    }
    attempts.push(attempt);
    if (opts.single || attempt.good) return attempts;
  }
}
