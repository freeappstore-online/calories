import { useMemo } from "react";
import { foodById } from "../data";
import type { FoodEntry, MealType } from "../data/types";
import {
  getFavoriteTemplates,
  getFrequentFoods,
  getRecentFoods,
  templateToEntry,
  type FoodTemplate,
} from "../lib/foodHistory";
import FoodIcon from "./FoodIcon";

interface RecentFoodsProps {
  meal: MealType;
  favorites: string[];
  onAdd: (entry: FoodEntry) => void;
}

const LIMIT = 5;

/** Favorites, frequent and recent foods with one-tap re-logging */
export default function RecentFoods({ meal, favorites, onAdd }: RecentFoodsProps) {
  const sections = useMemo(() => {
    const shown = new Set<string>();
    const unseen = (list: FoodTemplate[]) => {
      const out = list.filter((t) => !shown.has(t.foodId!));
      out.forEach((t) => shown.add(t.foodId!));
      return out;
    };
    return [
      { title: "Favorites", items: unseen(getFavoriteTemplates(favorites)) },
      { title: "Frequent", items: unseen(getFrequentFoods(LIMIT)) },
      { title: "Recent", items: unseen(getRecentFoods(LIMIT)) },
    ].filter((s) => s.items.length > 0);
  }, [favorites]);

  if (sections.length === 0) return null;

  return (
    <div className="pb-1">
      {sections.map((section) => (
        <div key={section.title} className="mb-2">
          <div className="text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>
            {section.title}
          </div>
          <div className="space-y-1">
            {section.items.map((t) => {
              const image = foodById.get(t.foodId!)?.image;
              return (
                <button
                  key={t.foodId}
                  onClick={() => onAdd(templateToEntry(t, meal))}
                  aria-label={`Add ${t.name}, ${t.portionGrams} g`}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left cursor-pointer"
                  style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" }}
                >
                  {image && <FoodIcon image={image} size={32} />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.name}</div>
                    <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                      {t.portionGrams} g &middot; {t.calories} cal
                    </div>
                  </div>
                  <svg
                    className="w-4 h-4 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    style={{ color: "var(--accent)" }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
