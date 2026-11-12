import { Module } from '@nestjs/common';
import { AuditService } from './application/audit.service';
import { AuditReader } from './application/ports/audit-reader';
import { AuditController } from './infrastructure/http/audit.controller';
import { PrismaAuditReader } from './infrastructure/persistence/prisma-audit-reader';

@Module({
  controllers: [AuditController],
  providers: [AuditService, { provide: AuditReader, useClass: PrismaAuditReader }],
})
export class AuditModule {}
