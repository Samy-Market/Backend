/**
 * Lógica de negocio pura de marcaciones (sin dependencias de Nest ni Prisma),
 * para poder probarla de forma aislada.
 */
import { DateTime } from 'luxon';

export type MarkType = 'IN' | 'OUT';

export interface MarkRecord {
  id?: string;
  type: MarkType;
  timestamp: Date;
  isLate?: boolean;
  lateMinutes?: number;
  /** Minutos de preingreso: llegó antes de su hora de entrada. No suman a las horas trabajadas. */
  preEntryMinutes?: number;
}

export interface ShiftRule {
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  toleranceMinutes: number;
}

/** Duración máxima de una jornada antes de considerarla abandonada (olvidó marcar salida). */
export const DEFAULT_MAX_SESSION_HOURS = 16;

// ---------------------------------------------------------------------------
// Alternancia IN / OUT
// ---------------------------------------------------------------------------

/**
 * Determina el tipo de la siguiente marcación a partir de la última.
 * - Sin marcas previas o última = OUT → IN.
 * - Última = IN → OUT, salvo que ese IN tenga más de `maxSessionHours`
 *   (el empleado olvidó marcar salida): entonces se abre una nueva jornada (IN)
 *   y la anterior queda como "jornada abierta".
 */
export function nextMarkType(
  last: Pick<MarkRecord, 'type' | 'timestamp'> | null | undefined,
  now: Date,
  maxSessionHours = DEFAULT_MAX_SESSION_HOURS,
): MarkType {
  if (!last || last.type === 'OUT') return 'IN';
  const hours = (now.getTime() - last.timestamp.getTime()) / 3_600_000;
  return hours > maxSessionHours ? 'IN' : 'OUT';
}

/**
 * Valida que el tipo solicitado sea el esperado. Devuelve un mensaje de error
 * en español si se intenta una marcación duplicada consecutiva.
 */
export function validateRequestedType(expected: MarkType, requested?: MarkType): string | null {
  if (!requested || requested === expected) return null;
  return requested === 'IN'
    ? 'Ya registraste tu ingreso. La siguiente marcación debe ser una salida.'
    : 'No tienes un ingreso abierto. La siguiente marcación debe ser un ingreso.';
}

// ---------------------------------------------------------------------------
// Atraso
// ---------------------------------------------------------------------------

export function parseHHmm(value: string): { hour: number; minute: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) throw new Error(`Hora inválida: ${value}`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/**
 * Atraso = ingreso posterior a (hora de entrada + tolerancia), evaluado en la zona horaria local.
 * `lateMinutes` se mide desde la hora de entrada del turno (no desde el fin de la tolerancia).
 */
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

/**
 * Preingreso = minutos que el ingreso se adelanta a la hora de entrada del turno (hora local).
 * Se mide desde el minuto de la marca, así un ingreso a las 07:50:40 en un turno de 08:00 da 10 min
 * y la jornada se cuenta exactamente desde las 08:00.
 */
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

/**
 * Desde cuándo se cuentan las horas de un ingreso: la hora de entrada del turno si llegó antes
 * (preingreso) o la hora real de la marca en otro caso.
 */
export function countedFrom(mark: Pick<MarkRecord, 'timestamp' | 'preEntryMinutes'>): Date {
  const pre = mark.preEntryMinutes ?? 0;
  if (pre <= 0) return mark.timestamp;
  const minuteStart = Math.floor(mark.timestamp.getTime() / 60_000) * 60_000;
  return new Date(minuteStart + pre * 60_000);
}

// ---------------------------------------------------------------------------
// Horas trabajadas
// ---------------------------------------------------------------------------

export interface WorkSession {
  /** Hora real de la marca de ingreso. */
  in: Date;
  /** Desde cuándo se cuentan las horas (la hora de entrada del turno si hubo preingreso). */
  countedFrom: Date;
  preEntryMinutes: number;
  out: Date | null;
  /** Minutos computados (si está abierta y vigente, hasta `now`; si está abandonada, 0). */
  minutes: number;
  /** IN sin OUT. */
  open: boolean;
  /** IN sin OUT que superó la duración máxima (olvidó marcar salida). */
  stale: boolean;
}

/**
 * Empareja IN→OUT en orden cronológico. Las marcas huérfanas (OUT sin IN) se ignoran.
 */
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
        // IN consecutivo: la jornada anterior quedó abierta (abandonada).
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
  date: string; // yyyy-MM-dd local
  /** Ingreso que cuenta: la hora de entrada del turno si llegó antes, o la hora real de la marca. */
  firstIn: Date | null;
  /** Minutos de preingreso del primer ingreso del día (no suman a las horas). */
  preEntryMinutes: number;
  lastOut: Date | null;
  workedMinutes: number;
  sessions: WorkSession[];
  /** Hay un IN sin OUT (en curso o abandonado). */
  openSession: boolean;
  isLate: boolean;
  lateMinutes: number;
  records: MarkRecord[];
}

/**
 * Agrupa por día local. Cada jornada (IN→OUT) se asigna al día de su IN, por lo que
 * los turnos que cruzan medianoche no se parten.
 */
export function summarizeByDay(records: MarkRecord[], zone: string, now: Date, maxSessionHours = DEFAULT_MAX_SESSION_HOURS): DaySummary[] {
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
    d.records.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
