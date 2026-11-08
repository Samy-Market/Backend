import { Module } from '@nestjs/common';
import { SitesModule } from '../sites/sites.module';
import { EmployeesService } from './application/employees.service';
import { EmployeeRepository } from './application/ports/employee.repository';
import { EmployeesController } from './infrastructure/http/employees.controller';
import { PrismaEmployeeRepository } from './infrastructure/persistence/prisma-employee.repository';

@Module({
  imports: [SitesModule],
  controllers: [EmployeesController],
  providers: [EmployeesService, { provide: EmployeeRepository, useClass: PrismaEmployeeRepository }],
})
export class EmployeesModule {}
