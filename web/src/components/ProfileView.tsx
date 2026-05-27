import { useState } from "react";
import type { UserProfile, ActivityLevel, WeightGoal, Sex } from "../data/types";
import { calculateBMI, bmiCategory, calculateTDEE, suggestCalories } from "../lib/nutrition";

interface ProfileViewProps {
  profile: UserProfile | null;
  onSave: (profile: UserProfile) => void;
}

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary (office job, little exercise)",
  light: "Lightly active (1-3 days/week)",
  moderate: "Moderately active (3-5 days/week)",
  active: "Active (6-7 days/week)",
  "very-active": "Very active (athlete, physical job)",
};

const GOAL_LABELS: Record<WeightGoal, string> = {
  lose: "Lose weight (-500 cal/day)",
  maintain: "Maintain weight",
  gain: "Gain weight (+300 cal/day)",
};

export default function ProfileView({ profile, onSave }: ProfileViewProps) {
  const [age, setAge] = useState(profile?.age ?? 30);
  const [weight, setWeight] = useState(profile?.weight ?? 70);
  const [height, setHeight] = useState(profile?.height ?? 170);
  const [sex, setSex] = useState<Sex>(profile?.sex ?? "male");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(
    profile?.activityLevel ?? "moderate",
  );
  const [weightGoal, setWeightGoal] = useState<WeightGoal>(
    profile?.weightGoal ?? "maintain",
  );
  const [useImperial, setUseImperial] = useState(false);

  const currentProfile: UserProfile = {
    age,
    weight,
    height,
    sex,
    activityLevel,
    weightGoal,
  };

  const bmi = calculateBMI(currentProfile);
  const tdee = calculateTDEE(currentProfile);
  const suggested = suggestCalories(currentProfile);

  const handleSave = () => {
    onSave(currentProfile);
  };

  // Imperial conversions
  const weightDisplay = useImperial ? Math.round(weight * 2.205) : weight;
  const heightFt = Math.floor(height / 30.48);
  const heightIn = Math.round((height - heightFt * 30.48) / 2.54);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold" style={{ color: "var(--ink)" }}>
          Profile
        </h2>
        <button
          onClick={() => setUseImperial(!useImperial)}
          className="text-xs px-2 py-1 rounded-lg cursor-pointer"
          style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--muted)" }}
        >
          {useImperial ? "Imperial" : "Metric"}
        </button>
      </div>

      {/* Basic info */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
      >
        {/* Sex */}
        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
            Sex
          </label>
          <div className="flex gap-2">
            {(["male", "female"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSex(s)}
                className="flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer capitalize"
                style={{
                  background: sex === s ? "var(--accent)" : "var(--paper)",
                  color: sex === s ? "#fff" : "var(--ink)",
                  border: `1px solid ${sex === s ? "var(--accent)" : "var(--line)"}`,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Age */}
        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
            Age
          </label>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(Math.max(1, Number(e.target.value)))}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" }}
            min={1}
            max={120}
          />
        </div>

        {/* Weight */}
        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
            Weight ({useImperial ? "lbs" : "kg"})
          </label>
          <input
            type="number"
            value={weightDisplay}
            onChange={(e) => {
              const v = Math.max(1, Number(e.target.value));
              setWeight(useImperial ? Math.round(v / 2.205) : v);
            }}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" }}
            min={1}
          />
        </div>

        {/* Height */}
        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
            Height {useImperial ? "(ft/in)" : "(cm)"}
          </label>
          {useImperial ? (
            <div className="flex gap-2">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={heightFt}
                  onChange={(e) => {
                    const ft = Math.max(0, Number(e.target.value));
                    setHeight(Math.round(ft * 30.48 + heightIn * 2.54));
                  }}
                  className="w-16 px-2 py-2 rounded-lg text-sm outline-none text-center"
                  style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" }}
                />
                <span className="text-xs" style={{ color: "var(--muted)" }}>ft</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={heightIn}
                  onChange={(e) => {
                    const inches = Math.max(0, Math.min(11, Number(e.target.value)));
                    setHeight(Math.round(heightFt * 30.48 + inches * 2.54));
                  }}
                  className="w-16 px-2 py-2 rounded-lg text-sm outline-none text-center"
                  style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" }}
                  min={0}
                  max={11}
                />
                <span className="text-xs" style={{ color: "var(--muted)" }}>in</span>
              </div>
            </div>
          ) : (
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(Math.max(1, Number(e.target.value)))}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" }}
              min={1}
            />
          )}
        </div>

        {/* Activity Level */}
        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
            Activity level
          </label>
          <div className="space-y-1.5">
            {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => setActivityLevel(level)}
                className="w-full text-left px-3 py-2 rounded-lg text-xs cursor-pointer"
                style={{
                  background: activityLevel === level ? "var(--accent)" : "var(--paper)",
                  color: activityLevel === level ? "#fff" : "var(--ink)",
                  border: `1px solid ${activityLevel === level ? "var(--accent)" : "var(--line)"}`,
                }}
              >
                {ACTIVITY_LABELS[level]}
              </button>
            ))}
          </div>
        </div>

        {/* Weight Goal */}
        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
            Goal
          </label>
          <div className="space-y-1.5">
            {(Object.keys(GOAL_LABELS) as WeightGoal[]).map((goal) => (
              <button
                key={goal}
                onClick={() => setWeightGoal(goal)}
                className="w-full text-left px-3 py-2 rounded-lg text-xs cursor-pointer"
                style={{
                  background: weightGoal === goal ? "var(--accent)" : "var(--paper)",
                  color: weightGoal === goal ? "#fff" : "var(--ink)",
                  border: `1px solid ${weightGoal === goal ? "var(--accent)" : "var(--line)"}`,
                }}
              >
                {GOAL_LABELS[goal]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calculated stats */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
          Calculated values
        </h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-xl font-bold" style={{ color: "var(--ink)" }}>
              {bmi}
            </div>
            <div className="text-[10px]" style={{ color: "var(--muted)" }}>
              BMI
            </div>
            <div
              className="text-[10px] font-medium"
              style={{
                color:
                  bmi < 18.5 || bmi >= 30
                    ? "var(--error)"
                    : bmi >= 25
                      ? "var(--warning)"
                      : "var(--success)",
              }}
            >
              {bmiCategory(bmi)}
            </div>
          </div>
          <div>
            <div className="text-xl font-bold" style={{ color: "var(--ink)" }}>
              {tdee}
            </div>
            <div className="text-[10px]" style={{ color: "var(--muted)" }}>
              TDEE (cal)
            </div>
          </div>
          <div>
            <div className="text-xl font-bold" style={{ color: "var(--accent)" }}>
              {suggested}
            </div>
            <div className="text-[10px]" style={{ color: "var(--muted)" }}>
              Suggested (cal)
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        className="w-full py-2.5 rounded-lg text-sm font-semibold cursor-pointer"
        style={{ background: "var(--accent)", color: "#fff", border: "none" }}
      >
        Save profile
      </button>
    </div>
  );
}
