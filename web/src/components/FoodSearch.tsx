import { useState } from "react";
import type { FoodItem, MealType, FoodEntry } from "../data/types";
import FoodBrowser from "./FoodBrowser";
import FoodDetail from "./FoodDetail";
import RecentFoods from "./RecentFoods";
import Modal from "./Modal";

interface FoodSearchProps {
  meal: MealType;
  onAdd: (entry: FoodEntry) => void;
  onClose: () => void;
}

export default function FoodSearch({ meal, onAdd, onClose }: FoodSearchProps) {
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [quickAddMode, setQuickAddMode] = useState(false);
  const [quickCalories, setQuickCalories] = useState("");
  const [quickName, setQuickName] = useState("");

  const quickCal = Math.round(Number(quickCalories));
  const quickCalValid = quickCalories.trim() !== "" && Number.isFinite(quickCal) && quickCal > 0;

  const handleQuickAdd = () => {
    if (!quickCalValid) return;
    const cal = quickCal;
    onAdd({
      id: crypto.randomUUID(),
      foodId: null,
      name: quickName || "Quick add",
      meal,
      portionGrams: 0,
      calories: cal,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
    });
  };

  return (
    <Modal
      titleId="food-search-title"
      onClose={onClose}
      sheet
      className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
      style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
    >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <h2 id="food-search-title" className="text-base font-bold" style={{ color: "var(--ink)" }}>
            {selectedFood ? selectedFood.name : "Add Food"}
          </h2>
          <div className="flex items-center gap-2">
            {!selectedFood && (
              <button
                onClick={() => setQuickAddMode(!quickAddMode)}
                className="text-xs px-2 py-1 rounded-lg cursor-pointer"
                style={{
                  background: quickAddMode ? "var(--accent)" : "var(--panel)",
                  color: quickAddMode ? "#fff" : "var(--muted)",
                  border: "none",
                }}
              >
                Quick add
              </button>
            )}
            <button
              onClick={selectedFood ? () => setSelectedFood(null) : onClose}
              aria-label={selectedFood ? "Back" : "Close"}
              className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer"
              style={{ background: "var(--panel)", border: "none", color: "var(--ink)" }}
            >
              {selectedFood ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Quick add mode */}
        {quickAddMode && !selectedFood && (
          <div className="p-4 flex flex-col gap-3">
            <input
              type="text"
              placeholder="Item name (optional)"
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: "var(--panel)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
              }}
            />
            <input
              type="number"
              placeholder="Calories"
              value={quickCalories}
              onChange={(e) => setQuickCalories(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: "var(--panel)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
              }}
            />
            <button
              onClick={handleQuickAdd}
              className="w-full py-2 rounded-lg text-sm font-semibold cursor-pointer"
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                opacity: quickCalValid ? 1 : 0.5,
              }}
              disabled={!quickCalValid}
            >
              Add {quickCalValid ? `${quickCal} cal` : ""}
            </button>
          </div>
        )}

        {/* Food selection detail */}
        {selectedFood && (
          <FoodDetail key={selectedFood.id} food={selectedFood} meal={meal} onAdd={onAdd} onDeleted={() => setSelectedFood(null)} />
        )}

        {/* Search & browse list */}
        {!selectedFood && !quickAddMode && (
          <FoodBrowser
            layout="list"
            onSelect={setSelectedFood}
            autoFocus
            renderTop={(favorites) => <RecentFoods meal={meal} favorites={favorites} onAdd={onAdd} />}
          />
        )}
    </Modal>
  );
}
