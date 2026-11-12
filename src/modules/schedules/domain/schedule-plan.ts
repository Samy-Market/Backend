import { DayRange, addDays, eachDay, findCovering, weekdayOf } from '../../../shared/domain/calendar';
import { BusinessRuleError } from '../../../shared/domain/errors';
import { Shift } from '../../shifts/domain/shift';

export interface ScheduleRule {
  id: string;
  name: string;
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

export interface DayPlanView {
  date: string;
  kind: DayPlan['kind'];
  shift: Shift | null;
  scheduleName: string | null;
}

export type AssignmentStatus = 'PAST' | 'CURRENT' | 'UPCOMING';

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

export function assertSevenDays(days: WeekDay[]) {
  if (new Set(days.map((d) => d.weekday)).size !== 7) {
    throw new BusinessRuleError('Define cada día de la semana una sola vez (lunes a domingo).');
  }
}

export function assertHasWorkDay(days: WeekDay[]) {
  if (!days.some((d) => d.shiftId)) throw new BusinessRuleError('El horario debe tener al menos un día de trabajo.');
}

export interface ScheduleUsage {
  current: number;
  upcoming: number;
  past: number;
}

export function scheduleDeletionBlocker(u: ScheduleUsage): string | null {
  const active = u.current + u.upcoming;
  if (active) {
    return `Este horario está asignado a ${active} ${active === 1 ? 'empleado' : 'empleados'} (hoy o más adelante). Quítalos primero con "Ver asignados".`;
  }
  if (u.past) return 'Este horario ya se usó y forma parte del historial de asistencia. En lugar de eliminarlo, desactívalo.';
  return null;
}

export type UnassignAction = { kind: 'delete' } | { kind: 'end'; endDate: string } | { kind: 'none'; reason: string };

export function unassignAction(a: DayRange, today: string): UnassignAction {
  if (a.endDate && a.endDate < today) return { kind: 'none', reason: 'Esta asignación ya terminó.' };
  if (a.startDate >= today) return { kind: 'delete' };
  if (a.endDate === today) return { kind: 'none', reason: 'Esta asignación ya termina hoy.' };
  return { kind: 'end', endDate: today };
}

type Placed = DayRange & { id: string; schedule: { id: string; name: string }; trimmed?: boolean; originalEndDate?: string | null };

export type RestorePlan =
  | { kind: 'extend'; id: string; endDate: string | null }
  | { kind: 'create'; scheduleId: string; startDate: string; endDate: string | null };

export interface UnassignOutcome {
  action: UnassignAction;
  gap: { from: string; to: string | null } | null;
  previous: { id: string; schedule: { id: string; name: string }; until: string | null } | null;
  restore: RestorePlan | null;
}

export function unassignOutcome(a: Placed, others: Placed[], today: string): UnassignOutcome {
  const action = unassignAction(a, today);
  if (action.kind === 'none') return { action, gap: null, previous: null, restore: null };
  const gap = action.kind === 'delete' ? { from: a.startDate, to: a.endDate } : { from: addDays(today, 1), to: a.endDate };
  const prev = others.find((o) => o.id !== a.id && o.endDate === addDays(a.startDate, -1)) ?? null;
  if (!prev) return { action, gap, previous: null, restore: null };
  const until = earlierEnd(prev.trimmed ? (prev.originalEndDate ?? null) : gap.to, gap.to);
  if (until !== null && until < gap.from) return { action, gap, previous: null, restore: null };
  const previous = { id: prev.id, schedule: prev.schedule, until };
  const restore: RestorePlan =
    action.kind === 'delete'
      ? { kind: 'extend', id: prev.id, endDate: until }
      : { kind: 'create', scheduleId: prev.schedule.id, startDate: gap.from, endDate: until };
  return { action, gap, previous, restore };
}

function earlierEnd(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a < b ? a : b;
}

export function scheduledSoFar(date: string, today: string, markedThatDay: boolean): boolean {
  return date < today || (date === today && markedThatDay);
}
