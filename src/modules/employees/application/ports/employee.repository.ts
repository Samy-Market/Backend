import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { AssignmentView, Employee } from '../../domain/employee';

export interface EmployeeFilter {
  q?: string;
  siteId?: string;
  /** undefined = todos */
  active?: boolean;
}

export interface NewEmployee {
  fullName: string;
  documentId: string;
  position: string;
  siteId: string;
  active: boolean;
  email: string;
  passwordHash: string;
}

export interface EmployeeChanges {
  fullName?: string;
  documentId?: string;
  position?: string;
  siteId?: string;
  active?: boolean;
  email?: string;
  passwordHash?: string;
}

export type EmployeeWithAssignments = Employee & { assignments: AssignmentView[] };

export abstract class EmployeeRepository {
  /** Empleados con sus asignaciones de horario que terminan en `today` o después. */
  abstract list(filter: EmployeeFilter, today: string): Promise<EmployeeWithAssignments[]>;
  abstract findById(id: string, today: string): Promise<EmployeeWithAssignments | null>;
  /** Crea la cuenta (rol EMPLOYEE) y la ficha del empleado. */
  abstract create(data: NewEmployee, tx: TransactionContext): Promise<Employee>;
  abstract update(id: string, userId: string, changes: EmployeeChanges, tx: TransactionContext): Promise<Employee>;
}
