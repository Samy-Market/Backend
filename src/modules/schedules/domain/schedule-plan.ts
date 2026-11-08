/**
 * Reglas puras de los horarios rotativos.
 * - Un Schedule es una plantilla semanal: para cada día (1 = lunes … 7 = domingo) un turno o descanso.
 * - Una asignación aplica una plantilla a un empleado entre dos fechas locales (inclusivas).
 */
import { DayRange, addDays, eachDay, findCovering, weekdayOf } from '../../../shared/domain/calendar';
import { BusinessRuleError } from '../../../shared/domain/errors';
import { Shift } from '../../shifts/domain/shift';

export interface ScheduleRule {
  id: string;
  name: string;
  /** weekday (1–7) → turno, o null si es descanso. Días ausentes = descanso. */
  days: { weekday: number; shift: Shift | null }[];
}

export interface AssignmentRule extends DayRange {
  id: string;
  schedule: ScheduleRule;
}

export type DayPlan =
  | { kind: 'WORK'; date: string; shift: Shift; scheduleId: string; scheduleName: string; assignmentId: string }
  | { kind: 'REST'; date: string; scheduleId: string; scheduleName: string; assignmentId: string }
  | { kind: 'UNASSIGNED'; date: string };

/** Forma compacta del plan de un día para la API. */
export interface DayPlanView {
  date: string;
  kind: DayPlan['kind'];
  shift: Shift | null;
  scheduleName: string | null;
}

export type AssignmentStatus = 'PAST' | 'CURRENT' | 'UPCOMING';

/** Qué le toca a un empleado un día concreto: trabajar (con qué turno), descansar o nada asignado. */
export function planForDay(assignments: AssignmentRule[], dayKey: string): DayPlan {
  const a = findCovering(assignments, dayKey);
  if (!a) return { kind: 'UNASSIGNED', date: dayKey };
  const day = a.schedule.days.find((d) => d.weekday === weekdayOf(dayKey));
  const base = { date: dayKey, scheduleId: a.schedule.id, scheduleName: a.schedule.name, assignmentId: a.id };
  return day?.shift ? { kind: 'WORK', shift: day.shift, ...base } : { kind: 'REST', ...base };
}

export function planForRange(assignments: AssignmentRule[], fromKey: string, toKey: string): DayPlan[] {
  return eachDay(fromKey, toKey).map((d) => planForDay(assignments, d));
}

export function toPlanView(p: DayPlan): DayPlanView {
  return {
    date: p.date,
    kind: p.kind,
    shift: p.kind === 'WORK' ? p.shift : null,
    scheduleName: p.kind === 'UNASSIGNED' ? null : p.scheduleName,
  };
}

/**
 * Al asignar un horario nuevo desde `newStart`, la asignación previa que lo cubre se
 * recorta para terminar el día anterior (rotación). Devuelve la nueva fecha de fin, o
 * null si no corresponde recortar (ya terminó antes, o empieza después: eso es un choque).
 */
export function trimmedEndFor(previous: DayRange, newStart: string): string | null {
  if (previous.startDate >= newStart) return null;
  if (previous.endDate !== null && previous.endDate < newStart) return null;
  return addDays(newStart, -1);
}

export function assignmentStatus(range: DayRange, today: string): AssignmentStatus {
  if (range.startDate > today) return 'UPCOMING';
  return range.endDate !== null && range.endDate < today ? 'PAST' : 'CURRENT';
}

type WeekDay = { weekday: number; shiftId: string | null };

/** La plantilla debe definir los 7 días de la semana, cada uno una sola vez. */
export function assertSevenDays(days: WeekDay[]) {
  if (new Set(days.map((d) => d.weekday)).size !== 7) {
    throw new BusinessRuleError('Define cada día de la semana una sola vez (lunes a domingo).');
  }
}

/** Una plantilla sin ningún día de trabajo no tiene sentido. */
export function assertHasWorkDay(days: WeekDay[]) {
  if (!days.some((d) => d.shiftId)) throw new BusinessRuleError('El horario debe tener al menos un día de trabajo.');
}
