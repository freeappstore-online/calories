import { useState, useMemo, useCallback } from "react";
import type { DailyLog, MealType, FoodEntry, SavedMeal } from "../data/types";
import { sumEntries } from "../lib/nutrition";
import { formatDate, shiftDate, today } from "../lib/dates";
import TargetBars from "./TargetBars";
import MealSummary from "./MealSummary";
import FoodSearch from "./FoodSearch";
import FoodIcon from "./FoodIcon";
import Modal from "./Modal";
import NutritionBreakdown from "./NutritionBreakdown";
import EditEntryModal from "./EditEntryModal";
import { defaultMealForTime, scaleEntry, stepEntry } from "../lib/entryEdit";
import { getSettings } from "../lib/settings";
import { imageFor } from "../lib/customFoods";

const MEALS: { id: MealType; label: string }[] = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "snacks", label: "Snacks" },
];

interface DailyLogViewProps {
  date: string;
  log: DailyLog;
  savedMeals: SavedMeal[];
  onDateChange: (date: string) => void;
  onLogChange: (log: DailyLog) => void;
  onSaveMeal: (name: string, entries: FoodEntry[]) => void;
  onLoadSavedMeal: (meal: SavedMeal, mealType: MealType) => void;
  /** Returns how many entries were copied */
  onCopyYesterday: () => number;
}

export default function DailyLogView({
  date,
  log,
  savedMeals,
  onDateChange,
  onLogChange,
  onSaveMeal,
  onLoadSavedMeal,
  onCopyYesterday,
}: DailyLogViewProps) {
  const [activeMeal, setActiveMeal] = useState<MealType>(() => defaultMealForTime(new Date()));
  const [showAddFood, setShowAddFood] = useState(false);
  const [confirmCopyDate, setConfirmCopyDate] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [saveMealName, setSaveMealName] = useState("");
  const [showSaveMeal, setShowSaveMeal] = useState(false);
  const [showLoadMeal, setShowLoadMeal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<"day" | "meal" | null>(null);
  const editing = log.entries.find((e) => e.id === editingId) ?? null;

  const changeDate = (d: string) => {
    if (d === today()) setActiveMeal(defaultMealForTime(new Date()));
    onDateChange(d);
  };

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

  const handleUpdateEntry = (updated: FoodEntry) => {
    onLogChange({
      ...log,
      entries: log.entries.map((e) => (e.id === updated.id ? updated : e)),
    });
    setEditingId(null);
  };

  const steps = getSettings();

  const replaceEntries = (update: (e: FoodEntry) => FoodEntry) => {
    onLogChange({ ...log, entries: log.entries.map(update) });
  };

  /** Change one food by the food step (grams) */
  const handleStepFood = (id: string, sign: 1 | -1) => {
    replaceEntries((e) => (e.id === id ? stepEntry(e, sign * steps.foodStepGrams) : e));
  };

  /** Change the meal's total weight by the meal step, spread proportionally over its foods */
  const handleStepMeal = (sign: 1 | -1) => {
    const foods = mealEntries.filter((e) => e.portionGrams > 0);
    const weight = foods.reduce((sum, e) => sum + e.portionGrams, 0);
    const target = weight + sign * steps.mealStepGrams;
    if (weight <= 0 || target < 1) return;
    const ids = new Set(foods.map((e) => e.id));
    replaceEntries((e) => (ids.has(e.id) ? scaleEntry(e, target / weight) : e));
  };

  const handleSaveMealConfirm = () => {
    if (!saveMealName.trim() || mealEntries.length === 0) return;
    onSaveMeal(saveMealName.trim(), mealEntries);
    setSaveMealName("");
    setShowSaveMeal(false);
  };

  const confirmCopy = confirmCopyDate === date;
  const handleCopy = () => {
    if (log.entries.length > 0 && !confirmCopy) {
      setConfirmCopyDate(date);
      return;
    }
    setConfirmCopyDate(null);
    const n = onCopyYesterday();
    setCopyMsg(n === 0 ? "Nothing logged yesterday" : `Copied ${n} ${n === 1 ? "entry" : "entries"}`);
    setTimeout(() => setCopyMsg(null), 2500);
  };

  return (
    <div className="space-y-4">
      {/* Date selector */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => changeDate(shiftDate(date, -1))}
          aria-label="Previous day"
          className="w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer"
          style={{ background: "var(--panel)", border: "none", color: "var(--ink)" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {/* Invisible native date input over the label: tapping the label opens the picker */}
        <label className="relative px-3 py-1.5 rounded-lg cursor-pointer text-sm font-bold" style={{ color: "var(--ink)" }}>
          {formatDate(date)}
          <input
            type="date"
            aria-label="Select date"
            value={date}
            onChange={(e) => {
              if (e.target.value) changeDate(e.target.value);
            }}
            onClick={(e) => e.currentTarget.showPicker?.()}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </label>
        <button
          onClick={() => changeDate(shiftDate(date, 1))}
          aria-label="Next day"
          className="w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer"
          style={{ background: "var(--panel)", border: "none", color: "var(--ink)" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Daily targets */}
      <TargetBars totals={totals} onOpen={() => setBreakdown("day")} />


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
            <div className="text-[0.625rem] font-medium truncate">{m.label}</div>
            <div
              className="text-[0.625rem]"
              style={{ color: activeMeal === m.id ? "rgba(255,255,255,0.7)" : "var(--muted)" }}
            >
              {Math.round(mealTotals[m.id])} cal
            </div>
          </button>
        ))}
      </div>

      {mealEntries.length > 0 && (
        <MealSummary
          label={MEALS.find((m) => m.id === activeMeal)!.label}
          entries={mealEntries}
          stepGrams={steps.mealStepGrams}
          onStep={handleStepMeal}
          onOpen={() => setBreakdown("meal")}
        />
      )}

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
                className="flex items-center justify-between px-4 py-3 cursor-pointer"
                style={{ borderBottom: "1px solid var(--line)" }}
                onClick={() => setEditingId(entry.id)}
              >
                {imageFor(entry.foodId) && (
                  <span className="mr-3 flex">
                    <FoodIcon image={imageFor(entry.foodId)!} size={32} />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(entry.id);
                    }}
                    aria-label={`Edit ${entry.name}`}
                    className="block max-w-full text-left text-sm font-medium truncate cursor-pointer"
                    style={{ color: "var(--ink)", background: "transparent", border: "none", padding: 0 }}
                  >
                    {entry.name}
                  </button>
                  <div className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                    {entry.portionGrams > 0 ? `${Math.round(entry.portionGrams)}g` : "Quick add"}
                    {" "}&middot; P:{Math.round(entry.protein)}g C:{Math.round(entry.carbs)}g F:{Math.round(entry.fat)}g
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStepFood(entry.id, -1);
                    }}
                    aria-label={`${steps.foodStepGrams} g less ${entry.name}`}
                    hidden={entry.portionGrams <= 0}
                    className="w-7 h-7 rounded-lg text-sm font-bold cursor-pointer"
                    style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" }}
                  >
                    −
                  </button>
                  <span className="w-9 text-center text-sm font-bold" style={{ color: "var(--accent)" }}>
                    {Math.round(entry.calories)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStepFood(entry.id, 1);
                    }}
                    aria-label={`${steps.foodStepGrams} g more ${entry.name}`}
                    hidden={entry.portionGrams <= 0}
                    className="w-7 h-7 rounded-lg text-sm font-bold cursor-pointer"
                    style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" }}
                  >
                    +
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveEntry(entry.id);
                    }}
                    aria-label={`Remove ${entry.name}`}
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
          onClick={handleCopy}
          className="flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer"
          style={{ background: "var(--panel)", color: "var(--muted)", border: "1px solid var(--line)" }}
        >
          {confirmCopy
            ? "This day already has entries. Tap again to add yesterday's"
            : (copyMsg ?? "Copy yesterday")}
        </button>
      </div>

      {/* Save meal dialog */}
      {showSaveMeal && (
        <Modal
          titleId="save-meal-title"
          onClose={() => setShowSaveMeal(false)}
          className="w-80 rounded-xl p-4"
          style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
        >
            <h3 id="save-meal-title" className="text-sm font-bold mb-3" style={{ color: "var(--ink)" }}>
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
        </Modal>
      )}

      {/* Load meal dialog */}
      {showLoadMeal && (
        <Modal
          titleId="load-meal-title"
          onClose={() => setShowLoadMeal(false)}
          className="w-80 max-h-[60vh] flex flex-col rounded-xl overflow-hidden"
          style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
        >
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
              <h3 id="load-meal-title" className="text-sm font-bold" style={{ color: "var(--ink)" }}>
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
                  <div className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                    {sm.entries.length} items &middot;{" "}
                    {Math.round(sm.entries.reduce((sum, e) => sum + e.calories, 0))} cal
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
        </Modal>
      )}

      {editing && (
        <EditEntryModal entry={editing} onSave={handleUpdateEntry} onClose={() => setEditingId(null)} />
      )}

      {breakdown && (
        <NutritionBreakdown
          title={breakdown === "day" ? formatDate(date) : `${MEALS.find((m) => m.id === activeMeal)!.label} · ${formatDate(date)}`}
          entries={breakdown === "day" ? log.entries : mealEntries}
          onClose={() => setBreakdown(null)}
        />
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
