import { useRef, useEffect } from "react";
import { formatDateShort } from "../lib/dates";

interface DataPoint {
  date: string;
  calories: number;
}

interface CalorieTrendChartProps {
  data: DataPoint[];
  goal: number;
  height?: number;
}

export default function CalorieTrendChart({
  data,
  goal,
  height = 200,
}: CalorieTrendChartProps) {
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
    const inkColor = style.getPropertyValue("--ink").trim() || "#1a1a1a";
    const mutedColor = style.getPropertyValue("--muted").trim() || "#6b7280";
    const lineColor = style.getPropertyValue("--line").trim() || "#e5e7eb";
    const accentColor = style.getPropertyValue("--accent").trim() || "#2563eb";

    const padding = { top: 20, right: 16, bottom: 40, left: 44 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Clear
    ctx.clearRect(0, 0, width, height);

    if (data.length === 0) return;

    const maxCal = Math.max(goal * 1.3, ...data.map((d) => d.calories));

    // Draw goal line
    const goalY = padding.top + chartH * (1 - goal / maxCal);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = mutedColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, goalY);
    ctx.lineTo(width - padding.right, goalY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Goal label
    ctx.fillStyle = mutedColor;
    ctx.font = "10px Manrope, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Goal", padding.left - 6, goalY + 3);

    // Y-axis labels
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const val = Math.round((maxCal / yTicks) * i);
      const y = padding.top + chartH * (1 - val / maxCal);
      ctx.fillStyle = mutedColor;
      ctx.font = "10px Manrope, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(String(val), padding.left - 6, y + 3);

      // Grid line
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // Plot points and line
    const stepX = data.length > 1 ? chartW / (data.length - 1) : chartW;

    // Fill gradient
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + chartH * (1 - d.calories / maxCal);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    // Close shape for fill
    ctx.lineTo(padding.left + (data.length - 1) * stepX, padding.top + chartH);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    gradient.addColorStop(0, accentColor + "30");
    gradient.addColorStop(1, accentColor + "05");
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + chartH * (1 - d.calories / maxCal);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Dots
    data.forEach((d, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + chartH * (1 - d.calories / maxCal);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = d.calories > goal ? "var(--error)" : accentColor;
      // Can't use CSS vars directly in canvas — use the resolved colors
      ctx.fillStyle = d.calories > goal ? "#ef4444" : accentColor;
      ctx.fill();
      ctx.strokeStyle = inkColor === "#f5f5f5" ? "#0f0f0f" : "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // X-axis labels
    const labelEvery = data.length > 14 ? 3 : data.length > 7 ? 2 : 1;
    data.forEach((d, i) => {
      if (i % labelEvery !== 0 && i !== data.length - 1) return;
      const x = padding.left + i * stepX;
      ctx.fillStyle = mutedColor;
      ctx.font = "10px Manrope, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(formatDateShort(d.date), x, height - padding.bottom + 18);
    });
  }, [data, goal, height]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}
