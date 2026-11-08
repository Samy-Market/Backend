import { Global, Module } from '@nestjs/common';
import { AuditLog } from '../application/ports/audit-log';
import { Clock } from '../application/ports/clock';
import { PasswordHasher } from '../application/ports/password-hasher';
import { RealtimeNotifier } from '../application/ports/realtime-notifier';
import { UnitOfWork } from '../application/ports/unit-of-work';
import { PrismaAuditLog } from './audit/prisma-audit-log';
import { SystemClock } from './clock/system-clock';
import { PrismaUnitOfWork } from './prisma/prisma-unit-of-work';
import { PrismaService } from './prisma/prisma.service';
import { RealtimeGateway } from './realtime/realtime.gateway';
import { BcryptPasswordHasher } from './security/bcrypt-password-hasher';

/**
 * Composición de los adaptadores compartidos: cada puerto (clase abstracta)
 * se enlaza aquí con su implementación concreta.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    { provide: UnitOfWork, useClass: PrismaUnitOfWork },
    { provide: AuditLog, useClass: PrismaAuditLog },
    { provide: Clock, useClass: SystemClock },
    { provide: PasswordHasher, useClass: BcryptPasswordHasher },
    RealtimeGateway,
    { provide: RealtimeNotifier, useExisting: RealtimeGateway },
  ],
  exports: [PrismaService, UnitOfWork, AuditLog, Clock, PasswordHasher, RealtimeNotifier],
})
export class InfrastructureModule {}
