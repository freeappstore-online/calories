import { useMemo } from "react";
import { MICRO_DEFS } from "../data/types";
import type { FoodEntry } from "../data/types";
import { formatMicro, sumEntries, sumMicros } from "../lib/nutrition";
import { useTargets } from "../lib/targets";
import Modal from "./Modal";
import { FAT_COLOR } from "../lib/colors";

const MACROS = [
  { key: "calories", label: "Calories", unit: " kcal", color: "#8b5cf6" },
  { key: "protein", label: "Protein", unit: "g", color: "#3b82f6" },
  { key: "carbs", label: "Carbs", unit: "g", color: "#f59e0b" },
  { key: "fat", label: "Fat", unit: "g", color: FAT_COLOR },
  { key: "fiber", label: "Fiber", unit: "g", color: "var(--accent)" },
  { key: "sugar", label: "Sugar", unit: "g", color: "#ec4899", limit: true },
] as const;

function Row({
  label,
  amount,
  pct,
  color,
  limit,
  title,
}: {
  label: string;
  amount: string;
  pct: number | null;
  color: string;
  limit?: boolean;
  title?: string;
}) {
  const over = !!limit && pct !== null && pct > 100;
  return (
    <div>
      <div className="flex justify-between text-xs" style={{ color: "var(--ink)" }}>
        <span>
          {label} {limit && <span style={{ color: "var(--muted)" }}>(limit)</span>}
        </span>
        <span title={title}>
          {amount}
          <span className="inline-block w-11 text-right" style={{ color: over ? "var(--error)" : "var(--muted)" }}>
            {pct === null ? "" : `${pct}%`}
          </span>
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
        {/* width is the live % of target */}
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(pct ?? 0, 100)}%`, background: over ? "var(--error)" : color }}
        />
      </div>
    </div>
  );
}

/** Pop-up with the complete nutrition breakdown (macros and micronutrients) for a day or a meal */
export default function NutritionBreakdown({
  title,
  entries,
  onClose,
}: {
  title: string;
  entries: FoodEntry[];
  onClose: () => void;
}) {
  const targets = useTargets();
  const macros = useMemo(() => sumEntries(entries), [entries]);
  const micros = useMemo(() => sumMicros(entries), [entries]);
  // Entries with no data for any nutrient (quick add, deleted foods)
  const noData = Math.min(...MICRO_DEFS.map((m) => micros[m.key].unknownEntries));
  const pctOf = (value: number, target: number) => (target > 0 ? Math.round((value / target) * 100) : null);

  return (
    <Modal
      titleId="breakdown-title"
      onClose={onClose}
      sheet
      className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
      style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
    >
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
        <h2 id="breakdown-title" className="text-base font-bold" style={{ color: "var(--ink)" }}>
          {title}
        </h2>
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
      <div className="p-4 space-y-2 overflow-y-auto">
        {MACROS.map((m) => (
          <Row
            key={m.key}
            label={m.label}
            amount={`${Math.round(macros[m.key])}${m.unit}`}
            pct={pctOf(macros[m.key], targets[m.key])}
            color={m.color}
            limit={"limit" in m}
          />
        ))}
        <h3 className="text-xs font-semibold pt-2" style={{ color: "var(--muted)" }}>
          Micronutrients
        </h3>
        {MICRO_DEFS.map((m) => {
          const t = micros[m.key];
          const known = t.coveredEntries > 0 || t.unknownEntries === 0;
          const partial = t.coveredEntries > 0 && t.unknownEntries > 0;
          return (
            <Row
              key={m.key}
              label={m.label}
              amount={known ? `${formatMicro(t.total)}${m.unit}${partial ? "*" : ""}` : "—"}
              pct={known ? pctOf(t.total, targets[m.key]) : null}
              color="var(--accent)"
              limit={m.limit}
              title={partial ? `${t.unknownEntries} entries have no data for this nutrient` : undefined}
            />
          );
        })}
        <p className="text-[0.625rem] pt-1" style={{ color: "var(--muted)" }}>
          % of your daily target (set in Profile). * partial: some entries have no data for that nutrient.
          {noData > 0 && ` ${noData} ${noData === 1 ? "entry has" : "entries have"} no data.`}
        </p>
      </div>
    </Modal>
  );
}
