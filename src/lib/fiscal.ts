// 13-period fiscal calendar: every period = 4 weeks (13 × 4 = 52 weeks/year).
const PERIOD_WEEKS = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] as const;

export function periodWeekRange(period: number): { start: number; end: number } {
  let start = 1;
  for (let p = 1; p < period; p++) start += PERIOD_WEEKS[p - 1];
  return { start, end: start + PERIOD_WEEKS[period - 1] - 1 };
}

export function periodForWeek(week: number): number {
  let acc = 0;
  for (let i = 0; i < PERIOD_WEEKS.length; i++) {
    acc += PERIOD_WEEKS[i];
    if (week <= acc) return i + 1;
  }
  return PERIOD_WEEKS.length;
}

export function quarterForPeriod(period: number): number {
  // 4 quarters × 13 weeks. Assign each period to the quarter holding its first week.
  const { start } = periodWeekRange(period);
  return Math.min(4, Math.floor((start - 1) / 13) + 1);
}

export function quarterForWeek(week: number): number {
  return Math.min(4, Math.floor((week - 1) / 13) + 1);
}

export function quarterWeekRange(quarter: number): { start: number; end: number } {
  const start = (quarter - 1) * 13 + 1;
  return { start, end: start + 12 };
}

export function shiftISODate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}



/** Snap to the Sunday on or before the given UTC date. */
function snapToSunday(d: Date): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() - out.getUTCDay());
  return out;
}

/** Returns ISO date strings (YYYY-MM-DD) for each day of the fiscal week (Sun–Sat). */
export function weekDates(fyStartISO: string, week: number): string[] {
  const fyStart = new Date(`${fyStartISO}T00:00:00Z`);
  const start = snapToSunday(fyStart);
  start.setUTCDate(start.getUTCDate() + (week - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export function currentFiscalWeek(fyStartISO: string, today = new Date()): number {
  const fyStart = new Date(`${fyStartISO}T00:00:00Z`);
  const start = snapToSunday(fyStart);
  const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diffDays = Math.floor((todayUTC - start.getTime()) / 86_400_000);
  return Math.max(1, Math.min(52, Math.floor(diffDays / 7) + 1));
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
