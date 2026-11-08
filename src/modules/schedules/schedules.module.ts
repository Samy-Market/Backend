import { Module } from '@nestjs/common';
import { ShiftsModule } from '../shifts/shifts.module';
import { AssignmentsService } from './application/assignments.service';
import { AssignmentRepository } from './application/ports/assignment.repository';
import { EmployeeLookup } from './application/ports/employee-lookup';
import { ScheduleRepository } from './application/ports/schedule.repository';
import { SchedulePlanner } from './application/schedule-planner';
import { SchedulesService } from './application/schedules.service';
import { SchedulesController } from './infrastructure/http/schedules.controller';
import { PrismaAssignmentRepository } from './infrastructure/persistence/prisma-assignment.repository';
import { PrismaEmployeeLookup } from './infrastructure/persistence/prisma-employee-lookup';
import { PrismaScheduleRepository } from './infrastructure/persistence/prisma-schedule.repository';

@Module({
  imports: [ShiftsModule],
  controllers: [SchedulesController],
  providers: [
    SchedulesService,
    AssignmentsService,
    SchedulePlanner,
    { provide: ScheduleRepository, useClass: PrismaScheduleRepository },
    { provide: AssignmentRepository, useClass: PrismaAssignmentRepository },
    { provide: EmployeeLookup, useClass: PrismaEmployeeLookup },
  ],
  exports: [SchedulePlanner],
})
export class SchedulesModule {}
