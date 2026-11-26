import { createContext, useContext } from "react";
import { MICRO_DEFS } from "../data/types";
import type { MicroKey, TargetOverrides, Targets, UserProfile } from "../data/types";
import { suggestCalories } from "./nutrition";

/** Targets without a profile: the previous fixed goals and the FDA Daily Values */
export const DEFAULT_TARGETS: Targets = {
  calories: 2000,
  protein: 150,
  carbs: 250,
  fat: 65,
  fiber: 28,
  sugar: 50,
  ...(Object.fromEntries(MICRO_DEFS.map((m) => [m.key, m.dv])) as Record<MicroKey, number>),
};

/** Adult NIH/NASEM values where they differ by sex or age; the rest keep the FDA Daily Value */
function microTargets(p: UserProfile): Record<MicroKey, number> {
  const male = p.sex === "male";
  const older = p.age >= 51;
  const out = { ...DEFAULT_TARGETS } as Record<MicroKey, number>;
  out.potassium = male ? 3400 : 2600;
  out.calcium = (male ? p.age >= 71 : older) ? 1200 : 1000;
  out.iron = male || older ? 8 : 18;
  out.magnesium = male ? (p.age >= 31 ? 420 : 400) : p.age >= 31 ? 320 : 310;
  out.vitaminA = male ? 900 : 700;
  out.vitaminC = male ? 90 : 75;
  out.vitaminD = p.age >= 71 ? 20 : 15;
  return out;
}

/** Recommended targets for a profile, scaled to the given calories (default: the suggested intake) */
export function recommendedTargets(profile: UserProfile | null, calories?: number): Targets {
  const kcal = calories ?? (profile ? suggestCalories(profile) : DEFAULT_TARGETS.calories);
  // Without a profile, the default protein and fat scale with the calories
  const scale = kcal / DEFAULT_TARGETS.calories;
  const protein = profile
    ? Math.round(profile.weight * (profile.weightGoal === "maintain" ? 1.2 : 1.6))
    : Math.round(DEFAULT_TARGETS.protein * scale);
  const fat = profile ? Math.round((kcal * 0.3) / 9) : Math.round(DEFAULT_TARGETS.fat * scale);
  return {
    ...(profile ? microTargets(profile) : DEFAULT_TARGETS),
    calories: kcal,
    protein,
    fat,
    carbs: carbsFor(kcal, protein, fat),
    fiber: Math.round((kcal / 1000) * 14),
    sugar: Math.round((kcal * 0.1) / 4),
  };
}

/** What is left for carbs once protein and fat are accounted for */
const carbsFor = (kcal: number, protein: number, fat: number) =>
  Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

/** Recommended targets with the user's own values on top; the rest follow the profile */
export function computeTargets(profile: UserProfile | null, overrides: TargetOverrides): Targets {
  const merged = { ...recommendedTargets(profile, overrides.calories), ...overrides };
  // A protein or fat choice changes what is left for carbs, unless carbs were chosen too
  if (overrides.carbs === undefined && (overrides.protein !== undefined || overrides.fat !== undefined)) {
    merged.carbs = carbsFor(merged.calories, merged.protein, merged.fat);
  }
  return merged;
}

/** The targets in effect, for the cards that show % of target */
export const TargetsContext = createContext<Targets>(DEFAULT_TARGETS);
export const useTargets = (): Targets => useContext(TargetsContext);
