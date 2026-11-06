import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../common/types';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto, MonthQueryDto } from './dto';

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
