import { useState, useCallback, useEffect, useRef } from "react";
import type { DailyLog, DailyGoals, SavedMeal, UserProfile, FoodEntry, MealType } from "./data/types";
import { today, shiftDate } from "./lib/dates";
import {
  getLog,
  saveLog,
  getGoals,
  saveGoals,
  getSavedMeals,
  saveSavedMeals,
  getProfile,
  saveProfile,
} from "./lib/storage";
import { suggestCalories } from "./lib/nutrition";
import DailyLogView from "./components/DailyLogView";
import GoalsView from "./components/GoalsView";
import DashboardView from "./components/DashboardView";
import ProfileView from "./components/ProfileView";
import FoodsView from "./components/FoodsView";

type Page = "log" | "foods" | "dashboard" | "goals" | "profile";

const NAV_ITEMS: { id: Page; label: string; icon: React.ReactNode }[] = [
  {
    id: "log",
    label: "Log",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    id: "foods",
    label: "Foods",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    id: "dashboard",
    label: "Dashboard",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: "goals",
    label: "Goals",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: "profile",
    label: "Profile",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

export default function App() {
  const [page, setPage] = useState<Page>("log");
  const [date, setDate] = useState(today());
  const [log, setLog] = useState<DailyLog>(() => getLog(today()));
  const [goals, setGoals] = useState<DailyGoals>(getGoals);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>(getSavedMeals);
  const [profile, setProfile] = useState<UserProfile | null>(getProfile);

  // Roll the selected day over after midnight if it was following "today"
  const lastToday = useRef(today());
  useEffect(() => {
    const rollover = () => {
      const now = today();
      if (now === lastToday.current) return;
      const prev = lastToday.current;
      lastToday.current = now;
      setDate((d) => (d === prev ? now : d));
    };
    document.addEventListener("visibilitychange", rollover);
    window.addEventListener("focus", rollover);
    return () => {
      document.removeEventListener("visibilitychange", rollover);
      window.removeEventListener("focus", rollover);
    };
  }, []);

  // Reload log when date changes
  useEffect(() => {
    setLog(getLog(date));
  }, [date]);

  const handleLogChange = useCallback(
    (newLog: DailyLog) => {
      setLog(newLog);
      saveLog(newLog);
    },
    [],
  );

  const handleAddEntry = useCallback(
    (entry: FoodEntry) => {
      handleLogChange({ ...log, entries: [...log.entries, entry] });
    },
    [log, handleLogChange],
  );

  const handleGoalsSave = useCallback((newGoals: DailyGoals) => {
    const safe = { ...newGoals, calories: Math.max(1, newGoals.calories || 0) };
    setGoals(safe);
    saveGoals(safe);
  }, []);

  const handleProfileSave = useCallback((newProfile: UserProfile) => {
    setProfile(newProfile);
    saveProfile(newProfile);
  }, []);

  const handleSaveMeal = useCallback(
    (name: string, entries: FoodEntry[]) => {
      const meal: SavedMeal = {
        id: crypto.randomUUID(),
        name,
        entries: entries.map(({ id: _id, ...rest }) => rest),
      };
      const updated = [...savedMeals, meal];
      setSavedMeals(updated);
      saveSavedMeals(updated);
    },
    [savedMeals],
  );

  const handleLoadSavedMeal = useCallback(
    (meal: SavedMeal, mealType: MealType) => {
      const newEntries: FoodEntry[] = meal.entries.map((e) => ({
        ...e,
        id: crypto.randomUUID(),
        meal: mealType,
      }));
      const newLog: DailyLog = {
        ...log,
        entries: [...log.entries, ...newEntries],
      };
      setLog(newLog);
      saveLog(newLog);
    },
    [log],
  );

  const handleCopyYesterday = useCallback((): number => {
    const yesterdayDate = shiftDate(date, -1);
    const yesterdayLog = getLog(yesterdayDate);
    if (yesterdayLog.entries.length === 0) return 0;
    const copiedEntries: FoodEntry[] = yesterdayLog.entries.map((e) => ({
      ...e,
      id: crypto.randomUUID(),
    }));
    const newLog: DailyLog = {
      date,
      entries: [...log.entries, ...copiedEntries],
    };
    setLog(newLog);
    saveLog(newLog);
    return copiedEntries.length;
  }, [date, log]);

  const suggestedCal = profile ? suggestCalories(profile) : null;

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--paper)" }}>
      <h1 className="sr-only">Calorie Counter</h1>

      {/* Main scrollable area */}
      <main
        className="flex-1 overflow-y-auto px-4 pb-20"
        // keep content clear of the iOS status bar (viewport-fit=cover)
        style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
      >
        <div className="max-w-lg mx-auto">
          {page === "log" && (
            <DailyLogView
              date={date}
              log={log}
              goals={goals}
              savedMeals={savedMeals}
              onDateChange={setDate}
              onLogChange={handleLogChange}
              onSaveMeal={handleSaveMeal}
              onLoadSavedMeal={handleLoadSavedMeal}
              onCopyYesterday={handleCopyYesterday}
            />
          )}
          {page === "foods" && <FoodsView date={date} onAdd={handleAddEntry} />}
          {page === "dashboard" && (
            <DashboardView date={date} goals={goals} />
          )}
          {page === "goals" && (
            <GoalsView
              goals={goals}
              suggestedCalories={suggestedCal}
              onSave={handleGoalsSave}
            />
          )}
          {page === "profile" && (
            <ProfileView profile={profile} onSave={handleProfileSave} />
          )}
        </div>
      </main>

      {/* Bottom navigation */}
      <nav
        className="shrink-0 fixed bottom-0 left-0 right-0 flex items-center justify-around py-2 px-2"
        style={{
          paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))",
          background: "var(--dock)",
          borderTop: "1px solid var(--line)",
        }}
      >
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg cursor-pointer"
            style={{
              background: "transparent",
              border: "none",
              color: page === item.id ? "var(--accent)" : "var(--muted)",
            }}
          >
            {item.icon}
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
