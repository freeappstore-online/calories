import { useState } from "react";
import type { CustomFood } from "../data/types";
import { CUSTOM_IMAGE, newCustomId, saveCustomFood } from "../lib/customFoods";
import { MICRO_DEFS } from "../data/types";
import Modal from "./Modal";

interface CustomFoodFormProps {
  onSaved: (food: CustomFood) => void;
  onClose: () => void;
}

const MACROS = [
  { key: "protein", label: "Protein (g)" },
  { key: "carbs", label: "Carbs (g)" },
  { key: "fat", label: "Fat (g)" },
  { key: "fiber", label: "Fiber (g)" },
  { key: "sugar", label: "Sugar (g)" },
] as const;

const inputStyle = { background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" };

/** Parses a blank-able number field: null if blank, NaN-free error string otherwise */
function parseField(text: string): { value: number | null; error?: true } {
  const t = text.trim();
  if (t === "") return { value: null };
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? { value: n } : { value: null, error: true };
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Create a custom food from label values entered per serving; stored per 100 g */
export default function CustomFoodForm({ onSaved, onClose }: CustomFoodFormProps) {
  const [values, setValues] = useState<Record<string, string>>({ name: "", servingLabel: "1 serving", servingGrams: "100", calories: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  const handleSave = () => {
    const get = (key: string) => values[key] ?? "";
    const name = get("name").trim();
    if (name.length < 1 || name.length > 60) return setError("Name is required (up to 60 characters).");
    const grams = parseField(get("servingGrams"));
    if (grams.error || !grams.value || grams.value <= 0) return setError("Serving size must be a number above 0 grams.");
    const calories = parseField(get("calories"));
    if (calories.error || calories.value === null) return setError("Calories are required and must be a number, 0 or more.");

    const perServing: Record<string, number | null> = { calories: calories.value };
    for (const key of [...MACROS.map((m) => m.key), ...MICRO_DEFS.map((m) => m.key)]) {
      const parsed = parseField(get(key));
      if (parsed.error) return setError("Nutrient values must be numbers, 0 or more.");
      perServing[key] = parsed.value;
    }

    const per100 = (key: string, dp: number) => {
      const v = perServing[key];
      return v === null || v === undefined ? null : round((v * 100) / grams.value!, dp);
    };
    const food: CustomFood = {
      id: newCustomId(),
      name,
      category: "custom",
      image: CUSTOM_IMAGE,
      servingLabel: get("servingLabel").trim() || "1 serving",
      servingGrams: grams.value,
      calories: per100("calories", 1)!,
      protein: per100("protein", 1) ?? 0,
      carbs: per100("carbs", 1) ?? 0,
      fat: per100("fat", 1) ?? 0,
      fiber: per100("fiber", 1) ?? 0,
      sugar: per100("sugar", 1) ?? 0,
      satFat: per100("satFat", 3),
      cholesterol: per100("cholesterol", 3),
      sodium: per100("sodium", 3),
      potassium: per100("potassium", 3),
      calcium: per100("calcium", 3),
      iron: per100("iron", 3),
      magnesium: per100("magnesium", 3),
      vitaminA: per100("vitaminA", 3),
      vitaminC: per100("vitaminC", 3),
      vitaminD: per100("vitaminD", 3),
      vitaminB12: per100("vitaminB12", 3),
    };
    if (!saveCustomFood(food)) return setError("Could not save: browser storage is full or unavailable.");
    onSaved(food);
  };

  const field = (key: string, label: string, placeholder?: string) => (
    <label key={key} className="block">
      <span className="text-[0.6875rem] font-medium block mb-0.5" style={{ color: "var(--muted)" }}>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={values[key] ?? ""}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={inputStyle}
      />
    </label>
  );

  return (
    <Modal
      titleId="custom-food-title"
      onClose={onClose}
      sheet
      className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
      style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
    >
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2 id="custom-food-title" className="text-base font-bold" style={{ color: "var(--ink)" }}>Create food</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer"
            style={{ background: "var(--panel)", border: "none", color: "var(--ink)" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          <label className="block">
            <span className="text-[0.6875rem] font-medium block mb-0.5" style={{ color: "var(--muted)" }}>Name</span>
            <input
              type="text"
              value={values["name"]}
              maxLength={60}
              autoFocus
              onChange={(e) => set("name", e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[0.6875rem] font-medium block mb-0.5" style={{ color: "var(--muted)" }}>Serving name</span>
              <input
                type="text"
                value={values["servingLabel"]}
                onChange={(e) => set("servingLabel", e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
            </label>
            {field("servingGrams", "Serving size (g)")}
          </div>
          <p className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>Enter the label values for one serving.</p>
          <div className="grid grid-cols-2 gap-2">
            {field("calories", "Calories (required)")}
            {MACROS.map((m) => field(m.key, m.label))}
          </div>
          <details>
            <summary className="text-xs cursor-pointer" style={{ color: "var(--muted)" }}>More nutrients (optional)</summary>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {MICRO_DEFS.map((m) => field(m.key, `${m.label} (${m.unit})`))}
            </div>
          </details>

          {error && (
            <p role="alert" className="text-xs font-medium" style={{ color: "#ef4444" }}>
              {error}
            </p>
          )}
          <button
            onClick={handleSave}
            className="w-full py-2.5 rounded-lg text-sm font-semibold cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff", border: "none" }}
          >
            Save food
          </button>
        </div>
    </Modal>
  );
}
