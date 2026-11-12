import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../../../../shared/domain/auth-user';
import { Role } from '../../../../shared/domain/roles';
import { CurrentUser, Roles } from '../../../../shared/http/decorators';
import { AssignmentsService } from '../../application/assignments.service';
import { SchedulesService } from '../../application/schedules.service';
import { AssignScheduleDto, CreateScheduleDto, UnassignDto, UpdateAssignmentDto, UpdateScheduleDto } from './schedule.dto';

@Controller()
export class SchedulesController {
  constructor(
    private schedules: SchedulesService,
    private assignments: AssignmentsService,
  ) {}

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Get('schedules')
  list() {
    return this.schedules.list();
  }

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Get('schedules/expiring')
  expiring(@Query('days') days?: string) {
    return this.assignments.expiring(Math.min(Math.max(Number(days) || 14, 1), 90));
  }

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Get('schedules/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.schedules.get(id);
  }

  @Roles(Role.ADMIN)
  @Post('schedules')
  create(@Body() dto: CreateScheduleDto, @CurrentUser() user: AuthUser) {
    return this.schedules.create(dto, user.sub);
  }

  @Roles(Role.ADMIN)
  @Patch('schedules/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateScheduleDto, @CurrentUser() user: AuthUser) {
    return this.schedules.update(id, dto, user.sub);
  }

  @Roles(Role.ADMIN)
  @Post('schedules/assign')
  assign(@Body() dto: AssignScheduleDto, @CurrentUser() user: AuthUser) {
    return this.assignments.assign(dto, user.sub);
  }

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Get('employees/:id/assignments')
  forEmployee(@Param('id', ParseUUIDPipe) id: string) {
    return this.assignments.listForEmployee(id);
  }

  @Roles(Role.ADMIN)
  @Patch('schedule-assignments/:id')
  updateAssignment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAssignmentDto, @CurrentUser() user: AuthUser) {
    return this.assignments.updateEnd(id, dto.endDate, user.sub);
  }

  @Roles(Role.ADMIN)
  @Delete('schedules/:id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.schedules.remove(id, user.sub);
  }

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Get('schedules/:id/assignments')
  members(@Param('id', ParseUUIDPipe) id: string) {
    return this.assignments.members(id);
  }

  @Roles(Role.ADMIN)
  @Post('schedule-assignments/unassign/preview')
  @HttpCode(200)
  previewUnassign(@Body() dto: UnassignDto) {
    return this.assignments.previewUnassign(dto.ids);
  }

  @Roles(Role.ADMIN)
  @Post('schedule-assignments/unassign')
  @HttpCode(200)
  unassign(@Body() dto: UnassignDto, @CurrentUser() user: AuthUser) {
    return this.assignments.unassign(dto.ids, user.sub, dto.restorePrevious);
  }

  @Roles(Role.ADMIN)
  @Delete('schedule-assignments/:id')
  removeAssignment(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.assignments.remove(id, user.sub);
  }
}
