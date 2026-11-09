import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { AssignmentView, Employee, EmployeeUsage } from '../../domain/employee';

export interface EmployeeFilter {
  q?: string;
  siteId?: string;
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
  abstract list(filter: EmployeeFilter, today: string): Promise<EmployeeWithAssignments[]>;
  abstract findById(id: string, today: string): Promise<EmployeeWithAssignments | null>;
  abstract create(data: NewEmployee, tx: TransactionContext): Promise<Employee>;
  abstract update(id: string, userId: string, changes: EmployeeChanges, tx: TransactionContext): Promise<Employee>;
  abstract usage(id: string, userId: string, today: string): Promise<EmployeeUsage>;
  abstract delete(id: string, userId: string, tx: TransactionContext): Promise<void>;
}
