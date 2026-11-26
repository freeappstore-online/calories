import { describe, expect, it } from "vitest";
import {
  agreementWith,
  Consensus,
  disagreements,
  FrameGate,
  FramePool,
  frameRead,
  laplacianVariance,
  mergeConsensus,
  normalise,
  type FrameRead,
} from "./consensus";
import { parseLabel } from "./labelParser";

const TRUE_VALUES = { calories: 116, protein: 6, carbs: 15, fat: 3 };

const read = (values: FrameRead["values"], extra: Partial<FrameRead> = {}): FrameRead => ({ values, conflicts: [], confidence: 90, quality: 1, ...extra });

describe("normalise", () => {
  it("makes near-equal readings equal", () => {
    expect(normalise(5.7)).toBe(normalise(5.70001));
    expect(normalise(5.7)).not.toBe(normalise(5.8));
    expect(normalise(1620.4)).toBe(1620);
  });
});

describe("voting and settling", () => {
  it("does not settle on one or two frames", () => {
    const c = new Consensus();
    c.add(read(TRUE_VALUES));
    c.add(read(TRUE_VALUES));
    expect(c.fields().protein?.settled).toBe(false);
    c.add(read(TRUE_VALUES));
    c.add(read(TRUE_VALUES));
    expect(c.fields().protein).toMatchObject({ value: 6, settled: true, agree: 4, reads: 4 });
    expect(c.keysSettled()).toBe(true);
  });

  it("outvotes a frame that misreads a digit", () => {
    const c = new Consensus();
    const frames = [TRUE_VALUES, { ...TRUE_VALUES, protein: 8 }, TRUE_VALUES, TRUE_VALUES, { ...TRUE_VALUES, carbs: 75 }, TRUE_VALUES, TRUE_VALUES];
    for (const f of frames) c.add(read(f));
    const r = c.result();
    expect(r.values).toMatchObject(TRUE_VALUES);
    expect(c.fields().protein).toMatchObject({ settled: true, agree: 6, reads: 7 });
  });

  it("waits for a clear lead over the runner-up", () => {
    const c = new Consensus();
    for (let i = 0; i < 4; i++) c.add(read({ ...TRUE_VALUES, protein: 6 }));
    for (let i = 0; i < 3; i++) c.add(read({ ...TRUE_VALUES, protein: 9 }));
    expect(c.fields().protein?.settled).toBe(false);
    for (let i = 0; i < 6; i++) c.add(read({ ...TRUE_VALUES, protein: 6 }));
    expect(c.fields().protein?.settled).toBe(true);
  });

  it("weights by confidence and sharpness", () => {
    const c = new Consensus();
    // Four sharp confident frames outweigh five soft, unsure ones
    for (let i = 0; i < 4; i++) c.add(read({ protein: 6 }, { confidence: 95, quality: 1 }));
    for (let i = 0; i < 5; i++) c.add(read({ protein: 9 }, { confidence: 50, quality: 0.4 }));
    expect(c.fields().protein).toMatchObject({ value: 6, settled: true });
  });

  it("flags a field that keeps flip-flopping", () => {
    const c = new Consensus();
    [5, 6, 7, 8, 9, 5, 6, 7].forEach((p) => c.add(read({ protein: p }, { confidence: 60, quality: 0.5 })));
    expect(c.fields().protein).toMatchObject({ settled: false, unstable: true });
  });

  it("votes 5.7 and 5.70 together", () => {
    const c = new Consensus();
    for (let i = 0; i < 4; i++) c.add(read({ protein: i % 2 ? 5.7 : 5.700001 }));
    expect(c.fields().protein).toMatchObject({ value: 5.7, settled: true });
  });
});

describe("plausibility", () => {
  it("down-weights a frame whose calories do not add up", () => {
    const c = new Consensus();
    // Calories misread as 9947: five frames of it must not beat three plausible ones
    for (let i = 0; i < 5; i++) c.add(read({ ...TRUE_VALUES, calories: 9947 }));
    for (let i = 0; i < 4; i++) c.add(read(TRUE_VALUES));
    expect(c.fields().calories).toMatchObject({ value: 116, settled: true });
  });

  it("down-weights a sub-nutrient above its parent", () => {
    const c = new Consensus();
    for (let i = 0; i < 6; i++) c.add(read({ ...TRUE_VALUES, sugar: 40 }));
    for (let i = 0; i < 4; i++) c.add(read({ ...TRUE_VALUES, sugar: 4 }));
    expect(c.fields().sugar).toMatchObject({ value: 4, settled: true });
  });

  it("down-weights fields whose per-serve and per-100 g figures disagree", () => {
    const c = new Consensus();
    for (let i = 0; i < 6; i++) c.add(read({ ...TRUE_VALUES, fat: 11 }, { conflicts: ["fat"] }));
    for (let i = 0; i < 4; i++) c.add(read(TRUE_VALUES));
    expect(c.fields().fat).toMatchObject({ value: 3, settled: true });
  });

  it("re-reads the least supported key value when the settled four do not add up", () => {
    const c = new Consensus();
    // Every frame is self-consistent in weight terms only because each is off; the settled set contradicts
    for (let i = 0; i < 4; i++) c.add(read({ calories: 500, protein: 6, carbs: 15, fat: 3 }, { conflicts: ["calories"] }));
    for (let i = 0; i < 12; i++) c.add(read({ protein: 6, carbs: 15, fat: 3 }));
    const f = c.fields();
    expect(f.calories?.settled).toBe(false);
    expect(f.protein?.settled).toBe(true);
  });

  it("keeps per-serve and per-100 g figures apart", () => {
    const c = new Consensus();
    // Frames that fell back to the per-100 g column are another basis: they do not compete with the per-serve readings
    for (let i = 0; i < 6; i++) c.add(read({ ...TRUE_VALUES, servingGrams: 30 }));
    for (let i = 0; i < 5; i++) c.add(read({ calories: 387, protein: 19, carbs: 49, fat: 11, servingGrams: 100 }));
    const f = c.fields();
    expect(f.fat).toMatchObject({ value: 3, settled: true, agree: 6, reads: 6 });
    expect(c.result()).toMatchObject({ values: TRUE_VALUES, servingGrams: 30 });
  });
});

describe("serving size and the result", () => {
  it("votes on the serving size and label", () => {
    const c = new Consensus();
    for (let i = 0; i < 4; i++) c.add(read({ ...TRUE_VALUES, servingGrams: 30, servingLabel: i === 0 ? "1 Bar" : "1 bar" }));
    expect(c.result()).toMatchObject({ values: TRUE_VALUES, servingGrams: 30, servingLabel: "1 bar", frames: 4 });
  });

  it("builds votes from a parsed label", () => {
    const scan = parseLabel("Nutrition Facts\nServing size 1 bar (40g)\nCalories 190\nTotal Fat 7g\nTotal Carbohydrate 22g\nProtein 5g");
    const r = frameRead(scan, 88, 0.9);
    expect(r.values).toMatchObject({ calories: 190, protein: 5, servingGrams: 40 });
    expect(r.confidence).toBe(88);
  });
});

describe("mergeConsensus", () => {
  it("lets settled values win and keeps the rest of the read", () => {
    const scan = parseLabel("Nutrition Facts\nServing size 1 bar (40g)\nCalories 190\nTotal Fat 7g\nTotal Carbohydrate 22g\nProtein 5g\nSugars 9g");
    const merged = mergeConsensus(scan, { values: { protein: 6 }, servingGrams: 45, frames: 5 });
    expect(merged.values.protein).toBe(6);
    expect(merged.values.calories).toBe(190);
    expect(merged.values.sugar).toBe(9);
    expect(merged.servingGrams).toBe(45);
    expect(mergeConsensus(scan, undefined)).toBe(scan);
  });
});

describe("disagreements", () => {
  it("lists settled values that the photo read differently", () => {
    const scan = parseLabel("Nutrition Facts\nServing size 1 bar (40g)\nCalories 190\nTotal Fat 7g\nTotal Carbohydrate 22g\nProtein 5g");
    expect(disagreements(scan, { values: { protein: 6, fat: 7, sugar: 3 }, frames: 5 })).toEqual([{ field: "protein", live: 6, photo: 5 }]);
    expect(disagreements(scan, undefined)).toEqual([]);
  });
});

describe("frame gate", () => {
  it("skips blurry frames", () => {
    const g = new FrameGate();
    expect(g.check(900, 0).pass).toBe(true);
    expect(g.check(30, 0)).toMatchObject({ pass: false, reason: "blurry" });
    // Soft compared with the recent best, even if it is bright enough on its own
    expect(g.check(300, 0)).toMatchObject({ pass: false, reason: "blurry" });
    expect(g.check(800, 0).pass).toBe(true);
  });
  it("skips frames while the phone moves", () => {
    const g = new FrameGate();
    expect(g.check(900, 30)).toMatchObject({ pass: false, reason: "moving" });
    expect(g.check(900, 2).pass).toBe(true);
  });
  it("rates sharper frames higher, up to a cap", () => {
    const g = new FrameGate();
    expect(g.check(200, 0).quality).toBeLessThan(g.check(5000, 0).quality);
    expect(g.check(5000, 0).quality).toBe(1);
  });
});

describe("laplacianVariance", () => {
  const stripes = (w: number, h: number, blur: boolean) => {
    const g = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = blur ? 128 + 20 * Math.sin(x / 6) : x % 4 < 2 ? 20 : 235;
    return g;
  };
  it("is high for crisp edges and low for a blur", () => {
    expect(laplacianVariance(stripes(40, 40, false), 40, 40)).toBeGreaterThan(10 * laplacianVariance(stripes(40, 40, true), 40, 40));
    expect(laplacianVariance(new Uint8Array(100).fill(90), 10, 10)).toBe(0);
  });
});

describe("frame pool", () => {
  it("keeps the best looking frames and picks the one that agrees with the consensus", () => {
    const pool = new FramePool<string>(2);
    pool.add("sharp-misread", read({ ...TRUE_VALUES, protein: 8, sugar: 4 }, { quality: 1 }));
    pool.add("sharp-right", read({ ...TRUE_VALUES, sugar: 4 }, { quality: 0.9 }));
    pool.add("empty", read({}));
    pool.add("soft-right", read(TRUE_VALUES, { quality: 0.3 }));
    expect(pool.best({ values: TRUE_VALUES, frames: 5 })).toBe("sharp-right");
  });
  it("prefers the sharper of two frames that agree equally", () => {
    const pool = new FramePool<string>();
    pool.add("soft", read(TRUE_VALUES, { quality: 0.4 }));
    pool.add("sharp", read(TRUE_VALUES, { quality: 1 }));
    expect(pool.best({ values: TRUE_VALUES, frames: 5 })).toBe("sharp");
    expect(pool.best({ values: {}, frames: 0 })).toBe("sharp");
    expect(new FramePool<string>().best({ values: {}, frames: 0 })).toBeUndefined();
  });
  it("counts a contradiction worse than a match", () => {
    expect(agreementWith(read({ protein: 6, fat: 4 }), { values: { protein: 6, fat: 3 }, frames: 1 })).toBe(-1);
  });
});
