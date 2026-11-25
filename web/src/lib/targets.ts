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
  if (!profile) return calories ? { ...DEFAULT_TARGETS, calories } : DEFAULT_TARGETS;
  const kcal = calories ?? suggestCalories(profile);
  const protein = Math.round(profile.weight * (profile.weightGoal === "maintain" ? 1.2 : 1.6));
  const fat = Math.round((kcal * 0.3) / 9);
  return {
    ...microTargets(profile),
    calories: kcal,
    protein,
    fat,
    carbs: Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4)),
    fiber: Math.round((kcal / 1000) * 14),
    sugar: Math.round((kcal * 0.1) / 4),
  };
}

/** Recommended targets with the user's own values on top; the rest follow the profile */
export function computeTargets(profile: UserProfile | null, overrides: TargetOverrides): Targets {
  const kcal = overrides.calories ?? (profile ? suggestCalories(profile) : DEFAULT_TARGETS.calories);
  return { ...recommendedTargets(profile, kcal), ...overrides };
}

/** The targets in effect, for the cards that show % of target */
export const TargetsContext = createContext<Targets>(DEFAULT_TARGETS);
export const useTargets = (): Targets => useContext(TargetsContext);
