import { Module } from '@nestjs/common';
import { TimeOffRepository } from './application/ports/time-off.repository';
import { TimeOffCalendar } from './application/time-off-calendar';
import { TimeOffService } from './application/time-off.service';
import { TimeOffController } from './infrastructure/http/time-off.controller';
import { PrismaTimeOffRepository } from './infrastructure/persistence/prisma-time-off.repository';

@Module({
  controllers: [TimeOffController],
  providers: [TimeOffService, TimeOffCalendar, { provide: TimeOffRepository, useClass: PrismaTimeOffRepository }],
  exports: [TimeOffCalendar],
})
export class TimeOffModule {}
