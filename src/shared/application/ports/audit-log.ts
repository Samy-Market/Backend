import { TransactionContext } from './unit-of-work';

export interface AuditEntry {
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/** Registro de quién cambió qué (cambios hechos por administradores y supervisores). */
export abstract class AuditLog {
  abstract record(entry: AuditEntry, tx?: TransactionContext): Promise<void>;
}
