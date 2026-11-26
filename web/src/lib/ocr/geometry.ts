import type { OcrLine, Point, Quad } from "./types";

const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export const rectQuad = (x0: number, y0: number, x1: number, y1: number): Quad => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Collapse whitespace the way the label parser does, so character positions stay valid */
export const normaliseText = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * The part of a line between two character positions, as a quad. Uses the engine's own character positions when it
 * gave them, else assumes characters are evenly spaced.
 */
export function spanQuad(line: OcrLine, start: number, end: number): Quad {
  const n = line.text.length;
  const f = (i: number) => (line.charX ? line.charX[Math.min(Math.max(i, 0), n)]! : Math.min(Math.max(i, 0), n) / n);
  // A little room either side so the box does not clip the glyphs
  const pad = 0.004;
  const a = Math.max(0, f(start) - pad);
  const b = Math.min(1, Math.max(f(end), f(start) + 0.01) + pad);
  const [tl, tr, br, bl] = line.quad;
  return [lerp(tl, tr, a), lerp(tl, tr, b), lerp(bl, br, b), lerp(bl, br, a)];
}

/** Axis-aligned bounds of some quads */
export function boundsOf(quads: Quad[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of quads) {
    for (const [x, y] of q) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return { x0, y0, x1, y1 };
}

/** Put four corners (in any order, as a model may emit them) into top-left, top-right, bottom-right, bottom-left order */
export function orderQuad(points: Point[]): Quad {
  const bySum = [...points].sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  const byDiff = [...points].sort((a, b) => a[1] - a[0] - (b[1] - b[0]));
  return [bySum[0]!, byDiff[0]!, bySum[3]!, byDiff[3]!];
}

/** Whether a point lies inside a (convex) quad */
export function quadContains(q: Quad, [px, py]: Point): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i]!;
    const [bx, by] = q[(i + 1) % 4]!;
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign !== 0 && s !== sign) return false;
    sign = s;
  }
  return true;
}
