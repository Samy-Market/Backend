import { Global, Logger, Module } from '@nestjs/common';
import { mailSettings } from '../../config/app.config';
import { AuditLog } from '../application/ports/audit-log';
import { Clock } from '../application/ports/clock';
import { Mailer } from '../application/ports/mailer';
import { PasswordHasher } from '../application/ports/password-hasher';
import { RealtimeNotifier } from '../application/ports/realtime-notifier';
import { UnitOfWork } from '../application/ports/unit-of-work';
import { PrismaAuditLog } from './audit/prisma-audit-log';
import { SystemClock } from './clock/system-clock';
import { BrevoMailer } from './mail/brevo-mailer';
import { LogMailer } from './mail/log-mailer';
import { PrismaUnitOfWork } from './prisma/prisma-unit-of-work';
import { PrismaService } from './prisma/prisma.service';
import { RealtimeGateway } from './realtime/realtime.gateway';
import { BcryptPasswordHasher } from './security/bcrypt-password-hasher';

@Global()
@Module({
  providers: [
    PrismaService,
    { provide: UnitOfWork, useClass: PrismaUnitOfWork },
    { provide: AuditLog, useClass: PrismaAuditLog },
    { provide: Clock, useClass: SystemClock },
    { provide: PasswordHasher, useClass: BcryptPasswordHasher },
    RealtimeGateway,
    {
      provide: Mailer,
      useFactory: () => {
        const m = mailSettings();
        if (m.brevoApiKey && m.fromEmail) return new BrevoMailer(m.brevoApiKey, { email: m.fromEmail, name: m.fromName });
        if (process.env.NODE_ENV === 'production')
          Logger.warn('Falta BREVO_API_KEY o MAIL_FROM_EMAIL: los correos no se enviarán.', 'Correo');
        return new LogMailer();
      },
    },
    { provide: RealtimeNotifier, useExisting: RealtimeGateway },
  ],
  exports: [PrismaService, UnitOfWork, AuditLog, Clock, PasswordHasher, RealtimeNotifier, Mailer],
})
export class InfrastructureModule {}
