import { useMemo } from "react";
import type { FoodEntry } from "../data/types";
import { sumEntries } from "../lib/nutrition";
import MacroPieChart from "./MacroPieChart";

interface MealSummaryProps {
  label: string;
  entries: FoodEntry[];
  /** Grams per meal −/+ tap */
  stepGrams: number;
  /** Shrink (−1) or grow (+1) the meal's total weight by one step */
  onStep: (sign: 1 | -1) => void;
  /** Open the meal's full nutrition breakdown */
  onOpen: () => void;
}

/** Totals for the active meal plus whole-meal −/+ */
export default function MealSummary({ label, entries, stepGrams, onStep, onOpen }: MealSummaryProps) {
  const t = useMemo(() => sumEntries(entries), [entries]);
  const grams = Math.round(entries.reduce((sum, e) => sum + e.portionGrams, 0));
  const quickAdds = entries.filter((e) => e.portionGrams <= 0).length;
  const stats = [
    { label: "protein", value: t.protein, color: "#3b82f6" },
    { label: "carbs", value: t.carbs, color: "#f59e0b" },
    { label: "fat", value: t.fat, color: "#ef4444" },
    { label: "fiber", value: t.fiber, color: "var(--ink)" },
    { label: "sugar", value: t.sugar, color: "var(--ink)" },
  ];
  const stepButton = (sign: 1 | -1) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onStep(sign);
      }}
      disabled={grams <= 0}
      aria-label={`${stepGrams} g ${sign > 0 ? "more" : "less"} ${label}`}
      className="w-8 h-8 rounded-lg text-base font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" }}
    >
      {sign > 0 ? "+" : "−"}
    </button>
  );

  return (
    <div
      className="rounded-xl p-3 flex items-center gap-3 cursor-pointer"
      style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
      onClick={onOpen}
    >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          aria-label={`${label}: full nutrition breakdown`}
          className="shrink-0 cursor-pointer p-0"
          style={{ background: "transparent", border: "none" }}
        >
          <MacroPieChart protein={t.protein} carbs={t.carbs} fat={t.fat} calories={t.calories} size={72} compact />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="text-sm font-bold min-w-0" style={{ color: "var(--ink)" }}>
              <span style={{ color: "#8b5cf6" }}>{Math.round(t.calories)} kcal</span> &middot; {grams} g
              {quickAdds > 0 && (
                <span className="block text-[0.625rem] font-normal" style={{ color: "var(--muted)" }}>
                  + {quickAdds} quick add
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0" role="group" aria-label={`Resize ${label}`}>
              {stepButton(-1)}
              {stepButton(1)}
            </div>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-sm font-semibold" style={{ color: s.color }}>
                  {Math.round(s.value)}g
                </div>
                <div className="text-[0.625rem]" style={{ color: "var(--muted)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
    </div>
  );
}
