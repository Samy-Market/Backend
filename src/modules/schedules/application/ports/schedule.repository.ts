import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { Shift } from '../../../shifts/domain/shift';
import { ScheduleUsage } from '../../domain/schedule-plan';

export interface WeekDayInput {
  weekday: number;
  shiftId: string | null;
}

export interface ScheduleDetail {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  days: { id: string; scheduleId: string; weekday: number; shiftId: string | null; shift: Shift | null }[];
}

export interface ScheduleData {
  name: string;
  description: string | null;
  active: boolean;
}

export abstract class ScheduleRepository {
  abstract list(today: string): Promise<(ScheduleDetail & { currentEmployees: number })[]>;
  abstract findById(id: string): Promise<ScheduleDetail | null>;
  abstract create(data: ScheduleData, days: WeekDayInput[], tx?: TransactionContext): Promise<ScheduleDetail>;
  abstract update(
    id: string,
    data: Partial<ScheduleData>,
    days: WeekDayInput[] | undefined,
    tx?: TransactionContext,
  ): Promise<ScheduleDetail>;
  abstract usage(id: string, today: string): Promise<ScheduleUsage>;
  abstract delete(id: string, tx?: TransactionContext): Promise<void>;
}
