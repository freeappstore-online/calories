import { describe, expect, it } from "vitest";
import { assess, bestAttempt, energyAgrees, isGood, MIN_CONFIDENCE, nextEngine, runChain, type Attempt } from "./chain";
import { parseLabel } from "../labelParser";
import { rectQuad } from "./geometry";
import type { EngineId, OcrResult } from "./types";

const GOOD_TEXT = `Serving size: 30 g
per Serving per 100 g
Energy 485 kJ 1620 kJ
Protein 5.7 g 19.0 g
Fat, total 3.3 g 11.0 g
Carbohydrate 14.7 g 49.0 g`;

/** Protein is unreadable here */
const PARTIAL_TEXT = `Serving size: 30 g
per Serving per 100 g
Energy 485 kJ 1620 kJ
Fat, total 3.3 g 11.0 g
Carbohydrate 14.7 g 49.0 g`;

/** Per-serving and per-100 g protein disagree (a misread digit) */
const CONFLICT_TEXT = GOOD_TEXT.replace("Protein 5.7 g 19.0 g", "Protein 2.1 g 19.0 g");

function result(text: string, conf: number | null = 90): OcrResult {
  return {
    width: 100,
    height: 100,
    lines: text.split("\n").map((t, i) => ({ text: t, conf, quad: rectQuad(0, i * 10, 100, i * 10 + 9) })),
  };
}

describe("isGood", () => {
  it("accepts a full read with agreeing columns and confident text", () => {
    expect(isGood(parseLabel(GOOD_TEXT), 90)).toBe(true);
  });
  it("accepts a read from an engine that reports no confidence", () => {
    expect(isGood(parseLabel(GOOD_TEXT), null)).toBe(true);
  });
  it("rejects a read missing a key value", () => {
    expect(isGood(parseLabel(PARTIAL_TEXT), 90)).toBe(false);
  });
  it("rejects columns that disagree", () => {
    const scan = parseLabel(CONFLICT_TEXT);
    expect(scan.conflicts).toEqual(["protein"]);
    expect(isGood(scan, 90)).toBe(false);
  });
  it("rejects low confidence even when every value was found", () => {
    expect(isGood(parseLabel(GOOD_TEXT), MIN_CONFIDENCE - 1)).toBe(false);
    expect(isGood(parseLabel(GOOD_TEXT), MIN_CONFIDENCE)).toBe(true);
  });
});

describe("energyAgrees", () => {
  it("accepts calories close to 4/4/9 of the macros", () => {
    expect(energyAgrees({ calories: 116, protein: 5.7, carbs: 14.7, fat: 3.3 })).toBe(true);
    expect(energyAgrees({ calories: 190, protein: 5, carbs: 26, fat: 7 })).toBe(true);
  });
  it("accepts small absolute differences on low-calorie foods", () => {
    expect(energyAgrees({ calories: 2, protein: 0, carbs: 0.4, fat: 0 })).toBe(true);
  });
  it("rejects a misread digit", () => {
    expect(energyAgrees({ calories: 9947, protein: 19, carbs: 49, fat: 11 })).toBe(false);
    expect(energyAgrees({ calories: 11, protein: 19, carbs: 49, fat: 11 })).toBe(false);
  });
  it("has nothing to compare when a macro is missing", () => {
    expect(energyAgrees({ calories: 9947, protein: 19 })).toBe(true);
  });
  it("makes a read that does not add up not good, and ranks it lower", () => {
    const wrong = GOOD_TEXT.replace("Energy 485 kJ 1620 kJ", "Energy 4850 kJ 16200 kJ");
    const a = assess("tesseract", result(wrong), 1);
    expect(a.scan?.values.calories).toBeGreaterThan(1000);
    expect(a.good).toBe(false);
    expect(bestAttempt([a, assess("paddle", result(GOOD_TEXT), 1)])?.engine).toBe("paddle");
  });
});

describe("bestAttempt", () => {
  const attempt = (engine: EngineId, text: string, conf = 90): Attempt => assess(engine, result(text, conf), 10);

  it("prefers a good read over one with more fields", () => {
    const richer = attempt("tesseract", GOOD_TEXT + "\nSodium 135 mg 450 mg", 40);
    const good = attempt("paddle", GOOD_TEXT);
    expect(richer.good).toBe(false);
    expect(bestAttempt([richer, good])?.engine).toBe("paddle");
  });
  it("otherwise picks the read with the most fields and fewest warnings", () => {
    const partial = attempt("tesseract", PARTIAL_TEXT);
    const conflict = attempt("paddle", CONFLICT_TEXT);
    expect(bestAttempt([partial, conflict])?.engine).toBe("paddle");
  });
  it("ignores engines that failed to run", () => {
    const failed: Attempt = { engine: "paddle", ms: 1, confidence: null, good: false, error: "boom" };
    expect(bestAttempt([failed, attempt("tesseract", PARTIAL_TEXT)])?.engine).toBe("tesseract");
    expect(bestAttempt([failed])).toBeUndefined();
  });
});

describe("nextEngine", () => {
  it("goes in the fixed order and skips engines that are not downloaded", () => {
    expect(nextEngine(new Set<EngineId>(["paddle", "florence"]), [])).toBe("paddle");
    expect(nextEngine(new Set<EngineId>(["tesseract", "florence"]), [assess("tesseract", result(PARTIAL_TEXT), 1)])).toBe("florence");
  });
  it("is done when every downloaded engine has been tried", () => {
    expect(nextEngine(new Set<EngineId>(["tesseract"]), [assess("tesseract", result(PARTIAL_TEXT), 1)])).toBeUndefined();
  });
});

describe("runChain", () => {
  const texts: Partial<Record<EngineId, string | Error>> = {};
  const calls: EngineId[] = [];
  const run = (ready: EngineId[], extra: Partial<Parameters<typeof runChain>[0]> = {}) => {
    calls.length = 0;
    return runChain({
      ready: new Set(ready),
      recognise: async (engine) => {
        calls.push(engine);
        const t = texts[engine];
        if (t instanceof Error) throw t;
        return result(t ?? "");
      },
      now: () => 0,
      ...extra,
    });
  };

  it("with only Tesseract downloaded, runs just Tesseract whatever it reads", async () => {
    texts.tesseract = PARTIAL_TEXT;
    const attempts = await run(["tesseract"]);
    expect(calls).toEqual(["tesseract"]);
    expect(attempts).toHaveLength(1);
    expect(bestAttempt(attempts)?.scan?.values.fat).toBe(3.3);
  });

  it("stops at the first good result", async () => {
    texts.tesseract = GOOD_TEXT;
    texts.paddle = GOOD_TEXT;
    await run(["tesseract", "paddle", "florence"]);
    expect(calls).toEqual(["tesseract"]);
  });

  it("moves on after a weak result, and stops once a later one is good", async () => {
    texts.tesseract = PARTIAL_TEXT;
    texts.paddle = GOOD_TEXT;
    texts.florence = GOOD_TEXT;
    const attempts = await run(["tesseract", "paddle", "florence"]);
    expect(calls).toEqual(["tesseract", "paddle"]);
    expect(bestAttempt(attempts)?.engine).toBe("paddle");
  });

  it("moves on after an engine fails to run", async () => {
    texts.tesseract = new Error("worker crashed");
    texts.paddle = GOOD_TEXT;
    const attempts = await run(["tesseract", "paddle"]);
    expect(attempts.map((a) => [a.engine, a.error ?? null])).toEqual([["tesseract", "worker crashed"], ["paddle", null]]);
    expect(bestAttempt(attempts)?.engine).toBe("paddle");
  });

  it("when nothing is good, tries everything and the best read wins", async () => {
    texts.tesseract = PARTIAL_TEXT;
    texts.paddle = CONFLICT_TEXT;
    texts.florence = new Error("out of memory");
    const attempts = await run(["tesseract", "paddle", "florence"]);
    expect(calls).toEqual(["tesseract", "paddle", "florence"]);
    expect(attempts.some((a) => a.good)).toBe(false);
    expect(bestAttempt(attempts)?.engine).toBe("paddle");
  });

  it("Try next model runs one more engine from where the scan stopped, good result or not", async () => {
    texts.tesseract = GOOD_TEXT;
    texts.paddle = PARTIAL_TEXT;
    const first = await run(["tesseract", "paddle"]);
    expect(calls).toEqual(["tesseract"]);
    const next = await run(["tesseract", "paddle"], { previous: first, single: true });
    expect(calls).toEqual(["paddle"]);
    expect(next.map((a) => a.engine)).toEqual(["tesseract", "paddle"]);
    // Nothing left to try
    await run(["tesseract", "paddle"], { previous: next, single: true });
    expect(calls).toEqual([]);
  });

  it("reports each engine as it starts", async () => {
    texts.tesseract = PARTIAL_TEXT;
    texts.paddle = GOOD_TEXT;
    const started: EngineId[] = [];
    await run(["tesseract", "paddle"], { onStart: (e) => started.push(e) });
    expect(started).toEqual(["tesseract", "paddle"]);
  });
});
