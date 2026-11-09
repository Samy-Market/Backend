import { DateTime } from 'luxon';
import { DayPlan, DayPlanView, toPlanView } from '../../schedules/domain/schedule-plan';
import { MarkRecord, MarkType, nextMarkType, parseHHmm, summarizeByDay, sumWorkedMinutes } from './attendance-rules';

export type PresenceStatus = 'INSIDE' | 'OUTSIDE' | 'NOT_MARKED';

export interface Presence {
  status: PresenceStatus;
  nextType: MarkType;
  lastMark: { id: string; type: MarkType; timestamp: Date } | null;
  firstInToday: Date | null;
  preEntryMinutesToday: number;
  countingFrom: Date | null;
  workedMinutesToday: number;
  openSession: boolean;
  isLate: boolean;
  lateMinutes: number;
  missingAfterStart: boolean;
  todayPlan: DayPlanView;
}

export interface PresenceInput {
  records: MarkRecord[];
  last: (Pick<MarkRecord, 'type' | 'timestamp'> & { id: string }) | null;
  plan: DayPlan;
  now: Date;
  zone: string;
  maxSessionHours: number;
}

export function statusWindowStart(now: Date, zone: string, maxSessionHours: number): Date {
  return DateTime.fromJSDate(now, { zone }).startOf('day').minus({ hours: maxSessionHours }).toJSDate();
}

export function presenceOf({ records, last, plan, now, zone, maxSessionHours }: PresenceInput): Presence {
  const shift = plan.kind === 'WORK' ? plan.shift : null;
  const today = DateTime.fromJSDate(now, { zone });
  const days = summarizeByDay(records, zone, now, maxSessionHours);
  const todaySummary = days.find((d) => d.date === today.toISODate());

  const nextType = nextMarkType(last, now, maxSessionHours);
  const inside = nextType === 'OUT';
  const hasToday = !!todaySummary && todaySummary.records.length > 0;
  const status: PresenceStatus = inside ? 'INSIDE' : hasToday ? 'OUTSIDE' : 'NOT_MARKED';

  const currentOpen = inside
    ? days.flatMap((d) => d.sessions).find((s) => s.open && !s.stale && s.in < today.startOf('day').toJSDate())
    : undefined;
  const running = inside ? days.flatMap((d) => d.sessions).find((s) => s.open && !s.stale) : undefined;
  const workedMinutesToday = (todaySummary?.workedMinutes ?? 0) + (currentOpen ? sumWorkedMinutes([currentOpen]) : 0);

  let missingAfterStart = false;
  if (shift && status === 'NOT_MARKED') {
    const { hour, minute } = parseHHmm(shift.startTime);
    const limit = today.set({ hour, minute, second: 0, millisecond: 0 }).plus({ minutes: shift.toleranceMinutes });
    missingAfterStart = today > limit;
  }

  return {
    status,
    nextType,
    lastMark: last ? { id: last.id, type: last.type, timestamp: last.timestamp } : null,
    firstInToday: todaySummary?.firstIn ?? null,
    preEntryMinutesToday: todaySummary?.preEntryMinutes ?? 0,
    countingFrom: running?.countedFrom ?? null,
    workedMinutesToday,
    openSession: inside || !!todaySummary?.openSession,
    isLate: todaySummary?.isLate ?? false,
    lateMinutes: todaySummary?.lateMinutes ?? 0,
    missingAfterStart,
    todayPlan: toPlanView(plan),
  };
}
