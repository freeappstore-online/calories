import { useState, useMemo, type ReactNode } from "react";
import { foods, categories } from "../data";
import type { FoodItem } from "../data/types";
import FoodIcon from "./FoodIcon";
import CustomFoodForm from "./CustomFoodForm";
import { getCustomFoods } from "../lib/customFoods";
import { getFavorites, toggleFavorite } from "../lib/foodHistory";

interface FoodBrowserProps {
  layout: "list" | "grid";
  onSelect: (food: FoodItem) => void;
  autoFocus?: boolean;
  /** Rendered above the list while the search query is empty */
  renderTop?: (favorites: string[]) => ReactNode;
}

function StarButton({ active, name, onToggle, className }: { active: boolean; name: string; onToggle: () => void; className?: string }) {
  return (
    <button
      onClick={onToggle}
      aria-label={`${active ? "Remove" : "Add"} ${name} ${active ? "from" : "to"} favorites`}
      aria-pressed={active}
      className={`w-8 h-8 flex items-center justify-center shrink-0 cursor-pointer ${className ?? ""}`}
      style={{ background: "transparent", border: "none", color: active ? "#f59e0b" : "var(--muted)" }}
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.56.56 0 011.04 0l2.13 5.11 5.52.44c.5.04.7.66.32.99l-4.2 3.6 1.28 5.38a.56.56 0 01-.84.61L12 16.76l-4.73 2.87a.56.56 0 01-.84-.61l1.28-5.38-4.2-3.6a.56.56 0 01.32-.99l5.52-.44 2.13-5.11z" />
      </svg>
    </button>
  );
}

/** Search box, category pills and the illustrated food list/grid */
export default function FoodBrowser({ layout, onSelect, autoFocus, renderTop }: FoodBrowserProps) {
  const [favorites, setFavorites] = useState(getFavorites);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customFoods, setCustomFoods] = useState(getCustomFoods);
  const [creating, setCreating] = useState(false);
  const allFoods = useMemo<FoodItem[]>(() => [...customFoods, ...foods], [customFoods]);

  const filtered = useMemo(() => {
    let result = allFoods;
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
  }, [allFoods, query, selectedCategory]);

  return (
    <>
      <div className="px-4 pt-3 flex gap-2">
        <input
          type="text"
          placeholder={`Search ${allFoods.length} foods...`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={autoFocus}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm outline-none"
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            color: "var(--ink)",
          }}
        />
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer"
          style={{ background: "var(--panel)", color: "var(--accent)", border: "1px solid var(--line)" }}
        >
          + Create food
        </button>
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
        {[...(customFoods.length > 0 ? [{ id: "custom", name: "My foods", emoji: "⭐" }] : []), ...categories].map((c) => (
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
            <div key={food.id} className="relative">
            <button
              onClick={() => onSelect(food)}
              className="w-full h-full flex flex-col items-center gap-1 p-2 rounded-xl text-center cursor-pointer"
              style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" }}
            >
              <FoodIcon image={food.image} size={56} />
              <div className="text-xs font-medium leading-tight line-clamp-2">{food.name}</div>
              <div className="text-[0.625rem]" style={{ color: "var(--muted)" }}>
                {food.calories} cal &middot; {Math.round(food.protein)}g P
              </div>
            </button>
            <StarButton
              className="absolute top-0 right-0"
              active={favorites.includes(food.id)}
              name={food.name}
              onToggle={() => setFavorites(toggleFavorite(food.id))}
            />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {query.length === 0 && renderTop?.(favorites)}
          <div className="space-y-1">
            {filtered.map((food) => (
              <div key={food.id} className="flex items-center">
              <button
                onClick={() => onSelect(food)}
                className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2 rounded-lg text-left cursor-pointer"
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
                  <div className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                    {food.calories} cal/100g &middot; P:{Math.round(food.protein)}g C:{Math.round(food.carbs)}g F:{Math.round(food.fat)}g
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
              <StarButton
                active={favorites.includes(food.id)}
                name={food.name}
                onToggle={() => setFavorites(toggleFavorite(food.id))}
              />
              </div>
            ))}
          </div>
        </div>
      )}
      {creating && (
        <CustomFoodForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCustomFoods(getCustomFoods());
            setCreating(false);
          }}
        />
      )}
    </>
  );
}
