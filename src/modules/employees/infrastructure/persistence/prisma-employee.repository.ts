import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { db, fromDbDate, mapPrismaErrors, toDbDate } from '../../../../shared/infrastructure/prisma/prisma-db';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import {
  EmployeeChanges,
  EmployeeFilter,
  EmployeeRepository,
  EmployeeWithAssignments,
  NewEmployee,
} from '../../application/ports/employee.repository';
import { Employee, EmployeeUsage } from '../../domain/employee';

const EMPLOYEE_SELECT = {
  id: true,
  fullName: true,
  documentId: true,
  position: true,
  active: true,
  siteId: true,
  site: { select: { id: true, name: true } },
  user: { select: { id: true, email: true, role: true, active: true } },
} satisfies Prisma.EmployeeSelect;

const withAssignments = (today: string) =>
  ({
    ...EMPLOYEE_SELECT,
    assignments: {
      where: { OR: [{ endDate: null }, { endDate: { gte: toDbDate(today) } }] },
      orderBy: { startDate: 'asc' },
      select: { id: true, startDate: true, endDate: true, schedule: { select: { id: true, name: true } } },
    },
  }) satisfies Prisma.EmployeeSelect;

type Row = Prisma.EmployeeGetPayload<{ select: ReturnType<typeof withAssignments> }>;

const toEmployee = ({ assignments, ...e }: Row): EmployeeWithAssignments => ({
  ...e,
  assignments: assignments.map((a) => ({
    id: a.id,
    scheduleId: a.schedule.id,
    scheduleName: a.schedule.name,
    startDate: fromDbDate(a.startDate)!,
    endDate: fromDbDate(a.endDate),
  })),
});

@Injectable()
export class PrismaEmployeeRepository extends EmployeeRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async list(filter: EmployeeFilter, today: string) {
    const where: Prisma.EmployeeWhereInput = {};
    if (filter.active !== undefined) where.active = filter.active;
    if (filter.siteId) where.siteId = filter.siteId;
    if (filter.q) {
      where.OR = [
        { fullName: { contains: filter.q, mode: 'insensitive' } },
        { documentId: { contains: filter.q } },
        { position: { contains: filter.q, mode: 'insensitive' } },
        { user: { email: { contains: filter.q, mode: 'insensitive' } } },
      ];
    }
    const rows = await this.prisma.employee.findMany({ where, select: withAssignments(today), orderBy: { fullName: 'asc' } });
    return rows.map(toEmployee);
  }

  async findById(id: string, today: string) {
    const row = await this.prisma.employee.findUnique({ where: { id }, select: withAssignments(today) });
    return row ? toEmployee(row) : null;
  }

  create(d: NewEmployee, tx: TransactionContext): Promise<Employee> {
    const client = db(this.prisma, tx);
    return mapPrismaErrors(
      (async () => {
        const user = await client.user.create({
          data: { email: d.email, passwordHash: d.passwordHash, role: Role.EMPLOYEE, active: d.active },
        });
        return client.employee.create({
          data: {
            userId: user.id,
            fullName: d.fullName,
            documentId: d.documentId,
            position: d.position,
            siteId: d.siteId,
            active: d.active,
          },
          select: EMPLOYEE_SELECT,
        });
      })(),
    );
  }

  update(id: string, userId: string, c: EmployeeChanges, tx: TransactionContext): Promise<Employee> {
    const client = db(this.prisma, tx);
    return mapPrismaErrors(
      (async () => {
        const user: Prisma.UserUpdateInput = {};
        if (c.email !== undefined) user.email = c.email;
        if (c.active !== undefined) user.active = c.active;
        if (c.passwordHash) user.passwordHash = c.passwordHash;
        if (Object.keys(user).length) await client.user.update({ where: { id: userId }, data: user });
        return client.employee.update({
          where: { id },
          data: { fullName: c.fullName, documentId: c.documentId, position: c.position, siteId: c.siteId, active: c.active },
          select: EMPLOYEE_SELECT,
        });
      })(),
    );
  }

  async usage(id: string, userId: string, today: string): Promise<EmployeeUsage> {
    const day = toDbDate(today);
    const [activeAssignments, pastAssignments, attendances, justifications, transfers, auditLogs] = await Promise.all([
      this.prisma.scheduleAssignment.count({ where: { employeeId: id, OR: [{ endDate: null }, { endDate: { gte: day } }] } }),
      this.prisma.scheduleAssignment.count({ where: { employeeId: id, endDate: { lt: day } } }),
      this.prisma.attendance.count({ where: { employeeId: id } }),
      this.prisma.justification.count({ where: { employeeId: id } }),
      this.prisma.siteTransfer.count({ where: { employeeId: id } }),
      this.prisma.auditLog.count({ where: { userId } }),
    ]);
    return { activeAssignments, pastAssignments, attendances, justifications, transfers, auditLogs };
  }

  async delete(id: string, userId: string, tx: TransactionContext): Promise<void> {
    const client = db(this.prisma, tx);
    await mapPrismaErrors(
      (async () => {
        await client.employee.delete({ where: { id } });
        await client.user.delete({ where: { id: userId } });
      })(),
    );
  }
}
