import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { MarkType } from '../../domain/attendance-rules';

export interface Mark {
  id: string;
  type: MarkType;
  timestamp: Date;
  isLate: boolean;
  lateMinutes: number;
  preEntryMinutes: number;
}

/** Marcación tal como queda guardada. */
export interface StoredMark extends Mark {
  employeeId: string;
  source: string;
  siteId: string | null;
  createdAt: Date;
}

export interface NewMark {
  employeeId: string;
  type: MarkType;
  timestamp: Date;
  isLate: boolean;
  lateMinutes: number;
  preEntryMinutes: number;
  siteId: string;
}

/** Las marcaciones de entrada y salida. */
export abstract class MarkRepository {
  abstract last(employeeId: string, tx?: TransactionContext): Promise<Mark | null>;
  /** Cuántos ingresos tiene en [from, to). */
  abstract countIns(employeeId: string, from: Date, to: Date, tx?: TransactionContext): Promise<number>;
  abstract create(mark: NewMark, tx?: TransactionContext): Promise<StoredMark>;
  /** Marcas en [from, to) en orden cronológico (sin `to`, hasta hoy). */
  abstract between(employeeId: string, from: Date, to?: Date): Promise<Mark[]>;
  /** Última marca de cada empleado. */
  abstract lastByEmployee(): Promise<Map<string, Mark>>;
}
