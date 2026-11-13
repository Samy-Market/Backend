import { Injectable } from '@nestjs/common';
import { fromDbDate, toDbDate } from '../../../../shared/infrastructure/prisma/prisma-db';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { ReportSource } from '../../application/ports/report-source';
import { ReportEmployee, ReportMark } from '../../domain/attendance-report';

@Injectable()
export class PrismaReportSource extends ReportSource {
  constructor(private prisma: PrismaService) {
    super();
  }

  async employeeExists(id: string) {
    return (await this.prisma.employee.count({ where: { id } })) > 0;
  }

  employees(f: { employeeId?: string; from: Date; to: Date }): Promise<ReportEmployee[]> {
    return this.prisma.employee.findMany({
      where: f.employeeId
        ? { id: f.employeeId }
        : { OR: [{ active: true }, { attendances: { some: { timestamp: { gte: f.from, lt: f.to } } } }] },
      select: { id: true, fullName: true, documentId: true, position: true, active: true, siteId: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async justifiedAbsences(employeeIds: string[], fromKey: string, toKey: string) {
    const rows = await this.prisma.justification.findMany({
      where: { employeeId: { in: employeeIds }, status: 'APPROVED', date: { gte: toDbDate(fromKey), lte: toDbDate(toKey) } },
      select: { employeeId: true, date: true },
    });
    const map = new Map<string, Set<string>>();
    for (const r of rows) {
      const set = map.get(r.employeeId) ?? new Set<string>();
      set.add(fromDbDate(r.date)!);
      map.set(r.employeeId, set);
    }
    return map;
  }

  async marks(employeeIds: string[], from: Date, to: Date) {
    const rows = await this.prisma.attendance.findMany({
      where: { employeeId: { in: employeeIds }, timestamp: { gte: from, lt: to } },
      orderBy: { timestamp: 'asc' },
      select: {
        id: true,
        employeeId: true,
        type: true,
        timestamp: true,
        isLate: true,
        lateMinutes: true,
        preEntryMinutes: true,
        siteId: true,
        source: true,
        creditedFrom: true,
        justifications: { where: { status: 'APPROVED' }, select: { id: true }, take: 1 },
      },
    });
    const map = new Map<string, ReportMark[]>();
    for (const { employeeId, justifications, source, ...mark } of rows) {
      const list = map.get(employeeId) ?? [];
      list.push({ ...mark, justified: justifications.length > 0, manual: source === 'MANUAL' });
      map.set(employeeId, list);
    }
    return map;
  }
}
