import { useMemo, useState } from "react";
import { MICRO_DEFS } from "../data/types";
import type { LabelScan, SourceKey } from "../lib/labelParser";
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
}

/**
 * What was recognised where: the photo with every line boxed faintly, and the text that fed each field in that field's
 * colour. The photo is small here; tap it to enlarge, and tap a box there to see what it read.
 */
export default function LabelReview({ imageUrl, result, scan, selected, onSelect }: LabelReviewProps) {
  const highlights = useMemo(() => highlightsOf(scan, result.lines), [scan, result]);
  const fields = useMemo(() => [...new Set(highlights.map((h) => h.field))].sort((a, b) => rank(a) - rank(b)), [highlights]);
  const [enlarged, setEnlarged] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);

  const tap = (point: Point) => {
    const hit = hitTest(point, highlights, result.lines);
    if (hit.highlight) {
      const h = hit.highlight;
      onSelect(h.field);
      const v = scan.values[h.field as keyof typeof scan.values];
      setCaption(`"${h.text}" ${h.role === "name" ? "names" : "gave"} ${fieldName(h.field)}${v !== undefined && h.role === "figure" ? `: ${Math.round(v * 10) / 10}` : ""}`);
    } else if (hit.line) {
      onSelect(null);
      setCaption(`"${hit.line.text}" was read but not used`);
    } else {
      onSelect(null);
      setCaption(null);
    }
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
              {caption ?? "Tap a box to see what it read and which field it fed."}
            </p>
            {chips}
          </div>
        </Modal>
      )}
    </>
  );
}
