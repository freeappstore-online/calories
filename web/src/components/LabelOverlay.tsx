import type { SourceKey } from "../lib/labelParser";
import { CALORIES_COLOR, CARBS_COLOR, FAT_COLOR, PROTEIN_COLOR, SUGAR_COLOR } from "../lib/colors";
import type { Highlight } from "../lib/ocr/provenance";
import type { OcrLine, Point, Quad } from "../lib/ocr/types";

/** Macro colours for the fields that have one; everything else is neutral */
const COLORS: Partial<Record<SourceKey, string>> = {
  calories: CALORIES_COLOR,
  protein: PROTEIN_COLOR,
  carbs: CARBS_COLOR,
  fat: FAT_COLOR,
  sugar: SUGAR_COLOR,
};
export const NEUTRAL = "#94a3b8";
export const fieldColor = (key: SourceKey): string => COLORS[key] ?? NEUTRAL;

const points = (q: Quad) => q.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

interface LabelOverlayProps {
  /** Pixels of the image the boxes are in */
  width: number;
  height: number;
  /** Every recognised line, drawn faint */
  lines: OcrLine[];
  /** Boxes that fed a field, drawn in the field's colour */
  highlights: Highlight[];
  /** When set, only this field's boxes are drawn strongly */
  selected?: SourceKey | null;
  /** Tap on the picture, in image pixels */
  onTap?: (point: Point) => void;
}

/** Boxes over a photo or a camera frame; sits on top of an element of the same aspect ratio */
export default function LabelOverlay({ width, height, lines, highlights, selected, onTap }: LabelOverlayProps) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full"
      style={{ touchAction: "manipulation", cursor: onTap ? "pointer" : undefined }}
      aria-hidden={onTap ? undefined : true}
      role={onTap ? "img" : undefined}
      aria-label={onTap ? "Recognised text on the photo. Tap a box to see what it read." : undefined}
      onClick={
        onTap
          ? (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onTap([((e.clientX - r.left) / r.width) * width, ((e.clientY - r.top) / r.height) * height]);
            }
          : undefined
      }
    >
      {lines.map((l, i) => (
        <polygon
          key={`l${i}`}
          points={points(l.quad)}
          fill="none"
          stroke={NEUTRAL}
          strokeWidth={1}
          strokeOpacity={selected ? 0.25 : 0.6}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {highlights.map((h, i) => {
        const color = fieldColor(h.field);
        const on = !selected || selected === h.field;
        return (
          <polygon
            key={`h${i}`}
            data-field={h.field}
            data-role={h.role}
            data-text={h.text}
            points={points(h.quad)}
            fill={color}
            fillOpacity={on ? (h.role === "figure" ? 0.38 : 0.2) : 0.04}
            stroke={color}
            strokeWidth={selected === h.field ? 3 : 1.75}
            strokeOpacity={on ? 1 : 0.25}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}
