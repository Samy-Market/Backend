import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { DayRange } from '../../../../shared/domain/calendar';
import { AssignmentRule } from '../../domain/schedule-plan';

export interface AssignmentRecord extends DayRange {
  id: string;
  employeeId: string;
  schedule: { id: string; name: string };
  trimmed: boolean;
  originalEndDate: string | null;
}

export interface EndingAssignment {
  id: string;
  employee: { id: string; fullName: string };
  schedule: { id: string; name: string };
  endDate: string;
}

export interface ScheduleMember extends DayRange {
  id: string;
  employee: { id: string; fullName: string; position: string; active: boolean };
}

export abstract class AssignmentRepository {
  abstract rulesFor(employeeIds: string[], fromKey: string, toKey: string): Promise<Map<string, AssignmentRule[]>>;
  abstract listByEmployee(employeeId: string): Promise<AssignmentRecord[]>;
  abstract listByEmployees(employeeIds: string[], tx?: TransactionContext): Promise<AssignmentRecord[]>;
  abstract findById(id: string): Promise<AssignmentRecord | null>;
  abstract findMany(ids: string[], tx?: TransactionContext): Promise<AssignmentRecord[]>;
  abstract listBySchedule(scheduleId: string, fromKey: string): Promise<ScheduleMember[]>;
  abstract create(employeeId: string, scheduleId: string, range: DayRange, tx?: TransactionContext): Promise<void>;
  abstract trim(a: AssignmentRecord, endDate: string, tx?: TransactionContext): Promise<void>;
  abstract restoreEnd(a: AssignmentRecord, endDate: string | null, tx?: TransactionContext): Promise<void>;
  abstract updateEnd(id: string, endDate: string | null, tx?: TransactionContext): Promise<AssignmentRecord>;
  abstract delete(id: string, tx?: TransactionContext): Promise<void>;
  abstract endingBetween(fromKey: string, toKey: string): Promise<EndingAssignment[]>;
  abstract hasCoverage(employeeId: string, dayKey: string): Promise<boolean>;
}
