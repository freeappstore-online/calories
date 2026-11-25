import type { DailyGoals } from "../data/types";

const ROWS: { key: keyof DailyGoals; label: string; unit: string; color: string }[] = [
  { key: "calories", label: "Calories", unit: "", color: "var(--accent)" },
  { key: "protein", label: "Protein", unit: "g", color: "#3b82f6" },
  { key: "carbs", label: "Carbs", unit: "g", color: "#f59e0b" },
  { key: "fat", label: "Fat", unit: "g", color: "#ef4444" },
];

/** Compact daily progress bars against each target, showing under/over */
export default function TargetBars({ totals, goals }: { totals: DailyGoals; goals: DailyGoals }) {
  return (
    <div
      className="rounded-xl p-2 space-y-1.5"
      style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
    >
      {ROWS.map((r) => {
        const value = Math.round(totals[r.key]);
        const target = goals[r.key];
        const diff = Math.round(target - totals[r.key]);
        const over = diff < 0;
        // Scale so the target sits at 100% unless the value overshoots it
        const scale = Math.max(target, totals[r.key], 1);
        const fill = (Math.min(totals[r.key], target) / scale) * 100;
        const excess = over ? ((totals[r.key] - target) / scale) * 100 : 0;
        const targetPos = (target / scale) * 100;
        return (
          <div
            key={r.key}
            className="relative h-7 rounded-lg overflow-hidden"
            style={{ background: "var(--line)" }}
            role="meter"
            aria-label={r.label}
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={target}
          >
            {/* Fill is a light tint of the macro colour so the text on top stays legible;
                widths are computed from live totals */}
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${fill}%`,
                background: `color-mix(in srgb, ${r.color} 35%, transparent)`,
              }}
            />
            {/* Solid strip along the bottom shows the exact level without crossing the text */}
            <div className="absolute bottom-0 left-0 h-[3px]" style={{ width: `${fill}%`, background: r.color }} />
            {over && (
              <>
                <div
                  className="absolute inset-y-0"
                  style={{
                    left: `${targetPos}%`,
                    width: `${excess}%`,
                    background: "color-mix(in srgb, var(--error) 40%, transparent)",
                  }}
                />
                <div
                  className="absolute bottom-0 h-[3px]"
                  style={{ left: `${targetPos}%`, width: `${excess}%`, background: "var(--error)" }}
                />
                <div className="absolute inset-y-0 w-0.5" style={{ left: `${targetPos}%`, background: "var(--ink)" }} />
              </>
            )}
            <div className="relative h-full flex items-center justify-between px-2.5 text-xs">
              <span className="font-semibold truncate" style={{ color: "var(--ink)" }}>
                {r.label}{" "}
                <span className="font-normal">
                  {value}{r.unit} / {target}{r.unit}
                </span>
              </span>
              <span
                className="font-semibold shrink-0 ml-2"
                style={{ color: over ? "var(--error)" : "var(--ink)" }}
              >
                {over ? `${-diff}${r.unit} over` : `${diff}${r.unit} left`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
