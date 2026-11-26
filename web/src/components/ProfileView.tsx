import { useState } from "react";
import type { UserProfile, ActivityLevel, WeightGoal, Sex, TargetOverrides } from "../data/types";
import BackupSection from "./BackupSection";
import LabelScannerSettings from "./LabelScannerSettings";
import PortionStepsSettings from "./PortionStepsSettings";
import AppearanceSettings from "./AppearanceSettings";
import TargetsSection from "./TargetsSection";
import { calculateBMI, bmiCategory, calculateTDEE, suggestCalories } from "../lib/nutrition";

interface ProfileViewProps {
  profile: UserProfile | null;
  onSave: (profile: UserProfile) => void;
  overrides: TargetOverrides;
  onOverridesChange: (overrides: TargetOverrides) => void;
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

const LB_PER_KG = 2.20462;

export default function ProfileView({ profile, onSave, overrides, onOverridesChange }: ProfileViewProps) {
  // Raw text state so fields can be cleared and retyped; parsed only when computing/saving.
  const initialInches = Math.round((profile?.height ?? 170) / 2.54);
  const [ageText, setAgeText] = useState(String(profile?.age ?? 30));
  const [weightText, setWeightText] = useState(String(profile?.weight ?? 70));
  const [heightText, setHeightText] = useState(String(profile?.height ?? 170));
  const [ftText, setFtText] = useState(String(Math.floor(initialInches / 12)));
  const [inText, setInText] = useState(String(initialInches % 12));
  const [sex, setSex] = useState<Sex>(profile?.sex ?? "male");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(
    profile?.activityLevel ?? "moderate",
  );
  const [weightGoal, setWeightGoal] = useState<WeightGoal>(
    profile?.weightGoal ?? "maintain",
  );
  const [useImperial, setUseImperial] = useState(false);

  const age = Number(ageText);
  const weight = useImperial ? Number(weightText) / LB_PER_KG : Number(weightText);
  const height = useImperial ? Number(ftText) * 30.48 + Number(inText) * 2.54 : Number(heightText);
  const valid =
    ageText.trim() !== "" &&
    weightText.trim() !== "" &&
    (useImperial ? ftText.trim() !== "" && inText.trim() !== "" : heightText.trim() !== "") &&
    age >= 10 &&
    age <= 120 &&
    weight >= 20 &&
    weight <= 400 &&
    height >= 90 &&
    height <= 250 &&
    (!useImperial || Number(inText) <= 11);

  const currentProfile: UserProfile = {
    age,
    weight,
    height,
    sex,
    activityLevel,
    weightGoal,
  };

  const bmi = valid ? calculateBMI(currentProfile) : 0;
  const tdee = valid ? calculateTDEE(currentProfile) : 0;
  const suggested = valid ? suggestCalories(currentProfile) : 0;

  const handleSave = () => {
    if (valid) onSave(currentProfile);
  };

  /** Switch units, converting the current values so nothing is lost */
  const toggleUnits = () => {
    if (valid) {
      if (!useImperial) {
        const totalIn = Math.round(height / 2.54);
        setWeightText(String(Math.round(weight * LB_PER_KG * 10) / 10));
        setFtText(String(Math.floor(totalIn / 12)));
        setInText(String(totalIn % 12));
      } else {
        setWeightText(String(Math.round(weight * 10) / 10));
        setHeightText(String(Math.round(height)));
      }
    }
    setUseImperial(!useImperial);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold" style={{ color: "var(--ink)" }}>
          Profile
        </h2>
        <button
          onClick={toggleUnits}
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
            value={ageText}
            onChange={(e) => setAgeText(e.target.value)}
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
            value={weightText}
            onChange={(e) => setWeightText(e.target.value)}
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
                  value={ftText}
                  onChange={(e) => setFtText(e.target.value)}
                  min={0}
                  className="w-16 px-2 py-2 rounded-lg text-sm outline-none text-center"
                  style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" }}
                />
                <span className="text-xs" style={{ color: "var(--muted)" }}>ft</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={inText}
                  onChange={(e) => setInText(e.target.value)}
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
              value={heightText}
              onChange={(e) => setHeightText(e.target.value)}
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
              {valid ? bmi : "—"}
            </div>
            <div className="text-[0.625rem]" style={{ color: "var(--muted)" }}>
              BMI
            </div>
            <div
              className="text-[0.625rem] font-medium"
              style={{
                color:
                  bmi < 18.5 || bmi >= 30
                    ? "var(--error)"
                    : bmi >= 25
                      ? "var(--warning)"
                      : "var(--success)",
              }}
            >
              {valid ? bmiCategory(bmi) : ""}
            </div>
          </div>
          <div>
            <div className="text-xl font-bold" style={{ color: "var(--ink)" }}>
              {valid ? tdee : "—"}
            </div>
            <div className="text-[0.625rem]" style={{ color: "var(--muted)" }}>
              TDEE (cal)
            </div>
          </div>
          <div>
            <div className="text-xl font-bold" style={{ color: "var(--accent)" }}>
              {valid ? suggested : "—"}
            </div>
            <div className="text-[0.625rem]" style={{ color: "var(--muted)" }}>
              Suggested (cal)
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!valid}
        className="w-full py-2.5 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: "var(--accent)", color: "#fff", border: "none" }}
      >
        Save profile
      </button>
      {!valid && (
        <p className="text-[0.6875rem] text-center" style={{ color: "var(--muted)" }}>
          Enter an age of 10–120, a weight of 20–400 kg (44–880 lb) and a height of 90–250 cm (3 ft–8 ft 2 in).
        </p>
      )}

      <AppearanceSettings />
      <PortionStepsSettings />

      <TargetsSection profile={profile} overrides={overrides} onChange={onOverridesChange} />

      <LabelScannerSettings />

      <BackupSection />
    </div>
  );
}
