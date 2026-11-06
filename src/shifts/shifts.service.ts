import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShiftDto, UpdateShiftDto } from './dto';

@Injectable()
export class ShiftsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  findAll() {
    return this.prisma.shift.findMany({
      orderBy: { startTime: 'asc' },
      include: { _count: { select: { employees: { where: { active: true } } } } },
    });
  }

  async findOne(id: string) {
    const shift = await this.prisma.shift.findUnique({ where: { id } });
    if (!shift) throw new NotFoundException('Turno no encontrado.');
    return shift;
  }

  create(dto: CreateShiftDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.shift.create({ data: dto });
      await this.audit.log({ userId, action: 'CREATE', entity: 'Shift', entityId: shift.id, after: shift }, tx);
      return shift;
    });
  }

  async update(id: string, dto: UpdateShiftDto, userId: string) {
    const before = await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.shift.update({ where: { id }, data: dto });
      await this.audit.log({ userId, action: 'UPDATE', entity: 'Shift', entityId: id, before, after: shift }, tx);
      return shift;
    });
  }
}
