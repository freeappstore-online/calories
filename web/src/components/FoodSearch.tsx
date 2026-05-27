import { useState, useMemo } from "react";
import { foods, categories, servingSizes } from "../data";
import type { FoodItem, MealType, FoodEntry, ServingSize } from "../data/types";
import { scaleNutrition } from "../lib/nutrition";

interface FoodSearchProps {
  meal: MealType;
  onAdd: (entry: FoodEntry) => void;
  onClose: () => void;
}

export default function FoodSearch({ meal, onAdd, onClose }: FoodSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [portionGrams, setPortionGrams] = useState(100);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [quickAddMode, setQuickAddMode] = useState(false);
  const [quickCalories, setQuickCalories] = useState("");
  const [quickName, setQuickName] = useState("");

  const filtered = useMemo(() => {
    let result = foods;
    if (selectedCategory) {
      result = result.filter((f) => f.category === selectedCategory);
    }
    if (query.length > 0) {
      const q = query.toLowerCase();
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.category.toLowerCase().includes(q),
      );
    }
    return result;
  }, [query, selectedCategory]);

  const handleSelectServing = (serving: ServingSize) => {
    setPortionGrams(serving.grams);
  };

  const handleAdd = () => {
    if (quickAddMode) {
      const cal = parseInt(quickCalories, 10);
      if (isNaN(cal) || cal <= 0) return;
      const entry: FoodEntry = {
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
      };
      onAdd(entry);
      return;
    }

    if (!selectedFood) return;
    const scaled = scaleNutrition(selectedFood, portionGrams);
    const entry: FoodEntry = {
      id: crypto.randomUUID(),
      foodId: selectedFood.id,
      name: selectedFood.name,
      meal,
      portionGrams,
      ...scaled,
    };
    onAdd(entry);
  };

  const servings = selectedFood ? servingSizes[selectedFood.id] : undefined;
  const preview = selectedFood ? scaleNutrition(selectedFood, portionGrams) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <h2 className="text-base font-bold" style={{ color: "var(--ink)" }}>
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
              onClick={handleAdd}
              className="w-full py-2 rounded-lg text-sm font-semibold cursor-pointer"
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                opacity: quickCalories ? 1 : 0.5,
              }}
              disabled={!quickCalories}
            >
              Add {quickCalories ? `${quickCalories} cal` : ""}
            </button>
          </div>
        )}

        {/* Food selection detail */}
        {selectedFood && (
          <div className="p-4 flex flex-col gap-3 overflow-y-auto">
            {/* Serving sizes */}
            {servings && servings.length > 0 && (
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--muted)" }}>
                  Common servings
                </label>
                <div className="flex flex-wrap gap-2">
                  {servings.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => handleSelectServing(s)}
                      className="px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                      style={{
                        background: portionGrams === s.grams ? "var(--accent)" : "var(--panel)",
                        color: portionGrams === s.grams ? "#fff" : "var(--ink)",
                        border: `1px solid ${portionGrams === s.grams ? "var(--accent)" : "var(--line)"}`,
                      }}
                    >
                      {s.label} ({s.grams}g)
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom grams */}
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--muted)" }}>
                Amount (grams)
              </label>
              <input
                type="number"
                value={portionGrams}
                onChange={(e) => setPortionGrams(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  color: "var(--ink)",
                }}
                min={1}
              />
            </div>

            {/* Nutrition preview */}
            {preview && (
              <div
                className="rounded-xl p-3 grid grid-cols-3 gap-2 text-center"
                style={{ background: "var(--panel)" }}
              >
                <div>
                  <div className="text-lg font-bold" style={{ color: "var(--accent)" }}>
                    {preview.calories}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--muted)" }}>cal</div>
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: "#3b82f6" }}>
                    {preview.protein}g
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--muted)" }}>protein</div>
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: "#f59e0b" }}>
                    {preview.carbs}g
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--muted)" }}>carbs</div>
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: "#ef4444" }}>
                    {preview.fat}g
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--muted)" }}>fat</div>
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                    {preview.fiber}g
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--muted)" }}>fiber</div>
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                    {preview.sugar}g
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--muted)" }}>sugar</div>
                </div>
              </div>
            )}

            <button
              onClick={handleAdd}
              className="w-full py-2.5 rounded-lg text-sm font-semibold cursor-pointer"
              style={{ background: "var(--accent)", color: "#fff", border: "none" }}
            >
              Add to {meal}
            </button>
          </div>
        )}

        {/* Search & browse list */}
        {!selectedFood && !quickAddMode && (
          <>
            <div className="px-4 pt-3">
              <input
                type="text"
                placeholder="Search foods..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  color: "var(--ink)",
                }}
              />
            </div>

            {/* Category pills */}
            <div className="flex gap-2 px-4 py-2 overflow-x-auto shrink-0">
              <button
                onClick={() => setSelectedCategory(null)}
                className="px-3 py-1 rounded-full text-xs whitespace-nowrap cursor-pointer"
                style={{
                  background: !selectedCategory ? "var(--accent)" : "var(--panel)",
                  color: !selectedCategory ? "#fff" : "var(--muted)",
                  border: "none",
                }}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id === selectedCategory ? null : c.id)}
                  className="px-3 py-1 rounded-full text-xs whitespace-nowrap cursor-pointer"
                  style={{
                    background: selectedCategory === c.id ? "var(--accent)" : "var(--panel)",
                    color: selectedCategory === c.id ? "#fff" : "var(--muted)",
                    border: "none",
                  }}
                >
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>

            {/* Food list */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {filtered.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    No foods found
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filtered.map((food) => (
                    <button
                      key={food.id}
                      onClick={() => {
                        setSelectedFood(food);
                        // Set default portion from first serving size if available
                        const s = servingSizes[food.id];
                        if (s && s.length > 0 && s[0]) {
                          setPortionGrams(s[0].grams);
                        } else {
                          setPortionGrams(100);
                        }
                      }}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left cursor-pointer"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--ink)",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--panel)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <div>
                        <div className="text-sm font-medium">{food.name}</div>
                        <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                          {food.calories} cal/100g &middot; P:{food.protein}g C:{food.carbs}g F:{food.fat}g
                        </div>
                      </div>
                      <svg
                        className="w-4 h-4 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        style={{ color: "var(--muted)" }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
