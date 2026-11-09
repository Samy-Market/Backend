import { Injectable } from '@nestjs/common';
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
      },
    });
    const map = new Map<string, ReportMark[]>();
    for (const { employeeId, ...mark } of rows) {
      const list = map.get(employeeId) ?? [];
      list.push(mark);
      map.set(employeeId, list);
    }
    return map;
  }
}
