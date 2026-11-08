import { Injectable } from '@nestjs/common';
import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { db, mapPrismaErrors, toDbDate } from '../../../../shared/infrastructure/prisma/prisma-db';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { SiteData, SiteRepository, SiteUsage } from '../../application/ports/site.repository';
import { Site } from '../../domain/site-rules';

@Injectable()
export class PrismaSiteRepository extends SiteRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async list(today: string) {
    const day = toDbDate(today);
    const rows = await this.prisma.site.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            employees: { where: { active: true } },
            transfers: { where: { startDate: { lte: day }, endDate: { gte: day } } },
          },
        },
      },
    });
    return rows.map(({ _count, ...s }) => ({ ...s, activeEmployees: _count.employees, incomingTransfersToday: _count.transfers }));
  }

  findById(id: string): Promise<Site | null> {
    return this.prisma.site.findUnique({ where: { id } });
  }

  async names(): Promise<Map<string, string>> {
    const rows = await this.prisma.site.findMany({ select: { id: true, name: true } });
    return new Map(rows.map((s) => [s.id, s.name]));
  }

  countActiveEmployees(siteId: string): Promise<number> {
    return this.prisma.employee.count({ where: { siteId, active: true } });
  }

  async usage(siteId: string): Promise<SiteUsage> {
    const [employees, attendances, transfers] = await Promise.all([
      this.prisma.employee.count({ where: { siteId } }),
      this.prisma.attendance.count({ where: { siteId } }),
      this.prisma.siteTransfer.count({ where: { siteId } }),
    ]);
    return { employees, attendances, transfers };
  }

  create(data: SiteData, tx?: TransactionContext): Promise<Site> {
    return mapPrismaErrors(db(this.prisma, tx).site.create({ data }));
  }

  update(id: string, data: Partial<SiteData>, tx?: TransactionContext): Promise<Site> {
    return mapPrismaErrors(db(this.prisma, tx).site.update({ where: { id }, data }));
  }

  async delete(id: string, tx?: TransactionContext): Promise<void> {
    await mapPrismaErrors(db(this.prisma, tx).site.delete({ where: { id } }));
  }
}
