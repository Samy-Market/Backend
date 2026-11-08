import { Injectable } from '@nestjs/common';
import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { db, mapPrismaErrors } from '../../../../shared/infrastructure/prisma/prisma-db';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { Shift, ShiftData } from '../../domain/shift';
import { ShiftRepository, ShiftWithUsage } from '../../application/ports/shift.repository';

@Injectable()
export class PrismaShiftRepository extends ShiftRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async list(): Promise<ShiftWithUsage[]> {
    const rows = await this.prisma.shift.findMany({
      orderBy: { startTime: 'asc' },
      include: { scheduleDays: { select: { schedule: { select: { id: true, name: true } } } } },
    });
    return rows.map(({ scheduleDays, ...s }) => ({
      ...s,
      schedules: [...new Map(scheduleDays.map((d) => [d.schedule.id, d.schedule])).values()],
    }));
  }

  findById(id: string): Promise<Shift | null> {
    return this.prisma.shift.findUnique({ where: { id } });
  }

  countByIds(ids: string[]): Promise<number> {
    return this.prisma.shift.count({ where: { id: { in: ids } } });
  }

  async isUsedBySchedules(id: string): Promise<boolean> {
    return (await this.prisma.scheduleDay.count({ where: { shiftId: id } })) > 0;
  }

  create(data: ShiftData, tx?: TransactionContext): Promise<Shift> {
    return mapPrismaErrors(db(this.prisma, tx).shift.create({ data }));
  }

  update(id: string, data: Partial<ShiftData>, tx?: TransactionContext): Promise<Shift> {
    return mapPrismaErrors(db(this.prisma, tx).shift.update({ where: { id }, data }));
  }

  async delete(id: string, tx?: TransactionContext): Promise<void> {
    await mapPrismaErrors(db(this.prisma, tx).shift.delete({ where: { id } }));
  }
}
