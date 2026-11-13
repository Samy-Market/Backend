import { DateTime } from 'luxon';

export interface DayRange {
  startDate: string;
  endDate: string | null;
}

export function isValidDayKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && DateTime.fromISO(key, { zone: 'UTC' }).isValid;
}

export function weekdayOf(dayKey: string): number {
  return DateTime.fromISO(dayKey, { zone: 'UTC' }).weekday;
}

export function addDays(dayKey: string, n: number): string {
  return DateTime.fromISO(dayKey, { zone: 'UTC' }).plus({ days: n }).toISODate()!;
}

export function eachDay(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  for (let d = fromKey; d <= toKey; d = addDays(d, 1)) out.push(d);
  return out;
}

export function dayKeyInZone(date: Date, zone: string): string {
  return DateTime.fromJSDate(date, { zone }).toISODate()!;
}

export function weekOf(dayKey: string): { from: string; to: string } {
  const d = DateTime.fromISO(dayKey, { zone: 'UTC' });
  const from = d.minus({ days: d.weekday - 1 }).toISODate()!;
  return { from, to: addDays(from, 6) };
}

function covers(range: DayRange, dayKey: string): boolean {
  return range.startDate <= dayKey && (range.endDate === null || dayKey <= range.endDate);
}

export function rangesOverlap(a: DayRange, b: DayRange): boolean {
  return a.startDate <= (b.endDate ?? '9999-12-31') && b.startDate <= (a.endDate ?? '9999-12-31');
}

export function findCovering<T extends DayRange>(ranges: T[], dayKey: string): T | null {
  let best: T | null = null;
  for (const r of ranges) if (covers(r, dayKey) && (!best || r.startDate > best.startDate)) best = r;
  return best;
}
