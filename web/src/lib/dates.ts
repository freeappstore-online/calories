/** Format a Date to YYYY-MM-DD */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Get today as YYYY-MM-DD */
export function today(): string {
  return toDateString(new Date());
}

/** Shift a date string by N days */
export function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

/** Get an array of date strings for the last N days ending at `endDate` */
export function lastNDays(n: number, endDate: string): string[] {
  const result: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    result.push(shiftDate(endDate, -i));
  }
  return result;
}

/**
 * Format YYYY-MM-DD as a compact label in the user's locale, e.g. "Today, 7 March",
 * "Wed, 5 March"; the year only appears for other years.
 */
export function formatDate(dateStr: string): string {
  const todayStr = today();
  const d = new Date(dateStr + "T12:00:00");
  const dayMonth = d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    ...(dateStr.slice(0, 4) === todayStr.slice(0, 4) ? {} : { year: "numeric" }),
  });
  const relative =
    dateStr === todayStr ? "Today"
    : dateStr === shiftDate(todayStr, -1) ? "Yesterday"
    : dateStr === shiftDate(todayStr, 1) ? "Tomorrow"
    : d.toLocaleDateString(undefined, { weekday: "short" });
  return `${relative}, ${dayMonth}`;
}

/** Format YYYY-MM-DD to short label for charts (e.g. "Mon 26") */
export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
  });
}
