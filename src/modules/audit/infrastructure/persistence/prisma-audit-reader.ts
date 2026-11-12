import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { AuditQuery, AuditReader, AuditRow } from '../../application/ports/audit-reader';

@Injectable()
export class PrismaAuditReader extends AuditReader {
  constructor(private prisma: PrismaService) {
    super();
  }

  list(q: AuditQuery): Promise<AuditRow[]> {
    return this.prisma.auditLog.findMany({
      where: {
        entity: q.entity,
        userId: q.userId,
        createdAt: { ...(q.from && { gte: q.from }), ...(q.to && { lt: q.to }) },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.take,
      ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
      select: {
        id: true,
        createdAt: true,
        action: true,
        entity: true,
        entityId: true,
        before: true,
        after: true,
        user: { select: { id: true, email: true } },
      },
    });
  }

  async entities() {
    const rows = await this.prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } });
    return rows.map((r) => r.entity);
  }

  authors() {
    return this.prisma.user.findMany({
      where: { auditLogs: { some: {} } },
      select: { id: true, email: true },
      orderBy: { email: 'asc' },
    });
  }
}
