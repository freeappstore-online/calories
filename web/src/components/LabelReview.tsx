import { useEffect, useMemo, useState } from "react";
import { MICRO_DEFS } from "../data/types";
import { assignValue, figureAt, KEY_OPTIONS, MORE_OPTIONS, optionKey, sameSpan, withAssignments, type Assignment, type AssignOption, type Basis, type Figure } from "../lib/assign";
import type { LabelScan, SourceKey, Span } from "../lib/labelParser";
import { highlightsOf, hitTest, type Highlight } from "../lib/ocr/provenance";
import type { OcrResult, Point } from "../lib/ocr/types";
import LabelOverlay, { fieldColor } from "./LabelOverlay";
import Modal from "./Modal";

const NAMES: Record<string, string> = {
  calories: "Calories",
  protein: "Protein",
  carbs: "Carbs",
  fat: "Fat",
  fiber: "Fiber",
  sugar: "Sugar",
  name: "Name",
  servingGrams: "Serving size",
  servingLabel: "Serving name",
  ...Object.fromEntries(MICRO_DEFS.map((m) => [m.key, m.label])),
};
export const fieldName = (k: SourceKey) => NAMES[k] ?? k;
const optionName = (o: AssignOption) => (o === "kj" ? "Energy (kJ)" : o === "servingGrams" ? "Serving size (g)" : fieldName(o));
/** Whole numbers, except small values where a decimal matters */
const show = (v: number) => (v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));

/** Legend order: the four key values and sugar first */
const ORDER = ["calories", "protein", "carbs", "fat", "sugar", "fiber"];
const rank = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : ORDER.length);

interface PhotoProps {
  imageUrl: string;
  result: OcrResult;
  highlights: Highlight[];
  selected: SourceKey | null;
  onTap?: (point: Point) => void;
  alt: string;
}

/** The photo with the recognised boxes on it */
function Photo({ imageUrl, result, highlights, selected, onTap, alt }: PhotoProps) {
  return (
    <div className="relative w-full" style={{ aspectRatio: `${result.width} / ${result.height}` }}>
      <img src={imageUrl} alt={alt} className="absolute inset-0 w-full h-full" draggable={false} />
      <LabelOverlay width={result.width} height={result.height} lines={result.lines} highlights={highlights} selected={selected} onTap={onTap} />
    </div>
  );
}

interface LabelReviewProps {
  imageUrl: string;
  result: OcrResult;
  scan: LabelScan;
  /** The field whose boxes are shown strongly (also set from the form) */
  selected: SourceKey | null;
  onSelect: (field: SourceKey | null) => void;
  /** Numbers the user has labelled on the photo */
  assignments: Assignment[];
  /** The form's serving size in grams, which scales a per-100 g figure */
  servingGrams: number;
  onAssign: (a: Assignment) => void;
  onUnassign: (span: Span) => void;
}

/**
 * What was recognised where: the photo with every line boxed faintly, and the text that fed each field in that field's
 * colour. The photo is small here; tap it to enlarge, and tap a box there to see what it read.
 */
export default function LabelReview({ imageUrl, result, scan, selected, onSelect, assignments, servingGrams, onAssign, onUnassign }: LabelReviewProps) {
  const highlights = useMemo(() => withAssignments(highlightsOf(scan, result.lines), assignments, result.lines), [scan, result, assignments]);
  const fields = useMemo(() => [...new Set(highlights.map((h) => h.field))].sort((a, b) => rank(a) - rank(b)), [highlights]);
  const [enlarged, setEnlarged] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);

  // The number last tapped, and the table column to take it from
  const [pick, setPick] = useState<Figure | null>(null);
  const [basis, setBasis] = useState<Basis>("serving");
  useEffect(() => setPick(null), [result]);
  // Per serving or per 100 g only matters when the label printed both
  const twoColumns = useMemo(() => Object.values(scan.sources).some((src) => src?.column), [scan]);
  const spanOfPick = (f: Figure): Span => ({ line: f.line, start: f.start, end: f.end });
  const current = pick ? assignments.find((a) => sameSpan(a.span, spanOfPick(pick))) : undefined;

  const tap = (point: Point) => {
    const hit = hitTest(point, highlights, result.lines);
    const lineIndex = hit.highlight ? hit.highlight.span.line : hit.line ? result.lines.indexOf(hit.line) : -1;
    const fig = lineIndex >= 0 ? figureAt(result.lines[lineIndex]!, lineIndex, point) : undefined;
    setPick(fig ?? null);
    if (fig) {
      const mine = assignments.find((a) => sameSpan(a.span, spanOfPick(fig)));
      // Start from the column this line's figures were read from
      const column = Object.values(scan.sources).find((src) => src?.column && src.spans.some((sp) => sp.line === fig.line))?.column;
      setBasis(mine?.basis ?? column ?? "serving");
    }
    if (hit.highlight) {
      const h = hit.highlight;
      onSelect(h.field);
      const v = assignments.find((a) => sameSpan(a.span, h.span))?.value ?? scan.values[h.field as keyof typeof scan.values];
      setCaption(`"${h.text}" ${h.role === "name" ? "names" : "gave"} ${fieldName(h.field)}${v !== undefined && h.role === "figure" ? `: ${show(v)}` : ""}`);
    } else if (hit.line) {
      onSelect(null);
      setCaption(`"${hit.line.text}" was read but not used`);
    } else {
      onSelect(null);
      setCaption(null);
    }
  };

  const assignTo = (option: AssignOption, column: Basis) => {
    if (!pick) return;
    const r = assignValue(pick, option, column, servingGrams);
    if ("error" in r) return setCaption(`${r.error} Pick another field.`);
    const key = optionKey(option);
    onAssign({ option, key, span: spanOfPick(pick), basis: column, text: pick.text, value: r.value });
    onSelect(key);
    setCaption(`"${pick.text}" set ${optionName(option)} to ${show(r.value)}${key !== "servingGrams" && column === "per100" ? " per serving, scaled from per 100 g" : ""}`);
  };
  const pickField = (v: string) => {
    if (!pick) return;
    if (v === "") {
      onUnassign(spanOfPick(pick));
      setCaption(`"${pick.text}" is not assigned`);
    } else assignTo(v as AssignOption, basis);
  };
  const pickBasis = (b: Basis) => {
    setBasis(b);
    if (current) assignTo(current.option, b);
  };

  const chips = (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Fields read from the photo">
      {fields.map((f) => {
        const color = fieldColor(f);
        const on = selected === f;
        return (
          <button
            key={f}
            type="button"
            aria-pressed={on}
            data-field={f}
            onClick={() => onSelect(on ? null : f)}
            className="px-2 py-1 rounded-full text-[0.6875rem] font-semibold cursor-pointer shrink-0"
            style={{ background: on ? color : "var(--paper)", color: on ? "#fff" : "var(--ink)", border: `1.5px solid ${color}` }}
          >
            {fieldName(f)}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Sticks to the top of the form so the photo stays in view while fields are tapped below it (its parent is the scrolling form) */}
      <div className="sticky top-0 z-10 rounded-lg p-2.5 space-y-2" style={{ background: "var(--panel)", border: "1px solid var(--line)" }} data-testid="label-review">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEnlarged(true)}
            aria-label="Enlarge photo"
            className="shrink-0 w-20 rounded-md overflow-hidden cursor-pointer p-0"
            style={{ border: "1px solid var(--line)", background: "var(--paper)" }}
          >
            <Photo imageUrl={imageUrl} result={result} highlights={highlights} selected={selected} alt="Photo of the label with the recognised text boxed" />
          </button>
          <p className="min-w-0 flex-1 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            {selected ? `Showing where ${fieldName(selected)} was read. Tap the photo to enlarge it.` : "Boxes show what was read. Tap a field to see where it came from, or tap the photo to enlarge it."}
          </p>
        </div>
        {chips}
      </div>

      {enlarged && (
        <Modal
          titleId="label-photo-title"
          onClose={() => setEnlarged(false)}
          className="w-full h-[100dvh] sm:h-[90vh] sm:max-w-2xl flex flex-col sm:rounded-2xl overflow-hidden"
          style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
        >
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
            <h2 id="label-photo-title" className="text-base font-bold" style={{ color: "var(--ink)" }}>
              What was read
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoom((z) => !z)}
                aria-pressed={zoom}
                className="px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer"
                style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" }}
              >
                {zoom ? "Fit to screen" : "Zoom in"}
              </button>
              <button
                type="button"
                onClick={() => setEnlarged(false)}
                aria-label="Close photo"
                className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer"
                style={{ background: "var(--panel)", border: "none", color: "var(--ink)" }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto" style={{ background: "#000" }}>
            <div style={{ width: zoom ? "250%" : "100%" }} data-testid="label-photo-large">
              <Photo imageUrl={imageUrl} result={result} highlights={highlights} selected={selected} onTap={tap} alt="Photo of the label with the recognised text boxed" />
            </div>
          </div>
          <div className="shrink-0 p-3 space-y-2" style={{ borderTop: "1px solid var(--line)" }}>
            <p role="status" className="text-xs min-h-[1.25rem]" style={{ color: "var(--ink)" }}>
              {caption ?? "Tap a box to see what it read and which field it fed. Tap a number to assign it to a field."}
            </p>
            {pick && (
              <div className="flex flex-wrap items-center gap-2" data-testid="assign-panel">
                <label className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--ink)" }}>
                  <span>&ldquo;{pick.text}&rdquo; is</span>
                  <select
                    aria-label="Assign to field"
                    value={current?.option ?? highlights.find((h) => h.role === "figure" && sameSpan(h.span, spanOfPick(pick)))?.field ?? ""}
                    onChange={(e) => pickField(e.target.value)}
                    className="px-2 py-1 rounded-lg text-xs cursor-pointer"
                    style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" }}
                  >
                    <option value="">Not assigned</option>
                    {KEY_OPTIONS.map((o) => (
                      <option key={o} value={o}>{optionName(o)}</option>
                    ))}
                    <optgroup label="More nutrients">
                      {MORE_OPTIONS.map((o) => (
                        <option key={o} value={o}>{optionName(o)}</option>
                      ))}
                    </optgroup>
                  </select>
                </label>
                {twoColumns && (
                  <div className="flex gap-1" role="group" aria-label="Table column">
                    {(["serving", "per100"] as const).map((b) => (
                      <button
                        key={b}
                        type="button"
                        aria-pressed={basis === b}
                        onClick={() => pickBasis(b)}
                        className="px-2 py-1 rounded-full text-[0.6875rem] font-semibold cursor-pointer"
                        style={{ background: basis === b ? "var(--accent)" : "var(--paper)", color: basis === b ? "#fff" : "var(--ink)", border: "1px solid var(--accent)" }}
                      >
                        {b === "serving" ? "Per serving" : "Per 100 g"}
                      </button>
                    ))}
                  </div>
                )}
                {current && (
                  <button
                    type="button"
                    onClick={() => pickField("")}
                    className="px-2 py-1 rounded-lg text-[0.6875rem] font-semibold cursor-pointer"
                    style={{ background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--line)" }}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
            {chips}
          </div>
        </Modal>
      )}
    </>
  );
}
