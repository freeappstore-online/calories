import { useTheme } from "@freeappstore/sdk/hooks";
import { useTextSize } from "@freeappstore/sdk/ui";

type Option<T extends string> = { value: T; label: string };

const THEMES: Option<"system" | "light" | "dark">[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const SIZES: Option<"sm" | "default" | "lg">[] = [
  { value: "sm", label: "Small" },
  { value: "default", label: "Default" },
  { value: "lg", label: "Large" },
];

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs" style={{ color: "var(--ink)" }}>{label}</span>
      <div className="flex rounded-lg overflow-hidden" role="radiogroup" aria-label={label} style={{ border: "1px solid var(--line)" }}>
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className="px-3 py-1.5 text-xs font-medium cursor-pointer"
            style={{
              background: value === o.value ? "var(--accent)" : "var(--paper)",
              color: value === o.value ? "#fff" : "var(--ink)",
              border: "none",
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Profile section: theme and text size (platform-wide preferences from the SDK) */
export default function AppearanceSettings() {
  const { preference, setPreference } = useTheme();
  const { size, setSize } = useTextSize();
  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <h2 className="text-sm font-bold" style={{ color: "var(--ink)" }}>
        Appearance
      </h2>
      <Segmented label="Theme" options={THEMES} value={preference} onChange={setPreference} />
      <Segmented label="Text size" options={SIZES} value={size} onChange={setSize} />
    </div>
  );
}
