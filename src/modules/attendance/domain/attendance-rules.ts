import { DateTime } from 'luxon';

export type MarkType = 'IN' | 'OUT';

export interface MarkRecord {
  id?: string;
  type: MarkType;
  timestamp: Date;
  isLate?: boolean;
  lateMinutes?: number;
  preEntryMinutes?: number;
  creditedFrom?: Date | null;
}

export interface WorkdayRules {
  dailyMinutes: number;
  lunchMinutes: number;
  lunchAfterMinutes: number;
}

export interface ShiftRule {
  startTime: string;
  endTime: string;
  toleranceMinutes: number;
}

const DEFAULT_MAX_SESSION_HOURS = 16;

export function nextMarkType(
  last: Pick<MarkRecord, 'type' | 'timestamp'> | null | undefined,
  now: Date,
  maxSessionHours = DEFAULT_MAX_SESSION_HOURS,
): MarkType {
  if (!last || last.type === 'OUT') return 'IN';
  const hours = (now.getTime() - last.timestamp.getTime()) / 3_600_000;
  return hours > maxSessionHours ? 'IN' : 'OUT';
}

export function validateRequestedType(expected: MarkType, requested?: MarkType): string | null {
  if (!requested || requested === expected) return null;
  return requested === 'IN'
    ? 'Ya registraste tu ingreso. La siguiente marcación debe ser una salida.'
    : 'No tienes un ingreso abierto. La siguiente marcación debe ser un ingreso.';
}

export function parseHHmm(value: string): { hour: number; minute: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) throw new Error(`Hora inválida: ${value}`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function computeLateness(
  timestamp: Date,
  shift: Pick<ShiftRule, 'startTime' | 'toleranceMinutes'> | null | undefined,
  zone: string,
): { isLate: boolean; lateMinutes: number } {
  if (!shift) return { isLate: false, lateMinutes: 0 };
  const local = DateTime.fromJSDate(timestamp, { zone });
  const { hour, minute } = parseHHmm(shift.startTime);
  const start = local.set({ hour, minute, second: 0, millisecond: 0 });
  const limit = start.plus({ minutes: shift.toleranceMinutes });
  if (local <= limit) return { isLate: false, lateMinutes: 0 };
  return { isLate: true, lateMinutes: Math.floor(local.diff(start, 'minutes').minutes) };
}

export function computePreEntry(
  timestamp: Date,
  shift: Pick<ShiftRule, 'startTime'> | null | undefined,
  zone: string,
): { preEntryMinutes: number } {
  if (!shift) return { preEntryMinutes: 0 };
  const local = DateTime.fromJSDate(timestamp, { zone }).startOf('minute');
  const { hour, minute } = parseHHmm(shift.startTime);
  const start = local.set({ hour, minute });
  if (local >= start) return { preEntryMinutes: 0 };
  return { preEntryMinutes: Math.round(start.diff(local, 'minutes').minutes) };
}

export function countedFrom(mark: Pick<MarkRecord, 'timestamp' | 'preEntryMinutes' | 'creditedFrom'>): Date {
  if (mark.creditedFrom) return mark.creditedFrom;
  const pre = mark.preEntryMinutes ?? 0;
  if (pre <= 0) return mark.timestamp;
  const minuteStart = Math.floor(mark.timestamp.getTime() / 60_000) * 60_000;
  return new Date(minuteStart + pre * 60_000);
}

export interface WorkSession {
  in: Date;
  countedFrom: Date;
  preEntryMinutes: number;
  out: Date | null;
  minutes: number;
  open: boolean;
  stale: boolean;
}

export function buildSessions(records: MarkRecord[], now: Date, maxSessionHours = DEFAULT_MAX_SESSION_HOURS): WorkSession[] {
  const sorted = [...records].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const sessions: WorkSession[] = [];
  const maxMs = maxSessionHours * 3_600_000;

  let openIn: MarkRecord | null = null;
  const start = (r: MarkRecord) => ({ in: r.timestamp, countedFrom: countedFrom(r), preEntryMinutes: r.preEntryMinutes ?? 0 });
  const minutesBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));

  const closeAsOpen = (r: MarkRecord) => {
    const s = start(r);
    // "Abandonada" se mide desde la marca real; las horas, desde que empieza a contar.
    const stale = now.getTime() - r.timestamp.getTime() > maxMs;
    sessions.push({ ...s, out: null, open: true, stale, minutes: stale ? 0 : minutesBetween(s.countedFrom, now) });
  };

  for (const r of sorted) {
    if (r.type === 'IN') {
      if (openIn) {
        sessions.push({ ...start(openIn), out: null, open: true, stale: true, minutes: 0 });
      }
      openIn = r;
    } else if (openIn) {
      const s = start(openIn);
      sessions.push({ ...s, out: r.timestamp, open: false, stale: false, minutes: minutesBetween(s.countedFrom, r.timestamp) });
      openIn = null;
    }
  }
  if (openIn) closeAsOpen(openIn);
  return sessions;
}

export function sumWorkedMinutes(sessions: WorkSession[]): number {
  return sessions.reduce((acc, s) => acc + s.minutes, 0);
}

export interface DaySummary {
  date: string;
  firstIn: Date | null;
  preEntryMinutes: number;
  lastOut: Date | null;
  workedMinutes: number;
  breakMinutes: number;
  lunchMinutes: number;
  sessions: WorkSession[];
  openSession: boolean;
  isLate: boolean;
  lateMinutes: number;
  records: MarkRecord[];
}

/** El almuerzo no se paga: se descuenta solo en jornadas de más de `lunchAfterMinutes` y menos lo que ya salió entre marcas. */
export function lunchDeduction(grossMinutes: number, breakMinutes: number, rules: WorkdayRules): number {
  const due = Math.max(0, rules.lunchMinutes - breakMinutes);
  return Math.min(due, Math.max(0, grossMinutes - rules.lunchAfterMinutes));
}

function breaksBetween(sessions: WorkSession[]): number {
  const sorted = [...sessions].sort((a, b) => a.in.getTime() - b.in.getTime());
  let total = 0;
  for (let k = 1; k < sorted.length; k++) {
    const prevOut = sorted[k - 1].out;
    if (prevOut && sorted[k].in > prevOut) total += Math.floor((sorted[k].in.getTime() - prevOut.getTime()) / 60_000);
  }
  return total;
}

export function summarizeByDay(
  records: MarkRecord[],
  zone: string,
  now: Date,
  maxSessionHours = DEFAULT_MAX_SESSION_HOURS,
  workday?: WorkdayRules,
): DaySummary[] {
  const dayOf = (d: Date) => DateTime.fromJSDate(d, { zone }).toISODate()!;
  const sessions = buildSessions(records, now, maxSessionHours);
  const days = new Map<string, DaySummary>();

  const ensure = (date: string): DaySummary => {
    let d = days.get(date);
    if (!d) {
      d = {
        date,
        firstIn: null,
        preEntryMinutes: 0,
        lastOut: null,
        workedMinutes: 0,
        breakMinutes: 0,
        lunchMinutes: 0,
        sessions: [],
        openSession: false,
        isLate: false,
        lateMinutes: 0,
        records: [],
      };
      days.set(date, d);
    }
    return d;
  };

  for (const s of sessions) {
    const d = ensure(dayOf(s.in));
    d.sessions.push(s);
    d.workedMinutes += s.minutes;
    if (s.open) d.openSession = true;
    if (!d.firstIn || s.countedFrom < d.firstIn) {
      d.firstIn = s.countedFrom;
      d.preEntryMinutes = s.preEntryMinutes;
    }
    if (s.out && (!d.lastOut || s.out > d.lastOut)) d.lastOut = s.out;
  }

  for (const r of records) {
    const d = ensure(dayOf(r.timestamp));
    d.records.push(r);
    if (r.type === 'IN' && r.isLate && !d.isLate) {
      d.isLate = true;
      d.lateMinutes = r.lateMinutes ?? 0;
    }
  }

  for (const d of days.values()) {
    d.breakMinutes = breaksBetween(d.sessions);
    d.lunchMinutes = workday ? lunchDeduction(d.workedMinutes, d.breakMinutes, workday) : 0;
    d.workedMinutes -= d.lunchMinutes;
    d.records.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
