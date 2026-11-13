import { Injectable } from '@nestjs/common';
import { Attendance } from '@prisma/client';
import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { db, fromDbDate, toDbDate } from '../../../../shared/infrastructure/prisma/prisma-db';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { Mark, MarkRepository, NewMark, StoredMark } from '../../application/ports/mark.repository';

export const MARK_SELECT = {
  id: true,
  type: true,
  timestamp: true,
  isLate: true,
  lateMinutes: true,
  preEntryMinutes: true,
  source: true,
  creditedFrom: true,
} as const;

@Injectable()
export class PrismaMarkRepository extends MarkRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  last(employeeId: string, tx?: TransactionContext): Promise<Mark | null> {
    return db(this.prisma, tx).attendance.findFirst({ where: { employeeId }, orderBy: { timestamp: 'desc' }, select: MARK_SELECT });
  }

  countIns(employeeId: string, from: Date, to: Date, tx?: TransactionContext): Promise<number> {
    return db(this.prisma, tx).attendance.count({ where: { employeeId, type: 'IN', timestamp: { gte: from, lt: to } } });
  }

  create(mark: NewMark, tx?: TransactionContext): Promise<StoredMark> {
    return db(this.prisma, tx).attendance.create({ data: mark });
  }

  between(employeeId: string, from: Date, to?: Date): Promise<Mark[]> {
    return this.prisma.attendance.findMany({
      where: { employeeId, timestamp: { gte: from, ...(to && { lt: to }) } },
      orderBy: { timestamp: 'asc' },
      select: MARK_SELECT,
    });
  }

  async justifiedMarkIds(markIds: string[]): Promise<Set<string>> {
    if (!markIds.length) return new Set();
    const rows = await this.prisma.justification.findMany({
      where: { status: 'APPROVED', attendanceId: { in: markIds } },
      select: { attendanceId: true },
    });
    return new Set(rows.flatMap((r) => (r.attendanceId ? [r.attendanceId] : [])));
  }

  async approvedJustifications(employeeId: string, fromKey: string, toKey: string) {
    const from = toDbDate(fromKey);
    const to = new Date(toDbDate(toKey).getTime() + 2 * 86_400_000);
    const rows = await this.prisma.justification.findMany({
      where: {
        employeeId,
        status: 'APPROVED',
        OR: [{ date: { gte: from, lte: toDbDate(toKey) } }, { attendance: { timestamp: { gte: from, lt: to } } }],
      },
      select: { attendanceId: true, date: true },
    });
    return {
      markIds: new Set(rows.flatMap((r) => (r.attendanceId ? [r.attendanceId] : []))),
      absenceDates: new Set(rows.flatMap((r) => (r.date ? [fromDbDate(r.date)!] : []))),
    };
  }

  async lastByEmployee(): Promise<Map<string, Mark>> {
    const rows = await this.prisma.$queryRaw<Attendance[]>`
      SELECT DISTINCT ON ("employeeId") * FROM "Attendance"
      ORDER BY "employeeId", "timestamp" DESC`;
    return new Map(rows.map((a) => [a.employeeId, a]));
  }
}
