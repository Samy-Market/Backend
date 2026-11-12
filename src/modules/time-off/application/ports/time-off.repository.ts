import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { LeaveKind, LeaveRule } from '../../domain/time-off';

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export interface LeaveRow extends LeaveRule {
  employeeId: string;
  employee: { id: string; fullName: string; position: string };
  note: string | null;
  createdBy: string;
}

export abstract class TimeOffRepository {
  abstract holidays(fromKey: string, toKey: string): Promise<Holiday[]>;
  abstract findHoliday(id: string): Promise<Holiday | null>;
  abstract createHoliday(data: { date: string; name: string }): Promise<Holiday>;
  abstract deleteHoliday(id: string): Promise<void>;

  abstract leaves(filter: { endingFrom?: string; employeeId?: string }): Promise<LeaveRow[]>;
  abstract findLeave(id: string): Promise<LeaveRow | null>;
  abstract leavesByEmployees(employeeIds: string[], tx?: TransactionContext): Promise<LeaveRow[]>;
  abstract leaveRules(employeeIds: string[], fromKey: string, toKey: string): Promise<Map<string, LeaveRule[]>>;
  abstract createLeave(
    data: { employeeId: string; kind: LeaveKind; startDate: string; endDate: string; note: string | null; createdBy: string },
    tx: TransactionContext,
  ): Promise<void>;
  abstract endLeave(id: string, endDate: string): Promise<void>;
  abstract deleteLeave(id: string): Promise<void>;
  abstract employees(ids: string[]): Promise<{ id: string; fullName: string }[]>;
}
