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

// ---------------------------------------------------------------------------
// Horas trabajadas
// ---------------------------------------------------------------------------

export interface WorkSession {
  in: Date;
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
export function buildSessions(
  records: MarkRecord[],
  now: Date,
  maxSessionHours = DEFAULT_MAX_SESSION_HOURS,
): WorkSession[] {
  const sorted = [...records].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const sessions: WorkSession[] = [];
  let openIn: Date | null = null;
  const maxMs = maxSessionHours * 3_600_000;

  const closeAsOpen = (start: Date) => {
    const elapsed = now.getTime() - start.getTime();
    const stale = elapsed > maxMs;
    sessions.push({
      in: start,
      out: null,
      open: true,
      stale,
      minutes: stale ? 0 : Math.max(0, Math.floor(elapsed / 60_000)),
    });
  };

  for (const r of sorted) {
    if (r.type === 'IN') {
      if (openIn) {
        // IN consecutivo: la jornada anterior quedó abierta (abandonada).
        sessions.push({ in: openIn, out: null, open: true, stale: true, minutes: 0 });
      }
      openIn = r.timestamp;
    } else if (openIn) {
      const minutes = Math.floor((r.timestamp.getTime() - openIn.getTime()) / 60_000);
      sessions.push({ in: openIn, out: r.timestamp, open: false, stale: false, minutes });
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
  firstIn: Date | null;
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
export function summarizeByDay(
  records: MarkRecord[],
  zone: string,
  now: Date,
  maxSessionHours = DEFAULT_MAX_SESSION_HOURS,
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
    if (!d.firstIn || s.in < d.firstIn) d.firstIn = s.in;
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

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
