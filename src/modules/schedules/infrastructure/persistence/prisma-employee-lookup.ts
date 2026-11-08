import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { EmployeeBasics, EmployeeLookup } from '../../application/ports/employee-lookup';

@Injectable()
export class PrismaEmployeeLookup extends EmployeeLookup {
  constructor(private prisma: PrismaService) {
    super();
  }

  findMany(ids: string[]): Promise<EmployeeBasics[]> {
    return this.prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, active: true } });
  }

  async exists(id: string): Promise<boolean> {
    return (await this.prisma.employee.count({ where: { id } })) > 0;
  }
}
