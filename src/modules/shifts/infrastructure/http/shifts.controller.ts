import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthUser } from '../../../../shared/domain/auth-user';
import { Role } from '../../../../shared/domain/roles';
import { CurrentUser, Roles } from '../../../../shared/http/decorators';
import { ShiftsService } from '../../application/shifts.service';
import { CreateShiftDto, UpdateShiftDto } from './shift.dto';

@Controller('shifts')
export class ShiftsController {
  constructor(private shifts: ShiftsService) {}

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Get()
  list() {
    return this.shifts.list();
  }

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.shifts.get(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateShiftDto, @CurrentUser() user: AuthUser) {
    return this.shifts.create(dto, user.sub);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShiftDto, @CurrentUser() user: AuthUser) {
    return this.shifts.update(id, dto, user.sub);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.shifts.remove(id, user.sub);
  }
}
