import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { SetupDto } from './setup.dto';

/**
 * Configuración inicial: permite crear el PRIMER administrador desde el frontend
 * mientras no exista ninguno. En cuanto hay un admin, el endpoint queda cerrado.
 * Opcional: si se define SETUP_CODE, el formulario exige ese código.
 */
@Injectable()
export class SetupService {
  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
    private audit: AuditService,
    private config: ConfigService,
  ) {}

  private get setupCode(): string | undefined {
    return this.config.get<string>('SETUP_CODE')?.trim() || undefined;
  }

  async status() {
    const admins = await this.prisma.user.count({ where: { role: Role.ADMIN } });
    return { needsSetup: admins === 0, requiresCode: admins === 0 && !!this.setupCode };
  }

  async setup(dto: SetupDto) {
    const expected = this.setupCode;
    if (expected && !safeEqual(dto.code ?? '', expected)) {
      throw new ForbiddenException('El código de instalación no es correcto.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      // Evita que dos personas creen el primer admin al mismo tiempo.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('initial-setup'))`;
      const admins = await tx.user.count({ where: { role: Role.ADMIN } });
      if (admins > 0) {
        throw new ForbiddenException('El sistema ya tiene un administrador. Inicia sesión normalmente.');
      }
      const exists = await tx.user.findUnique({ where: { email: dto.email } });
      if (exists) throw new ForbiddenException('Ese correo ya está registrado.');

      const created = await tx.user.create({ data: { email: dto.email, passwordHash, role: Role.ADMIN } });
      // Sin una sede no se pueden registrar empleados desde el panel.
      let site = await tx.site.findFirst();
      if (!site) site = await tx.site.create({ data: { name: dto.siteName || 'Sede principal' } });

      await this.audit.log(
        {
          userId: created.id,
          action: 'INITIAL_SETUP',
          entity: 'User',
          entityId: created.id,
          after: { email: created.email, role: created.role, site: site.name },
        },
        tx,
      );
      return created;
    });

    return this.auth.issueSession(user.id);
  }
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
