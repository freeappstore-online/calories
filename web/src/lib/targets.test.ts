import { describe, expect, it } from "vitest";
import type { Targets, UserProfile } from "../data/types";
import { MIN_CALORIES, suggestCalories } from "./nutrition";
import { DEFAULT_TARGETS, computeTargets, recommendedTargets } from "./targets";

const kcalOf = (t: Targets) => t.protein * 4 + t.carbs * 4 + t.fat * 9;

const profile: UserProfile = {
  age: 30,
  weight: 70,
  height: 170,
  sex: "female",
  activityLevel: "sedentary",
  weightGoal: "maintain",
};

describe("computeTargets without a profile", () => {
  it("macros add up to the calories, also at the default", () => {
    expect(Math.abs(kcalOf(computeTargets(null, {})) - DEFAULT_TARGETS.calories)).toBeLessThan(10);
  });

  it("a calorie override scales protein, fat, carbs, fiber and sugar with it", () => {
    const t = computeTargets(null, { calories: 1200 });
    expect(t.calories).toBe(1200);
    expect(Math.abs(kcalOf(t) - 1200)).toBeLessThan(10);
    expect(t.protein).toBe(90);
    expect(t.fat).toBe(39);
    expect(t.fiber).toBe(17);
    expect(t.sugar).toBe(30);
  });

  it("a protein override recomputes carbs", () => {
    const t = computeTargets(null, { protein: 100 });
    expect(t.protein).toBe(100);
    expect(t.carbs).toBe(Math.round((2000 - 400 - 65 * 9) / 4));
  });

  it("a fat override recomputes carbs, but carbs chosen by the user stay", () => {
    expect(computeTargets(null, { fat: 100 }).carbs).toBe(Math.round((2000 - 150 * 4 - 900) / 4));
    expect(computeTargets(null, { fat: 100, carbs: 300 }).carbs).toBe(300);
  });

  it("carbs never go negative", () => {
    expect(computeTargets(null, { protein: 400 }).carbs).toBe(0);
  });
});

describe("with a profile", () => {
  it("a protein override recomputes carbs from the calories in effect", () => {
    const t = computeTargets(profile, { protein: 200 });
    expect(t.carbs).toBe(Math.max(0, Math.round((t.calories - 800 - t.fat * 9) / 4)));
    expect(t.carbs).toBeLessThan(recommendedTargets(profile).carbs);
  });
});

describe("suggestCalories", () => {
  it("never goes below the floor, even for extreme inputs", () => {
    const tiny: UserProfile = { ...profile, age: 90, weight: 30, height: 120, weightGoal: "lose" };
    expect(suggestCalories(tiny)).toBe(MIN_CALORIES);
    expect(suggestCalories({ ...tiny, weight: 1, height: 1 })).toBe(MIN_CALORIES);
  });

  it("leaves ordinary results alone", () => {
    const kcal = suggestCalories({ ...profile, weightGoal: "gain" });
    expect(kcal).toBeGreaterThan(MIN_CALORIES);
  });
});
