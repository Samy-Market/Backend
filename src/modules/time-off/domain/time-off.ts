import { findCovering, rangesOverlap } from '../../../shared/domain/calendar';

export const LEAVE_KINDS = ['VACATION', 'MEDICAL', 'PERSONAL'] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];
export const LEAVE_LABEL: Record<LeaveKind, string> = {
  VACATION: 'Vacaciones',
  MEDICAL: 'Permiso médico',
  PERSONAL: 'Permiso personal',
};

export interface LeaveRule {
  id: string;
  kind: LeaveKind;
  startDate: string;
  endDate: string;
}

export type DayOff = { kind: 'HOLIDAY'; label: string } | { kind: 'LEAVE'; leaveKind: LeaveKind; label: string };

export interface TimeOff {
  holidays: Map<string, string>;
  leaves: LeaveRule[];
}

export const NO_TIME_OFF: TimeOff = { holidays: new Map(), leaves: [] };

export function dayOffFor(date: string, t: TimeOff): DayOff | null {
  const holiday = t.holidays.get(date);
  if (holiday) return { kind: 'HOLIDAY', label: `Feriado: ${holiday}` };
  const leave = findCovering(t.leaves, date);
  return leave ? { kind: 'LEAVE', leaveKind: leave.kind, label: LEAVE_LABEL[leave.kind] } : null;
}

export function overlappingLeaves<T extends LeaveRule>(existing: T[], startDate: string, endDate: string): T[] {
  return existing.filter((l) => rangesOverlap(l, { startDate, endDate }));
}

export function leaveStatus(l: { startDate: string; endDate: string }, today: string): 'PAST' | 'CURRENT' | 'UPCOMING' {
  return l.startDate > today ? 'UPCOMING' : l.endDate < today ? 'PAST' : 'CURRENT';
}

export type CancelAction = { kind: 'delete' } | { kind: 'end'; endDate: string } | { kind: 'none'; reason: string };

export function cancelLeaveAction(l: { startDate: string; endDate: string }, today: string, yesterday: string): CancelAction {
  if (l.startDate >= today) return { kind: 'delete' };
  if (l.endDate < today) return { kind: 'none', reason: 'Ese permiso ya terminó y forma parte del historial.' };
  return { kind: 'end', endDate: yesterday };
}
