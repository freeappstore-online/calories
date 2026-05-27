import { useRef, useEffect } from "react";
import { formatDateShort } from "../lib/dates";

interface DayMacros {
  date: string;
  protein: number;
  carbs: number;
  fat: number;
}

interface MacroBarChartProps {
  data: DayMacros[];
  height?: number;
}

export default function MacroBarChart({
  data,
  height = 200,
}: MacroBarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = container.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const style = getComputedStyle(document.documentElement);
    const mutedColor = style.getPropertyValue("--muted").trim() || "#6b7280";
    const lineColor = style.getPropertyValue("--line").trim() || "#e5e7eb";

    const padding = { top: 16, right: 16, bottom: 40, left: 44 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    ctx.clearRect(0, 0, width, height);

    if (data.length === 0) return;

    const maxTotal = Math.max(
      1,
      ...data.map((d) => d.protein + d.carbs + d.fat),
    );

    // Y grid
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const val = Math.round((maxTotal / yTicks) * i);
      const y = padding.top + chartH * (1 - val / maxTotal);
      ctx.fillStyle = mutedColor;
      ctx.font = "10px Manrope, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${val}g`, padding.left - 6, y + 3);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    const barGroupW = chartW / data.length;
    const barW = Math.min(barGroupW * 0.22, 16);
    const gap = 2;
    const colors = ["#3b82f6", "#f59e0b", "#ef4444"];

    data.forEach((d, i) => {
      const groupX = padding.left + i * barGroupW + barGroupW / 2;
      const macros = [d.protein, d.carbs, d.fat];

      macros.forEach((val, mi) => {
        const barH = maxTotal > 0 ? (val / maxTotal) * chartH : 0;
        const x = groupX + (mi - 1) * (barW + gap) - barW / 2;
        const y = padding.top + chartH - barH;
        const r = 2;

        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        ctx.lineTo(x + barW, padding.top + chartH);
        ctx.lineTo(x, padding.top + chartH);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fillStyle = colors[mi] ?? "#888";
        ctx.fill();
      });

      // X label
      ctx.fillStyle = mutedColor;
      ctx.font = "10px Manrope, sans-serif";
      ctx.textAlign = "center";
      const labelEvery = data.length > 14 ? 3 : data.length > 7 ? 2 : 1;
      if (i % labelEvery === 0 || i === data.length - 1) {
        ctx.fillText(formatDateShort(d.date), groupX, height - padding.bottom + 18);
      }
    });
  }, [data, height]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}
