import { useState, useMemo } from "react";
import { foods, categories } from "../data";
import type { FoodItem } from "../data/types";
import FoodIcon from "./FoodIcon";

interface FoodBrowserProps {
  layout: "list" | "grid";
  onSelect: (food: FoodItem) => void;
  autoFocus?: boolean;
}

/** Search box, category pills and the illustrated food list/grid */
export default function FoodBrowser({ layout, onSelect, autoFocus }: FoodBrowserProps) {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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

  return (
    <>
      <div className="px-4 pt-3">
        <input
          type="text"
          placeholder={`Search ${foods.length} foods...`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={autoFocus}
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

      {filtered.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No foods found
          </p>
        </div>
      ) : layout === "grid" ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 px-4 pb-4">
          {filtered.map((food) => (
            <button
              key={food.id}
              onClick={() => onSelect(food)}
              className="flex flex-col items-center gap-1 p-2 rounded-xl text-center cursor-pointer"
              style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" }}
            >
              <FoodIcon image={food.image} size={56} />
              <div className="text-xs font-medium leading-tight line-clamp-2">{food.name}</div>
              <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                {food.calories} cal &middot; {food.protein}g P
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="space-y-1">
            {filtered.map((food) => (
              <button
                key={food.id}
                onClick={() => onSelect(food)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left cursor-pointer"
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
                <FoodIcon image={food.image} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{food.name}</div>
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
        </div>
      )}
    </>
  );
}
