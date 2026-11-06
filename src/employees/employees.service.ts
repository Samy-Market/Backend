import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateEmployeeDto, ListEmployeesQuery, UpdateEmployeeDto } from './dto';

const employeeSelect = {
  id: true,
  fullName: true,
  documentId: true,
  position: true,
  active: true,
  shiftId: true,
  siteId: true,
  shift: { select: { id: true, name: true, startTime: true, endTime: true, toleranceMinutes: true } },
  site: { select: { id: true, name: true } },
  user: { select: { id: true, email: true, role: true, active: true } },
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class EmployeesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private realtime: RealtimeGateway,
  ) {}

  findAll(query: ListEmployeesQuery) {
    const where: Prisma.EmployeeWhereInput = {};
    if (query.active !== 'all') where.active = query.active !== 'false';
    if (query.q) {
      where.OR = [
        { fullName: { contains: query.q, mode: 'insensitive' } },
        { documentId: { contains: query.q } },
        { position: { contains: query.q, mode: 'insensitive' } },
        { user: { email: { contains: query.q, mode: 'insensitive' } } },
      ];
    }
    return this.prisma.employee.findMany({ where, select: employeeSelect, orderBy: { fullName: 'asc' } });
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id }, select: employeeSelect });
    if (!employee) throw new NotFoundException('Empleado no encontrado.');
    return employee;
  }

  /** Sede por defecto (MVP de una sola sede). */
  private async resolveSiteId(siteId?: string) {
    if (siteId) return siteId;
    const site = await this.prisma.site.findFirst({ orderBy: { name: 'asc' } });
    if (!site) throw new BadRequestException('No hay sedes configuradas.');
    return site.id;
  }

  async create(dto: CreateEmployeeDto, actorId: string) {
    const siteId = await this.resolveSiteId(dto.siteId);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const active = dto.active ?? true;
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: dto.email, passwordHash, role: Role.EMPLOYEE, active },
      });
      const employee = await tx.employee.create({
        data: {
          userId: user.id,
          fullName: dto.fullName,
          documentId: dto.documentId,
          position: dto.position,
          shiftId: dto.shiftId ?? null,
          siteId,
          active,
        },
        select: employeeSelect,
      });
      await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'Employee', entityId: employee.id, after: employee }, tx);
      return employee;
    });
  }

  async update(id: string, dto: UpdateEmployeeDto, actorId: string) {
    const before = await this.findOne(id);
    if (before.user.id === actorId && dto.active === false) {
      throw new BadRequestException('No puedes desactivar tu propio usuario.');
    }
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      const userData: Prisma.UserUpdateInput = {};
      if (dto.email !== undefined) userData.email = dto.email;
      if (dto.active !== undefined) userData.active = dto.active;
      if (passwordHash) userData.passwordHash = passwordHash;
      if (Object.keys(userData).length) await tx.user.update({ where: { id: before.user.id }, data: userData });

      const employee = await tx.employee.update({
        where: { id },
        data: {
          fullName: dto.fullName,
          documentId: dto.documentId,
          position: dto.position,
          shiftId: dto.shiftId,
          siteId: dto.siteId,
          active: dto.active,
        },
        select: employeeSelect,
      });
      await this.audit.log(
        {
          userId: actorId,
          action: passwordHash ? 'UPDATE_WITH_PASSWORD_RESET' : 'UPDATE',
          entity: 'Employee',
          entityId: id,
          before,
          after: employee,
        },
        tx,
      );
      return employee;
    });
    // Un usuario desactivado pierde también su conexión en vivo.
    if (dto.active === false) this.realtime.disconnectUser(before.user.id);
    return updated;
  }
}
