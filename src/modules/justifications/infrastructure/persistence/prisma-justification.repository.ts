import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { db, fromDbDate, toDbDate } from '../../../../shared/infrastructure/prisma/prisma-db';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import {
  JustificationDetail,
  JustificationRecord,
  JustificationRepository,
  Review,
} from '../../application/ports/justification.repository';
import { JustificationStatus } from '../../domain/justification';

const DETAIL_INCLUDE = {
  attendance: { select: { id: true, type: true, timestamp: true, isLate: true, lateMinutes: true } },
  employee: { select: { id: true, fullName: true, position: true } },
  reviewer: { select: { id: true, email: true } },
} satisfies Prisma.JustificationInclude;

type WithDate = { date: Date | null };
const withDayKey = <T extends WithDate>(row: T): Omit<T, 'date'> & { date: string | null } => ({ ...row, date: fromDbDate(row.date) });

@Injectable()
export class PrismaJustificationRepository extends JustificationRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async markOwner(attendanceId: string) {
    const mark = await this.prisma.attendance.findUnique({ where: { id: attendanceId }, select: { employeeId: true } });
    return mark?.employeeId ?? null;
  }

  async hasPending(attendanceId: string) {
    return (await this.prisma.justification.count({ where: { attendanceId, status: 'PENDING' } })) > 0;
  }

  async marksBetween(employeeId: string, from: Date, to: Date) {
    return this.prisma.attendance.count({ where: { employeeId, timestamp: { gte: from, lt: to } } });
  }

  async openForDay(employeeId: string, date: string) {
    const row = await this.prisma.justification.findFirst({
      where: { employeeId, date: toDbDate(date), status: { in: ['PENDING', 'APPROVED'] } },
      select: { status: true },
    });
    return row?.status ?? null;
  }

  async create(
    data: { attendanceId: string; employeeId: string; reason: string } | { date: string; employeeId: string; reason: string },
  ): Promise<JustificationDetail> {
    const row = await this.prisma.justification.create({
      data: 'date' in data ? { ...data, date: toDbDate(data.date) } : data,
      include: DETAIL_INCLUDE,
    });
    return withDayKey(row);
  }

  async list(filter: { status?: JustificationStatus; employeeId?: string }): Promise<JustificationDetail[]> {
    const rows = await this.prisma.justification.findMany({
      where: { status: filter.status, employeeId: filter.employeeId },
      include: DETAIL_INCLUDE,
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
    return rows.map(withDayKey);
  }

  async findById(id: string): Promise<JustificationRecord | null> {
    const row = await this.prisma.justification.findUnique({ where: { id } });
    return row ? withDayKey(row) : null;
  }

  async reviewIfPending(id: string, review: Review, tx: TransactionContext) {
    const res = await db(this.prisma, tx).justification.updateMany({ where: { id, status: 'PENDING' }, data: review });
    return res.count > 0;
  }

  async detail(id: string, tx?: TransactionContext): Promise<JustificationDetail> {
    return withDayKey(await db(this.prisma, tx).justification.findUniqueOrThrow({ where: { id }, include: DETAIL_INCLUDE }));
  }
}
