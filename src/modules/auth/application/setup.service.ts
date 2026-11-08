import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { AuditLog } from '../../../shared/application/ports/audit-log';
import { PasswordHasher } from '../../../shared/application/ports/password-hasher';
import { UnitOfWork } from '../../../shared/application/ports/unit-of-work';
import { ForbiddenError } from '../../../shared/domain/errors';
import { AuthService } from './auth.service';
import { AccountRepository } from './ports/account.repository';

/**
 * Configuración inicial: crea el PRIMER administrador desde el frontend mientras
 * no exista ninguno. En cuanto hay un admin, queda cerrada.
 * Si se define SETUP_CODE, además exige ese código.
 */
@Injectable()
export class SetupService {
  constructor(
    private accounts: AccountRepository,
    private auth: AuthService,
    private hasher: PasswordHasher,
    private uow: UnitOfWork,
    private audit: AuditLog,
    private config: ConfigService,
  ) {}

  private get setupCode(): string | undefined {
    return this.config.get<string>('SETUP_CODE')?.trim() || undefined;
  }

  async status() {
    const admins = await this.accounts.countAdmins();
    return { needsSetup: admins === 0, requiresCode: admins === 0 && !!this.setupCode };
  }

  async setup(input: { email: string; password: string; siteName?: string; code?: string }) {
    const expected = this.setupCode;
    if (expected && !safeEqual(input.code ?? '', expected)) throw new ForbiddenError('El código de instalación no es correcto.');

    const passwordHash = await this.hasher.hash(input.password);
    // El bloqueo evita que dos personas creen el primer admin al mismo tiempo.
    const admin = await this.uow.run(
      async (tx) => {
        if ((await this.accounts.countAdmins(tx)) > 0) {
          throw new ForbiddenError('El sistema ya tiene un administrador. Inicia sesión normalmente.');
        }
        if (await this.accounts.emailExists(input.email, tx)) throw new ForbiddenError('Ese correo ya está registrado.');
        const created = await this.accounts.createAdmin(input.email, passwordHash, tx);
        const site = await this.accounts.ensureSite(input.siteName || 'Sede principal', tx);
        await this.audit.record(
          {
            userId: created.id,
            action: 'INITIAL_SETUP',
            entity: 'User',
            entityId: created.id,
            after: { email: created.email, role: created.role, site },
          },
          tx,
        );
        return created;
      },
      { lockKey: 'initial-setup' },
    );
    return this.auth.issueSession(admin.id);
  }
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
