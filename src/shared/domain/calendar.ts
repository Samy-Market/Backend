/**
 * Utilidades de calendario puras. Un "día" se representa como "yyyy-MM-dd" en la
 * zona horaria de la empresa; así las reglas no dependen de la zona del servidor.
 */
import { DateTime } from 'luxon';

/** Periodo de días inclusivo; `endDate` nulo = sin fin. */
export interface DayRange {
  startDate: string;
  endDate: string | null;
}

export const WEEKDAY_NAMES = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function isValidDayKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && DateTime.fromISO(key, { zone: 'UTC' }).isValid;
}

/** Día de la semana ISO (1 = lunes … 7 = domingo). */
export function weekdayOf(dayKey: string): number {
  return DateTime.fromISO(dayKey, { zone: 'UTC' }).weekday;
}

export function addDays(dayKey: string, n: number): string {
  return DateTime.fromISO(dayKey, { zone: 'UTC' }).plus({ days: n }).toISODate()!;
}

/** Días entre dos fechas, ambas inclusivas. */
export function eachDay(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  for (let d = fromKey; d <= toKey; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Día local de un instante en la zona indicada. */
export function dayKeyInZone(date: Date, zone: string): string {
  return DateTime.fromJSDate(date, { zone }).toISODate()!;
}

/** Semana (lunes a domingo) que contiene el día. */
export function weekOf(dayKey: string): { from: string; to: string } {
  const d = DateTime.fromISO(dayKey, { zone: 'UTC' });
  const from = d.minus({ days: d.weekday - 1 }).toISODate()!;
  return { from, to: addDays(from, 6) };
}

export function covers(range: DayRange, dayKey: string): boolean {
  return range.startDate <= dayKey && (range.endDate === null || dayKey <= range.endDate);
}

export function rangesOverlap(a: DayRange, b: DayRange): boolean {
  return a.startDate <= (b.endDate ?? '9999-12-31') && b.startDate <= (a.endDate ?? '9999-12-31');
}

/** Periodo vigente en un día; si varios lo cubren, gana el que empezó más tarde. */
export function findCovering<T extends DayRange>(ranges: T[], dayKey: string): T | null {
  let best: T | null = null;
  for (const r of ranges) if (covers(r, dayKey) && (!best || r.startDate > best.startDate)) best = r;
  return best;
}
