import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { APP_TIMEZONE, MAX_SESSION_HOURS } from '../../../config/app.config';
import { Clock } from '../../../shared/application/ports/clock';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { SchedulePlanner } from '../../schedules/application/schedule-planner';
import { SiteLocator } from '../../sites/application/site-locator';
import { AttendanceReport, employeeReport, MAX_REPORT_DAYS, sumTotals } from '../domain/attendance-report';
import { ReportSource } from './ports/report-source';

export interface ReportQuery {
  from: string;
  to: string;
  employeeId?: string;
  siteId?: string;
}

/** Arma el reporte de asistencia de un rango de fechas. */
@Injectable()
export class ReportsService {
  constructor(
    private source: ReportSource,
    private planner: SchedulePlanner,
    private locator: SiteLocator,
    private clock: Clock,
  ) {}

  async attendance(q: ReportQuery): Promise<AttendanceReport> {
    const from = DateTime.fromISO(q.from, { zone: APP_TIMEZONE }).startOf('day');
    const toDay = DateTime.fromISO(q.to, { zone: APP_TIMEZONE }).startOf('day');
    if (!from.isValid || !toDay.isValid) throw new BusinessRuleError('Rango de fechas inválido.');
    if (toDay < from) throw new BusinessRuleError('La fecha final no puede ser anterior a la inicial.');
    if (toDay.diff(from, 'days').days + 1 > MAX_REPORT_DAYS)
      throw new BusinessRuleError(`El rango no puede superar ${MAX_REPORT_DAYS} días.`);
    if (q.employeeId && !(await this.source.employeeExists(q.employeeId))) throw new NotFoundError('Empleado no encontrado.');

    const toExclusive = toDay.plus({ days: 1 });
    const range = { from: from.toJSDate(), to: toExclusive.toJSDate() };
    const fromKey = from.toISODate();
    const toKey = toDay.toISODate();

    const employees = await this.source.employees({ employeeId: q.employeeId, ...range });
    const ids = employees.map((e) => e.id);
    // Se amplía el fin para cerrar jornadas que cruzan el límite.
    const [marks, assignments, transfers, siteNames] = await Promise.all([
      this.source.marks(ids, range.from, toExclusive.plus({ hours: MAX_SESSION_HOURS }).toJSDate()),
      this.planner.rulesFor(ids, fromKey, toKey),
      this.locator.transfersFor(ids, fromKey, toKey),
      this.locator.siteNames(),
    ]);

    const now = this.clock.now();
    const today = this.clock.today();
    const reports = employees.map((employee) =>
      employeeReport({
        employee,
        records: marks.get(employee.id) ?? [],
        assignments: assignments.get(employee.id) ?? [],
        transfers: transfers.get(employee.id) ?? [],
        siteNames,
        fromKey,
        toKey,
        ...range,
        today,
        now,
        siteId: q.siteId,
        zone: APP_TIMEZONE,
        maxSessionHours: MAX_SESSION_HOURS,
      }),
    );

    // Con filtro de sede: solo quienes trabajaron allí o tienen esa sede como base.
    const visible = q.siteId ? reports.filter((r) => r.days.length > 0 || r.employee.homeSite.id === q.siteId) : reports;
    return {
      from: fromKey,
      to: toKey,
      timezone: APP_TIMEZONE,
      generatedAt: now,
      totals: sumTotals(visible),
      site: q.siteId ? { id: q.siteId, name: siteNames.get(q.siteId) ?? '—' } : null,
      employees: visible,
    };
  }
}
