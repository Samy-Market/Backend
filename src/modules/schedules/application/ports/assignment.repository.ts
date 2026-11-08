import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { DayRange } from '../../../../shared/domain/calendar';
import { AssignmentRule } from '../../domain/schedule-plan';

export interface AssignmentRecord extends DayRange {
  id: string;
  employeeId: string;
  schedule: { id: string; name: string };
}

export interface EndingAssignment {
  id: string;
  employee: { id: string; fullName: string };
  schedule: { id: string; name: string };
  endDate: string;
}

/** Asignaciones de horarios a empleados. */
export abstract class AssignmentRepository {
  /** Asignaciones (con su plantilla completa) que tocan el rango, agrupadas por empleado. */
  abstract rulesFor(employeeIds: string[], fromKey: string, toKey: string): Promise<Map<string, AssignmentRule[]>>;
  abstract listByEmployee(employeeId: string): Promise<AssignmentRecord[]>;
  abstract listByEmployees(employeeIds: string[], tx?: TransactionContext): Promise<AssignmentRecord[]>;
  abstract findById(id: string): Promise<AssignmentRecord | null>;
  abstract create(employeeId: string, scheduleId: string, range: DayRange, tx?: TransactionContext): Promise<void>;
  abstract updateEnd(id: string, endDate: string | null, tx?: TransactionContext): Promise<AssignmentRecord>;
  abstract delete(id: string, tx?: TransactionContext): Promise<void>;
  /** Asignaciones de empleados activos que terminan entre dos fechas. */
  abstract endingBetween(fromKey: string, toKey: string): Promise<EndingAssignment[]>;
  /** ¿El empleado tiene algún horario que cubra ese día? */
  abstract hasCoverage(employeeId: string, dayKey: string): Promise<boolean>;
}
