interface ProgressRingProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  unit?: string;
  color?: string;
}

export default function ProgressRing({
  value,
  max,
  size = 100,
  strokeWidth = 8,
  label,
  unit = "",
  color,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(value / max, 1.5) : 0;
  const offset = circumference - ratio * circumference;

  // Color based on progress
  const resolvedColor =
    color ??
    (ratio <= 0.8
      ? "var(--success)"
      : ratio <= 1.0
        ? "var(--warning)"
        : "var(--error)");

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={resolvedColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="text-center -mt-1">
        <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>
          {Math.round(value)}{unit}
        </div>
        <div className="text-[10px]" style={{ color: "var(--muted)" }}>
          / {max}{unit} {label}
        </div>
      </div>
    </div>
  );
}
