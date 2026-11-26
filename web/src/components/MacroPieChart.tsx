import { useRef, useEffect } from "react";
import { useRedraw } from "../lib/useRedraw";
import { FAT_COLOR } from "../lib/colors";

interface MacroPieChartProps {
  protein: number;
  carbs: number;
  fat: number;
  /** Logged calories total; falls back to the macro-derived estimate */
  calories?: number;
  size?: number;
  /** Hide the legend (for small inline use) */
  compact?: boolean;
}

export default function MacroPieChart({
  protein,
  carbs,
  fat,
  calories,
  size = 180,
  compact = false,
}: MacroPieChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const redraw = useRedraw(boxRef);
  // Shares are of energy (4 / 4 / 9 kcal per gram), not of grams
  const pKcal = protein * 4;
  const cKcal = carbs * 4;
  const fKcal = fat * 9;
  const total = pKcal + cKcal + fKcal;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const ring = Math.round(size * 0.155);
    if (total === 0) {
      // Empty state
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 4 - ring / 2, 0, Math.PI * 2);
      ctx.lineWidth = ring;
      const style = getComputedStyle(document.documentElement);
      ctx.strokeStyle = style.getPropertyValue("--line").trim() || "#e5e7eb";
      ctx.stroke();
      return;
    }

    const slices = [
      { value: pKcal, color: "#3b82f6" }, // blue
      { value: cKcal, color: "#f59e0b" }, // amber
      { value: fKcal, color: FAT_COLOR },
    ];

    const cx = size / 2;
    const cy = size / 2;
    const outerR = size / 2 - 4;
    const innerR = outerR - ring;
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
  }, [pKcal, cKcal, fKcal, total, size, redraw]);

  const pPct = total > 0 ? Math.round((pKcal / total) * 100) : 0;
  const cPct = total > 0 ? Math.round((cKcal / total) * 100) : 0;
  const fPct = total > 0 ? 100 - pPct - cPct : 0;

  return (
    <div className="flex flex-col items-center gap-3">
      <div ref={boxRef} className="relative">
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size }}
        />
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          <span className={compact ? "text-sm font-bold" : "text-lg font-bold"} style={{ color: "var(--ink)" }}>
            {Math.round(calories ?? protein * 4 + carbs * 4 + fat * 9)}
          </span>
          <span className="text-[0.625rem]" style={{ color: "var(--muted)" }}>
            kcal
          </span>
        </div>
      </div>
      {!compact && <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
          <span style={{ color: "var(--muted)" }}>P {pPct}%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
          <span style={{ color: "var(--muted)" }}>C {cPct}%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: FAT_COLOR }} />
          <span style={{ color: "var(--muted)" }}>F {fPct}%</span>
        </div>
      </div>}
    </div>
  );
}
