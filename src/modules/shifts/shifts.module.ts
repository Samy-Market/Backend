import { Module } from '@nestjs/common';
import { ShiftRepository } from './application/ports/shift.repository';
import { ShiftsService } from './application/shifts.service';
import { ShiftsController } from './infrastructure/http/shifts.controller';
import { PrismaShiftRepository } from './infrastructure/persistence/prisma-shift.repository';

@Module({
  controllers: [ShiftsController],
  providers: [ShiftsService, { provide: ShiftRepository, useClass: PrismaShiftRepository }],
  exports: [ShiftRepository],
})
export class ShiftsModule {}
