import { BusinessRuleError, ForbiddenError } from '../../../shared/domain/errors';

export type JustificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ReviewDecision = Exclude<JustificationStatus, 'PENDING'>;

export const ALREADY_REVIEWED = 'Esta justificación ya fue revisada.';

export function assertCanReview(justification: { status: JustificationStatus; employeeId: string }, reviewerEmployeeId: string | null) {
  if (justification.status !== 'PENDING') throw new BusinessRuleError(ALREADY_REVIEWED);
  if (reviewerEmployeeId && reviewerEmployeeId === justification.employeeId) {
    throw new ForbiddenError('No puedes revisar tu propia justificación.');
  }
}

export function absenceProblem(day: {
  date: string;
  today: string;
  planKind: 'WORK' | 'REST' | 'UNASSIGNED';
  marks: number;
}): string | null {
  if (day.date >= day.today) return 'Solo se pueden justificar ausencias de días que ya pasaron.';
  if (day.planKind !== 'WORK') return 'Ese día no tenías turno de trabajo.';
  if (day.marks > 0) return 'Ese día sí tiene marcaciones: justifica la marcación.';
  return null;
}

export interface ExitWindow {
  inAt: Date;
  earliest: Date;
  latest: Date;
  suggested: string | null;
}

/** Hasta cuándo puede ir la salida que faltó: después del ingreso, antes de la siguiente marca, sin futuro y dentro del máximo de jornada. */
export function missingExitWindow(
  mark: { type: 'IN' | 'OUT'; timestamp: Date },
  next: { type: 'IN' | 'OUT'; timestamp: Date } | null,
  now: Date,
  maxSessionHours: number,
  shiftEnd: Date | null,
  dayEnded: boolean,
): ExitWindow | null {
  if (mark.type !== 'IN' || next?.type === 'OUT') return null;
  // Mientras la jornada sigue en curso no hay salida "olvidada": todavía puede marcarla.
  const overdue = shiftEnd ? now >= shiftEnd : dayEnded || now.getTime() - mark.timestamp.getTime() > maxSessionHours * 3_600_000;
  if (!next && !overdue) return null;
  const earliest = new Date(mark.timestamp.getTime() + 60_000);
  const limits = [now.getTime(), mark.timestamp.getTime() + maxSessionHours * 3_600_000];
  if (next) limits.push(next.timestamp.getTime() - 60_000);
  const latest = new Date(Math.min(...limits));
  if (latest < earliest) return null;
  const suggested = shiftEnd && shiftEnd >= earliest && shiftEnd <= latest ? shiftEnd.toISOString() : null;
  return { inAt: mark.timestamp, earliest, latest, suggested };
}

export function exitProblem(exitAt: Date, w: ExitWindow): string | null {
  if (exitAt < w.earliest) return 'La salida debe ser después del ingreso.';
  if (exitAt > w.latest)
    return 'Esa hora no es válida: está en el futuro, después de su siguiente marcación o supera el máximo de una jornada.';
  return null;
}

export function workedDayProblem(inAt: Date, outAt: Date, now: Date, maxSessionHours: number): string | null {
  if (outAt <= inAt) return 'La salida debe ser después del ingreso.';
  if (outAt > now) return 'La salida no puede estar en el futuro.';
  if (outAt.getTime() - inAt.getTime() > maxSessionHours * 3_600_000) {
    return `Una jornada no puede superar ${maxSessionHours} horas.`;
  }
  return null;
}

export interface CreditWindow {
  inAt: Date;
  earliest: Date;
  latest: Date;
  suggested: string | null;
}

/** Desde qué hora puede contar un ingreso: antes de la marca, después de la marca anterior y no antes del inicio del turno. */
export function creditWindow(
  mark: { type: 'IN' | 'OUT'; timestamp: Date; isLate?: boolean },
  previous: { timestamp: Date } | null,
  shiftStart: Date | null,
  maxSessionHours: number,
): CreditWindow | null {
  if (mark.type !== 'IN' || !mark.isLate || !shiftStart) return null;
  const latest = new Date(mark.timestamp.getTime() - 60_000);
  const floors = [mark.timestamp.getTime() - maxSessionHours * 3_600_000];
  if (previous) floors.push(previous.timestamp.getTime() + 60_000);
  if (shiftStart) floors.push(shiftStart.getTime());
  const earliest = new Date(Math.max(...floors));
  if (latest < earliest) return null;
  const suggested = shiftStart && shiftStart >= earliest && shiftStart <= latest ? shiftStart.toISOString() : null;
  return { inAt: mark.timestamp, earliest, latest, suggested };
}

export function creditProblem(at: Date, w: CreditWindow): string | null {
  if (at > w.latest) return 'La hora de llegada debe ser antes de la hora en que marcó.';
  if (at < w.earliest) return 'Esa hora no es válida: es antes del inicio del turno o de su marcación anterior.';
  return null;
}
