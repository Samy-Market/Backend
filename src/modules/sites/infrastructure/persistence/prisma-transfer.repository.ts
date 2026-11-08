import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { db, fromDbDate, mapPrismaErrors, toDbDate } from '../../../../shared/infrastructure/prisma/prisma-db';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { TransferDetail, TransferDraft, TransferRepository } from '../../application/ports/transfer.repository';
import { TransferRule } from '../../domain/site-rules';

const toRule = (r: { id: string; siteId: string; startDate: Date; endDate: Date }): TransferRule => ({
  id: r.id,
  siteId: r.siteId,
  startDate: fromDbDate(r.startDate)!,
  endDate: fromDbDate(r.endDate)!,
});

@Injectable()
export class PrismaTransferRepository extends TransferRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async rulesFor(employeeIds: string[], fromKey: string, toKey: string): Promise<Map<string, TransferRule[]>> {
    const rows = await this.prisma.siteTransfer.findMany({
      where: { employeeId: { in: employeeIds }, startDate: { lte: toDbDate(toKey) }, endDate: { gte: toDbDate(fromKey) } },
    });
    const map = new Map<string, TransferRule[]>(employeeIds.map((id) => [id, []]));
    for (const r of rows) map.get(r.employeeId)!.push(toRule(r));
    return map;
  }

  async list(filter: { endingFrom?: string; siteId?: string }): Promise<TransferDetail[]> {
    const where: Prisma.SiteTransferWhereInput = {};
    if (filter.endingFrom) where.endDate = { gte: toDbDate(filter.endingFrom) };
    if (filter.siteId) where.OR = [{ siteId: filter.siteId }, { employee: { siteId: filter.siteId } }];
    const rows = await this.prisma.siteTransfer.findMany({
      where,
      include: {
        site: { select: { id: true, name: true } },
        employee: { select: { id: true, fullName: true, position: true, site: { select: { id: true, name: true } } } },
        author: { select: { email: true } },
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
      take: 300,
    });
    return rows.map((r) => ({
      ...toRule(r),
      employee: { id: r.employee.id, fullName: r.employee.fullName, position: r.employee.position },
      fromSite: r.employee.site,
      toSite: r.site,
      reason: r.reason,
      createdBy: r.author.email,
    }));
  }

  async findById(id: string) {
    const r = await this.prisma.siteTransfer.findUnique({ where: { id }, include: { site: { select: { name: true } } } });
    return r ? { ...toRule(r), employeeId: r.employeeId, siteName: r.site.name } : null;
  }

  async listByEmployees(employeeIds: string[], tx?: TransactionContext) {
    const rows = await db(this.prisma, tx).siteTransfer.findMany({
      where: { employeeId: { in: employeeIds } },
      include: { site: { select: { name: true } } },
    });
    return rows.map((r) => ({ ...toRule(r), employeeId: r.employeeId, siteName: r.site.name }));
  }

  async create(d: TransferDraft, tx?: TransactionContext): Promise<void> {
    await mapPrismaErrors(
      db(this.prisma, tx).siteTransfer.create({
        data: {
          employeeId: d.employeeId,
          siteId: d.siteId,
          startDate: toDbDate(d.startDate),
          endDate: toDbDate(d.endDate),
          reason: d.reason,
          createdBy: d.createdBy,
        },
      }),
    );
  }

  async updateEnd(id: string, endDate: string, tx?: TransactionContext): Promise<void> {
    await mapPrismaErrors(db(this.prisma, tx).siteTransfer.update({ where: { id }, data: { endDate: toDbDate(endDate) } }));
  }

  async delete(id: string, tx?: TransactionContext): Promise<void> {
    await mapPrismaErrors(db(this.prisma, tx).siteTransfer.delete({ where: { id } }));
  }

  async hasMarksDuring(transferId: string): Promise<boolean> {
    const t = await this.prisma.siteTransfer.findUniqueOrThrow({ where: { id: transferId } });
    // Se amplía el fin para cubrir el día completo en cualquier zona horaria.
    const count = await this.prisma.attendance.count({
      where: {
        employeeId: t.employeeId,
        siteId: t.siteId,
        timestamp: { gte: t.startDate, lt: new Date(t.endDate.getTime() + 2 * 86_400_000) },
      },
    });
    return count > 0;
  }
}
