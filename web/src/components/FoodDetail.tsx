import { useState } from "react";
import { deleteCustomFood, servingsFor } from "../lib/customFoods";
import { MICRO_DEFS } from "../data/types";
import type { FoodItem, MealType, FoodEntry } from "../data/types";
import { formatMicro, scaleMicros, scaleNutrition } from "../lib/nutrition";
import { useTargets } from "../lib/targets";
import FoodIcon from "./FoodIcon";

const MEALS: { id: MealType; label: string }[] = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "snacks", label: "Snacks" },
];

interface FoodDetailProps {
  food: FoodItem;
  meal: MealType;
  /** When set, the user can choose which meal to add to */
  onMealChange?: (meal: MealType) => void;
  onAdd: (entry: FoodEntry) => void;
  /** Called after a custom food was deleted from this detail view */
  onDeleted?: () => void;
}

/** Serving picker, nutrition facts and add button for one food */
export default function FoodDetail({ food, meal, onMealChange, onAdd, onDeleted }: FoodDetailProps) {
  const targets = useTargets();
  const servings = servingsFor(food);
  const [gramsText, setGramsText] = useState(String(servings?.[0]?.grams ?? 100));
  const [servingIdx, setServingIdx] = useState<number | null>(servings?.length ? 0 : null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const portionGrams = Number(gramsText);
  const valid = Number.isFinite(portionGrams) && portionGrams >= 1;
  const preview = scaleNutrition(food, valid ? portionGrams : 0);
  const factor = valid ? portionGrams / 100 : 0;

  const handleAdd = () => {
    if (!valid) return;
    onAdd({
      id: crypto.randomUUID(),
      foodId: food.id,
      name: food.name,
      meal,
      portionGrams,
      ...preview,
      micros: scaleMicros(food, portionGrams),
    });
  };

  return (
    <div className="p-4 flex flex-col gap-3 overflow-y-auto">
      <div className="flex justify-center">
        <FoodIcon image={food.image} size={88} />
      </div>

      {/* Serving sizes */}
      {servings && servings.length > 0 && (
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: "var(--muted)" }}>
            Common servings
          </label>
          <div className="flex flex-wrap gap-2">
            {servings.map((s, i) => (
              <button
                key={s.label}
                onClick={() => {
                  setServingIdx(i);
                  setGramsText(String(s.grams));
                }}
                className="px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                style={{
                  background: servingIdx === i ? "var(--accent)" : "var(--panel)",
                  color: servingIdx === i ? "#fff" : "var(--ink)",
                  border: `1px solid ${servingIdx === i ? "var(--accent)" : "var(--line)"}`,
                }}
              >
                {s.label} ({Math.round(s.grams)}g)
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
          value={gramsText}
          onChange={(e) => {
            setGramsText(e.target.value);
            setServingIdx(null);
          }}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            color: "var(--ink)",
          }}
          min={1}
        />
      </div>

      {/* Macros */}
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
            {Math.round(preview.protein)}g
          </div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>protein</div>
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ color: "#f59e0b" }}>
            {Math.round(preview.carbs)}g
          </div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>carbs</div>
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ color: "#ef4444" }}>
            {Math.round(preview.fat)}g
          </div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>fat</div>
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            {Math.round(preview.fiber)}g
          </div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>fiber</div>
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            {Math.round(preview.sugar)}g
          </div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>sugar</div>
        </div>
      </div>

      {/* Micronutrients */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--line)" }}>
        <div
          className="flex justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: "var(--panel)", color: "var(--muted)" }}
        >
          <span>Nutrient</span>
          <span>Amount &middot; % of target</span>
        </div>
        {MICRO_DEFS.map((m) => {
          const per100 = food[m.key];
          const amount = per100 === null ? null : per100 * factor;
          return (
            <div
              key={m.key}
              className="flex justify-between px-3 py-1.5 text-xs"
              style={{ borderTop: "1px solid var(--line)", color: "var(--ink)" }}
            >
              <span>{m.label}</span>
              <span>
                {amount === null ? "—" : `${formatMicro(amount)}${m.unit}`}
                {amount !== null && (
                  <span className="inline-block w-10 text-right" style={{ color: "var(--muted)" }}>
                    {Math.round((amount / targets[m.key]) * 100)}%
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-center" style={{ color: "var(--muted)" }}>
        {food.fdcId ? `Source: USDA FoodData Central #${food.fdcId}` : "Custom food"}
      </p>

      {onMealChange && (
        <div className="grid grid-cols-4 gap-1">
          {MEALS.map((m) => (
            <button
              key={m.id}
              onClick={() => onMealChange(m.id)}
              className="py-1.5 rounded-lg text-xs cursor-pointer"
              style={{
                background: meal === m.id ? "var(--accent)" : "var(--panel)",
                color: meal === m.id ? "#fff" : "var(--muted)",
                border: "none",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={handleAdd}
        disabled={!valid}
        className="w-full py-2.5 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: "var(--accent)", color: "#fff", border: "none" }}
      >
        Add to {meal}
      </button>

      {food.category === "custom" && (
        <div className="flex gap-2">
          {confirmDelete && (
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 py-2 rounded-lg text-xs cursor-pointer"
              style={{ background: "var(--panel)", color: "var(--muted)", border: "none" }}
            >
              Keep food
            </button>
          )}
          <button
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              deleteCustomFood(food.id);
              onDeleted?.();
            }}
            className="flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: "transparent", color: "#ef4444", border: "1px solid #ef4444" }}
          >
            {confirmDelete ? "Confirm delete (logged entries stay)" : "Delete food"}
          </button>
        </div>
      )}
    </div>
  );
}
