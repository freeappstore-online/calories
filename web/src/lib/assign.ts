import { MICRO_DEFS } from "../data/types";
import { convert, FIELD_UNIT, tokenize, type LabelField, type Span, type Token } from "./labelParser";
import { spanQuad } from "./ocr/geometry";
import type { Highlight } from "./ocr/provenance";
import type { OcrLine, Point } from "./ocr/types";

/** What a tapped number can be assigned to: a form field, or the energy figure in kJ (which fills Calories) */
export type AssignOption = LabelField | "servingGrams" | "kj";
/** The label's two table columns */
export type Basis = "serving" | "per100";

/** A number the user labelled on the photo */
export interface Assignment {
  option: AssignOption;
  /** The form field it fills */
  key: LabelField | "servingGrams";
  span: Span;
  basis: Basis;
  /** The text of the box, as printed */
  text: string;
  /** What went into the form: per serving, in the form's units */
  value: number;
}

export const KJ_PER_KCAL = 4.184;

/** Options in the order the picker lists them; the rest of the micronutrients follow */
export const KEY_OPTIONS: AssignOption[] = ["calories", "kj", "protein", "carbs", "fat", "sugar", "fiber", "satFat", "sodium", "servingGrams"];
export const MORE_OPTIONS: AssignOption[] = MICRO_DEFS.map((m) => m.key).filter((k) => !KEY_OPTIONS.includes(k));

export const optionKey = (o: AssignOption): Assignment["key"] => (o === "kj" ? "calories" : o);

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** A number printed in a recognised line, with where it sits */
export interface Figure extends Token {
  line: number;
  /** The figure as printed ("5.7 g") */
  text: string;
}

/** Where along the line (0..1 from its left end) a point falls, projecting it on the line's baseline */
function along(line: OcrLine, [px, py]: Point): number {
  const [tl, tr] = line.quad;
  const dx = tr[0] - tl[0];
  const dy = tr[1] - tl[1];
  return ((px - tl[0]) * dx + (py - tl[1]) * dy) / (dx * dx + dy * dy || 1);
}

/** Share of the line's width a tap may miss a figure by and still count */
const SLACK = 0.03;

/** The number under (or just beside) a tap on a line, if any */
export function figureAt(line: OcrLine, lineIndex: number, point: Point): Figure | undefined {
  const t = along(line, point);
  const n = line.text.length;
  const f = (i: number) => (line.charX ? line.charX[Math.min(Math.max(i, 0), n)]! : Math.min(Math.max(i, 0), n) / n);
  let best: { fig: Token; d: number } | undefined;
  for (const fig of tokenize(line.text)) {
    const a = f(fig.start);
    const b = f(fig.end);
    const d = t < a ? a - t : t > b ? t - b : 0;
    if (d <= SLACK && (!best || d < best.d)) best = { fig, d };
  }
  return best && { ...best.fig, line: lineIndex, text: line.text.slice(best.fig.start, best.fig.end).trim() };
}

/**
 * The value a figure gives a field, per serving in the form's units, or an error saying why not.
 * `servingGrams` is the form's serving size, used to scale a per-100 g figure.
 */
export function assignValue(fig: Token, option: AssignOption, basis: Basis, servingGrams: number): { value: number } | { error: string } {
  const key = optionKey(option);
  let v: number | null;
  if (option === "kj") v = fig.value / KJ_PER_KCAL;
  else if (key === "calories") v = fig.unit === "kj" ? fig.value / KJ_PER_KCAL : fig.unit === "" || fig.unit === "kcal" ? fig.value : null;
  else v = convert(fig, key === "servingGrams" ? "g" : (FIELD_UNIT[key] ?? "g"));
  if (v === null) return { error: `A figure in ${fig.unit} cannot be used for this field.` };
  if (key !== "servingGrams" && basis === "per100") v = (v * (servingGrams > 0 ? servingGrams : 100)) / 100;
  return { value: key === "calories" ? Math.round(v) : round(v, key === "servingGrams" ? 1 : 2) };
}

export const sameSpan = (a: Span, b: Span) => a.line === b.line && a.start === b.start && a.end === b.end;

/** Add an assignment: the same box moves to the new field, and the field moves to the new box */
export const assign = (list: Assignment[], a: Assignment): Assignment[] => [...list.filter((x) => !sameSpan(x.span, a.span) && x.key !== a.key), a];

export const unassign = (list: Assignment[], span: Span): Assignment[] => list.filter((x) => !sameSpan(x.span, span));

/** The assignments that `assign` would drop */
export const displaced = (list: Assignment[], a: Assignment): Assignment[] => list.filter((x) => sameSpan(x.span, a.span) || x.key === a.key);

/** The scan's boxes with the user's on top: a field's own figure box is replaced, and a box given to another field is not shown for its old one */
export function withAssignments(highlights: Highlight[], list: Assignment[], lines: OcrLine[]): Highlight[] {
  if (list.length === 0) return highlights;
  const overlaps = (a: Span, b: Span) => a.line === b.line && a.start < b.end && a.end > b.start;
  const kept = highlights.filter((h) => !(h.role === "figure" && list.some((a) => h.field === a.key || overlaps(h.span, a.span))));
  const mine = list.flatMap((a): Highlight[] => {
    const line = lines[a.span.line];
    return line ? [{ field: a.key, role: "figure", quad: spanQuad(line, a.span.start, a.span.end), text: a.text, span: a.span }] : [];
  });
  return [...kept, ...mine];
}
