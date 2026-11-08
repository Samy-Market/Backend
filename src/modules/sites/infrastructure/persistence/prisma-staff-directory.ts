import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { EmployeeSite, StaffDirectory } from '../../application/ports/staff-directory';

@Injectable()
export class PrismaStaffDirectory extends StaffDirectory {
  constructor(private prisma: PrismaService) {
    super();
  }

  findMany(ids: string[]): Promise<EmployeeSite[]> {
    return this.prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, siteId: true } });
  }
}
