import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AuthUser } from '../../../../shared/domain/auth-user';
import { Role } from '../../../../shared/domain/roles';
import { CurrentUser, Roles } from '../../../../shared/http/decorators';
import { TimeOffService } from '../../application/time-off.service';
import { CreateHolidayDto, CreateLeaveDto, HolidaysQuery, LeavesQuery } from './time-off.dto';

@Roles(Role.ADMIN, Role.SUPERVISOR)
@Controller()
export class TimeOffController {
  constructor(private timeOff: TimeOffService) {}

  @Get('holidays')
  holidays(@Query() q: HolidaysQuery) {
    return this.timeOff.holidays(q.year);
  }

  @Roles(Role.ADMIN)
  @Post('holidays')
  createHoliday(@Body() dto: CreateHolidayDto, @CurrentUser() user: AuthUser) {
    return this.timeOff.createHoliday(dto, user.sub);
  }

  @Roles(Role.ADMIN)
  @Delete('holidays/:id')
  deleteHoliday(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.timeOff.deleteHoliday(id, user.sub);
  }

  @Get('leaves')
  leaves(@Query() q: LeavesQuery) {
    return this.timeOff.leaves(q.scope, q.employeeId);
  }

  @Post('leaves')
  createLeave(@Body() dto: CreateLeaveDto, @CurrentUser() user: AuthUser) {
    return this.timeOff.createLeave(dto, user.sub);
  }

  @Delete('leaves/:id')
  cancelLeave(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.timeOff.cancelLeave(id, user.sub);
  }
}
