import { useMemo } from "react";
import type { FoodEntry } from "../data/types";
import { sumEntries } from "../lib/nutrition";
import MacroPieChart from "./MacroPieChart";
import MicronutrientCard from "./MicronutrientCard";

interface MealSummaryProps {
  label: string;
  entries: FoodEntry[];
  /** Grow or shrink every food in the meal by this factor */
  onScale: (factor: number) => void;
}

/** Totals for the active meal plus whole-meal −/+ scaling */
export default function MealSummary({ label, entries, onScale }: MealSummaryProps) {
  const t = useMemo(() => sumEntries(entries), [entries]);
  const stats = [
    { label: "protein", value: t.protein, color: "#3b82f6" },
    { label: "carbs", value: t.carbs, color: "#f59e0b" },
    { label: "fat", value: t.fat, color: "#ef4444" },
    { label: "fiber", value: t.fiber, color: "var(--ink)" },
    { label: "sugar", value: t.sugar, color: "var(--ink)" },
  ];

  return (
    <div className="space-y-2">
      <div
        className="rounded-xl p-3 flex items-center gap-3"
        style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
      >
        <MacroPieChart protein={t.protein} carbs={t.carbs} fat={t.fat} calories={t.calories} size={88} compact />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold" style={{ color: "var(--ink)" }}>
              {label} total
            </span>
            <div className="flex items-center gap-1" role="group" aria-label={`Resize ${label}`}>
              <button
                onClick={() => onScale(1 / 1.1)}
                aria-label={`Make ${label} smaller`}
                className="w-8 h-8 rounded-lg text-base font-bold cursor-pointer"
                style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" }}
              >
                −
              </button>
              <span className="text-[10px] px-0.5" style={{ color: "var(--muted)" }}>
                size
              </span>
              <button
                onClick={() => onScale(1.1)}
                aria-label={`Make ${label} bigger`}
                className="w-8 h-8 rounded-lg text-base font-bold cursor-pointer"
                style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" }}
              >
                +
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-1">
            <div>
              <div className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                {t.calories}
              </div>
              <div className="text-[10px]" style={{ color: "var(--muted)" }}>cal</div>
            </div>
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-sm font-semibold" style={{ color: s.color }}>
                  {s.value}g
                </div>
                <div className="text-[10px]" style={{ color: "var(--muted)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <MicronutrientCard entries={entries} title={`${label} micronutrients`} />
    </div>
  );
}
