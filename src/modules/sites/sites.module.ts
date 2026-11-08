import { Module } from '@nestjs/common';
import { SiteRepository } from './application/ports/site.repository';
import { StaffDirectory } from './application/ports/staff-directory';
import { TransferRepository } from './application/ports/transfer.repository';
import { SiteLocator } from './application/site-locator';
import { SitesService } from './application/sites.service';
import { TransfersService } from './application/transfers.service';
import { SitesController } from './infrastructure/http/sites.controller';
import { PrismaSiteRepository } from './infrastructure/persistence/prisma-site.repository';
import { PrismaStaffDirectory } from './infrastructure/persistence/prisma-staff-directory';
import { PrismaTransferRepository } from './infrastructure/persistence/prisma-transfer.repository';

@Module({
  controllers: [SitesController],
  providers: [
    SitesService,
    TransfersService,
    SiteLocator,
    { provide: SiteRepository, useClass: PrismaSiteRepository },
    { provide: TransferRepository, useClass: PrismaTransferRepository },
    { provide: StaffDirectory, useClass: PrismaStaffDirectory },
  ],
  exports: [SiteLocator, SiteRepository],
})
export class SitesModule {}
