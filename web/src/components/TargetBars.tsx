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
      className="rounded-xl px-4 py-3 space-y-2.5"
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
          <div key={r.key}>
            <div className="flex items-baseline justify-between text-xs mb-1">
              <span className="font-semibold" style={{ color: "var(--ink)" }}>
                {r.label}{" "}
                <span className="font-normal" style={{ color: "var(--muted)" }}>
                  {value}{r.unit} / {target}{r.unit}
                </span>
              </span>
              <span className="font-semibold" style={{ color: over ? "var(--error)" : "var(--success)" }}>
                {over ? `${-diff}${r.unit} over` : `${diff}${r.unit} left`}
              </span>
            </div>
            <div
              className="relative h-2 rounded-full overflow-hidden"
              style={{ background: "var(--line)" }}
              role="meter"
              aria-label={r.label}
              aria-valuenow={value}
              aria-valuemin={0}
              aria-valuemax={target}
            >
              {/* widths are computed from live totals */}
              <div className="absolute inset-y-0 left-0" style={{ width: `${fill}%`, background: r.color }} />
              {over && (
                <div
                  className="absolute inset-y-0"
                  style={{ left: `${targetPos}%`, width: `${excess}%`, background: "var(--error)" }}
                />
              )}
              {over && (
                <div className="absolute inset-y-0 w-0.5" style={{ left: `${targetPos}%`, background: "var(--ink)" }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
