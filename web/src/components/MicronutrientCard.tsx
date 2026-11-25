import { useMemo, useState } from "react";
import { MICRO_DEFS } from "../data/types";
import type { FoodEntry } from "../data/types";
import { formatMicro, sumMicros } from "../lib/nutrition";

const OPEN_KEY = "calories_ui_micros_open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Collapsible daily micronutrient totals with % Daily Value */
export default function MicronutrientCard({ entries }: { entries: FoodEntry[] }) {
  const [open, setOpen] = useState(readOpen);
  const totals = useMemo(() => sumMicros(entries), [entries]);
  // Entries with no data for any nutrient (quick add, deleted foods)
  const noData = Math.min(...MICRO_DEFS.map((m) => totals[m.key].unknownEntries));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      // storage unavailable: the card still works, it just won't remember
    }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <button
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold cursor-pointer"
        style={{ background: "transparent", border: "none", color: "var(--ink)" }}
      >
        <span>Micronutrients</span>
        <span className="text-xs" style={{ color: "var(--muted)" }}>{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2">
          {MICRO_DEFS.map((m) => {
            const t = totals[m.key];
            const known = t.coveredEntries > 0 || t.unknownEntries === 0;
            const partial = t.coveredEntries > 0 && t.unknownEntries > 0;
            const pct = Math.round((t.total / m.dv) * 100);
            const over = m.limit && pct > 100;
            return (
              <div key={m.key} data-testid={`micro-${m.key}`}>
                <div className="flex justify-between text-xs" style={{ color: "var(--ink)" }}>
                  <span>
                    {m.label} {m.limit && <span style={{ color: "var(--muted)" }}>(limit)</span>}
                  </span>
                  <span title={partial ? `${t.unknownEntries} entries have no data for this nutrient` : undefined}>
                    {known ? `${formatMicro(t.total)}${m.unit}${partial ? "*" : ""}` : "—"}
                    <span className="inline-block w-10 text-right" style={{ color: over ? "var(--error)" : "var(--muted)" }}>
                      {known ? `${pct}%` : ""}
                    </span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${known ? Math.min(pct, 100) : 0}%`,
                      background: over ? "var(--error)" : "var(--accent)",
                    }}
                  />
                </div>
              </div>
            );
          })}
          <p className="text-[10px]" style={{ color: "var(--muted)" }}>
            % of FDA Daily Value. * partial: some entries have no data for that nutrient.
            {noData > 0 && ` ${noData} ${noData === 1 ? "entry has" : "entries have"} no data.`}
          </p>
        </div>
      )}
    </div>
  );
}
