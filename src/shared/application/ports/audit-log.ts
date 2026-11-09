import { TransactionContext } from './unit-of-work';

export interface AuditEntry {
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

export abstract class AuditLog {
  abstract record(entry: AuditEntry, tx?: TransactionContext): Promise<void>;
}
