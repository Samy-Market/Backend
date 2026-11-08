import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { db } from '../../../../shared/infrastructure/prisma/prisma-db';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { JustificationDetail, JustificationRepository, Review } from '../../application/ports/justification.repository';
import { JustificationStatus } from '../../domain/justification';

const DETAIL_INCLUDE = {
  attendance: { select: { id: true, type: true, timestamp: true, isLate: true, lateMinutes: true } },
  employee: { select: { id: true, fullName: true, position: true } },
  reviewer: { select: { id: true, email: true } },
} satisfies Prisma.JustificationInclude;

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

  create(data: { attendanceId: string; employeeId: string; reason: string }): Promise<JustificationDetail> {
    return this.prisma.justification.create({ data, include: DETAIL_INCLUDE });
  }

  list(filter: { status?: JustificationStatus; employeeId?: string }): Promise<JustificationDetail[]> {
    return this.prisma.justification.findMany({
      where: { status: filter.status, employeeId: filter.employeeId },
      include: DETAIL_INCLUDE,
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
  }

  findById(id: string) {
    return this.prisma.justification.findUnique({ where: { id } });
  }

  async reviewIfPending(id: string, review: Review, tx: TransactionContext) {
    const res = await db(this.prisma, tx).justification.updateMany({ where: { id, status: 'PENDING' }, data: review });
    return res.count > 0;
  }

  detail(id: string, tx?: TransactionContext): Promise<JustificationDetail> {
    return db(this.prisma, tx).justification.findUniqueOrThrow({ where: { id }, include: DETAIL_INCLUDE });
  }
}
