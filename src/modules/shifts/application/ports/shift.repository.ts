import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { Shift, ShiftData } from '../../domain/shift';

export interface ShiftWithUsage extends Shift {
  /** Horarios (plantillas) que usan este turno. */
  schedules: { id: string; name: string }[];
}

export abstract class ShiftRepository {
  abstract list(): Promise<ShiftWithUsage[]>;
  abstract findById(id: string): Promise<Shift | null>;
  abstract countByIds(ids: string[]): Promise<number>;
  abstract isUsedBySchedules(id: string): Promise<boolean>;
  abstract create(data: ShiftData, tx?: TransactionContext): Promise<Shift>;
  abstract update(id: string, data: Partial<ShiftData>, tx?: TransactionContext): Promise<Shift>;
  abstract delete(id: string, tx?: TransactionContext): Promise<void>;
}
