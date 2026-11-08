import { Injectable } from '@nestjs/common';
import { TransactionContext, UnitOfWork } from '../../application/ports/unit-of-work';
import { PrismaService } from './prisma.service';

/** Transacción de Prisma; con `lockKey` toma un bloqueo de PostgreSQL para serializar operaciones concurrentes. */
@Injectable()
export class PrismaUnitOfWork extends UnitOfWork {
  constructor(private prisma: PrismaService) {
    super();
  }

  run<T>(work: (tx: TransactionContext) => Promise<T>, options?: { lockKey?: string }): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      if (options?.lockKey) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${options.lockKey}))`;
      return work(tx as unknown as TransactionContext);
    });
  }
}
