import { useState } from "react";
import type { DailyGoals } from "../data/types";

interface GoalsViewProps {
  goals: DailyGoals;
  suggestedCalories: number | null;
  onSave: (goals: DailyGoals) => void;
}

export default function GoalsView({ goals, suggestedCalories, onSave }: GoalsViewProps) {
  const [calories, setCalories] = useState(goals.calories);
  const [protein, setProtein] = useState(goals.protein);
  const [carbs, setCarbs] = useState(goals.carbs);
  const [fat, setFat] = useState(goals.fat);

  const handleSave = () => {
    onSave({ calories, protein, carbs, fat });
  };

  // Macro percentages
  const totalMacroCal = protein * 4 + carbs * 4 + fat * 9;
  const pPct = totalMacroCal > 0 ? Math.round((protein * 4 / totalMacroCal) * 100) : 0;
  const cPct = totalMacroCal > 0 ? Math.round((carbs * 4 / totalMacroCal) * 100) : 0;
  const fPct = totalMacroCal > 0 ? 100 - pPct - cPct : 0;

  /** Auto-distribute macros for a given calorie target using 30/40/30 split */
  const autoDistribute = (cal: number) => {
    setCalories(cal);
    setProtein(Math.round((cal * 0.30) / 4));
    setCarbs(Math.round((cal * 0.40) / 4));
    setFat(Math.round((cal * 0.30) / 9));
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold" style={{ color: "var(--ink)" }}>
        Daily Goals
      </h2>

      {/* Calorie target */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
      >
        <label className="text-xs font-medium block mb-2" style={{ color: "var(--muted)" }}>
          Calorie target
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={calories}
            onChange={(e) => setCalories(Math.max(0, Number(e.target.value)))}
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" }}
            min={0}
            step={50}
          />
          <span className="text-sm" style={{ color: "var(--muted)" }}>cal</span>
        </div>
        {suggestedCalories !== null && (
          <button
            onClick={() => autoDistribute(suggestedCalories)}
            className="mt-2 text-xs cursor-pointer"
            style={{ background: "none", border: "none", color: "var(--accent)" }}
          >
            Use suggested target: {suggestedCalories} cal (based on profile)
          </button>
        )}

        {/* Quick presets */}
        <div className="flex gap-2 mt-3">
          {[1500, 1800, 2000, 2200, 2500].map((cal) => (
            <button
              key={cal}
              onClick={() => autoDistribute(cal)}
              className="px-2 py-1 rounded text-[11px] cursor-pointer"
              style={{
                background: calories === cal ? "var(--accent)" : "var(--paper)",
                color: calories === cal ? "#fff" : "var(--muted)",
                border: `1px solid ${calories === cal ? "var(--accent)" : "var(--line)"}`,
              }}
            >
              {cal}
            </button>
          ))}
        </div>
      </div>

      {/* Macro targets */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
      >
        <label className="text-xs font-medium block mb-3" style={{ color: "var(--muted)" }}>
          Macro targets
        </label>

        <div className="space-y-3">
          {/* Protein */}
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
            <span className="text-xs w-14" style={{ color: "var(--ink)" }}>Protein</span>
            <input
              type="number"
              value={protein}
              onChange={(e) => setProtein(Math.max(0, Number(e.target.value)))}
              className="w-20 px-2 py-1.5 rounded-lg text-sm outline-none text-center"
              style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" }}
              min={0}
            />
            <span className="text-xs" style={{ color: "var(--muted)" }}>g ({pPct}%)</span>
          </div>

          {/* Carbs */}
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            <span className="text-xs w-14" style={{ color: "var(--ink)" }}>Carbs</span>
            <input
              type="number"
              value={carbs}
              onChange={(e) => setCarbs(Math.max(0, Number(e.target.value)))}
              className="w-20 px-2 py-1.5 rounded-lg text-sm outline-none text-center"
              style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" }}
              min={0}
            />
            <span className="text-xs" style={{ color: "var(--muted)" }}>g ({cPct}%)</span>
          </div>

          {/* Fat */}
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span className="text-xs w-14" style={{ color: "var(--ink)" }}>Fat</span>
            <input
              type="number"
              value={fat}
              onChange={(e) => setFat(Math.max(0, Number(e.target.value)))}
              className="w-20 px-2 py-1.5 rounded-lg text-sm outline-none text-center"
              style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" }}
              min={0}
            />
            <span className="text-xs" style={{ color: "var(--muted)" }}>g ({fPct}%)</span>
          </div>
        </div>

        {/* Macro calories summary */}
        <div
          className="mt-3 pt-3 text-xs text-center"
          style={{ borderTop: "1px solid var(--line)", color: "var(--muted)" }}
        >
          Macros total: {Math.round(totalMacroCal)} cal
          {Math.abs(totalMacroCal - calories) > 50 && (
            <span style={{ color: "var(--warning)" }}>
              {" "}&middot; {totalMacroCal > calories ? "Over" : "Under"} calorie target by{" "}
              {Math.abs(Math.round(totalMacroCal - calories))} cal
            </span>
          )}
        </div>
      </div>

      <button
        onClick={handleSave}
        className="w-full py-2.5 rounded-lg text-sm font-semibold cursor-pointer"
        style={{ background: "var(--accent)", color: "#fff", border: "none" }}
      >
        Save goals
      </button>
    </div>
  );
}
