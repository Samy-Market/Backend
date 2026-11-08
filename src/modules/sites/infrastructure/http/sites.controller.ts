import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../../../../shared/domain/auth-user';
import { Role } from '../../../../shared/domain/roles';
import { CurrentUser, Roles } from '../../../../shared/http/decorators';
import { SitesService } from '../../application/sites.service';
import { TransfersService } from '../../application/transfers.service';
import { CreateSiteDto, CreateTransferDto, ListTransfersQuery, UpdateSiteDto, UpdateTransferDto } from './site.dto';

@Controller()
export class SitesController {
  constructor(
    private sites: SitesService,
    private transfers: TransfersService,
  ) {}

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Get('sites')
  list() {
    return this.sites.list();
  }

  @Roles(Role.ADMIN)
  @Post('sites')
  create(@Body() dto: CreateSiteDto, @CurrentUser() user: AuthUser) {
    return this.sites.create(dto, user.sub);
  }

  @Roles(Role.ADMIN)
  @Patch('sites/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSiteDto, @CurrentUser() user: AuthUser) {
    return this.sites.update(id, dto, user.sub);
  }

  @Roles(Role.ADMIN)
  @Delete('sites/:id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.sites.remove(id, user.sub);
  }

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Get('transfers')
  listTransfers(@Query() q: ListTransfersQuery) {
    return this.transfers.list(q.scope, q.siteId);
  }

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Post('transfers')
  createTransfer(@Body() dto: CreateTransferDto, @CurrentUser() user: AuthUser) {
    return this.transfers.create(dto, user.sub);
  }

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Patch('transfers/:id')
  updateTransfer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTransferDto, @CurrentUser() user: AuthUser) {
    return this.transfers.updateEnd(id, dto.endDate, user.sub);
  }

  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @Delete('transfers/:id')
  removeTransfer(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.transfers.remove(id, user.sub);
  }
}
