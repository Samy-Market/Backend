import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { db, mapPrismaErrors, toDbDate } from '../../../../shared/infrastructure/prisma/prisma-db';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { ScheduleData, ScheduleDetail, ScheduleRepository, WeekDayInput } from '../../application/ports/schedule.repository';
import { ScheduleUsage } from '../../domain/schedule-plan';

export const SHIFT_SELECT = { id: true, name: true, startTime: true, endTime: true, toleranceMinutes: true } satisfies Prisma.ShiftSelect;
export const SCHEDULE_INCLUDE = {
  days: { orderBy: { weekday: 'asc' }, include: { shift: { select: SHIFT_SELECT } } },
} satisfies Prisma.ScheduleInclude;

@Injectable()
export class PrismaScheduleRepository extends ScheduleRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async list(today: string) {
    const day = toDbDate(today);
    const rows = await this.prisma.schedule.findMany({
      include: {
        ...SCHEDULE_INCLUDE,
        _count: { select: { assignments: { where: { startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] } } } },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    return rows.map(({ _count, ...s }) => ({ ...s, currentEmployees: _count.assignments }));
  }

  findById(id: string): Promise<ScheduleDetail | null> {
    return this.prisma.schedule.findUnique({ where: { id }, include: SCHEDULE_INCLUDE });
  }

  create(data: ScheduleData, days: WeekDayInput[], tx?: TransactionContext): Promise<ScheduleDetail> {
    return mapPrismaErrors(
      db(this.prisma, tx).schedule.create({
        data: { ...data, days: { create: days.map((d) => ({ weekday: d.weekday, shiftId: d.shiftId })) } },
        include: SCHEDULE_INCLUDE,
      }),
    );
  }

  async update(
    id: string,
    data: Partial<ScheduleData>,
    days: WeekDayInput[] | undefined,
    tx?: TransactionContext,
  ): Promise<ScheduleDetail> {
    const client = db(this.prisma, tx);
    if (days) {
      await client.scheduleDay.deleteMany({ where: { scheduleId: id } });
      await client.scheduleDay.createMany({ data: days.map((d) => ({ scheduleId: id, weekday: d.weekday, shiftId: d.shiftId })) });
    }
    return mapPrismaErrors(client.schedule.update({ where: { id }, data, include: SCHEDULE_INCLUDE }));
  }

  async usage(id: string, today: string): Promise<ScheduleUsage> {
    const day = toDbDate(today);
    const [current, upcoming, past] = await Promise.all([
      this.prisma.scheduleAssignment.count({
        where: { scheduleId: id, startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] },
      }),
      this.prisma.scheduleAssignment.count({ where: { scheduleId: id, startDate: { gt: day } } }),
      this.prisma.scheduleAssignment.count({ where: { scheduleId: id, endDate: { lt: day } } }),
    ]);
    return { current, upcoming, past };
  }

  async delete(id: string, tx?: TransactionContext): Promise<void> {
    await mapPrismaErrors(db(this.prisma, tx).schedule.delete({ where: { id } }));
  }
}
