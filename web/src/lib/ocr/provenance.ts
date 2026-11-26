import type { LabelScan, SourceKey } from "../labelParser";
import { quadContains, spanQuad } from "./geometry";
import type { OcrLine, Point, Quad } from "./types";

/** A piece of the photo that produced (part of) a form field */
export interface Highlight {
  field: SourceKey;
  /** The printed name of the nutrient, or the figure that was read */
  role: "name" | "figure";
  quad: Quad;
  /** The text inside the box */
  text: string;
}

/** Where on the photo each filled field came from: the nutrient's name and the figure beside it */
export function highlightsOf(scan: LabelScan, lines: OcrLine[]): Highlight[] {
  const out: Highlight[] = [];
  for (const [field, src] of Object.entries(scan.sources) as [SourceKey, NonNullable<LabelScan["sources"][SourceKey]>][]) {
    src.spans.forEach((span, i) => {
      const line = lines[span.line];
      if (!line) return;
      // Fields with only one span (the product name, the serving size) point at that span as the figure
      const role = src.spans.length > 1 && i === 0 ? "name" : "figure";
      out.push({ field, role, quad: spanQuad(line, span.start, span.end), text: line.text.slice(span.start, span.end).trim() });
    });
  }
  return out;
}

/** What a tap at a point on the photo landed on: the field boxes first (the smallest wins), else the line under it */
export function hitTest(point: Point, highlights: Highlight[], lines: OcrLine[]): { highlight?: Highlight; line?: OcrLine } {
  const hits = highlights.filter((h) => quadContains(h.quad, point));
  if (hits.length) {
    const area = (q: Quad) => Math.abs((q[1][0] - q[0][0]) * (q[2][1] - q[1][1]));
    return { highlight: hits.reduce((a, b) => (area(b.quad) < area(a.quad) ? b : a)) };
  }
  const line = lines.find((l) => quadContains(l.quad, point));
  return line ? { line } : {};
}
