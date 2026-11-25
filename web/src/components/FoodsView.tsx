import { useState } from "react";
import type { FoodItem, MealType, FoodEntry } from "../data/types";
import FoodBrowser from "./FoodBrowser";
import FoodDetail from "./FoodDetail";

interface FoodsViewProps {
  /** Adds the entry to the log of the currently selected day */
  onAdd: (entry: FoodEntry) => void;
}

/** Illustrated library of common foods with full nutrition facts */
export default function FoodsView({ onAdd }: FoodsViewProps) {
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [meal, setMeal] = useState<MealType>("snacks");
  const [added, setAdded] = useState<string | null>(null);

  const handleAdd = (entry: FoodEntry) => {
    onAdd(entry);
    setAdded(`${entry.name} added to ${entry.meal}`);
    setSelectedFood(null);
    setTimeout(() => setAdded(null), 2500);
  };

  return (
    <div className="-mx-4">
      <FoodBrowser layout="grid" onSelect={setSelectedFood} />
      <p className="text-[10px] text-center px-4 pb-2" style={{ color: "var(--muted)" }}>
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
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedFood(null);
          }}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
            style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <h2 className="text-base font-bold" style={{ color: "var(--ink)" }}>
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
            />
          </div>
        </div>
      )}
    </div>
  );
}
