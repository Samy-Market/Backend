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

export abstract class MarkRepository {
  abstract last(employeeId: string, tx?: TransactionContext): Promise<Mark | null>;
  abstract countIns(employeeId: string, from: Date, to: Date, tx?: TransactionContext): Promise<number>;
  abstract create(mark: NewMark, tx?: TransactionContext): Promise<StoredMark>;
  abstract between(employeeId: string, from: Date, to?: Date): Promise<Mark[]>;
  abstract lastByEmployee(): Promise<Map<string, Mark>>;
}
