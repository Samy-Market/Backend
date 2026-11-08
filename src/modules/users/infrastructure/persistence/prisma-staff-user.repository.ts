import { Injectable } from '@nestjs/common';
import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { db, mapPrismaErrors } from '../../../../shared/infrastructure/prisma/prisma-db';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { StaffUserRepository } from '../../application/ports/staff-user.repository';
import { STAFF_ROLES, StaffChanges, StaffRole, StaffUser } from '../../domain/staff-user';

const USER_SELECT = { id: true, email: true, role: true, active: true, createdAt: true, updatedAt: true } as const;

@Injectable()
export class PrismaStaffUserRepository extends StaffUserRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  list(): Promise<StaffUser[]> {
    return this.prisma.user.findMany({
      where: { role: { in: [...STAFF_ROLES] } },
      select: USER_SELECT,
      orderBy: [{ role: 'asc' }, { email: 'asc' }],
    });
  }

  async findStaff(id: string): Promise<StaffUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { ...USER_SELECT, employee: { select: { id: true } } } });
    if (!user || user.role === 'EMPLOYEE' || user.employee) return null;
    const { employee: _e, ...staff } = user;
    return staff;
  }

  create(data: { email: string; role: StaffRole; active: boolean; passwordHash: string }, tx: TransactionContext) {
    return mapPrismaErrors(db(this.prisma, tx).user.create({ data, select: USER_SELECT }));
  }

  update(id: string, c: StaffChanges & { passwordHash?: string }, tx: TransactionContext) {
    return mapPrismaErrors(
      db(this.prisma, tx).user.update({
        where: { id },
        data: { email: c.email, role: c.role, active: c.active, ...(c.passwordHash ? { passwordHash: c.passwordHash } : {}) },
        select: USER_SELECT,
      }),
    );
  }

  countOtherActiveAdmins(id: string, tx: TransactionContext) {
    return db(this.prisma, tx).user.count({ where: { role: 'ADMIN', active: true, id: { not: id } } });
  }
}
