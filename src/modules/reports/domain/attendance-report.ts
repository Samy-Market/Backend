/**
 * Cálculo puro del reporte de asistencia de un empleado en un rango:
 * días trabajados, ausencias, atrasos y horas, con la sede de cada día.
 */
import { DayPlanView, AssignmentRule, planForRange, toPlanView } from '../../schedules/domain/schedule-plan';
import { dayKeyInZone } from '../../../shared/domain/calendar';
import { siteForDay, TransferRule } from '../../sites/domain/site-rules';
import { DaySummary, MarkRecord, summarizeByDay } from '../../attendance/domain/attendance-rules';

export const MAX_REPORT_DAYS = 366;

type SiteRef = { id: string; name: string };

export interface ReportDay {
  date: string;
  firstIn: Date | null;
  lastOut: Date | null;
  workedMinutes: number;
  isLate: boolean;
  lateMinutes: number;
  openSession: boolean;
  /** Turno que le tocaba ese día según su horario (o descanso / sin horario). */
  plan: DayPlanView;
  /** Día de trabajo ya pasado sin ninguna marcación. */
  absent: boolean;
  /** Sede donde trabajó (la de su primera marcación) o, si no marcó, donde le tocaba. */
  site: SiteRef;
  marks: { id: string; type: 'IN' | 'OUT'; timestamp: Date; isLate: boolean; lateMinutes: number }[];
}

export interface ReportTotals {
  workedMinutes: number;
  daysWorked: number;
  lateDays: number;
  lateMinutes: number;
  openSessions: number;
  marks: number;
  /** Días que tenía turno dentro del rango. */
  scheduledDays: number;
  absences: number;
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
}

export interface AttendanceReport {
  from: string;
  to: string;
  timezone: string;
  generatedAt: Date;
  totals: ReportTotals & { employees: number };
  /** Sede filtrada (null = todas). */
  site: SiteRef | null;
  employees: EmployeeReport[];
}

export type ReportMark = Required<MarkRecord> & { siteId: string | null };

export interface EmployeeReportInput {
  employee: ReportEmployee;
  /** Marcas desde el inicio del rango (incluye la salida de jornadas que cruzan el final). */
  records: ReportMark[];
  assignments: AssignmentRule[];
  transfers: TransferRule[];
  siteNames: Map<string, string>;
  fromKey: string;
  toKey: string;
  /** Límites exactos [from, to) para las marcas listadas. */
  from: Date;
  to: Date;
  today: string;
  now: Date;
  /** Filtro de sede (opcional). */
  siteId?: string;
  zone: string;
  maxSessionHours: number;
}

export function employeeReport(i: EmployeeReportInput): EmployeeReport {
  const siteRef = (id: string): SiteRef => ({ id, name: i.siteNames.get(id) ?? '—' });
  const summaries = summarizeByDay(i.records, i.zone, i.now, i.maxSessionHours).filter((d) => d.date >= i.fromKey && d.date <= i.toKey);
  const byDay = new Map(summaries.map((d) => [d.date, d]));
  const plans = planForRange(i.assignments, i.fromKey, i.toKey);

  // Sede de cada día: la de la primera marcación; si no marcó, la que le tocaba (base o traslado).
  const markedSite = new Map<string, string>();
  for (const r of i.records) {
    const k = dayKeyInZone(r.timestamp, i.zone);
    if (r.siteId && !markedSite.has(k)) markedSite.set(k, r.siteId);
  }
  const plannedSite = (date: string) => siteForDay(i.employee.siteId, i.transfers, date).siteId;
  const daySite = (date: string) => markedSite.get(date) ?? plannedSite(date);
  const inSite = (date: string) => !i.siteId || daySite(date) === i.siteId;

  // Días con marcaciones + días de trabajo ya pasados sin marcaciones (ausencias).
  const days = plans
    .filter((p) => byDay.has(p.date) || (p.kind === 'WORK' && p.date < i.today))
    .filter((p) => inSite(p.date))
    .map((p) =>
      toReportDay(byDay.get(p.date) ?? emptySummary(p.date), i.from, i.to, toPlanView(p), !byDay.has(p.date), siteRef(daySite(p.date))),
    );

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
      scheduledDays: plans.filter((p) => p.kind === 'WORK' && (!i.siteId || plannedSite(p.date) === i.siteId)).length,
    },
    days,
  };
}

/** Suma los totales de varios empleados. */
export function sumTotals(reports: EmployeeReport[]): ReportTotals & { employees: number } {
  const all = reports.map((r) => r.totals);
  const sum = (k: keyof ReportTotals) => all.reduce((a, t) => a + t[k], 0);
  return {
    employees: reports.length,
    workedMinutes: sum('workedMinutes'),
    daysWorked: sum('daysWorked'),
    lateDays: sum('lateDays'),
    lateMinutes: sum('lateMinutes'),
    openSessions: sum('openSessions'),
    marks: sum('marks'),
    scheduledDays: sum('scheduledDays'),
    absences: sum('absences'),
  };
}

function toReportDay(d: DaySummary, from: Date, to: Date, plan: DayPlanView, absent: boolean, site: SiteRef): ReportDay {
  return {
    date: d.date,
    firstIn: d.firstIn,
    lastOut: d.lastOut,
    workedMinutes: d.workedMinutes,
    isLate: d.isLate,
    lateMinutes: d.lateMinutes,
    openSession: d.openSession,
    plan,
    absent,
    site,
    marks: d.records
      .filter((r) => r.timestamp >= from && r.timestamp < to)
      .map((r) => ({ id: r.id!, type: r.type, timestamp: r.timestamp, isLate: !!r.isLate, lateMinutes: r.lateMinutes ?? 0 })),
  };
}

function totalsOf(days: ReportDay[]): Omit<ReportTotals, 'scheduledDays'> {
  return {
    workedMinutes: days.reduce((a, d) => a + d.workedMinutes, 0),
    daysWorked: days.filter((d) => d.firstIn).length,
    lateDays: days.filter((d) => d.isLate).length,
    lateMinutes: days.reduce((a, d) => a + (d.isLate ? d.lateMinutes : 0), 0),
    openSessions: days.filter((d) => d.openSession).length,
    marks: days.reduce((a, d) => a + d.marks.length, 0),
    absences: days.filter((d) => d.absent).length,
  };
}

function emptySummary(date: string): DaySummary {
  return {
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
}
