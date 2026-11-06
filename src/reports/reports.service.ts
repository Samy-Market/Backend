import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { DaySummary, summarizeByDay } from '../attendance/attendance.domain';
import { APP_TIMEZONE, MAX_SESSION_HOURS } from '../config/app.config';
import { PrismaService } from '../prisma/prisma.service';
import { ReportQueryDto } from './dto';

export const MAX_REPORT_DAYS = 366;

export interface ReportDay {
  date: string;
  firstIn: Date | null;
  lastOut: Date | null;
  workedMinutes: number;
  isLate: boolean;
  lateMinutes: number;
  openSession: boolean;
  marks: { id: string; type: 'IN' | 'OUT'; timestamp: Date; isLate: boolean; lateMinutes: number }[];
}

export interface ReportTotals {
  workedMinutes: number;
  daysWorked: number;
  lateDays: number;
  lateMinutes: number;
  openSessions: number;
  marks: number;
}

export interface EmployeeReport {
  employee: { id: string; fullName: string; documentId: string; position: string; active: boolean; shift: string | null };
  totals: ReportTotals;
  days: ReportDay[];
}

export interface AttendanceReport {
  from: string;
  to: string;
  timezone: string;
  generatedAt: Date;
  totals: ReportTotals & { employees: number };
  employees: EmployeeReport[];
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async attendance(q: ReportQueryDto): Promise<AttendanceReport> {
    const from = DateTime.fromISO(q.from, { zone: APP_TIMEZONE }).startOf('day');
    const toDay = DateTime.fromISO(q.to, { zone: APP_TIMEZONE }).startOf('day');
    if (!from.isValid || !toDay.isValid) throw new BadRequestException('Rango de fechas inválido.');
    if (toDay < from) throw new BadRequestException('La fecha final no puede ser anterior a la inicial.');
    const days = toDay.diff(from, 'days').days + 1;
    if (days > MAX_REPORT_DAYS) throw new BadRequestException(`El rango no puede superar ${MAX_REPORT_DAYS} días.`);
    const toExclusive = toDay.plus({ days: 1 });

    if (q.employeeId) {
      const exists = await this.prisma.employee.count({ where: { id: q.employeeId } });
      if (!exists) throw new NotFoundException('Empleado no encontrado.');
    }

    // Empleados activos + inactivos que tengan marcaciones en el rango.
    const employees = await this.prisma.employee.findMany({
      where: q.employeeId
        ? { id: q.employeeId }
        : {
            OR: [
              { active: true },
              { attendances: { some: { timestamp: { gte: from.toJSDate(), lt: toExclusive.toJSDate() } } } },
            ],
          },
      include: { shift: true },
      orderBy: { fullName: 'asc' },
    });

    // Una sola consulta; se amplía el fin para cerrar jornadas que cruzan el límite.
    const records = await this.prisma.attendance.findMany({
      where: {
        employeeId: { in: employees.map((e) => e.id) },
        timestamp: { gte: from.toJSDate(), lt: toExclusive.plus({ hours: MAX_SESSION_HOURS }).toJSDate() },
      },
      orderBy: { timestamp: 'asc' },
      select: { id: true, employeeId: true, type: true, timestamp: true, isLate: true, lateMinutes: true },
    });
    const byEmployee = new Map<string, typeof records>();
    for (const r of records) {
      const list = byEmployee.get(r.employeeId) ?? [];
      list.push(r);
      byEmployee.set(r.employeeId, list);
    }

    const now = new Date();
    const fromKey = from.toISODate()!;
    const toKey = toDay.toISODate()!;
    const fromDate = from.toJSDate();
    const toDate = toExclusive.toJSDate();

    const reports: EmployeeReport[] = employees.map((e) => {
      const summaries = summarizeByDay(byEmployee.get(e.id) ?? [], APP_TIMEZONE, now, MAX_SESSION_HOURS).filter(
        (d) => d.date >= fromKey && d.date <= toKey,
      );
      const dayRows = summaries.map((d) => toReportDay(d, fromDate, toDate));
      return {
        employee: {
          id: e.id,
          fullName: e.fullName,
          documentId: e.documentId,
          position: e.position,
          active: e.active,
          shift: e.shift ? `${e.shift.name} (${e.shift.startTime}–${e.shift.endTime})` : null,
        },
        totals: totalsOf(dayRows),
        days: dayRows,
      };
    });

    const all = reports.map((r) => r.totals);
    return {
      from: fromKey,
      to: toKey,
      timezone: APP_TIMEZONE,
      generatedAt: now,
      totals: {
        employees: reports.length,
        workedMinutes: sum(all, 'workedMinutes'),
        daysWorked: sum(all, 'daysWorked'),
        lateDays: sum(all, 'lateDays'),
        lateMinutes: sum(all, 'lateMinutes'),
        openSessions: sum(all, 'openSessions'),
        marks: sum(all, 'marks'),
      },
      employees: reports,
    };
  }
}

function toReportDay(d: DaySummary, from: Date, to: Date): ReportDay {
  return {
    date: d.date,
    firstIn: d.firstIn,
    lastOut: d.lastOut,
    workedMinutes: d.workedMinutes,
    isLate: d.isLate,
    lateMinutes: d.lateMinutes,
    openSession: d.openSession,
    marks: d.records
      .filter((r) => r.timestamp >= from && r.timestamp < to)
      .map((r) => ({ id: r.id!, type: r.type, timestamp: r.timestamp, isLate: !!r.isLate, lateMinutes: r.lateMinutes ?? 0 })),
  };
}

function totalsOf(days: ReportDay[]): ReportTotals {
  return {
    workedMinutes: days.reduce((a, d) => a + d.workedMinutes, 0),
    daysWorked: days.filter((d) => d.firstIn).length,
    lateDays: days.filter((d) => d.isLate).length,
    lateMinutes: days.reduce((a, d) => a + (d.isLate ? d.lateMinutes : 0), 0),
    openSessions: days.filter((d) => d.openSession).length,
    marks: days.reduce((a, d) => a + d.marks.length, 0),
  };
}

const sum = <T>(rows: T[], k: keyof T) => rows.reduce((a, r) => a + Number(r[k]), 0);
