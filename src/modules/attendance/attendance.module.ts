import { Module } from '@nestjs/common';
import { SchedulesModule } from '../schedules/schedules.module';
import { SitesModule } from '../sites/sites.module';
import { AttendanceService } from './application/attendance.service';
import { AttendanceRoster } from './application/ports/attendance-roster';
import { MarkRepository } from './application/ports/mark.repository';
import { AttendanceController } from './infrastructure/http/attendance.controller';
import { PrismaAttendanceRoster } from './infrastructure/persistence/prisma-attendance-roster';
import { PrismaMarkRepository } from './infrastructure/persistence/prisma-mark.repository';

@Module({
  imports: [SchedulesModule, SitesModule],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    { provide: MarkRepository, useClass: PrismaMarkRepository },
    { provide: AttendanceRoster, useClass: PrismaAttendanceRoster },
  ],
})
export class AttendanceModule {}
