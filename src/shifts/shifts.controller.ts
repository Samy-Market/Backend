import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../common/types';
import { CreateShiftDto, UpdateShiftDto } from './dto';
import { ShiftsService } from './shifts.service';

@Controller('shifts')
export class ShiftsController {
  constructor(private shifts: ShiftsService) {}

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Get()
  findAll() {
    return this.shifts.findAll();
  }

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.shifts.findOne(id);
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
}
