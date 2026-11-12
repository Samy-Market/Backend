import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { db, fromDbDate, mapPrismaErrors, toDbDate } from '../../../../shared/infrastructure/prisma/prisma-db';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { Holiday, LeaveRow, TimeOffRepository } from '../../application/ports/time-off.repository';
import { LeaveKind, LeaveRule } from '../../domain/time-off';

const LEAVE_INCLUDE = {
  employee: { select: { id: true, fullName: true, position: true } },
  author: { select: { email: true } },
} satisfies Prisma.LeaveInclude;

type LeaveDb = Prisma.LeaveGetPayload<{ include: typeof LEAVE_INCLUDE }>;

const toLeave = (l: LeaveDb): LeaveRow => ({
  id: l.id,
  employeeId: l.employeeId,
  employee: l.employee,
  kind: l.kind,
  startDate: fromDbDate(l.startDate)!,
  endDate: fromDbDate(l.endDate)!,
  note: l.note,
  createdBy: l.author.email,
});

const toHoliday = (h: { id: string; date: Date; name: string }): Holiday => ({ id: h.id, date: fromDbDate(h.date)!, name: h.name });

@Injectable()
export class PrismaTimeOffRepository extends TimeOffRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async holidays(fromKey: string, toKey: string) {
    const rows = await this.prisma.holiday.findMany({
      where: { date: { gte: toDbDate(fromKey), lte: toDbDate(toKey) } },
      orderBy: { date: 'asc' },
    });
    return rows.map(toHoliday);
  }

  async findHoliday(id: string) {
    const row = await this.prisma.holiday.findUnique({ where: { id } });
    return row ? toHoliday(row) : null;
  }

  async createHoliday(data: { date: string; name: string }) {
    return toHoliday(await mapPrismaErrors(this.prisma.holiday.create({ data: { date: toDbDate(data.date), name: data.name } })));
  }

  async deleteHoliday(id: string) {
    await this.prisma.holiday.delete({ where: { id } });
  }

  async leaves(filter: { endingFrom?: string; employeeId?: string }) {
    const rows = await this.prisma.leave.findMany({
      where: { employeeId: filter.employeeId, ...(filter.endingFrom && { endDate: { gte: toDbDate(filter.endingFrom) } }) },
      include: LEAVE_INCLUDE,
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    });
    return rows.map(toLeave);
  }

  async findLeave(id: string) {
    const row = await this.prisma.leave.findUnique({ where: { id }, include: LEAVE_INCLUDE });
    return row ? toLeave(row) : null;
  }

  async leavesByEmployees(employeeIds: string[], tx?: TransactionContext) {
    const rows = await db(this.prisma, tx).leave.findMany({ where: { employeeId: { in: employeeIds } }, include: LEAVE_INCLUDE });
    return rows.map(toLeave);
  }

  async leaveRules(employeeIds: string[], fromKey: string, toKey: string) {
    const rows = await this.prisma.leave.findMany({
      where: { employeeId: { in: employeeIds }, startDate: { lte: toDbDate(toKey) }, endDate: { gte: toDbDate(fromKey) } },
      select: { id: true, employeeId: true, kind: true, startDate: true, endDate: true },
    });
    const map = new Map<string, LeaveRule[]>();
    for (const r of rows) {
      const list = map.get(r.employeeId) ?? [];
      list.push({ id: r.id, kind: r.kind, startDate: fromDbDate(r.startDate)!, endDate: fromDbDate(r.endDate)! });
      map.set(r.employeeId, list);
    }
    return map;
  }

  async createLeave(
    data: { employeeId: string; kind: LeaveKind; startDate: string; endDate: string; note: string | null; createdBy: string },
    tx: TransactionContext,
  ) {
    await db(this.prisma, tx).leave.create({
      data: { ...data, startDate: toDbDate(data.startDate), endDate: toDbDate(data.endDate) },
    });
  }

  async endLeave(id: string, endDate: string) {
    await this.prisma.leave.update({ where: { id }, data: { endDate: toDbDate(endDate) } });
  }

  async deleteLeave(id: string) {
    await this.prisma.leave.delete({ where: { id } });
  }

  employees(ids: string[]) {
    return this.prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
  }
}
