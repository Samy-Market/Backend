import { Injectable } from '@nestjs/common';
import { AuditEntry, AuditLog } from '../../application/ports/audit-log';
import { TransactionContext } from '../../application/ports/unit-of-work';
import { db, toJson } from '../prisma/prisma-db';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaAuditLog extends AuditLog {
  constructor(private prisma: PrismaService) {
    super();
  }

  async record(e: AuditEntry, tx?: TransactionContext): Promise<void> {
    await db(this.prisma, tx).auditLog.create({
      data: {
        userId: e.userId,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId,
        before: toJson(e.before),
        after: toJson(e.after),
      },
    });
  }
}
