import type { CSSProperties } from "react";
import { useTargets } from "../lib/targets";
import { getSettings } from "../lib/settings";

type BarKey = "calories" | "protein" | "carbs" | "fat" | "sugar";
type Totals = Record<BarKey, number>;

const CALORIES = { label: "Calories", unit: " kcal", color: "#8b5cf6" };
// These share one gram scale so their lengths compare directly
const MACROS: { key: BarKey; label: string; unit: string; color: string }[] = [
  { key: "protein", label: "Protein", unit: "g", color: "#3b82f6" },
  { key: "carbs", label: "Carbs", unit: "g", color: "#f59e0b" },
  { key: "fat", label: "Fat", unit: "g", color: "#ef4444" },
  { key: "sugar", label: "Sugar", unit: "g", color: "#ec4899" },
];

/** Positions are percentages of the bar width, computed from live totals */
const at = (left: number, width: number): CSSProperties => ({ left: `${left}%`, width: `${width}%` });

function Bar({
  label,
  unit,
  color,
  value,
  target,
  scale,
}: {
  label: string;
  unit: string;
  color: string;
  value: number;
  target: number;
  scale: number;
}) {
  const shown = Math.round(value);
  const diff = Math.round(target - value);
  const over = diff < 0;
  const fill = (Math.min(value, target) / scale) * 100;
  const targetPos = (target / scale) * 100;
  const excess = over ? ((value - target) / scale) * 100 : 0;
  return (
    <div
      className="relative h-7 rounded-lg overflow-hidden"
      style={{ background: "var(--line)" }}
      role="meter"
      aria-label={`${label}: ${shown}${unit} of ${Math.round(target)}${unit}`}
      aria-valuenow={shown}
      aria-valuemin={0}
      aria-valuemax={Math.round(target)}
    >
      {/* Tinted fill keeps the text on top legible; the bottom strip shows the exact level */}
      <div className="absolute inset-y-0" style={{ ...at(0, fill), background: `color-mix(in srgb, ${color} 35%, transparent)` }} />
      <div className="absolute bottom-0 h-[3px]" style={{ ...at(0, fill), background: color }} />
      {over && (
        <>
          <div
            className="absolute inset-y-0"
            style={{ ...at(targetPos, excess), background: "color-mix(in srgb, var(--error) 40%, transparent)" }}
          />
          <div className="absolute bottom-0 h-[3px]" style={{ ...at(targetPos, excess), background: "var(--error)" }} />
        </>
      )}
      {/* Goal marker: ticks at the top and bottom edges, leaving the middle clear for the text */}
      <div className="absolute top-0 h-2 w-0.5" style={{ left: `calc(${targetPos}% - 1px)`, background: "var(--ink)" }} />
      <div className="absolute bottom-0 h-2 w-0.5" style={{ left: `calc(${targetPos}% - 1px)`, background: "var(--ink)" }} />
      <div className="relative h-full flex items-center justify-between px-2.5 text-xs">
        <span className="font-semibold truncate" style={{ color: "var(--ink)" }}>
          {label}{" "}
          <span className="font-normal">
            {shown} / {Math.round(target)}{unit}
          </span>
        </span>
        <span className="font-semibold shrink-0 ml-2" style={{ color: over ? "var(--error)" : "var(--ink)" }}>
          {over ? `${-diff}${unit} over` : `${diff}${unit} left`}
        </span>
      </div>
    </div>
  );
}

/**
 * Daily progress against targets. Calories have their own scale; protein, carbs, fat and
 * sugar share one gram scale (Profile → Log display) so they can be compared visually.
 * Each bar marks its goal; anything past the goal is red.
 */
export default function TargetBars({ totals }: { totals: Totals }) {
  const targets = useTargets();
  // Leave room past the calorie goal so its marker is visible
  const kcalScale = Math.max(targets.calories * 1.15, totals.calories, 1);
  const gramScale = Math.max(
    getSettings().macroBarGrams,
    ...MACROS.map((m) => Math.max(totals[m.key], targets[m.key])),
  );
  return (
    <div className="rounded-xl p-2 space-y-1.5" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <Bar {...CALORIES} value={totals.calories} target={targets.calories} scale={kcalScale} />
      {MACROS.map((m) => (
        <Bar key={m.key} label={m.label} unit={m.unit} color={m.color} value={totals[m.key]} target={targets[m.key]} scale={gramScale} />
      ))}
      <div className="text-[0.625rem] text-right px-1" style={{ color: "var(--muted)" }}>
        protein · carbs · fat · sugar to scale: full width = {Math.round(gramScale)} g
      </div>
    </div>
  );
}
