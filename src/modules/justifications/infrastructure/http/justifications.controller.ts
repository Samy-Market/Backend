import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../../../../shared/domain/auth-user';
import { Role } from '../../../../shared/domain/roles';
import { CurrentUser, Roles } from '../../../../shared/http/decorators';
import { JustificationsService } from '../../application/justifications.service';
import { CreateJustificationDto, ListJustificationsQuery, ReviewJustificationDto } from './justification.dto';

@Controller('justifications')
export class JustificationsController {
  constructor(private justifications: JustificationsService) {}

  @Roles(Role.EMPLOYEE)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateJustificationDto) {
    return this.justifications.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListJustificationsQuery) {
    return this.justifications.list(user, q.status);
  }

  @Roles(Role.ADMIN)
  @Post(':id/revert')
  @HttpCode(200)
  revert(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.justifications.revert(id, user);
  }

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Get(':id/correction')
  correction(@Param('id', ParseUUIDPipe) id: string) {
    return this.justifications.correction(id);
  }

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Patch(':id')
  review(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewJustificationDto, @CurrentUser() user: AuthUser) {
    return this.justifications.review(id, dto, user);
  }
}
