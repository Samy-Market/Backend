import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { DayRange } from '../../../../shared/domain/calendar';
import { db, fromDbDate, mapPrismaErrors, toDbDate } from '../../../../shared/infrastructure/prisma/prisma-db';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { AssignmentRecord, AssignmentRepository, EndingAssignment } from '../../application/ports/assignment.repository';
import { AssignmentRule } from '../../domain/schedule-plan';
import { SCHEDULE_INCLUDE } from './prisma-schedule.repository';

const WITH_SCHEDULE_NAME = { schedule: { select: { id: true, name: true } } } satisfies Prisma.ScheduleAssignmentInclude;
type Row = Prisma.ScheduleAssignmentGetPayload<{ include: typeof WITH_SCHEDULE_NAME }>;

const toRecord = (r: Row): AssignmentRecord => ({
  id: r.id,
  employeeId: r.employeeId,
  startDate: fromDbDate(r.startDate)!,
  endDate: fromDbDate(r.endDate),
  schedule: { id: r.schedule.id, name: r.schedule.name },
});

/** Asignaciones vigentes en algún día del rango [from, to]. */
const overlapping = (fromKey: string, toKey: string): Prisma.ScheduleAssignmentWhereInput => ({
  startDate: { lte: toDbDate(toKey) },
  OR: [{ endDate: null }, { endDate: { gte: toDbDate(fromKey) } }],
});

@Injectable()
export class PrismaAssignmentRepository extends AssignmentRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async rulesFor(employeeIds: string[], fromKey: string, toKey: string): Promise<Map<string, AssignmentRule[]>> {
    const rows = await this.prisma.scheduleAssignment.findMany({
      where: { employeeId: { in: employeeIds }, ...overlapping(fromKey, toKey) },
      include: { schedule: { include: SCHEDULE_INCLUDE } },
    });
    const map = new Map<string, AssignmentRule[]>(employeeIds.map((id) => [id, []]));
    for (const r of rows) {
      map.get(r.employeeId)!.push({
        id: r.id,
        startDate: fromDbDate(r.startDate)!,
        endDate: fromDbDate(r.endDate),
        schedule: { id: r.schedule.id, name: r.schedule.name, days: r.schedule.days.map((d) => ({ weekday: d.weekday, shift: d.shift })) },
      });
    }
    return map;
  }

  async listByEmployee(employeeId: string): Promise<AssignmentRecord[]> {
    const rows = await this.prisma.scheduleAssignment.findMany({
      where: { employeeId },
      include: WITH_SCHEDULE_NAME,
      orderBy: { startDate: 'desc' },
    });
    return rows.map(toRecord);
  }

  async listByEmployees(employeeIds: string[], tx?: TransactionContext): Promise<AssignmentRecord[]> {
    const rows = await db(this.prisma, tx).scheduleAssignment.findMany({
      where: { employeeId: { in: employeeIds } },
      include: WITH_SCHEDULE_NAME,
    });
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<AssignmentRecord | null> {
    const r = await this.prisma.scheduleAssignment.findUnique({ where: { id }, include: WITH_SCHEDULE_NAME });
    return r ? toRecord(r) : null;
  }

  async create(employeeId: string, scheduleId: string, range: DayRange, tx?: TransactionContext): Promise<void> {
    await mapPrismaErrors(
      db(this.prisma, tx).scheduleAssignment.create({
        data: { employeeId, scheduleId, startDate: toDbDate(range.startDate), endDate: range.endDate ? toDbDate(range.endDate) : null },
      }),
    );
  }

  async updateEnd(id: string, endDate: string | null, tx?: TransactionContext): Promise<AssignmentRecord> {
    const r = await mapPrismaErrors(
      db(this.prisma, tx).scheduleAssignment.update({
        where: { id },
        data: { endDate: endDate ? toDbDate(endDate) : null },
        include: WITH_SCHEDULE_NAME,
      }),
    );
    return toRecord(r);
  }

  async delete(id: string, tx?: TransactionContext): Promise<void> {
    await mapPrismaErrors(db(this.prisma, tx).scheduleAssignment.delete({ where: { id } }));
  }

  async endingBetween(fromKey: string, toKey: string): Promise<EndingAssignment[]> {
    const rows = await this.prisma.scheduleAssignment.findMany({
      where: { endDate: { gte: toDbDate(fromKey), lte: toDbDate(toKey) }, employee: { active: true } },
      include: { employee: { select: { id: true, fullName: true } }, ...WITH_SCHEDULE_NAME },
      orderBy: { endDate: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, employee: r.employee, schedule: r.schedule, endDate: fromDbDate(r.endDate)! }));
  }

  async hasCoverage(employeeId: string, dayKey: string): Promise<boolean> {
    return (await this.prisma.scheduleAssignment.count({ where: { employeeId, ...overlapping(dayKey, dayKey) } })) > 0;
  }
}
