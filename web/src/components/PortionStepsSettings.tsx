import { useState } from "react";
import { getSettings, saveSettings, type Settings } from "../lib/settings";

const FIELDS: { key: keyof Settings; label: string; hint: string }[] = [
  { key: "foodStepGrams", label: "Food − / + step", hint: "grams per tap on a food" },
  { key: "mealStepGrams", label: "Meal − / + step", hint: "grams per tap on a whole meal" },
];

/** Profile section: grams per tap for the Log's −/+ buttons */
export default function PortionStepsSettings() {
  const [text, setText] = useState(() => {
    const s = getSettings();
    return { foodStepGrams: String(s.foodStepGrams), mealStepGrams: String(s.mealStepGrams) };
  });

  const update = (key: keyof Settings, value: string) => {
    const next = { ...text, [key]: value };
    setText(next);
    const food = Math.round(Number(next.foodStepGrams));
    const meal = Math.round(Number(next.mealStepGrams));
    if (food >= 1 && meal >= 1) saveSettings({ foodStepGrams: food, mealStepGrams: meal });
  };

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <h2 className="text-sm font-bold" style={{ color: "var(--ink)" }}>
        Portion steps
      </h2>
      {FIELDS.map((f) => {
        const invalid = !(Math.round(Number(text[f.key])) >= 1);
        return (
          <label key={f.key} className="flex items-center justify-between gap-3">
            <span className="text-xs" style={{ color: "var(--ink)" }}>
              {f.label}
              <span className="block text-[0.625rem]" style={{ color: "var(--muted)" }}>
                {f.hint}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={text[f.key]}
                onChange={(e) => update(f.key, e.target.value)}
                aria-invalid={invalid}
                className="w-16 px-2 py-1.5 rounded-lg text-sm text-right outline-none"
                style={{
                  background: "var(--paper)",
                  border: `1px solid ${invalid ? "var(--error)" : "var(--line)"}`,
                  color: "var(--ink)",
                }}
              />
              <span className="text-xs" style={{ color: "var(--muted)" }}>g</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
