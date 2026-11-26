import { useState } from "react";
import type { FoodEntry, MealType } from "../data/types";
import { servingSizes } from "../data";
import { rescaleEntry } from "../lib/entryEdit";
import Modal from "./Modal";

const MEALS: { id: MealType; label: string }[] = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "snacks", label: "Snacks" },
];

const inputStyle = { background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" };

interface EditEntryModalProps {
  entry: FoodEntry;
  onSave: (entry: FoodEntry) => void;
  onClose: () => void;
}

/** Edit a logged entry: portion (food entries) or name/macros (quick add), plus meal */
export default function EditEntryModal({ entry, onSave, onClose }: EditEntryModalProps) {
  const isFood = entry.foodId !== null && entry.portionGrams > 0;
  const servings = isFood ? servingSizes[entry.foodId!] : undefined;
  const [meal, setMeal] = useState<MealType>(entry.meal);
  const [gramsText, setGramsText] = useState(String(entry.portionGrams));
  const [name, setName] = useState(entry.name);
  const [quick, setQuick] = useState({
    calories: String(entry.calories),
    protein: String(entry.protein),
    carbs: String(entry.carbs),
    fat: String(entry.fat),
  });

  const grams = Number(gramsText);
  const gramsValid = gramsText.trim() !== "" && Number.isFinite(grams) && grams >= 1;
  const quickNums = {
    calories: Number(quick.calories),
    protein: Number(quick.protein || 0),
    carbs: Number(quick.carbs || 0),
    fat: Number(quick.fat || 0),
  };
  const quickValid =
    quick.calories.trim() !== "" && Object.values(quickNums).every((n) => Number.isFinite(n) && n >= 0);
  const valid = isFood ? gramsValid : quickValid;

  const preview = isFood && gramsValid ? rescaleEntry(entry, grams) : entry;

  const handleSave = () => {
    if (!valid) return;
    if (isFood) {
      onSave({ ...preview, meal });
    } else {
      onSave({
        ...entry,
        meal,
        name: name.trim() || "Quick add",
        calories: Math.round(quickNums.calories),
        protein: quickNums.protein,
        carbs: quickNums.carbs,
        fat: quickNums.fat,
      });
    }
  };

  return (
    <Modal
      titleId="edit-entry-title"
      onClose={onClose}
      sheet
      className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
      style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
    >
      <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
        <h2 id="edit-entry-title" className="text-base font-bold truncate" style={{ color: "var(--ink)" }}>
          Edit {entry.name}
        </h2>
      </div>
      <div className="p-4 flex flex-col gap-3 overflow-y-auto">
        {isFood ? (
          <>
            {servings && servings.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {servings.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => setGramsText(String(s.grams))}
                    className="px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                    style={{
                      background: grams === s.grams ? "var(--accent)" : "var(--panel)",
                      color: grams === s.grams ? "#fff" : "var(--ink)",
                      border: `1px solid ${grams === s.grams ? "var(--accent)" : "var(--line)"}`,
                    }}
                  >
                    {s.label} ({Math.round(s.grams)}g)
                  </button>
                ))}
              </div>
            )}
            <label className="text-xs font-medium block" style={{ color: "var(--muted)" }}>
              Amount (grams)
              <input
                type="number"
                min={1}
                value={gramsText}
                onChange={(e) => setGramsText(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
            </label>
            <div className="rounded-xl p-3 grid grid-cols-4 gap-2 text-center" style={{ background: "var(--panel)" }}>
              {[
                ["cal", gramsValid ? String(Math.round(preview.calories)) : "–", "var(--accent)"],
                ["protein", gramsValid ? `${Math.round(preview.protein)}g` : "–", "#3b82f6"],
                ["carbs", gramsValid ? `${Math.round(preview.carbs)}g` : "–", "#f59e0b"],
                ["fat", gramsValid ? `${Math.round(preview.fat)}g` : "–", "#ef4444"],
              ].map(([label, val, color]) => (
                <div key={label}>
                  <div className="text-sm font-bold" style={{ color }}>{val}</div>
                  <div className="text-[0.625rem]" style={{ color: "var(--muted)" }}>{label}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <label className="text-xs font-medium block" style={{ color: "var(--muted)" }}>
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["calories", "Calories"],
                  ["protein", "Protein (g)"],
                  ["carbs", "Carbs (g)"],
                  ["fat", "Fat (g)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-xs font-medium block" style={{ color: "var(--muted)" }}>
                  {label}
                  <input
                    type="number"
                    min={0}
                    value={quick[key]}
                    onChange={(e) => setQuick({ ...quick, [key]: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none"
                    style={inputStyle}
                  />
                </label>
              ))}
            </div>
          </>
        )}

        <div className="grid grid-cols-4 gap-1" role="group" aria-label="Meal">
          {MEALS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMeal(m.id)}
              aria-pressed={meal === m.id}
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

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm cursor-pointer"
            style={{ background: "var(--panel)", color: "var(--muted)", border: "1px solid var(--line)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!valid}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "var(--accent)", color: "#fff", border: "none" }}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
