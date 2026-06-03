// NRF-style 4-4-5 fiscal calendar helpers
// Pattern: each quarter = 4 + 4 + 5 weeks. 13 periods, 52 weeks/year.
const PERIOD_WEEKS = [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5] as const;

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
  return 13;
}

export function quarterForPeriod(period: number): number {
  return Math.min(4, Math.ceil(period / 3));
}

/** Returns ISO date strings (YYYY-MM-DD) for each day of the fiscal week. */
export function weekDates(fyStartISO: string, week: number): string[] {
  const start = new Date(`${fyStartISO}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + (week - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export function currentFiscalWeek(fyStartISO: string, today = new Date()): number {
  const start = new Date(`${fyStartISO}T00:00:00Z`);
  const diffDays = Math.floor((today.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, Math.min(52, Math.floor(diffDays / 7) + 1));
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
