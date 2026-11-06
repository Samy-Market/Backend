import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../common/types';
import { CreateJustificationDto, ListJustificationsQuery, ReviewJustificationDto } from './dto';
import { JustificationsService } from './justifications.service';

@Controller('justifications')
export class JustificationsController {
  constructor(private justifications: JustificationsService) {}

  @Roles(Role.EMPLOYEE)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateJustificationDto) {
    return this.justifications.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListJustificationsQuery) {
    return this.justifications.findAll(user, query);
  }

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Patch(':id')
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewJustificationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.justifications.review(id, dto, user);
  }
}
