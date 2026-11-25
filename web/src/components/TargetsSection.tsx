import { useState } from "react";
import { MICRO_DEFS } from "../data/types";
import type { TargetKey, TargetOverrides, UserProfile } from "../data/types";
import { formatMicro } from "../lib/nutrition";
import { computeTargets, recommendedTargets } from "../lib/targets";

const MACRO_ROWS: { key: TargetKey; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "cal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "fiber", label: "Fiber", unit: "g" },
  { key: "sugar", label: "Sugar", unit: "g" },
];

const MICRO_ROWS: { key: TargetKey; label: string; unit: string }[] = MICRO_DEFS.map((m) => ({
  key: m.key,
  label: m.limit ? `${m.label} (limit)` : m.label,
  unit: m.unit,
}));

/** Whole numbers, except the tiny micro amounts (B12 is 2.4 µg) */
const show = (n: number) => String(formatMicro(n));

interface RowProps {
  label: string;
  unit: string;
  value: number;
  recommended: number;
  overridden: boolean;
  onChange: (value: number) => void;
  onReset: () => void;
}

function TargetRow({ label, unit, value, recommended, overridden, onChange, onReset }: RowProps) {
  // Raw text while the field has focus so it can be cleared and retyped
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: "var(--ink)" }}>
      <span className="flex-1 min-w-0">
        <span className="block truncate">{label}</span>
        {overridden && (
          <span className="block text-[10px]" style={{ color: "var(--muted)" }}>
            recommended {show(recommended)}
          </span>
        )}
      </span>
      <input
        type="number"
        inputMode="decimal"
        aria-label={`${label} target`}
        value={editing ?? show(value)}
        onFocus={() => setEditing(show(value))}
        onBlur={() => setEditing(null)}
        onChange={(e) => {
          setEditing(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && n > 0) onChange(n);
        }}
        className="w-20 px-2 py-1.5 rounded-lg text-sm outline-none text-center"
        style={{
          background: "var(--paper)",
          border: `1px solid ${overridden ? "var(--accent)" : "var(--line)"}`,
          color: "var(--ink)",
        }}
        min={0}
      />
      <span className="w-8" style={{ color: "var(--muted)" }}>{unit}</span>
      <button
        onClick={onReset}
        disabled={!overridden}
        aria-label={`Reset ${label} to recommended`}
        className="w-14 text-[11px] cursor-pointer text-right disabled:cursor-default"
        style={{
          background: "none",
          border: "none",
          color: overridden ? "var(--accent)" : "transparent",
        }}
      >
        Reset
      </button>
    </div>
  );
}

interface TargetsSectionProps {
  profile: UserProfile | null;
  overrides: TargetOverrides;
  onChange: (overrides: TargetOverrides) => void;
}

/** Daily targets: recommended from the saved profile, each overridable with the user's own value */
export default function TargetsSection({ profile, overrides, onChange }: TargetsSectionProps) {
  const [showMicros, setShowMicros] = useState(false);
  const targets = computeTargets(profile, overrides);
  // Macros recommended for the calories in effect, so a reset matches what the others follow
  const recommended = recommendedTargets(profile, targets.calories);
  const recommendedCalories = recommendedTargets(profile).calories;

  const rows = (list: typeof MACRO_ROWS) =>
    list.map((r) => (
      <TargetRow
        key={r.key}
        label={r.label}
        unit={r.unit}
        value={targets[r.key]}
        recommended={r.key === "calories" ? recommendedCalories : recommended[r.key]}
        overridden={overrides[r.key] !== undefined}
        onChange={(n) =>
          onChange({ ...overrides, [r.key]: MACRO_ROWS.includes(r) ? Math.round(n) : n })
        }
        onReset={() => {
          const { [r.key]: _removed, ...rest } = overrides;
          onChange(rest);
        }}
      />
    ));

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
    >
      <div>
        <h2 className="text-sm font-bold" style={{ color: "var(--ink)" }}>Daily targets</h2>
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          {profile
            ? "Recommended from your saved profile. Type your own value to override it."
            : "Save your profile to get recommended targets. Defaults are shown until then."}
        </p>
      </div>
      <div className="space-y-2">{rows(MACRO_ROWS)}</div>
      <button
        onClick={() => setShowMicros(!showMicros)}
        aria-expanded={showMicros}
        className="text-xs cursor-pointer"
        style={{ background: "none", border: "none", color: "var(--accent)" }}
      >
        {showMicros ? "Hide micronutrient targets" : "Show micronutrient targets"}
      </button>
      {showMicros && <div className="space-y-2">{rows(MICRO_ROWS)}</div>}
    </div>
  );
}
