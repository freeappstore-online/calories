import { useEffect, useRef, useState } from "react";
import type { FoodItem, MealType, FoodEntry } from "../data/types";
import { today, formatDate } from "../lib/dates";
import FoodBrowser from "./FoodBrowser";
import FoodDetail from "./FoodDetail";
import Modal from "./Modal";

interface FoodsViewProps {
  /** The currently selected log day (YYYY-MM-DD) */
  date: string;
  /** Adds the entry to the log of the currently selected day */
  onAdd: (entry: FoodEntry) => void;
}

/** Illustrated library of common foods with full nutrition facts */
export default function FoodsView({ date, onAdd }: FoodsViewProps) {
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [meal, setMeal] = useState<MealType>("snacks");
  const [added, setAdded] = useState<string | null>(null);
  /** Bumped after a custom food is deleted so the browser reloads its list */
  const [browserKey, setBrowserKey] = useState(0);

  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const handleAdd = (entry: FoodEntry) => {
    onAdd(entry);
    setAdded(`${entry.name} added to ${entry.meal}${date === today() ? "" : ` on ${formatDate(date)}`}`);
    setSelectedFood(null);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setAdded(null), 2500);
  };

  return (
    <div className="-mx-4">
      {date !== today() && (
        <p className="text-xs text-center font-semibold px-4 pb-2" style={{ color: "var(--warning)" }}>
          Adding to {formatDate(date)}, not today
        </p>
      )}
      <FoodBrowser key={browserKey} layout="grid" onSelect={setSelectedFood} />
      <p className="text-[0.625rem] text-center px-4 pb-2" style={{ color: "var(--muted)" }}>
        Nutrition: USDA FoodData Central &middot; Illustrations: Microsoft Fluent Emoji
      </p>

      {added && (
        <div
          className="fixed left-1/2 -translate-x-1/2 bottom-20 z-40 px-4 py-2 rounded-full text-xs font-semibold"
          style={{ background: "var(--ink)", color: "var(--paper)" }}
        >
          {added}
        </div>
      )}

      {selectedFood && (
        <Modal
          titleId="food-detail-title"
          onClose={() => setSelectedFood(null)}
          sheet
          className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
          style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
        >
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <h2 id="food-detail-title" className="text-base font-bold" style={{ color: "var(--ink)" }}>
                {selectedFood.name}
              </h2>
              <button
                onClick={() => setSelectedFood(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer"
                style={{ background: "var(--panel)", border: "none", color: "var(--ink)" }}
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <FoodDetail
              key={selectedFood.id}
              food={selectedFood}
              meal={meal}
              onMealChange={setMeal}
              onAdd={handleAdd}
              onDeleted={() => {
                setSelectedFood(null);
                setBrowserKey((k) => k + 1);
              }}
            />
        </Modal>
      )}
    </div>
  );
}
