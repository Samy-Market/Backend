import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../../../../shared/domain/auth-user';
import { Role } from '../../../../shared/domain/roles';
import { CurrentUser, Roles } from '../../../../shared/http/decorators';
import { EmployeesService } from '../../application/employees.service';
import { CreateEmployeeDto, ListEmployeesQuery, UpdateEmployeeDto } from './employee.dto';

@Controller('employees')
export class EmployeesController {
  constructor(private employees: EmployeesService) {}

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Get()
  list(@Query() q: ListEmployeesQuery) {
    const active = q.active === 'all' ? undefined : q.active !== 'false';
    return this.employees.list({ q: q.q, siteId: q.siteId, active });
  }

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.get(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: AuthUser) {
    return this.employees.create(dto, user.sub);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() user: AuthUser) {
    return this.employees.update(id, dto, user.sub);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.employees.remove(id, user.sub);
  }
}
