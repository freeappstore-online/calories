import { beforeEach, describe, expect, it } from "vitest";
import { parseLabel } from "../labelParser";
import { assess, type Attempt } from "../ocr/chain";
import { rectQuad } from "../ocr/geometry";
import type { EngineId, OcrLine, OcrResult } from "../ocr/types";
import { accuracyOf, chainPick, describeScan, itemAccuracy, overallAccuracy, percent, suggestName, verdict } from "./accuracy";
import {
  createItem, deleteItem, exportLab, getItem, itemAccuracyOf, itemReport, itemSummary, labAccuracy, listItems, memoryDb, readsOf, setCorrect, setLabDb,
  setPhoto, storageBytes, subscribeLab, updateItem, withRead, type LabPhoto,
} from "./store";

const GOOD = `Serving size: 30 g
per Serving per 100 g
Energy 485 kJ 1620 kJ
Protein 5.7 g 19.0 g
Fat, total 3.3 g 11.0 g
Carbohydrate 14.7 g 49.0 g`;

const result = (text: string, conf: number | null = 90): OcrResult => ({
  width: 100,
  height: 100,
  lines: text.split("\n").map((t, i) => ({ text: t, conf, quad: rectQuad(0, i * 10, 100, i * 10 + 9) })),
});

const attempt = (engine: EngineId, text: string, conf = 90): Attempt => assess(engine, result(text, conf), 1200);
const failed = (engine: EngineId): Attempt => ({ engine, ms: 50, confidence: null, good: false, error: "boom" });
const photo = (bytes = 10): LabPhoto => ({ original: new Blob([new Uint8Array(bytes * 2)]), small: new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), width: 800, height: 600 });

describe("accuracy", () => {
  const good = parseLabel(GOOD);

  it("judges a value right, wrong or missing", () => {
    expect(verdict(5.7, 5.7)).toBe("right");
    expect(verdict(5.72, 5.7)).toBe("right");
    expect(verdict(57, 5.7)).toBe("wrong");
    expect(verdict(undefined, 5.7)).toBe("missing");
  });

  it("counts fields against the correct values, including the serving size", () => {
    const acc = accuracyOf({ protein: 5.7, fat: 3.3, carbs: 99, fiber: 2, servingGrams: 30 }, good);
    expect(acc).toEqual({ total: 5, right: 3, wrong: 1, missing: 1 });
    expect(percent(acc)).toBe(60);
  });

  it("scores a failed read as every field missing", () => {
    expect(accuracyOf({ protein: 5.7 }, undefined)).toEqual({ total: 1, right: 0, wrong: 0, missing: 1 });
  });

  it("has no percentage without correct values", () => {
    expect(percent(accuracyOf({}, good))).toBeNull();
    expect(itemAccuracy({}, [attempt("paddle", GOOD)])).toBeNull();
  });

  it("picks what the chain would keep: the first good read in chain order, not a later better one", () => {
    const weak = attempt("paddle", "Protein 5.7 g", 90);
    const strong = attempt("tesseract", GOOD);
    expect(weak.good).toBe(false);
    expect(chainPick([strong, weak])?.engine).toBe("tesseract");
    const strongPaddle = attempt("paddle", GOOD);
    expect(chainPick([strong, strongPaddle])?.engine).toBe("paddle");
    expect(chainPick([failed("paddle")])).toBeUndefined();
  });

  it("scores each model and the chain, and sums them over items", () => {
    // Both columns agree on the wrong figure, so the chain trusts it: the lab is what shows it is wrong
    const wrongProtein = GOOD.replace("Protein 5.7 g 19.0 g", "Protein 6.7 g 22.3 g");
    const acc = itemAccuracy({ protein: 5.7, fat: 3.3 }, [attempt("paddle", wrongProtein), attempt("tesseract", GOOD), failed("florence")])!;
    expect(acc.byEngine.paddle).toMatchObject({ right: 1, wrong: 1 });
    expect(acc.byEngine.tesseract).toMatchObject({ right: 2 });
    expect(acc.byEngine.florence).toMatchObject({ missing: 2 });
    expect(acc.chainEngine).toBe("paddle");
    const all = overallAccuracy([acc, null, itemAccuracy({ protein: 5.7 }, [attempt("paddle", GOOD)])]);
    expect(all.items).toBe(2);
    expect(all.byEngine.paddle).toMatchObject({ total: 3, right: 2 });
    expect(all.chain).toMatchObject({ total: 3, right: 2 });
  });

  it("names the food from the biggest text on the front, tidying capitals", () => {
    const line = (text: string, y: number, h: number): OcrLine => ({ text, conf: 90, quad: rectQuad(0, y, 200, y + h) });
    const lines = [line("GOLDEN OAT", 20, 60), line("CRUNCH BARS", 90, 58), line("Net wt 40g", 300, 12), line("Gluten free snack made with real honey", 200, 14)];
    expect(suggestName(lines)).toBe("Golden Oat Crunch Bars");
    expect(suggestName([line("12345", 0, 50)])).toBe("");
    expect(suggestName([])).toBe("");
  });

  it("describes a read with the text each value came from", () => {
    const d = describeScan(good, result(GOOD).lines);
    expect(d.values.protein).toBe(5.7);
    expect(d.values.servingGrams).toBe(30);
    expect(d.provenance.protein).toMatchObject({ name: "Protein" });
    expect(d.provenance.protein?.figure).toContain("5.7");
  });
});

describe("scan lab store", () => {
  beforeEach(() => setLabDb(memoryDb()));

  it("creates, lists newest first, renames and deletes items, telling subscribers", async () => {
    let changes = 0;
    const off = subscribeLab(() => changes++);
    const a = await createItem("  Oat bar  ", { nutrition: photo() });
    await new Promise((r) => setTimeout(r, 2));
    const b = await createItem("Yogurt");
    expect(a.name).toBe("Oat bar");
    expect((await listItems()).map((i) => i.name)).toEqual(["Yogurt", "Oat bar"]);
    await updateItem(a.id, (i) => ({ ...i, name: "Renamed" }));
    expect((await getItem(a.id))?.name).toBe("Renamed");
    await deleteItem(b.id);
    expect(await getItem(b.id)).toBeUndefined();
    expect(changes).toBe(4);
    off();
  });

  it("keeps one read per photo and model, and drops a photo's reads when the photo is replaced", async () => {
    let item = await createItem("x", { nutrition: photo(), front: photo() });
    const at = (engine: EngineId, text: string) => ({ photo: "nutrition" as const, engine, ranAt: 1, attempt: attempt(engine, text) });
    item = withRead(withRead(item, at("paddle", "Protein 1 g")), at("paddle", GOOD));
    item = withRead(item, { photo: "front", engine: "paddle", ranAt: 1, attempt: attempt("paddle", "Oat Bar") });
    expect(item.reads).toHaveLength(2);
    expect(readsOf(item, "nutrition")[0]?.scan?.values.protein).toBe(5.7);
    await updateItem(item.id, () => item);
    const replaced = await setPhoto(item.id, "nutrition", photo(20));
    expect(replaced?.reads.map((r) => r.photo)).toEqual(["front"]);
  });

  it("does not lose a change when two are made at once (a front and a nutrition photo added together)", async () => {
    const item = await createItem("x");
    await Promise.all([setPhoto(item.id, "front", photo()), setPhoto(item.id, "nutrition", photo()), setCorrect(item.id, { protein: 1 })]);
    const after = (await getItem(item.id))!;
    expect(after.front && after.nutrition).toBeTruthy();
    expect(after.correct).toEqual({ protein: 1 });
  });

  it("merges correct values and clears one with null", async () => {
    const item = await createItem("x");
    await setCorrect(item.id, { calories: 116, protein: 5.7 });
    const after = await setCorrect(item.id, { protein: null, fat: 3.3 });
    expect(after?.correct).toEqual({ calories: 116, fat: 3.3 });
    expect(await setCorrect("missing", { fat: 1 })).toBeUndefined();
  });

  it("measures accuracy per item and overall from the stored reads", async () => {
    let item = await createItem("x", { nutrition: photo() });
    item = withRead(item, { photo: "nutrition", engine: "paddle", ranAt: 1, attempt: attempt("paddle", GOOD) });
    item = (await updateItem(item.id, () => item))!;
    item = (await setCorrect(item.id, { protein: 5.7, fat: 9 }))!;
    expect(itemAccuracyOf(item)?.chain).toMatchObject({ total: 2, right: 1, wrong: 1 });
    expect(labAccuracy([item, await createItem("no values")]).items).toBe(1);
    expect(itemSummary(item)).toMatchObject({ name: "x", hasCorrectValues: true, chainPercentRight: 50, engines: ["paddle"] });
  });

  it("reports sizes of stored photos", async () => {
    const item = await createItem("x", { nutrition: photo(100), front: photo(50) });
    expect(storageBytes([item])).toBe(100 * 3 + 50 * 3);
  });

  it("exports photos as data URLs with every read, boxes, correct values and accuracy", async () => {
    let item = await createItem("Oat bar", { nutrition: photo(5) });
    item = withRead(item, { photo: "nutrition", engine: "paddle", ranAt: 1000, attempt: attempt("paddle", GOOD) });
    item = withRead(item, { photo: "nutrition", engine: "florence", ranAt: 1000, attempt: failed("florence") });
    await updateItem(item.id, () => item);
    item = (await setCorrect(item.id, { protein: 5.7 }))!;
    const file = await exportLab([item]);
    expect(file).toMatchObject({ app: "calories", kind: "scan-lab", version: 1 });
    const out = file.items[0]!;
    expect(out.photos["nutrition"]!.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(out.reads).toHaveLength(2);
    expect(out.reads[0]!.lines?.[0]?.box).toHaveLength(4);
    expect(out.reads[0]!.chainPick).toBe(true);
    expect(out.reads[0]!.parsed?.values.protein).toBe(5.7);
    expect(out.reads[1]!.error).toBe("boom");
    expect(out.accuracy?.chain?.percentRight).toBe(100);
    expect(out.accuracy?.byEngine["florence"]).toMatchObject({ missing: 1 });
    // The report without photos or boxes (what an AI first sees) is small
    expect(JSON.stringify(itemReport(item, false))).not.toContain("base64");
    expect(itemReport(item, false).reads[0]!.lines).toBeUndefined();
  });
});
