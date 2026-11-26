import { useState, useMemo } from "react";
import type { DailyGoals } from "../data/types";
import { lastNDays, today, formatDate } from "../lib/dates";
import { getAllLogs } from "../lib/storage";
import { sumEntries } from "../lib/nutrition";
import MacroPieChart from "./MacroPieChart";
import CalorieTrendChart from "./CalorieTrendChart";
import MacroBarChart from "./MacroBarChart";
import { FAT_COLOR } from "../lib/colors";

interface DashboardViewProps {
  date: string;
  goals: DailyGoals;
}

type RangeOption = 7 | 14 | 30;

export default function DashboardView({ date, goals }: DashboardViewProps) {
  const [range, setRange] = useState<RangeOption>(7);

  // The whole history is parsed once; each day is then looked up and summed from it
  const logs = useMemo(() => getAllLogs(), [date]);
  const totalsFor = (d: string) => {
    const log = logs[d];
    return sumEntries(log && Array.isArray(log.entries) ? log.entries : []);
  };

  const todayTotals = useMemo(() => totalsFor(date), [logs, date]);

  const dates = useMemo(() => lastNDays(range, date), [range, date]);
  const days = useMemo(() => dates.map((d) => ({ date: d, ...totalsFor(d) })), [logs, dates]);
  const trendData = useMemo(() => days.map((d) => ({ date: d.date, calories: d.calories })), [days]);
  const macroData = useMemo(
    () => days.map((d) => ({ date: d.date, protein: d.protein, carbs: d.carbs, fat: d.fat })),
    [days],
  );

  // Averages: every figure covers the same set of logged days
  const avg = useMemo(() => {
    const logged = days.filter((d) => d.calories > 0);
    const mean = (pick: (d: (typeof days)[number]) => number) =>
      logged.length === 0 ? 0 : Math.round(logged.reduce((sum, d) => sum + pick(d), 0) / logged.length);
    return {
      calories: mean((d) => d.calories),
      protein: mean((d) => d.protein),
      carbs: mean((d) => d.carbs),
      fat: mean((d) => d.fat),
    };
  }, [days]);
  const { calories: avgCalories, protein: avgProtein, carbs: avgCarbs, fat: avgFat } = avg;

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
          {date === today() ? "Today's" : formatDate(date)} macros
        </h3>
        <MacroPieChart
          protein={todayTotals.protein}
          carbs={todayTotals.carbs}
          fat={todayTotals.fat}
          calories={todayTotals.calories}
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
            <div className="text-[0.625rem]" style={{ color: "var(--muted)" }}>
              avg calories
            </div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold" style={{ color: "#3b82f6" }}>
              {avgProtein}g
            </div>
            <div className="text-[0.625rem]" style={{ color: "var(--muted)" }}>
              avg protein
            </div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold" style={{ color: "#f59e0b" }}>
              {avgCarbs}g
            </div>
            <div className="text-[0.625rem]" style={{ color: "var(--muted)" }}>
              avg carbs
            </div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold" style={{ color: FAT_COLOR }}>
              {avgFat}g
            </div>
            <div className="text-[0.625rem]" style={{ color: "var(--muted)" }}>
              avg fat
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
