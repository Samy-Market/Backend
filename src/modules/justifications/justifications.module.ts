import { Module } from '@nestjs/common';
import { SchedulesModule } from '../schedules/schedules.module';
import { JustificationsService } from './application/justifications.service';
import { JustificationRepository } from './application/ports/justification.repository';
import { JustificationsController } from './infrastructure/http/justifications.controller';
import { PrismaJustificationRepository } from './infrastructure/persistence/prisma-justification.repository';

@Module({
  imports: [SchedulesModule],
  controllers: [JustificationsController],
  providers: [JustificationsService, { provide: JustificationRepository, useClass: PrismaJustificationRepository }],
})
export class JustificationsModule {}
