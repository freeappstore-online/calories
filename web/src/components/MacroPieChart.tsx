import { useRef, useEffect } from "react";

interface MacroPieChartProps {
  protein: number;
  carbs: number;
  fat: number;
  size?: number;
}

export default function MacroPieChart({
  protein,
  carbs,
  fat,
  size = 180,
}: MacroPieChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const total = protein + carbs + fat;
    if (total === 0) {
      // Empty state
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 20, 0, Math.PI * 2);
      ctx.lineWidth = 24;
      const style = getComputedStyle(document.documentElement);
      ctx.strokeStyle = style.getPropertyValue("--line").trim() || "#e5e7eb";
      ctx.stroke();
      return;
    }

    const slices = [
      { value: protein, color: "#3b82f6" }, // blue
      { value: carbs, color: "#f59e0b" }, // amber
      { value: fat, color: "#ef4444" }, // red
    ];

    const cx = size / 2;
    const cy = size / 2;
    const outerR = size / 2 - 4;
    const innerR = outerR - 28;
    let startAngle = -Math.PI / 2;

    for (const slice of slices) {
      const angle = (slice.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, startAngle + angle);
      ctx.arc(cx, cy, innerR, startAngle + angle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = slice.color;
      ctx.fill();
      startAngle += angle;
    }
  }, [protein, carbs, fat, size]);

  const total = protein + carbs + fat;
  const pPct = total > 0 ? Math.round((protein / total) * 100) : 0;
  const cPct = total > 0 ? Math.round((carbs / total) * 100) : 0;
  const fPct = total > 0 ? 100 - pPct - cPct : 0;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size }}
        />
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          <span className="text-lg font-bold" style={{ color: "var(--ink)" }}>
            {Math.round(protein * 4 + carbs * 4 + fat * 9)}
          </span>
          <span className="text-[10px]" style={{ color: "var(--muted)" }}>
            kcal
          </span>
        </div>
      </div>
      <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
          <span style={{ color: "var(--muted)" }}>P {pPct}%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
          <span style={{ color: "var(--muted)" }}>C {cPct}%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
          <span style={{ color: "var(--muted)" }}>F {fPct}%</span>
        </div>
      </div>
    </div>
  );
}
