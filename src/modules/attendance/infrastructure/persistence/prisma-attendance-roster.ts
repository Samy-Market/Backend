import { Injectable } from '@nestjs/common';
import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { db } from '../../../../shared/infrastructure/prisma/prisma-db';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { AttendanceRoster, RosterEmployee } from '../../application/ports/attendance-roster';
import { MARK_SELECT } from './prisma-mark.repository';

const ROSTER_SELECT = { id: true, fullName: true, position: true, documentId: true, siteId: true, active: true } as const;

@Injectable()
export class PrismaAttendanceRoster extends AttendanceRoster {
  constructor(private prisma: PrismaService) {
    super();
  }

  find(employeeId: string, tx?: TransactionContext): Promise<RosterEmployee | null> {
    return db(this.prisma, tx).employee.findUnique({ where: { id: employeeId }, select: ROSTER_SELECT });
  }

  async activeWithMarksSince(since: Date) {
    const rows = await this.prisma.employee.findMany({
      where: { active: true },
      select: {
        ...ROSTER_SELECT,
        attendances: { where: { timestamp: { gte: since } }, orderBy: { timestamp: 'asc' }, select: MARK_SELECT },
      },
      orderBy: { fullName: 'asc' },
    });
    return rows.map(({ attendances, ...e }) => ({ ...e, marks: attendances }));
  }
}
