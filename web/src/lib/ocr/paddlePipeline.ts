import { normaliseText } from "./geometry";
import type { OcrLine, Point, Quad, Rgba } from "./types";

/**
 * The parts of PaddleOCR (PP-OCR: DB text detection, then CTC text recognition) that are not the neural networks:
 * preparing the image, turning the detector's probability map into text boxes, cutting the lines out, decoding the
 * recogniser's output and putting boxes in reading order. Pure functions on typed arrays, so they run (and are
 * tested) without a browser.
 */

/** A text box: centre, extent along the text direction (u) and across it (v), tilt of the text in radians */
export interface TextBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number;
}

const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD = [0.229, 0.224, 0.225];

/** Scale to fit `maxSide`, sides rounded up to multiples of 32 as the detector requires */
export function detSize(width: number, height: number, maxSide: number): { w: number; h: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const round = (v: number) => Math.max(32, Math.ceil((v * scale) / 32) * 32);
  return { w: round(width), h: round(height) };
}

/** Resize: area average when shrinking, bilinear otherwise */
export function resizeRgba(src: Rgba, w: number, h: number): Rgba {
  const out = new Uint8ClampedArray(w * h * 4);
  const sx = src.width / w;
  const sy = src.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = y * sy;
    const y1 = Math.min(src.height, (y + 1) * sy);
    for (let x = 0; x < w; x++) {
      const x0 = x * sx;
      const x1 = Math.min(src.width, (x + 1) * sx);
      const o = (y * w + x) * 4;
      if (sx > 1.2 || sy > 1.2) {
        let r = 0, g = 0, b = 0, area = 0;
        for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
          const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
          for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
            const wt = wy * (Math.min(xx + 1, x1) - Math.max(xx, x0));
            const i = (yy * src.width + xx) * 4;
            r += src.data[i]! * wt;
            g += src.data[i + 1]! * wt;
            b += src.data[i + 2]! * wt;
            area += wt;
          }
        }
        out[o] = r / area;
        out[o + 1] = g / area;
        out[o + 2] = b / area;
      } else {
        const [r, g, b] = sample(src, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5);
        out[o] = r;
        out[o + 1] = g;
        out[o + 2] = b;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/** Bilinear sample of an RGB triple (edge pixels repeat) */
function sample(img: Rgba, x: number, y: number): [number, number, number] {
  const xf = Math.min(Math.max(x, 0), img.width - 1);
  const yf = Math.min(Math.max(y, 0), img.height - 1);
  const x0 = Math.floor(xf);
  const y0 = Math.floor(yf);
  const x1 = Math.min(x0 + 1, img.width - 1);
  const y1 = Math.min(y0 + 1, img.height - 1);
  const fx = xf - x0;
  const fy = yf - y0;
  const d = img.data;
  const px = (xx: number, yy: number, c: number) => d[(yy * img.width + xx) * 4 + c]!;
  const mix = (c: number) =>
    (px(x0, y0, c) * (1 - fx) + px(x1, y0, c) * fx) * (1 - fy) + (px(x0, y1, c) * (1 - fx) + px(x1, y1, c) * fx) * fy;
  return [mix(0), mix(1), mix(2)];
}

/** Detector input: planar float RGB, normalised */
export function detTensor(img: Rgba): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) out[c * n + i] = (img.data[i * 4 + c]! / 255 - DET_MEAN[c]!) / DET_STD[c]!;
  }
  return out;
}

export interface DetOptions {
  /** Pixels above this probability are text */
  threshold?: number;
  /** Boxes whose mean probability is lower are dropped */
  boxScore?: number;
  /** How far boxes grow (the detector predicts shrunken text kernels) */
  unclip?: number;
}

/** Text boxes, in the detector map's pixels, from its probability map */
export function detBoxes(prob: Float32Array, w: number, h: number, opts: DetOptions = {}): TextBox[] {
  const { threshold = 0.3, boxScore = 0.6, unclip = 1.6 } = opts;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const found: number[][] = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || prob[start]! <= threshold) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const members: number[] = [];
    let sum = 0;
    while (top > 0) {
      const p = stack[--top]!;
      members.push(p);
      sum += prob[p]!;
      const x = p % w;
      const y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (!seen[q] && prob[q]! > threshold) {
            seen[q] = 1;
            stack[top++] = q;
          }
        }
      }
    }
    if (members.length < 12 || sum / members.length < boxScore) continue;
    found.push(members);
  }
  // A long line shows its tilt clearly; a short piece ("14 g") does not, so it takes the tilt of the lines
  const fitted = found.map((members) => orientedBox(members, w));
  const tilts = fitted.filter((b) => b.w > 4 * b.h).map((b) => b.angle).sort((a, b) => a - b);
  const tilt = tilts.length ? tilts[Math.floor(tilts.length / 2)]! : null;
  const boxes: TextBox[] = [];
  found.forEach((members, i) => {
    const box = tilt !== null && fitted[i]!.w <= 4 * fitted[i]!.h ? orientedBox(members, w, tilt) : fitted[i]!;
    if (Math.min(box.w, box.h) < 3) return;
    // Unclip: grow by area * ratio / perimeter on every side
    const d = (box.w * box.h * unclip) / (2 * (box.w + box.h));
    boxes.push({ ...box, w: box.w + 2 * d, h: box.h + 2 * d });
  });
  return boxes;
}

/** Smallest rectangle around some pixels that follows their main direction (kept within 45 degrees of horizontal), or `fixedAngle` */
function orientedBox(members: number[], width: number, fixedAngle?: number): TextBox {
  let mx = 0, my = 0;
  for (const p of members) {
    mx += p % width;
    my += Math.floor(p / width);
  }
  mx /= members.length;
  my /= members.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of members) {
    const dx = (p % width) - mx;
    const dy = Math.floor(p / width) - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  let angle = fixedAngle ?? 0.5 * Math.atan2(2 * sxy, sxx - syy);
  if (angle > Math.PI / 4) angle -= Math.PI / 2;
  else if (angle < -Math.PI / 4) angle += Math.PI / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of members) {
    const dx = (p % width) - mx;
    const dy = Math.floor(p / width) - my;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    if (u < u0) u0 = u;
    if (u > u1) u1 = u;
    if (v < v0) v0 = v;
    if (v > v1) v1 = v;
  }
  // Pixels are cells with size: extent is inclusive
  const w = u1 - u0 + 1;
  const h = v1 - v0 + 1;
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  return { cx: mx + cu * cos - cv * sin, cy: my + cu * sin + cv * cos, w, h, angle };
}

export const scaleBox = (b: TextBox, sx: number, sy: number): TextBox => {
  // Boxes are scaled uniformly in practice (the detector map keeps the aspect ratio up to rounding)
  const s = (sx + sy) / 2;
  return { cx: b.cx * sx, cy: b.cy * sy, w: b.w * s, h: b.h * s, angle: b.angle };
};

export function boxQuad(b: TextBox): Quad {
  const cos = Math.cos(b.angle);
  const sin = Math.sin(b.angle);
  const at = (u: number, v: number): Point => [b.cx + u * cos - v * sin, b.cy + u * sin + v * cos];
  return [at(-b.w / 2, -b.h / 2), at(b.w / 2, -b.h / 2), at(b.w / 2, b.h / 2), at(-b.w / 2, b.h / 2)];
}

/** Recogniser input height, and the widest line it is given */
export const REC_HEIGHT = 48;
const REC_MAX_WIDTH = 1920;

/** A line cut straight out of the photo, scaled to the recogniser's height, as planar float RGB in -1..1 */
export function cropLine(img: Rgba, box: TextBox): { data: Float32Array; width: number } {
  const w = Math.min(REC_MAX_WIDTH, Math.max(16, Math.round((REC_HEIGHT * box.w) / box.h)));
  const out = new Float32Array(3 * REC_HEIGHT * w);
  const cos = Math.cos(box.angle);
  const sin = Math.sin(box.angle);
  const n = REC_HEIGHT * w;
  for (let y = 0; y < REC_HEIGHT; y++) {
    const v = ((y + 0.5) / REC_HEIGHT - 0.5) * box.h;
    for (let x = 0; x < w; x++) {
      const u = ((x + 0.5) / w - 0.5) * box.w;
      const [r, g, b] = sample(img, box.cx + u * cos - v * sin, box.cy + u * sin + v * cos);
      const i = y * w + x;
      out[i] = (r / 255 - 0.5) / 0.5;
      out[n + i] = (g / 255 - 0.5) / 0.5;
      out[2 * n + i] = (b / 255 - 0.5) / 0.5;
    }
  }
  return { data: out, width: w };
}

export interface Decoded {
  text: string;
  /** Mean probability of the characters read, 0..1 */
  conf: number;
  /** Centre of each character along the line as a fraction 0..1 */
  centres: number[];
}

/**
 * Greedy CTC decoding. Class 0 is "blank", classes 1..n are the dictionary, and the class after them is the space.
 * `logits` is steps x classes (already softmaxed, as the PaddleOCR export ends in a softmax).
 */
export function ctcDecode(logits: Float32Array, steps: number, classes: number, dict: string[]): Decoded {
  const chars = [...dict, " "];
  let text = "";
  let confSum = 0;
  const centres: number[] = [];
  let prev = 0;
  for (let t = 0; t < steps; t++) {
    let best = 0;
    let bestP = -Infinity;
    for (let c = 0; c < classes; c++) {
      const p = logits[t * classes + c]!;
      if (p > bestP) {
        bestP = p;
        best = c;
      }
    }
    if (best !== 0 && best !== prev) {
      const ch = chars[best - 1];
      if (ch !== undefined) {
        text += ch;
        confSum += bestP;
        centres.push((t + 0.5) / steps);
      }
    }
    prev = best;
  }
  return { text, conf: text.length ? confSum / text.length : 0, centres };
}

/** One recognised piece of text with its box */
export interface Piece {
  text: string;
  /** 0..1, or null when the model gives none */
  conf: number | null;
  box: TextBox;
  /** Centre of each character along the box as a fraction 0..1, when known */
  centres: number[];
}

type Framed = { p: Piece; u: number; v: number };

/** Group pieces into printed rows, comparing them in the frame tilted by `tilt` (u along the text, v across it) */
function groupRows(live: Piece[], tilt: number): Framed[][] {
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const framed: Framed[] = live.map((p) => ({ p, u: p.box.cx * cos + p.box.cy * sin, v: -p.box.cx * sin + p.box.cy * cos }));
  framed.sort((a, b) => a.v - b.v);
  const rows: Framed[][] = [];
  for (const f of framed) {
    const row = rows.find((r) => {
      const v = r.reduce((s, x) => s + x.v, 0) / r.length;
      const h = Math.min(f.p.box.h, ...r.map((x) => x.p.box.h));
      return Math.abs(f.v - v) < 0.5 * h;
    });
    if (row) row.push(f);
    else rows.push([f]);
  }
  return rows;
}

/** How badly a grouping fits: every cell's distance from its row's middle, plus a price for each row */
function rowCost(rows: Framed[][], rowPrice: number): number {
  let cost = rows.length * rowPrice;
  for (const r of rows) {
    const mean = r.reduce((s, x) => s + x.v, 0) / r.length;
    for (const x of r) cost += Math.abs(x.v - mean);
  }
  return cost;
}

/**
 * The tilt at which the cells of a table line up best. The boxes' own angles are a good first guess but a photo taken at
 * an angle bends the rows, so a little either side is tried too. Rows too close together are never glued: a tilt that
 * merges them pays for it in how far the cells sit from their row's middle.
 */
function rowTilt(live: Piece[], guess: number): number {
  const heights = live.map((p) => p.box.h).sort((a, b) => a - b);
  const rowPrice = 0.6 * heights[Math.floor(heights.length / 2)]!;
  const guessCost = rowCost(groupRows(live, guess), rowPrice);
  let best = guess;
  let bestCost = guessCost;
  for (let k = -16; k <= 16; k++) {
    const t = guess + k * 0.005;
    const cost = rowCost(groupRows(live, t), rowPrice);
    if (cost < bestCost - 1e-6) {
      best = t;
      bestCost = cost;
    }
  }
  // Only a clear gain counts: a slightly different tilt can also fit by chance
  return bestCost < 0.85 * guessCost ? best : guess;
}

/**
 * Join pieces that sit on the same printed row into one line each, left to right, top to bottom. The detector splits a
 * table row into one box per cell, but the parser wants "Protein 5.7 g 19.0 g" as one line. Boxes are compared in the
 * frame of the text's overall tilt.
 */
export function pieceLines(pieces: Piece[], imageW: number, imageH: number): OcrLine[] {
  const live = pieces.filter((p) => normaliseText(p.text) !== "");
  if (!live.length) return [];
  const long = live.filter((p) => p.box.w > 4 * p.box.h).map((p) => p.box.angle).sort((a, b) => a - b);
  const tilt = rowTilt(live, long.length ? long[Math.floor(long.length / 2)]! : 0);
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const rows = groupRows(live, tilt);
  rows.sort((a, b) => a[0]!.v - b[0]!.v);

  const lines: OcrLine[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.u - b.u);
    // Extent of the row in the straightened frame
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const { p, u, v } of row) {
      u0 = Math.min(u0, u - p.box.w / 2);
      u1 = Math.max(u1, u + p.box.w / 2);
      v0 = Math.min(v0, v - p.box.h / 2);
      v1 = Math.max(v1, v + p.box.h / 2);
    }
    const toImage = (u: number, v: number): Point => [
      Math.min(Math.max(u * cos - v * sin, 0), imageW),
      Math.min(Math.max(u * sin + v * cos, 0), imageH),
    ];
    const quad: Quad = [toImage(u0, v0), toImage(u1, v0), toImage(u1, v1), toImage(u0, v1)];
    const span = u1 - u0 || 1;

    // Every character with the stretch of the row it covers (as fractions of the row's width)
    const chars: { ch: string; left: number; right: number }[] = [];
    let confSum = 0;
    let confWeight = 0;
    for (const { p, u } of row) {
      const cellLeft = u - p.box.w / 2;
      const at = (f: number) => (cellLeft + f * p.box.w - u0) / span;
      const n = p.text.length;
      const centre = (i: number) => p.centres[i] ?? (i + 0.5) / n;
      for (let i = 0; i < n; i++) {
        const prev = i > 0 ? centre(i - 1) : null;
        const next = i < n - 1 ? centre(i + 1) : null;
        const c = centre(i);
        const left = prev === null ? Math.max(0, c - ((next ?? c + 0.02) - c) / 2) : (prev + c) / 2;
        const right = next === null ? Math.min(1, c + (c - (prev ?? c - 0.02)) / 2) : (c + next) / 2;
        chars.push({ ch: p.text[i]!, left: at(left), right: at(right) });
      }
      // The gap to the next cell reads as a space
      chars.push({ ch: " ", left: at(1), right: at(1) });
      if (p.conf !== null) {
        confSum += p.conf * n;
        confWeight += n;
      }
    }
    // Collapse repeated spaces and trim
    const kept = chars.filter((c, i) => !(c.ch === " " && (i === 0 || chars[i - 1]!.ch === " ")));
    while (kept.length && kept[kept.length - 1]!.ch === " ") kept.pop();
    if (!kept.length) continue;
    const clamp = (x: number) => Math.min(1, Math.max(0, x));
    const charX = [...kept.map((c) => clamp(c.left)), clamp(kept[kept.length - 1]!.right)];
    lines.push({ text: kept.map((c) => c.ch).join(""), conf: confWeight ? (confSum / confWeight) * 100 : null, quad, charX });
  }
  return lines;
}
