import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AuthUser } from '../../../../shared/domain/auth-user';
import { Role } from '../../../../shared/domain/roles';
import { CurrentUser, Roles } from '../../../../shared/http/decorators';
import { RangeQueryDto } from '../../../schedules/infrastructure/http/schedule.dto';
import { AttendanceService } from '../../application/attendance.service';
import { MarkAttendanceDto, MonthQueryDto } from './attendance.dto';

@Controller('attendance')
export class AttendanceController {
  constructor(private attendance: AttendanceService) {}

  @Roles(Role.EMPLOYEE)
  @Post('mark')
  mark(@CurrentUser() user: AuthUser, @Body() dto: MarkAttendanceDto) {
    return this.attendance.mark(user.employeeId, dto.expectedType);
  }

  @Roles(Role.EMPLOYEE)
  @Get('me/status')
  myStatus(@CurrentUser() user: AuthUser) {
    return this.attendance.employeeStatus(user.employeeId!);
  }

  @Roles(Role.EMPLOYEE)
  @Get('me/schedule')
  mySchedule(@CurrentUser() user: AuthUser, @Query() q: RangeQueryDto) {
    return this.attendance.mySchedule(user.employeeId, q.from, q.to);
  }

  @Roles(Role.EMPLOYEE)
  @Get('me')
  myMonth(@CurrentUser() user: AuthUser, @Query() q: MonthQueryDto) {
    return this.attendance.myMonth(user.employeeId, q.month);
  }

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Get('today')
  today() {
    return this.attendance.today();
  }
}
