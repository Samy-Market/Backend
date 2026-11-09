import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { APP_TIMEZONE, MAX_SESSION_HOURS } from '../../../config/app.config';
import { Clock } from '../../../shared/application/ports/clock';
import { RealtimeNotifier } from '../../../shared/application/ports/realtime-notifier';
import { UnitOfWork } from '../../../shared/application/ports/unit-of-work';
import { addDays, weekOf } from '../../../shared/domain/calendar';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../shared/domain/errors';
import { SchedulePlanner } from '../../schedules/application/schedule-planner';
import { toPlanView } from '../../schedules/domain/schedule-plan';
import { SiteLocator } from '../../sites/application/site-locator';
import { toDaySiteView } from '../../sites/domain/site-rules';
import {
  computeLateness,
  computePreEntry,
  DaySummary,
  MarkType,
  nextMarkType,
  summarizeByDay,
  validateRequestedType,
} from '../domain/attendance-rules';
import { Presence, presenceOf, PresenceStatus, statusWindowStart } from '../domain/presence';
import { AttendanceRoster } from './ports/attendance-roster';
import { Mark, MarkRepository } from './ports/mark.repository';

/** Un mes de historial no se pide más allá de ~2 meses de horario. */
const MAX_SCHEDULE_DAYS = 62;

/** Casos de uso de las marcaciones: marcar, estado de hoy, historial y horario propio. */
@Injectable()
export class AttendanceService {
  constructor(
    private marks: MarkRepository,
    private roster: AttendanceRoster,
    private planner: SchedulePlanner,
    private locator: SiteLocator,
    private uow: UnitOfWork,
    private clock: Clock,
    private realtime: RealtimeNotifier,
  ) {}

  /** Marca ingreso/salida. El tipo y la hora los decide el servidor. */
  async mark(employeeIdOrNull: string | null, expectedType?: MarkType) {
    const employeeId = requireEmployee(employeeIdOrNull);

    // La clave de bloqueo serializa las marcaciones del mismo empleado (doble toque, dos pestañas).
    const { attendance, employee } = await this.uow.run(
      async (tx) => {
        const employee = await this.roster.find(employeeId, tx);
        if (!employee) throw new NotFoundError('Empleado no encontrado.');
        if (!employee.active) throw new ForbiddenError('Tu ficha de empleado está inactiva.');

        const now = this.clock.now();
        const type = nextMarkType(await this.marks.last(employeeId, tx), now, MAX_SESSION_HOURS);
        const error = validateRequestedType(type, expectedType);
        if (error) throw new ConflictError(error);

        const today = this.clock.today();
        let entry = { isLate: false, lateMinutes: 0, preEntryMinutes: 0 };
        // Solo el primer ingreso del día puede contar como atraso o preingreso, medido contra el turno que le toca HOY.
        if (type === 'IN') {
          const dayStart = DateTime.fromJSDate(now, { zone: APP_TIMEZONE }).startOf('day').toJSDate();
          if ((await this.marks.countIns(employeeId, dayStart, now, tx)) === 0) {
            const plan = await this.planner.planForEmployee(employeeId, today);
            const shift = plan.kind === 'WORK' ? plan.shift : null;
            entry = { ...computeLateness(now, shift, APP_TIMEZONE), ...computePreEntry(now, shift, APP_TIMEZONE) };
          }
        }

        // La marcación queda en la sede donde trabaja hoy (base o traslado vigente).
        const site = (await this.locator.sitesForDay([employee], today)).get(employee.id)!;
        const attendance = await this.marks.create({ employeeId, type, timestamp: now, ...entry, siteId: site.siteId }, tx);
        return { attendance, employee };
      },
      { lockKey: employeeId },
    );

    const status = await this.employeeStatus(employeeId);
    const who = { id: employee.id, fullName: employee.fullName, position: employee.position };

    // Aviso en vivo, ya confirmada la transacción.
    this.realtime.attendanceMarked(employeeId, {
      attendanceId: attendance.id,
      employee: who,
      type: attendance.type,
      timestamp: attendance.timestamp,
      isLate: attendance.isLate,
      lateMinutes: attendance.lateMinutes,
      preEntryMinutes: attendance.preEntryMinutes,
      status,
    });
    return { attendance, employee: who, status };
  }

  /** Estado actual del empleado (pantalla Marcar y dashboard). */
  async employeeStatus(employeeId: string) {
    const now = this.clock.now();
    const today = this.clock.today();
    const employee = await this.roster.find(employeeId);
    if (!employee) throw new NotFoundError('Empleado no encontrado.');
    const [plan, todaySite, records, last] = await Promise.all([
      this.planner.planForEmployee(employeeId, today),
      this.locator.daySiteView(employee, today),
      this.marks.between(employeeId, statusWindowStart(now, APP_TIMEZONE, MAX_SESSION_HOURS)),
      this.marks.last(employeeId),
    ]);
    return { ...this.presence(records, last, plan, now), todaySite };
  }

  /** Estado de hoy de todos los empleados activos (dashboard de supervisión). */
  async today() {
    const now = this.clock.now();
    const today = this.clock.today();
    const employees = await this.roster.activeWithMarksSince(statusWindowStart(now, APP_TIMEZONE, MAX_SESSION_HOURS));
    const ids = employees.map((e) => e.id);
    const [lastByEmployee, plans, daySites, siteNames] = await Promise.all([
      this.marks.lastByEmployee(),
      this.planner.plansForDay(ids, today),
      this.locator.sitesForDay(employees, today),
      this.locator.siteNames(),
    ]);

    const items = employees.map((e) => ({
      employee: { id: e.id, fullName: e.fullName, position: e.position, documentId: e.documentId },
      ...this.presence(e.marks, lastByEmployee.get(e.id) ?? null, plans.get(e.id)!, now),
      todaySite: toDaySiteView(daySites.get(e.id)!, e.siteId, siteNames),
    }));

    const count = (s: PresenceStatus) => items.filter((i) => i.status === s).length;
    return {
      date: today,
      generatedAt: now,
      totals: {
        employees: items.length,
        inside: count('INSIDE'),
        outside: count('OUTSIDE'),
        notMarked: items.filter((i) => i.status === 'NOT_MARKED' && i.todayPlan.kind !== 'REST').length,
        late: items.filter((i) => i.isLate).length,
        resting: items.filter((i) => i.todayPlan.kind === 'REST').length,
        unassigned: items.filter((i) => i.todayPlan.kind === 'UNASSIGNED').length,
      },
      items,
    };
  }

  /** Historial del mes (hora local) con resumen por día y ausencias. */
  async myMonth(employeeIdOrNull: string | null, month?: string) {
    const employeeId = requireEmployee(employeeIdOrNull);
    const now = this.clock.now();
    const today = this.clock.today();
    const base = month ? DateTime.fromFormat(month, 'yyyy-MM', { zone: APP_TIMEZONE }) : DateTime.fromJSDate(now, { zone: APP_TIMEZONE });
    const from = base.startOf('month');
    const to = from.plus({ months: 1 });

    const [summaries, plans] = await Promise.all([
      this.summarize(employeeId, from.toJSDate(), to.toJSDate(), now),
      this.planner.rangeForEmployee(employeeId, from.toISODate()!, to.minus({ days: 1 }).toISODate()!),
    ]);
    const byDay = new Map(summaries.map((d) => [d.date, d]));

    // Días con marcaciones + días de trabajo pasados sin ninguna marca (ausencias).
    const days = plans
      .filter((p) => byDay.has(p.date) || (p.kind === 'WORK' && p.date < today))
      .map((p) => {
        const s = byDay.get(p.date);
        return { ...(s ?? emptyDay(p.date)), plan: toPlanView(p), absent: !s && p.kind === 'WORK' && p.date < today };
      });

    return {
      month: from.toFormat('yyyy-MM'),
      totalWorkedMinutes: days.reduce((a, d) => a + d.workedMinutes, 0),
      daysWorked: days.filter((d) => d.firstIn).length,
      lateDays: days.filter((d) => d.isLate).length,
      absences: days.filter((d) => d.absent).length,
      scheduledDays: plans.filter((p) => p.kind === 'WORK').length,
      days,
    };
  }

  /** Horario propio (por defecto, la semana actual de lunes a domingo). */
  async mySchedule(employeeIdOrNull: string | null, fromKey?: string, toKey?: string) {
    const employeeId = requireEmployee(employeeIdOrNull);
    const today = this.clock.today();
    const week = weekOf(today);
    const from = fromKey ?? week.from;
    const to = toKey ?? (fromKey ? from : week.to);
    if (to < from) throw new ConflictError('La fecha final no puede ser anterior a la inicial.');
    const last = addDays(from, MAX_SCHEDULE_DAYS);
    const plans = await this.planner.rangeForEmployee(employeeId, from, to > last ? last : to);
    return { from, to, today, days: plans.map(toPlanView) };
  }

  // -------------------------------------------------------------------------

  private presence(records: Mark[], last: Mark | null, plan: Parameters<typeof presenceOf>[0]['plan'], now: Date): Presence {
    return presenceOf({ records, last, plan, now, zone: APP_TIMEZONE, maxSessionHours: MAX_SESSION_HOURS });
  }

  /**
   * Resumen por día en [from, to). Se amplía la lectura para capturar la salida
   * de jornadas que cruzan el límite del rango.
   */
  private async summarize(employeeId: string, from: Date, to: Date, now: Date): Promise<DaySummary[]> {
    const records = await this.marks.between(employeeId, from, new Date(to.getTime() + MAX_SESSION_HOURS * 3_600_000));
    const fromDay = DateTime.fromJSDate(from, { zone: APP_TIMEZONE }).toISODate()!;
    const toDay = DateTime.fromJSDate(to, { zone: APP_TIMEZONE }).toISODate()!;
    return summarizeByDay(records, APP_TIMEZONE, now, MAX_SESSION_HOURS)
      .filter((d) => d.date >= fromDay && d.date < toDay)
      .map((d) => ({ ...d, records: d.records.filter((r) => r.timestamp >= from && r.timestamp < to) }));
  }
}

function requireEmployee(employeeId: string | null): string {
  if (!employeeId) throw new ForbiddenError('Solo los empleados pueden registrar marcaciones.');
  return employeeId;
}

function emptyDay(date: string): DaySummary {
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
