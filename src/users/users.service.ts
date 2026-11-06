import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateUserDto, UpdateUserDto } from './dto';

const userSelect = {
  id: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/** Usuarios del personal (ADMIN y SUPERVISOR). Los empleados se gestionan en /employees. */
@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.SUPERVISOR] } },
      select: userSelect,
      orderBy: [{ role: 'asc' }, { email: 'asc' }],
    });
  }

  async create(dto: CreateUserDto, actorId: string) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: dto.email, passwordHash, role: dto.role as Role, active: dto.active ?? true },
        select: userSelect,
      });
      await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'User', entityId: user.id, after: user }, tx);
      return user;
    });
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const before = await this.prisma.user.findUnique({ where: { id }, select: { ...userSelect, employee: { select: { id: true } } } });
    if (!before || before.role === Role.EMPLOYEE || before.employee) {
      throw new NotFoundException('Usuario no encontrado. Los empleados se editan desde la sección Empleados.');
    }
    const isSelf = id === actorId;
    if (isSelf && dto.active === false) throw new BadRequestException('No puedes desactivar tu propio usuario.');
    if (isSelf && dto.role && dto.role !== before.role) throw new BadRequestException('No puedes cambiar tu propio rol.');

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('staff-users'))`;
      const losesAdmin =
        before.role === Role.ADMIN && before.active && (dto.active === false || (dto.role && dto.role !== Role.ADMIN));
      if (losesAdmin) {
        const others = await tx.user.count({ where: { role: Role.ADMIN, active: true, id: { not: id } } });
        if (others === 0) throw new BadRequestException('Debe quedar al menos un administrador activo.');
      }
      const user = await tx.user.update({
        where: { id },
        data: {
          email: dto.email,
          role: dto.role as Role | undefined,
          active: dto.active,
          ...(passwordHash ? { passwordHash } : {}),
        },
        select: userSelect,
      });
      const { employee: _e, ...beforeClean } = before;
      await this.audit.log(
        {
          userId: actorId,
          action: passwordHash ? 'UPDATE_WITH_PASSWORD_RESET' : 'UPDATE',
          entity: 'User',
          entityId: id,
          before: beforeClean,
          after: user,
        },
        tx,
      );
      return user;
    });

    // Un usuario desactivado o con rol cambiado debe reconectarse con sus nuevos permisos.
    if (dto.active === false || (dto.role && dto.role !== before.role)) this.realtime.disconnectUser(id);
    return updated;
  }
}
