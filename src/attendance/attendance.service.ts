import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Attendance, AttendanceType, Shift } from '@prisma/client';
import { DateTime } from 'luxon';
import { APP_TIMEZONE, MAX_SESSION_HOURS } from '../config/app.config';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  computeLateness,
  DaySummary,
  nextMarkType,
  parseHHmm,
  summarizeByDay,
  sumWorkedMinutes,
  validateRequestedType,
} from './attendance.domain';

export type PresenceStatus = 'INSIDE' | 'OUTSIDE' | 'NOT_MARKED';

export interface EmployeeDayStatus {
  status: PresenceStatus;
  nextType: AttendanceType;
  lastMark: { id: string; type: AttendanceType; timestamp: Date } | null;
  firstInToday: Date | null;
  workedMinutesToday: number;
  openSession: boolean;
  isLate: boolean;
  lateMinutes: number;
  /** No ha marcado ingreso y ya pasó la hora de entrada + tolerancia. */
  missingAfterStart: boolean;
}

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService, private realtime: RealtimeGateway) {}

  private requireEmployee(employeeId: string | null): string {
    if (!employeeId) throw new ForbiddenException('Solo los empleados pueden registrar marcaciones.');
    return employeeId;
  }

  /** Marca ingreso/salida. El tipo y la hora los decide el servidor. */
  async mark(employeeIdOrNull: string | null, expectedType?: AttendanceType) {
    const employeeId = this.requireEmployee(employeeIdOrNull);

    const created = await this.prisma.$transaction(async (tx) => {
      // Serializa las marcaciones del mismo empleado (evita carreras por doble toque).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${employeeId}))`;

      const employee = await tx.employee.findUniqueOrThrow({
        where: { id: employeeId },
        include: { shift: true },
      });
      if (!employee.active) throw new ForbiddenException('Tu ficha de empleado está inactiva.');

      const now = new Date();
      const last = await tx.attendance.findFirst({
        where: { employeeId },
        orderBy: { timestamp: 'desc' },
      });
      const type = nextMarkType(last, now, MAX_SESSION_HOURS) as AttendanceType;
      const error = validateRequestedType(type, expectedType);
      if (error) throw new ConflictException(error);

      let late = { isLate: false, lateMinutes: 0 };
      if (type === AttendanceType.IN) {
        // Solo el primer ingreso del día puede contar como atraso.
        const dayStart = DateTime.fromJSDate(now, { zone: APP_TIMEZONE }).startOf('day').toJSDate();
        const previousIn = await tx.attendance.count({
          where: { employeeId, type: AttendanceType.IN, timestamp: { gte: dayStart, lt: now } },
        });
        if (previousIn === 0) late = computeLateness(now, employee.shift, APP_TIMEZONE);
      }

      const attendance = await tx.attendance.create({
        data: { employeeId, type, timestamp: now, ...late },
      });
      return { attendance, employee };
    });

    const status = await this.employeeStatus(employeeId);
    const { attendance, employee } = created;

    // Notificación en vivo (después de confirmar la transacción).
    this.realtime.emitAttendanceMarked(employeeId, {
      attendanceId: attendance.id,
      employee: { id: employee.id, fullName: employee.fullName, position: employee.position },
      type: attendance.type,
      timestamp: attendance.timestamp,
      isLate: attendance.isLate,
      lateMinutes: attendance.lateMinutes,
      status,
    });

    return {
      attendance,
      employee: { id: employee.id, fullName: employee.fullName, position: employee.position },
      status,
    };
  }

  /** Estado actual del empleado (para la pantalla principal y el dashboard). */
  async employeeStatus(employeeId: string): Promise<EmployeeDayStatus> {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      include: { shift: true },
    });
    const now = new Date();
    const since = this.statusWindowStart(now);
    const records = await this.prisma.attendance.findMany({
      where: { employeeId, timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
    });
    const last = await this.prisma.attendance.findFirst({
      where: { employeeId },
      orderBy: { timestamp: 'desc' },
    });
    return this.buildStatus(records, last, employee.shift, now);
  }

  /** Estado de hoy de todos los empleados activos (dashboard de supervisión). */
  async today() {
    const now = new Date();
    const since = this.statusWindowStart(now);
    const employees = await this.prisma.employee.findMany({
      where: { active: true },
      include: {
        shift: true,
        attendances: { where: { timestamp: { gte: since } }, orderBy: { timestamp: 'asc' } },
      },
      orderBy: { fullName: 'asc' },
    });
    // Última marca de cada empleado (para quienes no tienen registros en la ventana).
    const lastMarks = await this.prisma.$queryRaw<Attendance[]>`
      SELECT DISTINCT ON ("employeeId") * FROM "Attendance"
      ORDER BY "employeeId", "timestamp" DESC`;
    const lastByEmployee = new Map(lastMarks.map((a) => [a.employeeId, a]));

    const items = employees.map((e) => ({
      employee: {
        id: e.id,
        fullName: e.fullName,
        position: e.position,
        documentId: e.documentId,
        shift: e.shift ? { id: e.shift.id, name: e.shift.name, startTime: e.shift.startTime, endTime: e.shift.endTime, toleranceMinutes: e.shift.toleranceMinutes } : null,
      },
      ...this.buildStatus(e.attendances, lastByEmployee.get(e.id) ?? null, e.shift, now),
    }));

    const count = (s: PresenceStatus) => items.filter((i) => i.status === s).length;
    return {
      date: DateTime.fromJSDate(now, { zone: APP_TIMEZONE }).toISODate(),
      generatedAt: now,
      totals: {
        employees: items.length,
        inside: count('INSIDE'),
        outside: count('OUTSIDE'),
        notMarked: count('NOT_MARKED'),
        late: items.filter((i) => i.isLate).length,
      },
      items,
    };
  }

  /** Historial del mes (hora local) con resumen por día. */
  async myMonth(employeeIdOrNull: string | null, month?: string) {
    const employeeId = this.requireEmployee(employeeIdOrNull);
    const now = new Date();
    const base = month
      ? DateTime.fromFormat(month, 'yyyy-MM', { zone: APP_TIMEZONE })
      : DateTime.fromJSDate(now, { zone: APP_TIMEZONE });
    const from = base.startOf('month');
    const to = from.plus({ months: 1 });

    const days = await this.summarize(employeeId, from.toJSDate(), to.toJSDate(), now);
    return {
      month: from.toFormat('yyyy-MM'),
      totalWorkedMinutes: days.reduce((a, d) => a + d.workedMinutes, 0),
      daysWorked: days.filter((d) => d.firstIn).length,
      lateDays: days.filter((d) => d.isLate).length,
      days,
    };
  }

  /**
   * Resumen por día en [from, to). Amplía la consulta para capturar la salida de
   * jornadas que cruzan el límite del rango.
   */
  async summarize(employeeId: string, from: Date, to: Date, now = new Date()): Promise<DaySummary[]> {
    const extendedTo = new Date(to.getTime() + MAX_SESSION_HOURS * 3_600_000);
    const records = await this.prisma.attendance.findMany({
      where: { employeeId, timestamp: { gte: from, lt: extendedTo } },
      orderBy: { timestamp: 'asc' },
      select: { id: true, type: true, timestamp: true, isLate: true, lateMinutes: true },
    });
    const fromDay = DateTime.fromJSDate(from, { zone: APP_TIMEZONE }).toISODate()!;
    const toDay = DateTime.fromJSDate(to, { zone: APP_TIMEZONE }).toISODate()!;
    return summarizeByDay(records, APP_TIMEZONE, now, MAX_SESSION_HOURS)
      .filter((d) => d.date >= fromDay && d.date < toDay)
      .map((d) => ({ ...d, records: d.records.filter((r) => r.timestamp >= from && r.timestamp < to) }));
  }

  // -------------------------------------------------------------------------

  /** Ventana para calcular el estado de hoy: desde el inicio del día menos la duración máxima de jornada. */
  private statusWindowStart(now: Date): Date {
    return DateTime.fromJSDate(now, { zone: APP_TIMEZONE })
      .startOf('day')
      .minus({ hours: MAX_SESSION_HOURS })
      .toJSDate();
  }

  private buildStatus(
    records: Pick<Attendance, 'id' | 'type' | 'timestamp' | 'isLate' | 'lateMinutes'>[],
    last: Pick<Attendance, 'id' | 'type' | 'timestamp'> | null,
    shift: Shift | null,
    now: Date,
  ): EmployeeDayStatus {
    const today = DateTime.fromJSDate(now, { zone: APP_TIMEZONE });
    const todayKey = today.toISODate()!;
    const days = summarizeByDay(records, APP_TIMEZONE, now, MAX_SESSION_HOURS);
    const todaySummary = days.find((d) => d.date === todayKey);

    const nextType = nextMarkType(last, now, MAX_SESSION_HOURS) as AttendanceType;
    // "Dentro" si la siguiente marca esperada es una salida (jornada vigente, aunque haya empezado ayer).
    const inside = nextType === AttendanceType.OUT;
    const hasToday = !!todaySummary && todaySummary.records.length > 0;
    const status: PresenceStatus = inside ? 'INSIDE' : hasToday ? 'OUTSIDE' : 'NOT_MARKED';

    // Horas de hoy: jornadas iniciadas hoy + la jornada vigente iniciada ayer (si existe).
    const currentOpen = inside
      ? days.flatMap((d) => d.sessions).find((s) => s.open && !s.stale && s.in < today.startOf('day').toJSDate())
      : undefined;
    const workedMinutesToday =
      (todaySummary?.workedMinutes ?? 0) + (currentOpen ? sumWorkedMinutes([currentOpen]) : 0);

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
      workedMinutesToday,
      openSession: inside || !!todaySummary?.openSession,
      isLate: todaySummary?.isLate ?? false,
      lateMinutes: todaySummary?.lateMinutes ?? 0,
      missingAfterStart,
    };
  }
}

export type MarkResult = Awaited<ReturnType<AttendanceService['mark']>>;
