import { useState, useMemo } from "react";
import type { DailyGoals } from "../data/types";
import { lastNDays } from "../lib/dates";
import { getLog } from "../lib/storage";
import { sumEntries } from "../lib/nutrition";
import MacroPieChart from "./MacroPieChart";
import CalorieTrendChart from "./CalorieTrendChart";
import MacroBarChart from "./MacroBarChart";

interface DashboardViewProps {
  date: string;
  goals: DailyGoals;
}

type RangeOption = 7 | 14 | 30;

export default function DashboardView({ date, goals }: DashboardViewProps) {
  const [range, setRange] = useState<RangeOption>(7);

  // Today's totals
  const todayLog = useMemo(() => getLog(date), [date]);
  const todayTotals = useMemo(() => sumEntries(todayLog.entries), [todayLog]);

  // Historical data
  const dates = useMemo(() => lastNDays(range, date), [range, date]);

  const trendData = useMemo(
    () =>
      dates.map((d) => {
        const log = getLog(d);
        const totals = sumEntries(log.entries);
        return { date: d, calories: totals.calories };
      }),
    [dates],
  );

  const macroData = useMemo(
    () =>
      dates.map((d) => {
        const log = getLog(d);
        const totals = sumEntries(log.entries);
        return { date: d, protein: totals.protein, carbs: totals.carbs, fat: totals.fat };
      }),
    [dates],
  );

  // Averages
  const avgCalories = useMemo(() => {
    const daysWithData = trendData.filter((d) => d.calories > 0);
    if (daysWithData.length === 0) return 0;
    return Math.round(
      daysWithData.reduce((sum, d) => sum + d.calories, 0) / daysWithData.length,
    );
  }, [trendData]);

  const avgProtein = useMemo(() => {
    const daysWithData = macroData.filter((d) => d.protein > 0);
    if (daysWithData.length === 0) return 0;
    return Math.round(
      daysWithData.reduce((sum, d) => sum + d.protein, 0) / daysWithData.length,
    );
  }, [macroData]);

  const avgCarbs = useMemo(() => {
    const daysWithData = macroData.filter((d) => d.carbs > 0);
    if (daysWithData.length === 0) return 0;
    return Math.round(
      daysWithData.reduce((sum, d) => sum + d.carbs, 0) / daysWithData.length,
    );
  }, [macroData]);

  const avgFat = useMemo(() => {
    const daysWithData = macroData.filter((d) => d.fat > 0);
    if (daysWithData.length === 0) return 0;
    return Math.round(
      daysWithData.reduce((sum, d) => sum + d.fat, 0) / daysWithData.length,
    );
  }, [macroData]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold" style={{ color: "var(--ink)" }}>
        Nutrition Dashboard
      </h2>

      {/* Today's macro donut */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
          Today's macros
        </h3>
        <MacroPieChart
          protein={todayTotals.protein}
          carbs={todayTotals.carbs}
          fat={todayTotals.fat}
        />
      </div>

      {/* Range selector */}
      <div className="flex gap-2">
        {([7, 14, 30] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className="flex-1 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
            style={{
              background: range === r ? "var(--accent)" : "var(--panel)",
              color: range === r ? "#fff" : "var(--muted)",
              border: `1px solid ${range === r ? "var(--accent)" : "var(--line)"}`,
            }}
          >
            {r} days
          </button>
        ))}
      </div>

      {/* Calorie trend */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
          Calorie trend
        </h3>
        <CalorieTrendChart data={trendData} goal={goals.calories} />
      </div>

      {/* Macro breakdown by day */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
          Macro breakdown by day
        </h3>
        <MacroBarChart data={macroData} />
      </div>

      {/* Average stats */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
          Daily averages (last {range} days)
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center">
            <div className="text-xl font-bold" style={{ color: "var(--accent)" }}>
              {avgCalories}
            </div>
            <div className="text-[10px]" style={{ color: "var(--muted)" }}>
              avg calories
            </div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold" style={{ color: "#3b82f6" }}>
              {avgProtein}g
            </div>
            <div className="text-[10px]" style={{ color: "var(--muted)" }}>
              avg protein
            </div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold" style={{ color: "#f59e0b" }}>
              {avgCarbs}g
            </div>
            <div className="text-[10px]" style={{ color: "var(--muted)" }}>
              avg carbs
            </div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold" style={{ color: "#ef4444" }}>
              {avgFat}g
            </div>
            <div className="text-[10px]" style={{ color: "var(--muted)" }}>
              avg fat
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
