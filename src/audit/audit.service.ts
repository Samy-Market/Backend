import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient | PrismaService;

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  /** Registra un cambio hecho por un usuario. Acepta un cliente de transacción opcional. */
  log(
    params: {
      userId: string;
      action: string;
      entity: string;
      entityId: string;
      before?: unknown;
      after?: unknown;
    },
    tx: Tx = this.prisma,
  ) {
    const toJson = (v: unknown) =>
      v === undefined || v === null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);
    return tx.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        before: toJson(params.before),
        after: toJson(params.after),
      },
    });
  }
}
