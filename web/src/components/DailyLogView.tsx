import { useState, useMemo, useCallback } from "react";
import type { DailyLog, DailyGoals, MealType, FoodEntry, SavedMeal } from "../data/types";
import { sumEntries } from "../lib/nutrition";
import { formatDate, shiftDate } from "../lib/dates";
import ProgressRing from "./ProgressRing";
import FoodSearch from "./FoodSearch";

const MEALS: { id: MealType; label: string; icon: string }[] = [
  { id: "breakfast", label: "Breakfast", icon: "🌅" },
  { id: "lunch", label: "Lunch", icon: "☀️" },
  { id: "dinner", label: "Dinner", icon: "🌙" },
  { id: "snacks", label: "Snacks", icon: "🍿" },
];

interface DailyLogViewProps {
  date: string;
  log: DailyLog;
  goals: DailyGoals;
  savedMeals: SavedMeal[];
  onDateChange: (date: string) => void;
  onLogChange: (log: DailyLog) => void;
  onSaveMeal: (name: string, entries: FoodEntry[]) => void;
  onLoadSavedMeal: (meal: SavedMeal, mealType: MealType) => void;
  onCopyYesterday: () => void;
}

export default function DailyLogView({
  date,
  log,
  goals,
  savedMeals,
  onDateChange,
  onLogChange,
  onSaveMeal,
  onLoadSavedMeal,
  onCopyYesterday,
}: DailyLogViewProps) {
  const [activeMeal, setActiveMeal] = useState<MealType>("breakfast");
  const [showAddFood, setShowAddFood] = useState(false);
  const [saveMealName, setSaveMealName] = useState("");
  const [showSaveMeal, setShowSaveMeal] = useState(false);
  const [showLoadMeal, setShowLoadMeal] = useState(false);

  const totals = useMemo(() => sumEntries(log.entries), [log.entries]);

  const mealEntries = useMemo(
    () => log.entries.filter((e) => e.meal === activeMeal),
    [log.entries, activeMeal],
  );

  const mealTotals = useMemo(() => {
    const result: Record<MealType, number> = {
      breakfast: 0,
      lunch: 0,
      dinner: 0,
      snacks: 0,
    };
    for (const e of log.entries) {
      result[e.meal] += e.calories;
    }
    return result;
  }, [log.entries]);

  const handleAddEntry = useCallback(
    (entry: FoodEntry) => {
      onLogChange({
        ...log,
        entries: [...log.entries, entry],
      });
      setShowAddFood(false);
    },
    [log, onLogChange],
  );

  const handleRemoveEntry = useCallback(
    (entryId: string) => {
      onLogChange({
        ...log,
        entries: log.entries.filter((e) => e.id !== entryId),
      });
    },
    [log, onLogChange],
  );

  const handleSaveMealConfirm = () => {
    if (!saveMealName.trim() || mealEntries.length === 0) return;
    onSaveMeal(saveMealName.trim(), mealEntries);
    setSaveMealName("");
    setShowSaveMeal(false);
  };

  const remaining = goals.calories - totals.calories;

  return (
    <div className="space-y-4">
      {/* Date selector */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onDateChange(shiftDate(date, -1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer"
          style={{ background: "var(--panel)", border: "none", color: "var(--ink)" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            {formatDate(date)}
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="text-xs mt-0.5 bg-transparent border-none outline-none cursor-pointer"
            style={{ color: "var(--muted)" }}
          />
        </div>
        <button
          onClick={() => onDateChange(shiftDate(date, 1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer"
          style={{ background: "var(--panel)", border: "none", color: "var(--ink)" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Progress rings */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
      >
        <div className="flex justify-around">
          <ProgressRing value={totals.calories} max={goals.calories} label="cal" size={80} strokeWidth={6} />
          <ProgressRing value={totals.protein} max={goals.protein} label="protein" unit="g" size={70} strokeWidth={5} color="#3b82f6" />
          <ProgressRing value={totals.carbs} max={goals.carbs} label="carbs" unit="g" size={70} strokeWidth={5} color="#f59e0b" />
          <ProgressRing value={totals.fat} max={goals.fat} label="fat" unit="g" size={70} strokeWidth={5} color="#ef4444" />
        </div>
        <div className="text-center mt-2">
          <span
            className="text-xs font-medium"
            style={{ color: remaining >= 0 ? "var(--success)" : "var(--error)" }}
          >
            {remaining >= 0 ? `${remaining} cal remaining` : `${Math.abs(remaining)} cal over goal`}
          </span>
        </div>
      </div>

      {/* Meal tabs */}
      <div className="flex gap-1 overflow-x-auto">
        {MEALS.map((m) => (
          <button
            key={m.id}
            onClick={() => setActiveMeal(m.id)}
            className="flex-1 min-w-0 px-2 py-2 rounded-lg text-center cursor-pointer"
            style={{
              background: activeMeal === m.id ? "var(--accent)" : "var(--panel)",
              color: activeMeal === m.id ? "#fff" : "var(--ink)",
              border: "none",
            }}
          >
            <div className="text-sm">{m.icon}</div>
            <div className="text-[10px] font-medium truncate">{m.label}</div>
            <div
              className="text-[10px]"
              style={{ color: activeMeal === m.id ? "rgba(255,255,255,0.7)" : "var(--muted)" }}
            >
              {mealTotals[m.id]} cal
            </div>
          </button>
        ))}
      </div>

      {/* Entries list */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--line)" }}
      >
        {mealEntries.length === 0 ? (
          <div className="text-center py-8 px-4">
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No entries yet for {MEALS.find((m) => m.id === activeMeal)?.label}
            </p>
          </div>
        ) : (
          <div>
            {mealEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: "1px solid var(--line)" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>
                    {entry.name}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                    {entry.portionGrams > 0 ? `${entry.portionGrams}g` : "Quick add"}
                    {" "}&middot; P:{entry.protein}g C:{entry.carbs}g F:{entry.fat}g
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                    {entry.calories}
                  </span>
                  <button
                    onClick={() => handleRemoveEntry(entry.id)}
                    className="w-6 h-6 flex items-center justify-center rounded cursor-pointer"
                    style={{ background: "var(--panel)", border: "none", color: "var(--error)" }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 p-3" style={{ background: "var(--panel)" }}>
          <button
            onClick={() => setShowAddFood(true)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff", border: "none" }}
          >
            + Add food
          </button>
          {mealEntries.length > 0 && (
            <button
              onClick={() => setShowSaveMeal(true)}
              className="px-3 py-2 rounded-lg text-xs font-medium cursor-pointer"
              style={{ background: "var(--panel)", color: "var(--muted)", border: "1px solid var(--line)" }}
            >
              Save meal
            </button>
          )}
          {savedMeals.length > 0 && (
            <button
              onClick={() => setShowLoadMeal(true)}
              className="px-3 py-2 rounded-lg text-xs font-medium cursor-pointer"
              style={{ background: "var(--panel)", color: "var(--muted)", border: "1px solid var(--line)" }}
            >
              Load meal
            </button>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <button
          onClick={onCopyYesterday}
          className="flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer"
          style={{ background: "var(--panel)", color: "var(--muted)", border: "1px solid var(--line)" }}
        >
          Copy yesterday
        </button>
      </div>

      {/* Save meal dialog */}
      {showSaveMeal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSaveMeal(false);
          }}
        >
          <div
            className="w-80 rounded-xl p-4"
            style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
          >
            <h3 className="text-sm font-bold mb-3" style={{ color: "var(--ink)" }}>
              Save as meal template
            </h3>
            <input
              type="text"
              placeholder="Meal name..."
              value={saveMealName}
              onChange={(e) => setSaveMealName(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3"
              style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowSaveMeal(false)}
                className="flex-1 py-2 rounded-lg text-xs cursor-pointer"
                style={{ background: "var(--panel)", color: "var(--muted)", border: "1px solid var(--line)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMealConfirm}
                className="flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                style={{ background: "var(--accent)", color: "#fff", border: "none" }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load meal dialog */}
      {showLoadMeal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowLoadMeal(false);
          }}
        >
          <div
            className="w-80 max-h-[60vh] flex flex-col rounded-xl overflow-hidden"
            style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
          >
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
              <h3 className="text-sm font-bold" style={{ color: "var(--ink)" }}>
                Load saved meal
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {savedMeals.map((sm) => (
                <button
                  key={sm.id}
                  onClick={() => {
                    onLoadSavedMeal(sm, activeMeal);
                    setShowLoadMeal(false);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-lg cursor-pointer"
                  style={{ background: "transparent", border: "none", color: "var(--ink)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--panel)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div className="text-sm font-medium">{sm.name}</div>
                  <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                    {sm.entries.length} items &middot;{" "}
                    {sm.entries.reduce((sum, e) => sum + e.calories, 0)} cal
                  </div>
                </button>
              ))}
            </div>
            <div className="p-3" style={{ borderTop: "1px solid var(--line)" }}>
              <button
                onClick={() => setShowLoadMeal(false)}
                className="w-full py-2 rounded-lg text-xs cursor-pointer"
                style={{ background: "var(--panel)", color: "var(--muted)", border: "1px solid var(--line)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Food search modal */}
      {showAddFood && (
        <FoodSearch
          meal={activeMeal}
          onAdd={handleAddEntry}
          onClose={() => setShowAddFood(false)}
        />
      )}
    </div>
  );
}
