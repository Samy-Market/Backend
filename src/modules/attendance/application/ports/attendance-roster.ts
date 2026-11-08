import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { Mark } from './mark.repository';

/** Lo que asistencia necesita saber de un empleado. */
export interface RosterEmployee {
  id: string;
  fullName: string;
  position: string;
  documentId: string;
  siteId: string;
  active: boolean;
}

export abstract class AttendanceRoster {
  abstract find(employeeId: string, tx?: TransactionContext): Promise<RosterEmployee | null>;
  /** Empleados activos (por nombre) con sus marcas desde `since`. */
  abstract activeWithMarksSince(since: Date): Promise<(RosterEmployee & { marks: Mark[] })[]>;
}
