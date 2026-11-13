import { DateTime } from 'luxon';
import { DayPlanView, AssignmentRule, planForRange, scheduledSoFar, toPlanView } from '../../schedules/domain/schedule-plan';
import { dayKeyInZone } from '../../../shared/domain/calendar';
import { siteForDay, TransferRule } from '../../sites/domain/site-rules';
import { DaySummary, MarkRecord, parseHHmm, summarizeByDay } from '../../attendance/domain/attendance-rules';
import { DayOff, dayOffFor, TimeOff } from '../../time-off/domain/time-off';

export const MAX_REPORT_DAYS = 366;

type SiteRef = { id: string; name: string };

export interface ReportDay {
  date: string;
  firstIn: Date | null;
  preEntryMinutes: number;
  lastOut: Date | null;
  workedMinutes: number;
  overtimeMinutes: number;
  /** Falso si el atraso tiene una justificación aprobada: así no suma en los totales. */
  isLate: boolean;
  lateMinutes: number;
  lateJustified: boolean;
  openSession: boolean;
  plan: DayPlanView;
  /** Falso si la ausencia tiene una justificación aprobada: así no suma en los totales. */
  absent: boolean;
  absenceJustified: boolean;
  dayOff: DayOff | null;
  site: SiteRef;
  marks: {
    id: string;
    type: 'IN' | 'OUT';
    timestamp: Date;
    isLate: boolean;
    lateMinutes: number;
    preEntryMinutes: number;
    justified: boolean;
    manual: boolean;
    creditedFrom: Date | null;
  }[];
}

export interface ReportTotals {
  workedMinutes: number;
  overtimeMinutes: number;
  daysWorked: number;
  lateDays: number;
  lateMinutes: number;
  justifiedLateDays: number;
  justifiedLateMinutes: number;
  preEntryDays: number;
  preEntryMinutes: number;
  openSessions: number;
  marks: number;
  scheduledDays: number;
  absences: number;
  justifiedAbsences: number;
  holidays: number;
  leaveDays: number;
}

export interface ReportEmployee {
  id: string;
  fullName: string;
  documentId: string;
  position: string;
  active: boolean;
  siteId: string;
}

export interface EmployeeReport {
  employee: {
    id: string;
    fullName: string;
    documentId: string;
    position: string;
    active: boolean;
    schedules: string[];
    homeSite: SiteRef;
  };
  totals: ReportTotals;
  days: ReportDay[];
  calendar: DayPlanView[];
}

export interface AttendanceReport {
  from: string;
  to: string;
  timezone: string;
  generatedAt: Date;
  totals: ReportTotals & { employees: number };
  site: SiteRef | null;
  employees: EmployeeReport[];
}

export type ReportMark = Required<Omit<MarkRecord, 'creditedFrom'>> & {
  creditedFrom?: Date | null;
  siteId: string | null;
  justified: boolean;
  manual?: boolean;
};

export interface EmployeeReportInput {
  employee: ReportEmployee;
  records: ReportMark[];
  assignments: AssignmentRule[];
  transfers: TransferRule[];
  justifiedAbsences?: Set<string>;
  timeOff?: TimeOff;
  siteNames: Map<string, string>;
  fromKey: string;
  toKey: string;
  from: Date;
  to: Date;
  today: string;
  now: Date;
  siteId?: string;
  zone: string;
  maxSessionHours: number;
}

export function employeeReport(i: EmployeeReportInput): EmployeeReport {
  const siteRef = (id: string): SiteRef => ({ id, name: i.siteNames.get(id) ?? '—' });
  const summaries = summarizeByDay(i.records, i.zone, i.now, i.maxSessionHours).filter((d) => d.date >= i.fromKey && d.date <= i.toKey);
  const byDay = new Map(summaries.map((d) => [d.date, d]));
  const justified = new Set(i.records.filter((r) => r.justified).map((r) => r.id));
  const manual = new Set(i.records.filter((r) => r.manual).map((r) => r.id));
  const off = (date: string) => (i.timeOff ? dayOffFor(date, i.timeOff) : null);
  const plans = planForRange(i.assignments, i.fromKey, i.toKey);

  const markedSite = new Map<string, string>();
  for (const r of i.records) {
    const k = dayKeyInZone(r.timestamp, i.zone);
    if (r.siteId && !markedSite.has(k)) markedSite.set(k, r.siteId);
  }
  const plannedSite = (date: string) => siteForDay(i.employee.siteId, i.transfers, date).siteId;
  const daySite = (date: string) => markedSite.get(date) ?? plannedSite(date);
  const inSite = (date: string) => !i.siteId || daySite(date) === i.siteId;

  const days = plans
    .filter((p) => byDay.has(p.date) || (p.kind === 'WORK' && p.date < i.today))
    .filter((p) => inSite(p.date))
    .map((p) =>
      toReportDay(
        byDay.get(p.date) ?? emptySummary(p.date),
        i.from,
        i.to,
        toPlanView(p),
        !byDay.has(p.date) && !i.justifiedAbsences?.has(p.date) && !off(p.date),
        !byDay.has(p.date) && !!i.justifiedAbsences?.has(p.date) && !off(p.date),
        off(p.date),
        siteRef(daySite(p.date)),
        i.zone,
        justified,
        manual,
      ),
    );
  const calendar = plans.filter((p) => p.date <= i.today && inSite(p.date)).map(toPlanView);

  const e = i.employee;
  return {
    employee: {
      id: e.id,
      fullName: e.fullName,
      documentId: e.documentId,
      position: e.position,
      active: e.active,
      schedules: [...new Set(plans.flatMap((p) => (p.kind === 'UNASSIGNED' ? [] : [p.scheduleName])))],
      homeSite: siteRef(e.siteId),
    },
    totals: {
      ...totalsOf(days),
      scheduledDays: plans.filter(
        (p) =>
          p.kind === 'WORK' &&
          scheduledSoFar(p.date, i.today, byDay.has(p.date)) &&
          !off(p.date) &&
          (!i.siteId || plannedSite(p.date) === i.siteId),
      ).length,
    },
    days,
    calendar,
  };
}

export function overtimeOf(
  day: Pick<ReportDay, 'date' | 'lastOut' | 'workedMinutes'>,
  plan: Pick<DayPlanView, 'kind' | 'shift'>,
  zone: string,
): number {
  if (plan.kind === 'REST') return day.workedMinutes;
  if (plan.kind !== 'WORK' || !plan.shift || !day.lastOut) return 0;
  const start = parseHHmm(plan.shift.startTime);
  const end = parseHHmm(plan.shift.endTime);
  let shiftEnd = DateTime.fromISO(day.date, { zone }).set({ hour: end.hour, minute: end.minute });
  if (end.hour * 60 + end.minute <= start.hour * 60 + start.minute) shiftEnd = shiftEnd.plus({ days: 1 });
  const after = Math.floor((day.lastOut.getTime() - shiftEnd.toMillis()) / 60_000);
  return Math.min(day.workedMinutes, Math.max(0, after));
}

export function sumTotals(reports: EmployeeReport[]): ReportTotals & { employees: number } {
  const all = reports.map((r) => r.totals);
  const sum = (k: keyof ReportTotals) => all.reduce((a, t) => a + t[k], 0);
  return {
    employees: reports.length,
    workedMinutes: sum('workedMinutes'),
    overtimeMinutes: sum('overtimeMinutes'),
    daysWorked: sum('daysWorked'),
    lateDays: sum('lateDays'),
    lateMinutes: sum('lateMinutes'),
    justifiedLateDays: sum('justifiedLateDays'),
    justifiedLateMinutes: sum('justifiedLateMinutes'),
    preEntryDays: sum('preEntryDays'),
    preEntryMinutes: sum('preEntryMinutes'),
    openSessions: sum('openSessions'),
    marks: sum('marks'),
    scheduledDays: sum('scheduledDays'),
    absences: sum('absences'),
    justifiedAbsences: sum('justifiedAbsences'),
    holidays: sum('holidays'),
    leaveDays: sum('leaveDays'),
  };
}

function toReportDay(
  d: DaySummary,
  from: Date,
  to: Date,
  plan: DayPlanView,
  absent: boolean,
  absenceJustified: boolean,
  dayOff: DayOff | null,
  site: SiteRef,
  zone: string,
  justified: Set<string>,
  manual: Set<string>,
): ReportDay {
  const lateJustified = d.isLate && d.records.some((r) => r.type === 'IN' && r.isLate && justified.has(r.id!));
  return {
    date: d.date,
    firstIn: d.firstIn,
    preEntryMinutes: d.preEntryMinutes,
    lastOut: d.lastOut,
    workedMinutes: d.workedMinutes,
    overtimeMinutes: dayOff?.kind === 'HOLIDAY' ? d.workedMinutes : overtimeOf(d, plan, zone),
    isLate: d.isLate && !lateJustified && !dayOff,
    lateMinutes: d.lateMinutes,
    lateJustified,
    openSession: d.openSession,
    plan,
    absent,
    absenceJustified,
    dayOff,
    site,
    marks: d.records
      .filter((r) => r.timestamp >= from && r.timestamp < to)
      .map((r) => ({
        id: r.id!,
        type: r.type,
        timestamp: r.timestamp,
        isLate: !!r.isLate,
        lateMinutes: r.lateMinutes ?? 0,
        preEntryMinutes: r.preEntryMinutes ?? 0,
        justified: justified.has(r.id!),
        manual: manual.has(r.id!),
        creditedFrom: r.creditedFrom ?? null,
      })),
  };
}

function totalsOf(days: ReportDay[]): Omit<ReportTotals, 'scheduledDays'> {
  return {
    workedMinutes: days.reduce((a, d) => a + d.workedMinutes, 0),
    overtimeMinutes: days.reduce((a, d) => a + d.overtimeMinutes, 0),
    daysWorked: days.filter((d) => d.firstIn).length,
    lateDays: days.filter((d) => d.isLate).length,
    lateMinutes: days.reduce((a, d) => a + (d.isLate ? d.lateMinutes : 0), 0),
    justifiedLateDays: days.filter((d) => d.lateJustified).length,
    justifiedLateMinutes: days.reduce((a, d) => a + (d.lateJustified ? d.lateMinutes : 0), 0),
    preEntryDays: days.filter((d) => d.preEntryMinutes > 0).length,
    preEntryMinutes: days.reduce((a, d) => a + d.preEntryMinutes, 0),
    openSessions: days.filter((d) => d.openSession).length,
    marks: days.reduce((a, d) => a + d.marks.length, 0),
    absences: days.filter((d) => d.absent).length,
    justifiedAbsences: days.filter((d) => d.absenceJustified).length,
    holidays: days.filter((d) => d.dayOff?.kind === 'HOLIDAY').length,
    leaveDays: days.filter((d) => d.dayOff?.kind === 'LEAVE').length,
  };
}

function emptySummary(date: string): DaySummary {
  return {
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
}
