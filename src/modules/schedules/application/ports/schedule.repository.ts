import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { Shift } from '../../../shifts/domain/shift';

export interface WeekDayInput {
  weekday: number;
  /** null = descanso */
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

/** Plantillas semanales. */
export abstract class ScheduleRepository {
  /** Todas, con cuántos empleados las usan en `today`. */
  abstract list(today: string): Promise<(ScheduleDetail & { currentEmployees: number })[]>;
  abstract findById(id: string): Promise<ScheduleDetail | null>;
  abstract create(data: ScheduleData, days: WeekDayInput[], tx?: TransactionContext): Promise<ScheduleDetail>;
  abstract update(
    id: string,
    data: Partial<ScheduleData>,
    days: WeekDayInput[] | undefined,
    tx?: TransactionContext,
  ): Promise<ScheduleDetail>;
}
