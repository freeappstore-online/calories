import { describe, expect, it } from "vitest";
import { orderQuad, quadContains, rectQuad, spanQuad } from "./geometry";
import { piecesOf } from "./florence";
import { boxQuad, ctcDecode, detBoxes, detSize, pieceLines, type Piece, type TextBox } from "./paddlePipeline";
import { linesOfPage } from "./tesseract";
import type { OcrLine } from "./types";

describe("geometry", () => {
  const line: OcrLine = { text: "Protein 5.7 g", conf: 90, quad: rectQuad(100, 50, 200, 70) };

  it("slices a line evenly when the engine gave no character positions", () => {
    const q = spanQuad(line, 8, 13);
    expect(q[0][0]).toBeCloseTo(100 + (8 / 13) * 100, 0);
    expect(q[1][0]).toBeCloseTo(200, 0);
    expect(q[0][1]).toBe(50);
    expect(q[3][1]).toBe(70);
  });

  it("uses the engine's character positions when it has them", () => {
    const charX = Array.from({ length: 14 }, (_, i) => (i < 8 ? i * 0.05 : 0.4 + (i - 8) * 0.12));
    const q = spanQuad({ ...line, charX }, 8, 13);
    expect(q[0][0]).toBeCloseTo(100 + 40, 0);
    expect(q[1][0]).toBeCloseTo(100 + 100 * 0.4 + 5 * 12, 0);
  });

  it("follows a tilted line", () => {
    const tilted: OcrLine = { text: "abcd", conf: null, quad: [[0, 0], [100, 10], [100, 30], [0, 20]] };
    const q = spanQuad(tilted, 2, 4);
    expect(q[0][1]).toBeCloseTo(5, 0);
    expect(q[3][1]).toBeCloseTo(25, 0);
  });

  it("orders corners whatever order they arrive in", () => {
    const q = orderQuad([[10, 20], [0, 0], [10, 0], [0, 20]]);
    expect(q).toEqual([[0, 0], [10, 0], [10, 20], [0, 20]]);
  });

  it("tests whether a point is inside a quad", () => {
    expect(quadContains(rectQuad(0, 0, 10, 10), [5, 5])).toBe(true);
    expect(quadContains(rectQuad(0, 0, 10, 10), [11, 5])).toBe(false);
  });
});

describe("Tesseract page layout", () => {
  const word = (text: string, x0: number, x1: number, symbols?: { text: string; x0: number }[]) => ({
    text,
    confidence: 90,
    bbox: { x0, y0: 10, x1, y1: 30 },
    symbols: symbols?.map((s) => ({ text: s.text, bbox: { x0: s.x0, y0: 10, x1: s.x0 + 5, y1: 30 } })),
  });
  const page = {
    text: "",
    blocks: [
      {
        paragraphs: [
          {
            lines: [
              { text: "Protein 5.7 g\n", confidence: 88, bbox: { x0: 100, y0: 10, x1: 300, y1: 30 }, words: [word("Protein", 100, 170, [{ text: "P", x0: 100 }, { text: "r", x0: 110 }, { text: "o", x0: 120 }, { text: "t", x0: 130 }, { text: "e", x0: 140 }, { text: "i", x0: 150 }, { text: "n", x0: 160 }]), word("5.7", 200, 240), word("g", 260, 300)] },
              { text: " \n", confidence: 0, bbox: { x0: 0, y0: 40, x1: 10, y1: 50 }, words: [word(" ", 0, 10)] },
            ],
          },
        ],
      },
    ],
  };

  it("turns words into single-spaced lines with character positions and drops blank lines", () => {
    const lines = linesOfPage(page);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe("Protein 5.7 g");
    expect(lines[0]!.conf).toBe(88);
    const cx = lines[0]!.charX!;
    expect(cx).toHaveLength(14);
    // "5" starts where the word 5.7 starts: (200 - 100) / 200
    expect(cx[8]).toBeCloseTo(0.5, 5);
    expect(cx[13]).toBeCloseTo(1, 5);
    // "e" has its own symbol box
    expect(cx[4]).toBeCloseTo(0.2, 5);
  });
});

describe("PaddleOCR pipeline", () => {
  it("rounds the detector's input up to multiples of 32 and caps the long side", () => {
    expect(detSize(1000, 700, 1088)).toEqual({ w: 1024, h: 704 });
    expect(detSize(2200, 1100, 1088)).toEqual({ w: 1088, h: 544 });
    expect(detSize(10, 10, 1088)).toEqual({ w: 32, h: 32 });
  });

  it("finds a text box in a probability map, grown a little, and ignores faint blobs", () => {
    const w = 200, h = 100;
    const prob = new Float32Array(w * h);
    for (let y = 40; y < 50; y++) for (let x = 50; x < 150; x++) prob[y * w + x] = 0.9;
    for (let y = 80; y < 90; y++) for (let x = 20; x < 60; x++) prob[y * w + x] = 0.4;
    const boxes = detBoxes(prob, w, h);
    expect(boxes).toHaveLength(1);
    const b = boxes[0]!;
    expect(b.cx).toBeCloseTo(99.5, 0);
    expect(b.cy).toBeCloseTo(44.5, 0);
    expect(b.w).toBeGreaterThan(100);
    expect(b.h).toBeGreaterThan(10);
    expect(Math.abs(b.angle)).toBeLessThan(0.05);
  });

  it("follows tilted text", () => {
    const w = 300, h = 300;
    const prob = new Float32Array(w * h);
    const slope = Math.tan(0.2);
    for (let x = 50; x < 250; x++) for (let t = -4; t <= 4; t++) prob[Math.round(100 + (x - 50) * slope + t) * w + x] = 0.9;
    const b = detBoxes(prob, w, h)[0]!;
    expect(b.angle).toBeCloseTo(0.2, 1);
  });

  it("gives short pieces the tilt of the long lines instead of their own unreliable one", () => {
    const w = 400, h = 200;
    const prob = new Float32Array(w * h);
    const slope = Math.tan(0.1);
    // Two long lines tilted by 0.1 rad, and a blob that on its own points the other way
    for (const y0 of [50, 120]) for (let x = 20; x < 380; x++) for (let t = -4; t <= 4; t++) prob[Math.round(y0 + (x - 20) * slope + t) * w + x] = 0.9;
    for (let y = 150; y < 170; y++) for (let x = 20; x < 56; x++) if (x - 20 < (y - 150) * 1.5 + 8) prob[y * w + x] = 0.9;
    const boxes = detBoxes(prob, w, h);
    expect(boxes).toHaveLength(3);
    for (const b of boxes) expect(b.angle).toBeCloseTo(0.1, 1);
  });

  it("decodes CTC output: blanks and repeats collapse, the last class is a space", () => {
    // classes: 0 blank, 1 "a", 2 "b", 3 " "
    const rows = [[0.1, 0.9, 0, 0], [0.1, 0.9, 0, 0], [0.9, 0.1, 0, 0], [0.1, 0.9, 0, 0], [0, 0, 0, 0.8], [0, 0, 0.7, 0]];
    const d = ctcDecode(new Float32Array(rows.flat()), rows.length, 4, ["a", "b"]);
    expect(d.text).toBe("aa b");
    expect(d.centres).toHaveLength(4);
    expect(d.conf).toBeCloseTo((0.9 + 0.9 + 0.8 + 0.7) / 4, 5);
  });

  const piece = (text: string, cx: number, cy: number, w: number, angle = 0): Piece => ({
    text,
    conf: 0.9,
    box: { cx, cy, w, h: 20, angle },
    centres: Array.from({ length: text.length }, (_, i) => (i + 0.5) / text.length),
  });

  it("joins the cells of a table row into one line, left to right, rows top to bottom", () => {
    const lines = pieceLines([piece("19.0 g", 300, 102, 60), piece("Protein", 60, 100, 100), piece("Energy", 55, 60, 90), piece("5.7 g", 180, 99, 50), piece("1620 kJ", 300, 62, 70)], 400, 200);
    expect(lines.map((l) => l.text)).toEqual(["Energy 1620 kJ", "Protein 5.7 g 19.0 g"]);
    const protein = lines[1]!;
    expect(protein.conf).toBeCloseTo(90, 5);
    expect(protein.charX).toHaveLength(protein.text.length + 1);
    // Characters run left to right through the row
    const cx = protein.charX!;
    for (let i = 1; i < cx.length; i++) expect(cx[i]!).toBeGreaterThanOrEqual(cx[i - 1]!);
    expect(cx[0]).toBeCloseTo(0, 1);
    expect(cx[cx.length - 1]).toBeCloseTo(1, 1);
  });

  it("groups tilted rows by the text's own tilt", () => {
    const tilt = 0.1;
    const at = (u: number, v: number): [number, number] => [200 + u * Math.cos(tilt) - v * Math.sin(tilt), 100 + u * Math.sin(tilt) + v * Math.cos(tilt)];
    const mk = (text: string, u: number, v: number): Piece => {
      const [cx, cy] = at(u, v);
      return piece(text, cx, cy, 120, tilt);
    };
    const lines = pieceLines([mk("Fat", -150, 0), mk("3.3 g", 100, 0), mk("Protein", -150, 40), mk("5.7 g", 100, 40)], 500, 300);
    expect(lines.map((l) => l.text)).toEqual(["Fat 3.3 g", "Protein 5.7 g"]);
  });

  it("lines cells up in a photo taken at an angle, where rows climb to the right though no single box says so", () => {
    const slope = -0.05;
    const row = (label: string, value: string, y: number) => [piece(label, 100, y, 90), piece(value, 600, y + slope * 500, 90)];
    const pieces = [row("Energy", "485 kJ", 100), row("Protein", "5.7 g", 150), row("Fat", "3.3 g", 200), row("Sodium", "135 mg", 250)].flat().map((p) => ({ ...p, box: { ...p.box, h: 24 } }));
    const lines = pieceLines(pieces, 800, 400);
    expect(lines.map((l) => l.text)).toEqual(["Energy 485 kJ", "Protein 5.7 g", "Fat 3.3 g", "Sodium 135 mg"]);
  });

  it("does not glue neighbouring rows together", () => {
    const pieces = [piece("Fat 3 g", 100, 100, 100), piece("Sat 1 g", 100, 130, 100), piece("Carb 9 g", 100, 160, 100)].map((p) => ({ ...p, box: { ...p.box, h: 24 } }));
    expect(pieceLines(pieces, 800, 400).map((l) => l.text)).toEqual(["Fat 3 g", "Sat 1 g", "Carb 9 g"]);
  });

  it("drops empty pieces and gives no confidence when the model reports none", () => {
    const quiet: Piece = { ...piece("Fat 3 g", 100, 50, 80), conf: null, centres: [] };
    const lines = pieceLines([quiet, piece("  ", 10, 10, 10)], 200, 100);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.conf).toBeNull();
    expect(lines[0]!.charX).toHaveLength(lines[0]!.text.length + 1);
  });

  it("turns a box into corners", () => {
    const b: TextBox = { cx: 50, cy: 50, w: 20, h: 10, angle: 0 };
    expect(boxQuad(b)).toEqual([[40, 45], [60, 45], [60, 55], [40, 55]]);
  });
});

describe("Florence-2 output", () => {
  // Quads as the model gives them: x1 y1 x2 y2 x3 y3 x4 y4, here starting from the top-left and going round
  const quad = (x: number, y: number, w: number) => [x, y, x + w, y, x + w, y + 20, x, y + 20];

  it("turns each labelled quad into a piece with the box it sits in", () => {
    const pieces = piecesOf({ labels: ["Protein", "5.7 g"], quad_boxes: [quad(100, 200, 120), quad(400, 202, 60)] });
    expect(pieces.map((p) => p.text)).toEqual(["Protein", "5.7 g"]);
    expect(pieces[0]!.box).toMatchObject({ cx: 160, cy: 210, w: 120, h: 20 });
    expect(pieces[0]!.conf).toBeNull();
  });

  it("skips quads that are incomplete and copes with no output at all", () => {
    expect(piecesOf({ labels: ["a", "b"], quad_boxes: [[1, 2, 3], quad(0, 0, 10)] }).map((p) => p.text)).toEqual(["b"]);
    expect(piecesOf(undefined)).toEqual([]);
  });

  it("makes a table row out of cells, the way the other engines' lines are", () => {
    const pieces = piecesOf({ labels: ["Protein", "5.7 g", "19.0 g", "Fat", "3.3 g"], quad_boxes: [quad(100, 200, 120), quad(400, 202, 60), quad(600, 199, 70), quad(100, 250, 40), quad(400, 251, 50)] });
    expect(pieceLines(pieces, 800, 400).map((l) => l.text)).toEqual(["Protein 5.7 g 19.0 g", "Fat 3.3 g"]);
  });
});
